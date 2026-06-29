import React, { useEffect, useMemo, useState } from "react";
import { useIsMobile } from "../mobile/useIsMobile";

type StopRow = {
  id?: number | null;
  period: string;
  equipamento: string;
  tipo_parada: string;
  descricao: string;
  minutos: number;
  hora_inicial?: string | null;
  hora_final?: string | null;
  ordem?: number | null;
  plant_id?: number | null;

  // preenchido localmente para cálculo mensal
  _day?: string;
};

type StopDayPayload = { day: string; rows: StopRow[] };

type PlantScope = number | "all";

type PlantInfo = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
};

const API_BASE = String((import.meta as any)?.env?.VITE_API_BASE || "").replace(/\/+$/, "");

function authHeaders(): HeadersInit {
  const t = (localStorage.getItem("mp_token") || localStorage.getItem("token") || "").trim();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function clamp60(n: any) {
  const x = Number(n || 0);
  return Math.max(0, Math.min(60, x));
}

function norm(s: any) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function classTipo(tipo: string) {
  const t = norm(tipo);
  if (t.includes("corret")) return "Corretiva";
  if (t.includes("prevent")) return "Preventiva";
  if (t.includes("operac")) return "Operacional";
  return "";
}

function periodStartHour(period: string): number | null {
  const p = String(period || "").trim();
  const m = p.match(/^(\d{2})(?::\d{2})?-(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : null;
}

function parseHHMM(v: any): { h: number; m: number } | null {
  const s = String(v || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return { h, m: mm };
}

function timeToAbsMinute(period: string, hhmm: any): number | null {
  const t = parseHHMM(hhmm);
  if (!t) return null;

  let total = t.h * 60 + t.m;
  const startH = periodStartHour(period);
  if (startH === null) return total;

  const startTotal = startH * 60;

  // Trata períodos de virada, ex.: 23-00 com 00:10.
  if (total < startTotal) total += 24 * 60;

  return total;
}

function addMinutesToBucket(bucket: Record<string, number>, tipo: string, minutes: number) {
  const k = classTipo(tipo);
  if (!k) return;
  bucket[k] = (bucket[k] || 0) + minutes;
}

function pickTypeForCoincidentMinute(types: Set<string>): string {
  // Para UF/DF, o mesmo minuto não pode contar duas vezes.
  // Se houver manutenção e operacional simultâneas, prioriza manutenção.
  if (types.has("Corretiva")) return "Corretiva";
  if (types.has("Preventiva")) return "Preventiva";
  if (types.has("Operacional")) return "Operacional";
  return "";
}

function liquidMinutesByTypeForGroup(rows: StopRow[]) {
  const byTypeMin: Record<string, number> = {
    Corretiva: 0,
    Preventiva: 0,
    Operacional: 0,
  };

  let totalMin = 0;
  let usedTimedCalculation = false;

  // Mapa minuto -> tipos presentes naquele minuto.
  // Assim paradas simultâneas na mesma planta/faixa horária contam apenas uma vez.
  const minuteTypes = new Map<number, Set<string>>();
  let fallbackUntimedMin = 0;
  const fallbackUntimedByType: Record<string, number> = {
    Corretiva: 0,
    Preventiva: 0,
    Operacional: 0,
  };

  for (const r of rows) {
    const minutes = clamp60(r.minutos);
    if (minutes <= 0) continue;

    const ini = timeToAbsMinute(r.period, r.hora_inicial);
    const fimRaw = timeToAbsMinute(r.period, r.hora_final);
    const tipo = classTipo(r.tipo_parada);

    if (ini !== null && fimRaw !== null) {
      let fim = fimRaw;
      if (fim <= ini) fim += 24 * 60;

      // Limita o intervalo a 60 minutos para preservar a regra da faixa horária.
      const end = Math.min(fim, ini + 60);

      if (end > ini) {
        usedTimedCalculation = true;
        for (let minute = ini; minute < end; minute++) {
          if (!minuteTypes.has(minute)) minuteTypes.set(minute, new Set<string>());
          if (tipo) minuteTypes.get(minute)!.add(tipo);
        }
        continue;
      }
    }

    // Fallback para registros antigos sem hora inicial/final.
    // Sem horário detalhado não dá para saber coincidência; considera o minuto informado.
    fallbackUntimedMin += minutes;
    if (tipo) fallbackUntimedByType[tipo] = (fallbackUntimedByType[tipo] || 0) + minutes;
  }

  if (usedTimedCalculation) {
    for (const types of minuteTypes.values()) {
      totalMin += 1;
      const chosen = pickTypeForCoincidentMinute(types);
      if (chosen) byTypeMin[chosen] = (byTypeMin[chosen] || 0) + 1;
    }

    // Registros sem hora continuam entrando, mas nunca deixam o horário passar de 60 min.
    const available = Math.max(0, 60 - totalMin);
    const fallbackToUse = Math.min(available, fallbackUntimedMin);
    if (fallbackToUse > 0 && fallbackUntimedMin > 0) {
      totalMin += fallbackToUse;

      // Distribui proporcionalmente por tipo no fallback.
      for (const k of ["Corretiva", "Preventiva", "Operacional"]) {
        const raw = fallbackUntimedByType[k] || 0;
        if (raw > 0) byTypeMin[k] = (byTypeMin[k] || 0) + (raw / fallbackUntimedMin) * fallbackToUse;
      }
    }

    return { totalMin, byTypeMin };
  }

  // Sem horários lançados: comportamento legado, com trava de 60 min por faixa.
  for (const r of rows) {
    const minutes = clamp60(r.minutos);
    if (minutes <= 0) continue;
    totalMin += minutes;
    addMinutesToBucket(byTypeMin, r.tipo_parada, minutes);
  }

  if (totalMin > 60) {
    const factor = 60 / totalMin;
    totalMin = 60;
    for (const k of ["Corretiva", "Preventiva", "Operacional"]) {
      byTypeMin[k] = (byTypeMin[k] || 0) * factor;
    }
  }

  return { totalMin, byTypeMin };
}

function fmt1(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function fmt2(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n: number) {
  return `${fmt2(n)}%`;
}

function monthStr(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function daysInMonth(yyyy: number, mm1: number) {
  return new Date(yyyy, mm1, 0).getDate();
}



function effectiveDaysForMonth(month: string, daysTotal: number) {
  // Para o mês atual, considera somente até o dia de hoje (horizonte gradual).
  // Para meses passados, usa o total do mês.
  const [yS, mS] = month.split("-");
  const y = Number(yS);
  const m1 = Number(mS);
  const now = new Date();
  const isCurrent = now.getFullYear() === y && now.getMonth() + 1 === m1;
  if (!isCurrent) return daysTotal;
  const today = now.getDate();
  return Math.max(1, Math.min(daysTotal, today));
}
function isoDate(yyyy: number, mm1: number, dd: number) {
  const mm = String(mm1).padStart(2, "0");
  const d = String(dd).padStart(2, "0");
  return `${yyyy}-${mm}-${d}`;
}

async function fetchStopsDay(plantId: PlantScope, day: string): Promise<StopDayPayload> {
  const qs = `day=${encodeURIComponent(day)}`;
  const headers = { ...authHeaders() };

  if (plantId === "all") {
    const r = await fetch(`${API_BASE}/api/aggregate/stops-launch?${qs}`, { headers });
    if (!r.ok) throw new Error(`Stops ${day}: ${r.status}`);
    const json = await r.json();
    return { day: json?.day || day, rows: Array.isArray(json?.rows) ? json.rows : [] };
  }

  const r = await fetch(`${API_BASE}/api/plants/${plantId}/stops-launch?${qs}`, { headers });
  if (!r.ok) throw new Error(`Stops ${day}: ${r.status}`);
  const json = await r.json();
  return { day: json?.day || day, rows: Array.isArray(json?.rows) ? json.rows : [] };
}

type MonthAgg = {
  month: string;
  days: number;
  totalMin: number;
  byTypeMin: Record<string, number>;
  totalH: number;
  corretivaH: number;
  preventivaH: number;
  operacionalH: number;
  PM: number;
  PO: number;
  TP: number;
  DF: number;
  UF: number;
};

function computeMonthAgg(month: string, days: number, rowsAllDays: StopRow[]): MonthAgg {
  const byTypeMin: Record<string, number> = {
    Corretiva: 0,
    Preventiva: 0,
    Operacional: 0,
  };

  let totalMin = 0;

  // Agrupa por dia + planta + faixa horária.
  // Dentro de cada grupo, calcula a união dos intervalos por hora_inicial/hora_final.
  const groups = new Map<string, StopRow[]>();

  for (const r of rowsAllDays) {
    const period = String(r.period || "").trim();
    if (!period) continue;

    const dayKey = r._day || "sem-dia";
    const plantKey = r.plant_id != null ? String(r.plant_id) : "plant";
    const key = `${dayKey}::${plantKey}::${period}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  for (const rows of groups.values()) {
    const liquid = liquidMinutesByTypeForGroup(rows);
    totalMin += liquid.totalMin;

    for (const k of ["Corretiva", "Preventiva", "Operacional"]) {
      byTypeMin[k] = (byTypeMin[k] || 0) + (liquid.byTypeMin[k] || 0);
    }
  }

  const totalH = totalMin / 60;

  const corretivaH = (byTypeMin["Corretiva"] || 0) / 60;
  const preventivaH = (byTypeMin["Preventiva"] || 0) / 60;
  const operacionalH = (byTypeMin["Operacional"] || 0) / 60;

  const PM = corretivaH + preventivaH;
  const PO = operacionalH;

  const TP = days * 24;

  const DF = TP > 0 ? ((TP - PM) / TP) * 100 : 0;
  const UF = (TP - PM) > 0 ? ((TP - PM - PO) / (TP - PM)) * 100 : 0;

  return {
    month,
    days,
    totalMin,
    byTypeMin,
    totalH,
    corretivaH,
    preventivaH,
    operacionalH,
    PM,
    PO,
    TP,
    DF,
    UF,
  };
}

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

function Kpi({ title, value, sub }: { title: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div style={card}>
      <div style={label}>{title}</div>
      <div style={{ fontSize: 30, fontWeight: 950, letterSpacing: -0.4, marginTop: 6 }}>{value}</div>
      {sub ? <div style={{ marginTop: 6, color: "rgba(255,255,255,0.70)", fontWeight: 800, fontSize: 13 }}>{sub}</div> : null}
    </div>
  );
}

export default function UfDF() {
  const mobile = useIsMobile();

  const [month, setMonth] = useState<string>(monthStr());
  const [plants, setPlants] = useState<PlantInfo[]>([]);
  const [plantId, setPlantId] = useState<PlantScope | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [agg, setAgg] = useState<MonthAgg | null>(null);

  async function loadPlants() {
    try {
      const r = await fetch(`${API_BASE}/api/plants`, { headers: { ...authHeaders() } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const list = (await r.json()) as PlantInfo[];
      const arr = Array.isArray(list) ? list : [];
      setPlants(arr);
      setPlantId((current) => {
        if (current === "all") return "all";
        if (current && arr.some((x) => Number(x.id) === Number(current))) return current;
        return arr.length ? Number(arr[0].id) : null;
      });
    } catch (e: any) {
      setPlants([]);
      setPlantId(null);
      setErr(e?.message || "Falha ao carregar plantas.");
    }
  }

  async function loadMonth(m: string, selectedPlantId: PlantScope) {
    setBusy(true);
    setErr(null);
    try {
      const [yyyyS, mmS] = m.split("-");
      const yyyy = Number(yyyyS);
      const mm1 = Number(mmS);
      if (!yyyy || !mm1) throw new Error("Mês inválido.");

      const daysTotal = daysInMonth(yyyy, mm1);
      const days = effectiveDaysForMonth(m, daysTotal);
      const daysList = Array.from({ length: days }, (_, i) => isoDate(yyyy, mm1, i + 1));

      const payloads = await Promise.all(
        daysList.map((d) => fetchStopsDay(selectedPlantId, d).catch(() => ({ day: d, rows: [] as StopRow[] })))
      );

      const allRows = payloads.flatMap((p) => (p.rows || []).map((r) => ({ ...r, _day: p.day })));
      const computed = computeMonthAgg(m, days, allRows);
      setAgg(computed);
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar UF/DF do mês.");
      setAgg(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadPlants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!plantId) return;
    loadMonth(month, plantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, plantId]);

  const selectedPlantName = useMemo(() => {
    if (plantId === "all") return "Todas as plantas";
    return plants.find((p) => Number(p.id) === Number(plantId))?.name || "Planta";
  }, [plants, plantId]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-");
    return `${m}/${y}`;
  }, [month]);

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: -0.3 }}>UF / DF • {selectedPlantName}</div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontWeight: 800, marginTop: 4 }}>
            Base: paradas hora a hora • tempo líquido do mês, abatendo coincidências por planta e horário
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={plantId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setPlantId(v === "all" ? "all" : v ? Number(v) : null);
            }}
            disabled={!plants.length}
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.92)",
              padding: "10px 12px",
              fontWeight: 900,
              minWidth: 180,
            }}
          >
            {plants.length === 0 ? <option value="">Sem plantas</option> : null}
            {plants.length > 0 ? <option value="all">Todas as plantas</option> : null}
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.92)",
              padding: "10px 12px",
              fontWeight: 900,
            }}
          />
          <button
            onClick={() => plantId && loadMonth(month, plantId)}
            disabled={busy || !plantId}
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.92)",
              padding: "10px 12px",
              fontWeight: 950,
              cursor: busy || !plantId ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Carregando…" : "Atualizar"}
          </button>
        </div>
      </div>

      {err ? (
        <div style={{ marginTop: 12, ...card, borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)" }}>
          <div style={{ fontWeight: 950 }}>Falha ao carregar</div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontWeight: 800, marginTop: 6 }}>{err}</div>
        </div>
      ) : null}

      {!agg ? (
        <div style={{ marginTop: 14, ...card }}>
          <div style={{ color: "rgba(255,255,255,0.70)", fontWeight: 900 }}>
            {busy ? "Carregando dados do mês…" : "Sem dados."}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 12, marginTop: 14 }}>
            <div style={{ gridColumn: "span 12" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 12 }}>
                <div style={{ gridColumn: "span 4" }}>
                  <Kpi title={`Horas Horizonte (${monthLabel})`} value={`${fmt1(agg.TP)} h`} sub={`${agg.days} dias${month === monthStr() ? " (até hoje)" : ""} × 24h`} />
                </div>
                <div style={{ gridColumn: "span 4" }}>
                  <Kpi
                    title="Horas Operando"
                    value={`${fmt1(Math.max(0, agg.TP - agg.totalH))} h`}
                    sub="Horizonte − Parada"
                  />
                </div>
                <div style={{ gridColumn: "span 4" }}>
                  <Kpi title="Horas Parada" value={`${fmt1(agg.totalH)} h`} sub="Tempo líquido das paradas" />
                </div>
              </div>
            </div>

            <div style={{ gridColumn: "span 4" }}>
              <Kpi title="Corretiva (mês)" value={`${fmt1(agg.corretivaH)} h`} sub="Conta em PM" />
            </div>
            <div style={{ gridColumn: "span 4" }}>
              <Kpi title="Preventiva (mês)" value={`${fmt1(agg.preventivaH)} h`} sub="Conta em PM" />
            </div>
            <div style={{ gridColumn: "span 4" }}>
              <Kpi title="Operacional (mês)" value={`${fmt1(agg.operacionalH)} h`} sub="Conta em PO" />
            </div>
            <div style={{ gridColumn: "span 4" }}>
              <Kpi
                title="DF da Planta (mês)"
                value={fmtPct(agg.DF)}
                sub={`DF = (HT - HM) / HT × 100`}
              />
            </div>
            <div style={{ gridColumn: "span 4" }}>
              <Kpi
                title="UF da Planta (mês)"
                value={fmtPct(agg.UF)}
                sub={`UF = HO / (HT - HM) × 100`}
              />
            </div>
            <div style={{ gridColumn: "span 4" }}>
              <Kpi
                title="RO (Rendimento Operacional)"
                value={fmtPct((agg.UF * agg.DF) / 100)}
                sub="RO = HO / HT × 100"
              />
            </div>
          </div>

          <div style={{ marginTop: 12, ...card }}>
            <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>Resumo</div>
            <div style={{ marginTop: 8, color: "rgba(255,255,255,0.75)", fontWeight: 800, lineHeight: 1.5 }}>
              <div><b>Total parado:</b> {fmt1(agg.totalH)} h</div>
              <div><b>PM (Manutenção):</b> {fmt1(agg.PM)} h (Corretiva + Preventiva)</div>
              <div><b>PO (Operacional):</b> {fmt1(agg.PO)} h (Operacional)</div>
              <div><b>RO:</b> {fmtPct((agg.UF * agg.DF) / 100)} (UF × DF)</div>
              <div style={{ marginTop: 6, color: "rgba(255,255,255,0.68)" }}>
                Observação: este cálculo considera somente o <b>tempo líquido</b> das paradas por planta e faixa horária, abatendo coincidências por hora inicial/final.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
