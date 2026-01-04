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
    <div className="min-h-screen bg-[#0B0F14] text-white flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6"
      >
        <div className="text-xl font-extrabold">MONPLANT</div>
        <div className="text-sm text-white/60">Entrar</div>

        {err && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {err}
          </div>
        )}

        <div className="mt-4">
          <div className="text-xs text-white/60 mb-1">E-mail</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
          />
        </div>

        <div className="mt-3">
          <div className="text-xs text-white/60 mb-1">Senha</div>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
          />
        </div>

        <button className="mt-5 w-full rounded-lg bg-emerald-500/90 px-3 py-2 text-sm font-extrabold text-black hover:bg-emerald-400">
          Entrar
        </button>
      </form>
    </div>
  );
}
