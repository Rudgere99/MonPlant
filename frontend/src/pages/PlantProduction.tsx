import { useEffect, useMemo, useRef, useState } from "react";
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

function fmtBR(n: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
}
function fmtBR2(n: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}

function parseBRNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  let s = String(v).trim();
  if (!s) return null;

  s = s.replace("%", "").trim();
  s = s.replace(/\s/g, "");

  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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

function formatPeriodShort(p: string) {
  const [a, b] = p.split("-");
  const ha = (a || "").slice(0, 2);
  const hb = (b || "").slice(0, 2);
  return `${ha}-${hb}`;
}

type PlantHourRow = {
  period: string;
  ton?: string | number | null;
  freq?: string | number | null;
};

type PlantDayPayload = {
  day: string;
  turno?: 1 | 2;
  obs?: string | null;
  rows: PlantHourRow[];
  updated_at?: string | null;
};

/* ===================== LocalStorage (offline) ===================== */

const LS_PREFIX = "monplant:plant-production:";

function lsKey(day: string, turno: 1 | 2) {
  return `${LS_PREFIX}${day}:T${turno}`;
}

function nowISO() {
  return new Date().toISOString();
}

function buildEmpty(day: string, turno: 1 | 2, periods: string[]): PlantDayPayload {
  return {
    day,
    turno,
    obs: "",
    rows: periods.map((p) => ({ period: p, ton: "", freq: "" })),
    updated_at: null,
  };
}

function loadFromLS(day: string, turno: 1 | 2, periods: string[]): PlantDayPayload {
  try {
    const raw = localStorage.getItem(lsKey(day, turno));
    if (!raw) return buildEmpty(day, turno, periods);

    const parsed = JSON.parse(raw) as PlantDayPayload;

    const map: Record<string, PlantHourRow> = {};
    (parsed.rows || []).forEach((r) => (map[r.period] = r));

    const rows = periods.map((p) => {
      const r = map[p];
      return { period: p, ton: r?.ton ?? "", freq: r?.freq ?? "" };
    });

    return {
      day,
      turno,
      obs: parsed.obs ?? "",
      rows,
      updated_at: parsed.updated_at ?? null,
    };
  } catch {
    return buildEmpty(day, turno, periods);
  }
}

function saveToLS(payload: PlantDayPayload) {
  const t = payload.turno ?? 1;
  localStorage.setItem(lsKey(payload.day, t), JSON.stringify(payload));
}

/* ===================== labels (recharts) ===================== */

const TonLabel = (props: any) => {
  const { x, y, width, value } = props;
  if (value === null || value === undefined) return null;

  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 80) return null;

  return (
    <text
      x={x + width / 2}
      y={y - 8}
      textAnchor="middle"
      fill="rgba(255,255,255,0.94)"
      fontSize={11}
      fontWeight={900}
      style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.75)", strokeWidth: 3 }}
    >
      {fmtBR(n)}
    </text>
  );
};

const FreqLabel = (props: any) => {
  const { x, y, index, value, payload } = props;
  if (value === null || value === undefined) return null;

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
      style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.70)", strokeWidth: 4 }}
    >
      {fmtBR2(n)}%
    </text>
  );
};

const CustomTick = (props: any) => {
  const { x, y, payload } = props;
  const label = formatPeriodShort(payload.value);
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
        {label}
      </text>
    </g>
  );
};

/* ===================== component ===================== */

