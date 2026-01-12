import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function normEq(v: any) {
  const s = String(v || "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "") // remove spaces
    .replace(/_/g, "-");
  // canonical forms: remove hyphens for matching
  return s.replace(/-/g, "");
}

function normTurno(v: any) {
  const s = String(v ?? "").toLowerCase();
  if (!s) return "";
  if (s.includes("2")) return "2";
  if (s.includes("1")) return "1";
  return "";
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

function combineDateAndHour(dateStr: any, hourStr: any) {
  const d = String(dateStr || "").slice(0, 10);
  const h = String(hourStr || "").trim();
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !h) return null;
  // aceita "HH:MM" ou "HH:MM:SS"
  const hhmm = h.length >= 5 ? h.slice(0, 5) : h;
  const dt = new Date(`${d}T${hhmm}:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
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

function clearSheetValues(ws: XLSX.WorkSheet, startRow: number) {
  const ref = ws["!ref"];
  if (!ref) return;
  const rng = XLSX.utils.decode_range(ref);
  for (let r = startRow - 1; r <= rng.e.r; r++) {
    for (let c = rng.s.c; c <= rng.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (ws[addr]) {
        ws[addr].v = undefined as any;
        ws[addr].w = undefined as any;
      }
    }
  }
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
      // 1) carrega TEMPLATE do public
      const tplRes = await fetch("/BASE_PLANTA.xlsx");
      if (!tplRes.ok) throw new Error("Não achei /BASE_PLANTA.xlsx em public/");
      const tplBuf = await tplRes.arrayBuffer();

      // 2) lê workbook
      const wb = XLSX.read(tplBuf, { type: "array", cellDates: true });

      const days = dateRange(fromDay, toDay);

      // 3) puxa dados por dia
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
          const hh = await apiGet<any[]>(`/api/horimetros?day=${d}&limit=2000`);
          for (const h of hh || []) allHor.push(h);
        } catch {
          // ok
        }
      }

      // ===================== ABA: Paradas =====================
      const wsParadas = getOrCreateSheet(wb, "Paradas");
      clearSheetValues(wsParadas, 2);

      allStops.sort((a, b) => {
        const sa = pick(a, ["start_at", "inicio", "start", "data_inicio", "dt_inicio"]);
        const sb = pick(b, ["start_at", "inicio", "start", "data_inicio", "dt_inicio"]);
        const da = sa ? new Date(String(sa)).getTime() : 0;
        const db = sb ? new Date(String(sb)).getTime() : 0;
        return da - db;
      });

      let rPar = 2;
      for (const s of allStops) {
        const day = pick(s, ["day", "data_turno", "data", "shift_day"]) || null;
        const turno =
          pick(s, ["turno", "shift", "turn", "turno_nome"]) ||
          pick(s, ["turno_num", "shift_num"]) ||
          "";

        const dataIni = pick(s, ["data_inicio", "dt_inicio", "data_ini", "day_ini"]);
        const horaIni = pick(s, ["hora_inicio", "hr_inicio", "time_ini", "hora_ini"]);
        const dataFim = pick(s, ["data_fim", "dt_fim", "data_end", "day_fim"]);
        const horaFim = pick(s, ["hora_fim", "hr_fim", "time_end", "hora_end"]);

        // Backend MonPlant salva data e hora separados (data_inicio + hora_inicio)
        const startV =
          combineDateAndHour(dataIni, horaIni) ??
          pick(s, ["start_at", "inicio", "start", "dt_inicio", "data_inicio"]);

        const endV =
          combineDateAndHour(dataFim, horaFim) ??
          pick(s, ["end_at", "fim", "end", "dt_fim", "data_fim"]);

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

        setCell(wsParadas, rPar, 1, dTurno);
        setCell(wsParadas, rPar, 2, String(turno || ""));
        setCell(wsParadas, rPar, 3, start.date ? new Date(start.date.getFullYear(), start.date.getMonth(), start.date.getDate()) : "");
        setCell(wsParadas, rPar, 4, end.date ? new Date(end.date.getFullYear(), end.date.getMonth(), end.date.getDate()) : "");
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
      const wsHor = getOrCreateSheet(wb, "HORÍMETROS");
      clearSheetValues(wsHor, 2);

      const horByKey = new Map<string, HoriItem[]>();
      for (const h of allHor) {
        const d = pick(h, ["day", "data", "data_turno"]);
        if (!d) continue;
        const dayKey = String(d).slice(0, 10);
        const t = normTurno(pick(h, ["turno", "shift", "turn"]));
        const key = `${dayKey}|${t || "?"}`;
        const arr = horByKey.get(key) || [];
        arr.push(h);
        horByKey.set(key, arr);
      }

      let rHor = 2;

      // escreve horímetros em linhas por TURNO (quando existir). Se não existir no dia, escreve só a data (linha vazia).
      for (const d of days) {
        const dt = parseISODate(d);

        const buckets = (["1", "2", "?"] as const)
          .map((t) => ({ t, list: horByKey.get(`${d}|${t}`) || [] }))
          .filter((x) => x.list.length);

        if (!buckets.length) {
          setCell(wsHor, rHor, 1, dt);
          rHor++;
          continue;
        }

        for (const bucket of buckets) {
          const list = bucket.list;
          const byEq = new Map<string, { ini: number | null; fim: number | null; turno: any }>();

          for (const h of list) {
            const eqRaw = pick(h, ["equipamento", "equipment", "eq", "tag"]);
            const eq = normEq(eqRaw);

            const ini = Number(pick(h, ["horimetro_ini", "ini", "inicial", "start"]) ?? NaN);
            const fim = Number(pick(h, ["horimetro_fim", "fim", "final", "end"]) ?? NaN);
            const turno = pick(h, ["turno", "shift", "turn"]);

            if (!eq) continue;

            // Se por acaso vier duplicado do mesmo equipamento no mesmo turno,
            // guardamos o que tiver ini/fim válidos.
            const cur = byEq.get(eq);
            const next = {
              ini: Number.isFinite(ini) ? ini : null,
              fim: Number.isFinite(fim) ? fim : null,
              turno,
            };
            if (!cur) byEq.set(eq, next);
            else {
              byEq.set(eq, {
                ini: cur.ini ?? next.ini,
                fim: cur.fim ?? next.fim,
                turno: cur.turno ?? next.turno,
              });
            }
          }

          const bt01 = byEq.get("BT01") || null;
          const bt02 = byEq.get("BT02") || null;
          const pn01 = byEq.get("PN01") || null;
          const pn02 = byEq.get("PN02") || null;

          const hTr = (x: any) =>
            x?.ini != null && x?.fim != null ? Math.round((x.fim - x.ini) * 100) / 100 : "";

          setCell(wsHor, rHor, 1, dt);
          setCell(wsHor, rHor, 2, bt01?.ini ?? "");
          setCell(wsHor, rHor, 3, bt01?.fim ?? "");
          setCell(wsHor, rHor, 4, bt02?.ini ?? "");
          setCell(wsHor, rHor, 5, bt02?.fim ?? "");
          setCell(wsHor, rHor, 6, pn01?.ini ?? "");
          setCell(wsHor, rHor, 7, pn01?.fim ?? "");
          setCell(wsHor, rHor, 8, pn02?.ini ?? "");
          setCell(wsHor, rHor, 9, pn02?.fim ?? "");

          // turno: se vier no registro, usa, senão usa bucket ("1"/"2"/"?")
          const t = bt01?.turno ?? bt02?.turno ?? pn01?.turno ?? pn02?.turno ?? bucket.t;
          setCell(wsHor, rHor, 10, t ? String(t) : "");

          setCell(wsHor, rHor, 11, hTr(bt01));
          setCell(wsHor, rHor, 12, hTr(bt02));
          setCell(wsHor, rHor, 13, hTr(pn01));
          setCell(wsHor, rHor, 14, hTr(pn02));

          rHor++;
        }
      }

      // ===================== ABA: PRODUÇÃO =====================
      const wsProd = getOrCreateSheet(wb, "PRODUÇÃO");
      clearSheetValues(wsProd, 3);

      const prodMap = new Map<string, { total: number; obs: string }>();
      for (const pd of plantDays) {
        const total = (pd.rows || []).reduce((acc, r) => acc + (Number(r.ton) || 0), 0);
        prodMap.set(pd.day, { total, obs: String(pd.obs || "") });
      }

      let rProd = 3;
      for (const d of days) {
        const dt = parseISODate(d);
        const v = prodMap.get(d) || { total: 0, obs: "" };

        setCell(wsProd, rProd, 2, dt);      // B = Data
        setCell(wsProd, rProd, 3, "");      // C = Meta diaria (deixa template/fórmula)
        setCell(wsProd, rProd, 4, v.total || ""); // D = Produção
        setCell(wsProd, rProd, 5, v.obs || "");   // E = Observação

        rProd++;
      }

      // 7) salva
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
        <div className="mp-page-sub">Exportar no padrão do seu BASE_PLANTA.xlsx.</div>
      </div>

      <div style={{ height: 16 }} />

      <div className="mp-card">
        <div className="mp-card-h">
          <b>Exportação</b>
          <span className="mp-help">Gera arquivo preenchendo as abas do template</span>
        </div>

        <div className="mp-card-b">
          <div className="mp-grid-2" style={{ gap: 12 }}>
            <div>
              <div className="mp-help">Data inicial</div>
              <input className="mp-input" type="date" value={fromDay} onChange={(e) => setFromDay(e.target.value)} disabled={busy} />
            </div>

            <div>
              <div className="mp-help">Data final</div>
              <input className="mp-input" type="date" value={toDay} onChange={(e) => setToDay(e.target.value)} disabled={busy} />
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
