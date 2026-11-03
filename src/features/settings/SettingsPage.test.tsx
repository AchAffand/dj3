import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppServicesProvider, type AppServicesValue } from "../../app/AppServices";
import type { ManagedUser, UserAdminClient } from "../../integrations/supabase/userAdmin";
import { SettingsPage } from "./SettingsPage";

const budi: ManagedUser = { id: "u-budi", username: "budi", displayName: "Budi", isAdmin: false, isSelf: false, createdAt: "2026-11-01T00:00:00Z", lastSignInAt: null };
const owner: ManagedUser = { id: "u-owner", username: "owner", displayName: "", isAdmin: true, isSelf: true, createdAt: "2026-10-01T00:00:00Z", lastSignInAt: "2026-11-03T00:00:00Z" };

function renderPage(userAdmin: UserAdminClient, isCatalogAdmin = true) {
  const services: AppServicesValue = {
    repository: null,
    userAdmin,
    catalog: new Map(),
    loadingCatalog: false,
    catalogError: null,
    isCatalogAdmin,
    reloadCatalog: async () => {},
  };
  return render(<AppServicesProvider override={services}><SettingsPage /></AppServicesProvider>);
}

describe("SettingsPage", () => {
  it("blocks non-admin accounts without calling the server", () => {
    const userAdmin = { listUsers: vi.fn(), createUser: vi.fn(), deleteUser: vi.fn() };
    renderPage(userAdmin, false);
    expect(screen.getByText("Khusus admin")).toBeInTheDocument();
    expect(userAdmin.listUsers).not.toHaveBeenCalled();
  });

  it("lists users and disables deleting yourself and admins", async () => {
    const userAdmin = { listUsers: vi.fn(async () => [owner, budi]), createUser: vi.fn(), deleteUser: vi.fn() };
    renderPage(userAdmin);
    expect(await screen.findByText(/^budi$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hapus owner" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hapus budi" })).toBeEnabled();
  });

  it("creates a user with a normalized username and refreshes the list", async () => {
    const user = userEvent.setup();
    const listUsers = vi.fn(async () => [owner]);
    const createUser = vi.fn(async () => {});
    renderPage({ listUsers, createUser, deleteUser: vi.fn() });
    await screen.findByText("1 akun");

    const submit = screen.getByRole("button", { name: "Tambah user" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("Nama pengguna"), "  Siti ");
    await user.type(screen.getByLabelText("Kata sandi"), "rahasia123");
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(createUser).toHaveBeenCalledWith({ username: "siti", password: "rahasia123", displayName: "", role: "user" }));
    await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(2));
  });

  it("creates an admin account when the admin role is chosen", async () => {
    const user = userEvent.setup();
    const createUser = vi.fn(async () => {});
    renderPage({ listUsers: vi.fn(async () => [owner]), createUser, deleteUser: vi.fn() });
    await screen.findByText("1 akun");
    await user.type(screen.getByLabelText("Nama pengguna"), "admin2");
    await user.type(screen.getByLabelText("Kata sandi"), "rahasia123");
    await user.selectOptions(screen.getByLabelText("Peran"), "admin");
    await user.click(screen.getByRole("button", { name: "Tambah user" }));
    await waitFor(() => expect(createUser).toHaveBeenCalledWith({ username: "admin2", password: "rahasia123", displayName: "", role: "admin" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Admin admin2 berhasil ditambahkan.");
  });

  it("shows the server error when creating a user fails", async () => {
    const user = userEvent.setup();
    const createUser = vi.fn(async () => { throw new Error("Nama pengguna sudah dipakai."); });
    renderPage({ listUsers: vi.fn(async () => [owner]), createUser, deleteUser: vi.fn() });
    await screen.findByText("1 akun");
    await user.type(screen.getByLabelText("Nama pengguna"), "budi");
    await user.type(screen.getByLabelText("Kata sandi"), "rahasia123");
    await user.click(screen.getByRole("button", { name: "Tambah user" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nama pengguna sudah dipakai.");
  });

  it("asks for confirmation, warns about project loss, then deletes", async () => {
    const user = userEvent.setup();
    const listUsers = vi.fn(async () => [owner, budi]);
    const deleteUser = vi.fn(async () => {});
    renderPage({ listUsers, createUser: vi.fn(), deleteUser });
    await screen.findByText(/^budi$/);

    await user.click(screen.getByRole("button", { name: "Hapus budi" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("proyek dan perkiraan harga miliknya ikut terhapus permanen");
    expect(deleteUser).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Ya, hapus user" }));
    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith("u-budi"));
  });
});
