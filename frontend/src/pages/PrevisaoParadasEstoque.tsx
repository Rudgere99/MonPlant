import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Clock,
  Factory,
  Filter,
  PackageX,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type PlantaFiltro = "todas" | "planta_01" | "planta_02";

type Parada = {
  id: number | string;
  planta?: "planta_01" | "planta_02" | string;
  unidade?: string;
  equipamento?: string;
  inicio?: string;
  fim?: string | null;
  data_inicio?: string;
  data_fim?: string | null;
  started_at?: string;
  ended_at?: string | null;
  causa?: string;
  motivo?: string;
  observacao?: string;
  observação?: string;
  descricao?: string;
  descrição?: string;
  justificativa?: string;
  duracao_minutos?: number;
  duracao?: number;
  minutos?: number;
  tipo_parada?: string;
  stop_type?: string;
  period?: string;
  day?: string;
  plant_id?: number;
  ordem?: number;
};

type AggregateStopRow = {
  id?: number;
  plant_id?: number;
  period?: string;
  equipamento?: string;
  equipment?: string;
  tipo_parada?: string;
  stop_type?: string;
  descricao?: string;
  description?: string;
  minutos?: number;
  minutes?: number;
  hora_inicial?: string;
  hora_final?: string;
  ordem?: number;
};

type AggregateStopsPayload = {
  day: string;
  rows?: AggregateStopRow[];
};

type CardIndicadorProps = {
  titulo: string;
  valor: string;
  subtitulo: string;
  icone: React.ReactNode;
  variante?: "azul" | "verde" | "laranja";
};

type ResumoMensal = {
  chave: string;
  mes: string;
  horas: number;
  toneladas: number;
  mediaProducao: number;
  eventos: number;
};

const API_BASE = String((import.meta as any)?.env?.VITE_API_BASE || "").replace(
  /\/+$/,
  "",
);

const CHART_AZUL = "#0ea5e9";
const CHART_VERDE = "#10b981";

