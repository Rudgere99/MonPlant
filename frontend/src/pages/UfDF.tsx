import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

/**
 * UF / DF • Cadeia de Produção (BT-01, BT-02, PN-01, PN-02)
 *
 * Baseado nos dados gerados em "Lançamento de Paradas".
 * Premissa: os equipamentos param juntos (cadeia). Para evitar duplicação:
 * - Se houver linhas com equipamento = "Todos" (ou vazio), usamos somente essas.
 * - Caso contrário, por período, usamos o MAIOR total de minutos dentre os equipamentos.
 *
 * Fórmulas (padrão operacional):
 * - TempoProgramado = 24h
 * - ParadaManutencao = Corretiva + Preventiva + Elétrica
 * - ParadaOperacional = Operacional + Segurança + Outros
 * - DF (%) = (TP - PM) / TP
 * - UF (%) = (TP - PM - PO) / (TP - PM)
 * - DO (%) = DF * UF
 *
 * Endpoints esperados:
 * - GET /api/stops-launch?day=YYYY-MM-DD -> { day, rows:[{period,equipamento,tipo_parada,descricao,minutos}] }
 * - GET /api/plant-production/{day}      -> { day, rows:[{period, ton, freq}], meta_ton? }
 */

type StopRow = {
  period: string; // "03-04"
  equipamento: string; // "BT-01" | "BT-02" | "PN-01" | "PN-02" | "Todos" | ""
  tipo_parada: string;
  descricao: string;
  minutos: number;
};

type StopDayPayload = { day: string; rows: StopRow[] };

type ProdRow = { period: string; ton?: number | string | null; freq?: number | string | null };
type ProdPayload = { day: string; rows: ProdRow[]; meta_ton?: number | null };

const API_BASE = String((import.meta as any)?.env?.VITE_API_BASE || "").replace(/\/+$/, "");

