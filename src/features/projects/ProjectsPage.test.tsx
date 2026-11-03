import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppServicesProvider } from "../../app/AppServices";
import { ProjectsPage } from "./ProjectsPage";
import type { ProjectSummary } from "../../domain/projects/types";
import { createSupabaseRepository } from "../../integrations/supabase/repository";

function setup() {
  const projects: ProjectSummary[] = [{
    id: "project-1",
    name: "Rumah Contoh",
    updatedAt: "2026-10-01T00:00:00.000Z",
    modelCount: 2,
    createdBy: "Admin DJ3",
  }];
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
