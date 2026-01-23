
import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";

type StopKV = { type?: string; equipment?: string; hours?: number };
type DailyRow = {
  day: string; // YYYY-MM-DD
  produced_ton?: number;
  meta_ton?: number;
  attainment_pct?: number;
  freq_avg?: number;
  avg_ton_per_hour?: number;
  t1_ton?: number;
  t2_ton?: number;
  stop_hours?: number;
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
  kpis?: { freq_avg_pct?: number; avg_ton_per_hour?: number };
  shift?: { t1_ton?: number; t2_ton?: number };
  stops?: { by_type?: StopKV[]; by_equipment?: StopKV[] };
  series?: { daily?: DailyRow[] };
};

function apiBase() {
  // tenta pegar do mesmo padrão do projeto
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (import.meta as any)?.env?.VITE_API_BASE;
  return String(v || "").trim().replace(/\/+$/, "");
}

function fmtBR0(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function fmtBR1(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function fmtBR2(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n: number, digits = 0) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + "%";
}
function ymdToDM(ymd: string) {
  // YYYY-MM-DD -> DD/MM
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  if (!d) return ymd;
  return `${d}/${m}`;
}
function monthToLabel(ym: string) {
  if (!ym || ym.length < 7) return ym;
  const [y, m] = ym.split("-");
  const mi = Number(m);
  const meses = ["", "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${meses[mi] || m} de ${y}`;
}
function daysInMonth(ym: string) {
  const [y, m] = ym.split("-").map((x) => Number(x));
  if (!y || !m) return 30;
  return new Date(y, m, 0).getDate();
}

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

function KpiCard({
  title,
  value,
  sub,
  chip,
  accent,
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  chip?: React.ReactNode;
  accent?: "orange" | "cyan" | "green" | "red" | "slate";
}) {
  const acc =
    accent === "orange"
      ? "rgba(255,159,26,0.20)"
      : accent === "cyan"
      ? "rgba(0,210,255,0.18)"
      : accent === "green"
      ? "rgba(34,197,94,0.18)"
      : accent === "red"
      ? "rgba(251,113,133,0.18)"
      : "rgba(148,163,184,0.16)";

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
        minHeight: 92,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -30,
          background: `radial-gradient(600px 180px at 20% 20%, ${acc}, transparent 55%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: COLORS.sub, letterSpacing: 0.2 }}>{title}</div>
            <div style={{ marginTop: 6, fontSize: 26, fontWeight: 950, color: COLORS.text, letterSpacing: -0.4, lineHeight: 1.05 }}>
              {value}
            </div>
          </div>
          {chip ? (
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
                flex: "0 0 auto",
              }}
            >
              {chip}
            </div>
          ) : null}
        </div>
        {sub ? (
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 850, color: COLORS.sub, position: "relative" }}>{sub}</div>
        ) : null}
      </div>
    </div>
  );
}

export default function Statistics() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${mm}`;
  });
  const [data, setData] = useState<StatsMonth | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const base = apiBase();

  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const url = `${base}/api/stats/month/${month}`;
        const token = localStorage.getItem("token") || localStorage.getItem("mp_token") || "";
        const r = await fetch(url, {
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
        setErr(e?.message || "Erro ao carregar");
        setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    }
    if (base) run();
    return () => {
      alive = false;
    };
  }, [base, month]);

  const daily = useMemo<DailyRow[]>(() => data?.series?.daily || [], [data]);
  const metaMonth = Number(data?.meta_month_ton || 0);
  const prodMonth = Number(data?.produced_month_ton || 0);

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

  const deltaIsUp = deltaTon >= 0;

  const monthLabel = useMemo(() => monthToLabel(month), [month]);
  const dim = useMemo(() => daysInMonth(month), [month]);

  const producedDaysCount = useMemo(() => {
    const v = data?.days?.produced_days;
    if (typeof v === "number") return v;
    return daily.filter((d) => (d.produced_ton || 0) > 0).length;
  }, [data, daily]);

  const programmedStopDays = useMemo(() => {
    const v = data?.days?.programmed_stop_days;
    if (typeof v === "number") return v;
    return daily.filter((d) => (d.meta_ton || 0) === 0).length;
  }, [data, daily]);

  const maintenanceDays = useMemo(() => {
    const v = data?.days?.maintenance_stop_days;
    if (typeof v === "number") return v;
    return daily.filter((d) => (d.maintenance_hours || 0) > 0).length;
  }, [data, daily]);

  const freqAvgMonth = useMemo(() => {
    const raw = Number(data?.kpis?.freq_avg_pct);
    if (Number.isFinite(raw) && raw > 0) return raw;
    const vals = daily.map((d) => Number(d.freq_avg || 0)).filter((x) => x > 0);
    if (!vals.length) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [data, daily]);

  const avgTonPerHourMonth = useMemo(() => {
    const raw = Number(data?.kpis?.avg_ton_per_hour);
    if (Number.isFinite(raw) && raw > 0) return raw;
    const vals = daily.map((d) => Number(d.avg_ton_per_hour || 0)).filter((x) => x > 0);
    if (!vals.length) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [data, daily]);

  // Projeção (run-rate): média diária real * dias do mês
  const projection = useMemo(() => {
    const producedDays = daily.filter((d) => (d.produced_ton || 0) > 0);
    if (!producedDays.length) return { projected_ton: 0, projected_pct: 0 };
    const avgDaily = producedDays.reduce((a, b) => a + (Number(b.produced_ton) || 0), 0) / producedDays.length;
    const projected = avgDaily * dim;
    const projectedPct = metaMonth > 0 ? (projected / metaMonth) * 100 : 0;
    return { projected_ton: projected, projected_pct: projectedPct };
  }, [daily, dim, metaMonth]);

  const shiftPie = useMemo(() => {
    const t1 = Number(data?.shift?.t1_ton || 0);
    const t2 = Number(data?.shift?.t2_ton || 0);
    const s = t1 + t2;
    if (s <= 0) return [];
    return [
      { name: "Turno 1 (07–19)", value: t1 },
      { name: "Turno 2 (19–07)", value: t2 },
    ];
  }, [data]);

  const stopsByType = useMemo(() => (data?.stops?.by_type || []).map((x) => ({ name: x.type || "—", hours: Number(x.hours || 0) })), [data]);
  const stopsByEq = useMemo(
    () => (data?.stops?.by_equipment || []).map((x) => ({ name: x.equipment || "—", hours: Number(x.hours || 0) })).slice(0, 10),
    [data]
  );

  const dailySeries = useMemo(() => {
    // normaliza pro chart e garante números
    return (daily || []).map((d) => ({
      day: ymdToDM(d.day),
      produced: Number(d.produced_ton || 0),
      meta: Number(d.meta_ton || 0),
      pct: Number(d.attainment_pct || (Number(d.meta_ton || 0) > 0 ? (Number(d.produced_ton || 0) / Number(d.meta_ton || 1)) * 100 : 0)),
      freq: Number(d.freq_avg || 0),
      tph: Number(d.avg_ton_per_hour || 0),
      t1: Number(d.t1_ton || 0),
      t2: Number(d.t2_ton || 0),
    }));
  }, [daily]);

  const topDays = useMemo(() => {
    const rows = [...dailySeries].filter((d) => d.meta > 0);
    rows.sort((a, b) => b.pct - a.pct);
    return rows.slice(0, 5);
  }, [dailySeries]);

  const worstDays = useMemo(() => {
    const rows = [...dailySeries].filter((d) => d.meta > 0);
    rows.sort((a, b) => a.pct - b.pct);
    return rows.slice(0, 5);
  }, [dailySeries]);

  const aboveMetaCount = useMemo(() => dailySeries.filter((d) => d.meta > 0 && d.produced >= d.meta).length, [dailySeries]);
  const belowMetaCount = useMemo(() => dailySeries.filter((d) => d.meta > 0 && d.produced < d.meta).length, [dailySeries]);

  const wrap: React.CSSProperties = {
    display: "grid",
    gap: 14,
    gridTemplateColumns: "1.15fr 0.85fr",
  };

  const card: React.CSSProperties = {
    borderRadius: 22,
    border: `1px solid ${COLORS.stroke}`,
    background: COLORS.bgCard,
    boxShadow: "0 30px 60px rgba(0,0,0,0.55)",
    backdropFilter: "blur(14px)",
    padding: 14,
    position: "relative",
    overflow: "hidden",
  };

  const cardTitle: React.CSSProperties = { fontWeight: 950, color: COLORS.text, fontSize: 16, letterSpacing: -0.2 };
  const cardSub: React.CSSProperties = { marginTop: 2, color: COLORS.sub, fontWeight: 850, fontSize: 12 };

  const headerChip = (
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
  );

  const deltaChip = (
    <div
      style={{
        height: 34,
        padding: "0 12px",
        borderRadius: 999,
        border: `1px solid ${deltaIsUp ? "rgba(34,197,94,0.28)" : "rgba(251,113,133,0.30)"}`,
        background: deltaIsUp ? "rgba(34,197,94,0.14)" : "rgba(251,113,133,0.14)",
        color: "white",
        fontWeight: 950,
        display: "grid",
        placeItems: "center",
        gap: 6,
      }}
      title="Diferença vs meta do mês"
    >
      {deltaIsUp ? `+${fmtBR0(deltaTon)} t` : `-${fmtBR0(Math.abs(deltaTon))} t`} • {deltaIsUp ? `+${fmtBR1(deltaPct)}%` : `-${fmtBR1(Math.abs(deltaPct))}%`}
    </div>
  );

  const tooltipStyle = {
    background: "rgba(5,7,10,0.92)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    color: "white",
    boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
  } as const;

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header empresarial */}
      <div
        style={{
          ...card,
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
          {deltaChip}
          {headerChip}
        </div>
      </div>

      {/* KPI ribbon */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
        <KpiCard title="Produção do mês" value={`${fmtBR0(prodMonth)} t`} sub="Somatório dos dias do mês" accent="cyan" />
        <KpiCard title="Meta do mês" value={`${fmtBR0(metaMonth)} t`} sub="Somatório das metas diárias" accent="slate" />
        <KpiCard
          title="Atingimento"
          value={fmtPct(attainmentPct, attainmentPct >= 100 ? 0 : 0)}
          sub={attainmentPct >= 100 ? `+${fmtBR1(attainmentPct - 100)}% acima` : `${fmtBR1(100 - attainmentPct)}% abaixo`}
          chip={attainmentPct >= 100 ? "Acima" : "Abaixo"}
          accent={attainmentPct >= 100 ? "green" : "orange"}
        />
        <KpiCard
          title="Projeção (run-rate)"
          value={`${fmtBR0(projection.projected_ton)} t`}
          sub={`Projeção do mês: ${fmtPct(projection.projected_pct, 0)}`}
          chip={projection.projected_pct >= 100 ? "Tendência +" : "Atenção"}
          accent={projection.projected_pct >= 100 ? "green" : "red"}
        />
      </div>

      {/* Corpo: visão temporal + painéis laterais */}
      <div style={wrap}>
        {/* ESQUERDA: Série temporal */}
        <div style={{ ...card }}>
          <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={cardTitle}>Produção diária x Meta diária</div>
              <div style={cardSub}>Meta varia por dia (inclui dias com meta 0)</div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", color: COLORS.sub, fontWeight: 900, fontSize: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: COLORS.cyan, display: "inline-block" }} /> Produção
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: COLORS.slate, display: "inline-block" }} /> Meta
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: COLORS.orange, display: "inline-block" }} /> %
              </span>
            </div>
          </div>

          <div style={{ height: 320, marginTop: 10, minHeight: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailySeries} margin={{ top: 16, right: 22, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="day" interval={0} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: any, name: any) => {
                    const n = Number(v || 0);
                    if (name === "pct") return [fmtPct(n, 0), "% do dia"];
                    if (name === "produced") return [`${fmtBR0(n)} t`, "Produção"];
                    if (name === "meta") return [`${fmtBR0(n)} t`, "Meta"];
                    return [String(v), String(name)];
                  }}
                  labelFormatter={(l) => `Dia ${l}`}
                />
                <Line type="monotone" dataKey="meta" stroke={COLORS.slate} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="produced" stroke={COLORS.cyan} strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="pct" stroke={COLORS.orange} strokeWidth={2} dot={false} yAxisId={0} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10 }}>
            <KpiCard title="Dias produzidos" value={producedDaysCount} sub={`de ${dim} dias`} accent="cyan" />
            <KpiCard title="Dias acima da meta" value={aboveMetaCount} sub={`Dias abaixo: ${belowMetaCount}`} accent={aboveMetaCount >= belowMetaCount ? "green" : "orange"} />
            <KpiCard title="Parada programada" value={programmedStopDays} sub="Dias com meta 0" accent="slate" />
            <KpiCard title="Manutenção" value={maintenanceDays} sub="Dias com manutenção" accent="red" />
          </div>
        </div>

        {/* DIREITA: painéis */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Turnos */}
          <div style={{ ...card }}>
            <div style={cardTitle}>Turnos</div>
            <div style={cardSub}>Participação na produção do mês</div>
            <div style={{ height: 220, marginTop: 10, minHeight: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={shiftPie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                    {(shiftPie || []).map((_, idx) => (
                      <Cell key={idx} fill={idx === 0 ? COLORS.cyan : COLORS.orange} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: any) => [`${fmtBR0(Number(v || 0))} t`, "Produção"]}
                  />
                  <Legend wrapperStyle={{ color: "rgba(255,255,255,0.70)", fontWeight: 850, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* KPIs operacionais */}
          <div style={{ ...card }}>
            <div style={cardTitle}>KPIs operacionais</div>
            <div style={cardSub}>Médias agregadas do mês</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 10 }}>
              <KpiCard title="Frequência média" value={fmtPct(freqAvgMonth, 0)} sub="Média das horas válidas" accent="orange" />
              <KpiCard title="Média de produção/h" value={`${fmtBR0(avgTonPerHourMonth)} t/h`} sub="Apenas horas preenchidas" accent="cyan" />
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.22)",
                  padding: 12,
                }}
              >
                <div style={{ color: COLORS.sub, fontWeight: 850, fontSize: 12 }}>Melhor dia</div>
                <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 950, marginTop: 4 }}>
                  {data?.best_day?.day ? `${ymdToDM(data.best_day.day)} • ${fmtBR0(Number(data.best_day.produced_ton || 0))} t` : "—"}
                </div>
                <div style={{ color: COLORS.sub, fontWeight: 850, fontSize: 12, marginTop: 2 }}>
                  {data?.best_day?.attainment_pct != null ? `${fmtPct(Number(data.best_day.attainment_pct), 0)} do dia` : ""}
                </div>
              </div>

              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.22)",
                  padding: 12,
                }}
              >
                <div style={{ color: COLORS.sub, fontWeight: 850, fontSize: 12 }}>Pior dia</div>
                <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 950, marginTop: 4 }}>
                  {data?.worst_day?.day ? `${ymdToDM(data.worst_day.day)} • ${fmtBR0(Number(data.worst_day.produced_ton || 0))} t` : "—"}
                </div>
                <div style={{ color: COLORS.sub, fontWeight: 850, fontSize: 12, marginTop: 2 }}>
                  {data?.worst_day?.attainment_pct != null ? `${fmtPct(Number(data.worst_day.attainment_pct), 0)} do dia` : ""}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Paradas */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ ...card }}>
          <div style={cardTitle}>Paradas por tipo</div>
          <div style={cardSub}>Horas paradas agregadas no mês</div>
          <div style={{ height: 280, marginTop: 10, minHeight: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stopsByType} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="name" interval={0} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${fmtBR2(Number(v || 0))} h`, "Horas"]} />
                <Bar dataKey="hours" fill={COLORS.orange} radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ ...card }}>
          <div style={cardTitle}>Top equipamentos por paradas</div>
          <div style={cardSub}>Horas paradas (Top 10)</div>
          <div style={{ height: 280, marginTop: 10, minHeight: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stopsByEq} layout="vertical" margin={{ top: 6, right: 16, left: 14, bottom: 6 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={70} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${fmtBR2(Number(v || 0))} h`, "Horas"]} />
                <Bar dataKey="hours" fill={COLORS.cyan} radius={[10, 10, 10, 10]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Rankings e insights */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ ...card }}>
          <div style={cardTitle}>Top 5 dias (maior % do dia)</div>
          <div style={cardSub}>Performance considerando meta diária</div>

          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {topDays.length ? (
              topDays.map((d) => (
                <div
                  key={d.day}
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.22)",
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 950 }}>{d.day}</div>
                    <div style={{ color: COLORS.sub, fontWeight: 850, fontSize: 12 }}>
                      {fmtBR0(d.produced)} t / meta {fmtBR0(d.meta)} t
                    </div>
                  </div>
                  <div
                    style={{
                      height: 34,
                      padding: "0 12px",
                      borderRadius: 999,
                      border: "1px solid rgba(34,197,94,0.28)",
                      background: "rgba(34,197,94,0.14)",
                      fontWeight: 950,
                      color: "white",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    {fmtPct(d.pct, 0)}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: COLORS.sub, fontWeight: 850 }}>Sem dados suficientes.</div>
            )}
          </div>
        </div>

        <div style={{ ...card }}>
          <div style={cardTitle}>Bottom 5 dias (menor % do dia)</div>
          <div style={cardSub}>Pontos de atenção (meta diária)</div>

          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {worstDays.length ? (
              worstDays.map((d) => (
                <div
                  key={d.day}
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.22)",
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 950 }}>{d.day}</div>
                    <div style={{ color: COLORS.sub, fontWeight: 850, fontSize: 12 }}>
                      {fmtBR0(d.produced)} t / meta {fmtBR0(d.meta)} t
                    </div>
                  </div>
                  <div
                    style={{
                      height: 34,
                      padding: "0 12px",
                      borderRadius: 999,
                      border: "1px solid rgba(251,113,133,0.30)",
                      background: "rgba(251,113,133,0.14)",
                      fontWeight: 950,
                      color: "white",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    {fmtPct(d.pct, 0)}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: COLORS.sub, fontWeight: 850 }}>Sem dados suficientes.</div>
            )}
          </div>
        </div>
      </div>

      {/* Rodapé de estado */}
      <div style={{ color: COLORS.sub, fontWeight: 850, fontSize: 12, marginTop: 2 }}>
        {err ? `Erro: ${err}` : base ? `API: ${base}` : "Configure VITE_API_BASE."}
      </div>
    </div>
  );
}
