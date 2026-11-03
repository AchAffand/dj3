import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AppPageState } from "../../app/AppPageState";
import { useAppServices } from "../../app/AppServices";
import { formatDate } from "../../app/format";
import { isValidUsername, normalizeUsername } from "../../auth/username";
import type { ManagedUser, UserRole } from "../../integrations/supabase/userAdmin";

const emptyForm: { username: string; displayName: string; password: string; role: UserRole } = {
  username: "",
  displayName: "",
  password: "",
  role: "user",
};

export function SettingsPage() {
  const { userAdmin, isCatalogAdmin, loadingCatalog } = useAppServices();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!userAdmin) return;
    setLoading(true);
    setLoadError(null);
    try {
      setUsers(await userAdmin.listUsers());
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Daftar user tidak dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [userAdmin]);

  useEffect(() => {
    if (isCatalogAdmin) void loadUsers();
  }, [isCatalogAdmin, loadUsers]);

  if (loadingCatalog) return <AppPageState title="Memuat pengaturan" detail="Hak akses sedang diperiksa." />;
  if (!isCatalogAdmin) {
    return <AppPageState title="Khusus admin" detail="Menu pengaturan hanya bisa dibuka oleh admin workshop." tone="error" />;
  }
  if (loading) return <AppPageState title="Memuat user" detail="Daftar user sedang disiapkan." />;
  if (loadError) return <AppPageState title="User belum dapat dimuat" detail={loadError} tone="error" actionLabel="Coba lagi" onAction={() => void loadUsers()} />;

  const usernameOk = isValidUsername(form.username);
  const passwordOk = form.password.length >= 8 && form.password.length <= 72;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userAdmin || !usernameOk || !passwordOk) return;
    setSaving(true);
    setMessage(null);
    try {
      const username = normalizeUsername(form.username);
      await userAdmin.createUser({ username, password: form.password, displayName: form.displayName.trim(), role: form.role });
      setForm(emptyForm);
      setMessage({ tone: "ok", text: `${form.role === "admin" ? "Admin" : "User"} ${username} berhasil ditambahkan.` });
      setUsers(await userAdmin.listUsers());
    } catch (cause) {
      setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "User tidak dapat ditambahkan." });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!userAdmin || !pendingDelete) return;
    setDeleting(true);
    setMessage(null);
    try {
      await userAdmin.deleteUser(pendingDelete.id);
      setMessage({ tone: "ok", text: `User ${pendingDelete.username} dihapus.` });
      setPendingDelete(null);
      setUsers(await userAdmin.listUsers());
    } catch (cause) {
      setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "User tidak dapat dihapus." });
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="page-content">
      <div className="page-heading-row">
        <div className="page-intro">
          <p className="eyebrow">PENGATURAN</p>
          <h1>User</h1>
          <p className="page-description">Tambah atau hapus akun yang bisa masuk ke ruang kerja. Login memakai nama pengguna dan kata sandi.</p>
        </div>
      </div>

      {message && <div className={`notice-banner${message.tone === "error" ? " error" : ""}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</div>}

      <form className="settings-card settings-form" onSubmit={(event) => void handleCreate(event)}>
        <div className="section-title-row"><div><p className="eyebrow">TAMBAH USER</p><h2>User baru</h2></div></div>
        <div className="settings-form-grid">
          <label className="settings-field">
            <span>NAMA PENGGUNA</span>
            <input aria-label="Nama pengguna" autoCapitalize="none" autoComplete="off" spellCheck={false} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="mis. budi" />
            <small>3-32 karakter: huruf kecil, angka, titik, strip, garis bawah.</small>
          </label>
          <label className="settings-field">
            <span>NAMA TAMPILAN (OPSIONAL)</span>
            <input aria-label="Nama tampilan" autoComplete="off" maxLength={60} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="mis. Budi Tukang" />
          </label>
          <label className="settings-field">
            <span>KATA SANDI</span>
            <input aria-label="Kata sandi" type="password" autoComplete="new-password" maxLength={72} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            <small>Minimal 8 karakter.</small>
          </label>
          <label className="settings-field">
            <span>PERAN</span>
            <select aria-label="Peran" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}>
              <option value="user">User · hitung dan kelola proyeknya sendiri</option>
              <option value="admin">Admin · bisa ubah rumus, harga, dan kelola user</option>
            </select>
            {form.role === "admin" && <small>Admin punya akses penuh, termasuk menambah admin lain. Akun admin tidak bisa dihapus dari menu ini.</small>}
          </label>
        </div>
        <div className="settings-form-actions">
          <button className="primary-button" type="submit" disabled={saving || !usernameOk || !passwordOk}>{saving ? "Menyimpan…" : "Tambah user"}</button>
        </div>
      </form>

      <div className="section-title-row settings-list-title"><div><p className="eyebrow">DAFTAR USER</p><h2>{users.length} akun</h2></div></div>
      <div className="project-list">
        {users.map((user) => (
          <article className="project-list-row" key={user.id}>
            <span className="project-list-icon" aria-hidden="true">●</span>
            <span className="project-list-main">
              <strong>{user.username}{user.isAdmin ? " · admin" : ""}{user.isSelf ? " · Anda" : ""}</strong>
              <small>{user.displayName && user.displayName !== user.username ? `${user.displayName} · ` : ""}{user.lastSignInAt ? `Terakhir masuk ${formatDate(user.lastSignInAt)}` : "Belum pernah masuk"}</small>
            </span>
            <span className="project-list-date">Dibuat {formatDate(user.createdAt)}</span>
            <div className="project-list-actions">
              <button className="secondary-button" type="button" aria-label={`Hapus ${user.username}`} disabled={user.isSelf || user.isAdmin} title={user.isSelf ? "Akun sendiri tidak dapat dihapus" : user.isAdmin ? "Akun admin tidak dapat dihapus dari menu ini" : undefined} onClick={() => setPendingDelete(user)}>Hapus</button>
            </div>
          </article>
        ))}
      </div>

      {pendingDelete && (
        <div className="formula-modal-backdrop formula-confirm-backdrop" role="presentation">
          <div className="formula-create-modal formula-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-user-title">
            <p className="eyebrow">HAPUS USER</p>
            <h2 id="delete-user-title">Hapus {pendingDelete.username}?</h2>
            <p>User ini tidak akan bisa masuk lagi. <strong>Semua proyek dan perkiraan harga miliknya ikut terhapus permanen.</strong></p>
            <div className="formula-modal-actions formula-confirm-actions">
              <button className="secondary-button" type="button" disabled={deleting} onClick={() => setPendingDelete(null)}>Batal</button>
              <button className="secondary-button formula-danger-button" type="button" disabled={deleting} onClick={() => void confirmDelete()}>{deleting ? "Menghapus…" : "Ya, hapus user"}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
