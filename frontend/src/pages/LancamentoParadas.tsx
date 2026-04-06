import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import { useIsMobile } from "../mobile/useIsMobile";

/**
 * Operação • Lançamento de Paradas
 * - Lança paradas por hora (máx. 60 min por faixa).
 * - Mobile: lista em cards por hora (mais legível no celular).
 * - Desktop: mantém tabela.
 *
 * Endpoints:
 *   GET  /api/stops-launch?day=YYYY-MM-DD
 *   PUT  /api/stops-launch?day=YYYY-MM-DD
 */

type StopRow = {
  period: string;
  equipamento: string;
  tipo_parada: string;
  descricao: string;
  minutos: number;
};

type StopDayPayload = {
  day: string;
  rows: StopRow[];
};

type PlantInfo = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
};

/* helpers */
const API_BASE = String((import.meta as any)?.env?.VITE_API_BASE || "").replace(/\/+$/, "");

function authHeaders(): HeadersInit {
  const t = (localStorage.getItem("mp_token") || localStorage.getItem("token") || "").trim();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: { ...authHeaders() } });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}

function isoTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function makePeriods24(): string[] {
  const res: string[] = [];
  for (let h = 0; h < 24; h++) {
    const h2 = (h + 1) % 24;
    res.push(`${pad2(h)}-${pad2(h2)}`);
  }
  return res;
}
function clamp60(n: number) {
  return Math.max(0, Math.min(60, n));
}
function fmt1(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/* colors */
const TYPE_COLORS: Record<string, string> = {
  Corretiva: "#EF4444",
  Preventiva: "#22C55E",
  Operacional: "#3B82F6",
  Outros: "#94A3B8",
};

function normType(s: any) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
function colorForType(type: any) {
  const t = normType(type);
  if (t.includes("corret")) return TYPE_COLORS.Corretiva;
  if (t.includes("prevent")) return TYPE_COLORS.Preventiva;
  if (t.includes("operac")) return TYPE_COLORS.Operacional;
  if (!t) return TYPE_COLORS.Outros;
  return TYPE_COLORS.Outros;
}

/* donut callouts */
const RAD = Math.PI / 180;
function renderPieCalloutLabel(props: any) {
  const { cx, cy, midAngle, outerRadius, payload, value } = props;
  const rLine = outerRadius + 12;
  const rText = outerRadius + 26;
  const x1 = cx + rLine * Math.cos(-midAngle * RAD);
  const y1 = cy + rLine * Math.sin(-midAngle * RAD);
  const x2 = cx + rText * Math.cos(-midAngle * RAD);
  const y2 = cy + rText * Math.sin(-midAngle * RAD);
  const xMid = x2 + (x2 > cx ? 12 : -12);
  const yMid = y2;

  const hours = Number(value || 0);
  const type = String(payload?.type ?? payload?.name ?? "").trim() || "Outros";
  const stroke = colorForType(type);

  return (
    <g>
      <path d={`M${x1},${y1} L${x2},${y2} L${xMid},${yMid}`} stroke={stroke} strokeWidth={2} fill="none" opacity={0.9} />
      <circle cx={xMid} cy={yMid} r={3} fill={stroke} />
      <text
        x={xMid + (xMid > cx ? 8 : -8)}
        y={yMid}
        textAnchor={xMid > cx ? "start" : "end"}
        dominantBaseline="central"
        fill="rgba(255,255,255,0.92)"
        fontWeight={900}
        fontSize={11}
      >
        {type}: {fmt1(hours)} h
      </text>
    </g>
  );
}

/* UI */
function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        background: color,
        display: "inline-block",
        boxShadow: "0 0 0 2px rgba(0,0,0,0.45)",
      }}
    />
  );
}

const cardStyle: React.CSSProperties = {
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(14,18,22,0.78)",
  padding: 16,
};

const labelStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.55)",
  fontWeight: 900,
  fontSize: 12,
  letterSpacing: 0.2,
  textTransform: "uppercase",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.92)",
  padding: "10px 12px",
  outline: "none",
  fontWeight: 800,
};

