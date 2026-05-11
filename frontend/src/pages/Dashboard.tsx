import { useEffect, useMemo, useRef, useState } from "react";

import { useIsMobile } from "../mobile/useIsMobile";
import { useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import {
  BarChart3,
  CalendarDays,
  Gauge,
  LayoutGrid,
  Percent,
  Timer,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  RadialBarChart,
  RadialBar,
  BarChart,
  Bar,
  ComposedChart,
  Legend,
  LabelList,
  ReferenceLine,
} from "recharts";

/* ===================== helpers ===================== */
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

function dayLabel(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}`;
}

function parseBRNumber(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace("%", "").trim();
  s = s.replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmtBR0(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}
function fmtBR1(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function addDaysISO(iso: string, delta: number) {
  const base = new Date(`${iso}T00:00:00`);
  base.setDate(base.getDate() + delta);
  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function enumerateDaysInclusive(startIso: string, endIso: string) {
  if (!startIso || !endIso) return [] as string[];
  let start = startIso;
  let end = endIso;
  if (start > end) {
    start = endIso;
    end = startIso;
  }
  const out: string[] = [];
  let cur = start;
  for (let guard = 0; guard < 370; guard++) {
    out.push(cur);
    if (cur === end) break;
    cur = addDaysISO(cur, 1);
  }
  return out;
}

const WEEKDAY_OPTIONS = [
  { value: 0, short: "Dom", label: "Domingo" },
  { value: 1, short: "Seg", label: "Segunda-feira" },
  { value: 2, short: "Ter", label: "Terça-feira" },
  { value: 3, short: "Qua", label: "Quarta-feira" },
  { value: 4, short: "Qui", label: "Quinta-feira" },
  { value: 5, short: "Sex", label: "Sexta-feira" },
  { value: 6, short: "Sáb", label: "Sábado" },
];

function getWeekdayFromISO(iso: string): number {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return -1;
  return new Date(y, m - 1, d).getDay();
}

function filterDaysByExcludedWeekdays(days: string[], excludedWeekdays: number[]) {
  if (!excludedWeekdays?.length) return days;
  const blocked = new Set(excludedWeekdays);
  return days.filter((d) => !blocked.has(getWeekdayFromISO(d)));
}

/**
 * Normaliza period do backend para "HH-HH"
 * Aceita: "00-01", "0-1", "00:00-01:00", "00:00–01:00", "00:00 — 01:00"
 *
 * ✅ FIX 23-00:
 * - O grid do dashboard usa o último período como "23-00" (virada do dia).
 * - Então NUNCA converta "00" para "24" aqui, senão o dado cai em "23-24" e some do gráfico.
 */
function normalizePeriod(period: string): string {
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
      const h2 = Math.max(0, Math.min(23, Number(h2m[1]))); // ✅ mantém 00 como 00
      return `${pad2(h1)}-${pad2(h2)}`;
    }
  }

  const m = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (m) {
    const h1 = Math.max(0, Math.min(23, Number(m[1])));
    const h2 = Math.max(0, Math.min(23, Number(m[2]))); // ✅ mantém 00 como 00
    return `${pad2(h1)}-${pad2(h2)}`;
  }

  return s0;
}

/** Cria sempre as 24 horas: 00-01 ... 23-00 (virada) e mescla com rows */
function buildHourlyGrid(rows: { period: string; ton: number; freq: number }[]) {
  const map = new Map<string, { ton: number; freq: number }>();

  for (const r of rows) {
    const key = normalizePeriod(r.period);
    const prev = map.get(key);
    const ton = (prev?.ton || 0) + (Number(r.ton) || 0);
    const freq = Math.max(prev?.freq || 0, Number(r.freq) || 0);
    map.set(key, { ton, freq });
  }

  const result: { period: string; ton: number; freq: number }[] = [];
  for (let h = 0; h < 24; h++) {
    const label = `${pad2(h)}-${pad2((h + 1) % 24)}`; // 23-00
    const found = map.get(label);
    result.push({ period: label, ton: found?.ton ?? 0, freq: found?.freq ?? 0 });
  }
  return result;
}

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";


/* ===================== auth hydration (anti-flicker) ===================== */
/**
 * Pequeno hook local para evitar o "pisca" no F5:
 * - primeiro render: loading=true (ainda não leu localStorage)
 * - depois: carrega token e libera chamadas de API
 *
 * Se você já tiver um AuthProvider global com useAuth(), pode remover este hook
 * e importar o seu. Mantive aqui para o Dashboard ficar auto-suficiente.
 */
function useAuth() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const keys = ["mp_token", "token", "access_token", "auth_token"];
    let t: string | null = null;
    for (const k of keys) {
      const v = (localStorage.getItem(k) || "").trim();
      if (v) { t = v; break; }
    }
    setToken(t);
    setLoading(false);

    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (!keys.includes(e.key)) return;
      const v = (localStorage.getItem(e.key) || "").trim();
      setToken(v || null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { token, loading };
}

// ==== Labels do gráfico ====
const BarValueLabel = (props: any) => {
  const { x, y, width, value } = props || {};
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  const cx = (Number(x) || 0) + (Number(width) || 0) / 2;
  const cy = (Number(y) || 0) - 6;
  const label = n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      fill="rgba(255,255,255,0.9)"
      fontSize={13}
      fontWeight={900}
    >
      {label}
    </text>
  );
};

const FreqPointLabel = (props: any) => {
  const { x, y, value } = props || {};
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  const cx = Number(x) || 0;
  const cy = (Number(y) || 0) - 28;
  const label = `${Math.round(n)}%`;
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      fill="rgba(255,255,255,0.9)"
      fontSize={13}
      fontWeight={900}
    >
      {label}
    </text>
  );

};

/* ===================== Tooltip (Produção -> Paradas) ===================== */
type StopTipItem = { equipamento: string; descricao: string };

function TooltipStopsHour({
  active,
  label,
  stopsMap,
}: {
  active?: boolean;
  label?: string;
  stopsMap: Record<string, StopTipItem[]>;
}) {
  if (!active || !label) return null;

  const items = stopsMap?.[String(label)] || [];
  const show = items.slice(0, 5);
  const more = Math.max(0, items.length - show.length);

  return (
    <div
      style={{
        background: "rgba(0,0,0,0.86)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14,
        boxShadow: "0 18px 50px rgba(0,0,0,0.65)",
        padding: "10px 12px",
        maxWidth: 320,
      }}
    >
      <div style={{ color: "rgba(255,255,255,0.90)", fontWeight: 950, marginBottom: 6 }}>
        {label}
      </div>

      {show.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {show.map((it, i) => (
            <div key={i} style={{ fontSize: 12.5, lineHeight: 1.35, color: "rgba(255,255,255,0.82)" }}>
              <b style={{ color: "rgba(255,255,255,0.92)" }}>{it.equipamento}</b>
              {" — "}
              {it.descricao || "Parada (sem descrição)"}
            </div>
          ))}
          {more > 0 ? (
            <div style={{ fontSize: 12, fontWeight: 850, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
              +{more} outras
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", fontWeight: 850 }}>
          Sem parada registrada neste horário
        </div>
      )}
    </div>
  );
}



// Label do gráfico "Últimos 7 dias": risquinho no ponto + valor acima (com clamp nas bordas)
const Last7PointLabel = (props: any) => {
  const { x, y, cx: _cx, cy: _cy, width, height, value, viewBox } = props || {};
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;

  const vb = viewBox || { x: 0, y: 0, width: 0, height: 0 };
  const pad = 22; // garante que 1º/último não fiquem "comidos"
  const minX = (Number(vb.x) || 0) + pad;
  const maxX = (Number(vb.x) || 0) + (Number(vb.width) || 0) - pad;
  // Em LabelList, "x" pode vir como canto esquerdo do label.
  // Preferimos coordenadas do ponto (cx/cy) quando disponíveis.
  const cx0 = Number.isFinite(Number(x)) ? Number(x) : Number(_cx) || ((Number(x) || 0) + (Number(width) || 0) / 2);
  const cy0 = Number.isFinite(Number(y)) ? Number(y) : Number(_cy) || ((Number(y) || 0) + (Number(height) || 0) / 2);

  // Clamp só do TEXTO (pra não cortar nas bordas). O risquinho fica no ponto (bolinha).
  const textX = Math.max(minX, Math.min(maxX, cx0));

  const tickTop = cy0 - 12;
  const textY = cy0 - 18;
  const label = fmtBR0(n);

  return (
    <g>
      <line x1={cx0} y1={cy0 - 2} x2={cx0} y2={tickTop} stroke="rgba(255,255,255,0.45)" strokeWidth={1.2} />
      <text
        x={textX}
        y={textY}
        textAnchor="middle"
        fill="rgba(255,255,255,0.90)"
        fontSize={12}
        fontWeight={950}
      >
        {label}
      </text>
    </g>
  );
};

function authHeaders(token?: string | null): Record<string, string> {
  const t = (token || "").trim();
  if (t) return { Authorization: `Bearer ${t}` };

  const keys = ["mp_token", "token", "access_token", "auth_token"];
  for (const k of keys) {
    const v = (localStorage.getItem(k) || "").trim();
    if (v) return { Authorization: `Bearer ${v}` };
  }
  return {};
}

async function apiGet<T>(path: string, token?: string | null): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders(token) });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}

function goalDayPath(scope: PlantScope, d: string): string {
  return scope === "all"
    ? `/api/aggregate/goals/day/${encodeURIComponent(d)}`
    : `/api/plants/${scope}/goals/day/${encodeURIComponent(d)}`;
}

/* ===================== types ===================== */
type PlantHourRow = { period: string; ton?: any; freq?: any };
type PlantDayPayload = { day: string; obs?: string | null; rows: PlantHourRow[]; updated_at?: string | null };
type Last7Item = { day: string; total_ton: number };

type GoalDay = { day: string; meta_ton: number | null; discount_hours: number | null; updated_at?: string | null };
type RangePlantDay = { day: string; rows: PlantHourRow[]; obs?: string | null; updated_at?: string | null; total_ton?: number };

type StopRow = {
  id: number;
  day: string;
  data_inicio: string;
  hora_inicio: string;
  data_fim: string;
  hora_fim: string;
  equipamento: string;
  tipo_parada: string;
  atividade: string;
  descricao: string;
  tempo_parada_h: number;
  created_at?: string | null;
};

type HorimetroRow = {
  equipamento: string;
  horimetro_ini: number;
  horimetro_fim: number;
  day: string;
  turno: 1 | 2;
  created_at?: string | null;
};

type PlantInfo = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
};

type PlantScope = number | "all";


const EQ_BT01 = "BT-01";
const EQS_TOP_PRODUCTS = ["BT-02", "PN-02", "PN-01", "EH-08"] as const;

type ExportKey =
  | "prod_horaria"
  | "taxa"
  | "meta_dia"
  | "media_hora"
  | "ultimos_7"
  | "hoje_cards"
  | "horimetros_top";

type ExportItem = { key: ExportKey; label: string; hint: string; icon: any };

export default function Dashboard() {
  const nav = useNavigate();
  const { token, loading: authLoading } = useAuth();
  const [day, setDay] = useState<string>(isoTodayLocal());
  const [rangeMode, setRangeMode] = useState(false);
  const [startDay, setStartDay] = useState<string>(addDaysISO(isoTodayLocal(), -10));
  const [endDay, setEndDay] = useState<string>(isoTodayLocal());
  const [excludedWeekdays, setExcludedWeekdays] = useState<number[]>([]);
  const [rangeProdDays, setRangeProdDays] = useState<RangePlantDay[]>([]);
  const [rangeGoalDays, setRangeGoalDays] = useState<GoalDay[]>([]);
  const mobile = useIsMobile();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [prodDay, setProdDay] = useState<PlantDayPayload | null>(null);
  const [last7, setLast7] = useState<Last7Item[]>([]);
  const [stops, setStops] = useState<StopRow[]>([]);
  const [stopsDayCount, setStopsDayCount] = useState<number>(0);
  const [lastByEq, setLastByEq] = useState<Record<string, HorimetroRow | null>>({});
  const [plants, setPlants] = useState<PlantInfo[]>([]);
  const [plantId, setPlantId] = useState<PlantScope | null>(null);

  const POLL_MS = 10_000;

  // ===== metas (dinâmicas por dia/mês) =====
  const WORK_HOURS_BASE = 22; // horas de produção do dia (base)
  const [metaDia, setMetaDia] = useState<number>(8000);
  const [discountHours, setDiscountHours] = useState<number>(2); // almoço / paradas programadas

  const metaHorasTrabalhadas = useMemo(() => {
    const v = Math.max(0, WORK_HOURS_BASE - (discountHours || 0));
    return v;
  }, [discountHours]);

  const metaHoraEsperada = useMemo(() => {
    if (!metaDia || metaDia <= 0) return 0;
    if (!metaHorasTrabalhadas || metaHorasTrabalhadas <= 0) return 0;
    return metaDia / metaHorasTrabalhadas;
  }, [metaDia, metaHorasTrabalhadas]);

  // ===== export modal =====
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);

  const exportItems: ExportItem[] = useMemo(
    () => [
      { key: "prod_horaria", label: "Produção", hint: "Ton/H + Freq", icon: BarChart3 },
      { key: "taxa", label: "Taxa", hint: "Freq% horas", icon: Percent },
      { key: "meta_dia", label: "Meta", hint: "Gauge", icon: Gauge },
      { key: "media_hora", label: "Média", hint: "Mini área", icon: TrendingUp },
      { key: "ultimos_7", label: "7 dias", hint: "Área", icon: CalendarDays },
      { key: "hoje_cards", label: "Hoje", hint: "Cards", icon: LayoutGrid },
      { key: "horimetros_top", label: "Horim.", hint: "Cards", icon: Timer },
    ],
    []
  );

  const [exportSel, setExportSel] = useState<Record<ExportKey, boolean>>({
    prod_horaria: true,
    taxa: true,
    meta_dia: true,
    media_hora: true,
    ultimos_7: true,
    hoje_cards: true,
    horimetros_top: true,
  });

  async function exportJPEG() {
    const el = exportRef.current;
    if (!el) return;

    // evita capturar tooltip aberto
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
    a.download = `monplant_export_${day}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }


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
    setLoading(true);
    setErr(null);

    try {
      if (!plantId) {
        setProdDay(null);
        setRangeProdDays([]);
        setRangeGoalDays([]);
        setLast7([]);
        setStops([]);
        setStopsDayCount(0);
        setLastByEq({});
        return;
      }

      if (rangeMode) {
        const days = filterDaysByExcludedWeekdays(
          enumerateDaysInclusive(startDay, endDay),
          excludedWeekdays
        );
        const prodResults = await Promise.all(
          days.map(async (d) => {
            const rangePath =
              plantId === "all"
                ? `/api/aggregate/plant-production/${encodeURIComponent(d)}`
                : `/api/plants/${plantId}/plant-production/${encodeURIComponent(d)}`;

            const payload = await apiGet<PlantDayPayload>(rangePath, token).catch(() => {
              return { day: d, rows: [], obs: "" } as PlantDayPayload;
            });
            const total_ton = (payload?.rows || []).reduce((acc, r) => acc + parseBRNumber(r?.ton), 0);
            return { ...payload, day: d, total_ton } as RangePlantDay;
          })
        );

        const goalResults = await Promise.all(
          days.map(async (d) => {
            const g = await apiGet<GoalDay>(goalDayPath(plantId, d), token).catch(() => null as any);
            return g ? ({ ...g, day: d } as GoalDay) : ({ day: d, meta_ton: null, discount_hours: null } as GoalDay);
          })
        );

        const metas = goalResults.map((g) => Number(g?.meta_ton ?? 0)).filter((n) => Number.isFinite(n) && n > 0);
        const discounts = goalResults.map((g) => Number(g?.discount_hours ?? 0)).filter((n) => Number.isFinite(n));

        if (metas.length) setMetaDia(metas.reduce((a, b) => a + b, 0) / metas.length);
        if (discounts.length) setDiscountHours(discounts.reduce((a, b) => a + b, 0) / discounts.length);

        setRangeProdDays(prodResults);
        setRangeGoalDays(goalResults);
        setProdDay(null);
        setLast7(prodResults.map((x) => ({ day: x.day, total_ton: Number(x.total_ton) || 0 })));
        setStops([]);
        setStopsDayCount(0);
        setLastByEq({});
        return;
      }

      const dayPath =
        plantId === "all"
          ? `/api/aggregate/plant-production/${encodeURIComponent(day)}`
          : `/api/plants/${plantId}/plant-production/${encodeURIComponent(day)}`;

      const p = await apiGet<PlantDayPayload>(dayPath, token).catch(() => {
        return { day, rows: [], obs: "" } as PlantDayPayload;
      });

      const g = await apiGet<GoalDay>(goalDayPath(plantId, day), token).catch(() => null as any);
      if (g && typeof g === "object") {
        const mdRaw = (g as any).meta_ton;
        const dhRaw = (g as any).discount_hours;
        if (mdRaw !== null && mdRaw !== undefined) {
          const md = Number(mdRaw);
          if (!Number.isNaN(md)) setMetaDia(md);
        }
        if (dhRaw !== null && dhRaw !== undefined) {
          const dh = Number(dhRaw);
          if (!Number.isNaN(dh)) setDiscountHours(dh);
        }
      }

      const last7Path =
        plantId === "all"
          ? `/api/aggregate/plant-production/last7days`
          : `/api/plants/${plantId}/plant-production/last7days`;

      const stopsLaunchPath =
        plantId === "all"
          ? `/api/aggregate/stops-launch?day=${encodeURIComponent(day)}`
          : `/api/plants/${plantId}/stops-launch?day=${encodeURIComponent(day)}`;

      const ps = await apiGet<any>(stopsLaunchPath, token).catch(() => null);
      const l7 = await apiGet<Last7Item[]>(last7Path, token).catch(() => []);

      const psDay =
        plantId === "all"
          ? []
          : await apiGet<StopRow[]>(`/api/plants/${plantId}/stops?day=${encodeURIComponent(day)}`, token).catch(() => []);

      const hb =
        plantId === "all"
          ? []
          : await apiGet<HorimetroRow[]>(`/api/plants/${plantId}/horimetros/last-by-eq`, token).catch(() => []);

      const map: Record<string, HorimetroRow | null> = {};
      for (const r of hb || []) {
        if (!r?.equipamento) continue;
        map[r.equipamento] = r;
      }

      setProdDay(p);
      setRangeProdDays([]);
      setRangeGoalDays([]);
      setLast7(Array.isArray(l7) ? l7 : []);
      setStops(Array.isArray((ps as any)?.rows) ? (ps as any).rows : []);
      setStopsDayCount(Array.isArray(psDay) ? psDay.length : 0);
      setLastByEq(map);
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!token) return;
    loadPlants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, token]);

  useEffect(() => {
    if (authLoading) return; // espera hidratar auth
    if (!token) return; // só chama API se tiver token
    if (!plantId) return;

    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, token, plantId, day, rangeMode, startDay, endDay, excludedWeekdays]);

  useEffect(() => {
    if (authLoading) return;
    if (!token) return;
    if (!plantId) return;

    const id = window.setInterval(() => loadAll(), POLL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, token, plantId, day, rangeMode, startDay, endDay, excludedWeekdays]);

  /* ===================== computed ===================== */
  const rangeDays = useMemo(() => {
    return filterDaysByExcludedWeekdays(
      enumerateDaysInclusive(startDay, endDay),
      excludedWeekdays
    );
  }, [startDay, endDay, excludedWeekdays]);

  const totalTonDay = useMemo(() => {
    if (rangeMode) {
      return (rangeProdDays || []).reduce((acc, d) => acc + (Number(d.total_ton) || 0), 0);
    }
    const rows = prodDay?.rows || [];
    let sum = 0;
    for (const r of rows) sum += parseBRNumber(r.ton);
    return sum;
  }, [prodDay, rangeMode, rangeProdDays]);

  const totalTonWith20Desvio = useMemo(() => {
    return totalTonDay * 0.8;
  }, [totalTonDay]);

  const pctMetaRaw = useMemo(() => {
    if (metaDia <= 0) return 0;
    return (totalTonDay / metaDia) * 100;
  }, [totalTonDay, metaDia]);

  // Gauge não passa de 100% (visual), mas o texto mostra o valor real (ex: 120%)
  const pctMetaGauge = useMemo(() => {
    return Math.max(0, Math.min(100, pctMetaRaw));
  }, [pctMetaRaw]);

  const pctMetaOver = useMemo(() => {
    return pctMetaRaw > 100 ? pctMetaRaw - 100 : 0;
  }, [pctMetaRaw]);

  // ✅ normaliza + garante 24 horas + inclui 23-00
  const hourlySeries = useMemo(() => {
    if (rangeMode) {
      const days = rangeDays.length || 1;
      const bucket = new Map<string, { ton: number; freq: number }>();
      for (const d of rangeProdDays || []) {
        const grid = buildHourlyGrid(
          (d.rows || []).map((r) => ({
            period: normalizePeriod(r.period),
            ton: parseBRNumber(r.ton),
            freq: parseBRNumber(r.freq),
          }))
        );
        for (const row of grid) {
          const prev = bucket.get(row.period) || { ton: 0, freq: 0 };
          bucket.set(row.period, {
            ton: prev.ton + (Number(row.ton) || 0),
            freq: prev.freq + (Number(row.freq) || 0),
          });
        }
      }
      return buildHourlyGrid(
        Array.from(bucket.entries()).map(([period, vals]) => ({
          period,
          ton: vals.ton / days,
          freq: vals.freq / days,
        }))
      );
    }

    const rows = prodDay?.rows || [];
    const data = rows.map((r) => ({
      period: normalizePeriod(r.period),
      ton: parseBRNumber(r.ton),
      freq: parseBRNumber(r.freq),
    }));
    return buildHourlyGrid(data);
  }, [prodDay, rangeMode, rangeProdDays, rangeDays]);

    // ✅ Mapa: período ("HH-HH") -> lista de observações de parada (para tooltip do gráfico)
  // Regras:
  // - aceita tanto formato antigo (hora_inicio) quanto novo (period "HH-HH")
  // - se a parada vier como faixa (ex: 19-21), a descrição aparece em TODOS os horários decorrentes (19-20, 20-21, 21-22)
  const stopsByPeriod = useMemo<Record<string, StopTipItem[]>>(() => {
    const map: Record<string, StopTipItem[]> = {};

    const push = (h: number, eq: string, desc: string) => {
      const key = `${pad2(h)}-${pad2((h + 1) % 24)}`;
      if (!map[key]) map[key] = [];
      map[key].push({ equipamento: eq, descricao: desc });
    };

    const parsePeriod = (p: string): { a: number; b: number } | null => {
      const s = String(p || "").trim();
      const m = s.match(/^(\d{2})-(\d{2})$/);
      if (!m) return null;
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      if (a < 0 || a > 23 || b < 0 || b > 23) return null;
      return { a, b };
    };

    const expandHoursInclusive = (a: number, b: number): number[] => {
      // Regra:
      // - Se for uma faixa "normal" de 1h (ex: 22-23), a parada pertence SOMENTE ao bucket 22-23 (não joga em 23-00)
      // - Se for uma faixa maior (ex: 19-21), aplica em TODOS os horários decorrentes incluindo o "b"
      //   (19-20, 20-21, 21-22)
      if (((a + 1) % 24) === b) return [a];

      const out: number[] = [];
      let h = a;
      for (let guard = 0; guard < 48; guard++) {
        out.push(h);
        if (h === b) break;
        h = (h + 1) % 24;
      }
      return out;
    };

    for (const s of (stops || []) as any[]) {
      const tipo = String(s?.tipo_parada ?? s?.stop_type ?? "").trim();
      const descRaw = String(s?.descricao ?? s?.atividade ?? s?.description ?? "").trim();
      const eq = String(s?.equipamento ?? s?.equipment ?? "").trim() || "—";
      const minutes = Number(s?.minutos ?? s?.minutes ?? 0) || 0;

      // ignora linhas totalmente vazias/zeradas (pra não poluir tooltip)
      const hasText = Boolean(tipo || descRaw || (eq && eq !== "—"));
      if (minutes <= 0 && !hasText) continue;

      const desc = (tipo && descRaw) ? `${tipo} — ${descRaw}` : (tipo || descRaw || "Parada");

      // Novo formato (bv_launch.stops_rows): period "HH-HH"
      const p = parsePeriod(String(s?.period || ""));
      if (p) {
        const hours = expandHoursInclusive(p.a, p.b);
        for (const h of hours) push(h, eq, desc);
        continue;
      }

      // Formato antigo: hora_inicio (HH:mm:ss)
      const hStr = String(s?.hora_inicio || "").slice(0, 2);
      const h = Number(hStr);
      if (Number.isFinite(h) && h >= 0 && h <= 23) push(h, eq, desc);
    }

    return map;
  }, [stops]);


  // ✅ garante respiro no eixo Y (Ton/H): maior valor + 120
  const tonDomain = useMemo(() => {
    const maxTon = Math.max(...(hourlySeries || []).map((r) => Number(r.ton) || 0), 0);
    return [0, Math.max(120, maxTon + 120)] as [number, number];
  }, [hourlySeries]);

  const avgTonPerHour = useMemo(() => {
    const filled = (hourlySeries || []).filter((r) => (Number(r.ton) || 0) > 0);
    if (!filled.length) return 0;
    const sum = filled.reduce((acc, r) => acc + (Number(r.ton) || 0), 0);
    return sum / filled.length;
  }, [hourlySeries]);

  
  // ===== projeção (mesma lógica do Ritmo) =====
// Projeção (HOJE): produzido até agora + (média real t/h * horas restantes do dia)
// Projeção (DIA PASSADO): total do dia (sem projeção)
const projectionTon24 = useMemo(() => {
  const avg = Number(avgTonPerHour) || 0;
  if (!avg) return totalTonDay;

  const isToday = day === isoTodayLocal();
  if (!isToday) return totalTonDay;

  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const remainingH = Math.max(0, (1440 - mins) / 60);

  return totalTonDay + avg * remainingH;
}, [avgTonPerHour, day, totalTonDay]);

  const projectionDiffTon = useMemo(() => {
    if (!metaDia || metaDia <= 0) return 0;
    return projectionTon24 - metaDia;
  }, [projectionTon24, metaDia]);

  const projectionIsPositive = metaDia > 0 ? projectionTon24 >= metaDia : false;

const EXPECTED_TON_H = metaHoraEsperada;

  // garante que as linhas (esperada e media real) sempre aparecam no mini-grafico
  const miniTonDomain = useMemo(() => {
    const maxTon = Math.max(...(hourlySeries || []).map((r) => Number(r.ton) || 0), 0);
    const maxRef = Math.max(maxTon, EXPECTED_TON_H, Number(avgTonPerHour) || 0);
    return [0, Math.max(120, maxRef + 120)] as [number, number];
  }, [hourlySeries, avgTonPerHour]);

  // tendência da última hora preenchida vs penúltima (seta no card "Média/Hora")
  const avgHourTrend = useMemo(() => {
    const filled = (hourlySeries || []).filter((r) => (Number(r.ton) || 0) > 0);
    if (filled.length < 2) {
      return {
        dir: "na" as "up" | "down" | "flat" | "na",
        delta: 0,
        lastPeriod: "",
        prevPeriod: "",
      };
    }

    const prev = filled[filled.length - 2];
    const last = filled[filled.length - 1];
    const prevTon = Number(prev?.ton) || 0;
    const lastTon = Number(last?.ton) || 0;
    const delta = lastTon - prevTon;

    const EPS = 0.05; // evita piscar com diferenças minúsculas
    const dir: "up" | "down" | "flat" = Math.abs(delta) <= EPS ? "flat" : delta > 0 ? "up" : "down";

    return {
      dir,
      delta,
      lastPeriod: String(last?.period || ""),
      prevPeriod: String(prev?.period || ""),
    };
  }, [hourlySeries]);

  const last7Series = useMemo(() => {
    if (rangeMode) {
      return (rangeProdDays || []).map((x) => ({
        day: dayLabel(x.day),
        total: Number(x.total_ton) || 0,
      }));
    }
    return (last7 || []).map((x) => ({
      day: dayLabel(x.day),
      total: Number(x.total_ton) || 0,
    }));
  }, [last7, rangeMode, rangeProdDays]);

  const rangeAvgDayTon = useMemo(() => {
    if (!rangeMode) return 0;
    const days = rangeDays.length || 1;
    return totalTonDay / days;
  }, [rangeMode, totalTonDay, rangeDays]);

  const periodSummaryText = useMemo(() => {
    if (!rangeMode) return "";
    const days = rangeDays.length;
    const excluded = excludedWeekdays
      .map((w) => WEEKDAY_OPTIONS.find((x) => x.value === w)?.short)
      .filter(Boolean)
      .join(", ");
    return `${brDate(startDay)} a ${brDate(endDay)} • ${days} dia${days === 1 ? "" : "s"}${excluded ? ` • exceto ${excluded}` : ""}`;
  }, [rangeMode, startDay, endDay, rangeDays, excludedWeekdays]);

  const totalStops = useMemo(() => Number(stopsDayCount) || 0, [stopsDayCount]);

  const lastStop = useMemo(() => {
    const list = [...(stops || [])];
    list.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return list[0] || null;
  }, [stops]);

  const lastHorimetroBT01 = useMemo(() => {
    return (lastByEq || {})[EQ_BT01] || null;
  }, [lastByEq]);

  const topProductsHorimetros = useMemo(() => {
    const map = lastByEq || {};
    return EQS_TOP_PRODUCTS.map((eq) => ({
      eq,
      row: map[eq] || null,
    }));
  }, [lastByEq]);

  const levelBars = useMemo(() => {
    const filled = (hourlySeries || []).filter((r) => r.freq > 0 || r.ton > 0);
    const last = filled.slice(-6);
    return last.map((r) => ({
      period: r.period,
      freq: Math.max(0, Math.min(100, r.freq)),
    }));
  }, [hourlySeries]);

  const levelAvg = useMemo(() => {
    if (!levelBars.length) return 0;
    const s = levelBars.reduce((acc, r) => acc + (Number(r.freq) || 0), 0);
    return s / levelBars.length;
  }, [levelBars]);

  const selectedPlantName =
    plantId === "all"
      ? "Todas as plantas"
      : plants.find((p) => Number(p.id) === Number(plantId))?.name || "Planta";

  const gaugeData = useMemo(() => [{ name: "meta", value: pctMetaGauge, fill: "#ff9f1a" }], [pctMetaGauge]);

  /* ===================== styles ===================== */
  const cardBase: React.CSSProperties = {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
    backdropFilter: "blur(10px)",
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    justifyContent: "space-between",
    marginBottom: 12,
  };

  const titleStyle: React.CSSProperties = {
    fontWeight: 900,
    letterSpacing: -0.02,
    fontSize: 18,
  };

  const subStyle: React.CSSProperties = {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: 700,
  };

  const topBar: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: mobile ? "1fr" : "1fr auto auto auto",
    gap: 12,
    alignItems: "center",
    marginTop: 10,
  };

  const smallPill: React.CSSProperties = {
    height: 36,
    borderRadius: 999,
    border: "1px solid rgba(255,159,26,0.25)",
    background: "rgba(255,159,26,0.10)",
    padding: "0 12px",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 900,
    color: "rgba(255,255,255,0.88)",
  };

  // ===== export modal styles =====
  const modalOverlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 200,
    background: "rgba(0,0,0,0.65)",
    backdropFilter: "blur(8px)",
    display: "grid",
    placeItems: "center",
    padding: 14,
  };

  const modalCard: React.CSSProperties = {
    width: "min(1480px, 98vw)",
    maxHeight: "94vh",
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(14,18,22,0.86)",
    boxShadow: "0 30px 90px rgba(0,0,0,0.70)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  const modalHeader: React.CSSProperties = {
    padding: 14,
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  };

  const modalBody: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "92px 1fr",
    gap: 14,
    padding: 14,
    minHeight: 0,
    flex: 1,
  };

  const panel: React.CSSProperties = {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.22)",
    padding: 12,
    minHeight: 0,
  };

  return (
    <div className="mp-container">
      {/* TOP BAR */}
      <div style={topBar}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ ...subStyle, marginRight: 2 }}>Modo</span>
          <button
            type="button"
            onClick={() => setRangeMode((v) => !v)}
            style={{
              height: 38,
              minWidth: 148,
              borderRadius: 999,
              border: "1px solid " + (rangeMode ? "rgba(255,159,26,0.35)" : "rgba(255,255,255,0.12)"),
              background: rangeMode ? "rgba(255,159,26,0.12)" : "rgba(255,255,255,0.06)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "0 8px 0 12px",
              color: "rgba(255,255,255,0.88)",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            <span>{rangeMode ? "Período" : "Principal"}</span>
            <span
              style={{
                width: 42,
                height: 24,
                borderRadius: 999,
                background: rangeMode ? "rgba(255,159,26,0.22)" : "rgba(255,255,255,0.12)",
                position: "relative",
                display: "inline-block",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: rangeMode ? 21 : 3,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: rangeMode ? "#ff9f1a" : "rgba(255,255,255,0.82)",
                  transition: "left .18s ease",
                }}
              />
            </span>
          </button>

          <span style={{ ...subStyle, marginLeft: 6 }}>Planta</span>
          <select
            className="mp-input"
            style={{ width: mobile ? "100%" : 210, height: 42, borderRadius: 14 }}
            value={plantId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setPlantId(v === "all" ? "all" : v ? Number(v) : null);
            }}
            disabled={plants.length === 0}
          >
            {plants.length === 0 ? <option value="">Sem plantas</option> : null}
            {plants.length > 0 ? <option value="all">Todas as plantas</option> : null}
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {!rangeMode ? (
            <>
              <span style={{ ...subStyle, marginLeft: 6 }}>Data</span>
              <input
                className="mp-input"
                style={{ width: mobile ? "100%" : 160, height: 42, borderRadius: 14 }}
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </>
          ) : (
            <>
              <span style={{ ...subStyle, marginLeft: 6 }}>De</span>
              <input
                className="mp-input"
                style={{ width: mobile ? "100%" : 160, height: 42, borderRadius: 14 }}
                type="date"
                value={startDay}
                max={endDay}
                onChange={(e) => setStartDay(e.target.value)}
              />
              <span style={subStyle}>Até</span>
              <input
                className="mp-input"
                style={{ width: mobile ? "100%" : 160, height: 42, borderRadius: 14 }}
                type="date"
                value={endDay}
                min={startDay}
                onChange={(e) => setEndDay(e.target.value)}
              />

              <span style={{ ...subStyle, marginLeft: 6 }}>Excluir dias</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {WEEKDAY_OPTIONS.map((w) => {
                  const selected = excludedWeekdays.includes(w.value);
                  return (
                    <button
                      key={w.value}
                      type="button"
                      title={`Não considerar ${w.label}`}
                      onClick={() =>
                        setExcludedWeekdays((prev) =>
                          prev.includes(w.value)
                            ? prev.filter((x) => x !== w.value)
                            : [...prev, w.value].sort((a, b) => a - b)
                        )
                      }
                      style={{
                        height: 34,
                        minWidth: 46,
                        borderRadius: 999,
                        border: "1px solid " + (selected ? "rgba(255,159,26,0.50)" : "rgba(255,255,255,0.12)"),
                        background: selected ? "rgba(255,159,26,0.18)" : "rgba(255,255,255,0.05)",
                        color: selected ? "#ffb24a" : "rgba(255,255,255,0.78)",
                        fontWeight: 950,
                        cursor: "pointer",
                      }}
                    >
                      {w.short}
                    </button>
                  );
                })}

                {excludedWeekdays.length ? (
                  <button
                    type="button"
                    onClick={() => setExcludedWeekdays([])}
                    style={{
                      height: 34,
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.04)",
                      color: "rgba(255,255,255,0.70)",
                      fontWeight: 900,
                      cursor: "pointer",
                      padding: "0 10px",
                    }}
                  >
                    Limpar
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: mobile ? "wrap" : "nowrap", justifyContent: mobile ? "flex-start" : "flex-end" }}>
          <span style={{ ...smallPill, flex: mobile ? "1 1 100%" : undefined }}>
            {!plantId ? "Selecione a planta" : loading ? "Atualizando..." : err ? "Erro" : "Online"}
          </span>

          <button className="mp-btn" onClick={() => setExportOpen(true)} style={{ height: 42, flex: mobile ? "1 1 120px" : undefined }}>
            Exportar
          </button>

          <button className="mp-btn mp-btn-primary" onClick={loadAll} disabled={loading} style={{ height: 42, flex: mobile ? "1 1 120px" : undefined }}>
            Atualizar
          </button>
        </div>
      </div>

      <div style={{ marginTop: 8, color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 800 }}>
        Dashboard • {selectedPlantName} • {rangeMode ? periodSummaryText : brDate(day)} {err ? `• ${err}` : plantId === "all" ? "• consolidado" : rangeMode ? "• média por período" : "• tempo real"}
      </div>

      {/* MODAL EXPORT */}
      {exportOpen ? (
        <div style={modalOverlay} onClick={() => setExportOpen(false)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 950, fontSize: 16, color: "rgba(255,255,255,0.92)" }}>
                  Exportação • {brDate(day)}
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>
                  Marque o que vai aparecer e clique em “Exportar JPEG”.
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  className="mp-btn"
                  style={{ height: 38 }}
                  onClick={() => {
                    const allOn = {} as Record<ExportKey, boolean>;
                    exportItems.forEach((it) => (allOn[it.key] = true));
                    setExportSel(allOn);
                  }}
                >
                  Marcar tudo
                </button>

                <button
                  className="mp-btn"
                  style={{ height: 38 }}
                  onClick={() => {
                    const allOff = {} as Record<ExportKey, boolean>;
                    exportItems.forEach((it) => (allOff[it.key] = false));
                    setExportSel(allOff);
                  }}
                >
                  Limpar
                </button>

                <button className="mp-btn mp-btn-primary" style={{ height: 38 }} onClick={exportJPEG}>
                  Exportar JPEG
                </button>

                <button className="mp-btn" style={{ height: 38 }} onClick={() => setExportOpen(false)}>
                  Fechar
                </button>
              </div>
            </div>

            <div style={modalBody} className="mp-export-body">
              {/* left: selector */}
              <div style={{ ...panel, overflow: "auto", padding: 10 }}>
                <div style={{ fontWeight: 950, marginBottom: 10, color: "rgba(255,255,255,0.9)", paddingLeft: 4 }}>
                  Selecionar
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                  {exportItems.map((it) => {
                    const Icon = it.icon;
                    const on = !!exportSel[it.key];
                    return (
                      <button
                        key={it.key}
                        onClick={() => setExportSel((s) => ({ ...s, [it.key]: !on }))}
                        title={`${it.label} • ${it.hint}`}
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 18,
                          border: "1px solid " + (on ? "rgba(255,159,26,0.30)" : "rgba(255,255,255,0.10)"),
                          background: on ? "rgba(255,159,26,0.12)" : "rgba(255,255,255,0.04)",
                          display: "grid",
                          placeItems: "center",
                          cursor: "pointer",
                          color: "rgba(255,255,255,0.92)",
                          padding: 0,
                        }}
                      >
                        <div style={{ display: "grid", placeItems: "center", gap: 6 }}>
                          <span
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 16,
                              display: "grid",
                              placeItems: "center",
                              border: "1px solid " + (on ? "rgba(255,159,26,0.28)" : "rgba(255,255,255,0.10)"),
                              background: on ? "rgba(255,159,26,0.10)" : "rgba(0,0,0,0.18)",
                            }}
                          >
                            <Icon size={20} />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div style={{ marginTop: 12, fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)", padding: "0 4px" }}>
                  Dica: passe o mouse para ver o nome.
                </div>
              </div>

              {/* right: preview (capturado) */}
              <div style={{ ...panel, overflow: "auto" }}>
                <div
                  ref={exportRef}
                  style={{
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "#0b0f14",
                    padding: 14,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 950, fontSize: 16, color: "rgba(255,255,255,0.92)" }}>
                        MonPlant • Dashboard • {selectedPlantName}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>
                        {brDate(day)} • Exportação
                      </div>
                    </div>
                    <div
                      style={{
                        height: 32,
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.06)",
                        padding: "0 12px",
                        display: "inline-flex",
                        alignItems: "center",
                        fontWeight: 900,
                        color: "rgba(255,255,255,0.82)",
                      }}
                    >
                      {loading ? "Atualizando..." : err ? "Erro" : "Online"}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(12, 1fr)", gap: 14, alignItems: "start" }}>
                    {/* PRODUÇÃO HORÁRIA (grande) */}
                    {exportSel.prod_horaria ? (
                      <div style={{ ...cardBase, padding: 16, gridColumn: "span 12" }}>
                        <div style={headerStyle}>
                          <div>
                            <div style={titleStyle}>Produção por hora (Ton/H + Frequência)</div>
                            <div style={subStyle}>
                               {rangeMode ? <>Média diária do filtro: <b style={{ color: "rgba(255,255,255,0.88)" }}>{fmtBR0(rangeAvgDayTon)}</b> t</> : <>Total do dia: <b style={{ color: "rgba(255,255,255,0.88)" }}>{fmtBR0(totalTonDay)}</b> t</>}
                            </div>
                          </div>
                          <span
                            style={{
                              height: 32,
                              borderRadius: 999,
                              border: "1px solid rgba(255,255,255,0.12)",
                              background: "rgba(255,255,255,0.06)",
                              padding: "0 12px",
                              display: "inline-flex",
                              alignItems: "center",
                              fontWeight: 900,
                              color: "rgba(255,255,255,0.82)",
                            }}
                          >
                            {prodDay?.updated_at ? "Atualizado" : "—"}
                          </span>
                        </div>

                        <div style={{ height: mobile ? 300 : 420 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={hourlySeries} margin={{ top: 16, right: 26, left: 0, bottom: 0 }}>
                              <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                              <XAxis dataKey="period" interval={0} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                              <YAxis
                                yAxisId="left"
                                domain={tonDomain}
                                tickFormatter={(v) => fmtBR0(Number(v) || 0)}
                                tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                              />
                              <YAxis
                                yAxisId="right"
                                orientation="right"
                                domain={[0, 100]}
                                tickFormatter={(v) => `${fmtBR0(Number(v) || 0)}%`}
                                tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                              />
                              <Tooltip content={(p: any) => <TooltipStopsHour {...p} stopsMap={stopsByPeriod} />} />
<Legend
                                verticalAlign="bottom"
                                height={30}
                                iconType="circle"
                                formatter={(value) => (value === "freq" ? "Frequência (%)" : value === "ton" ? "Ton/H" : value)}
                                wrapperStyle={{ color: "#00CCFF", fontWeight: 900 }}
                              />

                              <Bar yAxisId="left" dataKey="ton" fill="#00CCFF" radius={[10, 10, 0, 0]} maxBarSize={38}>
                                <LabelList dataKey="ton" content={BarValueLabel} />
                              </Bar>

                              <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="freq"
                                stroke="#ff9f1a"
                                strokeWidth={3}
                                dot={{ r: 4 }}
                                activeDot={{ r: 5 }}
                              >
                                <LabelList dataKey="freq" content={FreqPointLabel} />
                              </Line>
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ) : null}

                    {/* TAXA */}
                    {exportSel.taxa ? (
                      <div style={{ ...cardBase, padding: 14, gridColumn: mobile ? "span 12" : "span 4", minHeight: 310 }}>
                        <div style={headerStyle}>
                          <div>
                            <div style={titleStyle}>Taxa Média</div>
                            <div style={subStyle}>Freq% últimas horas</div>
                          </div>
                          <span
                            style={{
                              height: 32,
                              borderRadius: 999,
                              border: "1px solid rgba(255,255,255,0.12)",
                              background: "rgba(255,255,255,0.06)",
                              padding: "0 12px",
                              display: "inline-flex",
                              alignItems: "center",
                              fontWeight: 900,
                              color: "rgba(255,255,255,0.82)",
                            }}
                          >
                            {fmtBR0(levelAvg)}%
                          </span>
                        </div>

                        <div style={{ height: mobile ? 160 : 190 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={levelBars} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
                              <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                              <XAxis dataKey="period" interval={0} minTickGap={0} tickMargin={6} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                              <YAxis domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                              <Tooltip
                                formatter={(v: any) => `${fmtBR0(Number(v) || 0)}%`}
                                contentStyle={{
                                  background: "rgba(0,0,0,0.86)",
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  borderRadius: 14,
                                }}
                                labelStyle={{ color: "rgba(255,255,255,0.86)" }}
                              />
                              <Bar dataKey="freq" radius={[10, 10, 0, 0]} fill="#ff9f1a">
                                <LabelList
                                  dataKey="freq"
                                  position="center"
                                  formatter={(v: any) => `${fmtBR0(Number(v) || 0)}%`}
                                  style={{
                                    fill: "rgba(255,255,255,0.95)",
                                    fontWeight: 900,
                                    fontSize: 12,
                                    textShadow: "0 1px 2px rgba(0,0,0,.55)",
                                    pointerEvents: "none",
                                  }}
                                />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ) : null}

                    {/* META */}
                    {exportSel.meta_dia ? (
                      <div style={{ ...cardBase, padding: 14, gridColumn: mobile ? "span 12" : "span 4", minHeight: 310 }}>
                        <div style={headerStyle}>
                          <div>
                            <div style={titleStyle}>Produção do dia</div>
                            <div style={subStyle}>Meta: {fmtBR0(metaDia)} t</div>
                          </div>
                        </div>

                        <div style={{ height: mobile ? 160 : 190, position: "relative" }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <RadialBarChart data={gaugeData} innerRadius="75%" outerRadius="100%" startAngle={180} endAngle={0}>
                              <RadialBar dataKey="value" cornerRadius={14} background={{ fill: "rgba(255,255,255,0.08)" }} />
                            </RadialBarChart>
                          </ResponsiveContainer>

                          <div style={{ position: "absolute", left: 0, right: 0, top: 78, textAlign: "center", pointerEvents: "none" }}>
                            <div style={{ fontSize: 30, fontWeight: 950, letterSpacing: -0.02 }}>{fmtBR0(pctMetaRaw)}%</div>
                            <div style={{ ...subStyle, marginTop: 2 }}>Atingimento</div>
                            {pctMetaOver > 0 ? (
                              <div style={{ marginTop: 4, fontWeight: 900, color: "rgba(34,197,94,0.95)" }}>
                                +{fmtBR0(pctMetaOver)}% acima
                              </div>
                            ) : null}
                            <div style={{ marginTop: 6, fontWeight: 900, color: "rgba(255,255,255,0.86)" }}>
                              {fmtBR0(totalTonDay)} t
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {/* MÉDIA */}
                    {exportSel.media_hora ? (
                      <div style={{ ...cardBase, padding: 14, gridColumn: mobile ? "span 12" : "span 4", minHeight: 310 }}>
                        <div style={headerStyle}>
                          <div>
                            <div style={titleStyle}>Média/Hora</div>
                            <div style={subStyle}>Média de produção por hora</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span
                              style={{
                                height: 32,
                                borderRadius: 999,
                                border: "1px solid rgba(255,255,255,0.12)",
                                background: "rgba(255,255,255,0.06)",
                                padding: "0 12px",
                                display: "inline-flex",
                                alignItems: "center",
                                fontWeight: 900,
                                color: "rgba(255,255,255,0.82)",
                              }}
                            >
                              {fmtBR1(avgTonPerHour)} t/h
                            </span>

                            <span
                              title={
                                avgHourTrend.dir === "na"
                                  ? "Sem comparação (precisa de pelo menos 2 horas preenchidas)"
                                  : `Comparação: ${avgHourTrend.prevPeriod} → ${avgHourTrend.lastPeriod}`
                              }
                              style={{
                                height: 32,
                                borderRadius: 999,
                                border:
                                  avgHourTrend.dir === "up"
                                    ? "1px solid rgba(34,197,94,0.40)"
                                    : avgHourTrend.dir === "down"
                                      ? "1px solid rgba(239,68,68,0.40)"
                                      : "1px solid rgba(255,255,255,0.12)",
                                background:
                                  avgHourTrend.dir === "up"
                                    ? "rgba(34,197,94,0.14)"
                                    : avgHourTrend.dir === "down"
                                      ? "rgba(239,68,68,0.14)"
                                      : "rgba(255,255,255,0.06)",
                                padding: "0 10px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                fontWeight: 950,
                                color:
                                  avgHourTrend.dir === "up"
                                    ? "rgba(34,197,94,0.95)"
                                    : avgHourTrend.dir === "down"
                                      ? "rgba(239,68,68,0.95)"
                                      : "rgba(255,255,255,0.75)",
                              }}
                            >
                              {avgHourTrend.dir === "up" ? (
                                <TrendingUp size={16} />
                              ) : avgHourTrend.dir === "down" ? (
                                <TrendingDown size={16} />
                              ) : (
                                <Minus size={16} />
                              )}

                              {avgHourTrend.dir === "na"
                                ? "—"
                                : avgHourTrend.dir === "flat"
                                  ? "0"
                                  : avgHourTrend.delta > 0
                                    ? `+${fmtBR1(Math.abs(avgHourTrend.delta))}`
                                    : `-${fmtBR1(Math.abs(avgHourTrend.delta))}`}
                            </span>
                          </div>
                        </div>

                        <div style={{ height: mobile ? 160 : 190 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={hourlySeries} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                              <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                              <XAxis dataKey="period" interval={2} tickMargin={10} angle={-35} textAnchor="end" height={34} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 10 }} />
                              <YAxis domain={miniTonDomain} hide />
                              <Tooltip
                                formatter={(v: any) => `${fmtBR1(Number(v) || 0)} t/h`}
                                contentStyle={{
                                  background: "rgba(0,0,0,0.86)",
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  borderRadius: 14,
                                }}
                                labelStyle={{ color: "rgba(255,255,255,0.86)" }}
                              />
                              <ReferenceLine y={EXPECTED_TON_H} stroke="rgba(255,255,255,0.35)" strokeWidth={2} strokeDasharray="6 6" />
                              <ReferenceLine y={avgTonPerHour} stroke="#00CCFF" strokeWidth={2} strokeDasharray="4 4" />
                              <Area type="monotone" dataKey="ton" stroke="#ff9f1a" fill="rgba(255,159,26,0.14)" strokeWidth={2.5} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>

                        {/* legenda (igual padrão do gráfico de produção) */}
                        <div
                          style={{
                            marginTop: 8,
                            display: "flex",
                            gap: 14,
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 900,
                            color: "rgba(255,255,255,0.72)",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 18, borderTop: "2px dashed rgba(255,255,255,0.40)" }} />
                            <span>Esperada: {fmtBR0(EXPECTED_TON_H)} t/h</span>
                          </div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 18, borderTop: "2px dashed #00CCFF" }} />
                            <span>Média real: {fmtBR1(avgTonPerHour)} t/h</span>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {/* ÚLTIMOS 7 DIAS */}
                    {exportSel.ultimos_7 ? (
                      <div style={{ ...cardBase, padding: 14, gridColumn: mobile ? "span 12" : "span 6", minHeight: 270 }}>
                        <div style={headerStyle}>
                          <div>
                            <div style={titleStyle}>Últimos 7 dias</div>
                            <div style={subStyle}>Total por dia</div>
                          </div>
                        </div>

                        <div style={{ height: mobile ? 150 : 180 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={last7Series} margin={{ top: 22, right: 26, left: 10, bottom: 0 }}>
                              <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                              <XAxis
                                dataKey="day"
                                interval={0}
                                padding={{ left: 18, right: 18 }}
                                tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                              />
                              <YAxis hide />
                              <Tooltip
                                formatter={(v: any) => fmtBR0(Number(v) || 0)}
                                contentStyle={{
                                  background: "rgba(0,0,0,0.86)",
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  borderRadius: 14,
                                }}
                                labelStyle={{ color: "rgba(255,255,255,0.86)" }}
                              />
                              <Area
                                type="monotone"
                                dataKey="total"
                                stroke="#ff9f1a"
                                fill="rgba(255,159,26,0.14)"
                                strokeWidth={2.5}
                                dot={{ r: 3, strokeWidth: 2, fill: "rgba(7,9,13,0.92)" }}
                                activeDot={{ r: 5 }}
                                isAnimationActive={false}
                              >
                                <LabelList dataKey="total" content={Last7PointLabel as any} />
                              </Area>
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ) : null}

                    {/* HOJE */}
                    {exportSel.hoje_cards ? (
                      <div style={{ ...cardBase, padding: 14, gridColumn: mobile ? "span 12" : "span 6", minHeight: 270 }}>
                        <div style={headerStyle}>
                          <div>
                            <div style={titleStyle}>{rangeMode ? "Período" : "Hoje"}</div>
                            <div style={subStyle}>{rangeMode ? "Resumo do filtro" : "Resumo • Paradas + Horímetro"}</div>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: mobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 12 }}>
                          {rangeMode ? (
                            <>
                              <MiniStat icon="📅" title="Período" value={periodSummaryText} sub="Filtro aplicado no dashboard" />
                              <MiniStat icon="∑" title="Total no filtro" value={`${fmtBR0(totalTonDay)} t`} sub="Soma de todos os dias" />
                              <MiniStat icon="⌀" title="Média diária" value={`${fmtBR0(rangeAvgDayTon)} t`} sub="Média do período" />
                            </>
                          ) : (
                            <>
                              <MiniStat
                                icon="⏸"
                                title="Última Parada"
                                value={lastStop ? `${lastStop.equipamento} • ${fmtBR1(Number(lastStop.tempo_parada_h || 0))}h` : "—"}
                                sub={lastStop ? `${lastStop.data_inicio} ${lastStop.hora_inicio}` : "Sem registros no dia"}
                              />
                              <MiniStat icon="📌" title="Total de Paradas" value={String(totalStops)} sub={`Dia ${brDate(day)}`} />
                              <MiniStat
                                icon="⏱"
                                title="Último Horímetro (BT-01)"
                                value={
                                  lastHorimetroBT01
                                    ? `${fmtBR1(lastHorimetroBT01.horimetro_ini)} → ${fmtBR1(lastHorimetroBT01.horimetro_fim)}`
                                    : "—"
                                }
                                sub={
                                  lastHorimetroBT01
                                    ? `Dia ${brDate(lastHorimetroBT01.day)} • Turno ${lastHorimetroBT01.turno}`
                                    : "Sem registros"
                                }
                              />
                            </>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {/* HORÍMETROS */}
                    {exportSel.horimetros_top ? (
                      !rangeMode ? (
                        <div style={{ ...cardBase, padding: 14, gridColumn: "span 12" }}>
                          <div style={headerStyle}>
                            <div>
                              <div style={titleStyle}>Horímetros</div>
                              <div style={subStyle}>BT-02 • PN-02 • PN-01 • EH-08</div>
                            </div>
                          </div>

                          <div style={{ display: "grid", gap: 10 }}>
                            {topProductsHorimetros.map(({ eq, row }) => (
                              <div
                                key={eq}
                                style={{
                                  borderRadius: 16,
                                  border: "1px solid rgba(255,255,255,0.10)",
                                  background: "rgba(0,0,0,0.18)",
                                  padding: 12,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 10,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div
                                    style={{
                                      width: 52,
                                      height: 34,
                                      borderRadius: 12,
                                      border: "1px solid rgba(255,159,26,0.20)",
                                      background: "rgba(255,159,26,0.10)",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: 12,
                                      fontWeight: 950,
                                      color: "rgba(255,255,255,0.85)",
                                    }}
                                  >
                                    {eq}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 950, color: "rgba(255,255,255,0.88)" }}>
                                      {row ? `${fmtBR1(row.horimetro_ini)} → ${fmtBR1(row.horimetro_fim)}` : "—"}
                                    </div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>
                                      {row ? `Dia ${brDate(row.day)} • Turno ${row.turno}` : "Sem registro"}
                                    </div>
                                  </div>
                                </div>
                                <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.55)" }}>
                                  {row?.equipamento ?? ""}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <style>{`
              @media (max-width: 980px) {
                .mp-container { padding-bottom: 80px; }
              }
              @media (max-width: 920px) {
                .mp-export-body { grid-template-columns: 1fr !important; }
              }
            `}</style>
          </div>
        </div>
      ) : null}

      {/* ===================== MAIN DASHBOARD GRID (MESMO FORMATO DO EXPORT) ===================== */}
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(12, 1fr)", gap: 14, alignItems: "start" }}>
        {/* PRODUÇÃO HORÁRIA (12 col) */}
        <div
          style={{ ...cardBase, padding: 16, gridColumn: "span 12", cursor: "pointer" }}
          onClick={() => nav("/plant-production")}
        >
          <div style={headerStyle}>
            <div>
              <div style={titleStyle}>Produção por hora (Ton/H + Frequência)</div>
              <div style={subStyle}>
                 {rangeMode ? <>Média diária do filtro: <b style={{ color: "rgba(255,255,255,0.88)" }}>{fmtBR0(rangeAvgDayTon)}</b> t</> : <>Total do dia: <b style={{ color: "rgba(255,255,255,0.88)" }}>{fmtBR0(totalTonDay)}</b> t</>}
              </div>
            </div>
            <span
              style={{
                height: 32,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                padding: "0 12px",
                display: "inline-flex",
                alignItems: "center",
                fontWeight: 900,
                color: "rgba(255,255,255,0.82)",
              }}
            >
              {prodDay?.updated_at ? "Atualizado" : "—"}
            </span>
          </div>

          <div style={{ height: mobile ? 300 : 420 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={hourlySeries} margin={{ top: 16, right: 26, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                <XAxis dataKey="period" interval={0} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                <YAxis
                  yAxisId="left"
                  domain={tonDomain}
                  tickFormatter={(v) => fmtBR0(Number(v) || 0)}
                  tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${fmtBR0(Number(v) || 0)}%`}
                  tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                />
                <Tooltip content={(p: any) => <TooltipStopsHour {...p} stopsMap={stopsByPeriod} />} />
<Legend
                  verticalAlign="bottom"
                  height={30}
                  iconType="circle"
                  formatter={(value) => (value === "freq" ? "Frequência (%)" : value === "ton" ? "Ton/H" : value)}
                  wrapperStyle={{ color: "#00CCFF", fontWeight: 900 }}
                />

                <Bar yAxisId="left" dataKey="ton" fill="#00CCFF" radius={[10, 10, 0, 0]} maxBarSize={38}>
                  <LabelList dataKey="ton" content={BarValueLabel} />
                </Bar>

                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="freq"
                  stroke="#ff9f1a"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  activeDot={{ r: 5 }}
                >
                  <LabelList dataKey="freq" content={FreqPointLabel} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* TAXA (4 col) */}
        <div style={{ ...cardBase, padding: 14, gridColumn: mobile ? "span 12" : "span 4" }}>
          <div style={headerStyle}>
            <div>
              <div style={titleStyle}>Taxa Média</div>
              <div style={subStyle}>{rangeMode ? "Freq% média por faixa horária" : "Freq% últimas horas"}</div>
            </div>
            <span
              style={{
                height: 32,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                padding: "0 12px",
                display: "inline-flex",
                alignItems: "center",
                fontWeight: 900,
                color: "rgba(255,255,255,0.82)",
              }}
            >
              {fmtBR0(levelAvg)}%
            </span>
          </div>

          <div style={{ height: mobile ? 160 : 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={levelBars} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                <XAxis dataKey="period" interval={0} minTickGap={0} tickMargin={6} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                <Tooltip
                  formatter={(v: any) => `${fmtBR0(Number(v) || 0)}%`}
                  contentStyle={{
                    background: "rgba(0,0,0,0.86)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 14,
                  }}
                  labelStyle={{ color: "rgba(255,255,255,0.86)" }}
                />
                <Bar dataKey="freq" radius={[10, 10, 0, 0]} fill="#ff9f1a">
                  <LabelList
                    dataKey="freq"
                    position="center"
                    formatter={(v: any) => `${fmtBR0(Number(v) || 0)}%`}
                    style={{
                      fill: "rgba(255,255,255,0.95)",
                      fontWeight: 900,
                      fontSize: 12,
                      textShadow: "0 1px 2px rgba(0,0,0,.55)",
                      pointerEvents: "none",
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>        {/* META (4 col) */}
        <div style={{ ...cardBase, padding: 14, gridColumn: mobile ? "span 12" : "span 4", cursor: "pointer" }} onClick={() => nav("/plant-production")}>
          <div style={headerStyle}>
            <div>
              <div style={titleStyle}>{rangeMode ? "Média da meta do período" : "Produção do dia"}</div>
              <div style={subStyle}>{rangeMode ? periodSummaryText : `Meta: ${fmtBR0(metaDia)} t`}</div>
            </div>
          </div>

          {rangeMode ? (
            <div
              style={{
                minHeight: mobile ? 160 : 190,
                display: "grid",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 18,
                  alignItems: "start",
                  maxWidth: mobile ? 300 : 360,
                  margin: "0 auto",
                  width: "100%",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div style={{ ...subStyle, marginTop: 0 }}>Produção realizada</div>
                  <div style={{ marginTop: 8, fontSize: mobile ? 24 : 30, fontWeight: 950, color: "rgba(255,255,255,0.96)" }}>
                    {fmtBR0(totalTonDay)} t
                  </div>
                </div>

                <div
                  style={{
                    textAlign: "center",
                    borderLeft: "1px solid rgba(255,255,255,0.10)",
                    paddingLeft: 18,
                  }}
                >
                  <div style={{ ...subStyle, marginTop: 0 }}>C/ desvio de 20%</div>
                  <div style={{ marginTop: 8, fontSize: mobile ? 24 : 30, fontWeight: 950, color: "rgba(34,197,94,0.95)" }}>
                    {fmtBR0(totalTonWith20Desvio)} t
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ height: mobile ? 160 : 190, position: "relative" }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart data={gaugeData} innerRadius="75%" outerRadius="100%" startAngle={180} endAngle={0}>
                  <RadialBar dataKey="value" cornerRadius={14} background={{ fill: "rgba(255,255,255,0.08)" }} />
                </RadialBarChart>
              </ResponsiveContainer>

              <div style={{ position: "absolute", left: 0, right: 0, top: 78, textAlign: "center", pointerEvents: "none" }}>
                <div style={{ fontSize: 30, fontWeight: 950, letterSpacing: -0.02 }}>{fmtBR0(pctMetaRaw)}%</div>
                <div style={{ ...subStyle, marginTop: 2 }}>Atingimento</div>
                {pctMetaOver > 0 ? (
                  <div style={{ marginTop: 4, fontWeight: 900, color: "rgba(34,197,94,0.95)" }}>
                    +{fmtBR0(pctMetaOver)}% acima
                  </div>
                ) : null}
                <div style={{ marginTop: 6, fontWeight: 900, color: "rgba(255,255,255,0.86)" }}>
                  {fmtBR0(totalTonDay)} t
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MÉDIA (4 col) */}
        <div style={{ ...cardBase, padding: 14, gridColumn: mobile ? "span 12" : "span 4" }}>
          <div style={headerStyle}>
            <div>
              <div style={titleStyle}>Média/Hora</div>
              <div style={subStyle}>{rangeMode ? "Média da soma por faixa do filtro" : "Média de produção por hora"}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  height: 32,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  padding: "0 12px",
                  display: "inline-flex",
                  alignItems: "center",
                  fontWeight: 900,
                  color: "rgba(255,255,255,0.82)",
                }}
              >
                {fmtBR1(avgTonPerHour)} t/h
              </span>

              <span
                title={
                  avgHourTrend.dir === "na"
                    ? "Sem comparação (precisa de pelo menos 2 horas preenchidas)"
                    : `Comparação: ${avgHourTrend.prevPeriod} → ${avgHourTrend.lastPeriod}`
                }
                style={{
                  height: 32,
                  borderRadius: 999,
                  border:
                    avgHourTrend.dir === "up"
                      ? "1px solid rgba(34,197,94,0.40)"
                      : avgHourTrend.dir === "down"
                        ? "1px solid rgba(239,68,68,0.40)"
                        : "1px solid rgba(255,255,255,0.12)",
                  background:
                    avgHourTrend.dir === "up"
                      ? "rgba(34,197,94,0.14)"
                      : avgHourTrend.dir === "down"
                        ? "rgba(239,68,68,0.14)"
                        : "rgba(255,255,255,0.06)",
                  padding: "0 10px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 950,
                  color:
                    avgHourTrend.dir === "up"
                      ? "rgba(34,197,94,0.95)"
                      : avgHourTrend.dir === "down"
                        ? "rgba(239,68,68,0.95)"
                        : "rgba(255,255,255,0.75)",
                }}
              >
                {avgHourTrend.dir === "up" ? (
                  <TrendingUp size={16} />
                ) : avgHourTrend.dir === "down" ? (
                  <TrendingDown size={16} />
                ) : (
                  <Minus size={16} />
                )}

                {avgHourTrend.dir === "na"
                  ? "—"
                  : avgHourTrend.dir === "flat"
                    ? "0"
                    : avgHourTrend.delta > 0
                      ? `+${fmtBR1(Math.abs(avgHourTrend.delta))}`
                      : `-${fmtBR1(Math.abs(avgHourTrend.delta))}`}
              </span>
            </div>
          </div>

          <div style={{ height: mobile ? 160 : 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlySeries} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                <XAxis dataKey="period" interval={2} tickMargin={10} angle={-35} textAnchor="end" height={34} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 10 }} />
                <YAxis domain={miniTonDomain} hide />
                <Tooltip
                  formatter={(v: any) => `${fmtBR1(Number(v) || 0)} t/h`}
                  contentStyle={{
                    background: "rgba(0,0,0,0.86)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 14,
                  }}
                  labelStyle={{ color: "rgba(255,255,255,0.86)" }}
                />
                <ReferenceLine y={EXPECTED_TON_H} stroke="rgba(255,255,255,0.35)" strokeWidth={2} strokeDasharray="6 6" />
                <ReferenceLine y={avgTonPerHour} stroke="#00CCFF" strokeWidth={2} strokeDasharray="4 4" />
                <Area type="monotone" dataKey="ton" stroke="#ff9f1a" fill="rgba(255,159,26,0.14)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* legenda (igual padrão do gráfico de produção) */}
          <div
            style={{
              marginTop: 8,
              display: "flex",
              gap: 14,
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 900,
              color: "rgba(255,255,255,0.72)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 18, borderTop: "2px dashed rgba(255,255,255,0.40)" }} />
              <span>Esperada: {fmtBR0(EXPECTED_TON_H)} t/h</span>
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 18, borderTop: "2px dashed #00CCFF" }} />
              <span>Média real: {fmtBR1(avgTonPerHour)} t/h</span>
            </div>
          </div>

          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>
            Considera somente horas preenchidas (Ton/H &gt; 0).
          </div>
        </div>

        {/* ÚLTIMOS 7 DIAS (6 col) */}
        <div style={{ ...cardBase, padding: 14, gridColumn: mobile ? "span 12" : "span 6", cursor: "pointer" }} onClick={() => nav("/last7days")}>
          <div style={headerStyle}>
            <div>
              <div style={titleStyle}>{rangeMode ? "Totais do período" : "Últimos 7 dias"}</div>
              <div style={subStyle}>{rangeMode ? "Totais diários dentro do filtro" : "Total por dia"}</div>
            </div>
          </div>

          <div style={{ height: mobile ? 150 : 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={last7Series} margin={{ top: 22, right: 26, left: 10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="day"
                  interval={0}
                  padding={{ left: 18, right: 18 }}
                  tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                />
                <YAxis hide />
                <Tooltip
                  formatter={(v: any) => fmtBR0(Number(v) || 0)}
                  contentStyle={{
                    background: "rgba(0,0,0,0.86)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 14,
                  }}
                  labelStyle={{ color: "rgba(255,255,255,0.86)" }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#ff9f1a"
                  fill="rgba(255,159,26,0.14)"
                  strokeWidth={2.5}
                  dot={{ r: 3, strokeWidth: 2, fill: "rgba(7,9,13,0.92)" }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                >
                  <LabelList dataKey="total" content={Last7PointLabel as any} />
                </Area>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* HOJE (6 col) */}
        <div style={{ ...cardBase, padding: 14, gridColumn: mobile ? "span 12" : "span 6" }}>
          <div style={headerStyle}>
            <div>
              <div style={titleStyle}>{rangeMode ? "Período" : "Hoje"}</div>
              <div style={subStyle}>{rangeMode ? "Resumo do filtro" : "Resumo • Paradas + Horímetro"}</div>
            </div>

            {!rangeMode ? (
              <div style={{ display: "flex", gap: 10 }}>
                <button className="mp-btn" style={{ height: 36 }} onClick={() => nav("/paradas")}>
                  Abrir Paradas
                </button>
                <button className="mp-btn" style={{ height: 36 }} onClick={() => nav("/horimetros")}>
                  Abrir Horímetros
                </button>
              </div>
            ) : null}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: mobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 12 }}>
            {rangeMode ? (
              <>
                <MiniStat icon="📅" title="Período" value={periodSummaryText} sub="Filtro aplicado no dashboard" />
                <MiniStat icon="∑" title="Total no filtro" value={`${fmtBR0(totalTonDay)} t`} sub="Soma de todos os dias" />
                <MiniStat icon="⌀" title="Média diária" value={`${fmtBR0(rangeAvgDayTon)} t`} sub="Média do período" />
              </>
            ) : (
              <>
                <MiniStat
                  icon="⏸"
                  title="Última Parada"
                  value={lastStop ? `${lastStop.equipamento} • ${fmtBR1(Number(lastStop.tempo_parada_h || 0))}h` : "—"}
                  sub={lastStop ? `${lastStop.data_inicio} ${lastStop.hora_inicio}` : "Sem registros no dia"}
                  onClick={() => nav("/paradas")}
                />
                <MiniStat
                  icon="📌"
                  title="Total de Paradas"
                  value={String(totalStops)}
                  sub={`Dia ${brDate(day)}`}
                  onClick={() => nav("/paradas")}
                />
                <MiniStat
                  icon="⏱"
                  title="Último Horímetro (BT-01)"
                  value={
                    lastHorimetroBT01
                      ? `${fmtBR1(lastHorimetroBT01.horimetro_ini)} → ${fmtBR1(lastHorimetroBT01.horimetro_fim)}`
                      : "—"
                  }
                  sub={
                    lastHorimetroBT01
                      ? `Dia ${brDate(lastHorimetroBT01.day)} • Turno ${lastHorimetroBT01.turno}`
                      : "Sem registros"
                  }
                  onClick={() => nav("/horimetros")}
                />
              </>
            )}
          </div>
        </div>

        {/* HORÍMETROS (12 col) */}
        {!rangeMode ? (
        <div style={{ ...cardBase, padding: 14, gridColumn: "span 12" }}>
          <div style={headerStyle}>
            <div>
              <div style={titleStyle}>Horímetros</div>
              <div style={subStyle}>BT-02 • PN-02 • PN-01 • EH-08</div>
            </div>
            <button className="mp-btn" style={{ height: 36 }} onClick={() => nav("/horimetros")}>
              Abrir Horímetros
            </button>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {topProductsHorimetros.map(({ eq, row }) => (
              <div
                key={eq}
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.18)",
                  padding: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 52,
                      height: 34,
                      borderRadius: 12,
                      border: "1px solid rgba(255,159,26,0.20)",
                      background: "rgba(255,159,26,0.10)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 950,
                      color: "rgba(255,255,255,0.85)",
                    }}
                  >
                    {eq}
                  </div>
                  <div>
                    <div style={{ fontWeight: 950, color: "rgba(255,255,255,0.88)" }}>
                      {row ? `${fmtBR1(row.horimetro_ini)} → ${fmtBR1(row.horimetro_fim)}` : "—"}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>
                      {row ? `Dia ${brDate(row.day)} • Turno ${row.turno}` : "Sem registro"}
                    </div>
                  </div>
                </div>

                <button className="mp-btn" style={{ height: 34 }} onClick={() => nav("/horimetros")}>
                  Ver
                </button>
              </div>
            ))}
          </div>
        </div>
        ) : null}
      </div>
    </div>
  );
}

/* ===================== MiniStat ===================== */
function MiniStat({
  icon,
  title,
  value,
  sub,
  onClick,
}: {
  icon: string;
  title: string;
  value: string;
  sub: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      style={{
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.18)",
        padding: 12,
        cursor: onClick ? "pointer" : "default",
        transition: "transform .15s ease, border-color .15s ease, box-shadow .15s ease",
        boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
      }}
      onMouseEnter={(e) => {
        if (!onClick) return;
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,159,26,0.22)";
      }}
      onMouseLeave={(e) => {
        if (!onClick) return;
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0px)";
        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.10)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            border: "1px solid rgba(255,159,26,0.20)",
            background: "rgba(255,159,26,0.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
          }}
        >
          {icon}
        </div>
        <div style={{ fontWeight: 900, color: "rgba(255,255,255,0.78)", fontSize: 13 }}>{title}</div>
      </div>

      <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.01, color: "rgba(255,255,255,0.92)" }}>
        {value}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>{sub}</div>
    </div>
  );
}
