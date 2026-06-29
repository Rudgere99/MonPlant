import { useEffect, useMemo, useState } from "react";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

type GoalDay = { day: string; meta_ton: number; discount_hours: number };
type PlantHourRow = { period: string; ton?: string | number | null; freq?: string | number | null };
type PlantDayPayload = { day: string; obs?: string | null; rows: PlantHourRow[]; updated_at?: string | null };

type ActualDay = {
  day: string;
  actual_ton: number;
  hasData: boolean;
};

type SimDay = {
  day: string;
  original_meta: number;
  adjusted_meta: number;
  actual_ton: number;
  gap_ton: number;
  discount_hours: number;
  meta_h_original: number;
  meta_h_adjusted: number;
  status: "fechado" | "aberto";
};

function authHeaders(): Record<string, string> {
  const keys = ["mp_token", "token", "access_token", "auth_token"];
  for (const k of keys) {
    const v = (localStorage.getItem(k) || "").trim();
    if (v) return { Authorization: `Bearer ${v}` };
  }
  return {};
}

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}

async function apiPut<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}

function isoMonth(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function isoToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysInMonth(ym: string) {
  const [y, m] = ym.split("-").map((x) => Number(x));
  const dt = new Date(y, m - 1, 1);
  const res: string[] = [];
  while (dt.getMonth() === m - 1) {
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    res.push(`${dt.getFullYear()}-${mm}-${dd}`);
    dt.setDate(dt.getDate() + 1);
  }
  return res;
}

function parseBRNumber(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmtBR0(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function fmtBR2(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sumPlantDayTon(payload?: PlantDayPayload | null) {
  let total = 0;
  for (const row of payload?.rows || []) {
    total += parseBRNumber((row as any)?.ton);
  }
  return Math.round(total * 100) / 100;
}

function calcMetaHora(meta: number, discountHours: number) {
  const horas = Math.max(0, 24 - (Number(discountHours) || 0));
  if (meta <= 0 || horas <= 0) return 0;
  return meta / horas;
}

function isClosedDay(day: string, today: string) {
  return day < today;
}

function redistributeFutureGoals(rows: GoalDay[], actualMap: Map<string, ActualDay>, todayISO: string): SimDay[] {
  const monthTarget = rows.reduce((acc, r) => acc + (Number(r.meta_ton) || 0), 0);

  let closedActual = 0;
  let closedOriginal = 0;
  const openRows: GoalDay[] = [];

  for (const row of rows) {
    const closed = isClosedDay(row.day, todayISO);
    const actual = actualMap.get(row.day)?.actual_ton || 0;
    if (closed) {
      closedActual += actual;
      closedOriginal += Number(row.meta_ton) || 0;
    } else {
      openRows.push(row);
    }
  }

  const remainingTarget = Math.max(0, monthTarget - closedActual);
  const remainingOriginal = openRows.reduce((acc, r) => acc + (Number(r.meta_ton) || 0), 0);
  const openCount = openRows.length;

  let distributedSum = 0;
  const adjustedMap = new Map<string, number>();

  openRows.forEach((row, idx) => {
    let adjusted = 0;

    if (openCount <= 0) {
      adjusted = 0;
    } else if (remainingOriginal > 0) {
      adjusted = (remainingTarget * (Number(row.meta_ton) || 0)) / remainingOriginal;
    } else {
      adjusted = remainingTarget / openCount;
    }

    adjusted = Math.round(adjusted * 100) / 100;

    if (idx === openRows.length - 1) {
      adjusted = Math.round((remainingTarget - distributedSum) * 100) / 100;
    }

    distributedSum += adjusted;
    adjustedMap.set(row.day, Math.max(0, adjusted));
  });

  return rows.map((row) => {
    const original = Number(row.meta_ton) || 0;
    const actual = actualMap.get(row.day)?.actual_ton || 0;
    const closed = isClosedDay(row.day, todayISO);
    const adjusted = closed ? original : adjustedMap.get(row.day) ?? original;

    return {
      day: row.day,
      original_meta: original,
      adjusted_meta: adjusted,
      actual_ton: actual,
      gap_ton: actual - original,
      discount_hours: Number(row.discount_hours) || 0,
      meta_h_original: calcMetaHora(original, Number(row.discount_hours) || 0),
      meta_h_adjusted: calcMetaHora(adjusted, Number(row.discount_hours) || 0),
      status: closed ? "fechado" : "aberto",
    };
  });
}

export default function MetasMes() {
  const [month, setMonth] = useState<string>(() => isoMonth(new Date()));
  const [plantId, setPlantId] = useState<number>(1);
  const [rows, setRows] = useState<GoalDay[]>([]);
  const [actuals, setActuals] = useState<Record<string, ActualDay>>({});
  const [loading, setLoading] = useState(false);
  const [loadingActuals, setLoadingActuals] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [presetMeta, setPresetMeta] = useState<string>("0");
  const [presetDiscount, setPresetDiscount] = useState<string>("2");

  const monthDays = useMemo(() => daysInMonth(month), [month]);
  const todayISO = useMemo(() => isoToday(), []);

  const totalMes = useMemo(() => rows.reduce((acc, r) => acc + (Number(r.meta_ton) || 0), 0), [rows]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    setOkMsg(null);

    (async () => {
      try {
        const payload = await apiGet<{ month: string; days: any[] }>(`/api/plants/${plantId}/goals/month/${encodeURIComponent(month)}`).catch(
          () => ({ month, days: [] })
        );
        const map = new Map<string, GoalDay>();
        for (const d of payload.days || []) {
          map.set(String(d.day), {
            day: String(d.day),
            meta_ton: Number(d.meta_ton) || 0,
            discount_hours: Number(d.discount_hours) || 0,
          });
        }

        const merged: GoalDay[] = monthDays.map((d) => {
          const ex = map.get(d);
          if (ex) return ex;
          return { day: d, meta_ton: 0, discount_hours: 2 };
        });

        if (alive) setRows(merged);
      } catch (e: any) {
        if (alive) setErr(e?.message || "Falha ao carregar metas do mês");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [month, monthDays, plantId]);

  useEffect(() => {
    let alive = true;
    setLoadingActuals(true);

    (async () => {
      try {
        const out: Record<string, ActualDay> = {};
        for (const day of monthDays) {
          try {
            const pd = await apiGet<PlantDayPayload>(`/api/plants/${plantId}/plant-production/${encodeURIComponent(day)}`);
            out[day] = {
              day,
              actual_ton: sumPlantDayTon(pd),
              hasData: !!(pd?.rows || []).some((r) => parseBRNumber((r as any)?.ton) > 0),
            };
          } catch {
            out[day] = { day, actual_ton: 0, hasData: false };
          }
        }
        if (alive) setActuals(out);
      } finally {
        if (alive) setLoadingActuals(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [monthDays, plantId]);

  function setRow(day: string, patch: Partial<GoalDay>) {
    setRows((prev) => prev.map((r) => (r.day === day ? { ...r, ...patch } : r)));
  }

  function applyPreset() {
    const m = parseBRNumber(presetMeta);
    const d = parseBRNumber(presetDiscount);
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        meta_ton: Number.isFinite(m) ? m : r.meta_ton,
        discount_hours: Number.isFinite(d) ? d : r.discount_hours,
      }))
    );
  }

  function applyRedistributionToPlan() {
    setRows((prev) =>
      prev.map((r) => {
        const sim = simulation.find((x) => x.day === r.day);
        if (!sim || sim.status === "fechado") return r;
        return { ...r, meta_ton: Math.round((sim.adjusted_meta || 0) * 100) / 100 };
      })
    );
    setOkMsg("Redistribuição aplicada nas metas dos dias em aberto.");
  }

  async function saveMonth() {
    setLoading(true);
    setErr(null);
    setOkMsg(null);

    try {
      await apiPut(`/api/plants/${plantId}/goals/month/${encodeURIComponent(month)}`, {
        days: rows.map((r) => ({
          day: r.day,
          meta_ton: Number(r.meta_ton) || 0,
          discount_hours: Number(r.discount_hours) || 0,
        })),
      });
      setOkMsg(`Metas do mês salvas para a Planta ${String(plantId).padStart(2, "0")}.`);
    } catch (e: any) {
      setErr(e?.message || "Falha ao salvar metas");
    } finally {
      setLoading(false);
    }
  }

  const actualMap = useMemo(() => {
    const map = new Map<string, ActualDay>();
    Object.values(actuals).forEach((a) => map.set(a.day, a));
    return map;
  }, [actuals]);

  const simulation = useMemo(() => redistributeFutureGoals(rows, actualMap, todayISO), [rows, actualMap, todayISO]);

  const totalActualClosed = useMemo(
    () => simulation.filter((x) => x.status === "fechado").reduce((acc, x) => acc + x.actual_ton, 0),
    [simulation]
  );

  const totalOpenAdjusted = useMemo(
    () => simulation.filter((x) => x.status === "aberto").reduce((acc, x) => acc + x.adjusted_meta, 0),
    [simulation]
  );

  const carryGap = useMemo(
    () => simulation.filter((x) => x.status === "fechado").reduce((acc, x) => acc + (x.original_meta - x.actual_ton), 0),
    [simulation]
  );

  const wrap: React.CSSProperties = {
    padding: 18,
    color: "rgba(255,255,255,0.9)",
  };

  const card: React.CSSProperties = {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
    boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
    padding: 16,
  };

  const th: React.CSSProperties = {
    textAlign: "left",
    fontSize: 12,
    fontWeight: 800,
    color: "rgba(255,255,255,0.70)",
    padding: "10px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    position: "sticky",
    top: 0,
    background: "rgba(10,12,16,0.96)",
    zIndex: 1,
  };

  const td: React.CSSProperties = {
    padding: "8px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    height: 34,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.30)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
    padding: "0 10px",
  };

  const btn: React.CSSProperties = {
    height: 36,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    fontWeight: 900,
    padding: "0 12px",
    cursor: "pointer",
  };

  const btnGreen: React.CSSProperties = {
    ...btn,
    background: "linear-gradient(180deg, rgba(0,204,255,0.20), rgba(0,204,255,0.10))",
    border: "1px solid rgba(0,204,255,0.30)",
  };

  const badge = (kind: "ok" | "warn" | "muted") : React.CSSProperties => {
    if (kind === "ok") {
      return {
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 900,
        color: "#86efac",
        background: "rgba(34,197,94,0.12)",
        border: "1px solid rgba(34,197,94,0.25)",
      };
    }
    if (kind === "warn") {
      return {
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 900,
        color: "#fcd34d",
        background: "rgba(245,158,11,0.12)",
        border: "1px solid rgba(245,158,11,0.25)",
      };
    }
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "5px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 900,
      color: "rgba(255,255,255,0.78)",
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.10)",
    };
  };

  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.60)", marginBottom: 6 }}>
            Configurações • Metas do mês • Planta selecionada
          </div>
          <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: -0.3 }}>Metas por planta com redistribuição</div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: 800 }}>
            Planta&nbsp;
            <select
              value={plantId}
              onChange={(e) => setPlantId(Number(e.target.value) || 1)}
              style={{ ...input, width: 150, display: "inline-block" }}
            >
              <option value={1}>Planta 01</option>
              <option value={2}>Planta 02</option>
            </select>
          </label>

          <label style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: 800 }}>
            Mês&nbsp;
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{ ...input, width: 160, display: "inline-block" }}
            />
          </label>

          <button style={btn} onClick={applyRedistributionToPlan} disabled={loading || loadingActuals}>
            Aplicar redistribuição
          </button>

          <button style={btnGreen} onClick={saveMonth} disabled={loading}>
            Salvar metas
          </button>
        </div>
      </div>

      <div style={{ ...card, marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: 800 }}>Meta do mês</div>
            <div style={{ fontSize: 24, fontWeight: 950 }}>{fmtBR0(totalMes)} t</div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: 800 }}>Realizado dias fechados</div>
            <div style={{ fontSize: 24, fontWeight: 950 }}>{fmtBR0(totalActualClosed)} t</div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: 800 }}>Saldo a redistribuir</div>
            <div style={{ fontSize: 24, fontWeight: 950, color: carryGap > 0 ? "#fcd34d" : "#86efac" }}>
              {carryGap >= 0 ? "+" : ""}{fmtBR0(carryGap)} t
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: 800 }}>Meta aberta recalculada</div>
            <div style={{ fontSize: 24, fontWeight: 950 }}>{fmtBR0(totalOpenAdjusted)} t</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 14 }}>
          <label style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: 800 }}>
            Preset meta (t)
            <input value={presetMeta} onChange={(e) => setPresetMeta(e.target.value)} style={{ ...input, width: 140 }} />
          </label>
          <label style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: 800 }}>
            Desconto horas
            <input value={presetDiscount} onChange={(e) => setPresetDiscount(e.target.value)} style={{ ...input, width: 140 }} />
          </label>
          <button style={btn} onClick={applyPreset} disabled={loading}>
            Aplicar no mês
          </button>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={badge("warn")}>Dias fechados = realizado trava</span>
            <span style={badge("muted")}>Dias abertos = meta recalculada</span>
          </div>
        </div>

        {err ? <div style={{ marginTop: 10, color: "#ff6b6b", fontWeight: 900 }}>{err}</div> : null}
        {okMsg ? <div style={{ marginTop: 10, color: "rgba(0,204,255,0.90)", fontWeight: 900 }}>{okMsg}</div> : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.35fr", gap: 14, alignItems: "start" }}>
        <div style={{ ...card, padding: 0, overflow: "auto", maxHeight: "72vh" }}>
          <div style={{ padding: 16, paddingBottom: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 950 }}>Planejamento base</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", fontWeight: 800, marginTop: 4 }}>
              Meta manual por dia e desconto de horas da planta selecionada.
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 620, marginTop: 12 }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 118 }}>Dia</th>
                <th style={{ ...th, width: 128 }}>Meta do dia (t)</th>
                <th style={{ ...th, width: 126 }}>Desconto horas</th>
                <th style={{ ...th, width: 150 }}>Meta/hora</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = Number(r.meta_ton) || 0;
                const disc = Number(r.discount_hours) || 0;
                const metaH = calcMetaHora(meta, disc);

                return (
                  <tr key={r.day}>
                    <td style={td}>{r.day}</td>
                    <td style={td}>
                      <input
                        style={input}
                        value={String(r.meta_ton).replace(".", ",")}
                        onChange={(e) => setRow(r.day, { meta_ton: parseBRNumber(e.target.value) })}
                      />
                    </td>
                    <td style={td}>
                      <input
                        style={input}
                        value={String(r.discount_hours).replace(".", ",")}
                        onChange={(e) => setRow(r.day, { discount_hours: parseBRNumber(e.target.value) })}
                      />
                    </td>
                    <td style={{ ...td, fontWeight: 950 }}>{fmtBR2(metaH)} t/h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ ...card, padding: 0, overflow: "auto", maxHeight: "72vh" }}>
          <div style={{ padding: 16, paddingBottom: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 950 }}>Meta recalculada</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", fontWeight: 800, marginTop: 4 }}>
                Considera o realizado da planta selecionada e redistribui o saldo para os próximos dias.
              </div>
            </div>
            <div style={{ marginLeft: "auto" }}>{loadingActuals ? <span style={badge("muted")}>Lendo produção...</span> : null}</div>
          </div>

          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 980, marginTop: 12 }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 118 }}>Dia</th>
                <th style={{ ...th, width: 90 }}>Status</th>
                <th style={{ ...th, width: 140 }}>Meta base</th>
                <th style={{ ...th, width: 140 }}>Realizado</th>
                <th style={{ ...th, width: 140 }}>Gap</th>
                <th style={{ ...th, width: 160 }}>Nova meta</th>
                <th style={{ ...th, width: 140 }}>Nova meta/h</th>
              </tr>
            </thead>
            <tbody>
              {simulation.map((r) => (
                <tr key={r.day}>
                  <td style={td}>{r.day}</td>
                  <td style={td}>
                    <span style={badge(r.status === "fechado" ? "ok" : "muted")}>{r.status === "fechado" ? "Fechado" : "Aberto"}</span>
                  </td>
                  <td style={td}>{fmtBR2(r.original_meta)}</td>
                  <td style={{ ...td, fontWeight: 900 }}>{fmtBR2(r.actual_ton)}</td>
                  <td
                    style={{
                      ...td,
                      fontWeight: 900,
                      color:
                        r.gap_ton > 0
                          ? "#86efac"
                          : r.gap_ton < 0
                          ? "#fca5a5"
                          : "rgba(255,255,255,0.85)",
                    }}
                  >
                    {r.gap_ton > 0 ? "+" : ""}{fmtBR2(r.gap_ton)}
                  </td>
                  <td style={{ ...td, fontWeight: 950, color: r.status === "aberto" ? "#93c5fd" : "rgba(255,255,255,0.78)" }}>
                    {fmtBR2(r.adjusted_meta)}
                  </td>
                  <td style={{ ...td, fontWeight: 950 }}>{fmtBR2(r.meta_h_adjusted)} t/h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 10, color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 700, lineHeight: 1.55 }}>
        A tabela da direita usa o realizado da produção diária para recalcular só os dias em aberto. O realizado diário vem da soma das linhas Ton/H da página Produção do dia da planta selecionada; por isso, quando um dia fecha acima ou abaixo da meta, o saldo é redistribuído automaticamente entre os próximos dias.
      </div>
    </div>
  );
}
