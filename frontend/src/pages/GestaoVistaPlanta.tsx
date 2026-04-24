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
  ShieldCheck,
  TrendingUp,
  UsersRound,
  Wrench,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ShiftLetter = "A" | "B" | "C" | "D";
type PlantInfo = { id: number; name: string; code: string };
type PlantHourRow = { period: string; ton?: any; freq?: any };
type PlantDayPayload = { day: string; rows: PlantHourRow[] };
type GoalDay = { meta_ton: number | null };
type DailyRow = { day: string; t1_ton?: number; t2_ton?: number; produced_ton?: number; meta_ton?: number };
type StatsMonth = { shift?: { t1_ton?: number; t2_ton?: number }; series?: { daily?: DailyRow[] } };
type StopLaunchRow = { equipamento?: string; tipo_parada?: string; descricao?: string; minutos?: number };

const SUPERVISOR_MAP: Record<ShiftLetter, string> = {
  A: "Wellington",
  B: "Wagner",
  C: "Marcio",
  D: "Jocelio",
};

const SHIFT_BASE_DATE = "2026-03-19";
const SHIFT_CYCLE: Array<{ turno1: ShiftLetter; turno2: ShiftLetter }> = [
  { turno1: "C", turno2: "D" },
  { turno1: "C", turno2: "D" },
  { turno1: "A", turno2: "B" },
  { turno1: "A", turno2: "B" },
  { turno1: "D", turno2: "C" },
  { turno1: "D", turno2: "C" },
  { turno1: "B", turno2: "A" },
  { turno1: "B", turno2: "A" },
];

const equipment = ["EH-01", "EH-02", "BRITADOR 01", "CORREIA 01", "PÁTIO PULMÃO"];

const palette = {
  bg: "#020b14",
  border: "rgba(255,255,255,0.15)",
  text: "#e5e7eb",
  muted: "#9ca3af",
  green: "#84cc16",
  greenSoft: "rgba(132,204,22,0.16)",
};

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseBRNumber(v: any): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function ton(v: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v || 0);
}
function apiBase() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return String((import.meta as any)?.env?.VITE_API_BASE || "").trim().replace(/\/+$/, "");
}
function authHeaders() {
  const t = localStorage.getItem("mp_token") || localStorage.getItem("token") || "";
  return t ? ({ Authorization: `Bearer ${t}` } as HeadersInit) : undefined;
}
function parseYmdLocal(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function getShiftRuleForDate(dateYmd: string) {
  const base = parseYmdLocal(SHIFT_BASE_DATE);
  const target = parseYmdLocal(dateYmd);
  const days = Math.round((Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) - Date.UTC(base.getFullYear(), base.getMonth(), base.getDate())) / (24 * 60 * 60 * 1000));
  return SHIFT_CYCLE[((days % 8) + 8) % 8];
}
function panelStyle(): React.CSSProperties {
  return { background: "linear-gradient(180deg, #051523, #04111b)", border: `1px solid ${palette.border}`, borderRadius: 16, boxShadow: "0 16px 28px rgba(0,0,0,.35)" };
}

function MetricCard({ title, value, suffix, subtitle, trend, icon }: { title: string; value: string; suffix?: string; subtitle: string; trend: number; icon: React.ReactNode }) {
  const up = trend >= 0;
  return (
    <div style={{ ...panelStyle(), padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 900, color: palette.green, textTransform: "uppercase" }}>{title}</div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 46, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{value}</span>
            {suffix && <span style={{ fontSize: 18 }}>{suffix}</span>}
          </div>
          <div style={{ marginTop: 6 }}>{subtitle}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ padding: 10, borderRadius: 12, background: palette.greenSoft, color: palette.green }}>{icon}</div>
          <div style={{ marginTop: 8, color: up ? palette.green : "#ef4444", fontWeight: 900 }}>{up ? "▲" : "▼"} {Math.abs(trend).toFixed(1).replace(".", ",")}%</div>
        </div>
      </div>
    </div>
  );
}

