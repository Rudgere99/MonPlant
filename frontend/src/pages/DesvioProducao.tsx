import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";
const LS_KEY = "mp_desvio_producao_v2";

type PlantHourRow = { period: string; ton?: any; freq?: any };
type PlantDayPayload = { day: string; obs?: string | null; rows: PlantHourRow[]; updated_at?: string | null };

function isoTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

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

function authHeaders(token?: string | null): Record<string, string> {
  const t = (token || "").trim();
  if (t) return { Authorization: `Bearer ${t}` };

  const keys = ["mp_token", "token", "access_token", "auth_token"];
  for (const k of keys) {
    const v = (localStorage.getItem(k) || "").trim();
    if (v) return { Authorization: `Bearer ${v}` };
  }
  return {};
}

async function apiGet<T>(path: string, token?: string | null): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders(token) });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}

type SplitState = {
  sinter: string;
  sinter2: string;
  hematita: string;
  granulado: string;
};

function loadSaved() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function DesvioProducao() {
  const saved = useMemo(() => loadSaved(), []);

  const [day, setDay] = useState<string>(saved?.day || isoTodayLocal());
  const [desvioPct, setDesvioPct] = useState<string>(saved?.desvioPct || "20,00");
  const [producaoSistemica, setProducaoSistemica] = useState<string>(saved?.producaoSistemica || "4.640,00");
  const [splitOpen, setSplitOpen] = useState<boolean>(saved?.splitOpen ?? false);
  const [split, setSplit] = useState<SplitState>(
    saved?.split || {
      sinter: "52,89",
      sinter2: "6,60",
      hematita: "18,29",
      granulado: "22,22",
    }
  );

  const [loadingProd, setLoadingProd] = useState(false);
  const [prodErr, setProdErr] = useState<string | null>(null);
  const [producaoInformadaAuto, setProducaoInformadaAuto] = useState<number | null>(null);

  useEffect(() => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        day,
        desvioPct,
        producaoSistemica,
        splitOpen,
        split,
      })
    );
  }, [day, desvioPct, producaoSistemica, splitOpen, split]);

  useEffect(() => {
    let alive = true;

    async function loadDayProduction() {
      setLoadingProd(true);
      setProdErr(null);

      try {
        const p = await apiGet<PlantDayPayload>(`/api/plant-production/${encodeURIComponent(day)}`);
        if (!alive) return;
        const total =
          (p?.rows || []).reduce((acc, r) => acc + (Number(String(r?.ton ?? "").replace(",", ".")) || Number(r?.ton) || 0), 0);

        setProducaoInformadaAuto(total);
      } catch (e: any) {
        if (!alive) return;
        setProducaoInformadaAuto(null);
        setProdErr(e?.message || "Falha ao carregar a produção do dia.");
      } finally {
        if (alive) setLoadingProd(false);
      }
    }

    loadDayProduction();
    return () => {
      alive = false;
    };
  }, [day]);

  const producao = useMemo(() => producaoInformadaAuto, [producaoInformadaAuto]);
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

  const splitNums = useMemo(() => {
    return {
      sinter: parseBRNumber(split.sinter) || 0,
      sinter2: parseBRNumber(split.sinter2) || 0,
      hematita: parseBRNumber(split.hematita) || 0,
      granulado: parseBRNumber(split.granulado) || 0,
    };
  }, [split]);

  const splitTotalPct = useMemo(
    () => splitNums.sinter + splitNums.sinter2 + splitNums.hematita + splitNums.granulado,
    [splitNums]
  );

  const splitBase = useMemo(() => producaoRealConchada || 0, [producaoRealConchada]);

  const splitRows = useMemo(() => {
    const mk = (name: string, pct: number) => ({
      produto: name,
      pct,
      ton: splitBase * (pct / 100),
    });
    return [
      mk("Sinter", splitNums.sinter),
      mk("Sinter 2", splitNums.sinter2),
      mk("Hematita", splitNums.hematita),
      mk("Granulado", splitNums.granulado),
    ];
  }, [splitBase, splitNums]);

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
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
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

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => setSplitOpen((v) => !v)}
              style={{
                borderRadius: 14,
                border: "1px solid rgba(34,197,94,0.25)",
                background: splitOpen ? "rgba(34,197,94,0.18)" : "rgba(34,197,94,0.10)",
                color: "rgba(34,197,94,0.95)",
                padding: "10px 14px",
                fontWeight: 950,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {splitOpen ? "Ocultar Split de Produção" : "Split de Produção"}
            </button>

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
              Persistência em LocalStorage
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, ...card, padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 14 }}>
            <div style={{ gridColumn: "span 4" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)", fontWeight: 900, marginBottom: 6 }}>
                Dia
              </div>
              <input style={input} type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>

            <div style={{ gridColumn: "span 4" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)", fontWeight: 900, marginBottom: 6 }}>
                Produção Informada (automática do dia)
              </div>
              <div
                style={{
                  ...input,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <span>{loadingProd ? "Carregando..." : producao === null ? "—" : fmtBR(producao)}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", fontWeight: 850 }}>dia selecionado</span>
              </div>
              {prodErr ? <div style={{ marginTop: 6, color: "rgba(248,113,113,0.95)", fontSize: 12, fontWeight: 850 }}>{prodErr}</div> : null}
            </div>

            <div style={{ gridColumn: "span 2" }}>
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

            <div style={{ gridColumn: "span 2" }}>
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
            col={3}
            title="Produção Informada"
            value={producao === null ? "—" : fmtBR(producao)}
            sub="Puxada automaticamente do dia"
          />

          <ResultCard
            col={3}
            title="Desvio (-) %"
            value={desvio === null ? "—" : `${fmtBR(desvio)}%`}
            sub="Entrada manual"
          />

          <ResultCard
            col={3}
            title="Produção Real por Conchada"
            value={producaoRealConchada === null ? "—" : fmtBR(producaoRealConchada)}
            sub="Produção Informada × (1 − Desvio%)"
            accent="cyan"
          />

          <ResultCard
            col={3}
            title="Diferença"
            value={diferenca === null ? "—" : fmtBR(diferenca)}
            sub="Produção Sistêmica − Real por Conchada"
            accent={typeof diferenca === "number" ? (diferenca >= 0 ? "green" : "red") : undefined}
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
              <b>Produção Sistêmica = Expedido do cone + Foi para o estoque</b>
              <br />
              <b>Diferença = Produção Sistêmica − Produção Real por Conchada</b>
            </div>
          </div>

          <div style={{ gridColumn: "span 5", ...card, padding: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 950 }}>Status do Split</div>

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
              <Line label="Base do Split" value={producaoRealConchada === null ? "—" : fmtBR(producaoRealConchada)} />
              <Line label="Total das %" value={`${fmtBR(splitTotalPct)}%`} strong positive={Math.abs(splitTotalPct - 100) < 0.01} />
              <div style={{ color: Math.abs(splitTotalPct - 100) < 0.01 ? "rgba(34,197,94,0.95)" : "rgba(248,113,113,0.95)", fontWeight: 900, fontSize: 13 }}>
                {Math.abs(splitTotalPct - 100) < 0.01 ? "Percentuais fechando em 100%" : "Ajuste os percentuais para fechar 100%"}
              </div>
            </div>
          </div>
        </div>

        {splitOpen ? (
          <div style={{ marginTop: 16, ...card, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 980, letterSpacing: -0.3 }}>Produção por Tipo de Produto (Split)</div>
                <div style={{ marginTop: 4, color: "rgba(255,255,255,0.62)", fontWeight: 800 }}>
                  Base atual: Produção Real por Conchada
                </div>
              </div>
            </div>

            <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 14 }}>
              {[
                { key: "sinter", label: "Sinter 1" },
                { key: "sinter2", label: "Sinter 2" },
                { key: "hematita", label: "Hematita" },
                { key: "granulado", label: "Granulado" },
              ].map((it) => (
                <div key={it.key} style={{ gridColumn: "span 3" }}>
                  <div
                    style={{
                      borderRadius: 18,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.03)",
                      padding: 14,
                    }}
                  >
                    <div style={{ fontSize: 18, fontWeight: 980, textAlign: "center" }}>{it.label}</div>
                    <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.58)", fontWeight: 900 }}>Percentual (%)</div>
                    <input
                      style={{ ...input, marginTop: 6 }}
                      value={(split as any)[it.key]}
                      onChange={(e) => setSplit((prev) => ({ ...prev, [it.key]: e.target.value }))}
                    />
                    <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.58)", fontWeight: 900 }}>Tonelagem</div>
                    <div
                      style={{
                        marginTop: 6,
                        height: 52,
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.03)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 22,
                        fontWeight: 980,
                      }}
                    >
                      {fmtBR(splitRows.find((r) => r.produto === it.label)?.ton || 0, 2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 18, ...card, padding: 16, background: "rgba(0,0,0,0.18)" }}>
              <div style={{ fontSize: 16, fontWeight: 950, marginBottom: 10 }}>Visualização do Split</div>
              <div style={{ height: 320 }}>
               <ResponsiveContainer width="100%" height="100%">
  <BarChart data={splitRows} margin={{ top: 16, right: 22, left: 10, bottom: 8 }}>
    <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
    <XAxis
      dataKey="produto"
      tick={{ fill: "rgba(255,255,255,0.60)", fontSize: 12 }}
    />
    <YAxis tick={{ fill: "rgba(255,255,255,0.60)", fontSize: 12 }} />
    <Tooltip
      contentStyle={{
        background: "rgba(5,7,10,0.92)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14,
        color: "white",
      }}
      formatter={(v: any) => [fmtBR(Number(v || 0), 2), "Ton"]}
    />
    <Bar dataKey="ton" fill="#22d3ee" radius={[10, 10, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : null}
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
  accent?: "cyan" | "green" | "red";
}) {
  let color = "rgba(255,255,255,0.94)";
  if (accent === "cyan") color = "#22d3ee";
  if (accent === "green") color = "rgba(34,197,94,0.95)";
  if (accent === "red") color = "rgba(248,113,113,0.95)";

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
          fontSize: 40,
          fontWeight: 980,
          letterSpacing: -1.2,
          color,
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
      <div style={{ color, fontWeight: strong ? 980 : 900, fontSize: strong ? 22 : 16 }}>
        {value}
      </div>
    </div>
  );
}
