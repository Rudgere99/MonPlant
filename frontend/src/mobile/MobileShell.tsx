// src/mobile/MobileShell.tsx
import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

type Tab = "dashboard" | "production" | "ritmo" | "stats" | "ufdf";

export default function MobileShell({
  title,
  subtitle,
  active,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  active: Tab;
  children: ReactNode;
  right?: ReactNode;
}) {
  const loc = useLocation();
  const nav = useNavigate();

  const goBack = () => {
    // se quiser sempre voltar pro dashboard mobile:
    if (loc.pathname.startsWith("/m")) nav("/m/dashboard");
    else nav(-1);
  };

  return (
    <div className="mp-root">
      <div className="mp-top">
        <button className="mp-icon-btn" onClick={goBack} type="button" aria-label="Voltar">
          ←
        </button>

        <div className="mp-top-title">
          <div className="mp-top-h1">{title}</div>
          {subtitle ? <div className="mp-top-sub">{subtitle}</div> : null}
        </div>

        <div className="mp-top-right">{right}</div>
      </div>

      <div className="mp-content">{children}</div>

      <nav className="mp-bottom">
        <Link className={`mp-tab ${active === "dashboard" ? "is-active" : ""}`} to="/m/dashboard">
          Dashboard
        </Link>
        <Link className={`mp-tab ${active === "production" ? "is-active" : ""}`} to="/m/production">
          Produção
        </Link>
        <Link className={`mp-tab ${active === "ritmo" ? "is-active" : ""}`} to="/m/ritmo">
          Ritmo
        </Link>
        <Link className={`mp-tab ${active === "stats" ? "is-active" : ""}`} to="/m/stats">
          Stats
        </Link>
        <Link className={`mp-tab ${active === "ufdf" ? "is-active" : ""}`} to="/m/ufdf">
          UF/DF
        </Link>
      </nav>
    </div>
  );
}
