import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";

/* ===================== Datas ===================== */
function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function parseISODate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function dateRange(fromYMD: string, toYMD: string) {
  const a = parseISODate(fromYMD);
  const b = parseISODate(toYMD);
  const out: string[] = [];
  let cur = new Date(a);
  while (cur <= b) {
    out.push(ymd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/* ===================== API ===================== */
function authHeaders(): Record<string, string> {
  const keys = ["mp_token", "token", "access_token", "auth_token"];
  for (const k of keys) {
    const v = (localStorage.getItem(k) || "").trim();
    if (v) return { Authorization: `Bearer ${v}` };
  }
  return {};
}
async function apiGet<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders(),
  };
  const r = await fetch(`${API_BASE}${path}`, { headers });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText} - ${txt}`);
  }
  return (await r.json()) as T;
}

type PlantRow = { period: string; ton: number | null; freq: number | null };
type PlantDay = { day: string; obs?: string | null; rows: PlantRow[] };
type StopItem = any;
type HoriItem = any;

function pick(obj: any, keys: string[]) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return null;
}

/* ===================== Sheet Helpers ===================== */
function getOrCreateSheet(wb: XLSX.WorkBook, name: string) {
  let ws = wb.Sheets[name];
  if (!ws) {
    ws = XLSX.utils.aoa_to_sheet([]);
    wb.Sheets[name] = ws;
    wb.SheetNames.push(name);
  }
  return ws;
}

function getCell(ws: XLSX.WorkSheet, r1: number, c1: number) {
  const addr = XLSX.utils.encode_cell({ r: r1 - 1, c: c1 - 1 });
  return ws[addr];
}
function getCellValue(ws: XLSX.WorkSheet, r1: number, c1: number) {
  return getCell(ws, r1, c1)?.v;
}
function setCell(ws: XLSX.WorkSheet, r1: number, c1: number, value: any) {
  const addr = XLSX.utils.encode_cell({ r: r1 - 1, c: c1 - 1 });
  ws[addr] = ws[addr] || ({ t: "s", v: "" } as any);

  if (value === null || value === undefined || value === "") {
    ws[addr].t = "s";
    ws[addr].v = "";
    delete (ws[addr] as any).f;
    return;
  }

  if (value instanceof Date) {
    ws[addr].t = "d";
    ws[addr].v = value;
    delete (ws[addr] as any).f;
    return;
  }

  if (typeof value === "number") {
    ws[addr].t = "n";
    ws[addr].v = value;
    delete (ws[addr] as any).f;
    return;
  }

  ws[addr].t = "s";
  ws[addr].v = String(value);
  delete (ws[addr] as any).f;
}

function ensureRef(ws: XLSX.WorkSheet, r1: number, c1: number) {
  const cell = { r: r1 - 1, c: c1 - 1 };
  if (!ws["!ref"]) {
    ws["!ref"] = XLSX.utils.encode_range(cell, cell);
    return;
  }
  const rng = XLSX.utils.decode_range(ws["!ref"]);
  rng.s.r = Math.min(rng.s.r, cell.r);
  rng.s.c = Math.min(rng.s.c, cell.c);
  rng.e.r = Math.max(rng.e.r, cell.r);
  rng.e.c = Math.max(rng.e.c, cell.c);
  ws["!ref"] = XLSX.utils.encode_range(rng);
}

function downloadArrayBuffer(buf: ArrayBuffer, filename: string) {
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ===================== Excel date normalization ===================== */
function asYMDFromCell(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;

  if (v instanceof Date && !Number.isNaN(v.getTime())) return ymd(v);

  if (typeof v === "number" && Number.isFinite(v)) {
    const dc = XLSX.SSF.parse_date_code(v);
    if (dc && dc.y && dc.m && dc.d) {
      return `${dc.y}-${String(dc.m).padStart(2, "0")}-${String(dc.d).padStart(2, "0")}`;
    }
  }

  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    const yyyy = Number(m1[3]);
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }

  const m2 = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m2) {
    const dd = Number(m2[1]);
    const mm = Number(m2[2]);
    const yyyy = Number(m2[3]);
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return ymd(d);

  return null;
}

function findRowByDate(ws: XLSX.WorkSheet, dateCol: number, startRow: number, targetYMD: string) {
  const ref = ws["!ref"];
  if (!ref) return null;
  const rng = XLSX.utils.decode_range(ref);
  for (let r = startRow; r <= rng.e.r + 1; r++) {
    const got = asYMDFromCell(getCellValue(ws, r, dateCol));
    if (got === targetYMD) return r;
  }
  return null;
}

function findLastNonEmptyRow(ws: XLSX.WorkSheet, col: number, startRow: number) {
  const ref = ws["!ref"];
  if (!ref) return startRow;
  const rng = XLSX.utils.decode_range(ref);

  let last = startRow;
  for (let r = startRow; r <= rng.e.r + 1; r++) {
    const v = getCellValue(ws, r, col);
    if (v !== undefined && v !== null && String(v).trim() !== "") last = r;
  }
  return last;
}

/* ===================== Formula row shifting (clone behavior) ===================== */
/**
 * Excel when you copy/paste a row, it updates relative refs.
 * We simulate it by shifting row numbers in refs inside formulas.
 * This is a "good enough" shifter for typical formulas: A1, $A1, A$1, $A$1.
 */
function shiftFormulaRows(formula: string, rowDelta: number) {
  // Match cell refs like $A$1, A$1, $A1, A1, and also ranges A1:B5 etc.
  // We shift only the row part if it is NOT absolute ($1 stays $1).
  return formula.replace(/(\$?[A-Z]{1,3})(\$?)(\d+)/g, (m, col, rowAbs, rowNum) => {
    if (rowAbs === "$") return `${col}${rowAbs}${rowNum}`; // absolute row stays
    const n = Number(rowNum);
    if (!Number.isFinite(n)) return m;
    return `${col}${n + rowDelta}`;
  });
}

/**
 * Clone a whole row (cells across columns) from srcRow to dstRow,
 * copying style, number formats, formulas, etc. and adjusting formulas by rowDelta.
 */
function cloneRow(ws: XLSX.WorkSheet, srcRow: number, dstRow: number) {
  const ref = ws["!ref"];
  if (!ref) return;
  const rng = XLSX.utils.decode_range(ref);
  const rowDelta = dstRow - srcRow;

  for (let c0 = rng.s.c; c0 <= rng.e.c; c0++) {
    const srcAddr = XLSX.utils.encode_cell({ r: srcRow - 1, c: c0 });
    const dstAddr = XLSX.utils.encode_cell({ r: dstRow - 1, c: c0 });

    const srcCell = ws[srcAddr];
    if (!srcCell) continue;

    // Deep-ish copy
    const copied: any = { ...srcCell };
    // If formula exists, shift
    if (copied.f && typeof copied.f === "string") {
      copied.f = shiftFormulaRows(copied.f, rowDelta);
    }

    ws[dstAddr] = copied;
    ensureRef(ws, dstRow, c0 + 1);
  }

  // Preserve row height if present
  (ws as any)["!rows"] = (ws as any)["!rows"] || [];
  if ((ws as any)["!rows"][srcRow - 1]) {
    (ws as any)["!rows"][dstRow - 1] = { ...(ws as any)["!rows"][srcRow - 1] };
  }
}

/* ===================== Turnos ===================== */
function getTurnoFromPeriod(period: any): "T1" | "T2" {
  const s = String(period || "").trim();
  const m = s.match(/(\d{1,2})\s*:\s*\d{2}/);
  const h = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(h)) return "T2";
  return h >= 7 && h < 19 ? "T1" : "T2";
}

/* ===================== Paradas (dedupe + append clonando) ===================== */
function toDateTimeParts(v: any) {
  if (!v) return { date: null as Date | null, hhmm: "" };
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return { date: null as Date | null, hhmm: "" };
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { date: d, hhmm: `${hh}:${mm}` };
}

function hoursDiff(start: any, end: any) {
  const a = new Date(String(start));
  const b = new Date(String(end));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const ms = b.getTime() - a.getTime();
  if (ms <= 0) return 0;
  return Math.round((ms / 3600000) * 100) / 100;
}

function normStr(v: any) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function buildExistingStopKeySet(ws: XLSX.WorkSheet, startRow: number) {
  const set = new Set<string>();
  const ref = ws["!ref"];
  if (!ref) return set;
  const rng = XLSX.utils.decode_range(ref);

  for (let r = startRow; r <= rng.e.r + 1; r++) {
    const dTurno = asYMDFromCell(getCellValue(ws, r, 1)) || "";
    const hi = normStr(getCellValue(ws, r, 5));
    const hf = normStr(getCellValue(ws, r, 6));
    const eq = normStr(getCellValue(ws, r, 7));
    const tipo = normStr(getCellValue(ws, r, 8));
    const ativ = normStr(getCellValue(ws, r, 9));
    const desc = normStr(getCellValue(ws, r, 10));
    const key = `${dTurno}|${hi}|${hf}|${eq}|${tipo}|${ativ}|${desc}`;
    if (key.replace(/\|/g, "").trim()) set.add(key);
  }
  return set;
}

/* ===================== Component ===================== */
export default function Exportar() {
  const today = useMemo(() => ymd(new Date()), []);
  const [fromDay, setFromDay] = useState(today);
  const [toDay, setToDay] = useState(today);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function handleExport() {
    setMsg("");
    setBusy(true);

    try {
      const tplRes = await fetch("/BASE_PLANTA.xlsx", { cache: "no-store" });
      if (!tplRes.ok) {
        throw new Error("Não achei template em /BASE_PLANTA.xlsx (coloque em public/BASE_PLANTA.xlsx)");
      }
      const tplBuf = await tplRes.arrayBuffer();

      const head = new Uint8Array(tplBuf.slice(0, 2));
      if (!(head[0] === 0x50 && head[1] === 0x4b)) {
        throw new Error("Template não é XLSX válido (veio HTML/erro).");
      }

      const wb = XLSX.read(tplBuf, { type: "array", cellDates: true });

      const days = dateRange(fromDay, toDay);

      // ====== baixa dados ======
      const plantDays: PlantDay[] = [];
      const allStops: StopItem[] = [];
      const allHor: HoriItem[] = [];

      for (const d of days) {
        try {
          plantDays.push(await apiGet<PlantDay>(`/api/plant-production/${d}`));
        } catch {
          plantDays.push({ day: d, obs: "", rows: [] });
        }

        try {
          const st = await apiGet<any[]>(`/api/stops?day=${d}`);
          for (const s of st || []) allStops.push(s);
        } catch {}

        try {
          const hh = await apiGet<any[]>(`/api/horimetros?day=${d}`);
          for (const h of hh || []) allHor.push(h);
        } catch {}
      }

      /* ===================== PLANILHA1 (Produção) ===================== */
      // Estrutura do seu template:
      // A Data | B Meta diaria | C Produção 1ºT | D Produção 2ºT | E Total produzido (fórmula)
      const wsProd = getOrCreateSheet(wb, "Planilha1");
      const prodStartRow = 2;

      // Mapa produção por dia
      const prodByDay = new Map<string, { t1: number; t2: number }>();
      for (const pd of plantDays) {
        let t1 = 0,
          t2 = 0;
        for (const r of pd.rows || []) {
          const ton = Number(r.ton) || 0;
          getTurnoFromPeriod(r.period) === "T1" ? (t1 += ton) : (t2 += ton);
        }
        prodByDay.set(pd.day, { t1, t2 });
      }

      // Append: só adiciona se a data ainda não existir
      let lastProdRow = findLastNonEmptyRow(wsProd, 1, prodStartRow);
      if (lastProdRow < prodStartRow) lastProdRow = prodStartRow;

      for (const d of days) {
        const exists = findRowByDate(wsProd, 1, prodStartRow, d);
        if (exists) continue;

        const srcRow = lastProdRow;        // última linha existente (modelo)
        const dstRow = lastProdRow + 1;    // nova linha no final
        cloneRow(wsProd, srcRow, dstRow);

        // Escreve a DATA no padrão (mantém formato pela célula clonada)
        setCell(wsProd, dstRow, 1, parseISODate(d));

        const v = prodByDay.get(d) || { t1: 0, t2: 0 };
        setCell(wsProd, dstRow, 3, v.t1 || "");
        setCell(wsProd, dstRow, 4, v.t2 || "");

        lastProdRow = dstRow;
      }

      /* ===================== HORÍMETROS ===================== */
      // Pela sua planilha:
      // A Data
      // B/C BT01 ini/fim
      // D/E BT02 ini/fim
      // F/G PN01 ini/fim
      // H/I PN02 ini/fim
      // J Turno
      // K..N h.Tr... (geralmente fórmula)
      const wsHor = getOrCreateSheet(wb, "HORÍMETROS");
      const horStartRow = 2;

      const horByDay = new Map<string, HoriItem[]>();
      for (const h of allHor) {
        const d = pick(h, ["day", "data", "data_turno"]);
        if (!d) continue;
        const key = String(d).slice(0, 10);
        const arr = horByDay.get(key) || [];
        arr.push(h);
        horByDay.set(key, arr);
      }

      let lastHorRow = findLastNonEmptyRow(wsHor, 1, horStartRow);
      if (lastHorRow < horStartRow) lastHorRow = horStartRow;

      for (const d of days) {
        const exists = findRowByDate(wsHor, 1, horStartRow, d);
        if (exists) continue;

        const srcRow = lastHorRow;
        const dstRow = lastHorRow + 1;
        cloneRow(wsHor, srcRow, dstRow);

        // Data
        setCell(wsHor, dstRow, 1, parseISODate(d));

        // Agrupa por equipamento
        const list = horByDay.get(d) || [];
        const byEq = new Map<string, { ini: number | null; fim: number | null; turno: any }>();

        for (const h of list) {
          const eq = String(pick(h, ["equipamento", "equipment", "eq", "tag"]) || "")
            .toUpperCase()
            .trim();
          const ini = Number(pick(h, ["horimetro_ini", "ini", "inicial", "start"]) ?? NaN);
          const fim = Number(pick(h, ["horimetro_fim", "fim", "final", "end"]) ?? NaN);
          const turno = pick(h, ["turno", "shift", "turn"]);
          if (!eq) continue;
          byEq.set(eq, {
            ini: Number.isFinite(ini) ? ini : null,
            fim: Number.isFinite(fim) ? fim : null,
            turno,
          });
        }

        const bt01 = byEq.get("BT-01") || byEq.get("BT01") || null;
        const bt02 = byEq.get("BT-02") || byEq.get("BT02") || null;
        const pn01 = byEq.get("PN-01") || byEq.get("PN01") || null;
        const pn02 = byEq.get("PN-02") || byEq.get("PN02") || null;

        setCell(wsHor, dstRow, 2, bt01?.ini ?? "");
        setCell(wsHor, dstRow, 3, bt01?.fim ?? "");
        setCell(wsHor, dstRow, 4, bt02?.ini ?? "");
        setCell(wsHor, dstRow, 5, bt02?.fim ?? "");
        setCell(wsHor, dstRow, 6, pn01?.ini ?? "");
        setCell(wsHor, dstRow, 7, pn01?.fim ?? "");
        setCell(wsHor, dstRow, 8, pn02?.ini ?? "");
        setCell(wsHor, dstRow, 9, pn02?.fim ?? "");

        const t = bt01?.turno ?? bt02?.turno ?? pn01?.turno ?? pn02?.turno ?? "";
        setCell(wsHor, dstRow, 10, t ? String(t) : "");

        // IMPORTANTÍSSIMO:
        // NÃO escreve nas colunas h.Tr (K..N) aqui.
        // Elas ficam com as fórmulas clonadas e funcionando sem #REF!
        lastHorRow = dstRow;
      }

      /* ===================== PARADAS ===================== */
      // Append no final clonando a última linha para manter estilo
      const wsPar = getOrCreateSheet(wb, "Paradas");
      const parStartRow = 2;
      const existingKeys = buildExistingStopKeySet(wsPar, parStartRow);

      // ordenar por início
      allStops.sort((a, b) => {
        const sa = pick(a, ["start_at", "inicio", "start", "data_inicio", "dt_inicio"]);
        const sb = pick(b, ["start_at", "inicio", "start", "data_inicio", "dt_inicio"]);
        const da = sa ? new Date(String(sa)).getTime() : 0;
        const db = sb ? new Date(String(sb)).getTime() : 0;
        return da - db;
      });

      let lastParRow = findLastNonEmptyRow(wsPar, 1, parStartRow);
      if (lastParRow < parStartRow) lastParRow = parStartRow;

      for (const s of allStops) {
        const day = pick(s, ["day", "data_turno", "data", "shift_day"]) || null;
        const turno =
          pick(s, ["turno", "shift", "turn", "turno_nome"]) ||
          pick(s, ["turno_num", "shift_num"]) ||
          "";

        const startV = pick(s, ["start_at", "inicio", "start", "data_inicio", "dt_inicio"]);
        const endV = pick(s, ["end_at", "fim", "end", "data_fim", "dt_fim"]);

        const start = toDateTimeParts(startV);
        const end = toDateTimeParts(endV);

        const equip = pick(s, ["equipamento", "equipment", "eq", "tag", "planta"]) || "";
        const tipo = pick(s, ["tipo", "tipo_parada", "stop_type", "type"]) || "";
        const ativ = pick(s, ["atividade", "activity"]) || "";
        const desc = pick(s, ["descricao", "descricao_detalhada", "detail", "detalhe", "obs"]) || "";

        const tempo =
          pick(s, ["tempo_h", "tempo_parada_h", "duration_h", "duracao_h"]) ??
          (startV && endV ? hoursDiff(startV, endV) : null);

        let dTurno: Date | null = null;
        if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) dTurno = parseISODate(day);
        else if (start.date) dTurno = new Date(start.date.getFullYear(), start.date.getMonth(), start.date.getDate());

        const key = `${asYMDFromCell(dTurno) || ""}|${normStr(start.hhmm)}|${normStr(end.hhmm)}|${normStr(
          equip
        )}|${normStr(tipo)}|${normStr(ativ)}|${normStr(desc)}`;

        if (existingKeys.has(key)) continue;
        existingKeys.add(key);

        const srcRow = lastParRow;
        const dstRow = lastParRow + 1;
        cloneRow(wsPar, srcRow, dstRow);

        // Colunas do seu template Paradas:
        // 1 Data turno | 2 Turno | 3 Data início | 4 Data fim | 5 Hora início | 6 Hora fim
        // 7 Equipamento | 8 Tipo | 9 Atividade | 10 Descrição | 11 Tempo(h)
        setCell(wsPar, dstRow, 1, dTurno);
        setCell(wsPar, dstRow, 2, String(turno || ""));
        setCell(wsPar, dstRow, 3, start.date ? new Date(start.date.getFullYear(), start.date.getMonth(), start.date.getDate()) : "");
        setCell(wsPar, dstRow, 4, end.date ? new Date(end.date.getFullYear(), end.date.getMonth(), end.date.getDate()) : "");
        setCell(wsPar, dstRow, 5, start.hhmm || "");
        setCell(wsPar, dstRow, 6, end.hhmm || "");
        setCell(wsPar, dstRow, 7, equip);
        setCell(wsPar, dstRow, 8, tipo);
        setCell(wsPar, dstRow, 9, ativ);
        setCell(wsPar, dstRow, 10, desc);
        setCell(wsPar, dstRow, 11, tempo ?? "");

        lastParRow = dstRow;
      }

      /* ===================== Save ===================== */
      const outBuf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const fileName =
        fromDay === toDay ? `BASE_PLANTA_${fromDay}.xlsx` : `BASE_PLANTA_${fromDay}_a_${toDay}.xlsx`;

      downloadArrayBuffer(outBuf, fileName);
      setMsg(`✅ Exportado: ${fileName}`);
    } catch (e: any) {
      setMsg(`❌ ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mp-container">
      <div>
        <div className="mp-chip">Utilitários</div>
        <div className="mp-page-title">Exportar Excel</div>
        <div className="mp-page-sub">
          Append no final clonando a última linha (mantém estilo e fórmulas do template).
        </div>
      </div>

      <div style={{ height: 16 }} />

      <div className="mp-card">
        <div className="mp-card-h">
          <b>Exportação</b>
          <span className="mp-help">Produção (07–19 / 19–07), Horímetros e Paradas</span>
        </div>

        <div className="mp-card-b">
          <div className="mp-grid-2" style={{ gap: 12 }}>
            <div>
              <div className="mp-help">Data inicial</div>
              <input
                className="mp-input"
                type="date"
                value={fromDay}
                onChange={(e) => setFromDay(e.target.value)}
                disabled={busy}
              />
            </div>

            <div>
              <div className="mp-help">Data final</div>
              <input
                className="mp-input"
                type="date"
                value={toDay}
                onChange={(e) => setToDay(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <div style={{ height: 12 }} />

          <button className="mp-btn mp-btn-primary" onClick={handleExport} disabled={busy}>
            {busy ? "Gerando..." : "Gerar Excel"}
          </button>

          <div style={{ height: 10 }} />
          {msg ? <div className="mp-help">{msg}</div> : null}

          <div style={{ height: 8 }} />
          <div className="mp-help">
            Template em <b>public/BASE_PLANTA.xlsx</b>
          </div>
        </div>
      </div>
    </div>
  );
}
