import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "../auth/RequireAuth";
import { AppShell } from "../components/AppShell";

import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import PlantProduction from "../pages/PlantProduction";
import Horimetros from "../pages/Horimetros";
import Paradas from "../pages/Paradas";
import Exportar from "../pages/Exportar";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="producao-planta" element={<PlantProduction />} />
        <Route path="horimetros" element={<Horimetros />} />
        <Route path="paradas" element={<Paradas />} />
        <Route path="exportar" element={<Exportar />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
