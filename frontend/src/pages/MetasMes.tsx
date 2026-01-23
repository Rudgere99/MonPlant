import { useEffect, useMemo, useState } from "react";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

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

type GoalDay = { day: string; meta_ton: number; discount_hours: number };

function isoMonth(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
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

function fmtBR0(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function fmtBR2(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MetasMes() {
  const [month, setMonth] = useState<string>(() => isoMonth(new Date()));
  const [rows, setRows] = useState<GoalDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // presets rápidos
  const [presetMeta, setPresetMeta] = useState<string>("0");
  const [presetDiscount, setPresetDiscount] = useState<string>("2");

  const monthDays = useMemo(() => daysInMonth(month), [month]);

  const totalMes = useMemo(() => rows.reduce((acc, r) => acc + (Number(r.meta_ton) || 0), 0), [rows]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    setOkMsg(null);

    (async () => {
      try {
        const payload = await apiGet<{ month: string; days: any[] }>(`/api/goals/month/${encodeURIComponent(month)}`).catch(
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
  }, [month, monthDays]);

  function setRow(day: string, patch: Partial<GoalDay>) {
    setRows((prev) => prev.map((r) => (r.day === day ? { ...r, ...patch } : r)));
  }

  function applyPreset() {
    const m = Number(String(presetMeta).replace(",", "."));
    const d = Number(String(presetDiscount).replace(",", "."));
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        meta_ton: Number.isFinite(m) ? m : r.meta_ton,
        discount_hours: Number.isFinite(d) ? d : r.discount_hours,
      }))
    );
  }

  async function saveMonth() {
    setLoading(true);
    setErr(null);
    setOkMsg(null);

    try {
      await apiPut(`/api/goals/month/${encodeURIComponent(month)}`, {
        days: rows.map((r) => ({
          day: r.day,
          meta_ton: Number(r.meta_ton) || 0,
          discount_hours: Number(r.discount_hours) || 0,
        })),
      });
      setOkMsg("Metas do mês salvas.");
    } catch (e: any) {
      setErr(e?.message || "Falha ao salvar metas");
    } finally {
      setLoading(false);
    }
  }

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
    background: "rgba(10,12,16,0.92)",
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

  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: -0.3 }}>Metas por dia (mês)</div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: 800 }}>
            Mês&nbsp;
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{ ...input, width: 160, display: "inline-block" }}
            />
          </label>

          <button style={btnGreen} onClick={saveMonth} disabled={loading}>
            Salvar metas
          </button>
        </div>
      </div>

      <div style={{ ...card, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: 800 }}>
            Preset meta (t)
            <input value={presetMeta} onChange={(e) => setPresetMeta(e.target.value)} style={{ ...input, width: 140 }} />
          </label>
          <label style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: 800 }}>
            Desconto horas
            <input
              value={presetDiscount}
              onChange={(e) => setPresetDiscount(e.target.value)}
              style={{ ...input, width: 140 }}
            />
          </label>
          <button style={btn} onClick={applyPreset} disabled={loading}>
            Aplicar no mês
          </button>

          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: 800 }}>Meta do mês</div>
            <div style={{ fontSize: 22, fontWeight: 950 }}>{fmtBR0(totalMes)} t</div>
          </div>
        </div>

        {err ? (
          <div style={{ marginTop: 10, color: "#ff6b6b", fontWeight: 900 }}>{err}</div>
        ) : okMsg ? (
          <div style={{ marginTop: 10, color: "rgba(0,204,255,0.90)", fontWeight: 900 }}>{okMsg}</div>
        ) : null}
      </div>

      <div style={{ ...card, padding: 0, overflow: "auto", maxHeight: "70vh" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 140 }}>Dia</th>
              <th style={{ ...th, width: 180 }}>Meta do dia (t)</th>
              <th style={{ ...th, width: 180 }}>Desconto horas</th>
              <th style={{ ...th }}>Meta/hora (auto)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const meta = Number(r.meta_ton) || 0;
              const disc = Number(r.discount_hours) || 0;
              const horas = Math.max(0, 22 - disc);
              const metaH = meta > 0 && horas > 0 ? meta / horas : 0;

              return (
                <tr key={r.day}>
                  <td style={td}>{r.day}</td>
                  <td style={td}>
                    <input
                      style={input}
                      value={String(r.meta_ton).replace(".", ",")}
                      onChange={(e) => setRow(r.day, { meta_ton: Number(String(e.target.value).replace(",", ".")) || 0 })}
                    />
                  </td>
                  <td style={td}>
                    <input
                      style={input}
                      value={String(r.discount_hours).replace(".", ",")}
                      onChange={(e) =>
                        setRow(r.day, { discount_hours: Number(String(e.target.value).replace(",", ".")) || 0 })
                      }
                    />
                  </td>
                  <td style={{ ...td, fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>{fmtBR2(metaH)} t/h</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {loading ? (
          <div style={{ padding: 12, color: "rgba(255,255,255,0.65)", fontWeight: 800 }}>Carregando...</div>
        ) : null}
      </div>

      <div style={{ marginTop: 10, color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 700 }}>
        Obs.: o Dashboard passa a usar automaticamente a meta do dia via <code>/api/goals/day</code>.
      </div>
    </div>
  );
}
