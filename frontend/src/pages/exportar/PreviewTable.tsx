import type { PreviewData } from "./types";
import ToneBadge from "./ToneBadge";

export default function PreviewTable({ data, loading }: { data: PreviewData | null; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,.62)" }}>
        Carregando pré-visualização do relatório...
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,.58)" }}>
        Clique em <b>Pré-visualizar</b> para ver como o relatório será exibido antes da exportação.
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{data.title}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,.54)" }}>{data.subtitle}</div>
        </div>
        <ToneBadge tone="muted">Mostrando {data.rows.length} de {data.total} registro(s)</ToneBadge>
      </div>

      <div
        style={{
          overflowX: "auto",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,.07)",
          background: "rgba(7,10,18,.45)",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1160 }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,.035)" }}>
              {data.columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    textAlign: "left",
                    padding: "14px 14px",
                    fontSize: 12,
                    color: "rgba(255,255,255,.62)",
                    fontWeight: 800,
                    borderBottom: "1px solid rgba(255,255,255,.06)",
                    whiteSpace: "nowrap",
                    minWidth: col.width || 130,
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, idx) => (
              <tr key={idx} style={{ background: idx % 2 === 0 ? "rgba(255,255,255,.012)" : "transparent" }}>
                {data.columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: 14,
                      borderBottom: "1px solid rgba(255,255,255,.05)",
                      color: "rgba(255,255,255,.84)",
                      verticalAlign: "top",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row[col.key] ?? "-"}
                  </td>
                ))}
              </tr>
            ))}

            {!data.rows.length && (
              <tr>
                <td colSpan={data.columns.length} style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,.56)" }}>
                  Nenhum registro encontrado para este período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
