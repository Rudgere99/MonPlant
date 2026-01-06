import React, { useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  LayoutDashboard,
  Factory,
  Timer,
  PauseCircle,
  FileSpreadsheet,
  LogOut,
  Menu,
  X,
} from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  group?: string;
};

const nav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Visão geral" },
  { to: "/producao-planta", label: "Produção da Planta", icon: Factory, group: "Produção" },
  { to: "/horimetros", label: "Horímetros", icon: Timer, group: "Operação" },
  { to: "/paradas", label: "Paradas", icon: PauseCircle, group: "Operação" },
  { to: "/exportar", label: "Exportar Excel", icon: FileSpreadsheet, group: "Utilitários" },
];

function getTitleFromPath(pathname: string) {
  const hit = nav.find((n) => pathname.startsWith(n.to));
  return hit?.label ?? "MonPlant";
}

function getGroupFromPath(pathname: string) {
  const hit = nav.find((n) => pathname.startsWith(n.to));
  return hit?.group ?? "";
}

export function AppShell() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);

  const pageTitle = useMemo(() => getTitleFromPath(location.pathname), [location.pathname]);
  const pageGroup = useMemo(() => getGroupFromPath(location.pathname), [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0B0F14", color: "white" }}>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* ✅ SEM Sidebar fixa no desktop (removida) */}

        {/* ✅ Drawer/Overlay (abre no clique do menu) */}
        {mobileOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
            <button
              onClick={() => setMobileOpen(false)}
              style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.6)", border: "none" }}
              aria-label="Fechar menu"
            />

            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                height: "100%",
                width: 320,
                background: "#0B0F14",
                borderRight: "1px solid rgba(255,255,255,.10)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: 14,
                  borderBottom: "1px solid rgba(255,255,255,.10)",
                }}
              >
                <Link
                  to="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "white" }}
                >
                  <div
                    style={{
                      height: 38,
                      width: 38,
                      borderRadius: 14,
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(52,211,153,.16)",
                      border: "1px solid rgba(52,211,153,.22)",
                      fontWeight: 900,
                      letterSpacing: 1,
                      color: "rgba(167,243,208,.95)",
                    }}
                  >
                    MP
                  </div>
                  <div style={{ lineHeight: 1.1 }}>
                    <div style={{ fontWeight: 900 }}>MONPLANT</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)" }}>Controle de Produção</div>
                  </div>
                </Link>

                <button
                  onClick={() => setMobileOpen(false)}
                  style={{
                    height: 40,
                    width: 40,
                    borderRadius: 14,
                    background: "rgba(255,255,255,.06)",
                    border: "1px solid rgba(255,255,255,.10)",
                    cursor: "pointer",
                    color: "white",
                    display: "grid",
                    placeItems: "center",
                  }}
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: 12 }}>
                <div
                  style={{
                    padding: "0 12px",
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: 1,
                    color: "rgba(255,255,255,.40)",
                    textTransform: "uppercase",
                    marginBottom: 10,
                  }}
                >
                  Navegação
                </div>

                <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {nav.map((i) => {
                    const Icon = i.icon;
                    return (
                      <NavLink
                        key={i.to}
                        to={i.to}
                        onClick={() => setMobileOpen(false)}
                        style={({ isActive }) => ({
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 14,
                          border: "1px solid " + (isActive ? "rgba(255,255,255,.12)" : "transparent"),
                          background: isActive ? "rgba(255,255,255,.08)" : "transparent",
                          textDecoration: "none",
                        })}
                      >
                        {({ isActive }) => (
                          <>
                            {/* ✅ ícone alinhado/centralizado */}
                            <span
                              className="mp-icon"
                              style={{
                                height: 34,
                                width: 34,
                                borderRadius: 12,
                                display: "grid",
                                placeItems: "center",
                                background: isActive ? "rgba(52,211,153,.12)" : "rgba(255,255,255,.06)",
                                border: "1px solid " + (isActive ? "rgba(52,211,153,.20)" : "rgba(255,255,255,.10)"),
                              }}
                            >
                              <Icon size={18} />
                            </span>

                            <span style={{ fontWeight: 800, color: "rgba(255,255,255,.90)" }}>{i.label}</span>
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </nav>

                <div
                  style={{
                    marginTop: 12,
                    borderRadius: 18,
                    background: "rgba(255,255,255,.05)",
                    border: "1px solid rgba(255,255,255,.10)",
                    padding: 14,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: "rgba(255,255,255,.45)" }}>
                    SESSÃO
                  </div>

                  <button
                    onClick={handleLogout}
                    style={{
                      marginTop: 10,
                      width: "100%",
                      height: 38,
                      borderRadius: 14,
                      border: "1px solid rgba(251,113,133,.30)",
                      background: "rgba(251,113,133,.14)",
                      fontWeight: 900,
                      cursor: "pointer",
                      color: "white",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <LogOut size={18} /> Sair
                    </span>
                  </button>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,.40)" }}>v1 • MonPlant</div>
              </div>
            </div>
          </div>
        )}

        {/* Main */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {/* Topbar */}
          <header
            style={{
              position: "sticky",
              top: 0,
              zIndex: 40,
              borderBottom: "1px solid rgba(255,255,255,.10)",
              background: "rgba(11,15,20,.85)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
              <button
                onClick={() => setMobileOpen(true)}
                style={{
                  height: 40,
                  width: 40,
                  borderRadius: 14,
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.10)",
                  cursor: "pointer",
                  color: "white",
                  display: "grid",
                  placeItems: "center",
                }}
                aria-label="Abrir menu"
              >
                <Menu size={18} />
              </button>

              <div style={{ minWidth: 0 }}>
                {pageGroup ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                      background: "rgba(52,211,153,.14)",
                      border: "1px solid rgba(52,211,153,.18)",
                      color: "rgba(167,243,208,.95)",
                    }}
                  >
                    {pageGroup}
                  </span>
                ) : null}

                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 900,
                    marginTop: 4,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {pageTitle}
                </div>
              </div>

              <div style={{ marginLeft: "auto" }}>
                <div
                  style={{
                    borderRadius: 14,
                    padding: "8px 10px",
                    fontSize: 12,
                    color: "rgba(255,255,255,.70)",
                    border: "1px solid rgba(255,255,255,.10)",
                    background: "rgba(255,255,255,.05)",
                  }}
                >
                  v1 • MonPlant
                </div>
              </div>
            </div>
          </header>

          <main
  style={{
    position: "relative",
    flex: 1,
    minWidth: 0,
    padding: "18px 14px",
    overflow: "hidden",
  }}
>
  {/* ✅ FUNDO ANIMADO GLOBAL (MINERAÇÃO) */}
  <div
    aria-hidden
    style={{
      position: "absolute",
      inset: 0,
      zIndex: 0,
      pointerEvents: "none",
      overflow: "hidden",
    }}
  >
    {/* Base glow */}
    <div
      style={{
        position: "absolute",
        inset: "-25%",
        background:
          "radial-gradient(900px 520px at 20% 20%, rgba(52,211,153,.10), transparent 60%)," +
          "radial-gradient(700px 420px at 85% 30%, rgba(52,211,153,.07), transparent 60%)," +
          "radial-gradient(900px 520px at 60% 90%, rgba(255,255,255,.04), transparent 60%)",
      }}
    />

    {/* Grid sutil */}
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: 0.08,
        backgroundImage:
          "linear-gradient(rgba(255,255,255,.10) 1px, transparent 1px)," +
          "linear-gradient(90deg, rgba(255,255,255,.10) 1px, transparent 1px)",
        backgroundSize: "72px 72px",
        maskImage:
          "radial-gradient(600px 360px at 35% 30%, rgba(0,0,0,1), transparent 70%)",
        WebkitMaskImage:
          "radial-gradient(600px 360px at 35% 30%, rgba(0,0,0,1), transparent 70%)",
      }}
    />

    {/* Esteiras diagonais */}
    <div
      className="mp-bg-belt-1"
      style={{
        position: "absolute",
        left: "-35%",
        top: "22%",
        width: "180%",
        height: 90,
        transform: "rotate(-10deg)",
        background:
          "linear-gradient(90deg, transparent, rgba(52,211,153,.07), rgba(255,255,255,.05), rgba(52,211,153,.07), transparent)",
        borderTop: "1px solid rgba(255,255,255,.06)",
        borderBottom: "1px solid rgba(255,255,255,.06)",
      }}
    />
    <div
      className="mp-bg-belt-2"
      style={{
        position: "absolute",
        left: "-30%",
        top: "55%",
        width: "170%",
        height: 70,
        transform: "rotate(-10deg)",
        background:
          "linear-gradient(90deg, transparent, rgba(52,211,153,.06), rgba(255,255,255,.04), rgba(52,211,153,.06), transparent)",
        borderTop: "1px solid rgba(255,255,255,.05)",
        borderBottom: "1px solid rgba(255,255,255,.05)",
        opacity: 0.9,
      }}
    />

    {/* Poeira */}
    <div className="mp-bg-dust" style={{ position: "absolute", inset: 0, opacity: 0.55 }} />

    {/* vinheta */}
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(1100px 560px at 35% 35%, transparent 55%, rgba(0,0,0,.55) 100%)",
      }}
    />
  </div>

  {/* ✅ CONTEÚDO */}
  <div style={{ position: "relative", zIndex: 1 }}>
    <div className="mp-container">
      <Outlet />
    </div>
  </div>

  {/* ✅ CSS da animação global */}
  <style>{`
    @keyframes mpBeltMoveShell {
      0%   { transform: translateX(-5%) rotate(-10deg); opacity: .70; }
      50%  { transform: translateX(5%)  rotate(-10deg); opacity: .92; }
      100% { transform: translateX(-5%) rotate(-10deg); opacity: .70; }
    }
    .mp-bg-belt-1 { animation: mpBeltMoveShell 10s ease-in-out infinite; }
    .mp-bg-belt-2 { animation: mpBeltMoveShell 13s ease-in-out infinite; }

    .mp-bg-dust {
      background-image:
        radial-gradient(2px 2px at 12% 18%, rgba(52,211,153,.28) 0, transparent 60%),
        radial-gradient(2px 2px at 28% 62%, rgba(255,255,255,.18) 0, transparent 60%),
        radial-gradient(1.5px 1.5px at 48% 28%, rgba(52,211,153,.22) 0, transparent 60%),
        radial-gradient(2px 2px at 66% 74%, rgba(255,255,255,.14) 0, transparent 60%),
        radial-gradient(1.5px 1.5px at 82% 38%, rgba(52,211,153,.18) 0, transparent 60%),
        radial-gradient(2px 2px at 92% 66%, rgba(255,255,255,.12) 0, transparent 60%);
      background-size: 100% 100%;
      animation: mpDustFloatShell 7s ease-in-out infinite;
      filter: blur(.1px);
    }
    @keyframes mpDustFloatShell {
      0%   { transform: translateY(0px); opacity: .55; }
      50%  { transform: translateY(-8px); opacity: .75; }
      100% { transform: translateY(0px); opacity: .55; }
    }
  `}</style>
</main>

        </div>
      </div>
    </div>
  );
}
