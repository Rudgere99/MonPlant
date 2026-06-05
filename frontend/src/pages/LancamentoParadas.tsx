import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
} from "recharts";
import { useIsMobile } from "../mobile/useIsMobile";

/**
 * Operação • Paradas Minutos
 *
 * Ajustado para o novo modelo:
 * - Permite mais de uma parada na mesma faixa horária.
 * - Inclui hora_inicial e hora_final para cálculo de simultaneidade/sobreposição.
 * - Inclui justificativa_baixa_producao bloqueada por regra:
 *   libera somente se a produção horária ficar abaixo do esperado
 *   e não houver parada lançada OU a parada da linha for menor que 15 minutos.
 * - Calcula total líquido por horário: soma bruta - minutos coincidentes.
 * - Save protegido contra travamento: timeout e sem reload automático após PUT.
 *
 * Endpoints:
 *   GET  /api/plants/{plant_id}/stops-launch?day=YYYY-MM-DD
 *   PUT  /api/plants/{plant_id}/stops-launch?day=YYYY-MM-DD
 *   GET  /api/plants/{plant_id}/plant-production/{day}
 */

type StopRow = {
  id?: number;
  period: string;
  ordem?: number;
  equipamento: string;
  tipo_parada: string;
  descricao: string;
  minutos: number;
  hora_inicial?: string;
  hora_final?: string;
  justificativa_baixa_producao?: string;
};

type StopDayPayload = {
  day: string;
  obs?: string | null;
  rows: StopRow[];
};

type PlantInfo = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
};

type PlantProductionRow = {
  period: string;
  ton?: number | string | null;
  freq?: number | string | null;
};

type PlantProductionPayload = {
  day: string;
  plant_id?: number;
  rows?: PlantProductionRow[];
};

type GoalDayPayload = {
  day: string;
  meta_ton?: number | null;
  discount_hours?: number | null;
};

type PeriodCalc = {
  gross: number;
  overlap: number;
  net: number;
  hasTimedRows: boolean;
};

/* helpers */
const API_BASE = String((import.meta as any)?.env?.VITE_API_BASE || "").replace(
  /\/+$/,
  "",
);

function authHeaders(): HeadersInit {
  const t = (
    localStorage.getItem("mp_token") ||
    localStorage.getItem("token") ||
    ""
  ).trim();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error("Tempo limite excedido ao comunicar com o servidor. Verifique se o backend está ativo e tente novamente.");
    }
    throw e;
  } finally {
    window.clearTimeout(id);
  }
}

