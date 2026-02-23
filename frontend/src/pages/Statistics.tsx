import React, { useEffect, useMemo, useState } from "react";

type StopRow = {
  period: string;
  equipamento: string;
  tipo_parada: string;
  descricao: string;
  minutos: number;
};

type StopDayPayload = { day: string; rows: StopRow[] };

const API_BASE = String((import.meta as any)?.env?.VITE_API_BASE || "").replace(/\/+$/, "");

// ✅ IMPORTANTE: precisa ser objeto simples para poder usar spread
function authHeaders(): Record<string, string> {
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

// Buckets para cálculo (conforme regra do usuário)
function classTipo(tipo: string) {
  const t = norm(tipo);
  if (t.includes("corret")) return "Corretiva";
  if (t.includes("prevent")) return "Preventiva";
  if (t.includes("eletr")) return "Elétrica";
  if (t.includes("operac")) return "Operacional";
  if (t.includes("segur")) return "Segurança";
  return "Outros";
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
  return `${yyyy}-${mm}`; // input[type=month]
}

function daysInMonth(yyyy: number, mm1: number) {
  // mm1: 1..12
  return new Date(yyyy, mm1, 0).getDate();
}

function isoDate(yyyy: number, mm1: number, dd: number) {
  const mm = String(mm1).padStart(2, "0");
  const d = String(dd).padStart(2, "0");
  return `${yyyy}-${mm}-${d}`;
}

async function fetchStopsDay(day: string): Promise<StopDayPayload> {
  if (!API_BASE) throw new Error("VITE_API_BASE não configurado.");

  const qs = `day=${encodeURIComponent(day)}`;
  const r = await fetch(`${API_BASE}/api/stops-launch?${qs}`, {
    headers: { ...authHeaders() },
  });
  if (!r.ok) throw new Error(`Stops ${day}: ${r.status}`);
  const json = (await r.json()) as StopDayPayload;
  return { day: json?.day || day, rows: Array.isArray(json?.rows) ? json.rows : [] };
}

type MonthAgg = {
  month: string; // YYYY-MM
  days: number;

  totalH: number; // total de horas paradas no mês (planta)
  corretivaH: number;
  preventivaH: number;
  operacionalH: number;

  // para DF/UF
  TP: number; // h
  PM: number; // h (Corretiva+Preventiva+Elétrica)
  PO: number; // h (Operacional+Segurança+Outros)
  DF: number; // %
  UF: number; // %
};

function computeMonthAgg(month: string, days: number, rows: StopRow[]): MonthAgg {
  let totalMin = 0;

  let minCor = 0;
  let minPrev = 0;
  let minOper = 0;

  // extras usados no cálculo DF/UF
  let minEle = 0;
  let minSeg = 0;
  let minOut = 0;

  for (const r of rows) {
    const m = clamp60(r.minutos);
    totalMin += m;

    const k = classTipo(r.tipo_parada);
    if (k === "Corretiva") minCor += m;
    else if (k === "Preventiva") minPrev += m;
    else if (k === "Operacional") minOper += m;
    else if (k === "Elétrica") minEle += m;
    else if (k === "Segurança") minSeg += m;
    else minOut += m;
  }

  const totalH = totalMin / 60;
  const corretivaH = minCor / 60;
  const preventivaH = minPrev / 60;
  const operacionalH = minOper / 60;

  const TP = days * 24;
  const PM = (minCor + minPrev + minEle) / 60;
  const PO = (minOper + minSeg + minOut) / 60;

  const DF = TP > 0 ? ((TP - PM) / TP) * 100 : 0;
  const UF = (TP - PM) > 0 ? ((TP - PM - PO) / (TP - PM)) * 100 : 0;

  return { month, days, totalH, corretivaH, preventivaH, operacionalH, TP, PM, PO, DF, UF };
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
      {sub ? (
        <div style={{ marginTop: 6, color: "rgba(255,255,255,0.70)", fontWeight: 800, fontSize: 13 }}>{sub}</div>
      ) : null}
    </div>
  );
}

export default function Statistics() {
  const [month, setMonth] = useState<string>(monthStr());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [agg, setAgg] = useState<MonthAgg | null>(null);

  async function loadMonth(m: string) {
    setBusy(true);
    setErr(null);

    try {
      const [yyyyS, mmS] = String(m || "").split("-");
      const yyyy = Number(yyyyS);
      const mm1 = Number(mmS);
      if (!yyyy || !mm1) throw new Error("Mês inválido.");

      const days = daysInMonth(yyyy, mm1);
      const daysList = Array.from({ length: days }, (_, i) => isoDate(yyyy, mm1, i + 1));

      const payloads = await Promise.all(
        daysList.map((d) => fetchStopsDay(d).catch(() => ({ day: d, rows: [] as StopRow[] })))
      );

      // ✅ total da planta (independente do equipamento)
      const allRows = payloads.flatMap((p) => p.rows || []);
      setAgg(computeMonthAgg(m, days, allRows));
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar estatísticas do mês.");
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
    const [y, m] = String(month || "").split("-");
    return y && m ? `${m}/${y}` : month;
  }, [month]);

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: -0.3 }}>Produção do mês • Estatísticas</div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontWeight: 800, marginTop: 4 }}>
            UF/DF da planta baseado nas paradas lançadas hora a hora
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 12, marginTop: 14 }}>
          <div style={{ gridColumn: "span 12" }}>
            <Kpi
              title={`Horas paradas da planta no mês (${monthLabel})`}
              value={`${fmt1(agg.totalH)} h`}
              sub={`TP: ${fmt1(agg.TP)} h (${agg.days} dias × 24h)`}
            />
          </div>

          <div style={{ gridColumn: "span 4" }}>
            <Kpi title="Corretiva (mês)" value={`${fmt1(agg.corretivaH)} h`} />
          </div>
          <div style={{ gridColumn: "span 4" }}>
            <Kpi title="Preventiva (mês)" value={`${fmt1(agg.preventivaH)} h`} />
          </div>
          <div style={{ gridColumn: "span 4" }}>
            <Kpi title="Operacional (mês)" value={`${fmt1(agg.operacionalH)} h`} />
          </div>

          <div style={{ gridColumn: "span 6" }}>
            <Kpi title="DF da Planta (mês)" value={fmtPct(agg.DF)} sub={`DF = (TP − PM) / TP • PM: ${fmt1(agg.PM)} h`} />
          </div>
          <div style={{ gridColumn: "span 6" }}>
            <Kpi
              title="UF da Planta (mês)"
              value={fmtPct(agg.UF)}
              sub={`UF = (TP − PM − PO) / (TP − PM) • PO: ${fmt1(agg.PO)} h`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
