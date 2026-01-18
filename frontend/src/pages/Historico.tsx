import { useEffect, useMemo, useState } from "react";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";

type Mode = "ambos" | "horimetros" | "paradas";

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function parseISODate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function rangeDays(fromYMD: string, toYMD: string) {
  const a = parseISODate(fromYMD);
  const b = parseISODate(toYMD);
  const out: string[] = [];
  let cur = new Date(a);
  while (cur <= b) {
    out.push(ymd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function authHeaders(): Record<string, string> {
  const keys = ["mp_token", "token", "access_token", "auth_token"];
  for (const k of keys) {
    const v = (localStorage.getItem(k) || "").trim();
    if (v) return { Authorization: `Bearer ${v}` };
  }
  return {};
}
async function apiGet<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders(),
  };
  const r = await fetch(`${API_BASE}${path}`, { headers });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText} - ${txt}`);
  }
  return (await r.json()) as T;
}

function fmtNum(v: any, digits = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
function badgeStyle(kind: "ok" | "warn" | "muted" = "muted") {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
    letterSpacing: 0.2,
    border: "1px solid rgba(255,255,255,0.10)",
  };
	if (kind === "ok") return { ...base, background: "rgba(0,204,255,0.14)", color: "rgba(255,255,255,0.92)" };
  if (kind === "warn") return { ...base, background: "rgba(255,159,26,0.16)", color: "rgba(255,255,255,0.92)" };
  return { ...base, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.78)" };
}

type HorimetroItem = {
  id?: string;
  owner_id?: string;
  day?: string;
  equipamento?: string;
  horimetro_ini?: number;
  horimetro_fim?: number;
  turno?: string;
  created_at?: string;
};

type StopItem = {
  id?: string;
  owner_id?: string;
  day?: string;
  data_inicio?: string;
  hora_inicio?: string;
  data_fim?: string;
  hora_fim?: string;
  equipamento?: string;
  tipo?: string;
  atividade?: string;
  descricao?: string;
  tempo_h?: number;
  created_at?: string;
};

function pick(obj: any, keys: string[]) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return null;
}

function joinDateTime(dateStr?: string, timeStr?: string) {
  if (!dateStr) return "";
  const t = (timeStr || "").trim();
  return t ? `${dateStr} ${t}` : dateStr;
}

export default function Historico() {
  const today = useMemo(() => ymd(new Date()), []);
  const [fromDay, setFromDay] = useState(today);
  const [toDay, setToDay] = useState(today);
  const [mode, setMode] = useState<Mode>("ambos");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [hor, setHor] = useState<HorimetroItem[]>([]);
  const [stops, setStops] = useState<StopItem[]>([]);

  const [equip, setEquip] = useState<string>("");
  const [q, setQ] = useState<string>("");

  const days = useMemo(() => rangeDays(fromDay, toDay), [fromDay, toDay]);

  const equipOptions = useMemo(() => {
    const set = new Set<string>();
    hor.forEach((h) => {
      const e = String(h.equipamento || "").trim();
      if (e) set.add(e);
    });
    stops.forEach((s) => {
      const e = String(s.equipamento || "").trim();
      if (e) set.add(e);
    });
    return ["", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [hor, stops]);

  const filteredHor = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return hor
      .filter((h) => (equip ? String(h.equipamento || "").toLowerCase() === equip.toLowerCase() : true))
      .filter((h) => {
        if (!qq) return true;
        const blob = [h.day, h.equipamento, h.turno, h.horimetro_ini, h.horimetro_fim, h.created_at].join(" ").toLowerCase();
        return blob.includes(qq);
      })
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [hor, equip, q]);

  const filteredStops = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return stops
      .filter((s) => (equip ? String(s.equipamento || "").toLowerCase() === equip.toLowerCase() : true))
      .filter((s) => {
        if (!qq) return true;
        const blob = [
          s.day, s.equipamento, s.tipo, s.atividade, s.descricao,
          s.data_inicio, s.hora_inicio, s.data_fim, s.hora_fim, s.tempo_h, s.created_at,
        ].join(" ").toLowerCase();
        return blob.includes(qq);
      })
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [stops, equip, q]);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const wantHor = mode === "ambos" || mode === "horimetros";
      const wantStops = mode === "ambos" || mode === "paradas";

      const horAll: HorimetroItem[] = [];
      const stopAll: StopItem[] = [];

      for (const d of days) {
        if (wantHor) {
          try {
            const hh = await apiGet<any[]>(`/api/horimetros?day=${d}&limit=2000`);
            (hh || []).forEach((x) => {
              horAll.push({
                id: pick(x, ["id"]),
                owner_id: pick(x, ["owner_id"]),
                day: String(pick(x, ["day"]) || d),
                equipamento: String(pick(x, ["equipamento", "equipment", "eq", "tag"]) || ""),
                horimetro_ini: Number(pick(x, ["horimetro_ini", "ini", "inicial"]) ?? NaN),
                horimetro_fim: Number(pick(x, ["horimetro_fim", "fim", "final"]) ?? NaN),
                turno: String(pick(x, ["turno", "shift", "turn"]) || ""),
                created_at: String(pick(x, ["created_at"]) || ""),
              });
            });
          } catch {}
        }

        if (wantStops) {
          try {
            const ss = await apiGet<any[]>(`/api/stops?day=${d}`);
            (ss || []).forEach((x) => {
              stopAll.push({
                id: pick(x, ["id"]),
                owner_id: pick(x, ["owner_id"]),
                day: String(pick(x, ["day"]) || d),
                data_inicio: String(pick(x, ["data_inicio"]) || ""),
                hora_inicio: String(pick(x, ["hora_inicio"]) || ""),
                data_fim: String(pick(x, ["data_fim"]) || ""),
                hora_fim: String(pick(x, ["hora_fim"]) || ""),
                equipamento: String(pick(x, ["equipamento", "equipment", "eq", "tag"]) || ""),
                tipo: String(pick(x, ["tipo", "tipo_parada", "stop_type", "type"]) || ""),
                atividade: String(pick(x, ["atividade", "activity"]) || ""),
                descricao: String(pick(x, ["descricao", "descricao_detalhada", "detail", "detalhe", "obs"]) || ""),
                tempo_h: Number(pick(x, ["tempo_h", "tempo_parada_h", "duration_h", "duracao_h"]) ?? NaN),
                created_at: String(pick(x, ["created_at"]) || ""),
              });
            });
          } catch {}
        }
      }

      setHor(horAll);
      setStops(stopAll);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    const hCount = filteredHor.length;
    const sCount = filteredStops.length;
    const sHours = filteredStops.reduce(
      (acc, s) => acc + (Number.isFinite(Number(s.tempo_h)) ? Number(s.tempo_h) : 0),
      0
    );
    return { hCount, sCount, sHours };
  }, [filteredHor, filteredStops]);

  return (
    <div className="mp-container">
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="mp-chip">Operação</div>
          <div className="mp-page-title">Histórico</div>
          <div className="mp-page-sub">Horímetros e Paradas lançados • filtro por data e por tipo</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={badgeStyle("muted")}>Horímetros: {totals.hCount}</span>
          <span style={badgeStyle("muted")}>Paradas: {totals.sCount}</span>
          <span style={badgeStyle("muted")}>Horas Paradas: {fmtNum(totals.sHours, 2)}</span>
        </div>
      </div>

      <div style={{ height: 14 }} />

      <div className="mp-card">
        <div className="mp-card-h" style={{ alignItems: "center" }}>
          <b>Filtros</b>
          <span className="mp-help">Escolha período e o que deseja visualizar</span>
        </div>

        <div className="mp-card-b">
          <div className="mp-grid-4" style={{ gap: 12 }}>
            <div>
              <div className="mp-help">De</div>
              <input className="mp-input" type="date" value={fromDay} onChange={(e) => setFromDay(e.target.value)} disabled={loading} />
            </div>

            <div>
              <div className="mp-help">Até</div>
              <input className="mp-input" type="date" value={toDay} onChange={(e) => setToDay(e.target.value)} disabled={loading} />
            </div>

            <div>
              <div className="mp-help">Tipo</div>
              <select className="mp-input" value={mode} onChange={(e) => setMode(e.target.value as Mode)} disabled={loading}>
                <option value="ambos">Horímetros + Paradas</option>
                <option value="horimetros">Somente Horímetros</option>
                <option value="paradas">Somente Paradas</option>
              </select>
            </div>

            <div>
              <div className="mp-help">Equipamento</div>
              <select className="mp-input" value={equip} onChange={(e) => setEquip(e.target.value)} disabled={loading}>
                {equipOptions.map((x) => (
                  <option key={x} value={x}>{x ? x : "Todos"}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ height: 10 }} />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <input className="mp-input" placeholder="Buscar (ex.: BT-01, troca correia, 12:30, etc.)" value={q} onChange={(e) => setQ(e.target.value)} disabled={loading} />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="mp-btn" onClick={load} disabled={loading}>{loading ? "Carregando..." : "Aplicar filtros"}</button>
              <button className="mp-btn" onClick={() => { setEquip(""); setQ(""); }} disabled={loading}>Limpar</button>
            </div>
          </div>

          {err ? <div className="mp-error" style={{ marginTop: 10 }}>{err}</div> : null}
        </div>
      </div>

      <div style={{ height: 14 }} />

      {(mode === "ambos" || mode === "horimetros") && (
        <div className="mp-card">
          <div className="mp-card-h" style={{ alignItems: "center" }}>
            <b>Horímetros</b>
            <span className="mp-help">Todos os lançamentos no período</span>
          </div>

          <div className="mp-card-b" style={{ padding: 0 }}>
            <div style={{ width: "100%", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.06)" }}>
                    {["Dia", "Equipamento", "Turno", "Horímetro Inicial", "Horímetro Final", "Criado em"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, color: "rgba(255,255,255,0.70)", borderBottom: "1px solid rgba(255,255,255,0.10)", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredHor.map((x, idx) => (
                    <tr key={`${x.id || idx}`} style={{ background: idx % 2 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>{x.day || ""}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>{x.equipamento || ""}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>
                        <span style={badgeStyle(x.turno ? "ok" : "muted")}>{x.turno || "—"}</span>
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>{fmtNum(x.horimetro_ini, 0)}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>{fmtNum(x.horimetro_fim, 0)}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap", color: "rgba(255,255,255,0.65)" }}>
                        {x.created_at ? String(x.created_at).replace("T", " ").slice(0, 19) : ""}
                      </td>
                    </tr>
                  ))}
                  {!filteredHor.length ? (
                    <tr><td colSpan={6} style={{ padding: 14, color: "rgba(255,255,255,0.60)" }}>Nenhum horímetro no período.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {(mode === "ambos" || mode === "paradas") && (
        <div className="mp-card" style={{ marginTop: 14 }}>
          <div className="mp-card-h" style={{ alignItems: "center" }}>
            <b>Paradas</b>
            <span className="mp-help">Todos os lançamentos no período</span>
          </div>

          <div className="mp-card-b" style={{ padding: 0 }}>
            <div style={{ width: "100%", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.06)" }}>
                    {["Dia", "Equipamento", "Início", "Fim", "Tipo", "Atividade", "Descrição", "Tempo (h)", "Criado em"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, color: "rgba(255,255,255,0.70)", borderBottom: "1px solid rgba(255,255,255,0.10)", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStops.map((x, idx) => (
                    <tr key={`${x.id || idx}`} style={{ background: idx % 2 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>{x.day || ""}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>{x.equipamento || ""}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>{joinDateTime(x.data_inicio, x.hora_inicio)}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>{joinDateTime(x.data_fim, x.hora_fim)}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>
                        <span style={badgeStyle("warn")}>{x.tipo || "—"}</span>
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>{x.atividade || ""}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", minWidth: 220 }}>{x.descricao || ""}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>{fmtNum(x.tempo_h, 2)}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap", color: "rgba(255,255,255,0.65)" }}>
                        {x.created_at ? String(x.created_at).replace("T", " ").slice(0, 19) : ""}
                      </td>
                    </tr>
                  ))}
                  {!filteredStops.length ? (
                    <tr><td colSpan={9} style={{ padding: 14, color: "rgba(255,255,255,0.60)" }}>Nenhuma parada no período.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
