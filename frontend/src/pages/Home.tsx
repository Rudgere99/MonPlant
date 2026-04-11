import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

const BG_IMAGE = "/assets/home-mina-bg.jpg";
const LOGO_TRINDADE = "/assets/logo-trindade.png";

export default function Home() {
  const nav = useNavigate();
  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070a] text-white">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url('${BG_IMAGE}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(3,6,10,.72) 0%, rgba(5,7,10,.58) 22%, rgba(5,7,10,.72) 55%, rgba(5,7,10,.90) 100%)",
        }}
      />

      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(900px 360px at 20% 0%, rgba(245,158,11,.16), transparent 60%), radial-gradient(800px 300px at 100% 0%, rgba(255,255,255,.10), transparent 55%)",
        }}
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="border-b border-white/10 bg-black/35 backdrop-blur-md">
          <div className="mp-container flex items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/8 p-2">
                <img
                  src={LOGO_TRINDADE}
                  alt="Logo Trindade"
                  className="max-h-full max-w-full object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    const next = e.currentTarget.nextElementSibling as HTMLSpanElement | null;
                    if (next) next.style.display = "flex";
                  }}
                />
                <span
                  style={{ display: "none" }}
                  className="h-full w-full items-center justify-center text-xs font-black tracking-[0.18em] text-white/92"
                >
                  TRD
                </span>
              </div>

              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-white/60">
                  Trindade • Plataforma Operacional
                </div>
                <div className="mt-1 text-2xl font-black leading-none tracking-[0.02em]">
                  MonPlant
                </div>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-2 text-xs font-bold text-white/72">
              <span className="mp-chip">Produção</span>
              <span className="mp-chip">Paradas</span>
              <span className="mp-chip">Ritmo</span>
              <span className="mp-chip">UF/DF</span>
            </div>
          </div>
        </header>

        <main className="mp-container relative flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <section className="grid gap-6 lg:grid-cols-[1.15fr_440px] xl:grid-cols-[1.2fr_460px] items-stretch">
            <div className="flex flex-col justify-between rounded-[30px] border border-white/10 bg-black/24 p-6 backdrop-blur-md shadow-[0_24px_80px_rgba(0,0,0,.35)] sm:p-8">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-white/78">
                  Home MonPlant
                </div>

                <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.02] text-white sm:text-5xl xl:text-6xl">
                  Controle operacional da planta com uma entrada mais forte, visual e profissional.
                </h1>

                <p className="mt-5 max-w-2xl text-sm leading-7 text-white/74 sm:text-[15px]">
                  A página inicial agora pode trabalhar com a identidade do campo logo na abertura do sistema,
                  mantendo a leitura executiva do MonPlant e preservando os acessos principais da operação.
                </p>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <QuickInfo value="Tempo real" label="Leitura operacional" />
                <QuickInfo value="Dashboard" label="Visão executiva" />
                <QuickInfo value="Ritmo" label="Acompanhamento do dia" />
                <QuickInfo value="UF/DF" label="Governança do turno" />
              </div>
            </div>

            <div className="rounded-[30px] border border-white/12 bg-black/42 p-5 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,.40)] sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.22em] text-white/55">
                    Acesso ao sistema
                  </div>
                  <div className="mt-1 text-2xl font-black text-white">Login MonPlant</div>
                </div>
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs font-black text-amber-200">
                  Trindade
                </div>
              </div>

              <div className="mp-card" style={{ borderRadius: 24, background: "rgba(255,255,255,.04)" }}>
                <div className="mp-card-b" style={{ padding: 18 }}>
                  <div style={{ display: "grid", gap: 16 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div
                          style={{
                            height: 46,
                            width: 46,
                            borderRadius: 16,
                            border: "1px solid rgba(245,158,11,.25)",
                            background: "rgba(245,158,11,.12)",
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 900,
                            color: "rgba(253,224,71,.95)",
                          }}
                        >
                          MP
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 900,
                              letterSpacing: 0.6,
                              color: "rgba(255,255,255,.55)",
                            }}
                          >
                            MonPlant • Gestão Operacional
                          </div>
                          <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4, lineHeight: 1.15 }}>
                            Mantenha o card de login e os acessos principais.
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ color: "rgba(255,255,255,.72)", fontSize: 13, lineHeight: 1.7 }}>
                      A estrutura abaixo preserva o bloco principal da Home, mas agora com a imagem da operação ocupando o
                      fundo da página e com uma barra superior dedicada para a identidade da Trindade.
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button className="mp-btn mp-btn-primary" onClick={() => nav("/dashboard")}>
                        Abrir Dashboard
                      </button>
                      <button className="mp-btn" onClick={() => nav("/bucketvision")}>
                        Abrir BucketVision
                      </button>
                      <button className="mp-btn" onClick={() => nav("/update-notes")}>
                        Gerar Nota de Atualização
                      </button>
                    </div>

                    <div className="mp-help">
                      Para ficar 100% pronto no projeto, coloque a foto enviada em <b>public/assets/home-mina-bg.jpg</b>
                      e o logo em <b>public/assets/logo-trindade.png</b>.
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MiniCard title="Produção" desc="Acompanhe indicadores do dia e acumulados por planta." />
                <MiniCard title="Paradas" desc="Registre causas, períodos e impactos operacionais." />
                <MiniCard title="Ritmo" desc="Compare realizado, necessário e projeções do turno." />
                <MiniCard title="UF/DF" desc="Visualize horas por estado e cadeia de equipamentos." />
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-3">
            <Feature title="Visual institucional" badge="Home" desc="Imagem operacional em tela cheia, reforçando a identidade da operação desde o primeiro acesso." />
            <Feature title="Barra superior" badge="Branding" desc="Topo dedicado ao logo da Trindade, mantendo a aplicação mais limpa e mais próxima de um sistema corporativo." />
            <Feature title="Card preservado" badge="Acesso" desc="O bloco principal continua disponível para login, navegação inicial e demais funções já existentes." />
          </section>
        </main>

        <footer className="relative z-10 border-t border-white/10 bg-black/30 backdrop-blur-md">
          <div className="mp-container px-4 py-4 text-center text-xs text-white/50 sm:px-6 lg:px-8">
            © {year} MonPlant • Trindade • Operação em tempo real
          </div>
        </footer>
      </div>
    </div>
  );
}

function QuickInfo({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4 backdrop-blur-sm">
      <div className="text-xl font-black text-white">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/55">{label}</div>
    </div>
  );
}

function MiniCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
      <div className="text-sm font-black text-white">{title}</div>
      <div className="mt-1 text-xs leading-6 text-white/62">{desc}</div>
    </div>
  );
}

function Feature({ title, desc, badge }: { title: string; desc: string; badge: string }) {
  return (
    <div className="mp-card" style={{ background: "rgba(0,0,0,.32)", backdropFilter: "blur(10px)" }}>
      <div className="mp-card-h">
        <div style={{ fontSize: 16, fontWeight: 900 }}>{title}</div>
        <span className="mp-chip">{badge}</span>
      </div>
      <div className="mp-card-b" style={{ paddingTop: 12 }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.72)", lineHeight: 1.65 }}>{desc}</div>
      </div>
    </div>
  );
}
