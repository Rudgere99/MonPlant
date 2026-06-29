export type Turno = 1 | 2;

export function getTurnoFromNow(date = new Date()): Turno {
  // Padrão:
  // Turno 1: 07:00–19:00
  // Turno 2: 19:00–07:00
  const h = date.getHours();
  return h >= 7 && h < 19 ? 1 : 2;
}

export function labelTurno(t: Turno) {
  return t === 1 ? "Turno 1" : "Turno 2";
}
