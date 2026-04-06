
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

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";
const LS_KEY = "mp_desvio_producao_v2";

type PlantHourRow = { period: string; ton?: any; freq?: any };
type PlantDayPayload = {
  day: string;
  obs?: string | null;
  rows: PlantHourRow[];
  updated_at?: string | null;
};

type PlantInfo = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
};

type PlantScope = number | "all";

type SplitState = {
  sinter1: string;
  sinter2: string;
  hematita: string;
  granulado: string;
};

type SplitKey = keyof SplitState;

type SplitRow = {
  produto: string;
  pct: number;
  ton: number;
};

const SPLIT_FIELDS: Array<{ key: SplitKey; label: string }> = [
  { key: "sinter1", label: "Sinter 1" },
  { key: "sinter2", label: "Sinter 2" },
  { key: "hematita", label: "Hematita" },
  { key: "granulado", label: "Granulado" },
];

const defaultSplit: SplitState = {
  sinter1: "52,89",
  sinter2: "6,60",
  hematita: "18,29",
  granulado: "22,22",
};

function isoTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseBRNumber(v: string | number | null | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (!v?.toString().trim()) return null;

  const s = v
    .toString()
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

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
  const r = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(token),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }

  return (await r.json()) as T;
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sumPlantRows(rows: PlantHourRow[] = []): number {
  return rows.reduce((acc, row) => {
    const value =
      parseBRNumber(row?.ton) ??
      Number(String(row?.ton ?? "").replace(",", ".")) ??
      0;

    return acc + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function getAccentColor(
  accent?: "cyan" | "green" | "red" | "amber"
): string {
  if (accent === "cyan") return "#22d3ee";
  if (accent === "green") return "rgba(34,197,94,0.95)";
  if (accent === "red") return "rgba(248,113,113,0.95)";
  if (accent === "amber") return "rgba(250,204,21,0.96)";
  return "rgba(255,255,255,0.94)";
}

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: 18,
  color: "rgba(255,255,255,0.92)",
  background:
    "radial-gradient(1100px 700px at 18% 8%, rgba(250,204,21,0.08), transparent 55%), radial-gradient(900px 600px at 85% 18%, rgba(34,197,94,0.08), transparent 55%), radial-gradient(1000px 800px at 50% 110%, rgba(59,130,246,0.06), transparent 60%), #07090c",
};

const panelStyle: React.CSSProperties = {
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(14,18,22,0.76)",
  boxShadow: "0 24px 70px rgba(0,0,0,0.50)",
  backdropFilter: "blur(12px)",
};

const inputStyle: React.CSSProperties = {
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

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,0.58)",
  fontWeight: 900,
  marginBottom: 6,
};

export default function DesvioProducao() {
  const saved = useMemo(() => loadSaved(), []);

  const [day, setDay] = useState<string>(saved?.day || isoTodayLocal());
  const [desvioPct, setDesvioPct] = useState<string>(
    saved?.desvioPct || "20,00"
  );
  const [producaoSistemica, setProducaoSistemica] = useState<string>(
    saved?.producaoSistemica || "4.640,00"
  );
  const [splitOpen, setSplitOpen] = useState<boolean>(
    saved?.splitOpen ?? false
  );
  const [split, setSplit] = useState<SplitState>(saved?.split || defaultSplit);

  const [plants, setPlants] = useState<PlantInfo[]>([]);
  const [plantId, setPlantId] = useState<PlantScope | null>(null);

  const [loadingProd, setLoadingProd] = useState(false);
  const [prodErr, setProdErr] = useState<string | null>(null);
  const [producaoInformadaAuto, setProducaoInformadaAuto] = useState<
    number | null
  >(null);

  async function loadPlants() {
    try {
      const data = await apiGet<PlantInfo[]>(`/api/plants`);
      const list = Array.isArray(data) ? data : [];
      setPlants(list);
      setPlantId((current) => {
        if (current === "all") return "all";
        if (current && list.some((x) => Number(x.id) === Number(current))) return current;
        return list.length ? Number(list[0].id) : null;
      });
    } catch {
      setPlants([]);
      setPlantId(null);
    }
  }

  useEffect(() => {
    loadPlants();
  }, []);

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
        if (!plantId) {
          if (!alive) return;
          setProducaoInformadaAuto(null);
          setLoadingProd(false);
          return;
        }

        const path =
          plantId === "all"
            ? `/api/aggregate/plant-production/${encodeURIComponent(day)}`
            : `/api/plants/${plantId}/plant-production/${encodeURIComponent(day)}`;

        const r = await fetch(`${API_BASE}${path}`, {
          headers: authHeaders(),
        });

        if (r.status === 404) {
          if (!alive) return;
          setProducaoInformadaAuto(0);
          setProdErr(null);
          return;
        }

        if (!r.ok) {
          const t = await r.text().catch(() => "");
          throw new Error(t || `HTTP ${r.status}`);
        }

        const payload = (await r.json()) as PlantDayPayload;

        if (!alive) return;
        setProducaoInformadaAuto(sumPlantRows(payload?.rows || []));
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
  }, [day, plantId]);

  const selectedPlantName = useMemo(() => {
    if (plantId === "all") return "Todas as plantas";
    return plants.find((p) => Number(p.id) === Number(plantId))?.name || "Planta";
  }, [plants, plantId]);

  const producao = producaoInformadaAuto;
  const desvio = useMemo(() => parseBRNumber(desvioPct), [desvioPct]);
  const sistemica = useMemo(
    () => parseBRNumber(producaoSistemica),
    [producaoSistemica]
  );

  const producaoRealConchada = useMemo(() => {
    if (producao === null || desvio === null) return null;
    return producao * (1 - desvio / 100);
  }, [producao, desvio]);

  const diferenca = useMemo(() => {
    if (sistemica === null || producaoRealConchada === null) return null;
    return sistemica - producaoRealConchada;
  }, [sistemica, producaoRealConchada]);

  const splitNums = useMemo(
    () => ({
      sinter1: parseBRNumber(split.sinter1) || 0,
      sinter2: parseBRNumber(split.sinter2) || 0,
      hematita: parseBRNumber(split.hematita) || 0,
      granulado: parseBRNumber(split.granulado) || 0,
    }),
    [split]
  );

  const splitTotalPct = useMemo(
    () =>
      splitNums.sinter1 +
      splitNums.sinter2 +
      splitNums.hematita +
      splitNums.granulado,
    [splitNums]
  );

  const splitBase = producaoRealConchada || 0;

  const splitRows = useMemo<SplitRow[]>(
    () =>
      SPLIT_FIELDS.map(({ key, label }) => {
        const pct = splitNums[key] || 0;
        return {
          produto: label,
          pct,
          ton: splitBase * (pct / 100),
        };
      }),
    [splitBase, splitNums]
  );

  const splitIsValid = Math.abs(splitTotalPct - 100) < 0.01;

  const cards = [
    {
      title: "Produção Informada",
      value: producao === null ? "—" : fmtBR(producao),
      sub: "Puxada automaticamente do dia",
    },
    {
      title: "Desvio (-) %",
      value: desvio === null ? "—" : `${fmtBR(desvio)}%`,
      sub: "Entrada manual",
      accent: "amber" as const,
    },
    {
      title: "Produção Real por Conchada",
      value: producaoRealConchada === null ? "—" : fmtBR(producaoRealConchada),
      sub: "Produção Informada × (1 − Desvio%)",
      accent: "cyan" as const,
    },
    {
      title: "Diferença",
      value: diferenca === null ? "—" : fmtBR(diferenca),
      sub: "Produção Sistêmica − Real por Conchada",
      accent:
        typeof diferenca === "number"
          ? diferenca >= 0
            ? ("green" as const)
            : ("red" as const)
          : undefined,
    },
  ];

  return (
    <div style={shellStyle}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <Header
          splitOpen={splitOpen}
          onToggleSplit={() => setSplitOpen((v) => !v)}
          selectedPlantName={selectedPlantName}
          plants={plants}
          plantId={plantId}
          onChangePlant={(v) => setPlantId(v)}
        />

        <SectionCard style={{ marginTop: 16, padding: 16 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            <Field label="Planta">
              <select
                style={inputStyle}
                value={plantId ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setPlantId(v === "all" ? "all" : v ? Number(v) : null);
                }}
                disabled={!plants.length}
              >
                {plants.length === 0 ? <option value="">Sem plantas</option> : null}
                {plants.length > 0 ? <option value="all">Todas as plantas</option> : null}
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${p.code} • ${p.name}` : p.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Dia">
              <input
                style={inputStyle}
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </Field>

            <Field label="Produção Informada (automática do dia)">
              <ReadOnlyValue
                value={
                  loadingProd
                    ? "Carregando..."
                    : producao === null
                    ? "—"
                    : fmtBR(producao)
                }
                hint={plantId === "all" ? "todas as plantas" : "planta selecionada"}
              />
              {prodErr ? (
                <div
                  style={{
                    marginTop: 6,
                    color: "rgba(248,113,113,0.95)",
                    fontSize: 12,
                    fontWeight: 850,
                  }}
                >
                  {prodErr}
                </div>
              ) : null}
            </Field>

            <Field label="Desvio (-) %">
              <input
                style={inputStyle}
                value={desvioPct}
                onChange={(e) => setDesvioPct(e.target.value)}
                placeholder="0,00"
              />
            </Field>

            <Field label="Produção Sistêmica">
              <input
                style={inputStyle}
                value={producaoSistemica}
                onChange={(e) => setProducaoSistemica(e.target.value)}
                placeholder="0,00"
              />
            </Field>
          </div>
        </SectionCard>

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          {cards.map((card) => (
            <MetricCard
              key={card.title}
              title={card.title}
              value={card.value}
              sub={card.sub}
              accent={card.accent}
            />
          ))}
        </div>

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)",
            gap: 14,
          }}
        >
          <SectionCard style={{ padding: 18 }}>
            <SectionTitle
              title="Resumo do cálculo"
              subtitle="Visão consolidada do cálculo de correção da produção."
            />

            <div style={summaryBoxStyle}>
              <Line
                label="Produção Informada"
                value={producao === null ? "—" : fmtBR(producao)}
              />
              <Line
                label="Desvio (%)"
                value={desvio === null ? "—" : `${fmtBR(desvio)}%`}
              />
              <Line
                label="Produção Sistêmica"
                value={sistemica === null ? "—" : fmtBR(sistemica)}
              />
              <div
                style={{ height: 1, background: "rgba(255,255,255,0.08)" }}
              />
              <Line
                label="Produção Real por Conchada"
                value={
                  producaoRealConchada === null
                    ? "—"
                    : fmtBR(producaoRealConchada)
                }
                strong
              />
              <Line
                label="Diferença"
                value={diferenca === null ? "—" : fmtBR(diferenca)}
                strong
                positive={diferenca !== null ? diferenca >= 0 : undefined}
              />
            </div>

            <div
              style={{
                marginTop: 16,
                color: "rgba(255,255,255,0.60)",
                fontWeight: 850,
                lineHeight: 1.6,
                fontSize: 13,
              }}
            >
              <div>
                <b>Produção Real por Conchada</b> = Produção Informada × (1 −
                Desvio%)
              </div>
              <div>
                <b>Produção Sistêmica</b> = Expedido do cone + Foi para o
                estoque
              </div>
              <div>
                <b>Diferença</b> = Produção Sistêmica − Produção Real por
                Conchada
              </div>
            </div>
          </SectionCard>

          <SectionCard style={{ padding: 18 }}>
            <SectionTitle
              title="Status do Split"
              subtitle="Validação do fechamento percentual e base aplicada."
            />

            <div style={summaryBoxStyle}>
              <Line
                label="Base do Split"
                value={
                  producaoRealConchada === null
                    ? "—"
                    : fmtBR(producaoRealConchada)
                }
              />
              <Line
                label="Total das %"
                value={`${fmtBR(splitTotalPct)}%`}
                strong
                positive={splitIsValid}
              />
              <StatusPill
                color={splitIsValid ? "green" : "red"}
                text={
                  splitIsValid
                    ? "Percentuais fechando em 100%"
                    : "Ajuste os percentuais para fechar 100%"
                }
              />
            </div>

            <div
              style={{
                marginTop: 14,
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              {splitRows.map((row) => (
                <MiniInfoCard
                  key={row.produto}
                  title={row.produto}
                  top={`${fmtBR(row.pct)}%`}
                  bottom={`${fmtBR(row.ton)} t`}
                />
              ))}
            </div>
          </SectionCard>
        </div>

        {splitOpen ? (
          <SectionCard style={{ marginTop: 16, padding: 18 }}>
            <SectionTitle
              title="Produção por Tipo de Produto"
              subtitle="Base atual: Produção Real por Conchada."
            />

            <div
              style={{
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
              }}
            >
              {SPLIT_FIELDS.map((field) => {
                const row = splitRows.find((r) => r.produto === field.label);
                return (
                  <SplitInputCard
                    key={field.key}
                    label={field.label}
                    value={split[field.key]}
                    ton={row?.ton || 0}
                    onChange={(value) =>
                      setSplit((prev) => ({ ...prev, [field.key]: value }))
                    }
                  />
                );
              })}
            </div>

            <SectionCard
              style={{
                marginTop: 18,
                padding: 16,
                background: "rgba(0,0,0,0.18)",
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 950, marginBottom: 10 }}>
                Visualização do Split
              </div>
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={splitRows}
                    margin={{ top: 16, right: 22, left: 10, bottom: 8 }}
                  >
                    <CartesianGrid
                      stroke="rgba(255,255,255,0.06)"
                      strokeDasharray="3 3"
                    />
                    <XAxis
                      dataKey="produto"
                      tick={{
                        fill: "rgba(255,255,255,0.60)",
                        fontSize: 12,
                      }}
                    />
                    <YAxis
                      tick={{
                        fill: "rgba(255,255,255,0.60)",
                        fontSize: 12,
                      }}
                    />
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
            </SectionCard>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}

function Header({
  splitOpen,
  onToggleSplit,
  selectedPlantName,
  plants,
  plantId,
  onChangePlant,
}: {
  splitOpen: boolean;
  onToggleSplit: () => void;
  selectedPlantName: string;
  plants: PlantInfo[];
  plantId: PlantScope | null;
  onChangePlant: (v: PlantScope | null) => void;
}) {
  return (
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
        <div style={{ fontSize: 30, fontWeight: 980, letterSpacing: -0.4 }}>
          Desvio de Produção
        </div>
        <div
          style={{
            marginTop: 4,
            color: "rgba(255,255,255,0.82)",
            fontWeight: 900,
            fontSize: 14,
          }}
        >
          {selectedPlantName}
        </div>
        <div
          style={{
            marginTop: 4,
            color: "rgba(255,255,255,0.62)",
            fontWeight: 800,
          }}
        >
          Correção da produção no padrão MonPlant
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <select
          value={plantId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChangePlant(v === "all" ? "all" : v ? Number(v) : null);
          }}
          style={{
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.05)",
            color: "rgba(255,255,255,0.92)",
            padding: "10px 14px",
            fontWeight: 900,
            minWidth: 220,
          }}
          disabled={!plants.length}
        >
          {plants.length === 0 ? <option value="">Sem plantas</option> : null}
          {plants.length > 0 ? <option value="all">Todas as plantas</option> : null}
          {plants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code ? `${p.code} • ${p.name}` : p.name}
            </option>
          ))}
        </select>
        <button
          onClick={onToggleSplit}
          style={{
            borderRadius: 14,
            border: "1px solid rgba(34,197,94,0.25)",
            background: splitOpen
              ? "rgba(34,197,94,0.18)"
              : "rgba(34,197,94,0.10)",
            color: "rgba(34,197,94,0.95)",
            padding: "10px 14px",
            fontWeight: 950,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {splitOpen ? "Ocultar Split de Produção" : "Split de Produção"}
        </button>

        <StatusPill color="green" text="Persistência em LocalStorage" />
      </div>
    </div>
  );
}

function SectionCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return <div style={{ ...panelStyle, ...style }}>{children}</div>;
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 950 }}>{title}</div>
      {subtitle ? (
        <div
          style={{
            marginTop: 4,
            color: "rgba(255,255,255,0.58)",
            fontWeight: 800,
            fontSize: 12,
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}

function ReadOnlyValue({
  value,
  hint,
}: {
  value: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        ...inputStyle,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <span>{value}</span>
      {hint ? (
        <span
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.50)",
            fontWeight: 850,
          }}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function MetricCard({
  title,
  value,
  sub,
  accent,
}: {
  title: string;
  value: string;
  sub: string;
  accent?: "cyan" | "green" | "red" | "amber";
}) {
  return (
    <SectionCard style={{ padding: 18 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 900 }}>
        {title}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 40,
          fontWeight: 980,
          letterSpacing: -1.2,
          color: getAccentColor(accent),
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 12,
          color: "rgba(255,255,255,0.58)",
          fontWeight: 850,
        }}
      >
        {sub}
      </div>
    </SectionCard>
  );
}

function MiniInfoCard({
  title,
  top,
  bottom,
}: {
  title: string;
  top: string;
  bottom: string;
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
        padding: 12,
      }}
    >
      <div style={{ color: "rgba(255,255,255,0.60)", fontSize: 12, fontWeight: 850 }}>
        {title}
      </div>
      <div style={{ marginTop: 6, fontWeight: 950, fontSize: 18 }}>{top}</div>
      <div style={{ marginTop: 2, color: "rgba(255,255,255,0.70)", fontWeight: 850, fontSize: 13 }}>
        {bottom}
      </div>
    </div>
  );
}

function SplitInputCard({
  label,
  value,
  ton,
  onChange,
}: {
  label: string;
  value: string;
  ton: number;
  onChange: (value: string) => void;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.03)",
        padding: 14,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 980, textAlign: "center" }}>
        {label}
      </div>

      <div style={{ marginTop: 12, ...labelStyle }}>Percentual (%)</div>
      <input
        style={{ ...inputStyle, marginTop: 6 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />

      <div style={{ marginTop: 12, ...labelStyle }}>Tonelagem</div>
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
        {fmtBR(ton, 2)}
      </div>
    </div>
  );
}

function StatusPill({
  text,
  color,
}: {
  text: string;
  color: "green" | "red";
}) {
  const fg =
    color === "green"
      ? "rgba(34,197,94,0.95)"
      : "rgba(248,113,113,0.95)";
  const bg =
    color === "green"
      ? "rgba(34,197,94,0.10)"
      : "rgba(248,113,113,0.10)";

  return (
    <div
      style={{
        borderRadius: 999,
        border: `1px solid ${fg.replace("0.95", "0.25")}`,
        background: bg,
        color: fg,
        padding: "8px 12px",
        fontWeight: 950,
        fontSize: 12,
        width: "fit-content",
      }}
    >
      {text}
    </div>
  );
}

const summaryBoxStyle: React.CSSProperties = {
  marginTop: 14,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(0,0,0,0.20)",
  padding: 16,
  display: "grid",
  gap: 12,
};

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
    color = positive
      ? "rgba(34,197,94,0.95)"
      : "rgba(248,113,113,0.95)";
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ color: "rgba(255,255,255,0.65)", fontWeight: 850 }}>
        {label}
      </div>
      <div
        style={{
          color,
          fontWeight: strong ? 980 : 900,
          fontSize: strong ? 22 : 16,
        }}
      >
        {value}
      </div>
    </div>
  );
}
