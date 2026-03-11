import { useMemo, useState } from "react";

function parseBRNumber(v: string): number | null {
  if (!v?.trim()) return null;
  const s = v.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmtBR(n: number, d = 2): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(Number(n || 0));
}

export default function DesvioProducao() {
  const [producaoInformada, setProducaoInformada] = useState("5.626,00");
  const [desvioPct, setDesvioPct] = useState("20,00");
  const [producaoSistemica, setProducaoSistemica] = useState("4.640,00");

  const producao = useMemo(() => parseBRNumber(producaoInformada), [producaoInformada]);
  const desvio = useMemo(() => parseBRNumber(desvioPct), [desvioPct]);
  const sistemica = useMemo(() => parseBRNumber(producaoSistemica), [producaoSistemica]);

  const producaoRealConchada = useMemo(() => {
    if (producao === null || desvio === null) return null;
    return producao * (1 - desvio / 100);
  }, [producao, desvio]);

  const diferenca = useMemo(() => {
    if (sistemica === null || producaoRealConchada === null) return null;
    return sistemica - producaoRealConchada;
  }, [sistemica, producaoRealConchada]);

  const shell: React.CSSProperties = {
    minHeight: "100vh",
    padding: 18,
    color: "rgba(255,255,255,0.92)",
    background:
      "radial-gradient(1100px 700px at 18% 8%, rgba(250,204,21,0.08), transparent 55%), radial-gradient(900px 600px at 85% 18%, rgba(34,197,94,0.08), transparent 55%), radial-gradient(1000px 800px at 50% 110%, rgba(59,130,246,0.06), transparent 60%), #07090c",
  };

  const card: React.CSSProperties = {
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(14,18,22,0.76)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.50)",
    backdropFilter: "blur(12px)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    height: 52,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.92)",
    padding: "0 14px",
    fontWeight: 900,
    fontSize: 18,
    outline: "none",
  };

  return (
    <div style={shell}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 28, fontWeight: 980, letterSpacing: -0.4 }}>Desvio de Produção</div>
            <div style={{ marginTop: 4, color: "rgba(255,255,255,0.62)", fontWeight: 800 }}>
              Correção da produção no padrão MonPlant
            </div>
          </div>

          <div
            style={{
              borderRadius: 999,
              border: "1px solid rgba(34,197,94,0.25)",
              background: "rgba(34,197,94,0.10)",
              color: "rgba(34,197,94,0.95)",
              padding: "8px 12px",
              fontWeight: 950,
              fontSize: 12,
            }}
          >
            Entrada manual + cálculo automático
          </div>
        </div>

        <div style={{ marginTop: 16, ...card, padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 14 }}>
            <div style={{ gridColumn: "span 4" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)", fontWeight: 900, marginBottom: 6 }}>
                Produção Informada
              </div>
              <input
                style={input}
                value={producaoInformada}
                onChange={(e) => setProducaoInformada(e.target.value)}
                placeholder="0,00"
              />
            </div>

            <div style={{ gridColumn: "span 4" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)", fontWeight: 900, marginBottom: 6 }}>
                Desvio (-) %
              </div>
              <input
                style={input}
                value={desvioPct}
                onChange={(e) => setDesvioPct(e.target.value)}
                placeholder="0,00"
              />
            </div>

            <div style={{ gridColumn: "span 4" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)", fontWeight: 900, marginBottom: 6 }}>
                Produção Sistêmica
              </div>
              <input
                style={input}
                value={producaoSistemica}
                onChange={(e) => setProducaoSistemica(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
            gap: 14,
          }}
        >
          <ResultCard
            col={4}
            title="Produção Informada"
            value={producao === null ? "—" : fmtBR(producao)}
            sub="Entrada manual"
          />

          <ResultCard
            col={4}
            title="Desvio (-) %"
            value={desvio === null ? "—" : `${fmtBR(desvio)}%`}
            sub="Entrada manual"
          />

          <ResultCard
            col={4}
            title="Produção Real por Conchada"
            value={producaoRealConchada === null ? "—" : fmtBR(producaoRealConchada)}
            sub="Produção Informada × (1 − Desvio%)"
            accent="cyan"
          />
        </div>

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
            gap: 14,
          }}
        >
          <div style={{ gridColumn: "span 7", ...card, padding: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 950 }}>Produção Sistêmica</div>
            <div style={{ marginTop: 8, color: "rgba(255,255,255,0.65)", fontWeight: 800, lineHeight: 1.5 }}>
              Valor informado manualmente.
              <br />
              Considerar:
              <br />
              <b>Produção Sistêmica = Expedido do cone + Foi para o estoque</b>
            </div>

            <div
              style={{
                marginTop: 18,
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
                padding: 20,
              }}
            >
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", fontWeight: 900 }}>Produção Sistêmica</div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 42,
                  fontWeight: 980,
                  letterSpacing: -1,
                  color: "rgba(255,255,255,0.94)",
                }}
              >
                {sistemica === null ? "—" : fmtBR(sistemica)}
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: "rgba(255,255,255,0.48)", fontWeight: 850 }}>
                Entrada manual baseada no expedido do cone + enviado para estoque.
              </div>
            </div>
          </div>

          <div style={{ gridColumn: "span 5", ...card, padding: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 950 }}>Resumo do cálculo</div>

            <div
              style={{
                marginTop: 14,
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.20)",
                padding: 16,
                display: "grid",
                gap: 12,
              }}
            >
              <Line label="Produção Informada" value={producao === null ? "—" : fmtBR(producao)} />
              <Line label="Desvio (%)" value={desvio === null ? "—" : `${fmtBR(desvio)}%`} />
              <Line label="Produção Sistêmica" value={sistemica === null ? "—" : fmtBR(sistemica)} />
              <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
              <Line
                label="Produção Real por Conchada"
                value={producaoRealConchada === null ? "—" : fmtBR(producaoRealConchada)}
                strong
              />
              <Line
                label="Diferença"
                value={diferenca === null ? "—" : fmtBR(diferenca)}
                strong
                positive={diferenca !== null ? diferenca >= 0 : undefined}
              />
            </div>

            <div style={{ marginTop: 16, color: "rgba(255,255,255,0.56)", fontWeight: 850, lineHeight: 1.5 }}>
              Fórmulas:
              <br />
              <b>Produção Real por Conchada = Produção Informada × (1 − Desvio%)</b>
              <br />
              <b>Diferença = Produção Sistêmica − Produção Real por Conchada</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultCard({
  title,
  value,
  sub,
  col,
  accent,
}: {
  title: string;
  value: string;
  sub: string;
  col: number;
  accent?: "cyan";
}) {
  return (
    <div
      style={{
        gridColumn: `span ${col}`,
        borderRadius: 22,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(14,18,22,0.76)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.50)",
        backdropFilter: "blur(12px)",
        padding: 18,
      }}
    >
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 900 }}>{title}</div>
      <div
        style={{
          marginTop: 8,
          fontSize: 46,
          fontWeight: 980,
          letterSpacing: -1.2,
          color: accent === "cyan" ? "#22d3ee" : "rgba(255,255,255,0.94)",
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.58)", fontWeight: 850 }}>{sub}</div>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
  positive,
}: {
  label: string;
  value: string;
  strong?: boolean;
  positive?: boolean;
}) {
  let color = "rgba(255,255,255,0.92)";
  if (typeof positive === "boolean") {
    color = positive ? "rgba(34,197,94,0.95)" : "rgba(248,113,113,0.95)";
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ color: "rgba(255,255,255,0.65)", fontWeight: 850 }}>{label}</div>
      <div style={{ color, fontWeight: strong ? 980 : 900, fontSize: strong ? 22 : 16 }}>{value}</div>
    </div>
  );
}
