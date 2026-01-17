import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

/**
 * Normaliza period do backend para "HH-HH"
 * Aceita: "00-01", "0-1", "00:00-01:00", "00:00–01:00", "00:00 — 01:00"
 */
function normalizePeriod(period: string): string {
  const s0 = String(period || "").trim();
  if (!s0) return s0;

  const s = s0.replace(/–|—/g, "-");
  const parts = s.split("-").map((x) => x.trim()).filter(Boolean);

  if (parts.length >= 2) {
    const h1m = parts[0].match(/^(\d{1,2})/); // pega só a hora (antes de :)
    const h2m = parts[1].match(/^(\d{1,2})/);

    if (h1m && h2m) {
      const h1 = Math.max(0, Math.min(23, Number(h1m[1])));
      const h2raw = Number(h2m[1]);
      const h2 = Math.max(0, Math.min(24, h2raw)); // permite 24 no final
      return `${pad2(h1)}-${pad2(h2)}`;
    }
  }

  const m = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (m) return `${pad2(Number(m[1]))}-${pad2(Number(m[2]))}`;

  return s0;
}

/** Cria sempre as 24 horas: 00-01 ... 23-24 e mescla com rows */
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
    const label = `${pad2(h)}-${pad2(h + 1)}`;
    const found = map.get(label);
    result.push({ period: label, ton: found?.ton ?? 0, freq: found?.freq ?? 0 });
  }
  return result;
}

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

// ==== Labels do gráfico ====
const BarValueLabel = (props: any) => {
  const { x, y, width, value } = props || {};
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  const cx = (Number(x) || 0) + (Number(width) || 0) / 2;
  const cy = (Number(y) || 0) - 10;
  const label = n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return (
    <text x={cx} y={cy} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize={13} fontWeight={900}>
      {label}
    </text>
  );
};

const FreqPointLabel = (props: any) => {
  const { x, y, value } = props || {};
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  const cx = Number(x) || 0;
  const cy = (Number(y) || 0) - 14;
  const label = `${Math.round(n)}%`;
  return (
    <text x={cx} y={cy} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize={13} fontWeight={900}>
      {label}
    </text>
  );
};

function authHeaders(): Record<string, string> {
  const keys = ["mp_token", "token", "access_token", "auth_token"];
  for (const k of keys) {
    const v = (localStorage.getItem(k) || "").trim();
    if (v) return { Authorization: `Bearer ${v}` };
  }
  return {};
}

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}

/* ===================== types ===================== */
type PlantHourRow = { period: string; ton?: any; freq?: any };
type PlantDayPayload = { day: string; obs?: string | null; rows: PlantHourRow[]; updated_at?: string | null };
type Last7Item = { day: string; total_ton: number };

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

const EQ_BT01 = "BT-01";
const EQS_TOP_PRODUCTS = ["BT-02", "PN-02", "PN-01", "EH-08"] as const;

