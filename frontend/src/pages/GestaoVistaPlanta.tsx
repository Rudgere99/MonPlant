import React from "react";
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

type LetterData = {
  letter: ShiftLetter;
  supervisor: string;
  realized: number;
  target: number;
  trend: number;
};

type SupervisorRank = {
  name: string;
  performance: number;
  trend: number;
};

const productionByHour = [
  { hour: "00:00", realizado: 64, meta: 95 },
  { hour: "01:00", realizado: 82, meta: 95 },
  { hour: "02:00", realizado: 96, meta: 95 },
  { hour: "03:00", realizado: 102, meta: 95 },
  { hour: "04:00", realizado: 118, meta: 95 },
  { hour: "05:00", realizado: 91, meta: 95 },
  { hour: "06:00", realizado: 109, meta: 95 },
  { hour: "07:00", realizado: 101, meta: 95 },
  { hour: "08:00", realizado: 122, meta: 95 },
  { hour: "09:00", realizado: 96, meta: 95 },
  { hour: "10:00", realizado: 112, meta: 95 },
  { hour: "11:00", realizado: 126, meta: 95 },
  { hour: "12:00", realizado: 108, meta: 95 },
  { hour: "13:00", realizado: 138, meta: 95 },
];

const letters: LetterData[] = [
  { letter: "A", supervisor: "Carlos Eduardo", realized: 18.2, target: 20, trend: -3.2 },
  { letter: "B", supervisor: "Marcos Vinícius", realized: 22.71, target: 25, trend: -2.1 },
  { letter: "C", supervisor: "Juliana Martins", realized: 23.19, target: 27.5, trend: 0.4 },
  { letter: "D", supervisor: "Rafael Santos", realized: 26.29, target: 27.5, trend: 4.8 },
];

const supervisorRanking: SupervisorRank[] = [
  { name: "Carlos Eduardo Silva", performance: 108.5, trend: 8.6 },
  { name: "Marcos Vinícius Lima", performance: 104.2, trend: 5.1 },
  { name: "Juliana Martins", performance: 98.7, trend: 1.3 },
  { name: "Rafael dos Santos", performance: 93.8, trend: -2.4 },
  { name: "Bruno Henrique Costa", performance: 91.2, trend: -4.7 },
];

const miniTrend = [
  { name: "1", value: 78 },
  { name: "2", value: 86 },
  { name: "3", value: 81 },
  { name: "4", value: 94 },
  { name: "5", value: 89 },
  { name: "6", value: 101 },
  { name: "7", value: 98 },
  { name: "8", value: 112 },
];

const stockData = [
  { name: "Hematitinha", value: 82 },
  { name: "Itabirito", value: 68 },
  { name: "Canga", value: 54 },
  { name: "Produto", value: 91 },
];

const alerts = [
  { title: "PULMÃO CHEIO", subtitle: "Tempo excedido", time: "02:15", level: "critical" },
  { title: "EH-04 PARADA", subtitle: "Tempo parado", time: "01:10", level: "warning" },
  { title: "FALTA DE MATERIAL", subtitle: "Nível baixo - Britador 02", time: "00:48", level: "warning" },
  { title: "PROBLEMA DE BLEND", subtitle: "Desvio na Granulometria", time: "00:35", level: "info" },
];

const equipment = [
  { name: "EH-01", prod: 385, df: 92.1, uf: 89.3, ro: 96.7, status: "Operando" },
  { name: "EH-02", prod: 312, df: 89.4, uf: 84.2, ro: 94.1, status: "Operando" },
  { name: "BRITADOR 01", prod: 276, df: 87.1, uf: 81.6, ro: 93.2, status: "Operando" },
  { name: "CORREIA 01", prod: 277, df: 95.3, uf: 92.4, ro: 97.5, status: "Operando" },
  { name: "PÁTIO PULMÃO", prod: null, df: null, uf: null, ro: null, status: "Atenção" },
];

