// src/pages/UfDF.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

/**
 * UF / DF • Cadeia de Produção (BT-01, BT-02, PN-01, PN-02)
 *
 * Adaptado para o padrão visual do MonPlant (dashboard dark) e inspirado no layout de referência:
 * - Cards por equipamento (status + DO)
 * - Gauge (DO Cadeia)
 * - Linha (DO últimos 7 dias)
 * - Alertas recentes (paradas do dia)
 * - Inventário (tabela por equipamento)
 *
 * Premissa: os equipamentos param juntos (cadeia). Para evitar duplicação:
 * - Se houver linhas com equipamento = "Todos" (ou vazio), usamos somente essas para a cadeia.
 * - Caso contrário, por período, usamos o MAIOR total de minutos dentre os equipamentos (cadeia).
 *
 * Para cards por equipamento:
 * - Se existir "Todos", todos os equipamentos recebem os mesmos indicadores.
 * - Se não existir, calculamos por equipamento (para refletir diferenças, se houver),
 *   e também calculamos a "cadeia" via regra do MAIOR por período.
 *
 * Fórmulas:
 * - TempoProgramado = 24h
 * - ParadaManutencao = Corretiva + Preventiva + Elétrica
 * - ParadaOperacional = Operacional + Segurança + Outros
 * - DF (%) = (TP - PM) / TP
 * - UF (%) = (TP - PM - PO) / (TP - PM)
 * - DO (%) = DF * UF
 *
 * Endpoints usados:
 * - GET /api/stops-launch?day=YYYY-MM-DD -> { day, rows:[{period,equipamento,tipo_parada,descricao,minutos}] }
 * - GET /api/horimetros/last-by-eq       -> [{eq, horimetro_ini, horimetro_fim, updated_at}]
 * - GET /api/plant-production/{day}      -> { day, rows:[{period, ton, freq}], meta_ton? }
 */

type StopRow = {
  period: string; // "03-04" ou "07:00-08:00"
  equipamento: string; // "BT-01" | "BT-02" | "PN-01" | "PN-02" | "Todos" | ""
  tipo_parada: string;
  descricao: string;
  minutos: number;
};

type StopDayPayload = { day: string; rows: StopRow[] };

type ProdRow = { period: string; ton?: number | string | null; freq?: number | string | null };
type ProdPayload = { day: string; rows: ProdRow[]; meta_ton?: number | null };

type HoriRow = {
  eq: string;
  horimetro_ini?: number | null;
  horimetro_fim?: number | null;
  updated_at?: string | null;
};

const EQS = ["BT-01", "BT-02", "PN-01", "PN-02"] as const;

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

function isoDayOffset(daysBack: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
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
  Manutenção: "rgba(245,158,11,0.95)",
  Operacional: "rgba(59,130,246,0.95)",
  Segurança: "rgba(168,85,247,0.95)",
  Outros: "rgba(148,163,184,0.95)",
};

const EQ_COLORS: Record<string, string> = {
  "BT-01": "#60A5FA",
  "BT-02": "#34D399",
  "PN-01": "#FBBF24",
  "PN-02": "#F87171",
};

function classTipo(tipo: string) {
  const t = norm(tipo);

  // ✅ Alinhado com a tela de Lançamento de Paradas (stops-launch)
  // normalmente vem como: "Parada Operacional" | "Parada de Manutenção" | "Parada por Segurança"
  if (t.includes("manut")) return "Manutenção";
  if (t.includes("operac")) return "Operacional";
  if (t.includes("segur")) return "Segurança";

  return "Outros";
}

function isTodos(eq: any) {
  const e = norm(eq);
  return !e || e === "todos" || e === "todo" || e === "geral";
}

function parsePeriodStart(p: string): number {
  const s = String(p || "").trim();
  const m = s.match(/^(\d{1,2})(?::\d{2})?\s*[-–]\s*(\d{1,2})(?::\d{2})?/);
  if (!m) return -1;
  return Number(m[1]);
}

