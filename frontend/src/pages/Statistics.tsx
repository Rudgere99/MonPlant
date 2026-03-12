import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
  ReferenceArea,
} from "recharts";
import { useAuth } from "../auth/AuthProvider";
import { useIsMobile } from "../mobile/useIsMobile";

type StopRow = {
  period: string;
  equipamento: string;
  tipo_parada: string;
  descricao: string;
  minutos: number;
};

type StopDayPayload = { day: string; rows: StopRow[] };

type StopKV = { type?: string; equipment?: string; hours?: number };
type StopDesc = { description?: string; hours?: number };
type StopCountPeriod = { period?: string; count?: number };

type DailyRow = {
  day: string; // YYYY-MM-DD
  produced_ton?: number;
  meta_ton?: number;
  attainment_pct?: number;
  freq_avg?: number;
  avg_ton_per_hour?: number;
  t1_ton?: number;
  t2_ton?: number;
  maintenance_hours?: number;
};

type StatsMonth = {
  month: string; // YYYY-MM
  meta_month_ton?: number;
  produced_month_ton?: number;
  attainment_pct?: number;
  delta_ton?: number;
  delta_pct?: number;

  days?: {
    produced_days?: number;
    programmed_stop_days?: number;
    maintenance_stop_days?: number;
  };

  best_day?: { day: string; produced_ton?: number; meta_ton?: number; attainment_pct?: number };
  worst_day?: { day: string; produced_ton?: number; meta_ton?: number; attainment_pct?: number };

  kpis?: {
    freq_avg_pct?: number;
    avg_ton_per_hour?: number;
  };

  shift?: { t1_ton?: number; t2_ton?: number };

  stops?: {
    by_type?: StopKV[];
    by_equipment?: StopKV[];
    by_description?: StopDesc[];
    count_by_period?: StopCountPeriod[];
  };

  hours_worked?: {
    total_hours?: number;
    by_equipment?: { equipment?: string; hours?: number }[];
  };

  series?: { daily?: DailyRow[] };
};

const COLORS = {
  bgCard: "rgba(14,18,22,0.78)",
  stroke: "rgba(255,255,255,0.10)",
  text: "rgba(255,255,255,0.92)",
  sub: "rgba(255,255,255,0.55)",
  orange: "#ff9f1a",
  cyan: "#00d2ff",
  slate: "rgba(148,163,184,0.70)",
  green: "#22c55e",
  red: "#fb7185",
};