const palette = {
  bg: "#020b14",
  panel: "#051523",
  border: "rgba(255,255,255,0.15)",
  text: "#e5e7eb",
  muted: "#9ca3af",
  green: "#84cc16",
  greenSoft: "rgba(132,204,22,0.16)",
};

function ton(v: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v);
}

function panelStyle(): React.CSSProperties {
  return {
    background: "linear-gradient(180deg, #051523, #04111b)",
    border: `1px solid ${palette.border}`,
    borderRadius: 16,
    boxShadow: "0 16px 28px rgba(0,0,0,.35)",
  };
}

function MetricCard({
  title,
  value,
  suffix,
  subtitle,
  trend,
  icon,
}: {
  title: string;
  value: string;
  suffix?: string;
  subtitle: string;
  trend: number;
  icon: React.ReactNode;
}) {
  const isUp = trend >= 0;
  return (
    <div style={{ ...panelStyle(), padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 900, color: palette.green, textTransform: "uppercase" }}>{title}</div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 54, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{value}</span>
            {suffix ? <span style={{ fontSize: 18, color: palette.text }}>{suffix}</span> : null}
          </div>
          <div style={{ marginTop: 8, color: palette.text, fontSize: 15 }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{ padding: 10, borderRadius: 12, background: palette.greenSoft, color: palette.green }}>{icon}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, color: isUp ? palette.green : "#f87171", fontWeight: 900, fontSize: 18 }}>
            {isUp ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />} {isUp ? "+" : "-"}{Math.abs(trend).toFixed(1).replace(".", ",")}%
          </div>
        </div>
      </div>
      <div style={{ height: 34, marginTop: 10, color: palette.green }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={miniTrend}>
            <Area type="monotone" dataKey="value" stroke="currentColor" fill="currentColor" fillOpacity={0.25} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LetterCard({ item }: { item: LetterData }) {
  const pct = Math.round((item.realized / item.target) * 100);
  const color = pct >= 95 ? "#84cc16" : pct >= 85 ? "#fbbf24" : "#ef4444";

  return (
    <div style={{ ...panelStyle(), borderColor: `${color}88`, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 46, fontWeight: 900, color }}>{item.letter}</div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, color: palette.muted }}>{item.supervisor}</div>
        </div>
        <div style={{ alignSelf: "flex-start", padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,.08)", fontSize: 11, fontWeight: 800 }}>Turno</div>
      </div>
      <div style={{ marginTop: 12 }}>
        <span style={{ fontSize: 44, fontWeight: 900 }}>{ton(item.realized)}</span>
        <span style={{ marginLeft: 6, color: palette.text }}>Ton</span>
        <div style={{ marginTop: 6, fontSize: 14, color: palette.text }}>Meta: {ton(item.target)} Mil</div>
      </div>
      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 44, fontWeight: 900, color }}>{pct}%</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, color: item.trend >= 0 ? "#84cc16" : "#ef4444", fontWeight: 800 }}>
          {item.trend >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />} {Math.abs(item.trend).toFixed(1).replace(".", ",")}%
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
      <div style={{ fontSize: 46, fontWeight: 900, color: palette.green }}>{value.toFixed(1).replace(".", ",")}%</div>
      <div style={{ color: palette.text }}>{subtitle}</div>
    </div>
  );
}

