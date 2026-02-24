import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const nav = useNavigate();
  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Glows de fundo (estética MonPlant) */}
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
        {/* HERO */}
        <section className="mp-card" style={{ borderRadius: 28, overflow: "hidden" }}>
          {/* Banner (public/assets/monplant-banner.png) */}
          <div style={{ position: "relative", height: 280 }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(900px 360px at 50% 20%, rgba(255,255,255,.10), transparent 55%), linear-gradient(to bottom, rgba(255,255,255,.06), transparent, #0b0f14)",
              }}
            />
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

            {/* Overlay escuro + gloss */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,.15), rgba(0,0,0,.55)), radial-gradient(700px 240px at 20% 10%, rgba(52,211,153,.22), transparent 60%)",
              }}
            />

            {/* Título em cima do banner */}
            <div
              style={{
                position: "absolute",
                left: 18,
                right: 18,
                bottom: 16,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.7, color: "rgba(255,255,255,.70)" }}>
                  MonPlant • Operação em tempo real
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6, lineHeight: 1.15 }}>
                  Visão executiva da planta
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="mp-chip">Produção</span>
                <span className="mp-chip">Paradas</span>
                <span className="mp-chip">Ritmo</span>
                <span className="mp-chip">UF/DF</span>
              </div>
            </div>
          </div>

          <div style={{ padding: 18 }}>
            <div className="mp-card" style={{ borderRadius: 22, background: "rgba(0,0,0,.18)" }}>
              <div className="mp-card-b" style={{ padding: 18 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 14,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          height: 44,
                          width: 44,
                          borderRadius: 16,
                          border: "1px solid rgba(52,211,153,.25)",
                          background: "rgba(52,211,153,.10)",
                          display: "grid",
                          placeItems: "center",
                          fontWeight: 900,
                          color: "rgba(167,243,208,.95)",
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
                        <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 0.2, marginTop: 6 }}>
                          Produção, paradas e ritmo{" "}
                          <span style={{ color: "rgba(167,243,208,.95)" }}>em tempo real</span>.
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button className="mp-btn mp-btn-primary" onClick={() => nav("/dashboard")}
                        >
                        Abrir Dashboard
                      </button>
                      <button className="mp-btn" onClick={() => nav("/producao-planta")}
                        >
                        Produção da Planta
                      </button>
                      <button className="mp-btn" onClick={() => nav("/ritmo")}
                        >
                        Ritmo do Dia
                      </button>
                    </div>
                  </div>

                  <div style={{ color: "rgba(255,255,255,.70)", fontSize: 13, lineHeight: 1.6 }}>
                    O <b style={{ color: "rgba(255,255,255,.90)" }}>MonPlant</b> centraliza a operação da planta:
                    produção por hora, ritmo necessário, paradas por período/causa, horímetros e visão executiva.
                    <br />
                    Com o <b style={{ color: "rgba(253,186,116,.95)" }}>BucketVision</b>, a IA conta conchadas em RTSP e
                    pode <b>gerar a produção automaticamente</b> no MonPlant <b>em tempo real</b>.
                  </div>

                  <div className="mp-help">
                    Dica: coloque prints das telas abaixo (Dashboard, Ritmo, UF/DF) para deixar essa página ainda mais
                    profissional.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Plataforma */}
        <section style={{ marginTop: 22 }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.6, color: "rgba(255,255,255,.55)" }}>
                PLATAFORMA
              </div>
              <div className="mp-page-title" style={{ marginTop: 6 }}>
                O que o MonPlant entrega
              </div>
              <div className="mp-page-sub" style={{ maxWidth: 860 }}>
                Tudo que a operação precisa para controle do turno e acompanhamento gerencial — com leitura rápida e registro
                padronizado.
              </div>
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
            <Feature title="Ritmo do Dia" badge="Ritmo" desc="Necessário vs média real, projeção e alertas visuais no padrão MonPlant." />
            <Feature title="Paradas e causas" badge="Paradas" desc="Registro por período, tipificação e descrições para atacar gargalos e perdas." />
            <Feature title="Produção por hora" badge="Ton/H" desc="Tabela por período com observações e exportação para governança do turno." />
            <Feature title="UF e DF" badge="UF/DF" desc="Horas horizonte, operando e parada, com visão por cadeia de equipamentos." />
            <Feature title="Permissões por perfil" badge="Acesso" desc="Apontador, supervisor, controlador e gerência com menus/páginas corretas." />
          </div>

          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            <ImageSlot label="Imagem 01 • Dashboard" hint="Print do Dashboard (KPI + gráfico)." />
            <ImageSlot label="Imagem 02 • Ritmo do Dia" hint="Print do Ritmo (meta, necessário, projeção)." />
            <ImageSlot label="Imagem 03 • UF/DF ou Paradas" hint="Print UF/DF ou Paradas." />
          </div>
        </section>

        {/* BucketVision */}
        <section className="mp-card" style={{ marginTop: 18, borderRadius: 28 }}>
          <div className="mp-card-b" style={{ padding: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.6, color: "rgba(255,255,255,.55)" }}>
                  IA NA PRODUÇÃO
                </div>
                <div style={{ marginTop: 6, fontSize: 26, fontWeight: 900 }}>
                  BucketVision <span style={{ color: "rgba(253,186,116,.95)" }}>integrado</span> ao MonPlant
                </div>
                <div style={{ marginTop: 8, fontSize: 13, color: "rgba(255,255,255,.70)", lineHeight: 1.6 }}>
                  O BucketVision conta conchadas via IA em vídeo/RTSP com ROI precisa e estabilidade operacional. A produção
                  estimada é gerada automaticamente em tempo real: <b>conchadas × média (t) → Ton/H</b>. Isso reduz atraso,
                  retrabalho e melhora a consistência do dado.
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 12,
                }}
              >
                <Step n="01" title="Captura RTSP" desc="Conexão estável com reconexão e buffer otimizado." />
                <Step n="02" title="Detecção + ROI" desc="IA detecta conchadas só na área útil, reduzindo falsos positivos." />
                <Step n="03" title="Produção em tempo real" desc="Atualiza Ton/H e acumulados automaticamente, sem digitação." />
                <Step n="04" title="Pronto para gestão" desc="Relatórios e telas do MonPlant sempre consistentes com o que está no campo." />
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="mp-btn" onClick={() => nav("/bucketvision")}>
                  Abrir BucketVision
                </button>
                <button className="mp-btn" onClick={() => nav("/update-notes")}>
                  Gerar Nota de Atualização
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 12,
                }}
              >
                <ImageSlot label="Imagem • Câmera/RTSP" hint="Frame do vídeo ou foto da câmera." tall />
                <ImageSlot label="Imagem • ROI / HUD" hint="Print do ROI + contagem + HUD." tall />
              </div>
            </div>
          </div>
        </section>

        <footer style={{ marginTop: 18, paddingBottom: 18, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.45)" }}>
          © {year} MonPlant • Operação em tempo real • BucketVision integrado
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

function ImageSlot({ label, hint, tall }: { label: string; hint: string; tall?: boolean }) {
  return (
    <div className="mp-card" style={{ overflow: "hidden", minHeight: tall ? 220 : 160 }}>
      <div
        style={{
          height: "100%",
          position: "relative",
          background:
            "radial-gradient(520px 220px at 15% 20%, rgba(255,255,255,.08), transparent 55%), linear-gradient(to bottom right, rgba(52,211,153,.10), transparent, rgba(251,146,60,.10))",
        }}
      >
        <div style={{ position: "absolute", inset: 0, padding: 14, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,.70)" }}>{label}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)" }}>{hint}</div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="mp-card" style={{ background: "rgba(0,0,0,.20)" }}>
      <div className="mp-card-b" style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              height: 38,
              width: 38,
              borderRadius: 16,
              border: "1px solid rgba(251,146,60,.25)",
              background: "rgba(251,146,60,.10)",
              display: "grid",
              placeItems: "center",
              fontWeight: 900,
              color: "rgba(253,186,116,.95)",
            }}
          >
            {n}
          </div>
          <div style={{ fontWeight: 900 }}>{title}</div>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: "rgba(255,255,255,.70)", lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
  );
}
