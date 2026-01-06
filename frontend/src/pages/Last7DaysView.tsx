import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  isoTodayLocal,
  addDaysISO,
  loadPlantDayMerged,
  sumTonFromPayload,
} from "../lib/plantStorage";

export default function Last7DaysView() {
  const today = isoTodayLocal();

  const data = useMemo(() => {
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDaysISO(today, -i);
      const p = loadPlantDayMerged(d);
      arr.push({
        dia: d.split("-").reverse().join("/"),
        total: sumTonFromPayload(p),
      });
    }
    return arr;
  }, [today]);

  return (
    <div className="mp-container">
      <div className="mp-page-title">Últimos 7 dias</div>
      <div className="mp-page-sub">Produção acumulada diária</div>

      <div className="mp-card" style={{ marginTop: 14 }}>
        <div className="mp-card-b" style={{ height: 420 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid stroke="rgba(255,255,255,.08)" strokeDasharray="3 3" />
              <XAxis dataKey="dia" />
              <YAxis />
              <Tooltip />
              <Bar
                dataKey="total"
                fill="#22c55e"
                radius={[8, 8, 0, 0]}
                name="Total (t)"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
