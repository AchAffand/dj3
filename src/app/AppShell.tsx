import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { featureRegistry } from "./features";
import { BrandLogo } from "./BrandLogo";
import { useAppServices } from "./AppServices";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { budgetCatalogs = [], isCatalogAdmin } = useAppServices();
  const visibleFeatures = featureRegistry.filter((feature) => !feature.adminOnly || isCatalogAdmin);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="DJ3 beranda">
          <BrandLogo />
        </a>
        <div className="sidebar-label">RUANG KERJA</div>
        <nav className="main-navigation" aria-label="Navigasi utama">
          {visibleFeatures.map((feature) => feature.id === "budget-master" ? (
            <div className="nav-group" key={feature.id}>
              <NavLink aria-label={feature.label} title={feature.label} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to={feature.path}>
                <span className="nav-icon" aria-hidden="true">{feature.icon}</span><span>{feature.label}</span>
              </NavLink>
              {budgetCatalogs.map((catalog) => <NavLink className={({ isActive }) => `nav-sub-link${isActive ? " active" : ""}`} key={catalog.id} to={`/master-harga/${catalog.slug}?mode=prices`}>{catalog.label}</NavLink>)}
            </div>
          ) : (
            <NavLink aria-label={feature.label} title={feature.label} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} key={feature.id} to={feature.path}>
              <span className="nav-icon" aria-hidden="true">{feature.icon}</span>
              <span>{feature.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workshop-card">
            <span className="status-dot" />
            <div><strong>Workshop DJ3</strong><small>Ruang perhitungan</small></div>
          </div>
          <div className="sidebar-footer">DJ3 · Kalkulator Material <span>v0.1</span></div>
        </div>
      </aside>
      {mobileMenuOpen && (
        <>
          <button className="mobile-nav-backdrop" type="button" aria-label="Tutup menu navigasi" onClick={() => setMobileMenuOpen(false)} />
          <aside className="mobile-nav-drawer" aria-label="Menu navigasi mobile">
            <div className="mobile-nav-heading">
              <BrandLogo />
              <div><strong>DJ3 Engineering</strong><small>RUANG KERJA</small></div>
              <button className="mobile-nav-close" type="button" aria-label="Tutup menu" onClick={() => setMobileMenuOpen(false)}>×</button>
            </div>
            <nav className="main-navigation" aria-label="Navigasi utama mobile">
              {visibleFeatures.map((feature) => feature.id === "budget-master" ? (
                <div className="nav-group" key={feature.id}>
                  <NavLink aria-label={feature.label} title={feature.label} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to={feature.path} onClick={() => setMobileMenuOpen(false)}>
                    <span className="nav-icon" aria-hidden="true">{feature.icon}</span><span>{feature.label}</span>
                  </NavLink>
                  {budgetCatalogs.map((catalog) => <NavLink className={({ isActive }) => `nav-sub-link${isActive ? " active" : ""}`} key={catalog.id} to={`/master-harga/${catalog.slug}?mode=prices`} onClick={() => setMobileMenuOpen(false)}>{catalog.label}</NavLink>)}
                </div>
              ) : (
                <NavLink aria-label={feature.label} title={feature.label} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} key={feature.id} to={feature.path} onClick={() => setMobileMenuOpen(false)}>
                  <span className="nav-icon" aria-hidden="true">{feature.icon}</span>
                  <span>{feature.label}</span>
                </NavLink>
              ))}
            </nav>
            <div className="mobile-nav-footer">
              <span className="status-dot" />
              <div><strong>Workshop DJ3</strong><small>Ruang perhitungan</small></div>
            </div>
          </aside>
        </>
      )}
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>DJ3</span><b>/</b><strong>Ruang kerja</strong></div>
          <div className="topbar-right"><span className="connection-dot" /> <span className="topbar-email">{user?.email}</span><button className="sign-out-button" onClick={() => void signOut()} type="button">Keluar</button></div>
        </header>
        <div className="content-area">{children}</div>
      </main>
    </div>
  );
}
