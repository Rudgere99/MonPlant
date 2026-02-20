import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

type UserType = "apontador" | "controlador" | "gerencia" | "supervisor" | "dev";

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
    .replace(/[\u0300-\u036f]/g, "");
}

// ✅ Mantém o Login independente do roleGuard (sem mexer nele)
function defaultRouteForRole(userType?: string | null) {
  const r = normRole(userType);
  if (r === "dev") return "/dev-dash";
  if (r === "gerencia") return "/dashboard";
  if (r === "supervisor") return "/dashboard";
  // apontador / controlador
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

  // Se já está logado, manda para a rota correta pelo papel
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
      {/* Fundo base */}
      <div className="mp-bg" style={{ position: "absolute", inset: 0 }} />

      {/* Anéis estilo referência */}
      <div className="mp-login-rings" aria-hidden>
        <span className="ring r1" />
        <span className="ring r2" />
        <span className="ring r3" />
        <span className="ring r4" />
      </div>
      <div className="mp-login-glow" aria-hidden />

      <div className="mp-login-wrap">
        {/* Coluna esquerda */}
        <div className="mp-login-hero">
          <div className="mp-login-badge">
            <span className="mp-login-mark">M</span>
          </div>

          <h1 className="mp-login-title">
            Torne cada Turno
            <br />
            MAIS FÁCIL!
          </h1>
          <p className="mp-login-sub">
            MonPlant centraliza a informação oficial do turno para reduzir retrabalho e erro de comunicação.
          </p>

          <div className="mp-login-pill">
            <span className="k">Acesso</span>
            <span className="v">produção • paradas • horímetros • avisos</span>
          </div>
        </div>

        {/* Card direita */}
        <div className="mp-login-panel mp-card">
          <div className="mp-login-panel-head">
            <div className="mp-login-panel-title">Bem vindo de volta!</div>
            <div className="mp-login-panel-sub">Entre com seu e-mail e senha.</div>
          </div>

          {error && <div className="mp-login-error">{error}</div>}

          <form onSubmit={onSubmit} className="mp-login-form">
            <label className="mp-login-field">
              <span className="mp-login-icon" aria-hidden>
                {/* envelope */}
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
                placeholder="Email"
                autoComplete="email"
              />
            </label>

            <label className="mp-login-field">
              <span className="mp-login-icon" aria-hidden>
                {/* lock */}
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
                placeholder="Password"
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
                Forget your password?
              </a>
            </div>

            <button className="mp-btn mp-btn-primary mp-login-submit" type="submit" disabled={loading}>
              {loading ? "Logging in..." : "Log In"}
            </button>

            <button
              className="mp-btn mp-login-secondary"
              type="button"
              onClick={(e) => e.preventDefault()}
              title="Cadastro é gerenciado internamente"
            >
              No account? Request access
            </button>

            <div className="mp-login-divider">
              <span>or continue with</span>
            </div>

            <div className="mp-login-social">
              <button type="button" className="mp-login-socialbtn" onClick={(e) => e.preventDefault()}>
                <span className="s">G</span> Google
              </button>
              <button type="button" className="mp-login-socialbtn" onClick={(e) => e.preventDefault()}>
                <span className="s">f</span> Facebook
              </button>
              <button type="button" className="mp-login-socialbtn" onClick={(e) => e.preventDefault()}>
                <span className="s">D</span> Discord
              </button>
            </div>

            <label className="mp-login-check">
              <input type="checkbox" defaultChecked />
              <span>Subscribe to MonPlant updates and operational tips</span>
            </label>

            <div className="mp-login-terms">By logging in you agree with internal policies (Terms & Privacy).</div>
          </form>
        </div>
      </div>

      <style>{`
        .mp-login { padding: 18px; }
        .mp-login-wrap {
          position: relative;
          z-index: 2;
          min-height: calc(100vh - 36px);
          display: grid;
          grid-template-columns: 1.08fr 0.92fr;
          gap: 22px;
          align-items: center;
          max-width: 1200px;
          margin: 0 auto;
        }
        @media (max-width: 980px) {
          .mp-login-wrap { grid-template-columns: 1fr; gap: 14px; align-content: start; padding-top: 18px; }
        }

        .mp-login-hero { padding: 12px 6px; }
        .mp-login-badge {
          width: 46px; height: 46px; border-radius: 16px;
          background: rgba(59,130,246,0.16);
          border: 1px solid rgba(255,255,255,0.10);
          display: grid; place-items: center;
          margin-bottom: 14px;
          box-shadow: 0 12px 35px rgba(0,0,0,0.35);
        }
        .mp-login-mark { font-weight: 950; color: rgba(59,130,246,0.95); font-size: 18px; }
        .mp-login-title {
          margin: 0 0 12px 0;
          font-size: clamp(44px, 5vw, 72px);
          line-height: 1.02;
          letter-spacing: -0.02em;
          font-weight: 950;
        }
        .mp-login-sub {
          margin: 0;
          opacity: .82;
          font-size: 14px;
          max-width: 56ch;
        }
        .mp-login-pill {
          margin-top: 18px;
          display: inline-flex;
          gap: 10px;
          align-items: center;
          padding: 12px 14px;
          border-radius: 16px;
          background: rgba(0,0,0,0.25);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 20px 50px rgba(0,0,0,0.38);
          backdrop-filter: blur(8px);
        }
        .mp-login-pill .k { font-weight: 900; color: rgba(52,211,153,0.95); }
        .mp-login-pill .v { opacity: .85; }

        .mp-login-panel {
          width: min(520px, 100%);
          justify-self: end;
          padding: 18px;
        }
        @media (max-width: 980px) { .mp-login-panel { justify-self: stretch; } }

        .mp-login-panel-head { margin-bottom: 12px; }
        .mp-login-panel-title { font-size: 30px; font-weight: 950; margin-bottom: 6px; }
        .mp-login-panel-sub { opacity: .72; font-size: 13px; }
        .mp-login-error {
          padding: 10px 12px;
          border-radius: 14px;
          background: rgba(239,68,68,0.10);
          border: 1px solid rgba(239,68,68,0.25);
          color: #fecaca;
          margin: 10px 0 12px;
          font-size: 13px;
        }
        .mp-login-form { display: grid; gap: 10px; }

        .mp-login-field { position: relative; display: flex; align-items: center; }
        .mp-login-icon {
          position: absolute;
          left: 12px;
          opacity: .72;
          color: rgba(255,255,255,0.78);
          pointer-events: none;
        }
        .mp-login-input { padding-left: 40px !important; }

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
        .mp-login-link { font-size: 12px; opacity: .8; text-decoration: underline; }
        .mp-login-link:hover { opacity: 1; }

        .mp-login-submit { height: 44px; }
        .mp-login-secondary {
          height: 42px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.10);
          color: rgba(255,255,255,0.92);
        }
        .mp-login-secondary:hover { background: rgba(255,255,255,0.08); }

        .mp-login-divider {
          margin: 8px 0 6px;
          display: flex;
          align-items: center;
          gap: 10px;
          opacity: .65;
          font-size: 12px;
        }
        .mp-login-divider:before,
        .mp-login-divider:after {
          content: "";
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.10);
        }

        .mp-login-social {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .mp-login-socialbtn {
          height: 40px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.9);
          font-weight: 800;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 10px;
          cursor: pointer;
        }
        .mp-login-socialbtn:hover { background: rgba(255,255,255,0.08); }
        .mp-login-socialbtn .s {
          width: 22px; height: 22px;
          border-radius: 7px;
          display: grid; place-items: center;
          background: rgba(0,0,0,0.35);
          border: 1px solid rgba(255,255,255,0.12);
          font-weight: 950;
        }

        .mp-login-check {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-top: 6px;
          opacity: .85;
          font-size: 12px;
        }
        .mp-login-check input { width: 16px; height: 16px; }

        .mp-login-terms { opacity: .65; font-size: 12px; margin-top: 4px; text-align: center; }

        .mp-login-rings {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          pointer-events: none;
          opacity: .72;
        }
        .mp-login-rings .ring {
          position: absolute;
          border-radius: 999px;
          border: 1px solid rgba(96,165,250,0.18);
          background: radial-gradient(circle at 30% 30%, rgba(59,130,246,0.18), transparent 55%);
          box-shadow: inset 0 0 40px rgba(0,0,0,0.35);
        }
        .mp-login-rings .r1 { width: 980px; height: 980px; animation: mpRing 10s ease-in-out infinite; }
        .mp-login-rings .r2 { width: 780px; height: 780px; animation: mpRing 12s ease-in-out infinite reverse; border-color: rgba(52,211,153,0.16); }
        .mp-login-rings .r3 { width: 560px; height: 560px; animation: mpRing 14s ease-in-out infinite; border-color: rgba(255,255,255,0.10); }
        .mp-login-rings .r4 { width: 360px; height: 360px; animation: mpRing 16s ease-in-out infinite reverse; border-color: rgba(52,211,153,0.12); }
        @media (max-width: 980px) {
          .mp-login-rings .r1 { width: 720px; height: 720px; }
          .mp-login-rings .r2 { width: 560px; height: 560px; }
          .mp-login-rings .r3 { width: 420px; height: 420px; }
          .mp-login-rings .r4 { width: 280px; height: 280px; }
        }
        @keyframes mpRing {
          0% { transform: translateY(0px) scale(1); opacity: .55; }
          50% { transform: translateY(-10px) scale(1.02); opacity: .82; }
          100% { transform: translateY(0px) scale(1); opacity: .55; }
        }
        .mp-login-glow {
          position: absolute;
          inset: -200px;
          background:
            radial-gradient(circle at 20% 50%, rgba(59,130,246,0.22), transparent 55%),
            radial-gradient(circle at 68% 20%, rgba(52,211,153,0.18), transparent 60%),
            radial-gradient(circle at 72% 74%, rgba(251,191,36,0.10), transparent 60%);
          filter: blur(34px);
          opacity: .85;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
