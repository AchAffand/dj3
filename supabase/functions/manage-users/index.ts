// Edge Function: kelola user (daftar, tambah, hapus) untuk admin katalog.
// Berjalan di server Supabase, jadi boleh memakai service_role. Kunci itu tidak pernah
// dikirim ke browser. JWT pemanggil diperiksa di sini (verify_jwt = false di config.toml).
import { createClient } from "npm:@supabase/supabase-js@2";

const EMAIL_DOMAIN = "dj3.local";
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toUsername(email: string | undefined | null): string {
  const value = email ?? "";
  const suffix = `@${EMAIL_DOMAIN}`;
  return value.toLowerCase().endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Metode tidak didukung." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Konfigurasi server belum lengkap." }, 500);

  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Perlu masuk terlebih dahulu." }, 401);

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller.user) return json({ error: "Sesi tidak valid. Masuk ulang." }, 401);

  const { data: adminRow, error: adminError } = await admin
    .from("catalog_admins")
    .select("user_id")
    .eq("user_id", caller.user.id)
    .maybeSingle();
  if (adminError) return json({ error: "Hak akses tidak dapat diperiksa." }, 500);
  if (!adminRow) return json({ error: "Hanya admin yang boleh mengelola user." }, 403);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Permintaan tidak valid." }, 400);
  }

  const action = payload.action;

  if (action === "list") {
    const [{ data: usersData, error: usersError }, { data: admins, error: adminsError }] = await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
      admin.from("catalog_admins").select("user_id"),
    ]);
    if (usersError || adminsError) return json({ error: "Daftar user tidak dapat dimuat." }, 500);
    const adminIds = new Set((admins ?? []).map((row: { user_id: string }) => row.user_id));
    const users = usersData.users
      .map((user) => ({
        id: user.id,
        username: toUsername(user.email),
        displayName: (user.user_metadata?.full_name as string | undefined) ?? "",
        isAdmin: adminIds.has(user.id),
        isSelf: user.id === caller.user.id,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
    return json({ users });
  }

  if (action === "create") {
    const username = String(payload.username ?? "").trim().toLowerCase();
    const password = String(payload.password ?? "");
    const displayName = String(payload.displayName ?? "").trim().slice(0, 60);
    if (!USERNAME_PATTERN.test(username)) {
      return json({ error: "Nama pengguna harus 3-32 karakter: huruf kecil, angka, titik, strip, atau garis bawah." }, 400);
    }
    if (password.length < 8 || password.length > 72) {
      return json({ error: "Kata sandi harus 8-72 karakter." }, 400);
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: `${username}@${EMAIL_DOMAIN}`,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName || username },
    });
    if (error || !data.user) {
      const exists = /already|registered|exists/i.test(error?.message ?? "");
      return json({ error: exists ? "Nama pengguna sudah dipakai." : "User tidak dapat dibuat." }, exists ? 409 : 500);
    }
    return json({ user: { id: data.user.id, username } }, 201);
  }

  if (action === "delete") {
    const userId = String(payload.userId ?? "");
    if (!UUID_PATTERN.test(userId)) return json({ error: "User tidak valid." }, 400);
    if (userId === caller.user.id) return json({ error: "Akun sendiri tidak dapat dihapus." }, 400);
    const { data: targetAdmin, error: targetError } = await admin
      .from("catalog_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (targetError) return json({ error: "User tidak dapat diperiksa." }, 500);
    if (targetAdmin) return json({ error: "Akun admin tidak dapat dihapus dari menu ini." }, 400);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return json({ error: "User tidak dapat dihapus." }, 500);
    return json({ ok: true });
  }

  return json({ error: "Aksi tidak dikenal." }, 400);
});
