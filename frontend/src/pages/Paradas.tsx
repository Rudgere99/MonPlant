import { useEffect, useMemo, useState } from "react";

/* ===================== API ===================== */
const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

function authHeaders(): HeadersInit {
  const keys = ["mp_token", "token", "access_token", "auth_token"];
  for (const k of keys) {
    const v = (localStorage.getItem(k) || "").trim();
    if (v) return { Authorization: `Bearer ${v}` };
  }
  return {};
}

async function readErr(r: Response) {
  const t = await r.text().catch(() => "");
  if (!t) return `HTTP ${r.status}`;
  try {
    const j = JSON.parse(t);
    if (j?.detail) return typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    return JSON.stringify(j);
  } catch {
    return t;
  }
}

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(await readErr(r));
  return (await r.json()) as T;
}

async function apiPost<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await readErr(r));
  return (await r.json()) as T;
}

async function apiDelete(path: string): Promise<void> {
  const r = await fetch(`${API_BASE}${path}`, { method: "DELETE", headers: authHeaders() });
  if (!r.ok) throw new Error(await readErr(r));
}

/* ===================== types ===================== */
type Turno = 1 | 2;

type StopRow = {
  id: number;
  owner_id?: string;
  day: string; // yyyy-mm-dd
  turno: Turno;

  data_inicio: string; // yyyy-mm-dd
  hora_inicio: string; // HH:MM
  data_fim: string; // yyyy-mm-dd
  hora_fim: string; // HH:MM

  equipamento: string;
  tipo_parada: string;
  atividade: string;
  descricao: string;

  tempo_parada_h: number;
  created_at?: string;
};

/* ===================== constants ===================== */
const EQUIPAMENTOS = ["BT-01", "BT-02", "PN-01", "PN-02"] as const;

const TIPOS_PARADA = ["Parada Operacional", "Parda de Manutenção", "Parada por Segurança"] as const;
const ATIVIDADES = [  "Abastecimento/Lubrificação", "Engaiolamento", "Falha Eletrica", "Falta de equipamento de apoio", "Falta de mão de obra", "Limpeza", "Limpeza de cone / Aguardando quebra", "Manutenção corretiva", "Manutenção de infraestrutura", "Manutenção preventiva", "Material Umido", "Mau tempo", "Sobrecarga", "Outros",] as const;

