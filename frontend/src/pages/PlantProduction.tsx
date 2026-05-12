import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LabelList,
} from "recharts";

/* ===================== helpers ===================== */

function isoTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * ✅ NOVA REGRA (mantém o bloqueio retroativo, mas libera a ÚLTIMA hora na virada):
 * - Dia anterior é retroativo e fica bloqueado
 * - EXCEÇÃO: se for ONTEM e estiver entre 00:00 e 00:59, libera editar
 */
function isRetroDay(dayISO: string): boolean {
  const today = isoTodayLocal();
  if (dayISO >= today) return false;

  // ontem (YYYY-MM-DD) no horário local do navegador
  const now = new Date();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);

  const yISO =
    y.getFullYear() +
    "-" +
    String(y.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(y.getDate()).padStart(2, "0");

  // ✅ liberado na virada (00:00–00:59) para lançar 23:00–00:00
  if (dayISO === yISO && now.getHours() === 0) return false;

  return true;
}

function fmtBR(n: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
}

// ✅ usado na Calculadora (até 2 casas)
function fmtBR2(n: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
}
function fmtPct0(n: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}

function parseBRNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  let s = String(v).trim();
  if (!s) return null;

  s = s.replace("%", "").trim();
  s = s.replace(/\s/g, "");

  // "1.234,5" -> "1234.5"
  if (s.includes(",") && s.includes("."))
    s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function makePeriods24(): string[] {
  const res: string[] = [];
  for (let h = 0; h < 24; h++) {
    const h2 = (h + 1) % 24;
    const a = String(h).padStart(2, "0") + ":00";
    const b = String(h2).padStart(2, "0") + ":00";
    res.push(`${a}-${b}`);
  }
  return res;
}

