import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppServicesProvider } from "./AppServices";
import { CalculatorPage } from "../features/calculator/CalculatorPage";
import { doorCatalog } from "../domain/catalog/doorCatalog";
import type { Project, ProjectInput } from "../domain/projects/types";
import type { DoorModel } from "../domain/catalog/types";
import { createSupabaseRepository } from "../integrations/supabase/repository";

function setupApp() {
  let record: Project | null = null;
  const repository = {
    saveProject: vi.fn(async (input: ProjectInput) => {
      record = structuredClone({ ...input, id: input.id ?? "project-1" });
      return structuredClone(record);
    }),
    loadProject: vi.fn(async (id: string) => {
      return id === record?.id ? structuredClone(record) : null;
    }),
  } as unknown as ReturnType<typeof createSupabaseRepository>;
  const services = {
    repository,
    catalog: doorCatalog as ReadonlyMap<number, DoorModel>,
    loadingCatalog: false,
    catalogError: null,
    isCatalogAdmin: true,
    reloadCatalog: vi.fn(async () => undefined),
  };

  function TestNavigation() {
    const navigate = useNavigate();
    return <div><button onClick={() => navigate("/calculator")}>Kalkulator baru</button><button onClick={() => navigate("/calculator?project=project-1")}>Buka proyek tersimpan</button></div>;
  }

  render(
    <AppServicesProvider override={services}>
      <MemoryRouter initialEntries={["/calculator"]}>
        <TestNavigation />
        <Routes><Route path="/calculator" element={<CalculatorPage />} /></Routes>
      </MemoryRouter>
    </AppServicesProvider>,
  );
  return { user: userEvent.setup(), repository };
}

describe("calculator app flow", () => {
  it("adds a door model, prices it, saves it, and opens the saved project", async () => {
    const { user, repository } = setupApp();
    await user.type(screen.getByLabelText("Nama project"), "Rumah Contoh");
    await user.type(screen.getByLabelText("Lokasi"), "Bandung");
    await user.type(screen.getByLabelText("Lantai"), "2");
    await user.type(screen.getByLabelText("T1 · mm"), "2000");
    await user.type(screen.getByLabelText("L1 · mm"), "1754");
    await user.type(screen.getByLabelText("Daun pintu"), "2");
    expect(await screen.findAllByText("5,754")).not.toHaveLength(0);

    const priceInput = screen.getAllByPlaceholderText("Isi harga")[0];
    fireEvent.change(priceInput, { target: { value: "50000" } });
    await waitFor(() => expect(priceInput).toHaveValue(50000));
    expect(repository.saveProject).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /simpan proyek/i }));
    await waitFor(() => expect(repository.saveProject).toHaveBeenCalled());
    expect(vi.mocked(repository.saveProject).mock.calls[0][0]).toMatchObject({
      name: "Rumah Contoh",
      location: "Bandung",
      floor: "2",
    });

    await user.click(screen.getByRole("button", { name: "Kalkulator baru" }));
    await user.click(screen.getByRole("button", { name: "Buka proyek tersimpan" }));
    await waitFor(() => expect(screen.getByLabelText("Nama project")).toHaveValue("Rumah Contoh"));
    expect(screen.getByLabelText("Lokasi")).toHaveValue("Bandung");
    expect(screen.getByLabelText("Lantai")).toHaveValue("2");
    expect(screen.getAllByText("5,754")).not.toHaveLength(0);
    expect(repository.loadProject).toHaveBeenCalledWith("project-1");
    expect(vi.mocked(repository.saveProject).mock.calls[0][0].prices).toContainEqual(expect.objectContaining({ materialCode: 10101, unitPrice: 50000 }));
  });
});
