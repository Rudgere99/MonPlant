import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Box,
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
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/* =========================================================
   Página: Previsão de Paradas por Estoque
   Padrão visual: MonPlant dark / dashboard executivo
   ========================================================= */

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
  icon: React.ReactNode;
  accent?: "blue" | "green" | "orange";
};

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

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

function isoTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizarTexto(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function brDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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
  if (typeof parada.duracao_minutos === "number") return parada.duracao_minutos;
  if (typeof parada.duracao === "number") return parada.duracao;

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

function formatarDecimal(valor: number, casas = 1) {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

function formatarDataHora(data?: string | null) {
  if (!data) return "-";

  const dataConvertida = new Date(data);

  if (Number.isNaN(dataConvertida.getTime())) return "-";

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

function getToken() {
  const keys = ["mp_token", "token", "access_token", "auth_token"];
  for (const key of keys) {
    const value = (localStorage.getItem(key) || "").trim();
    if (value) return value;
  }
  return "";
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

export default function PrevisaoParadasEstoque() {
  const hoje = isoTodayLocal();

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

      const token = getToken();

      const response = await fetch(`${API_BASE}/api/paradas?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!response.ok) {
        throw new Error("Erro ao carregar paradas");
      }

      const data = await response.json();

      if (Array.isArray(data)) setParadas(data);
      else if (Array.isArray(data.paradas)) setParadas(data.paradas);
      else if (Array.isArray(data.items)) setParadas(data.items);
      else if (Array.isArray(data.data)) setParadas(data.data);
      else setParadas([]);
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

      const passaPlanta = planta === "todas" ? true : plantaNormalizada === planta;

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

    const mediaPerdaHora = totalHoras > 0 ? toneladasPerdidas / totalHoras : 0;

    const diasPeriodo =
      Math.max(
        1,
        Math.ceil(
          (new Date(dataFim).getTime() - new Date(dataInicio).getTime()) / 86400000
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
      { causa: string; minutos: number; toneladas: number; eventos: number }
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
        horas: Number((item.minutos / 60).toFixed(2)),
        toneladas: Number(item.toneladas.toFixed(0)),
      }));
  }, [paradasFiltradas]);

  const evolucaoMensal = useMemo(() => {
    const mapa = new Map<
      string,
      {
        mes: string;
        mesOrdem: string;
        horas: number;
        toneladas: number;
        eventos: number;
      }
    >();

    paradasFiltradas.forEach((parada) => {
      const inicio = obterInicio(parada);
      const dataConvertida = inicio ? new Date(inicio) : null;

      const mes =
        dataConvertida && !Number.isNaN(dataConvertida.getTime())
          ? dataConvertida.toLocaleDateString("pt-BR", { month: "long" })
          : "-";

      const mesCapitalizado =
        mes === "-" ? "-" : mes.charAt(0).toUpperCase() + mes.slice(1);

      const mesOrdem =
        dataConvertida && !Number.isNaN(dataConvertida.getTime())
          ? `${dataConvertida.getFullYear()}-${String(dataConvertida.getMonth() + 1).padStart(
              2,
              "0"
            )}`
          : "-";

      const minutos = obterDuracaoMinutos(parada);
      const horas = minutos / 60;
      const plantaNormalizada = obterPlantaNormalizada(
        parada.planta || parada.unidade || parada.equipamento
      );
      const toneladas = horas * (metaHoraPorPlanta[plantaNormalizada] || 0);

      const atual = mapa.get(mesOrdem) || {
        mes: mesCapitalizado,
        mesOrdem,
        horas: 0,
        toneladas: 0,
        eventos: 0,
      };

      atual.horas += horas;
      atual.toneladas += toneladas;
      atual.eventos += 1;

      mapa.set(mesOrdem, atual);
    });

    return Array.from(mapa.values())
      .sort((a, b) => a.mesOrdem.localeCompare(b.mesOrdem))
      .map((item) => ({
        ...item,
        horas: Number(item.horas.toFixed(1)),
        toneladas: Number(item.toneladas.toFixed(0)),
        producaoHora: item.horas > 0 ? Number((item.toneladas / item.horas).toFixed(1)) : 0,
      }));
  }, [paradasFiltradas]);

  const maiorImpacto = useMemo(() => {
    if (!evolucaoMensal.length) return null;
    return [...evolucaoMensal].sort((a, b) => b.toneladas - a.toneladas)[0];
  }, [evolucaoMensal]);

  const principalCausa = rankingCausas[0];

  return (
    <div className="mp-container mp-previsao-estoque">
      <style>{`
        .mp-previsao-estoque {
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 14px 18px 28px !important;
          box-sizing: border-box;
          color: rgba(255,255,255,0.92);
        }

        .mp-previsao-estoque * {
          box-sizing: border-box;
        }

        .pe-shell {
          width: 100%;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.10);
          background:
            radial-gradient(circle at top left, rgba(0,104,179,0.20), transparent 28%),
            radial-gradient(circle at top right, rgba(0,145,93,0.18), transparent 26%),
            linear-gradient(180deg, rgba(9,16,24,0.98), rgba(4,8,13,0.98));
          box-shadow: 0 24px 80px rgba(0,0,0,0.38);
          overflow: hidden;
        }

        .pe-header {
          min-height: 116px;
          padding: 22px 26px 18px;
          display: grid;
          grid-template-columns: minmax(250px, 420px) 1fr;
          gap: 26px;
          align-items: center;
          border-bottom: 1px solid rgba(255,255,255,0.10);
          position: relative;
        }

        .pe-header:before {
          content: "";
          position: absolute;
          left: 26px;
          right: 26px;
          bottom: 0;
          height: 3px;
          border-radius: 99px;
          background: linear-gradient(90deg, #0d4f86, #00a368, #ff9f1a);
        }

        .pe-logo-box {
          display: flex;
          align-items: center;
          gap: 18px;
          min-width: 0;
        }

        .pe-logo-mark {
          width: 62px;
          height: 62px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, rgba(12,80,130,0.95), rgba(0,163,104,0.78));
          border: 1px solid rgba(255,255,255,0.16);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.16), 0 14px 38px rgba(0,0,0,0.32);
          color: #fff;
        }

        .pe-brand {
          min-width: 0;
        }

        .pe-brand-title {
          font-size: 34px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: 0.08em;
          color: #ffffff;
          white-space: nowrap;
        }

        .pe-brand-subtitle {
          margin-top: 8px;
          font-size: 13px;
          letter-spacing: 0.52em;
          color: #00b978;
          font-weight: 900;
        }

        .pe-title-area {
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
        }

        .pe-title h1 {
          margin: 0;
          font-size: clamp(25px, 2.2vw, 38px);
          line-height: 1.05;
          font-weight: 950;
          color: #eaf4ff;
          letter-spacing: -0.02em;
        }

        .pe-title p {
          margin: 9px 0 0;
          color: #24d189;
          font-size: 17px;
          font-weight: 850;
        }

        .pe-period-pill {
          flex: 0 0 auto;
          border-radius: 999px;
          border: 1px solid rgba(255,159,26,0.34);
          background: rgba(255,159,26,0.10);
          color: #ffd49a;
          padding: 9px 14px;
          font-size: 13px;
          font-weight: 850;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
        }

        .pe-content {
          padding: 20px 26px 26px;
        }

        .pe-filter-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }

        .pe-breadcrumb {
          color: rgba(255,255,255,0.58);
          font-size: 13px;
          font-weight: 850;
        }

        .pe-breadcrumb b {
          color: #ffffff;
        }

        .pe-filters {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          padding: 10px;
          border-radius: 18px;
          background: rgba(255,255,255,0.045);
          border: 1px solid rgba(255,255,255,0.09);
        }

        .pe-filter-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: rgba(255,255,255,0.72);
          font-size: 13px;
          font-weight: 850;
          padding: 0 4px;
        }

        .pe-input {
          height: 40px;
          min-width: 150px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.26);
          color: rgba(255,255,255,0.90);
          border-radius: 13px;
          padding: 0 12px;
          outline: none;
          font-weight: 750;
        }

        .pe-input:focus {
          border-color: rgba(255,159,26,0.55);
          box-shadow: 0 0 0 3px rgba(255,159,26,0.10);
        }

        .pe-kpi-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 18px;
        }

        .pe-card {
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.11);
          background: linear-gradient(180deg, rgba(255,255,255,0.078), rgba(255,255,255,0.035));
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
          overflow: hidden;
        }

        .pe-kpi {
          min-height: 118px;
          padding: 18px 20px;
          display: flex;
          align-items: center;
          gap: 18px;
          position: relative;
        }

        .pe-kpi:after {
          content: "";
          position: absolute;
          top: 0;
          right: 0;
          width: 120px;
          height: 100%;
          opacity: .22;
          background: radial-gradient(circle at right, currentColor, transparent 62%);
        }

        .pe-kpi.blue { color: #45a3ff; }
        .pe-kpi.green { color: #15cf89; }
        .pe-kpi.orange { color: #ff9f1a; }

        .pe-kpi-icon {
          width: 70px;
          height: 70px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          color: #ffffff;
          background: linear-gradient(135deg, currentColor, rgba(255,255,255,0.10));
          box-shadow: 0 16px 34px rgba(0,0,0,0.30);
        }

        .pe-kpi-body {
          min-width: 0;
          color: #fff;
        }

        .pe-kpi-title {
          font-size: 15px;
          color: rgba(255,255,255,0.74);
          font-weight: 850;
          line-height: 1.2;
        }

        .pe-kpi-value {
          margin-top: 6px;
          font-size: clamp(26px, 2.5vw, 42px);
          line-height: 1;
          font-weight: 950;
          color: #ffffff;
          letter-spacing: -0.03em;
        }

        .pe-kpi-sub {
          margin-top: 8px;
          font-size: 12px;
          color: rgba(255,255,255,0.50);
          font-weight: 750;
        }

        .pe-chart-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 18px;
          margin-bottom: 18px;
        }

        .pe-section {
          padding: 16px 16px 14px;
        }

        .pe-section-head {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-bottom: 12px;
        }

        .pe-section-title {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 38px;
          min-width: 320px;
          padding: 0 18px;
          border-radius: 9px;
          background: linear-gradient(135deg, #073763, #0b5d9c);
          color: #ffffff;
          font-size: 16px;
          font-weight: 950;
          text-align: center;
          box-shadow: 0 10px 22px rgba(0,0,0,0.22);
        }

        .pe-section-title.green {
          background: linear-gradient(135deg, #007647, #00a368);
        }

        .pe-chart {
          height: 318px;
          width: 100%;
        }

        .pe-table-card {
          margin-bottom: 18px;
          padding: 0;
          overflow: hidden;
        }

        .pe-table-title {
          padding: 14px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.10);
          background: linear-gradient(90deg, rgba(7,55,99,0.78), rgba(0,118,71,0.50));
        }

        .pe-table-title h2 {
          margin: 0;
          font-size: 17px;
          font-weight: 950;
        }

        .pe-table-title span {
          color: rgba(255,255,255,0.72);
          font-weight: 850;
          font-size: 13px;
        }

        .pe-table-wrap {
          width: 100%;
          overflow-x: auto;
        }

        .pe-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 860px;
        }

        .pe-table thead th {
          background: rgba(0,0,0,0.28);
          color: rgba(255,255,255,0.86);
          font-size: 13px;
          text-align: left;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.10);
          white-space: nowrap;
        }

        .pe-table tbody td {
          padding: 12px 14px;
          color: rgba(255,255,255,0.82);
          border-bottom: 1px solid rgba(255,255,255,0.07);
          font-size: 13px;
          vertical-align: top;
        }

        .pe-table tbody tr:hover td {
          background: rgba(255,255,255,0.045);
        }

        .pe-table .right {
          text-align: right;
          white-space: nowrap;
        }

        .pe-table .strong {
          font-weight: 950;
          color: #fff;
        }

        .pe-classificacao {
          color: #ffb45c !important;
          font-weight: 950;
          white-space: nowrap;
        }

        .pe-lower-grid {
          display: grid;
          grid-template-columns: minmax(280px, 430px) 1fr;
          gap: 18px;
          margin-bottom: 18px;
        }

        .pe-forecast {
          padding: 18px;
          min-height: 220px;
        }

        .pe-forecast h2,
        .pe-causes h2 {
          margin: 0 0 14px;
          font-size: 20px;
          font-weight: 950;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .pe-forecast-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          padding: 12px 0;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        .pe-forecast-row span {
          color: rgba(255,255,255,0.62);
          font-size: 13px;
          font-weight: 850;
        }

        .pe-forecast-row b {
          color: #fff;
          font-size: 18px;
          font-weight: 950;
        }

        .pe-forecast-note {
          margin: 14px 0 0;
          color: rgba(255,255,255,0.55);
          font-size: 13px;
          line-height: 1.45;
        }

        .pe-causes {
          padding: 18px;
          min-height: 220px;
        }

        .pe-cause-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .pe-cause-item {
          min-height: 92px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.18);
          padding: 14px;
        }

        .pe-cause-name {
          font-size: 14px;
          font-weight: 950;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pe-cause-hours {
          margin-top: 8px;
          font-size: 23px;
          font-weight: 950;
          color: #ffb45c;
        }

        .pe-cause-sub {
          margin-top: 4px;
          color: rgba(255,255,255,0.58);
          font-size: 12px;
          font-weight: 800;
        }

        .pe-footer-note {
          border-radius: 18px;
          border: 1px solid rgba(0,163,104,0.30);
          background: rgba(0,163,104,0.075);
          padding: 13px 16px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          color: rgba(255,255,255,0.70);
          font-size: 13px;
          line-height: 1.45;
        }

        .pe-footer-bar {
          margin-top: 18px;
          height: 18px;
          border-radius: 0 0 20px 20px;
          background: linear-gradient(90deg, #073763 0%, #073763 62%, #ffffff 62%, #ffffff 64%, #00a368 64%, #00a368 100%);
          opacity: .95;
        }

        @media (max-width: 1180px) {
          .pe-header {
            grid-template-columns: 1fr;
          }
          .pe-title-area {
            align-items: flex-start;
            flex-direction: column;
          }
          .pe-kpi-grid,
          .pe-chart-grid,
          .pe-lower-grid {
            grid-template-columns: 1fr;
          }
          .pe-cause-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .mp-previsao-estoque {
            padding: 10px 10px 80px !important;
          }
          .pe-header,
          .pe-content {
            padding-left: 14px;
            padding-right: 14px;
          }
          .pe-brand-title {
            font-size: 26px;
          }
          .pe-brand-subtitle {
            letter-spacing: .34em;
          }
          .pe-logo-mark {
            width: 52px;
            height: 52px;
          }
          .pe-section-title {
            min-width: 0;
            width: 100%;
            font-size: 14px;
          }
          .pe-kpi {
            align-items: flex-start;
          }
          .pe-kpi-icon {
            width: 56px;
            height: 56px;
          }
          .pe-input {
            width: 100%;
          }
          .pe-filters {
            width: 100%;
          }
        }
      `}</style>

      <div className="pe-shell">
        <div className="pe-header">
          <div className="pe-logo-box">
            <div className="pe-logo-mark">
              <Factory size={34} />
            </div>

            <div className="pe-brand">
              <div className="pe-brand-title">TRINDADE</div>
              <div className="pe-brand-subtitle">MINERAÇÃO</div>
            </div>
          </div>

          <div className="pe-title-area">
            <div className="pe-title">
              <h1>
                Previsão de Paradas Operacionais da Planta
                <br />
                por Restrição de Estoque
              </h1>
              <p>Análise de horas paradas, toneladas perdidas e tendência operacional</p>
            </div>

            <div className="pe-period-pill">
              <CalendarDays size={16} />
              {brDate(dataInicio)} até {brDate(dataFim)}
            </div>
          </div>
        </div>

        <div className="pe-content">
          <div className="pe-filter-row">
            <div className="pe-breadcrumb">
              Operação&nbsp;&nbsp;•&nbsp;&nbsp;<b>Previsão Estoque</b>
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
            </div>
          </div>

          <div className="pe-kpi-grid">
            <CardIndicador
              titulo="Total de Horas de Paradas Operacionais da Planta"
              valor={formatarDecimal(dadosCalculados.totalHoras, 1) + " h"}
              subtitulo="Soma das restrições de estoque"
              icon={<Clock size={34} />}
              accent="blue"
            />

            <CardIndicador
              titulo="Total de Toneladas Perdidas"
              valor={formatarToneladas(dadosCalculados.toneladasPerdidas) + " t"}
              subtitulo="Estimativa com base na produção horária"
              icon={<TrendingDown size={34} />}
              accent="green"
            />

            <CardIndicador
              titulo="Maior Impacto"
              valor={
                maiorImpacto
                  ? `${maiorImpacto.mes} – ${formatarDecimal(maiorImpacto.horas, 1)} h`
                  : "-"
              }
              subtitulo={
                maiorImpacto
                  ? `${formatarToneladas(maiorImpacto.toneladas)} t perdidas`
                  : "Sem dados no período"
              }
              icon={<BarChart3 size={34} />}
              accent="blue"
            />
          </div>

          <div className="pe-chart-grid">
            <div className="pe-card pe-section">
              <div className="pe-section-head">
                <div className="pe-section-title">
                  Horas de Paradas Operacionais da Planta por Mês
                </div>
              </div>

              <div className="pe-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={evolucaoMensal} margin={{ top: 28, right: 20, left: 4, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
                    <XAxis dataKey="mes" stroke="rgba(255,255,255,0.68)" tick={{ fontSize: 12, fontWeight: 700 }} />
                    <YAxis stroke="rgba(255,255,255,0.68)" tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        background: "#09111a",
                        border: "1px solid rgba(255,255,255,0.14)",
                        borderRadius: 14,
                        color: "#fff",
                      }}
                      formatter={(value: any) => [`${formatarDecimal(Number(value), 1)} h`, "Horas"]}
                    />
                    <Bar dataKey="horas" name="Horas" radius={[8, 8, 0, 0]}>
                      <LabelList content={<BarValueLabel />} />
                      {evolucaoMensal.map((_, index) => (
                        <Cell key={index} fill={index === 0 ? "#0b5d9c" : "#0d4f86"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="pe-card pe-section">
              <div className="pe-section-head">
                <div className="pe-section-title green">
                  Perda em Toneladas por Mês
                </div>
              </div>

              <div className="pe-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={evolucaoMensal} margin={{ top: 28, right: 20, left: 4, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
                    <XAxis dataKey="mes" stroke="rgba(255,255,255,0.68)" tick={{ fontSize: 12, fontWeight: 700 }} />
                    <YAxis stroke="rgba(255,255,255,0.68)" tick={{ fontSize: 12 }} />
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
                      {evolucaoMensal.map((_, index) => (
                        <Cell key={index} fill={index === 0 ? "#00a368" : "#008957"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="pe-card pe-table-card">
            <div className="pe-table-title">
              <h2>Consolidado Mensal da Planta</h2>
              <span>{loading ? "Atualizando..." : `${evolucaoMensal.length} mês(es) encontrado(s)`}</span>
            </div>

            <div className="pe-table-wrap">
              <table className="pe-table">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th className="right">Horas de Paradas Operacionais da Planta</th>
                    <th className="right">Produção Horária</th>
                    <th className="right">Perda em Toneladas</th>
                    <th className="right">Eventos</th>
                  </tr>
                </thead>

                <tbody>
                  {evolucaoMensal.length === 0 ? (
                    <tr>
                      <td colSpan={5}>Nenhuma parada de estoque encontrada no período.</td>
                    </tr>
                  ) : (
                    evolucaoMensal.map((item) => (
                      <tr key={item.mesOrdem}>
                        <td className="strong">{item.mes}</td>
                        <td className="right">{formatarDecimal(item.horas, 1)} h</td>
                        <td className="right">{formatarDecimal(item.producaoHora, 1)} t/h</td>
                        <td className="right strong">{formatarToneladas(item.toneladas)} t</td>
                        <td className="right">{item.eventos}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pe-lower-grid">
            <div className="pe-card pe-forecast">
              <h2>
                <AlertTriangle size={22} color="#ffb45c" />
                Previsão operacional
              </h2>

              <div className="pe-forecast-row">
                <span>Horas previstas / 30 dias</span>
                <b>{formatarHoras(Math.round(dadosCalculados.previsaoHorasMes * 60))}</b>
              </div>

              <div className="pe-forecast-row">
                <span>Perda prevista</span>
                <b>{formatarToneladas(dadosCalculados.previsaoPerdaMes)} t</b>
              </div>

              <div className="pe-forecast-row">
                <span>Média perdida</span>
                <b>{formatarDecimal(dadosCalculados.mediaPerdaHora, 1)} t/h</b>
              </div>

              <p className="pe-forecast-note">
                Projeção calculada pela média diária do período filtrado, mantendo a taxa atual
                de perdas por restrição de estoque.
              </p>
            </div>

            <div className="pe-card pe-causes">
              <h2>
                <PackageX size={22} color="#45a3ff" />
                Causas identificadas
              </h2>

              <div className="pe-cause-grid">
                {rankingCausas.length === 0 ? (
                  <div className="pe-cause-item">
                    <div className="pe-cause-name">Sem ocorrências</div>
                    <div className="pe-cause-sub">Nenhuma causa identificada no período</div>
                  </div>
                ) : (
                  rankingCausas.slice(0, 6).map((item) => (
                    <div className="pe-cause-item" key={item.causa}>
                      <div className="pe-cause-name">
                        <Box size={16} />
                        {item.causa}
                      </div>
                      <div className="pe-cause-hours">{formatarDecimal(item.horas, 1)} h</div>
                      <div className="pe-cause-sub">
                        {item.eventos} evento(s) • {formatarToneladas(item.toneladas)} t perdidas
                      </div>
                    </div>
                  ))
                )}
              </div>

              {principalCausa ? (
                <p className="pe-forecast-note">
                  Principal restrição no período: <b>{principalCausa.causa}</b>, com{" "}
                  <b>{formatarDecimal(principalCausa.horas, 1)} h</b> de parada.
                </p>
              ) : null}
            </div>
          </div>

          <div className="pe-card pe-table-card">
            <div className="pe-table-title">
              <h2>Detalhamento das Paradas de Estoque</h2>
              <span>Total encontrado: {paradasFiltradas.length}</span>
            </div>

            <div className="pe-table-wrap">
              <table className="pe-table">
                <thead>
                  <tr>
                    <th>Planta</th>
                    <th>Início</th>
                    <th>Fim</th>
                    <th>Classificação</th>
                    <th>Observação/Descrição</th>
                    <th className="right">Horas</th>
                    <th className="right">Perda Estimada</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7}>Carregando paradas...</td>
                    </tr>
                  ) : paradasFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={7}>Nenhuma parada de estoque encontrada no período.</td>
                    </tr>
                  ) : (
                    paradasFiltradas.map((parada, index) => {
                      const minutos = obterDuracaoMinutos(parada);
                      const horas = minutos / 60;
                      const plantaNormalizada = obterPlantaNormalizada(
                        parada.planta || parada.unidade || parada.equipamento
                      );
                      const perda = horas * (metaHoraPorPlanta[plantaNormalizada] || 0);

                      return (
                        <tr key={`${parada.id}-${index}`}>
                          <td>{obterNomePlanta(parada.planta || parada.unidade || parada.equipamento)}</td>
                          <td>{formatarDataHora(obterInicio(parada))}</td>
                          <td>{obterFim(parada) ? formatarDataHora(obterFim(parada)) : "Em aberto"}</td>
                          <td className="pe-classificacao">{classificarCausaEstoque(parada)}</td>
                          <td>{obterObservacaoCompleta(parada) || "-"}</td>
                          <td className="right">{formatarDecimal(horas, 1)} h</td>
                          <td className="right strong">{formatarToneladas(perda)} t</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pe-footer-note">
            <AlertTriangle size={18} color="#15cf89" />
            <div>
              As horas informadas neste relatório referem-se às paradas operacionais da planta
              por pilha cheia, falta de área de estoque, cones cheios, pulmão cheio e restrições
              de recebimento. As toneladas perdidas são estimativas baseadas na produção horária
              cadastrada por planta.
            </div>
          </div>

          <div className="pe-footer-bar" />
        </div>
      </div>
    </div>
  );
}

function CardIndicador({
  titulo,
  valor,
  subtitulo,
  icon,
  accent = "blue",
}: CardIndicadorProps) {
  return (
    <div className="pe-card pe-kpi-card">
      <div className={`pe-kpi ${accent}`}>
        <div className="pe-kpi-icon">{icon}</div>

        <div className="pe-kpi-body">
          <div className="pe-kpi-title">{titulo}</div>
          <div className="pe-kpi-value">{valor}</div>
          <div className="pe-kpi-sub">{subtitulo}</div>
        </div>
      </div>
    </div>
  );
}
