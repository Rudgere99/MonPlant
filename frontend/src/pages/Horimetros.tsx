import { useEffect, useMemo, useState } from "react";

type Turno = 1 | 2;

type HorimetroRow = {
  id: number;
  day: string; // yyyy-mm-dd
  turno: Turno;
  equipamento: string;
  horimetro: number;
  obs?: string | null;
  created_at?: string | null;
};

const EQUIPAMENTOS = ["BT-01", "BT-02", "PN-01", "PN-02"] as const;

/* ===================== helpers ===================== */
function isoTodayLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseBRNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  let s = String(v).trim();
  if (!s) return null;

  s = s.replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmtBR(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
}

function brDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/* ===================== API ===================== */
const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

function authHeaders(): HeadersInit {
  const keys = ["mp_token", "token", "access_token", "auth_token"];
  for (const k of keys) {
    const v = (localStorage.getItem(k) || "").trim();
    if (v) return { Authorization: `Bearer ${v}` };
  }
  return {};
}

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}

async function apiPost<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}

async function apiDelete(path: string): Promise<void> {
  const r = await fetch(`${API_BASE}${path}`, { method: "DELETE", headers: authHeaders() });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
}

/* ===================== page ===================== */
export default function Horimetros() {
  // filtros
  const [fDay, setFDay] = useState<string>(isoTodayLocal());
  const [fTurno, setFTurno] = useState<Turno | "ALL">(1);
  const [fEq, setFEq] = useState<string | "ALL">("ALL");

  // lançamento
  const [day, setDay] = useState<string>(isoTodayLocal());
  const [turno, setTurno] = useState<Turno>(1);
  const [equipamento, setEquipamento] = useState<string>(EQUIPAMENTOS[0]);
  const [horimetro, setHorimetro] = useState<string>("");
  const [obs, setObs] = useState<string>("");

  const [rows, setRows] = useState<HorimetroRow[]>([]);
  const [lastByEq, setLastByEq] = useState<Record<string, HorimetroRow | null>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadLastByEq() {
    try {
      const data = await apiGet<any[]>(`/api/horimetros/last-by-eq`);
      const map: Record<string, HorimetroRow | null> = {};
      for (const eq of EQUIPAMENTOS) map[eq] = null;
      for (const r of data || []) {
        if (!r?.equipamento) continue;
        map[r.equipamento] = r as HorimetroRow;
      }
      setLastByEq(map);
    } catch {
      const map: Record<string, HorimetroRow | null> = {};
      for (const eq of EQUIPAMENTOS) map[eq] = null;
      setLastByEq(map);
    }
  }

  async function loadFiltered() {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (fDay) qs.set("day", fDay);
      if (fTurno !== "ALL") qs.set("turno", String(fTurno));
      if (fEq !== "ALL") qs.set("equipamento", String(fEq));

      const data = await apiGet<HorimetroRow[]>(`/api/horimetros?${qs.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar horímetros");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLastByEq();
    loadFiltered();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadFiltered();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fDay, fTurno, fEq]);

  const filtered = useMemo(() => {
    return [...rows].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [rows]);

  async function addRow() {
    setErr(null);

    if (!day || !equipamento) {
      setErr("Informe a data e selecione o equipamento.");
      return;
    }

    const n = parseBRNumber(horimetro);
    if (n === null || n < 0) {
      setErr("Horímetro inválido. Ex: 1234,5");
      return;
    }

    try {
      setLoading(true);
      await apiPost<HorimetroRow>(`/api/horimetros`, {
        day,
        turno,
        equipamento,
        horimetro: n,
        obs: obs || "",
      });

      // atualiza telas
      await loadLastByEq();
      await loadFiltered();

      // ajusta filtros pra mostrar o que lançou
      setFDay(day);
      setFTurno(turno);
      setFEq(equipamento);

      setHorimetro("");
      setObs("");
    } catch (e: any) {
      setErr(e?.message || "Falha ao salvar horímetro");
    } finally {
      setLoading(false);
    }
  }

  async function removeRow(id: number) {
    try {
      setLoading(true);
      await apiDelete(`/api/horimetros/${id}`);
      await loadLastByEq();
      await loadFiltered();
    } catch (e: any) {
      setErr(e?.message || "Falha ao excluir");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mp-container px-4 py-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mp-chip">Operação</div>
          <div className="mp-page-title">Horímetros</div>
          <div className="mp-page-sub">Histórico + filtros + lançamento (Postgres)</div>
        </div>

        <button className="mp-btn" onClick={() => { loadLastByEq(); loadFiltered(); }} disabled={loading}>
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {/* resumo rápido */}
      <div className="mp-card mt-4">
        <div className="mp-card-h">
          <b>Último horímetro por equipamento</b>
          <span className="mp-help">Último registro encontrado no banco</span>
        </div>
        <div className="mp-card-b">
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            {EQUIPAMENTOS.map((eq) => {
              const r = lastByEq?.[eq] || null;
              return (
                <div
                  key={eq}
                  style={{
                    borderRadius: 16,
                    padding: 12,
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid rgba(255,255,255,.10)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>{eq}</div>
                    <span className="mp-chip">{r ? fmtBR(r.horimetro) : "—"}</span>
                  </div>
                  <div className="mp-help" style={{ marginTop: 6 }}>
                    {r ? `Dia ${brDate(r.day)} • Turno ${r.turno}` : "Sem registros ainda"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* lançamento */}
      <div className="mp-card mt-4">
        <div className="mp-card-h">
          <b>Novo lançamento</b>
          <span className="mp-help">Salva no banco</span>
        </div>
        <div className="mp-card-b">
          {err && <div className="mp-error">{err}</div>}

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignItems: "end" }}>
            <div>
              <div className="mp-label">Data</div>
              <input className="mp-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>

            <div>
              <div className="mp-label">Turno</div>
              <select className="mp-input" value={turno} onChange={(e) => setTurno(Number(e.target.value) as Turno)}>
                <option value={1}>Turno 1</option>
                <option value={2}>Turno 2</option>
              </select>
            </div>

            <div>
              <div className="mp-label">Equipamento</div>
              <select className="mp-input" value={equipamento} onChange={(e) => setEquipamento(e.target.value)}>
                {EQUIPAMENTOS.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="mp-label">Horímetro</div>
              <input
                className="mp-input"
                value={horimetro}
                onChange={(e) => setHorimetro(e.target.value)}
                placeholder="Ex: 1234,5"
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div className="mp-label">Observação</div>
              <textarea className="mp-textarea" value={obs} onChange={(e) => setObs(e.target.value)} style={{ minHeight: 90 }} />
            </div>

            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
              <button className="mp-btn mp-btn-primary" onClick={addRow} disabled={loading}>
                {loading ? "Salvando..." : "Salvar horímetro"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* filtros */}
      <div className="mp-card mt-4">
        <div className="mp-card-h">
          <b>Filtros</b>
          <span className="mp-help">Pesquisa no histórico</span>
        </div>
        <div className="mp-card-b">
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignItems: "end" }}>
            <div>
              <div className="mp-label">Data</div>
              <input className="mp-input" type="date" value={fDay} onChange={(e) => setFDay(e.target.value)} />
            </div>

            <div>
              <div className="mp-label">Turno</div>
              <select
                className="mp-input"
                value={fTurno}
                onChange={(e) => setFTurno((e.target.value === "ALL" ? "ALL" : Number(e.target.value)) as any)}
              >
                <option value="ALL">Todos</option>
                <option value={1}>Turno 1</option>
                <option value={2}>Turno 2</option>
              </select>
            </div>

            <div>
              <div className="mp-label">Equipamento</div>
              <select className="mp-input" value={fEq} onChange={(e) => setFEq(e.target.value)}>
                <option value="ALL">Todos</option>
                {EQUIPAMENTOS.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>

            <div className="mp-help" style={{ marginLeft: "auto" }}>
              {loading ? "Carregando..." : <>Resultado: <b>{filtered.length}</b> registro(s)</>}
            </div>
          </div>
        </div>
      </div>

      {/* tabela */}
      <div className="mp-card mt-4">
        <div className="mp-card-h">
          <b>Histórico</b>
          <span className="mp-help">Exclusão remove do Postgres</span>
        </div>

        <div className="mp-card-b" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                {["Data", "Turno", "Equipamento", "Horímetro", "Observação", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "10px 10px",
                      fontSize: 12,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,.55)",
                      borderBottom: "1px solid rgba(255,255,255,.10)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="mp-help" style={{ padding: 14 }}>
                    Nenhum horímetro encontrado com estes filtros.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td style={td}>{brDate(r.day)}</td>
                    <td style={td}>{r.turno}</td>
                    <td style={td}><span className="mp-chip">{r.equipamento}</span></td>
                    <td style={td}><b>{fmtBR(r.horimetro)}</b></td>
                    <td style={{ ...td, maxWidth: 520, whiteSpace: "normal" }}>
                      <div style={{ color: "rgba(255,255,255,.82)" }}>{r.obs || "—"}</div>
                    </td>
                    <td style={td}>
                      <button
                        className="mp-btn"
                        onClick={() => removeRow(r.id)}
                        disabled={loading}
                        style={{
                          height: 34,
                          padding: "0 10px",
                          borderRadius: 12,
                          border: "1px solid rgba(251,113,133,.30)",
                          background: "rgba(251,113,133,.12)",
                        }}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="mp-help" style={{ marginTop: 10 }}>
            * Agora está 100% no backend/Postgres.
          </div>
        </div>
      </div>
    </div>
  );
}

const td: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(255,255,255,.06)",
  verticalAlign: "top",
  whiteSpace: "nowrap",
  color: "rgba(255,255,255,.85)",
};
