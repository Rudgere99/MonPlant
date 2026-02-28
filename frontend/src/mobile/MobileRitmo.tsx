import { useEffect, useMemo, useState } from "react";
import MobileShell from "./MobileShell";
import { apiGet } from "../utils/api";

type HourRow = { label?: string; period?: string; ton?: any; value?: any; freq?: any };
type ProdPayload = { rows?: HourRow[]; meta_day?: any; meta_ton?: any; planned_ton?: any; total_day?: any; total?: any };
type GoalDay = { meta_ton?: any; meta_day?: any; discount_hours?: any };

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function num(v: any) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().replace("%","").replace(/\s/g,"").replace(",",".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function fmt0(n: number) { return (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 }); }
function fmt1(n: number) { return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }

export default function MobileRitmo() {
  const [day, setDay] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [prod, setProd] = useState<ProdPayload | null>(null);
  const [goal, setGoal] = useState<GoalDay | null>(null);

  const rows = useMemo(() => {
    const r = (prod?.rows || []) as any[];
    return r
      .filter((x) => x?.label || x?.period)
      .map((x) => ({
        hour: String(x.label ?? x.period),
        ton: num(x.value ?? x.ton ?? 0),
        freq: num(x.freq ?? 0),
      }));
  }, [prod]);

  const produced = useMemo(() => {
    if (typeof prod?.total_day !== "undefined") return num(prod.total_day);
    if (typeof (prod as any)?.total !== "undefined") return num((prod as any).total);
    return rows.reduce((a, r) => a + (r.ton || 0), 0);
  }, [prod, rows]);

  const meta = useMemo(() => {
    const p = num(prod?.meta_day ?? prod?.meta_ton ?? prod?.planned_ton ?? 0);
    const g = num(goal?.meta_day ?? goal?.meta_ton ?? 0);
    return p > 0 ? p : g;
  }, [prod, goal]);

  const nowHour = new Date().getHours();
  const discountH = num(goal?.discount_hours ?? 0);
  const totalHoursDay = Math.max(0, 24 - discountH);
  const elapsed = Math.min(totalHoursDay, Math.max(0, nowHour + 1 - discountH));
  const remainingH = Math.max(0, totalHoursDay - elapsed);
  const remainingTon = Math.max(0, meta - produced);

  const avgRate = elapsed > 0 ? produced / elapsed : 0;
  const neededRate = remainingH > 0 ? remainingTon / remainingH : 0;

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const [p, g] = await Promise.all([
        apiGet<ProdPayload>(`/api/plant-production/${encodeURIComponent(day)}`),
        apiGet<GoalDay>(`/api/goals/day/${encodeURIComponent(day)}`).catch(() => null as any),
      ]);
      setProd(p);
      setGoal(g);
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar.");
      setProd(null);
      setGoal(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [day]);

  return (
    <MobileShell title="Ritmo" active="ritmo">
      <div className="mp-card" style={{ borderRadius: 18 }}>
        <div className="mp-card-h mp-card-h-mobile">
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label className="mp-small mp-muted">Data</label>
            <input className="mp-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ height: 42 }} />
          </div>
          <button className="mp-btn" onClick={load} disabled={busy} type="button">{busy ? "Carregando..." : "Atualizar"}</button>
        </div>

        {err ? <div style={{ marginTop: 10, color: "rgba(248,113,113,0.95)", fontWeight: 900 }}>{err}</div> : null}

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
            <div className="mp-muted mp-small">Média atual</div>
            <div style={{ fontSize: 22, fontWeight: 950, marginTop: 6 }}>{fmt1(avgRate)} t/h</div>
          </div>
          <div className="mp-card" style={{ borderRadius: 16 }}>
            <div className="mp-muted mp-small">Ritmo necessário</div>
            <div style={{ fontSize: 22, fontWeight: 950, marginTop: 6 }}>{fmt1(neededRate)} t/h</div>
          </div>
        </div>
      </div>

      <div className="mp-card" style={{ borderRadius: 18, marginTop: 12 }}>
        <div className="mp-card-h mp-card-h-mobile">
          <div style={{ fontWeight: 950 }}>Horas do dia</div>
          <div className="mp-muted mp-small">{rows.length ? `${rows.length} linhas` : "Sem linhas"}</div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {rows.map((r) => (
            <div key={r.hour} className="mp-card" style={{ borderRadius: 16, padding: 12, display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontWeight: 900 }}>{r.hour}</div>
              <div style={{ textAlign: "right" }}>
                <div><b>{fmt1(r.ton)}</b> t</div>
                <div className="mp-muted mp-small">{fmt1(r.freq)}%</div>
              </div>
            </div>
          ))}
          {!rows.length && !busy ? <div className="mp-muted">Sem dados para esta data.</div> : null}
        </div>
      </div>
    </MobileShell>
  );
}
