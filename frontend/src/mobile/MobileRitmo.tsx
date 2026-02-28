import { useEffect, useMemo, useState } from "react";
import MobileShell from "./MobileShell";
import { apiFetch } from "../utils/api";

type HourRow = { period: string; ton: any; freq?: any };
type ApiPayload = { day: string; rows: HourRow[]; meta_ton?: any; meta?: any; meta_day?: any; planned_ton?: any };
type GoalDay = { day: string; meta_ton: any; discount_hours?: any };

const API_BASE = String((import.meta as any)?.env?.VITE_API_BASE || "http://127.0.0.1:8000").replace(/\/+$/, "");
const LS_BUCKET = "mp_bucket_ton_v1";

function authHeaders(): HeadersInit {
  const t = (localStorage.getItem("mp_token") || localStorage.getItem("token") || "").trim();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function isoTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function fmtBR(n: number, dec = 1) {
  return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtPct(n: number, dec = 1) {
  return `${(Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec })}%`;
}
function parseNum(v: any): number | null {
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
function normalizePeriodToHH(period: string): string {
  const s0 = String(period || "").trim();
  if (!s0) return s0;
  const s = s0.replace(/–|—/g, "-");
  const parts = s
    .split("-")
    .map((x) => x.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const h1m = parts[0].match(/^(\d{1,2})/);
    const h2m = parts[1].match(/^(\d{1,2})/);
    if (h1m && h2m) {
      const h1 = Math.max(0, Math.min(23, Number(h1m[1])));
      const h2 = Math.max(0, Math.min(23, Number(h2m[1])));
      return `${pad2(h1)}-${pad2(h2)}`;
    }
  }
  return s0;
}
function dayRemainingHours(now = new Date()) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const rem = Math.max(0, 1440 - mins);
  return rem / 60;
}
function dayElapsedHours(now = new Date()) {
  const mins = now.getHours() * 60 + now.getMinutes();
  return Math.max(0, mins / 60);
}

export default function MobileRitmo() {
  const [day, setDay] = useState<string>(isoTodayLocal());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [data, setData] = useState<ApiPayload | null>(null);
  const [goal, setGoal] = useState<GoalDay | null>(null);

  const [bucketTon, setBucketTon] = useState<string>(() => localStorage.getItem(LS_BUCKET) || "4,2");

  const FETCH_URL = useMemo(() => `${API_BASE}/api/plant-production/${encodeURIComponent(day)}`, [day]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(FETCH_URL, { headers: authHeaders() });
        if (r.status === 404) {
          setData({ day, rows: [], meta_ton: null });
          setGoal(null);
          return;
        }
        if (!r.ok) {
          const t = await r.text().catch(() => "");
          throw new Error(t || `HTTP ${r.status}`);
        }
        const j = (await r.json()) as ApiPayload;
        setData(j);

        try {
          const g = await apiFetch<GoalDay>(`/api/goals/day/${encodeURIComponent(day)}`);
          setGoal(g);
        } catch {
          setGoal(null);
        }
      } catch (e: any) {
        setErr(e?.message || "Erro ao carregar dados.");
      } finally {
        setLoading(false);
      }
    })();
  }, [FETCH_URL, day]);

  const bucket = useMemo(() => {
    const n = parseNum(bucketTon);
    return n && n > 0 ? n : null;
  }, [bucketTon]);

  useEffect(() => {
    if (bucket !== null) localStorage.setItem(LS_BUCKET, String(bucket).replace(".", ","));
  }, [bucket]);

  const rowsNorm = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of data?.rows || []) {
      const p = normalizePeriodToHH(r.period);
      const ton = parseNum((r as any).ton) ?? 0;
      map.set(p, (map.get(p) || 0) + ton);
    }
    return map;
  }, [data]);

  const metaDay = useMemo(() => {
    const v =
      (goal as any)?.meta_ton ??
      (data as any)?.meta_ton ??
      (data as any)?.meta ??
      (data as any)?.meta_day ??
      (data as any)?.planned_ton ??
      null;
    return v !== null && v !== undefined ? Number(v) : null;
  }, [goal, data]);

  const produced = useMemo(() => {
    let s = 0;
    rowsNorm.forEach((v) => (s += Number(v || 0)));
    return s;
  }, [rowsNorm]);

  const todayISO = isoTodayLocal();
  const isPastDay = day < todayISO;

  const filledPeriods = useMemo(() => {
    return Array.from(rowsNorm.entries())
      .filter(([, v]) => (Number(v) || 0) > 0)
      .map(([p]) => p)
      .sort();
  }, [rowsNorm]);

  const filledCount = filledPeriods.length;
  const isClosedDay = isPastDay || filledCount >= 24;
  const nowRef = isClosedDay ? new Date(`${day}T23:59:00`) : new Date();

  const lastFilledPeriod = useMemo(() => (filledPeriods.length ? filledPeriods[filledPeriods.length - 1] : ""), [filledPeriods]);

  const currH = nowRef.getHours();
  const endH = currH;
  const startH = (currH + 23) % 24;

  const currPeriod = isClosedDay ? lastFilledPeriod : `${pad2(startH)}-${pad2(endH)}`;
  const periodTon = currPeriod ? (rowsNorm.get(currPeriod) ?? 0) : 0;

  const remainingH = isClosedDay ? 0 : Math.max(0, dayRemainingHours(nowRef));
  const elapsedH = isClosedDay ? 24 : Math.max(0.25, dayElapsedHours(nowRef));

  const attainment = metaDay !== null && metaDay > 0 ? (produced / metaDay) * 100 : null;

  const neededTPH = useMemo(() => {
    if (metaDay === null) return null;
    const remaining = Math.max(0, metaDay - produced);
    if (remaining <= 0) return 0;
    if (remainingH <= 0) return null;
    return remaining / remainingH;
  }, [metaDay, produced, remainingH]);

  const neededBucketsH = useMemo(() => {
    if (neededTPH === null || bucket === null || bucket <= 0) return null;
    return neededTPH / bucket;
  }, [neededTPH, bucket]);

  const avgRealTPH = useMemo(() => {
    const filled = Array.from(rowsNorm.values()).filter((v) => (Number(v) || 0) > 0);
    if (!filled.length) return 0;
    const sum = filled.reduce((acc, v) => acc + (Number(v) || 0), 0);
    return sum / filled.length;
  }, [rowsNorm]);

  const avgRealBucketsH = bucket ? avgRealTPH / bucket : null;

  const projectionTon = useMemo(() => {
    if (isClosedDay) return produced;
    if (avgRealTPH <= 0) return produced;
    return produced + avgRealTPH * remainingH;
  }, [avgRealTPH, isClosedDay, produced, remainingH]);

  const projectedDiff = useMemo(() => {
    if (metaDay === null) return null;
    return projectionTon - metaDay;
  }, [projectionTon, metaDay]);

  const status = useMemo(() => {
    if (metaDay !== null && metaDay > 0 && produced >= metaDay) return { kind: "green" as const, title: "Meta atingida", subtitle: "Necessário = 0 t/h" };

    if (isClosedDay) {
      if (metaDay === null) return { kind: "yellow" as const, title: "Dia encerrado", subtitle: "Sem meta definida" };
      return produced >= metaDay
        ? { kind: "green" as const, title: "Dia encerrado", subtitle: "Meta atingida" }
        : { kind: "red" as const, title: "Dia encerrado", subtitle: "Meta não atingida" };
    }

    if (neededTPH === null) return { kind: "yellow" as const, title: "Sem cálculo", subtitle: "Meta não definida" };
    if (neededTPH <= 0) return { kind: "green" as const, title: "Meta garantida", subtitle: "Necessário = 0 t/h" };

    const ratio = avgRealTPH > 0 ? avgRealTPH / neededTPH : 0;
    if (ratio >= 1.05) return { kind: "green" as const, title: "Ritmo bom", subtitle: `Necessário: ${fmtBR(neededTPH, 1)} t/h` };
    if (ratio >= 0.85) return { kind: "yellow" as const, title: "Ritmo em atenção", subtitle: `Necessário: ${fmtBR(neededTPH, 1)} t/h` };
    return { kind: "red" as const, title: "Ritmo crítico", subtitle: `Necessário: ${fmtBR(neededTPH, 1)} t/h` };
  }, [avgRealTPH, isClosedDay, metaDay, neededTPH, produced]);

  const statusBg =
    status.kind === "green"
      ? "rgba(34,197,94,0.12)"
      : status.kind === "yellow"
      ? "rgba(250,204,21,0.12)"
      : "rgba(239,68,68,0.12)";

  const statusBorder =
    status.kind === "green"
      ? "rgba(34,197,94,0.22)"
      : status.kind === "yellow"
      ? "rgba(250,204,21,0.22)"
      : "rgba(239,68,68,0.22)";

  return (
    <MobileShell title="Ritmo" active="ritmo">
      <div className="mp-card" style={{ borderRadius: 18 }}>
        <div className="mp-card-h mp-card-h-mobile">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label className="mp-small mp-muted">Data</label>
            <input className="mp-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ height: 42 }} />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label className="mp-small mp-muted">t / Conchada</label>
            <input className="mp-input" value={bucketTon} onChange={(e) => setBucketTon(e.target.value)} inputMode="decimal" style={{ height: 42, width: 140 }} />
          </div>
        </div>

        {err ? <div style={{ marginTop: 10, color: "rgba(248,113,113,0.95)", fontWeight: 900 }}>{err}</div> : loading ? <div className="mp-muted" style={{ marginTop: 10 }}>Carregando...</div> : null}
      </div>

      <div className="mp-card" style={{ borderRadius: 18, marginTop: 12, background: statusBg, borderColor: statusBorder }}>
        <div style={{ fontWeight: 950, fontSize: 18 }}>{status.title}</div>
        <div className="mp-muted mp-small" style={{ marginTop: 6 }}>{status.subtitle}</div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="mp-card" style={{ borderRadius: 16 }}>
          <div className="mp-muted mp-small">Meta</div>
          <div style={{ fontSize: 20, fontWeight: 950, marginTop: 6 }}>{metaDay !== null ? `${fmtBR(metaDay, 1)} t` : "—"}</div>
        </div>

        <div className="mp-card" style={{ borderRadius: 16 }}>
          <div className="mp-muted mp-small">Produzido</div>
          <div style={{ fontSize: 20, fontWeight: 950, marginTop: 6 }}>{fmtBR(produced, 1)} t</div>
        </div>

        <div className="mp-card" style={{ borderRadius: 16 }}>
          <div className="mp-muted mp-small">Projeção</div>
          <div style={{ fontSize: 20, fontWeight: 950, marginTop: 6 }}>{fmtBR(projectionTon, 1)} t</div>
          {metaDay ? (
            <div className="mp-muted mp-small" style={{ marginTop: 6 }}>
              Desvio proj.:{" "}
              <b style={{ color: (projectedDiff ?? 0) >= 0 ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)" }}>
                {(projectedDiff ?? 0) >= 0 ? "+" : ""}
                {fmtBR(projectedDiff ?? 0, 1)} t
              </b>
            </div>
          ) : null}
        </div>

        <div className="mp-card" style={{ borderRadius: 16 }}>
          <div className="mp-muted mp-small">Atingimento</div>
          <div style={{ fontSize: 20, fontWeight: 950, marginTop: 6 }}>{attainment !== null ? fmtPct(attainment, 1) : "—"}</div>
        </div>

        <div className="mp-card" style={{ borderRadius: 16 }}>
          <div className="mp-muted mp-small">Ritmo necessário</div>
          <div style={{ fontSize: 18, fontWeight: 950, marginTop: 6 }}>{neededTPH !== null ? `${fmtBR(neededTPH, 1)} t/h` : "—"}</div>
          <div className="mp-muted mp-small" style={{ marginTop: 6 }}>{neededBucketsH !== null ? `${fmtBR(neededBucketsH, 1)} conch/h` : "—"}</div>
        </div>

        <div className="mp-card" style={{ borderRadius: 16 }}>
          <div className="mp-muted mp-small">Média real</div>
          <div style={{ fontSize: 18, fontWeight: 950, marginTop: 6 }}>{avgRealTPH > 0 ? `${fmtBR(avgRealTPH, 1)} t/h` : "0,0 t/h"}</div>
          <div className="mp-muted mp-small" style={{ marginTop: 6 }}>{avgRealBucketsH !== null ? `${fmtBR(avgRealBucketsH, 1)} conch/h` : "—"}</div>
        </div>

        <div className="mp-card" style={{ borderRadius: 16 }}>
          <div className="mp-muted mp-small">Tempo restante</div>
          <div style={{ fontSize: 18, fontWeight: 950, marginTop: 6 }}>{isClosedDay ? "0,0 h" : `${fmtBR(remainingH, 1)} h`}</div>
          <div className="mp-muted mp-small" style={{ marginTop: 6 }}>Decorrido: {fmtBR(elapsedH, 1)} h</div>
        </div>

        <div className="mp-card" style={{ borderRadius: 16 }}>
          <div className="mp-muted mp-small">Período atual</div>
          <div style={{ fontSize: 18, fontWeight: 950, marginTop: 6 }}>{currPeriod || "—"}</div>
          <div className="mp-muted mp-small" style={{ marginTop: 6 }}>{fmtBR(periodTon, 1)} t</div>
        </div>
      </div>

      <div className="mp-card" style={{ borderRadius: 18, marginTop: 12 }}>
        <div className="mp-card-h mp-card-h-mobile">
          <div style={{ fontWeight: 950 }}>Horas lançadas</div>
          <div className="mp-muted mp-small">{filledPeriods.length ? `${filledPeriods.length} horas` : "Sem horas"}</div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {filledPeriods
            .slice()
            .reverse()
            .slice(0, 12)
            .map((p) => (
              <div key={p} className="mp-card" style={{ borderRadius: 16, padding: 12, display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 900 }}>{p}</div>
                <div style={{ fontWeight: 950 }}>{fmtBR(rowsNorm.get(p) || 0, 1)} t</div>
              </div>
            ))}
          {!filledPeriods.length && !loading ? <div className="mp-muted">Sem dados para esta data.</div> : null}
        </div>
      </div>
    </MobileShell>
  );
}