function statusFromStops(dayRows: StopRow[], eq: string, useTodos: boolean) {
  const rows = useTodos
    ? dayRows.filter((r) => isTodos(r.equipamento))
    : dayRows.filter((r) => String(r.equipamento || "").trim() === eq);

  const periods = Array.from(new Set(rows.map((r) => r.period))).sort((a, b) => parsePeriodStart(a) - parsePeriodStart(b));
  const last = periods.slice().reverse().find((p) => rows.some((r) => r.period === p && clamp60(r.minutos) > 0));
  if (!last) return { label: "Operacional", tone: "ok" as const };

  const lastRows = rows.filter((r) => r.period === last && clamp60(r.minutos) > 0);
  const hasMan = lastRows.some((r) => classTipo(r.tipo_parada) === "Manutenção");
  const hasStop = lastRows.some((r) => ["Operacional", "Segurança", "Outros"].includes(classTipo(r.tipo_parada)));

  if (hasMan) return { label: "Em Manutenção", tone: "warn" as const };
  if (hasStop) return { label: "Com Parada", tone: "bad" as const };
  return { label: "Operacional", tone: "ok" as const };
}

const cardStyle: React.CSSProperties = {
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(14,18,22,0.78)",
  padding: 16,
};

const panelStyle: React.CSSProperties = {
  ...cardStyle,
  padding: 14,
};

const labelStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.55)",
  fontWeight: 900,
  fontSize: 12,
  letterSpacing: 0.2,
  textTransform: "uppercase",
};

function Badge({ tone, children }: { tone: "ok" | "warn" | "bad"; children: React.ReactNode }) {
  const styles: Record<string, React.CSSProperties> = {
    ok: { background: "rgba(34,197,94,0.18)", border: "1px solid rgba(34,197,94,0.35)", color: "rgba(255,255,255,0.92)" },
    warn: { background: "rgba(245,158,11,0.18)", border: "1px solid rgba(245,158,11,0.35)", color: "rgba(255,255,255,0.92)" },
    bad: { background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.35)", color: "rgba(255,255,255,0.92)" },
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        fontWeight: 950,
        fontSize: 12,
        ...styles[tone],
      }}
    >
      {children}
    </span>
  );
}

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

function EqCard({
  eq,
  doPct,
  status,
  df,
  uf,
  horimetro,
}: {
  eq: string;
  doPct: number;
  status: { label: string; tone: "ok" | "warn" | "bad" };
  df: number;
  uf: number;
  horimetro: number | null;
}) {
  const accent = EQ_COLORS[eq] || "#94A3B8";
  return (
    <div
      style={{
        ...cardStyle,
        padding: 14,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: 0.12, background: `radial-gradient(800px 220px at 10% 0%, ${accent}, transparent 55%)` }} />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.3 }}>{eq}</div>
          <div style={{ fontSize: 26, fontWeight: 950, letterSpacing: -0.6 }}>{fmtPct(doPct)}</div>
        </div>

        <div style={{ marginTop: 10 }}>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <div style={{ color: "rgba(255,255,255,0.75)", fontWeight: 900, fontSize: 12 }}>
            DF: <span style={{ color: "rgba(255,255,255,0.92)" }}>{fmtPct(df)}</span>
          </div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontWeight: 900, fontSize: 12 }}>
            UF: <span style={{ color: "rgba(255,255,255,0.92)" }}>{fmtPct(uf)}</span>
          </div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontWeight: 900, fontSize: 12 }}>
            Horímetro:{" "}
            <span style={{ color: "rgba(255,255,255,0.92)" }}>
              {horimetro != null ? `${fmt0(horimetro)} h` : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GaugeHalf({ valuePct }: { valuePct: number }) {
  const v = Math.max(0, Math.min(100, valuePct));
  const data = [
    { name: "value", v: v },
    { name: "rest", v: 100 - v },
  ];
  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="v"
            startAngle={180}
            endAngle={0}
            innerRadius={75}
            outerRadius={105}
            paddingAngle={1}
            stroke="rgba(255,255,255,0.08)"
          >
            <Cell fill="rgba(59,130,246,0.85)" />
            <Cell fill="rgba(255,255,255,0.08)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div style={{ marginTop: -150, textAlign: "center" }}>
        <div style={{ fontSize: 44, fontWeight: 950, letterSpacing: -1.2 }}>{fmt0(v)}%</div>
        <div style={{ color: "rgba(255,255,255,0.62)", fontWeight: 900, marginTop: 4 }}>DO • Cadeia</div>
      </div>
    </div>
  );
}

