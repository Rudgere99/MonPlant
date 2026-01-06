import { useEffect, useMemo, useState } from "react";

type Turno = 1 | 2;

type HorimetroRow = {
  id: string;
  day: string; // yyyy-mm-dd
  turno: Turno;
  equipamento: string;
  horimetro: number; // valor lançado (ex: 1234.5)
  obs?: string;
  createdAtISO: string;
};

const EQUIPAMENTOS = ["BT-01", "BT-02", "PN-01", "PN-02"] as const;

const LS_KEY = "monplant:horimetros:v1";

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

function parseBRNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  let s = String(v).trim();
  if (!s) return null;

  s = s.replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmtBR(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
}

function brDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function loadAll(): HorimetroRow[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr as HorimetroRow[];
  } catch {
    return [];
  }
}

function saveAll(rows: HorimetroRow[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rows));
}

/* ===================== page ===================== */

export default function Horimetros() {
  // filtros
  const [fDay, setFDay] = useState<string>(isoTodayLocal());
  const [fTurno, setFTurno] = useState<Turno | "ALL">(1);
  const [fEq, setFEq] = useState<string | "ALL">("ALL");

  // cadastro (opcional, mas já deixei pra você lançar dentro da página)
  const [day, setDay] = useState<string>(isoTodayLocal());
  const [turno, setTurno] = useState<Turno>(1);
  const [equipamento, setEquipamento] = useState<string>(EQUIPAMENTOS[0]);
  const [horimetro, setHorimetro] = useState<string>("");
  const [obs, setObs] = useState<string>("");

  const [rows, setRows] = useState<HorimetroRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setRows(loadAll());
  }, []);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => (fDay ? r.day === fDay : true))
      .filter((r) => (fTurno === "ALL" ? true : r.turno === fTurno))
      .filter((r) => (fEq === "ALL" ? true : r.equipamento === fEq))
      .sort((a, b) => (b.createdAtISO || "").localeCompare(a.createdAtISO || ""));
  }, [rows, fDay, fTurno, fEq]);

  const lastByEq = useMemo(() => {
    const map: Record<string, HorimetroRow | null> = {};
    for (const eq of EQUIPAMENTOS) map[eq] = null;

    // pega o último registro por equipamento (global)
    const sorted = [...rows].sort((a, b) => (b.createdAtISO || "").localeCompare(a.createdAtISO || ""));
    for (const r of sorted) {
      if (!map[r.equipamento]) map[r.equipamento] = r;
    }
    return map;
  }, [rows]);

  function addRow() {
    setErr(null);
    if (!day || !equipamento) {
      setErr("Informe a data e selecione o equipamento.");
      return;
    }

    const n = parseBRNumber(horimetro);
    if (n === null || n < 0) {
      setErr("Horímetro inválido. Ex: 1234,5");
      return;
    }

    const newRow: HorimetroRow = {
      id: uid(),
      day,
      turno,
      equipamento,
      horimetro: n,
      obs: obs || "",
      createdAtISO: new Date().toISOString(),
    };

    const next = [newRow, ...rows];
    setRows(next);
    saveAll(next);

    // já ajusta filtros pra ver o que lançou
    setFDay(day);
    setFTurno(turno);
    setFEq(equipamento);

    setHorimetro("");
    setObs("");
  }

  function removeRow(id: string) {
    const next = rows.filter((r) => r.id !== id);
    setRows(next);
    saveAll(next);
  }

  return (
    <div className="mp-container px-4 py-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mp-chip">Operação</div>
          <div className="mp-page-title">Horímetros</div>
          <div className="mp-page-sub">Histórico + filtros por data, turno e equipamento (offline/localStorage)</div>
        </div>
      </div>

      {/* resumo rápido (último por equipamento) */}
      <div className="mp-card mt-4">
        <div className="mp-card-h">
          <b>Último horímetro por equipamento</b>
          <span className="mp-help">Último registro encontrado no histórico</span>
        </div>
        <div className="mp-card-b">
          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            {EQUIPAMENTOS.map((eq) => {
              const r = lastByEq[eq];
              return (
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
                    <div style={{ fontWeight: 900 }}>{eq}</div>
                    <span className="mp-chip">{r ? fmtBR(r.horimetro) : "—"}</span>
                  </div>
                  <div className="mp-help" style={{ marginTop: 6 }}>
                    {r ? `Dia ${brDate(r.day)} • Turno ${r.turno}` : "Sem registros ainda"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* filtros */}
      <div className="mp-card mt-4">
        <div className="mp-card-h">
          <b>Filtros</b>
          <span className="mp-help">Use para pesquisar no histórico</span>
        </div>
        <div className="mp-card-b">
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              alignItems: "end",
            }}
          >
            <div>
              <div className="mp-label">Data</div>
              <input className="mp-input" type="date" value={fDay} onChange={(e) => setFDay(e.target.value)} />
            </div>

            <div>
              <div className="mp-label">Turno</div>
              <select
                className="mp-input"
                value={fTurno}
                onChange={(e) => setFTurno((e.target.value === "ALL" ? "ALL" : Number(e.target.value)) as any)}
              >
                <option value="ALL">Todos</option>
                <option value={1}>Turno 1</option>
                <option value={2}>Turno 2</option>
              </select>
            </div>

            <div>
              <div className="mp-label">Equipamento</div>
              <select className="mp-input" value={fEq} onChange={(e) => setFEq(e.target.value)}>
                <option value="ALL">Todos</option>
                {EQUIPAMENTOS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>

            <div className="mp-help" style={{ marginLeft: "auto" }}>
              Resultado: <b>{filtered.length}</b> registro(s)
            </div>
          </div>
        </div>
      </div>

      {/* tabela */}
      <div className="mp-card mt-4">
        <div className="mp-card-h">
          <b>Histórico</b>
          <span className="mp-help">Filtrado por Data/Turno/Equipamento</span>
        </div>

        <div className="mp-card-b" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                {["Data", "Turno", "Equipamento", "Horímetro", "Observação", ""].map((h) => (
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
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="mp-help" style={{ padding: 14 }}>
                    Nenhum horímetro encontrado com estes filtros.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td style={td}>{brDate(r.day)}</td>
                    <td style={td}>{r.turno}</td>
                    <td style={td}>
                      <span className="mp-chip">{r.equipamento}</span>
                    </td>
                    <td style={td}>
                      <b>{fmtBR(r.horimetro)}</b>
                    </td>
                    <td style={{ ...td, maxWidth: 520 }}>
                      <div style={{ color: "rgba(255,255,255,.82)" }}>{r.obs || "—"}</div>
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
            * Offline/localStorage. Depois ligamos no backend.
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
