import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DoorModel } from "../domain/catalog/types";
import type { BudgetCatalog, BudgetCatalogDetail, MasterItemOption } from "../domain/budgets/types";
import { supabase } from "../integrations/supabase/client";
import { createSupabaseRepository } from "../integrations/supabase/repository";
import { createUserAdminClient, type UserAdminClient } from "../integrations/supabase/userAdmin";
import { useAuth } from "../auth/AuthProvider";

export type AppServicesValue = {
  repository: ReturnType<typeof createSupabaseRepository> | null;
  userAdmin?: UserAdminClient | null;
  catalog: ReadonlyMap<number, DoorModel>;
  loadingCatalog: boolean;
  catalogError: string | null;
  isCatalogAdmin: boolean;
  budgetCatalogs?: readonly BudgetCatalog[];
  budgetDetails?: ReadonlyMap<string, BudgetCatalogDetail>;
  loadingBudgets?: boolean;
  budgetError?: string | null;
  masterItemOptions?: readonly MasterItemOption[];
  loadingMasterItems?: boolean;
  masterItemError?: string | null;
  reloadMasterItems?(): Promise<void>;
  reloadBudgets?(): Promise<void>;
  reloadCatalog(): Promise<void>;
};

const ServicesContext = createContext<AppServicesValue | null>(null);

export function AppServicesProvider({ children, override }: { children: ReactNode; override?: AppServicesValue }) {
  if (override) {
    return <ServicesContext.Provider value={override}>{children}</ServicesContext.Provider>;
  }
  return <ConnectedServicesProvider>{children}</ConnectedServicesProvider>;
}

function ConnectedServicesProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();
  const repository = useMemo(
    () => supabase ? createSupabaseRepository(supabase) : null,
    [],
  );
  const userAdmin = useMemo(
    () => supabase ? createUserAdminClient(supabase) : null,
    [],
  );
  const [catalog, setCatalog] = useState<ReadonlyMap<number, DoorModel>>(() => new Map());
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isCatalogAdmin, setIsCatalogAdmin] = useState(false);
  const [budgetCatalogs, setBudgetCatalogs] = useState<BudgetCatalog[]>([]);
  const [budgetDetails, setBudgetDetails] = useState<ReadonlyMap<string, BudgetCatalogDetail>>(() => new Map());
  const [loadingBudgets, setLoadingBudgets] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [masterItemOptions, setMasterItemOptions] = useState<MasterItemOption[]>([]);
  const [loadingMasterItems, setLoadingMasterItems] = useState(false);
  const [masterItemError, setMasterItemError] = useState<string | null>(null);

  const reloadCatalog = useCallback(async () => {
    if (!repository) return;
    setLoadingCatalog(true);
    setCatalogError(null);
    try {
      const [models, admin] = await Promise.all([
        repository.listModels(),
        repository.isCatalogAdmin(),
      ]);
      setCatalog(new Map(models.map((model) => [model.code, model])));
      setIsCatalogAdmin(admin);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Katalog tidak dapat dimuat");
    } finally {
      setLoadingCatalog(false);
    }
  }, [repository]);

  const reloadBudgets = useCallback(async () => {
    if (!repository) return;
    setLoadingBudgets(true);
    setBudgetError(null);
    try {
      const catalogs = await repository.listBudgetCatalogs();
      const details = await Promise.all(catalogs.map((item) => repository.loadBudgetCatalog(item.slug)));
      setBudgetCatalogs(catalogs);
      setBudgetDetails(new Map(details.filter((item): item is NonNullable<typeof item> => item !== null).map((item) => [item.catalog.id, item])));
    } catch (error) {
      setBudgetError(error instanceof Error ? error.message : "Master harga tidak dapat dimuat.");
    }
    finally { setLoadingBudgets(false); }
  }, [repository]);

  const reloadMasterItems = useCallback(async () => {
    if (!repository) return;
    setLoadingMasterItems(true);
    setMasterItemError(null);
    try {
      const options = await repository.listMasterItemOptions();
      setMasterItemOptions(options);
    } catch (error) {
      setMasterItemError(error instanceof Error ? error.message : "Pilihan Master Item tidak dapat dimuat.");
    } finally {
      setLoadingMasterItems(false);
    }
  }, [repository]);

  useEffect(() => {
    if (authStatus === "signed-in") {
      void reloadCatalog();
      void reloadBudgets();
      void reloadMasterItems();
    } else {
      setCatalog(new Map());
      setIsCatalogAdmin(false);
      setBudgetCatalogs([]);
      setBudgetDetails(new Map());
      setBudgetError(null);
      setMasterItemOptions([]);
      setMasterItemError(null);
    }
  }, [authStatus, reloadCatalog, reloadBudgets, reloadMasterItems]);

  return (
    <ServicesContext.Provider value={{ repository, userAdmin, catalog, loadingCatalog, catalogError, isCatalogAdmin, budgetCatalogs, budgetDetails, loadingBudgets, budgetError, masterItemOptions, loadingMasterItems, masterItemError, reloadMasterItems, reloadBudgets, reloadCatalog }}>
      {children}
    </ServicesContext.Provider>
  );
}

export function useAppServices() {
  const value = useContext(ServicesContext);
  if (!value) throw new Error("useAppServices harus digunakan di dalam AppServicesProvider");
  return value;
}
