import { useMemo, useState } from "react";
import { PieChart, Pie, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

type Tipo = "Mecânica" | "Elétrica" | "Operacional" | "Corretiva" | "Preventiva" | "Outros";

type Row = {
  hora: string;     // "00-01" ... "23-24"
  tempoMin: string; // input (minutos)
  tipo: Tipo | "";  // select
};

const TIPOS: Tipo[] = ["Mecânica", "Elétrica", "Operacional", "Corretiva", "Preventiva", "Outros"];

const TYPE_COLORS: Record<Tipo, string> = {
  "Mecânica": "#22d3ee",     // cyan
  "Elétrica": "#a78bfa",     // violet
  "Operacional": "#f59e0b",  // amber
  "Corretiva": "#fb7185",    // rose
  "Preventiva": "#34d399",   // emerald
  "Outros": "#94a3b8",       // slate
};


function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function buildHorasFixas(): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    const ini = pad2(h);
    const fim = h === 23 ? "24" : pad2(h + 1);
    out.push(`${ini}-${fim}`);
  }
  return out;
}

const HORAS = buildHorasFixas();


function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toNumberSafe(v: string) {
  const n = Number(String(v || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formatHours(h: number) {
  // 1 decimal (ex: 2.5h)
  const v = Math.round(h * 10) / 10;
  return `${v}h`;
}

export default function LancamentoParadas() {
  const [rows, setRows] = useState<Row[]>(
    HORAS.map((h) => ({ hora: h, tempoMin: "", tipo: "" }))
  );

  function setRowByIndex(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function limpar() {
    setRows(HORAS.map((h) => ({ hora: h, tempoMin: "", tipo: "" })));
  }

  const totalMin = useMemo(
    () => rows.reduce((acc, r) => acc + toNumberSafe(r.tempoMin), 0),
    [rows]
  );

  const pieData = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of TIPOS) map.set(t, 0);

    rows.forEach((r) => {
      const min = toNumberSafe(r.tempoMin);
      if (!min) return;
      if (!r.tipo) return;
      map.set(r.tipo, (map.get(r.tipo) || 0) + min);
    });

    // Recharts: value em horas (min/60)
    return Array.from(map.entries())
      .map(([name, min]) => ({ name, value: min / 60 }))
      .filter((x) => x.value > 0);
  }, [rows]);

  const leftRows = rows.slice(0, 12);  // 00-01 ... 11-12
  const rightRows = rows.slice(12, 24); // 12-13 ... 23-24

  function salvar() {
    console.log("LancamentoParadas:", rows);
    alert("Salvo (front). Quando quiser, eu integro no backend.");
  }

  return (
    <div className="mp-container">
      <style>{`
        .lp-wrap{
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(10,12,16,.55);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 20px 50px rgba(0,0,0,.45);
          backdrop-filter: blur(10px);
        }

        .lp-top{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          padding: 12px 12px;
          border-bottom: 1px solid rgba(255,255,255,.10);
          background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02));
        }

        .lp-title{
          font-weight: 950;
          letter-spacing: -0.2px;
          color: rgba(255,255,255,.92);
        }

        .lp-sub{
          margin-top: 2px;
          font-size: 12px;
          font-weight: 800;
          color: rgba(255,255,255,.55);
        }

        .lp-actions{
          display:flex;
          gap:10px;
          align-items:center;
          flex-wrap: wrap;
        }

        .lp-kpi{
          font-size: 12px;
          font-weight: 900;
          color: rgba(255,255,255,.70);
          padding: 8px 10px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(255,255,255,.04);
        }

        .lp-btn{
          height: 38px;
          padding: 0 12px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.06);
          color: rgba(255,255,255,.90);
          font-weight: 900;
          cursor: pointer;
        }
        .lp-btn:hover{ background: rgba(255,255,255,.08); }

        .lp-btn-primary{
          border-color: rgba(255,159,26,.28);
          background: rgba(255,159,26,.14);
        }
        .lp-btn-primary:hover{ background: rgba(255,159,26,.18); }

        .lp-grid{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        @media (max-width: 980px){
          .lp-grid{ grid-template-columns: 1fr; }
        }

        .lp-section{
          border-top: 1px solid rgba(255,255,255,.10);
          padding: 12px;
        }

        .lp-tablewrap{
          overflow: auto;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 14px;
          background: rgba(0,0,0,.10);
        }

        table.lp-table{
          width: 100%;
          border-collapse: collapse;
        }

        .lp-table thead th{
          text-align: left;
          font-size: 12px;
          font-weight: 950;
          color: rgba(255,255,255,.70);
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255,255,255,.10);
          background: rgba(9,11,15,.60);
        }

        .lp-table tbody td{
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255,255,255,.08);
          color: rgba(255,255,255,.88);
          font-weight: 850;
          font-size: 13px;
        }

        .lp-hora{
          width: 90px;
          color: rgba(255,255,255,.78);
          font-weight: 950;
          letter-spacing: .3px;
        }

        /* Inputs sem "pílula" */
        .lp-input, .lp-select{
          width: 100%;
          height: 34px;
          padding: 0 10px;
          border-radius: 10px;
          outline: none;
          color: rgba(255,255,255,.92);
          background: rgba(0,0,0,.12);
          border: 1px solid rgba(255,255,255,.10);
          font-weight: 900;
        }
        .lp-input:focus, .lp-select:focus{
          border-color: rgba(255,159,26,.35);
          box-shadow: 0 0 0 3px rgba(255,159,26,.10);
        }

        .lp-chart{
          height: 260px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 14px;
          background: rgba(0,0,0,.10);
          overflow: hidden;
          padding: 10px;
        }

        .lp-labelrow{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap: 10px;
          margin-bottom: 10px;
        }

        .lp-chip{
          font-size: 12px;
          font-weight: 950;
          color: rgba(255,255,255,.80);
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(255,255,255,.04);
        }

        .lp-footerhint{
          padding: 10px 12px;
          font-size: 12px;
          font-weight: 800;
          color: rgba(255,255,255,.55);
          background: rgba(255,255,255,.02);
          border-top: 1px solid rgba(255,255,255,.10);
        }
      `}</style>

      <div className="lp-wrap">
        <div className="lp-top">
          <div>
            <div className="lp-title">Lançamento de Paradas</div>
            <div className="lp-sub">Tabela fixa (24h) • 2 colunas: 00:00–12:00 e 12:00–00:00 • Pizza por tipo</div>
          </div>

          <div className="lp-actions">
            <div className="lp-kpi">Total: {Math.round(totalMin)} min</div>
            <button className="lp-btn" onClick={limpar}>Limpar</button>
            <button className="lp-btn lp-btn-primary" onClick={salvar}>Salvar</button>
          </div>
        </div>

        {/* ===== Gráfico Pizza ===== */}
        <div className="lp-section">
          <div className="lp-labelrow">
            <div className="lp-chip">Horas por tipo de manutenção</div>
            <div className="lp-kpi">Total: {formatHours(totalMin / 60)}</div>
          </div>

          <div className="lp-chart">
            {pieData.length === 0 ? (
              <div style={{ height: "100%", display: "grid", placeItems: "center", color: "rgba(255,255,255,.55)", fontWeight: 850 }}>
                Preencha tempo + tipo para aparecer o gráfico.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" />
                  <Tooltip formatter={(v: any) => formatHours(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ===== Tabelas em 2 colunas ===== */}
        <div className="lp-section">
          <div className="lp-grid">
            {/* 00-12 */}
            <div>
              <div className="lp-labelrow">
                <div className="lp-chip">00:00 – 12:00</div>
                <div className="lp-sub" style={{ marginTop: 0 }}>12 faixas</div>
              </div>

              <div className="lp-tablewrap">
                <table className="lp-table">
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>Hora</th>
                      <th style={{ width: 170 }}>Tempo (min)</th>
                      <th>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leftRows.map((r, i) => {
                      const idx = i; // 0..11
                      return (
                        <tr key={r.hora}>
                          <td className="lp-hora">{r.hora}</td>
                          <td>
                            <input
                              className="lp-input"
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={60}
                              placeholder="0-60"
                              value={rows[idx].tempoMin}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") return setRowByIndex(idx, { tempoMin: "" });
                                const n0 = Number(raw);
                                const n = clamp(Number.isFinite(n0) ? n0 : 0, 0, 60);
                                setRowByIndex(idx, { tempoMin: String(n) });
                              }}
                            />
                          </td>
                          <td>
                            <div className="lp-selectwrap">
                            <span
                              className="lp-dot"
                              style={{
                                background: rows[idx].tipo
                                  ? TYPE_COLORS[rows[idx].tipo as Tipo]
                                  : "rgba(255,255,255,.18)",
                              }}
                            />
                            <select
                              className="lp-select"
                              value={rows[idx].tipo}
                              onChange={(e) => setRowByIndex(idx, { tipo: e.target.value as any })}
                            >
                              <option value="">Selecione</option>
                              {TIPOS.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 12-00 */}
            <div>
              <div className="lp-labelrow">
                <div className="lp-chip">12:00 – 00:00</div>
                <div className="lp-sub" style={{ marginTop: 0 }}>12 faixas</div>
              </div>

              <div className="lp-tablewrap">
                <table className="lp-table">
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>Hora</th>
                      <th style={{ width: 170 }}>Tempo (min)</th>
                      <th>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rightRows.map((r, j) => {
                      const idx = 12 + j; // 12..23
                      return (
                        <tr key={r.hora}>
                          <td className="lp-hora">{r.hora}</td>
                          <td>
                            <input
                              className="lp-input"
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={60}
                              placeholder="0-60"
                              value={rows[idx].tempoMin}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") return setRowByIndex(idx, { tempoMin: "" });
                                const n0 = Number(raw);
                                const n = clamp(Number.isFinite(n0) ? n0 : 0, 0, 60);
                                setRowByIndex(idx, { tempoMin: String(n) });
                              }}
                            />
                          </td>
                          <td>
                            <div className="lp-selectwrap">
                            <span
                              className="lp-dot"
                              style={{
                                background: rows[idx].tipo
                                  ? TYPE_COLORS[rows[idx].tipo as Tipo]
                                  : "rgba(255,255,255,.18)",
                              }}
                            />
                            <select
                              className="lp-select"
                              value={rows[idx].tipo}
                              onChange={(e) => setRowByIndex(idx, { tipo: e.target.value as any })}
                            >
                              <option value="">Selecione</option>
                              {TIPOS.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="lp-footerhint">
            * O gráfico soma <b>horas</b> por tipo (tempo em minutos ÷ 60). Preencha só as horas que tiveram parada.
          </div>
        </div>
      </div>
    </div>
  );
}
