import React, { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { canAccess as canAccessRole, getDefaultPathByRole, getUserRole, type UserRole } from "../auth/roleGuard";
import {
  LayoutDashboard,
  BarChart3,
  Code2,
  Factory,
  Timer,
  PauseCircle,
  Calculator,
  Logs,
  Users,
  LogOut,
  Menu,
  X,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  User as UserIcon,
  Settings,
  Eye,
} from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  group?: string;
  devOnly?: boolean;
};

const nav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Visão geral" },
  { to: "/desvio-producao", label: "Desvio Produção", icon: LayoutDashboard, group: "Produção" },
  { to: "/statisticas", label: "Estatísticas", icon: BarChart3, group: "Configurações" },
  { to: "/ritmo", label: "Ritmo", icon: Factory, group: "Operação" },
  { to: "/equipamentos", label: "Equipamentos", icon: Factory, group: "Configurações" },
  { to: "/supervisores-planta", label: "Supervisores Planta", icon: Users, group: "Configurações" },

  { to: "/dashboard/gestao-vista-planta", label: "Gestão à Vista", icon: LayoutDashboard, group: "Visão geral" },

  // ===== DEV =====
  { to: "/dashboard/producao-dia", label: "Contingência", icon: Code2, group: "Desenvolvimento", devOnly: true },
  { to: "/dev/users", label: "Usuários", icon: Users, group: "Desenvolvimento", devOnly: true },
  { to: "/dev/logs", label: "Logs", icon: Logs, group: "Desenvolvimento", devOnly: true },

  // ===== APP =====
  { to: "/producao-planta", label: "Produção Planta", icon: Factory, group: "Produção" },
  { to: "/horimetros", label: "Horímetros", icon: Timer, group: "Operação" },
  { to: "/paradas", label: "Paradas Horas", icon: PauseCircle, group: "Operação" },
  { to: "/lancamento-paradas", label: "Paradas Minutos", icon: PauseCircle, group: "Operação" },
  { to: "/ufdf", label: "UF / DF", icon: BarChart3, group: "Indicadores" },


  { to: "/metas", label: "Metas do mês", icon: BarChart3, group: "Configurações" },
];


function defaultPathFor(role: UserRole) {
  return getDefaultPathByRole(role);
}

function canAccessMonPlantPath(role: UserRole, path: string) {
  if (path === "/supervisores-planta" || path.startsWith("/supervisores-planta/")) {
    return role === "dev" || role === "gerencia" || role === "controlador";
  }
  return canAccessRole(role, path);
}


function getTitleFromPath(pathname: string) {
  const hit = [...nav]
    .sort((a, b) => b.to.length - a.to.length)
    .find((n) => pathname === n.to || pathname.startsWith(n.to + "/"));
  return hit?.label ?? "Dashboard";
}

function getGroupFromPath(pathname: string) {
  const hit = [...nav]
    .sort((a, b) => b.to.length - a.to.length)
    .find((n) => pathname === n.to || pathname.startsWith(n.to + "/"));
  return hit?.group ?? "";
}

/** ===== USER DISPLAY (nome no lugar do "MonPlant") ===== */
function getUserDisplay(user: any) {
  const name =
    user?.name ||
    user?.full_name ||
    user?.username ||
    user?.display_name ||
    user?.nome ||
    "";

  const email = user?.email || user?.user_email || "";
  const label = String(name || email || "Usuário").trim();
  return label || "Usuário";
}

