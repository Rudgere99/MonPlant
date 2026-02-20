import React from "react";
import { useNavigate } from "react-router-dom";

export default function MonPlantInfo() {
  const nav = useNavigate();

  return (
    <div className="min-h-screen w-full bg-[#070A10] text-white relative overflow-hidden">
      {/* glow */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(16,185,129,.22), transparent 60%)" }}
        />
        <div
          className="absolute -bottom-44 -right-44 h-[620px] w-[620px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(59,130,246,.16), transparent 60%)" }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-10">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 grid place-items-center">
              <span className="text-lg font-black">MP</span>
            </div>
            <div>
              <div className="text-sm font-semibold">MonPlant</div>
              <div className="text-xs text-white/50">Trindade Mineração • Operação</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="mp-btn"
              style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.10)" }}
              onClick={() => nav("/login")}
            >
              Voltar
            </button>
            <button type="button" className="mp-btn mp-btn-primary" onClick={() => nav("/login")}
            >
              Acessar
            </button>
          </div>
        </div>

        {/* Hero */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Comunicação oficial + indicadores em tempo real
            </div>

            <h1 className="mt-5 text-4xl md:text-6xl font-extrabold tracking-tight">
              Um painel único para
              <span className="block text-white/70">produzir com clareza</span>
            </h1>

            <p className="mt-5 text-white/70 max-w-2xl leading-relaxed">
              O MonPlant centraliza Produção da Planta, Paradas, Horímetros e o canal oficial de Avisos do Supervisor.
              Ele existe para reduzir retrabalho, eliminar ruído de rádio e dar rastreabilidade (quem informou, quando,
              e o que foi confirmado).
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
                ✅ Fonte única da verdade (CCO + Supervisor)
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
                ✅ Auditoria: histórico e confirmação
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
                ✅ Mais agilidade nos lançamentos
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="mp-card" style={{ padding: 18 }}>
              <div className="text-sm font-semibold">O que você encontra</div>
              <div className="mt-3 grid gap-10">
                {[{
                  title: "Dashboard",
                  desc: "Visão geral do dia e últimos 7 dias."
                }, {
                  title: "Ritmo do turno",
                  desc: "Necessário vs média real (t/h e conchadas/h)."
                }, {
                  title: "Paradas",
                  desc: "Registro e análise por equipamento / motivo."
                }, {
                  title: "Avisos do Supervisor",
                  desc: "Comunicação oficial com confirmação de leitura."
                }].map((it) => (
                  <div key={it.title} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="font-semibold">{it.title}</div>
                    <div className="mt-1 text-sm text-white/60">{it.desc}</div>
                  </div>
                ))}
              </div>

              <div className="mt-10 text-xs text-white/45">
                * Para acesso, use seu usuário corporativo. Em caso de dúvida, procure o administrador do sistema.
              </div>
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="mp-card" style={{ padding: 18 }}>
            <div className="text-sm font-semibold">Por que existe</div>
            <div className="mt-2 text-sm text-white/65 leading-relaxed">
              Lançamentos dependiam de rádio e interpretações diferentes. O MonPlant cria um canal oficial e um histórico
              para reduzir erros e alinhar o time.
            </div>
          </div>

          <div className="mp-card" style={{ padding: 18 }}>
            <div className="text-sm font-semibold">Como funciona o aviso</div>
            <div className="mt-2 text-sm text-white/65 leading-relaxed">
              Quando o Supervisor publica, aparece um pop-up para todos os usuários, exigindo confirmação.
              Assim ninguém perde a informação crítica.
            </div>
          </div>

          <div className="mp-card" style={{ padding: 18 }}>
            <div className="text-sm font-semibold">Boas práticas</div>
            <ul className="mt-2 text-sm text-white/65 space-y-2 list-disc pl-5">
              <li>Informe período (07–08) e horário da confirmação.</li>
              <li>Se estiver “em ajuste”, peça para aguardar confirmação.</li>
              <li>Encerre quando consolidar para limpar o painel.</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex items-center justify-between">
          <div className="text-sm text-white/50">© {new Date().getFullYear()} Trindade Mineração • MonPlant</div>
          <button type="button" className="mp-btn mp-btn-primary" onClick={() => nav("/login")}
          >
            Ir para o login
          </button>
        </div>
      </div>
    </div>
  );
}
