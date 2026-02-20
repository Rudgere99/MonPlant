import React from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  Factory,
  Timer,
  Gauge,
  ShieldCheck,
  Database,
  Bell,
  ArrowRight,
} from "lucide-react";

/**
 * Home (pública)
 * - Mantém um layout "landing" dark/clean
 * - Não depende de componentes externos (evita erros de build TS2307)
 * - Botões levam para /login (acesso ao sistema)
 */

function Container({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">{children}</div>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
      {children}
    </span>
  );
}

function Card({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl border border-white/10 bg-white/5 p-2">
          {icon}
        </div>
        <div>
          <div className="text-base font-extrabold text-white/90">{title}</div>
          <div className="mt-1 text-sm leading-relaxed text-white/70">{desc}</div>
        </div>
      </div>
    </div>
  );
}

function WaveDivider() {
  return (
    <div className="-mt-1">
      <svg viewBox="0 0 1440 120" className="h-[88px] w-full" preserveAspectRatio="none">
        <path
          d="M0,32L80,37.3C160,43,320,53,480,53.3C640,53,800,43,960,37.3C1120,32,1280,32,1360,32L1440,32L1440,120L1360,120C1280,120,1120,120,960,120C800,120,640,120,480,120C320,120,160,120,80,120L0,120Z"
          fill="rgba(255,255,255,0.05)"
        />
      </svg>
    </div>
  );
}

