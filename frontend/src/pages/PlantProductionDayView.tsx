import { useEffect, useMemo, useState, type HeadersInit } from "react";

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

type PlantHourRow = {
  period: string; // "07:00-08:00"
  ton?: string | number | null;
  freq?: string | number | null;
};

type PlantDayPayload = {
  day: string; // YYYY-MM-DD
  obs?: string | null;
  rows: PlantHourRow[];
  updated_at?: string | null;
};

function isoTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function makePeriods(): string[] {
  // MESMA ORDEM DO SEU PlantProduction
  const res: string[] = [];
  const hours = [
    7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
    19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6,
  ];
  for (let i = 0; i < hours.length; i++) {
    const h1 = hours[i];
    const h2 = hours[(i + 1) % hours.length];
    const a = String(h1).padStart(2, "0") + ":00";
    const b = String(h2).padStart(2, "0") + ":00";
    res.push(`${a}-${b}`);
  }
  return res;
}

// 201,6 | 201.6 | 1.234,56 | 1,234.56 | "82%"
function parseBRNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  let s = String(v).trim();
  if (!s) return null;
  s = s.replace("%", "").trim();
  s = s.replace(/\s/g, "");

  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmtBR(n: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
}
function fmtBR2(n: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
}

export default function PlantProductionDayView() {
  const periods = useMemo(() => makePeriods(), []);
  const [day, setDay] = useState<string>(isoTodayLocal());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [payload, setPayload] = useState<PlantDayPayload | null>(null);

  // ✅ igual ao seu PlantProduction.tsx
  const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

  // ✅ TIPADO como HeadersInit (evita union estranho em build)
  function authHeaders(): HeadersInit {
    const t = (localStorage.getItem("mp_token") || "").trim();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  async function loadDay(d: string) {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`${API_BASE}/api/plant-production/${encodeURIComponent(d)}`, {
        headers: authHeaders(),
      });

      if (r.status === 404) {
        setPayload({
          day: d,
          obs: "",
          rows: periods.map((p) => ({ period: p, ton: null, freq: null })),
        });
        return;
      }

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `HTTP ${r.status}`);
      }

      const data = (await r.json()) as PlantDayPayload;
      setPayload(data);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDay(day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const chartData = useMemo(() => {
    // normaliza para ter sempre 24 faixas
    const map: Record<string, { ton: number | null; freq: number | null }> = {};
    for (const p of periods) map[p] = { ton: null, freq: null };

    for (const r of payload?.rows || []) {
      if (!map[r.period]) continue;
      const ton = parseBRNumber(r.ton);
      const freq = parseBRNumber(r.freq);
      map[r.period] = {
        ton: ton === null ? null : Math.max(0, ton),
        freq: freq === null ? null : Math.max(0, Math.min(100, freq)),
      };
    }

    return periods.map((p) => ({ period: p, ton: map[p].ton, freq: map[p].freq }));
  }, [payload, periods]);

  const CustomTick = (props: any) => {
    const { x, y, payload } = props;
    const p = String(payload.value || "");
    const [a, b] = p.split("-");
    const ha = (a || "").slice(0, 2);
    const hb = (b || "").slice(0, 2);
    const label = `${ha}-${hb}`;
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

  const TonLabel = (props: any) => {
    const { x, y, width, value } = props;
    if (value === null || value === undefined) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 80) return null;
    return (
      <text
        x={x + width / 2}
        y={y - 6}
        textAnchor="middle"
        fill="rgba(255,255,255,0.92)"
        fontSize={11}
        fontWeight={800}
        style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.75)", strokeWidth: 3 }}
      >
        {fmtBR(n)}
      </text>
    );
  };

  const FreqLabel = (props: any) => {
    const { x, y, index, value } = props;
    if (value === null || value === undefined) return null;
    if (index % 2 !== 0) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return (
      <text
        x={x}
        y={y - 10}
        textAnchor="middle"
        fill="rgba(255,255,255,0.92)"
        fontSize={11}
        fontWeight={800}
        style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.75)", strokeWidth: 3 }}
      >
        {fmtBR2(n)}%
      </text>
    );
  };

  const [yy, mm, dd] = day.split("-");
  const dayBR = `${dd}/${mm}/${yy}`;

  return (
    <div className="mp-container">
      <div className="mp-page-title">Produção do dia</div>
      <div className="mp-page-sub">Evolução horária • {dayBR}</div>

      <div className="mp-card" style={{ marginTop: 12 }}>
        <div
          className="mp-card-h"
          style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}
        >
          <div style={{ flex: 1, minWidth: 260 }}>
            <b>Produção por hora (Ton/H + Frequência)</b>
            <div className="mp-help">
              {loading
                ? "Carregando..."
                : err
                ? `Erro: ${err}`
                : payload?.updated_at
                ? `Atualizado: ${payload.updated_at}`
                : "—"}
            </div>
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
        </div>

        <div className="mp-card-b">
          <div style={{ height: 440, width: "100%" }}>
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
                  domain={[0, 600]}
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

                <Bar yAxisId="ton" dataKey="ton" name="Ton/H" fill="#22c55e" radius={[6, 6, 0, 0]} barSize={22}>
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

          {!loading && !err && chartData.every((d) => d.ton === null && d.freq === null) ? (
            <div className="mp-help" style={{ marginTop: 10 }}>
              Sem dados para este dia (backend retornou vazio/404).
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
