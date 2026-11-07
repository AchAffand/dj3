import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppServicesProvider } from "../../app/AppServices";
import { doorCatalog } from "../../domain/catalog/doorCatalog";
import type { DoorModel } from "../../domain/catalog/types";
import type { Project } from "../../domain/projects/types";
import { createSupabaseRepository } from "../../integrations/supabase/repository";
import { ProjectPrintPage } from "./ProjectPrintPage";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { email: "operator@dj3.com", user_metadata: { full_name: "Operator DJ3" } } }),
}));

const project: Project = {
  id: "project-1",
  name: "Rumah Contoh",
  location: "Bandung",
  floor: "2",
  createdAt: "2026-10-01T00:00:00.000Z",
  lines: [{
    id: "line-1",
    modelCode: 10100,
    inputs: { T1: 2000, L1: 1754, daunPintu: 2 },
    count: 2,
    formulaSnapshot: [],
    resultSnapshot: { items: [
      { materialCode: 10101, name: "Kusen", unit: "m'", quantity: 5.754 },
      { materialCode: 10102, name: "Tapin", unit: "m'", quantity: 5.754 },
    ], errors: [] },
  }],
  prices: [
    { materialCode: 10101, name: "Kusen", unit: "m'", unitPrice: 50000 },
    { materialCode: 10102, name: "Tapin", unit: "m'", unitPrice: null },
  ],
};

describe("ProjectPrintPage", () => {
  beforeEach(() => vi.stubGlobal("print", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("renders the quotation letter layout and editable letter details", async () => {
    const repository = { loadProject: vi.fn(async () => project), listProjects: vi.fn(async () => [{ id: project.id, name: project.name, createdAt: project.createdAt ?? "2026-10-01T00:00:00.000Z", updatedAt: project.createdAt ?? "2026-10-01T00:00:00.000Z", modelCount: 1, createdBy: "Operator DJ3" }]) } as unknown as ReturnType<typeof createSupabaseRepository>;
    render(
      <AppServicesProvider override={{
        repository,
        catalog: doorCatalog as ReadonlyMap<number, DoorModel>,
        loadingCatalog: false,
        catalogError: null,
        isCatalogAdmin: false,
        reloadCatalog: vi.fn(async () => undefined),
      }}>
        <MemoryRouter initialEntries={["/projects/project-1/print"]}>
          <Routes><Route path="/projects/:projectId/print" element={<ProjectPrintPage />} /></Routes>
        </MemoryRouter>
      </AppServicesProvider>,
    );

    expect(await screen.findByText("Kepada Yth,")).toBeInTheDocument();
    expect(screen.getByAltText("DJ3 Engineering")).toBeInTheDocument();
    expect(screen.getByText("1001/DJ3/X/2026")).toBeInTheDocument();
    expect(screen.getByText("Rumah Contoh")).toBeInTheDocument();
    expect(screen.getByText("Bandung")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nama customer" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Nama penandatangan" })).toHaveValue("Bagus Satrio S.T");
    expect(screen.getByText("Tanggal")).toBeInTheDocument();
    expect(screen.getByText(/Bersama surat penawaran/)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "ITEM" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "HARSAT" })).toBeInTheDocument();
    expect(screen.getByText("A. Pekerjaan Pintu")).toBeInTheDocument();
    expect(screen.getByText("NB:")).toBeInTheDocument();
    expect(screen.getByText("Hormat kami,")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Cetak / Simpan PDF" }));
    expect(window.print).toHaveBeenCalledOnce();
  });
});
