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
  created_at?: string | null;
};

/* ===================== constantes ===================== */
const EQUIPAMENTOS = ["BT-01", "BT-02", "PN-01", "PN-02"] as const;
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
function isoTodayLocal() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function parseDateTimeLocal(dateISO: string, timeHHMM: string): Date | null {
  if (!dateISO || !timeHHMM) return null;
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = timeHHMM.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

function diffHours(start: Date, end: Date) {
  return (end.getTime() - start.getTime()) / 36e5;
}

function fmtH(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
}

function brDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/* ===================== API ===================== */
const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("mp_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!r.ok) throw new Error("Erro ao carregar");
  return r.json();
}

async function apiPost(path: string, body: any) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Erro ao salvar");
}

async function apiDelete(path: string) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error("Erro ao excluir");
}

/* ===================== COMPONENTE ===================== */
export default function Paradas() {
  const [diaRef, setDiaRef] = useState(isoTodayLocal());
  const [rows, setRows] = useState<StopRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [turno, setTurno] = useState<Turno>(1);
  const [dataInicio, setDataInicio] = useState(isoTodayLocal());
  const [horaInicio, setHoraInicio] = useState("07:00");
  const [dataFim, setDataFim] = useState(isoTodayLocal());
  const [horaFim, setHoraFim] = useState("07:30");
  const [equipamento, setEquipamento] = useState(EQUIPAMENTOS[0]);
  const [tipoParada, setTipoParada] = useState(TIPOS_PARADA[0]);
  const [atividade, setAtividade] = useState(ATIVIDADES[0]);
  const [descricao, setDescricao] = useState("");

  async function load() {
    setLoading(true);
    const data = await apiGet<StopRow[]>(`/api/stops?day=${diaRef}`);
    setRows(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [diaRef]);

  const tempoCalc = useMemo(() => {
    const s = parseDateTimeLocal(dataInicio, horaInicio);
    const e = parseDateTimeLocal(dataFim, horaFim);
    if (!s || !e) return 0;
    return Math.max(0, diffHours(s, e));
  }, [dataInicio, horaInicio, dataFim, horaFim]);

  const totalPorEq = useMemo(() => {
    const map: Record<string, number> = {};
    EQUIPAMENTOS.forEach((e) => (map[e] = 0));
    rows.forEach((r) => (map[r.equipamento] += r.tempo_parada_h));
    return map;
  }, [rows]);

  async function salvar() {
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
      tempo_parada_h: tempoCalc,
    });
    setDescricao("");
    load();
  }

  return (
    <>
      {/* GRID PADRÃO DASHBOARD */}
      <style>{`
        .mp-page-grid{
          display:grid;
          grid-template-columns: repeat(12, 1fr);
          gap:14px;
        }
        .span-8{ grid-column: span 8 / span 8; }
        .span-4{ grid-column: span 4 / span 4; }
        .span-12{ grid-column: span 12 / span 12; }

        @media (max-width: 980px){
          .mp-page-grid{
            grid-template-columns: 1fr;
          }
          .span-8,.span-4,.span-12{
            grid-column: span 1 / span 1;
          }
        }
      `}</style>

      <div className="mp-page-grid">
        {/* FILTRO DIA */}
        <div className="mp-card span-12">
          <div className="mp-card-h">Dia para visualizar</div>
          <div className="mp-card-b">
            <input
              className="mp-input"
              type="date"
              value={diaRef}
              onChange={(e) => setDiaRef(e.target.value)}
            />
          </div>
        </div>

        {/* HORÍMETRO */}
        <div className="mp-card span-8">
          <div className="mp-card-h">Horímetro de parada (h) • {brDate(diaRef)}</div>
          <div className="mp-card-b" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            {EQUIPAMENTOS.map((eq) => (
              <div key={eq} className="mp-card" style={{ padding: 12 }}>
                <b>{eq}</b>
                <div className="mp-chip">{fmtH(totalPorEq[eq] || 0)} h</div>
              </div>
            ))}
          </div>
        </div>

        {/* FORMULÁRIO */}
        <div className="mp-card span-4">
          <div className="mp-card-h">Novo lançamento</div>
          <div className="mp-card-b" style={{ display: "grid", gap: 10 }}>
            <select className="mp-input" value={turno} onChange={(e) => setTurno(+e.target.value as Turno)}>
              <option value={1}>Turno 1</option>
              <option value={2}>Turno 2</option>
            </select>
            <input className="mp-input" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            <input className="mp-input" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
            <input className="mp-input" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            <input className="mp-input" type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
            <select className="mp-input" value={equipamento} onChange={(e) => setEquipamento(e.target.value)}>
              {EQUIPAMENTOS.map((e) => <option key={e}>{e}</option>)}
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
