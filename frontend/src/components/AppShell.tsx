import React, { useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  LayoutDashboard,
  BarChart3,
  Code2,
  Factory,
  Timer,
  PauseCircle,
  Calculator,
  FileSpreadsheet,
  Logs,
  Users,
  LogOut,
  Menu,
  X,
  Search,
  ChevronRight,
  History,
  ChevronsLeft,
  ChevronsRight,
  User as UserIcon,
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

  // ===== DEV =====
  { to: "/dashboard/producao-dia", label: "Dev Dash", icon: Code2, group: "Desenvolvimento", devOnly: true },
  { to: "/dev/users", label: "Usuários", icon: Users, group: "Desenvolvimento", devOnly: true },
  { to: "/dev/logs", label: "Logs", icon: Logs, group: "Desenvolvimento", devOnly: true },

  // ===== APP =====
  { to: "/producao-planta", label: "Produção da Planta", icon: Factory, group: "Produção" },
  { to: "/horimetros", label: "Horímetros", icon: Timer, group: "Operação" },
  { to: "/paradas", label: "Paradas", icon: PauseCircle, group: "Operação" },

  // ✅ Ritmo (Necessário vs Real) — usa tonelada por conchada manual, resto automático
  { to: "/ritmo", label: "Ritmo do turno", icon: Calculator, group: "Produção" },

  // ✅ NOVO
  { to: "/lancamento-paradas", label: "Lançamento de Paradas", icon: FileSpreadsheet, group: "Operação" },

  { to: "/historico", label: "Histórico", icon: History, group: "Operação" },
  { to: "/statisticas", label: "Estatísticas", icon: BarChart3, group: "Configurações" },
  { to: "/metas", label: "Metas do mês", icon: FileSpreadsheet, group: "Configurações" },
  { to: "/exportar", label: "Exportar Excel", icon: FileSpreadsheet, group: "Utilitários" },
];

type UserRole = "apontador" | "controlador" | "dev";

function getRole(user: any, devKey: string | null): UserRole {
  if (devKey === "RAG2026") return "dev";
  const t = String(user?.user_type || "").toLowerCase();
  if (t === "dev") return "dev";
  if (t === "controlador") return "controlador";
  return "apontador";
}

function canAccess(role: UserRole, path: string) {
  if (role === "dev") return true;
  if (path.startsWith("/dev") || path.startsWith("/dashboard/producao-dia")) return false;

  if (role === "apontador") {
    return (
      path.startsWith("/producao-planta") ||
      path.startsWith("/paradas") ||
      path.startsWith("/ritmo") ||
      path.startsWith("/lancamento-paradas")
    );
  }
  return true;
}

function defaultPathFor(role: UserRole) {
  return role === "apontador" ? "/producao-planta" : "/dashboard";
}

function getTitleFromPath(pathname: string) {
  const hit = nav.find((n) => pathname.startsWith(n.to));
  return hit?.label ?? "Dashboard";
}