function getInitials(label: string) {
  const clean = String(label || "").trim();
  if (!clean) return "U";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function NotificationDot({ size = 10 }: { size?: number }) {
  return (
    <span
      style={{
        position: "absolute",
        top: -2,
        right: -2,
        height: size,
        width: size,
        borderRadius: 999,
        background: "#ef4444",
        border: "2px solid #05080C",
        boxShadow: "0 0 0 4px rgba(239,68,68,0.18), 0 0 18px rgba(239,68,68,0.85)",
      }}
    />
  );
}

/** ===== topo da sidebar SEM LOGO (mostra usuário) ===== */
function ShellUser({
  onClick,
  to,
  collapsed,
  userLabel,
}: {
  onClick?: () => void;
  to?: string;
  collapsed?: boolean;
  userLabel: string;
}) {
  const initials = getInitials(userLabel);

  return (
    <Link
      to={to || "/dashboard"}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: collapsed ? 0 : 10,
        textDecoration: "none",
        color: "white",
        minWidth: 0,
        justifyContent: collapsed ? "center" : "flex-start",
        overflow: "hidden",
      }}
      title={userLabel}
    >
      <div
        style={{
          height: 40,
          width: 40,
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
          background: "rgba(255,255,255,0.06)",
          display: "grid",
          placeItems: "center",
          flex: "0 0 auto",
          fontWeight: 950,
          letterSpacing: -0.2,
          color: "rgba(255,255,255,0.90)",
        }}
      >
        {collapsed ? initials : <UserIcon size={18} />}
      </div>

      {!collapsed ? (
        <div style={{ lineHeight: 1.1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 950,
              letterSpacing: -0.2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {userLabel}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 800 }}>
            Operação • Produção
          </div>
        </div>
      ) : null}
    </Link>
  );
}

