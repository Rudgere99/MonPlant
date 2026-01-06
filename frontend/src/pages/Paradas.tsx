import { useEffect, useMemo, useState } from "react";

/* ===================== tipos ===================== */
type Turno = 1 | 2;

type StopRow = {
  id: number;
  owner_id?: string;
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
  "Mecânica","Elétrica","Operacional","Falta de Material",
  "Clima/Chuva","Troca de Turno","Preventiva","Outros",
] as const;
const ATIVIDADES = [
  "Correia","Britador","Peneira","Motor","Lubrificação",
  "Inspeção","Limpeza","Solda","Aguardando","Outros",
] as const;

/* ===================== helpers ===================== */
const isoTodayLocal = () => new Date().toISOString().slice(0, 10);
const fmtH = (n: number) => new Intl.NumberFormat("pt-BR",{maximumFractionDigits:1}).format(n);
const brDate = (d: string) => d.split("-").reverse().join("/");

/* ===================== API ===================== */
const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

function authHeaders(): HeadersInit {
  const keys = ["mp_token","token","access_token","auth_token"];
  for (const k of keys) {
    const v = (localStorage.getItem(k) || "").trim();
    if (v) return { Authorization: `Bearer ${v}` };
  }
  return {};
}

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiPost<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiDelete(path: string) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error(await r.text());
}

/* ===================== componente ===================== */
export default function Paradas() {
  const [diaRef, setDiaRef] = useState(isoTodayLocal());
  const [rows, setRows] = useState<StopRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [turno, setTurno] = useState<Turno>(1);
  const [dataInicio, setDataInicio] = useState(isoTodayLocal());
  const [dataFim, setDataFim] = useState(isoTodayLocal());
  const [horaInicio, setHoraInicio] = useState("07:00");
  const [horaFim, setHoraFim] = useState("07:30");
  const [equipamento, setEquipamento] = useState<string>(EQUIPAMENTOS[0]);
  const [tipoParada, setTipoParada] = useState<string>(TIPOS_PARADA[0]);
  const [atividade, setAtividade] = useState<string>(ATIVIDADES[0]);
  const [descricao, setDescricao] = useState("");

  async function loadDay(d: string) {
    setLoading(true);
    try {
      const data = await apiGet<StopRow[]>(`/api/stops?day=${d}`);
      setRows(data);
      setErr(null);
    } catch (e:any) {
      setErr(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDay(diaRef); }, [diaRef]);

  const horimetro = useMemo(() => {
    const h: Record<string, number> = {};
    EQUIPAMENTOS.forEach(e => h[e] = 0);
    rows.forEach(r => h[r.equipamento] += r.tempo_parada_h || 0);
    return h;
  }, [rows]);

  return (
    <>
      {/* GRID PADRÃO DASHBOARD */}
      <style>{`
        .mp-page-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:14px}
        .span-12{grid-column:span 12}
        .span-8{grid-column:span 8}
        .span-4{grid-column:span 4}
        @media(max-width:980px){
          .mp-page-grid{grid-template-columns:1fr}
          .span-12,.span-8,.span-4{grid-column:span 1}
        }
      `}</style>

      <div className="mp-page-grid">

        {/* TOPO */}
        <div className="span-12">
          <div className="mp-chip">Operação</div>
          <div className="mp-page-title">Paradas</div>
          <div className="mp-page-sub">
            Registro + cálculo automático + soma por equipamento (Postgres)
          </div>
        </div>

        {/* AÇÕES */}
        <div className="span-12" style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button className="mp-btn" onClick={()=>loadDay(diaRef)} disabled={loading}>
            Atualizar
          </button>
          <button className="mp-btn" onClick={()=>setDescricao("")}>
            Limpar formulário
          </button>
        </div>

        {/* FILTRO DIA */}
        <div className="mp-card span-12">
          <div className="mp-card-b" style={{display:"flex",alignItems:"end",gap:12}}>
            <div>
              <div className="mp-label">Dia para visualizar</div>
              <input className="mp-input" type="date" value={diaRef}
                onChange={(e)=>setDiaRef(e.target.value)} />
            </div>
            <div className="mp-help" style={{marginLeft:"auto"}}>
              Registros do dia: <b>{rows.length}</b>
            </div>
          </div>
        </div>

        {/* HORÍMETRO */}
        <div className="mp-card span-12">
          <div className="mp-card-h">
            Horímetro de parada (h) • {brDate(diaRef)}
          </div>
          <div className="mp-card-b"
            style={{display:"grid",gap:12,gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))"}}>
            {EQUIPAMENTOS.map(eq=>(
              <div key={eq} className="mp-card" style={{padding:12}}>
                <b>{eq}</b>
                <div className="mp-chip">{fmtH(horimetro[eq])} h</div>
              </div>
            ))}
          </div>
        </div>

        {/* CONTEÚDO + FORM */}
        <div className="mp-card span-8">
          <div className="mp-card-h">Paradas do dia</div>
          <div className="mp-card-b mp-help">
            Veja detalhes na tabela abaixo
          </div>
        </div>

        <div className="mp-card span-4">
          <div className="mp-card-h">Novo lançamento</div>
          <div className="mp-card-b">
            <textarea
              className="mp-textarea"
              placeholder="Descrição detalhada"
              value={descricao}
              onChange={(e)=>setDescricao(e.target.value)}
              style={{minHeight:100}}
            />
          </div>
        </div>

      </div>
    </>
  );
}
