import React, { useEffect, useMemo, useState } from "react";
import { useIsMobile } from "../mobile/useIsMobile";

type StopRow = {
  period: string;
  equipamento: string;
  tipo_parada: string;
  descricao: string;
  minutos: number;
};

type StopDayPayload = { day: string; rows: StopRow[] };

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

async function fetchStopsDay(day: string): Promise<StopDayPayload> {
  const qs = `day=${encodeURIComponent(day)}`;
  const r = await fetch(`${API_BASE}/api/stops-launch?${qs}`, { headers: { ...authHeaders() } });
  if (!r.ok) throw new Error(`Stops ${day}: ${r.status}`);
  const json = (await r.json()) as StopDayPayload;
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

  for (const r of rowsAllDays) {
    const m = clamp60(r.minutos);
    totalMin += m;
    const k = classTipo(r.tipo_parada);
    byTypeMin[k] = (byTypeMin[k] || 0) + m;
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [agg, setAgg] = useState<MonthAgg | null>(null);

  async function loadMonth(m: string) {
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
        daysList.map((d) => fetchStopsDay(d).catch(() => ({ day: d, rows: [] as StopRow[] })))
      );

      const allRows = payloads.flatMap((p) => p.rows || []);
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
    loadMonth(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-");
    return `${m}/${y}`;
  }, [month]);

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: -0.3 }}>UF / DF • Planta (Geral)</div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontWeight: 800, marginTop: 4 }}>
            Base: paradas hora a hora • soma total do mês (independente do equipamento)
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
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
            onClick={() => loadMonth(month)}
            disabled={busy}
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.92)",
              padding: "10px 12px",
              fontWeight: 950,
              cursor: busy ? "not-allowed" : "pointer",
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
                  <Kpi title="Horas Parada" value={`${fmt1(agg.totalH)} h`} sub="Soma das paradas" />
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
                <h3>`DF = (HT - HM) / HT × 100`</h3>
              />
            </div>
            <div style={{ gridColumn: "span 4" }}>
              <Kpi
                title="UF da Planta (mês)"
                value={fmtPct(agg.UF)}
                <h3>"UF = HO / (HT - HM) × 100"</h3>
              />
            </div>
            <div style={{ gridColumn: "span 4" }}>
              <Kpi
                title="RO (Rendimento Operacional)"
                value={fmtPct((agg.UF * agg.DF) / 100)}
                <h3>"RO = HO / HT × 100"</h3>
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
                Observação: este cálculo considera o total de paradas do mês <b>independente do equipamento</b>.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
