import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Clock,
  Factory,
  Filter,
  PackageX,
  TrendingDown,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
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
};

type CardIndicadorProps = {
  titulo: string;
  valor: string;
  subtitulo: string;
  icone: React.ReactNode;
  destaque?: boolean;
};

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
  if (typeof parada.duracao_minutos === "number") {
    return parada.duracao_minutos;
  }

  if (typeof parada.duracao === "number") {
    return parada.duracao;
  }

  return minutosEntre(obterInicio(parada), obterFim(parada));
}

function formatarHoras(minutos: number) {
  const horas = Math.floor(minutos / 60);
  const mins = Math.round(minutos % 60);

  return `${horas}h ${mins.toString().padStart(2, "0")}min`;
}

function formatarToneladas(valor: number) {
  return valor.toLocaleString("pt-BR", {
    maximumFractionDigits: 0,
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
    texto.includes(normalizarTexto(palavra))
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

      const params = new URLSearchParams({
        dataInicio,
        dataFim,
        planta,
      });

      const response = await fetch(`/api/paradas?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Erro ao carregar paradas");
      }

      const data = await response.json();

      if (Array.isArray(data)) {
        setParadas(data);
      } else if (Array.isArray(data.paradas)) {
        setParadas(data.paradas);
      } else if (Array.isArray(data.items)) {
        setParadas(data.items);
      } else if (Array.isArray(data.data)) {
        setParadas(data.data);
      } else {
        setParadas([]);
      }
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
        parada.planta || parada.unidade || parada.equipamento
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
        parada.planta || parada.unidade || parada.equipamento
      );
      const metaHora = metaHoraPorPlanta[plantaNormalizada] || 0;

      return acc + horas * metaHora;
    }, 0);

    const mediaPerdaHora =
      totalHoras > 0 ? toneladasPerdidas / totalHoras : 0;

    const diasPeriodo =
      Math.max(
        1,
        Math.ceil(
          (new Date(dataFim).getTime() - new Date(dataInicio).getTime()) /
            86400000
        ) + 1
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

  const rankingCausas = useMemo(() => {
    const mapa = new Map<
      string,
      { causa: string; minutos: number; toneladas: number }
    >();

    paradasFiltradas.forEach((parada) => {
      const causaClassificada = classificarCausaEstoque(parada);
      const minutos = obterDuracaoMinutos(parada);
      const horas = minutos / 60;
      const plantaNormalizada = obterPlantaNormalizada(
        parada.planta || parada.unidade || parada.equipamento
      );
      const toneladas = horas * (metaHoraPorPlanta[plantaNormalizada] || 0);

      const atual = mapa.get(causaClassificada) || {
        causa: causaClassificada,
        minutos: 0,
        toneladas: 0,
      };

      atual.minutos += minutos;
      atual.toneladas += toneladas;

      mapa.set(causaClassificada, atual);
    });

    return Array.from(mapa.values())
      .sort((a, b) => b.minutos - a.minutos)
      .map((item) => ({
        ...item,
        horas: Number((item.minutos / 60).toFixed(2)),
        toneladas: Number(item.toneladas.toFixed(0)),
      }));
  }, [paradasFiltradas]);

  const evolucaoDiaria = useMemo(() => {
    const mapa = new Map<
      string,
      { data: string; horas: number; toneladas: number }
    >();

    paradasFiltradas.forEach((parada) => {
      const inicio = obterInicio(parada);
      const dataConvertida = inicio ? new Date(inicio) : null;

      const data =
        dataConvertida && !Number.isNaN(dataConvertida.getTime())
          ? dataConvertida.toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
            })
          : "-";

      const minutos = obterDuracaoMinutos(parada);
      const horas = minutos / 60;
      const plantaNormalizada = obterPlantaNormalizada(
        parada.planta || parada.unidade || parada.equipamento
      );
      const toneladas = horas * (metaHoraPorPlanta[plantaNormalizada] || 0);

      const atual = mapa.get(data) || {
        data,
        horas: 0,
        toneladas: 0,
      };

      atual.horas += horas;
      atual.toneladas += toneladas;

      mapa.set(data, atual);
    });

    return Array.from(mapa.values()).map((item) => ({
      ...item,
      horas: Number(item.horas.toFixed(2)),
      toneladas: Number(item.toneladas.toFixed(0)),
    }));
  }, [paradasFiltradas]);

  return (
    <div className="min-h-screen bg-[#05070A] text-white p-6">
      <div className="w-full space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-wide">
              Previsão de Paradas por Estoque
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Identificação de paradas por pilha cheia, falta de área de
              estoque, cones cheios e restrições de recebimento.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-[#0B1118] border border-zinc-800 rounded-2xl p-3">
            <div className="flex items-center gap-2 text-zinc-400">
              <Filter size={18} />
              <span className="text-sm">Filtros</span>
            </div>

            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="bg-[#05070A] border border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-500"
            />

            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="bg-[#05070A] border border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-500"
            />

            <select
              value={planta}
              onChange={(e) => setPlanta(e.target.value as PlantaFiltro)}
              className="bg-[#05070A] border border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-500"
            >
              <option value="todas">Todas as Plantas</option>
              <option value="planta_01">Planta 01</option>
              <option value="planta_02">Planta 02</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <CardIndicador
            titulo="Horas Paradas"
            valor={formatarHoras(dadosCalculados.totalMinutos)}
            subtitulo="Restrições de estoque"
            icone={<Clock size={22} />}
          />

          <CardIndicador
            titulo="Produção Perdida"
            valor={`${formatarToneladas(dadosCalculados.toneladasPerdidas)} t`}
            subtitulo="Estimativa por meta/hora"
            icone={<TrendingDown size={22} />}
            destaque
          />

          <CardIndicador
            titulo="Média Perdida"
            valor={`${formatarToneladas(dadosCalculados.mediaPerdaHora)} t/h`}
            subtitulo="Durante as paradas"
            icone={<BarChart3 size={22} />}
          />

          <CardIndicador
            titulo="Previsão Mensal"
            valor={formatarHoras(Math.round(dadosCalculados.previsaoHorasMes * 60))}
            subtitulo="Mantendo a média atual"
            icone={<AlertTriangle size={22} />}
          />

          <CardIndicador
            titulo="Perda Prevista"
            valor={`${formatarToneladas(dadosCalculados.previsaoPerdaMes)} t`}
            subtitulo="Projeção para 30 dias"
            icone={<Factory size={22} />}
            destaque
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-[#0B1118] border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Ranking das Causas</h2>
                <p className="text-sm text-zinc-400">
                  Horas paradas por restrição operacional
                </p>
              </div>
              <PackageX className="text-orange-400" />
            </div>

            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankingCausas}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis
                    dataKey="causa"
                    stroke="#9ca3af"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-12}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0B1118",
                      border: "1px solid #27272a",
                      borderRadius: "12px",
                      color: "#fff",
                    }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Bar dataKey="horas" name="Horas paradas" radius={[8, 8, 0, 0]}>
                    {rankingCausas.map((_, index) => (
                      <Cell
                        key={index}
                        fill={index === 0 ? "#f97316" : "#2563eb"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-[#0B1118] border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Evolução Diária</h2>
                <p className="text-sm text-zinc-400">
                  Horas paradas e toneladas perdidas
                </p>
              </div>
              <BarChart3 className="text-blue-400" />
            </div>

            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolucaoDiaria}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="data" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0B1118",
                      border: "1px solid #27272a",
                      borderRadius: "12px",
                      color: "#fff",
                    }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="horas"
                    name="Horas paradas"
                    stroke="#f97316"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="toneladas"
                    name="Toneladas perdidas"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-[#0B1118] border border-zinc-800 rounded-2xl p-5">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2 mb-4">
            <div>
              <h2 className="text-lg font-semibold">Detalhamento das Paradas</h2>
              <p className="text-sm text-zinc-400">
                Eventos classificados pela descrição, observação, motivo ou causa
              </p>
            </div>

            <div className="text-sm text-zinc-400">
              Total encontrado:{" "}
              <span className="text-orange-400 font-semibold">
                {paradasFiltradas.length}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="text-left py-3 px-2">Planta</th>
                  <th className="text-left py-3 px-2">Início</th>
                  <th className="text-left py-3 px-2">Fim</th>
                  <th className="text-left py-3 px-2">Classificação</th>
                  <th className="text-left py-3 px-2">Observação/Descrição</th>
                  <th className="text-right py-3 px-2">Horas</th>
                  <th className="text-right py-3 px-2">Perda Estimada</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-zinc-400">
                      Carregando paradas...
                    </td>
                  </tr>
                ) : paradasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-zinc-400">
                      Nenhuma parada de estoque encontrada no período.
                    </td>
                  </tr>
                ) : (
                  paradasFiltradas.map((parada) => {
                    const minutos = obterDuracaoMinutos(parada);
                    const horas = minutos / 60;
                    const plantaNormalizada = obterPlantaNormalizada(
                      parada.planta || parada.unidade || parada.equipamento
                    );
                    const perda =
                      horas * (metaHoraPorPlanta[plantaNormalizada] || 0);

                    return (
                      <tr
                        key={parada.id}
                        className="border-b border-zinc-900 hover:bg-[#111827]"
                      >
                        <td className="py-3 px-2">
                          {obterNomePlanta(
                            parada.planta || parada.unidade || parada.equipamento
                          )}
                        </td>

                        <td className="py-3 px-2">
                          {formatarDataHora(obterInicio(parada))}
                        </td>

                        <td className="py-3 px-2">
                          {obterFim(parada)
                            ? formatarDataHora(obterFim(parada))
                            : "Em aberto"}
                        </td>

                        <td className="py-3 px-2 text-orange-400 font-medium">
                          {classificarCausaEstoque(parada)}
                        </td>

                        <td className="py-3 px-2 text-zinc-300 max-w-[520px]">
                          {obterObservacaoCompleta(parada) || "-"}
                        </td>

                        <td className="py-3 px-2 text-right">
                          {horas.toFixed(2)} h
                        </td>

                        <td className="py-3 px-2 text-right font-semibold">
                          {formatarToneladas(perda)} t
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-[#111827] border border-orange-500/30 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-orange-400 mb-2">
            Leitura Operacional
          </h2>

          <p className="text-sm text-zinc-300 leading-relaxed">
            As perdas apresentadas são estimadas com base na duração das paradas
            classificadas como restrição de estoque e na meta horária definida
            por planta. A previsão mensal considera a média diária do período
            filtrado projetada para 30 dias. Essa visão permite identificar
            gargalos recorrentes relacionados a pilha cheia, falta de área de
            estoque, cones cheios, pulmão cheio e restrições de recebimento,
            apoiando a tomada de decisão entre Mina, Planta e Expedição.
          </p>
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
  destaque = false,
}: CardIndicadorProps) {
  return (
    <div
      className={`rounded-2xl p-5 border ${
        destaque
          ? "bg-orange-500/10 border-orange-500/40"
          : "bg-[#0B1118] border-zinc-800"
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-zinc-400">{titulo}</span>
        <div className={destaque ? "text-orange-400" : "text-blue-400"}>
          {icone}
        </div>
      </div>

      <div className="text-2xl font-bold">{valor}</div>
      <div className="text-xs text-zinc-500 mt-1">{subtitulo}</div>
    </div>
  );
}