function AppShell() {
  const { logout, user, token, loading } = useAuth() as any;
  const navigate = useNavigate();
  const location = useLocation();
  const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";
  const role = useMemo(() => getUserRole(user), [user]);
  const isGestaoVistaUser = role === "gestao_vista";
  const isDev = role === "dev";
  const userLabel = useMemo(() => getUserDisplay(user), [user]);

  // =========================
  // Aviso global (modal) — aparece em qualquer página até confirmar leitura
  // =========================
  type ActiveNotice = {
    id: string;
    title?: string | null;
    message?: string | null;
    created_at?: string | null;
    created_by_name?: string | null;
    author?: string | null;
    is_read?: boolean | null;
    read_at?: string | null;
  };

  const [activeNotices, setActiveNotices] = React.useState<ActiveNotice[]>([]);
  const [noticeModal, setNoticeModal] = React.useState<ActiveNotice | null>(null);
  const [noticeBusy, setNoticeBusy] = React.useState(false);
  const [noticeErr, setNoticeErr] = React.useState<string | null>(null);
  const [temAvisoSupervisor, setTemAvisoSupervisor] = React.useState(false);

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    backdropFilter: "blur(6px)",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  };

  const modalStyle: React.CSSProperties = {
    width: "min(720px, 96vw)",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "linear-gradient(180deg, rgba(17,24,39,0.92), rgba(2,6,23,0.92))",
    boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
    overflow: "hidden",
  };

  const modalHeader: React.CSSProperties = {
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  };

  const modalBody: React.CSSProperties = {
    padding: 16,
    display: "grid",
    gap: 12,
  };

  const modalBtn: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  };

  const modalBtnPrimary: React.CSSProperties = {
    ...modalBtn,
    background: "linear-gradient(180deg, rgba(16,185,129,0.28), rgba(16,185,129,0.12))",
    border: "1px solid rgba(16,185,129,0.35)",
  };

  const pickFirstUnread = (rows: ActiveNotice[]) => {
    const unread = rows.find((n) => !(n?.is_read) && !n?.read_at);
    return unread || null;
  };

  const loadActiveNotices = React.useCallback(async () => {
    if (!token || isGestaoVistaUser) return;
    try {
      setNoticeErr(null);
      const r = await fetch(`${API_BASE}/api/notices/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return;
      const data = await r.json();
      const rows: ActiveNotice[] = Array.isArray(data) ? data : (data?.items || []);
      setActiveNotices(rows);
      const next = pickFirstUnread(rows);
      if (next) setNoticeModal(next);
    } catch (e: any) {
      // não quebra o app
      return;
    }
  }, [API_BASE, token, isGestaoVistaUser]);

  const confirmNotice = React.useCallback(async () => {
    if (!token || !noticeModal?.id) return;
    setNoticeBusy(true);
    setNoticeErr(null);
    try {
      const r = await fetch(`${API_BASE}/api/notices/${noticeModal.id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        setNoticeErr(txt || `Erro ao confirmar (${r.status})`);
        return;
      }
      // remove do modal e recarrega lista (para pegar próximo)
      setNoticeModal(null);
      await loadActiveNotices();
    } finally {
      setNoticeBusy(false);
    }
  }, [API_BASE, token, noticeModal, loadActiveNotices]);

  const loadAvisosSupervisorUnread = React.useCallback(async () => {
    if (!token || isGestaoVistaUser) {
      setTemAvisoSupervisor(false);
      return;
    }

    try {
      const r = await fetch(`${API_BASE}/api/avisos-supervisor/unread`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!r.ok) {
        setTemAvisoSupervisor(false);
        return;
      }

      const data = await r.json().catch(() => ({}));
      const unread = Number(data?.unread ?? data?.count ?? 0);
      setTemAvisoSupervisor(unread > 0);
    } catch {
      setTemAvisoSupervisor(false);
    }
  }, [API_BASE, token, isGestaoVistaUser]);

  React.useEffect(() => {
    if (!token || isGestaoVistaUser) {
      setTemAvisoSupervisor(false);
      return;
    }

    loadAvisosSupervisorUnread();
    const interval = window.setInterval(loadAvisosSupervisorUnread, 10000);

    return () => window.clearInterval(interval);
  }, [token, isGestaoVistaUser, loadAvisosSupervisorUnread, location.pathname]);


  const [mobileOpen, setMobileOpen] = useState(false);
  const [sideCollapsed, setSideCollapsed] = useState(false);

  const pageTitle = useMemo(() => getTitleFromPath(location.pathname), [location.pathname]);
  const pageGroup = useMemo(() => getGroupFromPath(location.pathname), [location.pathname]);
  // ⏳ enquanto hidrata, evita renderizar shell parcial (que causa "piscar")

  React.useEffect(() => {
    if (loading) return;
    if (!user) return;

    const target = defaultPathFor(role);

    // Gestão à Vista é perfil de tela única. Se cair em qualquer outra rota, volta imediatamente.
    if (role === "gestao_vista") {
      const current = location.pathname;
      const isTarget = current === target || current.startsWith(target + "/");
      if (!isTarget) {
        navigate(target, { replace: true });
      }
      return;
    }

    if (!canAccessMonPlantPath(role, location.pathname)) {
      navigate(target, { replace: true });
    }
  }, [loading, user, role, location.pathname, navigate]);

  React.useEffect(() => {
    if (!token || isGestaoVistaUser) return;
    loadActiveNotices();
    const interval = window.setInterval(loadActiveNotices, 60000);
    return () => window.clearInterval(interval);
  }, [token, isGestaoVistaUser, loadActiveNotices]);



  const navItems = useMemo(() => {
    return nav.filter((i) => {
      if (i.devOnly && !isDev) return false;
      return canAccessMonPlantPath(role, i.to);
    });
  }, [isDev, role]);
  const navItemsFiltered = navItems;
  const gestaoVistaPath = "/dashboard/gestao-vista-planta";
  const sidebarNavItems = isGestaoVistaUser
    ? navItemsFiltered
    : navItemsFiltered.filter((item) => item.to !== gestaoVistaPath);
  const canAccessGestaoVista = !isGestaoVistaUser && navItemsFiltered.some((item) => item.to === gestaoVistaPath);
  const isGestaoVistaActive = location.pathname.startsWith(gestaoVistaPath);

  const handleLogout = () => {
    logout?.();
    navigate("/login");
  };

  if (!loading && user && isGestaoVistaUser) {
    const target = defaultPathFor(role);
    const current = location.pathname;
    const isTarget = current === target || current.startsWith(target + "/");
    if (!isTarget) return null;
  }

  const sideW = sideCollapsed ? 86 : 300;

  const cardGlass: React.CSSProperties = {
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(14,18,22,0.78)",
    boxShadow: "0 30px 60px rgba(0,0,0,0.55)",
    backdropFilter: "blur(14px)",
  };

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#0B0F14" }}>
      {/* ===== Fundo base liso ===== */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background: "#0B0F14",
        }}
      />

      <style>{`
        .mp-navlink-active {
          border-color: rgba(255,159,26,.22) !important;
          background: rgba(255,159,26,.08) !important;
        }

        @media (min-width: 980px) {
          .mp-sidebar-desktop { display: block !important; }
          .mp-mobile-fab { display: none !important; }
        }
        @media (max-width: 979px) {
          .mp-sidebar-desktop { display: none !important; }
          .mp-mobile-fab { display: grid !important; }
        }
      `}</style>

      <div
        className="mp-shell"
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          minHeight: "100vh",
        }}
      >
        {/* ===== Sidebar DESKTOP (colapsável) ===== */}
        <aside
          style={{
            width: sideW,
            display: "none",
            padding: "8px 10px 8px 8px",
            background: "rgba(5,8,12,0.98)",
            borderRight: "1px solid rgba(255,255,255,0.06)",
            position: "sticky",
            top: 0,
            height: "100vh",
            transition: "width .16s ease",
            boxShadow: "inset -1px 0 0 rgba(255,255,255,0.03)",
          }}
          className="mp-sidebar-desktop"
        >
          <div
            style={{
              height: "calc(100vh - 16px)",
              padding: sideCollapsed ? "10px 6px 10px 6px" : "12px 10px 10px 10px",
              display: "flex",
              flexDirection: "column",
              overflow: "visible",
              minHeight: 0,
              borderRadius: 0,
              background: "transparent",
            }}
          >
            {/* topo sidebar: usuário + toggle */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flex: "0 0 auto",
                minHeight: 84,
              }}
            >
              <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: sideCollapsed ? "center" : "flex-start",
                minWidth: 0,
                paddingLeft: sideCollapsed ? 0 : 10,
              }}
            >
              <img
                src="/assets/logo-trindade.png"
                alt="Trindade"
                style={{
                  height: sideCollapsed ? 42 : 80,
                  width: sideCollapsed ? 42 : 170,
                  objectFit: "contain",
                  objectPosition: "left center",
                  display: "block",
                  margin: sideCollapsed ? "0 auto" : "0",
                  filter: "drop-shadow(0 12px 28px rgba(0,0,0,0.6))",
                }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </div>

              <button
                onClick={() => setSideCollapsed((v) => !v)}
                aria-label={sideCollapsed ? "Expandir menu" : "Minimizar menu"}
                title={sideCollapsed ? "Expandir" : "Minimizar"}
                style={{
                  height: 42,
                  width: 42,
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  cursor: "pointer",
                  color: "white",
                  display: "grid",
                  placeItems: "center",
                  flex: "0 0 auto",
                }}
              >
                {sideCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
              </button>
            </div>

            {!sideCollapsed ? (
              <div
                style={{
                  marginTop: 12,
                  marginBottom: 12,
                  height: 1,
                  background: "linear-gradient(90deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04))",
                  boxShadow: "0 1px 0 rgba(255,255,255,0.03)",
                  flex: "0 0 auto",
                }}
              />
            ) : (
              <div style={{ marginTop: 10, marginBottom: 8, height: 1, background: "rgba(255,255,255,0.06)" }} />
            )}

            {/* Área rolável do menu */}
            <div style={{ marginTop: 10, flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
              <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sidebarNavItems.map((i) => {
                  const Icon = i.icon;

                  if (sideCollapsed) {
                    return (
                      <NavLink
                        key={i.to}
                        to={i.to}
                        className={({ isActive }) => (isActive ? "mp-navlink-active" : "")}
                        title={i.label}
                        style={({ isActive }) => ({
                          height: 52,
                          borderRadius: 16,
                          border: "1px solid " + (isActive ? "rgba(255,159,26,.18)" : "transparent"),
                          background: isActive ? "rgba(255,159,26,.08)" : "transparent",
                          textDecoration: "none",
                          color: "white",
                          display: "grid",
                          placeItems: "center",
                          overflow: "hidden",
                          flex: "0 0 auto",
                        })}
                      >
                        <span
                          style={{
                            position: "relative",
                            height: 40,
                            width: 40,
                            borderRadius: 14,
                            display: "grid",
                            placeItems: "center",
                            background: "rgba(255,255,255,.06)",
                            border: "1px solid rgba(255,255,255,.10)",
                          }}
                        >
                          <Icon size={18} />
                          {i.to === "/avisos" && temAvisoSupervisor ? <NotificationDot size={11} /> : null}
                        </span>
                      </NavLink>
                    );
                  }

                  return (
                    <NavLink
                      key={i.to}
                      to={i.to}
                      className={({ isActive }) => (isActive ? "mp-navlink-active" : "")}
                      style={({ isActive }) => ({
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 10px",
                        borderRadius: 14,
                        border: "1px solid " + (isActive ? "rgba(255,159,26,.18)" : "transparent"),
                        background: isActive ? "rgba(255,159,26,.08)" : "transparent",
                        textDecoration: "none",
                        color: "white",
                        overflow: "hidden",
                        flex: "0 0 auto",
                      })}
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            style={{
                              position: "relative",
                              height: 36,
                              width: 36,
                              borderRadius: 12,
                              display: "grid",
                              placeItems: "center",
                              background: isActive ? "rgba(255,159,26,.12)" : "rgba(255,255,255,.06)",
                              border:
                                "1px solid " +
                                (isActive ? "rgba(255,159,26,.20)" : "rgba(255,255,255,.10)"),
                              flex: "0 0 auto",
                            }}
                          >
                            <Icon size={18} />
                            {i.to === "/avisos" && temAvisoSupervisor ? <NotificationDot size={10} /> : null}
                          </span>
                          <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                            <div
                              style={{
                                fontWeight: 900,
                                color: "rgba(255,255,255,.92)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {i.label}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 850,
                                color: "rgba(255,255,255,.45)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {i.group || "—"}
                            </div>
                          </div>
                          <ChevronRight size={16} style={{ opacity: isActive ? 0.9 : 0.35, flex: "0 0 auto" }} />
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </nav>
            </div>

            {/* Rodapé */}
            <div
              style={{
                marginTop: 12,
                borderTop: "1px solid rgba(255,255,255,0.10)",
                paddingTop: 12,
                flex: "0 0 auto",
              }}
            >
              <button
                onClick={handleLogout}
                style={{
                  width: "100%",
                  height: 42,
                  borderRadius: 14,
                  border: "1px solid rgba(251,113,133,0.30)",
                  background: "rgba(251,113,133,0.14)",
                  fontWeight: 950,
                  cursor: "pointer",
                  color: "white",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
                title="Sair"
              >
                <LogOut size={18} /> {!sideCollapsed ? "Sair" : null}
              </button>

              {!sideCollapsed ? (
                <div style={{ marginTop: 10, fontSize: 12, fontWeight: 850, color: "rgba(255,255,255,.45)" }}>
                  v1
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        {/* ===== Mobile Drawer ===== */}
        {mobileOpen ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 120,
              background: "rgba(0,0,0,.55)",
              backdropFilter: "blur(6px)",
            }}
            onClick={() => setMobileOpen(false)}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                width: "min(320px, 88vw)",
                background: "rgba(5,8,12,0.98)",
                borderRight: "1px solid rgba(255,255,255,0.06)",
                boxShadow: "none",
                padding: 14,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <ShellUser to={defaultPathFor(role)} onClick={() => setMobileOpen(false)} userLabel={userLabel} />
                  <button
                    onClick={() => setMobileOpen(false)}
                    style={{
                      height: 42,
                      width: 42,
                      borderRadius: 14,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      cursor: "pointer",
                      color: "white",
                      display: "grid",
                      placeItems: "center",
                    }}
                    aria-label="Fechar menu"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div
                  style={{
                    marginTop: 12,
                    marginBottom: 12,
                    height: 1,
                    background: "linear-gradient(90deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04))",
                    boxShadow: "0 1px 0 rgba(255,255,255,0.03)",
                    flex: "0 0 auto",
                  }}
                />

                <div
                  style={{
                    marginTop: 4,
                    padding: "0 10px",
                    fontSize: 11,
                    fontWeight: 950,
                    letterSpacing: 1,
                    color: "rgba(255,255,255,.40)",
                    textTransform: "uppercase",
                  }}
                >
                  Menu
                </div>

                <div style={{ marginTop: 10, flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
                  <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sidebarNavItems.map((i) => {
                    const Icon = i.icon;
                    return (
                      <NavLink
                        key={i.to}
                        to={i.to}
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive }) => (isActive ? "mp-navlink-active" : "")}
                        style={({ isActive }) => ({
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 10px",
                          borderRadius: 14,
                          border: "1px solid " + (isActive ? "rgba(255,159,26,.18)" : "transparent"),
                          background: isActive ? "rgba(255,159,26,.08)" : "transparent",
                          textDecoration: "none",
                          color: "white",
                        })}
                      >
                        <span
                          style={{
                            position: "relative",
                            height: 36,
                            width: 36,
                            borderRadius: 12,
                            display: "grid",
                            placeItems: "center",
                            background: "rgba(255,255,255,.06)",
                            border: "1px solid rgba(255,255,255,.10)",
                          }}
                        >
                          <Icon size={18} />
                          {i.to === "/avisos" && temAvisoSupervisor ? <NotificationDot size={10} /> : null}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 900, color: "rgba(255,255,255,.92)" }}>{i.label}</div>
                          <div style={{ fontSize: 11, fontWeight: 850, color: "rgba(255,255,255,.45)" }}>
                            {i.group || "—"}
                          </div>
                        </div>
                      </NavLink>
                    );
                  })}
                  </nav>
                </div>

                <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.10)", paddingTop: 12, flex: "0 0 auto" }}>
                  <button
                    onClick={handleLogout}
                    style={{
                      width: "100%",
                      height: 42,
                      borderRadius: 14,
                      border: "1px solid rgba(251,113,133,0.30)",
                      background: "rgba(251,113,133,0.14)",
                      fontWeight: 950,
                      cursor: "pointer",
                      color: "white",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    <LogOut size={18} /> Sair
                  </button>

                  <div style={{ marginTop: 10, fontSize: 12, fontWeight: 850, color: "rgba(255,255,255,.45)" }}>
                    v1
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* ===== Main ===== */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {/* Mobile FAB */}
          <button
            onClick={() => setMobileOpen(true)}
            className="mp-mobile-fab"
            aria-label="Abrir menu"
            title="Menu"
            style={{
              position: "fixed",
              top: 14,
              left: 14,
              zIndex: 90,
              height: 44,
              width: 44,
              borderRadius: 16,
              background: "rgba(11,15,20,0.78)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "white",
              display: "none",
              placeItems: "center",
              backdropFilter: "blur(12px)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
              cursor: "pointer",
            }}
          >
            <Menu size={18} />
          </button>

          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 40,
              padding: 0,
              background: "#0B0F14",
              backdropFilter: "none",
            }}
          >
            <div
              style={{
                minHeight: 54,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 18px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                borderRight: "1px solid rgba(255,255,255,0.03)",
                background: "#0B0F14",
                boxShadow: "none",
              }}
            >
              <div
                style={{
                  minWidth: 0,
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "rgba(255,255,255,0.92)",
                  fontSize: 14,
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {pageGroup ? (
                  <>
                    <span style={{ color: "rgba(255,255,255,0.62)", fontWeight: 800 }}>{pageGroup}</span>
                    <span style={{ color: "rgba(255,255,255,0.28)" }}>•</span>
                  </>
                ) : null}
                <span>{pageTitle}</span>
              </div>

              <div style={{ flex: "0 0 auto", display: "flex", justifyContent: "center" }}>
                {canAccessGestaoVista ? (
                  <button
                    onClick={() => navigate(gestaoVistaPath)}
                    title="Gestão à Vista"
                    aria-label="Gestão à Vista"
                    style={{
                      height: 40,
                      minWidth: 40,
                      padding: "0 12px",
                      borderRadius: 999,
                      border: "1px solid " + (isGestaoVistaActive ? "rgba(255,159,26,.24)" : "rgba(255,255,255,0.10)"),
                      background: isGestaoVistaActive ? "rgba(255,159,26,.12)" : "rgba(255,255,255,0.05)",
                      color: isGestaoVistaActive ? "rgb(255, 176, 58)" : "white",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      cursor: "pointer",
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Eye size={18} />
                    <span style={{ fontSize: 12 }}>Gestão à Vista</span>
                  </button>
                ) : null}
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, flex: 1, minWidth: 0 }}>
                {!isGestaoVistaUser ? (
                <button
                  onClick={() => navigate("/configuracoes")}
                  title="Configurações"
                  aria-label="Configurações"
                  style={{
                    height: 36,
                    width: 36,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.05)",
                    color: "white",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    flex: "0 0 auto",
                  }}
                >
                  <Settings size={18} />
                </button>
                ) : null}

                <div
                  style={{
                    minWidth: 0,
                    padding: "7px 12px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.05)",
                    color: "rgba(255,255,255,0.88)",
                    fontSize: 12,
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    flex: "0 1 260px",
                  }}
                  title={userLabel}
                >
                  {userLabel}
                </div>
              </div>
            </div>
          </div>

          <main
            style={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              padding: "14px 14px 16px 14px",
              overflow: "hidden",
            }}
          >
            <Outlet />
          </main>
        </div>
      </div>
    
      {noticeModal && (
        <div style={overlayStyle} aria-modal="true" role="dialog">
          <div style={modalStyle}>
            <div style={modalHeader}>
              <div style={{ display: "grid", gap: 2 }}>
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 700 }}>
                  Comunicação oficial • Supervisor
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.2 }}>
                  {noticeModal.title || "Aviso"}
                </div>
              </div>

              {/* sem botão de fechar: fica até confirmar */}
            </div>

            <div style={modalBody}>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.45,
                  fontSize: 14,
                  opacity: 0.95,
                }}
              >
                {noticeModal.message || ""}
              </div>

              {noticeErr && (
                <div
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid rgba(239,68,68,0.35)",
                    background: "rgba(239,68,68,0.10)",
                    color: "rgba(255,255,255,0.92)",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {noticeErr}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  style={noticeBusy ? { ...modalBtnPrimary, opacity: 0.6, cursor: "not-allowed" } : modalBtnPrimary}
                  disabled={noticeBusy}
                  onClick={confirmNotice}
                >
                  {noticeBusy ? "Confirmando..." : "Confirmar leitura"}
                </button>
              </div>

              <div style={{ fontSize: 12, opacity: 0.6 }}>
                Este aviso ficará na tela até você confirmar.
              </div>
            </div>
          </div>
        </div>
      )}
</div>
  );
}

export default AppShell;
