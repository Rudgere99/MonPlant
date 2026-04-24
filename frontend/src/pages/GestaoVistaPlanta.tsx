import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Factory,
  Gauge,
  RefreshCw,
  TrendingUp,
  UsersRound,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ShiftLetter = "A" | "B" | "C" | "D";
type PlantScope = number | "all";

type PlantInfo = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
};

type PlantHourRow = { period: string; ton?: any; freq?: any };
type PlantDayPayload = { day: string; obs?: string | null; rows: PlantHourRow[]; updated_at?: string | null };
type GoalDay = { day: string; meta_ton: number | null; discount_hours: number | null; updated_at?: string | null };
type GoalMonthPayload = { month: string; days: GoalDay[] };

type StopLaunchRow = {
  period: string;
  equipamento?: string;
  tipo_parada?: string;
  descricao?: string;
  minutos?: number;
};

type StopDayPayload = { day: string; rows: StopLaunchRow[] };
type HorimetroRow = { equipamento: string; horimetro_ini?: number; horimetro_fim?: number; day?: string; turno?: 1 | 2 };

type DailyStatsRow = {
  day: string;
  produced_ton?: number;
  meta_ton?: number;
  t1_ton?: number;
  t2_ton?: number;
  avg_ton_per_hour?: number;
  freq_avg?: number;
};

type StatsMonthPayload = {
  month: string;
  meta_month_ton?: number;
  produced_month_ton?: number;
  shift?: { t1_ton?: number; t2_ton?: number };
  series?: { daily?: DailyStatsRow[] };
};

type ShiftRuleResolved = {
  turno1: ShiftLetter;
  turno2: ShiftLetter;
  folga: string;
};

type LetterKpi = {
  letter: ShiftLetter;
  supervisor: string;
  realized: number;
  target: number;
  workedDays: number;
  percent: number;
  trend: number;
};

type SupervisorRank = {
  letter: ShiftLetter;
  name: string;
  realized: number;
  target: number;
  performance: number;
  trend: number;
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

const COLORS = {
  // Paleta alinhada ao dashboard padrão MonPlant:
  // fundo grafite, cards cinza-carbono e acentos verde/laranja.
  bg: "#111418",
  panel: "#171b20",
  panel2: "#14181d",
  panel3: "#101418",
  border: "rgba(255,255,255,0.10)",
  borderStrong: "rgba(255,255,255,0.16)",
  text: "rgba(245,247,250,0.94)",
  sub: "rgba(245,247,250,0.56)",
  muted: "rgba(245,247,250,0.36)",
  grid: "rgba(255,255,255,0.075)",
  green: "#ff9f1a",
  emerald: "#13c7e8",
  red: "#ff4d4f",
  yellow: "#ff9f1a",
  cyan: "#18c7f3",
  orange: "#ff9f1a",
  chartBlue: "#18c7f3",
  chartOrange: "#ff9f1a",
};

const SHIFT_RULE_SOURCE = "Regras de Turno Terra Minas.xlsx";
const SHIFT_BASE_DATE = "2026-03-19";
const SHIFT_CYCLE: ShiftRuleResolved[] = [
  { turno1: "C", turno2: "D", folga: "A e B" },
  { turno1: "C", turno2: "D", folga: "A e B" },
  { turno1: "A", turno2: "B", folga: "C e D" },
  { turno1: "A", turno2: "B", folga: "C e D" },
  { turno1: "D", turno2: "C", folga: "A e B" },
  { turno1: "D", turno2: "C", folga: "A e B" },
  { turno1: "B", turno2: "A", folga: "C e D" },
  { turno1: "B", turno2: "A", folga: "C e D" },
];

const SUPERVISOR_MAP: Record<ShiftLetter, string> = {
  A: "Wellington",
  B: "Wagner",
  C: "Marcio",
  D: "Jocelio",
};

const PLANT_EQUIPMENT_FALLBACK = ["BT-01", "BT-02", "PN-01", "PN-02", "EH-08", "EH-04", "Peneiras"];

function isoTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function brDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function parseBRNumber(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace("%", "").trim().replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmtBR0(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(n) || 0);
}
function fmtBR1(n: number) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(n) || 0);
}
function fmtBR2(n: number) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
}

