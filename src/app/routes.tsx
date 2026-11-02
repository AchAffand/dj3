import { Navigate, Route, Routes } from "react-router-dom";
import { featureRegistry } from "./features";
import { ProjectPrintPage } from "../features/projects/ProjectPrintPage";
import { BudgetEstimatePage } from "../features/budgets/BudgetEstimatePage";
import { BudgetPrintPage } from "../features/budgets/BudgetPrintPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={featureRegistry[0].path} replace />} />
      <Route path="/projects/:projectId/print" element={<ProjectPrintPage />} />
      <Route path="/master-harga/:catalogSlug" element={<BudgetEstimatePage />} />
      <Route path="/master-harga/:catalogSlug/estimates/:estimateId" element={<BudgetEstimatePage />} />
      <Route path="/master-harga/:catalogSlug/estimates/:estimateId/print" element={<BudgetPrintPage />} />
      {featureRegistry.map(({ id, path, component: Page }) => (
        <Route key={id} path={path} element={<Page />} />
      ))}
      <Route path="*" element={<Navigate to={featureRegistry[0].path} replace />} />
    </Routes>
  );
}