export default function Home() {
  const nav = useNavigate();

  return (
    <main className="min-h-screen bg-[#070A12] text-white">
      {/* BACKDROP */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(800px_circle_at_20%_10%,rgba(34,197,94,0.16),transparent_55%),radial-gradient(900px_circle_at_80%_10%,rgba(56,189,248,0.10),transparent_55%),radial-gradient(800px_circle_at_60%_80%,rgba(168,85,247,0.10),transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(7,10,18,0.65),rgba(7,10,18,1))]" />
      </div>

      {/* TOPBAR */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#070A12]/70 backdrop-blur">
        <Container>
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/5">
                <Factory className="h-5 w-5 text-white/80" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-black tracking-wide text-white/90">MONPLANT</div>
                <div className="text-xs font-semibold text-white/60">
                  Operação em tempo real • Planta & CCO
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById("features");
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="hidden rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-extrabold text-white/80 hover:bg-white/10 sm:inline-flex"
              >
                Recursos
              </button>

              <button
                type="button"
                onClick={() => nav("/login")}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-extrabold text-white hover:bg-white/15"
              >
                Entrar <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </Container>
      </header>

      {/* HERO */}
      <section className="pt-10 sm:pt-14">
        <Container>
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="flex flex-wrap gap-2">
                <Pill>
                  <Gauge className="h-3.5 w-3.5" /> Produção • Meta • Ritmo
                </Pill>
                <Pill>
                  <Timer className="h-3.5 w-3.5" /> Paradas por hora
                </Pill>
                <Pill>
                  <Bell className="h-3.5 w-3.5" /> Avisos do supervisor
                </Pill>
              </div>

              <h1 className="mt-4 text-3xl font-black leading-tight text-white/95 sm:text-5xl">
                Visão clara da planta, do turno e das paradas — em um só lugar.
              </h1>

              <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
                O MonPlant centraliza produção horária, paradas, horímetros, metas e avisos operacionais
                para reduzir retrabalho e melhorar a comunicação entre CCO, supervisão e operação.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => nav("/login")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/15 px-5 py-3 text-sm font-extrabold text-white hover:bg-white/20"
                >
                  Acessar o sistema <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById("sobre");
                    el?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-extrabold text-white/80 hover:bg-white/10"
                >
                  Ver como funciona
                </button>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:max-w-md">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-extrabold text-white/60">Atualização</div>
                  <div className="mt-1 text-lg font-black text-white/90">Tempo real</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-extrabold text-white/60">Foco</div>
                  <div className="mt-1 text-lg font-black text-white/90">Turno 7×7</div>
                </div>
              </div>
            </div>

            {/* MOCK / VISUAL */}
            <div className="relative">
              <div className="absolute -inset-6 rounded-[28px] bg-white/5 blur-2xl" />
              <div className="relative rounded-[28px] border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-black tracking-wide text-white/80">DASHBOARD</div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs font-extrabold text-white/70">
                    Hoje
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs font-extrabold text-white/60">Produção do dia</div>
                    <div className="mt-1 text-2xl font-black text-white/90">4.404 t</div>
                    <div className="mt-2 h-2 w-full rounded-full bg-white/10">
                      <div className="h-2 w-[54%] rounded-full bg-white/25" />
                    </div>
                    <div className="mt-2 text-xs font-semibold text-white/60">
                      54% da meta • ritmo calculado por hora
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs font-extrabold text-white/60">Paradas (últimas horas)</div>
                    <div className="mt-1 text-2xl font-black text-white/90">2h 15m</div>
                    <div className="mt-2 text-xs font-semibold text-white/60">
                      Linhas no gráfico indicam horas acumuladas
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                      <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-white/70">
                        BT-01
                        <div className="font-black text-white/85">55m</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-white/70">
                        PN-01
                        <div className="font-black text-white/85">40m</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-white/70">
                        EH-08
                        <div className="font-black text-white/85">25m</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-white/70">
                    <BarChart3 className="h-4 w-4" /> Produção horária (Ton/H)
                  </div>
                  <div className="mt-3 grid grid-cols-6 gap-2">
                    {["07", "08", "09", "10", "11", "12"].map((h, i) => (
                      <div key={h} className="flex flex-col items-center gap-2">
                        <div className="h-16 w-full rounded-xl bg-white/10">
                          <div
                            className="w-full rounded-xl bg-white/25"
                            style={{ height: `${30 + i * 8}%` }}
                          />
                        </div>
                        <div className="text-[10px] font-black text-white/50">{h}h</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <WaveDivider />

      {/* SOBRE */}
      <section id="sobre" className="py-12 sm:py-16">
        <Container>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-1">
              <h2 className="text-2xl font-black text-white/90 sm:text-3xl">MonPlant</h2>
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                Um painel operacional para apoiar decisões rápidas. Menos ruído, mais clareza.
              </p>
              <div className="mt-4 space-y-2 text-sm text-white/70">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Acesso por perfil (apontador, controlador, supervisor, etc.)
                </div>
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4" /> Dados centralizados e padronizados
                </div>
              </div>
            </div>

            <div className="md:col-span-2 grid gap-4 sm:grid-cols-2">
              <Card
                icon={<Gauge className="h-5 w-5 text-white/80" />}
                title="Ritmo & Necessário"
                desc="Meta do dia, produzido, tempo restante e ritmo necessário (t/h) no turno."
              />
              <Card
                icon={<Timer className="h-5 w-5 text-white/80" />}
                title="Paradas por hora"
                desc="Registro por equipamento/tipo e visualização rápida das horas acumuladas."
              />
              <Card
                icon={<BarChart3 className="h-5 w-5 text-white/80" />}
                title="Produção horária"
                desc="Ton/H do dia e comparativo de 7 dias (tendência) para leitura fácil."
              />
              <Card
                icon={<Bell className="h-5 w-5 text-white/80" />}
                title="Avisos operacionais"
                desc="Mensagens gerais do supervisor para reduzir erro de lançamento e ruído no rádio."
              />
            </div>
          </div>
        </Container>
      </section>

      {/* FEATURES */}
      <section id="features" className="pb-14 sm:pb-20">
        <Container>
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 sm:p-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-black tracking-wide text-white/60">MÓDULOS</div>
                <h3 className="mt-1 text-2xl font-black text-white/90">O que você encontra no MonPlant</h3>
              </div>
              <button
                type="button"
                onClick={() => nav("/login")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/15 px-5 py-3 text-sm font-extrabold text-white hover:bg-white/20"
              >
                Entrar agora <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card
                icon={<Gauge className="h-5 w-5 text-white/80" />}
                title="Dashboard"
                desc="Cards principais + gauge de meta + gráficos do dia e últimos 7 dias."
              />
              <Card
                icon={<Factory className="h-5 w-5 text-white/80" />}
                title="Produção da Planta"
                desc="Lançamentos por hora (Ton/H), edição horária e observações do dia."
              />
              <Card
                icon={<Timer className="h-5 w-5 text-white/80" />}
                title="Paradas"
                desc="Tipos/equipamentos, acumulados e visualização clara no período."
              />
              <Card
                icon={<Database className="h-5 w-5 text-white/80" />}
                title="Horímetros"
                desc="Registro de início/fim e cards com últimos horímetros por equipamento."
              />
              <Card
                icon={<Bell className="h-5 w-5 text-white/80" />}
                title="Avisos"
                desc="Supervisor publica mensagens gerais para toda a operação."
              />
              <Card
                icon={<BarChart3 className="h-5 w-5 text-white/80" />}
                title="Estatísticas"
                desc="KPIs e comparativos para apoiar análise do turno e da semana."
              />
            </div>
          </div>
        </Container>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 py-10">
        <Container>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-extrabold text-white/70">MonPlant</div>
            <div className="text-xs font-semibold text-white/50">
              © {new Date().getFullYear()} • Operação • CCO • Planta
            </div>
          </div>
        </Container>
      </footer>
    </main>
  );
}