function parseYmdLocal(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function diffDays(a: Date, b: Date) {
  const MS = 24 * 60 * 60 * 1000;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcA - utcB) / MS);
}
function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}
function getShiftRuleForDate(dateYmd: string): ShiftRuleResolved {
  const base = parseYmdLocal(SHIFT_BASE_DATE);
  const target = parseYmdLocal(dateYmd);
  const days = diffDays(target, base);
  return SHIFT_CYCLE[mod(days, 8)];
}
function addDaysISO(iso: string, delta: number) {
  const base = parseYmdLocal(iso);
  base.setDate(base.getDate() + delta);
  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function enumerateDaysInclusive(startIso: string, endIso: string) {
  const out: string[] = [];
  let cur = startIso <= endIso ? startIso : endIso;
  const end = startIso <= endIso ? endIso : startIso;
  for (let guard = 0; guard < 370; guard++) {
    out.push(cur);
    if (cur === end) break;
    cur = addDaysISO(cur, 1);
  }
  return out;
}
function firstDayOfMonth(ym: string) {
  return `${ym}-01`;
}
function lastDayOfMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y || 2026, m || 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysOfMonth(ym: string) {
  return enumerateDaysInclusive(firstDayOfMonth(ym), lastDayOfMonth(ym));
}
function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y || 2026, (m || 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function periodStartHour(period: string) {
  const s = String(period || "").replace(/–|—/g, "-").trim();
  const first = s.split("-")[0] || s;
  const m = first.match(/(\d{1,2})/);
  const h = m ? Number(m[1]) : 0;
  return Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 0;
}
function normalizePeriod(period: string): string {
  const h = periodStartHour(period);
  return `${String(h).padStart(2, "0")}-${String((h + 1) % 24).padStart(2, "0")}`;
}
function operationalKey(calendarDay: string, period: string) {
  const h = periodStartHour(period);
  if (h < 7) return { operationalDay: addDaysISO(calendarDay, -1), shift: 2 as const };
  if (h < 19) return { operationalDay: calendarDay, shift: 1 as const };
  return { operationalDay: calendarDay, shift: 2 as const };
}
function letterColor(letter: ShiftLetter) {
  if (letter === "A") return COLORS.chartBlue;
  if (letter === "B") return COLORS.chartOrange;
  if (letter === "C") return COLORS.chartBlue;
  return COLORS.chartOrange;
}
function authHeaders(token?: string | null): Record<string, string> {
  const t = (token || "").trim();
  if (t) return { Authorization: `Bearer ${t}` };
  for (const k of ["mp_token", "token", "access_token", "auth_token"]) {
    const v = (localStorage.getItem(k) || "").trim();
    if (v) return { Authorization: `Bearer ${v}` };
  }
  return {};
}
function useAuthLocal() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let t: string | null = null;
    for (const k of ["mp_token", "token", "access_token", "auth_token"]) {
      const v = (localStorage.getItem(k) || "").trim();
      if (v) {
        t = v;
        break;
      }
    }
    setToken(t);
    setLoading(false);
  }, []);
  return { token, loading };
}
async function apiGet<T>(path: string, token?: string | null): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders(token) });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}
function panelStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: `linear-gradient(180deg, ${COLORS.panel}, ${COLORS.panel2})`,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 16,
    boxShadow: "0 10px 22px rgba(0,0,0,.22)",
    ...extra,
  };
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        height: 38,
        borderRadius: 12,
        border: `1px solid ${COLORS.borderStrong}`,
        background: COLORS.panel3,
        color: COLORS.text,
        padding: "0 12px",
        outline: "none",
        fontWeight: 800,
      }}
    >
      {children}
    </select>
  );
}