const btnStyle: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.90)",
  padding: "10px 12px",
  fontWeight: 900,
  cursor: "pointer",
};

export default function LancamentoParadas() {
  const mobile = useIsMobile();
  const periods = useMemo(() => makePeriods24(), []);
  const [day, setDay] = useState<string>(isoTodayLocal());
  const [plants, setPlants] = useState<PlantInfo[]>([]);
  const [plantId, setPlantId] = useState<number | null>(null);

  const [rows, setRows] = useState<StopRow[]>(
    periods.map((p) => ({
      period: p,
      equipamento: "",
      tipo_parada: "",
      descricao: "",
      minutos: 0,
    }))
  );

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const equipmentOptions = useMemo(
    () => ["BT-01", "BT-02", "PN-01", "PN-02", "EH-08", "EH-04", "Peneiras", "Todos"],
    []
  );
  const stopTypes = useMemo(() => ["Operacional", "Preventiva", "Corretiva"], []);

  async function loadPlants() {
    if (!API_BASE) {
      setMsg("VITE_API_BASE não configurado.");
      return;
    }
    try {
      const data = await apiGet<PlantInfo[]>(`/api/plants`);
      const list = Array.isArray(data) ? data : [];
      setPlants(list);
      setPlantId((current) => {
        if (current && list.some((x) => Number(x.id) === Number(current))) return current;
        return list.length ? Number(list[0].id) : null;
      });
    } catch (e: any) {
      setPlants([]);
      setPlantId(null);
      setMsg(e?.message || "Erro ao carregar plantas");
    }
  }

  async function load() {
    if (!API_BASE) {
      setMsg("VITE_API_BASE não configurado.");
      return;
    }
    setLoading(true);
    setMsg("");

    try {
      if (!plantId) {
        setRows(
          periods.map((p) => ({
            period: p,
            equipamento: "",
            tipo_parada: "",
            descricao: "",
            minutos: 0,
          }))
        );
        setLoading(false);
        return;
      }

      const r = await fetch(`${API_BASE}/api/plants/${plantId}/stops-launch?day=${encodeURIComponent(day)}`, {
        headers: { ...authHeaders() },
      });

      if (r.status === 404) {
        setLoading(false);
        return;
      }

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `HTTP ${r.status}`);
      }

      const data = (await r.json()) as StopDayPayload;
      const map: Record<string, StopRow> = {};
      for (const x of data.rows || []) {
        const p = (x as any).period;
        map[p] = {
          period: p,
          equipamento: (x as any).equipamento ?? (x as any).equipment ?? "",
          tipo_parada: (x as any).tipo_parada ?? (x as any).stop_type ?? "",
          descricao: (x as any).descricao ?? (x as any).description ?? "",
          minutos: Number((x as any).minutos ?? (x as any).minutes ?? 0),
        };
      }

      setRows(
        periods.map((p) => ({
          period: p,
          equipamento: map[p]?.equipamento ?? "",
          tipo_parada: map[p]?.tipo_parada ?? "",
          descricao: map[p]?.descricao ?? "",
          minutos: clamp60(Number(map[p]?.minutos ?? 0)),
        }))
      );
    } catch (e: any) {
      setMsg(e?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!API_BASE) {
      setMsg("VITE_API_BASE não configurado.");
      return;
    }

    setSaving(true);
    setMsg("");

    try {
      if (!plantId) {
        setMsg("Selecione uma planta.");
        return;
      }

      const normalized = rows.map((r) => ({
        ...r,
        minutos: clamp60(Number(r.minutos || 0)),
      }));

      const body: StopDayPayload = { day, rows: normalized };

      const r = await fetch(`${API_BASE}/api/plants/${plantId}/stops-launch?day=${encodeURIComponent(day)}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `HTTP ${r.status}`);
      }

      setMsg("Salvo com sucesso.");
      await load();
    } catch (e: any) {
      setMsg(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadPlants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!plantId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, plantId]);

  const selectedPlantName =
    plants.find((x) => Number(x.id) === Number(plantId))?.name || "Planta";

  const totalMinutes = useMemo(() => rows.reduce((s, r) => s + clamp60(Number(r.minutos || 0)), 0), [rows]);
  const totalHours = totalMinutes / 60;

  const pieData = useMemo(() => {
    const agg: Record<string, number> = {};
    for (const r of rows) {
      const min = clamp60(Number(r.minutos || 0));
      if (min <= 0) continue;
      const tp = (r.tipo_parada || "Outros").trim() || "Outros";
      agg[tp] = (agg[tp] || 0) + min / 60;
    }
    return Object.entries(agg)
      .map(([type, hours]) => ({ type, hours: Number(hours.toFixed(2)) }))
      .sort((a, b) => b.hours - a.hours);
  }, [rows]);

  function updateRow(idx: number, patch: Partial<StopRow>) {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          ...cardStyle,
          display: "flex",
          alignItems: mobile ? "stretch" : "flex-end",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          flexDirection: mobile ? "column" : "row",
        }}
      >
        <div>
          <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 980, fontSize: mobile ? 18 : 20 }}>
            Lançamento de Paradas
          </div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontWeight: 800, marginTop: 2 }}>
            {loading ? "Carregando..." : msg ? msg : `Lance paradas por hora (máx. 60 min por faixa). • ${selectedPlantName}`}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: mobile ? "1fr" : "auto auto auto auto",
            gap: 10,
            alignItems: "end",
            width: mobile ? "100%" : undefined,
          }}
        >
          <div>
            <div style={labelStyle}>Planta</div>
            <select
              value={plantId ?? ""}
              onChange={(e) => setPlantId(e.target.value ? Number(e.target.value) : null)}
              style={inputStyle as any}
              disabled={plants.length === 0}
            >
              {plants.length === 0 ? <option value="">Sem plantas</option> : null}
              {plants.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={labelStyle}>Data</div>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={inputStyle as any} />
          </div>

          <button onClick={load} style={{ ...btnStyle, width: mobile ? "100%" : undefined }} disabled={loading || !plantId}>
            Atualizar
          </button>

          <button
            onClick={save}
            style={{
              ...btnStyle,
              width: mobile ? "100%" : undefined,
              background: "rgba(16,185,129,0.16)",
              borderColor: "rgba(16,185,129,0.35)",
            }}
            disabled={saving || loading || !plantId}
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      <div style={{ ...cardStyle, display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: mobile ? "flex-start" : "center",
            gap: 10,
            flexWrap: "wrap",
            flexDirection: mobile ? "column" : "row",
          }}
        >
          <div>
            <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 950 }}>Horas por tipo de parada</div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontWeight: 800, marginTop: 2 }}>
              Total: {fmt1(totalHours)}h
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              color: "rgba(255,255,255,0.65)",
              fontWeight: 850,
              fontSize: 12,
            }}
          >
            {["Operacional", "Preventiva", "Corretiva", "Elétrica", "Segurança"].map((t) => (
              <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Dot color={colorForType(t)} /> {t}
              </span>
            ))}
          </div>
        </div>

        <div style={{ height: mobile ? 280 : 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="hours"
                nameKey="type"
                innerRadius={mobile ? 54 : 70}
                outerRadius={mobile ? 88 : 115}
                paddingAngle={2}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={1}
                labelLine={false}
                label={renderPieCalloutLabel}
              >
                {pieData.map((entry, idx) => (
                  <Cell key={`c-${idx}`} fill={colorForType(entry.type)} />
                ))}
              </Pie>

              <Tooltip
                contentStyle={{
                  background: "rgba(0,0,0,0.85)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 12,
                }}
                formatter={(v: any) => [`${fmt1(Number(v || 0))} h`, "Horas"]}
                labelFormatter={(l: any) => String(l || "")}
              />
              {!mobile ? (
                <Legend
                  formatter={(value: any) => (
                    <span style={{ color: "rgba(255,255,255,0.72)", fontWeight: 900 }}>{String(value)}</span>
                  )}
                />
              ) : null}
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 950, marginBottom: 10 }}>
          Lançamento por hora (00-01 … 23-00)
        </div>

        {!mobile ? (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 10px", minWidth: 920 }}>
                <thead>
                  <tr style={{ color: "rgba(255,255,255,0.55)", fontWeight: 900, fontSize: 12 }}>
                    <th style={{ textAlign: "left", padding: "0 10px" }}>Hora</th>
                    <th style={{ textAlign: "left", padding: "0 10px" }}>Equipamento</th>
                    <th style={{ textAlign: "left", padding: "0 10px" }}>Tipo</th>
                    <th style={{ textAlign: "left", padding: "0 10px" }}>Descrição</th>
                    <th style={{ textAlign: "left", padding: "0 10px" }}>Minutos (0–60)</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((r, idx) => {
                    const c = colorForType(r.tipo_parada);
                    return (
                      <tr key={r.period} style={{ background: "rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "10px 10px", color: "rgba(255,255,255,0.85)", fontWeight: 950 }}>{r.period}</td>
                        <td style={{ padding: "10px 10px" }}>
                          <select style={inputStyle} value={r.equipamento} onChange={(e) => updateRow(idx, { equipamento: e.target.value })}>
                            <option value="">—</option>
                            {equipmentOptions.map((x) => <option key={x} value={x}>{x}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: "10px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Dot color={c} />
                            <select style={inputStyle} value={r.tipo_parada} onChange={(e) => updateRow(idx, { tipo_parada: e.target.value })}>
                              <option value="">—</option>
                              {stopTypes.map((x) => <option key={x} value={x}>{x}</option>)}
                            </select>
                          </div>
                        </td>
                        <td style={{ padding: "10px 10px" }}>
                          <input
                            style={inputStyle}
                            value={r.descricao}
                            onChange={(e) => updateRow(idx, { descricao: e.target.value })}
                            placeholder="Ex.: troca de correia / limpeza / ajuste / etc."
                          />
                        </td>
                        <td style={{ padding: "10px 10px" }}>
                          <input
                            style={inputStyle}
                            type="number"
                            min={0}
                            max={60}
                            value={String(r.minutos ?? 0)}
                            onChange={(e) => updateRow(idx, { minutos: clamp60(Number(e.target.value) || 0) })}
                            placeholder="0-60"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {rows.map((r, idx) => {
              const c = colorForType(r.tipo_parada);
              return (
                <div
                  key={r.period}
                  style={{
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.04)",
                    padding: 12,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 950 }}>{r.period}</div>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.72)", fontWeight: 850, fontSize: 12 }}>
                      <Dot color={c} /> {r.tipo_parada || "—"}
                    </div>
                  </div>

                  <div>
                    <div style={labelStyle}>Equipamento</div>
                    <select style={inputStyle} value={r.equipamento} onChange={(e) => updateRow(idx, { equipamento: e.target.value })}>
                      <option value="">—</option>
                      {equipmentOptions.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>

                  <div>
                    <div style={labelStyle}>Tipo</div>
                    <select style={inputStyle} value={r.tipo_parada} onChange={(e) => updateRow(idx, { tipo_parada: e.target.value })}>
                      <option value="">—</option>
                      {stopTypes.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>

                  <div>
                    <div style={labelStyle}>Descrição</div>
                    <input
                      style={inputStyle}
                      value={r.descricao}
                      onChange={(e) => updateRow(idx, { descricao: e.target.value })}
                      placeholder="Ex.: troca de correia / limpeza / ajuste / etc."
                    />
                  </div>

                  <div>
                    <div style={labelStyle}>Minutos (0-60)</div>
                    <input
                      style={inputStyle}
                      type="number"
                      min={0}
                      max={60}
                      value={String(r.minutos ?? 0)}
                      onChange={(e) => updateRow(idx, { minutos: clamp60(Number(e.target.value) || 0) })}
                      placeholder="0-60"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 10, color: "rgba(255,255,255,0.55)", fontWeight: 850, fontSize: 12 }}>
          Obs.: o campo minutos é limitado em <b>60</b> por faixa horária.
        </div>
      </div>
    </div>
  );
}
