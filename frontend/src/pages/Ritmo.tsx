import React, { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";

/**
 * Ritmo — Operacional Refinado
 * - Mantém simplicidade e foco operacional
 * - Adiciona: Projeção do dia, Status (semáforo), Barra de progresso, Dia encerrado automático,
 *            padronização de casas decimais e proteção contra "tempo restante negativo".
 *
 * Endpoint:
 *   GET /api/plant-production/{day}  -> { day, rows:[{period, ton, freq}], meta_ton? }
 *   GET /api/goals/day/{day}         -> { day, meta_ton, discount_hours? }
 */

type HourRow = {
  period: string; // "16:00-17:00" ou "16-17"
  ton?: number | string | null;
  freq?: number | string | null;
};

type GoalDay = {
  day: string;
  meta_ton: number | null;
  discount_hours?: number | null;
  updated_at?: string | null;
};

type ApiPayload = {
  day: string;
  meta_ton?: number | null;
  meta?: number | null;
  meta_day?: number | null;
  planned_ton?: number | null;
  rows: HourRow[];
  updated_at?: string | null;
};

const API_BASE = String((import.meta as any)?.env?.VITE_API_BASE || "http://127.0.0.1:8000").replace(/\/+$/, "");

function authHeaders(): HeadersInit {
  const t = (localStorage.getItem("mp_token") || localStorage.getItem("token") || "").trim();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  return (await r.json()) as T;
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
  return (Number(n) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fmtBR0(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function fmtPct(n: number, dec = 1) {
  return `${(Number(n) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })}%`;
}

function parseNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  let s = String(v).trim();
  if (!s) return null;
  s = s.replace("%", "").trim();
  s = s.replace(/\s/g, "");

  // "1.234,5" => "1234.5"
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** normaliza "16:00-17:00" | "16-17" -> "16-17" */
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

const LS_BUCKET = "mp_bucket_ton_v1";

const card: React.CSSProperties = {
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(14,18,22,0.78)",
  padding: 16,
};

const label: React.CSSProperties = {
  color: "rgba(255,255,255,0.55)",
  fontWeight: 900,
  fontSize: 12,
  letterSpacing: 0.2,
  textTransform: "uppercase",
};

const input: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.92)",
  padding: "10px 12px",
  outline: "none",
  fontWeight: 900,
};

const btn: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.92)",
  padding: "10px 12px",
  fontWeight: 950,
  cursor: "pointer",
  outline: "none",
  whiteSpace: "nowrap",
};

const heroGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  gap: 12,
};

