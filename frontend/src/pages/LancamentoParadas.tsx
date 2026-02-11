import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";

/* ===================== helpers ===================== */

const API_BASE = String((import.meta as any)?.env?.VITE_API_BASE || "").replace(/\/+$/, "");

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

function clamp60(n: number) {
  return Math.max(0, Math.min(60, n));
}

function fmt1(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function makePeriods24(): string[] {
  const res: string[] = [];
  for (let h = 0; h < 24; h++) {
    const h2 = (h + 1) % 24;
    res.push(`${pad2(h)}-${pad2(h2)}`); // ex: 23-00
  }
  return res;
}

/* ===================== colors ===================== */

const TYPE_COLORS: Record<string, string> = {
  Corretiva: "#EF4444",
  Elétrica: "#F59E0B",
  Preventiva: "#22C55E",
  Operacional: "#3B82F6",
  Segurança: "#A855F7",
  Outros: "#94A3B8",
};

function normType(s: any) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function colorForType(type: any) {
  const t = normType(type);
  if (t.includes("corret")) return TYPE_COLORS.Corretiva;
  if (t.includes("elétr") || t.includes("eletr")) return TYPE_COLORS.Elétrica;
  if (t.includes("prevent")) return TYPE_COLORS.Preventiva;
  if (t.includes("operac")) return TYPE_COLORS.Operacional;
  if (t.includes("segur")) return TYPE_COLORS.Segurança;
  if (!t) return TYPE_COLORS.Outros;
  return TYPE_COLORS.Outros;
}

/* ===================== types ===================== */

type StopRow = {
  period: string;         // "03-04"
  equipamento: string;    // "PN-01"
  tipo_parada: string;    // "Corretiva"
  descricao: string;      // texto
  minutos: number;        // 0..60
};

type StopDayPayload = {
  day: string;
  rows: StopRow[];
};

/* ===================== UI small ===================== */

function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        background: color,
        display: "inline-block",
        boxShadow: "0 0 0 2px rgba(0,0,0,0.45)",
      }}
    />
  );
}

const cardStyle: React.CSSProperties = {
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(14,18,22,0.78)",
  padding: 16,
};

const labelStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.55)",
  fontWeight: 900,
  fontSize: 12,
  letterSpacing: 0.2,
  textTransform: "uppercase",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.92)",
  padding: "10px 12px",
  outline: "none",
  fontWeight: 800,
};

const btnStyle: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.90)",
  padding: "10px 12px",
  fontWeight: 900,
  cursor: "pointer",
};

/* ===================== main ===================== */