export default function PlantProduction() {
  const [day, setDay] = useState<string>(isoTodayLocal());
  const [turno, setTurno] = useState<1 | 2>(1);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [payload, setPayload] = useState<PlantDayPayload | null>(null);
  const [obs, setObs] = useState<string>("");

  const [editRows, setEditRows] = useState<Record<string, { ton: string; freq: string }>>({});

  const periods = useMemo(() => makePeriods24(), []);

  // ✅ 3 colunas (8 horas cada)
  const col1 = useMemo(() => periods.slice(0, 8), [periods]);
  const col2 = useMemo(() => periods.slice(8, 16), [periods]);
  const col3 = useMemo(() => periods.slice(16, 24), [periods]);

  const todayLabel = useMemo(() => {
    const [y, m, d] = day.split("-");
    return `${d}/${m}/${y}`;
  }, [day]);

  const loadedRef = useRef(false);

  function resetEditsFromPayload(p: PlantDayPayload | null) {
    const base: Record<string, { ton: string; freq: string }> = {};
    periods.forEach((per) => (base[per] = { ton: "", freq: "" }));

    if (p?.rows?.length) {
      for (const r of p.rows) {
        if (!base[r.period]) continue;
        base[r.period] = {
          ton: r.ton === null || r.ton === undefined ? "" : String(r.ton),
          freq: r.freq === null || r.freq === undefined ? "" : String(r.freq),
        };
      }
    }

    setEditRows(base);
    setObs(p?.obs || "");
  }

  async function loadDay(d: string, t: 1 | 2) {
    setLoading(true);
    setErr(null);
    try {
      const data = loadFromLS(d, t, periods);
      setPayload(data);
      resetEditsFromPayload(data);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar (offline)");
    } finally {
      setLoading(false);
    }
  }

  async function saveDay() {
    setLoading(true);
    setErr(null);
    try {
      const rows: PlantHourRow[] = periods.map((p) => {
        const v = editRows[p] || { ton: "", freq: "" };
        return { period: p, ton: v.ton, freq: v.freq };
      });

      const toSave: PlantDayPayload = {
        day,
        turno,
        obs,
        rows,
        updated_at: nowISO(),
      };

      saveToLS(toSave);
      setPayload(toSave);
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar (offline)");
    } finally {
      setLoading(false);
    }
  }

  function clearDay() {
    localStorage.removeItem(lsKey(day, turno));
    const empty = buildEmpty(day, turno, periods);
    setPayload(empty);
    resetEditsFromPayload(empty);
  }

  function setCell(period: string, key: "ton" | "freq", value: string) {
    setEditRows((prev) => ({
      ...prev,
      [period]: { ...(prev[period] || { ton: "", freq: "" }), [key]: value },
    }));
  }

  const chartData = useMemo(() => {
    return periods.map((p) => {
      const v = editRows[p] || { ton: "", freq: "" };

      const tonN = parseBRNumber(v.ton);
      const freqN = parseBRNumber(v.freq);

      const ton = tonN === null ? null : clamp(tonN, 0, 99999);
      const freq = freqN === null ? null : clamp(freqN, 0, 100);

      return {
        period: p,
        ton,
        freq,
        freqLabel: freq === null ? null : `${Math.round(freq)}%`,
      };
    });
  }, [editRows, periods]);

  const tonMax = useMemo(() => {
    const vals = chartData
      .map((d) => (typeof d.ton === "number" ? d.ton : null))
      .filter((x): x is number => x !== null);
    if (!vals.length) return 600;
    const m = Math.max(...vals);
    const step = 50;
    return Math.max(300, Math.ceil((m + 20) / step) * step);
  }, [chartData]);

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      loadDay(day, turno);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadDay(day, turno);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, turno]);

  return (
    <div className="min-h-screen w-full">
      <div className="mp-container px-4 py-6">
        {/* ✅ TOPO (nome + descrição) */}
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mp-chip">Produção</div>
            <div className="mp-page-title">Produção da Planta</div>
            <div className="mp-page-sub">
              Ton/H + Frequência (%) • Dia {todayLabel} • Turno {turno} (Offline)
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => loadDay(day, turno)} disabled={loading} className="mp-btn">
              {loading ? "Carregando..." : "Recarregar"}
            </button>

            <button onClick={() => saveDay()} disabled={loading} className="mp-btn mp-btn-primary">
              Salvar
            </button>

            <button onClick={() => clearDay()} disabled={loading} className="mp-btn">
              Limpar
            </button>
          </div>
        </div>

        {/* ✅ CARD COMPACTO (Data/Turno) - ocupa o mínimo */}
        <div
          className="mp-card mt-4"
          style={{
            borderRadius: 18,
          }}
        >
          <div
            className="mp-card-b"
            style={{
              padding: 12,
              display: "grid",
              gap: 10,
              gridTemplateColumns: "1fr",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 900, color: "rgba(255,255,255,.88)" }}>Lançamentos</div>
              <div className="mp-help" style={{ margin: 0 }}>
                Data e turno
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: 10,
                gridTemplateColumns: "1fr",
              }}
            >
              <div className="mp-field">
                <div className="mp-label">Data</div>
                <input
                  type="date"
                  className="mp-input"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                />
              </div>

              <div className="mp-field">
                <div className="mp-label">Turno</div>
                <select
                  className="mp-input"
                  value={turno}
                  onChange={(e) => setTurno(Number(e.target.value) as 1 | 2)}
                >
                  <option value={1}>Turno 1</option>
                  <option value={2}>Turno 2</option>
                </select>
              </div>
            </div>
          </div>

          <style>{`
            @media (min-width: 768px){
              .mp-card .mp-card-b{
                grid-template-columns: 1fr;
              }
              .mp-card .mp-card-b > div:nth-child(2){
                grid-template-columns: 280px 220px;
                align-items: end;
              }
            }
            .mp-field .mp-label{ margin-bottom: 6px; }
          `}</style>
        </div>

        {err && (
          <div className="mp-card mt-4" style={{ borderColor: "rgba(251,113,133,.30)" }}>
            <div className="mp-card-b">
              <div className="mp-error">{err}</div>
            </div>
          </div>
        )}

        {/* GRID */}
        <div className="mp-grid mt-4" style={{ alignItems: "stretch" }}>
          {/* GRÁFICO */}
          <div className="mp-card">
            <div className="mp-card-h">
              <b>Produção por Hora (Ton/H) + Frequência (%)</b>
              <span className="mp-help">Ton/H (barras) • Frequência (%) (linha)</span>
            </div>

            <div className="mp-card-b">
              <div style={{ height: 420, width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 32, right: 26, bottom: 38, left: 10 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />

                    <XAxis
                      dataKey="period"
                      tick={<CustomTick />}
                      interval={1}
                      height={46}
                      axisLine={{ stroke: "rgba(255,255,255,0.10)" }}
                      tickLine={{ stroke: "rgba(255,255,255,0.10)" }}
                    />

                    <YAxis
                      yAxisId="ton"
                      domain={[0, tonMax]}
                      tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 12 }}
                      axisLine={{ stroke: "rgba(255,255,255,0.10)" }}
                      tickLine={{ stroke: "rgba(255,255,255,0.10)" }}
                    />

                    <YAxis
                      yAxisId="freq"
                      orientation="right"
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 12 }}
                      axisLine={{ stroke: "rgba(255,255,255,0.10)" }}
                      tickLine={{ stroke: "rgba(255,255,255,0.10)" }}
                    />

                    <Tooltip
                      formatter={(value: any, name: any) => {
                        if (value === null || value === undefined || value === "") return ["—", name];
                        if (name === "Frequência (%)") return [`${fmtBR2(Number(value))}%`, name];
                        if (name === "Ton/H") return [fmtBR(Number(value)), name];
                        return [String(value), name];
                      }}
                      labelFormatter={(label) => `Faixa: ${label}`}
                      contentStyle={{
                        background: "rgba(0,0,0,0.85)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 12,
                      }}
                      labelStyle={{ color: "rgba(255,255,255,0.85)" }}
                    />

                    <Legend wrapperStyle={{ color: "rgba(255,255,255,0.8)" }} />

                    <Bar
                      yAxisId="ton"
                      dataKey="ton"
                      name="Ton/H"
                      fill="#22c55e"
                      radius={[6, 6, 0, 0]}
                      barSize={22}
                    >
                      <LabelList dataKey="ton" content={<TonLabel />} />
                    </Bar>

                    <Line
                      yAxisId="freq"
                      type="monotone"
                      dataKey="freq"
                      name="Frequência (%)"
                      stroke="#f59e0b"
                      strokeWidth={3}
                      connectNulls={false}
                      dot={(p: any) => {
                        if (p?.payload?.freq === null || p?.payload?.freq === undefined) return null;
                        return (
                          <circle
                            cx={p.cx}
                            cy={p.cy}
                            r={4}
                            fill="#f59e0b"
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
            </div>
          </div>

          {/* OBS */}
          <div className="mp-card">
            <div className="mp-card-h">
              <b>Observação geral</b>
              <span className="mp-help">Anotações do dia</span>
            </div>

            <div
              className="mp-card-b"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                minHeight: 420,
              }}
            >
              <textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Escreva uma observação..."
                className="mp-textarea"
                style={{
                  flex: 1,
                  minHeight: 300,
                  resize: "vertical",
                  lineHeight: 1.45,
                }}
              />
              <div className="mp-help">
                Ex: manutenção, chuva, troca de turno, problema em correia, etc.
              </div>
            </div>
          </div>
        </div>

        {/* LANÇAMENTO (3 colunas / 8 horas cada) */}
        <div className="mp-card mt-6">
          <div className="mp-card-h">
            <b>Lançamento por faixa horária</b>
            <span className="mp-help">Preencha Ton/H e Frequência (%)</span>
          </div>

          <div className="mp-card-b" style={{ display: "grid", gap: 12 }}>
            <div className="mp-launch-grid">
              {/* COL 1 */}
              <div style={{ display: "grid", gap: 10 }}>
                {col1.map((p) => {
                  const v = editRows[p] || { ton: "", freq: "" };
                  return (
                    <div key={p} className="mp-row">
                      <div className="mp-faixa">{p}</div>
                      <input
                        value={v.ton}
                        onChange={(e) => setCell(p, "ton", e.target.value)}
                        placeholder="Ton/H (ex: 120,5)"
                        inputMode="decimal"
                        className="mp-input"
                      />
                      <input
                        value={v.freq}
                        onChange={(e) => setCell(p, "freq", e.target.value)}
                        placeholder="Freq (%) (ex: 82)"
                        inputMode="decimal"
                        className="mp-input"
                      />
                    </div>
                  );
                })}
              </div>

              {/* COL 2 */}
              <div style={{ display: "grid", gap: 10 }}>
                {col2.map((p) => {
                  const v = editRows[p] || { ton: "", freq: "" };
                  return (
                    <div key={p} className="mp-row">
                      <div className="mp-faixa">{p}</div>
                      <input
                        value={v.ton}
                        onChange={(e) => setCell(p, "ton", e.target.value)}
                        placeholder="Ton/H (ex: 239,4)"
                        inputMode="decimal"
                        className="mp-input"
                      />
                      <input
                        value={v.freq}
                        onChange={(e) => setCell(p, "freq", e.target.value)}
                        placeholder="Freq (%) (ex: 92)"
                        inputMode="decimal"
                        className="mp-input"
                      />
                    </div>
                  );
                })}
              </div>

              {/* COL 3 */}
              <div style={{ display: "grid", gap: 10 }}>
                {col3.map((p) => {
                  const v = editRows[p] || { ton: "", freq: "" };
                  return (
                    <div key={p} className="mp-row">
                      <div className="mp-faixa">{p}</div>
                      <input
                        value={v.ton}
                        onChange={(e) => setCell(p, "ton", e.target.value)}
                        placeholder="Ton/H (ex: 239,4)"
                        inputMode="decimal"
                        className="mp-input"
                      />
                      <input
                        value={v.freq}
                        onChange={(e) => setCell(p, "freq", e.target.value)}
                        placeholder="Freq (%) (ex: 92)"
                        inputMode="decimal"
                        className="mp-input"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <style>{`
              .mp-launch-grid{
                display:grid;
                gap:12px;
                grid-template-columns: 1fr;
              }
              @media (min-width: 1024px){
                .mp-launch-grid{
                  grid-template-columns: 1fr 1fr 1fr;
                  align-items:start;
                }
              }
            `}</style>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 px-4 pb-4">
            <button onClick={() => saveDay()} disabled={loading} className="mp-btn mp-btn-primary">
              Salvar
            </button>
            <button onClick={() => loadDay(day, turno)} disabled={loading} className="mp-btn">
              Recarregar
            </button>
            <button onClick={() => clearDay()} disabled={loading} className="mp-btn">
              Limpar
            </button>
          </div>
        </div>

        <div className="mt-6 mp-help">
          {payload?.updated_at
            ? `Última atualização (offline): ${payload.updated_at}`
            : "Sem atualização ainda."}
        </div>
      </div>
    </div>
  );
}