function fmtBR0(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function fmtBR1(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function fmtPct(n: number, digits = 0) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + "%";
}

function truncLabel(s: string, max = 28) {
  const t = (s || "").trim();
  if (!t) return "—";
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + "…";
}
function ymdToDM(ymd: string) {
  if (!ymd) return "";
  const parts = ymd.split("-");
  if (parts.length < 3) return ymd;
  return `${parts[2]}/${parts[1]}`;
}
function daysInMonth(ym: string) {
  const [y, m] = ym.split("-").map((x) => Number(x));
  if (!y || !m) return 30;
  return new Date(y, m, 0).getDate();
}
function monthToLabel(ym: string) {
  if (!ym || ym.length < 7) return ym;
  const [y, m] = ym.split("-");
  const mi = Number(m);
  const meses = [
    "",
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  return `${meses[mi] || m} de ${y}`;
}
function apiBase() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (import.meta as any)?.env?.VITE_API_BASE;
  return String(v || "").trim().replace(/\/+$/, "");
}

function authHeaders(): HeadersInit {
  const t = localStorage.getItem("mp_token") || localStorage.getItem("token") || "";
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function fetchStopsLaunchDay(api: string, day: string, token?: string): Promise<StopDayPayload> {
  const qs = `day=${encodeURIComponent(day)}`;
  const headers = token ? { Authorization: `Bearer ${token}` } : authHeaders();
  const r = await fetch(`${api}/api/stops-launch?${qs}`, { headers });
  if (!r.ok) throw new Error(`Stops ${day}: ${r.status}`);
  const json = (await r.json()) as StopDayPayload;
  return { day: (json as any)?.day || day, rows: Array.isArray((json as any)?.rows) ? (json as any).rows : [] };
}

function Card({
  title,
  sub,
  right,
  children,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 22,
        border: `1px solid ${COLORS.stroke}`,
        background: COLORS.bgCard,
        boxShadow: "0 30px 60px rgba(0,0,0,0.55)",
        backdropFilter: "blur(14px)",
        padding: 14,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 980, color: COLORS.text, fontSize: 16, letterSpacing: -0.2 }}>{title}</div>
          {sub ? <div style={{ marginTop: 2, color: COLORS.sub, fontWeight: 850, fontSize: 12 }}>{sub}</div> : null}
        </div>
        {right ? <div style={{ flex: "0 0 auto" }}>{right}</div> : null}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      style={{
        height: 34,
        padding: "0 12px",
        borderRadius: 999,
        border: `1px solid ${ok ? "rgba(34,197,94,0.28)" : "rgba(251,113,133,0.30)"}`,
        background: ok ? "rgba(34,197,94,0.14)" : "rgba(251,113,133,0.14)",
        color: "white",
        fontWeight: 980,
        display: "grid",
        placeItems: "center",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
}

function MonthBars({ producedTon, metaTon }: { producedTon: number; metaTon: number }) {
  const maxV = Math.max(producedTon, metaTon, 1);
  const leftH = Math.max(10, Math.round((producedTon / maxV) * 100));
  const rightH = Math.max(10, Math.round((metaTon / maxV) * 100));

  const barBase: React.CSSProperties = {
    width: "100%",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    display: "grid",
    placeItems: "center",
    fontWeight: 980,
    color: "rgba(255,255,255,0.96)",
    textShadow: "0 2px 10px rgba(0,0,0,0.55)",
    padding: "0 10px",
    lineHeight: 1.05,
  };

  return (
    <div
      style={{
        borderRadius: 18,
        border: `1px solid ${COLORS.stroke}`,
        background: COLORS.bgCard,
        boxShadow: "0 24px 50px rgba(0,0,0,0.55)",
        backdropFilter: "blur(14px)",
        padding: 14,
        position: "relative",
        overflow: "hidden",
        minHeight: 96,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -30,
          background: `radial-gradient(600px 180px at 20% 20%, rgba(255,159,26,0.18), transparent 55%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: COLORS.sub }}>Meta do mês x Produção do mês</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 8px 1fr",
            gap: 12,
            alignItems: "end",
            height: 90,
            marginTop: 10,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ color: "rgba(255,255,255,0.70)", fontWeight: 900, fontSize: 12 }}>Produzido</div>
            <div
              style={{
                ...barBase,
                height: `${leftH}%`,
                background: "linear-gradient(180deg, rgba(255,159,26,0.96), rgba(255,159,26,0.55))",
              }}
            >
              <div style={{ fontSize: 22 }}>{fmtBR0(producedTon)} t</div>
            </div>
          </div>

          <div
            style={{
              width: 2,
              height: "100%",
              justifySelf: "center",
              borderRadius: 999,
              background: "rgba(255,255,255,0.10)",
            }}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ color: "rgba(255,255,255,0.70)", fontWeight: 900, fontSize: 12, textAlign: "right" }}>Meta</div>
            <div
              style={{
                ...barBase,
                height: `${rightH}%`,
                background: "linear-gradient(180deg, rgba(148,163,184,0.75), rgba(148,163,184,0.35))",
              }}
            >
              <div style={{ fontSize: 22 }}>{fmtBR0(metaTon)} t</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  sub,
  ok,
  chip,
  tone = "normal",
}: {
  title: string;
  value: string;
  sub: string;
  ok: boolean;
  chip?: React.ReactNode;
  tone?: "normal" | "low";
}) {
  const isLow = tone === "low";
  return (
    <div
      style={{
        borderRadius: 18,
        border: `1px solid ${COLORS.stroke}`,
        background: COLORS.bgCard,
        boxShadow: "0 24px 50px rgba(0,0,0,0.55)",
        backdropFilter: "blur(14px)",
        padding: 14,
        position: "relative",
        overflow: "hidden",
        minHeight: 96,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -30,
          background: `radial-gradient(600px 180px at 20% 20%, ${
            ok ? "rgba(34,197,94,0.14)" : "rgba(251,113,133,0.14)"
          }, transparent 55%)`,
          opacity: isLow ? 0.6 : 1,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: COLORS.sub, letterSpacing: 0.2 }}>{title}</div>
            <div
              style={{
                marginTop: 6,
                fontSize: isLow ? 24 : 28,
                fontWeight: 980,
                color: COLORS.text,
                letterSpacing: -0.4,
                lineHeight: 1,
              }}
            >
              {value}
            </div>
          </div>
          {chip ? chip : <StatusChip ok={ok} label={ok ? "🟢 Acima" : "🔴 Abaixo"} />}
        </div>
        {/* sub = uma única linha (sem redundância) */}
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 900, color: COLORS.sub }}>{sub}</div>
      </div>
    </div>
  );
}

function MiniLegend() {
  const itemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: `1px solid ${COLORS.stroke}`,
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.78)",
    fontWeight: 900,
    fontSize: 12,
    whiteSpace: "nowrap",
  };

  const dot = (bg: string) => (
    <span style={{ width: 10, height: 10, borderRadius: 999, background: bg, display: "inline-block" }} />
  );

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <div style={itemStyle} title="Indicador acima do alvo/esperado">
        {dot("rgba(34,197,94,0.95)")} Acima
      </div>
      <div style={itemStyle} title="Indicador abaixo do alvo/esperado">
        {dot("rgba(251,113,133,0.95)")} Abaixo
      </div>
      <div style={itemStyle} title="Indicador em atenção">
        {dot("rgba(255,159,26,0.95)")} Atenção
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 980, color: "rgba(255,255,255,0.80)" }}>{icon}</div>
        <div style={{ fontSize: 14, fontWeight: 980, color: "rgba(255,255,255,0.90)", letterSpacing: -0.2 }}>{title}</div>
        {sub ? <div style={{ color: COLORS.sub, fontWeight: 900, fontSize: 12, whiteSpace: "nowrap" }}>• {sub}</div> : null}
      </div>
      <div
        style={{
          height: 1,
          flex: 1,
          background: "linear-gradient(90deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))",
          marginTop: 8,
        }}
      />
    </div>
  );
}

function unitStyle() {
  return { fontSize: 12, fontWeight: 950, color: "rgba(255,255,255,0.55)" } as const;
}

export default function Statistics() {
  const { token } = useAuth();
  const mobile = useIsMobile();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${mm}`;
  });
  const [data, setData] = useState<StatsMonth | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Modal: detalhe do gráfico de Produção diária (mesmo conceito do modal de exportação do Dashboard)
  const [dailyModalOpen, setDailyModalOpen] = useState(false);
  const [dailyModalMode, setDailyModalMode] = useState<"bar" | "line">("bar");

  // % de desvio vinda da página Desvio de Produção (LocalStorage)
  const desvioPctSaved = useMemo(() => {
    try {
      const raw = localStorage.getItem("mp_desvio_producao_v2");
      if (!raw) return 0;
      const js = JSON.parse(raw);
      const txt = String(js?.desvioPct ?? "0").replace(/\./g, "").replace(",", ".");
      const n = Number(txt);
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }, []);

  const api = apiBase();

  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(`${api}/api/stats/month/${month}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!r.ok) {
          const txt = await r.text();
          throw new Error(txt || `HTTP ${r.status}`);
        }
        const js = (await r.json()) as StatsMonth;
        if (!alive) return;
        setData(js);
      } catch (e: any) {
        if (!alive) return;
        setData(null);
        setErr(e?.message || "Erro ao carregar");
      } finally {
        if (alive) setLoading(false);
      }
    }
    if (api) run();
    return () => {
      alive = false;
    };
  }, [api, month, token]);

  const daily = useMemo(() => data?.series?.daily || [], [data]);

  const metaMonth = Number(data?.meta_month_ton || 0);
  const prodMonth = Number(data?.produced_month_ton || 0);
  const prodMonthCorrigido = useMemo(() => {
    if (!prodMonth) return 0;
    return prodMonth * (1 - desvioPctSaved / 100);
  }, [prodMonth, desvioPctSaved]);

  const attainmentPct = useMemo(() => {
    const raw = Number(data?.attainment_pct);
    if (Number.isFinite(raw) && raw !== 0) return raw;
    if (metaMonth <= 0) return 0;
    return (prodMonth / metaMonth) * 100;
  }, [data, metaMonth, prodMonth]);

  const deltaTon = useMemo(() => {
    const raw = Number(data?.delta_ton);
    if (Number.isFinite(raw) && raw !== 0) return raw;
    return prodMonth - metaMonth;
  }, [data, prodMonth, metaMonth]);

  const deltaPct = useMemo(() => {
    const raw = Number(data?.delta_pct);
    if (Number.isFinite(raw) && raw !== 0) return raw;
    if (metaMonth <= 0) return 0;
    return ((prodMonth - metaMonth) / metaMonth) * 100;
  }, [data, metaMonth, prodMonth]);

  const okAtt = attainmentPct >= 100;

  const dim = useMemo(() => daysInMonth(month), [month]);
  const monthLabel = useMemo(() => monthToLabel(month), [month]);

  const dailySeries = useMemo(() => {
    return daily.map((d) => {
      const produced = Number(d.produced_ton || 0);
      const meta = Number(d.meta_ton || 0);
      const pct = meta > 0 ? (produced / meta) * 100 : 0;
      const noProd = meta > 0 && produced <= 0;
      return { day: ymdToDM(d.day), produced, meta, pct, noProd };
    });
  }, [daily]);

  const dailyModalData = useMemo(() => {
    let acc = 0;
    return (dailySeries || []).map((d: any) => {
      const produced = Number(d.produced || 0);
      acc += produced;
      return {
        ...d,
        accProduced: acc,
      };
    });
  }, [dailySeries]);

  const xTick = { fill: "rgba(255,255,255,0.55)", fontSize: 11 } as const;
  const yTick = { fill: "rgba(255,255,255,0.55)", fontSize: 11 } as const;

  const tooltipStyle = {
    background: "rgba(5,7,10,0.92)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    color: "white",
    boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
  } as const;

  const DailyTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload?.[0]?.payload || {};
    const produced = Number(row.produced || 0);
    const meta = Number(row.meta || 0);
    const pct = meta > 0 ? (produced / meta) * 100 : 0;
    return (
      <div style={{ ...tooltipStyle, padding: 12 }}>
        <div style={{ fontWeight: 980, marginBottom: 6 }}>{`Dia ${label}`}</div>
        <div style={{ color: COLORS.sub, fontWeight: 900, fontSize: 12 }}>Produção</div>
        <div style={{ fontWeight: 980 }}>{fmtBR0(produced)} t</div>
        <div style={{ marginTop: 6, color: COLORS.sub, fontWeight: 900, fontSize: 12 }}>Meta</div>
        <div style={{ fontWeight: 980 }}>{fmtBR0(meta)} t</div>
        <div style={{ marginTop: 6, color: COLORS.sub, fontWeight: 900, fontSize: 12 }}>% do dia</div>
        <div style={{ fontWeight: 980 }}>{fmtPct(pct, 0)}</div>
      </div>
    );
  };

  const projection = useMemo(() => {
    const producedDays = daily.filter((d) => (d.produced_ton || 0) > 0);
    if (!producedDays.length) return { projected_ton: 0, projected_pct: 0 };
    const avgDaily =
      producedDays.reduce((a, b) => a + (Number(b.produced_ton) || 0), 0) / producedDays.length;
    const projected = avgDaily * dim;
    const projectedPct = metaMonth > 0 ? (projected / metaMonth) * 100 : 0;
    return { projected_ton: projected, projected_pct: projectedPct };
  }, [daily, dim, metaMonth]);

  const t1Month = Number(data?.shift?.t1_ton || 0);
  const t2Month = Number(data?.shift?.t2_ton || 0);
  const shiftPie = useMemo(() => {
    const s = t1Month + t2Month;
    if (s <= 0) return [];
    return [
      { name: "Turno 1 (07–19)", value: t1Month },
      { name: "Turno 2 (19–07)", value: t2Month },
    ];
  }, [t1Month, t2Month]);


  const shiftTotal = useMemo(() => t1Month + t2Month, [t1Month, t2Month]);

  const shiftLegend = useMemo(() => {
    if (shiftTotal <= 0) return [] as { key: string; name: string; value: number; pct: number; color: string }[];
    return [
      { key: "T1", name: "Turno 1 (07–19)", value: t1Month, pct: (t1Month / shiftTotal) * 100, color: COLORS.cyan },
      { key: "T2", name: "Turno 2 (19–07)", value: t2Month, pct: (t2Month / shiftTotal) * 100, color: COLORS.orange },
    ];
  }, [shiftTotal, t1Month, t2Month]);

  const stopsByType = useMemo(
    () => (data?.stops?.by_type || []).map((x) => ({ name: x.type || "—", hours: Number(x.hours || 0) })),
    [data]
  );
  const stopsByEq = useMemo(
    () =>
      (data?.stops?.by_equipment || [])
        .map((x) => ({ name: x.equipment || "—", hours: Number(x.hours || 0) }))
        .slice(0, 10),
    [data]
  );
  const stopsByDesc = useMemo(
    () => {
      const raw = (data?.stops?.by_description || []).map((x) => ({
        name: (x.description || "—").trim() || "—",
        hours: Number(x.hours || 0),
      }));
      // Top 8 + "Outros" (reduz densidade visual)
      const top = raw.slice(0, 8);
      const rest = raw.slice(8);
      const otherHours = rest.reduce((a, b) => a + (Number(b.hours) || 0), 0);
      return otherHours > 0.01 ? [...top, { name: "Outros", hours: otherHours }] : top;
    },
    [data]
  );
  const stopsCountByPeriod = useMemo(
    () => (data?.stops?.count_by_period || []).map((x) => ({ period: x.period || "—", count: Number(x.count || 0) })),
    [data]
  );

  const totalStopHoursFromData = useMemo(
    () => stopsByType.reduce((a, b) => a + (Number(b.hours) || 0), 0),
    [stopsByType]
  );

  const producedDays = useMemo(
    () => data?.days?.produced_days ?? daily.filter((d) => (d.produced_ton || 0) > 0).length,
    [data, daily]
  );
  const programmedStopDays = useMemo(
    () => data?.days?.programmed_stop_days ?? daily.filter((d) => (d.meta_ton || 0) === 0).length,
    [data, daily]
  );
  const maintDays = useMemo(
    () => data?.days?.maintenance_stop_days ?? daily.filter((d) => (d.maintenance_hours || 0) > 0).length,
    [data, daily]
  );

  const freqAvg = Number(data?.kpis?.freq_avg_pct || 0);
  const avgTonH = Number(data?.kpis?.avg_ton_per_hour || 0);

  // ✅ Horas (padrão UF/DF): usa o MESMO endpoint de paradas (/api/stops-launch) e calcula Operando = Horizonte - Parada
  const now = useMemo(() => new Date(), []);
  const [yy, mm] = useMemo(() => String(month || "").split("-").map((x) => Number(x)), [month]);
  const isCurrentMonth = useMemo(() => yy === now.getFullYear() && mm === now.getMonth() + 1, [yy, mm, now]);
  const daysInMonthNum = useMemo(() => (yy && mm ? new Date(yy, mm, 0).getDate() : 30), [yy, mm]);
  const horizonDays = useMemo(() => (isCurrentMonth ? now.getDate() : daysInMonthNum), [isCurrentMonth, now, daysInMonthNum]);
  const horizonHours = useMemo(() => horizonDays * 24, [horizonDays]);

  const [stopsLaunchMinTotal, setStopsLaunchMinTotal] = useState(0);
  const [stopsLaunchMinByEq, setStopsLaunchMinByEq] = useState<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    async function runStops() {
      try {
        if (!api || !yy || !mm) return;
        const pad = (n: number) => String(n).padStart(2, "0");
        const days = Array.from({ length: horizonDays }, (_, i) => `${yy}-${pad(mm)}-${pad(i + 1)}`);
        // busca em paralelo (máx 31 dias)
        const payloads = await Promise.all(days.map((d) => fetchStopsLaunchDay(api, d, token || undefined)));
        if (!alive) return;

        let totalMin = 0;
        const byEq: Record<string, number> = {};
        for (const p of payloads) {
          for (const r of p.rows || []) {
            const min = Number((r as any)?.minutos || 0);
            totalMin += min;
            const eq = String((r as any)?.equipamento || "").trim();
            if (eq) byEq[eq] = (byEq[eq] || 0) + min;
          }
        }
        setStopsLaunchMinTotal(totalMin);
        setStopsLaunchMinByEq(byEq);
      } catch {
        if (!alive) return;
        setStopsLaunchMinTotal(0);
        setStopsLaunchMinByEq({});
      }
    }
    runStops();
    return () => {
      alive = false;
    };
  }, [api, token, yy, mm, horizonDays]);

  const totalStopHours = useMemo(() => stopsLaunchMinTotal / 60, [stopsLaunchMinTotal]);
  const totalWorkedHours = useMemo(() => Math.max(0, Math.min(horizonHours, horizonHours - totalStopHours)), [horizonHours, totalStopHours]);

  const workedHoursByEq = useMemo(() => {
    const rows = Object.entries(stopsLaunchMinByEq).map(([equipment, min]) => {
      const stopH = Number(min || 0) / 60;
      const hours = Math.max(0, Math.min(horizonHours, horizonHours - stopH));
      return { equipment, hours };
    });
    // se não vier nenhum equipamento, tenta manter compatível com o backend (fallback)
    if (rows.length === 0) {
      return (data?.hours_worked?.by_equipment || [])
        .map((x) => ({ equipment: String(x?.equipment || ""), hours: Number(x?.hours || 0) }))
        .filter((x) => x.equipment);
    }
    rows.sort((a, b) => b.hours - a.hours);
    return rows;
  }, [stopsLaunchMinByEq, horizonHours, data]);


  const availabilityPct = useMemo(() => {
    if (totalWorkedHours <= 0) return 0;
    const v = (1 - totalStopHours / totalWorkedHours) * 100;
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(100, v));
  }, [totalWorkedHours, totalStopHours]);

  const okAvail = availabilityPct >= 85;

  const microInsight = useMemo(() => {
    if (totalStopHours <= 0.01) return "";
    const tA = stopsByType?.[0];
    const tB = stopsByType?.[1];
    const dA = stopsByDesc?.[0];

    const pct = (h?: number) => {
      const v = Number(h || 0);
      return totalStopHours > 0 ? Math.round((v / totalStopHours) * 100) : 0;
    };

    const parts: string[] = [];
    if (tA) parts.push(`${tA.name} (${pct(tA.hours)}%)`);
    if (tB) parts.push(`${tB.name} (${pct(tB.hours)}%)`);

    const head = parts.length ? `Principais perdas: ${parts.join(" e ")}.` : "";
    const cause = dA ? ` Causa líder: ${dA.name} (${pct(dA.hours)}%).` : "";
    return (head + cause).trim();
  }, [totalStopHours, stopsByType, stopsByDesc]);

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div
        style={{
          borderRadius: 22,
          border: `1px solid ${COLORS.stroke}`,
          background: COLORS.bgCard,
          boxShadow: "0 30px 60px rgba(0,0,0,0.55)",
          backdropFilter: "blur(14px)",
          padding: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ color: COLORS.sub, fontWeight: 850, fontSize: 12 }}>Relatórios • Estatísticas</div>
          <div style={{ marginTop: 4, fontSize: 26, fontWeight: 980, color: COLORS.text, letterSpacing: -0.4 }}>
            Estatísticas do mês
          </div>

          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <div style={{ color: COLORS.sub, fontWeight: 900 }}>Mês</div>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{
                height: 36,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.25)",
                color: "white",
                padding: "0 12px",
                fontWeight: 900,
                outline: "none",
              }}
            />
            <div style={{ color: COLORS.sub, fontWeight: 850 }}>•</div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontWeight: 950 }}>{monthLabel}</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }}>
          <div
            style={{
              height: 34,
              padding: "0 12px",
              borderRadius: 999,
              border: `1px solid ${okAtt ? "rgba(34,197,94,0.28)" : "rgba(251,113,133,0.30)"}`,
              background: okAtt ? "rgba(34,197,94,0.14)" : "rgba(251,113,133,0.14)",
              color: "white",
              fontWeight: 950,
              display: "grid",
              placeItems: "center",
              whiteSpace: "nowrap",
            }}
            title="Diferença vs meta do mês"
          >
            {deltaTon >= 0 ? `+${fmtBR0(deltaTon)} t` : `-${fmtBR0(Math.abs(deltaTon))} t`} •{" "}
            {deltaPct >= 0 ? `+${fmtBR1(deltaPct)}%` : `-${fmtBR1(Math.abs(deltaPct))}%`}
          </div>

          <div
            style={{
              height: 34,
              padding: "0 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.85)",
              fontWeight: 950,
              display: "grid",
              placeItems: "center",
            }}
          >
            {loading ? "Carregando…" : err ? "Offline" : "Online"}
          </div>
        </div>
      </div>

      {/* ===================== VISÃO EXECUTIVA ===================== */}
      <SectionHeader icon="📌" title="Visão Executiva" sub="KPIs do mês" />

      {/* KPI rei + barras meta x produzido */}
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(12, minmax(0, 1fr))", gap: 14 }}>
        <div style={{ gridColumn: mobile ? "auto" : "span 8" }}>
          <MonthBars producedTon={prodMonth} metaTon={metaMonth} />
        </div>

        {/* KPI Rei: Diferença vs Meta */}
        <div
          style={{
            gridColumn: mobile ? "auto" : "span 4",
            borderRadius: 22,
            border: `1px solid ${COLORS.stroke}`,
            background: COLORS.bgCard,
            boxShadow: "0 30px 60px rgba(0,0,0,0.55)",
            backdropFilter: "blur(14px)",
            padding: 16,
            position: "relative",
            overflow: "hidden",
            minHeight: 96,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: -30,
              background: `radial-gradient(650px 220px at 25% 20%, ${
                okAtt ? "rgba(34,197,94,0.18)" : "rgba(251,113,133,0.18)"
              }, transparent 55%)`,
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ color: COLORS.sub, fontWeight: 950, fontSize: 12 }}>⭐ KPI principal</div>
                <div style={{ marginTop: 6, color: COLORS.text, fontWeight: 980, fontSize: 16 }}>Diferença vs Meta</div>
              </div>
              <StatusChip ok={okAtt} label={okAtt ? "🟢 Acima" : "🔴 Abaixo"} />
            </div>

            <div style={{ marginTop: 10, fontSize: 34, fontWeight: 990, color: COLORS.text, letterSpacing: -0.6, lineHeight: 1 }}>
              {deltaTon >= 0 ? `+${fmtBR0(deltaTon)} t` : `-${fmtBR0(Math.abs(deltaTon))} t`}
            </div>
            <div style={{ marginTop: 8, color: COLORS.sub, fontWeight: 920 }}>
              Atingimento: {fmtPct(attainmentPct, 0)} • {deltaPct >= 0 ? `+${fmtBR1(deltaPct)}%` : `-${fmtBR1(Math.abs(deltaPct))}%`}
            </div>
          </div>
        </div>
      </div>

      {/* KPIs de suporte */}
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <MetricCard
          title="Atingimento"
          tone="low"
          value={fmtPct(attainmentPct, 0)}
          sub={`${okAtt ? "🟢" : "🔴"} ${okAtt ? "Acima da meta" : "Abaixo da meta"} • (${deltaTon >= 0 ? "+" : "-"}${fmtBR0(Math.abs(deltaTon))} t)`}
          ok={okAtt}
        />

        <MetricCard
          title="Projeção (run-rate)"
          value={`${fmtBR0(projection.projected_ton)} t`}
          sub={`${projection.projected_pct >= 100 ? "🟢" : "🔴"} Projeção do mês: ${fmtPct(projection.projected_pct, 0)} • Mantido o ritmo atual (dias produtivos)`}
          ok={projection.projected_pct >= 100}
        />

        <MetricCard title="Frequência média" value={fmtPct(freqAvg, 0)} sub="📊 Média agregada do mês" ok={freqAvg >= 85} />
        <MetricCard title="Produção média" value={`${fmtBR0(avgTonH)} t/h`} sub="⛏ Média agregada do mês" ok={avgTonH > 0} />
        <MetricCard
          title="Produção corrigida por desvio"
          value={`${fmtBR0(prodMonthCorrigido)} t`}
          sub={`Desvio aplicado: ${fmtPct(desvioPctSaved, 2)} • Base da página Desvio de Produção`}
          ok={prodMonthCorrigido > 0}
        />
      </div>

      <SectionHeader icon="🧭" title="Diagnóstico Operacional" sub="produção diária, turnos, horímetros e paradas" />

      {/* Produção diária + Turnos + Horas operadas */}
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: mobile ? "1fr" : "1.15fr 0.85fr" }}>
        <Card title="Produção diária x Meta diária" sub="Produção vs meta (a % aparece no tooltip)">
          <div
            style={{ height: mobile ? 240 : 320, minHeight: mobile ? 240 : 320, cursor: "pointer" }}
            title="Clique para detalhar a produção do mês"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={dailySeries}
                margin={{ top: 16, right: 22, left: 0, bottom: 0 }}
                onClick={() => {
                  setDailyModalMode("bar");
                  setDailyModalOpen(true);
                }}
              >
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="day" interval="preserveStartEnd" minTickGap={18} angle={-30} textAnchor="end" height={54} tick={xTick} />
                <YAxis tick={yTick} />
                <Tooltip content={<DailyTooltip />} />
                {dailySeries.filter((d: any) => d.noProd).map((d: any) => (
                  <ReferenceArea key={d.day} x1={d.day} x2={d.day} fill="rgba(255,255,255,0.035)" />
                ))}
                <Line type="monotone" dataKey="meta" stroke="rgba(148,163,184,0.45)" strokeWidth={1.2} strokeDasharray="6 6" dot={false} />
                <Line type="monotone" dataKey="produced" stroke={COLORS.cyan} strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginTop: 8, color: "rgba(255,255,255,0.50)", fontSize: 11, fontWeight: 850 }}>
            Dica: clique no gráfico para abrir o detalhamento do mês.
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: mobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: 10 }}>
            <div style={{ borderRadius: 18, border: `1px solid ${COLORS.stroke}`, background: "rgba(0,0,0,0.20)", padding: 12 }}>
              <div style={{ color: COLORS.sub, fontWeight: 900, fontSize: 12 }}>Dias produzidos</div>
              <div style={{ marginTop: 6, fontWeight: 980, fontSize: 28, color: COLORS.text }}>{producedDays}</div>
              <div style={{ color: COLORS.sub, fontWeight: 850, fontSize: 12 }}>de {dim} dias</div>
            </div>

            <div style={{ borderRadius: 18, border: `1px solid ${COLORS.stroke}`, background: "rgba(0,0,0,0.20)", padding: 12 }}>
              <div style={{ color: COLORS.sub, fontWeight: 900, fontSize: 12 }}>Parada programada</div>
              <div style={{ marginTop: 6, fontWeight: 980, fontSize: 28, color: COLORS.text }}>{programmedStopDays}</div>
              <div style={{ color: COLORS.sub, fontWeight: 850, fontSize: 12 }}>Dias com meta 0</div>
            </div>

            <div style={{ borderRadius: 18, border: `1px solid ${COLORS.stroke}`, background: "rgba(0,0,0,0.20)", padding: 12 }}>
              <div style={{ color: COLORS.sub, fontWeight: 900, fontSize: 12 }}>Manutenção</div>
              <div style={{ marginTop: 6, fontWeight: 980, fontSize: 28, color: COLORS.text }}>{maintDays}</div>
              <div style={{ color: COLORS.sub, fontWeight: 850, fontSize: 12 }}>Dias com manutenção</div>
            </div>

            <div style={{ borderRadius: 18, border: `1px solid ${COLORS.stroke}`, background: "rgba(0,0,0,0.20)", padding: 12 }}>
              <div style={{ color: COLORS.sub, fontWeight: 900, fontSize: 12 }}>Horas operadas</div>
              <div style={{ marginTop: 6, fontWeight: 980, fontSize: 28, color: COLORS.text }}>{fmtBR1(totalWorkedHours)} h</div>
              <div style={{ color: COLORS.sub, fontWeight: 850, fontSize: 12 }}>Horímetro (mês)</div>
            </div>
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card title="Turnos" sub="Produção do mês por turno">
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12, alignItems: "center" }}>
              <div style={{ height: 420, minHeight: 420 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={shiftPie}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={95}
                      paddingAngle={2}
                      labelLine={false}
                      label={({ value }: any) => {
                        const v = Number(value || 0);
                        const pct = shiftTotal > 0 ? (v / shiftTotal) * 100 : 0;
                        if (!v) return "";
                        return `${fmtBR0(v)}t • ${fmtPct(pct, 0)}`;
                      }}
                    >
                      {(shiftPie || []).map((_, idx) => (
                        <Cell key={idx} fill={idx === 0 ? COLORS.cyan : COLORS.orange} />
                      ))}
                    </Pie>

                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: any) => {
                        const n = Number(v || 0);
                        const pct = shiftTotal > 0 ? (n / shiftTotal) * 100 : 0;
                        return [`${fmtBR0(n)} t • ${fmtPct(pct, 1)}`, "Turno"];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {shiftLegend.map((it) => (
                  <div
                    key={it.key}
                    style={{
                      borderRadius: 16,
                      border: `1px solid ${COLORS.stroke}`,
                      background: "rgba(0,0,0,0.18)",
                      padding: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            background: it.color,
                            display: "inline-block",
                            flex: "0 0 auto",
                          }}
                        />
                        <div
                          style={{
                            color: "rgba(255,255,255,0.80)",
                            fontWeight: 950,
                            fontSize: 12,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={it.name}
                        >
                          {it.name}
                        </div>
                      </div>

                      <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 980, whiteSpace: "nowrap" }}>
                        {fmtBR0(it.value)}t
                      </div>
                    </div>

                    <div style={{ marginTop: 6, color: COLORS.sub, fontWeight: 900, fontSize: 12 }}>
                      {fmtPct(it.pct, 0)} do mês
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
</div>
      </div>

            {/* Modal: detalhe Produção diária do mês */}
            {dailyModalOpen ? (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.62)",
                  backdropFilter: "blur(8px)",
                  display: "grid",
                  placeItems: "center",
                  padding: 18,
                  zIndex: 9999,
                }}
                onClick={() => setDailyModalOpen(false)}
              >
                <div
                  style={{
                    width: "min(1320px, 98vw)",
                    borderRadius: 22,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(10,12,14,0.72)",
                    boxShadow: "0 40px 90px rgba(0,0,0,0.70)",
                    overflow: "hidden",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      padding: 14,
                      borderBottom: "1px solid rgba(255,255,255,0.10)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 980, fontSize: 16, color: "rgba(255,255,255,0.92)", letterSpacing: -0.2 }}>
                        Produção diária do mês
                      </div>
                      <div style={{ marginTop: 2, fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>
                        Barras (diário) • Tooltip mostra acumulado • ou Linha.
                      </div>
                    </div>
      
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button
                        className={"mp-btn" + (dailyModalMode === "bar" ? " mp-btn-primary" : "")}
                        style={{ height: 38 }}
                        onClick={() => setDailyModalMode("bar")}
                      >
                        Barras
                      </button>
                      <button
                        className={"mp-btn" + (dailyModalMode === "line" ? " mp-btn-primary" : "")}
                        style={{ height: 38 }}
                        onClick={() => setDailyModalMode("line")}
                      >
                        Linha
                      </button>
                      <button className="mp-btn" style={{ height: 38 }} onClick={() => setDailyModalOpen(false)}>
                        Fechar
                      </button>
                    </div>
                  </div>
      
                  <div style={{ padding: 14 }}>
                    <div
                      style={{
                        borderRadius: 18,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(0,0,0,0.22)",
                        padding: 12,
                      }}
                    >
                      <div style={{ height: 520, minHeight: 520 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          {dailyModalMode === "bar" ? (
                            <BarChart data={dailyModalData} margin={{ top: 22, right: 18, left: 0, bottom: 8 }}>
                              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                              <XAxis dataKey="day" interval={0} minTickGap={0} angle={-40} textAnchor="end" height={66} tick={xTick as any} />
                              <YAxis tick={yTick as any} />
                              <Tooltip
                                contentStyle={tooltipStyle}
                                formatter={(v: any, name: any, props: any) => {
                                  const n = Number(v || 0);
                                  if (name === "produced") {
                                    const acc = Number(props?.payload?.accProduced || 0);
                                    return [`${fmtBR0(n)} t (Acum: ${fmtBR0(acc)} t)`, "Produção"];
                                  }
                                  return [fmtBR0(n), name];
                                }}
                              />
                              <Bar dataKey="produced" name="Produção" fill="rgba(0,180,255,0.95)" radius={[14, 14, 6, 6]}>
                                <LabelList
                                  dataKey="produced"
                                  position="top"
                                  formatter={(v: any) => fmtBR0(Number(v || 0))}
                                  style={{ fill: "rgba(255,255,255,0.80)", fontWeight: 900, fontSize: 11 }}
                                />
                              </Bar>
                            </BarChart>
                          ) : (
                            <LineChart data={dailyModalData} margin={{ top: 16, right: 22, left: 0, bottom: 8 }}>
                              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                              <XAxis dataKey="day" interval={0} minTickGap={0} angle={-40} textAnchor="end" height={66} tick={xTick as any} />
                              <YAxis tick={yTick as any} />
                              <Tooltip contentStyle={tooltipStyle} />
                              <Legend />
                              <Line type="monotone" dataKey="meta" name="Meta" stroke="rgba(148,163,184,0.55)" strokeWidth={1.4} strokeDasharray="6 6" dot={false} />
                              <Line type="monotone" dataKey="produced" name="Produção" stroke={COLORS.cyan} strokeWidth={3} dot={false} />
                            </LineChart>
                          )}
                        </ResponsiveContainer>
                      </div>
      
                      <div
                        style={{
                          marginTop: 10,
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: 10,
                        }}
                      >
                        <div style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(0,0,0,0.18)", padding: 12 }}>
                          <div style={{ color: "rgba(255,255,255,0.55)", fontWeight: 900, fontSize: 12 }}>Meta do mês</div>
                          <div style={{ marginTop: 6, fontWeight: 980, fontSize: 22, color: "rgba(255,255,255,0.92)" }}>
                            {fmtBR0(Number(data?.meta_month_ton || 0))} t
                          </div>
                        </div>
                        <div style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(0,0,0,0.18)", padding: 12 }}>
                          <div style={{ color: "rgba(255,255,255,0.55)", fontWeight: 900, fontSize: 12 }}>Produzido</div>
                          <div style={{ marginTop: 6, fontWeight: 980, fontSize: 22, color: "rgba(255,255,255,0.92)" }}>
                            {fmtBR0(Number(data?.produced_month_ton || 0))} t
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}


    </div>
  );
}
