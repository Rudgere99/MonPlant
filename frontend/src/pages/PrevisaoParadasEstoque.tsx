import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
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
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type PlantaFiltro = "todas" | "planta_01" | "planta_02";
type TipoParadaFiltro = "todas" | "operacional" | "corretiva" | "preventiva";

type StopLaunchRow = {
  id?: number | string | null;
  day?: string;
  plant_id?: number | string;
  period?: string;
  ordem?: number;
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
  justificativa_baixa_producao?: string;
};

type AggregateStopsPayload = {
  day: string;
  scope?: string;
  obs?: string;
  rows?: StopLaunchRow[];
  summaries_by_plant_period?: Record<string, any>;
};

type PlantProductionRow = {
  period?: string;
  ton?: number | string | null;
  freq?: number | string | null;
};

type PlantProductionPayload = {
  day: string;
  plant_id?: number;
  rows?: PlantProductionRow[];
};

type ParadaEstoque = {
  id: string;
  day: string;
  planta: "planta_01" | "planta_02";
  plant_id: number;
  period: string;
  equipamento: string;
  tipo_parada: string;
  descricao: string;
  observacaoCompleta: string;
  minutos: number;
  hora_inicial: string;
  hora_final: string;
};

type ResumoMensal = {
  chave: string;
  mes: string;
  horas: number;
  toneladas: number;
  mediaProducao: number;
  eventos: number;
};

type ResumoProducaoReal = {
  producaoTotal: number;
  horasComProducao: number;
  mediaHora: number;
};

const API_BASE = String((import.meta as any)?.env?.VITE_API_BASE || "").replace(/\/+$/, "");

const producaoHoraFallbackPorPlanta: Record<string, number> = {
  planta_01: 0,
  planta_02: 0,
};

const tiposParadaPadronizados = [
  {
    value: "operacional",
    label: "Operacional",
    palavras: ["operacional", "operação", "operacao"],
  },
  {
    value: "corretiva",
    label: "Corretiva",
    palavras: ["corretiva", "manutencao corretiva", "manutenção corretiva"],
  },
  {
    value: "preventiva",
    label: "Preventiva",
    palavras: ["preventiva", "manutencao preventiva", "manutenção preventiva"],
  },
] as const;

function obterTipoParadaPadronizado(textoOriginal: string): TipoParadaFiltro | "outros" {
  const texto = normalizarTexto(textoOriginal);

  for (const tipo of tiposParadaPadronizados) {
    const encontrou = tipo.palavras.some((palavra) =>
      texto.includes(normalizarTexto(palavra))
    );

    if (encontrou) {
      return tipo.value;
    }
  }

  return "outros";
}

function obterLabelTipoParada(tipo: string) {
  if (tipo === "operacional") return "Operacional";
  if (tipo === "corretiva") return "Corretiva";
  if (tipo === "preventiva") return "Preventiva";
  return "Outros";
}

const COR_AZUL = "#1FC7F2";
const COR_AZUL_ESCURO = "#1399C8";
const COR_VERDE = "#1FC7F2";
const COR_LARANJA = "#F6A21A";

