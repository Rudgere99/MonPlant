import React, { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useIsMobile } from "../mobile/useIsMobile";

/**
 * Ritmo — Executivo Premium
 * - Tudo do operacional + Gráfico acumulado (Real x Ideal)
 * - Hero KPIs + Status grande + Projeção com desvio projetado
 * - Proteções: tempo restante nunca negativo, dia encerrado automático, padronização decimais
 *
 * Endpoint:
 *   GET /api/plant-production/{day}  -> { day, rows:[{period, ton, freq}], meta_ton? }
 *   GET /api/goals/day/{day}         -> { day, meta_ton, discount_hours? }
 */

type HourRow = {
  period: string;
  ton?: number | string | null;
  freq?: number | string | null;
};

type GoalDay = {
  day: string;
  meta_ton: number | null;
  discount_hours?: number | null;
  updated_at?: string | null;
};

type PlantInfo = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
};

type PlantScope = number | "all";

type RhythmEquipmentPayload = {
  plant_id: number;
  allocation: null | { id: number; plant_id: number; equipment_id: number; is_active: boolean; updated_at?: string | null };
  equipment: null | { id: number; equipment_type?: string | null; tag: string; bucket_ton: number; is_active?: boolean };
};

type ApiPayload = {
  day: string;
  meta_ton?: number | null;
  meta?: number | null;
  meta_day?: number | null;
  planned_ton?: number | null;
  rows: HourRow[];
  updated_at?: string | null;
};

type PlantSummaryInput = {
  plant: PlantInfo;
  data: ApiPayload | null;
  goal: GoalDay | null;
};

type SummaryMetrics = {
  title: string;
  metaDay: number | null;
  produced: number;
  projectionTon: number;
  attainment: number | null;
  diff: number | null;
  remainingH: number;
  neededTPH: number | null;
  avgRealTPH: number;
  isClosedDay: boolean;
};

const API_BASE = String((import.meta as any)?.env?.VITE_API_BASE || "http://127.0.0.1:8000").replace(/\/+$/, "");

function authHeaders(): HeadersInit {
  const t = (localStorage.getItem("mp_token") || localStorage.getItem("token") || "").trim();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
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

function fmtBR(n: number, dec = 1) {
  return (Number(n) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}


function fmtPct(n: number, dec = 1) {
  return `${(Number(n) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })}%`;
}

function parseNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  let s = String(v).trim();
  if (!s) return null;
  s = s.replace("%", "").trim();
  s = s.replace(/\s/g, "");

  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizePeriodToHH(period: string): string {
  const s0 = String(period || "").trim();
  if (!s0) return s0;
  const s = s0.replace(/–|—/g, "-");
  const parts = s
    .split("-")
    .map((x) => x.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const h1m = parts[0].match(/^(\d{1,2})/);
    const h2m = parts[1].match(/^(\d{1,2})/);
    if (h1m && h2m) {
      const h1 = Math.max(0, Math.min(23, Number(h1m[1])));
      const h2 = Math.max(0, Math.min(23, Number(h2m[1])));
      return `${pad2(h1)}-${pad2(h2)}`;
    }
  }
  return s0;
}

function dayRemainingHours(now = new Date()) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const rem = Math.max(0, 1440 - mins);
  return rem / 60;
}

function dayElapsedHours(now = new Date()) {
  const mins = now.getHours() * 60 + now.getMinutes();
  return Math.max(0, mins / 60);
}

function rowsToNormMap(rows: HourRow[] | undefined | null): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows || []) {
    const p = normalizePeriodToHH(r.period);
    const ton = parseNum(r.ton) ?? 0;
    map.set(p, (map.get(p) || 0) + ton);
  }
  return map;
}

function metaFromPayload(goal: GoalDay | null, data: ApiPayload | null): number | null {
  const v = goal?.meta_ton ?? data?.meta_ton ?? data?.meta ?? data?.meta_day ?? data?.planned_ton ?? null;
  return v !== null && v !== undefined ? Number(v) : null;
}

function makeSummaryTitle(plant: PlantInfo | null, plantId: PlantScope | null): string {
  if (plantId === "all") return "TODAS AS PLANTAS";
  const id = plant ? Number(plant.id) : Number(plantId || 0);
  if (Number.isFinite(id) && id > 0) return `PLANTA ${pad2(id)}`;
  return String(plant?.name || "PLANTA").toUpperCase();
}