function authHeaders(): HeadersInit {
  const token = (
    localStorage.getItem("mp_token") ||
    localStorage.getItem("token") ||
    ""
  ).trim();

  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function buscarJsonComTimeout<T>(
  url: string,
  timeoutMs = 20000,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: authHeaders(),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("Tempo limite excedido ao carregar paradas de estoque.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

const palavrasChaveEstoque = [
  "pilha cheia",
  "pilhas cheias",
  "falta de area de estoque",
  "falta de área de estoque",
  "sem area de estoque",
  "sem área de estoque",
  "area de estoque cheia",
  "área de estoque cheia",
  "cone cheio",
  "cones cheios",
  "pulmao cheio",
  "pulmão cheio",
  "estoque cheio",
  "restricao de estoque",
  "restrição de estoque",
  "restricao recebimento",
  "restrição recebimento",
  "sem local para estocar",
  "sem local de estoque",
  "sem praça de estoque",
  "praca de estoque cheia",
  "praça de estoque cheia",
  "restrição de área",
  "restricao de area",
  "sem destino",
  "destino cheio",
];

const metaHoraPorPlanta: Record<string, number> = {
  planta_01: 170,
  planta_02: 170,
};

function normalizarTexto(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function obterInicio(parada: Parada) {
  return parada.inicio || parada.data_inicio || parada.started_at || "";
}

function obterFim(parada: Parada) {
  return parada.fim || parada.data_fim || parada.ended_at || null;
}

function obterObservacaoCompleta(parada: Parada) {
  return [
    parada.causa,
    parada.motivo,
    parada.tipo_parada,
    parada.stop_type,
    parada.observacao,
    parada.observação,
    parada.descricao,
    parada.descrição,
    parada.justificativa,
  ]
    .filter(Boolean)
    .join(" ");
}

function obterPlantaNormalizada(planta?: string) {
  const texto = normalizarTexto(planta || "");

  if (
    texto.includes("planta_01") ||
    texto.includes("planta 01") ||
    texto.includes("planta-01") ||
    texto.includes("planta 1") ||
    texto === "1" ||
    texto === "01"
  ) {
    return "planta_01";
  }

  if (
    texto.includes("planta_02") ||
    texto.includes("planta 02") ||
    texto.includes("planta-02") ||
    texto.includes("planta 2") ||
    texto === "2" ||
    texto === "02"
  ) {
    return "planta_02";
  }

  return texto || "planta_01";
}

function obterNomePlanta(planta?: string) {
  const normalizada = obterPlantaNormalizada(planta);

  if (normalizada === "planta_01") return "Planta 01";
  if (normalizada === "planta_02") return "Planta 02";

  return planta || "-";
}

function minutosEntre(inicio: string, fim: string | null) {
  if (!inicio) return 0;

  const dataInicio = new Date(inicio);
  const dataFim = fim ? new Date(fim) : new Date();

  if (Number.isNaN(dataInicio.getTime()) || Number.isNaN(dataFim.getTime())) {
    return 0;
  }

  const diff = dataFim.getTime() - dataInicio.getTime();

  if (diff <= 0) return 0;

  return Math.round(diff / 60000);
}

function obterDuracaoMinutos(parada: Parada) {
  if (typeof parada.duracao_minutos === "number") return parada.duracao_minutos;
  if (typeof parada.duracao === "number") return parada.duracao;
  if (typeof parada.minutos === "number") return parada.minutos;

  return minutosEntre(obterInicio(parada), obterFim(parada));
}

function formatarHoras(minutos: number) {
  const horas = Math.floor(minutos / 60);
  const mins = Math.round(minutos % 60);

  return `${horas}h ${mins.toString().padStart(2, "0")}min`;
}

function formatarDecimal(valor: number, casas = 1) {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

function formatarToneladas(valor: number) {
  return valor.toLocaleString("pt-BR", {
    maximumFractionDigits: 0,
  });
}

function formatarLabelGrafico(valor: any) {
  const numero = Number(valor || 0);
  return numero.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatarDataHora(data?: string | null) {
  if (!data) return "-";

  const dataConvertida = new Date(data);

  if (Number.isNaN(dataConvertida.getTime())) {
    return "-";
  }

  return dataConvertida.toLocaleString("pt-BR");
}

function criarDataHora(day?: string, hora?: string) {
  if (!day || !hora) return undefined;
  return `${day}T${hora.slice(0, 5)}:00`;
}

function periodoParaInicio(day?: string, period?: string) {
  const hora = String(period || "").split("-", 1)[0];
  if (!day || !/^\d{1,2}$/.test(hora)) return undefined;
  return `${day}T${hora.padStart(2, "0")}:00:00`;
}

function adicionarMinutos(dataHora?: string, minutos = 0) {
  if (!dataHora) return undefined;
  const data = new Date(dataHora);
  if (Number.isNaN(data.getTime())) return undefined;
  data.setMinutes(data.getMinutes() + minutos);
  return data.toISOString();
}

function formatarDataISO(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function listarDiasPeriodo(inicio: string, fim: string) {
  const dias: string[] = [];
  const dataInicial = new Date(`${inicio}T00:00:00`);
  const dataFinal = new Date(`${fim}T00:00:00`);

  if (
    Number.isNaN(dataInicial.getTime()) ||
    Number.isNaN(dataFinal.getTime())
  ) {
    return dias;
  }

  for (
    const cursor = new Date(dataInicial);
    cursor.getTime() <= dataFinal.getTime();
    cursor.setDate(cursor.getDate() + 1)
  ) {
    dias.push(formatarDataISO(cursor));
  }

  return dias;
}

function transformarLinhaAgregada(day: string, row: AggregateStopRow): Parada {
  const minutos = Number(row.minutos ?? row.minutes ?? 0);
  const inicio =
    criarDataHora(day, row.hora_inicial) || periodoParaInicio(day, row.period);
  const fim =
    criarDataHora(day, row.hora_final) || adicionarMinutos(inicio, minutos);

  return {
    id: row.id || `${day}-${row.plant_id || 1}-${row.period}-${row.ordem || 1}`,
    day,
    plant_id: row.plant_id,
    planta: `planta_${String(row.plant_id || 1).padStart(2, "0")}`,
    equipamento: row.equipamento || row.equipment || "",
    inicio,
    fim,
    causa: row.tipo_parada || row.stop_type || "",
    motivo: row.tipo_parada || row.stop_type || "",
    descricao: row.descricao || row.description || "",
    observacao: row.descricao || row.description || "",
    minutos,
    period: row.period,
    ordem: row.ordem,
  };
}

function obterChaveMes(data?: string) {
  if (!data) return "Sem data";
  const dataConvertida = new Date(data);
  if (Number.isNaN(dataConvertida.getTime())) return "Sem data";
  return `${dataConvertida.getFullYear()}-${String(dataConvertida.getMonth() + 1).padStart(2, "0")}`;
}

function obterNomeMes(chave: string) {
  if (chave === "Sem data") return "Sem data";
  const [ano, mes] = chave.split("-").map(Number);
  const data = new Date(ano, mes - 1, 1);
  return data
    .toLocaleDateString("pt-BR", { month: "long" })
    .replace(/^./, (c) => c.toUpperCase());
}

function obterPeriodoAnalise(inicio: string, fim: string) {
  const inicioFmt = new Date(`${inicio}T00:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const fimFmt = new Date(`${fim}T00:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  return inicioFmt === fimFmt ? inicioFmt : `${inicioFmt} a ${fimFmt}`;
}

function classificarCausaEstoque(parada: Parada) {
  const texto = normalizarTexto(obterObservacaoCompleta(parada));

  if (texto.includes("pilha cheia") || texto.includes("pilhas cheias")) {
    return "Pilha cheia";
  }

  if (
    texto.includes("falta de area") ||
    texto.includes("sem area") ||
    texto.includes("area de estoque cheia") ||
    texto.includes("sem local de estoque") ||
    texto.includes("sem local para estocar") ||
    texto.includes("praca de estoque cheia") ||
    texto.includes("restricao de area")
  ) {
    return "Falta de área de estoque";
  }

  if (texto.includes("cone cheio") || texto.includes("cones cheios")) {
    return "Cone cheio";
  }

  if (texto.includes("pulmao cheio")) {
    return "Pulmão cheio";
  }

  if (texto.includes("estoque cheio")) {
    return "Estoque cheio";
  }

  if (
    texto.includes("destino cheio") ||
    texto.includes("sem destino") ||
    texto.includes("restricao de estoque") ||
    texto.includes("restricao recebimento")
  ) {
    return "Restrição de estoque";
  }

  return "Outras restrições de estoque";
}

function ehParadaEstoque(parada: Parada) {
  const texto = normalizarTexto(obterObservacaoCompleta(parada));

  return palavrasChaveEstoque.some((palavra) =>
    texto.includes(normalizarTexto(palavra)),
  );
}

export default function PrevisaoParadasEstoque() {
  const hoje = new Date().toISOString().slice(0, 10);

  const [dataInicio, setDataInicio] = useState(hoje);
  const [dataFim, setDataFim] = useState(hoje);
  const [planta, setPlanta] = useState<PlantaFiltro>("todas");
  const [paradas, setParadas] = useState<Parada[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    carregarParadas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataInicio, dataFim, planta]);

  async function carregarParadas() {
    try {
      setLoading(true);

      const dias = listarDiasPeriodo(dataInicio, dataFim);

      if (!dias.length) {
        setParadas([]);
        return;
      }

      const respostas = await Promise.all(
        dias.map((day) =>
          buscarJsonComTimeout<AggregateStopsPayload>(
            `${API_BASE}/api/aggregate/stops-launch?day=${encodeURIComponent(day)}`,
          ),
        ),
      );

      const paradasAgregadas = respostas.flatMap((payload) =>
        (payload.rows || []).map((row) =>
          transformarLinhaAgregada(payload.day, row),
        ),
      );

      setParadas(paradasAgregadas);
    } catch (error) {
      console.error("Erro ao carregar paradas de estoque:", error);
      setParadas([]);
    } finally {
      setLoading(false);
    }
  }

  const paradasFiltradas = useMemo(() => {
    return paradas.filter((parada) => {
      const plantaNormalizada = obterPlantaNormalizada(
        parada.planta || parada.unidade || parada.equipamento,
      );

      const passaPlanta =
        planta === "todas" ? true : plantaNormalizada === planta;

      return ehParadaEstoque(parada) && passaPlanta;
    });
  }, [paradas, planta]);

  const dadosCalculados = useMemo(() => {
    const totalMinutos = paradasFiltradas.reduce((acc, parada) => {
      return acc + obterDuracaoMinutos(parada);
    }, 0);

    const totalHoras = totalMinutos / 60;

    const toneladasPerdidas = paradasFiltradas.reduce((acc, parada) => {
      const minutos = obterDuracaoMinutos(parada);
      const horas = minutos / 60;
      const plantaNormalizada = obterPlantaNormalizada(
        parada.planta || parada.unidade || parada.equipamento,
      );
      const metaHora = metaHoraPorPlanta[plantaNormalizada] || 0;

      return acc + horas * metaHora;
    }, 0);

    const mediaPerdaHora = totalHoras > 0 ? toneladasPerdidas / totalHoras : 0;

    const diasPeriodo = Math.max(
      1,
      Math.ceil(
        (new Date(dataFim).getTime() - new Date(dataInicio).getTime()) /
          86400000,
      ) + 1,
    );

    const mediaHorasParadasDia = totalHoras / diasPeriodo;
    const previsaoHorasMes = mediaHorasParadasDia * 30;
    const previsaoPerdaMes = mediaPerdaHora * previsaoHorasMes;

    return {
      totalMinutos,
      totalHoras,
      toneladasPerdidas,
      mediaPerdaHora,
      mediaHorasParadasDia,
      previsaoHorasMes,
      previsaoPerdaMes,
    };
  }, [paradasFiltradas, dataInicio, dataFim]);

  const resumoMensal = useMemo(() => {
    const mapa = new Map<string, ResumoMensal>();

    paradasFiltradas.forEach((parada) => {
      const inicio = obterInicio(parada);
      const chave = obterChaveMes(inicio || parada.day);
      const minutos = obterDuracaoMinutos(parada);
      const horas = minutos / 60;
      const plantaNormalizada = obterPlantaNormalizada(
        parada.planta || parada.unidade || parada.equipamento,
      );
      const metaHora = metaHoraPorPlanta[plantaNormalizada] || 0;
      const toneladas = horas * metaHora;
      const atual = mapa.get(chave) || {
        chave,
        mes: obterNomeMes(chave),
        horas: 0,
        toneladas: 0,
        mediaProducao: 0,
        eventos: 0,
      };

      atual.horas += horas;
      atual.toneladas += toneladas;
      atual.eventos += 1;
      atual.mediaProducao = atual.horas > 0 ? atual.toneladas / atual.horas : 0;

      mapa.set(chave, atual);
    });

    return Array.from(mapa.values()).sort((a, b) =>
      a.chave.localeCompare(b.chave),
    );
  }, [paradasFiltradas]);

  const rankingCausas = useMemo(() => {
    const mapa = new Map<
      string,
      { causa: string; minutos: number; toneladas: number; eventos: number }
    >();

    paradasFiltradas.forEach((parada) => {
      const causaClassificada = classificarCausaEstoque(parada);
      const minutos = obterDuracaoMinutos(parada);
      const horas = minutos / 60;
      const plantaNormalizada = obterPlantaNormalizada(
        parada.planta || parada.unidade || parada.equipamento,
      );
      const toneladas = horas * (metaHoraPorPlanta[plantaNormalizada] || 0);

      const atual = mapa.get(causaClassificada) || {
        causa: causaClassificada,
        minutos: 0,
        toneladas: 0,
        eventos: 0,
      };

      atual.minutos += minutos;
      atual.toneladas += toneladas;
      atual.eventos += 1;

      mapa.set(causaClassificada, atual);
    });

    return Array.from(mapa.values())
      .sort((a, b) => b.minutos - a.minutos)
      .map((item) => ({
        ...item,
        horas: Number((item.minutos / 60).toFixed(1)),
        toneladas: Number(item.toneladas.toFixed(0)),
      }));
  }, [paradasFiltradas]);

  const maiorImpacto = useMemo(() => {
    return resumoMensal.reduce<ResumoMensal | null>((maior, item) => {
      if (!maior || item.toneladas > maior.toneladas) return item;
      return maior;
    }, null);
  }, [resumoMensal]);

  const plantaSelecionada =
    planta === "todas" ? "Todas as plantas" : obterNomePlanta(planta);

  return (
    <div className="min-h-screen bg-[#05070A] text-white p-4 md:p-6">
      <div className="relative mx-auto w-full max-w-[1540px] overflow-hidden rounded-[28px] border border-sky-500/20 bg-[#07111b] shadow-2xl shadow-black/40">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_30%)]" />
        <div className="pointer-events-none absolute right-0 top-0 h-28 w-28 border-r-[42px] border-t-[42px] border-r-[#0f766e] border-t-[#0b3b66]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-10 w-[36%] bg-gradient-to-r from-transparent via-emerald-600 to-emerald-500" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-10 w-[64%] bg-gradient-to-r from-[#082f49] to-[#0b3b66]" />

        <div className="relative space-y-6 p-4 pb-16 md:p-8 md:pb-20">
          <header className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur md:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col gap-5 md:flex-row md:items-center">
                <div className="flex min-h-24 items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
                  <img
                    src="/assets/logo-trindade.png"
                    alt="Trindade Mineração"
                    className="h-16 w-auto max-w-[260px] object-contain"
                  />
                </div>

                <div className="h-20 w-px hidden bg-emerald-500/70 md:block" />

                <div>
                  <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-400">
                    MonPlant • Estoque
                  </p>
                  <h1 className="mt-2 max-w-4xl text-3xl font-black leading-tight tracking-tight text-sky-100 md:text-5xl">
                    Relatório de Horas de Paradas Operacionais da Planta e
                    Toneladas Perdidas
                  </h1>
                  <p className="mt-3 text-lg font-extrabold text-emerald-400">
                    Análise mensal — {obterPeriodoAnalise(dataInicio, dataFim)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-[#05070A]/70 p-3">
                <div className="flex items-center gap-2 text-zinc-300">
                  <Filter size={18} />
                  <span className="text-sm font-bold">Filtros</span>
                </div>

                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="rounded-xl border border-sky-500/20 bg-[#05070A] px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />

                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="rounded-xl border border-sky-500/20 bg-[#05070A] px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />

                <select
                  value={planta}
                  onChange={(e) => setPlanta(e.target.value as PlantaFiltro)}
                  className="rounded-xl border border-sky-500/20 bg-[#05070A] px-3 py-2 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="todas">Todas as Plantas</option>
                  <option value="planta_01">Planta 01</option>
                  <option value="planta_02">Planta 02</option>
                </select>
              </div>
            </div>
          </header>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <CardIndicador
              titulo="Total de Horas de Paradas Operacionais da Planta"
              valor={`${formatarDecimal(dadosCalculados.totalHoras)} h`}
              subtitulo={`${plantaSelecionada} • ${paradasFiltradas.length} ocorrência(s)`}
              icone={<Clock size={34} />}
              variante="azul"
            />

            <CardIndicador
              titulo="Total de Toneladas Perdidas"
              valor={`${formatarDecimal(dadosCalculados.toneladasPerdidas)} t`}
              subtitulo={`Produção horária média: ${formatarDecimal(dadosCalculados.mediaPerdaHora)} t/h`}
              icone={<Factory size={34} />}
              variante="verde"
            />

            <CardIndicador
              titulo="Maior Impacto"
              valor={
                maiorImpacto
                  ? `${maiorImpacto.mes} — ${formatarDecimal(maiorImpacto.horas)} h`
                  : "Sem dados"
              }
              subtitulo={
                maiorImpacto
                  ? `${formatarDecimal(maiorImpacto.toneladas)} t perdidas`
                  : "Aguardando lançamentos"
              }
              icone={<BarChart3 size={34} />}
              variante="azul"
            />
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <PainelGrafico
              titulo="Horas de Paradas Operacionais da Planta por Mês"
              subtitulo="Soma de horas por restrições de estoque"
              cor="azul"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={resumoMensal}
                  margin={{ top: 24, right: 22, bottom: 10, left: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(148,163,184,0.18)"
                  />
                  <XAxis
                    dataKey="mes"
                    stroke="#cbd5e1"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis stroke="#cbd5e1" />
                  <Tooltip content={<GraficoTooltip unidade="h" />} />
                  <Bar dataKey="horas" name="Horas" radius={[8, 8, 0, 0]}>
                    <LabelList
                      dataKey="horas"
                      position="top"
                      formatter={formatarLabelGrafico}
                      fill="#bae6fd"
                      fontSize={13}
                      fontWeight={900}
                    />
                    {resumoMensal.map((_, index) => (
                      <Cell key={index} fill={CHART_AZUL} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </PainelGrafico>

            <PainelGrafico
              titulo="Perda em Toneladas por Mês"
              subtitulo="Estimativa com base na meta horária da planta"
              cor="verde"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={resumoMensal}
                  margin={{ top: 24, right: 22, bottom: 10, left: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(148,163,184,0.18)"
                  />
                  <XAxis
                    dataKey="mes"
                    stroke="#cbd5e1"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis stroke="#cbd5e1" />
                  <Tooltip content={<GraficoTooltip unidade="t" />} />
                  <Bar
                    dataKey="toneladas"
                    name="Toneladas"
                    radius={[8, 8, 0, 0]}
                  >
                    <LabelList
                      dataKey="toneladas"
                      position="top"
                      formatter={formatarLabelGrafico}
                      fill="#a7f3d0"
                      fontSize={13}
                      fontWeight={900}
                    />
                    {resumoMensal.map((_, index) => (
                      <Cell key={index} fill={CHART_VERDE} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </PainelGrafico>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
            <div className="overflow-hidden rounded-3xl border border-sky-500/20 bg-[#071827]/90 shadow-xl shadow-black/20">
              <div className="bg-gradient-to-r from-[#075985] to-[#0b3b66] px-5 py-3 text-center text-lg font-black text-white">
                Consolidado Mensal da Planta
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03] text-sky-100">
                      <th className="px-4 py-3 text-left">Mês</th>
                      <th className="px-4 py-3 text-right">
                        Horas de Paradas Operacionais da Planta
                      </th>
                      <th className="px-4 py-3 text-right">Produção Horária</th>
                      <th className="px-4 py-3 text-right">
                        Perda em Toneladas
                      </th>
                      <th className="px-4 py-3 text-right">Eventos</th>
                    </tr>
                  </thead>

                  <tbody>
                    {loading ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-zinc-400"
                        >
                          Carregando paradas de estoque...
                        </td>
                      </tr>
                    ) : resumoMensal.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-zinc-400"
                        >
                          Nenhuma parada de estoque encontrada no período.
                        </td>
                      </tr>
                    ) : (
                      resumoMensal.map((item) => (
                        <tr
                          key={item.chave}
                          className="border-b border-white/10 hover:bg-white/[0.04]"
                        >
                          <td className="px-4 py-3 font-black text-sky-100">
                            {item.mes}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatarDecimal(item.horas)} h
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatarDecimal(item.mediaProducao)} t/h
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-emerald-300">
                            {formatarDecimal(item.toneladas)} t
                          </td>
                          <td className="px-4 py-3 text-right">
                            {item.eventos}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-3xl border border-orange-500/30 bg-orange-500/10 p-5">
                <div className="flex items-center gap-3 text-orange-300">
                  <AlertTriangle />
                  <h2 className="text-lg font-black">Previsão operacional</h2>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-black/25 p-4">
                    <p className="text-xs text-zinc-400">
                      Horas previstas / 30 dias
                    </p>
                    <p className="mt-2 text-2xl font-black text-orange-200">
                      {formatarHoras(
                        Math.round(dadosCalculados.previsaoHorasMes * 60),
                      )}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-black/25 p-4">
                    <p className="text-xs text-zinc-400">Perda prevista</p>
                    <p className="mt-2 text-2xl font-black text-orange-200">
                      {formatarToneladas(dadosCalculados.previsaoPerdaMes)} t
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-zinc-300">
                  Projeção calculada pela média diária do período filtrado,
                  mantendo a taxa atual de perdas por restrição de estoque.
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-black text-sky-100">
                    Causas identificadas
                  </h2>
                  <PackageX className="text-emerald-400" />
                </div>
                <div className="space-y-3">
                  {rankingCausas.length === 0 ? (
                    <p className="text-sm text-zinc-400">
                      Sem causas classificadas no período.
                    </p>
                  ) : (
                    rankingCausas.slice(0, 5).map((item) => (
                      <div
                        key={item.causa}
                        className="rounded-2xl border border-white/10 bg-black/20 p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-bold text-zinc-100">
                            {item.causa}
                          </span>
                          <span className="text-sm font-black text-emerald-300">
                            {formatarDecimal(item.horas)} h
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400"
                            style={{
                              width: `${Math.min(
                                100,
                                dadosCalculados.totalHoras > 0
                                  ? (item.horas / dadosCalculados.totalHoras) *
                                      100
                                  : 0,
                              )}%`,
                            }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-zinc-400">
                          {item.eventos} evento(s) •{" "}
                          {formatarToneladas(item.toneladas)} t perdidas
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </aside>
          </section>

          <section className="rounded-3xl border border-sky-500/20 bg-[#071827]/90 p-5">
            <div className="mb-4 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-lg font-black text-sky-100">
                  Detalhamento das Paradas de Estoque
                </h2>
                <p className="text-sm text-zinc-400">
                  Eventos classificados por descrição, observação, motivo ou
                  causa.
                </p>
              </div>

              <div className="text-sm text-zinc-400">
                Total encontrado:{" "}
                <span className="font-black text-emerald-400">
                  {paradasFiltradas.length}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03] text-zinc-300">
                    <th className="px-3 py-3 text-left">Planta</th>
                    <th className="px-3 py-3 text-left">Início</th>
                    <th className="px-3 py-3 text-left">Fim</th>
                    <th className="px-3 py-3 text-left">Classificação</th>
                    <th className="px-3 py-3 text-left">
                      Observação/Descrição
                    </th>
                    <th className="px-3 py-3 text-right">Horas</th>
                    <th className="px-3 py-3 text-right">Perda Estimada</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-8 text-center text-zinc-400"
                      >
                        Carregando paradas...
                      </td>
                    </tr>
                  ) : paradasFiltradas.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-8 text-center text-zinc-400"
                      >
                        Nenhuma parada de estoque encontrada no período.
                      </td>
                    </tr>
                  ) : (
                    paradasFiltradas.map((parada) => {
                      const minutos = obterDuracaoMinutos(parada);
                      const horas = minutos / 60;
                      const plantaNormalizada = obterPlantaNormalizada(
                        parada.planta || parada.unidade || parada.equipamento,
                      );
                      const perda =
                        horas * (metaHoraPorPlanta[plantaNormalizada] || 0);

                      return (
                        <tr
                          key={parada.id}
                          className="border-b border-white/10 hover:bg-white/[0.04]"
                        >
                          <td className="px-3 py-3">
                            {obterNomePlanta(
                              parada.planta ||
                                parada.unidade ||
                                parada.equipamento,
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {formatarDataHora(obterInicio(parada))}
                          </td>
                          <td className="px-3 py-3">
                            {obterFim(parada)
                              ? formatarDataHora(obterFim(parada))
                              : "Em aberto"}
                          </td>
                          <td className="px-3 py-3 font-bold text-emerald-300">
                            {classificarCausaEstoque(parada)}
                          </td>
                          <td className="max-w-[520px] px-3 py-3 text-zinc-300">
                            {obterObservacaoCompleta(parada) || "-"}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {formatarDecimal(horas)} h
                          </td>
                          <td className="px-3 py-3 text-right font-bold">
                            {formatarToneladas(perda)} t
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="flex gap-3 rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-sm leading-relaxed text-zinc-300">
            <div className="grid h-8 w-8 flex-none place-items-center rounded-full border border-emerald-400 text-lg font-black text-emerald-300">
              i
            </div>
            <p>
              As horas informadas neste relatório referem-se às paradas
              operacionais da planta por pilha cheia, falta de área de estoque,
              cones cheios, pulmão cheio e restrições de recebimento. As
              toneladas perdidas são estimativas baseadas na meta horária
              cadastrada por planta.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

function CardIndicador({
  titulo,
  valor,
  subtitulo,
  icone,
  variante = "azul",
}: CardIndicadorProps) {
  const estilo = {
    azul: "border-sky-500/25 from-sky-500/15 to-[#071827] text-sky-300",
    verde:
      "border-emerald-500/25 from-emerald-500/15 to-[#071827] text-emerald-300",
    laranja:
      "border-orange-500/25 from-orange-500/15 to-[#071827] text-orange-300",
  }[variante];

  return (
    <div
      className={`rounded-3xl border bg-gradient-to-br ${estilo} p-5 shadow-xl shadow-black/20`}
    >
      <div className="flex items-center gap-5">
        <div className="grid h-20 w-20 flex-none place-items-center rounded-full bg-current/10 text-current ring-1 ring-current/20">
          {icone}
        </div>
        <div className="min-w-0">
          <p className="text-base font-black leading-snug text-sky-100">
            {titulo}
          </p>
          <p className="mt-2 text-4xl font-black tracking-tight text-white">
            {valor}
          </p>
          <p className="mt-2 text-sm font-semibold text-zinc-400">
            {subtitulo}
          </p>
        </div>
      </div>
    </div>
  );
}

function PainelGrafico({
  titulo,
  subtitulo,
  cor,
  children,
}: {
  titulo: string;
  subtitulo: string;
  cor: "azul" | "verde";
  children: React.ReactNode;
}) {
  const barra =
    cor === "verde"
      ? "from-emerald-600 to-emerald-500"
      : "from-[#075985] to-[#0b3b66]";

  return (
    <div className="rounded-3xl border border-sky-500/20 bg-[#071827]/90 p-5 shadow-xl shadow-black/20">
      <div className="mb-4 text-center">
        <div
          className={`mx-auto inline-flex rounded-lg bg-gradient-to-r ${barra} px-6 py-2 text-lg font-black text-white shadow-lg`}
        >
          {titulo}
        </div>
        <p className="mt-2 text-sm text-zinc-400">{subtitulo}</p>
      </div>
      <div className="h-[330px]">{children}</div>
    </div>
  );
}

function GraficoTooltip({ active, payload, label, unidade }: any) {
  if (!active || !payload?.length) return null;
  const valor = Number(payload[0]?.value || 0);

  return (
    <div className="rounded-xl border border-white/10 bg-[#05070A] px-4 py-3 text-sm shadow-xl">
      <p className="font-black text-sky-100">{label}</p>
      <p className="mt-1 text-emerald-300">
        {formatarDecimal(valor)} {unidade}
      </p>
    </div>
  );
}
