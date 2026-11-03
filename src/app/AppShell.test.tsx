import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { email: "user@example.com" }, signOut: vi.fn(async () => undefined) }),
}));
vi.mock("./AppServices", () => ({
  useAppServices: () => ({ budgetCatalogs: [] }),
}));

describe("AppShell branding and mobile navigation", () => {
  it("opens and closes the mobile navigation drawer", () => {
    render(<MemoryRouter><AppShell><p>Konten</p></AppShell></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Buka menu navigasi" }));
    expect(screen.getByRole("navigation", { name: "Navigasi utama mobile" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tutup menu navigasi" }));
    expect(screen.queryByRole("navigation", { name: "Navigasi utama mobile" })).not.toBeInTheDocument();
  });

    it("shows the DJ3 Engineering logo in the sidebar", () => {
    render(<MemoryRouter><AppShell><p>Konten</p></AppShell></MemoryRouter>);
    expect(screen.getByRole("img", { name: "DJ3 Engineering" })).toHaveAttribute("src", "/dj3-engineering-logo.png");
  });
});
