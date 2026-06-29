import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import html2canvas from "html2canvas";
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  ClipboardCheck,
  Download,
  Factory,
  FileImage,
  PauseCircle,
  RefreshCcw,
  Target,
  X,
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

function brDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
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
  const startHour = (start || "--:--").slice(0, 2);
  const endHour = (end || "--:--").slice(0, 2);
  return `${startHour}-${endHour}`;
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
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);

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

  async function exportJPEG() {
    const el = exportRef.current;
    if (!el) return;

    try {
      const active = document.activeElement as HTMLElement | null;
      active?.blur?.();
    } catch {
      // ignore
    }

    const canvas = await html2canvas(el, {
      backgroundColor: "#0b0f14",
      scale: Math.min(2, window.devicePixelRatio || 1.5),
      useCORS: true,
    });

    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `controle_performance_${selectedPlantName.replace(/\s+/g, "_").toLowerCase()}_${day}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
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
    const productiveHours = Math.max(0, 24 - discount);
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
                Controle de Performance
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
              onClick={() => setExportOpen(true)}
              disabled={!plantId}
              style={{
                ...fieldStyle,
                alignSelf: "end",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                cursor: !plantId ? "not-allowed" : "pointer",
              }}
            >
              <FileImage size={16} /> Exportar
            </button>
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
                <BarChart data={controlRows} margin={{ top: 34, right: 20, left: 2, bottom: 46 }}>
                  <CartesianGrid strokeDasharray="4 7" stroke="rgba(255,255,255,0.10)" vertical={false} />
                  <XAxis
                    dataKey="period"
                    tickFormatter={periodCompact}
                    interval={0}
                    minTickGap={0}
                    tickMargin={12}
                    height={54}
                    tick={{ fill: "rgba(255,255,255,0.66)", fontSize: 10, fontWeight: 800 }}
                  />
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

      {exportOpen ? (
        <div style={modalOverlay} onClick={() => setExportOpen(false)}>
          <div style={modalCard} onClick={(event) => event.stopPropagation()}>
            <div style={modalHeader}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 950, fontSize: 16, color: "rgba(255,255,255,0.92)" }}>
                  Exportação • Controle de Performance
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>
                  Visualização do gráfico com justificativas conectadas às barras laranja e cinza.
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button className="mp-btn mp-btn-primary" style={{ height: 38 }} onClick={exportJPEG}>
                  <Download size={16} /> Exportar JPEG
                </button>
                <button className="mp-btn" style={{ height: 38, display: "inline-flex", alignItems: "center", gap: 8 }} onClick={() => setExportOpen(false)}>
                  <X size={16} /> Fechar
                </button>
              </div>
            </div>

            <div style={modalBody}>
              <div style={previewShell}>
                <div ref={exportRef} style={previewCapture}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 16, alignItems: "flex-start" }}>
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.56)", fontWeight: 900, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2 }}>
                        Produção horária da planta
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 950, color: "white", lineHeight: 1.05, marginTop: 4 }}>
                        Controle de Performance • {selectedPlantName}
                      </div>
                      <div style={{ marginTop: 6, color: "rgba(255,255,255,0.62)", fontWeight: 800, fontSize: 13 }}>
                        {brDate(day)} • Meta horária: {fmtBR(targetTon)} t/h
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <ExportStatPill label="Dentro" value={okRows.length} color="#00b7a8" />
                      <ExportStatPill label="Sem parada" value={lowNoStop.length} color="#ff8a00" />
                      <ExportStatPill label="Com parada" value={lowWithStop.length} color="#8a94a3" />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "240px minmax(0, 1fr)", gap: 14, alignItems: "stretch" }}>
                    <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
                      <ExportInfoCard
                        title="Critério"
                        text={`Produção menor que ${fmtBR(targetTon)} t/h sem parada registrada exige lançamento do motivo pelo CCO.`}
                        accent="#fbbf24"
                      />
                      <ExportInfoCard
                        title="Observação"
                        text="Barras cinza indicam baixa produção com parada registrada. Barras laranja indicam baixa produção sem parada registrada."
                        accent="#a78bfa"
                      />
                      <ExportInfoCard
                        title="Leitura rápida"
                        text="Os horários críticos ficam detalhados abaixo do gráfico para facilitar a leitura do relatório."
                        accent="#22d3ee"
                      />
                    </div>

                    <div style={previewChartCard}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 12, alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 900, color: "white", fontSize: 18 }}>Produção por faixa horária</div>
                          <div style={{ color: "rgba(255,255,255,0.58)", fontWeight: 800, fontSize: 12 }}>
                            Barras coloridas por status e justificativas detalhadas abaixo.
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 850, color: "rgba(255,255,255,0.72)" }}>
                          <span style={legendMiniDot("#00b7a8")}>Dentro</span>
                          <span style={legendMiniDot("#ff8a00")}>Sem parada</span>
                          <span style={legendMiniDot("#64707f")}>Com parada</span>
                        </div>
                      </div>

                      <div style={{ height: 430 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={controlRows} margin={{ top: 24, right: 8, left: 0, bottom: 40 }}>
                            <CartesianGrid strokeDasharray="4 7" stroke="rgba(255,255,255,0.10)" vertical={false} />
                            <XAxis
                              dataKey="period"
                              tickFormatter={periodCompact}
                              interval={0}
                              minTickGap={0}
                              tickMargin={12}
                              height={52}
                              tick={{ fill: "rgba(255,255,255,0.70)", fontSize: 10, fontWeight: 800 }}
                            />
                            <YAxis domain={[0, chartMax]} tick={{ fill: "rgba(255,255,255,0.64)", fontSize: 12, fontWeight: 800 }} unit=" t/h" width={68} />
                            <ReferenceLine
                              y={targetTon}
                              stroke="#ff5555"
                              strokeWidth={2}
                              strokeDasharray="8 6"
                              label={{ value: `Meta: ${fmtBR(targetTon)} t/h`, fill: "#ffb4b4", fontSize: 12, fontWeight: 950, position: "right" }}
                            />
                            <Bar dataKey="ton" radius={[10, 10, 4, 4]} maxBarSize={34}>
                              {controlRows.map((entry) => (
                                <Cell key={`export-${entry.period}`} fill={statusColor(entry.status)} />
                              ))}
                              <LabelList content={<TonBarLabel />} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <PerformanceFlowMap rows={controlRows} />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
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

function ExportStatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        borderRadius: 999,
        padding: "8px 12px",
        border: `1px solid ${color}55`,
        background: `${color}18`,
        color: "rgba(255,255,255,0.94)",
        fontWeight: 900,
        fontSize: 12,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, boxShadow: `0 0 18px ${color}` }} />
      {label}
      <span style={{ color: "white" }}>{value}</span>
    </div>
  );
}

function ExportInfoCard({ title, text, accent }: { title: string; text: string; accent: string }) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: `1px solid ${accent}35`,
        background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03))",
        padding: 14,
        boxShadow: `0 16px 38px ${accent}10`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: accent }} />
        <div style={{ fontWeight: 900, color: "white" }}>{title}</div>
      </div>
      <div style={{ color: "rgba(255,255,255,0.68)", lineHeight: 1.45, fontSize: 13, fontWeight: 760 }}>{text}</div>
    </div>
  );
}

function legendMiniDot(color: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    padding: "6px 10px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    position: "relative",
  };
}

function PerformanceFlowMap({ rows }: { rows: ControlRow[] }) {
  const lowRows = rows.filter((row) => row.status === "lowNoStop" || row.status === "lowWithStop");

  if (!lowRows.length) {
    return (
      <div
        style={{
          marginTop: 12,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.035)",
          padding: "12px 14px",
          color: "rgba(255,255,255,0.68)",
          fontSize: 13,
          fontWeight: 780,
          lineHeight: 1.45,
        }}
      >
        <b style={{ color: "white" }}>Justificativas:</b> não há faixas cinzas ou laranjas no período selecionado.
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 12,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.035)",
        padding: "12px 14px",
        color: "rgba(255,255,255,0.72)",
        fontSize: 13,
        fontWeight: 780,
        lineHeight: 1.55,
      }}
    >
      <div style={{ color: "white", fontWeight: 950, marginBottom: 8 }}>Justificativas das faixas críticas</div>

      <div style={{ display: "grid", gap: 7 }}>
        {lowRows.map((row) => {
          const color = statusColor(row.status);
          const tipo = row.status === "lowWithStop" ? "com parada" : "sem parada";
          const parada = row.hasStop ? ` • ${fmtBR(row.stopMinutes)} min parados` : "";
          const motivo =
            row.reason ||
            (row.hasStop
              ? "baixa produção associada à parada registrada"
              : "motivo CCO não informado");

          return (
            <div key={row.period} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 999,
                  background: color,
                  marginTop: 6,
                  flex: "0 0 auto",
                  boxShadow: `0 0 12px ${color}`,
                }}
              />
              <div>
                <b style={{ color: "white" }}>{periodCompact(row.period)}</b>
                <span style={{ color: "rgba(255,255,255,0.72)" }}>
                  {" "}({tipo}{parada}) — {motivo}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const modalOverlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 220,
  background: "rgba(0,0,0,0.68)",
  backdropFilter: "blur(8px)",
  display: "grid",
  placeItems: "center",
  padding: 14,
};

const modalCard: CSSProperties = {
  width: "min(1480px, 98vw)",
  maxHeight: "94vh",
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(14,18,22,0.90)",
  boxShadow: "0 30px 90px rgba(0,0,0,0.70)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const modalHeader: CSSProperties = {
  padding: 14,
  borderBottom: "1px solid rgba(255,255,255,0.10)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const modalBody: CSSProperties = {
  padding: 14,
  minHeight: 0,
  flex: 1,
  overflow: "auto",
};

const previewShell: CSSProperties = {
  display: "grid",
  justifyContent: "center",
};

const previewCapture: CSSProperties = {
  width: 1280,
  maxWidth: "100%",
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "#0b0f14",
  padding: 18,
  boxSizing: "border-box",
};

const previewCardBase: CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "linear-gradient(180deg, rgba(16,21,29,0.94), rgba(11,15,20,0.94))",
  boxShadow: "0 22px 60px rgba(0,0,0,0.38)",
};

const previewChartCard: CSSProperties = {
  ...previewCardBase,
  padding: 16,
};
