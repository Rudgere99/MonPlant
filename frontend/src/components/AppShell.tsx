import React, { useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  LayoutDashboard,
  Code2,
  Factory,
  Timer,
  PauseCircle,
  FileSpreadsheet,
  LogOut,
  Menu,
  X,
  Search,
  ChevronRight,
} from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<any>;
  group: string;
};

const nav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Visão geral" },

  // ✅ DEV DASH (PlantProductionDayView)
  { to: "/dashboard/producao-dia", label: "Dev Dash", icon: Code2, group: "Desenvolvimento" },

  { to: "/producao-planta", label: "Produção da Planta", icon: Factory, group: "Produção" },
  { to: "/horimetros", label: "Horímetros", icon: Timer, group: "Operação" },
  { to: "/paradas", label: "Paradas", icon: PauseCircle, group: "Operação" },
  { to: "/exportar", label: "Exportar Excel", icon: FileSpreadsheet, group: "Utilitários" },
];

function cn(...cls: (string | false | null | undefined)[]) {
  return cls.filter(Boolean).join(" ");
}

function ShellLogo({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      to="/dashboard"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        textDecoration: "none",
        color: "white",
        minWidth: 0,
      }}
    >
      <div
        style={{
          height: 40,
          width: 40,
          borderRadius: 14,
          display: "grid",
          placeItems: "center",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.6)",
          fontWeight: 900,
          letterSpacing: -0.02,
        }}
      >
        MP
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 950, letterSpacing: -0.02, lineHeight: 1.05 }}>MonPlant</div>
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 700, lineHeight: 1.05 }}>
          Operação • Produção
        </div>
      </div>
    </Link>
  );
}

function ShellSearch() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: 44,
        borderRadius: 16,
        padding: "0 14px",
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.22)",
        color: "rgba(255,255,255,0.55)",
      }}
    >
      <Search size={18} />
      <input
        placeholder="Search here..."
        style={{
          flex: 1,
          outline: "none",
          border: "none",
          background: "transparent",
          color: "rgba(255,255,255,0.82)",
          fontWeight: 800,
        }}
      />
    </div>
  );
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "14px 12px 8px",
        color: "rgba(255,255,255,0.40)",
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: 0.04,
      }}
    >
      {children}
    </div>
  );
}

function NavItemRow({
  item,
  collapsed,
  onClick,
}: {
  item: NavItem;
  collapsed?: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={item.to}
      onClick={onClick}
      className={({ isActive }) => cn("mp-navitem", isActive && "mp-navitem-active")}
      style={({ isActive }) => ({
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 12px",
        borderRadius: 18,
        textDecoration: "none",
        color: "rgba(255,255,255,0.88)",
        border: isActive ? "1px solid rgba(245,158,11,0.35)" : "1px solid rgba(255,255,255,0.08)",
        background: isActive
          ? "linear-gradient(180deg, rgba(245,158,11,0.18), rgba(245,158,11,0.08))"
          : "rgba(0,0,0,0.14)",
        boxShadow: isActive ? "0 18px 50px rgba(0,0,0,0.55)" : "0 10px 35px rgba(0,0,0,0.35)",
        transition: "transform .15s ease, border-color .15s ease, background .15s ease",
        minWidth: 0,
      })}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 16,
          display: "grid",
          placeItems: "center",
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.04)",
          flex: "0 0 auto",
        }}
      >
        <item.icon size={20} />
      </div>

      {!collapsed && (
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 950, letterSpacing: -0.02, lineHeight: 1.1 }}>{item.label}</div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: 800, lineHeight: 1.1 }}>
            {item.group}
          </div>
        </div>
      )}

      {!collapsed && (
        <div style={{ color: "rgba(255,255,255,0.35)", flex: "0 0 auto" }}>
          <ChevronRight size={18} />
        </div>
      )}
    </NavLink>
  );
}

export default function AppShell() {
  const { pathname } = useLocation();
  const navg = useNavigate();
  const { logout } = useAuth();

  const [mobileOpen, setMobileOpen] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const it of nav) {
      if (!map.has(it.group)) map.set(it.group, []);
      map.get(it.group)!.push(it);
    }
    return Array.from(map.entries());
  }, []);

  function doLogout() {
    logout();
    navg("/login");
  }

  const Sidebar = ({ mobile }: { mobile?: boolean }) => (
    <aside
      style={{
        width: 320,
        maxWidth: "86vw",
        height: "100%",
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        borderRadius: mobile ? 0 : 26,
        background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 20px 70px rgba(0,0,0,0.6)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <ShellLogo onClick={() => mobile && setMobileOpen(false)} />
        {mobile ? (
          <button className="mp-btn" style={{ height: 40, width: 40, padding: 0 }} onClick={() => setMobileOpen(false)}>
            <X />
          </button>
        ) : null}
      </div>

      <ShellSearch />

      <div style={{ overflow: "auto", paddingRight: 4, marginTop: 6 }}>
        {grouped.map(([group, items]) => (
          <div key={group} style={{ marginBottom: 10 }}>
            <GroupTitle>MENU</GroupTitle>

            <div style={{ display: "grid", gap: 10 }}>
              {items.map((it) => (
                <NavItemRow key={it.to} item={it} onClick={() => mobile && setMobileOpen(false)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "auto", display: "grid", gap: 10 }}>
        <button
          className="mp-btn"
          onClick={doLogout}
          style={{
            height: 46,
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <LogOut size={18} />
          <span style={{ fontWeight: 900 }}>Sair</span>
        </button>
      </div>
    </aside>
  );

  return (
    <div className="mp-shell">
      {/* Desktop */}
      <div className="mp-shell-side">{Sidebar({ mobile: false })}</div>

      {/* Mobile Topbar */}
      <div className="mp-shell-topbar">
        <button className="mp-btn" style={{ height: 42, width: 42, padding: 0 }} onClick={() => setMobileOpen(true)}>
          <Menu />
        </button>
        <div style={{ fontWeight: 950, letterSpacing: -0.02 }}>MonPlant</div>
        <div style={{ width: 42 }} />
      </div>

      {/* Mobile Drawer */}
      {mobileOpen ? (
        <div
          className="mp-shell-drawer"
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            background: "rgba(0,0,0,0.55)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 320,
              maxWidth: "86vw",
            }}
          >
            {Sidebar({ mobile: true })}
          </div>
        </div>
      ) : null}

      {/* Content */}
      <main className="mp-shell-main">
        <Outlet />
      </main>
    </div>
  );
}
