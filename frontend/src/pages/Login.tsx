import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function Login() {
  const { setToken } = useAuth();
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    try {
      // por enquanto: mock. Depois liga no backend /auth/login
      if (!email || !pass) throw new Error("Informe e-mail e senha");
      setToken("TOKEN_MOCK");
      nav("/dashboard");
    } catch (e: any) {
      setErr(e?.message || "Erro");
    }
  }

  return (
    <>
      {/* ✅ FUNDO ANIMADO FULLSCREEN (MINERAÇÃO VIBE) */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          background: "#0B0F14",
          overflow: "hidden",
        }}
      >
        {/* Base glow */}
        <div
          style={{
            position: "absolute",
            inset: "-20%",
            background:
              "radial-gradient(900px 500px at 25% 25%, rgba(52,211,153,.14), transparent 60%)," +
              "radial-gradient(700px 420px at 80% 35%, rgba(52,211,153,.10), transparent 60%)," +
              "radial-gradient(900px 520px at 60% 85%, rgba(255,255,255,.05), transparent 60%)",
          }}
        />

        {/* Subtle grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.12,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.10) 1px, transparent 1px)," +
              "linear-gradient(90deg, rgba(255,255,255,.10) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage:
              "radial-gradient(500px 320px at 50% 45%, rgba(0,0,0,1), transparent 70%)",
            WebkitMaskImage:
              "radial-gradient(500px 320px at 50% 45%, rgba(0,0,0,1), transparent 70%)",
          }}
        />

        {/* “Correias/esteiras” diagonais */}
        <div
          className="mp-bg-belt-1"
          style={{
            position: "absolute",
            left: "-30%",
            top: "18%",
            width: "160%",
            height: 110,
            transform: "rotate(-12deg)",
            background:
              "linear-gradient(90deg, transparent, rgba(52,211,153,.08), rgba(255,255,255,.06), rgba(52,211,153,.08), transparent)",
            borderTop: "1px solid rgba(255,255,255,.08)",
            borderBottom: "1px solid rgba(255,255,255,.08)",
            filter: "blur(.2px)",
          }}
        />
        <div
          className="mp-bg-belt-2"
          style={{
            position: "absolute",
            left: "-35%",
            top: "48%",
            width: "170%",
            height: 90,
            transform: "rotate(-12deg)",
            background:
              "linear-gradient(90deg, transparent, rgba(52,211,153,.06), rgba(255,255,255,.05), rgba(52,211,153,.06), transparent)",
            borderTop: "1px solid rgba(255,255,255,.06)",
            borderBottom: "1px solid rgba(255,255,255,.06)",
            opacity: 0.9,
          }}
        />

        {/* Partículas (minério/poeira) */}
        <div className="mp-bg-dust" style={{ position: "absolute", inset: 0, opacity: 0.75 }} />

        {/* Vinheta */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(900px 520px at 50% 40%, transparent 50%, rgba(0,0,0,.65) 100%)",
          }}
        />
      </div>

      {/* ✅ CONTEÚDO (LOGIN) */}
      <div
        className="min-h-screen w-full flex items-center justify-center px-4 py-10"
        style={{ position: "relative", zIndex: 1 }}
      >
        <div className="mp-card" style={{ width: 420, maxWidth: "100%" }}>
          <div className="mp-card-h">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  height: 38,
                  width: 38,
                  borderRadius: 14,
                  background: "rgba(52,211,153,.16)",
                  border: "1px solid rgba(52,211,153,.22)",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 900,
                  letterSpacing: 1,
                }}
              >
                MP
              </div>
              <div>
                <div style={{ fontWeight: 900, letterSpacing: 0.4 }}>MONPLANT</div>
                <div className="mp-help">Acesso ao sistema</div>
              </div>
            </div>

            <span className="mp-chip">Login</span>
          </div>

          <div className="mp-card-b">
            {err && <div className="mp-error">{err}</div>}

            <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 10 }}>
              <div>
                <div className="mp-label">E-mail</div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mp-input"
                  placeholder="seuemail@empresa.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <div className="mp-label">Senha</div>
                <input
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  className="mp-input"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>

              <button className="mp-btn mp-btn-primary" type="submit">
                Entrar
              </button>

              <div className="mp-help">
                * Por enquanto está em modo mock (TOKEN_MOCK). Depois ligamos no backend /auth/login.
              </div>
            </form>
          </div>
        </div>

        {/* ✅ CSS da animação */}
        <style>{`
          @keyframes mpBeltMove {
            0%   { transform: translateX(-6%) rotate(-12deg); opacity: .75; }
            50%  { transform: translateX(6%)  rotate(-12deg); opacity: .95; }
            100% { transform: translateX(-6%) rotate(-12deg); opacity: .75; }
          }
          .mp-bg-belt-1 { animation: mpBeltMove 9s ease-in-out infinite; }
          .mp-bg-belt-2 { animation: mpBeltMove 12s ease-in-out infinite; }

          .mp-bg-dust {
            background-image:
              radial-gradient(2px 2px at 12% 18%, rgba(52,211,153,.35) 0, transparent 60%),
              radial-gradient(2px 2px at 28% 62%, rgba(255,255,255,.22) 0, transparent 60%),
              radial-gradient(1.5px 1.5px at 48% 28%, rgba(52,211,153,.28) 0, transparent 60%),
              radial-gradient(2px 2px at 66% 74%, rgba(255,255,255,.18) 0, transparent 60%),
              radial-gradient(1.5px 1.5px at 82% 38%, rgba(52,211,153,.22) 0, transparent 60%),
              radial-gradient(2px 2px at 92% 66%, rgba(255,255,255,.16) 0, transparent 60%);
            background-size: 100% 100%;
            animation: mpDustFloat 6s ease-in-out infinite;
            filter: blur(.1px);
          }

          @keyframes mpDustFloat {
            0%   { transform: translateY(0px); opacity: .65; }
            50%  { transform: translateY(-10px); opacity: .85; }
            100% { transform: translateY(0px); opacity: .65; }
          }
        `}</style>
      </div>
    </>
  );
}