function MetricCard({ title, value, suffix, subtitle, trend, icon }: { title: string; value: string; suffix?: string; subtitle: string; trend?: number; icon: React.ReactNode }) {
  const hasTrend = typeof trend === "number" && Number.isFinite(trend);
  const isUp = (trend || 0) >= 0;
  const mini = [72, 80, 76, 88, 91, 86, 98, 104].map((value, i) => ({ i, value }));
  return (
    <div style={{ ...panelStyle(), padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 950, color: COLORS.green, textTransform: "uppercase" }}>{title}</div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 46, fontWeight: 950, color: "#fff", lineHeight: 1 }}>{value}</span>
            {suffix ? <span style={{ fontSize: 17, color: COLORS.text }}>{suffix}</span> : null}
          </div>
          <div style={{ marginTop: 8, color: COLORS.text, fontSize: 14 }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{ padding: 10, borderRadius: 12, background: "rgba(255,159,26,0.12)", color: COLORS.green }}>{icon}</div>
          {hasTrend ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4, color: isUp ? COLORS.green : COLORS.red, fontWeight: 950, fontSize: 16 }}>
              {isUp ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />} {isUp ? "+" : "-"}{fmtBR1(Math.abs(trend || 0))}%
            </div>
          ) : null}
        </div>
      </div>
      <div style={{ height: 32, marginTop: 8, color: COLORS.chartBlue }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={mini}>
            <Area type="monotone" dataKey="value" stroke="currentColor" fill="currentColor" fillOpacity={0.22} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LetterCard({ item }: { item: LetterKpi }) {
  const color = item.percent >= 95 ? COLORS.green : item.percent >= 85 ? COLORS.yellow : COLORS.red;
  return (
    <div style={{ ...panelStyle({ borderColor: `${color}99` }), padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 46, fontWeight: 950, color }}>{item.letter}</div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.4, color: COLORS.sub }}>{item.supervisor}</div>
        </div>
        <div style={{ alignSelf: "flex-start", padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,.06)", fontSize: 11, fontWeight: 900 }}>
          {item.workedDays} dias
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <span style={{ fontSize: 38, fontWeight: 950 }}>{fmtBR0(item.realized)}</span>
        <span style={{ marginLeft: 6, color: COLORS.text }}>t</span>
        <div style={{ marginTop: 6, fontSize: 14, color: COLORS.text }}>Meta: {fmtBR0(item.target)} t</div>
      </div>
      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 38, fontWeight: 950, color }}>{fmtBR0(item.percent)}%</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, color: item.trend >= 0 ? COLORS.green : COLORS.red, fontWeight: 900 }}>
          {item.trend >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />} {fmtBR1(Math.abs(item.trend))}%
        </div>
      </div>
    </div>
  );
}


function Ticker({ items }: { items: string[] }) {
  const text = items.length
    ? items.join("        |        ")
    : "Aguardando dados reais para consolidar os destaques da planta";

  return (
    <div
      style={{
        marginTop: 12,
        borderTop: `1px solid ${COLORS.border}`,
        paddingTop: 10,
        overflow: "hidden",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          width: "max-content",
          animation: "mpTicker 32s linear infinite",
          gap: 80,
          whiteSpace: "nowrap",
          color: "#ffffff",
          fontWeight: 950,
          fontSize: 15,
          letterSpacing: 0.2,
        }}
      >
        <span>{text}</span>
        <span>{text}</span>
      </div>
    </div>
  );
}