function authHeaders(): HeadersInit {
  const token = (
    localStorage.getItem("mp_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("auth_token") ||
    ""
  ).trim();

  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiGet<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: authHeaders(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Erro HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

function isoTodayLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizarTexto(texto: string) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function listarDiasPeriodo(inicio: string, fim: string) {
  const out: string[] = [];

  const a = new Date(`${inicio}T00:00:00`);
  const b = new Date(`${fim}T00:00:00`);

  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    return out;
  }

  const start = a <= b ? a : b;
  const end = a <= b ? b : a;

  const cursor = new Date(start);

  while (cursor <= end) {
    const yyyy = cursor.getFullYear();
    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getDate()).padStart(2, "0");
    out.push(`${yyyy}-${mm}-${dd}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  return out;
}

function brDate(iso: string) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatarDataHora(day: string, hora?: string) {
  if (!day) return "-";
  if (!hora) return brDate(day);

  return `${brDate(day)}, ${hora.slice(0, 5)}`;
}

function formatarHoras(minutos: number) {
  const horas = Math.floor(minutos / 60);
  const mins = Math.round(minutos % 60);
  return `${horas}h ${String(mins).padStart(2, "0")}min`;
}

function formatarDecimal(valor: number, casas = 1) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

function formatarToneladas(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    maximumFractionDigits: 0,
  });
}

function obterNomeMes(chave: string) {
  const [ano, mes] = chave.split("-").map(Number);
  if (!ano || !mes) return chave;

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

function plantaFromPlantId(plantId: number | string | undefined): "planta_01" | "planta_02" {
  const n = Number(plantId || 1);
  return n === 2 ? "planta_02" : "planta_01";
}

function nomePlanta(planta: string) {
  return planta === "planta_02" ? "Planta 02" : "Planta 01";
}

function montarHoraInicial(day: string, period?: string, hora?: string) {
  if (hora) return hora.slice(0, 5);

  const p = String(period || "");
  const m = p.match(/^(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}:00`;

  return "";
}

function montarHoraFinal(period?: string, hora?: string) {
  if (hora) return hora.slice(0, 5);

  const p = String(period || "");
  const m = p.match(/^(\d{2})-(\d{2})$/);
  if (m) return `${m[2]}:00`;

  return "";
}

function transformarLinha(day: string, row: StopLaunchRow): ParadaEstoque {
  const plantId = Number(row.plant_id || 1);
  const planta = plantaFromPlantId(plantId);

  const equipamento = String(row.equipamento ?? row.equipment ?? "").trim();
  const tipo = String(row.tipo_parada ?? row.stop_type ?? "").trim();
  const descricao = String(row.descricao ?? row.description ?? "").trim();
  const justificativa = String(row.justificativa_baixa_producao ?? "").trim();
  const period = String(row.period || "").trim();

  const observacaoCompleta = [tipo, descricao, justificativa, equipamento]
    .filter(Boolean)
    .join(" ");

  const minutos = Number(row.minutos ?? row.minutes ?? 0) || 0;

  return {
    id: `${day}-${plantId}-${row.id ?? period}-${row.ordem ?? Math.random()}`,
    day,
    planta,
    plant_id: plantId,
    period,
    equipamento,
    tipo_parada: tipo,
    descricao,
    observacaoCompleta,
    minutos,
    hora_inicial: montarHoraInicial(day, period, row.hora_inicial),
    hora_final: montarHoraFinal(period, row.hora_final),
  };
}

function ehParadaEstoque(parada: ParadaEstoque) {
  const tipo = obterTipoParadaPadronizado(
    `${parada.tipo_parada} ${parada.observacaoCompleta}`
  );

  return tipo === "operacional" || tipo === "corretiva" || tipo === "preventiva";
}

function classificarCausa(parada: ParadaEstoque) {
  const tipo = obterTipoParadaPadronizado(
    `${parada.tipo_parada} ${parada.observacaoCompleta}`
  );

  return obterLabelTipoParada(tipo);
}

function calcularMediaRealProducao(rows: PlantProductionRow[]) {
  const linhasComProducao = rows.filter((row) => Number(row.ton || 0) > 0);
  const producaoTotal = linhasComProducao.reduce(
    (acc, row) => acc + Number(row.ton || 0),
    0
  );

  const horasComProducao = linhasComProducao.length;

  return {
    producaoTotal,
    horasComProducao,
    mediaHora: horasComProducao > 0 ? producaoTotal / horasComProducao : 0,
  };
}

function calcularMediaRealProducaoPorMes(payloads: PlantProductionPayload[]) {
  const mapa: Record<string, ResumoProducaoReal> = {};

  payloads.forEach((payload) => {
    const mes = String(payload.day || "").slice(0, 7);

    if (!mes) return;

    if (!mapa[mes]) {
      mapa[mes] = {
        producaoTotal: 0,
        horasComProducao: 0,
        mediaHora: 0,
      };
    }

    (payload.rows || []).forEach((row) => {
      const ton = Number(row.ton || 0);

      if (ton > 0) {
        mapa[mes].producaoTotal += ton;
        mapa[mes].horasComProducao += 1;
      }
    });
  });

  Object.keys(mapa).forEach((mes) => {
    const item = mapa[mes];
    item.mediaHora =
      item.horasComProducao > 0 ? item.producaoTotal / item.horasComProducao : 0;
  });

  return mapa;
}

function perdaEstimada(
  parada: ParadaEstoque,
  producaoHoraPorPlanta: Record<string, number>,
  producaoHoraPorMesPlanta: Record<string, Record<string, number>> = {}
) {
  const mes = parada.day.slice(0, 7);
  const producaoHoraMensal = producaoHoraPorMesPlanta[mes]?.[parada.planta] || 0;
  const producaoHoraPeriodo = producaoHoraPorPlanta[parada.planta] || 0;
  const producaoHoraFallback = producaoHoraFallbackPorPlanta[parada.planta] || 0;
  const producaoHora = producaoHoraMensal || producaoHoraPeriodo || producaoHoraFallback;

  return (parada.minutos / 60) * producaoHora;
}

const BarValueLabel = (props: any) => {
  const { x, y, width, value } = props || {};
  const n = Number(value);

  if (!Number.isFinite(n) || n === 0) return null;

  return (
    <text
      x={(Number(x) || 0) + (Number(width) || 0) / 2}
      y={(Number(y) || 0) - 8}
      textAnchor="middle"
      fill="#e8f2ff"
      fontSize={13}
      fontWeight={900}
    >
      {n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
    </text>
  );
};

const TonValueLabel = (props: any) => {
  const { x, y, width, value } = props || {};
  const n = Number(value);

  if (!Number.isFinite(n) || n === 0) return null;

  return (
    <text
      x={(Number(x) || 0) + (Number(width) || 0) / 2}
      y={(Number(y) || 0) - 8}
      textAnchor="middle"
      fill="#d9ffee"
      fontSize={13}
      fontWeight={900}
    >
      {n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
    </text>
  );
};

function CardIndicador({
  titulo,
  valor,
  subtitulo,
  icone,
  variante = "azul",
}: {
  titulo: string;
  valor: string;
  subtitulo: string;
  icone: React.ReactNode;
  variante?: "azul" | "verde" | "laranja";
}) {
  return (
    <div className={`pe-card pe-kpi pe-kpi-${variante}`}>
      <div className="pe-kpi-icon">{icone}</div>

      <div>
        <div className="pe-kpi-title">{titulo}</div>
        <div className="pe-kpi-value">{valor}</div>
        <div className="pe-kpi-sub">{subtitulo}</div>
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
  cor: "azul" | "verde" | "laranja";
  children: React.ReactNode;
}) {
  return (
    <div className="pe-card pe-chart-card">
      <div className="pe-chart-header">
        <div className={`pe-chart-title pe-chart-title-${cor}`}>{titulo}</div>
      </div>

      <div className="pe-chart-body">{children}</div>
    </div>
  );
}

export default function PrevisaoParadasEstoque() {
  const hoje = isoTodayLocal();

  const [dataInicio, setDataInicio] = useState(hoje);
  const [dataFim, setDataFim] = useState(hoje);
  const [planta, setPlanta] = useState<PlantaFiltro>("todas");
  const [tipoParada, setTipoParada] = useState<TipoParadaFiltro>("operacional");
  const [paradas, setParadas] = useState<ParadaEstoque[]>([]);
  const [producaoHoraRealPorPlanta, setProducaoHoraRealPorPlanta] = useState<
    Record<string, number>
  >({
    planta_01: 0,
    planta_02: 0,
  });
  const [producaoHoraRealPorMesPlanta, setProducaoHoraRealPorMesPlanta] =
    useState<Record<string, Record<string, number>>>({});
  const [resumoProducaoReal, setResumoProducaoReal] = useState({
    planta_01: {
      producaoTotal: 0,
      horasComProducao: 0,
      mediaHora: 0,
    },
    planta_02: {
      producaoTotal: 0,
      horasComProducao: 0,
      mediaHora: 0,
    },
  });
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    carregarParadas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataInicio, dataFim]);

  async function carregarParadas() {
    try {
      setLoading(true);
      setErro("");

      const dias = listarDiasPeriodo(dataInicio, dataFim);

      if (!dias.length) {
        setParadas([]);
        return;
      }

      const respostasParadas = await Promise.all(
        dias.map((day) =>
          apiGet<AggregateStopsPayload>(
            `/api/aggregate/stops-launch?day=${encodeURIComponent(day)}`
          ).catch(() => ({ day, rows: [] }))
        )
      );

      const linhas = respostasParadas.flatMap((payload) =>
        (payload.rows || []).map((row) => transformarLinha(payload.day, row))
      );

      const [producaoPlanta01, producaoPlanta02] = await Promise.all([
        Promise.all(
          dias.map((day) =>
            apiGet<PlantProductionPayload>(
              `/api/plants/1/plant-production/${encodeURIComponent(day)}`
            ).catch(() => ({ day, plant_id: 1, rows: [] }))
          )
        ),
        Promise.all(
          dias.map((day) =>
            apiGet<PlantProductionPayload>(
              `/api/plants/2/plant-production/${encodeURIComponent(day)}`
            ).catch(() => ({ day, plant_id: 2, rows: [] }))
          )
        ),
      ]);

      const linhasProducaoPlanta01 = producaoPlanta01.flatMap(
        (payload) => payload.rows || []
      );
      const linhasProducaoPlanta02 = producaoPlanta02.flatMap(
        (payload) => payload.rows || []
      );

      const mediaPlanta01 = calcularMediaRealProducao(linhasProducaoPlanta01);
      const mediaPlanta02 = calcularMediaRealProducao(linhasProducaoPlanta02);
      const mediaMensalPlanta01 = calcularMediaRealProducaoPorMes(producaoPlanta01);
      const mediaMensalPlanta02 = calcularMediaRealProducaoPorMes(producaoPlanta02);
      const mediaPorMesPlanta: Record<string, Record<string, number>> = {};

      Array.from(
        new Set([...Object.keys(mediaMensalPlanta01), ...Object.keys(mediaMensalPlanta02)])
      ).forEach((mes) => {
        mediaPorMesPlanta[mes] = {
          planta_01: mediaMensalPlanta01[mes]?.mediaHora || 0,
          planta_02: mediaMensalPlanta02[mes]?.mediaHora || 0,
        };
      });

      setResumoProducaoReal({
        planta_01: mediaPlanta01,
        planta_02: mediaPlanta02,
      });

      setProducaoHoraRealPorPlanta({
        planta_01: mediaPlanta01.mediaHora,
        planta_02: mediaPlanta02.mediaHora,
      });

      setProducaoHoraRealPorMesPlanta(mediaPorMesPlanta);
      setParadas(linhas);
    } catch (error: any) {
      console.error("Erro ao carregar paradas da tabela bv_launch.stops_rows:", error);
      setErro(error?.message || "Erro ao carregar paradas.");
      setParadas([]);
    } finally {
      setLoading(false);
    }
  }

  const paradasFiltradas = useMemo(() => {
    return paradas.filter((parada) => {
      const passaPlanta =
        planta === "todas" ? true : parada.planta === planta;

      const tipoClassificado = obterTipoParadaPadronizado(
        `${parada.tipo_parada} ${parada.observacaoCompleta}`
      );

      const passaTipo =
        tipoParada === "todas" ? ehParadaEstoque(parada) : tipoClassificado === tipoParada;

      return passaPlanta && passaTipo;
    });
  }, [paradas, planta, tipoParada]);

  const dados = useMemo(() => {
    const totalMinutos = paradasFiltradas.reduce((acc, p) => acc + p.minutos, 0);
    const totalHoras = totalMinutos / 60;
    const toneladasPerdidas = paradasFiltradas.reduce(
      (acc, p) => acc + perdaEstimada(p, producaoHoraRealPorPlanta, producaoHoraRealPorMesPlanta),
      0
    );

    const mediaPerdaHora =
      totalHoras > 0 ? toneladasPerdidas / totalHoras : 0;

    const diasPeriodo = Math.max(1, listarDiasPeriodo(dataInicio, dataFim).length);
    const mediaHorasDia = totalHoras / diasPeriodo;
    const previsaoHorasMes = mediaHorasDia * 30;
    const previsaoPerdaMes = previsaoHorasMes * mediaPerdaHora;

    return {
      totalMinutos,
      totalHoras,
      toneladasPerdidas,
      mediaPerdaHora,
      previsaoHorasMes,
      previsaoPerdaMes,
    };
  }, [
    paradasFiltradas,
    dataInicio,
    dataFim,
    producaoHoraRealPorPlanta,
    producaoHoraRealPorMesPlanta,
  ]);

  const resumoMensal = useMemo<ResumoMensal[]>(() => {
    const mapa = new Map<string, ResumoMensal>();

    paradasFiltradas.forEach((parada) => {
      const chave = parada.day.slice(0, 7);
      const atual =
        mapa.get(chave) ||
        {
          chave,
          mes: obterNomeMes(chave),
          horas: 0,
          toneladas: 0,
          mediaProducao: 0,
          eventos: 0,
        };

      atual.horas += parada.minutos / 60;
      atual.toneladas += perdaEstimada(parada, producaoHoraRealPorPlanta, producaoHoraRealPorMesPlanta);
      atual.eventos += 1;
      atual.mediaProducao = atual.horas > 0 ? atual.toneladas / atual.horas : 0;

      mapa.set(chave, atual);
    });

    return Array.from(mapa.values())
      .sort((a, b) => a.chave.localeCompare(b.chave))
      .map((item) => ({
        ...item,
        horas: Number(item.horas.toFixed(1)),
        toneladas: Number(item.toneladas.toFixed(0)),
        mediaProducao: Number(item.mediaProducao.toFixed(1)),
      }));
  }, [paradasFiltradas, producaoHoraRealPorPlanta, producaoHoraRealPorMesPlanta]);

  const rankingCausas = useMemo(() => {
    const mapa = new Map<
      string,
      { causa: string; horas: number; toneladas: number; eventos: number }
    >();

    paradasFiltradas.forEach((parada) => {
      const causa = classificarCausa(parada);
      const atual =
        mapa.get(causa) ||
        {
          causa,
          horas: 0,
          toneladas: 0,
          eventos: 0,
        };

      atual.horas += parada.minutos / 60;
      atual.toneladas += perdaEstimada(parada, producaoHoraRealPorPlanta, producaoHoraRealPorMesPlanta);
      atual.eventos += 1;

      mapa.set(causa, atual);
    });

    return Array.from(mapa.values())
      .sort((a, b) => b.horas - a.horas)
      .map((item) => ({
        ...item,
        horas: Number(item.horas.toFixed(1)),
        toneladas: Number(item.toneladas.toFixed(0)),
      }));
  }, [paradasFiltradas, producaoHoraRealPorPlanta, producaoHoraRealPorMesPlanta]);

  const maiorImpacto = useMemo(() => {
    if (!resumoMensal.length) return null;

    return [...resumoMensal].sort((a, b) => b.toneladas - a.toneladas)[0];
  }, [resumoMensal]);

  return (
    <div className="mp-container pe-page">
      <style>{`
        .pe-page {
          width: 100%;
          max-width: none;
          margin: 0;
          padding: 18px;
          color: #f8fafc;
        }

        .pe-page * {
          box-sizing: border-box;
        }

        .pe-shell {
          width: 100%;
          overflow: hidden;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.08);
          background: #070b11;
          box-shadow: 0 14px 34px rgba(0,0,0,0.28);
        }

        .pe-header {
          position: relative;
          display: block;
          padding: 20px 28px 18px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        .pe-header::after {
          content: "";
          position: absolute;
          left: 28px;
          right: 28px;
          bottom: 0;
          height: 3px;
          border-radius: 999px;
          background: linear-gradient(90deg, #1FC7F2, #1399C8, #F6A21A);
        }

        
        
        
        
        .pe-title-wrap {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          width: 100%;
        }

        .pe-title h1 {
          margin: 0;
          color: #eaf4ff;
          font-size: clamp(24px, 2.0vw, 34px);
          font-weight: 950;
          line-height: 1.05;
          letter-spacing: -0.02em;
        }

        .pe-title p {
          margin: 9px 0 0;
          color: #F6A21A;
          font-size: 16px;
          font-weight: 850;
        }

        .pe-period {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex: 0 0 auto;
          padding: 9px 14px;
          border-radius: 999px;
          border: 1px solid rgba(246,162,26,0.32);
          background: rgba(246,162,26,0.10);
          color: #ffd89a;
          font-size: 13px;
          font-weight: 850;
        }

        .pe-content {
          padding: 20px 28px 28px;
        }

        .pe-filter-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 14px;
          margin-bottom: 18px;
        }

        .pe-breadcrumb {
          color: rgba(226,232,240,0.65);
          font-size: 13px;
          font-weight: 800;
        }

        .pe-breadcrumb b {
          color: #fff;
        }

        .pe-filters {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          padding: 10px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: #0f141b;
        }

        .pe-filter-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: rgba(226,232,240,0.75);
          font-size: 13px;
          font-weight: 850;
        }

        .pe-input {
          height: 40px;
          min-width: 150px;
          border: 1px solid rgba(148,163,184,0.20);
          background: #0d1218;
          color: #f8fafc;
          border-radius: 13px;
          padding: 0 12px;
          outline: none;
          font-weight: 750;
        }

        .pe-input:focus {
          border-color: rgba(31,199,242,0.50);
          box-shadow: 0 0 0 3px rgba(31,199,242,0.10);
        }

        .pe-error {
          margin-bottom: 16px;
          border-radius: 16px;
          border: 1px solid rgba(248,113,113,0.35);
          background: rgba(127,29,29,0.28);
          padding: 12px 14px;
          color: #fecaca;
          font-weight: 750;
        }

        .pe-card {
          border: 1px solid rgba(255,255,255,0.08);
          background: #0f141b;
          box-shadow: 0 8px 22px rgba(0,0,0,0.18);
        }

        .pe-kpi-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 18px;
        }

        .pe-kpi {
          min-height: 118px;
          display: flex;
          align-items: center;
          gap: 18px;
          padding: 18px 20px;
          border-radius: 18px;
          position: relative;
          overflow: hidden;
        }

        .pe-kpi::after {
          content: "";
          position: absolute;
          right: -30px;
          top: -40px;
          width: 160px;
          height: 160px;
          border-radius: 50%;
          opacity: 0.05;
        }

        .pe-kpi-azul::after { background: ${COR_AZUL}; }
        .pe-kpi-verde::after { background: ${COR_AZUL}; }
        .pe-kpi-laranja::after { background: ${COR_LARANJA}; }

        .pe-kpi-icon {
          position: relative;
          z-index: 1;
          width: 70px;
          height: 70px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border-radius: 50%;
          color: #fff;
          background: #1a222d;
          box-shadow: 0 16px 34px rgba(0,0,0,0.30);
        }

        .pe-kpi-verde .pe-kpi-icon {
          background: linear-gradient(135deg, #5A3700, #F6A21A);
        }

        .pe-kpi-laranja .pe-kpi-icon {
          background: #1a222d;
        }

        .pe-kpi-title {
          color: rgba(226,232,240,0.74);
          font-size: 15px;
          font-weight: 850;
          line-height: 1.22;
        }

        .pe-kpi-value {
          margin-top: 6px;
          color: #fff;
          font-size: clamp(26px, 2.4vw, 40px);
          font-weight: 950;
          line-height: 1;
          letter-spacing: -0.03em;
        }

        .pe-kpi-sub {
          margin-top: 8px;
          color: rgba(226,232,240,0.52);
          font-size: 12px;
          font-weight: 750;
        }

        .pe-chart-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
          margin-bottom: 18px;
        }

        .pe-chart-card {
          overflow: hidden;
          border-radius: 22px;
          padding: 16px;
        }

        .pe-chart-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          margin-bottom: 12px;
        }

        .pe-chart-title {
          min-height: 38px;
          min-width: min(380px, 100%);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 18px;
          border-radius: 9px;
          color: #fff;
          font-size: 16px;
          font-weight: 950;
          text-align: center;
          box-shadow: 0 10px 22px rgba(0,0,0,0.22);
        }

        .pe-chart-title-azul {
          background: linear-gradient(135deg, #0E3346, #1A9FD0);
        }

        .pe-chart-title-verde {
          background: linear-gradient(135deg, #0E3346, #1A9FD0);
        }

        .pe-chart-title-laranja {
          background: linear-gradient(135deg, #5A3700, #F6A21A);
        }

        .pe-chart-subtitle {
          display: none;
        }

        .pe-chart-body {
          width: 100%;
          height: 318px;
        }

        .pe-grid-lower {
          display: grid;
          grid-template-columns: minmax(300px, 420px) 1fr;
          gap: 18px;
          margin-bottom: 18px;
        }

        .pe-panel {
          border-radius: 22px;
          padding: 18px;
        }

        .pe-panel h2 {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0 0 14px;
          color: #fff;
          font-size: 20px;
          font-weight: 950;
        }

        .pe-row-metric {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          padding: 12px 0;
          border-bottom: 1px solid rgba(148,163,184,0.14);
        }

        .pe-row-metric span {
          color: rgba(226,232,240,0.65);
          font-size: 13px;
          font-weight: 850;
        }

        .pe-row-metric b {
          color: #fff;
          font-size: 18px;
          font-weight: 950;
        }

        .pe-note {
          margin: 14px 0 0;
          color: rgba(226,232,240,0.58);
          font-size: 13px;
          line-height: 1.45;
        }

        .pe-production-ref {
          margin-top: 14px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .pe-production-ref div {
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.14);
          background: #0d1218;
          padding: 12px;
        }

        .pe-production-ref span {
          display: block;
          color: rgba(226,232,240,0.62);
          font-size: 12px;
          font-weight: 850;
        }

        .pe-production-ref b {
          display: block;
          margin-top: 4px;
          color: #fff;
          font-size: 18px;
          font-weight: 950;
        }

        .pe-production-ref small {
          display: block;
          margin-top: 4px;
          color: rgba(226,232,240,0.48);
          font-size: 11px;
          font-weight: 750;
        }

        .pe-cause-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .pe-cause {
          min-height: 92px;
          border-radius: 16px;
          border: 1px solid rgba(148,163,184,0.15);
          background: #0d1218;
          padding: 14px;
        }

        .pe-cause-title {
          color: #fff;
          font-size: 14px;
          font-weight: 950;
        }

        .pe-cause-value {
          margin-top: 8px;
          color: #F6A21A;
          font-size: 23px;
          font-weight: 950;
        }

        .pe-cause-sub {
          margin-top: 4px;
          color: rgba(226,232,240,0.58);
          font-size: 12px;
          font-weight: 800;
        }

        .pe-table-card {
          overflow: hidden;
          border-radius: 22px;
          margin-bottom: 18px;
        }

        .pe-table-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 18px;
          border-bottom: 1px solid rgba(148,163,184,0.15);
          background: #10151d;
        }

        .pe-table-title h2 {
          margin: 0;
          color: #fff;
          font-size: 17px;
          font-weight: 950;
        }

        .pe-table-title span {
          color: rgba(226,232,240,0.74);
          font-size: 13px;
          font-weight: 850;
        }

        .pe-table-wrap {
          overflow-x: auto;
          width: 100%;
        }

        .pe-table {
          width: 100%;
          min-width: 860px;
          border-collapse: collapse;
        }

        .pe-table thead th {
          padding: 12px 14px;
          background: #0f141b;
          border-bottom: 1px solid rgba(148,163,184,0.15);
          color: rgba(226,232,240,0.88);
          text-align: left;
          font-size: 13px;
          white-space: nowrap;
        }

        .pe-table tbody td {
          padding: 12px 14px;
          border-bottom: 1px solid rgba(148,163,184,0.10);
          color: rgba(226,232,240,0.82);
          font-size: 13px;
          vertical-align: top;
        }

        .pe-table tbody tr:hover td {
          background: rgba(255,255,255,0.04);
        }

        .pe-table .right {
          text-align: right;
          white-space: nowrap;
        }

        .pe-table .strong {
          color: #fff;
          font-weight: 950;
        }

        .pe-class {
          color: #fbbf24 !important;
          font-weight: 950;
          white-space: nowrap;
        }

        .pe-footer {
          display: flex;
          gap: 12px;
          border-radius: 18px;
          border: 1px solid rgba(31,199,242,0.22);
          background: #0f141b;
          padding: 13px 16px;
          color: rgba(226,232,240,0.72);
          font-size: 13px;
          line-height: 1.45;
        }

        .pe-footer-bar {
          height: 18px;
          margin-top: 18px;
          border-radius: 0 0 20px 20px;
          background: linear-gradient(90deg, #0E3346 0%, #0E3346 62%, #ffffff 62%, #ffffff 64%, #F6A21A 64%, #F6A21A 100%);
          opacity: 0.92;
        }

        @media (max-width: 1180px) {
          .pe-header,
          .pe-kpi-grid,
          .pe-chart-grid,
          .pe-grid-lower {
            grid-template-columns: 1fr;
          }

          .pe-title-wrap {
            align-items: flex-start;
            flex-direction: column;
          }

          .pe-cause-grid {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 720px) {
          .pe-page {
            padding: 10px;
          }

          .pe-header,
          .pe-content {
            padding-left: 14px;
            padding-right: 14px;
          }


          .pe-cause-grid {
            grid-template-columns: 1fr;
          }

          .pe-input,
          .pe-filters {
            width: 100%;
          }

          .pe-kpi {
            align-items: flex-start;
          }

          .pe-kpi-icon {
            width: 58px;
            height: 58px;
          }
        }
      `}</style>

      <div className="pe-shell">
        <header className="pe-header">
          <div className="pe-title-wrap">
            <div className="pe-title">
              <h1>
                Relatório de Horas de Paradas da Planta
                <br />
                e Toneladas Perdidas
              </h1>
            </div>

            <div className="pe-period">
              <CalendarDays size={16} />
              {brDate(dataInicio)} até {brDate(dataFim)}
            </div>
          </div>
        </header>

        <main className="pe-content">
          <div className="pe-filter-row">
            <div className="pe-breadcrumb">
              Operação&nbsp;&nbsp;•&nbsp;&nbsp;<b>Paradas Planta</b>
            </div>

            <div className="pe-filters">
              <div className="pe-filter-label">
                <Filter size={16} />
                Filtros
              </div>

              <input
                className="pe-input"
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />

              <input
                className="pe-input"
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />

              <select
                className="pe-input"
                value={planta}
                onChange={(e) => setPlanta(e.target.value as PlantaFiltro)}
              >
                <option value="todas">Todas as Plantas</option>
                <option value="planta_01">Planta 01</option>
                <option value="planta_02">Planta 02</option>
              </select>

              <select
                className="pe-input"
                value={tipoParada}
                onChange={(e) => setTipoParada(e.target.value as TipoParadaFiltro)}
              >
                <option value="todas">Todas</option>
                <option value="operacional">Operacional</option>
                <option value="corretiva">Corretiva</option>
                <option value="preventiva">Preventiva</option>
              </select>

              <button className="pe-input" type="button" onClick={carregarParadas}>
                Atualizar
              </button>
            </div>
          </div>

          {erro ? <div className="pe-error">{erro}</div> : null}

          <section className="pe-kpi-grid">
            <CardIndicador
              titulo="Total de Horas de Paradas da Planta"
              valor={`${formatarDecimal(dados.totalHoras)} h`}
              subtitulo="Paleta e layout alinhados ao padrão MonPlant"
              icone={<Clock size={34} />}
              variante="azul"
            />

            <CardIndicador
              titulo="Total de Toneladas Perdidas"
              valor={`${formatarToneladas(dados.toneladasPerdidas)} t`}
              subtitulo="Estimativa pela média real de produção"
              icone={<TrendingDown size={34} />}
              variante="laranja"
            />

            <CardIndicador
              titulo="Maior Impacto"
              valor={
                maiorImpacto
                  ? `${maiorImpacto.mes} – ${formatarDecimal(maiorImpacto.horas)} h`
                  : "-"
              }
              subtitulo={
                maiorImpacto
                  ? `${formatarToneladas(maiorImpacto.toneladas)} t perdidas`
                  : "Sem dados no período"
              }
              icone={<BarChart3 size={34} />}
              variante="laranja"
            />
          </section>

          <section className="pe-chart-grid">
            <PainelGrafico
              titulo="Horas de Paradas da Planta por Mês"
              subtitulo="Soma de horas conforme tipo de parada selecionado"
              cor="azul"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={resumoMensal} margin={{ top: 28, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                  <XAxis dataKey="mes" stroke="#cbd5e1" tick={{ fontSize: 12, fontWeight: 700 }} />
                  <YAxis stroke="#cbd5e1" />
                  <Tooltip
                    contentStyle={{
                      background: "#09111a",
                      border: "1px solid rgba(255,255,255,0.14)",
                      borderRadius: 14,
                      color: "#fff",
                    }}
                    formatter={(value: any) => [`${formatarDecimal(Number(value))} h`, "Horas"]}
                  />
                  <Bar dataKey="horas" name="Horas" radius={[8, 8, 0, 0]}>
                    <LabelList content={<BarValueLabel />} />
                    {resumoMensal.map((_, index) => (
                      <Cell key={index} fill={index === 0 ? COR_AZUL : COR_AZUL_ESCURO} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </PainelGrafico>

            <PainelGrafico
              titulo="Perda em Toneladas por Mês"
              subtitulo="Produção total / horas com produção"
              cor="laranja"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={resumoMensal} margin={{ top: 28, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                  <XAxis dataKey="mes" stroke="#cbd5e1" tick={{ fontSize: 12, fontWeight: 700 }} />
                  <YAxis stroke="#cbd5e1" />
                  <Tooltip
                    contentStyle={{
                      background: "#09111a",
                      border: "1px solid rgba(255,255,255,0.14)",
                      borderRadius: 14,
                      color: "#fff",
                    }}
                    formatter={(value: any) => [`${formatarToneladas(Number(value))} t`, "Toneladas"]}
                  />
                  <Bar dataKey="toneladas" name="Toneladas" radius={[8, 8, 0, 0]}>
                    <LabelList content={<TonValueLabel />} />
                    {resumoMensal.map((_, index) => (
                      <Cell key={index} fill={index === 0 ? COR_LARANJA : "#D88A10"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </PainelGrafico>
          </section>

          <section className="pe-table-card pe-card">
            <div className="pe-table-title">
              <h2>Consolidado Mensal da Planta</h2>
              <span>
                {loading
                  ? "Atualizando..."
                  : `${resumoMensal.length} mês(es) encontrado(s)`}
              </span>
            </div>

            <div className="pe-table-wrap">
              <table className="pe-table">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th className="right">Horas de Paradas Operacionais da Planta</th>
                    <th className="right">Média Real do Mês</th>
                    <th className="right">Perda em Toneladas</th>
                    <th className="right">Eventos</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5}>Carregando dados da tabela bv_launch.stops_rows...</td>
                    </tr>
                  ) : resumoMensal.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        Nenhuma parada encontrada para o tipo selecionado.
                      </td>
                    </tr>
                  ) : (
                    resumoMensal.map((item) => (
                      <tr key={item.chave}>
                        <td className="strong">{item.mes}</td>
                        <td className="right">{formatarDecimal(item.horas)} h</td>
                        <td className="right">{formatarDecimal(item.mediaProducao)} t/h</td>
                        <td className="right strong">{formatarToneladas(item.toneladas)} t</td>
                        <td className="right">{item.eventos}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="pe-grid-lower">
            <div className="pe-card pe-panel">
              <h2>
                <AlertTriangle size={22} color={COR_LARANJA} />
                Previsão operacional
              </h2>

              <div className="pe-row-metric">
                <span>Horas previstas / 30 dias</span>
                <b>{formatarHoras(Math.round(dados.previsaoHorasMes * 60))}</b>
              </div>

              <div className="pe-row-metric">
                <span>Perda prevista</span>
                <b>{formatarToneladas(dados.previsaoPerdaMes)} t</b>
              </div>

              <div className="pe-row-metric">
                <span>Média real usada</span>
                <b>{formatarDecimal(dados.mediaPerdaHora)} t/h</b>
              </div>

              <p className="pe-note">
                Projeção calculada pela média diária do período filtrado. Para o histórico mensal,
                cada mês usa sua própria média real de produção: produção do mês dividida pelas horas com produção do mês.
              </p>

              <div className="pe-production-ref">
                <div>
                  <span>Planta 01</span>
                  <b>
                    {formatarDecimal(resumoProducaoReal.planta_01.mediaHora)} t/h
                  </b>
                  <small>
                    {formatarToneladas(resumoProducaoReal.planta_01.producaoTotal)} t /{" "}
                    {resumoProducaoReal.planta_01.horasComProducao} h produtivas
                  </small>
                </div>

                <div>
                  <span>Planta 02</span>
                  <b>
                    {formatarDecimal(resumoProducaoReal.planta_02.mediaHora)} t/h
                  </b>
                  <small>
                    {formatarToneladas(resumoProducaoReal.planta_02.producaoTotal)} t /{" "}
                    {resumoProducaoReal.planta_02.horasComProducao} h produtivas
                  </small>
                </div>
              </div>
            </div>

            <div className="pe-card pe-panel">
              <h2>
                <PackageX size={22} color={COR_AZUL} />
                Tipos identificados
              </h2>

              <div className="pe-cause-grid">
                {rankingCausas.length === 0 ? (
                  <div className="pe-cause">
                    <div className="pe-cause-title">Sem ocorrências</div>
                    <div className="pe-cause-sub">
                      Nenhuma descrição compatível no período filtrado
                    </div>
                  </div>
                ) : (
                  rankingCausas.slice(0, 6).map((item) => (
                    <div className="pe-cause" key={item.causa}>
                      <div className="pe-cause-title">{item.causa}</div>
                      <div className="pe-cause-value">{formatarDecimal(item.horas)} h</div>
                      <div className="pe-cause-sub">
                        {item.eventos} evento(s) • {formatarToneladas(item.toneladas)} t perdidas
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="pe-table-card pe-card">
            <div className="pe-table-title">
              <h2>Detalhamento das Paradas da Planta</h2>
              <span>Total encontrado: {paradasFiltradas.length}</span>
            </div>

            <div className="pe-table-wrap">
              <table className="pe-table">
                <thead>
                  <tr>
                    <th>Planta</th>
                    <th>Período</th>
                    <th>Início</th>
                    <th>Fim</th>
                    <th>Tipo</th>
                    <th>Equipamento</th>
                    <th>Descrição</th>
                    <th className="right">Horas</th>
                    <th className="right">Perda Estimada</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9}>Carregando paradas...</td>
                    </tr>
                  ) : paradasFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        Nenhuma parada encontrada para o tipo selecionado.
                      </td>
                    </tr>
                  ) : (
                    paradasFiltradas.map((parada) => (
                      <tr key={parada.id}>
                        <td>{nomePlanta(parada.planta)}</td>
                        <td>{parada.period || "-"}</td>
                        <td>{formatarDataHora(parada.day, parada.hora_inicial)}</td>
                        <td>{formatarDataHora(parada.day, parada.hora_final)}</td>
                        <td className="pe-class">{classificarCausa(parada)}</td>
                        <td>{parada.equipamento || "-"}</td>
                        <td>{parada.observacaoCompleta || "-"}</td>
                        <td className="right">{formatarDecimal(parada.minutos / 60)} h</td>
                        <td className="right strong">{formatarToneladas(perdaEstimada(parada, producaoHoraRealPorPlanta, producaoHoraRealPorMesPlanta))} t</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="pe-footer">
            <div className="strong">i</div>
            <div>
              A busca é feita nos lançamentos de Paradas Minutos, utilizando o campo padronizado de tipo de parada:
              <b> Operacional</b>, <b>Corretiva</b> e <b>Preventiva</b>. O filtro permite visualizar cada tipo
              separadamente ou todos os tipos consolidados. As toneladas perdidas são estimadas pela média real de produção de cada mês,
              tornando o cálculo mensal mais fiel ao desempenho real daquele período.
            </div>
          </footer>

          <div className="pe-footer-bar" />
        </main>
      </div>
    </div>
  );
}
