import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { RequireAuth } from "../auth/RequireAuth";
import AppShell from "../components/AppShell";
import { useAuth } from "../auth/AuthProvider";
import { canAccess as canAccessRole, getDefaultPathByRole, getUserRole } from "../auth/roleGuard";

import Login from "../pages/Login";
import Home from "../pages/Home";

import Dashboard from "../pages/Dashboard";
import PlantProduction from "../pages/PlantProduction";
import Ritmo from "../pages/Ritmo";
import Statistics from "../pages/Statistics";
import UfDF from "../pages/UfDF";
import DesvioProducao from "../pages/DesvioProducao";
import Configuracoes from "../pages/Configuracoes";
import Equipamentos from "../pages/Equipamentos";
import SupervisoresPlanta from "../pages/SupervisoresPlanta";

import Horimetros from "../pages/Horimetros";
import LancamentoParadas from "../pages/LancamentoParadas";
import Exportar from "../pages/Exportar";
import MetasMes from "../pages/MetasMes";

import DevLogs from "../pages/Devlogs";
import DevUsers from "../pages/DevUsers";

import PlantProductionDayView from "../pages/PlantProductionDayView";
import Last7DaysView from "../pages/Last7DaysView";
import GestaoVistaPlanta from "../pages/GestaoVistaPlanta";

import MobileShell from "../mobile/MobileShell";
import { isMobileViewport } from "../mobile/isMobile";

type Role = ReturnType<typeof getUserRole>;

function defaultPathFor(role: Role) {
  return getDefaultPathByRole(role);
}

function canAccessAppPath(role: Role, path: string) {
  if (path === "/supervisores-planta" || path.startsWith("/supervisores-planta/")) {
    return role === "dev" || role === "gerencia" || role === "controlador";
  }
  return canAccessRole(role, path);
}

