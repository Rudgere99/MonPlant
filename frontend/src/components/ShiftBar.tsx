import { useMemo, useState } from "react";
import { getTurnoFromNow, labelTurno } from "../utils/shift";
import type { Turno } from "../utils/shift";

type Props = {
  onChange?: (v: { day: string; turno: Turno }) => void;
};

export default function ShiftBar({ onChange }: Props) {
  const today = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const [day, setDay] = useState<string>(today);
  const [turno, setTurno] = useState<Turno>(getTurnoFromNow());

  function emit(nextDay = day, nextTurno = turno) {
    onChange?.({ day: nextDay, turno: nextTurno });
  }

  return (
    <div className="mp-card" style={{ marginBottom: 14 }}>
      <div className="mp-card-h">
        <b>Lançamentos</b>
        <span className="mp-help">Data e turno</span>
      </div>

      <div className="mp-card-b" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div className="mp-label">Data</div>
          <input
            type="date"
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              emit(e.target.value, turno);
            }}
            className="mp-input"
            style={{ width: 190 }}
          />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div className="mp-label">Turno</div>
          <select
            value={turno}
            onChange={(e) => {
              const t = Number(e.target.value) as Turno;
              setTurno(t);
              emit(day, t);
            }}
            className="mp-select"
            style={{ width: 190, height: 40 }}
          >
            <option value={1}>{labelTurno(1)}</option>
            <option value={2}>{labelTurno(2)}</option>
          </select>
        </div>

        <div style={{ marginLeft: "auto" }} className="mp-help">
          {labelTurno(turno)}
        </div>
      </div>
    </div>
  );
}
