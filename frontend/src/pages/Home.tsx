import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const nav = useNavigate();
  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <div className="min-h-screen text-white relative overflow-hidden bg-[#07090c]">
      {/* Fundo (mesma pegada MonPlant: dark + grid leve + glow discreto) */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-44 -left-44 h-[560px] w-[560px] rounded-full bg-emerald-500/10 blur-[140px]" />
        <div className="absolute top-0 right-[-120px] h-[620px] w-[620px] rounded-full bg-amber-500/10 blur-[150px]" />
        <div className="absolute -bottom-56 left-1/3 h-[700px] w-[700px] rounded-full bg-cyan-500/10 blur-[160px]" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        {/* ===== HERO com espaço para banner ===== */}
        <section className="rounded-[28px] border border-white/10 bg-white/[0.03] overflow-hidden shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
          {/* Slot do banner (coloque uma imagem real aqui) */}
          <div className="relative h-[220px] sm:h-[260px] lg:h-[320px]">
            {/* Se tiver imagem, substitua por <img src="/seu-banner.png" .../> */}
            <div className="absolute inset-0 bg-[radial-gradient(900px_360px_at_50%_20%,rgba(255,255,255,0.10),transparent_55%)]" />
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.06] via-transparent to-[#07090c]" />
            <div className="absolute inset-0 opacity-[0.12] bg-[url('/banner-placeholder.png')] bg-cover bg-center" />
            <div className="absolute inset-0 bg-black/25" />
          </div>

          <div className="p-6 sm:p-8 lg:p-10">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8">
              <div className="max-w-3xl">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 grid place-items-center font-black text-emerald-200">
                    MP
                  </div>
                  <div className="text-xs sm:text-sm font-extrabold tracking-wide text-white/65">
                    MonPlant • Gestão Operacional
                  </div>
                </div>

                <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
                  Produção, paradas e ritmo{" "}
                  <span className="text-emerald-200">em tempo real</span>.
                </h1>

                <p className="mt-3 text-sm sm:text-base text-white/72 leading-relaxed">
                  O <span className="font-extrabold text-white/90">MonPlant</span> centraliza a operação da planta:
                  produção por hora, ritmo necessário, paradas por período/causa, horímetros e visão executiva.
                  <br />
                  Com o <span className="font-extrabold text-orange-200">BucketVision</span>, a IA conta conchadas em RTSP e
                  pode <span className="font-extrabold">gerar a produção automaticamente</span> no MonPlant{" "}
                  <span className="font-extrabold">em tempo real</span>.
                </p>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    className="px-5 py-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/25 transition font-extrabold"
                    onClick={() => nav("/dashboard")}
                  >
                    Abrir Dashboard
                  </button>
                  <button
                    className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition font-extrabold"
                    onClick={() => nav("/producao-planta")}
                  >
                    Produção da Planta
                  </button>
                  <button
                    className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition font-extrabold"
                    onClick={() => nav("/ritmo")}
                  >
                    Ritmo do Dia
                  </button>
                </div>

                <div className="mt-4 text-[12px] text-white/50">
                  Banner: substitua <span className="font-bold text-white/70">/banner-placeholder.png</span> por uma imagem real (planta/CCO/mineração).
                </div>
              </div>

              {/* Cartão de destaque (mesma pegada dos cards do MonPlant) */}
              <div className="w-full lg:w-[380px] rounded-[22px] border border-white/10 bg-black/25 p-5 backdrop-blur">
                <div className="text-xs font-extrabold text-white/55">Destaque</div>
                <div className="mt-2 text-lg font-black leading-tight">
                  BucketVision → Produção automática
                </div>
                <div className="mt-2 text-sm text-white/70 leading-relaxed">
                  Conchadas contadas por IA (RTSP) × média (t) → Ton/H e acumulados, publicados no MonPlant sem digitação.
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-xs font-extrabold text-cyan-200">
                    RTSP
                  </span>
                  <span className="inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-extrabold text-emerald-200">
                    ROI precisa
                  </span>
                  <span className="inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-extrabold text-amber-100">
                    XLSX/Tempo real
                  </span>
                </div>

                <div className="mt-5 flex gap-3">
                  <button
                    className="flex-1 px-4 py-3 rounded-2xl bg-orange-500/15 border border-orange-500/30 hover:bg-orange-500/20 transition font-extrabold"
                    onClick={() => nav("/bucketvision")}
                  >
                    Ver BucketVision
                  </button>
                  <button
                    className="px-4 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition font-extrabold"
                    onClick={() => nav("/update-notes")}
                    title="Gerar nota de atualização"
                  >
                    Notas
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== MonPlant (conteúdo) ===== */}
        <section className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs font-extrabold tracking-wide text-white/55">PLATAFORMA</div>
              <h2 className="mt-1 text-2xl sm:text-3xl font-black">O que o MonPlant entrega</h2>
              <p className="mt-2 text-sm text-white/70 max-w-3xl">
                Tudo que a operação precisa para controle do turno e acompanhamento gerencial — com leitura rápida e registro padronizado.
              </p>
            </div>

            {/* Slot de imagem 16:9 (ex.: print do dashboard) */}
            <div className="hidden lg:block w-[420px] h-[170px] rounded-[22px] border border-white/10 bg-white/[0.03] overflow-hidden">
              <div className="h-full w-full relative">
                <div className="absolute inset-0 bg-[radial-gradient(420px_170px_at_20%_20%,rgba(34,197,94,0.18),transparent_60%)]" />
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] via-transparent to-cyan-500/10" />
                <div className="absolute inset-0 p-4 flex flex-col justify-between">
                  <div className="text-xs font-extrabold text-white/70">Imagem • Dashboard</div>
                  <div className="text-[12px] text-white/55">Coloque um print aqui.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Feature title="Dashboard executivo" badge="KPI" desc="Meta, produzido, projeção, ritmo acumulado e status do dia para decisão rápida." />
            <Feature title="Ritmo do Dia" badge="Ritmo" desc="Necessário vs média real, projeção e alertas visuais no padrão MonPlant." />
            <Feature title="Paradas e causas" badge="Paradas" desc="Registro por período, tipificação e descrições para atacar gargalos e perdas." />
            <Feature title="Produção por hora" badge="Ton/H" desc="Tabela por período com observações e exportação para governança do turno." />
            <Feature title="UF e DF" badge="UF/DF" desc="Horas horizonte, operando e parada, com visão por cadeia de equipamentos." />
            <Feature title="Permissões por perfil" badge="Acesso" desc="Apontador, supervisor, controlador e gerência com menus/páginas corretas." />
          </div>

          {/* Slots para prints */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ImageSlot label="Imagem 01 • Dashboard" hint="Print do Dashboard (KPI + gráfico)." />
            <ImageSlot label="Imagem 02 • Ritmo do Dia" hint="Print do Ritmo (meta, necessário, projeção)." />
            <ImageSlot label="Imagem 03 • UF/DF ou Paradas" hint="Print UF/DF ou Paradas." />
          </div>
        </section>

        {/* ===== BucketVision ===== */}
        <section className="mt-12 rounded-[28px] border border-white/10 bg-white/[0.03] overflow-hidden shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row gap-8 lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="text-xs font-extrabold tracking-wide text-white/55">IA NA PRODUÇÃO</div>
                <h2 className="mt-1 text-2xl sm:text-3xl font-black">
                  BucketVision <span className="text-orange-200">integrado</span> ao MonPlant
                </h2>
                <p className="mt-2 text-sm text-white/70 leading-relaxed">
                  O BucketVision conta conchadas via IA em vídeo/RTSP com ROI precisa e estabilidade operacional.
                  A produção estimada é gerada automaticamente em tempo real:
                  <span className="font-extrabold"> conchadas × média (t) → Ton/H</span>.
                  Isso reduz atraso, retrabalho e melhora a consistência do dado.
                </p>

                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Step n="01" title="Captura RTSP" desc="Conexão estável com reconexão e buffer otimizado." />
                  <Step n="02" title="Detecção + ROI" desc="IA detecta conchadas só na área útil, reduzindo falsos positivos." />
                  <Step n="03" title="Produção em tempo real" desc="Atualiza Ton/H e acumulados automaticamente, sem digitação." />
                  <Step n="04" title="Pronto para gestão" desc="Relatórios e telas do MonPlant sempre consistentes com o que está no campo." />
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    className="px-5 py-3 rounded-2xl bg-orange-500/15 border border-orange-500/30 hover:bg-orange-500/20 transition font-extrabold"
                    onClick={() => nav("/bucketvision")}
                  >
                    Abrir BucketVision
                  </button>
                  <button
                    className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition font-extrabold"
                    onClick={() => nav("/update-notes")}
                  >
                    Gerar Nota de Atualização
                  </button>
                </div>
              </div>

              {/* Slots de imagem (prints do HUD/ROI e câmera) */}
              <div className="w-full lg:w-[440px] grid gap-4">
                <ImageSlot label="Imagem • Câmera/RTSP" hint="Frame do vídeo ou foto da câmera." tall />
                <ImageSlot label="Imagem • ROI / HUD" hint="Print do ROI + contagem + HUD." tall />
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-12 pb-6 text-center text-xs text-white/45">
          © {year} MonPlant • Operação em tempo real • BucketVision integrado
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
    <div className={`rounded-[22px] border border-white/10 bg-white/[0.03] overflow-hidden ${tall ? "h-[190px] sm:h-[230px]" : "h-[160px]"}`}>
      <div className="h-full w-full relative">
        <div className="absolute inset-0 bg-[radial-gradient(520px_220px_at_15%_20%,rgba(255,255,255,0.08),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-orange-500/10" />
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
    <div className="rounded-[18px] border border-white/10 bg-black/25 p-4">
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