function RequireRole({ children }: { children: ReactNode }) {
  const { user, token, loading } = useAuth() as any;
  const location = useLocation();
  const path = location.pathname;

  if (loading) return <>{children}</>;
  if (!user && token) return <>{children}</>;

  const role = getUserRole(user);

  if (!canAccessAppPath(role, path)) {
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
  tab:
    | "dashboard"
    | "production"
    | "desvio"
    | "ritmo"
    | "stats"
    | "ufdf"
    | "paradas-minutos"
    | "horimetros"
    | "metas"
    | "exportar"
    | "configuracoes"
    | "contingencia"
    | "ultimos-7"
    | "dev-logs"
    | "dev-users";
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
  const { user, loading } = useAuth() as any;
  const role = getUserRole(user);

  useEffect(() => {
    const onResize = () => {
      const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches;
      const mobile = isMobileViewport() || !!coarse || (typeof window !== "undefined" && window.innerWidth <= 980);
      const path = loc.pathname;
      const isMobileRoute = path.startsWith("/m");
      const isAuthRoute = path.startsWith("/login") || path.startsWith("/home");

      // Gestão à Vista é perfil de tela única. Não manda para /m/dashboard.
      if (!loading && role === "gestao_vista") {
        const target = getDefaultPathByRole(role);
        const isTarget = path === target || path.startsWith(target + "/");
        if (!isAuthRoute && !isTarget) {
          nav(target, { replace: true });
        }
        return;
      }

      if (mobile && !isMobileRoute && !isAuthRoute) {
        nav("/m/dashboard", { replace: true });
      }
    };

    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize as any);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname, nav, role, loading]);

  return (
    <Routes>
      <Route path="/home" element={<Home />} />
      <Route path="/login" element={<Login />} />

      {/* Mobile */}
      <Route
        path="/m"
        element={
          <RequireAuth>
            <Navigate to="/m/dashboard" replace />
          </RequireAuth>
        }
      />
      <Route
        path="/m/dashboard"
        element={
          <RequireAuth>
            <MobileWrap title="Dashboard" tab="dashboard">
              <Dashboard />
            </MobileWrap>
          </RequireAuth>
        }
      />
      <Route
        path="/m/ritmo"
        element={
          <RequireAuth>
            <MobileWrap title="Ritmo" tab="ritmo">
              <Ritmo />
            </MobileWrap>
          </RequireAuth>
        }
      />
      <Route
        path="/m/statisticas"
        element={
          <RequireAuth>
            <MobileWrap title="Estatísticas" tab="stats">
              <Statistics />
            </MobileWrap>
          </RequireAuth>
        }
      />
      <Route
        path="/m/ufdf"
        element={
          <RequireAuth>
            <MobileWrap title="UF/DF" tab="ufdf">
              <UfDF />
            </MobileWrap>
          </RequireAuth>
        }
      />
      <Route
        path="/m/producao-planta"
        element={
          <RequireAuth>
            <MobileWrap title="Produção Planta" tab="production">
              <PlantProduction />
            </MobileWrap>
          </RequireAuth>
        }
      />
      <Route
        path="/m/desvio-producao"
        element={
          <RequireAuth>
            <MobileWrap title="Desvio Produção" tab="desvio">
              <DesvioProducao />
            </MobileWrap>
          </RequireAuth>
        }
      />
      <Route
        path="/m/lancamento-paradas"
        element={
          <RequireAuth>
            <MobileWrap title="Paradas Minutos" tab="paradas-minutos">
              <LancamentoParadas />
            </MobileWrap>
          </RequireAuth>
        }
      />
      <Route
        path="/m/horimetros"
        element={
          <RequireAuth>
            <MobileWrap title="Horímetros" tab="horimetros">
              <Horimetros />
            </MobileWrap>
          </RequireAuth>
        }
      />
      <Route
        path="/m/metas"
        element={
          <RequireAuth>
            <MobileWrap title="Metas do mês" tab="metas">
              <MetasMes />
            </MobileWrap>
          </RequireAuth>
        }
      />
      <Route
        path="/m/exportar"
        element={
          <RequireAuth>
            <MobileWrap title="Relatórios" tab="exportar">
              <Exportar />
            </MobileWrap>
          </RequireAuth>
        }
      />
      <Route
        path="/m/configuracoes"
        element={
          <RequireAuth>
            <MobileWrap title="Configurações" tab="configuracoes">
              <Configuracoes />
            </MobileWrap>
          </RequireAuth>
        }
      />
      <Route
        path="/m/supervisores-planta"
        element={
          <RequireAuth>
            <MobileWrap title="Supervisores Planta" tab="configuracoes">
              <SupervisoresPlanta />
            </MobileWrap>
          </RequireAuth>
        }
      />
      <Route
        path="/m/dashboard/producao-dia"
        element={
          <RequireAuth>
            <MobileWrap title="Contingência" tab="contingencia">
              <PlantProductionDayView />
            </MobileWrap>
          </RequireAuth>
        }
      />
      <Route
        path="/m/dashboard/ultimos-7"
        element={
          <RequireAuth>
            <MobileWrap title="Últimos 7 dias" tab="ultimos-7">
              <Last7DaysView />
            </MobileWrap>
          </RequireAuth>
        }
      />
      <Route
        path="/m/dev/logs"
        element={
          <RequireAuth>
            <MobileWrap title="Dev Logs" tab="dev-logs">
              <DevLogs />
            </MobileWrap>
          </RequireAuth>
        }
      />
      <Route
        path="/m/dev/users"
        element={
          <RequireAuth>
            <MobileWrap title="Dev Usuários" tab="dev-users">
              <DevUsers />
            </MobileWrap>
          </RequireAuth>
        }
      />
      <Route path="/m/stats" element={<Navigate to="/m/statisticas" replace />} />

      {/* Desktop */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<RoleIndexRedirect />} />

        <Route
          path="dashboard"
          element={
            <RequireRole>
              <Dashboard />
            </RequireRole>
          }
        />
        <Route
          path="configuracoes"
          element={
            <RequireRole>
              <Configuracoes />
            </RequireRole>
          }
        />
        <Route
          path="equipamentos"
          element={
            <RequireRole>
              <Equipamentos />
            </RequireRole>
          }
        />
        <Route
          path="supervisores-planta"
          element={
            <RequireRole>
              <SupervisoresPlanta />
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
        <Route
          path="dashboard/gestao-vista-planta"
          element={
            <RequireRole>
              <GestaoVistaPlanta />
            </RequireRole>
          }
        />

        <Route
          path="producao-planta"
          element={
            <RequireRole>
              <PlantProduction />
            </RequireRole>
          }
        />
        <Route
          path="desvio-producao"
          element={
            <RequireRole>
              <DesvioProducao />
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
          path="statisticas"
          element={
            <RequireRole>
              <Statistics />
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


        <Route
          path="lancamento-paradas"
          element={
            <RequireRole>
              <LancamentoParadas />
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
          path="exportar"
          element={
            <RequireRole>
              <Exportar />
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
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
