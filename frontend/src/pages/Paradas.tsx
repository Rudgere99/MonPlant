import { useEffect, useMemo, useState } from "react";

/* ===================== tipos ===================== */

type Turno = 1 | 2;

type StopRow = {
  id: string;

  turno: Turno;

  // datas no formato yyyy-mm-dd
  dataInicio: string;
  dataFim: string;

  // horas no formato HH:MM
  horaInicio: string;
  horaFim: string;

  equipamento: string;
  tipoParada: string;
  atividade: string;

  descricao: string;

  // calculado
  tempoParadaH: number;

  createdAtISO: string;
};

/* ===================== constantes (combos) ===================== */

// ✅ Ajuste como quiser
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

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
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
  // 1 casa decimal, pt-BR
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

/* ===================== storage ===================== */

const LS_KEY = "monplant:paradas:v1";

function loadAll(): StopRow[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr as StopRow[];
  } catch {
    return [];
  }
}

function saveAll(rows: StopRow[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rows));
}

/* ===================== cálculo do tempo ===================== */

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

  // se usuário colocou fim "antes" do início por engano, tenta corrigir adicionando 1 dia
  if (h < 0) {
    const e2 = new Date(e.getTime() + 24 * 60 * 60 * 1000);
    h = diffHours(s, e2);
  }

  if (!Number.isFinite(h)) return 0;
  return clamp(h, 0, 72); // limite de segurança
}

/* ===================== componente ===================== */

export default function Paradas() {
  // filtro por dia (pra visualizar “do dia”)
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
  const [err, setErr] = useState<string | null>(null);

  // carrega storage
  useEffect(() => {
    setRows(loadAll());
  }, []);

  // tempo calculado “ao vivo”
  const tempoCalc = useMemo(() => {
    return calcTempoParadaH(dataInicio, horaInicio, dataFim, horaFim);
  }, [dataInicio, horaInicio, dataFim, horaFim]);

  // lista do dia selecionado (diaRef)
  const rowsDoDia = useMemo(() => {
    // regra: considera "do dia" pelo Data Início (padrão)
    return rows
      .filter((r) => r.dataInicio === diaRef)
      .sort((a, b) => {
        const da = parseDateTimeLocal(a.dataInicio, a.horaInicio)?.getTime() ?? 0;
        const db = parseDateTimeLocal(b.dataInicio, b.horaInicio)?.getTime() ?? 0;
        return da - db;
      });
  }, [rows, diaRef]);

  // horímetro de parada (horas paradas) por equipamento no diaRef
  const horimetroParada = useMemo(() => {
    const base: Record<string, number> = {};
    for (const eq of EQUIPAMENTOS) base[eq] = 0;

    for (const r of rowsDoDia) {
      if (!base[r.equipamento]) base[r.equipamento] = 0;
      base[r.equipamento] += r.tempoParadaH || 0;
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

  function addRow() {
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

    const newRow: StopRow = {
      id: uid(),
      turno,
      dataInicio,
      dataFim,
      horaInicio,
      horaFim,
      equipamento,
      tipoParada,
      atividade,
      descricao: descricao || "",
      tempoParadaH: tempo,
      createdAtISO: new Date().toISOString(),
    };

    const next = [newRow, ...rows];
    setRows(next);
    saveAll(next);

    // mantém o diaRef para continuar no mesmo dia
    setDiaRef(dataInicio);
    resetForm();
  }

  function removeRow(id: string) {
    const next = rows.filter((r) => r.id !== id);
    setRows(next);
    saveAll(next);
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
      r.dataInicio,
      r.horaInicio,
      r.dataFim,
      r.horaFim,
      r.equipamento,
      r.tipoParada,
      r.atividade,
      r.descricao,
      fmtH(r.tempoParadaH),
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
    <div className="mp-container px-4 py-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mp-chip">Operação</div>
          <div className="mp-page-title">Paradas</div>
          <div className="mp-page-sub">Registro de paradas + tempo automático + horímetro por equipamento (offline)</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="mp-btn" onClick={exportCSV} disabled={!rowsDoDia.length}>
            Exportar CSV (dia)
          </button>
          <button className="mp-btn" onClick={resetForm}>
            Limpar formulário
          </button>
        </div>
      </div>

      {/* filtro do dia */}
      <div className="mp-card mt-4">
        <div className="mp-card-b" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
          <div style={{ minWidth: 220 }}>
            <div className="mp-label">Dia para visualizar</div>
            <input className="mp-input" type="date" value={diaRef} onChange={(e) => setDiaRef(e.target.value)} />
          </div>

          <div className="mp-help" style={{ marginLeft: "auto" }}>
            Registros do dia: <b>{rowsDoDia.length}</b>
          </div>
        </div>
      </div>

      {/* horímetro */}
      <div className="mp-card mt-4">
        <div className="mp-card-h">
          <b>Horímetro de parada (h) • {brDate(diaRef)}</b>
          <span className="mp-help">Soma automática das paradas do dia por equipamento</span>
        </div>
        <div className="mp-card-b">
          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            {EQUIPAMENTOS.map((eq) => (
              <div
                key={eq}
                className="mp-card"
                style={{
                  borderRadius: 16,
                  padding: 12,
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid rgba(255,255,255,.10)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 900 }}>{eq}</div>
                  <span className="mp-chip">{fmtH(horimetroParada[eq] || 0)} h</span>
                </div>
                <div className="mp-help" style={{ marginTop: 6 }}>
                  Total de paradas no dia
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* formulário */}
      <div className="mp-card mt-4">
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
                  fontWeight: 900,
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
              <button className="mp-btn mp-btn-primary" onClick={addRow}>
                Adicionar parada
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* tabela */}
      <div className="mp-card mt-4">
        <div className="mp-card-h">
          <b>Paradas do dia • {brDate(diaRef)}</b>
          <span className="mp-help">Clique em excluir para remover um registro</span>
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
                  "Tipo de Parada",
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
                    <td style={td}>{brDate(r.dataInicio)}</td>
                    <td style={td}>{r.horaInicio}</td>
                    <td style={td}>{brDate(r.dataFim)}</td>
                    <td style={td}>{r.horaFim}</td>
                    <td style={td}>
                      <span className="mp-chip">{r.equipamento}</span>
                    </td>
                    <td style={td}>{r.tipoParada}</td>
                    <td style={td}>{r.atividade}</td>
                    <td style={{ ...td, maxWidth: 420 }}>
                      <div style={{ color: "rgba(255,255,255,.82)" }}>{r.descricao || "—"}</div>
                    </td>
                    <td style={td}>
                      <b>{fmtH(r.tempoParadaH)}</b>
                    </td>
                    <td style={td}>
                      <button
                        className="mp-btn"
                        onClick={() => removeRow(r.id)}
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
            * Offline/localStorage. Depois a gente liga no backend.
          </div>
        </div>
      </div>
    </div>
  );
}

const td: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(255,255,255,.06)",
  verticalAlign: "top",
  whiteSpace: "nowrap",
  color: "rgba(255,255,255,.85)",
};
