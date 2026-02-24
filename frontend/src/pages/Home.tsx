import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const nav = useNavigate();

  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <div className="min-h-screen bg-[#07090c] text-white relative overflow-hidden">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute top-10 right-0 h-[540px] w-[540px] rounded-full bg-yellow-400/10 blur-[140px]" />
        <div className="absolute -bottom-48 left-1/3 h-[620px] w-[620px] rounded-full bg-sky-500/10 blur-[150px]" />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.16) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        {/* ===== Banner / Hero (espaço para imagem) ===== */}
        <section className="rounded-[28px] border border-white/10 bg-white/[0.03] overflow-hidden shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
          <div className="relative">
            {/* Banner image placeholder */}
            <div className="h-[220px] sm:h-[260px] lg:h-[320px] bg-gradient-to-r from-emerald-500/10 via-yellow-400/10 to-sky-500/10" />
            <div className="absolute inset-0">
              <div className="absolute inset-0 bg-[radial-gradient(900px_360px_at_50%_20%,rgba(255,255,255,0.12),transparent_55%)]" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#07090c] via-[#07090c]/30 to-transparent" />
              <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "url('/banner-placeholder.png')", backgroundSize: "cover", backgroundPosition: "center" }} />
            </div>

            {/* Hero content */}
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 lg:p-10">
              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                <div className="max-w-3xl">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 grid place-items-center font-black text-emerald-300">
                      MP
                    </div>
                    <div className="text-xs sm:text-sm font-extrabold tracking-wide text-white/70">
                      MonPlant • Operação em tempo real
                    </div>
                  </div>

                  <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
                    Gestão operacional com <span className="text-emerald-300">KPIs</span>,{" "}
                    <span className="text-yellow-200">paradas</span> e{" "}
                    <span className="text-sky-200">produção</span> em um só lugar.
                  </h1>

                  <p className="mt-3 text-sm sm:text-base text-white/75 leading-relaxed">
                    O MonPlant conecta a rotina da planta (produção, ritmo, paradas, horímetros e relatórios) com uma visão executiva.
                    Agora, com o <span className="text-orange-200 font-extrabold">BucketVision</span>, a contagem de conchadas por IA pode alimentar a produção automaticamente em tempo real.
                  </p>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      className="px-5 py-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/25 transition font-extrabold"
                      onClick={() => nav("/dashboard")}
                    >
                      Abrir Dashboard
                    </button>
                    <button
                      className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/8 transition font-extrabold"
                      onClick={() => nav("/producao-planta")}
                    >
                      Produção da Planta
                    </button>
                    <button
                      className="px-5 py-3 rounded-2xl bg-orange-500/15 border border-orange-500/30 hover:bg-orange-500/20 transition font-extrabold"
                      onClick={() => nav("/ritmo")}
                    >
                      Ritmo do Dia
                    </button>
                  </div>

                  <div className="mt-4 text-[12px] text-white/55">
                    * Banner: substitua <span className="font-bold text-white/70">/banner-placeholder.png</span> por uma imagem real (paisagem/mineração/CCO).
                  </div>
                </div>

                {/* Right badge / mini card */}
                <div className="w-full lg:w-[360px] rounded-[22px] border border-white/10 bg-black/20 p-5 backdrop-blur">
                  <div className="text-xs font-extrabold text-white/60">Destaque</div>
                  <div className="mt-2 text-lg font-black leading-tight">
                    BucketVision → produção automática
                  </div>
                  <div className="mt-2 text-sm text-white/70 leading-relaxed">
                    Conchadas contadas por IA (RTSP) × média (t) → Ton/H em tempo real, pronto para o MonPlant.
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-extrabold text-emerald-200">
                      RTSP + IA
                    </span>
                    <span className="inline-flex items-center rounded-full border border-yellow-500/25 bg-yellow-500/10 px-3 py-1 text-xs font-extrabold text-yellow-100">
                      ROI precisa
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== Seção: MonPlant ===== */}
        <section className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs font-extrabold tracking-wide text-white/60">PLATAFORMA</div>
              <h2 className="mt-1 text-2xl sm:text-3xl font-black">MonPlant</h2>
              <p className="mt-2 text-sm text-white/70 max-w-3xl">
                Um painel operacional completo para o dia a dia: acompanhamento por hora, metas, ritmo necessário, paradas, descrições e
                registro padronizado.
              </p>
            </div>

            {/* Image slot */}
            <div className="hidden lg:block w-[360px] h-[160px] rounded-[22px] border border-white/10 bg-white/[0.03] overflow-hidden">
              <div className="h-full w-full bg-[radial-gradient(360px_160px_at_20%_20%,rgba(34,197,94,0.18),transparent_60%)]" />
              <div className="absolute opacity-0" />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Feature
              title="Dashboard executivo"
              badge="KPI"
              desc="Meta, produzido, projeção, ritmo acumulado e visão diária com leitura rápida para supervisão e gerência."
            />
            <Feature
              title="Paradas e causas"
              badge="SST/Operação"
              desc="Registro por período, tipificação, top equipamentos e principais descrições para análise e ação."
            />
            <Feature
              title="Produção por hora"
              badge="Ton/H"
              desc="Tabela/edição por hora com observações e export. Base pronta para relatórios e auditoria."
            />
            <Feature
              title="UF e DF"
              badge="Disponibilidade"
              desc="Horas horizonte, horas operando e horas parada, com visão por cadeia de equipamentos."
            />
            <Feature
              title="Horímetros"
              badge="Frota"
              desc="Controle de horímetro por equipamento, histórico e leitura da operação em tempo real."
            />
            <Feature
              title="Permissões por perfil"
              badge="Acesso"
              desc="Separação por tipo de usuário (apontador, supervisor, controlador, gerência) com páginas corretas para cada função."
            />
          </div>

          {/* Image slots row */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ImageSlot label="Imagem 01 • Dashboard (print)" hint="Coloque um print do Dashboard." />
            <ImageSlot label="Imagem 02 • Ritmo do dia" hint="Coloque um print do Ritmo." />
            <ImageSlot label="Imagem 03 • Paradas/UF-DF" hint="Coloque um print das Paradas ou UF/DF." />
          </div>
        </section>

        {/* ===== Seção: BucketVision ===== */}
        <section className="mt-12 rounded-[28px] border border-white/10 bg-white/[0.03] overflow-hidden">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row gap-6 lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="text-xs font-extrabold tracking-wide text-white/60">IA NA PRODUÇÃO</div>
                <h2 className="mt-1 text-2xl sm:text-3xl font-black">
                  BucketVision <span className="text-orange-200">+ MonPlant</span>
                </h2>
                <p className="mt-2 text-sm text-white/70 leading-relaxed">
                  O BucketVision faz a contagem de conchadas via IA em vídeo/RTSP, com ROI cirúrgica e estabilidade operacional.
                  A produção estimada (conchadas × média em t) pode alimentar automaticamente o MonPlant em tempo real — reduzindo atraso e retrabalho.
                </p>

                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Step
                    n="01"
                    title="Captura RTSP"
                    desc="Conecta na câmera, estabiliza reconexão e mantém leitura contínua."
                  />
                  <Step
                    n="02"
                    title="Detecção + ROI"
                    desc="IA detecta conchadas na área útil, com filtros para evitar falsos positivos."
                  />
                  <Step
                    n="03"
                    title="Conversão em produção"
                    desc="Conchadas/h × média (t) → Ton/H e acumulados."
                  />
                  <Step
                    n="04"
                    title="Integração no MonPlant"
                    desc="Atualiza automaticamente a produção por hora em tempo real (sem digitação)."
                  />
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    className="px-5 py-3 rounded-2xl bg-orange-500/15 border border-orange-500/30 hover:bg-orange-500/20 transition font-extrabold"
                    onClick={() => nav("/bucketvision")}
                  >
                    Ver BucketVision
                  </button>
                  <button
                    className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/8 transition font-extrabold"
                    onClick={() => nav("/update-notes")}
                  >
                    Gerar Nota de Atualização
                  </button>
                </div>
              </div>

              {/* Image + diagram slots */}
              <div className="w-full lg:w-[420px] grid gap-4">
                <ImageSlot label="Imagem • Câmera/RTSP" hint="Foto da câmera ou frame do vídeo." tall />
                <ImageSlot label="Imagem • ROI/Contagem" hint="Print do HUD/ROI/contagem." tall />
              </div>
            </div>
          </div>
        </section>

        {/* ===== Callouts / CTA ===== */}
        <section className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Callout
            title="Para o apontador"
            desc="Só o essencial: Produção da Planta + Paradas. Menos tela, mais produtividade."
          />
          <Callout
            title="Para o supervisor"
            desc="Dashboard + Ritmo + Produção + Avisos: visão do turno com foco em tomada de decisão."
          />
          <Callout
            title="Para a gerência"
            desc="Painéis completos, histórico, exportação e insights: performance com rastreabilidade."
          />
        </section>

        {/* Footer */}
        <footer className="mt-12 pb-6 text-center text-xs text-white/45">
          © {year} MonPlant • Plataforma operacional • Integração com BucketVision
        </footer>
      </div>
    </div>
  );
}

