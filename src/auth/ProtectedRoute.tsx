import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { SignInPage } from "./SignInPage";
import { BrandLogo } from "../app/BrandLogo";

function ConfigurationPage() {
  return (
    <main className="auth-page">
      <section className="auth-card setup-card">
        <BrandLogo className="auth-brand" />
        <p className="eyebrow">PERSIAPAN APLIKASI</p>
        <h1>Hubungkan Supabase</h1>
        <p className="auth-description">Tambahkan URL proyek dan publishable key Supabase pada berkas `.env.local`, lalu jalankan ulang aplikasi.</p>
        <div className="setup-code">VITE_SUPABASE_URL=<br />VITE_SUPABASE_PUBLISHABLE_KEY=</div>
        <p className="auth-footnote">Kunci rahasia Supabase tidak digunakan di aplikasi browser.</p>
      </section>
    </main>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "unconfigured") return <ConfigurationPage />;
  if (status === "loading") {
    return <main className="loading-page"><span className="loading-spinner" />Memeriksa sesi…</main>;
  }
  return status === "signed-in" ? children : <SignInPage />;
}
