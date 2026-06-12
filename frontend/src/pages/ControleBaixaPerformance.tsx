import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  ClipboardCheck,
  Factory,
  PauseCircle,
  RefreshCcw,
  Target,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_BASE = String((import.meta as any)?.env?.VITE_API_BASE || "http://127.0.0.1:8000").replace(/\/+$/, "");
const DEFAULT_TARGET_TON_PER_HOUR = 250;

type PlantInfo = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
};

type ProductionRow = {
  period: string;
  ton?: number | string | null;
  freq?: number | string | null;
};

type ProductionPayload = {
  day: string;
  plant_id?: number;
  rows?: ProductionRow[];
  obs?: string | null;
  updated_at?: string | null;
};

type StopRow = {
  id?: number;
  period: string;
  ordem?: number;
  equipamento?: string;
  tipo_parada?: string;
  descricao?: string;
  minutos?: number | string | null;
  hora_inicial?: string;
  hora_final?: string;
  justificativa_baixa_producao?: string;
  low_production_reason?: string;
  stop_type?: string;
  description?: string;
  equipment?: string;
  minutes?: number | string | null;
};

type StopPayload = {
  day: string;
  rows?: StopRow[];
  obs?: string | null;
};

type GoalDayPayload = {
  day: string;
  meta_ton?: number | string | null;
  discount_hours?: number | string | null;
};

type StatusKind = "ok" | "lowNoStop" | "lowWithStop" | "empty";

type ControlRow = {
  period: string;
  periodLabel: string;
  ton: number | null;
  diff: number | null;
  hasStop: boolean;
  stopMinutes: number;
  reason: string;
  responsible: string;
  status: StatusKind;
};

function isoTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function makePeriods24(): string[] {
  const res: string[] = [];
  for (let h = 0; h < 24; h++) {
    const h2 = (h + 1) % 24;
    res.push(`${String(h).padStart(2, "0")}:00-${String(h2).padStart(2, "0")}:00`);
  }
  return res;
}

