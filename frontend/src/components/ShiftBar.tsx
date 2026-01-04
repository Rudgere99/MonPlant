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
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="text-sm font-extrabold">Lançamentos</div>

      <div className="ml-auto flex items-center gap-2">
        <div className="text-xs text-white/60">Data</div>
        <input
          type="date"
          value={day}
          onChange={(e) => {
            setDay(e.target.value);
            emit(e.target.value, turno);
          }}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="text-xs text-white/60">Turno</div>
        <select
          value={turno}
          onChange={(e) => {
            const t = Number(e.target.value) as Turno;
            setTurno(t);
            emit(day, t);
          }}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
        >
          <option value={1}>{labelTurno(1)}</option>
          <option value={2}>{labelTurno(2)}</option>
        </select>
      </div>
    </div>
  );
}
