import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

/**
 * Compat: mantemos "production" no tipo Tab porque rotas antigas podem passar active="production".
 * A aba Produção NÃO aparece na navegação.
 */
type Tab = "dashboard" | "ritmo" | "stats" | "ufdf" | "production";

function doLogout() {
  const keys = ["token", "mp_token", "auth_token", "access_token", "user", "mp_user"];
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
  try {
    sessionStorage.clear();
  } catch {}
}

function useIsLandscape(): boolean {
  const get = () => {
    if (typeof window === "undefined") return false;
    const mq = window.matchMedia?.("(orientation: landscape)");
    if (mq && typeof mq.matches === "boolean") return mq.matches;
    return window.innerWidth > window.innerHeight;
  };

  const [land, setLand] = useState(get);

  useEffect(() => {
    const on = () => setLand(get());
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on as any);

    const mq = window.matchMedia?.("(orientation: landscape)");
    const onMq = () => on();
    try {
      mq?.addEventListener?.("change", onMq);
    } catch {}

    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on as any);
      try {
        mq?.removeEventListener?.("change", onMq);
      } catch {}
    };
  }, []);

  return land;
}

function TabsInline({ active }: { active: Tab }) {
  return (
    <nav className="mp-top-tabs-inline" aria-label="Navegação">
      <Link className={`mp-top-tab ${active === "dashboard" ? "is-active" : ""}`} to="/m/dashboard">
        Dashboard
      </Link>
      <Link className={`mp-top-tab ${active === "ritmo" ? "is-active" : ""}`} to="/m/ritmo">
        Ritmo
      </Link>
      <Link className={`mp-top-tab ${active === "stats" ? "is-active" : ""}`} to="/m/stats">
        Stats
      </Link>
      <Link className={`mp-top-tab ${active === "ufdf" ? "is-active" : ""}`} to="/m/ufdf">
        UF/DF
      </Link>
    </nav>
  );
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
  const landscape = useIsLandscape();

  // Em landscape: tabs DENTRO da topbar; some a barra inferior
  const showInlineTabs = landscape;

  const goBack = () => {
    if (loc.pathname.startsWith("/m")) nav("/m/dashboard");
    else nav(-1);
  };

  const onLogout = () => {
    doLogout();
    nav("/login", { replace: true });
    setTimeout(() => {
      try {
        window.location.reload();
      } catch {}
    }, 50);
  };

  return (
    <div className="mp-root">
      <div className={`mp-top ${showInlineTabs ? "is-landscape" : ""}`}>
        <button className="mp-icon-btn" onClick={goBack} type="button" aria-label="Voltar">
          ←
        </button>

        {showInlineTabs ? (
          <TabsInline active={active} />
        ) : (
          <div className="mp-top-title">
            <div className="mp-top-h1">{title}</div>
            {subtitle ? <div className="mp-top-sub">{subtitle}</div> : null}
          </div>
        )}

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

      {!showInlineTabs ? (
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
      ) : null}
    </div>
  );
}
