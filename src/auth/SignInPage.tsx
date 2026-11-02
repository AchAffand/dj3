import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthProvider";
import { BrandLogo } from "../app/BrandLogo";

export function SignInPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const message = await signIn(email.trim(), password);
      if (message) setError(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tidak dapat masuk. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <BrandLogo className="auth-brand" />
        <p className="eyebrow">RUANG KERJA DJ3</p>
        <h1>Selamat datang</h1>
        <p className="auth-description">Masuk untuk melanjutkan perhitungan dan membuka proyek tersimpan.</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="password">Kata sandi</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="primary-button auth-submit" type="submit" disabled={submitting}>
            {submitting ? "Memeriksa…" : "Masuk ke ruang kerja"}
          </button>
        </form>
        <p className="auth-footnote">Akun dibuat oleh pengelola workshop.</p>
      </section>
    </main>
  );
}