/* ===================== helpers ===================== */
function isoTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function br(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function safeCSV(v: any) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseDateTimeLocal(dISO: string, hHM: string): Date | null {
  if (!dISO || !hHM) return null;
  const [y, m, d] = dISO.split("-").map(Number);
  const [hh, mm] = hHM.split(":").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

function calcTempoParadaH(dataIni: string, horaIni: string, dataFim: string, horaFim: string): number {
  const a = parseDateTimeLocal(dataIni, horaIni);
  const b = parseDateTimeLocal(dataFim, horaFim);
  if (!a || !b) return 0;
  const ms = b.getTime() - a.getTime();
  if (ms <= 0) return 0;
  return ms / 3600000;
}

function fmtH1(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
}

/* ===================== page ===================== */
export default function Paradas() {
  const [diaRef, setDiaRef] = useState<string>(isoTodayLocal());
  const [turno, setTurno] = useState<Turno>(1);

  const [dataInicio, setDataInicio] = useState<string>(isoTodayLocal());
  const [horaInicio, setHoraInicio] = useState<string>("07:00");
  const [dataFim, setDataFim] = useState<string>(isoTodayLocal());
  const [horaFim, setHoraFim] = useState<string>("07:30");

  const [equipamento, setEquipamento] = useState<string>(EQUIPAMENTOS[0]);
  const [tipoParada, setTipoParada] = useState<string>(TIPOS_PARADA[0]);
  const [atividade, setAtividade] = useState<string>(ATIVIDADES[0]);
  const [descricao, setDescricao] = useState<string>("");

  const [rows, setRows] = useState<StopRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadDay(day: string) {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiGet<StopRow[]>(`/api/stops?day=${encodeURIComponent(day)}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setRows([]);
      setErr(e?.message || "Falha ao carregar paradas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDay(diaRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setDataInicio(diaRef);
    setDataFim(diaRef);
    loadDay(diaRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diaRef]);

  const tempoPreview = useMemo(() => calcTempoParadaH(dataInicio, horaInicio, dataFim, horaFim), [
    dataInicio,
    horaInicio,
    dataFim,
    horaFim,
  ]);

  const rowsDoDia = useMemo(() => {
    return [...rows].sort((a, b) => {
      const da = parseDateTimeLocal(a.data_inicio, a.hora_inicio)?.getTime() ?? 0;
      const db = parseDateTimeLocal(b.data_inicio, b.hora_inicio)?.getTime() ?? 0;
      return da - db;
    });
  }, [rows]);

  const horimetroParada = useMemo(() => {
    const base: Record<string, number> = {};
    for (const eq of EQUIPAMENTOS) base[eq] = 0;
    for (const r of rowsDoDia) {
      base[r.equipamento] = (base[r.equipamento] || 0) + (r.tempo_parada_h || 0);
    }
    return base;
  }, [rowsDoDia]);

  function resetForm() {
    setTurno(1);
    setDataInicio(diaRef);
    setDataFim(diaRef);
    setHoraInicio("07:00");
    setHoraFim("07:30");
    setEquipamento(EQUIPAMENTOS[0]);
    setTipoParada(TIPOS_PARADA[0]);
    setAtividade(ATIVIDADES[0]);
    setDescricao("");
    setErr(null);
  }

  async function addRow() {
    setErr(null);

    if (!dataInicio || !horaInicio || !dataFim || !horaFim) {
      setErr("Informe Data/Hora início e fim.");
      return;
    }
    if (!equipamento) {
      setErr("Selecione o equipamento.");
      return;
    }

    const tempo = calcTempoParadaH(dataInicio, horaInicio, dataFim, horaFim);
    if (tempo <= 0) {
      setErr("Tempo de parada inválido (fim precisa ser depois do início).");
      return;
    }

    try {
      setLoading(true);

      await apiPost(`/api/stops`, {
        day: diaRef,
        turno,
        data_inicio: dataInicio,
        hora_inicio: horaInicio,
        data_fim: dataFim,
        hora_fim: horaFim,
        equipamento,
        tipo_parada: tipoParada,
        atividade,
        descricao: descricao || "",
        tempo_parada_h: tempo,
      });

      await loadDay(diaRef);
      resetForm();
    } catch (e: any) {
      setErr(e?.message || "Falha ao salvar parada");
    } finally {
      setLoading(false);
    }
  }

  async function removeRow(id: number) {
    try {
      setLoading(true);
      await apiDelete(`/api/stops/${id}`);
      await loadDay(diaRef);
    } catch (e: any) {
      setErr(e?.message || "Falha ao excluir");
    } finally {
      setLoading(false);
    }
  }

  function exportCSV() {
    const head = [
      "Turno",
      "Data Início",
      "Hora Início",
      "Data Fim",
      "Hora Fim",
      "Equipamento",
      "Tipo de Parada",
      "Atividade",
      "Descrição detalhada da parada",
      "Tempo Parada (h)",
    ];

    const lines = rowsDoDia.map((r) => [
      r.turno,
      r.data_inicio,
      r.hora_inicio,
      r.data_fim,
      r.hora_fim,
      r.equipamento,
      r.tipo_parada,
      r.atividade,
      r.descricao,
      fmtH1(r.tempo_parada_h),
    ]);

    const csv = [head, ...lines].map((row) => row.map(safeCSV).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `paradas_${diaRef}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mp-container">
      <style>{`
        .mp-grid{ display:grid; grid-template-columns: repeat(12, 1fr); gap:14px; }
        .mp-col-12{ grid-column: span 12 / span 12; }
        .mp-col-8{ grid-column: span 8 / span 8; }
        .mp-col-4{ grid-column: span 4 / span 4; }
        @media (max-width: 1100px){
          .mp-grid{ grid-template-columns: 1fr; }
          .mp-col-12,.mp-col-8,.mp-col-4{ grid-column: span 1 / span 1 !important; }
        }

        .mp-form-grid{ display:grid; grid-template-columns: repeat(12, 1fr); gap:12px; }
        .mp-fcol-3{ grid-column: span 3 / span 3; }
        .mp-fcol-4{ grid-column: span 4 / span 4; }
        .mp-fcol-6{ grid-column: span 6 / span 6; }
        .mp-fcol-12{ grid-column: span 12 / span 12; }
        @media (max-width: 980px){
          .mp-form-grid{ grid-template-columns: 1fr; }
          .mp-fcol-3,.mp-fcol-4,.mp-fcol-6,.mp-fcol-12{ grid-column: span 1 / span 1 !important; }
        }

        .mp-input, .mp-select, .mp-textarea{
          width:100%;
          padding:10px 12px;
          border-radius:12px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.10);
          color: rgba(255,255,255,.92);
          outline:none;
        }
        .mp-textarea{ min-height: 92px; resize: vertical; }
        .mp-label{ font-size: 12px; color: rgba(255,255,255,.65); font-weight: 700; margin-bottom: 6px; }
        .mp-row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; }

        table{ width:100%; border-collapse: collapse; }
        th,td{ padding: 10px 10px; border-bottom: 1px solid rgba(255,255,255,.08); font-size: 13px; }
        th{ color: rgba(255,255,255,.6); text-align:left; font-weight: 800; }

        /* ===== Cards do Horímetro (estilo da 1ª imagem) ===== */
        .stopTopWrap{
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,.10);
          background:
	            radial-gradient(1200px 420px at 10% 0%, rgba(0,204,255,.08), transparent 55%),
            radial-gradient(900px 380px at 90% 20%, rgba(59,130,246,.07), transparent 55%),
            linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
          box-shadow:
            0 18px 50px rgba(0,0,0,.55),
            inset 0 1px 0 rgba(255,255,255,.06);
          overflow: hidden;
          position: relative;
        }
        .stopTopHead{
          padding: 12px 14px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap: 10px;
        }
        .stopTopTitle{
          font-weight: 900;
          font-size: 15px;
          color: rgba(255,255,255,.92);
          letter-spacing: .2px;
          display:flex;
          align-items:center;
          gap: 10px;
        }
        .stopTopSub{
          font-size: 12px;
          color: rgba(255,255,255,.50);
          font-weight: 700;
          white-space: nowrap;
        }
        .stopCards{
          display:grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          padding: 12px 14px 14px;
        }
        @media (max-width: 1100px){
          .stopCards{ grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 560px){
          .stopCards{ grid-template-columns: 1fr; }
          .stopTopSub{ display:none; }
        }
        .stopCard{
          position: relative;
          border-radius: 16px;
          padding: 12px 12px;
          border: 1px solid rgba(255,255,255,.10);
          background:
            linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
          box-shadow:
            0 10px 26px rgba(0,0,0,.45),
            inset 0 1px 0 rgba(255,255,255,.06);
          overflow: hidden;
          min-height: 66px;
        }
        .stopCard::before{
          content:"";
          position:absolute;
          inset:0;
          background:
	            radial-gradient(500px 120px at 20% 0%, rgba(0,204,255,.10), transparent 60%);
          opacity: .9;
          pointer-events: none;
        }
        .stopEq{
          position: relative;
          font-weight: 900;
          font-size: 15px;
          color: rgba(255,255,255,.92);
          letter-spacing: .2px;
        }
        .stopLabel{
          position: relative;
          margin-top: 4px;
          font-size: 12px;
          color: rgba(255,255,255,.50);
          font-weight: 700;
        }
        .stopBadge{
          position:absolute;
          top: 10px;
          right: 10px;
          padding: 4px 10px;
          border-radius: 999px;
	          background: rgba(0,204,255,.12);
	          border: 1px solid rgba(0,204,255,.26);
          color: rgba(255,255,255,.92);
          font-weight: 900;
          font-size: 12px;
          z-index: 2;
        }
      `}</style>

      <div className="mp-grid">
        <div className="mp-col-12">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mp-chip">Operação</div>
              <div className="mp-page-title">Paradas</div>
              <div className="mp-page-sub">Lançamento + histórico do dia • Tempo Parada (h) é calculado automaticamente</div>
            </div>

            <div className="mp-row">
              <button className="mp-btn" onClick={() => loadDay(diaRef)} disabled={loading}>
                {loading ? "Atualizando..." : "Atualizar"}
              </button>
              <button className="mp-btn" onClick={exportCSV} disabled={!rowsDoDia.length}>
                Exportar CSV
              </button>
            </div>
          </div>
        </div>

        {/* ===== Horímetro de parada (cards) ===== */}
        <div className="mp-col-12">
          <div className="stopTopWrap">
            <div className="stopTopHead">
              <div className="stopTopTitle">
                Horímetro de parada (h) • {br(diaRef)}
              </div>
              <div className="stopTopSub">Soma automática das paradas do dia por equipamento</div>
            </div>

            <div className="stopCards">
              {EQUIPAMENTOS.map((eq) => (
                <div key={eq} className="stopCard">
                  <div className="stopBadge">{fmtH1(horimetroParada[eq] || 0)} h</div>
                  <div className="stopEq">{eq}</div>
                  <div className="stopLabel">Total de paradas no dia</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== Form / Lançamento ===== */}
        <div className="mp-col-12">
          <div className="mp-card">
            <div className="mp-card-h">
              <b>Novo lançamento</b>
              <span className="mp-help">Tempo Parada (h) é calculado automaticamente</span>
            </div>

            <div className="mp-card-b">
              {err && <div style={{ color: "#f87171", fontWeight: 800, marginBottom: 10 }}>{err}</div>}

              <div className="mp-form-grid">
                <div className="mp-fcol-3">
                  <div className="mp-label">Turno</div>
                  <select className="mp-select" value={turno} onChange={(e) => setTurno(Number(e.target.value) as Turno)}>
                    <option value={1}>Turno 1</option>
                    <option value={2}>Turno 2</option>
                  </select>
                </div>

                <div className="mp-fcol-3">
                  <div className="mp-label">Data (referência)</div>
                  <input className="mp-input" type="date" value={diaRef} onChange={(e) => setDiaRef(e.target.value)} />
                </div>

                <div className="mp-fcol-3">
                  <div className="mp-label">Data Início</div>
                  <input className="mp-input" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
                </div>

                <div className="mp-fcol-3">
                  <div className="mp-label">Hora Início</div>
                  <input className="mp-input" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
                </div>

                <div className="mp-fcol-3">
                  <div className="mp-label">Data Fim</div>
                  <input className="mp-input" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
                </div>

                <div className="mp-fcol-3">
                  <div className="mp-label">Hora Fim</div>
                  <input className="mp-input" type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
                </div>

                <div className="mp-fcol-3">
                  <div className="mp-label">Equipamento</div>
                  <select className="mp-select" value={equipamento} onChange={(e) => setEquipamento(e.target.value)}>
                    {EQUIPAMENTOS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mp-fcol-3">
                  <div className="mp-label">Tipo de Parada</div>
                  <select className="mp-select" value={tipoParada} onChange={(e) => setTipoParada(e.target.value)}>
                    {TIPOS_PARADA.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mp-fcol-3">
                  <div className="mp-label">Atividade</div>
                  <select className="mp-select" value={atividade} onChange={(e) => setAtividade(e.target.value)}>
                    {ATIVIDADES.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mp-fcol-3">
                  <div className="mp-label">Tempo Parada (h)</div>
                  <input className="mp-input" value={`${fmtH1(tempoPreview)} h`} readOnly />
                </div>

                <div className="mp-fcol-12">
                  <div className="mp-label">Descrição detalhada da parada</div>
                  <textarea
                    className="mp-textarea"
                    placeholder="Detalhe o que ocorreu..."
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                  />
                </div>

                <div className="mp-fcol-12">
                  <div className="mp-row">
                    <button className="mp-btn mp-btn-primary" onClick={addRow} disabled={loading}>
                      {loading ? "Salvando..." : "Salvar"}
                    </button>
                    <button className="mp-btn" onClick={resetForm} disabled={loading}>
                      Limpar
                    </button>
                  </div>
                </div>
              </div>

              {/* ✅ removido: pills de KPIs e pills por equipamento */}
            </div>
          </div>
        </div>

        {/* ===== Tabela ===== */}
        <div className="mp-col-12">
          <div className="mp-card">
            <div className="mp-card-h">
              <b>Histórico do dia</b>
              <span className="mp-help">
                Dia {br(diaRef)} • {rowsDoDia.length} registros
              </span>
            </div>

            <div className="mp-card-b" style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Turno</th>
                    <th>Início</th>
                    <th>Fim</th>
                    <th>Equip.</th>
                    <th>Tipo</th>
                    <th>Atividade</th>
                    <th>Tempo (h)</th>
                    <th>Descrição</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {!rowsDoDia.length ? (
                    <tr>
                      <td colSpan={9} style={{ color: "rgba(255,255,255,.6)" }}>
                        Sem registros neste dia.
                      </td>
                    </tr>
                  ) : (
                    rowsDoDia.map((r) => (
                      <tr key={r.id}>
                        <td>{r.turno}</td>
                        <td>
                          {br(r.data_inicio)} {r.hora_inicio}
                        </td>
                        <td>
                          {br(r.data_fim)} {r.hora_fim}
                        </td>
                        <td>{r.equipamento}</td>
                        <td>{r.tipo_parada}</td>
                        <td>{r.atividade}</td>
                        <td style={{ fontWeight: 900 }}>{fmtH1(r.tempo_parada_h)}</td>
                        <td style={{ maxWidth: 420, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {r.descricao}
                        </td>
                        <td>
                          <button className="mp-btn mp-btn-danger" onClick={() => removeRow(r.id)} disabled={loading}>
                            Excluir
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div className="mp-help" style={{ marginTop: 10 }}>
                * Tempo Parada (h) = (Data/Hora Fim) - (Data/Hora Início)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
