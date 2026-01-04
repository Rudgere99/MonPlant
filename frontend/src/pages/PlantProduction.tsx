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
import ShiftBar from "../components/ShiftBar";

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
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
}

// 201,6 | 201.6 | 1.234,56 | 1,234.56 | "82%"
function parseBRNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  let s = String(v).trim();
  if (!s) return null;

  s = s.replace("%", "").trim();

  // remove espaços
  s = s.replace(/\s/g, "");

  // se tem vírgula e ponto, assume pt-BR: ponto milhar, vírgula decimal
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    // só vírgula -> decimal
    s = s.replace(",", ".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function makePeriods(): string[] {
  const res: string[] = [];
  // 07:00-08:00 ... 18:00-19:00 | 19:00-20:00 ... 06:00-07:00 (24 faixas)
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

/* ===================== component ===================== */

export default function KPIProducaoPlanta() {
  const TON_MAX = 600;

  const [day, setDay] = useState<string>(isoTodayLocal());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [payload, setPayload] = useState<PlantDayPayload | null>(null);
  const [obs, setObs] = useState<string>("");

  // edição (mantém string)
  const [editRows, setEditRows] = useState<Record<string, { ton: string; freq: string }>>({});

  const periods = useMemo(() => makePeriods(), []);
  const leftPeriods = useMemo(() => periods.slice(0, 12), [periods]);
  const rightPeriods = useMemo(() => periods.slice(12), [periods]);

  const todayLabel = useMemo(() => {
    // dd/mm/yyyy
    const [y, m, d] = day.split("-");
    return `${d}/${m}/${y}`;
  }, [day]);

  const loadedRef = useRef(false);

  // ✅ fallback local pra DEV (se não setar VITE_API_BASE)
  const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

  function authHeaders() {
    const t = (localStorage.getItem("mp_token") || "").trim();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  function resetEditsFromPayload(p: PlantDayPayload | null) {
    const base: Record<string, { ton: string; freq: string }> = {};
    periods.forEach((per) => {
      base[per] = { ton: "", freq: "" };
    });

    if (p?.rows?.length) {
      for (const r of p.rows) {
        const per = r.period;
        if (!base[per]) continue;
        base[per] = {
          ton: r.ton === null || r.ton === undefined ? "" : String(r.ton),
          freq: r.freq === null || r.freq === undefined ? "" : String(r.freq),
        };
      }
    }

    setEditRows(base);
    setObs(p?.obs || "");
  }

  async function loadDay(d: string) {
    setLoading(true);
    setErr(null);

    try {
      const r = await fetch(`${API_BASE}/api/plant-production/${encodeURIComponent(d)}`, {
        headers: {
          ...authHeaders(),
        },
      });

      if (r.status === 404) {
        // dia sem dados ainda
        const empty: PlantDayPayload = {
          day: d,
          obs: "",
          rows: periods.map((p) => ({ period: p, ton: "", freq: "" })),
        };
        setPayload(empty);
        resetEditsFromPayload(empty);
        return;
      }

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `HTTP ${r.status}`);
      }

      const data = (await r.json()) as PlantDayPayload;
      setPayload(data);
      resetEditsFromPayload(data);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  async function saveDay(reload = false) {
    setLoading(true);
    setErr(null);

    try {
      const rows: PlantHourRow[] = periods.map((p) => {
        const v = editRows[p] || { ton: "", freq: "" };
        return { period: p, ton: v.ton, freq: v.freq };
      });

      const body: PlantDayPayload = {
        day,
        obs,
        rows,
      };

      const r = await fetch(`${API_BASE}/api/plant-production/${encodeURIComponent(day)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `HTTP ${r.status}`);
      }

      const saved = (await r.json()) as PlantDayPayload;
      setPayload(saved);

      if (reload) {
        await loadDay(day);
      }
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  function setCell(period: string, key: "ton" | "freq", value: string) {
    setEditRows((prev) => ({
      ...prev,
      [period]: {
        ...prev[period],
        [key]: value,
      },
    }));
  }

  const chartData = useMemo(() => {
    // gera dados do gráfico baseado em editRows
    return periods.map((p) => {
      const v = editRows[p] || { ton: "", freq: "" };

      const tonN = parseBRNumber(v.ton);
      const freqN = parseBRNumber(v.freq);

      const ton = tonN === null ? null : clamp(tonN, 0, TON_MAX);
      const freq = freqN === null ? null : clamp(freqN, 0, 100);

      return {
        period: p,
        ton,
        freq,
        tonLabel: ton === null ? "" : fmtBR(ton),
        freqLabel: freq === null ? "" : `${fmtBR2(freq)}%`,
      };
    });
  }, [editRows, periods]);

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      loadDay(day);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // quando troca a data, carrega automaticamente (opcional)
    loadDay(day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  return (
    <div className="min-h-screen w-full bg-[#0B0F14] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <ShiftBar
          onChange={(v) => {
            setDay(v.day);
          }}
        />

        {/* header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm tracking-wide text-white/60">MONPLANT • Produção Planta</div>
            <h1 className="text-2xl font-extrabold tracking-tight">KPI • Ton/H + Frequência</h1>
            <div className="mt-1 text-sm text-white/60">Dia selecionado: {todayLabel}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
            />
            <button
              onClick={() => loadDay(day)}
              disabled={loading}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
            >
              {loading ? "Carregando..." : "Atualizar"}
            </button>
            <button
              onClick={() => saveDay(true)}
              disabled={loading}
              className="rounded-lg bg-emerald-500/90 px-3 py-2 text-sm font-extrabold text-black hover:bg-emerald-400 disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
        </div>

        {/* erro */}
        {err && (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        )}

        {/* obs */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-semibold">Observação geral</div>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Escreva uma observação..."
            className="mt-2 h-24 w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
          />
        </div>

        {/* gráfico */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3">
            <div className="text-sm font-semibold">Produção por Hora (Ton/H) + Frequência (%)</div>
            <div className="text-xs text-white/60">Ton/H (barras) e Frequência (linha)</div>
          </div>

          <div className="h-[420px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 60, right: 22, bottom: 10, left: 10 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />

                <XAxis
                  dataKey="period"
                  tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.10)" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.10)" }}
                  interval={0}
                  angle={-28}
                  height={70}
                />

                <YAxis
                  yAxisId="ton"
                  domain={[0, TON_MAX]}
                  tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.10)" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.10)" }}
                />

                <YAxis
                  yAxisId="freq"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.10)" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.10)" }}
                />

                <Tooltip
                  contentStyle={{
                    background: "rgba(0,0,0,0.85)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                  }}
                  labelStyle={{ color: "rgba(255,255,255,0.85)" }}
                />

                <Legend wrapperStyle={{ color: "rgba(255,255,255,0.8)" }} />

                {/* barras */}
                <Bar yAxisId="ton" dataKey="ton" name="Ton/H" fill="#22c55e" radius={[6, 6, 0, 0]}>
                  {/* Massa em cima da barra */}
                  <LabelList
                    dataKey="tonLabel"
                    position="top"
                    offset={12}
                    fill="rgba(255,255,255,0.92)"
                    fontSize={12}
                    fontWeight={800}
                    style={{
                      paintOrder: "stroke",
                      stroke: "rgba(0,0,0,0.70)",
                      strokeWidth: 3,
                    }}
                  />
                </Bar>

                {/* linha */}
                <Line
                  yAxisId="freq"
                  type="monotone"
                  dataKey="freq"
                  name="Frequência (%)"
                  stroke="#60a5fa"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                >
                  <LabelList
                    dataKey="freqLabel"
                    position="top"
                    offset={16}
                    fill="rgba(255,255,255,0.92)"
                    fontSize={12}
                    fontWeight={800}
                    style={{
                      paintOrder: "stroke",
                      stroke: "rgba(0,0,0,0.70)",
                      strokeWidth: 3,
                    }}
                  />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* tabela de edição */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3">
            <div className="text-sm font-semibold">Lançamento (por faixa horária)</div>
            <div className="text-xs text-white/60">Preencha Ton/H e Frequência (%)</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-white/10 text-white/70">
                <tr>
                  <th className="text-left p-3">Faixa</th>
                  <th className="text-left p-3">Ton/H</th>
                  <th className="text-left p-3">Freq (%)</th>

                  <th className="text-left p-3">Faixa</th>
                  <th className="text-left p-3">Ton/H</th>
                  <th className="text-left p-3">Freq (%)</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 12 }).map((_, i) => {
                  const pL = leftPeriods[i];
                  const pR = rightPeriods[i];

                  const vL = editRows[pL] || { ton: "", freq: "" };
                  const vR = editRows[pR] || { ton: "", freq: "" };

                  return (
                    <tr key={pL} className="border-t border-white/10">
                      <td className="p-3 font-semibold">{pL}</td>
                      <td className="p-3">
                        <input
                          value={vL.ton}
                          onChange={(e) => setCell(pL, "ton", e.target.value)}
                          placeholder="ex: 120,5"
                          inputMode="decimal"
                          className="w-28 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          value={vL.freq}
                          onChange={(e) => setCell(pL, "freq", e.target.value)}
                          placeholder="ex: 85"
                          inputMode="decimal"
                          className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                        />
                      </td>

                      <td className="p-3 font-semibold">{pR}</td>
                      <td className="p-3">
                        <input
                          value={vR.ton}
                          onChange={(e) => setCell(pR, "ton", e.target.value)}
                          placeholder="ex: 239,4"
                          inputMode="decimal"
                          className="w-28 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          value={vR.freq}
                          onChange={(e) => setCell(pR, "freq", e.target.value)}
                          placeholder="ex: 92"
                          inputMode="decimal"
                          className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => saveDay(false)}
              disabled={loading}
              className="rounded-lg bg-emerald-500/90 px-3 py-2 text-sm font-extrabold text-black hover:bg-emerald-400 disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              onClick={() => loadDay(day)}
              disabled={loading}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
            >
              Recarregar
            </button>
          </div>
        </div>

        {/* rodapé */}
        <div className="mt-6 text-xs text-white/50">
          {payload?.updated_at ? `Última atualização: ${payload.updated_at}` : "Sem atualização ainda."}
        </div>
      </div>
    </div>
  );
}
