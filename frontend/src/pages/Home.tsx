import React from "react";
import Hero from "@/components/Hero";
import Section from "@/components/Section";
import NewsCard from "@/components/NewsCard";
import SectionAccent, { WaveDivider } from "@/components/SectionAccent";

export default function Home() {
  return (
    <main>
      <Hero />
      <WaveDivider />

      {/* Quem somos — imagem ocupando as 2 colunas da direita */}
      <section id="quem-somos" className="container scroll-mt-24 pt-14 md:pt-20">
        <h2 className="section-title text-3xl md:text-4xl mb-6">Quem somos</h2>

        <div className="relative">
          <SectionAccent side="right" variant="curve" className="-z-10" />

          <div className="grid md:grid-cols-3 gap-6 relative">
            {/* texto 1 coluna */}
            <div className="card p-5 md:col-span-1">
              <p className="text-lg text-gray-600 mb-6">
                A Trindade Mineração é uma empresa que atua com
                responsabilidade, segurança e respeito ao meio ambiente. Com
                foco em eficiência e inovação, buscamos excelência em todas as
                etapas — da lavra ao beneficiamento.
              </p>
              <p className="text-lg text-gray-600 mb-6">
                Valorizamos as pessoas,
                investimos em tecnologia e operamos com ética e
                sustentabilidade, contribuindo para o desenvolvimento da região
                e para um futuro mais seguro e sustentável.
              </p>
            </div>

            {/* imagem 2 colunas */}
            <div className="card overflow-hidden md:col-span-2">
              <img
                src="/img/quem_somos.JPG"
                alt="Planta"
                className="block w-full h-[420px] md:h-[460px] object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      <WaveDivider flip />

      <Section id="o-que-fazemos" title="O que fazemos">
        <div className="relative md:col-span-3">
          <SectionAccent side="left" className="-z-10" intensity={-0.05} />
          <div className="grid md:grid-cols-3 gap-6">
            {[
              [
                "Operação de Mina",
                "Na Trindade Mineração, a operação de mina é conduzida com planejamento, segurança e eficiência. Realizamos todas as etapas de lavra com responsabilidade, priorizando o bem-estar das pessoas e a integridade das áreas operacionais. Nosso objetivo é garantir produtividade com segurança, reduzindo riscos e otimizando recursos para alcançar os melhores resultados.",
              ],
              [
                "Beneficiamento",
                "O beneficiamento é uma das etapas mais estratégicas do nosso processo. Trabalhamos com tecnologia, controle de qualidade e equipes especializadas para garantir que cada tonelada de minério atenda aos mais altos padrões. Buscamos constantemente aprimorar nossos processos, unindo desempenho, inovação e respeito ao meio ambiente.",
              ],
              [
                "Sustentabilidade",
                "A sustentabilidade está no centro das nossas decisões. Atuamos de forma responsável, minimizando impactos ambientais e promovendo ações sociais que fortalecem as comunidades ao nosso redor. Acreditamos que crescer com equilíbrio é o caminho para garantir um futuro seguro, justo e sustentável para todos.",
              ],
            ].map(([t, d], i) => (
              <div key={i} className="card p-5">
                <h3 className="font-semibold">{t}</h3>
                <p className="text-lg text-gray-600 mb-6">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <WaveDivider />

      <section id="nossa-gente" className="container scroll-mt-24 pt-14 md:pt-20">
        <h2 className="section-title text-3xl md:text-4xl mb-6">Nossa Gente</h2>

        <div className="relative">
          <SectionAccent side="right" variant="curve" className="-z-10" />

          <div className="grid md:grid-cols-3 gap-6 relative">
            {/* texto 1 coluna */}
            <div className="card p-5 md:col-span-1">
              <p className="text-lg text-gray-600 mb-6">
                Na Trindade Mineração, valorizamos as pessoas que fazem a diferença todos os dias. Nosso time é formado por profissionais comprometidos com a segurança, o respeito e o trabalho em equipe.
              </p>
              <p className="text-lg text-gray-600 mb-6">
                Acreditamos que o crescimento da empresa começa pelo desenvolvimento de cada colaborador — juntos, construímos uma Trindade mais forte, humana e sustentável.
              </p>
            </div>

            {/* imagem 2 colunas */}
            <div className="card overflow-hidden md:col-span-2">
              <img
                src="/img/nossa_gente.JPEG"
                alt="Planta"
                className="block w-full h-[420px] md:h-[460px] object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      <Section id="onde-estamos" title="Onde estamos">
        <div className="relative md:col-span-3">
          <SectionAccent side="right" className="-z-10" intensity={-0.05} />
          <div className="grid md:grid-cols-3 gap-6">
            <div className="card p-5">
              <h3 className="font-semibold">Trindade (MG)</h3>
              <p className="text-lg text-gray-600 mb-6">
                Unidade operacional em Barão de Cocais.
              </p>
            </div>
            <div className="card p-0 overflow-hidden">
              <img
                src="/img/maps.JPG"
                alt="maps"
                className="block w-full h-48 md:h-64 object-cover"
                loading="lazy"
              />
              <div className="p-4">Mapa e contatos essenciais.</div>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold">Contato</h3>
              <p className="text-lg text-gray-600 mb-6">
                RH, SST e CCO — contatos disponíveis.
              </p>
            </div>
          </div>
        </div>
      </Section>

      <WaveDivider flip />

      <section className="container pt-14">
        <h2 className="section-title text-3xl md:text-4xl mb-6">Trindade agora</h2>
        <div className="relative">
          <SectionAccent side="left" className="-z-10" intensity={-0.08} />
          <div className="grid md:grid-cols-3 gap-6 relative">
            {[
              [
                "https://images.unsplash.com/photo-1509395176047-4a66953fd231?q=80&w=1600&auto=format&fit=crop",
                "Resultados do 3T25",
                "30/10/2025",
              ],
              [
                "https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=1600&auto=format&fit=crop",
                "Atualização das barragens em MG",
                "28/10/2025",
              ],
              [
                "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600&auto=format&fit=crop",
                "Projeto Amazônia Sustentável",
                "01/09/2025",
              ],
            ].map(([img, t, d], i) => (
              <NewsCard key={i} image={img} title={t} date={d} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
