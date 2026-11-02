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

  it("prints the Excel-style project recap with author, metadata and seven material columns", async () => {
    const repository = { loadProject: vi.fn(async () => project) } as unknown as ReturnType<typeof createSupabaseRepository>;
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

    expect(await screen.findByText("Rumah Contoh")).toBeInTheDocument();
    expect(screen.getByText("REKAP PEKERJAAN PINTU")).toBeInTheDocument();
    expect(screen.getByText("Dibuat : Operator DJ3")).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("Lokasi")).toBeInTheDocument();
    expect(screen.getByText("Lantai")).toBeInTheDocument();
    expect(screen.getByText("Bandung")).toBeInTheDocument();
    expect(screen.getByText("2", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("Tgl:", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("10101 · Harga manual")).toBeInTheDocument();
    for (const heading of ["TYPE", "ITEM", "QTY", "HARG SAT", "SATUAN", "SUB TOTAL", "GRAND TOTAL"]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByRole("cell", { name: /PINTU.*10100/ })).toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: /11,508/ })).toHaveLength(2);
    expect(document.querySelector(".grand-total-merged")).not.toHaveAttribute("rowspan");
    expect(document.querySelector(".grand-total-row")).toBeInTheDocument();
    expect(document.querySelector(".grand-total-spacer")).toHaveAttribute("colspan", "6");
    expect(document.querySelector(".grand-total-spacer")).toHaveClass("grand-total-spacer");
    expect(document.querySelector(".grand-total-merged")).toHaveClass("grand-total-merged");
    expect(document.querySelector(".grand-total-value")).toBeInTheDocument();
    expect(screen.getAllByText(/Rp\s*575\.400/)).toHaveLength(2);
    await userEvent.setup().click(screen.getByRole("button", { name: "Cetak / Simpan PDF" }));
    expect(window.print).toHaveBeenCalledOnce();
  });
});
