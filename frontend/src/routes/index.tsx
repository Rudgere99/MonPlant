import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { RequireAuth } from "../auth/RequireAuth";
import AppShell from "../components/AppShell";
import { useAuth } from "../auth/AuthProvider";
import { canAccess as canAccessRole, getUserRole } from "../auth/roleGuard";

import Login from "../pages/Login";
import Home from "../pages/Home";

import Dashboard from "../pages/Dashboard";
import PlantProduction from "../pages/PlantProduction";
import Ritmo from "../pages/Ritmo";
import Statistics from "../pages/Statistics";
import UfDF from "../pages/UfDF";
import DesvioProducao from "../pages/DesvioProducao";
import Abastecimento from "../pages/Abastecimento";
import Configuracoes from "../pages/Configuracoes";

import Horimetros from "../pages/Horimetros";
import Paradas from "../pages/Paradas";
import LancamentoParadas from "../pages/LancamentoParadas";
import Exportar from "../pages/Exportar";
import MetasMes from "../pages/MetasMes";
import AvisosSupervisor from "../pages/AvisosSupervisor";
import Historico from "../pages/Historico";

import DevLogs from "../pages/Devlogs";
import DevUsers from "../pages/DevUsers";

import PlantProductionDayView from "../pages/PlantProductionDayView";
import Last7DaysView from "../pages/Last7DaysView";

import MobileShell from "../mobile/MobileShell";
import { isMobileViewport } from "../mobile/isMobile";

type Role = ReturnType<typeof getUserRole>;

function defaultPathFor(role: Role) {
  return role === "apontador" ? "/producao-planta" : "/dashboard";
}

function RequireRole({ children }: { children: ReactNode }) {
  const { user, token, loading } = useAuth() as any;
  const location = useLocation();
  const path = location.pathname;

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
  tab:
    | "dashboard"
    | "production"
    | "desvio"
    | "ritmo"
    | "stats"
    | "ufdf"
    | "paradas"
    | "paradas-minutos"
    | "horimetros"
    | "abastecimento"
    | "historico"
    | "metas"
    | "exportar"
    | "configuracoes"
    | "avisos"
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

  useEffect(() => {
    const onResize = () => {
      const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches;
      const mobile = isMobileViewport() || !!coarse || (typeof window !== "undefined" && window.innerWidth <= 980);
      const path = loc.pathname;
      const isMobileRoute = path.startsWith("/m");
      const isAuthRoute = path.startsWith("/login") || path.startsWith("/home");

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
  }, [loc.pathname]);

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
        path="/m/paradas"
        element={
          <RequireAuth>
            <MobileWrap title="Paradas Horas" tab="paradas">
              <Paradas />
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
        path="/m/abastecimento"
        element={
          <RequireAuth>
            <MobileWrap title="Abastecimento" tab="abastecimento">
              <Abastecimento />
            </MobileWrap>
          </RequireAuth>
        }
      />
      <Route
        path="/m/historico"
        element={
          <RequireAuth>
            <MobileWrap title="Histórico" tab="historico">
              <Historico />
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
        path="/m/avisos"
        element={
          <RequireAuth>
            <MobileWrap title="Avisos" tab="avisos">
              <AvisosSupervisor />
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
          path="avisos"
          element={
            <RequireRole>
              <AvisosSupervisor />
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
          path="historico"
          element={
            <RequireRole>
              <Historico />
            </RequireRole>
          }
        />
        <Route
          path="abastecimento"
          element={
            <RequireRole>
              <Abastecimento />
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