function HeroKPI(props: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  colSpan?: number;
  accent?: "green" | "yellow" | "red" | "neutral";
}) {
  const { title, value, sub, colSpan = 4, accent = "neutral" } = props;
  const accentMap: Record<string, string> = {
    green: "rgba(34,197,94,0.95)",
    yellow: "rgba(250,204,21,0.95)",
    red: "rgba(239,68,68,0.95)",
    neutral: "rgba(255,255,255,0.12)",
  };

  return (
    <div
      style={{
        ...card,
        gridColumn: `span ${colSpan}`,
        borderColor: accent === "neutral" ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.14)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            accent === "neutral"
              ? "transparent"
              : `radial-gradient(900px 260px at 10% 10%, ${accentMap[accent]}33, transparent 60%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        <div style={label}>{title}</div>
        <div style={{ color: "rgba(255,255,255,0.94)", fontWeight: 980, fontSize: 28, marginTop: 6 }}>{value}</div>
        {sub ? <div style={{ color: "rgba(255,255,255,0.70)", fontWeight: 900, marginTop: 2 }}>{sub}</div> : null}
      </div>
    </div>
  );
}

function StatusBadge(props: { kind: "green" | "yellow" | "red"; title: string; subtitle?: string }) {
  const map = {
    green: { bg: "rgba(34,197,94,0.16)", bd: "rgba(34,197,94,0.35)", fg: "rgba(34,197,94,0.95)" },
    yellow: { bg: "rgba(250,204,21,0.14)", bd: "rgba(250,204,21,0.32)", fg: "rgba(250,204,21,0.95)" },
    red: { bg: "rgba(239,68,68,0.14)", bd: "rgba(239,68,68,0.32)", fg: "rgba(239,68,68,0.95)" },
  }[props.kind];

  return (
    <div
      style={{
        borderRadius: 18,
        border: `1px solid ${map.bd}`,
        background: map.bg,
        padding: "10px 12px",
        display: "flex",
        gap: 10,
        alignItems: "center",
      }}
    >
      <div style={{ width: 14, height: 14, borderRadius: 99, background: map.fg, boxShadow: `0 0 0 6px ${map.bg}` }} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ color: "rgba(255,255,255,0.94)", fontWeight: 980, fontSize: 14 }}>{props.title}</div>
        {props.subtitle ? (
          <div style={{ color: "rgba(255,255,255,0.70)", fontWeight: 900, fontSize: 12 }}>{props.subtitle}</div>
        ) : null}
      </div>
    </div>
  );
}

const exportMiniCard: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(14,18,22,0.92)",
  padding: 12,
  lineHeight: 1.45,
  display: "inline-block",
  width: "fit-content",
  maxWidth: 640,
  boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
};

const exportLine: React.CSSProperties = {
  color: "rgba(255,255,255,0.92)",
  fontWeight: 900,
  fontSize: 13,
};

const exportSep: React.CSSProperties = {
  height: 1,
  background: "rgba(255,255,255,0.10)",
  margin: "8px 0",
};

export default function Ritmo() {
  const [day, setDay] = useState<string>(isoTodayLocal());

  // ✅ somente esse é exportado
  const exportCompactRef = useRef<HTMLDivElement | null>(null);

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
          const g = await apiGet<GoalDay>(`/api/goals/day/${encodeURIComponent(day)}`);
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
      const ton = parseNum(r.ton) ?? 0;
      map.set(p, (map.get(p) || 0) + ton);
    }
    return map;
  }, [data]);

  const metaDayRaw = useMemo(() => {
    const v = goal?.meta_ton ?? data?.meta_ton ?? data?.meta ?? data?.meta_day ?? data?.planned_ton ?? null;
    return v !== null && v !== undefined ? Number(v) : null;
  }, [goal, data]);

  // ✅ Futuro: aqui dá pra aplicar "meta ajustada por paradas" (discount_hours) se você quiser.
  const metaDay = metaDayRaw;

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

  // ✅ dia encerrado automático:
  // - dia passado
  // - ou "todas as horas preenchidas" (24 períodos com valor)
  const isClosedDay = isPastDay || filledCount >= 24;

  // para cálculos de tempo do "dia aberto"
  const nowRef = isClosedDay ? new Date(`${day}T23:59:00`) : new Date();

  // período atual (dia aberto) ou último período com dado (dia fechado)
  const lastFilledPeriod = useMemo(() => {
    return filledPeriods.length ? filledPeriods[filledPeriods.length - 1] : "";
  }, [filledPeriods]);

  const currH = nowRef.getHours();
  const endH = currH;
  const startH = (currH + 23) % 24;

  const currPeriod = isClosedDay ? lastFilledPeriod : `${pad2(startH)}-${pad2(endH)}`;
  const periodTon = currPeriod ? (rowsNorm.get(currPeriod) ?? 0) : 0;

  // ✅ evita negativo
  const remainingH = isClosedDay ? 0 : Math.max(0, dayRemainingHours(nowRef));
  const elapsedH = isClosedDay ? 24 : Math.max(0.25, dayElapsedHours(nowRef));

  const diff = metaDay !== null ? produced - metaDay : null;
  const attainment = metaDay !== null && metaDay > 0 ? (produced / metaDay) * 100 : null;

  const neededTPH = useMemo(() => {
    if (metaDay === null) return null;

    // meta atingida => 0
    const remaining = Math.max(0, metaDay - produced);
    if (remaining <= 0) return 0;

    if (remainingH <= 0) return null; // não tem tempo e falta meta: "indefinido"
    return remaining / remainingH;
  }, [metaDay, produced, remainingH]);

  const neededBucketsH = useMemo(() => {
    if (neededTPH === null || bucket === null || bucket <= 0) return null;
    return neededTPH / bucket;
  }, [neededTPH, bucket]);

  // ✅ Média real igual ao seu dashboard: média das horas preenchidas (ton/h > 0)
  const avgRealTPH = useMemo(() => {
    const filled = Array.from(rowsNorm.values()).filter((v) => (Number(v) || 0) > 0);
    if (!filled.length) return 0;
    const sum = filled.reduce((acc, v) => acc + (Number(v) || 0), 0);
    return sum / filled.length;
  }, [rowsNorm]);

  const avgRealBucketsH = bucket ? avgRealTPH / bucket : null;

  // ✅ Projeção do dia (como você pediu): média_real * horas_totais_do_turno (dia)
  const projectionTon = useMemo(() => {
    if (isClosedDay) return produced;
    if (avgRealTPH <= 0) return 0;
    return avgRealTPH * 24;
  }, [avgRealTPH, isClosedDay, produced]);

  const projectedDiff = useMemo(() => {
    if (metaDay === null) return null;
    return projectionTon - metaDay;
  }, [projectionTon, metaDay]);

  // ✅ Semáforo — compara média real x necessário
  const status = useMemo(() => {
    if (metaDay !== null && metaDay > 0 && produced >= metaDay) {
      return { kind: "green" as const, title: "Meta atingida", subtitle: "Necessário = 0 t/h" };
    }

    if (isClosedDay) {
      if (metaDay === null) return { kind: "yellow" as const, title: "Dia encerrado", subtitle: "Sem meta definida" };
      return produced >= metaDay
        ? { kind: "green" as const, title: "Dia encerrado", subtitle: "Meta atingida" }
        : { kind: "red" as const, title: "Dia encerrado", subtitle: "Meta não atingida" };
    }

    if (neededTPH === null) return { kind: "yellow" as const, title: "Sem cálculo", subtitle: "Meta ou tempo inválido" };
    if (neededTPH === 0) return { kind: "green" as const, title: "Dentro do ritmo", subtitle: "Meta já foi batida" };

    if (avgRealTPH >= neededTPH) return { kind: "green" as const, title: "Dentro do ritmo", subtitle: "Média ≥ Necessário" };
    if (avgRealTPH >= neededTPH * 0.9) return { kind: "yellow" as const, title: "Atenção", subtitle: "Abaixo do necessário" };
    return { kind: "red" as const, title: "Crítico", subtitle: "Fora da meta" };
  }, [avgRealTPH, isClosedDay, metaDay, neededTPH, produced]);

  // padronização de casas decimais
  const dTon = 1;
  const dTPH = 1;
  const dPct = 1;

  const [yy, mm, dd] = day.split("-");
  const dayBR = `${dd}/${mm}/${yy}`;

  async function exportResumoJPEG() {
    const el = exportCompactRef.current;
    if (!el) return;

    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    // @ts-ignore
    if (document.fonts?.ready) {
      try {
        // @ts-ignore
        await document.fonts.ready;
      } catch {}
    }

    const rect = el.getBoundingClientRect();
    const EXTRA = 8;

    const w = Math.ceil(rect.width + EXTRA);
    const h = Math.ceil(rect.height + EXTRA);

    const canvas = await html2canvas(el, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      width: w,
      height: h,
      windowWidth: w,
      windowHeight: h,
      scrollX: 0,
      scrollY: 0,
    });

    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `ritmo_resumo_${day}.jpg`;
    a.click();
  }

  const progressPct = metaDay && metaDay > 0 ? Math.max(0, Math.min(100, (produced / metaDay) * 100)) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Topo */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 980, fontSize: 20 }}>Ritmo do dia</div>
            <div style={{ color: "rgba(255,255,255,0.65)", fontWeight: 900, fontSize: 13 }}>
              Dia: <span style={{ color: "rgba(255,255,255,0.92)" }}>{dayBR}</span>{" "}
              <span style={{ opacity: 0.55 }}>•</span>{" "}
              <span style={{ opacity: 0.85 }}>{isClosedDay ? "Período encerrado" : "Dia em andamento"}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={label}>Data</span>
              <input style={{ ...input, minWidth: 170 }} type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={label}>t / Conchada</span>
              <input
                style={{ ...input, minWidth: 140 }}
                value={bucketTon}
                onChange={(e) => setBucketTon(e.target.value)}
                inputMode="decimal"
                placeholder="4,2"
                title="Tonelada por conchada (aprox.)"
              />
            </label>

            <button style={btn} onClick={exportResumoJPEG} title="Exporta apenas o resumo compacto">
              Exportar resumo (JPG)
            </button>
          </div>
        </div>

        {err ? (
          <div style={{ marginTop: 10, color: "rgba(239,68,68,0.95)", fontWeight: 900 }}>{err}</div>
        ) : loading ? (
          <div style={{ marginTop: 10, color: "rgba(255,255,255,0.70)", fontWeight: 900 }}>Carregando…</div>
        ) : null}
      </div>

      {/* HERO KPIs (6 cards) */}
      <div style={heroGrid}>
        <HeroKPI
          title="Meta"
          value={metaDay !== null ? `${fmtBR(metaDay, dTon)} t` : "—"}
          colSpan={4}
          accent="neutral"
          sub={goal?.updated_at ? <span style={{ opacity: 0.8 }}>Atualizada</span> : undefined}
        />
        <HeroKPI title="Produzido" value={`${fmtBR(produced, dTon)} t`} colSpan={4} accent="neutral" />
        <HeroKPI
          title="Atingimento"
          value={attainment !== null ? fmtPct(attainment, dPct) : "—"}
          colSpan={4}
          accent={status.kind === "green" ? "green" : status.kind === "yellow" ? "yellow" : "red"}
        />

        <HeroKPI
          title="Diferença"
          value={diff !== null ? `${diff >= 0 ? "+" : ""}${fmtBR(diff, dTon)} t` : "—"}
          colSpan={3}
          accent={diff !== null && diff >= 0 ? "green" : diff !== null ? "red" : "neutral"}
        />
        <HeroKPI
          title="Projeção do dia"
          value={`${fmtBR(projectionTon, dTon)} t`}
          colSpan={3}
          accent={metaDay !== null && projectionTon >= metaDay ? "green" : metaDay !== null ? "red" : "neutral"}
          sub={metaDay !== null ? (
            <span>
              Desvio proj.:{" "}
              <b style={{ color: projectedDiff !== null && projectedDiff >= 0 ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)" }}>
                {projectedDiff !== null ? `${projectedDiff >= 0 ? "+" : ""}${fmtBR(projectedDiff, dTon)} t` : "—"}
              </b>
            </span>
          ) : undefined}
        />
        <div style={{ gridColumn: "span 6", ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={label}>Status</div>
              <StatusBadge kind={status.kind} title={status.title} subtitle={status.subtitle} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
              <div style={label}>Tempo restante</div>
              <div style={{ color: "rgba(255,255,255,0.94)", fontWeight: 980, fontSize: 26 }}>
                {isClosedDay ? "0h" : `${fmtBR(remainingH, 1)}h`}
              </div>
              <div style={{ color: "rgba(255,255,255,0.70)", fontWeight: 900, fontSize: 12 }}>
                {isClosedDay ? "Período encerrado" : "até 00:00"}
              </div>
            </div>
          </div>

          {/* Barra de progresso */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={label}>Progresso da meta</div>
              <div style={{ color: "rgba(255,255,255,0.85)", fontWeight: 950 }}>
                {metaDay ? fmtPct(progressPct, 1) : "—"}
              </div>
            </div>
            <div style={{ height: 14, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <div
                style={{
                  width: `${progressPct}%`,
                  height: "100%",
                  borderRadius: 99,
                  background:
                    progressPct >= 100
                      ? "rgba(34,197,94,0.95)"
                      : status.kind === "green"
                      ? "rgba(34,197,94,0.85)"
                      : status.kind === "yellow"
                      ? "rgba(250,204,21,0.85)"
                      : "rgba(239,68,68,0.85)",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Ritmo (necessário vs média real) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 12 }}>
        <div style={{ gridColumn: "span 7", ...card }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 980, fontSize: 16 }}>Período atual</div>
              <div style={{ color: "rgba(255,255,255,0.65)", fontWeight: 900, fontSize: 13 }}>
                {currPeriod ? (
                  <>
                    <span style={{ opacity: 0.8 }}>{currPeriod.replace("-", "h às ")}</span>h • Produção:{" "}
                    <b style={{ color: "rgba(255,255,255,0.94)" }}>{fmtBR(periodTon, dTon)} t</b>
                  </>
                ) : (
                  "—"
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <div style={label}>⚙ Conchadas / h</div>
                <div style={{ color: "rgba(255,255,255,0.94)", fontWeight: 980, fontSize: 22 }}>
                  {avgRealBucketsH !== null ? fmtBR0(avgRealBucketsH) : "—"}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <div style={label}>📦 t / h</div>
                <div style={{ color: "rgba(255,255,255,0.94)", fontWeight: 980, fontSize: 22 }}>{fmtBR(avgRealTPH, dTPH)}</div>
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "12px 0" }} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 12 }}>
            <div style={{ gridColumn: "span 6", ...card, background: "rgba(255,255,255,0.03)" }}>
              <div style={label}>Necessário</div>
              <div style={{ color: "rgba(255,255,255,0.94)", fontWeight: 980, fontSize: 28, marginTop: 6 }}>
                {neededTPH === null ? "—" : `${fmtBR(neededTPH, dTPH)} t/h`}
              </div>
              <div style={{ color: "rgba(255,255,255,0.70)", fontWeight: 900, marginTop: 2 }}>
                {neededBucketsH === null ? "—" : `≈ ${fmtBR0(neededBucketsH)} conchadas/h`}
              </div>
            </div>

            <div style={{ gridColumn: "span 6", ...card, background: "rgba(255,255,255,0.03)" }}>
              <div style={label}>Média real</div>
              <div style={{ color: "rgba(255,255,255,0.94)", fontWeight: 980, fontSize: 28, marginTop: 6 }}>
                {`${fmtBR(avgRealTPH, dTPH)} t/h`}
              </div>
              <div style={{ color: "rgba(255,255,255,0.70)", fontWeight: 900, marginTop: 2 }}>
                {avgRealBucketsH === null ? "—" : `≈ ${fmtBR0(avgRealBucketsH)} conchadas/h`}
              </div>
            </div>
          </div>
        </div>

        {/* Resumo compacto exportável */}
        <div style={{ gridColumn: "span 5", ...card }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 980, fontSize: 16 }}>Resumo</div>
            <div style={{ color: "rgba(255,255,255,0.65)", fontWeight: 900, fontSize: 13 }}>{dayBR}</div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div ref={exportCompactRef} style={exportMiniCard}>
              <div style={exportLine}>
                Meta: <b>{metaDay !== null ? `${fmtBR(metaDay, dTon)} t` : "—"}</b>
              </div>
              <div style={exportLine}>
                Produzido: <b>{`${fmtBR(produced, dTon)} t`}</b>
              </div>
              <div style={exportLine}>
                Atingimento: <b>{attainment !== null ? fmtPct(attainment, dPct) : "—"}</b>
              </div>
              <div style={exportLine}>
                Diferença: <b>{diff !== null ? `${diff >= 0 ? "+" : ""}${fmtBR(diff, dTon)} t` : "—"}</b>
              </div>

              <div style={exportSep} />

              <div style={exportLine}>
                Tempo restante: <b>{isClosedDay ? "0h" : `${fmtBR(remainingH, 1)} h`}</b>
              </div>

              <div style={exportLine}>
                Período: <b>{currPeriod ? currPeriod.replace("-", "h às ") + "h" : "—"}</b>
              </div>
              <div style={exportLine}>
                Produção do período: <b>{`${fmtBR(periodTon, dTon)} t`}</b>
              </div>

              <div style={exportSep} />

              <div style={exportLine}>
                Projeção do dia: <b>{`${fmtBR(projectionTon, dTon)} t`}</b>
              </div>

              <div style={exportLine}>
                Necessário: <b>{neededTPH === null ? "—" : `${fmtBR(neededTPH, dTPH)} t/h`}</b>{" "}
                {neededBucketsH === null ? null : <span style={{ opacity: 0.9 }}>{`≈ ${fmtBR0(neededBucketsH)} conchadas/h`}</span>}
              </div>

              <div style={exportLine}>
                Média real: <b>{`${fmtBR(avgRealTPH, dTPH)} t/h`}</b>{" "}
                {avgRealBucketsH === null ? null : <span style={{ opacity: 0.9 }}>{`≈ ${fmtBR0(avgRealBucketsH)} conchadas/h`}</span>}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10, color: "rgba(255,255,255,0.60)", fontWeight: 900, fontSize: 12 }}>
            * Casas decimais padronizadas: t/h (1), toneladas (1), % (1), conchadas (inteiro).
          </div>
        </div>
      </div>
    </div>
  );
}
