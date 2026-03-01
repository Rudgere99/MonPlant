import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

type Tab = "dashboard" | "ritmo" | "stats" | "ufdf";

function doLogout() {
  // remove tokens used in MonPlant (compat com variações)
  const keys = [
    "token",
    "mp_token",
    "auth_token",
    "access_token",
    "user",
    "mp_user",
  ];
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
  try {
    sessionStorage.clear();
  } catch {}
}

export default function MobileShell({
  title,
  subtitle,
  active,
  children,
  right,
  showLogout = true,
}: {
  title: string;
  subtitle?: string;
  active: Tab;
  children: ReactNode;
  right?: ReactNode;
  showLogout?: boolean;
}) {
  const loc = useLocation();
  const nav = useNavigate();

  const goBack = () => {
    // no mobile: volta pro dashboard mobile; fora do /m, volta normal
    if (loc.pathname.startsWith("/m")) nav("/m/dashboard");
    else nav(-1);
  };

  const onLogout = () => {
    doLogout();
    nav("/login", { replace: true });
    // garante reset total (evita ficar preso em tela antiga)
    setTimeout(() => {
      try {
        window.location.reload();
      } catch {}
    }, 50);
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

        <div className="mp-top-right">
          {right}
          {showLogout ? (
            <button className="mp-logout" type="button" onClick={onLogout} aria-label="Sair">
              Sair
            </button>
          ) : null}
        </div>
      </div>

      <div className="mp-content">{children}</div>

      <nav className="mp-bottom">
        <Link className={`mp-tab ${active === "dashboard" ? "is-active" : ""}`} to="/m/dashboard">
          Dashboard
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
