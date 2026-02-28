import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, LayoutGrid, LogOut, BarChart3, Activity, PieChart, Gauge } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

type TabKey = "production" | "dashboard" | "ritmo" | "stats" | "ufdf";

export default function MobileShell({
  title,
  active = "production",
  children,
}: {
  title: string;
  active?: TabKey;
  children: ReactNode;
}) {
  const nav = useNavigate();
  const loc = useLocation();
  const { logout } = useAuth();

  const canGoBack = loc.pathname !== "/m/production";

  const Tab = ({ k, label, icon, to }: { k: TabKey; label: string; icon: ReactNode; to: string }) => (
    <button
      onClick={() => nav(to)}
      style={{
        flex: 1,
        borderRadius: 16,
        border: "1px solid rgba(148,163,184,0.14)",
        background: k === active ? "rgba(56,189,248,0.12)" : "rgba(2,6,23,0.35)",
        padding: "10px 10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        color: "rgba(226,232,240,0.92)",
        fontWeight: 900,
      }}
      aria-current={k === active ? "page" : undefined}
      type="button"
    >
      {icon}
      <span style={{ fontSize: 12 }}>{label}</span>
    </button>
  );

  return (
    <div className="mp-container" style={{ paddingTop: 12, paddingBottom: 92 }}>
      <div className="mp-card mp-top" style={{ borderRadius: 18, padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            className="mp-btn"
            style={{ padding: 10, width: 42, height: 42, borderRadius: 14 }}
            onClick={() => (canGoBack ? nav(-1) : nav("/m/production"))}
            aria-label="Voltar"
            type="button"
          >
            <ArrowLeft size={18} />
          </button>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 950, fontSize: 16, letterSpacing: "-0.02em" }}>{title}</div>
            <div className="mp-muted mp-small" style={{ marginTop: 2 }}>
              Modo Mobile • Produção
            </div>
          </div>

          <button
            className="mp-btn"
            style={{ padding: 10, width: 42, height: 42, borderRadius: 14 }}
            onClick={() => nav("/dashboard")}
            aria-label="Abrir Desktop"
            title="Abrir Desktop"
            type="button"
          >
            <LayoutGrid size={18} />
          </button>

          <button
            className="mp-btn danger"
            style={{ padding: 10, width: 42, height: 42, borderRadius: 14 }}
            onClick={() => logout?.()}
            aria-label="Sair"
            title="Sair"
            type="button"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>{children}</div>

      <div style={{ position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 60 }}>
        <div className="mp-card" style={{ borderRadius: 20, padding: 10, display: "flex", gap: 10 }}>
          <Tab k="production" label="Produção" icon={<BarChart3 size={16} />} to="/m/production" />
          <Tab k="ritmo" label="Ritmo" icon={<Activity size={16} />} to="/m/ritmo" />
          <Tab k="stats" label="Stats" icon={<PieChart size={16} />} to="/m/stats" />
          <Tab k="ufdf" label="UF/DF" icon={<Gauge size={16} />} to="/m/ufdf" />
          <Tab k="dashboard" label="Dash" icon={<BarChart3 size={16} />} to="/m/dashboard" />
        </div>
      </div>
    </div>
  );
}
