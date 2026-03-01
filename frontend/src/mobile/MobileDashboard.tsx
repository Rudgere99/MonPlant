import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, RefreshCw } from "lucide-react";
import MobileShell from "./MobileShell";
import { apiGet } from "../utils/api";

type ProdRowAny = any;

function isoTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function num(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace("%", "").trim();
  s = s.replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmt0(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function fmt1(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function fmtPct(n: number, d = 0) {
  return `${(Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
}

function safeDayLabel(dayISO: string) {
  const m = dayISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dayISO;
  return `${m[3]}/${m[2]}`;
}

function normalizeProdRows(rows: ProdRowAny[]) {
  return (rows || [])
    .filter((r) => r?.label || r?.period)
    .map((r) => {
      const label = String(r.label ?? r.period ?? "");
      const ton = num(r.value ?? r.ton ?? 0);
      const freq = r.freq !== undefined ? num(r.freq) : null;
      return { label, ton, freq };
    });
}

function hoursRemaining(dayISO: string) {
  const today = isoTodayLocal();
  if (dayISO < today) return 0;
  if (dayISO > today) return 24;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  return Math.max(0, (1440 - mins) / 60);
}

function movingAvg(values: number[], window = 4) {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const a = Math.max(0, i - window + 1);
    const slice = values.slice(a, i + 1);
    const s = slice.reduce((acc, v) => acc + (Number(v) || 0), 0);
    out.push(slice.length ? s / slice.length : 0);
  }
  return out;
}

function Gauge({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(120, pct));
  const rot = -90 + (p / 120) * 180;
  return (
    <div style={{ position: "relative", height: 120, width: "100%", display: "grid", placeItems: "center" }}>
      <div
        style={{
          width: 190,
          height: 95,
          borderTopLeftRadius: 200,
          borderTopRightRadius: 200,
          border: "10px solid rgba(255,255,255,0.10)",
          borderBottom: "none",
          boxSizing: "border-box",
          position: "relative",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 190,
          height: 95,
          borderTopLeftRadius: 200,
          borderTopRightRadius: 200,
          border: "10px solid rgba(245,158,11,0.55)",
          borderBottom: "none",
          boxSizing: "border-box",
          transform: `rotate(${Math.max(-90, Math.min(90, rot))}deg)`,
          transformOrigin: "50% 100%",
          filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.45))",
        }}
      />
      <div style={{ position: "absolute", bottom: 6, textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 950 }}>{fmtPct(pct, 0)}</div>
        <div className="mp-muted mp-small" style={{ marginTop: -2 }}>
          Atingimento
        </div>
      </div>
    </div>
  );
}

export default function MobileDashboard() {
  const [day, setDay] = useState(isoTodayLocal());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [prod, setProd] = useState<any>(null);
  const [last7, setLast7] = useState<any>(null);
  const [stops, setStops] = useState<any>(null);
  const [hori, setHori] = useState<any>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [p, l7, s, h] = await Promise.all([
        apiGet<any>(`/api/plant-production/${encodeURIComponent(day)}`),
        apiGet<any>(`/api/plant-production/last7days`).catch(() => null),
        apiGet<any>(`/api/stops?day=${encodeURIComponent(day)}`).catch(() => null),
        apiGet<any>(`/api/horimetros/last-by-eq`).catch(() => null),
      ]);
      setProd(p);
      setLast7(l7);
      setStops(s);
      setHori(h);
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar.");
      setProd(null);
      setLast7(null);
      setStops(null);
      setHori(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const rows = useMemo(() => normalizeProdRows(prod?.rows || []), [prod]);
  const meta = useMemo(() => num(prod?.meta_day ?? prod?.meta_ton ?? prod?.meta ?? prod?.planned_ton ?? 0), [prod]);

  const totalDay = useMemo(() => rows.reduce((a, r) => a + (r.ton || 0), 0), [rows]);
  const attainment = useMemo(() => (meta > 0 ? (totalDay / meta) * 100 : 0), [meta, totalDay]);

  const avgTonH = useMemo(() => {
    const filled = rows.map((r) => r.ton).filter((v) => (Number(v) || 0) > 0);
    if (!filled.length) return 0;
    return filled.reduce((a, v) => a + v, 0) / filled.length;
  }, [rows]);

  const projection = useMemo(() => totalDay + avgTonH * hoursRemaining(day), [day, totalDay, avgTonH]);
  const projDiff = useMemo(() => (meta > 0 ? projection - meta : 0), [projection, meta]);

  const mediaHoraData = useMemo(() => {
    const vals = rows.map((r) => r.ton);
    const avg = movingAvg(vals, 4);
    return rows.map((r, i) => ({ label: r.label, ton: vals[i] || 0, avg: avg[i] || 0 }));
  }, [rows]);

  const freqLastHours = useMemo(() => {
    const f = rows
      .map((r) => (r.freq === null ? null : Number(r.freq)))
      .filter((v) => v !== null && Number.isFinite(v as number)) as number[];
    if (!f.length) return null;
    const last = f.slice(-6);
    const avg = last.reduce((a, v) => a + v, 0) / last.length;
    return { avg, series: last };
  }, [rows]);

  const freqBars = useMemo(() => {
    const last = freqLastHours?.series || [];
    const start = Math.max(0, rows.length - last.length);
    return last.map((v, i) => ({ label: rows[start + i]?.label ?? String(i + 1), v }));
  }, [freqLastHours, rows]);

  const chartMain = useMemo(() => rows.map((r) => ({ label: r.label, ton: r.ton, freq: r.freq ?? undefined })), [rows]);

  const last7Items = useMemo(() => {
    const items = Array.isArray(last7?.items) ? last7.items : Array.isArray(last7) ? last7 : [];
    return items
      .map((it: any) => ({
        day: String(it.day ?? it.date ?? it.label ?? ""),
        label: safeDayLabel(String(it.day ?? it.date ?? it.label ?? "")),
        total: num(it.total ?? it.value ?? 0),
      }))
      .filter((x: any) => x.day)
      .slice(-7);
  }, [last7]);

  const last7Chart = useMemo(() => last7Items.map((x: any) => ({ label: x.label, total: x.total })), [last7Items]);

  const stopsCount = useMemo(() => num(stops?.total ?? stops?.count ?? 0), [stops]);
  const lastStopLabel = useMemo(() => {
    const s = stops?.last || stops?.last_stop || null;
    if (!s) return "—";
    const t = String(s?.start ?? s?.time ?? "").trim();
    const motivo = String(s?.reason ?? s?.type ?? s?.motivo ?? "").trim();
    if (t && motivo) return `${t} • ${motivo}`;
    return motivo || t || "—";
  }, [stops]);

  const horis = useMemo(() => {
    const items = Array.isArray(hori?.items) ? hori.items : Array.isArray(hori) ? hori : [];
    return items
      .map((it: any) => ({
        eq: String(it.eq ?? it.equip ?? it.equipment ?? ""),
        ini: String(it.horimetro_ini ?? it.ini ?? ""),
        fim: String(it.horimetro_fim ?? it.fim ?? ""),
        day: String(it.day ?? it.data ?? ""),
        shift: String(it.shift ?? it.turno ?? ""),
      }))
      .filter((x: any) => x.eq);
  }, [hori]);

  function exportStub() {
    alert("Me diga qual endpoint de export você usa no Dashboard desktop (PDF/PNG/XLSX) que eu ligo aqui.");
  }

  return (
    <MobileShell title="Dashboard" active="dashboard">
      <div className="mp-card" style={{ borderRadius: 18 }}>
        <div className="mp-card-h mp-card-h-mobile" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label className="mp-small mp-muted">Data</label>
            <input className="mp-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ height: 42 }} />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", width: "100%" }}>
            <button className="mp-btn" onClick={load} disabled={loading} style={{ flex: 1 }} type="button">
              <RefreshCw size={16} /> {loading ? "Atualizando..." : "Atualizar"}
            </button>
            <button className="mp-btn" onClick={exportStub} style={{ flex: 1 }} type="button">
              <Download size={16} /> Exportar
            </button>
          </div>
        </div>

        <div className="mp-muted mp-small" style={{ marginTop: 8 }}>
          Dashboard • {safeDayLabel(day)} • tempo real
        </div>

        {err ? <div style={{ marginTop: 10, color: "rgba(248,113,113,0.95)", fontWeight: 900 }}>{err}</div> : null}
      </div>

      <div className="mp-card" style={{ borderRadius: 18, marginTop: 12 }}>
        <div className="mp-card-h mp-card-h-mobile">
          <div>
            <div style={{ fontWeight: 950 }}>Produção por hora (Ton/H + Frequência)</div>
            <div className="mp-muted mp-small">Total do dia: {fmt1(totalDay)} t</div>
          </div>
          <div className="mp-pill">{loading ? "Atualizando..." : "Atualizado"}</div>
        </div>

        <div style={{ height: 260, marginTop: 10 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartMain} margin={{ left: 4, right: 12, top: 6, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="label" tick={{ fill: "rgba(226,232,240,0.65)", fontSize: 12 }} interval={2} />
              <YAxis yAxisId="left" tick={{ fill: "rgba(226,232,240,0.65)", fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: "rgba(226,232,240,0.55)", fontSize: 12 }} />
              <Tooltip
                contentStyle={{ background: "rgba(2,6,23,0.92)", border: "1px solid rgba(148,163,184,0.20)", borderRadius: 14 }}
                labelStyle={{ color: "rgba(226,232,240,0.85)", fontWeight: 800 }}
                itemStyle={{ color: "rgba(226,232,240,0.85)" }}
                formatter={(v: any, name: any) => {
                  if (name === "ton") return [`${fmt1(num(v))} t/h`, "Ton/H"];
                  if (name === "freq") return [`${fmt1(num(v))}%`, "Frequência"];
                  return [String(v), String(name)];
                }}
              />
              <Bar yAxisId="left" dataKey="ton" radius={[10, 10, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="freq" dot={false} strokeWidth={2} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mp-muted mp-small" style={{ marginTop: 10 }}>
          Se a linha de Frequência não aparecer, é porque o backend não está retornando <b>freq</b> em /api/plant-production/{`{day}`}.
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        <div className="mp-card" style={{ borderRadius: 18 }}>
          <div className="mp-card-h mp-card-h-mobile">
            <div>
              <div style={{ fontWeight: 950 }}>Taxa Média</div>
              <div className="mp-muted mp-small">Freq% últimas horas</div>
            </div>
            <div className="mp-pill">{freqLastHours ? fmtPct(freqLastHours.avg, 0) : "—"}</div>
          </div>

          <div style={{ height: 160, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={freqBars} margin={{ left: 4, right: 12, top: 6, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="label" tick={{ fill: "rgba(226,232,240,0.65)", fontSize: 12 }} interval={0} />
                <YAxis domain={[0, 100]} tick={{ fill: "rgba(226,232,240,0.65)", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: "rgba(2,6,23,0.92)", border: "1px solid rgba(148,163,184,0.20)", borderRadius: 14 }}
                  formatter={(v: any) => [`${fmt1(num(v))}%`, "Frequência"]}
                />
                <Bar dataKey="v" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mp-card" style={{ borderRadius: 18 }}>
          <div className="mp-card-h mp-card-h-mobile">
            <div>
              <div style={{ fontWeight: 950 }}>Produção do dia</div>
              <div className="mp-muted mp-small">Meta: {meta ? `${fmt0(meta)} t` : "—"}</div>
            </div>
            <div className="mp-pill" style={{ color: projDiff >= 0 ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)" }}>
              Projeção {projDiff >= 0 ? "+" : ""}
              {fmt0(projDiff)} t
            </div>
          </div>

          <Gauge pct={attainment} />

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
            <div>
              <div className="mp-muted mp-small">Atingimento</div>
              <div style={{ fontWeight: 950 }}>{fmt0(totalDay)} t</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="mp-muted mp-small">Projeção</div>
              <div style={{ fontWeight: 950 }}>{fmt0(projection)} t</div>
            </div>
          </div>
        </div>

        <div className="mp-card" style={{ borderRadius: 18 }}>
          <div className="mp-card-h mp-card-h-mobile">
            <div>
              <div style={{ fontWeight: 950 }}>Média/Hora</div>
              <div className="mp-muted mp-small">Média de produção por hora</div>
            </div>
            <div className="mp-pill">{fmt1(avgTonH)} t/h</div>
          </div>

          <div style={{ height: 180, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mediaHoraData} margin={{ left: 4, right: 12, top: 6, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="label" tick={{ fill: "rgba(226,232,240,0.65)", fontSize: 12 }} interval={2} />
                <YAxis tick={{ fill: "rgba(226,232,240,0.65)", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: "rgba(2,6,23,0.92)", border: "1px solid rgba(148,163,184,0.20)", borderRadius: 14 }}
                  formatter={(v: any, name: any) => {
                    if (name === "ton") return [`${fmt1(num(v))} t/h`, "Ton/H"];
                    if (name === "avg") return [`${fmt1(num(v))} t/h`, "Média (4h)"];
                    return [String(v), String(name)];
                  }}
                />
                <Line type="monotone" dataKey="ton" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="avg" dot={false} strokeWidth={2} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mp-muted mp-small" style={{ marginTop: 8 }}>Considera somente horas preenchidas (Ton/H &gt; 0).</div>
        </div>
      </div>

      <div className="mp-card" style={{ borderRadius: 18, marginTop: 12 }}>
        <div className="mp-card-h mp-card-h-mobile">
          <div>
            <div style={{ fontWeight: 950 }}>Últimos 7 dias</div>
            <div className="mp-muted mp-small">Total por dia</div>
          </div>
        </div>

        <div style={{ height: 180, marginTop: 10 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={last7Chart} margin={{ left: 4, right: 12, top: 6, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="label" tick={{ fill: "rgba(226,232,240,0.65)", fontSize: 12 }} />
              <YAxis tick={{ fill: "rgba(226,232,240,0.65)", fontSize: 12 }} />
              <Tooltip
                contentStyle={{ background: "rgba(2,6,23,0.92)", border: "1px solid rgba(148,163,184,0.20)", borderRadius: 14 }}
                formatter={(v: any) => [`${fmt0(num(v))} t`, "Total"]}
              />
              <Area type="monotone" dataKey="total" strokeWidth={2} fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mp-card" style={{ borderRadius: 18, marginTop: 12 }}>
        <div className="mp-card-h mp-card-h-mobile">
          <div>
            <div style={{ fontWeight: 950 }}>Hoje</div>
            <div className="mp-muted mp-small">Resumo • Paradas + Horímetro</div>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="mp-card" style={{ borderRadius: 16 }}>
            <div className="mp-muted mp-small">Última Parada</div>
            <div style={{ marginTop: 6, fontWeight: 900 }}>{lastStopLabel}</div>
          </div>
          <div className="mp-card" style={{ borderRadius: 16 }}>
            <div className="mp-muted mp-small">Total de Paradas</div>
            <div style={{ marginTop: 6, fontWeight: 950, fontSize: 22 }}>{fmt0(stopsCount)}</div>
          </div>
        </div>
      </div>

      <div className="mp-card" style={{ borderRadius: 18, marginTop: 12 }}>
        <div className="mp-card-h mp-card-h-mobile">
          <div>
            <div style={{ fontWeight: 950 }}>Horímetros</div>
            <div className="mp-muted mp-small">{horis.length ? `${horis.length} equipamentos` : "Sem dados"}</div>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {horis.slice(0, 8).map((h: any) => (
            <div key={h.eq} className="mp-card" style={{ borderRadius: 16, padding: 12, display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div className="mp-pill">{h.eq}</div>
                <div>
                  <div style={{ fontWeight: 950 }}>{h.ini} → {h.fim}</div>
                  <div className="mp-muted mp-small">{h.day ? safeDayLabel(h.day) : ""}{h.shift ? ` • ${h.shift}` : ""}</div>
                </div>
              </div>
              <button className="mp-btn" type="button" onClick={() => alert("Se quiser, eu ligo este 'Ver' numa página /m/horimetros.")}>
                Ver
              </button>
            </div>
          ))}
          {!horis.length && !loading ? (
            <div className="mp-muted">Sem horímetros retornados pelo endpoint <b>/api/horimetros/last-by-eq</b>.</div>
          ) : null}
        </div>
      </div>
    </MobileShell>
  );
}
