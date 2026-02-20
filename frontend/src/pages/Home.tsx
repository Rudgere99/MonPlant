import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";

type LinkItem = { label: string; href: string };

export default function Home() {
  const nav = useNavigate();

  // ✅ TROQUE AS IMAGENS AQUI (pode usar /public/... ex: "/img/hero.jpg")
  const ASSETS = useMemo(
    () => ({
      hero: "/img/monplant/hero.jpg", // imagem grande do hero (direita)
      quemSomos: "/img/monplant/quem-somos.jpg",
      nossaGente: "/img/monplant/nossa-gente.jpg",
      mapa: "/img/monplant/mapa.jpg",
      galeria1: "/img/monplant/galeria-1.jpg",
      galeria2: "/img/monplant/galeria-2.jpg",
      galeria3: "/img/monplant/galeria-3.jpg",
      galeria4: "/img/monplant/galeria-4.jpg",
    }),
    []
  );

  const links: LinkItem[] = [
    { label: "Quem somos", href: "#quem-somos" },
    { label: "O que fazemos", href: "#o-que-fazemos" },
    { label: "Onde estamos", href: "#onde-estamos" },
    { label: "Nossa gente", href: "#nossa-gente" },
    { label: "Contato", href: "#contato" },
  ];

  function scrollToHash(hash: string) {
    const id = hash.replace("#", "");
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mpSite">
      {/* Top bar */}
      <header className="mpTop">
        <div className="mpTopInner">
          <div className="mpBrand" onClick={() => scrollToHash("#top")} role="button" tabIndex={0}>
            <div className="mpLogo" aria-hidden>
              <svg viewBox="0 0 64 64" width="26" height="26">
                <path
                  d="M10 46 L32 10 L54 46 Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinejoin="round"
                />
                <path
                  d="M20 46 L32 24 L44 46 Z"
                  fill="currentColor"
                  opacity="0.25"
                />
              </svg>
            </div>
            <div className="mpBrandText">
              <div className="mpBrandName">MonPlant</div>
              <div className="mpBrandSub">Performance & Operação</div>
            </div>
          </div>

          <nav className="mpNav">
            {links.map((l) => (
              <button
                key={l.href}
                className="mpNavLink"
                onClick={() => scrollToHash(l.href)}
                type="button"
              >
                {l.label}
                <span className="mpNavCaret" aria-hidden>▾</span>
              </button>
            ))}
          </nav>

          <div className="mpTopActions">
            <button className="mpBtnGhost" onClick={() => scrollToHash("#o-que-fazemos")} type="button">
              Explorar
            </button>

            <button className="mpBtnPill" onClick={() => nav("/login")} type="button">
              <span className="mpBtnIcon" aria-hidden>↳</span>
              Login
            </button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <main id="top" className="mpHeroWrap">
        <section className="mpHero">
          <div className="mpHeroWave" aria-hidden />
          <div className="mpHeroInner">
            <div className="mpHeroLeft">
              <h1 className="mpH1">
                Controle operacional com <span>decisão rápida</span>
              </h1>
              <p className="mpHeroP">
                O MonPlant centraliza produção, paradas e horímetros em uma experiência
                moderna e objetiva — com indicadores e histórico para apoiar o CCO e a planta.
              </p>

              <div className="mpHeroBtns">
                <button className="mpBtnPrimary" onClick={() => nav("/login")} type="button">
                  Acessar o sistema
                </button>
                <button className="mpBtnOutline" onClick={() => scrollToHash("#o-que-fazemos")} type="button">
                  Explorar a página
                </button>
              </div>

              <div className="mpHeroBadges">
                <div className="mpBadge">
                  <div className="mpBadgeKpi">Tempo real</div>
                  <div className="mpBadgeTxt">Dashboard + KPIs</div>
                </div>
                <div className="mpBadge">
                  <div className="mpBadgeKpi">Histórico</div>
                  <div className="mpBadgeTxt">Rastreabilidade</div>
                </div>
                <div className="mpBadge">
                  <div className="mpBadgeKpi">Turnos</div>
                  <div className="mpBadgeTxt">7x7 / Turno 1-2</div>
                </div>
              </div>
            </div>

            <div className="mpHeroRight">
              <div className="mpHeroImg">
                <div className="mpImgPh">
                  <img
                    src={ASSETS.hero}
                    alt="Imagem institucional do MonPlant (substitua por uma foto real)"
                    onError={(e) => ((e.currentTarget.style.display = "none"))}
                  />
                  <div className="mpImgFallback">
                    <div className="mpImgFallbackTitle">Imagem do Hero</div>
                    <div className="mpImgFallbackSub">
                      Substitua <code>ASSETS.hero</code> por uma foto da planta/CCO.
                    </div>
                  </div>
                </div>
                <div className="mpHeroImgGlow" aria-hidden />
              </div>
            </div>
          </div>

          <div className="mpHeroDivider" aria-hidden />
        </section>

        {/* QUEM SOMOS */}
        <section id="quem-somos" className="mpSection">
          <div className="mpSectionHead">
            <h2>Quem somos</h2>
            <p>
              O MonPlant é uma plataforma criada para tornar a rotina operacional mais clara,
              confiável e ágil — com foco em produção, paradas, horímetros e análise diária.
            </p>
          </div>

          <div className="mpTwoCol">
            <div className="mpCardText">
              <h3>Propósito</h3>
              <p>
                Entregar visibilidade e controle para equipes de operação e liderança, reduzindo
                ruídos de comunicação e acelerando decisões com base em dados.
              </p>

              <div className="mpList">
                <div className="mpListItem">
                  <div className="mpDot" />
                  <div>
                    <div className="mpListTitle">Padronização</div>
                    <div className="mpListSub">Mesma forma de lançar e acompanhar todos os dias.</div>
                  </div>
                </div>
                <div className="mpListItem">
                  <div className="mpDot" />
                  <div>
                    <div className="mpListTitle">Rastreabilidade</div>
                    <div className="mpListSub">Histórico por hora, turno e equipamento.</div>
                  </div>
                </div>
                <div className="mpListItem">
                  <div className="mpDot" />
                  <div>
                    <div className="mpListTitle">Confiabilidade</div>
                    <div className="mpListSub">Menos divergência de números, mais consistência.</div>
                  </div>
                </div>
              </div>

              <div className="mpInlineCtas">
                <button className="mpBtnPrimary" onClick={() => nav("/login")} type="button">
                  Entrar no MonPlant
                </button>
                <button className="mpBtnGhost" onClick={() => scrollToHash("#contato")} type="button">
                  Falar com a equipe
                </button>
              </div>
            </div>

            <div className="mpCardImg">
              <div className="mpImgPh mpImgRounded">
                <img
                  src={ASSETS.quemSomos}
                  alt="Imagem de quem somos (substitua)"
                  onError={(e) => ((e.currentTarget.style.display = "none"))}
                />
                <div className="mpImgFallback">
                  <div className="mpImgFallbackTitle">Imagem: Quem somos</div>
                  <div className="mpImgFallbackSub">
                    Substitua <code>ASSETS.quemSomos</code>.
                  </div>
                </div>
              </div>

              <div className="mpMiniStats">
                <div className="mpMiniStat">
                  <div className="mpMiniStatKpi">Produção</div>
                  <div className="mpMiniStatTxt">Ton/h, meta, atingimento</div>
                </div>
                <div className="mpMiniStat">
                  <div className="mpMiniStatKpi">Paradas</div>
                  <div className="mpMiniStatTxt">Linhas por tipo/equipamento</div>
                </div>
                <div className="mpMiniStat">
                  <div className="mpMiniStatKpi">Horímetros</div>
                  <div className="mpMiniStatTxt">Últimos por equipamento</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* O QUE FAZEMOS */}
        <section id="o-que-fazemos" className="mpSection mpSectionAlt">
          <div className="mpSectionHead">
            <h2>O que fazemos</h2>
            <p>
              Tudo o que você precisa para monitorar o dia operacional: lançamentos, painéis e
              histórico com leitura rápida.
            </p>
          </div>

          <div className="mpGrid4">
            <FeatureCard
              title="Dashboard"
              desc="KPI’s do dia, últimos 7 dias, taxa operacional e insights."
              icon="▣"
            />
            <FeatureCard
              title="Produção da Planta"
              desc="Toneladas por período, edição horária e meta diária."
              icon="⟡"
            />
            <FeatureCard
              title="Paradas"
              desc="Registro por tipo/equipamento com consolidação automática."
              icon="⏸"
            />
            <FeatureCard
              title="Horímetros"
              desc="Controle por equipamento com histórico e último lançamento."
              icon="⏱"
            />
            <FeatureCard
              title="Relatórios"
              desc="Visão por dia, tendência e comparação de períodos."
              icon="≋"
            />
            <FeatureCard
              title="Avisos Operacionais"
              desc="Comunicados oficiais (ex.: supervisor) para evitar divergências."
              icon="⚑"
            />
            <FeatureCard
              title="Auditoria"
              desc="Registros claros: quem lançou, quando e o que foi alterado."
              icon="✓"
            />
            <FeatureCard
              title="Acesso Seguro"
              desc="Login, perfil por função e permissões por módulo."
              icon="🔒"
            />
          </div>

          <div className="mpBigCallout">
            <div className="mpBigCalloutText">
              <h3>Menos ruído. Mais clareza.</h3>
              <p>
                A ideia é simples: o número publicado precisa ser confiável e explicado.
                O MonPlant organiza isso de ponta a ponta.
              </p>
            </div>
            <div className="mpBigCalloutActions">
              <button className="mpBtnPrimary" onClick={() => nav("/login")} type="button">
                Acessar agora
              </button>
              <button className="mpBtnOutline" onClick={() => scrollToHash("#onde-estamos")} type="button">
                Ver localização
              </button>
            </div>
          </div>
        </section>

        {/* ONDE ESTAMOS */}
        <section id="onde-estamos" className="mpSection">
          <div className="mpSectionHead">
            <h2>Onde estamos</h2>
            <p>
              Área para mapa, unidades, contatos e detalhes operacionais (CCO, planta, mina, etc.).
            </p>
          </div>

          <div className="mpTwoCol">
            <div className="mpCardText">
              <h3>Unidades e atuação</h3>
              <p>
                Você pode descrever aqui: nome da unidade, cidade/estado, área operacional,
                e como o MonPlant apoia o dia a dia (lançamentos do CCO, supervisão, gestão).
              </p>

              <div className="mpInfoGrid">
                <InfoRow label="Unidade" value="Planta / Mina (substitua)" />
                <InfoRow label="Região" value="Minas Gerais - BR (substitua)" />
                <InfoRow label="Contato" value="operacao@empresa.com (substitua)" />
                <InfoRow label="Horário" value="Operação 24/7 (substitua)" />
              </div>

              <div className="mpInlineCtas">
                <button className="mpBtnOutline" onClick={() => scrollToHash("#contato")} type="button">
                  Solicitar demonstração
                </button>
                <button className="mpBtnGhost" onClick={() => nav("/login")} type="button">
                  Entrar
                </button>
              </div>
            </div>

            <div className="mpCardImg">
              <div className="mpImgPh mpImgRounded">
                <img
                  src={ASSETS.mapa}
                  alt="Mapa / Localização (substitua)"
                  onError={(e) => ((e.currentTarget.style.display = "none"))}
                />
                <div className="mpImgFallback">
                  <div className="mpImgFallbackTitle">Imagem: Mapa / Localização</div>
                  <div className="mpImgFallbackSub">
                    Substitua <code>ASSETS.mapa</code> por um print do mapa ou foto aérea.
                  </div>
                </div>
              </div>
              <div className="mpCaption">
                *Dica: você pode usar um print do Google Maps ou um mapa institucional.
              </div>
            </div>
          </div>
        </section>

        {/* NOSSA GENTE */}
        <section id="nossa-gente" className="mpSection mpSectionAlt">
          <div className="mpSectionHead">
            <h2>Nossa gente</h2>
            <p>
              Seção para reforçar cultura, pessoas e responsabilidade operacional — com imagem grande ao lado.
            </p>
          </div>

          <div className="mpTwoCol mpTwoColReverse">
            <div className="mpCardText">
              <h3>Equipe e cultura</h3>
              <p>
                Aqui você descreve o time (CCO, supervisão, operação, manutenção), valores e compromisso com segurança,
                rotina e excelência operacional.
              </p>

              <div className="mpQuote">
                <div className="mpQuoteBar" aria-hidden />
                <div>
                  <div className="mpQuoteText">
                    “Quando a informação é clara, o turno rende mais e o erro diminui.”
                  </div>
                  <div className="mpQuoteBy">— Operação / CCO</div>
                </div>
              </div>

              <div className="mpList">
                <div className="mpListItem">
                  <div className="mpDot" />
                  <div>
                    <div className="mpListTitle">Comunicação</div>
                    <div className="mpListSub">Avisos e confirmações reduzem divergências.</div>
                  </div>
                </div>
                <div className="mpListItem">
                  <div className="mpDot" />
                  <div>
                    <div className="mpListTitle">Disciplina operacional</div>
                    <div className="mpListSub">Padrão de lançamento e auditoria de dados.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mpCardImg">
              <div className="mpImgPh mpImgRounded">
                <img
                  src={ASSETS.nossaGente}
                  alt="Foto da equipe (substitua)"
                  onError={(e) => ((e.currentTarget.style.display = "none"))}
                />
                <div className="mpImgFallback">
                  <div className="mpImgFallbackTitle">Imagem: Nossa gente</div>
                  <div className="mpImgFallbackSub">
                    Substitua <code>ASSETS.nossaGente</code> por uma foto do time.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Galeria */}
          <div className="mpGallery">
            <GalleryItem src={ASSETS.galeria1} label="Imagem 01" />
            <GalleryItem src={ASSETS.galeria2} label="Imagem 02" />
            <GalleryItem src={ASSETS.galeria3} label="Imagem 03" />
            <GalleryItem src={ASSETS.galeria4} label="Imagem 04" />
          </div>
        </section>

        {/* FAQ + CONTATO */}
        <section id="contato" className="mpSection">
          <div className="mpSectionHead">
            <h2>Contato</h2>
            <p>
              Área final completa: perguntas frequentes + formulário (ou dados de contato).
            </p>
          </div>

          <div className="mpTwoCol">
            <div className="mpCardText">
              <h3>Perguntas frequentes</h3>

              <Faq
                q="Quem pode lançar dados no sistema?"
                a="Você define por perfil: apontador, controlador, supervisor, gerência. O sistema respeita permissões por módulo."
              />
              <Faq
                q="Como evito lançamentos errados por falha de comunicação?"
                a="Use o módulo de Avisos Operacionais: o supervisor publica uma mensagem geral, com confirmação, visível para todos."
              />
              <Faq
                q="O sistema guarda histórico de alterações?"
                a="Sim. Recomenda-se manter auditoria de alterações (quem alterou, quando, e o que foi alterado) por segurança e rastreabilidade."
              />

              <div className="mpInlineCtas">
                <button className="mpBtnPrimary" onClick={() => nav("/login")} type="button">
                  Entrar
                </button>
                <button className="mpBtnOutline" onClick={() => scrollToHash("#top")} type="button">
                  Voltar ao topo
                </button>
              </div>
            </div>

            <div className="mpContactCard">
              <h3>Fale com a equipe</h3>
              <p className="mpContactSub">
                Você pode trocar por um formulário real (API) depois. Por enquanto é só layout.
              </p>

              <div className="mpForm">
                <div className="mpField">
                  <label>Nome</label>
                  <input placeholder="Seu nome" />
                </div>
                <div className="mpField">
                  <label>E-mail</label>
                  <input placeholder="seuemail@empresa.com" />
                </div>
                <div className="mpField">
                  <label>Mensagem</label>
                  <textarea placeholder="Descreva o que você precisa..." rows={5} />
                </div>

                <button
                  className="mpBtnPrimary mpFormBtn"
                  type="button"
                  onClick={() => alert("Layout pronto. Depois conectamos no backend.")}
                >
                  Enviar mensagem
                </button>

                <div className="mpContactMeta">
                  <div><b>E-mail:</b> operacao@empresa.com</div>
                  <div><b>Telefone:</b> (00) 0000-0000</div>
                  <div><b>Local:</b> Unidade Operacional</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="mpFooter">
          <div className="mpFooterInner">
            <div className="mpFooterCol">
              <div className="mpFooterBrand">MonPlant</div>
              <div className="mpFooterSub">
                Plataforma de monitoramento operacional (produção, paradas e horímetros).
              </div>
            </div>

            <div className="mpFooterCol">
              <div className="mpFooterTitle">Navegação</div>
              <div className="mpFooterLinks">
                {links.map((l) => (
                  <button key={l.href} className="mpFooterLink" onClick={() => scrollToHash(l.href)} type="button">
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mpFooterCol">
              <div className="mpFooterTitle">Acesso</div>
              <button className="mpBtnPill" onClick={() => nav("/login")} type="button">
                Login
              </button>
            </div>
          </div>

          <div className="mpFooterBottom">
            © {new Date().getFullYear()} MonPlant • Todos os direitos reservados.
          </div>
        </footer>
      </main>

      {/* CSS */}
      <style>{css}</style>
    </div>
  );
}

function FeatureCard({ title, desc, icon }: { title: string; desc: string; icon: string }) {
  return (
    <div className="mpFeat">
      <div className="mpFeatIcon" aria-hidden>{icon}</div>
      <div className="mpFeatTitle">{title}</div>
      <div className="mpFeatDesc">{desc}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mpInfoRow">
      <div className="mpInfoLabel">{label}</div>
      <div className="mpInfoValue">{value}</div>
    </div>
  );
}

function GalleryItem({ src, label }: { src: string; label: string }) {
  return (
    <div className="mpGalleryItem">
      <div className="mpImgPh mpImgRounded mpGalleryImg">
        <img
          src={src}
          alt={label}
          onError={(e) => ((e.currentTarget.style.display = "none"))}
        />
        <div className="mpImgFallback">
          <div className="mpImgFallbackTitle">{label}</div>
          <div className="mpImgFallbackSub">Substitua no objeto ASSETS.</div>
        </div>
      </div>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="mpFaq">
      <summary className="mpFaqSum">{q}</summary>
      <div className="mpFaqAns">{a}</div>
    </details>
  );
}

const css = `
/* base */
.mpSite{
  --bg: #070b14;
  --bg2:#0b1224;
  --card: rgba(255,255,255,0.06);
  --card2: rgba(255,255,255,0.08);
  --line: rgba(255,255,255,0.10);
  --txt: rgba(255,255,255,0.92);
  --muted: rgba(255,255,255,0.70);
  --muted2: rgba(255,255,255,0.55);
  --emerald: #10b981;
  --emerald2:#34d399;
  --shadow: 0 18px 60px rgba(0,0,0,0.35);
  color: var(--txt);
  background: radial-gradient(1200px 700px at 75% 10%, rgba(16,185,129,0.22), transparent 60%),
              radial-gradient(900px 520px at 10% 20%, rgba(99,102,241,0.14), transparent 55%),
              linear-gradient(180deg, var(--bg), var(--bg2));
  min-height: 100vh;
  overflow-x: hidden;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
}

.mpTop{
  position: sticky;
  top: 0;
  z-index: 50;
  backdrop-filter: blur(14px);
  background: rgba(8,12,24,0.72);
  border-bottom: 1px solid var(--line);
}
.mpTopInner{
  max-width: 1200px;
  margin: 0 auto;
  padding: 14px 18px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 14px;
}
.mpBrand{
  display:flex;
  align-items:center;
  gap: 10px;
  cursor:pointer;
  user-select:none;
}
.mpLogo{
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display:flex;
  align-items:center;
  justify-content:center;
  color: var(--emerald);
  background: rgba(16,185,129,0.10);
  border: 1px solid rgba(16,185,129,0.22);
}
.mpBrandName{ font-weight: 900; letter-spacing: .2px; }
.mpBrandSub{ font-size: 12px; color: var(--muted2); margin-top: -2px; }

.mpNav{
  display:flex;
  gap: 8px;
  align-items:center;
}
.mpNavLink{
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted);
  padding: 8px 10px;
  border-radius: 12px;
  cursor:pointer;
  font-weight: 700;
}
.mpNavLink:hover{
  color: var(--txt);
  border-color: rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.03);
}
.mpNavCaret{ margin-left: 6px; color: rgba(16,185,129,0.9); }

.mpTopActions{ display:flex; gap: 10px; align-items:center; }

.mpBtnPill{
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  color: var(--txt);
  border-radius: 999px;
  padding: 10px 14px;
  cursor:pointer;
  font-weight: 900;
  display:flex;
  align-items:center;
  gap: 8px;
}
.mpBtnPill:hover{ background: rgba(255,255,255,0.09); }
.mpBtnIcon{
  width: 22px; height: 22px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border-radius: 999px;
  background: rgba(16,185,129,0.14);
  border: 1px solid rgba(16,185,129,0.25);
  color: var(--emerald2);
}

.mpBtnGhost{
  background: transparent;
  border: 1px solid rgba(255,255,255,0.12);
  color: var(--muted);
  border-radius: 14px;
  padding: 10px 12px;
  cursor:pointer;
  font-weight: 800;
}
.mpBtnGhost:hover{ color: var(--txt); background: rgba(255,255,255,0.04); }

.mpHeroWrap{ width: 100%; }

/* hero layout inspirado no print */
.mpHero{
  position: relative;
  max-width: 1200px;
  margin: 18px auto 0;
  padding: 0 18px 40px;
}
.mpHeroInner{
  position: relative;
  border-radius: 22px;
  overflow:hidden;
  border: 1px solid rgba(255,255,255,0.10);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)),
    radial-gradient(900px 480px at 70% 30%, rgba(255,255,255,0.10), transparent 70%);
  box-shadow: var(--shadow);
  display:grid;
  grid-template-columns: 1.1fr 1fr;
  min-height: 420px;
}

.mpHeroWave{
  position:absolute;
  left: 18px;
  right: 18px;
  top: 0;
  height: 0;
  pointer-events:none;
}
.mpHeroLeft{
  padding: 68px 52px;
  position: relative;
  z-index: 2;
}
.mpH1{
  font-size: 44px;
  line-height: 1.08;
  margin: 0;
  font-weight: 950;
  letter-spacing: -0.02em;
}
.mpH1 span{ color: var(--emerald2); }
.mpHeroP{
  margin-top: 14px;
  max-width: 520px;
  color: var(--muted);
  font-size: 15.5px;
  line-height: 1.6;
}
.mpHeroBtns{
  margin-top: 22px;
  display:flex;
  gap: 12px;
  flex-wrap: wrap;
}
.mpBtnPrimary{
  background: linear-gradient(135deg, var(--emerald), var(--emerald2));
  border: 1px solid rgba(16,185,129,0.18);
  color: #07130f;
  font-weight: 950;
  padding: 12px 16px;
  border-radius: 14px;
  cursor:pointer;
  box-shadow: 0 14px 36px rgba(16,185,129,0.18);
}
.mpBtnPrimary:hover{ filter: brightness(1.03); }
.mpBtnOutline{
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.14);
  color: var(--txt);
  font-weight: 900;
  padding: 12px 16px;
  border-radius: 14px;
  cursor:pointer;
}
.mpBtnOutline:hover{ background: rgba(255,255,255,0.07); }

.mpHeroBadges{
  margin-top: 22px;
  display:flex;
  gap: 10px;
  flex-wrap: wrap;
}
.mpBadge{
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.14);
  padding: 10px 12px;
  border-radius: 16px;
  min-width: 150px;
}
.mpBadgeKpi{ font-weight: 950; color: var(--emerald2); }
.mpBadgeTxt{ margin-top: 2px; font-size: 12px; color: var(--muted2); }

.mpHeroRight{
  position: relative;
  padding: 18px;
  display:flex;
  align-items:stretch;
  justify-content:stretch;
}
.mpHeroImg{
  width: 100%;
  position: relative;
  border-radius: 18px;
  overflow:hidden;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(0,0,0,0.14);
}
.mpHeroImgGlow{
  position:absolute;
  inset: -20%;
  background: radial-gradient(circle at 30% 30%, rgba(16,185,129,0.16), transparent 55%);
  pointer-events:none;
}
.mpImgPh{
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 360px;
  display:flex;
  align-items:center;
  justify-content:center;
  overflow:hidden;
}
.mpImgRounded{ border-radius: 18px; }
.mpImgPh img{
  width: 100%;
  height: 100%;
  object-fit: cover;
  display:block;
}
.mpImgFallback{
  position:absolute;
  inset: 0;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  text-align:center;
  padding: 18px;
  background:
    radial-gradient(520px 280px at 55% 35%, rgba(16,185,129,0.10), transparent 60%),
    linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
  border: 1px dashed rgba(255,255,255,0.16);
  color: rgba(255,255,255,0.82);
}
.mpImgFallbackTitle{ font-weight: 950; }
.mpImgFallbackSub{ margin-top: 8px; color: var(--muted2); font-size: 12.5px; }
.mpImgFallbackSub code{
  background: rgba(0,0,0,0.22);
  border: 1px solid rgba(255,255,255,0.10);
  padding: 2px 6px;
  border-radius: 10px;
  color: rgba(255,255,255,0.88);
}

.mpHeroDivider{
  height: 22px;
  max-width: 840px;
  margin: 22px auto 0;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255,255,255,0.00), rgba(255,255,255,0.12), rgba(255,255,255,0.00));
  opacity: 0.6;
}

/* sections */
.mpSection{
  max-width: 1200px;
  margin: 0 auto;
  padding: 72px 18px;
}
.mpSectionAlt{
  background: rgba(255,255,255,0.02);
  border-top: 1px solid rgba(255,255,255,0.06);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.mpSectionHead h2{
  margin: 0;
  font-size: 34px;
  font-weight: 950;
}
.mpSectionHead p{
  margin: 10px 0 0;
  color: var(--muted);
  max-width: 820px;
  line-height: 1.6;
}

.mpTwoCol{
  margin-top: 26px;
  display:grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 22px;
  align-items: start;
}
.mpTwoColReverse{
  grid-template-columns: 1fr 1.1fr;
}
.mpCardText{
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  border-radius: 18px;
  padding: 22px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.18);
}
.mpCardText h3{
  margin: 0;
  font-weight: 950;
  font-size: 18px;
}
.mpCardText p{
  margin: 10px 0 0;
  color: var(--muted);
  line-height: 1.7;
  font-size: 14.5px;
}

.mpCardImg{ display:flex; flex-direction:column; gap: 12px; }
.mpCaption{ color: var(--muted2); font-size: 12.5px; }

.mpList{ margin-top: 14px; display:flex; flex-direction:column; gap: 10px; }
.mpListItem{
  display:flex;
  gap: 10px;
  align-items:flex-start;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(0,0,0,0.12);
}
.mpDot{
  width: 10px; height: 10px;
  margin-top: 6px;
  border-radius: 999px;
  background: var(--emerald2);
  box-shadow: 0 0 0 4px rgba(16,185,129,0.16);
}
.mpListTitle{ font-weight: 900; }
.mpListSub{ color: var(--muted2); font-size: 12.8px; margin-top: 2px; }

.mpInlineCtas{ margin-top: 14px; display:flex; gap: 10px; flex-wrap:wrap; }

.mpMiniStats{
  display:grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.mpMiniStat{
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  border-radius: 16px;
  padding: 12px;
}
.mpMiniStatKpi{ font-weight: 950; color: var(--emerald2); }
.mpMiniStatTxt{ margin-top: 4px; font-size: 12.4px; color: var(--muted2); }

/* features grid */
.mpGrid4{
  margin-top: 26px;
  display:grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.mpFeat{
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  border-radius: 18px;
  padding: 16px;
  min-height: 132px;
}
.mpFeatIcon{
  width: 38px; height: 38px;
  border-radius: 14px;
  display:flex;
  align-items:center;
  justify-content:center;
  background: rgba(16,185,129,0.12);
  border: 1px solid rgba(16,185,129,0.22);
  color: var(--emerald2);
  font-weight: 950;
  margin-bottom: 10px;
}
.mpFeatTitle{ font-weight: 950; }
.mpFeatDesc{ margin-top: 6px; color: var(--muted); font-size: 13px; line-height: 1.5; }

.mpBigCallout{
  margin-top: 18px;
  border-radius: 18px;
  border: 1px solid rgba(16,185,129,0.22);
  background: radial-gradient(900px 380px at 10% 30%, rgba(16,185,129,0.18), transparent 60%),
              rgba(255,255,255,0.04);
  padding: 18px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.mpBigCalloutText h3{ margin:0; font-weight: 950; }
.mpBigCalloutText p{ margin: 8px 0 0; color: var(--muted); max-width: 720px; line-height: 1.6; }
.mpBigCalloutActions{ display:flex; gap: 10px; flex-wrap:wrap; }

.mpInfoGrid{ margin-top: 12px; display:grid; gap: 10px; }
.mpInfoRow{
  display:flex;
  justify-content:space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(0,0,0,0.12);
}
.mpInfoLabel{ color: var(--muted2); font-weight: 800; }
.mpInfoValue{ color: var(--txt); font-weight: 900; }

/* quote */
.mpQuote{
  margin-top: 14px;
  display:flex;
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.03);
}
.mpQuoteBar{
  width: 6px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--emerald2), rgba(16,185,129,0.2));
}
.mpQuoteText{ font-weight: 900; }
.mpQuoteBy{ margin-top: 4px; color: var(--muted2); font-size: 12.5px; }

/* gallery */
.mpGallery{
  margin-top: 18px;
  display:grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.mpGalleryImg{ min-height: 170px; }

/* faq + contact */
.mpFaq{
  margin-top: 10px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.03);
  border-radius: 16px;
  overflow:hidden;
}
.mpFaqSum{
  cursor:pointer;
  padding: 12px 14px;
  font-weight: 900;
  color: var(--txt);
  list-style:none;
}
.mpFaqSum::-webkit-details-marker { display:none; }
.mpFaqAns{
  padding: 0 14px 12px;
  color: var(--muted);
  line-height: 1.6;
  font-size: 13.5px;
}

.mpContactCard{
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  border-radius: 18px;
  padding: 22px;
}
.mpContactCard h3{ margin:0; font-weight: 950; }
.mpContactSub{ margin: 8px 0 0; color: var(--muted2); line-height: 1.6; font-size: 13.5px; }

.mpForm{ margin-top: 12px; display:flex; flex-direction:column; gap: 10px; }
.mpField{ display:flex; flex-direction:column; gap: 6px; }
.mpField label{ color: var(--muted2); font-weight: 800; font-size: 12.5px; }
.mpField input, .mpField textarea{
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.16);
  color: var(--txt);
  padding: 10px 12px;
  outline: none;
}
.mpField input:focus, .mpField textarea:focus{
  border-color: rgba(16,185,129,0.38);
  box-shadow: 0 0 0 4px rgba(16,185,129,0.12);
}
.mpFormBtn{ width: fit-content; }
.mpContactMeta{
  margin-top: 10px;
  color: var(--muted2);
  font-size: 12.8px;
  line-height: 1.6;
}

/* footer */
.mpFooter{
  border-top: 1px solid rgba(255,255,255,0.08);
  background: rgba(0,0,0,0.18);
  padding: 34px 18px 18px;
}
.mpFooterInner{
  max-width: 1200px;
  margin: 0 auto;
  display:grid;
  grid-template-columns: 1.4fr 1fr 0.8fr;
  gap: 18px;
  align-items:start;
}
.mpFooterBrand{ font-weight: 950; color: var(--emerald2); font-size: 18px; }
.mpFooterSub{ margin-top: 8px; color: var(--muted2); line-height: 1.6; }
.mpFooterTitle{ font-weight: 950; margin-bottom: 10px; }
.mpFooterLinks{ display:flex; flex-direction:column; gap: 6px; }
.mpFooterLink{
  background: transparent;
  border: 0;
  color: var(--muted);
  text-align:left;
  cursor:pointer;
  padding: 6px 0;
  font-weight: 800;
}
.mpFooterLink:hover{ color: var(--txt); }

.mpFooterBottom{
  max-width: 1200px;
  margin: 18px auto 0;
  padding-top: 14px;
  border-top: 1px solid rgba(255,255,255,0.06);
  color: var(--muted2);
  font-size: 12.5px;
}

/* responsive */
@media (max-width: 1020px){
  .mpNav{ display:none; }
  .mpHeroInner{ grid-template-columns: 1fr; }
  .mpHeroLeft{ padding: 44px 22px; }
  .mpHeroRight{ padding: 18px 18px 22px; }
  .mpGrid4{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mpTwoCol, .mpTwoColReverse{ grid-template-columns: 1fr; }
  .mpGallery{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mpFooterInner{ grid-template-columns: 1fr; }
}
@media (max-width: 520px){
  .mpH1{ font-size: 34px; }
  .mpGrid4{ grid-template-columns: 1fr; }
  .mpHeroBadges .mpBadge{ min-width: 0; flex: 1; }
}
`;
