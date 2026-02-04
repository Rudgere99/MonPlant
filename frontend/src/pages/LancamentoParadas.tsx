import { useMemo, useState } from "react";

type Linha = {
  faixa: string; // agora vem do select (00:00-01:00 ... 23:00-24:00)
  tempo: string; // minutos
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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function buildFaixasHoraCheia() {
  // 00:00–01:00 ... 23:00–24:00
  const arr: string[] = [];
  for (let h = 0; h < 24; h++) {
    const ini = `${pad2(h)}:00`;
    const fim = h === 23 ? "24:00" : `${pad2(h + 1)}:00`;
    arr.push(`${ini}–${fim}`);
  }
  return arr;
}

const FAIXAS = buildFaixasHoraCheia();

function toNumberSafe(v: string) {
  const n = Number(String(v || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function LancamentoParadas() {
  const [linhas, setLinhas] = useState<Linha[]>([
    { faixa: FAIXAS[0], tempo: "", tipo: "" },
  ]);

  const totalMin = useMemo(() => linhas.reduce((acc, l) => acc + toNumberSafe(l.tempo), 0), [linhas]);

  function setLinha(i: number, patch: Partial<Linha>) {
    setLinhas((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  function addLinha() {
    setLinhas((prev) => [...prev, { faixa: FAIXAS[0], tempo: "", tipo: "" }]);
  }

  function removeLinha(i: number) {
    setLinhas((prev) => prev.filter((_, idx) => idx !== i));
  }

  function limpar() {
    setLinhas([{ faixa: FAIXAS[0], tempo: "", tipo: "" }]);
  }

  function salvar() {
    console.log("Lançamentos:", linhas);
    alert("Salvo (front). Quando quiser, integro no backend.");
  }

  return (
    <div className="mp-container">
      {/* CSS base (mantém estilo da Paradas) */}
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
              <div className="mp-page-sub">Faixa de horário fixa (00:00–24:00) • Tempo (min) • Tipo</div>
            </div>

            <div className="mp-row">
              <button className="mp-btn" onClick={addLinha}>+ Linha</button>
              <button className="mp-btn" onClick={limpar}>Limpar</button>
              <button className="mp-btn mp-btn-primary" onClick={salvar}>Salvar</button>
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
                    <th style={{ minWidth: 200 }}>Faixa de horário</th>
                    <th style={{ width: 180 }}>Tempo de parada (min)</th>
                    <th style={{ minWidth: 240 }}>Tipo de manutenção</th>
                    <th style={{ width: 110 }}></th>
                  </tr>
                </thead>

                <tbody>
                  {linhas.map((l, i) => (
                    <tr key={i}>
                      <td>
                        <select
                          className="mp-select"
                          value={l.faixa}
                          onChange={(e) => setLinha(i, { faixa: e.target.value })}
                        >
                          {FAIXAS.map((fx) => (
                            <option key={fx} value={fx}>
                              {fx}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <input
                          className="mp-input"
                          type="number"
                          placeholder="30"
                          value={l.tempo}
                          onChange={(e) => setLinha(i, { tempo: e.target.value })}
                        />
                      </td>

                      <td>
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

                      <td>
                        {linhas.length > 1 ? (
                          <button className="mp-btn mp-btn-danger" onClick={() => removeLinha(i)}>
                            Excluir
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mp-help" style={{ marginTop: 10 }}>
                * Faixa de horário já vem fechada de 00:00–24:00 (hora-cheia). “Tempo” em minutos.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
