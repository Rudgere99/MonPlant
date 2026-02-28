import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from "recharts";
import MobileShell from "./MobileShell";
import { apiGet } from "../utils/api";

type ProdRow = { label?: string; period?: string; value?: number; ton?: number; freq?: number };
type ProdDay = { rows?: ProdRow[]; meta_day?: number; meta_ton?: number; planned_ton?: number; total_day?: number; total?: number };
type GoalDay = { meta_ton?: number | null; discount_hours?: number | null };

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmt0(n: number) { return (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 }); }
function fmt1(n: number) { return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }

export default function MobileDashboard() {
  const [day, setDay] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [prod, setProd] = useState<ProdDay | null>(null);
  const [goal, setGoal] = useState<GoalDay | null>(null);
  const [last7, setLast7] = useState<Array<{ day: string; total: number }>>([]);

  const rows = useMemo(() => {
    const r = (prod?.rows || []) as any[];
    return r
      .filter((x) => x?.label || x?.period)
      .map((x) => ({
        hour: String(x.label ?? x.period),
        ton: Number(x.value ?? x.ton ?? 0) || 0,
        freq: Number(x.freq ?? 0) || 0,
      }));
  }, [prod]);

  const produced = useMemo(() => {
    if (typeof prod?.total_day === "number") return prod.total_day;
    if (typeof (prod as any)?.total === "number") return (prod as any).total;
    return rows.reduce((a, r) => a + (r.ton || 0), 0);
  }, [prod, rows]);

  const meta = useMemo(() => {
    const m = Number(prod?.meta_day ?? prod?.meta_ton ?? prod?.planned_ton ?? 0) || 0;
    const g = Number(goal?.meta_ton ?? 0) || 0;
    return m > 0 ? m : g;
  }, [prod, goal]);

  const pct = useMemo(() => (meta > 0 ? Math.min(100, (produced / meta) * 100) : 0), [produced, meta]);
  const freqAvg = useMemo(() => (rows.length ? rows.reduce((a, r) => a + (r.freq || 0), 0) / rows.length : 0), [rows]);

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const [p, g, l7] = await Promise.all([
        apiGet<ProdDay>(`/api/plant-production/${encodeURIComponent(day)}`).catch(() => null as any),
        apiGet<GoalDay>(`/api/goals/day/${encodeURIComponent(day)}`).catch(() => null as any),
        apiGet<any>(`/api/plant-production/last7days`).catch(() => [] as any),
      ]);
      setProd(p);
      setGoal(g);
      const items = Array.isArray(l7?.items) ? l7.items : Array.isArray(l7) ? l7 : [];
      setLast7(items.map((it: any) => ({ day: String(it.day || it.label || it.date), total: Number(it.total || it.value || 0) || 0 })));
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [day]);

  return (
    <MobileShell title="Dashboard" active="dashboard">
      <div className="mp-card" style={{ borderRadius: 18 }}>
        <div className="mp-card-h mp-card-h-mobile">
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label className="mp-small mp-muted">Data</label>
            <input className="mp-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ height: 42 }} />
          </div>
          <button className="mp-btn" onClick={load} disabled={busy} type="button">{busy ? "Carregando..." : "Atualizar"}</button>
        </div>

        {err ? <div style={{ marginTop: 10, color: "rgba(248,113,113,0.95)", fontWeight: 800 }}>{err}</div> : null}

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="mp-card" style={{ borderRadius: 16 }}>
            <div className="mp-muted mp-small">Produzido</div>
            <div style={{ fontSize: 24, fontWeight: 950, marginTop: 4 }}>{fmt0(produced)} t</div>
          </div>
          <div className="mp-card" style={{ borderRadius: 16 }}>
            <div className="mp-muted mp-small">Meta</div>
            <div style={{ fontSize: 24, fontWeight: 950, marginTop: 4 }}>{fmt0(meta)} t</div>
          </div>
          <div className="mp-card" style={{ borderRadius: 16 }}>
            <div className="mp-muted mp-small">% Atingimento</div>
            <div style={{ fontSize: 24, fontWeight: 950, marginTop: 4 }}>{fmt1(pct)}%</div>
          </div>
          <div className="mp-card" style={{ borderRadius: 16 }}>
            <div className="mp-muted mp-small">Freq média</div>
            <div style={{ fontSize: 24, fontWeight: 950, marginTop: 4 }}>{fmt1(freqAvg)}%</div>
          </div>
        </div>
      </div>

      <div className="mp-card" style={{ borderRadius: 18, marginTop: 12 }}>
        <div className="mp-card-h mp-card-h-mobile">
          <div style={{ fontWeight: 950 }}>Produção por hora (Ton/H)</div>
          <div className="mp-muted mp-small">{rows.length ? `${rows.length} pontos` : "Sem dados"}</div>
        </div>
        <div className="mp-chart-h-md" style={{ marginTop: 12 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows}>
              <defs>
                <linearGradient id="mTon" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(56,189,248,0.55)" />
                  <stop offset="100%" stopColor="rgba(56,189,248,0.06)" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(148,163,184,0.18)" strokeDasharray="3 3" />
              <XAxis dataKey="hour" tick={{ fill: "rgba(226,232,240,0.75)", fontSize: 12 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "rgba(226,232,240,0.75)", fontSize: 12 }} />
              <Tooltip contentStyle={{ background: "#0B1220", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 12 }} labelStyle={{ color: "rgba(226,232,240,0.95)" }} />
              <Area type="monotone" dataKey="ton" stroke="rgba(56,189,248,0.95)" fill="url(#mTon)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mp-card" style={{ borderRadius: 18, marginTop: 12 }}>
        <div className="mp-card-h mp-card-h-mobile">
          <div style={{ fontWeight: 950 }}>Últimos 7 dias</div>
        </div>
        <div className="mp-chart-h-sm" style={{ marginTop: 12 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last7}>
              <CartesianGrid stroke="rgba(148,163,184,0.18)" strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fill: "rgba(226,232,240,0.75)", fontSize: 12 }} />
              <YAxis tick={{ fill: "rgba(226,232,240,0.75)", fontSize: 12 }} />
              <Tooltip contentStyle={{ background: "#0B1220", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 12 }} labelStyle={{ color: "rgba(226,232,240,0.95)" }} />
              <Bar dataKey="total" fill="rgba(94,234,212,0.70)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </MobileShell>
  );
}
