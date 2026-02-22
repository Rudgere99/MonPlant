import React, { useMemo, useState } from "react";

/**
 * UF / DF
 * Página de indicadores (somente DEV, Gerência e Controlador).
 *
 * OBS: Mantive como placeholder pronto pra evoluir.
 * Você pode plugar endpoints depois (ex.: /api/ufdf?day=YYYY-MM-DD).
 */

type Row = {
  hour: string; // "07:00-08:00"
  uf?: number | null;
  df?: number | null;
};

export default function UfDF() {
  const [rows, setRows] = useState<Row[]>(() => {
    // placeholder local (para não quebrar build). Pode remover quando integrar API.
    return [
      { hour: "07:00-08:00", uf: null, df: null },
      { hour: "08:00-09:00", uf: null, df: null },
      { hour: "09:00-10:00", uf: null, df: null },
    ];
  });

  const totals = useMemo(() => {
    const uf = rows.reduce((acc, r) => acc + (Number(r.uf) || 0), 0);
    const df = rows.reduce((acc, r) => acc + (Number(r.df) || 0), 0);
    return { uf, df };
  }, [rows]);

  const card: React.CSSProperties = {
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(14,18,22,0.78)",
    boxShadow: "0 30px 60px rgba(0,0,0,0.55)",
    backdropFilter: "blur(14px)",
  };

  const th: React.CSSProperties = {
    textAlign: "left",
    fontSize: 12,
    color: "rgba(255,255,255,0.60)",
    fontWeight: 900,
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  };

  const td: React.CSSProperties = {
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.88)",
    fontWeight: 700,
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    outline: "none",
    fontWeight: 800,
  };

  return (
    <div style={{ padding: 18, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 950, color: "rgba(255,255,255,0.92)", letterSpacing: -0.2 }}>
            UF / DF
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", fontWeight: 700 }}>
            Indicadores por hora (somente DEV / Gerência / Controlador)
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ ...card, padding: "10px 12px", minWidth: 180 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 900 }}>UF (Total)</div>
            <div style={{ fontSize: 20, fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>{totals.uf.toFixed(2)}</div>
          </div>
          <div style={{ ...card, padding: "10px 12px", minWidth: 180 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 900 }}>DF (Total)</div>
            <div style={{ fontSize: 20, fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>{totals.df.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div style={{ ...card, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <div style={{ fontWeight: 950, color: "rgba(255,255,255,0.88)", letterSpacing: -0.2 }}>Lançamento (placeholder)</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 700 }}>
            Integre com API quando quiser
          </div>
        </div>

        <div style={{ width: "100%", overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
            <thead>
              <tr>
                <th style={th}>Período</th>
                <th style={th}>UF</th>
                <th style={th}>DF</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.hour}>
                  <td style={{ ...td, color: "rgba(255,255,255,0.72)", fontWeight: 900 }}>{r.hour}</td>
                  <td style={td}>
                    <input
                      style={input}
                      inputMode="decimal"
                      value={r.uf ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], uf: v === "" ? null : Number(v.replace(",", ".")) };
                          return next;
                        });
                      }}
                      placeholder="0"
                    />
                  </td>
                  <td style={td}>
                    <input
                      style={input}
                      inputMode="decimal"
                      value={r.df ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], df: v === "" ? null : Number(v.replace(",", ".")) };
                          return next;
                        });
                      }}
                      placeholder="0"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 700 }}>
        Dica: quando você plugar o backend, dá pra transformar isso em gráfico e salvar por dia/turno.
      </div>
    </div>
  );
}
