import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

/**
 * Compat: mantemos "production" no tipo Tab porque rotas antigas podem passar active="production".
 */
type Tab =
  | "dashboard"
  | "production"
  | "desvio"
  | "ritmo"
  | "stats"
  | "ufdf"
  | "paradas"
  | "paradas-minutos"
  | "horimetros"
  | "historico"
  | "metas"
  | "exportar"
  | "configuracoes"
  | "contingencia"
  | "ultimos-7"
  | "dev-logs"
  | "dev-users";

const MOBILE_NAV_ITEMS: Array<{ key: Tab; to: string; label: string }> = [
  { key: "dashboard", to: "/m/dashboard", label: "Dashboard" },
  { key: "production", to: "/m/producao-planta", label: "Produção Planta" },
  { key: "desvio", to: "/m/desvio-producao", label: "Desvio Produção" },
  { key: "ritmo", to: "/m/ritmo", label: "Ritmo" },
  { key: "stats", to: "/m/statisticas", label: "Estatísticas" },
  { key: "ufdf", to: "/m/ufdf", label: "UF/DF" },
  { key: "paradas", to: "/m/paradas", label: "Paradas Horas" },
  { key: "paradas-minutos", to: "/m/lancamento-paradas", label: "Paradas Minutos" },
  { key: "horimetros", to: "/m/horimetros", label: "Horímetros" },
  { key: "historico", to: "/m/historico", label: "Histórico" },
  { key: "metas", to: "/m/metas", label: "Metas" },
  { key: "exportar", to: "/m/exportar", label: "Relatórios" },
  { key: "configuracoes", to: "/m/configuracoes", label: "Configurações" },
  { key: "contingencia", to: "/m/dashboard/producao-dia", label: "Contingência" },
  { key: "ultimos-7", to: "/m/dashboard/ultimos-7", label: "Últimos 7 dias" },
  { key: "dev-logs", to: "/m/dev/logs", label: "Dev Logs" },
  { key: "dev-users", to: "/m/dev/users", label: "Dev Usuários" },
];

const MOBILE_QUICK_TABS: Array<{ key: Tab; to: string; label: string }> = [
  { key: "dashboard", to: "/m/dashboard", label: "Dashboard" },
  { key: "production", to: "/m/producao-planta", label: "Produção" },
  { key: "ritmo", to: "/m/ritmo", label: "Ritmo" },
  { key: "stats", to: "/m/statisticas", label: "Stats" },
];

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
      {MOBILE_QUICK_TABS.map((item) => (
        <Link key={item.key} className={`mp-top-tab ${active === item.key ? "is-active" : ""}`} to={item.to}>
          {item.label}
        </Link>
      ))}
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
  const [menuOpen, setMenuOpen] = useState(false);

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

  const closeMenu = () => setMenuOpen(false);

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
          <button className="mp-icon-btn" type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Abrir menu">
            ☰
          </button>
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
          {MOBILE_QUICK_TABS.map((item) => (
            <Link key={item.key} className={`mp-tab ${active === item.key ? "is-active" : ""}`} to={item.to}>
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            className={`mp-tab mp-tab-btn ${menuOpen ? "is-active" : ""}`}
            onClick={() => setMenuOpen((v) => !v)}
          >
            Mais
          </button>
        </nav>
      ) : null}

      {menuOpen ? (
        <div className="mp-menu-overlay" role="dialog" aria-modal="true" aria-label="Menu mobile completo">
          <div className="mp-menu-panel">
            <div className="mp-menu-head">
              <strong>Todas as páginas</strong>
              <button type="button" className="mp-icon-btn" onClick={closeMenu} aria-label="Fechar menu">
                ✕
              </button>
            </div>
            <div className="mp-menu-grid">
              {MOBILE_NAV_ITEMS.map((item) => (
                <Link
                  key={item.key}
                  className={`mp-menu-link ${active === item.key ? "is-active" : ""}`}
                  to={item.to}
                  onClick={closeMenu}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
