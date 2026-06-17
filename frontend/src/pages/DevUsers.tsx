import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";

type UserType = "apontador" | "controlador" | "gerencia" | "supervisor" | "gestao_vista" | "dev";

type DevUser = {
  id: string;
  full_name: string;
  sector: string;
  user_type: UserType;
  email: string;
  is_active: boolean;
  can_edit_retroactive?: boolean;
  created_at?: string | null;
};

const RAW_API_BASE = ((import.meta as any).env?.VITE_API_BASE || "").toString().trim();
const API_BASE = RAW_API_BASE.replace(/\/+$/, "");

function apiUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE) return p;

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

function normalizeUserType(v: any): UserType {
  const s = String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (s === "dev") return "dev";
  if (s === "gestao_vista" || s === "gestao a vista" || s === "gestaoavista" || s === "gestao-vista") return "gestao_vista";
  if (s === "controlador") return "controlador";
  if (s === "gerencia" || s === "gerência") return "gerencia";
  if (s === "supervisor" || s === "supervisao" || s === "supervisao_planta" || s === "supervisor_planta") {
    return "supervisor";
  }

  return "apontador";
}

function fmtDate(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("pt-BR");
}

function getUserTypeTone(userType?: UserType) {
  const t = String(userType || "").toLowerCase();

  if (t === "dev") {
    return {
      bg: "rgba(168,85,247,.14)",
      bd: "rgba(168,85,247,.28)",
      color: "#d8b4fe",
      label: "Dev",
    };
  }

  if (t === "gerencia") {
    return {
      bg: "rgba(245,158,11,.14)",
      bd: "rgba(245,158,11,.28)",
      color: "#fcd34d",
      label: "Gerência",
    };
  }

  if (t === "supervisor") {
    return {
      bg: "rgba(59,130,246,.14)",
      bd: "rgba(59,130,246,.28)",
      color: "#93c5fd",
      label: "Supervisor",
    };
  }

  if (t === "gestao_vista") {
    return {
      bg: "rgba(14,165,233,.14)",
      bd: "rgba(14,165,233,.30)",
      color: "#7dd3fc",
      label: "Gestão à Vista",
    };
  }

  if (t === "controlador") {
    return {
      bg: "rgba(34,197,94,.14)",
      bd: "rgba(34,197,94,.28)",
      color: "#86efac",
      label: "Controlador",
    };
  }

  return {
    bg: "rgba(148,163,184,.12)",
    bd: "rgba(148,163,184,.20)",
    color: "#cbd5e1",
    label: "Apontador",
  };
}

function getStatusTone(active: boolean) {
  if (active) {
    return {
      bg: "rgba(34,197,94,.14)",
      bd: "rgba(34,197,94,.28)",
      color: "#86efac",
      label: "Ativo",
    };
  }

  return {
    bg: "rgba(239,68,68,.14)",
    bd: "rgba(239,68,68,.28)",
    color: "#fca5a5",
    label: "Inativo",
  };
}

function getRetroTone(enabled: boolean) {
  if (enabled) {
    return {
      bg: "rgba(245,158,11,.16)",
      bd: "rgba(245,158,11,.42)",
      color: "#fed7aa",
      label: "Ativado",
    };
  }

  return {
    bg: "rgba(15,23,42,.72)",
    bd: "rgba(148,163,184,.24)",
    color: "#cbd5e1",
    label: "Desativado",
  };
}

function StatCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,.08)",
        background: "linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015))",
        borderRadius: 18,
        padding: 16,
        minHeight: 88,
        boxShadow: "0 10px 30px rgba(0,0,0,.18)",
      }}
    >
      <div style={{ fontSize: 12, color: "rgba(255,255,255,.58)", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.1 }}>{value}</div>
      {sub ? <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,.48)" }}>{sub}</div> : null}
    </div>
  );
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
      setErr("Preencha nome, setor, e-mail e senha.");
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
          user_type: normalizeUserType(userType),
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


  async function toggleRetroactivePermission(user: DevUser) {
    setErr(null);

    if (!token) {
      setErr("Sem token. Faça login com um usuário DEV.");
      return;
    }

    const nextValue = !Boolean(user.can_edit_retroactive);

    // Atualização otimista para o botão virar na hora.
    setRows((prev) => prev.map((u) => (u.id === user.id ? { ...u, can_edit_retroactive: nextValue } : u)));

    try {
      const res = await fetch(apiUrl(`/api/dev/users/${user.id}`), {
        method: "PATCH",
        headers,
        body: JSON.stringify({ can_edit_retroactive: nextValue }),
      });

      if (!res.ok) throw new Error(await readErr(res));
      await load();
    } catch (e: any) {
      setRows((prev) => prev.map((u) => (u.id === user.id ? { ...u, can_edit_retroactive: !nextValue } : u)));
      setErr(e?.message || "Erro ao alterar permissão retroativa");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const ativos = rows.filter((u) => u.is_active).length;
    const devs = rows.filter((u) => u.user_type === "dev").length;
    const supervisaoGerencia = rows.filter((u) => u.user_type === "supervisor" || u.user_type === "gerencia").length;
    const gestaoVista = rows.filter((u) => u.user_type === "gestao_vista").length;
    const retroativos = rows.filter((u) => Boolean(u.can_edit_retroactive)).length;

    return { total, ativos, devs, supervisaoGerencia, gestaoVista, retroativos };
  }, [rows]);

  return (
    <div style={{ padding: 18 }}>
      <div
        className="mp-card"
        style={{
          borderRadius: 24,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,.08)",
          background:
            "radial-gradient(circle at top right, rgba(59,130,246,.10), transparent 24%), linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015))",
          boxShadow: "0 20px 60px rgba(0,0,0,.22)",
        }}
      >
        <div
          className="mp-card-h"
          style={{
            padding: "18px 18px 8px 18px",
            borderBottom: "1px solid rgba(255,255,255,.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: 30, letterSpacing: 0.2 }}>Usuários do Sistema</div>
            <div style={{ marginTop: 4, color: "rgba(255,255,255,.58)", fontSize: 13 }}>
              Gestão de acessos e perfis internos do MonPlant.
            </div>
          </div>

          <button
            className="mp-btn"
            onClick={load}
            disabled={loading}
            style={{
              minWidth: 120,
              height: 40,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.10)",
              background: loading ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.08)",
              fontWeight: 800,
            }}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        <div className="mp-card-b" style={{ padding: 18 }}>
          {err && (
            <div
              className="mp-error"
              style={{
                marginBottom: 16,
                borderRadius: 14,
                border: "1px solid rgba(239,68,68,.25)",
                background: "rgba(239,68,68,.10)",
                padding: 12,
              }}
            >
              {err}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <StatCard title="Total de usuários" value={stats.total} />
            <StatCard title="Usuários ativos" value={stats.ativos} />
            <StatCard title="Perfis DEV" value={stats.devs} />
            <StatCard title="Permissão retroativa" value={stats.retroativos} />
            <StatCard title="Supervisão / Gerência" value={stats.supervisaoGerencia} />
            <StatCard title="Gestão à Vista" value={stats.gestaoVista} />
          </div>

          <div
            style={{
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,.08)",
              background: "rgba(7,10,18,.42)",
              padding: 16,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,.02)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 14,
              }}
            >
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Novo usuário</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.52)", marginTop: 4 }}>
                  Cadastro manual via endpoint interno <b>/api/dev/users</b>
                </div>
              </div>

              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,.08)",
                  background: "rgba(255,255,255,.04)",
                  color: "rgba(255,255,255,.66)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Somente perfil DEV
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <div>
                <div className="mp-label" style={{ marginBottom: 6 }}>Nome completo</div>
                <input
                  className="mp-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ex.: Rudgere Germano"
                />
              </div>

              <div>
                <div className="mp-label" style={{ marginBottom: 6 }}>Setor</div>
                <input
                  className="mp-input"
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  placeholder="Ex.: Operação / Planta"
                />
              </div>

              <div>
                <div className="mp-label" style={{ marginBottom: 6 }}>Tipo de usuário</div>
                <select
                  className="mp-input"
                  value={userType}
                  onChange={(e) => setUserType(normalizeUserType(e.target.value) as UserType)}
                >
                  <option value="apontador">Apontador</option>
                  <option value="controlador">Controlador</option>
                  <option value="gerencia">Gerência</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="gestao_vista">Gestão à Vista</option>
                  <option value="dev">Dev</option>
                </select>
              </div>

              <div>
                <div className="mp-label" style={{ marginBottom: 6 }}>E-mail</div>
                <input
                  className="mp-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                />
              </div>

              <div>
                <div className="mp-label" style={{ marginBottom: 6 }}>Senha</div>
                <input
                  className="mp-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="mp-btn mp-btn-primary"
                onClick={createUser}
                disabled={loading}
                style={{
                  minWidth: 150,
                  height: 42,
                  borderRadius: 12,
                  fontWeight: 900,
                }}
              >
                {loading ? "Salvando..." : "Criar usuário"}
              </button>

              <span style={{ color: "rgba(255,255,255,.48)", fontSize: 12 }}>
                Perfis permitidos: apontador, controlador, supervisão, gerência, gestão à vista e dev.
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      <div
        className="mp-card"
        style={{
          borderRadius: 24,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,.08)",
          background: "linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015))",
          boxShadow: "0 20px 60px rgba(0,0,0,.20)",
        }}
      >
        <div
          className="mp-card-h"
          style={{
            padding: 18,
            borderBottom: "1px solid rgba(255,255,255,.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Usuários cadastrados</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.52)", marginTop: 4 }}>
              Relação atual de usuários registrados no sistema.
            </div>
          </div>

          <div
            style={{
              padding: "7px 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,.10)",
              background: "rgba(255,255,255,.05)",
              fontWeight: 800,
              fontSize: 12,
              color: "rgba(255,255,255,.86)",
            }}
          >
            {rows.length} registro(s)
          </div>
        </div>

        <div className="mp-card-b" style={{ padding: 18 }}>
          <div
            style={{
              overflowX: "auto",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,.07)",
              background: "rgba(7,10,18,.45)",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                minWidth: 1120,
              }}
            >
              <thead>
                <tr style={{ background: "rgba(255,255,255,.035)" }}>
                  {["Nome", "Setor", "Tipo", "E-mail", "Status", "Retroativo", "Criado em"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "14px 14px",
                        fontSize: 12,
                        color: "rgba(255,255,255,.62)",
                        fontWeight: 800,
                        borderBottom: "1px solid rgba(255,255,255,.06)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map((u, idx) => {
                  const typeTone = getUserTypeTone(u.user_type);
                  const statusTone = getStatusTone(u.is_active);
                  const retroEnabled = Boolean(u.can_edit_retroactive);
                  const retroTone = getRetroTone(retroEnabled);

                  return (
                    <tr
                      key={u.id}
                      style={{
                        background: idx % 2 === 0 ? "rgba(255,255,255,.012)" : "transparent",
                      }}
                    >
                      <td
                        style={{
                          padding: 14,
                          borderBottom: "1px solid rgba(255,255,255,.05)",
                          verticalAlign: "top",
                        }}
                      >
                        <div style={{ fontWeight: 800, color: "#fff" }}>{u.full_name}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,.42)", marginTop: 4 }}>
                          ID: {u.id}
                        </div>
                      </td>

                      <td
                        style={{
                          padding: 14,
                          borderBottom: "1px solid rgba(255,255,255,.05)",
                          verticalAlign: "top",
                          color: "rgba(255,255,255,.82)",
                        }}
                      >
                        {u.sector || "-"}
                      </td>

                      <td
                        style={{
                          padding: 14,
                          borderBottom: "1px solid rgba(255,255,255,.05)",
                          verticalAlign: "top",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "7px 10px",
                            borderRadius: 999,
                            border: `1px solid ${typeTone.bd}`,
                            background: typeTone.bg,
                            color: typeTone.color,
                            fontSize: 12,
                            fontWeight: 800,
                            letterSpacing: 0.2,
                          }}
                        >
                          {typeTone.label}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: 14,
                          borderBottom: "1px solid rgba(255,255,255,.05)",
                          verticalAlign: "top",
                          color: "rgba(255,255,255,.82)",
                        }}
                      >
                        {u.email}
                      </td>

                      <td
                        style={{
                          padding: 14,
                          borderBottom: "1px solid rgba(255,255,255,.05)",
                          verticalAlign: "top",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "7px 10px",
                            borderRadius: 999,
                            border: `1px solid ${statusTone.bd}`,
                            background: statusTone.bg,
                            color: statusTone.color,
                            fontSize: 12,
                            fontWeight: 800,
                            letterSpacing: 0.2,
                          }}
                        >
                          {statusTone.label}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: 14,
                          borderBottom: "1px solid rgba(255,255,255,.05)",
                          verticalAlign: "top",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleRetroactivePermission(u)}
                          disabled={loading}
                          title="Permite lançar e editar dados retroativos"
                          style={{
                            minWidth: 124,
                            height: 32,
                            borderRadius: 10,
                            border: `1px solid ${retroTone.bd}`,
                            background: retroTone.bg,
                            color: retroTone.color,
                            fontSize: 12,
                            fontWeight: 900,
                            cursor: loading ? "not-allowed" : "pointer",
                            opacity: loading ? 0.65 : 1,
                          }}
                        >
                          {retroTone.label}
                        </button>
                      </td>

                      <td
                        style={{
                          padding: 14,
                          borderBottom: "1px solid rgba(255,255,255,.05)",
                          verticalAlign: "top",
                          color: "rgba(255,255,255,.70)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmtDate(u.created_at)}
                      </td>
                    </tr>
                  );
                })}

                {!rows.length && !loading && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: 32,
                        textAlign: "center",
                        color: "rgba(255,255,255,.56)",
                      }}
                    >
                      Nenhum usuário cadastrado.
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: 32,
                        textAlign: "center",
                        color: "rgba(255,255,255,.56)",
                      }}
                    >
                      Carregando usuários...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
