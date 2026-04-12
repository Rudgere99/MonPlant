// Login.tsx COMPLETO

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

function defaultRouteForRole(userType?: string | null) {
  const r = normRole(userType);
  if (r === "dev") return "/dev-dash";
  if (r === "gerencia") return "/dashboard";
  if (r === "supervisor") return "/dashboard";
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
      const u = uRaw ? JSON.parse(uRaw) : null;
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
      setUser(data.user);

      nav(defaultRouteForRole(data.user?.user_type), { replace: true });
    } catch (err: any) {
      setError(err?.message || "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>

      {/* FUNDO COM IMAGEM JPEG */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            linear-gradient(to bottom, rgba(0,0,0,.65), rgba(0,0,0,.90)),
            url('/assets/login-bg.jpeg')
          `,
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      />

      {/* LOGO CENTRAL */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          padding: "12px 28px",
          borderRadius: 20,
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.45)"
        }}
      >
        <img
          src="/assets/logo-trindade.png"
          alt="Trindade"
          style={{
            height: 48,
            objectFit: "contain"
          }}
        />
      </div>

      {/* CONTEÚDO */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          minHeight: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: 20
        }}
      >

        <div
          className="mp-card"
          style={{
            width: 420,
            padding: 24,
            borderRadius: 20,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(14px)",
            border: "1px solid rgba(255,255,255,0.08)"
          }}
        >

          <h2 style={{ fontSize: 28, fontWeight: 900 }}>Login</h2>

          {error && (
            <div style={{ color: "#fca5a5", marginBottom: 10 }}>
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>

            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="mp-input"
            />

            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha"
                className="mp-input"
              />

              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                style={{
                  position: "absolute",
                  right: 10,
                  top: 10,
                  background: "transparent",
                  border: "none",
                  color: "#fff",
                  cursor: "pointer"
                }}
              >
                👁
              </button>
            </div>

            <button
              className="mp-btn mp-btn-primary"
              disabled={loading}
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>

          </form>

        </div>
      </div>
    </div>
  );
}
