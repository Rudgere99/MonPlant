import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { RequireAuth } from "../auth/RequireAuth";
import AppShell from "../components/AppShell";
import { useAuth } from "../auth/AuthProvider";
import { canAccess as canAccessRole, getUserRole } from "../auth/roleGuard";
import Historico from "../pages/Historico";

import Login from "../pages/Login";
import Home from "../pages/Home";
import Dashboard from "../pages/Dashboard";
import PlantProduction from "../pages/PlantProduction";
import Horimetros from "../pages/Horimetros";
import Paradas from "../pages/Paradas";
import Exportar from "../pages/Exportar";
import MetasMes from "../pages/MetasMes";
import Statistics from "../pages/Statistics";
import Ritmo from "../pages/Ritmo";
import AvisosSupervisor from "../pages/AvisosSupervisor";

// ✅ NOVO
import LancamentoParadas from "../pages/LancamentoParadas";

import DevLogs from "../pages/Devlogs";
import DevUsers from "../pages/DevUsers";

import PlantProductionDayView from "../pages/PlantProductionDayView";
import Last7DaysView from "../pages/Last7DaysView";
import UfDF from "../pages/UfDF";

// 📱 Mobile-only (Produção)
import MobileShell from "../mobile/MobileShell";
import { isMobileViewport } from "../mobile/isMobile";

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


function MobileWrap({
  title,
  tab,
  children,
}: {
  title: string;
  tab: "dashboard" | "production" | "ritmo" | "stats" | "ufdf";
  children: ReactNode;
}) {
  return (
    <MobileShell title={title} subtitle="Modo Mobile" active={tab}>
      {children}
    </MobileShell>
  );
}

function RoleIndexRedirect() {
  const { user, token, loading } = useAuth() as any;
  if (loading) return null;
  if (!user && token) return null;

  const role = getUserRole(user);
  return <Navigate to={defaultPathFor(role)} replace />;
}

export function AppRoutes() {
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => {
    const onResize = () => {
      const mobile = isMobileViewport();
      const path = loc.pathname;
      const isMobileRoute = path.startsWith("/m");
      const isAuthRoute = path.startsWith("/login") || path.startsWith("/home");

      // No celular: força modo mobile (exceto login/home)
      if (mobile && !isMobileRoute && !isAuthRoute) {
        nav("/m/production", { replace: true });
      }
    };

    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname]);

  return (
    <Routes>
      <Route path="/home" element={<Home />} />
      <Route path="/login" element={<Login />} />

      {/* 📱 Mobile: somente Produção (requer login) */}
      <Route
        path="/m"
        element={
          <RequireAuth>
            <Navigate to="/m/production" replace />
          </RequireAuth>
        }
      />
      <Route
        path="/m/production"
        element={
          <RequireAuth>
            <MobileProduction />
          </RequireAuth>
        }
      />


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

        {/* Avisos (Supervisor) */}
        <Route
          path="avisos"
          element={
            <RequireRole>
              <AvisosSupervisor />
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

        <Route
          path="ufdf"
          element={
            <RequireRole>
              <UfDF />
            </RequireRole>
          }
        />
      </Route>

      {/* cai aqui se digitarem URL inválida: volta pro app e o index decide por role */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
