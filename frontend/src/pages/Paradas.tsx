import { useEffect, useMemo, useState } from "react";

/* ===================== API ===================== */
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

function authHeaders(): HeadersInit {
  const keys = ["mp_token", "token", "access_token", "auth_token"];
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

async function apiPost(path: string, body: any) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
}

async function apiDelete(path: string) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error(await r.text());
}

/* ===================== TYPES ===================== */
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

/* ===================== CONSTANTS ===================== */
const EQUIPAMENTOS = ["BT-01", "BT-02", "PN-01", "PN-02"] as const;
const TIPOS_PARADA = ["Mecânica", "Elétrica", "Operacional", "Programada"];
const ATIVIDADES = ["Correia", "Britador", "Peneira", "Troca de turno", "Outros"];

/* ===================== HELPERS ===================== */
function isoTodayLocal() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function br(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function calcH(
  di: string,
  hi: string,
  df: string,
  hf: string
): number {
  const a = new Date(`${di}T${hi}`);
  const b = new Date(`${df}T${hf}`);
  return Math.max(0, (b.getTime() - a.getTime()) / 3600000);
}

function fmtH(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
  }).format(n);
}

/* ===================== PAGE ===================== */
export default function Paradas() {
  const [diaRef, setDiaRef] = useState(isoTodayLocal());
  const [turno, setTurno] = useState<Turno>(1);

  const [dataInicio, setDataInicio] = useState(diaRef);
  const [horaInicio, setHoraInicio] = useState("07:00");
  const [dataFim, setDataFim] = useState(diaRef);
  const [horaFim, setHoraFim] = useState("07:30");

  const [equipamento, setEquipamento] = useState(EQUIPAMENTOS[0]);
  const [tipoParada, setTipoParada] = useState(TIPOS_PARADA[0]);
  const [atividade, setAtividade] = useState(ATIVIDADES[0]);
  const [descricao, setDescricao] = useState("");

  const [rows, setRows] = useState<StopRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadDay() {
    const data = await apiGet<StopRow[]>(`/api/stops?day=${diaRef}`);
    setRows(data || []);
  }

  useEffect(() => {
    loadDay();
  }, [diaRef]);

  const horimetroParada = useMemo(() => {
    const base: Record<string, number> = {};
    for (const e of EQUIPAMENTOS) base[e] = 0;
    for (const r of rows) {
      base[r.equipamento] += r.tempo_parada_h;
    }
    return base;
  }, [rows]);

  const tempoPreview = calcH(
    dataInicio,
    horaInicio,
    dataFim,
    horaFim
  );

  async function salvar() {
    try {
      setLoading(true);
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
        tempo_parada_h: tempoPreview,
      });
      await loadDay();
      setDescricao("");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function excluir(id: number) {
    await apiDelete(`/api/stops/${id}`);
    loadDay();
  }

  return (
    <div className="mp-container">
      <div className="mp-page-title">Paradas</div>
      <div className="mp-page-sub">
        Horímetro de parada por equipamento • {br(diaRef)}
      </div>

      {/* ===== HORÍMETRO POR EQUIPAMENTO ===== */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 14,
          marginTop: 16,
        }}
      >
        {EQUIPAMENTOS.map((eq) => (
          <div key={eq} className="mp-card">
            <div className="mp-card-h">
              <b>{eq}</b>
              <span className="mp-help">Total de paradas no dia</span>
            </div>
            <div
              className="mp-card-b"
              style={{ fontSize: 28, fontWeight: 900 }}
            >
              {fmtH(horimetroParada[eq] || 0)} h
            </div>
          </div>
        ))}
      </div>

      {/* ===== LANÇAMENTO ===== */}
      <div className="mp-card" style={{ marginTop: 18 }}>
        <div className="mp-card-h">
          <b>Novo lançamento</b>
          <span className="mp-help">
            Tempo calculado automaticamente
          </span>
        </div>

        <div className="mp-card-b">
          {err && <div className="mp-error">{err}</div>}

          <div className="mp-form-grid">
            <input type="date" value={diaRef} onChange={(e) => setDiaRef(e.target.value)} />
            <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
            <input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />

            <select value={equipamento} onChange={(e) => setEquipamento(e.target.value)}>
              {EQUIPAMENTOS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>

            <select value={tipoParada} onChange={(e) => setTipoParada(e.target.value)}>
              {TIPOS_PARADA.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>

            <select value={atividade} onChange={(e) => setAtividade(e.target.value)}>
              {ATIVIDADES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>

            <input value={`${fmtH(tempoPreview)} h`} readOnly />
            <textarea
              placeholder="Descrição detalhada"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />

            <button onClick={salvar} disabled={loading}>
              Salvar
            </button>
          </div>
        </div>
      </div>

      {/* ===== HISTÓRICO ===== */}
      <div className="mp-card" style={{ marginTop: 18 }}>
        <div className="mp-card-h">
          <b>Histórico do dia</b>
          <span className="mp-help">{rows.length} registros</span>
        </div>

        <div className="mp-card-b" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Equip.</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Tempo (h)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!rows.length && (
                <tr>
                  <td colSpan={5}>Sem registros</td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.equipamento}</td>
                  <td>{br(r.data_inicio)} {r.hora_inicio}</td>
                  <td>{br(r.data_fim)} {r.hora_fim}</td>
                  <td>{fmtH(r.tempo_parada_h)}</td>
                  <td>
                    <button onClick={() => excluir(r.id)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
