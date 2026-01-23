
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
} from "recharts";
import { useAuth } from "../auth/AuthProvider";

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
  const meses = ["", "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${meses[mi] || m} de ${y}`;
}
function apiBase() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (import.meta as any)?.env?.VITE_API_BASE;
  return String(v || "").trim().replace(/\/+$/, "");
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
  const leftH = Math.max(8, Math.round((producedTon / maxV) * 100));
  const rightH = Math.max(8, Math.round((metaTon / maxV) * 100));

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
        minHeight: 92,
        gridColumn: "span 2",
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 8px 1fr", gap: 12, alignItems: "end", height: 88, marginTop: 10 }}>
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

          <div style={{ width: 2, height: "100%", justifySelf: "center", borderRadius: 999, background: "rgba(255,255,255,0.10)" }} />

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
}: {
  title: string;
  value: string;
  sub: string;
  ok: boolean;
}) {
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
          background: `radial-gradient(600px 180px at 20% 20%, ${
            ok ? "rgba(34,197,94,0.18)" : "rgba(251,113,133,0.18)"
          }, transparent 55%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: COLORS.sub, letterSpacing: 0.2 }}>{title}</div>
            <div style={{ marginTop: 6, fontSize: 28, fontWeight: 980, color: COLORS.text, letterSpacing: -0.4, lineHeight: 1 }}>
              {value}
            </div>
          </div>
          <StatusChip ok={ok} label={ok ? "Acima" : "Abaixo"} />
        </div>
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 850, color: COLORS.sub }}>{sub}</div>
      </div>
    </div>
  );
}

export default function Statistics() {
  const { token } = useAuth();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${mm}`;
  });
  const [data, setData] = useState<StatsMonth | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      return {
        day: ymdToDM(d.day),
        produced,
        meta,
        pct,
      };
    });
  }, [daily]);

  // datas no eixo: não embolar
  const xTick = { fill: "rgba(255,255,255,0.55)", fontSize: 11 } as const;
  const yTick = { fill: "rgba(255,255,255,0.55)", fontSize: 11 } as const;

  const tooltipStyle = {
    background: "rgba(5,7,10,0.92)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    color: "white",
    boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
  } as const;

  // projeção
  const projection = useMemo(() => {
    const producedDays = daily.filter((d) => (d.produced_ton || 0) > 0);
    if (!producedDays.length) return { projected_ton: 0, projected_pct: 0 };
    const avgDaily = producedDays.reduce((a, b) => a + (Number(b.produced_ton) || 0), 0) / producedDays.length;
    const projected = avgDaily * dim;
    const projectedPct = metaMonth > 0 ? (projected / metaMonth) * 100 : 0;
    return { projected_ton: projected, projected_pct: projectedPct };
  }, [daily, dim, metaMonth]);

  const okProj = projection.projected_pct >= 100;

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

  const producedDays = useMemo(() => data?.days?.produced_days ?? daily.filter((d) => (d.produced_ton || 0) > 0).length, [data, daily]);
  const programmedStopDays = useMemo(() => data?.days?.programmed_stop_days ?? daily.filter((d) => (d.meta_ton || 0) === 0).length, [data, daily]);
  const maintDays = useMemo(() => data?.days?.maintenance_stop_days ?? daily.filter((d) => (d.maintenance_hours || 0) > 0).length, [data, daily]);

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
          <div style={{ marginTop: 4, fontSize: 26, fontWeight: 980, color: COLORS.text, letterSpacing: -0.4 }}>Estatísticas do mês</div>
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

      {/* KPI topo (mais empresarial) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
        <MonthBars producedTon={prodMonth} metaTon={metaMonth} />

        <MetricCard
          title="Atingimento"
          value={fmtPct(attainmentPct, 0)}
          sub={okAtt ? `+${fmtBR1(attainmentPct - 100)}% acima` : `${fmtBR1(100 - attainmentPct)}% abaixo`}
          ok={okAtt}
        />

        <MetricCard
          title="Projeção (run-rate)"
          value={`${fmtBR0(projection.projected_ton)} t`}
          sub={`Projeção do mês: ${fmtPct(projection.projected_pct, 0)}`}
          ok={okProj}
        />
      </div>

      {/* Miolo */}
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1.15fr 0.85fr" }}>
        <Card
          title="Produção diária x Meta diária"
          sub="Meta varia por dia (inclui dias com meta 0)"
          right={
            <div style={{ display: "flex", gap: 12, alignItems: "center", color: COLORS.sub, fontWeight: 900, fontSize: 12 }}>
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
          }
        >
          <div style={{ height: 320, minHeight: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailySeries} margin={{ top: 16, right: 22, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="day"
                  interval="preserveStartEnd"
                  minTickGap={18}
                  angle={-30}
                  textAnchor="end"
                  height={54}
                  tick={xTick}
                />
                <YAxis tick={yTick} />
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
                <Line type="monotone" dataKey="pct" stroke={COLORS.orange} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
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
              <div style={{ color: COLORS.sub, fontWeight: 900, fontSize: 12 }}>Status</div>
              <div style={{ marginTop: 6, fontWeight: 980, fontSize: 28, color: COLORS.text }}>{loading ? "…" : err ? "!" : "OK"}</div>
              <div style={{ color: COLORS.sub, fontWeight: 850, fontSize: 12 }}>Fonte: /api/stats/month</div>
            </div>
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card title="Turnos" sub="Participação na produção do mês">
            <div style={{ height: 220, minHeight: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={shiftPie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                    {(shiftPie || []).map((_, idx) => (
                      <Cell key={idx} fill={idx === 0 ? COLORS.cyan : COLORS.orange} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${fmtBR0(Number(v || 0))} t`, "Produção"]} />
                  <Legend wrapperStyle={{ color: "rgba(255,255,255,0.70)", fontWeight: 850, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="KPIs operacionais" sub="Médias agregadas do mês">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <div style={{ borderRadius: 18, border: `1px solid ${COLORS.stroke}`, background: "rgba(0,0,0,0.20)", padding: 12 }}>
                <div style={{ color: COLORS.sub, fontWeight: 900, fontSize: 12 }}>Frequência média</div>
                <div style={{ marginTop: 6, fontWeight: 980, fontSize: 30, color: COLORS.text }}>{fmtPct(Number(data?.kpis?.freq_avg_pct || 0), 0)}</div>
                <div style={{ color: COLORS.sub, fontWeight: 850, fontSize: 12 }}>Média das horas válidas</div>
              </div>
              <div style={{ borderRadius: 18, border: `1px solid ${COLORS.stroke}`, background: "rgba(0,0,0,0.20)", padding: 12 }}>
                <div style={{ color: COLORS.sub, fontWeight: 900, fontSize: 12 }}>Média de produção/h</div>
                <div style={{ marginTop: 6, fontWeight: 980, fontSize: 30, color: COLORS.text }}>
                  {fmtBR0(Number(data?.kpis?.avg_ton_per_hour || 0))} t/h
                </div>
                <div style={{ color: COLORS.sub, fontWeight: 850, fontSize: 12 }}>Apenas horas preenchidas</div>
              </div>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              <div style={{ borderRadius: 16, border: `1px solid ${COLORS.stroke}`, background: "rgba(0,0,0,0.18)", padding: 12 }}>
                <div style={{ color: COLORS.sub, fontWeight: 900, fontSize: 12 }}>Melhor dia</div>
                <div style={{ marginTop: 4, color: COLORS.text, fontWeight: 980 }}>
                  {data?.best_day?.day ? `${ymdToDM(data.best_day.day)} • ${fmtBR0(Number(data.best_day.produced_ton || 0))} t` : "—"}
                </div>
              </div>
              <div style={{ borderRadius: 16, border: `1px solid ${COLORS.stroke}`, background: "rgba(0,0,0,0.18)", padding: 12 }}>
                <div style={{ color: COLORS.sub, fontWeight: 900, fontSize: 12 }}>Pior dia</div>
                <div style={{ marginTop: 4, color: COLORS.text, fontWeight: 980 }}>
                  {data?.worst_day?.day ? `${ymdToDM(data.worst_day.day)} • ${fmtBR0(Number(data.worst_day.produced_ton || 0))} t` : "—"}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Paradas */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card title="Paradas por tipo" sub="Horas paradas agregadas no mês">
          <div style={{ height: 280, minHeight: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stopsByType} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="name" interval={0} tick={xTick} />
                <YAxis tick={yTick} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${fmtBR1(Number(v || 0))} h`, "Horas"]} />
                <Bar dataKey="hours" fill={COLORS.orange} radius={[10, 10, 0, 0]}>
                  <LabelList
                    dataKey="hours"
                    position="insideTop"
                    formatter={(v: any) => `${fmtBR1(Number(v || 0))} h`}
                    style={{
                      fill: "rgba(255,255,255,0.92)",
                      fontWeight: 980,
                      fontSize: 12,
                      textShadow: "0 1px 2px rgba(0,0,0,.6)",
                      pointerEvents: "none",
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Top equipamentos por paradas" sub="Horas paradas (Top 10)">
          <div style={{ height: 280, minHeight: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stopsByEq} layout="vertical" margin={{ top: 6, right: 16, left: 14, bottom: 6 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis type="number" tick={yTick} />
                <YAxis type="category" dataKey="name" width={70} tick={xTick} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${fmtBR1(Number(v || 0))} h`, "Horas"]} />
                <Bar dataKey="hours" fill={COLORS.cyan} radius={[10, 10, 10, 10]}>
                  <LabelList
                    dataKey="hours"
                    position="insideRight"
                    formatter={(v: any) => `${fmtBR1(Number(v || 0))} h`}
                    style={{
                      fill: "rgba(255,255,255,0.92)",
                      fontWeight: 980,
                      fontSize: 12,
                      textShadow: "0 1px 2px rgba(0,0,0,.6)",
                      pointerEvents: "none",
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div style={{ color: COLORS.sub, fontWeight: 850, fontSize: 12 }}>
        {err ? `Erro: ${err}` : api ? `Mês ${month} • API ${api}` : "Configure VITE_API_BASE"}
      </div>
    </div>
  );
}
