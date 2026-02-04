import { useMemo, useState } from "react";

type Row = {
  hora: string;         // "00-01" ... "23-24"
  tempoMin: string;     // input (minutos)
  tipo: string;         // select
};

const TIPOS = [
  "Mecânica",
  "Elétrica",
  "Operacional",
  "Corretiva",
  "Preventiva",
  "Outros",
] as const;

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

function toNumberSafe(v: string) {
  const n = Number(String(v || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function LancamentoParadas() {
  const [rows, setRows] = useState<Row[]>(
    HORAS.map((h) => ({ hora: h, tempoMin: "", tipo: "" }))
  );

  const totalMin = useMemo(
    () => rows.reduce((acc, r) => acc + toNumberSafe(r.tempoMin), 0),
    [rows]
  );

  function setRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function limpar() {
    setRows(HORAS.map((h) => ({ hora: h, tempoMin: "", tipo: "" })));
  }

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

        .lp-tablewrap{
          max-height: calc(100vh - 210px);
          overflow: auto;
        }

        table.lp-table{
          width: 100%;
          border-collapse: collapse;
        }

        .lp-table thead th{
          position: sticky;
          top: 0;
          z-index: 2;
          text-align: left;
          font-size: 12px;
          font-weight: 950;
          color: rgba(255,255,255,.70);
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255,255,255,.10);
          background: rgba(9,11,15,.92);
          backdrop-filter: blur(10px);
        }

        .lp-table tbody td{
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255,255,255,.08);
          color: rgba(255,255,255,.88);
          font-weight: 850;
          font-size: 13px;
        }

        .lp-hora{
          width: 110px;
          color: rgba(255,255,255,.78);
          font-weight: 950;
          letter-spacing: .3px;
        }

        /* Inputs SEM "balão/pílula" */
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

        .lp-footerhint{
          padding: 10px 12px;
          font-size: 12px;
          font-weight: 800;
          color: rgba(255,255,255,.55);
          background: rgba(255,255,255,.02);
        }
      `}</style>

      <div className="lp-wrap">
        <div className="lp-top">
          <div>
            <div className="lp-title">Lançamento de Paradas</div>
            <div className="lp-sub">Tabela fixa • 00-01 até 23-24 • Tempo (min) • Tipo de manutenção</div>
          </div>

          <div className="lp-actions">
            <div className="lp-kpi">Total: {totalMin} min</div>
            <button className="lp-btn" onClick={limpar}>Limpar</button>
            <button className="lp-btn lp-btn-primary" onClick={salvar}>Salvar</button>
          </div>
        </div>

        <div className="lp-tablewrap">
          <table className="lp-table">
            <thead>
              <tr>
                <th style={{ width: 120 }}>Hora</th>
                <th style={{ width: 220 }}>Tempo de parada (min)</th>
                <th>Tipo de manutenção</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.hora}>
                  <td className="lp-hora">{r.hora}</td>

                  <td>
                    <input
                      className="lp-input"
                      type="number"
                      inputMode="numeric"
                      placeholder="0"
                      value={r.tempoMin}
                      onChange={(e) => setRow(idx, { tempoMin: e.target.value })}
                    />
                  </td>

                  <td>
                    <select
                      className="lp-select"
                      value={r.tipo}
                      onChange={(e) => setRow(idx, { tipo: e.target.value })}
                    >
                      <option value="">Selecione</option>
                      {TIPOS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lp-footerhint">
          * A tabela é fixa (24 linhas). Preencha somente as horas que tiveram parada.
        </div>
      </div>
    </div>
  );
}
