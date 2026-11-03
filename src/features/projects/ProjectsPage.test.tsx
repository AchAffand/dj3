import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppServicesProvider } from "../../app/AppServices";
import { ProjectsPage } from "./ProjectsPage";
import type { ProjectSummary } from "../../domain/projects/types";
import { createSupabaseRepository } from "../../integrations/supabase/repository";

function setup(projects: ProjectSummary[] = [{
    id: "project-1",
    name: "Rumah Contoh",
    createdAt: "2026-09-25T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    modelCount: 2,
    createdBy: "Admin DJ3",
  }]) {
  const repository = { listProjects: vi.fn(async () => projects) } as unknown as ReturnType<typeof createSupabaseRepository>;
  function Location() {
    const location = useLocation();
    return <output aria-label="Lokasi">{location.pathname}{location.search}</output>;
  }
  render(
    <AppServicesProvider override={{
      repository,
      catalog: new Map(),
      loadingCatalog: false,
      catalogError: null,
      isCatalogAdmin: false,
      reloadCatalog: vi.fn(async () => undefined),
    }}>
      <MemoryRouter initialEntries={["/projects"]}>
        <Location />
        <Routes><Route path="/projects" element={<ProjectsPage />} /></Routes>
      </MemoryRouter>
    </AppServicesProvider>,
  );
  return userEvent.setup();
}

describe("ProjectsPage", () => {
  afterEach(() => cleanup());

  it("shows the user who created the saved project", async () => {
    setup();
    expect(await screen.findByText("Dibuat oleh Admin DJ3")).toBeInTheDocument();
    expect(screen.getByText(/Dibuat 25 Sep 2026/)).toBeInTheDocument();
  });

  it("shows project numbers in list order", async () => {
    setup([
      { id: "project-1", name: "Rumah Contoh", createdAt: "2026-09-25T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", modelCount: 2, createdBy: "Admin DJ3" },
      { id: "project-2", name: "Gudang", createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z", modelCount: 1, createdBy: "Admin DJ3" },
    ]);
    expect(await screen.findByLabelText("Urutan 1")).toHaveTextContent("1");
    expect(screen.getByLabelText("Urutan 2")).toHaveTextContent("2");
  });

  it("filters projects by name and creator", async () => {
    const user = setup([
      { id: "project-1", name: "Rumah Contoh", createdAt: "2026-09-25T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", modelCount: 2, createdBy: "Admin DJ3" },
      { id: "project-2", name: "Gudang", createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z", modelCount: 1, createdBy: "Budi" },
    ]);
    const search = await screen.findByRole("searchbox", { name: "Cari proyek" });
    await user.type(search, "gudang");
    expect(screen.getByText("Gudang")).toBeInTheDocument();
    expect(screen.queryByText("Rumah Contoh")).not.toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "budi");
    expect(screen.getByText("Gudang")).toBeInTheDocument();
    expect(screen.queryByText("Rumah Contoh")).not.toBeInTheDocument();
  });

  it("shows a clear empty state when no project matches", async () => {
    const user = setup();
    await user.type(await screen.findByRole("searchbox", { name: "Cari proyek" }), "tidak ada");
    expect(screen.getByText("Proyek tidak ditemukan")).toBeInTheDocument();
  });

  it("opens the selected saved project for editing", async () => {
    const user = setup();
    await user.click(await screen.findByRole("button", { name: "Edit Rumah Contoh" }));
    expect(screen.getByLabelText("Lokasi")).toHaveTextContent("/calculator?project=project-1");
  });

  it("opens a print preview for the selected saved project", async () => {
    const user = setup();
    await user.click(await screen.findByRole("button", { name: "Cetak Rumah Contoh" }));
    expect(screen.getByLabelText("Lokasi")).toHaveTextContent("/projects/project-1/print");
  });
});
