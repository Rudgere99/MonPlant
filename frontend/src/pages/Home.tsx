import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const nav = useNavigate();
  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div
          className="absolute -top-48 -left-48 h-[620px] w-[620px] rounded-full"
          style={{ background: "rgba(52,211,153,.10)", filter: "blur(150px)" }}
        />
        <div
          className="absolute top-[-140px] right-[-140px] h-[660px] w-[660px] rounded-full"
          style={{ background: "rgba(56,189,248,.08)", filter: "blur(160px)" }}
        />
        <div
          className="absolute -bottom-56 left-1/3 h-[760px] w-[760px] rounded-full"
          style={{ background: "rgba(251,146,60,.08)", filter: "blur(170px)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            opacity: 0.05,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
      </div>

      <div className="mp-container relative px-4 sm:px-6 lg:px-8 py-10">
        <section className="mp-card" style={{ borderRadius: 30, overflow: "hidden" }}>
          <div style={{ position: "relative", minHeight: 560 }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                opacity: 0.92,
                backgroundImage: "url('/assets/monplant-banner.png')",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />

            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(90deg, rgba(5,8,12,.90) 0%, rgba(5,8,12,.68) 34%, rgba(5,8,12,.58) 58%, rgba(5,8,12,.82) 100%), linear-gradient(180deg, rgba(0,0,0,.12), rgba(0,0,0,.58))",
              }}
            />

            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(700px 280px at 18% 15%, rgba(52,211,153,.18), transparent 60%), radial-gradient(500px 220px at 82% 18%, rgba(255,255,255,.08), transparent 50%)",
              }}
            />

            <div
              style={{
                position: "relative",
                zIndex: 2,
                minHeight: 560,
                padding: "32px 28px",
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.2fr) minmax(340px, 420px)",
                gap: 24,
                alignItems: "end",
              }}
            >
              <div style={{ alignSelf: "center", maxWidth: 860 }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    minHeight: 34,
                    padding: "0 14px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,.10)",
                    background: "rgba(255,255,255,.06)",
                    color: "rgba(255,255,255,.78)",
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: 1.1,
                    textTransform: "uppercase",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  Trindade • MonPlant • Plataforma operacional
                </div>

                <div
                  style={{
                    marginTop: 20,
                    fontSize: "clamp(44px, 6vw, 82px)",
                    lineHeight: 0.94,
                    fontWeight: 950,
                    letterSpacing: -2.2,
                    maxWidth: 900,
                    textShadow: "0 18px 36px rgba(0,0,0,.28)",
                  }}
                >
                  A operação da planta,
                  <br />
                  em um só lugar.
                </div>

                <div
                  style={{
                    marginTop: 18,
                    maxWidth: 760,
                    fontSize: 17,
                    lineHeight: 1.75,
                    color: "rgba(255,255,255,.80)",
                  }}
                >
                  O MonPlant nasceu para transformar a rotina operacional em leitura clara, resposta rápida e
                  decisão bem fundamentada. Cada tonelada, cada parada, cada ritmo, cada observação do turno
                  passa a existir dentro de um padrão único — confiável, executivo e vivo.
                </div>

                <div
                  style={{
                    marginTop: 12,
                    maxWidth: 780,
                    fontSize: 15,
                    lineHeight: 1.8,
                    color: "rgba(255,255,255,.66)",
                  }}
                >
                  Mais do que telas, o MonPlant é um manifesto de disciplina operacional: registrar melhor,
                  enxergar antes, agir com precisão e conduzir a planta com inteligência.
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
                  <span className="mp-chip">Produção</span>
                  <span className="mp-chip">Paradas</span>
                  <span className="mp-chip">Horímetros</span>
                  <span className="mp-chip">Ritmo</span>
                  <span className="mp-chip">UF / DF</span>
                  <span className="mp-chip">Gestão do turno</span>
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
                  <button className="mp-btn mp-btn-primary" onClick={() => nav("/dashboard")}>
                    Entrar no Dashboard
                  </button>
                  <button className="mp-btn" onClick={() => nav("/login")}>
                    Acessar sistema
                  </button>
                </div>
              </div>

              <div
                className="mp-card"
                style={{
                  borderRadius: 26,
                  background: "linear-gradient(180deg, rgba(8,12,16,.82), rgba(8,12,16,.62))",
                  border: "1px solid rgba(255,255,255,.10)",
                  boxShadow: "0 28px 70px rgba(0,0,0,.34)",
                  backdropFilter: "blur(14px)",
                }}
              >
                <div className="mp-card-b" style={{ padding: 20, display: "grid", gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.8, color: "rgba(167,243,208,.92)" }}>
                      MANIFESTO OPERACIONAL
                    </div>
                    <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950, lineHeight: 1.08 }}>
                      Controle, contexto e clareza para a decisão.
                    </div>
                  </div>

                  <ManifestItem
                    title="Ler o turno com rapidez"
                    desc="Transformar dados operacionais em leitura imediata para supervisão, controle e gestão."
                  />
                  <ManifestItem
                    title="Padronizar o que importa"
                    desc="Registrar produção, causas, perdas e observações com consistência e rastreabilidade."
                  />
                  <ManifestItem
                    title="Antecipar desvios"
                    desc="Dar visibilidade ao ritmo, às paradas e aos gargalos antes que virem consequência."
                  />
                  <ManifestItem
                    title="Criar uma fonte única"
                    desc="Reunir a visão da planta em um ambiente confiável, executivo e pronto para agir."
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section style={{ marginTop: 22 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.7, color: "rgba(255,255,255,.55)" }}>
              PLATAFORMA
            </div>
            <div className="mp-page-title" style={{ marginTop: 6 }}>
              O que o MonPlant entrega para a operação
            </div>
            <div className="mp-page-sub" style={{ maxWidth: 920 }}>
              Um ecossistema de acompanhamento operacional pensado para quem precisa enxergar a planta com profundidade
              e velocidade, sem perder o padrão visual, a disciplina do dado e a governança do turno.
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            <Feature title="Dashboard executivo" badge="KPI" desc="Meta, produzido, projeção, ritmo acumulado e status do dia para decisão rápida." />
            <Feature title="Ritmo do dia" badge="Ritmo" desc="Necessário vs. realizado com leitura clara para conduzir o turno com precisão." />
            <Feature title="Paradas e causas" badge="Paradas" desc="Registro estruturado para entender perdas, gargalos e oportunidades operacionais." />
            <Feature title="Produção por hora" badge="Ton/H" desc="Histórico por período com observações, contexto e governança operacional." />
            <Feature title="UF / DF" badge="Indicadores" desc="Visão da disponibilidade e da utilização para enxergar a cadeia produtiva." />
            <Feature title="Perfis e permissões" badge="Acesso" desc="Experiência organizada por função, com telas e ações coerentes para cada perfil." />
          </div>
        </section>

        <section className="mp-card" style={{ marginTop: 18, borderRadius: 28 }}>
          <div className="mp-card-b" style={{ padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 18 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.7, color: "rgba(255,255,255,.55)" }}>
                  POSICIONAMENTO
                </div>
                <div style={{ marginTop: 8, fontSize: 30, fontWeight: 950, lineHeight: 1.1 }}>
                  MonPlant é presença de gestão dentro da rotina operacional.
                </div>
                <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.8, color: "rgba(255,255,255,.72)" }}>
                  A plataforma aproxima campo, supervisão e gestão. Ela organiza o que acontece no turno, dá forma ao
                  que antes estava disperso e transforma informação operacional em linguagem de decisão.
                </div>
                <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.8, color: "rgba(255,255,255,.72)" }}>
                  No MonPlant, o dado não é apenas registrado. Ele ganha contexto, prioridade e direção.
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  alignContent: "start",
                }}
              >
                <MetricCard value="01" label="Fonte única" desc="Todos os principais sinais do turno em um mesmo ambiente." />
                <MetricCard value="02" label="Leitura rápida" desc="Visual pensado para entendimento imediato." />
                <MetricCard value="03" label="Ação precisa" desc="Dados organizados para orientar a resposta operacional." />
                <MetricCard value="04" label="Padrão MonPlant" desc="Identidade visual e operacional consistente." />
              </div>
            </div>
          </div>
        </section>

        <footer style={{ marginTop: 18, paddingBottom: 18, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.45)" }}>
          © {year} MonPlant • Plataforma operacional da Trindade
        </footer>
      </div>
    </div>
  );
}

function Feature({ title, desc, badge }: { title: string; desc: string; badge: string }) {
  return (
    <div className="mp-card">
      <div className="mp-card-h">
        <div style={{ fontSize: 16, fontWeight: 900 }}>{title}</div>
        <span className="mp-chip">{badge}</span>
      </div>
      <div className="mp-card-b" style={{ paddingTop: 12 }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.70)", lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
  );
}

function ManifestItem({ title, desc }: { title: string; desc: string }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,.08)",
        background: "rgba(255,255,255,.04)",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 900, color: "rgba(255,255,255,.94)" }}>{title}</div>
      <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,.66)" }}>{desc}</div>
    </div>
  );
}

function MetricCard({ value, label, desc }: { value: string; label: string; desc: string }) {
  return (
    <div className="mp-card" style={{ background: "rgba(0,0,0,.18)" }}>
      <div className="mp-card-b" style={{ padding: 14 }}>
        <div style={{ fontSize: 28, fontWeight: 950, color: "rgba(167,243,208,.95)" }}>{value}</div>
        <div style={{ marginTop: 6, fontSize: 15, fontWeight: 900 }}>{label}</div>
        <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: "rgba(255,255,255,.66)" }}>{desc}</div>
      </div>
    </div>
  );
}