export default function GestaoVistaPlanta() {
  const { token, loading: authLoading } = useAuthLocal();
  const [day, setDay] = useState(isoTodayLocal());
  const month = day.slice(0, 7);
  const [plants, setPlants] = useState<PlantInfo[]>([]);
  const [plantId, setPlantId] = useState<PlantScope | null>(null);
  const [prodDay, setProdDay] = useState<PlantDayPayload | null>(null);
  const [goalDay, setGoalDay] = useState<GoalDay | null>(null);
  const [monthPayloads, setMonthPayloads] = useState<PlantDayPayload[]>([]);
  const [monthGoals, setMonthGoals] = useState<Record<string, GoalDay | null>>({});
  const [statsMonth, setStatsMonth] = useState<StatsMonthPayload | null>(null);
  const [nextStatsMonth, setNextStatsMonth] = useState<StatsMonthPayload | null>(null);
  const [stops, setStops] = useState<StopLaunchRow[]>([]);
  const [horimetros, setHorimetros] = useState<HorimetroRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadPlants() {
    try {
      const data = await apiGet<PlantInfo[]>(`/api/plants`, token).catch(() => []);
      const list = Array.isArray(data) ? data : [];
      setPlants(list);
      setPlantId((current) => {
        if (current === "all") return "all";
        if (current && list.some((p) => Number(p.id) === Number(current))) return current;
        return list.length ? Number(list[0].id) : null;
      });
    } catch {
      setPlants([]);
      setPlantId(null);
    }
  }

  async function loadAll() {
    if (!plantId) return;
    setLoading(true);
    setErr(null);
    try {
      const dayPath = plantId === "all" ? `/api/aggregate/plant-production/${encodeURIComponent(day)}` : `/api/plants/${plantId}/plant-production/${encodeURIComponent(day)}`;
      const stopsPath = plantId === "all" ? `/api/aggregate/stops-launch?day=${encodeURIComponent(day)}` : `/api/plants/${plantId}/stops-launch?day=${encodeURIComponent(day)}`;
      const p = await apiGet<PlantDayPayload>(dayPath, token).catch(() => ({ day, rows: [], obs: "" }));
      const g = await apiGet<GoalDay>(`/api/goals/day/${encodeURIComponent(day)}`, token).catch(() => null as any);
      const s = await apiGet<StopDayPayload>(stopsPath, token).catch(() => ({ day, rows: [] }));
      const h = plantId === "all" ? [] : await apiGet<HorimetroRow[]>(`/api/plants/${plantId}/horimetros/last-by-eq`, token).catch(() => []);

      const statsPath = plantId === "all" ? `/api/aggregate/stats/month/${encodeURIComponent(month)}` : `/api/plants/${plantId}/stats/month/${encodeURIComponent(month)}`;
      const nextMonth = shiftMonth(month, 1);
      const nextStatsPath = plantId === "all" ? `/api/aggregate/stats/month/${encodeURIComponent(nextMonth)}` : `/api/plants/${plantId}/stats/month/${encodeURIComponent(nextMonth)}`;
      const [stats, nextStats] = await Promise.all([
        apiGet<StatsMonthPayload>(statsPath, token).catch(() => null as any),
        apiGet<StatsMonthPayload>(nextStatsPath, token).catch(() => null as any),
      ]);

      const start = firstDayOfMonth(month);
      const end = day;
      const calendarDays = enumerateDaysInclusive(start, addDaysISO(end, 1));
      const monthDays = daysOfMonth(month);

      const [payloads, goalsMonthPayload] = await Promise.all([
        Promise.all(
          calendarDays.map(async (d) => {
            const path = plantId === "all" ? `/api/aggregate/plant-production/${encodeURIComponent(d)}` : `/api/plants/${plantId}/plant-production/${encodeURIComponent(d)}`;
            return apiGet<PlantDayPayload>(path, token).catch(() => ({ day: d, rows: [], obs: "" }));
          })
        ),
        apiGet<GoalMonthPayload>(`/api/goals/month/${encodeURIComponent(month)}`, token).catch(() => ({ month, days: [] })),
      ]);

      const goalMapFromMonth = new Map<string, GoalDay>();
      for (const gDay of goalsMonthPayload?.days || []) {
        if (gDay?.day) {
          goalMapFromMonth.set(String(gDay.day), {
            day: String(gDay.day),
            meta_ton: Number(gDay.meta_ton) || 0,
            discount_hours: Number(gDay.discount_hours) || 0,
            updated_at: gDay.updated_at || null,
          });
        }
      }

      const goals = await Promise.all(
        monthDays.map(async (d) => {
          const fromMonth = goalMapFromMonth.get(d);
          if (fromMonth) return [d, fromMonth] as const;
          const goal = await apiGet<GoalDay>(`/api/goals/day/${encodeURIComponent(d)}`, token).catch(() => null as any);
          return [d, goal] as const;
        })
      );

      setProdDay(p);
      setGoalDay(g);
      setStops(Array.isArray((s as any)?.rows) ? (s as any).rows : []);
      setHorimetros(Array.isArray(h) ? h : []);
      setMonthPayloads(payloads);
      setMonthGoals(Object.fromEntries(goals));
      setStatsMonth(stats || null);
      setNextStatsMonth(nextStats || null);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar dados da gestão à vista.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading) loadPlants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, token]);

  useEffect(() => {
    if (!authLoading && plantId) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, token, plantId, day]);

  const hourlyBars = useMemo(() => {
    const map = new Map<string, { period: string; ton: number; freq: number }>();
    for (let h = 0; h < 24; h++) {
      const p = `${String(h).padStart(2, "0")}-${String((h + 1) % 24).padStart(2, "0")}`;
      map.set(p, { period: p, ton: 0, freq: 0 });
    }
    for (const r of prodDay?.rows || []) {
      const key = normalizePeriod(r.period);
      const prev = map.get(key) || { period: key, ton: 0, freq: 0 };
      prev.ton += parseBRNumber(r.ton);
      prev.freq = Math.max(prev.freq, parseBRNumber(r.freq));
      map.set(key, prev);
    }
    return Array.from(map.values());
  }, [prodDay]);

  const operationalDailyFromStats = useMemo(() => {
    const currentDaily = [...(statsMonth?.series?.daily || [])]
      .filter((row) => String(row.day || "") >= firstDayOfMonth(month) && String(row.day || "") <= day)
      .sort((a, b) => String(a.day || "").localeCompare(String(b.day || "")));

    const nextDailyCurrentMonth = [...(statsMonth?.series?.daily || [])].sort((a, b) =>
      String(a.day || "").localeCompare(String(b.day || ""))
    );
    const nextDailyNextMonth = [...(nextStatsMonth?.series?.daily || [])].sort((a, b) =>
      String(a.day || "").localeCompare(String(b.day || ""))
    );

    return currentDaily.map((row) => {
      const nextRowCurrentMonth = nextDailyCurrentMonth.find((x) => String(x.day || "") === addDaysISO(row.day, 1));
      const nextRow = nextRowCurrentMonth || nextDailyNextMonth[0];
      return {
        operational_day: row.day,
        operational_t1_ton: Number(row.t1_ton || 0),
        operational_t2_ton: Number(nextRow?.t2_ton || 0),
      };
    });
  }, [statsMonth, nextStatsMonth, month, day]);

  const letterData = useMemo<LetterKpi[]>(() => {
    const start = firstDayOfMonth(month);
    const end = lastDayOfMonth(month);
    const base: Record<ShiftLetter, { realized: number; target: number; workedDays: number }> = {
      A: { realized: 0, target: 0, workedDays: 0 },
      B: { realized: 0, target: 0, workedDays: 0 },
      C: { realized: 0, target: 0, workedDays: 0 },
      D: { realized: 0, target: 0, workedDays: 0 },
    };

    for (const d of enumerateDaysInclusive(start, end)) {
      const rule = getShiftRuleForDate(d);
      const goalFromGoalsPage = Number(monthGoals[d]?.meta_ton || 0);
      const goalFromStats = Number((statsMonth?.series?.daily || []).find((x) => x.day === d)?.meta_ton || 0);
      const goal = goalFromGoalsPage || goalFromStats;
      // Meta mensal completa: a soma das metas das letras precisa fechar com a meta total do mês.
      // Cada meta diária é dividida entre as duas letras escaladas no dia operacional.
      base[rule.turno1].target += goal / 2;
      base[rule.turno2].target += goal / 2;
      base[rule.turno1].workedDays += 1;
      base[rule.turno2].workedDays += 1;
    }

    // Produção real por letra usando exatamente a mesma lógica da página Statistics:
    // Turno 1 do próprio dia operacional + Turno 2 vindo da próxima data calendário.
    for (const row of operationalDailyFromStats || []) {
      const rule = getShiftRuleForDate(row.operational_day);
      base[rule.turno1].realized += Number(row.operational_t1_ton || 0);
      base[rule.turno2].realized += Number(row.operational_t2_ton || 0);
    }

    return (["A", "B", "C", "D"] as ShiftLetter[]).map((letter) => {
      const x = base[letter];
      const percent = x.target > 0 ? (x.realized / x.target) * 100 : 0;
      return {
        letter,
        supervisor: SUPERVISOR_MAP[letter],
        realized: x.realized,
        target: x.target,
        workedDays: x.workedDays,
        percent,
        trend: percent - 100,
      };
    });
  }, [month, day, monthGoals, statsMonth, operationalDailyFromStats]);

  const supervisorRanking = useMemo<SupervisorRank[]>(() => {
    return letterData
      .map((l) => ({ letter: l.letter, name: l.supervisor, realized: l.realized, target: l.target, performance: l.percent, trend: l.trend }))
      .sort((a, b) => b.performance - a.performance);
  }, [letterData]);

  
  const tickerItems = useMemo(() => {
    const daily = (statsMonth?.series?.daily || []).filter((row) => Number(row?.produced_ton || 0) > 0);
    const bestDay = daily.length
      ? [...daily].sort((a, b) => Number(b.produced_ton || 0) - Number(a.produced_ton || 0))[0]
      : null;

    const bestHour = hourlyBars.reduce(
      (acc, cur) => (Number(cur.ton || 0) > Number(acc.ton || 0) ? cur : acc),
      { period: "--", ton: 0 }
    );

    const bestSupervisor = supervisorRanking?.[0] || null;
    const bestDayRule = bestDay?.day ? getShiftRuleForDate(bestDay.day) : getShiftRuleForDate(day);
    const bestDaySupervisor = SUPERVISOR_MAP[bestDayRule.turno1];

    return [
      <>📅 Maior produção: <span style={{color:"#ff9f1a"}}>{fmtBR0(bestDay?.produced_ton || 0)} t</span> em {brDate(bestDay?.day || day)}</>,
      <>👷 Supervisor vigente: {bestDaySupervisor}</>,
      <>🏆 Melhor supervisor: {bestSupervisor?.name} • Letra {bestSupervisor?.letter} (<span style={{color:"#ff9f1a"}}>{fmtBR1(bestSupervisor?.performance || 0)}%</span>)</>,
      <>⏱️ Melhor hora: <span style={{color:"#ff9f1a"}}>{bestHour.period}</span> com <span style={{color:"#ff9f1a"}}>{fmtBR0(bestHour.ton)} t</span></>,
    ];
  }, [statsMonth, hourlyBars, supervisorRanking, day]);



  const totalProducedDay = useMemo(() => hourlyBars.reduce((a, b) => a + b.ton, 0), [hourlyBars]);
  const metaDia = Number(goalDay?.meta_ton || 0);
  const pctMeta = metaDia > 0 ? (totalProducedDay / metaDia) * 100 : 0;
  const desvioTon = totalProducedDay - metaDia;
  const mediaTonH = useMemo(() => {
    const filled = hourlyBars.filter((x) => x.ton > 0);
    if (!filled.length) return 0;
    return filled.reduce((a, b) => a + b.ton, 0) / filled.length;
  }, [hourlyBars]);
  const projection = useMemo(() => mediaTonH * 24, [mediaTonH]);
  const equipmentRows = useMemo(() => {
    const stopMin: Record<string, number> = {};
    for (const s of stops || []) {
      const eq = String(s.equipamento || "").trim();
      if (!eq) continue;
      stopMin[eq] = (stopMin[eq] || 0) + Number(s.minutos || 0);
    }
    const names = new Set<string>(PLANT_EQUIPMENT_FALLBACK);
    for (const h of horimetros || []) if (h?.equipamento) names.add(String(h.equipamento));
    for (const eq of Object.keys(stopMin)) names.add(eq);
    return Array.from(names)
      .filter((x) => x && x.toLowerCase() !== "todos")
      .map((name) => {
        const min = Number(stopMin[name] || 0);
        const availability = Math.max(0, Math.min(100, ((24 * 60 - min) / (24 * 60)) * 100));
        const status = min > 0 ? "Atenção" : "Operando";
        return { name, min, availability, status };
      })
      .slice(0, 7);
  }, [stops, horimetros]);

  const alertRows = useMemo(() => {
    return (stops || [])
      .filter((s) => Number(s.minutos || 0) > 0)
      .map((s) => ({
        title: String(s.tipo_parada || "Parada da planta").toUpperCase(),
        subtitle: [s.equipamento, s.descricao].filter(Boolean).join(" • ") || "Sem descrição",
        period: s.period || "—",
        min: Number(s.minutos || 0),
      }));
  }, [stops]);

  const tooltipStyle = {
    background: "rgba(5,7,10,0.96)",
    border: `1px solid ${COLORS.borderStrong}`,
    borderRadius: 14,
    color: "white",
    boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
  } as const;

  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, padding: 16 }}>
      <div style={{ maxWidth: 1800, margin: "0 auto" }}>
        <header style={{ ...panelStyle(), padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, display: "grid", placeItems: "center", background: "rgba(255,159,26,0.12)", color: COLORS.green }}><Factory size={31} /></div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: 4, color: COLORS.green }}>MONPLANT</div>
              <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.05, fontWeight: 950 }}>Gestão à Vista da Planta</h1>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid rgba(255,159,26,.28)", color: COLORS.green, background: "rgba(255,159,26,.10)", borderRadius: 12, padding: "9px 12px", fontWeight: 950 }}><CheckCircle2 size={18} /> Planta operando</span>
            <Select value={String(plantId || "")} onChange={(v) => setPlantId(v === "all" ? "all" : Number(v))}>
              {plants.length > 1 ? <option value="all">Todas as plantas</option> : null}
              {plants.map((p) => <option key={p.id} value={p.id}>{p.name || p.code || `Planta ${p.id}`}</option>)}
            </Select>
            <label style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${COLORS.borderStrong}`, borderRadius: 12, padding: "0 10px", height: 38 }}>
              <CalendarDays size={18} />
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ background: "transparent", color: COLORS.text, border: 0, outline: 0, fontWeight: 850 }} />
            </label>
            <span style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${COLORS.borderStrong}`, borderRadius: 12, padding: "9px 12px" }}><Clock3 size={18} /> {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
            <button onClick={loadAll} disabled={loading} style={{ height: 38, borderRadius: 12, border: "1px solid rgba(255,159,26,.30)", background: "rgba(255,159,26,.10)", color: COLORS.green, padding: "0 12px", fontWeight: 950, cursor: "pointer" }}><RefreshCw size={17} /></button>
          </div>
        </header>

        {err ? <div style={{ marginTop: 12, ...panelStyle({ borderColor: "rgba(239,68,68,.5)" }), padding: 12, color: "#fecaca" }}>{err}</div> : null}

        <section style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <MetricCard title="Meta do dia" value={fmtBR0(metaDia)} suffix="t" subtitle={`Produzido: ${fmtBR0(totalProducedDay)} t`} icon={<TrendingUp size={23} />} />
          <MetricCard title="Aderência à meta" value={`${fmtBR1(pctMeta)}%`} subtitle="Produção real vs meta do dia" trend={pctMeta - 100} icon={<Activity size={23} />} />
          <MetricCard title="Desvio" value={`${desvioTon >= 0 ? "+" : ""}${fmtBR0(desvioTon)}`} suffix="t" subtitle={desvioTon >= 0 ? "Acima da meta" : "Abaixo da meta"} trend={metaDia > 0 ? (desvioTon / metaDia) * 100 : 0} icon={<Zap size={23} />} />
          <MetricCard title="Projeção do dia" value={fmtBR0(projection)} suffix="t" subtitle="Com base no ritmo atual" trend={metaDia > 0 ? (projection / metaDia - 1) * 100 : 0} icon={<ArrowUpRight size={23} />} />
          <MetricCard title="Toneladas por hora" value={fmtBR1(mediaTonH)} suffix="t/h" subtitle="Média das horas lançadas" trend={metaDia > 0 ? (mediaTonH / (metaDia / 24) - 1) * 100 : 0} icon={<Gauge size={23} />} />
        </section>

        <section style={{ marginTop: 14, display: "grid", gridTemplateColumns: "minmax(0, 1.08fr) minmax(0, .92fr)", gap: 14 }} className="mp-gestao-main-grid">
          <div style={{ ...panelStyle(), padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 950, textTransform: "uppercase" }}>Produção por hora — gráfico de barras</h2>
              <span style={{ color: COLORS.sub, fontWeight: 850 }}>{brDate(firstDayOfMonth(month))} até {brDate(day)}</span>
            </div>
            <div style={{ height: 330 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyBars} margin={{ top: 26, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                  <XAxis dataKey="period" stroke="rgba(255,255,255,.55)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,.55)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: any, name: any) => [name === "freq" ? `${fmtBR1(Number(value))}%` : `${fmtBR0(Number(value))} t`, name === "freq" ? "Frequência" : "Produção"]} />
                  <Bar dataKey="ton" name="Produção" radius={[9, 9, 0, 0]} fill={COLORS.chartBlue}>
                    <LabelList dataKey="ton" position="top" formatter={(v: any) => (Number(v) > 0 ? fmtBR0(Number(v)) : "")} fill="rgba(255,255,255,.9)" fontSize={11} fontWeight={900} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ ...panelStyle(), padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 950, textTransform: "uppercase" }}>Produção por letra</h2>
              <span style={{ color: COLORS.sub, fontSize: 12, fontWeight: 900 }}>Produção real = mesma regra da página Statistics</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
              {letterData.map((item) => <LetterCard key={item.letter} item={item} />)}
            </div>
            <Ticker items={tickerItems} />
          </div>
        </section>

        <section style={{ marginTop: 14, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, .9fr) minmax(0, .9fr)", gap: 14 }} className="mp-gestao-bottom-grid">
          <div style={{ ...panelStyle(), padding: 16 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 950, textTransform: "uppercase" }}>Performance dos equipamentos da planta</h2>
            <div style={{ display: "grid", gap: 9 }}>
              {equipmentRows.map((eq) => (
                <div key={eq.name} style={{ display: "grid", gridTemplateColumns: "95px 1fr 70px 82px", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 12, border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.03)" }}>
                  <strong>{eq.name}</strong>
                  <div style={{ height: 9, borderRadius: 99, background: "rgba(255,255,255,.08)", overflow: "hidden" }}><div style={{ width: `${eq.availability}%`, height: "100%", background: eq.status === "Operando" ? COLORS.chartBlue : COLORS.chartOrange }} /></div>
                  <span style={{ fontWeight: 950 }}>{fmtBR1(eq.availability)}%</span>
                  <span style={{ color: eq.status === "Operando" ? COLORS.chartBlue : COLORS.chartOrange, fontWeight: 900 }}>{eq.status}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...panelStyle(), padding: 16 }}>
            <h2 style={{ margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 950, textTransform: "uppercase" }}><UsersRound size={20} /> Ranking de supervisores</h2>
            <div style={{ display: "grid", gap: 9 }}>
              {supervisorRanking.map((item, index) => {
                const positive = item.trend >= 0;
                return (
                  <div key={item.letter} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto auto", alignItems: "center", gap: 10, padding: "10px", borderRadius: 12, border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.03)" }}>
                    <span style={{ width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 99, background: index === 0 ? COLORS.yellow : "rgba(255,255,255,.10)", color: index === 0 ? "#111" : COLORS.text, fontWeight: 950 }}>{index + 1}</span>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 850 }}>{item.name} • Letra {item.letter}</span>
                    <strong>{fmtBR1(item.performance)}%</strong>
                    <span style={{ display: "flex", alignItems: "center", gap: 3, color: positive ? COLORS.green : COLORS.red, fontWeight: 950 }}>{positive ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}{fmtBR1(Math.abs(item.trend))}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ ...panelStyle(), padding: 16 }}>
            <h2 style={{ margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 950, textTransform: "uppercase" }}><AlertTriangle size={20} /> Alertas operacionais</h2>
            <div style={{ display: "grid", gap: 9, maxHeight: 290, overflow: "auto", paddingRight: 4 }}>
              {alertRows.length ? alertRows.map((a, idx) => (
                <div key={`${a.period}-${idx}`} style={{ border: "1px solid rgba(251,191,36,.35)", background: "rgba(251,191,36,.08)", borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong style={{ color: COLORS.yellow }}>{a.title}</strong>
                    <span style={{ color: COLORS.text, fontWeight: 900 }}>{a.period} • {a.min} min</span>
                  </div>
                  <div style={{ marginTop: 4, color: COLORS.text, fontSize: 13 }}>{a.subtitle}</div>
                </div>
              )) : <div style={{ border: "1px solid rgba(255,159,26,.25)", background: "rgba(255,159,26,.08)", borderRadius: 12, padding: 14, color: COLORS.green, fontWeight: 900 }}>Sem paradas lançadas para a planta neste dia.</div>}
            </div>
          </div>
        </section>


      </div>
      <style>{`
        @keyframes mpTicker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        @media (max-width: 1200px) {
          .mp-gestao-main-grid, .mp-gestao-bottom-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
