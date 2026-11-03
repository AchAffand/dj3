import type { ComponentType } from "react";
import { CalculatorPage } from "../features/calculator/CalculatorPage";
import { FormulaMasterPage } from "../features/formula-master/FormulaMasterPage";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { BudgetWorkspacePage } from "../features/budgets/BudgetWorkspacePage";
import { SettingsPage } from "../features/settings/SettingsPage";

export type FeatureDefinition = {
  id: string;
  label: string;
  path: string;
  icon: string;
  component: ComponentType;
  /** Menu hanya tampil untuk admin katalog. Halamannya tetap memeriksa hak akses sendiri. */
  adminOnly?: boolean;
};

export const featureRegistry: readonly FeatureDefinition[] = [
  {
    id: "calculator",
    label: "Kalkulator Kusen",
    path: "/calculator",
    icon: "⌗",
    component: CalculatorPage,
  },
  {
    id: "projects",
    label: "Proyek",
    path: "/projects",
    icon: "▤",
    component: ProjectsPage,
  },
  {
    id: "formula-master",
    label: "Master Rumus",
    path: "/formulas",
    icon: "ƒx",
    component: FormulaMasterPage,
  },
  {
    id: "budget-master",
    label: "Master Harga",
    path: "/master-harga",
    icon: "▦",
    component: BudgetWorkspacePage,
  },
  {
    id: "settings",
    label: "Pengaturan",
    path: "/pengaturan",
    icon: "⚙",
    component: SettingsPage,
    adminOnly: true,
  },
];
