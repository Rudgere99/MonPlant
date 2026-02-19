import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";

type UserType = "apontador" | "controlador" | "gerencia" | "supervisor" | "dev";

type DevUser = {
  id: string;
  full_name: string;
  sector: string;
  user_type: UserType;
  email: string;
  is_active: boolean;
  created_at?: string | null;
};

// VITE_API_BASE pode ser:
// - https://monplant-production.up.railway.app
// - https://monplant-production.up.railway.app/api
// - (vazio) -> usa /api no mesmo host
const RAW_API_BASE = ((import.meta as any).env?.VITE_API_BASE || "").toString().trim();
const API_BASE = RAW_API_BASE.replace(/\/+$/, "");

function apiUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;

  // sem base -> mesma origem (Vercel) com /api
  if (!API_BASE) return p;

  // se base já termina com /api, não duplica
  if (API_BASE.endsWith("/api") && p.startsWith("/api/")) {
    return `${API_BASE}${p.replace(/^\/api/, "")}`;
  }

  return `${API_BASE}${p}`;
}

async function readErr(res: Response) {
  try {
    const j = await res.json();
    if ((j as any)?.detail) return typeof (j as any).detail === "string" ? (j as any).detail : JSON.stringify((j as any).detail);
    return JSON.stringify(j);
  } catch {
    const t = await res.text().catch(() => "");
    return t || `HTTP ${res.status}`;
  }
}

function normalizeUserType(v: string): UserType {
  const s = (v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (s === "gerencia") return "gerencia";
  if (s === "controlador") return "controlador";
  if (s === "dev") return "dev";
  return "apontador";
}

export default function DevUsers() {
  const { token } = useAuth();

  const [rows, setRows] = useState<DevUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [sector, setSector] = useState("");
  const [userType, setUserType] = useState<UserType>("apontador");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const headers = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      // ✅ usa o alias /api/dev/users (evita CORS em /dev/users)
      const res = await fetch(apiUrl("/api/dev/users"), { headers });
      if (!res.ok) throw new Error(await readErr(res));
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }

  async function createUser() {
    setErr(null);

    if (!token) {
      setErr("Sem token. Faça login com um usuário DEV.");
      return;
    }

    if (!fullName.trim() || !sector.trim() || !email.trim() || !password) {
      setErr("Preencha nome, setor, email e senha.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/dev/users"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          full_name: fullName.trim(),
          sector: sector.trim(),
          user_type: normalizeUserType(userType), // ✅ garante sem acento
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      if (!res.ok) throw new Error(await readErr(res));

      setFullName("");
      setSector("");
      setUserType("apontador");
      setEmail("");
      setPassword("");

      await load();
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar usuário");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 18 }}>
      <div className="mp-card">
        <div className="mp-card-h">
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>DEV • Usuários</div>
            <div className="mp-help">Somente DEV cria usuários. (Por enquanto não bloqueia páginas.)</div>
          </div>
          <button className="mp-btn" onClick={load} disabled={loading}>
            Atualizar
          </button>
        </div>

        <div className="mp-card-b">
          {err && <div className="mp-error">{err}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.7fr 1fr 0.9fr", gap: 10 }}>
            <div>
              <div className="mp-label">Nome completo</div>
              <input className="mp-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>

            <div>
              <div className="mp-label">Setor</div>
              <input className="mp-input" value={sector} onChange={(e) => setSector(e.target.value)} />
            </div>

            <div>
              <div className="mp-label">Tipo</div>
             <select
  value={form.user_type}
  onChange={(e) =>
    setForm((f) => ({
      ...f,
      user_type: e.target.value as any,
    }))
  }
>
  <option value="apontador">Apontador</option>
  <option value="controlador">Controlador</option>
  <option value="gerencia">Gerência</option>
  <option value="supervisor">Supervisor</option>
  <option value="dev">DEV</option>
</select>
            </div>

            <div>
              <div className="mp-label">E-mail</div>
              <input className="mp-input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div>
              <div className="mp-label">Senha</div>
              <input className="mp-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
            <button className="mp-btn mp-btn-primary" onClick={createUser} disabled={loading}>
              Criar usuário
            </button>
            <span className="mp-help" style={{ marginLeft: "auto" }}>
              Endpoint: <b>/api/dev/users</b>
            </span>
          </div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      <div className="mp-card">
        <div className="mp-card-h">
          <div style={{ fontWeight: 900 }}>Usuários cadastrados</div>
          <span className="mp-chip">{rows.length}</span>
        </div>
        <div className="mp-card-b" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ opacity: 0.85 }}>
                <th style={{ textAlign: "left", padding: 10 }}>Nome</th>
                <th style={{ textAlign: "left", padding: 10 }}>Setor</th>
                <th style={{ textAlign: "left", padding: 10 }}>Tipo</th>
                <th style={{ textAlign: "left", padding: 10 }}>E-mail</th>
                <th style={{ textAlign: "left", padding: 10 }}>Ativo</th>
                <th style={{ textAlign: "left", padding: 10 }}>Criado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                  <td style={{ padding: 10, fontWeight: 700 }}>{u.full_name}</td>
                  <td style={{ padding: 10 }}>{u.sector}</td>
                  <td style={{ padding: 10 }}>
                    <span className="mp-chip">{u.user_type}</span>
                  </td>
                  <td style={{ padding: 10 }}>{u.email}</td>
                  <td style={{ padding: 10 }}>{u.is_active ? "Sim" : "Não"}</td>
                  <td style={{ padding: 10, opacity: 0.8 }}>{u.created_at || "-"}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6} style={{ padding: 10, opacity: 0.7 }}>
                    Nenhum usuário.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
