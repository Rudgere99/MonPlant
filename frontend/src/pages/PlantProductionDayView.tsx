import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LabelList,
} from "recharts";

const API_BASE = import.meta.env.VITE_API_BASE;

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

const PERIODS = Array.from({ length: 24 }, (_, h) => {
  const a = String(h).padStart(2, "0");
  const b = String((h + 1) % 24).padStart(2, "0");
  return `${a}-${b}`;
});

export default function PlantProductionDayView() {
  const [day, setDay] = useState(todayISO());
  const [rows, setRows] = useState(
    PERIODS.map((p) => ({ period: p, ton: "", freq: "" }))
  );
  const [obs, setObs] = useState("");
  const [loading, setLoading] = useState(false);

  const totalTon = useMemo(
    () =>
      rows.reduce((s, r) => s + (Number(r.ton) || 0), 0),
    [rows]
  );

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        period: r.period,
        ton: r.ton ? Number(r.ton) : null,
        freq: r.freq ? Number(r.freq) : null,
      })),
    [rows]
  );

  async function loadDay() {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/plant-production/${day}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("mp_token")}`,
        },
      });
      if (r.ok) {
        const j = await r.json();
        setRows(
          PERIODS.map((p) => {
            const hit = j.rows?.find((x: any) => x.period === p);
            return {
              period: p,
              ton: hit?.ton ?? "",
              freq: hit?.freq ?? "",
            };
          })
        );
        setObs(j.obs ?? "");
      }
    } finally {
      setLoading(false);
    }
  }

  async function saveDay() {
    await fetch(`${API_BASE}/api/plant-production/${day}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("mp_token")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        obs,
        rows: rows.map((r) => ({
          period: r.period,
          ton: r.ton ? Number(r.ton) : null,
          freq: r.freq ? Number(r.freq) : null,
        })),
      }),
    });
    loadDay();
  }

  useEffect(() => {
    loadDay();
  }, [day]);

  const chunks = [
    rows.slice(0, 8),
    rows.slice(8, 16),
    rows.slice(16, 24),
  ];

  return (
    <div className="mp-container">
      {/* ===== Header ===== */}
      <div className="mp-page-title">
        <span className="mp-badge mp-badge-dev">DEV</span>{" "}
        PlantProductionDayView (DEV)
      </div>
      <div className="mp-page-sub">
        Editável qualquer dia • Dia {day.split("-").reverse().join("/")} • Total:{" "}
        <b>{totalTon} t</b>
      </div>

      {/* ===== Card Data + Ações ===== */}
      <div className="mp-card" style={{ marginTop: 12 }}>
        <div className="mp-card-h">
          <b>Produção do dia</b>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <div>
            <label className="mp-label">Data</label>
            <input
              type="date"
              className="mp-input"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </div>

          <button className="mp-btn" onClick={loadDay} disabled={loading}>
            Atualizar
          </button>

          <button className="mp-btn mp-btn-primary" onClick={saveDay}>
            Salvar (DEV)
          </button>
        </div>
      </div>

      {/* ===== Gráfico ===== */}
      <div className="mp-card" style={{ marginTop: 14 }}>
        <div className="mp-card-h">
          <b>Gráfico (Ton/H)</b>
          <span className="mp-badge mp-badge-dev">DEV</span>
        </div>

        <div style={{ height: 420 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis yAxisId="ton" />
              <YAxis yAxisId="freq" orientation="right" domain={[0, 100]} />
              <Tooltip />
              <Legend />

              <Bar
                yAxisId="ton"
                dataKey="ton"
                name="Ton/H"
                fill="#22c55e"
                radius={[6, 6, 0, 0]}
              />

              <Line
                yAxisId="freq"
                dataKey="freq"
                name="Frequência (%)"
                stroke="#f59e0b"
                strokeWidth={3}
                dot={{ r: 4 }}
              >
               <LabelList
  dataKey="freq"
  position="top"
  formatter={(v) =>
    typeof v === "number" ? `${Math.round(v)}%` : ""
  }
  fill="rgba(255,255,255,0.85)"
  fontSize={11}
  fontWeight={800}
  style={{
    paintOrder: "stroke",
    stroke: "rgba(0,0,0,0.7)",
    strokeWidth: 3,
  }}
/>

              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ===== Observação ===== */}
      <div className="mp-card" style={{ marginTop: 14 }}>
        <div className="mp-card-h">
          <b>Observação do dia</b>
          <span className="mp-badge mp-badge-dev">DEV</span>
        </div>

        <textarea
          className="mp-textarea"
          style={{ minHeight: 120 }}
          placeholder="Ex.: chuva, manutenção, falta de energia, etc."
          value={obs}
          onChange={(e) => setObs(e.target.value)}
        />
      </div>

      {/* ===== Edição Horária ===== */}
      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(260px,1fr))",
          gap: 12,
        }}
      >
        {chunks.map((c, i) => (
          <div className="mp-card" key={i}>
            <div className="mp-card-h">
              <b>{i === 0 ? "00–08" : i === 1 ? "08–16" : "16–24"}</b>
              <span className="mp-help">8 faixas</span>
            </div>

            <table className="mp-table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Ton/H</th>
                  <th>Freq %</th>
                </tr>
              </thead>
              <tbody>
                {c.map((r) => (
                  <tr key={r.period}>
                    <td>{r.period}</td>
                    <td>
                      <input
                        className="mp-input"
                        value={r.ton}
                        onChange={(e) => {
                          setRows((prev) =>
                            prev.map((x) =>
                              x.period === r.period
                                ? { ...x, ton: e.target.value }
                                : x
                            )
                          );
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="mp-input"
                        value={r.freq}
                        onChange={(e) => {
                          setRows((prev) =>
                            prev.map((x) =>
                              x.period === r.period
                                ? { ...x, freq: e.target.value }
                                : x
                            )
                          );
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
