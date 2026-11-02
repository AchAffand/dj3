import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "../auth/AuthProvider";
import { ProtectedRoute } from "../auth/ProtectedRoute";
import { AppServicesProvider } from "./AppServices";
import { AppShell } from "./AppShell";
import { AppRoutes } from "./routes";

export function App() {
  return (
    <AuthProvider>
      <AppServicesProvider>
        <BrowserRouter>
          <ProtectedRoute>
            <AppShell><AppRoutes /></AppShell>
          </ProtectedRoute>
        </BrowserRouter>
      </AppServicesProvider>
    </AuthProvider>
  );
}