function buildSummaryMetrics(args: {
  title: string;
  data: ApiPayload | null;
  goal: GoalDay | null;
  day: string;
}): SummaryMetrics {
  const rowsNorm = rowsToNormMap(args.data?.rows);
  const metaDay = metaFromPayload(args.goal, args.data);

  let produced = 0;
  rowsNorm.forEach((v) => (produced += Number(v || 0)));

  const todayISO = isoTodayLocal();
  const isPastDay = args.day < todayISO;
  const filledCount = Array.from(rowsNorm.values()).filter((v) => (Number(v) || 0) > 0).length;
  const isClosedDay = isPastDay || filledCount >= 24;
  const nowRef = isClosedDay ? new Date(`${args.day}T23:59:00`) : new Date();
  const remainingH = isClosedDay ? 0 : Math.max(0, dayRemainingHours(nowRef));

  const filled = Array.from(rowsNorm.values()).filter((v) => (Number(v) || 0) > 0);
  const avgRealTPH = filled.length ? filled.reduce((acc, v) => acc + (Number(v) || 0), 0) / filled.length : 0;

  const projectionTon = isClosedDay || avgRealTPH <= 0 ? produced : produced + avgRealTPH * remainingH;
  const diff = metaDay !== null ? produced - metaDay : null;
  const attainment = metaDay !== null && metaDay > 0 ? (produced / metaDay) * 100 : null;

  let neededTPH: number | null = null;
  if (metaDay !== null) {
    const remaining = Math.max(0, metaDay - produced);
    neededTPH = remaining <= 0 ? 0 : remainingH > 0 ? remaining / remainingH : null;
  }

  return {
    title: args.title,
    metaDay,
    produced,
    projectionTon,
    attainment,
    diff,
    remainingH,
    neededTPH,
    avgRealTPH,
    isClosedDay,
  };
}


const card: React.CSSProperties = {
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(14,18,22,0.78)",
  padding: 16,
};

const label: React.CSSProperties = {
  color: "rgba(255,255,255,0.55)",
  fontWeight: 900,
  fontSize: 12,
  letterSpacing: 0.2,
  textTransform: "uppercase",
};

const input: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.92)",
  padding: "10px 12px",
  outline: "none",
  fontWeight: 900,
};

const btn: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.92)",
  padding: "10px 12px",
  fontWeight: 950,
  cursor: "pointer",
  outline: "none",
  whiteSpace: "nowrap",
};

const heroGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  gap: 12,
};