export default function LancamentoParadas() {
  const periods = useMemo(() => makePeriods24(), []);
  const [day, setDay] = useState<string>(isoTodayLocal());

  const [rows, setRows] = useState<StopRow[]>(() =>
    periods.map((p) => ({
      period: p,
      equipamento: "",
      tipo_parada: "",
      descricao: "",
      minutos: 0,
    }))
  );

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // ✅ ajuste conforme seu cadastro real
  const equipmentOptions = useMemo(() => ["BT-01", "BT-02", "PN-01", "PN-02", "EH-08", "EH-05"], []);
  const stopTypes = useMemo(
    () => ["Operacional", "Preventiva", "Corretiva", "Elétrica", "Segurança"],
    []
  );

  async function load() {
    if (!API_BASE) {
      setMsg("VITE_API_BASE não configurado.");
      return;
    }

    setLoading(true);
    setMsg("");

    try {
      // ⚠️ Ajuste se seu endpoint for diferente
      const r = await fetch(`${API_BASE}/api/stops-launch?day=${encodeURIComponent(day)}`, {
        headers: { ...authHeaders() },
      });

      if (r.status === 404) {
        // mantém padrão vazio
        setLoading(false);
        return;
      }

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `HTTP ${r.status}`);
      }

      const data = (await r.json()) as StopDayPayload;

      // cria mapa por period p/ manter 24 linhas
      const map: Record<string, StopRow> = {};
      for (const x of data.rows || []) {
        const p = (x as any).period;
        map[p] = {
          period: p,
          // backend pode retornar pt-BR (equipamento/tipo_parada/descricao/minutos)
          // ou inglês (equipment/stop_type/description/minutes)
          equipamento: (x as any).equipamento ?? (x as any).equipment ?? "",
          tipo_parada: (x as any).tipo_parada ?? (x as any).stop_type ?? "",
          descricao: (x as any).descricao ?? (x as any).description ?? "",
          minutos: Number((x as any).minutos ?? (x as any).minutes ?? 0),
        };
      }

      setRows(
        periods.map((p) => ({
          period: p,
          equipamento: map[p]?.equipamento ?? "",
          tipo_parada: map[p]?.tipo_parada ?? "",
          descricao: map[p]?.descricao ?? "",
          minutos: clamp60(Number(map[p]?.minutos ?? 0)),
        }))
      );
    } catch (e: any) {
      setMsg(e?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!API_BASE) {
      setMsg("VITE_API_BASE não configurado.");
      return;
    }

    setSaving(true);
    setMsg("");

    try {
      // manda sempre as 24 linhas (mesmo zeradas) para manter histórico completo no banco
      const normalized = rows.map((r) => ({
        ...r,
        minutos: clamp60(Number(r.minutos || 0)),
      }));

      const body: StopDayPayload = { day, rows: normalized };

      // ⚠️ Ajuste se seu endpoint for diferente
      const r = await fetch(`${API_BASE}/api/stops-launch?day=${encodeURIComponent(day)}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `HTTP ${r.status}`);
      }

      setMsg("Salvo com sucesso.");
      await load();
    } catch (e: any) {
      setMsg(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const totalMinutes = useMemo(() => rows.reduce((s, r) => s + clamp60(Number(r.minutos || 0)), 0), [rows]);
  const totalHours = totalMinutes / 60;

  const pieData = useMemo(() => {
    const agg: Record<string, number> = {};
    for (const r of rows) {
      const min = clamp60(Number(r.minutos || 0));
      if (min <= 0) continue;

      const tp = (r.tipo_parada || "Outros").trim() || "Outros";
      agg[tp] = (agg[tp] || 0) + min / 60;
    }

    return Object.entries(agg)
      .map(([type, hours]) => ({ type, hours: Number(hours.toFixed(2)) }))
      .sort((a, b) => b.hours - a.hours);
  }, [rows]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...cardStyle, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 980, fontSize: 20 }}>Lançamento de Paradas</div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontWeight: 800, marginTop: 2 }}>
            {loading ? "Carregando..." : msg ? msg : "Lance paradas por hora (máx. 60 min por faixa)."}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={labelStyle}>Data</div>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={inputStyle as any} />
          </div>

          <button onClick={load} style={btnStyle} disabled={loading}>
            Atualizar
          </button>

          <button onClick={save} style={{ ...btnStyle, background: "rgba(16,185,129,0.16)", borderColor: "rgba(16,185,129,0.35)" }} disabled={saving || loading}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      {/* chart */}
      <div style={{ ...cardStyle, display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 950 }}>Horas por tipo de parada</div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontWeight: 800, marginTop: 2 }}>
              Total: {fmt1(totalHours)}h
            </div>
          </div>

          {/* legenda global discreta */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", color: "rgba(255,255,255,0.65)", fontWeight: 850, fontSize: 12 }}>
            {["Operacional", "Preventiva", "Corretiva", "Elétrica", "Segurança"].map((t) => (
              <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Dot color={colorForType(t)} /> {t}
              </span>
            ))}
          </div>
        </div>

        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="hours"
                nameKey="type"
                innerRadius={70}
                outerRadius={115}
                paddingAngle={2}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={1}
              >
                {pieData.map((entry, idx) => (
                  <Cell key={`c-${idx}`} fill={colorForType(entry.type)} />
                ))}
              </Pie>

              <Tooltip
                contentStyle={{
                  background: "rgba(0,0,0,0.85)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 12,
                }}
                formatter={(v: any) => [`${fmt1(Number(v || 0))} h`, "Horas"]}
                labelFormatter={(l: any) => String(l || "")}
              />

              <Legend
                formatter={(value: any) => (
                  <span style={{ color: "rgba(255,255,255,0.72)", fontWeight: 900 }}>
                    {String(value)}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* table */}
      <div style={cardStyle}>
        <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 950, marginBottom: 10 }}>
          Lançamento por hora (00-01 … 23-00)
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 10px", minWidth: 920 }}>
            <thead>
              <tr style={{ color: "rgba(255,255,255,0.55)", fontWeight: 900, fontSize: 12 }}>
                <th style={{ textAlign: "left", padding: "0 10px" }}>Hora</th>
                <th style={{ textAlign: "left", padding: "0 10px" }}>Equipamento</th>
                <th style={{ textAlign: "left", padding: "0 10px" }}>Tipo</th>
                <th style={{ textAlign: "left", padding: "0 10px" }}>Descrição</th>
                <th style={{ textAlign: "left", padding: "0 10px" }}>Minutos (0–60)</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r, idx) => {
                const c = colorForType(r.tipo_parada);

                return (
                  <tr key={r.period} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={{ padding: "10px 10px", color: "rgba(255,255,255,0.85)", fontWeight: 950 }}>
                      {r.period}
                    </td>

                    <td style={{ padding: "10px 10px" }}>
                      <select
                        style={inputStyle}
                        value={r.equipamento}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], equipamento: v };
                            return next;
                          });
                        }}
                      >
                        <option value="">—</option>
                        {equipmentOptions.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={{ padding: "10px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Dot color={c} />
                        <select
                          style={inputStyle}
                          value={r.tipo_parada}
                          onChange={(e) => {
                            const v = e.target.value;
                            setRows((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], tipo_parada: v };
                              return next;
                            });
                          }}
                        >
                          <option value="">—</option>
                          {stopTypes.map((x) => (
                            <option key={x} value={x}>
                              {x}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>

                    <td style={{ padding: "10px 10px" }}>
                      <input
                        style={inputStyle}
                        value={r.descricao}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], descricao: v };
                            return next;
                          });
                        }}
                        placeholder="Ex.: troca de correia / limpeza / ajuste / etc."
                      />
                    </td>

                    <td style={{ padding: "10px 10px" }}>
                      <input
                        style={inputStyle}
                        type="number"
                        min={0}
                        max={60}
                        value={String(r.minutos ?? 0)}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          const v = Number.isFinite(raw) ? clamp60(raw) : 0;

                          setRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], minutos: v };
                            return next;
                          });
                        }}
                        placeholder="0-60"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, color: "rgba(255,255,255,0.55)", fontWeight: 850, fontSize: 12 }}>
          Obs.: o campo minutos é limitado em <b>60</b> por faixa horária.
        </div>
      </div>
    </div>
  );
}
