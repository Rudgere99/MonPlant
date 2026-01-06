import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  RadialBarChart,
  RadialBar,
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

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

function authHeaders(): HeadersInit {
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
  id: number;
  day: string;
  turno: 1 | 2;
  equipamento: string;
  horimetro: number;
  obs?: string | null;
  created_at?: string | null;
};

export default function Dashboard() {
  const nav = useNavigate();
  const [day, setDay] = useState<string>(isoTodayLocal());

  // states
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [prodDay, setProdDay] = useState<PlantDayPayload | null>(null);
  const [last7, setLast7] = useState<Last7Item[]>([]);
  const [stops, setStops] = useState<StopRow[]>([]);
  const [lastByEq, setLastByEq] = useState<Record<string, HorimetroRow | null>>({});

  const POLL_MS = 10_000;

  async function loadAll() {
    setLoading(true);
    setErr(null);

    try {
      // produção do dia
      const p = await apiGet<PlantDayPayload>(`/api/plant-production/${encodeURIComponent(day)}`).catch(() => {
        // se não existir no banco, devolve vazio
        return { day, rows: [], obs: "" } as PlantDayPayload;
      });

      // últimos 7 dias
      const l7 = await apiGet<Last7Item[]>(`/api/plant-production/last7days`).catch(() => []);

      // paradas do dia
      const ps = await apiGet<StopRow[]>(`/api/stops?day=${encodeURIComponent(day)}`).catch(() => []);

      // horímetros (último por equipamento)
      const hb = await apiGet<any[]>(`/api/horimetros/last-by-eq`).catch(() => []);
      const map: Record<string, HorimetroRow | null> = {};
      for (const r of hb || []) {
        if (!r?.equipamento) continue;
        map[r.equipamento] = r as HorimetroRow;
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
    const id = window.setInterval(() => {
      loadAll();
    }, POLL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  // ======= computed =======
  const totalTonDay = useMemo(() => {
    const rows = prodDay?.rows || [];
    let sum = 0;
    for (const r of rows) sum += parseBRNumber(r.ton);
    return sum;
  }, [prodDay]);

  // meta (pode virar config)
  const META_DIA = 8000;
  const pctMeta = useMemo(() => {
    if (META_DIA <= 0) return 0;
    return Math.max(0, Math.min(100, (totalTonDay / META_DIA) * 100));
  }, [totalTonDay]);

  const radialData = useMemo(() => {
    return [{ name: "Meta", value: pctMeta, fill: "#ff9f1a" }];
  }, [pctMeta]);

  const last7Chart = useMemo(() => {
    return (last7 || []).map((x) => ({
      dia: dayLabel(x.day),
      total: Number(x.total_ton) || 0,
    }));
  }, [last7]);

  const lastStop = useMemo(() => {
    const list = [...(stops || [])];
    list.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return list[0] || null;
  }, [stops]);

  const totalStops = useMemo(() => (stops || []).length, [stops]);

  const totalStopHours = useMemo(() => {
    let s = 0;
    for (const r of stops || []) s += Number(r.tempo_parada_h || 0);
    return s;
  }, [stops]);

  // ======= UI =======
  return (
    <div className="mp-container">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mp-chip">Dashboard</div>
          <div className="mp-page-title">Visão Geral</div>
          <div className="mp-page-sub">
            {loading ? "Atualizando..." : err ? `Erro: ${err}` : "Produção • Paradas • Horímetros (tempo real)"}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <div className="mp-label">Data</div>
            <input className="mp-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>

          <button className="mp-btn mp-btn-primary" onClick={loadAll} disabled={loading} style={{ minWidth: 150 }}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {/* GRID PRINCIPAL */}
      <div
        className="mt-4"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 14,
        }}
      >
        {/* Produção do dia (radial) */}
        <div className="mp-card mp-click mp-glow" style={{ gridColumn: "span 12 / span 12" }} onClick={() => nav("/plant-production")}>
          <div className="mp-card-h">
            <b>Produção do dia • {brDate(day)}</b>
            <span className="mp-help">
              Total Ton/H (soma): <b style={{ color: "rgba(255,255,255,.92)" }}>{fmtBR0(totalTonDay)}</b> • Meta: {fmtBR0(META_DIA)}
            </span>
          </div>

          <div className="mp-card-b" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12, alignItems: "center" }}>
            {/* radial */}
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  innerRadius="72%"
                  outerRadius="92%"
                  data={radialData}
                  startAngle={90}
                  endAngle={-270}
                >
                  <RadialBar
                    dataKey="value"
                    cornerRadius={12}
                    background={{ fill: "rgba(255,255,255,0.08)" }}
                  />
                </RadialBarChart>
              </ResponsiveContainer>

              <div
                style={{
                  marginTop: -170,
                  textAlign: "center",
                  pointerEvents: "none",
                }}
              >
                <div style={{ fontSize: 42, fontWeight: 950, letterSpacing: -0.02 }}>
                  {fmtBR0(pctMeta)}%
                </div>
                <div className="mp-help">Atingimento da meta</div>
              </div>
            </div>

            {/* KPIs laterais */}
            <div style={{ display: "grid", gap: 10 }}>
              <KpiBox title="Produção (t)" value={fmtBR0(totalTonDay)} sub="Acumulado do dia" accent="orange" />
              <KpiBox title="Paradas" value={String(totalStops)} sub={`Horas paradas: ${fmtBR1(totalStopHours)} h`} accent="pink" />
              <KpiBox title="Atualização" value={prodDay?.updated_at ? "OK" : "—"} sub="Dados do backend" accent="green" />
            </div>
          </div>
        </div>

        {/* Última parada */}
        <div
          className="mp-card mp-click"
          style={{ gridColumn: "span 12 / span 12" }}
          onClick={() => nav("/paradas")}
          role="button"
        >
          <div className="mp-card-h">
            <b>Última parada</b>
            <span className="mp-help">Clique para abrir Paradas</span>
          </div>

          <div className="mp-card-b">
            {!lastStop ? (
              <div className="mp-help">Nenhuma parada registrada para este dia.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span className="mp-chip">{lastStop.equipamento}</span>
                  <span className="mp-chip" style={{ borderColor: "rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.05)" }}>
                    {lastStop.tipo_parada}
                  </span>
                  <span className="mp-help" style={{ marginLeft: "auto" }}>
                    {lastStop.data_inicio} {lastStop.hora_inicio} → {lastStop.data_fim} {lastStop.hora_fim}
                  </span>
                </div>
                <div style={{ color: "rgba(255,255,255,0.88)", fontWeight: 900 }}>
                  {lastStop.atividade} • {fmtBR1(Number(lastStop.tempo_parada_h || 0))}h
                </div>
                <div className="mp-help" style={{ whiteSpace: "pre-wrap" }}>
                  {lastStop.descricao || "—"}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Últimos 7 dias */}
        <div className="mp-card mp-click mp-glow" style={{ gridColumn: "span 12 / span 12" }} onClick={() => nav("/last7days")}>
          <div className="mp-card-h">
            <b>Últimos 7 dias</b>
            <span className="mp-help">Tendência da produção (total por dia)</span>
          </div>

          <div className="mp-card-b" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={last7Chart} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                <XAxis dataKey="dia" />
                <YAxis tickFormatter={(v) => fmtBR0(Number(v) || 0)} />
                <Tooltip
                  formatter={(v: any) => fmtBR0(Number(v) || 0)}
                  contentStyle={{
                    background: "rgba(0,0,0,0.85)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 14,
                  }}
                  labelStyle={{ color: "rgba(255,255,255,0.86)" }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#ff9f1a"
                  fill="rgba(255,159,26,0.18)"
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Horímetros */}
        <div className="mp-card mp-click" style={{ gridColumn: "span 12 / span 12" }} onClick={() => nav("/horimetros")}>
          <div className="mp-card-h">
            <b>Horímetros (último por equipamento)</b>
            <span className="mp-help">Clique para abrir Horímetros</span>
          </div>

          <div className="mp-card-b">
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              {["BT-01", "BT-02", "PN-01", "PN-02"].map((eq) => {
                const r = lastByEq?.[eq] || null;
                return (
                  <div
                    key={eq}
                    className="mp-card"
                    style={{
                      borderRadius: 18,
                      padding: 12,
                      background: "rgba(255,255,255,.035)",
                      border: "1px solid rgba(255,255,255,.10)",
                      boxShadow: "0 14px 40px rgba(0,0,0,.45)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 950 }}>{eq}</div>
                      <span className="mp-chip" style={{ borderColor: "rgba(255,159,26,0.25)" }}>
                        {r ? fmtBR1(Number(r.horimetro || 0)) : "—"}
                      </span>
                    </div>
                    <div className="mp-help" style={{ marginTop: 6 }}>
                      {r ? `Dia ${brDate(r.day)} • Turno ${r.turno}` : "Sem registros ainda"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================== subcomponent ===================== */
function KpiBox({
  title,
  value,
  sub,
  accent,
}: {
  title: string;
  value: string;
  sub: string;
  accent: "orange" | "pink" | "green";
}) {
  const styles =
    accent === "orange"
      ? {
          border: "1px solid rgba(255,159,26,0.22)",
          background: "linear-gradient(180deg, rgba(255,159,26,0.14), rgba(255,159,26,0.06))",
        }
      : accent === "pink"
      ? {
          border: "1px solid rgba(251,113,133,0.22)",
          background: "linear-gradient(180deg, rgba(251,113,133,0.14), rgba(251,113,133,0.05))",
        }
      : {
          border: "1px solid rgba(34,197,94,0.22)",
          background: "linear-gradient(180deg, rgba(34,197,94,0.12), rgba(34,197,94,0.05))",
        };

  return (
    <div
      style={{
        borderRadius: 18,
        padding: 12,
        ...styles,
        boxShadow: "0 16px 44px rgba(0,0,0,.45)",
      }}
    >
      <div className="mp-help" style={{ marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.02 }}>{value}</div>
      <div className="mp-help">{sub}</div>
    </div>
  );
}
