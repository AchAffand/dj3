// Supabase Auth mewajibkan email. Aplikasi memakai nama pengguna, jadi nama pengguna
// dipetakan ke email internal yang tidak pernah dikirimi surat dan tidak ditampilkan.
export const USERNAME_EMAIL_DOMAIN = "dj3.local";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidUsername(input: string): boolean {
  return USERNAME_PATTERN.test(normalizeUsername(input));
}

// Input tanpa "@" dianggap nama pengguna. Input berisi "@" tetap dipakai apa adanya
// supaya akun lama yang masuk dengan email asli tidak terkunci.
export function loginIdentifierToEmail(input: string): string {
  const value = input.trim();
  if (value.includes("@")) return value;
  return `${normalizeUsername(value)}@${USERNAME_EMAIL_DOMAIN}`;
}

export function emailToUsername(email: string | null | undefined): string {
  if (!email) return "";
  const suffix = `@${USERNAME_EMAIL_DOMAIN}`;
  return email.toLowerCase().endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}