function Feature({ title, desc, badge }: { title: string; desc: string; badge: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-black">{title}</div>
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-extrabold text-white/70">
          {badge}
        </span>
      </div>
      <div className="mt-2 text-sm text-white/70 leading-relaxed">{desc}</div>
    </div>
  );
}

function ImageSlot({ label, hint, tall }: { label: string; hint: string; tall?: boolean }) {
  return (
    <div className={`rounded-[22px] border border-white/10 bg-white/[0.03] overflow-hidden ${tall ? "h-[180px] sm:h-[220px]" : "h-[160px]"}`}>
      <div className="h-full w-full relative">
        <div className="absolute inset-0 bg-[radial-gradient(520px_220px_at_15%_20%,rgba(255,255,255,0.08),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-orange-500/10" />
        {/* Coloque aqui uma <img src="..." /> quando tiver a imagem */}
        <div className="absolute inset-0 p-4 flex flex-col justify-between">
          <div className="text-xs font-extrabold text-white/70">{label}</div>
          <div className="text-[12px] text-white/55">{hint}</div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-2xl border border-orange-500/25 bg-orange-500/10 grid place-items-center font-black text-orange-200">
          {n}
        </div>
        <div className="font-black">{title}</div>
      </div>
      <div className="mt-2 text-sm text-white/70 leading-relaxed">{desc}</div>
    </div>
  );
}

function Callout({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-5">
      <div className="text-sm font-extrabold text-white/60">Perfil</div>
      <div className="mt-1 text-xl font-black">{title}</div>
      <div className="mt-2 text-sm text-white/70 leading-relaxed">{desc}</div>
    </div>
  );
}