export default function UfDF() {
  const [day, setDay] = useState<string>(isoTodayLocal());
  const [stops, setStops] = useState<StopDayPayload | null>(null);
  const [prod, setProd] = useState<ProdPayload | null>(null);
  const [horis, setHoris] = useState<HoriRow[]>([]);
  const [series7, setSeries7] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function fetchStops(d: string): Promise<StopDayPayload> {
    const qs = `day=${encodeURIComponent(d)}`;
    const a = await fetch(`${API_BASE}/api/stops-launch?${qs}`, { headers: { ...authHeaders() } });
    if (!a.ok) throw new Error(`Stops: ${a.status}`);
    const json = (await a.json()) as StopDayPayload;
    return { day: json?.day || d, rows: Array.isArray(json?.rows) ? json.rows : [] };
  }

  async function loadAll(d = day) {
    setBusy(true);
    setErr(null);
    try {
      const [st, pr, ho] = await Promise.all([
        fetchStops(d),
        fetch(`${API_BASE}/api/plant-production/${encodeURIComponent(d)}`, { headers: { ...authHeaders() } }),
        fetch(`${API_BASE}/api/horimetros/last-by-eq`, { headers: { ...authHeaders() } }),
      ]);

      if (!pr.ok) throw new Error(`Produção: ${pr.status}`);
      if (!ho.ok) throw new Error(`Horímetros: ${ho.status}`);

      const prodJson = (await pr.json()) as ProdPayload;
      const horJson = (await ho.json()) as HoriRow[];

      setStops(st);
      setProd({
        day: prodJson?.day || d,
        rows: Array.isArray(prodJson?.rows) ? prodJson.rows : [],
        meta_ton: prodJson?.meta_ton ?? null,
      });
      setHoris(Array.isArray(horJson) ? horJson : []);

      // Série 7 dias: 7 chamadas em /api/stops-launch
      const days = [6, 5, 4, 3, 2, 1, 0].map((k) => isoDayOffset(k));
      const payloads = await Promise.all(days.map((x) => fetchStops(x).catch(() => ({ day: x, rows: [] }))));
      const s7 = payloads
        .map((p) => {
          const m = computeAllMetrics(p.rows, null);
          return { day: p.day.slice(5), DO: Number(m.chain.doPct.toFixed(1)), DF: Number(m.chain.df.toFixed(1)), UF: Number(m.chain.uf.toFixed(1)) };
        })
        .sort((a, b) => String(a.day).localeCompare(String(b.day)));
      setSeries7(s7);
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar dados");
      setStops({ day: d, rows: [] });
      setProd({ day: d, rows: [], meta_ton: null });
      setHoris([]);
      setSeries7([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadAll(day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const metrics = useMemo(() => computeAllMetrics(stops?.rows || [], prod), [stops, prod]);

  const horiMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const h of horis || []) {
      const eq = String(h.eq || "").trim();
      if (!eq) continue;
      const v = h.horimetro_fim ?? h.horimetro_ini;
      if (v != null && Number.isFinite(Number(v))) m[eq] = Number(v);
    }
    return m;
  }, [horis]);

  const useTodos = useMemo(() => (stops?.rows || []).some((r) => isTodos(r.equipamento)), [stops]);

  const alerts = useMemo(() => {
    const rows = (stops?.rows || []).map((r) => ({
      ...r,
      minutos: clamp60(r.minutos),
      tipo_parada: classTipo(r.tipo_parada),
    }));

    const chainRows = useTodos ? rows.filter((r) => isTodos(r.equipamento)) : rows;
    return chainRows
      .filter((r) => r.minutos > 0)
      .sort((a, b) => (parsePeriodStart(b.period) - parsePeriodStart(a.period)) || (b.minutos - a.minutos))
      .slice(0, 8);
  }, [stops, useTodos]);

  return (
    <div style={{ padding: 18 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: -0.3 }}>UF / DF de Equipamentos • MONPLANT</div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontWeight: 800, marginTop: 4 }}>
            Cadeia: BT-01, BT-02, PN-01 e PN-02 (paradas consideradas juntas)
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

      {/* Cards por equipamento */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 12, marginTop: 14 }}>
        {EQS.map((eq) => {
          const em = useTodos ? metrics.chain : metrics.byEq[eq];
          const st = statusFromStops(stops?.rows || [], eq, useTodos);
          return (
            <div key={eq} style={{ gridColumn: "span 3" }}>
              <EqCard
                eq={eq}
                doPct={em.doPct}
                df={em.df}
                uf={em.uf}
                status={st}
                horimetro={horiMap[eq] ?? null}
              />
            </div>
          );
        })}
      </div>

      {/* Gauge + Linha + Alertas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
        <div style={{ gridColumn: "span 4", ...panelStyle }}>
          <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>Desempenho da Cadeia</div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontWeight: 800, marginTop: 2 }}>
            DO (DF × UF) • referência gerencial
          </div>
          <GaugeHalf valuePct={metrics.chain.doPct} />

          <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
            <div style={{ color: "rgba(255,255,255,0.75)", fontWeight: 900, fontSize: 12 }}>
              DF: <span style={{ color: "rgba(255,255,255,0.92)" }}>{fmtPct(metrics.chain.df)}</span>
            </div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontWeight: 900, fontSize: 12 }}>
              UF: <span style={{ color: "rgba(255,255,255,0.92)" }}>{fmtPct(metrics.chain.uf)}</span>
            </div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontWeight: 900, fontSize: 12 }}>
              Parada total: <span style={{ color: "rgba(255,255,255,0.92)" }}>{fmt1(metrics.chain.totalH)} h</span>
            </div>
          </div>
        </div>

        <div style={{ gridColumn: "span 5", ...panelStyle }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
            <div>
              <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>Desempenho das Unidades</div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontWeight: 800, marginTop: 2 }}>DO últimos 7 dias (cadeia)</div>
            </div>
            <div style={{ color: "rgba(255,255,255,0.65)", fontWeight: 900, fontSize: 12 }}>
              {series7?.length ? "Atualizado" : "Sem série"}
            </div>
          </div>

          <div style={{ height: 260, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series7 || []} margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.65)", fontWeight: 800 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.65)", fontWeight: 800 }} />
                <Tooltip formatter={(v: any) => `${fmt1(Number(v || 0))}%`} />
                <Line type="monotone" dataKey="DO" stroke="rgba(59,130,246,0.95)" strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="DF" stroke="rgba(34,197,94,0.65)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="UF" stroke="rgba(245,158,11,0.65)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ gridColumn: "span 3", ...panelStyle }}>
          <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>Alertas Recentes</div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontWeight: 800, marginTop: 2 }}>Paradas mais recentes (dia)</div>

          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {alerts.length === 0 ? (
              <div style={{ color: "rgba(255,255,255,0.65)", fontWeight: 800 }}>Sem alertas no dia.</div>
            ) : (
              alerts.map((r, idx) => (
                <div
                  key={`${r.period}-${idx}`}
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.03)",
                    padding: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 950 }}>{r.period}</div>
                    <div style={{ fontWeight: 950 }}>{fmt0(r.minutos)} min</div>
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        fontWeight: 950,
                        fontSize: 12,
                        border: `1px solid ${(TYPE_COLORS as any)[r.tipo_parada] || TYPE_COLORS.Outros}55`,
                        background: `${(TYPE_COLORS as any)[r.tipo_parada] || TYPE_COLORS.Outros}22`,
                      }}
                    >
                      {r.tipo_parada}
                    </span>
                    <span
                      style={{
                        color: "rgba(255,255,255,0.75)",
                        fontWeight: 800,
                        fontSize: 12,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 220,
                      }}
                    >
                      {String(r.descricao || "(sem descrição)")}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* KPIs + Inventário */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
        <div style={{ gridColumn: "span 4" }}>
          <KpiCard
            label="Horímetro Total (cadeia)"
            value={`${fmt0((horiMap["BT-01"] || 0) + (horiMap["BT-02"] || 0) + (horiMap["PN-01"] || 0) + (horiMap["PN-02"] || 0))} h`}
            sub="Soma dos horímetros finais (se disponíveis)"
          />
        </div>
        <div style={{ gridColumn: "span 4" }}>
          <KpiCard
            label="Eficiência Operacional (DO)"
            value={fmtPct(metrics.chain.doPct)}
            sub={`DF ${fmtPct(metrics.chain.df)} • UF ${fmtPct(metrics.chain.uf)}`}
          />
        </div>
        <div style={{ gridColumn: "span 4" }}>
          <KpiCard
            label="Produção do dia (contexto)"
            value={`${fmt0(metrics.prodTon)} t`}
            sub={metrics.meta > 0 ? `Meta ${fmt0(metrics.meta)} t • ${fmt1(metrics.pctMeta)}%` : `Freq ${fmt0(metrics.prodFreq)}`}
          />
        </div>

        <div style={{ gridColumn: "span 12", ...panelStyle }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
            <div>
              <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>Inventário de Equipamentos</div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontWeight: 800, marginTop: 2 }}>
                Status + DF/UF/DO + Horímetro
              </div>
            </div>
            <div style={{ color: "rgba(255,255,255,0.65)", fontWeight: 900, fontSize: 12 }}>
              {useTodos ? 'Base "Todos" (cadeia)' : "Por equipamento"}
            </div>
          </div>

          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 8px" }}>
              <thead>
                <tr>
                  {["Unidade", "Status", "DF", "UF", "DO", "Horímetro"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "8px 10px",
                        color: "rgba(255,255,255,0.60)",
                        fontWeight: 950,
                        fontSize: 12,
                        textTransform: "uppercase",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EQS.map((eq) => {
                  const em = useTodos ? metrics.chain : metrics.byEq[eq];
                  const st = statusFromStops(stops?.rows || [], eq, useTodos);
                  return (
                    <tr key={eq} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <td style={{ padding: "10px", borderRadius: "14px 0 0 14px", fontWeight: 950 }}>{eq}</td>
                      <td style={{ padding: "10px" }}>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td style={{ padding: "10px", fontWeight: 900 }}>{fmtPct(em.df)}</td>
                      <td style={{ padding: "10px", fontWeight: 900 }}>{fmtPct(em.uf)}</td>
                      <td style={{ padding: "10px", fontWeight: 950 }}>{fmtPct(em.doPct)}</td>
                      <td style={{ padding: "10px", borderRadius: "0 14px 14px 0", fontWeight: 900 }}>
                        {horiMap[eq] != null ? `${fmt0(horiMap[eq])} h` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10, color: "rgba(255,255,255,0.65)", fontWeight: 800, lineHeight: 1.45 }}>
            <b>Regra cadeia:</b> se houver lançamento em <b>"Todos"</b>, a cadeia usa apenas essas linhas.
            Se não houver, por período usa o <b>maior total de minutos</b> dentre os equipamentos.
          </div>
        </div>
      </div>
    </div>
  );
}

/** ===== Cálculos ===== */

function computeUFDFForRows(rows: StopRow[]) {
  const totalMin = rows.reduce((acc, r) => acc + clamp60(r.minutos), 0);
  const minByType: Record<string, number> = {};

  for (const r of rows) {
    const k = classTipo(r.tipo_parada);
    minByType[k] = (minByType[k] || 0) + clamp60(r.minutos);
  }

  const manutMin = (minByType["Corretiva"] || 0) + (minByType["Preventiva"] || 0) + (minByType["Elétrica"] || 0);
  const totalH = totalMin / 60;
  const PM = manutMin / 60;
  const PO = (totalMin - manutMin) / 60;

  const TP = 24;
  const df = TP > 0 ? ((TP - PM) / TP) * 100 : 0;
  const uf = (TP - PM) > 0 ? ((TP - PM - PO) / (TP - PM)) * 100 : 0;
  const doPct = (df / 100) * (uf / 100) * 100;

  return { df, uf, doPct, totalH, PM, PO };
}

function computeChainRows(allRows: StopRow[]) {
  const rows = allRows.map((r) => ({
    ...r,
    minutos: clamp60(r.minutos),
    tipo_parada: classTipo(r.tipo_parada),
  }));

  const rowsTodos = rows.filter((r) => isTodos(r.equipamento));
  const useTodos = rowsTodos.length > 0;

  const periods = Array.from(new Set(rows.map((r) => r.period))).sort((a, b) => parsePeriodStart(a) - parsePeriodStart(b));
  const chainRows: StopRow[] = [];

  for (const p of periods) {
    if (useTodos) {
      chainRows.push(...rowsTodos.filter((r) => r.period === p));
      continue;
    }

    const rs = rows.filter((r) => r.period === p);
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

    if (eqWinner) chainRows.push(...(byEq[eqWinner] || []));
  }

  return { chainRows, useTodos };
}

function computeAllMetrics(dayRows: StopRow[], prod: ProdPayload | null) {
  const safeRows = (dayRows || []).map((r) => ({
    ...r,
    minutos: clamp60(r.minutos),
    tipo_parada: classTipo(r.tipo_parada),
    equipamento: String(r.equipamento || "").trim(),
  }));

  const { chainRows, useTodos } = computeChainRows(safeRows);
  const chainUFDF = computeUFDFForRows(chainRows);

  const byEq: any = {};
  for (const eq of EQS) {
    const eqRows = useTodos ? chainRows : safeRows.filter((r) => String(r.equipamento || "").trim() === eq);
    byEq[eq] = computeUFDFForRows(eqRows);
  }

  const prodTon = (prod?.rows || []).reduce((acc, r) => acc + toNum(r.ton), 0);
  const prodFreq = (prod?.rows || []).reduce((acc, r) => acc + toNum(r.freq), 0);
  const meta = Number(prod?.meta_ton ?? 0) || 0;
  const pctMeta = meta > 0 ? (prodTon / meta) * 100 : 0;
  const gapMeta = meta > 0 ? meta - prodTon : 0;

  return {
    useTodos,
    chain: {
      df: chainUFDF.df,
      uf: chainUFDF.uf,
      doPct: chainUFDF.doPct,
      totalH: chainUFDF.totalH,
    },
    byEq: Object.fromEntries(
      EQS.map((eq) => [
        eq,
        {
          df: byEq[eq].df,
          uf: byEq[eq].uf,
          doPct: byEq[eq].doPct,
          totalH: byEq[eq].totalH,
        },
      ])
    ),
    prodTon,
    prodFreq,
    meta,
    pctMeta,
    gapMeta,
  };
}
