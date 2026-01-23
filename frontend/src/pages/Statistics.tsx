import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { useAuth } from "../auth/AuthProvider";

type StatsMonth = {
  month: string; // YYYY-MM
  meta_month_ton: number;
  produced_month_ton: number;
  attainment_pct: number;
  delta_ton: number;
  delta_pct: number;
  days: {
    produced_days: number;
    programmed_stop_days: number;
    maintenance_stop_days: number;
  };
  best_day?: { day: string; produced_ton: number; meta_ton: number; attainment_pct: number } | null;
  worst_day?: { day: string; produced_ton: number; meta_ton: number; attainment_pct: number } | null;
  kpis: { freq_avg_pct: number; avg_ton_per_hour: number };
  shift: { t1_ton: number; t2_ton: number };
  stops: {
    by_type: { type: string; hours: number }[];
    by_equipment: { equipment: string; hours: number }[];
  };
  horimetros: { equipment: string; hours: number }[];
  series: {
    daily: {
      day: string;
      produced_ton: number;
      meta_ton: number;
      attainment_pct: number;
      freq_avg_pct: number;
      avg_ton_per_hour: number;
      t1_ton: number;
      t2_ton: number;
      stopped_h: number;
    }[];
  };
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function yyyymmFromDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function fmtBR0(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function fmtBR1(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtPct1(n: number) {
  return `${fmtBR1(n)}%`;
}

const cardGlass: React.CSSProperties = {
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(14,18,22,0.78)",
  boxShadow: "0 30px 60px rgba(0,0,0,0.55)",
  backdropFilter: "blur(14px)",
};

export default function Statistics() {
  const { token } = useAuth() as any;
  const [month, setMonth] = useState<string>(() => yyyymmFromDate(new Date()));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<StatsMonth | null>(null);

  const apiBase = (import.meta as any).env?.VITE_API_BASE || "";

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);

    fetch(`${apiBase}/api/stats/month/${month}`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
      },
    })
      .then(async (r) => {
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(txt || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((j) => {
        if (!alive) return;
        setData(j);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(String(e?.message || e));
        setData(null);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [month, apiBase, token]);

  const pieShift = useMemo(() => {
    const t1 = data?.shift?.t1_ton || 0;
    const t2 = data?.shift?.t2_ton || 0;
    return [
      { name: "Turno 1 (07-19)", value: t1 },
      { name: "Turno 2 (19-07)", value: t2 },
    ];
  }, [data]);

  const barStopsType = useMemo(() => {
    const rows = data?.stops?.by_type || [];
    return rows.slice(0, 8);
  }, [data]);

  const barStopsEq = useMemo(() => {
    const rows = data?.stops?.by_equipment || [];
    return rows.slice(0, 8);
  }, [data]);

  const dailySeries = data?.series?.daily || [];

  const headerPct = data?.attainment_pct ?? 0;
  const headerDeltaTon = data?.delta_ton ?? 0;
  const headerDeltaPct = data?.delta_pct ?? 0;

  const pctBadge = useMemo(() => {
    const pct = headerPct || 0;
    const above = pct - 100;
    const badge = pct >= 100 ? `+${fmtBR1(above)}%` : `-${fmtBR1(100 - pct)}%`;
    const tone = pct >= 100 ? "rgba(34,197,94,.18)" : "rgba(251,113,133,.18)";
    const border = pct >= 100 ? "rgba(34,197,94,.35)" : "rgba(251,113,133,.35)";
    return { pct, badge, tone, border };
  }, [headerPct]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ ...cardGlass, padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.6, color: "rgba(255,255,255,.94)" }}>
            Estatísticas do mês
          </div>
          <div style={{ marginTop: 4, color: "rgba(255,255,255,.55)", fontWeight: 850 }}>
            Visão macro: metas, produção, turnos, paradas e performance
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ color: "rgba(255,255,255,.65)", fontWeight: 900 }}>Mês</div>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{
              height: 40,
              borderRadius: 12,
              padding: "0 12px",
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: "rgba(255,255,255,.90)",
              fontWeight: 900,
              outline: "none",
            }}
          />
          <div
            style={{
              height: 40,
              padding: "0 12px",
              borderRadius: 999,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: pctBadge.tone,
              border: `1px solid ${pctBadge.border}`,
              color: "rgba(255,255,255,.92)",
              fontWeight: 950,
              whiteSpace: "nowrap",
            }}
            title="Atingimento do mês"
          >
            {fmtPct1(pctBadge.pct)} <span style={{ color: "rgba(255,255,255,.70)", fontWeight: 900 }}>{pctBadge.badge}</span>
          </div>
        </div>
      </div>

      {err ? (
        <div style={{ ...cardGlass, padding: 14, color: "rgba(251,113,133,.95)", fontWeight: 900 }}>
          {err}
        </div>
      ) : null}

      {/* Top KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 14 }}>
        <div style={{ ...cardGlass, gridColumn: "span 4", padding: 14 }}>
          <div style={{ color: "rgba(255,255,255,.70)", fontWeight: 900 }}>Meta do mês</div>
          <div style={{ marginTop: 6, fontSize: 26, fontWeight: 950, color: "white" }}>
            {fmtBR0(data?.meta_month_ton || 0)} t
          </div>
          <div style={{ marginTop: 10, color: "rgba(255,255,255,.55)", fontWeight: 850 }}>
            Produção: <span style={{ color: "rgba(255,255,255,.92)", fontWeight: 950 }}>{fmtBR0(data?.produced_month_ton || 0)} t</span>
          </div>
        </div>

        <div style={{ ...cardGlass, gridColumn: "span 4", padding: 14 }}>
          <div style={{ color: "rgba(255,255,255,.70)", fontWeight: 900 }}>Diferença</div>
          <div style={{ marginTop: 6, fontSize: 26, fontWeight: 950, color: "white" }}>
            {headerDeltaTon >= 0 ? "+" : "-"}{fmtBR0(Math.abs(headerDeltaTon))} t
          </div>
          <div style={{ marginTop: 10, color: "rgba(255,255,255,.55)", fontWeight: 850 }}>
            {headerDeltaPct >= 0 ? "Acima" : "Abaixo"}:{" "}
            <span style={{ color: "rgba(255,255,255,.92)", fontWeight: 950 }}>{fmtPct1(Math.abs(headerDeltaPct))}</span>
          </div>
        </div>

        <div style={{ ...cardGlass, gridColumn: "span 4", padding: 14 }}>
          <div style={{ color: "rgba(255,255,255,.70)", fontWeight: 900 }}>Dias</div>
          <div style={{ marginTop: 6, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 950, color: "white" }}>{data?.days?.produced_days ?? 0}</div>
              <div style={{ color: "rgba(255,255,255,.55)", fontWeight: 850, marginTop: 2 }}>Produzidos</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 950, color: "white" }}>{data?.days?.programmed_stop_days ?? 0}</div>
              <div style={{ color: "rgba(255,255,255,.55)", fontWeight: 850, marginTop: 2 }}>Meta 0</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 950, color: "white" }}>{data?.days?.maintenance_stop_days ?? 0}</div>
              <div style={{ color: "rgba(255,255,255,.55)", fontWeight: 850, marginTop: 2 }}>Manutenção</div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 14 }}>
        {/* Shift pie */}
        <div style={{ ...cardGlass, gridColumn: "span 4", padding: 14, minHeight: 320 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 950, color: "white" }}>Produção por turno</div>
              <div style={{ color: "rgba(255,255,255,.55)", fontWeight: 850 }}>Turno 1 x Turno 2</div>
            </div>
            <div style={{ color: "rgba(255,255,255,.60)", fontWeight: 900 }}>
              {fmtBR0((data?.shift?.t1_ton || 0) + (data?.shift?.t2_ton || 0))} t
            </div>
          </div>

          <div style={{ height: 250, marginTop: 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieShift} dataKey="value" nameKey="name" innerRadius={58} outerRadius={85} paddingAngle={2}>
                  {/* cores fixas para manter padrão visual */}
                  <Cell fill="rgba(0,210,255,0.95)" />
                  <Cell fill="rgba(255,159,26,0.95)" />
                </Pie>
                <Tooltip formatter={(v: any) => `${fmtBR0(Number(v) || 0)} t`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stops by type */}
        <div style={{ ...cardGlass, gridColumn: "span 4", padding: 14, minHeight: 320 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 950, color: "white" }}>Paradas por tipo</div>
            <div style={{ color: "rgba(255,255,255,.55)", fontWeight: 850 }}>Horas paradas no mês</div>
          </div>
          <div style={{ height: 250, marginTop: 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barStopsType}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="type" interval={0} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                <Tooltip formatter={(v: any) => `${fmtBR1(Number(v) || 0)} h`} />
                <Bar dataKey="hours" fill="rgba(255,159,26,0.95)" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stops by equipment */}
        <div style={{ ...cardGlass, gridColumn: "span 4", padding: 14, minHeight: 320 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 950, color: "white" }}>Paradas por equipamento</div>
            <div style={{ color: "rgba(255,255,255,.55)", fontWeight: 850 }}>Top equipamentos (h)</div>
          </div>
          <div style={{ height: 250, marginTop: 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barStopsEq}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="equipment" interval={0} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                <Tooltip formatter={(v: any) => `${fmtBR1(Number(v) || 0)} h`} />
                <Bar dataKey="hours" fill="rgba(0,210,255,0.95)" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Daily lines */}
      <div style={{ ...cardGlass, padding: 14, minHeight: 360 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 950, color: "white" }}>Produção diária x Meta diária</div>
            <div style={{ color: "rgba(255,255,255,.55)", fontWeight: 850 }}>Meta varia por dia (inclui metas 0)</div>
          </div>
          <div style={{ color: "rgba(255,255,255,.60)", fontWeight: 900 }}>
            Freq média: {fmtPct1(data?.kpis?.freq_avg_pct || 0)} • Média/h: {fmtBR0(data?.kpis?.avg_ton_per_hour || 0)} t/h
          </div>
        </div>

        <div style={{ height: 280, marginTop: 10 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailySeries} margin={{ top: 14, right: 22, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="day"
                tickFormatter={(v) => String(v).slice(8, 10)}
                interval={0}
                tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
              />
              <YAxis tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
              <Tooltip
                formatter={(v: any, name: any) => {
                  if (name === "produced_ton" || name === "meta_ton") return `${fmtBR0(Number(v) || 0)} t`;
                  return v;
                }}
                labelFormatter={(l) => `Dia ${String(l).slice(8, 10)}`}
              />
              <Legend />
              <Line type="monotone" dataKey="meta_ton" name="Meta (t)" stroke="rgba(180,180,180,0.9)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="produced_ton" name="Produção (t)" stroke="rgba(255,159,26,0.95)" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* best/worst */}
        <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div style={{ color: "rgba(255,255,255,.65)", fontWeight: 900 }}>
            Maior:{" "}
            <span style={{ color: "rgba(255,255,255,.92)", fontWeight: 950 }}>
              {data?.best_day?.day ? `${data.best_day.day.slice(8, 10)}/${data.best_day.day.slice(5, 7)} — ${fmtBR0(data.best_day.produced_ton)} t` : "—"}
            </span>
          </div>
          <div style={{ color: "rgba(255,255,255,.65)", fontWeight: 900 }}>
            Menor:{" "}
            <span style={{ color: "rgba(255,255,255,.92)", fontWeight: 950 }}>
              {data?.worst_day?.day ? `${data.worst_day.day.slice(8, 10)}/${data.worst_day.day.slice(5, 7)} — ${fmtBR0(data.worst_day.produced_ton)} t` : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Horimetros */}
      <div style={{ ...cardGlass, padding: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 950, color: "white" }}>Horas trabalhadas (horímetros)</div>
        <div style={{ color: "rgba(255,255,255,.55)", fontWeight: 850 }}>Soma (horímetro_fim − horímetro_ini) no mês</div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10 }}>
          {(data?.horimetros || []).slice(0, 12).map((r) => (
            <div key={r.equipment} style={{ gridColumn: "span 3", borderRadius: 16, padding: 12, border: "1px solid rgba(255,255,255,.10)", background: "rgba(0,0,0,.18)" }}>
              <div style={{ fontWeight: 950, color: "rgba(255,255,255,.92)" }}>{r.equipment}</div>
              <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950, color: "white" }}>{fmtBR1(r.hours)} h</div>
            </div>
          ))}
          {(!data?.horimetros || data.horimetros.length === 0) ? (
            <div style={{ gridColumn: "span 12", color: "rgba(255,255,255,.55)", fontWeight: 850 }}>
              Sem lançamentos de horímetro neste mês.
            </div>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div style={{ color: "rgba(255,255,255,.55)", fontWeight: 850, padding: 8 }}>
          Carregando…
        </div>
      ) : null}
    </div>
  );
}
