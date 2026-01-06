import React, { useEffect, useMemo, useState } from "react";

/* ===================== tipos ===================== */
type Turno = 1 | 2;

type StopRow = {
  id: number;
  owner_id?: string;
  day: string; // YYYY-MM-DD (dia referência)
  turno: Turno;

  data_inicio: string; // YYYY-MM-DD
  hora_inicio: string; // HH:MM
  data_fim: string; // YYYY-MM-DD
  hora_fim: string; // HH:MM

  equipamento: string;
  tipo_parada: string;
  atividade: string;
  descricao: string;

  tempo_parada_h: number;
  created_at?: string | null;
};

/* ===================== constantes (combos) ===================== */
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
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateTimeLocal(dateISO: string, timeHHMM: string): Date | null {
  if (!dateISO || !timeHHMM) return null;
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = timeHHMM.split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function diffHours(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return ms / (1000 * 60 * 60);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function fmtH(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
}

function brDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function safeCSV(v: any) {
  const s = String(v ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function calcTempoParadaH(
  dataInicio: string,
  horaInicio: string,
  dataFim: string,
  horaFim: string
): number {
  const s = parseDateTimeLocal(dataInicio, horaInicio);
  const e = parseDateTimeLocal(dataFim, horaFim);
  if (!s || !e) return 0;

  let h = diffHours(s, e);

  // se fim "antes", tenta +1 dia
  if (h < 0) {
    const e2 = new Date(e.getTime() + 24 * 60 * 60 * 1000);
    h = diffHours(s, e2);
  }

  if (!Number.isFinite(h)) return 0;
  return clamp(h, 0, 72);
}

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

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}

async function apiPost<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}

async function apiDelete(path: string): Promise<void> {
  const r = await fetch(`${API_BASE}${path}`, { method: "DELETE", headers: authHeaders() });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
}

/* ===================== estilos locais (padrão dashboard) ===================== */
const td: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(255,255,255,.06)",
  verticalAlign: "top",
  whiteSpace: "nowrap",
  color: "rgba(255,255,255,.85)",
};

function kpiBoxStyle(): React.CSSProperties {
  return {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,.10)",
    background: "rgba(255,255,255,.04)",
    padding: 14,
  };
}

