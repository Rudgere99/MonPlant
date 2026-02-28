import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, LayoutGrid, LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

export default function MobileShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const nav = useNavigate();
  const loc = useLocation();
  const { logout } = useAuth();

  const canGoBack = loc.pathname !== "/m/production";

  return (
    <div className="mp-container" style={{ paddingTop: 12 }}>
      {/* Topbar compacta */}
      <div className="mp-card mp-top" style={{ borderRadius: 18, padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            className="mp-btn"
            style={{ padding: 10, width: 42, height: 42, borderRadius: 14 }}
            onClick={() => (canGoBack ? nav(-1) : nav("/m/production"))}
            aria-label="Voltar"
          >
            <ArrowLeft size={18} />
          </button>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 16, letterSpacing: "-0.02em" }}>
              {title}
            </div>
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
          >
            <LayoutGrid size={18} />
          </button>

          <button
            className="mp-btn danger"
            style={{ padding: 10, width: 42, height: 42, borderRadius: 14 }}
            onClick={() => logout?.()}
            aria-label="Sair"
            title="Sair"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>{children}</div>

      {/* Espaço para gesto do celular */}
      <div style={{ height: 72 }} />
    </div>
  );
}
