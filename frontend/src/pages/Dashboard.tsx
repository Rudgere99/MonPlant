import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
const META_DIA = 8000;
const LS_PREFIX = "monplant:plant-production:";
const LS_PARADAS = "monplant:paradas:v1";
const LS_HORIMETROS = "monplant:horimetros:v1";
const EQUIPAMENTOS = ["BT-01", "BT-02", "PN-01", "PN-02"] as const;

/* =========================
   TYPES
========================= */
type Turno = 1 | 2;

type PlantHourRow = {
  period: string;
  ton?: string | number | null;
};

type PlantDayPayload = {
  day: string;
  turno?: Turno;
  rows: PlantHourRow[];
};

type StopRow = {
  id: string;
  dataInicio: string;
  horaInicio: string;
  dataFim: string;
  horaFim: string;
  equipamento: string;
  tipoParada: string;
  atividade: string;
  descricao: string;
  tempoParadaH: number;
  createdAtISO: string;
};

type HorimetroRow = {
  id: string;
  day: string;
  turno: Turno;
  equipamento: string;
  horimetro: number;
  createdAtISO: string;
};

/* =========================
   HELPERS
========================= */
function isoTodayLocal(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, delta: number) {
  const dt = new Date(iso);
  dt.setDate(dt.getDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function brDayLabel(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function fmt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

function parseBRNumber(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(String(v).replace(".", "").replace(",", ".")) || 0;
}

function loadPlant(day: string, turno: Turno): PlantDayPayload | null {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${day}:T${turno}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function sumTon(p: PlantDayPayload | null) {
  if (!p?.rows) return 0;
  return p.rows.reduce((s, r) => s + Math.max(0, parseBRNumber(r.ton)), 0);
}

function totalDay(day: string) {
  return sumTon(loadPlant(day, 1)) + sumTon(loadPlant(day, 2));
}

function loadLS<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/* =========================
   UI – RADIAL
========================= */
function RadialProgress({ value, max }: { value: number; max: number }) {
  const pct = max <= 0 ? 0 : Math.min(1, value / max);
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = c * pct;

  return (
    <svg width="140" height="140">
      <circle cx="70" cy="70" r={r} stroke="rgba(255,255,255,.12)" strokeWidth="12" fill="none" />
      <circle
        cx="70"
        cy="70"
        r={r}
        stroke="#22c55e"
        strokeWidth="12"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform="rotate(-90 70 70)"
      />
      <text x="70" y="66" textAnchor="middle" fill="white" fontSize="18" fontWeight={900}>
        {Math.round(pct * 100)}%
      </text>
      <text x="70" y="86" textAnchor="middle" fill="rgba(255,255,255,.6)" fontSize="11">
        {fmt(value)} / {fmt(max)}
      </text>
    </svg>
  );
}

/* =========================
   DASHBOARD
========================= */
export default function Dashboard() {
  const nav = useNavigate();
  const today = isoTodayLocal();

  /* ===== BASE (SEU DASHBOARD) ===== */
  const todayTotal = useMemo(() => totalDay(today), [today]);

  const last7 = useMemo(() => {
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const day = addDaysISO(today, -i);
      arr.push({ label: brDayLabel(day), total: totalDay(day) });
    }
    return arr;
  }, [today]);

  /* ===== NOVOS DADOS ===== */
  const paradas = useMemo(() => loadLS<StopRow>(LS_PARADAS), []);
  const horimetros = useMemo(() => loadLS<HorimetroRow>(LS_HORIMETROS), []);

  const ultimaParada = useMemo(() => {
    return [...paradas].sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO))[0];
  }, [paradas]);

  const ultimoHorimetro = useMemo(() => {
    const map: Record<string, HorimetroRow | null> = {};
    EQUIPAMENTOS.forEach((e) => (map[e] = null));
    [...horimetros]
      .sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO))
      .forEach((h) => {
        if (!map[h.equipamento]) map[h.equipamento] = h;
      });
    return map;
  }, [horimetros]);

  const [ini, setIni] = useState(today);
  const [fim, setFim] = useState(today);

  const totalParadas = useMemo(() => {
    return paradas
      .filter((p) => p.dataInicio >= ini && p.dataInicio <= fim)
      .reduce((s, p) => s + p.tempoParadaH, 0);
  }, [paradas, ini, fim]);

  return (
    <div className="mp-container">
      <div className="mp-page-title">Dashboard</div>
      <div className="mp-page-sub">Visão geral da produção</div>

      {/* ===== CARDS ORIGINAIS ===== */}
      <div className="mp-grid" style={{ marginTop: 14 }}>
        {/* Produção do dia */}
        <button className="mp-card" onClick={() => nav("/dashboard/producao-dia")} style={{ padding: 0 }}>
          <div className="mp-card-h">
            <b>Produção do dia</b>
            <span className="mp-help">Meta {fmt(META_DIA)}</span>
          </div>
          <div className="mp-card-b" style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <RadialProgress value={todayTotal} max={META_DIA} />
            <div>
              <div style={{ fontSize: 26, fontWeight: 900 }}>{fmt(todayTotal)} t</div>
              <div className="mp-help">Acumulado do dia</div>
            </div>
          </div>
        </button>

        {/* Últimos 7 dias */}
        <button className="mp-card" onClick={() => nav("/dashboard/ultimos-7")} style={{ padding: 0 }}>
          <div className="mp-card-h">
            <b>Últimos 7 dias</b>
            <span className="mp-help">Total diário</span>
          </div>
          <div className="mp-card-b" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last7}>
                <CartesianGrid stroke="rgba(255,255,255,.08)" strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" fill="#22c55e" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </button>
      </div>

      {/* ===== NOVOS CARDS ===== */}
      <div
        style={{
          marginTop: 18,
          display: "grid",
          gap: 14,
          gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
        }}
      >
        {/* Última parada */}
        <button className="mp-card" onClick={() => nav("/paradas")} style={{ textAlign: "left" }}>
          <div className="mp-card-h"><b>Última parada</b></div>
          <div className="mp-card-b">
            {ultimaParada ? (
              <>
                <b>{ultimaParada.equipamento}</b> • {ultimaParada.tipoParada}
                <div className="mp-help">
                  {ultimaParada.dataInicio} {ultimaParada.horaInicio} → {ultimaParada.horaFim}
                </div>
                <div className="mp-help">{ultimaParada.tempoParadaH} h</div>
              </>
            ) : (
              <div className="mp-help">Sem registros</div>
            )}
          </div>
        </button>

        {/* Último horímetro */}
        <button className="mp-card" onClick={() => nav("/horimetros")} style={{ textAlign: "left" }}>
          <div className="mp-card-h"><b>Último horímetro</b></div>
          <div className="mp-card-b" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
            {EQUIPAMENTOS.map((e) => (
              <div key={e} className="mp-chip">
                {e}: {ultimoHorimetro[e]?.horimetro ?? "—"}
              </div>
            ))}
          </div>
        </button>

        {/* Total paradas */}
        <div className="mp-card">
          <div className="mp-card-h"><b>Total de paradas (h)</b></div>
          <div className="mp-card-b">
            <div style={{ display: "flex", gap: 8 }}>
              <input className="mp-input" type="date" value={ini} onChange={(e) => setIni(e.target.value)} />
              <input className="mp-input" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, marginTop: 10 }}>
              {totalParadas.toFixed(1)} h
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .mp-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }
        @media (min-width: 1024px) {
          .mp-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>
    </div>
  );
}
