import React, { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";

/**
 * Ritmo do dia (00:00–00:00)
 * - Manual: tonelada por conchada (t) (salva no localStorage)
 * - Automático: meta do dia, produzido, período atual, necessário t/h e conchadas/h,
 *              média real t/h e conchadas/h (puxa do mesmo endpoint do PlantProduction)
 *
 * Endpoint esperado:
 *   GET /api/plant-production/{day}  -> { day, rows:[{period, ton, freq}], meta_ton? }
 */

type HourRow = {
  period: string; // ex: "16:00-17:00" ou "16-17"
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

function currentShiftWindow(now = new Date()) {
  // Turno 1: 07–19 | Turno 2: 19–07
  const h = now.getHours();
  if (h >= 7 && h < 19) return { shiftName: "Turno 1", startH: 7, endH: 19 };
  return { shiftName: "Turno 2", startH: 19, endH: 7 };
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

/** mini-card (igual sua 1ª imagem) */
const exportMiniCard: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(14,18,22,0.92)",
  padding: 12,
  lineHeight: 1.45,
  display: "inline-block",
  width: "fit-content",
  maxWidth: 560,
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

const noWrapRow: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 6,
  flexWrap: "nowrap",
  whiteSpace: "nowrap",
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

  const metaDay = useMemo(() => {
    const v = goal?.meta_ton ?? data?.meta_ton ?? data?.meta ?? data?.meta_day ?? data?.planned_ton ?? null;
    return v !== null && v !== undefined ? Number(v) : null;
  }, [goal, data]);

  const produced = useMemo(() => {
    let s = 0;
    rowsNorm.forEach((v) => (s += Number(v || 0)));
    return s;
  }, [rowsNorm]);

  const now = new Date();
  const currH = now.getHours();
  const endH = currH;
  const startH = (currH + 23) % 24;
  const currPeriod = `${pad2(startH)}-${pad2(endH)}`; // ex.: 02-03
  const periodTon = rowsNorm.get(currPeriod) ?? 0;

  const remainingH = dayRemainingHours(now);
  const elapsedH = Math.max(0.25, dayElapsedHours(now));

  const diff = metaDay !== null ? produced - metaDay : null;
  const attainment = metaDay !== null && metaDay > 0 ? (produced / metaDay) * 100 : null;

  const neededTPH = useMemo(() => {
    if (metaDay === null) return null;
    const remaining = Math.max(0, metaDay - produced);
    if (remainingH <= 0) return remaining > 0 ? null : 0;
    return remaining / remainingH;
  }, [metaDay, produced, remainingH]);

  const neededBucketsH = useMemo(() => {
    if (neededTPH === null || bucket === null || bucket <= 0) return null;
    return neededTPH / bucket;
  }, [neededTPH, bucket]);

  const avgRealTPH = produced / elapsedH;
  const avgRealBucketsH = bucket ? avgRealTPH / bucket : null;

  // regra prática: meta ~4404 => esperado 200 t/h
  const expectedTPH = useMemo(() => {
    if (metaDay === null || !isFinite(metaDay) || metaDay <= 0) return 200;
    if (Math.abs(metaDay - 4404) <= 150) return 200;
    return metaDay / 22;
  }, [metaDay]);

  const cYellow = "rgba(250,204,21,0.95)";
  const cGreen = "rgba(34,197,94,0.95)";
  const cRed = "rgba(239,68,68,0.95)";

  // ✅ regras de cor:
  // Necessário: verde quando <= esperado
  // Média real: verde quando >= esperado
  const neededColor = neededTPH !== null && neededTPH <= expectedTPH ? cGreen : cRed;
  const avgRealColor = avgRealTPH >= expectedTPH ? cGreen : cRed;

  const shiftInfo = currentShiftWindow(now);

  const [yy, mm, dd] = day.split("-");
  const dayBR = `${dd}/${mm}/${yy}`;

  async function exportResumoJPEG() {
    const el = exportCompactRef.current;
    if (!el) return;

    // garante layout/fonte pronto
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* topo */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 980, fontSize: 20 }}>
            Ritmo do dia (00:00–00:00)
          </div>

          <button
            onClick={exportResumoJPEG}
            style={{ ...btn, background: "rgba(168,85,247,0.14)", borderColor: "rgba(168,85,247,0.35)" }}
          >
            Exportar resumo
          </button>
        </div>

        <div style={{ color: "rgba(255,255,255,0.55)", fontWeight: 800, marginTop: 2 }}>
          {shiftInfo.shiftName} • {pad2(shiftInfo.startH)}:00 às {pad2(shiftInfo.endH)}:00 •{" "}
          {loading ? "Carregando..." : err ? `Erro: ${err}` : data?.updated_at ? `Atualizado: ${data.updated_at}` : "—"}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={label}>Data</div>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={input} />
            <div style={{ marginTop: 6, color: "rgba(255,255,255,0.55)", fontWeight: 800, fontSize: 12 }}>{dayBR}</div>
          </div>

          <div>
            <div style={label}>Tonelada por conchada (t) — manual</div>
            <input
              value={bucketTon}
              onChange={(e) => setBucketTon(e.target.value)}
              placeholder="ex: 4,2"
              style={{ ...input, width: 220 }}
            />
            <div style={{ marginTop: 6, color: "rgba(255,255,255,0.55)", fontWeight: 800, fontSize: 12 }}>
              Salva por PC (localStorage)
            </div>
          </div>
        </div>
      </div>

      {/* preview normal (na tela) — pode manter grande se quiser */}
      <div style={{ ...card, lineHeight: 1.7, display: "inline-block", width: "fit-content", maxWidth: 520 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
          <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 900 }}>
            Meta: <span style={{ fontWeight: 950 }}>{metaDay === null ? "—" : `${fmtBR0(metaDay)} t`}</span>
          </div>

          <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 900 }}>
            Produzido: <span style={{ fontWeight: 950, color: cYellow }}>{fmtBR0(produced)} t</span>
          </div>

          <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 900 }}>
            Atingimento: <span style={{ fontWeight: 950 }}>{attainment === null ? "—" : fmtPct(attainment, 1)}</span>
          </div>

          <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 900 }}>
            Diferença:{" "}
            <span style={{ fontWeight: 950 }}>
              {diff === null ? "—" : `${diff >= 0 ? "+" : ""}${fmtBR0(diff)} t`}
            </span>
          </div>

          <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 900 }}>
            Tempo restante: <span style={{ fontWeight: 950 }}>{fmtBR(remainingH, 1)} h</span>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.10)", margin: "10px 0" }} />

          <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 900 }}>
            Período: <span style={{ fontWeight: 950 }}>{pad2(startH)}h às {pad2(endH)}h</span>
          </div>

          <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 900 }}>
            Produção do período: <span style={{ fontWeight: 950 }}>{fmtBR(periodTon, 1)} t</span>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.10)", margin: "10px 0" }} />

          <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 900 }}>
            Necessário:{" "}
            <span style={{ fontWeight: 950, color: neededColor }}>
              {neededTPH === null ? "—" : `${fmtBR(neededTPH, 1)} t/h`}
            </span>{" "}
            <span style={{ color: "rgba(255,255,255,0.65)", fontWeight: 900 }}>
              ≈ {neededBucketsH === null ? "—" : `${fmtBR0(neededBucketsH)} conchadas/h`}
            </span>
          </div>

          <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 900 }}>
            Média real:{" "}
            <span style={{ fontWeight: 950, color: avgRealColor }}>{fmtBR(avgRealTPH, 1)} t/h</span>{" "}
            <span style={{ color: "rgba(255,255,255,0.65)", fontWeight: 900 }}>
              ≈ {avgRealBucketsH === null ? "—" : `${fmtBR0(avgRealBucketsH)} conchadas/h`}
            </span>
          </div>
        </div>
      </div>

      {/* ✅ ESTE É O QUE VAI PARA IMAGEM (compacto, sem área vazia e sem "cardão") */}
      <div style={{ position: "fixed", left: -10000, top: -10000, zIndex: -1 }}>
        <div ref={exportCompactRef} style={exportMiniCard}>
          <div style={exportLine}>
            Meta: <span style={{ fontWeight: 950 }}>{metaDay === null ? "—" : `${fmtBR0(metaDay)} t`}</span>
          </div>

          <div style={exportLine}>
            Produzido: <span style={{ fontWeight: 950, color: cYellow }}>{fmtBR0(produced)} t</span>
          </div>

          <div style={exportLine}>
            Atingimento: <span style={{ fontWeight: 950 }}>{attainment === null ? "—" : fmtPct(attainment, 1)}</span>
          </div>

          <div style={exportLine}>
            Diferença:{" "}
            <span style={{ fontWeight: 950 }}>
              {diff === null ? "—" : `${diff >= 0 ? "+" : ""}${fmtBR0(diff)} t`}
            </span>
          </div>

          <div style={exportLine}>
            Tempo restante: <span style={{ fontWeight: 950 }}>{fmtBR(remainingH, 1)} h</span>
          </div>

          <div style={exportSep} />

          <div style={exportLine}>
            Período: <span style={{ fontWeight: 950 }}>{pad2(startH)}h às {pad2(endH)}h</span>
          </div>

          <div style={exportLine}>
            Produção do período: <span style={{ fontWeight: 950 }}>{fmtBR(periodTon, 1)} t</span>
          </div>

          <div style={exportSep} />

          <div style={{ ...exportLine, ...noWrapRow }}>
            <span>Necessário:</span>
            <span style={{ fontWeight: 950, color: neededColor }}>
              {neededTPH === null ? "—" : `${fmtBR(neededTPH, 1)} t/h`}
            </span>
            <span style={{ color: "rgba(255,255,255,0.65)", fontWeight: 900 }}>
              ≈ {neededBucketsH === null ? "—" : `${fmtBR0(neededBucketsH)} conchadas/h`}
            </span>
          </div>

          <div style={{ ...exportLine, ...noWrapRow }}>
            <span>Média real:</span>
            <span style={{ fontWeight: 950, color: avgRealColor }}>{fmtBR(avgRealTPH, 1)} t/h</span>
            <span style={{ color: "rgba(255,255,255,0.65)", fontWeight: 900 }}>
              ≈ {avgRealBucketsH === null ? "—" : `${fmtBR0(avgRealBucketsH)} conchadas/h`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
