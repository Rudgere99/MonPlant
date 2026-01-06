import { useEffect, useMemo, useState } from "react";

/* ===================== tipos ===================== */
type Turno = 1 | 2;

type StopRow = {
  id: number;
  day: string;
  turno: Turno;
  data_inicio: string;
  hora_inicio: string;
  data_fim: string;
  hora_fim: string;
  equipamento: string;
  tipo_parada: string;
  atividade: string;
  descricao: string;
  tempo_parada_h: number;
};

/* ===================== constantes ===================== */
const EQUIPAMENTOS = ["BT-01", "BT-02", "PN-01", "PN-02"] as const;
type Equipamento = typeof EQUIPAMENTOS[number];

const TIPOS_PARADA = [
  "Mecânica",
  "Elétrica",
  "Operacional",
  "Falta de Material",
  "Clima/Chuva",
  "Troca de Turno",
  "Preventiva",
  "Outros",
] as const;

const ATIVIDADES = [
  "Correia",
  "Britador",
  "Peneira",
  "Motor",
  "Lubrificação",
  "Inspeção",
  "Limpeza",
  "Solda",
  "Aguardando",
  "Outros",
] as const;

/* ===================== helpers ===================== */
const today = () => new Date().toISOString().slice(0, 10);
const fmtH = (n: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
const brDate = (d: string) => d.split("-").reverse().join("/");

/* ===================== API ===================== */
const API = (import.meta as any).env?.VITE_API_BASE ?? "http://127.0.0.1:8000";

const auth = (): HeadersInit => {
  const t = localStorage.getItem("mp_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const apiGet = async <T,>(p: string): Promise<T> => {
  const r = await fetch(API + p, { headers: auth() });
  if (!r.ok) throw new Error("Erro API");
  return r.json();
};

const apiPost = async (p: string, b: any) => {
  const r = await fetch(API + p, {
    method: "POST",
    headers: { ...auth(), "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });
  if (!r.ok) throw new Error("Erro ao salvar");
};

/* ===================== componente ===================== */
export default function Paradas() {
  const [diaRef, setDiaRef] = useState(today());
  const [rows, setRows] = useState<StopRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [turno, setTurno] = useState<Turno>(1);
  const [dataInicio, setDataInicio] = useState(today());
  const [horaInicio, setHoraInicio] = useState("07:00");
  const [dataFim, setDataFim] = useState(today());
  const [horaFim, setHoraFim] = useState("07:30");

  const [equipamento, setEquipamento] = useState<Equipamento>(EQUIPAMENTOS[0]);
  const [tipoParada, setTipoParada] = useState(TIPOS_PARADA[0]);
  const [atividade, setAtividade] = useState(ATIVIDADES[0]);
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    setLoading(true);
    apiGet<StopRow[]>(`/api/stops?day=${diaRef}`)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [diaRef]);

  const totalPorEq = useMemo(() => {
    const m: Record<string, number> = {};
    EQUIPAMENTOS.forEach((e) => (m[e] = 0));
    rows.forEach((r) => (m[r.equipamento] += r.tempo_parada_h));
    return m;
  }, [rows]);

  const salvar = async () => {
    await apiPost("/api/stops", {
      day: diaRef,
      turno,
      data_inicio: dataInicio,
      hora_inicio: horaInicio,
      data_fim: dataFim,
      hora_fim: horaFim,
      equipamento,
      tipo_parada: tipoParada,
      atividade,
      descricao,
      tempo_parada_h: 1,
    });
    setDescricao("");
  };

  return (
    <>
      <style>{`
        .mp-page-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:14px}
        .span-8{grid-column:span 8}
        .span-4{grid-column:span 4}
        .span-12{grid-column:span 12}
        @media(max-width:980px){
          .mp-page-grid{grid-template-columns:1fr}
          .span-8,.span-4,.span-12{grid-column:span 1}
        }
      `}</style>

      <div className="mp-page-grid">
        <div className="mp-card span-12">
          <div className="mp-card-h">Dia para visualizar</div>
          <div className="mp-card-b">
            <input className="mp-input" type="date" value={diaRef} onChange={(e) => setDiaRef(e.target.value)} />
          </div>
        </div>

        <div className="mp-card span-8">
          <div className="mp-card-h">Horímetro de parada • {brDate(diaRef)}</div>
          <div className="mp-card-b" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
            {EQUIPAMENTOS.map((eq) => (
              <div key={eq} className="mp-card" style={{ padding: 12 }}>
                <b>{eq}</b>
                <div className="mp-chip">{fmtH(totalPorEq[eq])} h</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mp-card span-4">
          <div className="mp-card-h">Novo lançamento</div>
          <div className="mp-card-b" style={{ display: "grid", gap: 10 }}>
            <select className="mp-input" value={equipamento} onChange={(e) => setEquipamento(e.target.value as Equipamento)}>
              {EQUIPAMENTOS.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>

            <textarea className="mp-textarea" placeholder="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            <button className="mp-btn mp-btn-primary" onClick={salvar} disabled={loading}>
              Salvar parada
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