function getGroupFromPath(pathname: string) {
  const hit = nav.find((n) => pathname.startsWith(n.to));
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
  const { logout, user } = useAuth() as any;
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [sideCollapsed, setSideCollapsed] = useState(false);

  const pageTitle = useMemo(() => getTitleFromPath(location.pathname), [location.pathname]);
  const pageGroup = useMemo(() => getGroupFromPath(location.pathname), [location.pathname]);

  const devKey = (() => {
    try {
      return localStorage.getItem("mp_dev_key");
    } catch {
      return null;
    }
  })();

  const role = useMemo(() => getRole(user, devKey), [user, devKey]);
  const isDev = role === "dev";
  const userLabel = useMemo(() => getUserDisplay(user), [user]);

  const filteredNav = useMemo(() => {
    return nav.filter((i) => {
      if (i.devOnly && !isDev) return false;
      return canAccess(role, i.to);
    });
  }, [isDev, role]);

  const handleLogout = () => {
    logout?.();
    navigate("/login");
  };

  const sideW = sideCollapsed ? 86 : 300;

  const cardGlass: React.CSSProperties = {
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(14,18,22,0.78)",
    boxShadow: "0 30px 60px rgba(0,0,0,0.55)",
    backdropFilter: "blur(14px)",
  };

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#07090d" }}>
      {/* ===== Fundo animado ===== */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background:
            "radial-gradient(1200px 700px at 20% 20%, rgba(255,159,26,0.12), transparent 60%)," +
            "radial-gradient(900px 600px at 80% 30%, rgba(34,197,94,0.10), transparent 55%)," +
            "radial-gradient(900px 700px at 50% 90%, rgba(59,130,246,0.08), transparent 55%)",
        }}
      />
      <div
        className="mp-bg-belt-1"
        style={{
          position: "fixed",
          inset: "-20%",
          pointerEvents: "none",
          zIndex: 0,
          transform: "rotate(-10deg)",
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,.04), transparent)",
          opacity: 0.35,
          filter: "blur(0.2px)",
        }}
      />
      <div
        className="mp-bg-belt-2"
        style={{
          position: "fixed",
          inset: "-25%",
          pointerEvents: "none",
          zIndex: 0,
          transform: "rotate(-10deg)",
          background: "linear-gradient(90deg, transparent, rgba(255,159,26,.05), transparent)",
          opacity: 0.35,
          filter: "blur(0.2px)",
        }}
      />
      <div
        className="mp-bg-dust"
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          opacity: 1,
        }}
      />

      <style>{`
        @keyframes mpBeltMoveShell {
          0%   { transform: translateX(-5%) rotate(-10deg); opacity: .68; }
          50%  { transform: translateX(5%)  rotate(-10deg); opacity: .92; }
          100% { transform: translateX(-5%) rotate(-10deg); opacity: .68; }
        }
        .mp-bg-belt-1 { animation: mpBeltMoveShell 10s ease-in-out infinite; }
        .mp-bg-belt-2 { animation: mpBeltMoveShell 13s ease-in-out infinite; }

        @keyframes mpDustFloatShell {
          0%   { transform: translateY(0px); opacity: .55; }
          50%  { transform: translateY(-8px); opacity: .78; }
          100% { transform: translateY(0px); opacity: .55; }
        }
        .mp-bg-dust {
          background-image:
            radial-gradient(2px 2px at 12% 18%, rgba(255,159,26,0.26) 0, transparent 60%),
            radial-gradient(2px 2px at 28% 62%, rgba(255,255,255,0.16) 0, transparent 60%),
            radial-gradient(1.5px 1.5px at 48% 28%, rgba(255,159,26,0.20) 0, transparent 60%),
            radial-gradient(2px 2px at 66% 74%, rgba(255,255,255,0.12) 0, transparent 60%),
            radial-gradient(1.5px 1.5px at 82% 38%, rgba(255,159,26,0.18) 0, transparent 60%),
            radial-gradient(2px 2px at 92% 66%, rgba(255,255,255,0.10) 0, transparent 60%);
          background-size: 100% 100%;
          animation: mpDustFloatShell 7s ease-in-out infinite;
          filter: blur(.1px);
        }

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
            padding: 14,
            background: "rgba(7,9,13,0.92)",
            borderRight: "1px solid rgba(255,255,255,0.08)",
            position: "sticky",
            top: 0,
            height: "100vh",
            transition: "width .16s ease",
          }}
          className="mp-sidebar-desktop"
        >
          <div
            style={{
              ...cardGlass,
              height: "calc(100vh - 28px)",
              padding: 4,
              display: "flex",
              flexDirection: "column",
              overflow: "visible",
              minHeight: 0,
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
                minHeight: 52,
              }}
            >
              <ShellUser to={defaultPathFor(role)} collapsed={sideCollapsed} userLabel={userLabel} />

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

            {/* search da sidebar: remover quando colapsado */}
            {!sideCollapsed ? (
              <div
                style={{
                  marginTop: 14,
                  height: 44,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.22)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "0 12px",
                  color: "rgba(255,255,255,0.70)",
                  flex: "0 0 auto",
                }}
                title="placeholder visual"
              >
                <Search size={16} />
                <input
                  value=""
                  onChange={() => {}}
                  disabled
                  placeholder="Search here."
                  style={{
                    width: "100%",
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    color: "rgba(255,255,255,0.80)",
                    fontWeight: 800,
                  }}
                />
              </div>
            ) : null}

            {!sideCollapsed ? (
              <div
                style={{
                  marginTop: 16,
                  padding: "0 10px",
                  fontSize: 11,
                  fontWeight: 950,
                  letterSpacing: 1,
                  color: "rgba(255,255,255,.40)",
                  textTransform: "uppercase",
                  flex: "0 0 auto",
                }}
              >
                Menu
              </div>
            ) : null}

            {/* Área rolável do menu */}
            <div style={{ marginTop: 10, flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
              <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {filteredNav.map((i) => {
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
                top: 14,
                left: 14,
                right: 14,
                maxWidth: 440,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ ...cardGlass, padding: 14 }}>
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
                    marginTop: 14,
                    height: 44,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.22)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "0 12px",
                    color: "rgba(255,255,255,0.70)",
                  }}
                  title="placeholder visual"
                >
                  <Search size={16} />
                  <input
                    value=""
                    onChange={() => {}}
                    disabled
                    placeholder="Search here."
                    style={{
                      width: "100%",
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      color: "rgba(255,255,255,0.80)",
                      fontWeight: 800,
                    }}
                  />
                </div>

                <div
                  style={{
                    marginTop: 16,
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

                <nav style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {filteredNav.map((i) => {
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

                <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.10)", paddingTop: 12 }}>
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

        {/* ===== Main (sem topbar) ===== */}
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

          {/* título leve */}
          <div
            style={{
              padding: "16px 14px 0 14px",
              color: "rgba(255,255,255,0.70)",
              fontSize: 12,
              fontWeight: 850,
            }}
          >
            {pageGroup ? `${pageGroup} • ` : ""}
            <span style={{ color: "rgba(255,255,255,0.92)", fontWeight: 950 }}>{pageTitle}</span>
          </div>

          <main
            style={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              padding: "12px 14px 16px 14px",
              overflow: "hidden",
            }}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

export default AppShell;