export default function Dashboard() {
  const nav = useNavigate();
  const [day, setDay] = useState<string>(isoTodayLocal());

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [prodDay, setProdDay] = useState<PlantDayPayload | null>(null);
  const [last7, setLast7] = useState<Last7Item[]>([]);
  const [stops, setStops] = useState<StopRow[]>([]);
  const [lastByEq, setLastByEq] = useState<Record<string, HorimetroRow | null>>({});

  const POLL_MS = 10_000;
  const META_DIA = 8000;

  async function loadAll() {
    setLoading(true);
    setErr(null);

    try {
      const p = await apiGet<PlantDayPayload>(`/api/plant-production/${encodeURIComponent(day)}`).catch(() => {
        return { day, rows: [], obs: "" } as PlantDayPayload;
      });

      const l7 = await apiGet<Last7Item[]>(`/api/plant-production/last7days`).catch(() => []);
      const ps = await apiGet<StopRow[]>(`/api/stops?day=${encodeURIComponent(day)}`).catch(() => []);
      const hb = await apiGet<HorimetroRow[]>(`/api/horimetros/last-by-eq`).catch(() => []);

      const map: Record<string, HorimetroRow | null> = {};
      for (const r of hb || []) {
        if (!r?.equipamento) continue;
        map[r.equipamento] = r;
      }

      setProdDay(p);
      setLast7(Array.isArray(l7) ? l7 : []);
      setStops(Array.isArray(ps) ? ps : []);
      setLastByEq(map);
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  useEffect(() => {
    const id = window.setInterval(() => loadAll(), POLL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  /* ===================== computed ===================== */
  const totalTonDay = useMemo(() => {
    const rows = prodDay?.rows || [];
    let sum = 0;
    for (const r of rows) sum += parseBRNumber(r.ton);
    return sum;
  }, [prodDay]);

  const pctMeta = useMemo(() => {
    if (META_DIA <= 0) return 0;
    return Math.max(0, Math.min(100, (totalTonDay / META_DIA) * 100));
  }, [totalTonDay]);

  // ✅ AQUI: normaliza + garante 24 horas + mantém produção
  const hourlySeries = useMemo(() => {
    const rows = prodDay?.rows || [];
    const data = rows.map((r) => ({
      period: normalizePeriod(r.period),
      ton: parseBRNumber(r.ton),
      freq: parseBRNumber(r.freq),
    }));
    return buildHourlyGrid(data);
  }, [prodDay]);

  const avgTonPerHour = useMemo(() => {
    const filled = (hourlySeries || []).filter((r) => (Number(r.ton) || 0) > 0);
    if (!filled.length) return 0;
    const sum = filled.reduce((acc, r) => acc + (Number(r.ton) || 0), 0);
    return sum / filled.length;
  }, [hourlySeries]);

  const last7Series = useMemo(() => {
    return (last7 || []).map((x) => ({
      day: dayLabel(x.day),
      total: Number(x.total_ton) || 0,
    }));
  }, [last7]);

  const totalStops = useMemo(() => (stops || []).length, [stops]);

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

  const gaugeData = useMemo(() => [{ name: "meta", value: pctMeta, fill: "#ff9f1a" }], [pctMeta]);

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
    gridTemplateColumns: "1fr auto auto",
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

  return (
    <div className="mp-container">
      {/* TOP BAR */}
      <div style={topBar}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...subStyle, marginRight: 6 }}>Data</span>
          <input
            className="mp-input"
            style={{ width: 160, height: 42, borderRadius: 14 }}
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={smallPill}>{loading ? "Atualizando..." : err ? "Erro" : "Online"}</span>
          <button className="mp-btn mp-btn-primary" onClick={loadAll} disabled={loading} style={{ height: 42 }}>
            Atualizar
          </button>
        </div>
      </div>

      <div style={{ marginTop: 8, color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 800 }}>
        Dashboard • {brDate(day)} {err ? `• ${err}` : "• tempo real"}
      </div>

      {/* GRID */}
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 14 }}>
        {/* LEFT */}
        <div style={{ gridColumn: "span 9 / span 9", display: "grid", gap: 14 }}>
          {/* HOJE */}
          <div style={{ ...cardBase, padding: 14 }}>
            <div style={headerStyle}>
              <div>
                <div style={titleStyle}>Hoje</div>
                <div style={subStyle}>Resumo • Paradas + Horímetro</div>
              </div>
              <button className="mp-btn" style={{ height: 36 }} onClick={() => nav("/paradas")}>
                Abrir Paradas
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
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
            </div>
          </div>

          {/* PRODUÇÃO HORÁRIA */}
          <div style={{ ...cardBase, padding: 14, cursor: "pointer" }} onClick={() => nav("/plant-production")}>
            <div style={headerStyle}>
              <div>
                <div style={titleStyle}>Produção por hora (Ton/H + Frequência)</div>
                <div style={subStyle}>
                  Total do dia: <b style={{ color: "rgba(255,255,255,0.88)" }}>{fmtBR0(totalTonDay)}</b> t
                </div>
              </div>
              <span
                style={{
                  ...smallPill,
                  borderColor: "rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                }}
              >
                {prodDay?.updated_at ? "Atualizado" : "—"}
              </span>
            </div>

            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={hourlySeries} margin={{ top: 16, right: 26, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="period"
                    interval={0}
                    tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="left"
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
                  <Tooltip
                    formatter={(v: any, name: any) => {
                      if (name === "freq") return `${fmtBR0(Number(v) || 0)}%`;
                      return fmtBR1(Number(v) || 0);
                    }}
                    contentStyle={{
                      background: "rgba(0,0,0,0.86)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 14,
                      boxShadow: "0 18px 50px rgba(0,0,0,0.65)",
                    }}
                    labelStyle={{ color: "rgba(255,255,255,0.86)" }}
                  />
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

          {/* BOTTOM */}
          <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 14 }}>
            {/* TOP PRODUCTS (horímetros) */}
            <div style={{ ...cardBase, padding: 14 }}>
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

            {/* LAST 7 DAYS */}
            <div style={{ ...cardBase, padding: 14, cursor: "pointer" }} onClick={() => nav("/last7days")}>
              <div style={headerStyle}>
                <div>
                  <div style={titleStyle}>Últimos 7 dias</div>
                  <div style={subStyle}>Total por dia</div>
                </div>
              </div>

              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={last7Series} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }} />
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
                    <Area type="monotone" dataKey="total" stroke="#ff9f1a" fill="rgba(255,159,26,0.14)" strokeWidth={2.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ gridColumn: "span 3 / span 3", display: "grid", gap: 14 }}>
          {/* GAUGE */}
          <div style={{ ...cardBase, padding: 14, cursor: "pointer" }} onClick={() => nav("/plant-production")}>
            <div style={headerStyle}>
              <div>
                <div style={titleStyle}>Produção do dia</div>
                <div style={subStyle}>Meta: {fmtBR0(META_DIA)} t</div>
              </div>
            </div>

            <div style={{ height: 210, position: "relative" }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart data={gaugeData} innerRadius="75%" outerRadius="100%" startAngle={180} endAngle={0}>
                  <RadialBar dataKey="value" cornerRadius={14} background={{ fill: "rgba(255,255,255,0.08)" }} />
                </RadialBarChart>
              </ResponsiveContainer>

              <div style={{ position: "absolute", left: 0, right: 0, top: 86, textAlign: "center", pointerEvents: "none" }}>
                <div style={{ fontSize: 34, fontWeight: 950, letterSpacing: -0.02 }}>{fmtBR0(pctMeta)}%</div>
                <div style={{ ...subStyle, marginTop: 4 }}>Atingimento</div>
                <div style={{ marginTop: 6, fontWeight: 900, color: "rgba(255,255,255,0.86)" }}>
                  {fmtBR0(totalTonDay)} t
                </div>
              </div>
            </div>
          </div>

          {/* TAXA */}
          <div style={{ ...cardBase, padding: 14 }}>
            <div style={headerStyle}>
              <div>
                <div style={titleStyle}>Taxa Média</div>
                <div style={subStyle}>Freq% últimas horas</div>
              </div>
              <span style={{ ...smallPill, borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", height: 32 }}>
                {fmtBR0(levelAvg)}%
              </span>
            </div>

            <div style={{ height: 170 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={levelBars} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: any) => `${fmtBR0(Number(v) || 0)}%`}
                    contentStyle={{ background: "rgba(0,0,0,0.86)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14 }}
                    labelStyle={{ color: "rgba(255,255,255,0.86)" }}
                  />
                  <Bar dataKey="freq" radius={[10, 10, 0, 0]} fill="#ff9f1a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* INSIGHTS */}
          <div style={{ ...cardBase, padding: 14 }}>
            <div style={headerStyle}>
              <div>
                <div style={titleStyle}>Média/Hora</div>
                <div style={subStyle}>Média de produção por hora</div>
              </div>
              <span style={{ ...smallPill, borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", height: 32 }}>
                {fmtBR1(avgTonPerHour)} t/h
              </span>
            </div>

            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlySeries} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                  <XAxis dataKey="period" interval={0} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v: any) => `${fmtBR1(Number(v) || 0)} t/h`}
                    contentStyle={{ background: "rgba(0,0,0,0.86)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14 }}
                    labelStyle={{ color: "rgba(255,255,255,0.86)" }}
                  />
                  <Area type="monotone" dataKey="ton" stroke="#ff9f1a" fill="rgba(255,159,26,0.14)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>
              Considera somente horas preenchidas (Ton/H &gt; 0).
            </div>
          </div>
        </div>
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