function GaugeCard({ title, value, subtitle }: { title: string; value: number; subtitle: string }) {
  const angle = Math.max(0, Math.min(180, (value / 100) * 180));
  return (
    <div style={{ ...panelStyle(), padding: 16, textAlign: "center" }}>
      <div style={{ fontWeight: 900, textTransform: "uppercase", fontSize: 14 }}>{title}</div>
      <div style={{ position: "relative", height: 100, width: 190, margin: "16px auto 0", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: "auto 0 0", height: 190, borderRadius: 9999, border: "14px solid #1f2937" }} />
        <div style={{ position: "absolute", inset: "auto 0 0", height: 190, borderRadius: 9999, border: `14px solid ${palette.green}`, clipPath: "polygon(0 50%,100% 50%,100% 100%,0 100%)", transform: `rotate(${angle - 180}deg)` }} />
      </div>
      <div style={{ fontSize: 42, fontWeight: 900, color: palette.green }}>{value.toFixed(1).replace(".", ",")}%</div>
      <div>{subtitle}</div>
    </div>
  );
}

export default function GestaoVistaPlanta() {
  const [day] = useState(isoToday());
  const [plants, setPlants] = useState<PlantInfo[]>([]);
  const [plantId, setPlantId] = useState<number | null>(null);
  const [prodDay, setProdDay] = useState<PlantDayPayload | null>(null);
  const [goal, setGoal] = useState<GoalDay | null>(null);
  const [stats, setStats] = useState<StatsMonth | null>(null);
  const [alerts, setAlerts] = useState<StopLaunchRow[]>([]);

  useEffect(() => {
    const api = apiBase();
    if (!api) return;
    fetch(`${api}/api/plants`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : [])
      .then((arr: PlantInfo[]) => {
        const list = Array.isArray(arr) ? arr : [];
        setPlants(list);
        setPlantId(list[0]?.id || null);
      })
      .catch(() => setPlants([]));
  }, []);

  useEffect(() => {
    const api = apiBase();
    if (!api || !plantId) return;
    const month = day.slice(0, 7);

    Promise.all([
      fetch(`${api}/api/plants/${plantId}/plant-production/${encodeURIComponent(day)}`, { headers: authHeaders() }).then((r) => r.ok ? r.json() : null),
      fetch(`${api}/api/goals/day/${encodeURIComponent(day)}`, { headers: authHeaders() }).then((r) => r.ok ? r.json() : null),
      fetch(`${api}/api/plants/${plantId}/stats/month/${month}`, { headers: authHeaders() }).then((r) => r.ok ? r.json() : null),
      fetch(`${api}/api/plants/${plantId}/stops-launch?day=${encodeURIComponent(day)}`, { headers: authHeaders() }).then((r) => r.ok ? r.json() : null),
    ])
      .then(([p, g, s, st]) => {
        setProdDay(p as PlantDayPayload);
        setGoal(g as GoalDay);
        setStats(s as StatsMonth);
        setAlerts(Array.isArray((st as any)?.rows) ? (st as any).rows : []);
      })
      .catch(() => null);
  }, [plantId, day]);

  const hourlyData = useMemo(() => {
    const rows = prodDay?.rows || [];
    return rows.map((r) => ({ hour: String(r.period || ""), realizado: parseBRNumber(r.ton), meta: Number(goal?.meta_ton || 0) / 24 || 0 }));
  }, [prodDay, goal]);

  const totalRealized = useMemo(() => (prodDay?.rows || []).reduce((a, r) => a + parseBRNumber(r.ton), 0), [prodDay]);
  const totalTarget = Number(goal?.meta_ton || 0);
  const aderencia = totalTarget > 0 ? (totalRealized / totalTarget) * 100 : 0;
  const avgTonH = (prodDay?.rows || []).length ? totalRealized / (prodDay?.rows || []).length : 0;
  const currentHour = new Date().getHours() + 1;
  const projDay = currentHour > 0 ? (totalRealized / currentHour) * 24 : totalRealized;
  const freqAvg = (prodDay?.rows || []).length ? (prodDay?.rows || []).reduce((a, r) => a + parseBRNumber(r.freq), 0) / (prodDay?.rows || []).length : 0;

  const letters = useMemo(() => {
    const base: Record<ShiftLetter, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const d of stats?.series?.daily || []) {
      const rule = getShiftRuleForDate(d.day);
      base[rule.turno1] += Number(d.t1_ton || 0);
      base[rule.turno2] += Number(d.t2_ton || 0);
    }
    const perTarget = totalTarget > 0 ? totalTarget / 4 : 0;
    return (["A", "B", "C", "D"] as ShiftLetter[]).map((l) => {
      const val = base[l] || 0;
      const pct = perTarget > 0 ? (val / perTarget) * 100 : 0;
      return { letter: l, supervisor: SUPERVISOR_MAP[l], realized: val, target: perTarget, trend: pct - 100, performance: pct };
    });
  }, [stats, totalTarget]);

  const ranking = useMemo(
    () => [...letters].sort((a, b) => b.performance - a.performance).map((l) => ({ name: `${SUPERVISOR_MAP[l.letter]} (${l.letter})`, performance: l.performance, trend: l.trend })),
    [letters]
  );

  const alertsView = useMemo(
    () => (alerts || []).slice(0, 4).map((a) => ({ title: (a.tipo_parada || "Alerta").toUpperCase(), subtitle: `${a.equipamento || "Equipamento"} • ${a.descricao || "Sem descrição"}`, time: `${Math.round(Number(a.minutos || 0))} min`, level: (Number(a.minutos || 0) > 120 ? "critical" : Number(a.minutos || 0) > 60 ? "warning" : "info") })),
    [alerts]
  );

  return (
    <main style={{ minHeight: "100vh", background: `radial-gradient(circle at top, #0b2b42 0%, ${palette.bg} 55%)`, color: palette.text, padding: 16 }}>
      <div style={{ maxWidth: 1850, margin: "0 auto", display: "grid", gap: 12 }}>
        <header style={{ ...panelStyle(), padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ height: 52, width: 52, borderRadius: 12, display: "grid", placeItems: "center", background: palette.greenSoft, color: palette.green }}><Factory size={30} /></div>
            <div>
              <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", fontWeight: 900, color: palette.green }}>MonPlant</div>
              <h1 style={{ margin: 0, fontSize: 46, lineHeight: 1.05, fontWeight: 900 }}>Gestão à Vista da Planta</h1>
              <div style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 6, color: palette.green, fontWeight: 900 }}><CheckCircle2 size={18} /> Planta operando</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ border: `1px solid ${palette.border}`, borderRadius: 12, padding: "8px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}><CalendarDays size={16} /> {day.split("-").reverse().join("/")}</span>
            <span style={{ border: `1px solid ${palette.border}`, borderRadius: 12, padding: "8px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}><Clock3 size={16} /> {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
            <select value={plantId || ""} onChange={(e) => setPlantId(Number(e.target.value))} style={{ background: "#061523", color: "white", border: `1px solid ${palette.border}`, borderRadius: 10, padding: "8px 10px" }}>
              {plants.map((p) => <option key={p.id} value={p.id}>{p.name || p.code}</option>)}
            </select>
          </div>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
          <MetricCard title="Produção do dia" value={ton(totalRealized)} suffix="Ton" subtitle={`Meta: ${ton(totalTarget)} Ton`} trend={aderencia - 100} icon={<TrendingUp size={22} />} />
          <MetricCard title="Desvio" value={`${totalRealized - totalTarget >= 0 ? "+" : ""}${ton(totalRealized - totalTarget)}`} suffix="Ton" subtitle={totalRealized >= totalTarget ? "Acima da meta" : "Abaixo da meta"} trend={aderencia - 100} icon={<Zap size={22} />} />
          <MetricCard title="Aderência à meta" value={`${aderencia.toFixed(1).replace(".", ",")}%`} subtitle="Meta diária consolidada" trend={aderencia - 100} icon={<Activity size={22} />} />
          <MetricCard title="Toneladas por hora" value={ton(avgTonH)} suffix="Ton/h" subtitle="Média da hora atual" trend={freqAvg - 100} icon={<Gauge size={22} />} />
          <MetricCard title="Projeção do dia" value={ton(projDay)} suffix="Ton" subtitle="Projeção final" trend={totalTarget > 0 ? (projDay / totalTarget) * 100 - 100 : 0} icon={<ArrowUpRight size={22} />} />
          <MetricCard title="Score operacional" value={ton(freqAvg)} suffix="/100" subtitle="Índice médio de frequência" trend={freqAvg - 90} icon={<ShieldCheck size={22} />} />
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
          <div style={{ ...panelStyle(), padding: 16 }}>
            <h2 style={{ margin: "0 0 8px", textTransform: "uppercase", fontSize: 24 }}>Produção ao longo do dia (Ton/h)</h2>
            <div style={{ height: 320 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={hourlyData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" /><XAxis dataKey="hour" stroke="#9ca3af" tickLine={false} axisLine={false} /><YAxis stroke="#9ca3af" tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: "#050b0f", border: `1px solid ${palette.green}`, borderRadius: 12, color: "#fff" }} /><Line type="monotone" dataKey="meta" stroke="rgba(255,255,255,.7)" strokeDasharray="6 6" dot={false} /><Line type="monotone" dataKey="realizado" stroke={palette.green} strokeWidth={4} dot={{ r: 4 }} activeDot={{ r: 8 }} /></LineChart></ResponsiveContainer></div>
          </div>
          <div style={{ ...panelStyle(), padding: 16 }}>
            <h2 style={{ margin: "0 0 12px", textTransform: "uppercase", fontSize: 24 }}>Produção por letra</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
              {letters.map((l) => {
                const color = l.performance >= 95 ? palette.green : l.performance >= 85 ? "#fbbf24" : "#ef4444";
                return (
                  <div key={l.letter} style={{ ...panelStyle(), borderColor: `${color}88`, padding: 12 }}>
                    <div style={{ fontSize: 40, fontWeight: 900, color }}>{l.letter}</div>
                    <div style={{ fontSize: 11, color: palette.muted }}>{l.supervisor}</div>
                    <div style={{ marginTop: 8, fontSize: 30, fontWeight: 900 }}>{ton(l.realized)} <span style={{ fontSize: 14 }}>Ton</span></div>
                    <div style={{ fontSize: 13, color: palette.text }}>Meta: {ton(l.target)} Ton</div>
                    <div style={{ marginTop: 8, fontSize: 30, fontWeight: 900, color }}>{Math.round(l.performance)}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1.2fr .9fr .9fr", gap: 12 }}>
          <div style={{ ...panelStyle(), padding: 16 }}>
            <h2 style={{ margin: "0 0 10px", textTransform: "uppercase", fontSize: 24 }}>Performance dos equipamentos</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}><thead><tr style={{ color: palette.muted, textAlign: "left", borderBottom: `1px solid ${palette.border}` }}><th style={{ paddingBottom: 8 }}>Equipamento</th><th>Status</th></tr></thead><tbody>{equipment.map((eq) => <tr key={eq} style={{ borderBottom: "1px solid rgba(255,255,255,.09)" }}><td style={{ padding: "9px 0", display: "flex", alignItems: "center", gap: 8 }}><Wrench size={14} color="#fbbf24" />{eq}</td><td style={{ color: palette.green, fontWeight: 800 }}>Operando</td></tr>)}</tbody></table>
          </div>
          <div style={{ ...panelStyle(), padding: 16 }}>
            <h2 style={{ margin: "0 0 10px", textTransform: "uppercase", fontSize: 24, display: "flex", alignItems: "center", gap: 8 }}><UsersRound size={18} /> Ranking de supervisores</h2>
            <div style={{ display: "grid", gap: 8 }}>{ranking.map((r, i) => <div key={r.name} style={{ display: "grid", gridTemplateColumns: "30px 1fr auto auto", gap: 8, alignItems: "center", border: `1px solid rgba(255,255,255,.08)`, borderRadius: 10, padding: 10 }}><span style={{ width: 26, height: 26, borderRadius: 999, display: "grid", placeItems: "center", fontWeight: 900, background: i === 0 ? "#fbbf24" : "rgba(255,255,255,.12)", color: i === 0 ? "#000" : "#fff" }}>{i + 1}</span><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span><b>{r.performance.toFixed(1).replace(".", ",")}%</b><span style={{ color: r.trend >= 0 ? palette.green : "#ef4444", fontWeight: 900 }}>{r.trend >= 0 ? "▲" : "▼"} {Math.abs(r.trend).toFixed(1).replace(".", ",")}%</span></div>)}</div>
          </div>
          <div style={{ ...panelStyle(), padding: 16 }}>
            <h2 style={{ margin: "0 0 10px", textTransform: "uppercase", fontSize: 24, display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle size={18} /> Alertas operacionais</h2>
            <div style={{ display: "grid", gap: 8 }}>{alertsView.map((a) => { const color = a.level === "critical" ? "#ef4444" : a.level === "warning" ? "#fbbf24" : "#38bdf8"; return <div key={`${a.title}-${a.time}`} style={{ border: `1px solid ${color}`, borderRadius: 10, background: `${color}1A`, padding: 10 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ color }}>{a.title}</b><span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Clock3 size={14} />{a.time}</span></div><div style={{ marginTop: 4 }}>{a.subtitle}</div></div>; })}</div>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 12 }}>
          <GaugeCard title="Eficiência operacional" value={Math.max(0, Math.min(100, aderencia))} subtitle="Aderência" />
          <GaugeCard title="Média Ton/H (dia)" value={Math.max(0, Math.min(100, (avgTonH / 10) * 100))} subtitle={`${ton(avgTonH)} Ton/h`} />
          <GaugeCard title="Disponibilidade geral" value={91.2} subtitle="Meta: 90%" />
          <GaugeCard title="Utilização geral" value={86.3} subtitle="Meta: 85%" />
          <GaugeCard title="Rendimento geral" value={95.4} subtitle="Meta: 95%" />
          <div style={{ ...panelStyle(), padding: 16, textAlign: "center" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: palette.muted }}>Última atualização</span><RefreshCw size={16} color={palette.green} /></div><div style={{ marginTop: 14, fontSize: 48, fontWeight: 900 }}>{new Date().toLocaleTimeString("pt-BR")}</div><div style={{ color: palette.text }}>{day.split("-").reverse().join("/")}</div><div style={{ height: 1, background: "rgba(255,255,255,.13)", margin: "12px 0" }} /><div style={{ fontSize: 34, fontWeight: 900, color: palette.green }}>{ton(totalRealized)} Ton</div><div style={{ fontSize: 13, color: palette.muted }}>Meta consolidada: {ton(totalTarget)} Ton</div></div>
        </section>

        <section style={{ ...panelStyle(), padding: 16 }}>
          <h2 style={{ margin: "0 0 10px", textTransform: "uppercase", fontSize: 24 }}>Pulmões e estoques da planta</h2>
          <div style={{ height: 240 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={[{ name: "Hematitinha", value: Math.min(100, aderencia) }, { name: "Itabirito", value: Math.min(100, freqAvg) }, { name: "Canga", value: Math.max(0, 100 - aderencia) }, { name: "Produto", value: Math.min(100, (projDay / (totalTarget || 1)) * 100) }]}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.10)" /><XAxis dataKey="name" stroke="#9ca3af" tickLine={false} axisLine={false} /><YAxis stroke="#9ca3af" tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: "#050b0f", border: `1px solid ${palette.green}`, borderRadius: 10, color: "#fff" }} /><Bar dataKey="value" radius={[10, 10, 0, 0]}>{[0, 1, 2, 3].map((idx) => <Cell key={idx} fill={idx === 3 ? palette.green : idx === 2 ? "#fbbf24" : "#16a34a"} />)}</Bar></BarChart></ResponsiveContainer></div>
        </section>
      </div>
    </main>
  );
}
