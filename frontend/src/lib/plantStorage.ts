type PlantHourRow = { period: string; ton?: string | number | null; freq?: string | number | null };
type PlantDayPayload = { day: string; turno?: 1 | 2; obs?: string | null; rows: PlantHourRow[]; updated_at?: string | null };

const LS_PREFIX = "monplant:plant-production:";

function lsKey(day: string, turno: 1 | 2) {
  return `${LS_PREFIX}${day}:T${turno}`;
}

export function parseBRNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  let s = String(v).trim();
  if (!s) return null;

  s = s.replace("%", "").trim();
  s = s.replace(/\s/g, "");

  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function sumTonFromPayload(p: PlantDayPayload | null): number {
  if (!p?.rows?.length) return 0;
  let total = 0;
  for (const r of p.rows) {
    const n = parseBRNumber(r.ton);
    if (n !== null) total += Math.max(0, n);
  }
  return total;
}

export function loadPlantDay(day: string, turno: 1 | 2): PlantDayPayload | null {
  try {
    const raw = localStorage.getItem(lsKey(day, turno));
    if (!raw) return null;
    return JSON.parse(raw) as PlantDayPayload;
  } catch {
    return null;
  }
}

export function loadPlantDayMerged(day: string): PlantDayPayload | null {
  // soma Turno 1 + Turno 2 (se existir)
  const t1 = loadPlantDay(day, 1);
  const t2 = loadPlantDay(day, 2);

  if (!t1 && !t2) return null;

  const rows = [...(t1?.rows ?? []), ...(t2?.rows ?? [])];
  return { day, rows };
}

export function isoTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function addDaysISO(iso: string, delta: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