function HeroKPI(props: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  colSpan?: number;
  accent?: "green" | "yellow" | "red" | "neutral";
  mobile?: boolean;
}) {
  const { title, value, sub, colSpan = 4, accent = "neutral", mobile = false } = props;
  const mobileSpan = mobile ? (colSpan >= 8 ? 2 : 1) : colSpan;
  const accentMap: Record<string, string> = {
    green: "rgba(34,197,94,0.95)",
    yellow: "rgba(250,204,21,0.95)",
    red: "rgba(239,68,68,0.95)",
    neutral: "rgba(255,255,255,0.12)",
  };

  return (
    <div
      style={{
        ...card,
        gridColumn: `span ${mobileSpan}`,
        borderColor: accent === "neutral" ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.14)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            accent === "neutral"
              ? "transparent"
              : `radial-gradient(900px 260px at 10% 10%, ${accentMap[accent]}33, transparent 60%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        <div style={label}>{title}</div>
        <div style={{ color: accent === "neutral" ? "rgba(255,255,255,0.94)" : accentMap[accent], fontWeight: 980, fontSize: 30, marginTop: 6 }}>{value}</div>
        {sub ? <div style={{ color: "rgba(255,255,255,0.70)", fontWeight: 900, marginTop: 2 }}>{sub}</div> : null}
      </div>
    </div>
  );
}

function BigStatus(props: { kind: "green" | "yellow" | "red"; title: string; subtitle?: string }) {
  const map = {
    green: { bg: "rgba(34,197,94,0.16)", bd: "rgba(34,197,94,0.35)", fg: "rgba(34,197,94,0.95)" },
    yellow: { bg: "rgba(250,204,21,0.14)", bd: "rgba(250,204,21,0.32)", fg: "rgba(250,204,21,0.95)" },
    red: { bg: "rgba(239,68,68,0.14)", bd: "rgba(239,68,68,0.32)", fg: "rgba(239,68,68,0.95)" },
  }[props.kind];

  return (
    <div
      style={{
        ...card,
        borderRadius: 26,
        border: `1px solid ${map.bd}`,
        background: map.bg,
        padding: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        minHeight: 92,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 16, height: 16, borderRadius: 99, background: map.fg, boxShadow: `0 0 0 8px ${map.bg}` }} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: "rgba(255,255,255,0.94)", fontWeight: 990, fontSize: 18 }}>{props.title}</div>
          {props.subtitle ? (
            <div style={{ color: "rgba(255,255,255,0.72)", fontWeight: 900, fontSize: 13 }}>{props.subtitle}</div>
          ) : null}
        </div>
      </div>

      <div style={{ textAlign: "right" }}>
        <div style={{ ...label, marginBottom: 4 }}>Semáforo</div>
        <div style={{ color: map.fg, fontWeight: 990, fontSize: 16 }}>
          {props.kind === "green" ? "🟢" : props.kind === "yellow" ? "🟡" : "🔴"}{" "}
          {props.kind === "green" ? "OK" : props.kind === "yellow" ? "ALERTA" : "CRÍTICO"}
        </div>
      </div>
    </div>
  );
}

const exportMiniCard: React.CSSProperties = {
  borderRadius: 26,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "linear-gradient(180deg, rgba(18,22,26,0.98) 0%, rgba(10,14,18,0.98) 100%)",
  padding: 0,
  lineHeight: 1.55,
  display: "inline-block",
  width: "fit-content",
  maxWidth: 780,
  boxShadow: "0 18px 46px rgba(0,0,0,0.55)",
  overflow: "hidden",
};

const exportPlantStrip: React.CSSProperties = {
  background: "#fff200",
  color: "#050505",
  fontWeight: 990,
  fontSize: 22,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  textAlign: "center",
  padding: "5px 18px 6px",
  lineHeight: 1.1,
};

const exportMiniBody: React.CSSProperties = {
  padding: 18,
};

const exportLineRow: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 14,
  fontWeight: 950,
  fontSize: 18,
  color: "rgba(255,255,255,0.92)",
};

const exportLabel: React.CSSProperties = {
  opacity: 0.92,
  fontWeight: 950,
};

const exportValue: React.CSSProperties = {
  fontWeight: 990,
};

const exportSep: React.CSSProperties = {
  height: 1,
  background: "rgba(255,255,255,0.12)",
  margin: "12px 0",
};

const exportSummaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  alignItems: "stretch",
};

const exportSummaryCell: React.CSSProperties = {
  minWidth: 0,
};

const exportSummaryTotalTitle: React.CSSProperties = {
  ...exportPlantStrip,
  borderTop: "none",
  borderBottom: "none",
};

const exportLogoBox: React.CSSProperties = {
  minHeight: 280,
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  borderLeft: "1px solid rgba(255,255,255,0.12)",
  borderTop: "1px solid rgba(255,255,255,0.10)",
  background: "linear-gradient(180deg, rgba(18,22,26,0.98) 0%, rgba(10,14,18,0.98) 100%)",
};

const exportLogoImg: React.CSSProperties = {
  display: "block",
  width: "min(260px, 82%)",
  maxHeight: 170,
  objectFit: "contain",
  opacity: 0.96,
};

export default function Ritmo() {
  const [day, setDay] = useState<string>(isoTodayLocal());

  const [plants, setPlants] = useState<PlantInfo[]>([]);
  const [plantId, setPlantId] = useState<PlantScope | null>(null);

  const mobile = useIsMobile();

  const grid12: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: mobile ? "1fr" : "repeat(12, minmax(0, 1fr))",
    gap: 12,
  };

  const span = (n: number): React.CSSProperties => ({
    gridColumn: mobile ? "span 12" : `span ${n}`,
  });
  const exportCompactRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiPayload | null>(null);
  const [goal, setGoal] = useState<GoalDay | null>(null);
  const [rhythmEquipment, setRhythmEquipment] = useState<RhythmEquipmentPayload | null>(null);
  const [allSummaryInputs, setAllSummaryInputs] = useState<PlantSummaryInput[]>([]);


  async function loadPlants() {
    try {
      const r = await fetch(`${API_BASE}/api/plants`, { headers: authHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const list = (await r.json()) as PlantInfo[];
      const arr = Array.isArray(list) ? list : [];
      setPlants(arr);
      setPlantId((current) => {
        if (current === "all") return "all";
        if (current && arr.some((x) => Number(x.id) === Number(current))) return current;
        return arr.length ? Number(arr[0].id) : null;
      });
    } catch {
      setPlants([]);
      setPlantId(null);
    }
  }

  const FETCH_URL = useMemo(() => {
    if (!plantId) return "";
    if (plantId === "all") {
      return `${API_BASE}/api/aggregate/plant-production/${encodeURIComponent(day)}`;
    }
    return `${API_BASE}/api/plants/${plantId}/plant-production/${encodeURIComponent(day)}`;
  }, [day, plantId]);

  useEffect(() => {
    loadPlants();
  }, []);

  useEffect(() => {
    if (!FETCH_URL) return;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(FETCH_URL, { headers: authHeaders() });
        if (r.status === 404) {
          setData({ day, rows: [], meta_ton: null });
          setGoal(null);
          return;
        }
        if (!r.ok) {
          const t = await r.text().catch(() => "");
          throw new Error(t || `HTTP ${r.status}`);
        }
        const j = (await r.json()) as ApiPayload;
        setData(j);

        try {
          const goalPath =
            plantId === "all"
              ? `/api/aggregate/goals/day/${encodeURIComponent(day)}`
              : `/api/plants/${plantId}/goals/day/${encodeURIComponent(day)}`;
          const g = await apiGet<GoalDay>(goalPath);
          setGoal(g);
        } catch {
          setGoal(null);
        }

        if (plantId && plantId !== "all") {
          setAllSummaryInputs([]);
          try {
            const eq = await apiGet<RhythmEquipmentPayload>(`/api/plants/${plantId}/rhythm-equipment`);
            setRhythmEquipment(eq);
          } catch {
            setRhythmEquipment(null);
          }
        } else {
          setRhythmEquipment(null);
          if (plantId === "all" && plants.length) {
            const summaries = await Promise.all(
              plants.map(async (p) => {
                let plantData: ApiPayload | null = null;
                let plantGoal: GoalDay | null = null;
                try {
                  plantData = await apiGet<ApiPayload>(`/api/plants/${p.id}/plant-production/${encodeURIComponent(day)}`);
                } catch {
                  plantData = { day, rows: [], meta_ton: null };
                }
                try {
                  plantGoal = await apiGet<GoalDay>(`/api/plants/${p.id}/goals/day/${encodeURIComponent(day)}`);
                } catch {
                  plantGoal = null;
                }
                return { plant: p, data: plantData, goal: plantGoal };
              })
            );
            setAllSummaryInputs(summaries);
          } else {
            setAllSummaryInputs([]);
          }
        }
      } catch (e: any) {
        setErr(e?.message || "Erro ao carregar dados.");
      } finally {
        setLoading(false);
      }
    })();
  }, [FETCH_URL, day, plantId, plants]);


  const rowsNorm = useMemo(() => rowsToNormMap(data?.rows), [data]);

  const metaDayRaw = useMemo(() => metaFromPayload(goal, data), [goal, data]);

  const metaDay = metaDayRaw;

  const produced = useMemo(() => {
    let s = 0;
    rowsNorm.forEach((v) => (s += Number(v || 0)));
    return s;
  }, [rowsNorm]);

  const todayISO = isoTodayLocal();
  const isPastDay = day < todayISO;

  const filledPeriods = useMemo(() => {
    return Array.from(rowsNorm.entries())
      .filter(([, v]) => (Number(v) || 0) > 0)
      .map(([p]) => p)
      .sort();
  }, [rowsNorm]);

  const filledCount = filledPeriods.length;
  const isClosedDay = isPastDay || filledCount >= 24;

  const nowRef = isClosedDay ? new Date(`${day}T23:59:00`) : new Date();

  const lastFilledPeriod = useMemo(() => (filledPeriods.length ? filledPeriods[filledPeriods.length - 1] : ""), [filledPeriods]);

  const currH = nowRef.getHours();
  const endH = currH;
  const startH = (currH + 23) % 24;

  const currPeriod = isClosedDay ? lastFilledPeriod : `${pad2(startH)}-${pad2(endH)}`;

  const remainingH = isClosedDay ? 0 : Math.max(0, dayRemainingHours(nowRef));
  const elapsedH = isClosedDay ? 24 : Math.max(0.25, dayElapsedHours(nowRef));

  const diff = metaDay !== null ? produced - metaDay : null;
  const attainment = metaDay !== null && metaDay > 0 ? (produced / metaDay) * 100 : null;

  const neededTPH = useMemo(() => {
    if (metaDay === null) return null;
    const remaining = Math.max(0, metaDay - produced);
    if (remaining <= 0) return 0;
    if (remainingH <= 0) return null;
    return remaining / remainingH;
  }, [metaDay, produced, remainingH]);


  const avgRealTPH = useMemo(() => {
    const filled = Array.from(rowsNorm.values()).filter((v) => (Number(v) || 0) > 0);
    if (!filled.length) return 0;
    const sum = filled.reduce((acc, v) => acc + (Number(v) || 0), 0);
    return sum / filled.length;
  }, [rowsNorm]);


  const projectionTon = useMemo(() => {
    // Projeção correta: o que já foi produzido + (média real t/h * horas restantes)
    // (antes estava multiplicando por 24 e inflando a projeção)
    if (isClosedDay) return produced;
    if (avgRealTPH <= 0) return produced; // sem média, projeta o que já tem
    return produced + avgRealTPH * remainingH;
  }, [avgRealTPH, isClosedDay, produced, remainingH]);

  const projectedDiff = useMemo(() => {
    if (metaDay === null) return null;
    return projectionTon - metaDay;
  }, [projectionTon, metaDay]);

  const status = useMemo(() => {
    if (metaDay !== null && metaDay > 0 && produced >= metaDay) {
      return { kind: "green" as const, title: "Meta atingida", subtitle: "Necessário = 0 t/h" };
    }

    if (isClosedDay) {
      if (metaDay === null) return { kind: "yellow" as const, title: "Dia encerrado", subtitle: "Sem meta definida" };
      return produced >= metaDay
        ? { kind: "green" as const, title: "Dia encerrado", subtitle: "Meta atingida" }
        : { kind: "red" as const, title: "Dia encerrado", subtitle: "Meta não atingida" };
    }

    if (neededTPH === null) return { kind: "yellow" as const, title: "Sem cálculo", subtitle: "Meta ou tempo inválido" };
    if (neededTPH === 0) return { kind: "green" as const, title: "Dentro do ritmo", subtitle: "Meta já foi batida" };

    if (avgRealTPH >= neededTPH) return { kind: "green" as const, title: "Dentro do ritmo", subtitle: "Média ≥ Necessário" };
    if (avgRealTPH >= neededTPH * 0.9) return { kind: "yellow" as const, title: "Atenção", subtitle: "Abaixo do necessário" };
    return { kind: "red" as const, title: "Crítico", subtitle: "Fora da meta" };
  }, [avgRealTPH, isClosedDay, metaDay, neededTPH, produced]);

  // padronização de casas decimais
  const dTon = 1;
  const dTPH = 1;
  const dPct = 1;

  const selectedPlantName = useMemo(() => {
    if (plantId === "all") return "Todas as plantas";
    return plants.find((p) => Number(p.id) === Number(plantId))?.name || "Planta";
  }, [plants, plantId]);

  const exportPlantTitle = useMemo(() => {
    const plant = plantId !== "all" ? plants.find((p) => Number(p.id) === Number(plantId)) || null : null;
    return makeSummaryTitle(plant, plantId);
  }, [plantId, plants]);

  const singleSummary = useMemo(
    () => buildSummaryMetrics({ title: exportPlantTitle, data, goal, day }),
    [exportPlantTitle, data, goal, day]
  );

  const aggregateSummary = useMemo(
    () => buildSummaryMetrics({ title: "ACUMULADO DAS PLANTAS", data, goal, day }),
    [data, goal, day]
  );

  const allPlantSummaries = useMemo(
    () =>
      allSummaryInputs.map((item) =>
        buildSummaryMetrics({
          title: makeSummaryTitle(item.plant, Number(item.plant.id)),
          data: item.data,
          goal: item.goal,
          day,
        })
      ),
    [allSummaryInputs, day]
  );

  const summariesToRender = plantId === "all" ? allPlantSummaries : [singleSummary];

  const [yy, mm, dd] = day.split("-");
  const dayBR = `${dd}/${mm}/${yy}`;

  async function exportResumoJPEG() {
    const el = exportCompactRef.current;
    if (!el) return;

    const targetEl = (el.firstElementChild as HTMLElement | null) ?? el;

    // garante layout/medidas estabilizadas antes do capture
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    // @ts-ignore
    if (document.fonts?.ready) {
      try {
        // @ts-ignore
        await document.fonts.ready;
      } catch {}
    }

    const rect = targetEl.getBoundingClientRect();

    // ✅ IMPORTANTE:
    // Não force windowWidth/windowHeight para o tamanho do card,
    // senão o html2canvas "simula" um viewport pequeno e ativa CSS responsivo,
    // mudando quebras de linha (fica diferente do resumo na tela).
    const ww = document.documentElement.clientWidth || window.innerWidth;
    const wh = document.documentElement.clientHeight || window.innerHeight;

    const canvas = await html2canvas(targetEl, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      // captura exatamente o card (sem alterar o viewport)
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
      windowWidth: ww,
      windowHeight: wh,
      scrollX: 0,
      scrollY: 0,
    });

    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `ritmo_resumo_${day}.jpg`;
    a.click();
  }

  const progressPct = metaDay && metaDay > 0 ? Math.max(0, Math.min(100, (produced / metaDay) * 100)) : 0;

  // ======= Gráfico acumulado (Real x Ideal) =======
  const series = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const idealPerH = metaDay && metaDay > 0 ? metaDay / 24 : null;

    let acc = 0;
    return hours.map((h) => {
      // período "HH-(HH+1)"
      const h2 = (h + 1) % 24;
      const key = `${pad2(h)}-${pad2(h2)}`;
      const v = rowsNorm.get(key) ?? 0;
      acc += Number(v || 0);

      const ideal = idealPerH !== null ? idealPerH * (h + 1) : null;

      return {
        hour: pad2(h),
        real: acc,
        ideal: ideal,
      };
    });
  }, [rowsNorm, metaDay]);

  function tooltipFmt(v: any) {
    const n = Number(v) || 0;
    return `${fmtBR(n, dTon)} t`;
  }

  function renderSummaryBody(m: SummaryMetrics) {
    return (
      <div style={exportMiniBody}>
        <div style={exportLineRow}>
          <span style={exportLabel}>Meta:</span>
          <span style={exportValue}>{m.metaDay !== null ? `${fmtBR(m.metaDay, dTon)} t` : "—"}</span>
        </div>

        <div style={exportLineRow}>
          <span style={exportLabel}>Produzido:</span>
          <span style={{ ...exportValue, color: "rgba(250,204,21,0.95)" }}>{`${fmtBR(m.produced, dTon)} t`}</span>
        </div>

        <div style={exportLineRow}>
          <span style={exportLabel}>Projeção:</span>
          <span
            style={{
              ...exportValue,
              color:
                m.metaDay !== null && m.projectionTon < m.metaDay
                  ? "rgba(248,113,113,0.95)"
                  : m.metaDay !== null
                    ? "rgba(34,197,94,0.95)"
                    : exportValue.color,
            }}
          >
            {`${fmtBR(m.projectionTon, dTon)} t`}
          </span>
        </div>

        <div style={exportLineRow}>
          <span style={exportLabel}>Atingimento:</span>
          <span style={exportValue}>{m.attainment !== null ? fmtPct(m.attainment, dPct) : "—"}</span>
        </div>

        <div style={exportLineRow}>
          <span style={exportLabel}>Diferença:</span>
          <span style={exportValue}>{m.diff !== null ? `${m.diff >= 0 ? "+" : ""}${fmtBR(m.diff, dTon)} t` : "—"}</span>
        </div>

        <div style={exportLineRow}>
          <span style={exportLabel}>Tempo restante:</span>
          <span style={exportValue}>{m.isClosedDay ? "0 h" : `${fmtBR(m.remainingH, 1)} h`}</span>
        </div>

        <div style={exportSep} />

        <div style={exportLineRow}>
          <span style={exportLabel}>Necessário:</span>
          <span
            style={{
              ...exportValue,
              color: m.neededTPH !== null && m.avgRealTPH < m.neededTPH ? "rgba(248,113,113,0.95)" : "rgba(34,197,94,0.95)",
            }}
          >
            {m.neededTPH === null ? "—" : `${fmtBR(m.neededTPH, dTPH)} t/h`}
          </span>
        </div>

        <div style={exportLineRow}>
          <span style={exportLabel}>Média real:</span>
          <span style={exportValue}>{`${fmtBR(m.avgRealTPH, dTPH)} t/h`}</span>
        </div>
      </div>
    );
  }

  function renderSummaryCard(m: SummaryMetrics, idx: number) {
    return (
      <div key={`${m.title}-${idx}`} style={{ ...exportMiniCard, display: "block", width: "100%", maxWidth: 360 }}>
        <div style={exportPlantStrip}>{m.title}</div>
        {renderSummaryBody(m)}
      </div>
    );
  }

  function renderSummaryCombinedCard(items: SummaryMetrics[], total: SummaryMetrics) {
    const visibleItems = items.slice(0, 2);

    return (
      <div
        style={{
          ...exportMiniCard,
          display: "block",
          width: mobile ? "100%" : 760,
          maxWidth: "100%",
        }}
      >
        <div
          style={{
            ...exportSummaryGrid,
            gridTemplateColumns: mobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
          }}
        >
          {visibleItems.map((m, idx) => {
            const isLastMobile = mobile && idx < visibleItems.length - 1;
            const isRightCol = !mobile && idx % 2 === 1;
            return (
              <div
                key={`${m.title}-${idx}`}
                style={{
                  ...exportSummaryCell,
                  borderRight: !mobile && !isRightCol ? "1px solid rgba(255,255,255,0.12)" : "none",
                  borderBottom: isLastMobile ? "1px solid rgba(255,255,255,0.12)" : "none",
                }}
              >
                <div style={exportPlantStrip}>{m.title}</div>
                {renderSummaryBody(m)}
              </div>
            );
          })}
        </div>

        <div
          style={{
            ...exportSummaryGrid,
            gridTemplateColumns: mobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
            borderTop: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <div style={{ ...exportSummaryCell, borderBottom: mobile ? "1px solid rgba(255,255,255,0.12)" : "none" }}>
            <div style={exportSummaryTotalTitle}>Acumulado das plantas</div>
            {renderSummaryBody(total)}
          </div>

          <div
            style={{
              ...exportLogoBox,
              borderLeft: mobile ? "none" : "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <img src="/assets/logo-trindade.png" alt="Trindade" style={exportLogoImg} />
          </div>
        </div>
      </div>
    );
  }

  const heroGridStyle: React.CSSProperties = {
    ...heroGrid,
    gridTemplateColumns: mobile ? "repeat(2, minmax(0, 1fr))" : "repeat(12, minmax(0, 1fr))",
  };

return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Topo */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 990, fontSize: 20 }}>
              Ritmo do Dia • {selectedPlantName}{plantId === "all" ? " • Consolidado" : ""}
            </div>
            <div style={{ color: "rgba(255,255,255,0.65)", fontWeight: 900, fontSize: 13 }}>
              Dia: <span style={{ color: "rgba(255,255,255,0.92)" }}>{dayBR}</span>{" "}
              <span style={{ opacity: 0.55 }}>•</span>{" "}
              <span style={{ opacity: 0.85 }}>{isClosedDay ? "Período encerrado" : "Dia em andamento"}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={plantId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setPlantId(v === "all" ? "all" : v ? Number(v) : null);
              }}
              disabled={!plants.length}
              style={{ ...input, minWidth: 210 }}
            >
              {plants.length === 0 ? <option value="">Sem plantas</option> : null}
              {plants.length > 0 ? <option value="all">Todas as plantas</option> : null}
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={label}>Data</span>
              <input style={{ ...input, minWidth: 170 }} type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </label>


            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 210 }}>
              <span style={label}>Escavadeira alocada</span>
              <div
                style={{
                  ...input,
                  minHeight: 41,
                  display: "flex",
                  alignItems: "center",
                  color: rhythmEquipment?.equipment ? "#ffb84d" : "rgba(255,255,255,0.58)",
                }}
              >
                {plantId === "all"
                  ? "Consolidado"
                  : rhythmEquipment?.equipment
                    ? `${rhythmEquipment.equipment.tag} • ${fmtBR(Number(rhythmEquipment.equipment.bucket_ton || 0), 2)} t`
                    : "Sem alocação"}
              </div>
            </div>

            <button style={btn} onClick={exportResumoJPEG}>
              Exportar resumo (JPG)
            </button>
          </div>
        </div>

        {err ? (
          <div style={{ marginTop: 10, color: "rgba(239,68,68,0.95)", fontWeight: 900 }}>{err}</div>
        ) : loading ? (
          <div style={{ marginTop: 10, color: "rgba(255,255,255,0.70)", fontWeight: 900 }}>Carregando…</div>
        ) : null}
      </div>

      {/* STATUS GERAL GRANDE */}
      <BigStatus kind={status.kind} title={status.title} subtitle={status.subtitle} />

      {/* HERO KPIs */}
      <div style={heroGridStyle}>
        <HeroKPI title="Meta" value={metaDay !== null ? `${fmtBR(metaDay, dTon)} t` : "—"} colSpan={4} accent="neutral" mobile={mobile} />
        <HeroKPI title="Produzido" value={`${fmtBR(produced, dTon)} t`} colSpan={4} accent="neutral" mobile={mobile} />
        <HeroKPI title="Projeção" value={`${fmtBR(projectionTon, dTon)} t`} colSpan={4} accent={metaDay && projectionTon >= metaDay ? "green" : metaDay ? "red" : "neutral"} />

        <HeroKPI
          title="Atingimento"
          value={attainment !== null ? fmtPct(attainment, dPct) : "—"}
          colSpan={4}
          accent={status.kind === "green" ? "green" : status.kind === "yellow" ? "yellow" : "red"} mobile={mobile} />
        <HeroKPI
          title="Desvio"
          value={diff !== null ? `${diff >= 0 ? "+" : ""}${fmtBR(diff, dTon)} t` : "—"}
          colSpan={4}
          accent={diff !== null && diff >= 0 ? "green" : diff !== null ? "red" : "neutral"}
          sub={projectedDiff !== null ? (
            <span>
              Desvio proj.:{" "}
              <b style={{ color: projectedDiff >= 0 ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)" }}>
                {projectedDiff >= 0 ? "+" : ""}
                {fmtBR(projectedDiff, dTon)} t
              </b>
            </span>
          ) : undefined}
        />
        <HeroKPI title="Tempo restante" value={isClosedDay ? "0h" : `${fmtBR(remainingH, 1)}h`} colSpan={4} accent="neutral" mobile={mobile} />
      </div>

      {/* Barra de progresso */}
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div style={label}>Progresso da meta</div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontWeight: 950 }}>{metaDay ? fmtPct(progressPct, 1) : "—"}</div>
        </div>
        <div style={{ height: 14, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <div
            style={{
              width: `${progressPct}%`,
              height: "100%",
              borderRadius: 99,
              background:
                progressPct >= 100
                  ? "rgba(34,197,94,0.95)"
                  : status.kind === "green"
                  ? "rgba(34,197,94,0.85)"
                  : status.kind === "yellow"
                  ? "rgba(250,204,21,0.85)"
                  : "rgba(239,68,68,0.85)",
            }}
          />
        </div>
      </div>

      {/* Gráfico acumulado */}
      <div style={{ ...card }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 980, fontSize: 16 }}>Ritmo acumulado</div>
            <div style={{ color: "rgba(255,255,255,0.65)", fontWeight: 900, fontSize: 13 }}>
              Real x Linha ideal (meta distribuída por hora)
            </div>
          </div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontWeight: 900, fontSize: 13 }}>
            Último período: <b style={{ color: "rgba(255,255,255,0.92)" }}>{currPeriod || "—"}</b>
          </div>
        </div>

        <div style={{ height: 220, width: "100%", minWidth: 0, marginTop: 10 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
              <XAxis dataKey="hour" tick={{ fill: "rgba(255,255,255,0.55)", fontWeight: 900, fontSize: 12 }} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.55)", fontWeight: 900, fontSize: 12 }} width={48} />
              <Tooltip
                formatter={(v: any) => tooltipFmt(v)}
                labelFormatter={(l: any) => `Hora ${l}:00`}
                contentStyle={{
                  background: "rgba(14,18,22,0.98)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  color: "rgba(255,255,255,0.92)",
                  fontWeight: 900,
                }}
              />
              <Line type="monotone" dataKey="ideal" dot={false} strokeWidth={2} strokeDasharray="6 4" />
              <Line type="monotone" dataKey="real" dot={false} strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Resumo exportável */}
      <div style={grid12}>
        <div style={{ ...span(12), ...card }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 980, fontSize: 16 }}>Resumo</div>
            <div style={{ color: "rgba(255,255,255,0.65)", fontWeight: 900, fontSize: 13 }}>{dayBR}</div>
          </div>

          <div
            ref={exportCompactRef}
            style={{
              marginTop: 12,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 12,
              width: "fit-content",
              maxWidth: "100%",
            }}
          >
            {plantId === "all"
              ? renderSummaryCombinedCard(summariesToRender.length ? summariesToRender : [singleSummary], aggregateSummary)
              : renderSummaryCard(singleSummary, 0)}
          </div>

          <div style={{ marginTop: 10, color: "rgba(255,255,255,0.60)", fontWeight: 900, fontSize: 12 }}>
            * t/h (1 casa), toneladas (1), % (1).
          </div>
        </div>
      </div>
    </div>
  );
}
