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

function br(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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

function parseBRNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  let s = String(v).trim();
  if (!s) return null;

  s = s.replace("%", "").trim();
  s = s.replace(/\s/g, "");

  // "1.234,5" -> "1234.5"
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmtBR0(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}
function fmtBR1(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
}
function fmtBR2(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
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

/* ===================== api ===================== */

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

function authHeaders(): HeadersInit {
  // mantém compatível com seu projeto (mp_token e/ou token)
  const keys = ["mp_token", "token", "access_token", "auth_token", "monplant_token", "mp_auth_token", "bv_token"];
  for (const k of keys) {
    const v = (localStorage.getItem(k) || "").trim();
    if (v) return { Authorization: `Bearer ${v}` };
  }
  return {};
}

async function readErr(r: Response) {
  const t = await r.text().catch(() => "");
  if (!t) return `HTTP ${r.status}`;
  try {
    const j = JSON.parse(t);
    if (j?.detail) return typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    return JSON.stringify(j);
  } catch {
    return t;
  }
}

/* ===================== chart label components (TS safe) ===================== */

const FreqLabel = (props: any) => {
  const { x, y, value, index } = props;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  const bump = (index ?? 0) % 2 === 0 ? -10 : -18;

  return (
    <text
      x={x}
      y={y + bump}
      textAnchor="middle"
      fill="rgba(255,255,255,0.86)"
      fontSize={11}
      fontWeight={900}
      style={{
        paintOrder: "stroke",
        stroke: "rgba(0,0,0,0.70)",
        strokeWidth: 3,
      }}
    >
      {`${Math.round(n)}%`}
    </text>
  );
};

const TonLabel = (props: any) => {
  const { x, y, width, value } = props;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;

  return (
    <text
      x={x + width / 2}
      y={y - 8}
      textAnchor="middle"
      fill="rgba(255,255,255,0.92)"
      fontSize={11}
      fontWeight={900}
      style={{
        paintOrder: "stroke",
        stroke: "rgba(0,0,0,0.70)",
        strokeWidth: 3,
      }}
    >
      {fmtBR1(n)}
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
        {periodShort(String(payload?.value || ""))}
      </text>
    </g>
  );
};

/* ===================== component ===================== */

export default function PlantProductionDayView() {
  const periods = useMemo(() => makePeriods24(), []);
  const [day, setDay] = useState<string>(isoTodayLocal());

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [plants, setPlants] = useState<PlantInfo[]>([]);
  const [plantId, setPlantId] = useState<number | null>(null);

  const [obs, setObs] = useState<string>("");
  const [rows, setRows] = useState<PlantHourRow[]>(periods.map((p) => ({ period: p, ton: "", freq: "" })));
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  // Ajuste exclusivo para Planta 02: OVER movimentado no dia, redistribuído em 24h.
  // Fica salvo localmente por dia/planta para não alterar a arquitetura atual do backend.
  const [overMoved, setOverMoved] = useState<string>("");

  const selectedPlant = useMemo(
    () => plants.find((p) => Number(p.id) === Number(plantId)) || null,
    [plants, plantId],
  );

  const selectedPlantName = selectedPlant?.name || (plantId ? `Planta ${plantId}` : "Planta");

  const isPlant02 = useMemo(() => {
    if (!plantId) return false;
    const name = `${selectedPlant?.name || ""} ${selectedPlant?.code || ""}`.toLowerCase();
    return Number(plantId) === 2 || name.includes("planta 02") || name.includes("planta-02") || name.includes("planta 2");
  }, [plantId, selectedPlant]);

  const overStorageKey = useMemo(() => `monplant:plant-production-day-view:over:${plantId || "none"}:${day}`, [plantId, day]);

  function normalizeRows(inRows: PlantHourRow[]): PlantHourRow[] {
    const map: Record<string, PlantHourRow> = {};
    for (const r of inRows || []) map[r.period] = r;

    return periods.map((p) => ({
      period: p,
      ton: map[p]?.ton ?? "",
      freq: map[p]?.freq ?? "",
    }));
  }

  async function loadPlants() {
    setErr(null);
    try {
      const r = await fetch(`${API_BASE}/api/plants`, { headers: authHeaders() });
      if (!r.ok) throw new Error(await readErr(r));

      const data = ((await r.json()) || []) as PlantInfo[];
      setPlants(data);
      setPlantId((current) => {
        if (current && data.some((p) => Number(p.id) === Number(current))) return current;
        return data.length ? Number(data[0].id) : 1;
      });
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar plantas");
      setPlants([]);
      setPlantId(1);
    }
  }

  async function loadDay() {
    const selectedPlantId = plantId || 1;
    setLoading(true);
    setErr(null);
    setInfo(null);

    try {
      const r = await fetch(`${API_BASE}/api/plants/${selectedPlantId}/plant-production/${encodeURIComponent(day)}`, {
        headers: authHeaders(),
      });

      if (r.status === 404) {
        setObs("");
        setRows(periods.map((p) => ({ period: p, ton: "", freq: "" })));
        setUpdatedAt(null);
        return;
      }

      if (!r.ok) throw new Error(await readErr(r));

      const data = (await r.json()) as PlantDayPayload;
      setObs(data?.obs ?? "");
      setRows(normalizeRows(data?.rows || []));
      setUpdatedAt(data?.updated_at ?? null);
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }

  async function saveDay() {
    const selectedPlantId = plantId || 1;
    setSaving(true);
    setErr(null);
    setInfo(null);

    try {
      const body = {
        obs: obs ?? "",
        rows: rows.map((r) => ({
          period: r.period,
          ton: parseBRNumber(r.ton),
          freq: parseBRNumber(r.freq),
        })),
      };

      const r = await fetch(`${API_BASE}/api/plants/${selectedPlantId}/plant-production/${encodeURIComponent(day)}`, {
        method: "PUT",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!r.ok) throw new Error(await readErr(r));

      setInfo("Salvo com sucesso.");
      await loadDay();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  function saveOverMoved() {
    localStorage.setItem(overStorageKey, overMoved || "");
    setInfo("Ajuste de OVER aplicado nesta visualização.");
  }

  useEffect(() => {
    loadPlants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (plantId !== null) loadDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, plantId]);

  useEffect(() => {
    const saved = localStorage.getItem(overStorageKey) || "";
    setOverMoved(saved);
  }, [overStorageKey]);

  const overTotal = useMemo(() => Math.max(0, parseBRNumber(overMoved) || 0), [overMoved]);
  const overPerHour = useMemo(() => (isPlant02 && overTotal > 0 ? overTotal / 24 : 0), [isPlant02, overTotal]);

  const chartData = useMemo(() => {
    return rows.map((r) => {
      const tonOriginal = parseBRNumber(r.ton);
      const freq = parseBRNumber(r.freq);
      const tonBase = tonOriginal === null ? null : Math.max(0, tonOriginal);
      const tonAdjusted = tonBase === null ? null : Math.max(0, tonBase - overPerHour);

      return {
        period: r.period,
        ton: tonAdjusted,
        tonOriginal: tonBase,
        overPerHour,
        freq: freq === null ? null : Math.max(0, Math.min(100, freq)),
      };
    });
  }, [rows, overPerHour]);

  const totalOriginalTon = useMemo(() => {
    let s = 0;
    for (const r of chartData) if (typeof r.tonOriginal === "number") s += r.tonOriginal;
    return s;
  }, [chartData]);

  const totalTon = useMemo(() => {
    let s = 0;
    for (const r of chartData) if (typeof r.ton === "number") s += r.ton;
    return s;
  }, [chartData]);

  const chunks = useMemo(() => [rows.slice(0, 8), rows.slice(8, 16), rows.slice(16, 24)], [rows]);

  function setCell(period: string, key: "ton" | "freq", value: string) {
    setRows((prev) => prev.map((r) => (r.period === period ? { ...r, [key]: value } : r)));
  }

  function adjustedTonForPeriod(period: string): number | null {
    const row = rows.find((r) => r.period === period);
    const base = parseBRNumber(row?.ton);
    if (base === null) return null;
    return Math.max(0, base - overPerHour);
  }

  return (
    <div className="mp-container">
      <div className="mp-page-title">Produção da Planta</div>
      <div className="mp-page-sub">
        Visualização por planta • Dia {br(day)} • {selectedPlantName} • Total ajustado: <b>{fmtBR0(totalTon)}</b> t
        {isPlant02 && overPerHour > 0 ? ` • OVER abatido: ${fmtBR0(overTotal)} t no dia` : ""}
        {updatedAt ? ` • Atualizado: ${new Date(updatedAt).toLocaleString("pt-BR")}` : ""}
      </div>

      {/* ===== Card: Data + Planta + Ações ===== */}
      <div className="mp-card" style={{ marginTop: 12 }}>
        <div className="mp-card-h">
          <b>Produção do dia</b>
        </div>

        <div className="mp-card-b">
          <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <div>
              <div className="mp-label">Planta</div>
              <select
                className="mp-input"
                value={plantId ?? ""}
                onChange={(e) => setPlantId(e.target.value ? Number(e.target.value) : null)}
                disabled={loading || plants.length === 0}
                style={{ minWidth: 180 }}
              >
                {plants.length === 0 ? <option value="">Sem plantas cadastradas</option> : null}
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mp-label">Data</div>
              <input className="mp-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>

            <button className="mp-btn" onClick={loadDay} disabled={loading}>
              {loading ? "Atualizando..." : "Atualizar"}
            </button>

            <button className="mp-btn mp-btn-primary" onClick={saveDay} disabled={saving || loading || !plantId}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>

          {err && <div style={{ marginTop: 10, color: "#f87171", fontWeight: 900 }}>{err}</div>}
          {info && <div style={{ marginTop: 10, color: "#34d399", fontWeight: 900 }}>{info}</div>}
        </div>
      </div>

      {/* ===== Gráfico + Card OVER ===== */}
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: isPlant02 ? "minmax(0, 1fr) 340px" : "1fr",
          gap: 14,
          alignItems: "stretch",
        }}
      >
        <div className="mp-card" style={{ margin: 0 }}>
          <div className="mp-card-h">
            <b>Gráfico (Ton/H + %)</b>
            {isPlant02 && overPerHour > 0 ? (
              <span className="mp-help">Ton/H já exibida com abatimento de OVER redistribuído por 24h</span>
            ) : null}
          </div>

          <div className="mp-card-b" style={{ height: 420 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 52, right: 24, bottom: 30, left: 10 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />

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
                  formatter={(value: any, name: any, props: any) => {
                    const payload = props?.payload || {};
                    if (value === null || value === undefined) return ["—", name];
                    if (name === "Frequência (%)") return [`${fmtBR0(Number(value))}%`, name];
                    if (name === "Ton/H") {
                      if (isPlant02 && overPerHour > 0) {
                        return [
                          `${fmtBR1(Number(value))} t | original ${fmtBR1(Number(payload.tonOriginal || 0))} t | abat. ${fmtBR2(overPerHour)} t/h`,
                          "Ton/H ajustada",
                        ];
                      }
                      return [fmtBR1(Number(value)), name];
                    }
                    return [String(value), name];
                  }}
                  labelFormatter={(label) => `Faixa: ${label}`}
                  contentStyle={{
                    background: "rgba(0,0,0,0.86)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                  }}
                  labelStyle={{ color: "rgba(255,255,255,0.85)", fontWeight: 900 }}
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
                    if (p?.payload?.freq === null || p?.payload?.freq === undefined) return null;
                    return <circle cx={p.cx} cy={p.cy} r={4} fill="#FFA31A" stroke="rgba(0,0,0,.6)" strokeWidth={2} />;
                  }}
                  activeDot={{ r: 6 }}
                >
                  <LabelList dataKey="freq" content={<FreqLabel />} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {isPlant02 ? (
          <div className="mp-card" style={{ margin: 0 }}>
            <div className="mp-card-h">
              <b>Ajuste OVER movimentado</b>
              <span className="mp-help">Planta 02</span>
            </div>
            <div className="mp-card-b">
              <div className="mp-help" style={{ marginBottom: 12 }}>
                Informe o total de OVER movimentado no dia. O sistema divide por 24 horas e abate esse valor da Ton/H exibida.
              </div>

              <div className="mp-label">OVER movimentado no dia (t)</div>
              <input
                className="mp-input"
                value={overMoved}
                onChange={(e) => setOverMoved(e.target.value)}
                placeholder="ex: 2400"
                inputMode="decimal"
              />

              <button className="mp-btn" onClick={saveOverMoved} style={{ width: "100%", marginTop: 10 }}>
                Aplicar ajuste
              </button>

              <div
                style={{
                  marginTop: 14,
                  borderRadius: 16,
                  border: "1px solid rgba(245,158,11,0.22)",
                  background: "rgba(245,158,11,0.08)",
                  padding: 12,
                }}
              >
                <div className="mp-help">Abatimento por hora</div>
                <div style={{ color: "#FFA31A", fontSize: 28, fontWeight: 980, lineHeight: 1.05 }}>
                  {fmtBR2(overPerHour)} t/h
                </div>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span className="mp-help">Produção original</span>
                  <b>{fmtBR0(totalOriginalTon)} t</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span className="mp-help">OVER total</span>
                  <b>{fmtBR0(overTotal)} t</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span className="mp-help">Produção ajustada</span>
                  <b style={{ color: "#00D6FF" }}>{fmtBR0(totalTon)} t</b>
                </div>
              </div>

              <div className="mp-help" style={{ marginTop: 12 }}>
                Esse ajuste é visual nesta página e não altera a produção lançada no banco.
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* ===== Observação ===== */}
      <div className="mp-card" style={{ marginTop: 14 }}>
        <div className="mp-card-h">
          <b>Observação do dia</b>
        </div>

        <div className="mp-card-b">
          <textarea
            className="mp-textarea"
            value={obs ?? ""}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Ex.: chuva, manutenção, falta de energia, etc."
            style={{ minHeight: 120 }}
          />
        </div>
      </div>

      {/* ===== Tabela em 3 colunas ===== */}
      <div className="mp-help" style={{ marginTop: 14 }}>
        Preencha <b>Ton/H</b> e <b>Freq%</b> por hora. {isPlant02 && overPerHour > 0 ? <span>Na Planta 02, a prévia ajustada aparece abaixo da Ton/H.</span> : null}
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
              <b>{colIdx === 0 ? "00–08" : colIdx === 1 ? "08–16" : "16–24"}</b>
              <span className="mp-help">8 faixas</span>
            </div>

            <div className="mp-card-b" style={{ padding: 12 }}>
              <table className="mp-table" style={{ width: "100%", minWidth: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: 84 }}>Hora</th>
                    <th style={{ width: 110 }}>Ton/H</th>
                    <th style={{ width: 130 }}>Freq (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows8.map((r) => {
                    const adjusted = adjustedTonForPeriod(r.period);
                    return (
                      <tr key={r.period}>
                        <td style={{ color: "rgba(255,255,255,0.85)", fontWeight: 800 }}>{periodShort(r.period)}</td>

                        <td>
                          <input
                            className="mp-input"
                            value={(r.ton as any) ?? ""}
                            onChange={(e) => setCell(r.period, "ton", e.target.value)}
                            placeholder="ex: 320"
                          />
                          {isPlant02 && overPerHour > 0 && adjusted !== null ? (
                            <div style={{ marginTop: 4, color: "#00D6FF", fontSize: 11, fontWeight: 900 }}>
                              Ajust.: {fmtBR1(adjusted)}
                            </div>
                          ) : null}
                        </td>

                        <td>
                          <input
                            className="mp-input"
                            value={(r.freq as any) ?? ""}
                            onChange={(e) => setCell(r.period, "freq", e.target.value)}
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

      <div style={{ height: 8 }} />
    </div>
  );
}
