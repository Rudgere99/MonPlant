import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

type UserType = "apontador" | "controlador" | "gerencia" | "supervisor" | "gestao_vista" | "dev";

type MpUser = {
  id: string;
  full_name: string;
  sector: string;
  user_type: UserType;
  email: string;
};

function normRole(v?: string | null) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

function defaultRouteForRole(userType?: string | null) {
  const r = normRole(userType);

  // Perfil exclusivo de painel: não pode cair em dashboard, usuários ou produção.
  if (r === "gestao_vista" || r === "gestao_a_vista" || r.includes("gestao_vista")) {
    return "/dashboard/gestao-vista-planta";
  }

  if (r === "dev") return "/dashboard";
  if (r === "gerencia") return "/dashboard";
  if (r === "supervisor") return "/dashboard";
  if (r === "controlador") return "/dashboard";
  return "/producao-planta";
}

export default function Login() {
  const nav = useNavigate();
  const { token, setToken, setUser } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const API = useMemo(
    () => import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000",
    []
  );

  useEffect(() => {
    if (!token) return;
    try {
      const uRaw = localStorage.getItem("mp_user");
      const u = uRaw ? (JSON.parse(uRaw) as any) : null;
      nav(defaultRouteForRole(u?.user_type), { replace: true });
    } catch {
      nav("/dashboard", { replace: true });
    }
  }, [token, nav]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const r = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.detail || "Falha ao autenticar");

      setToken(data.token);
      setUser(data.user as MpUser);

      nav(defaultRouteForRole((data.user as MpUser)?.user_type), { replace: true });
    } catch (err: any) {
      setError(err?.message || "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mp-login" style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url('/assets/login-bg.jpeg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          transform: "scale(1.02)",
        }}
      />

      <div className="mp-login-overlay" aria-hidden />
      <div className="mp-login-glow" aria-hidden />
      <div className="mp-login-grid" aria-hidden />

      <header className="mp-login-topbar">
        <button type="button" className="mp-login-brand" onClick={() => nav("/home")}>
          <img
            src="/assets/logo-trindade.png"
            alt="Trindade"
            className="mp-login-brand-logo"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </button>

        <button
          type="button"
          className="mp-btn mp-login-topbtn"
          onClick={() => nav("/home")}
          title="Ir para a página inicial"
        >
          Sobre o MonPlant
        </button>
      </header>

      <div className="mp-login-wrap">
        <div className="mp-login-hero">
          <div className="mp-login-kicker">MONITORAMENTO OPERACIONAL</div>

          <h1 className="mp-login-title">
            A operação da planta,
            <br />
            em um só lugar.
          </h1>

          <p className="mp-login-sub">
            Produção, paradas, horímetros, ritmo e acompanhamento gerencial em um ambiente único,
            com leitura rápida e padrão visual MonPlant.
          </p>

          <div className="mp-login-badges">
            <span className="mp-login-pill"><b>Acesso rápido</b> produção • paradas • horímetros</span>
            <span className="mp-login-pill"><b>Visual executivo</b> foco no que importa no turno</span>
          </div>
        </div>

        <div className="mp-login-panel mp-card">
          <div className="mp-login-panel-head">
            <div className="mp-login-panel-tag">ACESSO AO SISTEMA</div>
            <div className="mp-login-panel-title">Bem-vindo de volta</div>
            <div className="mp-login-panel-sub">Entre com seu e-mail e senha para acessar o MonPlant.</div>
          </div>

          {error && <div className="mp-login-error">{error}</div>}

          <form onSubmit={onSubmit} className="mp-login-form">
            <label className="mp-login-field">
              <span className="mp-login-icon" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M4 6.5C4 5.67157 4.67157 5 5.5 5H18.5C19.3284 5 20 5.67157 20 6.5V17.5C20 18.3284 19.3284 19 18.5 19H5.5C4.67157 19 4 18.3284 4 17.5V6.5Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path d="M5 7L12 12.2L19 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>

              <input
                className="mp-input mp-login-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-mail"
                autoComplete="email"
              />
            </label>

            <label className="mp-login-field">
              <span className="mp-login-icon" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M7 11V8.5C7 5.46243 9.46243 3 12.5 3C15.5376 3 18 5.46243 18 8.5V11"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M6.5 11H18.5C19.3284 11 20 11.6716 20 12.5V19C20 19.8284 19.3284 20.5 18.5 20.5H6.5C5.67157 20.5 5 19.8284 5 19V12.5C5 11.6716 5.67157 11 6.5 11Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                </svg>
              </span>

              <input
                className="mp-input mp-login-input"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha"
                autoComplete="current-password"
              />

              <button
                type="button"
                className="mp-login-eye"
                onClick={() => setShowPw((v) => !v)}
                title={showPw ? "Ocultar" : "Mostrar"}
              >
                {showPw ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 12C5.5 7.5 8.7 5 12 5C15.3 5 18.5 7.5 21 12C18.5 16.5 15.3 19 12 19C8.7 19 5.5 16.5 3 12Z" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M12 15.2C10.23 15.2 8.8 13.77 8.8 12C8.8 10.23 10.23 8.8 12 8.8C13.77 8.8 15.2 10.23 15.2 12C15.2 13.77 13.77 15.2 12 15.2Z" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 4L20 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M3 12C5.5 7.5 8.7 5 12 5C15.3 5 18.5 7.5 21 12C20.2 13.4 19.3 14.5 18.3 15.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M10.2 8.9C10.7 8.6 11.3 8.4 12 8.4C13.99 8.4 15.6 10.01 15.6 12C15.6 12.7 15.4 13.3 15.1 13.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M7.2 10.6C6.6 11.3 6.2 12.2 6.2 13.2C6.2 15.41 8 17.2 10.2 17.2C11.2 17.2 12.1 16.8 12.8 16.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </label>

            <div className="mp-login-row">
              <a className="mp-login-link" href="#" onClick={(e) => e.preventDefault()}>
                Esqueceu sua senha?
              </a>
            </div>

            <button className="mp-btn mp-btn-primary mp-login-submit" type="submit" disabled={loading}>
              {loading ? "Entrando..." : "Entrar no sistema"}
            </button>

            <button
              className="mp-btn mp-login-secondary"
              type="button"
              onClick={(e) => e.preventDefault()}
              title="Cadastro é gerenciado internamente"
            >
              Solicitar acesso
            </button>

            <label className="mp-login-check">
              <input type="checkbox" defaultChecked />
              <span>Receber comunicados e atualizações operacionais da plataforma.</span>
            </label>

            <div className="mp-login-terms">Ao entrar, você concorda com as políticas internas de uso e privacidade.</div>
          </form>
        </div>
      </div>

      <footer className="mp-login-footer">© {new Date().getFullYear()} MonPlant • Trindade Mineração • Rudgere Germano.</footer>

      <style>{`
        .mp-login { padding: 0; color: rgba(255,255,255,.96); }

        .mp-login-overlay {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, rgba(4,7,10,.82) 0%, rgba(4,7,10,.66) 35%, rgba(4,7,10,.52) 60%, rgba(4,7,10,.74) 100%),
            linear-gradient(180deg, rgba(0,0,0,.24) 0%, rgba(0,0,0,.54) 100%);
        }

        .mp-login-glow {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 18% 28%, rgba(16,185,129,.18), transparent 30%),
            radial-gradient(circle at 78% 18%, rgba(255,255,255,.08), transparent 26%),
            radial-gradient(circle at 72% 78%, rgba(245,158,11,.12), transparent 26%);
          filter: blur(30px);
          pointer-events: none;
        }

        .mp-login-grid {
          position: absolute;
          inset: 0;
          opacity: .08;
          background-image:
            linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px);
          background-size: 42px 42px;
          mask-image: linear-gradient(to bottom, rgba(0,0,0,.45), transparent 85%);
          pointer-events: none;
        }

        .mp-login-topbar {
          position: absolute;
          top: 22px;
          left: 28px;
          right: 28px;
          z-index: 3;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          pointer-events: none;
        }

        .mp-login-brand {
          pointer-events: auto;
          background: transparent;
          border: 0;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: flex-start;
          cursor: pointer;
          color: inherit;
          text-align: left;
        }

        .mp-login-brand-logo {
          height: 82px;
          width: auto;
          object-fit: contain;
          filter: drop-shadow(0 10px 22px rgba(0,0,0,.35));
        }

        .mp-login-brand-text { display: flex; flex-direction: column; line-height: 1.05; }
        .mp-login-brand-text .t1 { font-size: 24px; font-weight: 900; letter-spacing: .02em; }
        .mp-login-brand-text .t2 { font-size: 13px; opacity: .72; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }

        .mp-login-topbtn {
          pointer-events: auto;
          min-height: 34px;
          padding: 0 12px;
          background: rgba(8,12,16,.38);
          border: 1px solid rgba(255,255,255,.08);
          color: rgba(255,255,255,.68);
          font-size: 12px;
          font-weight: 700;
          border-radius: 12px;
          backdrop-filter: blur(8px);
          box-shadow: none;
        }
        .mp-login-topbtn:hover {
          background: rgba(255,255,255,.05);
          color: rgba(255,255,255,.88);
          border-color: rgba(255,255,255,.12);
        }

        .mp-login-wrap {
          position: relative;
          z-index: 2;
          min-height: calc(100vh - 140px);
          display: grid;
          grid-template-columns: minmax(0, 1.08fr) minmax(420px, 480px);
          gap: 36px;
          align-items: center;
          max-width: 1280px;
          margin: 0 auto;
          padding: 118px 28px 28px;
        }

        @media (max-width: 980px) {
          .mp-login-topbar {
            top: 16px;
            left: 16px;
            right: 16px;
          }
          .mp-login-brand-logo { height: 56px; }
          .mp-login-brand-text .t1 { font-size: 18px; }
          .mp-login-topbtn {
            min-height: 32px;
            padding: 0 10px;
            font-size: 11px;
          }
          .mp-login-wrap {
            min-height: auto;
            grid-template-columns: 1fr;
            gap: 18px;
            padding: 96px 16px 28px;
            align-content: start;
          }
        }

        .mp-login-hero { max-width: 760px; padding: 18px 8px 18px 4px; }
        .mp-login-kicker {
          display: inline-flex;
          align-items: center;
          min-height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          background: rgba(255,255,255,.08);
          border: 1px solid rgba(255,255,255,.10);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: .16em;
          color: rgba(255,255,255,.78);
          margin-bottom: 18px;
          backdrop-filter: blur(8px);
        }

        .mp-login-title {
          margin: 0;
          font-size: clamp(40px, 5vw, 74px);
          line-height: .98;
          letter-spacing: -0.04em;
          font-weight: 950;
          text-shadow: 0 12px 30px rgba(0,0,0,.22);
        }

        .mp-login-sub {
          margin: 18px 0 0;
          font-size: 16px;
          line-height: 1.7;
          color: rgba(255,255,255,.82);
          max-width: 58ch;
        }

        .mp-login-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 24px;
        }

        .mp-login-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 42px;
          padding: 0 16px;
          border-radius: 16px;
          background: rgba(8,12,16,.42);
          border: 1px solid rgba(255,255,255,.10);
          backdrop-filter: blur(10px);
          box-shadow: 0 14px 36px rgba(0,0,0,.22);
          font-size: 13px;
          color: rgba(255,255,255,.88);
        }

        .mp-login-pill b { color: rgba(167,243,208,.98); }

        .mp-login-panel {
          width: 100%;
          justify-self: end;
          padding: 24px;
          border-radius: 28px;
          background: linear-gradient(180deg, rgba(10,14,18,.82) 0%, rgba(7,10,14,.76) 100%);
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 28px 70px rgba(0,0,0,.38);
          backdrop-filter: blur(16px);
        }

        @media (max-width: 980px) {
          .mp-login-brand-logo { height: 48px; }
          .mp-login-brand-text .t1 { font-size: 18px; }
          .mp-login-panel { justify-self: stretch; padding: 20px; border-radius: 22px; }
        }

        .mp-login-panel-head { margin-bottom: 14px; }
        .mp-login-panel-tag {
          font-size: 11px;
          font-weight: 900;
          letter-spacing: .16em;
          color: rgba(167,243,208,.92);
          margin-bottom: 10px;
        }
        .mp-login-panel-title { font-size: 32px; font-weight: 950; margin-bottom: 6px; }
        .mp-login-panel-sub { color: rgba(255,255,255,.68); font-size: 13px; line-height: 1.6; }

        .mp-login-error {
          padding: 10px 12px;
          border-radius: 14px;
          background: rgba(239,68,68,0.10);
          border: 1px solid rgba(239,68,68,0.25);
          color: #fecaca;
          margin: 10px 0 12px;
          font-size: 13px;
        }

        .mp-login-form { display: grid; gap: 12px; }
        .mp-login-field { position: relative; display: flex; align-items: center; }

        .mp-login-icon {
          position: absolute;
          left: 14px;
          opacity: .72;
          color: rgba(255,255,255,0.78);
          pointer-events: none;
        }

        .mp-login-input {
          width: 100%;
          min-height: 52px;
          padding-left: 44px !important;
          padding-right: 44px !important;
          border-radius: 16px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.10);
          color: rgba(255,255,255,.96);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
        }

        .mp-login-input::placeholder { color: rgba(255,255,255,.46); }

        .mp-login-eye {
          position: absolute;
          right: 10px;
          width: 36px;
          height: 36px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.06);
          display: grid;
          place-items: center;
          color: rgba(255,255,255,0.85);
          cursor: pointer;
        }
        .mp-login-eye:hover { background: rgba(255,255,255,0.09); }

        .mp-login-row { display: flex; justify-content: flex-end; margin-top: 2px; }
        .mp-login-link { font-size: 13px; opacity: .8; text-decoration: underline; }
        .mp-login-link:hover { opacity: 1; }

        .mp-login-submit {
          height: 48px;
          margin-top: 4px;
          font-weight: 900;
          box-shadow: 0 16px 34px rgba(16,185,129,.18);
        }

        .mp-login-secondary {
          height: 64px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.10);
          color: rgba(255,255,255,0.92);
        }
        .mp-login-secondary:hover { background: rgba(255,255,255,0.08); }

        .mp-login-check {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-top: 4px;
          color: rgba(255,255,255,.82);
          font-size: 13px;
          line-height: 1.5;
        }
        .mp-login-check input { width: 16px; height: 16px; }

        .mp-login-terms {
          color: rgba(255,255,255,.54);
          font-size: 13px;
          margin-top: 2px;
          text-align: center;
          line-height: 1.5;
        }

        .mp-login-footer {
          position: relative;
          z-index: 2;
          padding: 0 16px 18px;
          text-align: center;
          font-size: 13px;
          color: rgba(255,255,255,.50);
        }
      `}</style>
    </div>
  );
}