function authHeaders(): HeadersInit {
  const t = (localStorage.getItem("mp_token") || localStorage.getItem("token") || "").trim();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function isoTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function clamp60(n: any) {
  const x = Number(n || 0);
  return Math.max(0, Math.min(60, x));
}

function toNum(n: any) {
  const x = Number(String(n ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

function fmt0(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function fmt1(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtPct(n: number) {
  return `${fmt1(n)}%`;
}

function norm(s: any) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const TYPE_COLORS: Record<string, string> = {
  Corretiva: "#EF4444",
  Elétrica: "#F59E0B",
  Preventiva: "#22C55E",
  Operacional: "#3B82F6",
  Segurança: "#A855F7",
  Outros: "#94A3B8",
};

function classTipo(tipo: string) {
  const t = norm(tipo);
  if (t.includes("corret")) return "Corretiva";
  if (t.includes("eletr")) return "Elétrica";
  if (t.includes("prevent")) return "Preventiva";
  if (t.includes("operac")) return "Operacional";
  if (t.includes("segur")) return "Segurança";
  return "Outros";
}

function isTodos(eq: any) {
  const e = norm(eq);
  return !e || e === "todos" || e === "todo" || e === "geral";
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

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div style={cardStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.4, marginTop: 6 }}>
        {value}
      </div>
      {sub ? (
        <div style={{ marginTop: 6, color: "rgba(255,255,255,0.65)", fontWeight: 800, fontSize: 13 }}>{sub}</div>
      ) : null}
    </div>
  );
}

export default function UfDF() {
  const [day, setDay] = useState<string>(isoTodayLocal());
  const [stops, setStops] = useState<StopDayPayload | null>(null);
  const [prod, setProd] = useState<ProdPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadAll(d = day) {
    setBusy(true);
    setErr(null);
    try {
      const qs = `day=${encodeURIComponent(d)}`;
      const [a, b] = await Promise.all([
        fetch(`${API_BASE}/api/stops-launch?${qs}`, { headers: { ...authHeaders() } }),
        fetch(`${API_BASE}/api/plant-production/${encodeURIComponent(d)}`, { headers: { ...authHeaders() } }),
      ]);

      if (!a.ok) throw new Error(`Stops: ${a.status}`);
      if (!b.ok) throw new Error(`Produção: ${b.status}`);

      const stopsJson = (await a.json()) as StopDayPayload;
      const prodJson = (await b.json()) as ProdPayload;

      setStops({ day: stopsJson?.day || d, rows: Array.isArray(stopsJson?.rows) ? stopsJson.rows : [] });
      setProd({
        day: prodJson?.day || d,
        rows: Array.isArray(prodJson?.rows) ? prodJson.rows : [],
        meta_ton: prodJson?.meta_ton ?? null,
      });
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar dados");
      setStops({ day: d, rows: [] });
      setProd({ day: d, rows: [], meta_ton: null });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadAll(day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const metrics = useMemo(() => {
    const rows = (stops?.rows || []).map((r) => ({
      ...r,
      minutos: clamp60(r.minutos),
      tipo_parada: classTipo(r.tipo_parada),
    }));

    // separa "Todos" x por equipamento
    const rowsTodos = rows.filter((r) => isTodos(r.equipamento));
    const useTodos = rowsTodos.length > 0;

    // total por período (cadeia) sem duplicar
    const periods = Array.from(new Set(rows.map((r) => r.period))).sort();
    const chainTotalMinByPeriod: Record<string, number> = {};
    const chainTypeMinByType: Record<string, number> = {};

    const byPeriod = (p: string) => rows.filter((r) => r.period === p);
    const byPeriodTodos = (p: string) => rowsTodos.filter((r) => r.period === p);

    for (const p of periods) {
      if (useTodos) {
        // usa só as linhas "Todos"
        const rs = byPeriodTodos(p);
        const total = rs.reduce((acc, r) => acc + clamp60(r.minutos), 0);
        chainTotalMinByPeriod[p] = total;

        // acumula por tipo
        const byTipo: Record<string, number> = {};
        for (const r of rs) {
          byTipo[r.tipo_parada] = (byTipo[r.tipo_parada] || 0) + clamp60(r.minutos);
        }
        for (const k of Object.keys(byTipo)) {
          chainTypeMinByType[k] = (chainTypeMinByType[k] || 0) + byTipo[k];
        }
      } else {
        // por equipamento -> soma e pega o maior (cadeia)
        const rs = byPeriod(p);
        const byEq: Record<string, StopRow[]> = {};
        for (const r of rs) {
          const eq = String(r.equipamento || "").trim() || "(vazio)";
          if (!byEq[eq]) byEq[eq] = [];
          byEq[eq].push(r);
        }

        let maxTotal = 0;
        let eqWinner: string | null = null;
        for (const eq of Object.keys(byEq)) {
          const t = byEq[eq].reduce((acc, r) => acc + clamp60(r.minutos), 0);
          if (t > maxTotal) {
            maxTotal = t;
            eqWinner = eq;
          }
        }
        chainTotalMinByPeriod[p] = maxTotal;

        // por tipo usando o equipamento vencedor (evita somar duplicado)
        if (eqWinner) {
          const rsWin = byEq[eqWinner] || [];
          const byTipo: Record<string, number> = {};
          for (const r of rsWin) {
            byTipo[r.tipo_parada] = (byTipo[r.tipo_parada] || 0) + clamp60(r.minutos);
          }
          for (const k of Object.keys(byTipo)) {
            chainTypeMinByType[k] = (chainTypeMinByType[k] || 0) + byTipo[k];
          }
        }
      }
    }

    const totalMin = Object.values(chainTotalMinByPeriod).reduce((a, b) => a + b, 0);
    const totalH = totalMin / 60;

    const manutMin =
      (chainTypeMinByType["Corretiva"] || 0) +
      (chainTypeMinByType["Preventiva"] || 0) +
      (chainTypeMinByType["Elétrica"] || 0);

    const operMin = totalMin - manutMin;

    const TP = 24; // horas programadas
    const PM = manutMin / 60;
    const PO = operMin / 60;

    const df = TP > 0 ? ((TP - PM) / TP) * 100 : 0;
    const uf = (TP - PM) > 0 ? ((TP - PM - PO) / (TP - PM)) * 100 : 0;
    const doPct = (df / 100) * (uf / 100) * 100;

    const prodTon = (prod?.rows || []).reduce((acc, r) => acc + toNum(r.ton), 0);
    const prodFreq = (prod?.rows || []).reduce((acc, r) => acc + toNum(r.freq), 0);

    const opH = Math.max(0, TP - totalH);
    const tph = opH > 0 ? prodTon / opH : 0;

    const meta = Number(prod?.meta_ton ?? 0) || 0;
    const pctMeta = meta > 0 ? (prodTon / meta) * 100 : 0;
    const gapMeta = meta > 0 ? meta - prodTon : 0;

    // última parada (maior período com minutos > 0)
    const lastPeriod = periods
      .slice()
      .reverse()
      .find((p) => (chainTotalMinByPeriod[p] || 0) > 0);

    let lastStop: { period: string; tipo: string; desc: string; min: number } | null = null;
    if (lastPeriod) {
      const rs = useTodos ? byPeriodTodos(lastPeriod) : byPeriod(lastPeriod);
      // pega a maior linha em minutos
      const best = rs
        .map((r) => ({
          period: lastPeriod,
          tipo: classTipo(r.tipo_parada),
          desc: String(r.descricao || "").trim(),
          min: clamp60(r.minutos),
        }))
        .sort((a, b) => b.min - a.min)[0];
      if (best && best.min > 0) lastStop = best;
    }

    const donut = Object.keys(chainTypeMinByType)
      .map((k) => ({ type: k, hours: (chainTypeMinByType[k] || 0) / 60 }))
      .filter((x) => x.hours > 0)
      .sort((a, b) => b.hours - a.hours);

    const bar = Object.keys(chainTypeMinByType)
      .map((k) => ({ type: k, hours: (chainTypeMinByType[k] || 0) / 60 }))
      .sort((a, b) => b.hours - a.hours);

    return {
      TP,
      totalH,
      PM,
      PO,
      df,
      uf,
      doPct,
      prodTon,
      prodFreq,
      tph,
      meta,
      pctMeta,
      gapMeta,
      lastStop,
      donut,
      bar,
    };
  }, [stops, prod]);

  return (
    <div style={{ padding: 18 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: -0.3 }}>UF / DF • Cadeia BT & PN</div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontWeight: 800, marginTop: 4 }}>
            BT-01, BT-02, PN-01 e PN-02 (cadeia: paradas consideradas juntas)
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.92)",
              padding: "10px 12px",
              fontWeight: 900,
            }}
          />
          <button
            onClick={() => loadAll(day)}
            disabled={busy}
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.92)",
              padding: "10px 12px",
              fontWeight: 950,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Carregando…" : "Atualizar"}
          </button>
        </div>
      </div>

      {err ? (
        <div style={{ marginTop: 12, ...cardStyle, borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)" }}>
          <div style={{ fontWeight: 950 }}>Falha ao carregar</div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontWeight: 800, marginTop: 6 }}>{err}</div>
        </div>
      ) : null}

      {/* KPI Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
          gap: 12,
          marginTop: 14,
        }}
      >
        <div style={{ gridColumn: "span 3" }}>
          <KpiCard label="DF (Disponibilidade Física)" value={fmtPct(metrics.df)} sub={`Parada manutenção: ${fmt1(metrics.PM)} h`} />
        </div>
        <div style={{ gridColumn: "span 3" }}>
          <KpiCard label="UF (Utilização Física)" value={fmtPct(metrics.uf)} sub={`Parada operacional: ${fmt1(metrics.PO)} h`} />
        </div>
        <div style={{ gridColumn: "span 3" }}>
          <KpiCard label="DO (Disponibilidade Operacional)" value={fmtPct(metrics.doPct)} sub={`Parada total: ${fmt1(metrics.totalH)} h`} />
        </div>
        <div style={{ gridColumn: "span 3" }}>
          <KpiCard
            label="Produção do dia"
            value={`${fmt0(metrics.prodTon)} t`}
            sub={metrics.meta > 0 ? `Meta: ${fmt0(metrics.meta)} t • ${fmt1(metrics.pctMeta)}%` }
          />
        </div>

        <div style={{ gridColumn: "span 3" }}>
          <KpiCard label="Ritmo médio (t/h)" value={`${fmt1(metrics.tph)} t/h`} sub={`Horas operando: ${fmt1(Math.max(0, metrics.TP - metrics.totalH))} h`} />
        </div>
        <div style={{ gridColumn: "span 3" }}>
          <KpiCard label="Gap para meta" value={metrics.meta > 0 ? `${fmt0(Math.max(0, metrics.gapMeta))} t` : "—"} sub={metrics.meta > 0 ? `Falta: ${fmt1(Math.max(0, 100 - metrics.pctMeta))}%` : "Sem meta cadastrada"} />
        </div>
        <div style={{ gridColumn: "span 6" }}>
          <KpiCard
            label="Última parada lançada"
            value={metrics.lastStop ? `${metrics.lastStop.tipo} • ${metrics.lastStop.period}` : "Sem paradas"}
            sub={metrics.lastStop ? `${metrics.lastStop.desc || "(sem descrição)"} • ${fmt0(metrics.lastStop.min)} min` : ""}
          />
        </div>
      </div>

      {/* Charts */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        <div style={{ gridColumn: "span 6", ...cardStyle }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>Horas por tipo de parada</div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontWeight: 800, marginTop: 2 }}>
                Manutenção vs Operacional (cadeia)
              </div>
            </div>
          </div>

          <div style={{ height: 320, marginTop: 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={metrics.donut} dataKey="hours" nameKey="type" innerRadius={72} outerRadius={115} paddingAngle={2}>
                  {metrics.donut.map((d) => (
                    <Cell key={d.type} fill={TYPE_COLORS[d.type] || TYPE_COLORS.Outros} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: any, _n: any, p: any) => [`${fmt1(Number(v || 0))} h`, String(p?.payload?.type || "")]} 
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ gridColumn: "span 6", ...cardStyle }}>
          <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>Ranking de paradas (horas)</div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontWeight: 800, marginTop: 2 }}>
            Top por tipo no dia
          </div>
          <div style={{ height: 320, marginTop: 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.bar} margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                <XAxis dataKey="type" tick={{ fill: "rgba(255,255,255,0.65)", fontWeight: 800 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.65)", fontWeight: 800 }} />
                <Tooltip formatter={(v: any) => `${fmt1(Number(v || 0))} h`} />
                <Bar dataKey="hours">
                  {metrics.bar.map((d) => (
                    <Cell key={d.type} fill={TYPE_COLORS[d.type] || TYPE_COLORS.Outros} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Nota */}
      <div style={{ marginTop: 12, ...cardStyle, background: "rgba(255,255,255,0.03)" }}>
        <div style={{ fontWeight: 950 }}>Como o cálculo evita duplicação</div>
        <div style={{ color: "rgba(255,255,255,0.70)", fontWeight: 800, marginTop: 6, lineHeight: 1.45 }}>
          Se o lançamento estiver como <b>"Todos"</b>, o sistema usa somente essas linhas. Se estiver por equipamento,
          por hora ele usa o <b>maior total de minutos</b> entre BT-01/BT-02/PN-01/PN-02 (cadeia para junto).
        </div>
      </div>
    </div>
  );
}
