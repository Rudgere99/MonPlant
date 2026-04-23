import React, { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CloudSun,
  Factory,
  Gauge,
  HardHat,
  Pickaxe,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Truck,
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

type EquipmentRow = {
  equipment: string;
  icon: React.ReactNode;
  production: number | null;
  availability: number | null;
  utilization: number | null;
  yieldPct: number | null;
  status: "operando" | "atencao";
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
  { letter: "C", supervisor: "Juliana Martins", realized: 23.19, target: 27.5, trend: 0.1 },
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

const alerts = [
  { title: "Pulmão cheio", subtitle: "Tempo excedido", time: "02:15", level: "critical" },
  { title: "EH-04 parada", subtitle: "Tempo parado", time: "01:10", level: "warning" },
  { title: "Falta de material", subtitle: "Nível baixo - Britador 02", time: "00:48", level: "warning" },
  { title: "Problema de blend", subtitle: "Desvio na granulometria", time: "00:35", level: "info" },
];

const stockData = [
  { name: "Hematitinha", value: 82 },
  { name: "Itabirito", value: 68 },
  { name: "Canga", value: 54 },
  { name: "Produto", value: 91 },
];

const equipmentRows: EquipmentRow[] = [
  { equipment: "EH-01", icon: <Truck size={18} />, production: 385, availability: 92.1, utilization: 89.3, yieldPct: 96.7, status: "operando" },
  { equipment: "EH-02", icon: <Truck size={18} />, production: 312, availability: 89.4, utilization: 84.2, yieldPct: 94.1, status: "operando" },
  { equipment: "BRITADOR 01", icon: <Factory size={18} />, production: 276, availability: 87.1, utilization: 81.6, yieldPct: 93.2, status: "operando" },
  { equipment: "CORREIA 01", icon: <Wrench size={18} />, production: 277, availability: 95.3, utilization: 92.4, yieldPct: 97.5, status: "operando" },
  { equipment: "PÁTIO PULMÃO", icon: <Pickaxe size={18} />, production: null, availability: null, utilization: null, yieldPct: null, status: "atencao" },
];

function formatTon(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function ProgressBar({ value }: { value: number | null }) {
  if (value == null) return <span className="text-zinc-500">--</span>;
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-right text-zinc-200">{value.toFixed(1).replace(".", ",")}%</span>
      <div className="h-3 w-20 rounded-full bg-zinc-800/90">
        <div className="h-full rounded-full bg-gradient-to-r from-lime-400 to-green-500" style={{ width: `${Math.max(8, value)}%` }} />
      </div>
    </div>
  );
}

function MetricCard({ title, value, suffix, subtitle, trend, icon }: { title: string; value: string; suffix?: string; subtitle: string; trend?: number; icon: React.ReactNode }) {
  const positive = (trend ?? 0) >= 0;

  return (
    <section className="rounded-2xl border border-emerald-300/20 bg-gradient-to-b from-[#06151f] to-[#031118] p-5 shadow-[0_10px_36px_rgba(0,0,0,.45)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.13em] text-lime-300/90">{title}</p>
          <div className="mt-3 flex items-end gap-2">
            <strong className="text-4xl font-black tracking-tight text-white">{value}</strong>
            {suffix && <span className="pb-1 text-2xl text-zinc-200/90">{suffix}</span>}
          </div>
          <p className="mt-2 text-sm text-zinc-300">{subtitle}</p>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="rounded-xl border border-lime-400/30 bg-lime-400/10 p-3 text-lime-300">{icon}</div>
          {typeof trend === "number" && (
            <div className={`flex items-center gap-1 text-3xl font-black ${positive ? "text-lime-300" : "text-red-400"}`}>
              {positive ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
              <span className="text-xl">{positive ? "+" : "-"}{Math.abs(trend).toFixed(1).replace(".", ",")}%</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 h-10 text-lime-400">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={miniTrend}>
            <Area type="monotone" dataKey="value" stroke="currentColor" fill="currentColor" fillOpacity={0.2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function GaugeCard({ title, value, subtitle }: { title: string; value: number; subtitle: string }) {
  const angle = Math.max(0, Math.min(180, (value / 100) * 180));
  return (
    <section className="rounded-2xl border border-white/15 bg-gradient-to-b from-[#071621] to-[#041019] p-5">
      <p className="text-center text-sm font-black uppercase tracking-wide text-zinc-100">{title}</p>
      <div className="relative mx-auto mt-6 h-28 w-52 overflow-hidden">
        <div className="absolute inset-x-0 bottom-0 h-52 rounded-full border-[18px] border-zinc-800" />
        <div
          className="absolute inset-x-0 bottom-0 h-52 rounded-full border-[18px] border-lime-400"
          style={{ clipPath: "polygon(0 50%, 100% 50%, 100% 100%, 0 100%)", transform: `rotate(${angle - 180}deg)` }}
        />
      </div>
      <div className="text-center">
        <strong className="text-5xl font-black text-lime-300">{value.toFixed(1).replace(".", ",")}%</strong>
        <p className="mt-2 text-3xl font-semibold text-zinc-300">{subtitle}</p>
      </div>
    </section>
  );
}

function LetterCard({ item }: { item: LetterData }) {
  const percent = Math.round((item.realized / item.target) * 100);
  const status = percent >= 95 ? "border-lime-400/70 text-lime-300" : percent >= 85 ? "border-amber-400/70 text-amber-300" : "border-red-500/70 text-red-400";

  return (
    <section className={`rounded-2xl border bg-gradient-to-b from-[#041b15] to-[#04140f] p-5 shadow-inner ${status}`}>
      <div className="flex items-start justify-between">
        <div>
          <strong className="text-6xl font-black">{item.letter}</strong>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-400">{item.supervisor}</p>
        </div>
        <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-zinc-200">Turno</div>
      </div>

      <div className="mt-5">
        <strong className="text-5xl font-black text-white">{formatTon(item.realized)}</strong>
        <span className="ml-2 text-3xl text-zinc-300">Ton</span>
        <p className="mt-2 text-2xl text-zinc-300">Meta: {formatTon(item.target)} Mil</p>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <strong className="text-5xl font-black">{percent}%</strong>
        <span className={`flex items-center gap-1 text-2xl font-black ${item.trend >= 0 ? "text-lime-300" : "text-red-400"}`}>
          {item.trend >= 0 ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
          {Math.abs(item.trend).toFixed(1).replace(".", ",")}%
        </span>
      </div>
    </section>
  );
}

function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/15 bg-[#03111a]/95 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-black uppercase tracking-wide">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function GestaoVistaPlanta() {
  const [mode, setMode] = useState<"hoje" | "periodo">("hoje");

  const totalRealized = useMemo(() => letters.reduce((acc, item) => acc + item.realized, 0), []);
  const totalTarget = useMemo(() => letters.reduce((acc, item) => acc + item.target, 0), []);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#052334_0%,_#020b11_60%,_#01070c_100%)] p-4 text-white">
      <div className="mx-auto max-w-[1900px] space-y-4">
        <header className="rounded-2xl border border-white/15 bg-[#03101b]/95 px-6 py-4 shadow-[0_20px_40px_rgba(0,0,0,.45)]">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-lime-400/10 text-lime-300">
                <Factory size={34} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.36em] text-lime-300">MonPlant</p>
                <h1 className="text-5xl font-black tracking-tight">Gestão à Vista da Planta</h1>
                <span className="mt-1 inline-flex items-center gap-2 text-3xl font-black text-lime-300"><CheckCircle2 size={22} /> Planta operando</span>
              </div>
            </div>

            <div className="hidden items-center gap-3 xl:flex">
              <span className="flex items-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-3xl">
                <CalendarDays size={18} /> 21/04/2026
              </span>
              <span className="flex items-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-3xl">
                <Clock3 size={18} /> 10:42
              </span>
              <div className="rounded-xl border border-lime-400/40 bg-lime-400/10 px-5 py-2 text-center">
                <p className="text-xs uppercase text-zinc-300">Turno</p>
                <strong className="text-5xl text-lime-300">B</strong>
              </div>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard title="Produção do dia" value={formatTon(1250)} suffix="Ton" subtitle="Meta: 1.150 Ton" trend={8.7} icon={<TrendingUp size={24} />} />
          <MetricCard title="Desvio" value="+100" suffix="Ton" subtitle="Acima da meta" trend={8.7} icon={<Zap size={24} />} />
          <MetricCard title="Aderência à meta" value="108,7%" subtitle="Meta diária consolidada" trend={8.7} icon={<Activity size={24} />} />
          <MetricCard title="Toneladas por hora" value="125,4" suffix="Ton/h" subtitle="Média da hora atual" trend={10.2} icon={<Gauge size={24} />} />
          <MetricCard title="Projeção do dia" value={formatTon(1380)} suffix="Ton" subtitle="Projeção final" trend={12.7} icon={<ArrowUpRight size={24} />} />
          <MetricCard title="Score operacional" value="87" suffix="/100" subtitle="Muito bom" trend={4.1} icon={<ShieldCheck size={24} />} />
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
          <Panel
            title="Produção ao longo do dia (Ton/h)"
            right={
              <button onClick={() => setMode(mode === "hoje" ? "periodo" : "hoje")} className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-2xl text-zinc-100 hover:border-lime-400/40 hover:text-lime-300">
                {mode === "hoje" ? "Hoje" : "Período"} <ChevronDown size={16} />
              </button>
            }
          >
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={productionByHour} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
                  <XAxis dataKey="hour" stroke="#9ca3af" tickLine={false} axisLine={false} />
                  <YAxis stroke="#9ca3af" tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "#050b0f", border: "1px solid rgba(132,204,22,.45)", borderRadius: 14, color: "#fff" }} />
                  <Line type="monotone" dataKey="meta" stroke="rgba(255,255,255,.7)" strokeDasharray="6 6" dot={false} />
                  <Line type="monotone" dataKey="realizado" stroke="#84cc16" strokeWidth={4} dot={{ r: 4 }} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Produção por letra">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {letters.map((item) => (
                <LetterCard key={item.letter} item={item} />
              ))}
            </div>
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.9fr_0.9fr]">
          <Panel title="Performance dos equipamentos">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-white/15 text-left uppercase tracking-wide text-zinc-400">
                    <th className="pb-3">Equipamento</th>
                    <th className="pb-3">Produção (Ton)</th>
                    <th className="pb-3">Disponibilidade (DF)</th>
                    <th className="pb-3">Utilização (UF)</th>
                    <th className="pb-3">Rendimento (RO)</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {equipmentRows.map((row) => (
                    <tr key={row.equipment} className="border-b border-white/10">
                      <td className="py-3">
                        <span className="flex items-center gap-2 font-semibold"><span className="text-amber-300">{row.icon}</span>{row.equipment}</span>
                      </td>
                      <td className="py-3 text-zinc-100">{row.production == null ? "--" : row.production}</td>
                      <td className="py-3"><ProgressBar value={row.availability} /></td>
                      <td className="py-3"><ProgressBar value={row.utilization} /></td>
                      <td className="py-3"><ProgressBar value={row.yieldPct} /></td>
                      <td className="py-3 font-black">
                        {row.status === "operando" ? <span className="text-lime-300">● Operando</span> : <span className="text-amber-300">● Atenção</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            title="Ranking de supervisores"
            right={<button className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-1 text-sm text-zinc-200">Hoje <ChevronDown size={14} /></button>}
          >
            <div className="space-y-3">
              {supervisorRanking.map((item, index) => {
                const positive = item.trend >= 0;
                return (
                  <div key={item.name} className="grid grid-cols-[34px_1fr_auto_auto] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-black ${index === 0 ? "bg-amber-400 text-black" : "bg-white/10 text-white"}`}>{index + 1}</span>
                    <span className="truncate text-lg font-semibold text-zinc-100">{item.name}</span>
                    <strong className="text-2xl">{item.performance.toFixed(1).replace(".", ",")}%</strong>
                    <span className={`flex items-center gap-1 text-2xl font-black ${positive ? "text-lime-300" : "text-red-400"}`}>
                      {positive ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                      {Math.abs(item.trend).toFixed(1).replace(".", ",")}%
                    </span>
                  </div>
                );
              })}
            </div>
            <button className="mt-4 w-full text-center text-2xl font-black text-lime-300">Ver todos</button>
          </Panel>

          <Panel title="Alertas operacionais">
            <div className="space-y-3">
              {alerts.map((alert) => {
                const cls = alert.level === "critical"
                  ? "border-red-500/50 bg-red-500/10 text-red-300"
                  : alert.level === "warning"
                    ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
                    : "border-sky-400/50 bg-sky-400/10 text-sky-300";

                return (
                  <div key={alert.title} className={`rounded-xl border p-4 ${cls}`}>
                    <div className="flex items-center justify-between gap-3">
                      <strong className="uppercase text-xl">{alert.title}</strong>
                      <span className="flex items-center gap-1 text-sm text-zinc-200"><Clock3 size={15} /> {alert.time}</span>
                    </div>
                    <p className="mt-1 text-2xl text-zinc-100">{alert.subtitle}</p>
                  </div>
                );
              })}
            </div>
            <button className="mt-4 w-full rounded-xl border border-lime-400/30 py-2 text-2xl font-black text-lime-300 hover:bg-lime-400/10">Ver todos os alertas</button>
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <GaugeCard title="Eficiência operacional" value={82.4} subtitle="Bom" />
          <GaugeCard title="Média Ton/H (dia)" value={89.6} subtitle="Meta: 110 Ton/h" />
          <GaugeCard title="Disponibilidade geral" value={91.2} subtitle="Meta: 90%" />
          <GaugeCard title="Utilização geral" value={86.3} subtitle="Meta: 85%" />
          <GaugeCard title="Rendimento geral" value={95.4} subtitle="Meta: 95%" />

          <section className="rounded-2xl border border-white/15 bg-gradient-to-b from-[#071621] to-[#041019] p-5 text-center">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-black uppercase text-zinc-300">Última atualização</p>
              <RefreshCw size={18} className="text-lime-300" />
            </div>
            <strong className="text-6xl font-black">10:42:30</strong>
            <p className="mt-2 text-2xl text-zinc-300">21/04/2026</p>
            <div className="my-4 h-px bg-white/10" />
            <p className="text-5xl font-black text-lime-300">{formatTon(totalRealized)} Mil</p>
            <p className="text-sm text-zinc-400">Meta consolidada: {formatTon(totalTarget)} Mil</p>
            <div className="mt-4 flex items-center justify-center gap-2 text-zinc-200">
              <CloudSun size={22} className="text-amber-300" />
              <span className="text-3xl">28°C</span>
              <span className="text-sm">Parcialmente nublado</span>
            </div>
          </section>
        </section>

        <footer className="rounded-2xl border border-white/10 bg-[#020c14]/90 py-3 text-center text-xl font-black tracking-[0.2em] text-lime-300">
          <span className="inline-flex items-center gap-2"><HardHat size={20} /> MONPLANT</span>
        </footer>
      </div>
    </main>
  );
}
