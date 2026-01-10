import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";

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
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function dateRange(fromYMD: string, toYMD: string) {
  const a = parseISODate(fromYMD);
  const b = parseISODate(toYMD);
  const out: string[] = [];
  let cur = new Date(a);
  while (cur <= b) {
    out.push(ymd(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

/** ✅ SEMPRE retorna um objeto "string -> string" */
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

// -------- tipos tolerantes ----------
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

function getOrCreateSheet(wb: XLSX.WorkBook, name: string) {
  let ws = wb.Sheets[name];
  if (!ws) {
    ws = XLSX.utils.aoa_to_sheet([]);
    wb.Sheets[name] = ws;
    wb.SheetNames.push(name);
  }
  return ws;
}

function setCell(ws: XLSX.WorkSheet, r1: number, c1: number, value: any) {
  const addr = XLSX.utils.encode_cell({ r: r1 - 1, c: c1 - 1 });
  ws[addr] = ws[addr] || ({ t: "s", v: "" } as any);

  if (value === null || value === undefined || value === "") {
    ws[addr].t = "s";
    ws[addr].v = "";
    return;
  }

  if (value instanceof Date) {
    ws[addr].t = "d";
    ws[addr].v = value;
    return;
  }

  if (typeof value === "number") {
    ws[addr].t = "n";
    ws[addr].v = value;
    return;
  }

  ws[addr].t = "s";
  ws[addr].v = String(value);
}

function getCellValue(ws: XLSX.WorkSheet, r1: number, c1: number) {
  const addr = XLSX.utils.encode_cell({ r: r1 - 1, c: c1 - 1 });
  return ws[addr]?.v;
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

/**
 * Turnos:
 * - T1: 07:00–19:00
 * - T2: 19:00–07:00
 *
 * period esperado tipo: "07:00-08:00" (ou variações com espaços/traços)
 */
function getTurnoFromPeriod(period: any): "T1" | "T2" {
  const s = String(period || "").trim();
  const m = s.match(/(\d{1,2})\s*:\s*\d{2}/);
  const h = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(h)) return "T2";
  return h >= 7 && h < 19 ? "T1" : "T2";
}

// ====== preservar dados existentes: achar/atualizar por data ======

function asYMDFromCell(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return ymd(v);

  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return ymd(d);

  return null;
}

function findRowByDate(
  ws: XLSX.WorkSheet,
  dateCol: number,
  startRow: number,
  targetYMD: string
): number | null {
  const ref = ws["!ref"];
  if (!ref) return null;
  const rng = XLSX.utils.decode_range(ref);

  for (let r = startRow; r <= rng.e.r + 1; r++) {
    const got = asYMDFromCell(getCellValue(ws, r, dateCol));
    if (got === targetYMD) return r;
  }
  return null;
}

function appendRowIndex(ws: XLSX.WorkSheet, minRow: number): number {
  const ref = ws["!ref"];
  if (!ref) return minRow;
  const rng = XLSX.utils.decode_range(ref);
  return Math.max(minRow, rng.e.r + 2);
}

function normStr(v: any) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function stopKeyFromSheet(ws: XLSX.WorkSheet, row: number) {
  const dTurno = asYMDFromCell(getCellValue(ws, row, 1)) || "";
  const hi = normStr(getCellValue(ws, row, 5));
  const hf = normStr(getCellValue(ws, row, 6));
  const eq = normStr(getCellValue(ws, row, 7));
  const tipo = normStr(getCellValue(ws, row, 8));
  const ativ = normStr(getCellValue(ws, row, 9));
  const desc = normStr(getCellValue(ws, row, 10));
  return `${dTurno}|${hi}|${hf}|${eq}|${tipo}|${ativ}|${desc}`;
}

function buildExistingStopKeySet(ws: XLSX.WorkSheet, startRow: number) {
  const set = new Set<string>();
  const ref = ws["!ref"];
  if (!ref) return set;
  const rng = XLSX.utils.decode_range(ref);
  for (let r = startRow; r <= rng.e.r + 1; r++) {
    const key = stopKeyFromSheet(ws, r);
    if (key.replace(/\|/g, "").trim()) set.add(key);
  }
  return set;
}

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
      // ✅ CORRIGIDO: nada de new URL / BASE_URL — pega do public direto
      const tplRes = await fetch("/BASE_PLANTA.xlsx", { cache: "no-store" });
      if (!tplRes.ok) {
        throw new Error("Não achei template em /BASE_PLANTA.xlsx (confira public/BASE_PLANTA.xlsx)");
      }
      const tplBuf = await tplRes.arrayBuffer();

      // sanity: xlsx começa com "PK"
      const head = new Uint8Array(tplBuf.slice(0, 2));
      if (!(head[0] === 0x50 && head[1] === 0x4b)) {
        throw new Error("Template não é XLSX válido (veio HTML/erro). Verifique Vercel routes e public/.");
      }

      const wb = XLSX.read(tplBuf, { type: "array", cellDates: true });

      const days = dateRange(fromDay, toDay);

      // ====== baixa dados ======
      const plantDays: PlantDay[] = [];
      const allStops: StopItem[] = [];
      const allHor: HoriItem[] = [];

      for (const d of days) {
        // Produção do dia
        try {
          const pd = await apiGet<PlantDay>(`/api/plant-production/${d}`);
          plantDays.push(pd);
        } catch {
          plantDays.push({ day: d, obs: "", rows: [] });
        }

        // Paradas do dia
        try {
          const st = await apiGet<any[]>(`/api/stops?day=${d}`);
          for (const s of st || []) allStops.push(s);
        } catch {
          // ok
        }

        // Horímetros do dia
        try {
          const hh = await apiGet<any[]>(`/api/horimetros?day=${d}`);
          for (const h of hh || []) allHor.push(h);
        } catch {
          // ok
        }
      }

      // ===================== ABA: Paradas =====================
      // ✅ NÃO limpa nada; só anexa no final (com dedupe)
      const wsParadas = getOrCreateSheet(wb, "Paradas");
      const paradasStartRow = 2;

      const existingStopKeys = buildExistingStopKeySet(wsParadas, paradasStartRow);

      allStops.sort((a, b) => {
        const sa = pick(a, ["start_at", "inicio", "start", "data_inicio", "dt_inicio"]);
        const sb = pick(b, ["start_at", "inicio", "start", "data_inicio", "dt_inicio"]);
        const da = sa ? new Date(String(sa)).getTime() : 0;
        const db = sb ? new Date(String(sb)).getTime() : 0;
        return da - db;
      });

      let rPar = appendRowIndex(wsParadas, paradasStartRow);

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
        const desc =
          pick(s, ["descricao", "descricao_detalhada", "detail", "detalhe", "obs"]) || "";

        const tempo =
          pick(s, ["tempo_h", "tempo_parada_h", "duration_h", "duracao_h"]) ??
          (startV && endV ? hoursDiff(startV, endV) : null);

        let dTurno: Date | null = null;
        if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) dTurno = parseISODate(day);
        else if (start.date)
          dTurno = new Date(start.date.getFullYear(), start.date.getMonth(), start.date.getDate());

        const key = `${asYMDFromCell(dTurno) || ""}|${normStr(start.hhmm)}|${normStr(end.hhmm)}|${normStr(
          equip
        )}|${normStr(tipo)}|${normStr(ativ)}|${normStr(desc)}`;

        if (existingStopKeys.has(key)) continue;
        existingStopKeys.add(key);

        setCell(wsParadas, rPar, 1, dTurno);
        setCell(wsParadas, rPar, 2, String(turno || ""));
        setCell(
          wsParadas,
          rPar,
          3,
          start.date ? new Date(start.date.getFullYear(), start.date.getMonth(), start.date.getDate()) : ""
        );
        setCell(
          wsParadas,
          rPar,
          4,
          end.date ? new Date(end.date.getFullYear(), end.date.getMonth(), end.date.getDate()) : ""
        );
        setCell(wsParadas, rPar, 5, start.hhmm || "");
        setCell(wsParadas, rPar, 6, end.hhmm || "");
        setCell(wsParadas, rPar, 7, equip);
        setCell(wsParadas, rPar, 8, tipo);
        setCell(wsParadas, rPar, 9, ativ);
        setCell(wsParadas, rPar, 10, desc);
        setCell(wsParadas, rPar, 11, tempo ?? "");

        rPar++;
      }

      // ===================== ABA: HORÍMETROS =====================
      // ✅ NÃO limpa; atualiza a linha do dia (ou cria no final)
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

      for (const d of days) {
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

        const dt = parseISODate(d);

        const bt01 = byEq.get("BT-01") || byEq.get("BT01") || null;
        const bt02 = byEq.get("BT-02") || byEq.get("BT02") || null;
        const pn01 = byEq.get("PN-01") || byEq.get("PN01") || null;
        const pn02 = byEq.get("PN-02") || byEq.get("PN02") || null;

        const hTr = (x: any) =>
          x?.ini != null && x?.fim != null ? Math.round((x.fim - x.ini) * 100) / 100 : "";

        let rowIdx = findRowByDate(wsHor, 1, horStartRow, d);
        if (!rowIdx) rowIdx = appendRowIndex(wsHor, horStartRow);

        setCell(wsHor, rowIdx, 1, dt);
        setCell(wsHor, rowIdx, 2, bt01?.ini ?? "");
        setCell(wsHor, rowIdx, 3, bt01?.fim ?? "");
        setCell(wsHor, rowIdx, 4, bt02?.ini ?? "");
        setCell(wsHor, rowIdx, 5, bt02?.fim ?? "");
        setCell(wsHor, rowIdx, 6, pn01?.ini ?? "");
        setCell(wsHor, rowIdx, 7, pn01?.fim ?? "");
        setCell(wsHor, rowIdx, 8, pn02?.ini ?? "");
        setCell(wsHor, rowIdx, 9, pn02?.fim ?? "");

        const t = bt01?.turno ?? bt02?.turno ?? pn01?.turno ?? pn02?.turno ?? "";
        setCell(wsHor, rowIdx, 10, t ? String(t) : "");

        setCell(wsHor, rowIdx, 11, hTr(bt01));
        setCell(wsHor, rowIdx, 12, hTr(bt02));
        setCell(wsHor, rowIdx, 13, hTr(pn01));
        setCell(wsHor, rowIdx, 14, hTr(pn02));
      }

      // ===================== ABA: PRODUÇÃO (por turno) =====================
      // ✅ NÃO limpa; atualiza a linha do dia (ou cria no final)
      // Template "Planilha1":
      // A Data | B Meta diaria | C Produção 1º T | D Produção 2º T | E Total produzido (fórmula)
      const wsProd = getOrCreateSheet(wb, "Planilha1");
      const prodStartRow = 2;

      const prodByDay = new Map<string, { t1: number; t2: number }>();
      for (const pd of plantDays) {
        let t1 = 0;
        let t2 = 0;

        for (const row of pd.rows || []) {
          const ton = Number(row.ton) || 0;
          const turno = getTurnoFromPeriod(row.period);
          if (turno === "T1") t1 += ton;
          else t2 += ton;
        }

        prodByDay.set(pd.day, { t1, t2 });
      }

      for (const d of days) {
        const dt = parseISODate(d);
        const v = prodByDay.get(d) || { t1: 0, t2: 0 };

        let rowIdx = findRowByDate(wsProd, 1, prodStartRow, d);
        if (!rowIdx) rowIdx = appendRowIndex(wsProd, prodStartRow);

        setCell(wsProd, rowIdx, 1, dt);           // A = Data
        // B = Meta diaria -> NÃO mexe
        setCell(wsProd, rowIdx, 3, v.t1 || "");   // C = Produção 1º T
        setCell(wsProd, rowIdx, 4, v.t2 || "");   // D = Produção 2º T
        // E = Total produzido -> NÃO mexe
      }

      // ====== salva ======
      const outBuf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const fileName =
        fromDay === toDay
          ? `BASE_PLANTA_${fromDay}.xlsx`
          : `BASE_PLANTA_${fromDay}_a_${toDay}.xlsx`;

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
          Exportar no padrão do seu BASE_PLANTA.xlsx (preservando dados existentes).
        </div>
      </div>

      <div style={{ height: 16 }} />

      <div className="mp-card">
        <div className="mp-card-h">
          <b>Exportação</b>
          <span className="mp-help">
            Atualiza Produção/Horímetros por data e anexa Paradas sem apagar o que já existe
          </span>
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
