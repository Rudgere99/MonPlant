import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

/* =========================
   CONFIG
========================= */
const META_DIA = 8000; // ajuste se quiser
const POLL_MS = 10_000;

/* =========================
   HELPERS
========================= */
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
function fmtBR0(n: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}

function safeNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function dayLabel(iso: string) {
  // "2026-01-06" -> "06/01"
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}`;
}

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

function authHeaders(): HeadersInit {
  const keys = ["mp_token", "token", "access_token", "auth_token"];
  let t = "";
  for (const k of keys) {
    const v = (localStorage.getItem(k) || "").trim();
    if (v) { t = v; break; }
  }
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/* =========================
   TYPES
========================= */
type PlantRow = { period: string; ton?: number | null; freq?: number | null };
type PlantDayResp = { day: string; obs?: string | null; rows: PlantRow[]; updated_at?: string | null };

type Last7Item = { day: string; total_ton: number };

type LastStop = {
  id: number;
  equipamento: string;
  tipo_parada: string;
  atividade: string;
  tempo_parada_h: number;
  created_at?: string | null;
} | null;

type TotalStopsResp = { day: string; total_h: number };

type HoriLast = {
  equipamento: string;
  horimetro: number;
  day: string;
  turno: number;
  created_at?: string | null;
};

/* =========================
   UI: Donut
========================= */
function Donut({
  value,
  max,
  labelTop,
  labelBottom,
}: {
  value: number;
  max: number;
  labelTop: string;
  labelBottom: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const size = 170;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;

  return (
    <div style={{ display: "grid", placeItems: "center" }}>
      <svg width={size} height={size} style={{ overflow: "visible" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(34,197,94,0.95)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(255,255,255,0.92)"
          fontSize="22"
          fontWeight="900"
          style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.70)", strokeWidth: 3 }}
        >
          {fmtBR0(value)}
        </text>
        <text
          x="50%"
          y="62%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(255,255,255,0.70)"
          fontSize="12"
          fontWeight="800"
        >
          {labelBottom}
        </text>
      </svg>

      <div style={{ marginTop: 6, textAlign: "center" }}>
        <div style={{ color: "rgba(255,255,255,0.80)", fontWeight: 800 }}>{labelTop}</div>
        <div style={{ color: "rgba(255,255,255,0.55)", fontWeight: 700, fontSize: 12 }}>
          Meta: {fmtBR0(max)}
        </div>
      </div>
    </div>
  );
}

/* =========================
   PAGE
========================= */
export default function Dashboard() {
  const [day, setDay] = useState<string>(isoTodayLocal());

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [plant, setPlant] = useState<PlantDayResp | null>(null);
  const [last7, setLast7] = useState<Last7Item[]>([]);
  const [lastStop, setLastStop] = useState<LastStop>(null);
  const [totalStops, setTotalStops] = useState<TotalStopsResp | null>(null);
  const [horis, setHoris] = useState<HoriLast[]>([]);

  const timerRef = useRef<number | null>(null);

  const plantTotal = useMemo(() => {
    if (!plant?.rows?.length) return 0;
    return plant.rows.reduce((acc, r) => acc + safeNumber(r.ton ?? 0), 0);
  }, [plant]);

  async function apiGet<T>(path: string): Promise<T> {
    const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
    if (r.status === 404) throw Object.assign(new Error("404"), { code: 404 });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(t || `HTTP ${r.status}`);
    }
    return (await r.json()) as T;
  }

  async function loadAll() {
    setLoading(true);
    setErr(null);

    try {
      // 1) Produção do dia selecionado (pra donut)
      const plantResp = await apiGet<PlantDayResp>(`/api/plant-production/${encodeURIComponent(day)}`).catch((e: any) => {
        if (e?.code === 404) return null;
        throw e;
      });
      setPlant(plantResp);

      // 2) Últimos 7 dias (sempre do owner)
      const last7Resp = await apiGet<Last7Item[]>(`/api/plant-production/last7days`).catch(() => []);
      setLast7(Array.isArray(last7Resp) ? last7Resp : []);

      // 3) Paradas: última e total por dia selecionado
      const [ls, tot] = await Promise.all([
        apiGet<LastStop>(`/api/stops/last?day=${encodeURIComponent(day)}`).catch(() => null),
        apiGet<TotalStopsResp>(`/api/stops/total?day=${encodeURIComponent(day)}`).catch(() => ({ day, total_h: 0 })),
      ]);
      setLastStop(ls);
      setTotalStops(tot);

      // 4) Horímetros: último por equipamento
      const h = await apiGet<HoriLast[]>(`/api/horimetros/last-by-eq`).catch(() => []);
      setHoris(Array.isArray(h) ? h : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar Dashboard");
    } finally {
      setLoading(false);
    }
  }

  // Carrega ao abrir e ao trocar dia
  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  // Polling 10s (tempo real) — recarrega tudo
  useEffect(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      loadAll();
    }, POLL_MS);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const last7Chart = useMemo(() => {
    return last7.map((x) => ({
      day: dayLabel(x.day),
      total: safeNumber(x.total_ton),
    }));
  }, [last7]);

  return (
    <div className="mp-container">
      <div className="mp-page-title">Dashboard</div>
      <div className="mp-page-sub">Visão geral • Atualiza a cada 10s</div>

      {/* barra superior */}
      <div className="mp-card" style={{ marginTop: 12 }}>
        <div className="mp-card-h" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <b>Resumo Operacional</b>
            <div className="mp-help">
              {loading ? "Carregando..." : err ? `Erro: ${err}` : "—"}
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

          <button className="mp-btn" onClick={loadAll} disabled={loading} style={{ minWidth: 140 }}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        <div className="mp-card-b">
          {/* grid principal */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "420px 1fr",
              gap: 12,
              alignItems: "stretch",
            }}
          >
            {/* donut + cards */}
            <div className="mp-card" style={{ margin: 0 }}>
              <div className="mp-card-h">
                <b>Produção do dia</b>
                <div className="mp-help">Soma de Ton/H do dia selecionado</div>
              </div>
              <div className="mp-card-b" style={{ display: "grid", gap: 12 }}>
                <Donut
                  value={plantTotal}
                  max={META_DIA}
                  labelTop="Produção (Ton)"
                  labelBottom={`${fmtBR0(Math.round((META_DIA > 0 ? (plantTotal / META_DIA) : 0) * 100))}%`}
                />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr",
                    gap: 10,
                  }}
                >
                  <div className="mp-card" style={{ margin: 0 }}>
                    <div className="mp-card-h" style={{ padding: "10px 12px" }}>
                      <b>Última parada</b>
                      <div className="mp-help">Dia selecionado</div>
                    </div>
                    <div className="mp-card-b" style={{ padding: 12 }}>
                      {lastStop ? (
                        <div style={{ display: "grid", gap: 6 }}>
                          <div style={{ color: "rgba(255,255,255,0.88)", fontWeight: 900 }}>
                            {lastStop.equipamento} • {lastStop.tipo_parada}
                          </div>
                          <div style={{ color: "rgba(255,255,255,0.70)", fontWeight: 700 }}>
                            {lastStop.atividade}
                          </div>
                          <div style={{ color: "rgba(255,255,255,0.62)", fontWeight: 800 }}>
                            Tempo: <b>{fmtBR(lastStop.tempo_parada_h)}</b> h
                          </div>
                        </div>
                      ) : (
                        <div className="mp-help">Sem paradas registradas.</div>
                      )}
                    </div>
                  </div>

                  <div className="mp-card" style={{ margin: 0 }}>
                    <div className="mp-card-h" style={{ padding: "10px 12px" }}>
                      <b>Total de paradas</b>
                      <div className="mp-help">Soma (horas) no dia selecionado</div>
                    </div>
                    <div className="mp-card-b" style={{ padding: 12 }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>
                        {fmtBR(totalStops?.total_h ?? 0)} h
                      </div>
                      <div className="mp-help">Atualiza junto com o polling</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* últimos 7 dias + horímetros */}
            <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 12 }}>
              <div className="mp-card" style={{ margin: 0 }}>
                <div className="mp-card-h">
                  <b>Últimos 7 dias</b>
                  <div className="mp-help">Total Ton por dia</div>
                </div>

                <div className="mp-card-b" style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={last7Chart} margin={{ top: 18, right: 18, bottom: 18, left: 6 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="day"
                        tick={{ fill: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: 800 }}
                        axisLine={{ stroke: "rgba(255,255,255,0.10)" }}
                        tickLine={{ stroke: "rgba(255,255,255,0.10)" }}
                      />
                      <YAxis
                        tick={{ fill: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: 800 }}
                        axisLine={{ stroke: "rgba(255,255,255,0.10)" }}
                        tickLine={{ stroke: "rgba(255,255,255,0.10)" }}
                      />
                      <Tooltip
                        formatter={(value: any) => fmtBR0(safeNumber(value))}
                        contentStyle={{
                          background: "rgba(0,0,0,0.85)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 12,
                        }}
                        labelStyle={{ color: "rgba(255,255,255,0.85)" }}
                      />
                      <Bar dataKey="total" name="Total (Ton)" fill="#22c55e" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="mp-card" style={{ margin: 0 }}>
                <div className="mp-card-h">
                  <b>Horímetros</b>
                  <div className="mp-help">Último lançamento por equipamento</div>
                </div>

                <div className="mp-card-b">
                  {horis.length ? (
                    <div style={{ overflowX: "auto" }}>
                      <table className="mp-table" style={{ width: "100%", minWidth: 560 }}>
                        <thead>
                          <tr>
                            <th>Equipamento</th>
                            <th>Horímetro</th>
                            <th>Dia</th>
                            <th>Turno</th>
                          </tr>
                        </thead>
                        <tbody>
                          {horis.map((h) => (
                            <tr key={h.equipamento}>
                              <td style={{ fontWeight: 900, color: "rgba(255,255,255,0.86)" }}>{h.equipamento}</td>
                              <td>{fmtBR(h.horimetro)}</td>
                              <td>{dayLabel(h.day)}</td>
                              <td>{h.turno}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="mp-help">Sem horímetros registrados ainda.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div style={{ height: 6 }} />
        </div>
      </div>
    </div>
  );
}
