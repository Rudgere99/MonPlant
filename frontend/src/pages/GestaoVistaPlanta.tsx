import React, { useMemo, useState } from "react";
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
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
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

const alerts = [
  { title: "Pulmão cheio", subtitle: "Tempo excedido", time: "02:15", level: "critical" },
  { title: "Falta de material", subtitle: "Nível baixo - Britador 02", time: "00:48", level: "warning" },
  { title: "Problema de blend", subtitle: "Desvio na granulometria", time: "00:35", level: "info" },
];

const stockData = [
  { name: "Hematitinha", value: 82 },
  { name: "Itabirito", value: 68 },
  { name: "Canga", value: 54 },
  { name: "Produto", value: 91 },
];

function formatTon(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
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
  trend?: number;
  icon: React.ReactNode;
}) {
  const positive = (trend ?? 0) >= 0;

  return (
    <section className="rounded-2xl border border-white/10 bg-[#071216]/90 p-5 shadow-[0_0_30px_rgba(0,255,136,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">{title}</p>
          <div className="mt-3 flex items-end gap-2">
            <strong className="text-4xl font-black tracking-tight text-white">{value}</strong>
            {suffix && <span className="pb-1 text-lg text-zinc-200">{suffix}</span>}
          </div>
          <p className="mt-2 text-sm text-zinc-300">{subtitle}</p>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-emerald-300">{icon}</div>
          {typeof trend === "number" && (
            <div className={`flex items-center gap-1 text-sm font-black ${positive ? "text-emerald-300" : "text-red-400"}`}>
              {positive ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
              {positive ? "+" : ""}
              {trend.toFixed(1).replace(".", ",")}%
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 h-10">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={miniTrend}>
            <Area type="monotone" dataKey="value" stroke="currentColor" fill="currentColor" fillOpacity={0.18} className="text-emerald-400" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function GaugeCard({ title, value, subtitle }: { title: string; value: number; subtitle: string }) {
  const angle = Math.max(0, Math.min(180, (value / 100) * 180));
  return (
    <section className="rounded-2xl border border-white/10 bg-[#071216]/90 p-5">
      <p className="text-center text-sm font-black uppercase text-white">{title}</p>
      <div className="relative mx-auto mt-5 h-28 w-52 overflow-hidden">
        <div className="absolute inset-x-0 bottom-0 h-52 rounded-full border-[18px] border-zinc-800" />
        <div
          className="absolute inset-x-0 bottom-0 h-52 rounded-full border-[18px] border-emerald-400"
          style={{
            clipPath: "polygon(0 50%, 100% 50%, 100% 100%, 0 100%)",
            transform: `rotate(${angle - 180}deg)`,
          }}
        />
        <div className="absolute bottom-0 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.9)]" />
        <div className="absolute bottom-0 left-1/2 h-20 w-1 -translate-x-1/2 origin-bottom rounded-full bg-emerald-300" style={{ transform: `rotate(${angle - 90}deg)` }} />
      </div>
      <div className="text-center">
        <strong className="text-4xl font-black text-emerald-300">{value.toFixed(1).replace(".", ",")}%</strong>
        <p className="mt-2 text-sm text-zinc-300">{subtitle}</p>
      </div>
    </section>
  );
}

function LetterCard({ item }: { item: LetterData }) {
  const percent = Math.round((item.realized / item.target) * 100);
  const status =
    percent >= 95 ? "border-emerald-400/70 text-emerald-300" : percent >= 85 ? "border-yellow-400/70 text-yellow-300" : "border-red-400/70 text-red-400";

  return (
    <section className={`rounded-2xl border bg-[#061510] p-5 ${status}`}>
      <div className="flex items-start justify-between">
        <div>
          <strong className="text-5xl font-black">{item.letter}</strong>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-400">{item.supervisor}</p>
        </div>
        <div className="rounded-full bg-white/5 px-3 py-1 text-xs font-black text-zinc-200">Turno</div>
      </div>

      <div className="mt-5">
        <strong className="text-3xl font-black text-white">{formatTon(item.realized)}</strong>
        <span className="ml-2 text-zinc-300">Mil Ton</span>
        <p className="mt-2 text-sm text-zinc-300">Meta: {formatTon(item.target)} Mil</p>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <strong className="text-3xl font-black">{percent}%</strong>
        <span className={`flex items-center gap-1 text-sm font-black ${item.trend >= 0 ? "text-emerald-300" : "text-red-400"}`}>
          {item.trend >= 0 ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
          {Math.abs(item.trend).toFixed(1).replace(".", ",")}%
        </span>
      </div>
    </section>
  );
}

export default function GestaoVistaPlanta() {
  const [mode, setMode] = useState<"hoje" | "periodo">("hoje");

  const totalRealized = useMemo(() => letters.reduce((acc, item) => acc + item.realized, 0), []);
  const totalTarget = useMemo(() => letters.reduce((acc, item) => acc + item.target, 0), []);

  return (
    <main className="min-h-screen bg-[#03080b] p-4 text-white">
      <div className="mx-auto max-w-[1800px]">
        <header className="mb-4 flex items-center justify-between rounded-2xl border border-white/10 bg-[#071216] px-6 py-4 shadow-[0_0_40px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
              <Factory size={30} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-emerald-300">MonPlant</p>
              <h1 className="text-3xl font-black tracking-tight">Gestão à Vista da Planta</h1>
            </div>
          </div>

          <div className="hidden items-center gap-4 lg:flex">
            <span className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-black text-emerald-300">
              <CheckCircle2 size={18} /> Planta operando
            </span>
            <span className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm">
              <CalendarDays size={18} /> 21/04/2026
            </span>
            <span className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm">
              <Clock3 size={18} /> 10:42
            </span>
            <div className="rounded-xl border border-emerald-400/40 px-5 py-2 text-center">
              <p className="text-xs uppercase text-zinc-400">Turno</p>
              <strong className="text-2xl text-emerald-300">B</strong>
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

        <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
          <div className="rounded-2xl border border-white/10 bg-[#071216]/90 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black uppercase">Produção ao longo do dia (Ton/h)</h2>
              <button
                onClick={() => setMode(mode === "hoje" ? "periodo" : "hoje")}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm text-zinc-200 hover:border-emerald-400/40 hover:text-emerald-300"
              >
                {mode === "hoje" ? "Hoje" : "Período"}
              </button>
            </div>

            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={productionByHour} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
                  <XAxis dataKey="hour" stroke="#9ca3af" tickLine={false} axisLine={false} />
                  <YAxis stroke="#9ca3af" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#050b0f",
                      border: "1px solid rgba(52,211,153,.35)",
                      borderRadius: 14,
                      color: "#fff",
                    }}
                  />
                  <Line type="monotone" dataKey="meta" stroke="rgba(255,255,255,.7)" strokeDasharray="6 6" dot={false} />
                  <Line type="monotone" dataKey="realizado" stroke="#22c55e" strokeWidth={4} dot={{ r: 4 }} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#071216]/90 p-5">
            <h2 className="mb-4 text-lg font-black uppercase">Produção por letra</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {letters.map((item) => (
                <LetterCard key={item.letter} item={item} />
              ))}
            </div>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.9fr_0.9fr]">
          <div className="rounded-2xl border border-white/10 bg-[#071216]/90 p-5">
            <h2 className="mb-4 text-lg font-black uppercase">Pulmões e estoques da planta</h2>
            <div className="h-[270px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stockData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.10)" />
                  <XAxis dataKey="name" stroke="#9ca3af" tickLine={false} axisLine={false} />
                  <YAxis stroke="#9ca3af" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#050b0f",
                      border: "1px solid rgba(52,211,153,.35)",
                      borderRadius: 14,
                      color: "#fff",
                    }}
                  />
                  <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                    {stockData.map((entry, index) => (
                      <Cell key={entry.name} fill={index === 3 ? "#22c55e" : index === 2 ? "#eab308" : "#16a34a"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#071216]/90 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-black uppercase">
                <UsersRound size={20} /> Ranking de supervisores
              </h2>
              <span className="rounded-lg border border-white/10 px-3 py-1 text-xs text-zinc-300">Hoje</span>
            </div>

            <div className="space-y-3">
              {supervisorRanking.map((item, index) => {
                const positive = item.trend >= 0;
                return (
                  <div key={item.name} className="grid grid-cols-[34px_1fr_auto_auto] items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-black ${index === 0 ? "bg-yellow-400 text-black" : "bg-white/10 text-white"}`}>
                      {index + 1}
                    </span>
                    <span className="truncate text-sm font-semibold text-zinc-100">{item.name}</span>
                    <strong className="text-sm">{item.performance.toFixed(1).replace(".", ",")}%</strong>
                    <span className={`flex items-center gap-1 text-xs font-black ${positive ? "text-emerald-300" : "text-red-400"}`}>
                      {positive ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                      {Math.abs(item.trend).toFixed(1).replace(".", ",")}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#071216]/90 p-5">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-black uppercase">
              <AlertTriangle size={20} /> Alertas operacionais
            </h2>

            <div className="space-y-3">
              {alerts.map((alert) => {
                const cls =
                  alert.level === "critical"
                    ? "border-red-500/50 bg-red-500/10 text-red-300"
                    : alert.level === "warning"
                    ? "border-yellow-400/50 bg-yellow-400/10 text-yellow-300"
                    : "border-sky-400/50 bg-sky-400/10 text-sky-300";

                return (
                  <div key={alert.title} className={`rounded-xl border p-4 ${cls}`}>
                    <div className="flex items-center justify-between">
                      <strong className="uppercase">{alert.title}</strong>
                      <span className="flex items-center gap-1 text-sm text-zinc-200">
                        <Clock3 size={15} /> {alert.time}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-200">{alert.subtitle}</p>
                  </div>
                );
              })}
            </div>

            <button className="mt-4 w-full rounded-xl border border-emerald-400/20 py-2 text-sm font-black text-emerald-300 hover:bg-emerald-400/10">
              Ver todos os alertas
            </button>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <GaugeCard title="Eficiência operacional" value={82.4} subtitle="Status: Bom" />
          <GaugeCard title="Disponibilidade geral" value={91.2} subtitle="Meta: 90%" />
          <GaugeCard title="Utilização geral" value={86.3} subtitle="Meta: 85%" />
          <GaugeCard title="Rendimento geral" value={95.4} subtitle="Meta: 95%" />

          <section className="rounded-2xl border border-white/10 bg-[#071216]/90 p-5 text-center">
            <div className="mb-5 flex items-center justify-between">
              <p className="text-sm font-black uppercase text-zinc-300">Última atualização</p>
              <RefreshCw size={18} className="text-emerald-300" />
            </div>
            <strong className="text-4xl font-black">10:42:30</strong>
            <p className="mt-2 text-zinc-300">21/04/2026</p>
            <div className="my-5 h-px bg-white/10" />
            <p className="text-3xl font-black text-emerald-300">{formatTon(totalRealized)} Mil</p>
            <p className="text-sm text-zinc-400">Meta consolidada: {formatTon(totalTarget)} Mil</p>
          </section>
        </section>
      </div>
    </main>
  );
}
