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

/* ===================== api ===================== */

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

function authHeaders(): HeadersInit {
  // mantém compatível com seu projeto (mp_token e/ou token)
  const keys = ["mp_token", "token", "access_token", "auth_token"];
  for (const k of keys) {
    const v = (localStorage.getItem(k) || "").trim();
    if (v) return { Authorization: `Bearer ${v}` };
  }
  return {};
}

function devHeaders(): HeadersInit {
  // ✅ DEV KEY que libera retroativo no backend
  const devKey = (localStorage.getItem("mp_dev_key") || "").trim();
  return devKey ? { "X-Dev-Key": devKey } : {};
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

  // alterna altura pra evitar colidir com outros labels
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

  const [obs, setObs] = useState<string>("");
  const [rows, setRows] = useState<PlantHourRow[]>(periods.map((p) => ({ period: p, ton: "", freq: "" })));
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const hasDevKey = useMemo(() => (localStorage.getItem("mp_dev_key") || "").trim().length > 0, []);

  function normalizeRows(inRows: PlantHourRow[]): PlantHourRow[] {
    const map: Record<string, PlantHourRow> = {};
    for (const r of inRows || []) map[r.period] = r;

    return periods.map((p) => ({
      period: p,
      ton: map[p]?.ton ?? "",
      freq: map[p]?.freq ?? "",
    }));
  }

  async function loadDay() {
    setLoading(true);
    setErr(null);
    setInfo(null);

    try {
      const r = await fetch(`${API_BASE}/api/plant-production/${encodeURIComponent(day)}`, {
        headers: authHeaders(),
      });

      if (r.status === 404) {
        // dia sem dados ainda
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

      const r = await fetch(`${API_BASE}/api/plant-production/${encodeURIComponent(day)}`, {
        method: "PUT",
        headers: {
          ...authHeaders(),
          ...devHeaders(), // ✅ aqui libera retroativo no backend
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!r.ok) throw new Error(await readErr(r));

      setInfo("Salvo (DEV) com sucesso.");
      await loadDay();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const chartData = useMemo(() => {
    return rows.map((r) => {
      const ton = parseBRNumber(r.ton);
      const freq = parseBRNumber(r.freq);
      return {
        period: r.period,
        ton: ton === null ? null : Math.max(0, ton),
        freq: freq === null ? null : Math.max(0, Math.min(100, freq)),
      };
    });
  }, [rows]);

  const totalTon = useMemo(() => {
    let s = 0;
    for (const r of chartData) if (typeof r.ton === "number") s += r.ton;
    return s;
  }, [chartData]);

  const chunks = useMemo(() => [rows.slice(0, 8), rows.slice(8, 16), rows.slice(16, 24)], [rows]);

  function setCell(period: string, key: "ton" | "freq", value: string) {
    setRows((prev) => prev.map((r) => (r.period === period ? { ...r, [key]: value } : r)));
  }

  return (
    <div className="mp-container">
      <div className="mp-page-title">
        <span className="mp-badge mp-badge-dev">DEV</span> Dev Dash
      </div>
      <div className="mp-page-sub">
        Editável qualquer dia • Dia {br(day)} • Total: <b>{fmtBR0(totalTon)}</b> t
        {updatedAt ? ` • Atualizado: ${new Date(updatedAt).toLocaleString("pt-BR")}` : ""}
      </div>

      {!hasDevKey && (
        <div className="mp-card" style={{ marginTop: 12 }}>
          <div className="mp-card-b" style={{ color: "#fbbf24", fontWeight: 900 }}>
            DEV KEY não encontrada. Para liberar retroativo:
            <div style={{ marginTop: 8, fontFamily: "monospace", opacity: 0.95 }}>
              localStorage.setItem("mp_dev_key", "SUA_DEV_KEY")
            </div>
          </div>
        </div>
      )}

      {/* ===== Card: Data + Ações ===== */}
      <div className="mp-card" style={{ marginTop: 12 }}>
        <div className="mp-card-h">
          <b>Produção do dia</b>
          <span className="mp-help" style={{ marginLeft: 10 }}>
            (DEV)
          </span>
        </div>

        <div className="mp-card-b">
          <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <div>
              <div className="mp-label">Data</div>
              <input className="mp-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>

            <button className="mp-btn" onClick={loadDay} disabled={loading}>
              {loading ? "Atualizando..." : "Atualizar"}
            </button>

            <button className="mp-btn mp-btn-primary" onClick={saveDay} disabled={saving}>
              {saving ? "Salvando..." : "Salvar (DEV)"}
            </button>
          </div>

          {err && <div style={{ marginTop: 10, color: "#f87171", fontWeight: 900 }}>{err}</div>}
	      {info && <div style={{ marginTop: 10, color: "#00CCFF", fontWeight: 900 }}>{info}</div>}
        </div>
      </div>

      {/* ===== Gráfico ===== */}
      <div className="mp-card" style={{ marginTop: 14 }}>
        <div className="mp-card-h">
          <b>Gráfico (Ton/H + %)</b>
          <span className="mp-badge mp-badge-dev" style={{ marginLeft: 10 }}>
            DEV
          </span>
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
                formatter={(value: any, name: any) => {
                  if (value === null || value === undefined) return ["—", name];
                  if (name === "Frequência (%)") return [`${fmtBR0(Number(value))}%`, name];
                  if (name === "Ton/H") return [fmtBR1(Number(value)), name];
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
                  return (
                    <circle cx={p.cx} cy={p.cy} r={4} fill="#FFA31A" stroke="rgba(0,0,0,.6)" strokeWidth={2} />
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

      {/* ===== Observação ===== */}
      <div className="mp-card" style={{ marginTop: 14 }}>
        <div className="mp-card-h">
          <b>Observação do dia</b>
          <span className="mp-badge mp-badge-dev" style={{ marginLeft: 10 }}>
            DEV
          </span>
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
        Preencha <b>Ton/H</b> e <b>Freq%</b> por hora. (DEV: sem bloqueio retroativo)
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
                  {rows8.map((r) => (
                    <tr key={r.period}>
                      <td style={{ color: "rgba(255,255,255,0.85)", fontWeight: 800 }}>
                        {periodShort(r.period)}
                      </td>

                      <td>
                        <input
                          className="mp-input"
                          value={(r.ton as any) ?? ""}
                          onChange={(e) => setCell(r.period, "ton", e.target.value)}
                          placeholder="ex: 320"
                        />
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
                  ))}
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