export default function GestaoVistaPlanta() {
  const totalRealized = letters.reduce((acc, it) => acc + it.realized, 0);
  const totalTarget = letters.reduce((acc, it) => acc + it.target, 0);

  return (
    <main style={{ minHeight: "100vh", background: `radial-gradient(circle at top, #0b2b42 0%, ${palette.bg} 55%)`, color: palette.text, padding: 16 }}>
      <div style={{ maxWidth: 1850, margin: "0 auto", display: "grid", gap: 12 }}>
        <header style={{ ...panelStyle(), padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ height: 52, width: 52, borderRadius: 12, display: "grid", placeItems: "center", background: palette.greenSoft, color: palette.green }}><Factory size={30} /></div>
            <div>
              <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", fontWeight: 900, color: palette.green }}>MonPlant</div>
              <h1 style={{ margin: 0, fontSize: 52, lineHeight: 1.05, fontWeight: 900 }}>Gestão à Vista da Planta</h1>
              <div style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 6, color: palette.green, fontWeight: 900 }}><CheckCircle2 size={18} /> Planta operando</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ border: `1px solid ${palette.border}`, borderRadius: 12, padding: "8px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}><CalendarDays size={16} /> 21/04/2026</span>
            <span style={{ border: `1px solid ${palette.border}`, borderRadius: 12, padding: "8px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}><Clock3 size={16} /> 10:42</span>
            <span style={{ border: "1px solid rgba(132,204,22,.4)", borderRadius: 12, padding: "8px 12px", textAlign: "center" }}>
              <small style={{ display: "block", color: palette.muted }}>Turno</small>
              <b style={{ fontSize: 30, color: palette.green }}>B</b>
            </span>
          </div>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
          <MetricCard title="Produção do dia" value={ton(1250)} suffix="Ton" subtitle="Meta: 1.150 Ton" trend={8.7} icon={<TrendingUp size={22} />} />
          <MetricCard title="Desvio" value="+100" suffix="Ton" subtitle="Acima da meta" trend={8.7} icon={<Zap size={22} />} />
          <MetricCard title="Aderência à meta" value="108,7%" subtitle="Meta diária consolidada" trend={8.7} icon={<Activity size={22} />} />
          <MetricCard title="Toneladas por hora" value="125,4" suffix="Ton/h" subtitle="Média da hora atual" trend={10.2} icon={<Gauge size={22} />} />
          <MetricCard title="Projeção do dia" value={ton(1380)} suffix="Ton" subtitle="Projeção final" trend={12.7} icon={<ArrowUpRight size={22} />} />
          <MetricCard title="Score operacional" value="87" suffix="/100" subtitle="Muito bom" trend={4.1} icon={<ShieldCheck size={22} />} />
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
          <div style={{ ...panelStyle(), padding: 16 }}>
            <h2 style={{ margin: "0 0 8px", textTransform: "uppercase", fontSize: 26 }}>Produção ao longo do dia (Ton/h)</h2>
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={productionByHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
                  <XAxis dataKey="hour" stroke="#9ca3af" tickLine={false} axisLine={false} />
                  <YAxis stroke="#9ca3af" tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "#050b0f", border: `1px solid ${palette.green}`, borderRadius: 12, color: "#fff" }} />
                  <Line type="monotone" dataKey="meta" stroke="rgba(255,255,255,.7)" strokeDasharray="6 6" dot={false} />
                  <Line type="monotone" dataKey="realizado" stroke={palette.green} strokeWidth={4} dot={{ r: 4 }} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ ...panelStyle(), padding: 16 }}>
            <h2 style={{ margin: "0 0 12px", textTransform: "uppercase", fontSize: 26 }}>Produção por letra</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
              {letters.map((item) => <LetterCard key={item.letter} item={item} />)}
            </div>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1.2fr .9fr .9fr", gap: 12 }}>
          <div style={{ ...panelStyle(), padding: 16 }}>
            <h2 style={{ margin: "0 0 10px", textTransform: "uppercase", fontSize: 26 }}>Performance dos equipamentos</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ color: palette.muted, textAlign: "left", borderBottom: `1px solid ${palette.border}` }}>
                  <th style={{ paddingBottom: 8 }}>Equipamento</th><th>Produção</th><th>DF</th><th>UF</th><th>RO</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {equipment.map((row) => (
                  <tr key={row.name} style={{ borderBottom: `1px solid rgba(255,255,255,.09)` }}>
                    <td style={{ padding: "9px 0", display: "flex", alignItems: "center", gap: 8 }}><Wrench size={14} color="#fbbf24" />{row.name}</td>
                    <td>{row.prod ?? "--"}</td><td>{row.df ? `${row.df.toFixed(1).replace(".", ",")}%` : "--"}</td><td>{row.uf ? `${row.uf.toFixed(1).replace(".", ",")}%` : "--"}</td><td>{row.ro ? `${row.ro.toFixed(1).replace(".", ",")}%` : "--"}</td>
                    <td style={{ color: row.status === "Operando" ? palette.green : "#fbbf24", fontWeight: 800 }}>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ ...panelStyle(), padding: 16 }}>
            <h2 style={{ margin: "0 0 10px", textTransform: "uppercase", fontSize: 26, display: "flex", alignItems: "center", gap: 8 }}><UsersRound size={18} /> Ranking de supervisores</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {supervisorRanking.map((item, i) => {
                const up = item.trend >= 0;
                return (
                  <div key={item.name} style={{ display: "grid", gridTemplateColumns: "30px 1fr auto auto", gap: 8, alignItems: "center", border: `1px solid rgba(255,255,255,.08)`, borderRadius: 10, padding: 10 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 999, display: "grid", placeItems: "center", fontWeight: 900, background: i === 0 ? "#fbbf24" : "rgba(255,255,255,.12)", color: i === 0 ? "#000" : "#fff" }}>{i + 1}</span>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</span>
                    <b>{item.performance.toFixed(1).replace(".", ",")}%</b>
                    <span style={{ color: up ? palette.green : "#ef4444", fontWeight: 900 }}>{up ? "▲" : "▼"} {Math.abs(item.trend).toFixed(1).replace(".", ",")}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ ...panelStyle(), padding: 16 }}>
            <h2 style={{ margin: "0 0 10px", textTransform: "uppercase", fontSize: 26, display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle size={18} /> Alertas operacionais</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {alerts.map((alert) => {
                const border = alert.level === "critical" ? "#ef4444" : alert.level === "warning" ? "#fbbf24" : "#38bdf8";
                return (
                  <div key={alert.title} style={{ border: `1px solid ${border}`, borderRadius: 10, background: `${border}1A`, padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <b style={{ color: border }}>{alert.title}</b>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Clock3 size={14} />{alert.time}</span>
                    </div>
                    <div style={{ marginTop: 4 }}>{alert.subtitle}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 12 }}>
          <GaugeCard title="Eficiência operacional" value={82.4} subtitle="Bom" />
          <GaugeCard title="Média Ton/H (dia)" value={89.6} subtitle="Meta: 110 Ton/h" />
          <GaugeCard title="Disponibilidade geral" value={91.2} subtitle="Meta: 90%" />
          <GaugeCard title="Utilização geral" value={86.3} subtitle="Meta: 85%" />
          <GaugeCard title="Rendimento geral" value={95.4} subtitle="Meta: 95%" />

          <div style={{ ...panelStyle(), padding: 16, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: palette.muted }}>Última atualização</span>
              <RefreshCw size={16} color={palette.green} />
            </div>
            <div style={{ marginTop: 14, fontSize: 48, fontWeight: 900 }}>10:42:30</div>
            <div style={{ color: palette.text }}>21/04/2026</div>
            <div style={{ height: 1, background: "rgba(255,255,255,.13)", margin: "12px 0" }} />
            <div style={{ fontSize: 34, fontWeight: 900, color: palette.green }}>{ton(totalRealized)} Mil</div>
            <div style={{ fontSize: 13, color: palette.muted }}>Meta consolidada: {ton(totalTarget)} Mil</div>
          </div>
        </section>

        <section style={{ ...panelStyle(), padding: 16 }}>
          <h2 style={{ margin: "0 0 10px", textTransform: "uppercase", fontSize: 26 }}>Pulmões e estoques da planta</h2>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.10)" />
                <XAxis dataKey="name" stroke="#9ca3af" tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#050b0f", border: `1px solid ${palette.green}`, borderRadius: 10, color: "#fff" }} />
                <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                  {stockData.map((entry, idx) => (
                    <Cell key={entry.name} fill={idx === 3 ? palette.green : idx === 2 ? "#fbbf24" : "#16a34a"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </main>
  );
}
