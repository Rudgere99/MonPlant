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
  return n.toLocaleString("pt-BR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function fmtDateTime(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).replace("T", " ").slice(0, 19);
  return d.toLocaleString("pt-BR");
}

function badgeStyle(kind: "ok" | "warn" | "muted" | "info" = "muted"): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: 0.2,
    border: "1px solid rgba(255,255,255,0.10)",
    whiteSpace: "nowrap",
  };

  if (kind === "ok") {
    return {
      ...base,
      background: "rgba(34,197,94,0.14)",
      border: "1px solid rgba(34,197,94,0.28)",
      color: "#86efac",
    };
  }

  if (kind === "warn") {
    return {
      ...base,
      background: "rgba(245,158,11,0.14)",
      border: "1px solid rgba(245,158,11,0.28)",
      color: "#fcd34d",
    };
  }

  if (kind === "info") {
    return {
      ...base,
      background: "rgba(59,130,246,0.14)",
      border: "1px solid rgba(59,130,246,0.28)",
      color: "#93c5fd",
    };
  }

  return {
    ...base,
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.78)",
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
      <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.1 }}>{value}</div>
      {sub ? <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,.48)" }}>{sub}</div> : null}
    </div>
  );
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
        const blob = [h.day, h.equipamento, h.turno, h.horimetro_ini, h.horimetro_fim, h.created_at]
          .join(" ")
          .toLowerCase();
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
          s.day,
          s.equipamento,
          s.tipo,
          s.atividade,
          s.descricao,
          s.data_inicio,
          s.hora_inicio,
          s.data_fim,
          s.hora_fim,
          s.tempo_h,
          s.created_at,
        ]
          .join(" ")
          .toLowerCase();
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
      setErr(e?.message || "Erro ao carregar histórico");
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
    const sHours = filteredStops.reduce((acc, s) => acc + (Number.isFinite(Number(s.tempo_h)) ? Number(s.tempo_h) : 0), 0);
    return { hCount, sCount, sHours };
  }, [filteredHor, filteredStops]);

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
            <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: 0.2 }}>Histórico Operacional</div>
            <div style={{ marginTop: 4, color: "rgba(255,255,255,.58)", fontSize: 13 }}>
              Consulta de horímetros e paradas lançadas no sistema MonPlant.
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
            <StatCard title="Horímetros" value={totals.hCount} />
            <StatCard title="Paradas" value={totals.sCount} />
            <StatCard title="Horas paradas" value={fmtNum(totals.sHours, 2)} />
            <StatCard title="Período" value={`${days.length}`} sub={days.length === 1 ? "1 dia selecionado" : `${days.length} dias selecionados`} />
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
                <div style={{ fontWeight: 900, fontSize: 16 }}>Filtros de consulta</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.52)", marginTop: 4 }}>
                  Selecione período, tipo de lançamento e equipamento.
                </div>
              </div>

              <div style={badgeStyle("muted")}>
                {mode === "ambos" ? "Horímetros + Paradas" : mode === "horimetros" ? "Somente Horímetros" : "Somente Paradas"}
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
                <div className="mp-label" style={{ marginBottom: 6 }}>De</div>
                <input className="mp-input" type="date" value={fromDay} onChange={(e) => setFromDay(e.target.value)} disabled={loading} />
              </div>

              <div>
                <div className="mp-label" style={{ marginBottom: 6 }}>Até</div>
                <input className="mp-input" type="date" value={toDay} onChange={(e) => setToDay(e.target.value)} disabled={loading} />
              </div>

              <div>
                <div className="mp-label" style={{ marginBottom: 6 }}>Tipo</div>
                <select className="mp-input" value={mode} onChange={(e) => setMode(e.target.value as Mode)} disabled={loading}>
                  <option value="ambos">Horímetros + Paradas</option>
                  <option value="horimetros">Somente Horímetros</option>
                  <option value="paradas">Somente Paradas</option>
                </select>
              </div>

              <div>
                <div className="mp-label" style={{ marginBottom: 6 }}>Equipamento</div>
                <select className="mp-input" value={equip} onChange={(e) => setEquip(e.target.value)} disabled={loading}>
                  {equipOptions.map((x) => (
                    <option key={x} value={x}>
                      {x ? x : "Todos"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              style={{
                marginTop: 14,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ flex: 1, minWidth: 260 }}>
                <input
                  className="mp-input"
                  placeholder="Buscar por equipamento, atividade, descrição, turno, horário..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  className="mp-btn mp-btn-primary"
                  onClick={load}
                  disabled={loading}
                  style={{ minWidth: 150, height: 42, borderRadius: 12, fontWeight: 900 }}
                >
                  {loading ? "Carregando..." : "Aplicar filtros"}
                </button>

                <button
                  className="mp-btn"
                  onClick={() => {
                    setEquip("");
                    setQ("");
                  }}
                  disabled={loading}
                  style={{ minWidth: 120, height: 42, borderRadius: 12, fontWeight: 800 }}
                >
                  Limpar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {(mode === "ambos" || mode === "horimetros") && (
        <div
          className="mp-card"
          style={{
            marginTop: 14,
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
              <div style={{ fontWeight: 900, fontSize: 18 }}>Horímetros</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.52)", marginTop: 4 }}>
                Todos os lançamentos encontrados no período selecionado.
              </div>
            </div>

            <div style={badgeStyle("info")}>{filteredHor.length} registro(s)</div>
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
                  minWidth: 980,
                }}
              >
                <thead>
                  <tr style={{ background: "rgba(255,255,255,.035)" }}>
                    {["Dia", "Equipamento", "Turno", "Horímetro Inicial", "Horímetro Final", "Criado em"].map((h) => (
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
                  {filteredHor.map((x, idx) => (
                    <tr
                      key={`${x.id || idx}`}
                      style={{
                        background: idx % 2 === 0 ? "rgba(255,255,255,.012)" : "transparent",
                      }}
                    >
                      <td style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,.05)", whiteSpace: "nowrap" }}>
                        {x.day || "-"}
                      </td>
                      <td style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,.05)", whiteSpace: "nowrap", color: "rgba(255,255,255,.86)" }}>
                        {x.equipamento || "-"}
                      </td>
                      <td style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,.05)", whiteSpace: "nowrap" }}>
                        <span style={badgeStyle(x.turno ? "ok" : "muted")}>{x.turno || "—"}</span>
                      </td>
                      <td style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,.05)", whiteSpace: "nowrap" }}>
                        {fmtNum(x.horimetro_ini, 0)}
                      </td>
                      <td style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,.05)", whiteSpace: "nowrap" }}>
                        {fmtNum(x.horimetro_fim, 0)}
                      </td>
                      <td style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,.05)", whiteSpace: "nowrap", color: "rgba(255,255,255,.65)" }}>
                        {fmtDateTime(x.created_at)}
                      </td>
                    </tr>
                  ))}

                  {!filteredHor.length && !loading && (
                    <tr>
                      <td colSpan={6} style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,.56)" }}>
                        Nenhum horímetro encontrado no período.
                      </td>
                    </tr>
                  )}

                  {loading && (
                    <tr>
                      <td colSpan={6} style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,.56)" }}>
                        Carregando horímetros...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {(mode === "ambos" || mode === "paradas") && (
        <div
          className="mp-card"
          style={{
            marginTop: 14,
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
              <div style={{ fontWeight: 900, fontSize: 18 }}>Paradas</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.52)", marginTop: 4 }}>
                Todos os lançamentos encontrados no período selecionado.
              </div>
            </div>

            <div style={badgeStyle("warn")}>{filteredStops.length} registro(s)</div>
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
                  minWidth: 1320,
                }}
              >
                <thead>
                  <tr style={{ background: "rgba(255,255,255,.035)" }}>
                    {["Dia", "Equipamento", "Início", "Fim", "Tipo", "Atividade", "Descrição", "Tempo (h)", "Criado em"].map((h) => (
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
                  {filteredStops.map((x, idx) => (
                    <tr
                      key={`${x.id || idx}`}
                      style={{
                        background: idx % 2 === 0 ? "rgba(255,255,255,.012)" : "transparent",
                      }}
                    >
                      <td style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,.05)", whiteSpace: "nowrap" }}>
                        {x.day || "-"}
                      </td>
                      <td style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,.05)", whiteSpace: "nowrap", color: "rgba(255,255,255,.86)" }}>
                        {x.equipamento || "-"}
                      </td>
                      <td style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,.05)", whiteSpace: "nowrap" }}>
                        {joinDateTime(x.data_inicio, x.hora_inicio) || "-"}
                      </td>
                      <td style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,.05)", whiteSpace: "nowrap" }}>
                        {joinDateTime(x.data_fim, x.hora_fim) || "-"}
                      </td>
                      <td style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,.05)", whiteSpace: "nowrap" }}>
                        <span style={badgeStyle("warn")}>{x.tipo || "—"}</span>
                      </td>
                      <td style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,.05)", whiteSpace: "nowrap", color: "rgba(255,255,255,.82)" }}>
                        {x.atividade || "-"}
                      </td>
                      <td style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,.05)", minWidth: 260, color: "rgba(255,255,255,.74)" }}>
                        {x.descricao || "-"}
                      </td>
                      <td style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,.05)", whiteSpace: "nowrap" }}>
                        {fmtNum(x.tempo_h, 2)}
                      </td>
                      <td style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,.05)", whiteSpace: "nowrap", color: "rgba(255,255,255,.65)" }}>
                        {fmtDateTime(x.created_at)}
                      </td>
                    </tr>
                  ))}

                  {!filteredStops.length && !loading && (
                    <tr>
                      <td colSpan={9} style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,.56)" }}>
                        Nenhuma parada encontrada no período.
                      </td>
                    </tr>
                  )}

                  {loading && (
                    <tr>
                      <td colSpan={9} style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,.56)" }}>
                        Carregando paradas...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