async function readErrorMessage(r: Response): Promise<string> {
  const text = await r.text().catch(() => "");
  if (!text) return `HTTP ${r.status}`;
  try {
    const data = JSON.parse(text);
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data?.detail)) return data.detail.map((x: any) => x?.msg || JSON.stringify(x)).join(" | ");
    if (typeof data?.message === "string") return data.message;
  } catch {
    // mantém texto puro
  }
  return text;
}

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetchWithTimeout(`${API_BASE}${path}`, {
    headers: { ...authHeaders() },
  });
  if (!r.ok) {
    throw new Error(await readErrorMessage(r));
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

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function daysBetweenInclusive(start: string, end: string): string[] {
  if (!start || !end) return [];
  const a = start <= end ? start : end;
  const b = start <= end ? end : start;
  const out: string[] = [];
  let cur = a;
  for (let i = 0; i < 370; i++) {
    out.push(cur);
    if (cur === b) break;
    cur = addDaysISO(cur, 1);
  }
  return out;
}

function clamp60(n: number) {
  return Math.max(0, Math.min(60, Number.isFinite(Number(n)) ? Number(n) : 0));
}

function fmtSmart(n: number) {
  const value = Number(n) || 0;
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function parseBRNumber(v: any): number {
  if (v === null || v === undefined || v === "") return NaN;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const raw = String(v).trim();
  if (!raw) return NaN;
  const normalized = raw
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function normalizePeriodLaunch(p: string | null | undefined): string {
  const raw = String(p || "").trim();
  const m1 = raw.match(/^(\d{2})-(\d{2})$/);
  if (m1) return `${m1[1]}-${m1[2]}`;

  const m2 = raw.replace(/\s+/g, "").match(/^(\d{2}):?\d{0,2}-(\d{2}):?\d{0,2}$/);
  if (m2) return `${m2[1]}-${m2[2]}`;

  return raw;
}

function timeToMinutes(t?: string | null): number | null {
  const s = String(t || "").trim();
  const m = s.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function minutesToTime(total: number): string {
  const v = ((Math.round(total) % 1440) + 1440) % 1440;
  const h = Math.floor(v / 60);
  const m = v % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function periodStartMinute(period: string): number {
  const p = normalizePeriodLaunch(period);
  const m = p.match(/^(\d{2})-(\d{2})$/);
  if (!m) return 0;
  return Number(m[1]) * 60;
}

function intervalDurationMinutes(start?: string, end?: string): number {
  const a = timeToMinutes(start);
  const b = timeToMinutes(end);
  if (a === null || b === null) return 0;
  let diff = b - a;
  if (diff < 0) diff += 1440;
  return clamp60(diff);
}

function normalizeIntervalForPeriod(row: StopRow): [number, number] | null {
  const a = timeToMinutes(row.hora_inicial);
  const b = timeToMinutes(row.hora_final);
  if (a === null || b === null) return null;

  const base = periodStartMinute(row.period);
  let start = a;
  let end = b;

  // Ajuste para faixas que cruzam meia-noite ou apontamentos como 23:50 -> 00:00.
  if (start < base - 120) start += 1440;
  if (end <= start) end += 1440;

  return [start, end];
}

function calculatePeriod(rows: StopRow[]): PeriodCalc {
  const active = rows.filter((r) => clamp60(Number(r.minutos || 0)) > 0);
  const intervals = active
    .map(normalizeIntervalForPeriod)
    .filter(Boolean) as [number, number][];

  const hasTimedRows = intervals.length > 0;
  const gross = active.reduce((s, r) => {
    const timed = intervalDurationMinutes(r.hora_inicial, r.hora_final);
    return s + clamp60(timed || Number(r.minutos || 0));
  }, 0);

  if (!hasTimedRows) {
    const netNoTime = clamp60(gross);
    return { gross, overlap: Math.max(0, gross - netNoTime), net: netNoTime, hasTimedRows };
  }

  intervals.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const item of intervals) {
    const last = merged[merged.length - 1];
    if (!last || item[0] > last[1]) {
      merged.push([...item]);
    } else {
      last[1] = Math.max(last[1], item[1]);
    }
  }

  const union = merged.reduce((s, [a, b]) => s + Math.max(0, b - a), 0);
  const net = clamp60(union);
  const overlap = Math.max(0, gross - net);
  return { gross, overlap, net, hasTimedRows };
}

function blankRow(period: string, ordem = 1): StopRow {
  return {
    period,
    ordem,
    equipamento: "",
    tipo_parada: "",
    descricao: "",
    minutos: 0,
    hora_inicial: "",
    hora_final: "",
    justificativa_baixa_producao: "",
  };
}

function rowIsBlank(r: StopRow): boolean {
  return (
    !String(r.equipamento || "").trim() &&
    !String(r.tipo_parada || "").trim() &&
    !String(r.descricao || "").trim() &&
    !String(r.hora_inicial || "").trim() &&
    !String(r.hora_final || "").trim() &&
    !String(r.justificativa_baixa_producao || "").trim() &&
    clamp60(Number(r.minutos || 0)) === 0
  );
}

function sortRows(a: StopRow, b: StopRow) {
  const pa = normalizePeriodLaunch(a.period);
  const pb = normalizePeriodLaunch(b.period);
  if (pa !== pb) return pa.localeCompare(pb);
  return Number(a.ordem || 1) - Number(b.ordem || 1);
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
        flex: "0 0 auto",
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

const inputDisabledStyle: React.CSSProperties = {
  ...inputStyle,
  opacity: 0.58,
  cursor: "not-allowed",
  background: "rgba(255,255,255,0.025)",
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

const orangeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: "linear-gradient(135deg, rgba(245,158,11,0.98), rgba(249,115,22,0.94))",
  borderColor: "rgba(249,115,22,0.55)",
  color: "#160C04",
  boxShadow: "0 12px 30px rgba(249,115,22,0.18)",
};

export default function LancamentoParadas() {
  const mobile = useIsMobile();
  const periods = useMemo(() => makePeriods24(), []);
  const [day, setDay] = useState<string>(isoTodayLocal());
  const [periodMode, setPeriodMode] = useState(false);
  const [startDay, setStartDay] = useState<string>(isoTodayLocal());
  const [endDay, setEndDay] = useState<string>(isoTodayLocal());
  const [metricMode, setMetricMode] = useState<"minutes" | "count">("minutes");
  const [periodRows, setPeriodRows] = useState<StopRow[]>([]);
  const [plants, setPlants] = useState<PlantInfo[]>([]);
  const [plantId, setPlantId] = useState<number | null>(null);
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>("07-08");
  const [productionRows, setProductionRows] = useState<PlantProductionRow[]>([]);
  const [goalDay, setGoalDay] = useState<GoalDayPayload | null>(null);

  const [rows, setRows] = useState<StopRow[]>(periods.map((p) => blankRow(p, 1)));

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);

  const equipmentOptions = useMemo(
    () => [
      "BT-01",
      "BT-02",
      "PN-01",
      "PN-02",
      "EH-08",
      "EH-04",
      "Peneiras",
      "Todos",
    ],
    [],
  );

  const stopTypes = useMemo(() => ["Corretiva", "Preventiva", "Operacional"], []);

  const productionByPeriod = useMemo(() => {
    const map: Record<string, PlantProductionRow> = {};
    for (const r of productionRows || []) {
      const p = normalizePeriodLaunch(r.period);
      if (p) map[p] = r;
    }
    return map;
  }, [productionRows]);

  const expectedSource = useMemo(() => {
    const metaTon = parseBRNumber(goalDay?.meta_ton);
    const discountRaw = parseBRNumber(goalDay?.discount_hours);
    const discount = Number.isFinite(discountRaw) ? discountRaw : 2;
    const productiveHours = Math.max(0, 22 - discount);

    const expected =
      Number.isFinite(metaTon) && metaTon > 0 && Number.isFinite(productiveHours) && productiveHours > 0
        ? metaTon / productiveHours
        : 0;

    return {
      metaTon: Number.isFinite(metaTon) ? metaTon : 0,
      discountHours: discount,
      productiveHours,
      expectedTonPerHour: expected,
      loaded: Boolean(goalDay),
    };
  }, [goalDay]);

  const expectedTonPerHour = expectedSource.expectedTonPerHour;

  function producedTonForPeriod(period: string): number | null {
    const p = productionByPeriod[normalizePeriodLaunch(period)];
    if (!p) return null;

    const ton = parseBRNumber(p.ton);
    return Number.isFinite(ton) ? ton : null;
  }

  function isLowProductionPeriod(period: string): boolean {
    if (expectedTonPerHour <= 0) return false;

    const ton = producedTonForPeriod(period);
    if (ton === null) return false;

    // Mesma referência visual do card Média/Hora do Dashboard: compara a Ton/H da faixa
    // com a linha "Esperada". Linhas sem produção lançada não entram nessa regra.
    return ton > 0 && ton < expectedTonPerHour;
  }

  function hasNoStopLaunched(row?: StopRow): boolean {
    const minutes = clamp60(Number(row?.minutos || 0));
    return minutes === 0;
  }

  function isShortStop(row?: StopRow): boolean {
    const minutes = clamp60(Number(row?.minutos || 0));
    return minutes > 0 && minutes < 15;
  }

  function canJustifyLowProduction(period: string, row?: StopRow): boolean {
    // Regra operacional:
    // libera justificativa quando a produção da faixa está abaixo do esperado
    // e não há parada lançada OU a parada lançada é menor que 15 minutos.
    return isLowProductionPeriod(period) && (hasNoStopLaunched(row) || isShortStop(row));
  }

  function needsLowProductionJustification(period: string, row?: StopRow): boolean {
    return canJustifyLowProduction(period, row) && !String(row?.justificativa_baixa_producao || "").trim();
  }

  function rowsForPeriod(period: string): StopRow[] {
    const p = normalizePeriodLaunch(period);
    const found = rows.filter((r) => normalizePeriodLaunch(r.period) === p).sort(sortRows);
    return found.length ? found : [blankRow(p, 1)];
  }

  function groupedRowsForView(): { period: string; rows: StopRow[]; calc: PeriodCalc }[] {
    return periods.map((period) => {
      const items = rowsForPeriod(period);
      return { period, rows: items, calc: calculatePeriod(items) };
    });
  }

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

  async function loadProduction(targetDay: string) {
    if (!plantId) return [];
    try {
      const data = await apiGet<PlantProductionPayload>(
        `/api/plants/${plantId}/plant-production/${encodeURIComponent(targetDay)}`,
      );
      return Array.isArray(data.rows) ? data.rows : [];
    } catch {
      return [];
    }
  }

  async function loadGoal(targetDay: string): Promise<GoalDayPayload | null> {
    if (!plantId) return null;
    try {
      return await apiGet<GoalDayPayload>(
        `/api/plants/${plantId}/goals/day/${encodeURIComponent(targetDay)}`,
      );
    } catch {
      return null;
    }
  }

  function normalizeRowsFromApi(rawRows: any[]): StopRow[] {
    const normalized: StopRow[] = (rawRows || [])
      .map((x: any, idx: number) => {
        const period = normalizePeriodLaunch(String(x.period || ""));
        if (!period) return null;
        return {
          id: x.id ? Number(x.id) : undefined,
          period,
          ordem: Number(x.ordem ?? x.order ?? idx + 1) || idx + 1,
          equipamento: x.equipamento ?? x.equipment ?? "",
          tipo_parada: x.tipo_parada ?? x.stop_type ?? "",
          descricao: x.descricao ?? x.description ?? "",
          minutos: clamp60(Number(x.minutos ?? x.minutes ?? 0)),
          hora_inicial: String(x.hora_inicial ?? x.start_time ?? "").slice(0, 5),
          hora_final: String(x.hora_final ?? x.end_time ?? "").slice(0, 5),
          justificativa_baixa_producao:
            x.justificativa_baixa_producao ?? x.low_production_reason ?? "",
        } as StopRow;
      })
      .filter(Boolean) as StopRow[];

    const byPeriod: Record<string, StopRow[]> = {};
    for (const r of normalized) {
      const p = normalizePeriodLaunch(r.period);
      if (!byPeriod[p]) byPeriod[p] = [];
      byPeriod[p].push(r);
    }

    const out: StopRow[] = [];
    for (const p of periods) {
      const list = (byPeriod[p] || []).sort(sortRows);
      if (!list.length) {
        out.push(blankRow(p, 1));
      } else {
        list.forEach((r, idx) => out.push({ ...r, period: p, ordem: idx + 1 }));
      }
    }

    return out;
  }

  async function loadOneDay(targetDay: string): Promise<StopRow[]> {
    if (!plantId) return [];
    const r = await fetchWithTimeout(
      `${API_BASE}/api/plants/${plantId}/stops-launch?day=${encodeURIComponent(targetDay)}`,
      { headers: { ...authHeaders() } },
    );
    if (r.status === 404) return [];
    if (!r.ok) {
      throw new Error(await readErrorMessage(r));
    }
    const data = (await r.json()) as StopDayPayload;
    return normalizeRowsFromApi(data.rows || []);
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
        setRows(periods.map((p) => blankRow(p, 1)));
        setProductionRows([]);
        setGoalDay(null);
        return;
      }

      const [dayRows, prodRows, goal] = await Promise.all([loadOneDay(day), loadProduction(day), loadGoal(day)]);
      setRows(dayRows.length ? dayRows : periods.map((p) => blankRow(p, 1)));
      setProductionRows(prodRows);
      setGoalDay(goal);
      setDirty(false);
    } catch (e: any) {
      setMsg(e?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  async function loadPeriod() {
    if (!API_BASE) {
      setMsg("VITE_API_BASE não configurado.");
      return;
    }
    if (!plantId) {
      setMsg("Selecione uma planta.");
      return;
    }

    setLoading(true);
    setMsg("");
    try {
      const days = daysBetweenInclusive(startDay, endDay);
      const all = (await Promise.all(days.map((d) => loadOneDay(d)))).flat();
      setPeriodRows(all.filter((r) => !rowIsBlank(r)));
      setMsg(`Período carregado: ${days.length} dia(s).`);
    } catch (e: any) {
      setPeriodRows([]);
      setMsg(e?.message || "Erro ao carregar período");
    } finally {
      setLoading(false);
    }
  }

  function prepareRowsToSave(): StopRow[] {
    const out: StopRow[] = [];
    for (const period of periods) {
      const list = rowsForPeriod(period).filter((r) => !rowIsBlank(r));
      if (!list.length) {
        out.push(blankRow(period, 1));
        continue;
      }
      list.forEach((r, idx) => {
        out.push({
          ...r,
          period,
          ordem: idx + 1,
          minutos: clamp60(Number(r.minutos || 0)),
          hora_inicial: String(r.hora_inicial || "").slice(0, 5),
          hora_final: String(r.hora_final || "").slice(0, 5),
          justificativa_baixa_producao: canJustifyLowProduction(period, r)
            ? String(r.justificativa_baixa_producao || "").trim()
            : "",
        });
      });
    }
    return out;
  }

  function validateRowsToSave(rowsToValidate: StopRow[]): string | null {
    for (const period of periods) {
      const p = normalizePeriodLaunch(period);
      const periodRows = rowsToValidate.filter((r) => normalizePeriodLaunch(r.period) === p);
      const meaningfulRows = periodRows.filter((r) => !rowIsBlank(r));

      // Regra baixa produção sem parada:
      // se a produção da hora ficou abaixo do esperado e não existe nenhuma parada preenchida,
      // é obrigatório registrar uma justificativa mesmo com minutos = 0.
      if (isLowProductionPeriod(p) && !meaningfulRows.length) {
        const produced = producedTonForPeriod(p);
        return `Justifique a baixa produção no período ${p}. Produzido: ${fmtSmart(produced || 0)} t/h; esperado: ${fmtSmart(expectedTonPerHour)} t/h; sem parada lançada.`;
      }

      for (const r of meaningfulRows) {
        const ini = String(r.hora_inicial || "").trim();
        const fim = String(r.hora_final || "").trim();

        if ((ini && !fim) || (!ini && fim)) {
          return `Preencha hora inicial e hora final juntas no período ${p}.`;
        }

        if (ini && fim) {
          const calculated = intervalDurationMinutes(ini, fim);
          if (calculated <= 0) {
            return `Horário inválido no período ${p}. Verifique hora inicial e final.`;
          }
        }

        if (needsLowProductionJustification(p, r)) {
          const produced = producedTonForPeriod(p);
          const reason = hasNoStopLaunched(r) ? "sem parada lançada" : "parada menor que 15 min";
          return `Justifique a baixa produção no período ${p}. Produzido: ${fmtSmart(produced || 0)} t/h; esperado: ${fmtSmart(expectedTonPerHour)} t/h; ${reason}.`;
        }
      }
    }
    return null;
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

      const normalized = prepareRowsToSave();
      const validation = validateRowsToSave(normalized);
      if (validation) {
        setMsg(validation);
        return;
      }

      const body: StopDayPayload = { day, rows: normalized };

      const r = await fetchWithTimeout(
        `${API_BASE}/api/plants/${plantId}/stops-launch?day=${encodeURIComponent(day)}`,
        {
          method: "PUT",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        25000,
      );

      if (!r.ok) {
        throw new Error(await readErrorMessage(r));
      }

      let rowsSaved: number | null = null;
      try {
        const data = await r.json();
        rowsSaved = typeof data?.rows_saved === "number" ? data.rows_saved : null;
      } catch {
        rowsSaved = null;
      }

      setMsg(rowsSaved !== null ? `Salvo com sucesso. ${rowsSaved} linha(s) registrada(s).` : "Salvo com sucesso.");
      setDirty(false);

      // Não força reload aqui. O reload após salvar pode deixar o botão preso em "Salvando..."
      // quando o backend demora em responder o GET. O usuário pode clicar em Atualizar se quiser recarregar do banco.
      setRows(normalized);
    } catch (e: any) {
      const detail = e?.name === "AbortError" ? "Tempo limite excedido ao salvar." : e?.message;
      setMsg(detail || "Erro ao salvar. Verifique os campos obrigatórios e tente novamente.");
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
    if (periodMode) loadPeriod();
    else load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, startDay, endDay, plantId, periodMode]);

  const selectedPlantName =
    plants.find((x) => Number(x.id) === Number(plantId))?.name || "Planta";

  const activeChartRows = periodMode ? periodRows : rows;

  const chartUnit =
    periodMode && metricMode === "minutes"
      ? "h"
      : metricMode === "minutes"
        ? "min"
        : "paradas";

  const chartTitle =
    metricMode === "count"
      ? "Quantidade de paradas por hora"
      : periodMode
        ? "Horas paradas por hora"
        : "Minutos líquidos parados por hora";

  const chartData = useMemo(() => {
    return periods.map((p) => {
      const items = activeChartRows.filter(
        (r) => normalizePeriodLaunch(r.period) === p && clamp60(Number(r.minutos || 0)) > 0,
      );
      const calc = calculatePeriod(items);
      const minutes = calc.net;
      const hours = minutes / 60;
      const count = items.length;

      return {
        period: p,
        minutes,
        hours,
        count,
        value: metricMode === "count" ? count : periodMode ? hours : minutes,
      };
    });
  }, [activeChartRows, metricMode, periodMode, periods]);

  const chartTotal = useMemo(
    () => chartData.reduce((s, x) => s + Number(x.value || 0), 0),
    [chartData],
  );

  const totalDayCalc = useMemo(() => {
    const all = groupedRowsForView().reduce(
      (acc, g) => {
        acc.gross += g.calc.gross;
        acc.overlap += g.calc.overlap;
        acc.net += g.calc.net;
        return acc;
      },
      { gross: 0, overlap: 0, net: 0 },
    );
    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  function setRowsAndDirty(updater: (prev: StopRow[]) => StopRow[]) {
    setRows((prev) => updater(prev));
    setDirty(true);
  }

  function updateRowByPeriod(period: string, ordem: number, patch: Partial<StopRow>) {
    const p = normalizePeriodLaunch(period);
    setRowsAndDirty((prev) =>
      prev.map((r) => {
        if (normalizePeriodLaunch(r.period) !== p || Number(r.ordem || 1) !== ordem) return r;
        const next = { ...r, ...patch };

        if (patch.hora_inicial !== undefined || patch.hora_final !== undefined) {
          const minutesFromTime = intervalDurationMinutes(
            patch.hora_inicial !== undefined ? patch.hora_inicial : next.hora_inicial,
            patch.hora_final !== undefined ? patch.hora_final : next.hora_final,
          );
          if (minutesFromTime > 0) next.minutos = minutesFromTime;
        }

        return next;
      }),
    );
  }

  function addStop(period: string) {
    const p = normalizePeriodLaunch(period);
    const existing = rowsForPeriod(p);
    const onlyBlank = existing.length === 1 && rowIsBlank(existing[0]);
    const nextOrder = onlyBlank ? 1 : existing.length + 1;

    setRowsAndDirty((prev) => {
      const withoutBlank = onlyBlank
        ? prev.filter((r) => !(normalizePeriodLaunch(r.period) === p && rowIsBlank(r)))
        : prev;
      const next = [...withoutBlank, blankRow(p, nextOrder)].sort(sortRows);
      return next;
    });
    setExpandedPeriod(p);
  }

  function removeStop(period: string, ordem: number) {
    const p = normalizePeriodLaunch(period);
    setRowsAndDirty((prev) => {
      const remaining = prev.filter(
        (r) => !(normalizePeriodLaunch(r.period) === p && Number(r.ordem || 1) === ordem),
      );
      const same = remaining.filter((r) => normalizePeriodLaunch(r.period) === p).sort(sortRows);
      if (!same.length) {
        return [...remaining, blankRow(p, 1)].sort(sortRows);
      }
      let ord = 0;
      return remaining
        .map((r) => {
          if (normalizePeriodLaunch(r.period) !== p) return r;
          ord += 1;
          return { ...r, ordem: ord };
        })
        .sort(sortRows);
    });
  }

  function clearChanges() {
    load();
  }

  function renderRowInputs(r: StopRow, period: string, ordem: number, compact = false) {
    const c = colorForType(r.tipo_parada);
    const lowPeriod = isLowProductionPeriod(period);
    const canJustify = canJustifyLowProduction(period, r);
    const needsJustification = needsLowProductionJustification(period, r);
    const produced = producedTonForPeriod(period);
    const noStopLaunched = hasNoStopLaunched(r);
    const justificationTitle = canJustify
      ? noStopLaunched
        ? `Liberado: produção ${fmtSmart(produced || 0)} t/h abaixo do esperado ${fmtSmart(expectedTonPerHour)} t/h e sem parada lançada.`
        : `Liberado: produção ${fmtSmart(produced || 0)} t/h abaixo do esperado ${fmtSmart(expectedTonPerHour)} t/h e parada menor que 15 min.`
      : lowPeriod
        ? "Bloqueado: baixa produção identificada, mas a justificativa só libera quando não há parada lançada ou quando a parada é menor que 15 minutos."
        : "Bloqueado: produção da hora não está abaixo da linha Esperada do Dashboard.";

    return (
      <>
        <div>
          {compact ? <div style={labelStyle}>Equipamento</div> : null}
          <select
            style={inputStyle as any}
            value={r.equipamento}
            onChange={(e) => updateRowByPeriod(period, ordem, { equipamento: e.target.value })}
          >
            <option value="">—</option>
            {equipmentOptions.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>

        <div>
          {compact ? <div style={labelStyle}>Tipo</div> : null}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Dot color={c} />
            <select
              style={inputStyle as any}
              value={r.tipo_parada}
              onChange={(e) => updateRowByPeriod(period, ordem, { tipo_parada: e.target.value })}
            >
              <option value="">—</option>
              {stopTypes.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          {compact ? <div style={labelStyle}>Descrição</div> : null}
          <input
            style={inputStyle}
            value={r.descricao}
            onChange={(e) => updateRowByPeriod(period, ordem, { descricao: e.target.value })}
            placeholder="Ex.: troca de correia / limpeza / ajuste / etc."
          />
        </div>

        <div>
          {compact ? <div style={labelStyle}>Minutos</div> : null}
          <input
            style={inputStyle}
            type="number"
            min={0}
            max={60}
            value={String(r.minutos ?? 0)}
            onChange={(e) => updateRowByPeriod(period, ordem, { minutos: clamp60(Number(e.target.value) || 0) })}
            placeholder="0-60"
          />
        </div>

        <div>
          {compact ? <div style={labelStyle}>Hora inicial</div> : null}
          <input
            style={inputStyle}
            type="time"
            value={r.hora_inicial || ""}
            onChange={(e) => updateRowByPeriod(period, ordem, { hora_inicial: e.target.value })}
          />
        </div>

        <div>
          {compact ? <div style={labelStyle}>Hora final</div> : null}
          <input
            style={inputStyle}
            type="time"
            value={r.hora_final || ""}
            onChange={(e) => updateRowByPeriod(period, ordem, { hora_final: e.target.value })}
          />
        </div>

        <div>
          {compact ? <div style={labelStyle}>Justificativa baixa produção</div> : null}
          <div style={{ display: "grid", gap: 4 }}>
            <input
              style={
                (canJustify
                  ? {
                      ...inputStyle,
                      borderColor: needsJustification ? "rgba(239,68,68,0.95)" : "rgba(34,197,94,0.55)",
                      background: needsJustification ? "rgba(127,29,29,0.22)" : "rgba(22,101,52,0.10)",
                      boxShadow: needsJustification ? "0 0 0 1px rgba(239,68,68,0.35)" : "none",
                    }
                  : inputDisabledStyle) as React.CSSProperties
              }
              value={canJustify ? r.justificativa_baixa_producao || "" : ""}
              disabled={!canJustify}
              onChange={(e) =>
                updateRowByPeriod(period, ordem, {
                  justificativa_baixa_producao: e.target.value,
                })
              }
              placeholder={
                canJustify
                  ? "Obrigatório: justificar baixa produção"
                  : lowPeriod
                    ? "Bloqueado: só libera sem parada ou parada < 15 min"
                    : "Bloqueado: produção ≥ esperado"
              }
              title={justificationTitle}
            />
            {needsJustification ? (
              <div style={{ color: "#FCA5A5", fontWeight: 950, fontSize: 10 }}>
                Obrigatório justificar
              </div>
            ) : null}
          </div>
        </div>
      </>
    );
  }

  function renderRulesCard() {
    return (
      <div
        style={{
          ...cardStyle,
          alignSelf: "start",
          position: mobile ? undefined : "sticky",
          top: 12,
          background: "rgba(10,14,18,0.88)",
        }}
      >
        <div style={{ color: "rgba(255,255,255,0.94)", fontWeight: 980, fontSize: 16 }}>
          Regras de cálculo no horário
        </div>

        <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
          {[
            ["+", "#22C55E", "Somar minutos quando as paradas forem em minutos diferentes."],
            ["−", "#F59E0B", "Abater minutos coincidentes quando houver sobreposição no mesmo horário."],
            ["⌚", "#3B82F6", "Total líquido do horário não pode ultrapassar 60 minutos."],
          ].map(([icon, color, text]) => (
            <div key={String(text)} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 10 }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  border: `2px solid ${color}`,
                  display: "grid",
                  placeItems: "center",
                  color,
                  fontWeight: 950,
                  fontSize: 13,
                }}
              >
                {icon}
              </div>
              <div style={{ color: "rgba(255,255,255,0.72)", fontWeight: 800, lineHeight: 1.35 }}>
                {text}
              </div>
            </div>
          ))}
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.10)", margin: "18px 0" }} />

        <div style={{ color: "rgba(255,255,255,0.90)", fontWeight: 950 }}>Exemplo prático</div>
        <div style={{ display: "grid", gap: 12, marginTop: 12, fontSize: 12, fontWeight: 900 }}>
          <div>
            <div style={{ color: "#22C55E", textAlign: "center" }}>Parada A: 15 min</div>
            <div style={{ display: "grid", gridTemplateColumns: "42px 1fr 42px", alignItems: "center", gap: 4 }}>
              <span style={{ color: "rgba(255,255,255,0.72)" }}>07:00</span>
              <span style={{ height: 7, borderRadius: 999, background: "rgba(34,197,94,0.6)", border: "1px solid #22C55E" }} />
              <span style={{ color: "rgba(255,255,255,0.72)" }}>07:15</span>
            </div>
          </div>
          <div>
            <div style={{ color: "#3B82F6", textAlign: "center" }}>Parada B: 10 min</div>
            <div style={{ display: "grid", gridTemplateColumns: "42px 1fr 42px", alignItems: "center", gap: 4 }}>
              <span style={{ color: "rgba(255,255,255,0.72)" }}>07:05</span>
              <span style={{ height: 7, borderRadius: 999, background: "rgba(59,130,246,0.6)", border: "1px solid #3B82F6" }} />
              <span style={{ color: "rgba(255,255,255,0.72)" }}>07:15</span>
            </div>
          </div>
          <div>
            <div style={{ color: "#F59E0B", textAlign: "center" }}>Coincidência: 10 min</div>
            <div style={{ display: "grid", gridTemplateColumns: "42px 1fr 42px", alignItems: "center", gap: 4 }}>
              <span style={{ color: "rgba(255,255,255,0.72)" }}>07:05</span>
              <span style={{ height: 7, borderRadius: 999, background: "rgba(245,158,11,0.55)", border: "1px solid #F59E0B" }} />
              <span style={{ color: "rgba(255,255,255,0.72)" }}>07:15</span>
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.10)", margin: "18px 0" }} />
        <div style={{ display: "grid", gap: 8, color: "rgba(255,255,255,0.74)", fontWeight: 850 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Parada A:</span>
            <b>15 min</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Parada B:</span>
            <b>10 min</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Coincidência:</span>
            <b>-10 min</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, color: "#86EFAC", fontWeight: 980, fontSize: 16 }}>
            <span>Total líquido:</span>
            <span>15 min</span>
          </div>
        </div>
      </div>
    );
  }

  function renderDesktopTable() {
    const groups = groupedRowsForView();
    return (
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 1240 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "72px 145px 160px 1fr 88px 98px 98px 220px 56px",
              gap: 10,
              padding: "0 10px 8px",
              color: "rgba(255,255,255,0.55)",
              fontWeight: 950,
              fontSize: 12,
            }}
          >
            <div>Hora</div>
            <div>Equipamento</div>
            <div>Tipo</div>
            <div>Descrição</div>
            <div>Minutos (0–60)</div>
            <div>Hora inicial</div>
            <div>Hora final</div>
            <div>Justificativa baixa produção</div>
            <div>Ações</div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {groups.map(({ period, rows: periodItems, calc }) => {
              const isExpanded = expandedPeriod === period;
              const first = periodItems[0] || blankRow(period, 1);
              const hasMultiple = periodItems.length > 1;
              const hasData = periodItems.some((r) => !rowIsBlank(r));
              const periodNeedsJustification = periodItems.some((r) => needsLowProductionJustification(period, r));

              if (!isExpanded) {
                return (
                  <div
                    key={period}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "72px 145px 160px 1fr 88px 98px 98px 220px 56px",
                      gap: 10,
                      alignItems: "center",
                      padding: "10px",
                      borderRadius: 12,
                      background: periodNeedsJustification
                        ? "rgba(127,29,29,0.22)"
                        : hasData
                          ? "rgba(255,255,255,0.055)"
                          : "rgba(255,255,255,0.035)",
                      border: periodNeedsJustification
                        ? "1px solid rgba(239,68,68,0.55)"
                        : hasMultiple
                          ? "1px solid rgba(59,130,246,0.28)"
                          : "1px solid transparent",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedPeriod(period)}
                      style={{
                        border: 0,
                        background: "transparent",
                        color: hasMultiple ? "#60A5FA" : "rgba(255,255,255,0.88)",
                        fontWeight: 980,
                        textAlign: "left",
                        cursor: "pointer",
                        padding: 0,
                      }}
                      title="Abrir lançamentos do horário"
                    >
                      {period} {hasMultiple ? "▾" : ""}
                    </button>

                    {renderRowInputs(first, period, Number(first.ordem || 1))}

                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        onClick={() => addStop(period)}
                        style={{ ...btnStyle, padding: "8px 10px" }}
                        title="Adicionar outra parada neste horário"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={period}
                  style={{
                    borderRadius: 18,
                    border: periodNeedsJustification ? "1px solid rgba(239,68,68,0.62)" : "1px solid rgba(59,130,246,0.28)",
                    background: periodNeedsJustification
                      ? "linear-gradient(180deg, rgba(127,29,29,0.20), rgba(2,6,12,0.38))"
                      : "linear-gradient(180deg, rgba(15,23,42,0.72), rgba(2,6,12,0.38))",
                    boxShadow: "inset 3px 0 0 rgba(59,130,246,0.75)",
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "72px 1fr auto",
                      gap: 12,
                      alignItems: "center",
                      marginBottom: 12,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedPeriod(null)}
                      style={{
                        border: 0,
                        background: "transparent",
                        color: "#93C5FD",
                        fontWeight: 980,
                        textAlign: "left",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      {period} ⌃
                    </button>
                    <div style={{ color: "rgba(255,255,255,0.76)", fontWeight: 850 }}>
                      Registre uma ou mais paradas neste horário
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        color: "rgba(255,255,255,0.76)",
                        fontWeight: 900,
                        fontSize: 12,
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                      }}
                    >
                      <span>Soma dos minutos: {fmtSmart(calc.gross)}</span>
                      <span>|</span>
                      <span>Coincidência: {fmtSmart(calc.overlap)}</span>
                      <span>|</span>
                      <span style={{ color: "#86EFAC" }}>Total líquido: {fmtSmart(calc.net)} min / 60 min ●</span>
                      {periodNeedsJustification ? <span style={{ color: "#FCA5A5" }}>Baixa produção: justificar</span> : null}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "38px 145px 160px 1fr 88px 98px 98px 220px 56px",
                      gap: 10,
                      padding: "0 10px 8px",
                      color: "rgba(255,255,255,0.55)",
                      fontWeight: 950,
                      fontSize: 12,
                    }}
                  >
                    <div>#</div>
                    <div>Equipamento</div>
                    <div>Tipo</div>
                    <div>Descrição</div>
                    <div>Minutos</div>
                    <div>Hora inicial</div>
                    <div>Hora final</div>
                    <div>Justificativa baixa produção</div>
                    <div>Ações</div>
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    {periodItems.map((r, idx) => {
                      const ordem = Number(r.ordem || idx + 1);
                      return (
                        <div
                          key={`${period}-${ordem}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "38px 145px 160px 1fr 88px 98px 98px 220px 56px",
                            gap: 10,
                            alignItems: "center",
                            padding: "8px 10px",
                            borderRadius: 12,
                            background: needsLowProductionJustification(period, r) ? "rgba(127,29,29,0.20)" : "rgba(0,0,0,0.20)",
                          }}
                        >
                          <div style={{ color: "rgba(255,255,255,0.90)", fontWeight: 980 }}>
                            {String.fromCharCode(65 + idx)}
                          </div>
                          {renderRowInputs(r, period, ordem)}
                          <button
                            type="button"
                            onClick={() => removeStop(period, ordem)}
                            style={{
                              ...btnStyle,
                              padding: "8px 10px",
                              color: "#FCA5A5",
                              borderColor: "rgba(239,68,68,0.35)",
                            }}
                            title="Excluir esta parada"
                          >
                            🗑
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => addStop(period)}
                    style={{
                      ...btnStyle,
                      width: "100%",
                      marginTop: 10,
                      borderStyle: "dashed",
                      color: "#93C5FD",
                      background: "rgba(59,130,246,0.06)",
                    }}
                  >
                    + Adicionar outra parada
                  </button>

                  <div
                    style={{
                      marginTop: 10,
                      color: "rgba(255,255,255,0.55)",
                      fontWeight: 850,
                      fontSize: 12,
                    }}
                  >
                    ⓘ Soma dos minutos das paradas diferentes menos a coincidência detectada por hora inicial/final = total líquido do horário.
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderMobileCards() {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        {groupedRowsForView().map(({ period, rows: periodItems, calc }) => (
          <div
            key={period}
            style={{
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              padding: 12,
              display: "grid",
              gap: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={() => setExpandedPeriod(expandedPeriod === period ? null : period)}
                style={{ border: 0, background: "transparent", color: "rgba(255,255,255,0.92)", fontWeight: 980, padding: 0 }}
              >
                {period} {expandedPeriod === period ? "⌃" : "▾"}
              </button>
              <div style={{ color: "#86EFAC", fontWeight: 950, fontSize: 12 }}>
                Líquido: {fmtSmart(calc.net)} min
              </div>
            </div>

            {(expandedPeriod === period ? periodItems : [periodItems[0]]).map((r, idx) => {
              const ordem = Number(r.ordem || idx + 1);
              return (
                <div
                  key={`${period}-${ordem}`}
                  style={{
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(0,0,0,0.18)",
                    padding: 10,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div style={{ color: "rgba(255,255,255,0.78)", fontWeight: 950 }}>
                    Parada {String.fromCharCode(65 + idx)}
                  </div>
                  {renderRowInputs(r, period, ordem, true)}
                  <button
                    type="button"
                    onClick={() => removeStop(period, ordem)}
                    style={{ ...btnStyle, color: "#FCA5A5", borderColor: "rgba(239,68,68,0.35)" }}
                  >
                    Excluir parada
                  </button>
                </div>
              );
            })}

            <button type="button" onClick={() => addStop(period)} style={{ ...btnStyle, color: "#93C5FD", borderStyle: "dashed" }}>
              + Adicionar outra parada
            </button>
          </div>
        ))}
      </div>
    );
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
            Lançamento de Paradas Minutos
          </div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontWeight: 800, marginTop: 2 }}>
            {loading
              ? "Carregando..."
              : msg
                ? msg
                : `Lance paradas por hora com cálculo de simultaneidade. • ${selectedPlantName} • Esperado: ${fmtSmart(expectedTonPerHour)} t/h • Meta: ${fmtSmart(expectedSource.metaTon)} t • Horas base: ${fmtSmart(expectedSource.productiveHours)}h`}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: mobile ? "1fr" : "auto auto auto auto auto auto",
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

          {!periodMode ? (
            <div>
              <div style={labelStyle}>Dia</div>
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={inputStyle as any} />
            </div>
          ) : (
            <>
              <div>
                <div style={labelStyle}>Início</div>
                <input type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} style={inputStyle as any} />
              </div>
              <div>
                <div style={labelStyle}>Fim</div>
                <input type="date" value={endDay} onChange={(e) => setEndDay(e.target.value)} style={inputStyle as any} />
              </div>
            </>
          )}

          <div>
            <div style={labelStyle}>Visualizar</div>
            <select
              value={metricMode}
              onChange={(e) => setMetricMode(e.target.value as "minutes" | "count")}
              style={inputStyle as any}
            >
              <option value="minutes">{periodMode ? "Horas líquidas/hora" : "Minutos líquidos/hora"}</option>
              <option value="count">Qtd. de paradas/hora</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setPeriodMode((v) => !v)}
            style={{
              ...btnStyle,
              width: mobile ? "100%" : undefined,
              background: periodMode ? "rgba(249,115,22,0.18)" : "rgba(255,255,255,0.06)",
              borderColor: periodMode ? "rgba(249,115,22,0.45)" : "rgba(255,255,255,0.12)",
            }}
          >
            {periodMode ? "Período ativo" : "Dia"}
          </button>

          <button
            type="button"
            onClick={periodMode ? loadPeriod : load}
            style={{ ...btnStyle, width: mobile ? "100%" : undefined }}
            disabled={loading || !plantId}
          >
            Atualizar
          </button>

          <button
            type="button"
            onClick={save}
            style={{ ...orangeBtnStyle, width: mobile ? "100%" : undefined }}
            disabled={saving || loading || !plantId || periodMode}
          >
            {saving ? "Salvando..." : "Salvar lançamentos"}
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
            <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 950 }}>{chartTitle}</div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontWeight: 800, marginTop: 2 }}>
              {periodMode
                ? `Período: ${startDay} até ${endDay} • Total: ${fmtSmart(chartTotal)} ${chartUnit}`
                : `Dia: ${day} • Total líquido: ${fmtSmart(totalDayCalc.net)} min • Coincidência: ${fmtSmart(totalDayCalc.overlap)} min`}
            </div>
          </div>
        </div>

        <div style={{ height: mobile ? 300 : 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 28, right: 16, left: 0, bottom: 6 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis
                dataKey="period"
                tick={{ fill: "rgba(255,255,255,0.62)", fontSize: mobile ? 9 : 11, fontWeight: 800 }}
                interval={mobile ? 1 : 0}
                axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.62)", fontSize: 11, fontWeight: 800 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={periodMode && metricMode === "minutes"}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(0,0,0,0.88)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 12,
                }}
                formatter={(v: any) => [
                  `${fmtSmart(Number(v || 0))} ${chartUnit}`,
                  metricMode === "count" ? "Paradas" : periodMode ? "Horas" : "Minutos líquidos",
                ]}
                labelFormatter={(l: any) => `Hora ${String(l || "")}`}
              />
              <Bar dataKey="value" fill="#16C8F3" radius={[10, 10, 0, 0]} maxBarSize={42}>
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(v: any) => (Number(v || 0) > 0 ? fmtSmart(Number(v || 0)) : "")}
                  style={{ fill: "rgba(255,255,255,0.88)", fontWeight: 950, fontSize: mobile ? 9 : 11 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 14,
          alignItems: "start",
        }}
      >
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 10,
            }}
          >
            <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 950 }}>
              Lançamento por hora (00-01 … 23-00)
            </div>
            <div style={{ color: dirty ? "#FBBF24" : "rgba(255,255,255,0.45)", fontWeight: 900, fontSize: 12 }}>
              {dirty ? "● Alterações não salvas" : "✓ Sem alterações pendentes"}
            </div>
          </div>

          {!mobile ? renderDesktopTable() : renderMobileCards()}

          <div
            style={{
              marginTop: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              color: "rgba(255,255,255,0.55)",
              fontWeight: 850,
              fontSize: 12,
            }}
          >
            <div>
              Justificativa só libera quando a produção da hora fica abaixo do esperado e a parada da linha é menor que 15 minutos. Sobreposições são abatidas por hora inicial/final.
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={clearChanges} style={btnStyle} disabled={loading || saving || periodMode}>
                Limpar alterações
              </button>
              <button type="button" onClick={save} style={orangeBtnStyle} disabled={saving || loading || !plantId || periodMode}>
                {saving ? "Salvando..." : "Salvar lançamentos"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