function periodShort(p: string) {
  const [a, b] = p.split("-");
  return `${(a || "").slice(0, 2)}-${(b || "").slice(0, 2)}`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/* ===================== Calculadora Conchadas helpers ===================== */

function nowBRTime(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/* ===================== types ===================== */

type PlantHourRow = {
  period: string;
  ton?: string | number | null;
  freq?: string | number | null;
};

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

type RhythmEquipment = {
  id: number;
  tag: string;
  equipment_type?: string | null;
  bucket_ton: number;
};

type RhythmEquipmentResponse = {
  plant_id: number;
  equipment?: RhythmEquipment | null;
};

/* ===================== auth / api ===================== */

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

function authHeaders(): HeadersInit {
  const t = (localStorage.getItem("mp_token") || "").trim();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/* ===================== recharts labels ===================== */

const TonLabel = (props: any) => {
  const { x, y, width, value } = props;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 80) return null;

  return (
    <text
      x={x + width / 2}
      y={y - 8}
      textAnchor="middle"
      fill="rgba(255,255,255,0.94)"
      fontSize={11}
      fontWeight={900}
      style={{
        paintOrder: "stroke",
        stroke: "rgba(0,0,0,0.75)",
        strokeWidth: 3,
      }}
    >
      {fmtBR(n)}
    </text>
  );
};

const FreqLabel = (props: any) => {
  const { x, y, index, value, payload } = props;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (payload?.freq === null || payload?.freq === undefined) return null;

  const bump = index % 2 === 0 ? -12 : -20;

  return (
    <text
      x={x}
      y={y + bump}
      textAnchor="middle"
      fill="rgba(255,255,255,0.94)"
      fontSize={11}
      fontWeight={900}
      style={{
        paintOrder: "stroke",
        stroke: "rgba(0,0,0,0.70)",
        strokeWidth: 4,
      }}
    >
      {fmtPct0(n)}%
    </text>
  );
};

const CustomTick = (props: any) => {
  const { x, y, payload } = props;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={14}
        textAnchor="middle"
        fill="rgba(255,255,255,0.75)"
        fontSize={12}
        fontWeight={700}
      >
        {periodShort(String(payload.value || ""))}
      </text>
    </g>
  );
};

/* ===================== component ===================== */

export default function PlantProduction() {
  const periods = useMemo(() => makePeriods24(), []);

  const [day, setDay] = useState<string>(isoTodayLocal());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [plants, setPlants] = useState<PlantInfo[]>([]);
  const [plantId, setPlantId] = useState<number | null>(null);

  const [payload, setPayload] = useState<PlantDayPayload>(() => ({
    day: isoTodayLocal(),
    obs: "",
    rows: periods.map((p) => ({ period: p, ton: "", freq: "" })),
    updated_at: null,
  }));

  const retro = isRetroDay(day);

  /* ===================== Calculadora state ===================== */

  const [calcOpen, setCalcOpen] = useState(false);

  const [calcConchadas, setCalcConchadas] = useState<string>("10");
  const [calcAvg, setCalcAvg] = useState<string>("");
  const [calcRate, setCalcRate] = useState<string>("");

  const [calcObs, setCalcObs] = useState<string>("");
  const [allocatedEquipment, setAllocatedEquipment] =
    useState<RhythmEquipment | null>(null);
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [equipmentErr, setEquipmentErr] = useState<string | null>(null);

  const calcTotal = useMemo(() => {
    const c = parseBRNumber(calcConchadas);
    const a = parseBRNumber(calcAvg);
    if (c === null || a === null) return null;
    return Math.max(0, c) * Math.max(0, a);
  }, [calcConchadas, calcAvg]);

  function onRegisterCalc() {
    const c = parseBRNumber(calcConchadas);
    const a = parseBRNumber(calcAvg);
    const rate = parseBRNumber(calcRate);
    const t = calcTotal;

    if (c === null || a === null || t === null || rate === null) {
      setInfo("Preencha Conchadas, Peso médio e Taxa (%) para registrar.");
      return;
    }

    // ✅ Regra: registra sempre na HORA ANTERIOR (ex.: 23:xx -> 22:00-23:00 | 00:xx -> 23:00-00:00)
    const now = new Date();
    const endH = now.getHours();
    const startH = (endH + 23) % 24;
    const targetPeriod = `${String(startH).padStart(2, "0")}:00-${String(endH).padStart(2, "0")}:00`;

    const obsText = calcObs.trim();
    const line = obsText ? `• [${nowBRTime()}] ${obsText}` : "";

    setPayload((p) => {
      // 1) grava tonelagem no período-alvo somando com o que já tiver
      const nextRows = (p.rows || []).map((r) => {
        if (String(r.period) !== targetPeriod) return r;
        const prevTon = parseBRNumber(String(r.ton ?? "")) || 0;
        const nextTon = prevTon + (Number(t) || 0);
        return {
          ...r,
          ton: fmtBR2(nextTon),
          freq: fmtBR2(Math.max(0, Math.min(100, rate))),
        };
      });

      // 2) grava observação no campo de observação do dia
      const prev = (p.obs || "").trim();
      const nextObs = line ? (prev ? `${prev}\n${line}` : line) : prev;

      return { ...p, rows: nextRows, obs: nextObs };
    });

    setInfo(
      `Produção registrada em ${targetPeriod} com frequência ${fmtBR2(Math.max(0, Math.min(100, rate)))}%. Clique em Salvar para gravar.`,
    );
    setCalcOpen(false);
  }

  /* ===================== rest ===================== */

  async function loadPlants() {
    setErr(null);

    try {
      const r = await fetch(`${API_BASE}/api/plants`, {
        headers: authHeaders(),
      });

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `HTTP ${r.status}`);
      }

      const data = ((await r.json()) || []) as PlantInfo[];
      setPlants(data);

      setPlantId((current) => {
        if (current && data.some((p) => p.id === current)) return current;
        return data.length ? Number(data[0].id) : null;
      });
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar plantas");
      setPlants([]);
      setPlantId(null);
    }
  }

  async function loadRhythmEquipment(selectedPlantId: number) {
    setEquipmentLoading(true);
    setEquipmentErr(null);

    try {
      const r = await fetch(
        `${API_BASE}/api/plants/${selectedPlantId}/rhythm-equipment`,
        {
          headers: authHeaders(),
        },
      );

      if (r.status === 404) {
        setAllocatedEquipment(null);
        setEquipmentErr(null);
        return;
      }

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `HTTP ${r.status}`);
      }

      const data = (await r.json()) as RhythmEquipmentResponse;
      const eq = data?.equipment || null;
      setAllocatedEquipment(eq);

      if (
        eq &&
        Number.isFinite(Number(eq.bucket_ton)) &&
        Number(eq.bucket_ton) > 0
      ) {
        setCalcAvg(fmtBR2(Number(eq.bucket_ton)));
      }
    } catch (e: any) {
      setAllocatedEquipment(null);
      setEquipmentErr(e?.message || "Erro ao carregar escavadeira alocada");
    } finally {
      setEquipmentLoading(false);
    }
  }

  function normalizeRows(rows: PlantHourRow[]): PlantHourRow[] {
    const map: Record<string, PlantHourRow> = {};
    for (const r of rows || []) map[r.period] = r;

    return periods.map((p) => ({
      period: p,
      ton: map[p]?.ton ?? "",
      freq: map[p]?.freq ?? "",
    }));
  }

  async function loadDay(d: string, selectedPlantId: number) {
    setLoading(true);
    setErr(null);
    setInfo(null);

    try {
      const r = await fetch(
        `${API_BASE}/api/plants/${selectedPlantId}/plant-production/${encodeURIComponent(d)}`,
        {
          headers: authHeaders(),
        },
      );

      if (r.status === 404) {
        setPayload({
          day: d,
          obs: "",
          rows: periods.map((p) => ({ period: p, ton: "", freq: "" })),
          updated_at: null,
        });
        return;
      }

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `HTTP ${r.status}`);
      }

      const data = (await r.json()) as PlantDayPayload;

      setPayload({
        day: d,
        obs: data.obs ?? "",
        rows: normalizeRows(data.rows || []),
        updated_at: data.updated_at ?? null,
      });
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  async function saveDay() {
    if (!plantId) {
      setErr("Selecione uma planta.");
      return;
    }

    setSaving(true);
    setErr(null);
    setInfo(null);

    try {
      const body = {
        obs: payload.obs ?? "",
        rows: payload.rows.map((r) => ({
          period: r.period,
          ton: parseBRNumber(r.ton),
          freq: parseBRNumber(r.freq),
        })),
      };

      const r = await fetch(
        `${API_BASE}/api/plants/${plantId}/plant-production/${encodeURIComponent(day)}`,
        {
          method: "PUT",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (r.status === 403) {
        setErr("Retroativo não pode ser editado.");
        return;
      }

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `HTTP ${r.status}`);
      }

      setInfo("Salvo com sucesso.");
      await loadDay(day, plantId);
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadPlants();
  }, []);

  useEffect(() => {
    if (plantId !== null) {
      loadDay(day, plantId);
    } else {
      setPayload({
        day,
        obs: "",
        rows: periods.map((p) => ({ period: p, ton: "", freq: "" })),
        updated_at: null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, plantId]);

  useEffect(() => {
    if (plantId !== null) {
      loadRhythmEquipment(plantId);
    } else {
      setAllocatedEquipment(null);
      setEquipmentErr(null);
      setCalcAvg("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantId]);

  const chartData = useMemo(() => {
    const map: Record<string, { ton: number | null; freq: number | null }> = {};
    for (const p of periods) map[p] = { ton: null, freq: null };

    for (const r of payload.rows || []) {
      const ton = parseBRNumber(r.ton);
      const freq = parseBRNumber(r.freq);
      map[r.period] = {
        ton: ton === null ? null : Math.max(0, ton),
        freq: freq === null ? null : Math.max(0, Math.min(100, freq)),
      };
    }

    return periods.map((p) => ({
      period: p,
      ton: map[p].ton,
      freq: map[p].freq,
    }));
  }, [payload.rows, periods]);

  const totalTon = useMemo(() => {
    let s = 0;
    for (const r of chartData) if (typeof r.ton === "number") s += r.ton;
    return s;
  }, [chartData]);

  const [yy, mm, dd] = day.split("-");
  const dayBR = `${dd}/${mm}/${yy}`;
  const selectedPlantName =
    plants.find((p) => Number(p.id) === Number(plantId))?.name || "Planta";

  const chunks = useMemo(() => {
    return [
      payload.rows.slice(0, 8),
      payload.rows.slice(8, 16),
      payload.rows.slice(16, 24),
    ];
  }, [payload.rows]);

  /* ===================== Modal styles ===================== */

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    zIndex: 9999,
  };

  const modalStyle: React.CSSProperties = {
    width: "min(520px, 96vw)",
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(14,18,22,0.94)",
    boxShadow: "0 30px 70px rgba(0,0,0,0.75)",
    backdropFilter: "blur(12px)",
    overflow: "hidden",
  };

  const modalHeader: React.CSSProperties = {
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  };

  const modalTitle: React.CSSProperties = {
    fontWeight: 950,
    color: "rgba(255,255,255,0.92)",
    fontSize: 16,
    letterSpacing: -0.2,
  };

  const modalBody: React.CSSProperties = { padding: 16 };

  const grid2: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  };

  const softCard: React.CSSProperties = {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    padding: 12,
  };

  const btnRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 12,
  };

  return (
    <div className="mp-container">
      <div className="mp-page-title">Produção do dia</div>
      <div className="mp-page-sub">
        Evolução horária • {dayBR} {plantId ? `• ${selectedPlantName}` : ""}
      </div>

      <div className="mp-card" style={{ marginTop: 12 }}>
        {/* header */}
        <div
          className="mp-card-h"
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 260 }}>
            <b>Produção por hora (Ton/H + Frequência)</b>

            <div className="mp-help">
              {loading
                ? "Carregando..."
                : err
                  ? `Erro: ${err}`
                  : info
                    ? info
                    : payload?.updated_at
                      ? `Atualizado: ${payload.updated_at}`
                      : "—"}
            </div>

            <div className="mp-help" style={{ marginTop: 6 }}>
              Total do dia (soma Ton/H): <b>{fmtBR(totalTon)}</b>
              {retro ? (
                <span
                  style={{
                    marginLeft: 10,
                    color: "rgba(245,158,11,0.95)",
                    fontWeight: 800,
                  }}
                >
                  (Retroativo bloqueado — exceto 00:00–00:59 p/ lançar
                  23:00–00:00)
                </span>
              ) : null}
            </div>
          </div>

          <div>
            <div className="mp-label">Planta</div>
            <select
              className="mp-input"
              value={plantId ?? ""}
              onChange={(e) =>
                setPlantId(e.target.value ? Number(e.target.value) : null)
              }
              disabled={loading || plants.length === 0}
            >
              {plants.length === 0 ? (
                <option value="">Sem plantas cadastradas</option>
              ) : null}
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mp-label">Data</div>
            <input
              className="mp-input"
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </div>

          <div
            style={{
              minWidth: 210,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              padding: "9px 12px",
            }}
            title={equipmentErr || undefined}
          >
            <div className="mp-label">Escavadeira alocada</div>
            <div
              style={{
                color: "rgba(255,255,255,0.88)",
                fontWeight: 950,
                whiteSpace: "nowrap",
              }}
            >
              {equipmentLoading
                ? "Carregando..."
                : allocatedEquipment
                  ? `${allocatedEquipment.tag} • ${fmtBR2(Number(allocatedEquipment.bucket_ton || 0))} t`
                  : "Sem vínculo"}
            </div>
          </div>

          {/* ✅ novo botão Calculadora */}
          <button
            className="mp-btn"
            onClick={() => {
              if (
                allocatedEquipment &&
                Number(allocatedEquipment.bucket_ton) > 0
              ) {
                setCalcAvg(fmtBR2(Number(allocatedEquipment.bucket_ton)));
              }
              setCalcOpen(true);
              setCalcObs("");
            }}
            disabled={loading || !plantId}
            style={{ minWidth: 160 }}
            title="Calculadora de produção por conchadas"
          >
            Calculadora
          </button>

          <button
            className="mp-btn"
            onClick={saveDay}
            disabled={saving || loading || retro || !plantId}
            title={
              !plantId
                ? "Selecione uma planta"
                : retro
                  ? "Retroativo não pode ser editado"
                  : "Salvar produção do dia"
            }
            style={{ minWidth: 140 }}
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>

        {/* body */}
        <div className="mp-card-b">
          {/* gráfico */}
          <div style={{ height: 440, width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 52, right: 24, bottom: 30, left: 10 }}
              >
                <CartesianGrid
                  stroke="rgba(255,255,255,0.08)"
                  strokeDasharray="3 3"
                />

                <XAxis
                  dataKey="period"
                  tick={<CustomTick />}
                  interval={1}
                  height={44}
                  axisLine={{ stroke: "rgba(255,255,255,0.10)" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.10)" }}
                />

                <YAxis
                  yAxisId="ton"
                  tick={{ fill: "rgba(255,255,255,0.70)", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.10)" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.10)" }}
                />

                <YAxis
                  yAxisId="freq"
                  orientation="right"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fill: "rgba(255,255,255,0.70)", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.10)" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.10)" }}
                />

                <Tooltip
                  formatter={(value: any, name: any) => {
                    if (value === null || value === undefined || value === "")
                      return ["—", name];
                    if (name === "Frequência (%)")
                      return [`${fmtPct0(Number(value))}%`, name];
                    if (name === "Ton/H") return [fmtBR(Number(value)), name];
                    return [String(value), name];
                  }}
                  labelFormatter={(label) => `Faixa: ${label}`}
                  contentStyle={{
                    background: "rgba(0,0,0,0.86)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                  }}
                  labelStyle={{
                    color: "rgba(255,255,255,0.85)",
                    fontWeight: 900,
                  }}
                />

                <Legend wrapperStyle={{ color: "rgba(255,255,255,0.75)" }} />

                <Bar
                  yAxisId="ton"
                  dataKey="ton"
                  name="Ton/H"
                  fill="#00D6FF"
                  radius={[10, 10, 0, 0]}
                  barSize={28}
                  maxBarSize={34}
                >
                  <LabelList dataKey="ton" content={<TonLabel />} />
                </Bar>

                <Line
                  yAxisId="freq"
                  type="monotone"
                  dataKey="freq"
                  name="Frequência (%)"
                  stroke="#FFA31A"
                  strokeWidth={3}
                  connectNulls={false}
                  dot={(p: any) => {
                    if (
                      p?.payload?.freq === null ||
                      p?.payload?.freq === undefined
                    )
                      return null;
                    return (
                      <circle
                        cx={p.cx}
                        cy={p.cy}
                        r={4}
                        fill="#FFA31A"
                        stroke="rgba(0,0,0,.6)"
                        strokeWidth={2}
                      />
                    );
                  }}
                  activeDot={{ r: 6 }}
                >
                  <LabelList dataKey="freq" content={<FreqLabel />} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* observação */}
          <div style={{ marginTop: 14 }}>
            <div className="mp-label">Observação do dia</div>
            <textarea
              className="mp-textarea"
              value={payload.obs ?? ""}
              disabled={retro}
              onChange={(e) =>
                setPayload((p) => ({ ...p, obs: e.target.value }))
              }
              placeholder="Ex.: chuva, manutenção, falta de energia, etc."
              style={{ minHeight: 90 }}
            />
          </div>

          {/* edição em 3 colunas */}
          <div style={{ marginTop: 14 }}>
            <div className="mp-help">
              Edite Ton/H e Frequência (%) e clique em <b>Salvar</b>. Valores
              vazios ficam como <b>sem dado</b>.
            </div>

            <div
              style={{
                marginTop: 10,
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(260px, 1fr))",
                gap: 12,
                overflowX: "auto",
                paddingBottom: 2,
              }}
            >
              {chunks.map((rows8, colIdx) => (
                <div key={colIdx} className="mp-card" style={{ margin: 0 }}>
                  <div className="mp-card-h" style={{ padding: "10px 12px" }}>
                    <b>
                      {colIdx === 0
                        ? "00–08"
                        : colIdx === 1
                          ? "08–16"
                          : "16–24"}
                    </b>
                    <div className="mp-help">8 faixas horárias</div>
                  </div>

                  <div className="mp-card-b" style={{ padding: 12 }}>
                    <table
                      className="mp-table"
                      style={{ width: "100%", minWidth: 0 }}
                    >
                      <thead>
                        <tr>
                          <th style={{ width: 84 }}>Hora</th>
                          <th style={{ width: 110 }}>Ton/H</th>
                          <th style={{ width: 130 }}>Freq (%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows8.map((r) => {
                          const globalIdx = payload.rows.findIndex(
                            (x) => x.period === r.period,
                          );

                          return (
                            <tr key={r.period}>
                              <td
                                style={{
                                  color: "rgba(255,255,255,0.85)",
                                  fontWeight: 800,
                                }}
                              >
                                {periodShort(r.period)}
                              </td>

                              <td>
                                <input
                                  className="mp-input"
                                  value={r.ton ?? ""}
                                  disabled={retro}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setPayload((p) => {
                                      const rows = [...p.rows];
                                      rows[globalIdx] = {
                                        ...rows[globalIdx],
                                        ton: v,
                                      };
                                      return { ...p, rows };
                                    });
                                  }}
                                  placeholder="ex: 320"
                                />
                              </td>

                              <td>
                                <input
                                  className="mp-input"
                                  value={r.freq ?? ""}
                                  disabled={retro}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setPayload((p) => {
                                      const rows = [...p.rows];
                                      rows[globalIdx] = {
                                        ...rows[globalIdx],
                                        freq: v,
                                      };
                                      return { ...p, rows };
                                    });
                                  }}
                                  placeholder="ex: 85"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 8 }} />
        </div>
      </div>

      {/* ===================== MODAL CALCULADORA ===================== */}
      {calcOpen ? (
        <div
          style={overlayStyle}
          onClick={() => setCalcOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <div style={{ minWidth: 0 }}>
                <div style={modalTitle}>Calculadora</div>
                <div
                  style={{
                    color: "rgba(255,255,255,0.55)",
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  Conchadas × concha da escavadeira alocada
                </div>
              </div>

              <button
                className="mp-btn"
                style={{ minWidth: 44, padding: "0 12px" }}
                onClick={() => setCalcOpen(false)}
                title="Fechar"
              >
                ✕
              </button>
            </div>

            <div style={modalBody}>
              <div style={{ ...softCard, marginBottom: 12 }}>
                <div
                  style={{
                    color: "rgba(255,255,255,0.55)",
                    fontWeight: 900,
                    fontSize: 12,
                  }}
                >
                  ESCAVADEIRA CONSIDERADA
                </div>
                <div
                  style={{
                    marginTop: 6,
                    color: allocatedEquipment
                      ? "#FFA31A"
                      : "rgba(255,255,255,0.72)",
                    fontWeight: 980,
                    fontSize: 18,
                  }}
                >
                  {equipmentLoading
                    ? "Carregando vínculo..."
                    : allocatedEquipment
                      ? `${allocatedEquipment.tag} • ${fmtBR2(Number(allocatedEquipment.bucket_ton || 0))} t/conchada`
                      : "Nenhuma escavadeira vinculada — preencher peso manualmente"}
                </div>
              </div>

              <div style={grid2}>
                <div>
                  <div className="mp-label">Taxa (%)</div>
                  <input
                    className="mp-input"
                    value={calcRate}
                    onChange={(e) => setCalcRate(e.target.value)}
                    inputMode="decimal"
                    placeholder="ex: 85"
                  />
                </div>

                <div>
                  <div className="mp-label">Conchadas</div>
                  <input
                    className="mp-input"
                    value={calcConchadas}
                    onChange={(e) => setCalcConchadas(e.target.value)}
                    inputMode="decimal"
                    placeholder="ex: 10"
                  />
                </div>

                <div>
                  <div className="mp-label">T/conchada considerada</div>
                  <input
                    className="mp-input"
                    value={calcAvg}
                    onChange={(e) => setCalcAvg(e.target.value)}
                    inputMode="decimal"
                    disabled={!!allocatedEquipment}
                    placeholder={allocatedEquipment ? "Automático" : "ex: 4,2"}
                    title={
                      allocatedEquipment
                        ? "Valor puxado automaticamente do cadastro/alocação da escavadeira"
                        : "Sem escavadeira vinculada: informe manualmente"
                    }
                  />
                </div>

                <div>
                  <div className="mp-label">Observação (opcional)</div>
                  <input
                    className="mp-input"
                    value={calcObs}
                    onChange={(e) => setCalcObs(e.target.value)}
                    placeholder="Ex.: turno 1 / material fino / etc."
                  />
                </div>
              </div>

              {/* total estimado */}
              <div style={{ marginTop: 12, ...softCard }}>
                <div
                  style={{
                    color: "rgba(255,255,255,0.55)",
                    fontWeight: 900,
                    fontSize: 12,
                  }}
                >
                  TOTAL ESTIMADO
                </div>
                <div
                  style={{
                    marginTop: 6,
                    color: "rgba(255,255,255,0.92)",
                    fontWeight: 980,
                    fontSize: 28,
                    lineHeight: 1,
                  }}
                >
                  {calcTotal === null ? "—" : `${fmtBR2(calcTotal)} t`}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    color: "rgba(255,255,255,0.55)",
                    fontWeight: 850,
                    fontSize: 12,
                  }}
                >
                  Conchadas × T/conchada
                </div>
              </div>

              <div style={{ marginTop: 12, ...softCard }}>
                <div
                  style={{
                    color: "rgba(255,255,255,0.55)",
                    fontWeight: 900,
                    fontSize: 12,
                  }}
                >
                  T/CONCHADA ATUAL
                </div>
                <div
                  style={{
                    marginTop: 6,
                    color: "rgba(255,255,255,0.92)",
                    fontWeight: 980,
                    fontSize: 22,
                  }}
                >
                  {parseBRNumber(calcAvg)
                    ? `${fmtBR2(parseBRNumber(calcAvg) as number)} t`
                    : "—"}
                </div>
              </div>

              <div style={btnRow}>
                <button
                  className="mp-btn"
                  onClick={onRegisterCalc}
                  disabled={retro}
                  title={
                    retro
                      ? "Retroativo bloqueado (não registra)"
                      : "Adicionar registro na produção da hora anterior"
                  }
                  style={{ gridColumn: "1 / -1" }}
                >
                  Registrar produção
                </button>
              </div>

              <div
                style={{
                  marginTop: 10,
                  color: "rgba(255,255,255,0.50)",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                Dica: a T/conchada vem da escavadeira vinculada à planta. Após
                registrar, clique em <b>Salvar</b> na página para gravar no
                sistema.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
