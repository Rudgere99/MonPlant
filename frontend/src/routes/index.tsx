import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { RequireAuth } from "../auth/RequireAuth";
import AppShell from "../components/AppShell";
import { useAuth } from "../auth/AuthProvider";
import { canAccess as canAccessRole, getUserRole } from "../auth/roleGuard";
import Historico from "../pages/Historico";

import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import PlantProduction from "../pages/PlantProduction";
import Horimetros from "../pages/Horimetros";
import Paradas from "../pages/Paradas";
import Exportar from "../pages/Exportar";
import MetasMes from "../pages/MetasMes";
import Statistics from "../pages/Statistics";
import Ritmo from "../pages/Ritmo";

// ✅ NOVO
import LancamentoParadas from "../pages/LancamentoParadas";

import DevLogs from "../pages/Devlogs";
import DevUsers from "../pages/DevUsers";

import PlantProductionDayView from "../pages/PlantProductionDayView";
import Last7DaysView from "../pages/Last7DaysView";

function defaultPathFor(role: ReturnType<typeof getUserRole>) {
  // Gerência também cai no dashboard
  return role === "apontador" ? "/producao-planta" : "/dashboard";
}

function RequireRole({ children }: { children: ReactNode }) {
  const { user, token, loading } = useAuth() as any;
  const location = useLocation();
  const path = location.pathname;

  // ✅ não redireciona durante hidratação (evita piscar/loop no F5)
  if (loading) return <>{children}</>;
  if (!user && token) return <>{children}</>;

  const role = getUserRole(user);

  if (!canAccessRole(role, path)) {
    return <Navigate to={defaultPathFor(role)} replace />;
  }

  return <>{children}</>;
}

function RoleIndexRedirect() {
  const { user, token, loading } = useAuth() as any;
  if (loading) return null;
  if (!user && token) return null;

  const role = getUserRole(user);
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
          path="ritmo"
          element={
            <RequireRole>
              <Ritmo />
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

        {/* ✅ NOVO */}
        <Route
          path="lancamento-paradas"
          element={
            <RequireRole>
              <LancamentoParadas />
            </RequireRole>
          }
        />

        <Route
          path="historico"
          element={
            <RequireRole>
              <Historico />
            </RequireRole>
          }
        />

        <Route
          path="metas"
          element={
            <RequireRole>
              <MetasMes />
            </RequireRole>
          }
        />

        <Route
          path="statisticas"
          element={
            <RequireRole>
              <Statistics />
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
