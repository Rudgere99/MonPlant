import { useMemo, useState } from "react";

type Linha = {
  faixa: string;
  tempo: string; // minutos (string pra input)
  tipo: string;
};

const TIPOS = [
  "Mecânica",
  "Elétrica",
  "Operacional",
  "Corretiva",
  "Preventiva",
  "Outros",
] as const;

function toNumberSafe(v: string) {
  const n = Number(String(v || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function LancamentoParadas() {
  const [linhas, setLinhas] = useState<Linha[]>([
    { faixa: "", tempo: "", tipo: "" },
  ]);

  const totalMin = useMemo(() => {
    return linhas.reduce((acc, l) => acc + toNumberSafe(l.tempo), 0);
  }, [linhas]);

  function setLinha(i: number, patch: Partial<Linha>) {
    setLinhas((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  function addLinha() {
    setLinhas((prev) => [...prev, { faixa: "", tempo: "", tipo: "" }]);
  }

  function removeLinha(i: number) {
    setLinhas((prev) => prev.filter((_, idx) => idx !== i));
  }

  function limpar() {
    setLinhas([{ faixa: "", tempo: "", tipo: "" }]);
  }

  function salvar() {
    // Por enquanto só front (igual você pediu).
    // Depois a gente liga no backend.
    console.log("Lançamentos:", linhas);
    alert("Lançamentos prontos (front). Quando quiser, eu integro no backend.");
  }

  return (
    <div className="mp-container">
      {/* Copiando o CSS base da Paradas p/ garantir o mesmo visual */}
      <style>{`
        .mp-grid{ display:grid; grid-template-columns: repeat(12, 1fr); gap:14px; }
        .mp-col-12{ grid-column: span 12 / span 12; }
        @media (max-width: 1100px){
          .mp-grid{ grid-template-columns: 1fr; }
          .mp-col-12{ grid-column: span 1 / span 1 !important; }
        }

        .mp-input, .mp-select{
          width:100%;
          padding:10px 12px;
          border-radius:12px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.10);
          color: rgba(255,255,255,.92);
          outline:none;
        }

        table{ width:100%; border-collapse: collapse; }
        th,td{ padding: 10px 10px; border-bottom: 1px solid rgba(255,255,255,.08); font-size: 13px; }
        th{ color: rgba(255,255,255,.6); text-align:left; font-weight: 800; }

        .mp-help{ color: rgba(255,255,255,.55); font-weight: 750; font-size: 12px; }
        .mp-row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
      `}</style>

      <div className="mp-grid">
        <div className="mp-col-12">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mp-chip">Operação</div>
              <div className="mp-page-title">Lançamento de Paradas</div>
              <div className="mp-page-sub">Tabela rápida • 3 colunas (faixa / tempo / manutenção)</div>
            </div>

            <div className="mp-row">
              <button className="mp-btn" onClick={addLinha}>
                + Linha
              </button>
              <button className="mp-btn" onClick={limpar}>
                Limpar
              </button>
              <button className="mp-btn mp-btn-primary" onClick={salvar}>
                Salvar
              </button>
            </div>
          </div>
        </div>

        <div className="mp-col-12">
          <div className="mp-card">
            <div className="mp-card-h">
              <b>Lançamentos</b>
              <span className="mp-help">Total: {totalMin} min</span>
            </div>

            <div className="mp-card-b" style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Faixa de horário</th>
                    <th>Tempo de parada (min)</th>
                    <th>Tipo de manutenção</th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  {!linhas.length ? (
                    <tr>
                      <td colSpan={4} style={{ color: "rgba(255,255,255,.6)" }}>
                        Sem linhas.
                      </td>
                    </tr>
                  ) : (
                    linhas.map((l, i) => (
                      <tr key={i}>
                        <td style={{ minWidth: 220 }}>
                          <input
                            className="mp-input"
                            placeholder="07:00 – 08:15"
                            value={l.faixa}
                            onChange={(e) => setLinha(i, { faixa: e.target.value })}
                          />
                        </td>

                        <td style={{ width: 180 }}>
                          <input
                            className="mp-input"
                            type="number"
                            placeholder="30"
                            value={l.tempo}
                            onChange={(e) => setLinha(i, { tempo: e.target.value })}
                          />
                        </td>

                        <td style={{ minWidth: 240 }}>
                          <select
                            className="mp-select"
                            value={l.tipo}
                            onChange={(e) => setLinha(i, { tipo: e.target.value })}
                          >
                            <option value="">Selecione</option>
                            {TIPOS.map((x) => (
                              <option key={x} value={x}>
                                {x}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td style={{ width: 110 }}>
                          {linhas.length > 1 ? (
                            <button className="mp-btn mp-btn-danger" onClick={() => removeLinha(i)}>
                              Excluir
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div className="mp-help" style={{ marginTop: 10 }}>
                * “Tempo de parada” em minutos. Depois eu posso transformar isso em horas e integrar com o backend.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