function normalizePeriod(value: string): string {
  const s = String(value || "").trim().replace(/\s+/g, "");
  const match = s.match(/^(\d{1,2})(?::?(\d{2}))?[-–—](\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return s;
  const h1 = String(Math.max(0, Math.min(23, Number(match[1])))).padStart(2, "0");
  const m1 = String(Number(match[2] ?? 0)).padStart(2, "0");
  const h2 = String(Math.max(0, Math.min(23, Number(match[3])))).padStart(2, "0");
  const m2 = String(Number(match[4] ?? 0)).padStart(2, "0");
  return `${h1}:${m1}-${h2}:${m2}`;
}

function periodLabel(period: string): string {
  const [start, end] = normalizePeriod(period).split("-");
  return `${start || "--:--"} às ${end || "--:--"}`;
}

function periodCompact(period: string): string {
  const [start, end] = normalizePeriod(period).split("-");
  return `${start || "--"}\n${end || "--"}`;
}

function parseBRNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;
  let s = String(value).trim();
  if (!s) return null;
  s = s.replace(/\s/g, "").replace("%", "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function fmtBR(value: number, digits = 0): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function authHeaders(): HeadersInit {
  const token = (localStorage.getItem("mp_token") || localStorage.getItem("token") || "").trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (response.status === 404) return {} as T;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

function stopReason(row: StopRow): string {
  return String(row.justificativa_baixa_producao ?? row.low_production_reason ?? "").trim();
}

function rowHasStop(row: StopRow): boolean {
  const minutes = parseBRNumber(row.minutos ?? row.minutes) || 0;
  return (
    minutes > 0 ||
    Boolean(String(row.tipo_parada ?? row.stop_type ?? "").trim()) ||
    Boolean(String(row.descricao ?? row.description ?? "").trim()) ||
    Boolean(String(row.equipamento ?? row.equipment ?? "").trim())
  );
}

function statusLabel(status: StatusKind): string {
  if (status === "ok") return "Dentro da meta";
  if (status === "lowNoStop") return "Abaixo da meta sem parada";
  if (status === "lowWithStop") return "Abaixo da meta com parada";
  return "Sem produção lançada";
}

function statusColor(status: StatusKind): string {
  if (status === "ok") return "#00b7a8";
  if (status === "lowNoStop") return "#ff8a00";
  if (status === "lowWithStop") return "#64707f";
  return "#293241";
}

const cardStyle: CSSProperties = {
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "linear-gradient(180deg, rgba(13,19,27,0.92), rgba(9,13,18,0.88))",
  boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
  backdropFilter: "blur(14px)",
};

const fieldStyle: CSSProperties = {
  height: 46,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.92)",
  padding: "0 12px",
  fontWeight: 850,
  outline: "none",
};

const TonBarLabel = (props: any) => {
  const { x, y, width, value } = props;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;

  return (
    <text
      x={x + width / 2}
      y={Math.max(18, y - 10)}
      textAnchor="middle"
      fill="rgba(255,255,255,0.96)"
      fontSize={13}
      fontWeight={950}
      style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.72)", strokeWidth: 4 }}
    >
      {fmtBR(n)} t
    </text>
  );
};

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ControlRow;
  if (!row) return null;

  return (
    <div
      style={{
        minWidth: 280,
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(7,9,12,0.94)",
        boxShadow: "0 22px 60px rgba(0,0,0,0.50)",
        padding: 14,
        color: "rgba(255,255,255,0.90)",
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      <div style={{ fontWeight: 950, color: "white", marginBottom: 6 }}>{row.periodLabel}</div>
      <div>Produção: <b>{row.ton === null ? "—" : `${fmtBR(row.ton)} t`}</b></div>
      <div>Diferença: <b>{row.diff === null ? "—" : `${row.diff >= 0 ? "+" : ""}${fmtBR(row.diff)} t`}</b></div>
      <div>Parada registrada: <b>{row.hasStop ? "Sim" : "Não"}</b></div>
      <div>Minutos parados: <b>{fmtBR(row.stopMinutes)} min</b></div>
      <div>Motivo CCO: <b>{row.reason || "—"}</b></div>
      <div>Responsável: <b>{row.responsible}</b></div>
    </div>
  );
}

export default function ControleBaixaPerformance() {
  const periods = useMemo(() => makePeriods24(), []);
  const [day, setDay] = useState(isoTodayLocal());
  const [plants, setPlants] = useState<PlantInfo[]>([]);
  const [plantId, setPlantId] = useState<number | null>(null);
  const [productionRows, setProductionRows] = useState<ProductionRow[]>([]);
  const [stopRows, setStopRows] = useState<StopRow[]>([]);
  const [goalDay, setGoalDay] = useState<GoalDayPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function loadPlants() {
    setMsg(null);
    try {
      const list = await apiGet<PlantInfo[]>("/api/plants");
      const active = Array.isArray(list) ? list.filter((p) => p.is_active !== false) : [];
      setPlants(active);
      setPlantId((current) => (current && active.some((p) => Number(p.id) === Number(current)) ? current : active[0]?.id ?? null));
    } catch (error: any) {
      setMsg(error?.message || "Erro ao carregar plantas.");
      setPlants([]);
      setPlantId(null);
    }
  }

  async function loadControlData() {
    if (!plantId) return;
    setLoading(true);
    setMsg(null);
    try {
      const [production, stops, goal] = await Promise.all([
        apiGet<ProductionPayload>(`/api/plants/${plantId}/plant-production/${encodeURIComponent(day)}`),
        apiGet<StopPayload>(`/api/plants/${plantId}/stops-launch?day=${encodeURIComponent(day)}`),
        apiGet<GoalDayPayload>(`/api/plants/${plantId}/goals/day/${encodeURIComponent(day)}`).catch(() => null),
      ]);
      setProductionRows(Array.isArray(production.rows) ? production.rows : []);
      setStopRows(Array.isArray(stops.rows) ? stops.rows : []);
      setGoalDay(goal);
    } catch (error: any) {
      setMsg(error?.message || "Erro ao carregar controle de baixa performance.");
      setProductionRows([]);
      setStopRows([]);
      setGoalDay(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlants();
  }, []);

  useEffect(() => {
    if (plantId) loadControlData();
  }, [plantId, day]);

  const selectedPlantName = useMemo(
    () => plants.find((p) => Number(p.id) === Number(plantId))?.name || "Planta",
    [plants, plantId],
  );

  const targetTon = useMemo(() => {
    const metaTon = parseBRNumber(goalDay?.meta_ton);
    const discountRaw = parseBRNumber(goalDay?.discount_hours);
    const discount = Number.isFinite(discountRaw) ? Number(discountRaw) : 2;
    const productiveHours = Math.max(0, 22 - discount);
    if (metaTon && metaTon > 0 && productiveHours > 0) return metaTon / productiveHours;
    return DEFAULT_TARGET_TON_PER_HOUR;
  }, [goalDay]);

  const controlRows = useMemo<ControlRow[]>(() => {
    const productionMap: Record<string, ProductionRow> = {};
    for (const row of productionRows) {
      const key = normalizePeriod(row.period);
      if (key) productionMap[key] = row;
    }

    const stopsByPeriod: Record<string, StopRow[]> = {};
    for (const row of stopRows) {
      const key = normalizePeriod(row.period);
      if (!key) continue;
      if (!stopsByPeriod[key]) stopsByPeriod[key] = [];
      stopsByPeriod[key].push(row);
    }

    return periods.map((period) => {
      const key = normalizePeriod(period);
      const ton = parseBRNumber(productionMap[key]?.ton);
      const periodStops = stopsByPeriod[key] || [];
      const hasStop = periodStops.some(rowHasStop);
      const stopMinutes = periodStops.reduce((acc, row) => acc + (parseBRNumber(row.minutos ?? row.minutes) || 0), 0);
      const reason = periodStops.map(stopReason).find(Boolean) || "";
      const diff = ton === null ? null : ton - targetTon;
      const status: StatusKind = ton === null || ton <= 0 ? "empty" : ton >= targetTon ? "ok" : hasStop ? "lowWithStop" : "lowNoStop";

      return {
        period: key,
        periodLabel: periodLabel(key),
        ton,
        diff,
        hasStop,
        stopMinutes,
        reason,
        responsible: reason ? "Controlador CCO" : hasStop ? "Lançamento de paradas" : "—",
        status,
      };
    });
  }, [periods, productionRows, stopRows, targetTon]);

  const lowNoStop = controlRows.filter((row) => row.status === "lowNoStop");
  const lowWithStop = controlRows.filter((row) => row.status === "lowWithStop");
  const okRows = controlRows.filter((row) => row.status === "ok");
  const chartMax = Math.max(targetTon + 80, ...controlRows.map((row) => row.ton || 0)) + 20;

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 18,
        color: "rgba(255,255,255,0.92)",
        background:
          "radial-gradient(1000px 680px at 12% 6%, rgba(0,183,168,0.13), transparent 55%), radial-gradient(900px 620px at 88% 18%, rgba(255,138,0,0.10), transparent 55%), linear-gradient(180deg, #06080c 0%, #0a1018 100%)",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 1420, margin: "0 auto" }}>
        <header
          style={{
            ...cardStyle,
            padding: 22,
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 18,
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", gap: 16, alignItems: "center", minWidth: 0 }}>
            <div
              style={{
                height: 62,
                width: 62,
                borderRadius: 22,
                display: "grid",
                placeItems: "center",
                background: "linear-gradient(135deg, rgba(0,183,168,0.24), rgba(255,138,0,0.13))",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <BarChart3 size={32} />
            </div>
            <div>
              <div style={{ color: "rgba(255,255,255,0.58)", fontWeight: 900, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.4 }}>
                Produção horária da planta
              </div>
              <h1 style={{ margin: "4px 0 6px", fontSize: 34, lineHeight: 1, letterSpacing: -1.2 }}>
                Controle de Baixa Performance
              </h1>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.66)", fontWeight: 700 }}>
                Se a produção ficar abaixo de {fmtBR(targetTon)} t/h e não houver parada registrada, o motivo deve ser informado pelo CCO.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <label style={{ display: "grid", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.60)", fontWeight: 900 }}>
              Planta
              <select style={{ ...fieldStyle, minWidth: 220 }} value={plantId ?? ""} onChange={(event) => setPlantId(Number(event.target.value) || null)}>
                {plants.length === 0 ? <option value="">Sem plantas</option> : null}
                {plants.map((plant) => (
                  <option key={plant.id} value={plant.id}>{plant.name}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.60)", fontWeight: 900 }}>
              Data
              <input style={{ ...fieldStyle, minWidth: 160 }} type="date" value={day} onChange={(event) => setDay(event.target.value)} />
            </label>
            <button
              type="button"
              onClick={loadControlData}
              disabled={loading || !plantId}
              style={{
                ...fieldStyle,
                alignSelf: "end",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                cursor: loading ? "wait" : "pointer",
              }}
            >
              <RefreshCcw size={16} /> {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </header>

        {msg ? (
          <div style={{ ...cardStyle, padding: 14, marginBottom: 16, borderColor: "rgba(248,113,113,0.35)", color: "#fecaca", fontWeight: 850 }}>
            {msg}
          </div>
        ) : null}

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 16 }}>
          <div style={{ ...cardStyle, padding: 18, minHeight: 500 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, display: "flex", gap: 10, alignItems: "center" }}>
                  <Factory size={20} color="#00b7a8" /> Produção por faixa horária
                </h2>
                <div style={{ marginTop: 4, color: "rgba(255,255,255,0.58)", fontWeight: 800 }}>
                  {selectedPlantName} • linha de meta: {fmtBR(targetTon)} t/h
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <MetricBadge icon={<BadgeCheck size={17} />} label="Dentro" value={okRows.length} color="#00b7a8" />
                <MetricBadge icon={<AlertTriangle size={17} />} label="Sem parada" value={lowNoStop.length} color="#ff8a00" />
                <MetricBadge icon={<PauseCircle size={17} />} label="Com parada" value={lowWithStop.length} color="#8a94a3" />
              </div>
            </div>

            <div style={{ height: 430 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={controlRows} margin={{ top: 34, right: 20, left: 2, bottom: 34 }}>
                  <CartesianGrid strokeDasharray="4 7" stroke="rgba(255,255,255,0.10)" vertical={false} />
                  <XAxis dataKey="period" tickFormatter={periodCompact} interval={0} tick={{ fill: "rgba(255,255,255,0.66)", fontSize: 11, fontWeight: 800 }} height={48} />
                  <YAxis domain={[0, chartMax]} tick={{ fill: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: 800 }} unit=" t/h" width={66} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                  <ReferenceLine
                    y={targetTon}
                    stroke="#ff5555"
                    strokeWidth={2}
                    strokeDasharray="8 6"
                    label={{ value: `Meta: ${fmtBR(targetTon)} t/h`, fill: "#ffb4b4", fontSize: 12, fontWeight: 950, position: "right" }}
                  />
                  <Bar dataKey="ton" radius={[12, 12, 4, 4]} maxBarSize={38}>
                    {controlRows.map((entry) => (
                      <Cell key={entry.period} fill={statusColor(entry.status)} />
                    ))}
                    <LabelList content={<TonBarLabel />} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <aside style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <div style={{ ...cardStyle, padding: 18 }}>
              <h3 style={{ margin: "0 0 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <ClipboardCheck size={20} color="#a7f3d0" /> Legenda
              </h3>
              <LegendRow color="#00b7a8" title="Dentro da meta" text={`Produção ≥ ${fmtBR(targetTon)} t/h`} />
              <LegendRow color="#ff8a00" title="Abaixo da meta sem parada" text="Produção baixa e sem parada registrada; exige motivo CCO." />
              <LegendRow color="#64707f" title="Abaixo da meta com parada" text="Produção baixa justificada por lançamento de parada." />
            </div>

            <div style={{ ...cardStyle, padding: 18 }}>
              <h3 style={{ margin: "0 0 12px", display: "flex", alignItems: "center", gap: 10 }}>
                <Target size={20} color="#fbbf24" /> Critério
              </h3>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.70)", lineHeight: 1.55, fontWeight: 750 }}>
                Produção menor que {fmtBR(targetTon)} t/h + sem parada registrada = preenchimento obrigatório do motivo pelo controlador do CCO.
              </p>
            </div>
          </aside>
        </section>

        <section style={{ ...cardStyle, padding: 18, marginTop: 16 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 20 }}>Detalhamento por faixa horária</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr style={{ color: "rgba(255,255,255,0.60)", textAlign: "left", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.7 }}>
                  <th style={{ padding: "12px 10px", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Faixa horária</th>
                  <th style={{ padding: "12px 10px", borderBottom: "1px solid rgba(255,255,255,0.10)", textAlign: "right" }}>Produção</th>
                  <th style={{ padding: "12px 10px", borderBottom: "1px solid rgba(255,255,255,0.10)", textAlign: "right" }}>Diferença</th>
                  <th style={{ padding: "12px 10px", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Parada registrada?</th>
                  <th style={{ padding: "12px 10px", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Status</th>
                  <th style={{ padding: "12px 10px", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Motivo CCO</th>
                </tr>
              </thead>
              <tbody>
                {controlRows.map((row) => (
                  <tr key={row.period} style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <td style={{ padding: "13px 10px", fontWeight: 900 }}>{row.periodLabel}</td>
                    <td style={{ padding: "13px 10px", textAlign: "right", fontWeight: 900 }}>{row.ton === null ? "—" : `${fmtBR(row.ton)} t`}</td>
                    <td style={{ padding: "13px 10px", textAlign: "right", color: row.diff === null ? "rgba(255,255,255,0.55)" : row.diff < 0 ? "#fdba74" : "#7dd3fc", fontWeight: 900 }}>
                      {row.diff === null ? "—" : `${row.diff >= 0 ? "+" : ""}${fmtBR(row.diff)} t`}
                    </td>
                    <td style={{ padding: "13px 10px", color: row.hasStop ? "#c4b5fd" : "#86efac", fontWeight: 850 }}>{row.hasStop ? `Sim (${fmtBR(row.stopMinutes)} min)` : "Não"}</td>
                    <td style={{ padding: "13px 10px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "7px 10px", background: `${statusColor(row.status)}22`, color: "white", border: `1px solid ${statusColor(row.status)}66`, fontWeight: 900, fontSize: 12 }}>
                        <span style={{ height: 8, width: 8, borderRadius: 999, background: statusColor(row.status) }} /> {statusLabel(row.status)}
                      </span>
                    </td>
                    <td style={{ padding: "13px 10px", color: row.reason ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.42)", fontWeight: 800 }}>{row.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricBadge({ icon, label, value, color }: { icon: ReactNode; label: string; value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 999, border: `1px solid ${color}55`, background: `${color}18`, padding: "8px 11px", fontWeight: 950 }}>
      <span style={{ color }}>{icon}</span>
      <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function LegendRow({ color, title, text }: { color: string; title: string; text: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "42px 1fr", gap: 12, alignItems: "center", padding: "13px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ height: 42, width: 42, borderRadius: 16, background: color, boxShadow: `0 16px 36px ${color}35`, display: "grid", placeItems: "center" }}>
        <span style={{ height: 12, width: 12, borderRadius: 999, background: "white", opacity: 0.9 }} />
      </div>
      <div>
        <div style={{ fontWeight: 950 }}>{title}</div>
        <div style={{ color: "rgba(255,255,255,0.58)", fontSize: 12, fontWeight: 750, lineHeight: 1.35 }}>{text}</div>
      </div>
    </div>
  );
}
