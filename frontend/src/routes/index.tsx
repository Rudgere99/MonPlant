import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { RequireAuth } from "../auth/RequireAuth";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../auth/AuthProvider";

import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import PlantProduction from "../pages/PlantProduction";
import Horimetros from "../pages/Horimetros";
import Paradas from "../pages/Paradas";
import Exportar from "../pages/Exportar";

import DevLogs from "../pages/Devlogs";
import DevUsers from "../pages/DevUsers";

import PlantProductionDayView from "../pages/PlantProductionDayView";
import Last7DaysView from "../pages/Last7DaysView";

type UserRole = "apontador" | "controlador" | "dev";

function getRole(user: any): UserRole {
  // role vem do backend em user.user_type (dev/controlador/apontador)
  const t = String(user?.user_type || "").toLowerCase();
  if (t === "dev") return "dev";
  if (t === "controlador") return "controlador";
  return "apontador";
}

function canAccess(role: UserRole, path: string) {
  if (role === "dev") return true;

  // DEV pages
  if (path.startsWith("/dev") || path.startsWith("/dashboard/producao-dia")) return false;

  if (role === "apontador") {
    return path.startsWith("/producao-planta") || path.startsWith("/paradas");
  }

  // controlador: tudo exceto dev
  return true;
}

function defaultPathFor(role: UserRole) {
  return role === "apontador" ? "/producao-planta" : "/dashboard";
}

function RequireRole({ children }: { children: JSX.Element }) {
  const { user } = useAuth() as any;
  const role = getRole(user);
  const location = useLocation();
  const path = location.pathname;

  if (!canAccess(role, path)) {
    return <Navigate to={defaultPathFor(role)} replace />;
  }

  return children;
}

function RoleIndexRedirect() {
  const { user } = useAuth() as any;
  const role = getRole(user);
  return <Navigate to={defaultPathFor(role)} replace />;
}

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
        <Route index element={<RoleIndexRedirect />} />

        {/* Dashboard */}
        <Route
          path="dashboard"
          element={
            <RequireRole>
              <Dashboard />
            </RequireRole>
          }
        />
        <Route
          path="dashboard/producao-dia"
          element={
            <RequireRole>
              <PlantProductionDayView />
            </RequireRole>
          }
        />
        <Route
          path="dashboard/ultimos-7"
          element={
            <RequireRole>
              <Last7DaysView />
            </RequireRole>
          }
        />

        {/* DEV */}
        <Route
          path="dev/logs"
          element={
            <RequireRole>
              <DevLogs />
            </RequireRole>
          }
        />
        <Route
          path="dev/users"
          element={
            <RequireRole>
              <DevUsers />
            </RequireRole>
          }
        />

        {/* App */}
        <Route
          path="producao-planta"
          element={
            <RequireRole>
              <PlantProduction />
            </RequireRole>
          }
        />
        <Route
          path="horimetros"
          element={
            <RequireRole>
              <Horimetros />
            </RequireRole>
          }
        />
        <Route
          path="paradas"
          element={
            <RequireRole>
              <Paradas />
            </RequireRole>
          }
        />
        <Route
          path="exportar"
          element={
            <RequireRole>
              <Exportar />
            </RequireRole>
          }
        />
      </Route>

      {/* cai aqui se digitarem URL inválida: volta pro app e o index decide por role */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