/* ===================== componente ===================== */
export default function Paradas() {
  const [diaRef, setDiaRef] = useState<string>(isoTodayLocal());

  const [turno, setTurno] = useState<Turno>(1);
  const [dataInicio, setDataInicio] = useState<string>(isoTodayLocal());
  const [dataFim, setDataFim] = useState<string>(isoTodayLocal());
  const [horaInicio, setHoraInicio] = useState<string>("07:00");
  const [horaFim, setHoraFim] = useState<string>("07:30");

  const [equipamento, setEquipamento] = useState<string>(EQUIPAMENTOS[0]);
  const [tipoParada, setTipoParada] = useState<string>(TIPOS_PARADA[0]);
  const [atividade, setAtividade] = useState<string>(ATIVIDADES[0]);
  const [descricao, setDescricao] = useState<string>("");

  const [rows, setRows] = useState<StopRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadDay(d: string) {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiGet<StopRow[]>(`/api/stops?day=${encodeURIComponent(d)}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar paradas");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDay(diaRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diaRef]);

  const tempoCalc = useMemo(() => {
    return calcTempoParadaH(dataInicio, horaInicio, dataFim, horaFim);
  }, [dataInicio, horaInicio, dataFim, horaFim]);

  const rowsDoDia = useMemo(() => {
    return [...rows].sort((a, b) => {
      const da = parseDateTimeLocal(a.data_inicio, a.hora_inicio)?.getTime() ?? 0;
      const db = parseDateTimeLocal(b.data_inicio, b.hora_inicio)?.getTime() ?? 0;
      return da - db;
    });
  }, [rows]);

  const totals = useMemo(() => {
    const totalParadas = rowsDoDia.length;
    const totalHoras = rowsDoDia.reduce((acc, r) => acc + (r.tempo_parada_h || 0), 0);

    const porEq: Record<string, number> = {};
    const porTipo: Record<string, number> = {};
    for (const r of rowsDoDia) {
      porEq[r.equipamento] = (porEq[r.equipamento] || 0) + (r.tempo_parada_h || 0);
      porTipo[r.tipo_parada] = (porTipo[r.tipo_parada] || 0) + (r.tempo_parada_h || 0);
    }

    const topEq = Object.entries(porEq).sort((a, b) => b[1] - a[1])[0];
    const topTipo = Object.entries(porTipo).sort((a, b) => b[1] - a[1])[0];

    return {
      totalParadas,
      totalHoras,
      topEq: topEq ? { name: topEq[0], hours: topEq[1] } : null,
      topTipo: topTipo ? { name: topTipo[0], hours: topTipo[1] } : null,
    };
  }, [rowsDoDia]);

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

      await apiPost<StopRow>(`/api/stops`, {
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
      fmtH(r.tempo_parada_h),
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
    <div className="mp-container" style={{ padding: "10px 8px 30px" }}>
      {/* ===== header (padrão dashboard) ===== */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="mp-chip">Operação</div>
          <div className="mp-page-title">Paradas</div>
          <div className="mp-page-sub">
            Registro e consulta por dia (Postgres) • {brDate(diaRef)}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <div style={{ minWidth: 220 }}>
            <div className="mp-label">Dia para visualizar</div>
            <input className="mp-input" type="date" value={diaRef} onChange={(e) => setDiaRef(e.target.value)} />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "end" }}>
            <button className="mp-btn" onClick={() => loadDay(diaRef)} disabled={loading}>
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
            <button className="mp-btn" onClick={exportCSV} disabled={!rowsDoDia.length}>
              Exportar CSV
            </button>
          </div>
        </div>
      </div>

      {/* ===== grid estilo template ===== */}
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
          gap: 14,
          alignItems: "start",
        }}
      >
        {/* ===== KPI cards (4) ===== */}
        <div className="mp-card" style={{ gridColumn: "span 12" }}>
          <div className="mp-card-b">
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              }}
            >
              <div style={kpiBoxStyle()}>
                <div className="mp-help">Total de Paradas</div>
                <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>{totals.totalParadas}</div>
                <div className="mp-help" style={{ marginTop: 6 }}>
                  Registros no dia
                </div>
              </div>

              <div style={kpiBoxStyle()}>
                <div className="mp-help">Total de Horas Paradas</div>
                <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>{fmtH(totals.totalHoras)} h</div>
                <div className="mp-help" style={{ marginTop: 6 }}>
                  Soma automática (tempo_parada_h)
                </div>
              </div>

              <div style={kpiBoxStyle()}>
                <div className="mp-help">Pior Equipamento</div>
                <div style={{ fontSize: 18, fontWeight: 950, marginTop: 6 }}>
                  {totals.topEq ? totals.topEq.name : "—"}
                </div>
                <div className="mp-help" style={{ marginTop: 6 }}>
                  {totals.topEq ? `${fmtH(totals.topEq.hours)} h` : "Sem dados"}
                </div>
              </div>

              <div style={kpiBoxStyle()}>
                <div className="mp-help">Tipo com mais horas</div>
                <div style={{ fontSize: 18, fontWeight: 950, marginTop: 6 }}>
                  {totals.topTipo ? totals.topTipo.name : "—"}
                </div>
                <div className="mp-help" style={{ marginTop: 6 }}>
                  {totals.topTipo ? `${fmtH(totals.topTipo.hours)} h` : "Sem dados"}
                </div>
              </div>
            </div>

            <div className="mp-help" style={{ marginTop: 10 }}>
              {loading ? "Carregando..." : err ? `Erro: ${err}` : <>Registros do dia: <b>{rowsDoDia.length}</b></>}
            </div>
          </div>
        </div>

        {/* ===== Left: Tabela grande ===== */}
        <div className="mp-card" style={{ gridColumn: "span 12" }}>
          <div className="mp-card-h">
            <b>Paradas do dia • {brDate(diaRef)}</b>
            <span className="mp-help">Exclusão remove do Postgres</span>
          </div>

          <div className="mp-card-b" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  {[
                    "Turno",
                    "Data Início",
                    "Hora Início",
                    "Data Fim",
                    "Hora Fim",
                    "Equipamento",
                    "Tipo",
                    "Atividade",
                    "Descrição",
                    "Tempo (h)",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "10px 10px",
                        fontSize: 12,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        color: "rgba(255,255,255,.55)",
                        borderBottom: "1px solid rgba(255,255,255,.10)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rowsDoDia.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="mp-help" style={{ padding: 14 }}>
                      Nenhuma parada registrada para este dia.
                    </td>
                  </tr>
                ) : (
                  rowsDoDia.map((r) => (
                    <tr key={r.id}>
                      <td style={td}>{r.turno}</td>
                      <td style={td}>{brDate(r.data_inicio)}</td>
                      <td style={td}>{r.hora_inicio}</td>
                      <td style={td}>{brDate(r.data_fim)}</td>
                      <td style={td}>{r.hora_fim}</td>
                      <td style={td}>
                        <span className="mp-chip">{r.equipamento}</span>
                      </td>
                      <td style={td}>{r.tipo_parada}</td>
                      <td style={td}>{r.atividade}</td>
                      <td style={{ ...td, maxWidth: 520 }}>
                        <div style={{ color: "rgba(255,255,255,.82)", whiteSpace: "normal" }}>
                          {r.descricao || "—"}
                        </div>
                      </td>
                      <td style={td}>
                        <b>{fmtH(r.tempo_parada_h)}</b>
                      </td>
                      <td style={td}>
                        <button
                          className="mp-btn"
                          onClick={() => removeRow(r.id)}
                          disabled={loading}
                          style={{
                            height: 34,
                            padding: "0 10px",
                            borderRadius: 12,
                            border: "1px solid rgba(251,113,133,.30)",
                            background: "rgba(251,113,133,.12)",
                          }}
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="mp-help" style={{ marginTop: 10 }}>
              * Tudo aqui já está no backend/Postgres.
            </div>
          </div>
        </div>

        {/* ===== Right column stack (Resumo por equipamento + Form) ===== */}
        <div className="mp-card" style={{ gridColumn: "span 12" }}>
          <div className="mp-card-h">
            <b>Resumo por equipamento (h)</b>
            <span className="mp-help">Soma das paradas do dia por equipamento</span>
          </div>
          <div className="mp-card-b">
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              {EQUIPAMENTOS.map((eq) => (
                <div
                  key={eq}
                  style={{
                    borderRadius: 16,
                    padding: 12,
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid rgba(255,255,255,.10)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 950 }}>{eq}</div>
                    <span className="mp-chip">{fmtH(horimetroParada[eq] || 0)} h</span>
                  </div>
                  <div className="mp-help" style={{ marginTop: 6 }}>
                    Total do dia
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mp-card" style={{ gridColumn: "span 12" }}>
          <div className="mp-card-h">
            <b>Novo lançamento</b>
            <span className="mp-help">Tempo Parada (h) é calculado automaticamente</span>
          </div>

          <div className="mp-card-b">
            {err && <div className="mp-error">{err}</div>}

            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                alignItems: "end",
              }}
            >
              <div>
                <div className="mp-label">Turno</div>
                <select className="mp-input" value={turno} onChange={(e) => setTurno(Number(e.target.value) as Turno)}>
                  <option value={1}>Turno 1</option>
                  <option value={2}>Turno 2</option>
                </select>
              </div>

              <div>
                <div className="mp-label">Data Início</div>
                <input className="mp-input" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              </div>

              <div>
                <div className="mp-label">Hora Início</div>
                <input className="mp-input" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
              </div>

              <div>
                <div className="mp-label">Data Fim</div>
                <input className="mp-input" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>

              <div>
                <div className="mp-label">Hora Fim</div>
                <input className="mp-input" type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
              </div>

              <div>
                <div className="mp-label">Equipamento</div>
                <select className="mp-input" value={equipamento} onChange={(e) => setEquipamento(e.target.value)}>
                  {EQUIPAMENTOS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mp-label">Tipo de Parada</div>
                <select className="mp-input" value={tipoParada} onChange={(e) => setTipoParada(e.target.value)}>
                  {TIPOS_PARADA.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mp-label">Atividade</div>
                <select className="mp-input" value={atividade} onChange={(e) => setAtividade(e.target.value)}>
                  {ATIVIDADES.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mp-label">Tempo Parada (h)</div>
                <div
                  className="mp-input"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontWeight: 950,
                  }}
                >
                  <span>{fmtH(tempoCalc)} h</span>
                  <span className="mp-help" style={{ margin: 0 }}>
                    auto
                  </span>
                </div>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <div className="mp-label">Descrição detalhada da parada</div>
                <textarea
                  className="mp-textarea"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Detalhe o que ocorreu..."
                  style={{ minHeight: 110 }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="mp-btn" onClick={resetForm} disabled={loading}>
                  Limpar
                </button>
                <button className="mp-btn mp-btn-primary" onClick={addRow} disabled={loading}>
                  {loading ? "Salvando..." : "Adicionar parada"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* responsivo: em telas grandes, vira 2 colunas (tabela na esquerda, lateral na direita) */}
      <style>{`
        @media (min-width: 1100px) {
          /* KPI ocupa tudo */
          .mp-container > div[style*="grid-template-columns"] > .mp-card:nth-child(1) { grid-column: span 12; }

          /* tabela ocupa 8 colunas */
          .mp-container > div[style*="grid-template-columns"] > .mp-card:nth-child(2) { grid-column: span 8; }

          /* resumo + form empilham na direita (4 colunas) */
          .mp-container > div[style*="grid-template-columns"] > .mp-card:nth-child(3) { grid-column: span 4; }
          .mp-container > div[style*="grid-template-columns"] > .mp-card:nth-child(4) { grid-column: span 4; }
        }
      `}</style>
    </div>
  );
}
