import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import type { ExportFilters, ExportMode, HoriItem, PlantDay, PlantInfo, PreviewColumn, PreviewData, PreviewMode, StopItem } from "./types";

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
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function dateRange(fromYMD: string, toYMD: string) {
  const a = parseISODate(fromYMD); const b = parseISODate(toYMD); const out: string[] = [];
  let cur = new Date(a); while (cur <= b) { out.push(ymd(cur)); cur = addDays(cur, 1); } return out;
}
function authHeaders(): Record<string, string> {
  const keys = ["mp_token", "token", "access_token", "auth_token"];
  for (const k of keys) { const v = (localStorage.getItem(k) || "").trim(); if (v) return { Authorization: `Bearer ${v}` }; }
  return {};
}
async function apiGet<T>(path: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...authHeaders() };
  const r = await fetch(`${API_BASE}${path}`, { headers });
  if (!r.ok) { const txt = await r.text().catch(() => ""); throw new Error(`${r.status} ${r.statusText} - ${txt}`); }
  return (await r.json()) as T;
}
function pick(obj: any, keys: string[]) { for (const k of keys) { if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k]; } return null; }
function normEq(v: any) { const s = String(v || "").toUpperCase().trim().replace(/\s+/g, "").replace(/_/g, "-"); return s.replace(/-/g, ""); }
function normTurno(v: any) { const s = String(v ?? "").toLowerCase(); if (!s) return ""; if (s.includes("2")) return "2"; if (s.includes("1")) return "1"; return ""; }
function combineDateAndHour(dateStr: any, hourStr: any) {
  const d = String(dateStr || "").slice(0, 10); const h = String(hourStr || "").trim();
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !h) return null;
  const hhmm = h.length >= 5 ? h.slice(0, 5) : h; const dt = new Date(`${d}T${hhmm}:00`);
  if (Number.isNaN(dt.getTime())) return null; return dt;
}
function toDateTimeParts(v: any) {
  if (!v) return { date: null as Date | null, hhmm: "" }; const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return { date: null as Date | null, hhmm: "" };
  return { date: d, hhmm: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` };
}
function hoursDiff(start: any, end: any) { const a = new Date(String(start)); const b = new Date(String(end)); if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null; const ms = b.getTime() - a.getTime(); if (ms <= 0) return 0; return Math.round((ms / 3600000) * 100) / 100; }
function classifyMaintenanceType(stop: any): "Corretiva" | "Preventiva" | "" {
  const raw = String(pick(stop, ["tipo", "tipo_parada", "stop_type", "type"]) || "") + " " + String(pick(stop, ["atividade", "activity"]) || "") + " " + String(pick(stop, ["descricao", "descricao_detalhada", "detail", "detalhe", "obs"]) || "");
  const s = raw.toUpperCase(); if (s.includes("PREV")) return "Preventiva"; if (s.includes("CORR") || s.includes("CORRET")) return "Corretiva"; if (s.includes("PMP") || s.includes("PM ")) return "Preventiva"; return "";
}
function stopDurationHours(stop: any): number {
  const startV = combineDateAndHour(pick(stop, ["data_inicio", "dt_inicio", "data_ini", "day_ini"]), pick(stop, ["hora_inicio", "hr_inicio", "time_ini", "hora_ini"])) ?? pick(stop, ["start_at", "inicio", "start", "dt_inicio", "data_inicio"]);
  const endV = combineDateAndHour(pick(stop, ["data_fim", "dt_fim", "data_end", "day_fim"]), pick(stop, ["hora_fim", "hr_fim", "time_end", "hora_end"])) ?? pick(stop, ["end_at", "fim", "end", "dt_fim", "data_fim"]);
  const tempo = Number(pick(stop, ["tempo_h", "tempo_parada_h", "duration_h", "duracao_h"]) ?? NaN); if (Number.isFinite(tempo)) return Math.round(tempo * 100) / 100;
  const hd = startV && endV ? hoursDiff(startV, endV) : null; return Number.isFinite(hd as any) ? (hd as number) : 0;
}
function periodStartHour(p: any): number | null { const s = String(p || "").trim(); let m = s.match(/^(\d{2}):\d{2}\s*-\s*\d{2}:\d{2}$/); if (m) return Number(m[1]); m = s.replace(/\s+/g, "").match(/^(\d{2})-(\d{2})$/); if (m) return Number(m[1]); return null; }
function turnoByHour(h: number): 1 | 2 { return h >= 7 && h <= 18 ? 1 : 2; }
function eqToPlanta(eqNormNoHyphen: string): string {
  if (["PN01", "PNR01", "PNR001"].includes(eqNormNoHyphen)) return "Peneira Pnr001";
  if (["PN02", "PNR02", "PNR002"].includes(eqNormNoHyphen)) return "Peneira Pnr002";
  if (["BT01", "BT001"].includes(eqNormNoHyphen)) return "Britador Primário";
  if (["BT02", "BT002"].includes(eqNormNoHyphen)) return "Britador Secundário";
  return "";
}
function getOrCreateSheet(wb: XLSX.WorkBook, name: string) { let ws = wb.Sheets[name]; if (!ws) { ws = XLSX.utils.aoa_to_sheet([]); wb.Sheets[name] = ws; wb.SheetNames.push(name); } return ws; }
function clearSheetValues(ws: XLSX.WorkSheet, startRow: number) { const ref = ws["!ref"]; if (!ref) return; const rng = XLSX.utils.decode_range(ref); for (let r = startRow - 1; r <= rng.e.r; r++) for (let c = rng.s.c; c <= rng.e.c; c++) { const addr = XLSX.utils.encode_cell({ r, c }); if (ws[addr]) { ws[addr].v = undefined as any; ws[addr].w = undefined as any; } } }
function setCell(ws: XLSX.WorkSheet, r1: number, c1: number, value: any) {
  const addr = XLSX.utils.encode_cell({ r: r1 - 1, c: c1 - 1 }); ws[addr] = ws[addr] || ({ t: "s", v: "" } as any);
  if (value === null || value === undefined || value === "") { ws[addr].t = "s"; ws[addr].v = ""; return; }
  if (value instanceof Date) { ws[addr].t = "d"; ws[addr].v = value; return; }
  if (typeof value === "number") { ws[addr].t = "n"; ws[addr].v = value; return; }
  ws[addr].t = "s"; ws[addr].v = String(value);
}
function downloadArrayBuffer(buf: ArrayBuffer, filename: string) { const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function fmtDate(v: string) { const d = new Date(`${v}T12:00:00`); if (Number.isNaN(d.getTime())) return v; return d.toLocaleDateString("pt-BR"); }
function fmtNum(v: any, digits = 0) { const n = Number(v); if (!Number.isFinite(n)) return "-"; return n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
function joinDateTime(dateStr: any, hourStr: any) { const d = String(dateStr || "").slice(0, 10); const h = String(hourStr || "").trim(); if (!d && !h) return "-"; if (!h) return d || "-"; return `${d} ${h}`; }
function normalizeText(v: any) { return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function containsText(source: any, target: string) { if (!target) return true; return normalizeText(source).includes(normalizeText(target)); }

const BASE_PREVIEW_COLUMNS: PreviewColumn[] = [
  { key: "dia", label: "Dia", width: 110 }, { key: "turno", label: "Turno", width: 90 },
  { key: "bt01_ini", label: "BT-01 Inicial", width: 120 }, { key: "bt01_fim", label: "BT-01 Final", width: 120 },
  { key: "bt02_ini", label: "BT-02 Inicial", width: 120 }, { key: "bt02_fim", label: "BT-02 Final", width: 120 },
  { key: "pn01_ini", label: "PN-01 Inicial", width: 120 }, { key: "pn01_fim", label: "PN-01 Final", width: 120 },
  { key: "pn02_ini", label: "PN-02 Inicial", width: 120 }, { key: "pn02_fim", label: "PN-02 Final", width: 120 },
  { key: "producao_total", label: "Produção Total", width: 130 }, { key: "observacao", label: "Observação", width: 220 },
];
const PARADAS_PREVIEW_COLUMNS: PreviewColumn[] = [
  { key: "dia", label: "Dia", width: 110 }, { key: "equipamento", label: "Equipamento", width: 150 }, { key: "inicio", label: "Início", width: 150 },
  { key: "fim", label: "Fim", width: 150 }, { key: "tipo", label: "Tipo", width: 130 }, { key: "atividade", label: "Atividade", width: 180 },
  { key: "descricao", label: "Descrição", width: 260 }, { key: "horas", label: "Tempo (h)", width: 110 }, { key: "classificacao", label: "Classificação", width: 130 },
  { key: "planta", label: "Área/Planta", width: 180 },
];
const PRODUCAO_PREVIEW_COLUMNS: PreviewColumn[] = [
  { key: "planta", label: "Planta", width: 170 }, { key: "dia", label: "Dia", width: 120 }, { key: "turno", label: "Turno", width: 90 },
  { key: "producao", label: "Produção (t)", width: 140 }, { key: "periodos", label: "Períodos com lançamento", width: 180 }, { key: "observacao", label: "Observação", width: 260 },
];

export function useExportData() {
  const today = useMemo(() => ymd(new Date()), []);
  const [fromDay, setFromDay] = useState(today);
  const [toDay, setToDay] = useState(today);
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [lastFile, setLastFile] = useState<string>("");
  const [lastMode, setLastMode] = useState<ExportMode | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("base");
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [plants, setPlants] = useState<PlantInfo[]>([]);
  const [selectedPlantId, setSelectedPlantId] = useState<string>("");
  const [filters, setFilters] = useState<ExportFilters>({ turno: "", letra: "", planta: "", equipamento: "", material: "", origem: "", destino: "", pesquisa: "" });

  const periodLabel = useMemo(() => (fromDay === toDay ? fmtDate(fromDay) : `${fmtDate(fromDay)} até ${fmtDate(toDay)}`), [fromDay, toDay]);

  useEffect(() => { apiGet<PlantInfo[]>("/api/plants").then((rows) => setPlants(Array.isArray(rows) ? rows : [])).catch(() => setPlants([])); }, []);

  async function buildBasePreview(daysInput: string[]): Promise<PreviewData> {
    const plantDays: PlantDay[] = []; const allHor: HoriItem[] = [];
    for (const d of daysInput) {
      try { plantDays.push(await apiGet<PlantDay>(`/api/plant-production/${d}`)); } catch { plantDays.push({ day: d, obs: "", rows: [] }); }
      try { const hh = await apiGet<any[]>(`/api/horimetros?day=${d}&limit=2000`); for (const h of hh || []) allHor.push(h); } catch {}
    }
    const prodShiftMap = new Map<string, { total: number; obs: string }>();
    for (const pd of plantDays) {
      let t1 = 0, t2 = 0; for (const r of pd.rows || []) { const ton = Number((r as any)?.ton) || 0; if (!ton) continue; const h = periodStartHour((r as any)?.period); if (h === null) continue; turnoByHour(h) === 1 ? (t1 += ton) : (t2 += ton); }
      prodShiftMap.set(pd.day, { total: Math.round((t1 + t2) * 100) / 100, obs: String(pd.obs || "") });
    }
    const horByKey = new Map<string, HoriItem[]>();
    for (const h of allHor) { const d = pick(h, ["day", "data", "data_turno"]); if (!d) continue; const dayKey = String(d).slice(0, 10); const t = normTurno(pick(h, ["turno", "shift", "turn"])); const key = `${dayKey}|${t || "?"}`; const arr = horByKey.get(key) || []; arr.push(h); horByKey.set(key, arr); }
    const rows: Record<string, any>[] = [];
    for (const d of daysInput) {
      const buckets = (["1", "2", "?"] as const).map((t) => ({ t, list: horByKey.get(`${d}|${t}`) || [] })).filter((x) => x.list.length);
      if (!buckets.length) { const prod = prodShiftMap.get(d); rows.push({ dia: fmtDate(d), turno: "-", bt01_ini: "-", bt01_fim: "-", bt02_ini: "-", bt02_fim: "-", pn01_ini: "-", pn01_fim: "-", pn02_ini: "-", pn02_fim: "-", producao_total: prod?.total ? fmtNum(prod.total, 0) : "-", observacao: prod?.obs || "-" }); continue; }
      for (const bucket of buckets) {
        const byEq = new Map<string, { ini: number | null; fim: number | null; turno: any }>();
        for (const h of bucket.list) {
          const eq = normEq(pick(h, ["equipamento", "equipment", "eq", "tag"])); const ini = Number(pick(h, ["horimetro_ini", "ini", "inicial", "start"]) ?? NaN); const fim = Number(pick(h, ["horimetro_fim", "fim", "final", "end"]) ?? NaN); const turno = pick(h, ["turno", "shift", "turn"]); if (!eq) continue;
          const cur = byEq.get(eq); const next = { ini: Number.isFinite(ini) ? ini : null, fim: Number.isFinite(fim) ? fim : null, turno };
          byEq.set(eq, cur ? { ini: cur.ini ?? next.ini, fim: cur.fim ?? next.fim, turno: cur.turno ?? next.turno } : next);
        }
        const bt01 = byEq.get("BT01") || null, bt02 = byEq.get("BT02") || null, pn01 = byEq.get("PN01") || null, pn02 = byEq.get("PN02") || null; const prod = prodShiftMap.get(d);
        rows.push({ dia: fmtDate(d), turno: String((bt01?.turno ?? bt02?.turno ?? pn01?.turno ?? pn02?.turno ?? bucket.t) || "-"), bt01_ini: bt01?.ini != null ? fmtNum(bt01.ini, 0) : "-", bt01_fim: bt01?.fim != null ? fmtNum(bt01.fim, 0) : "-", bt02_ini: bt02?.ini != null ? fmtNum(bt02.ini, 0) : "-", bt02_fim: bt02?.fim != null ? fmtNum(bt02.fim, 0) : "-", pn01_ini: pn01?.ini != null ? fmtNum(pn01.ini, 0) : "-", pn01_fim: pn01?.fim != null ? fmtNum(pn01.fim, 0) : "-", pn02_ini: pn02?.ini != null ? fmtNum(pn02.ini, 0) : "-", pn02_fim: pn02?.fim != null ? fmtNum(pn02.fim, 0) : "-", producao_total: prod?.total ? fmtNum(prod.total, 0) : "-", observacao: prod?.obs || "-" });
      }
    }
    const filteredRows = rows.filter((row) => (!filters.turno || String(row.turno) === String(filters.turno)) && containsText(`${row.dia} ${row.turno} ${row.observacao}`, filters.pesquisa));
    return { title: "Pré-visualização • Relatório Base", subtitle: "Horímetros consolidados por dia/turno com produção total do período selecionado.", columns: BASE_PREVIEW_COLUMNS, rows: filteredRows.slice(0, 30), total: filteredRows.length };
  }

  async function buildParadasPreview(daysInput: string[]): Promise<PreviewData> {
    const stops: any[] = []; for (const d of daysInput) { try { const st = await apiGet<any[]>(`/api/stops?day=${d}`); for (const s of st || []) stops.push(s); } catch {} }
    const rows = stops.map((s) => {
      const day = String(pick(s, ["day", "data_turno", "data", "shift_day"]) || "").slice(0, 10); const equip = String(pick(s, ["equipamento", "equipment", "eq", "tag", "planta"]) || "");
      return { dia: day ? fmtDate(day) : "-", equipamento: equip || "-", inicio: joinDateTime(pick(s, ["data_inicio", "dt_inicio", "data_ini", "day_ini"]), pick(s, ["hora_inicio", "hr_inicio", "time_ini", "hora_ini"])), fim: joinDateTime(pick(s, ["data_fim", "dt_fim", "data_end", "day_fim"]), pick(s, ["hora_fim", "hr_fim", "time_end", "hora_end"])), tipo: String(pick(s, ["tipo", "tipo_parada", "stop_type", "type"]) || "") || "-", atividade: String(pick(s, ["atividade", "activity"]) || "") || "-", descricao: String(pick(s, ["descricao", "descricao_detalhada", "detail", "detalhe", "obs"]) || "") || "-", horas: fmtNum(stopDurationHours(s), 2), classificacao: classifyMaintenanceType(s) || "-", planta: eqToPlanta(normEq(equip)) || "-", __sort: String(pick(s, ["created_at"]) || "") };
    }).filter((row) => {
      const merged = `${row.equipamento} ${row.tipo} ${row.atividade} ${row.descricao} ${row.planta}`;
      return (!filters.turno || containsText(row.inicio, ` ${filters.turno}:`) || containsText(row.fim, ` ${filters.turno}:`)) && containsText(row.equipamento, filters.equipamento) && containsText(row.planta, filters.planta) && containsText(row.descricao, filters.material) && containsText(row.descricao, filters.letra) && containsText(merged, filters.pesquisa);
    }).sort((a, b) => String(b.__sort || "").localeCompare(String(a.__sort || "")));
    return { title: "Pré-visualização • Relatório de Paradas", subtitle: "Lançamentos de paradas e manutenção que serão exportados no modelo resumido/detalhado.", columns: PARADAS_PREVIEW_COLUMNS, rows: rows.slice(0, 30).map(({ __sort, ...rest }) => rest), total: rows.length };
  }

  async function buildProducaoPreview(daysInput: string[]): Promise<PreviewData> {
    const targetPlants = selectedPlantId ? plants.filter((p) => String(p.id) === selectedPlantId) : plants; const rows: Record<string, any>[] = [];
    for (const p of targetPlants) for (const d of daysInput) {
      try {
        const pd = await apiGet<PlantDay>(`/api/plants/${p.id}/plant-production/${d}`); let t1 = 0, t2 = 0, usedPeriods = 0;
        for (const r of pd.rows || []) { const ton = Number((r as any)?.ton) || 0; if (!ton) continue; usedPeriods++; const h = periodStartHour((r as any)?.period); if (h === null) continue; turnoByHour(h) === 1 ? (t1 += ton) : (t2 += ton); }
        if (t1) rows.push({ planta: p.name || p.code, dia: fmtDate(d), turno: "1", producao: fmtNum(t1, 2), periodos: usedPeriods, observacao: pd.obs || "-" });
        if (t2) rows.push({ planta: p.name || p.code, dia: fmtDate(d), turno: "2", producao: fmtNum(t2, 2), periodos: usedPeriods, observacao: pd.obs || "-" });
      } catch {}
    }
    const filtered = rows.filter((row) => (!filters.turno || String(row.turno) === String(filters.turno)) && containsText(row.planta, filters.planta) && containsText(`${row.planta} ${row.dia} ${row.turno} ${row.observacao}`, filters.pesquisa));
    return { title: "Pré-visualização • Produção por Planta", subtitle: "Totais por turno/planta, respeitando os filtros aplicados.", columns: PRODUCAO_PREVIEW_COLUMNS, rows: filtered.slice(0, 30), total: filtered.length };
  }

  async function handlePreview(mode: PreviewMode) {
    setPreviewMode(mode); setPreviewBusy(true); setMsg("");
    try { const d = dateRange(fromDay, toDay); const data = mode === "base" ? await buildBasePreview(d) : mode === "paradas" ? await buildParadasPreview(d) : await buildProducaoPreview(d); setPreviewData(data); }
    catch (e: any) { setPreviewData(null); setMsg(`❌ ${e?.message || String(e)}`); }
    finally { setPreviewBusy(false); }
  }

  async function handleExport() {
    setMsg(""); setBusy(true); setLastMode("base");
    try {
      const tplRes = await fetch("/BASE_PLANTA.xlsx"); if (!tplRes.ok) throw new Error("Não achei /BASE_PLANTA.xlsx em public/"); const tplBuf = await tplRes.arrayBuffer(); const wb = XLSX.read(tplBuf, { type: "array", cellDates: true }); const days = dateRange(fromDay, toDay);
      const plantDays: PlantDay[] = []; const allStops: StopItem[] = []; const allHor: HoriItem[] = [];
      for (const d of days) { try { plantDays.push(await apiGet<PlantDay>(`/api/plant-production/${d}`)); } catch { plantDays.push({ day: d, obs: "", rows: [] }); }
        try { const st = await apiGet<any[]>(`/api/stops?day=${d}`); for (const s of st || []) allStops.push(s); } catch {}
        try { const hh = await apiGet<any[]>(`/api/horimetros?day=${d}&limit=2000`); for (const h of hh || []) allHor.push(h); } catch {} }
      const wsParadas = getOrCreateSheet(wb, "Paradas"); clearSheetValues(wsParadas, 2); const wsParTot = getOrCreateSheet(wb, "PARADAS TOTAIS"); clearSheetValues(wsParTot, 3);
      allStops.sort((a, b) => { const da = new Date(String(pick(a, ["start_at", "inicio", "start", "data_inicio", "dt_inicio"]) || 0)).getTime(); const db = new Date(String(pick(b, ["start_at", "inicio", "start", "data_inicio", "dt_inicio"]) || 0)).getTime(); return da - db; });
      let rPar = 2, rParTot = 3;
      for (const s of allStops) {
        const day = pick(s, ["day", "data_turno", "data", "shift_day"]) || null; const turno = pick(s, ["turno", "shift", "turn", "turno_nome"]) || pick(s, ["turno_num", "shift_num"]) || "";
        const startV = combineDateAndHour(pick(s, ["data_inicio", "dt_inicio", "data_ini", "day_ini"]), pick(s, ["hora_inicio", "hr_inicio", "time_ini", "hora_ini"])) ?? pick(s, ["start_at", "inicio", "start", "dt_inicio", "data_inicio"]);
        const endV = combineDateAndHour(pick(s, ["data_fim", "dt_fim", "data_end", "day_fim"]), pick(s, ["hora_fim", "hr_fim", "time_end", "hora_end"])) ?? pick(s, ["end_at", "fim", "end", "dt_fim", "data_fim"]);
        const start = toDateTimeParts(startV), end = toDateTimeParts(endV); const equip = pick(s, ["equipamento", "equipment", "eq", "tag", "planta"]) || ""; const tipo = pick(s, ["tipo", "tipo_parada", "stop_type", "type"]) || ""; const ativ = pick(s, ["atividade", "activity"]) || ""; const desc = pick(s, ["descricao", "descricao_detalhada", "detail", "detalhe", "obs"]) || "";
        const tempo = pick(s, ["tempo_h", "tempo_parada_h", "duration_h", "duracao_h"]) ?? (startV && endV ? hoursDiff(startV, endV) : null);
        let dTurno: Date | null = null; if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) dTurno = parseISODate(day); else if (start.date) dTurno = new Date(start.date.getFullYear(), start.date.getMonth(), start.date.getDate());
        setCell(wsParadas, rPar, 1, dTurno); setCell(wsParadas, rPar, 2, String(turno || "")); setCell(wsParadas, rPar, 3, start.date ? new Date(start.date.getFullYear(), start.date.getMonth(), start.date.getDate()) : ""); setCell(wsParadas, rPar, 4, end.date ? new Date(end.date.getFullYear(), end.date.getMonth(), end.date.getDate()) : "");
        setCell(wsParadas, rPar, 5, start.hhmm || ""); setCell(wsParadas, rPar, 6, end.hhmm || ""); setCell(wsParadas, rPar, 7, equip); setCell(wsParadas, rPar, 8, tipo); setCell(wsParadas, rPar, 9, ativ); setCell(wsParadas, rPar, 10, desc); setCell(wsParadas, rPar, 11, tempo ?? ""); rPar++;
        const planta = eqToPlanta(normEq(equip)) || ""; const t = normTurno(turno) || "";
        setCell(wsParTot, rParTot, 2, start.date ? new Date(start.date.getFullYear(), start.date.getMonth(), start.date.getDate()) : ""); setCell(wsParTot, rParTot, 3, start.hhmm || ""); setCell(wsParTot, rParTot, 4, planta); setCell(wsParTot, rParTot, 5, t ? Number(t) : ""); setCell(wsParTot, rParTot, 6, String(tipo || "")); setCell(wsParTot, rParTot, 7, ""); setCell(wsParTot, rParTot, 8, String(desc || "")); setCell(wsParTot, rParTot, 9, end.date ? new Date(end.date.getFullYear(), end.date.getMonth(), end.date.getDate()) : ""); setCell(wsParTot, rParTot, 10, end.hhmm || ""); rParTot++;
      }
      const wsHor = getOrCreateSheet(wb, "HORÍMETROS"); clearSheetValues(wsHor, 2); const horByKey = new Map<string, HoriItem[]>();
      for (const h of allHor) { const d = pick(h, ["day", "data", "data_turno"]); if (!d) continue; const dayKey = String(d).slice(0, 10); const t = normTurno(pick(h, ["turno", "shift", "turn"])); const key = `${dayKey}|${t || "?"}`; const arr = horByKey.get(key) || []; arr.push(h); horByKey.set(key, arr); }
      let rHor = 2;
      for (const d of days) {
        const dt = parseISODate(d); const buckets = (["1", "2", "?"] as const).map((t) => ({ t, list: horByKey.get(`${d}|${t}`) || [] })).filter((x) => x.list.length);
        if (!buckets.length) { setCell(wsHor, rHor, 1, dt); rHor++; continue; }
        for (const bucket of buckets) {
          const byEq = new Map<string, { ini: number | null; fim: number | null; turno: any }>();
          for (const h of bucket.list) {
            const eq = normEq(pick(h, ["equipamento", "equipment", "eq", "tag"])); const ini = Number(pick(h, ["horimetro_ini", "ini", "inicial", "start"]) ?? NaN); const fim = Number(pick(h, ["horimetro_fim", "fim", "final", "end"]) ?? NaN); const turno = pick(h, ["turno", "shift", "turn"]); if (!eq) continue;
            const cur = byEq.get(eq); const next = { ini: Number.isFinite(ini) ? ini : null, fim: Number.isFinite(fim) ? fim : null, turno }; byEq.set(eq, cur ? { ini: cur.ini ?? next.ini, fim: cur.fim ?? next.fim, turno: cur.turno ?? next.turno } : next);
          }
          const bt01 = byEq.get("BT01") || null, bt02 = byEq.get("BT02") || null, pn01 = byEq.get("PN01") || null, pn02 = byEq.get("PN02") || null;
          const hTr = (x: any) => (x?.ini != null && x?.fim != null ? Math.round((x.fim - x.ini) * 100) / 100 : "");
          setCell(wsHor, rHor, 1, dt); setCell(wsHor, rHor, 2, bt01?.ini ?? ""); setCell(wsHor, rHor, 3, bt01?.fim ?? ""); setCell(wsHor, rHor, 4, bt02?.ini ?? ""); setCell(wsHor, rHor, 5, bt02?.fim ?? ""); setCell(wsHor, rHor, 6, pn01?.ini ?? ""); setCell(wsHor, rHor, 7, pn01?.fim ?? ""); setCell(wsHor, rHor, 8, pn02?.ini ?? ""); setCell(wsHor, rHor, 9, pn02?.fim ?? "");
          const t = bt01?.turno ?? bt02?.turno ?? pn01?.turno ?? pn02?.turno ?? bucket.t; setCell(wsHor, rHor, 10, t ? String(t) : ""); setCell(wsHor, rHor, 11, hTr(bt01)); setCell(wsHor, rHor, 12, hTr(bt02)); setCell(wsHor, rHor, 13, hTr(pn01)); setCell(wsHor, rHor, 14, hTr(pn02)); rHor++;
        }
      }
      const wsProd = getOrCreateSheet(wb, "PRODUÇÃO"); clearSheetValues(wsProd, 3); const prodShiftMap = new Map<string, { t1: number; t2: number; total: number; obs: string }>();
      for (const pd of plantDays) {
        let t1 = 0, t2 = 0; for (const r of pd.rows || []) { const ton = Number((r as any)?.ton) || 0; if (!ton) continue; const h = periodStartHour((r as any)?.period); if (h === null) continue; turnoByHour(h) === 1 ? (t1 += ton) : (t2 += ton); }
        const total = Math.round((t1 + t2) * 100) / 100; prodShiftMap.set(pd.day, { t1: Math.round(t1 * 100) / 100, t2: Math.round(t2 * 100) / 100, total, obs: String(pd.obs || "") });
      }
      let rProd = 3; for (const d of days) { const dt = parseISODate(d); const v = prodShiftMap.get(d) || { t1: 0, t2: 0, total: 0, obs: "" }; setCell(wsProd, rProd, 2, dt); setCell(wsProd, rProd, 3, ""); setCell(wsProd, rProd, 4, v.total || ""); setCell(wsProd, rProd, 5, v.obs || ""); rProd++; }
      const wsProdTurno = getOrCreateSheet(wb, "Planilha1"); clearSheetValues(wsProdTurno, 2); let rPT = 2; for (const d of days) { const dt = parseISODate(d); const v = prodShiftMap.get(d) || { t1: 0, t2: 0, total: 0, obs: "" }; setCell(wsProdTurno, rPT, 1, dt); setCell(wsProdTurno, rPT, 2, ""); setCell(wsProdTurno, rPT, 3, v.t1 || ""); setCell(wsProdTurno, rPT, 4, v.t2 || ""); setCell(wsProdTurno, rPT, 5, v.total || ""); rPT++; }
      const outBuf = XLSX.write(wb, { type: "array", bookType: "xlsx" }); const fileName = fromDay === toDay ? `BASE_PLANTA_${fromDay}.xlsx` : `BASE_PLANTA_${fromDay}_a_${toDay}.xlsx`;
      downloadArrayBuffer(outBuf, fileName); setLastFile(fileName); setMsg(`✅ Exportado com sucesso: ${fileName}`);
    } catch (e: any) { setMsg(`❌ ${e?.message || String(e)}`); }
    finally { setBusy(false); }
  }

  async function handleExportModeloParadas() {
    setMsg(""); setBusy(true); setLastMode("paradas");
    try {
      const tplRes = await fetch("/MODELO_PARADAS.xlsx"); if (!tplRes.ok) throw new Error("Não achei /MODELO_PARADAS.xlsx em public/"); const tplBuf = await tplRes.arrayBuffer(); const wb = XLSX.read(tplBuf, { type: "array", cellDates: true });
      const sheetName = wb.SheetNames[0] || "Modelo para exportação"; const ws = getOrCreateSheet(wb, sheetName); const days = dateRange(fromDay, toDay);
      const stops: any[] = []; for (const d of days) { try { const st = await apiGet<any[]>(`/api/stops?day=${d}`); for (const s of st || []) stops.push(s); } catch {} }
      const byDay = new Map<string, { corr: number; prev: number; total: number }>(); for (const d of days) byDay.set(d, { corr: 0, prev: 0, total: 0 });
      const detailRows: { day: string; desc: string; tipo: string; horas: number }[] = [];
      for (const s of stops) {
        const day = String(pick(s, ["day", "data_turno", "data", "shift_day"]) || "").slice(0, 10) || ""; if (!day) continue;
        const tipo = classifyMaintenanceType(s); const horas = stopDurationHours(s); const desc = String(pick(s, ["descricao", "descricao_detalhada", "detail", "detalhe", "obs"]) || "").trim();
        const cur = byDay.get(day) || { corr: 0, prev: 0, total: 0 }; if (tipo === "Corretiva") cur.corr += horas; else if (tipo === "Preventiva") cur.prev += horas; cur.total += horas; byDay.set(day, cur);
        detailRows.push({ day, desc, tipo: tipo || "", horas });
      }
      for (const [k, v] of byDay.entries()) { v.corr = Math.round(v.corr * 100) / 100; v.prev = Math.round(v.prev * 100) / 100; v.total = Math.round(v.total * 100) / 100; byDay.set(k, v); }
      clearSheetValues(ws, 4); let r = 4; for (const d of days) { const dt = parseISODate(d); const v = byDay.get(d) || { corr: 0, prev: 0, total: 0 }; setCell(ws, r, 1, dt); setCell(ws, r, 2, v.corr || ""); setCell(ws, r, 3, v.prev || ""); setCell(ws, r, 4, v.total || ""); r++; }
      detailRows.sort((a, b) => (a.day !== b.day ? a.day.localeCompare(b.day) : (b.horas || 0) - (a.horas || 0)));
      let r2 = 4; for (const row of detailRows) { const dt = parseISODate(row.day); setCell(ws, r2, 6, dt); setCell(ws, r2, 7, row.desc || ""); setCell(ws, r2, 8, row.tipo || ""); setCell(ws, r2, 9, row.horas || ""); r2++; }
      const outBuf = XLSX.write(wb, { type: "array", bookType: "xlsx" }); const fileName = fromDay === toDay ? `PARADAS_MODELO_${fromDay}.xlsx` : `PARADAS_MODELO_${fromDay}_a_${toDay}.xlsx`;
      downloadArrayBuffer(outBuf, fileName); setLastFile(fileName); setMsg(`✅ Exportado com sucesso: ${fileName}`);
    } catch (e: any) { setMsg(`❌ ${e?.message || String(e)}`); }
    finally { setBusy(false); }
  }

  function handleExportFilteredExcel() {
    if (!previewData) { setMsg("❌ Gere uma pré-visualização antes de exportar."); return; }
    const wb = XLSX.utils.book_new(); const titleRows = [[previewData.title], [previewData.subtitle], [`Período: ${periodLabel}`], []]; const header = previewData.columns.map((c) => c.label); const body = previewData.rows.map((row) => previewData.columns.map((c) => row[c.key] ?? ""));
    const ws = XLSX.utils.aoa_to_sheet([...titleRows, header, ...body]); ws["!cols"] = previewData.columns.map((c) => ({ wch: Math.max(14, Math.round((c.width || 120) / 8)) })); ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: titleRows.length, c: 0 }, e: { r: titleRows.length + Math.max(body.length, 1), c: header.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio"); const outBuf = XLSX.write(wb, { type: "array", bookType: "xlsx" }); const fileName = `EXPORT_${previewMode.toUpperCase()}_${fromDay}_a_${toDay}.xlsx`;
    downloadArrayBuffer(outBuf, fileName); setLastFile(fileName); setMsg(`✅ Excel filtrado exportado: ${fileName}`);
  }

  function handleTechAnalysisPdf() {
    if (!previewData) { setMsg("❌ Gere uma pré-visualização antes de gerar a análise técnica."); return; }
    const textLines = ["ANÁLISE TÉCNICA - MONPLANT", "", `Relatório: ${previewData.title}`, `Período: ${periodLabel}`, `Registros filtrados: ${previewData.total}`, "", "Resumo técnico:", `- Modo selecionado: ${previewMode}.`, `- Filtros: turno=${filters.turno || "todos"}, letra=${filters.letra || "todas"}, planta=${filters.planta || "todas"}.`, `- Pesquisa livre: ${filters.pesquisa || "(vazia)"}.`, "", "Top 10 linhas da prévia:", ...previewData.rows.slice(0, 10).map((r, i) => `${i + 1}. ${previewData.columns.map((c) => `${c.label}: ${r[c.key] ?? "-"}`).join(" | ")}`), "", "Observação: para salvar em PDF, use Imprimir > Salvar como PDF."];
    const w = window.open("", "_blank", "width=980,height=760"); if (!w) { setMsg("❌ Não foi possível abrir a janela para gerar o PDF."); return; }
    w.document.write(`<html><head><title>Analise Tecnica</title></head><body style=\"font-family:Arial;padding:24px;white-space:pre-wrap\">${textLines.join("\n")}</body></html>`); w.document.close(); w.focus(); w.print(); setMsg("✅ Análise técnica aberta. No diálogo de impressão, escolha 'Salvar como PDF'.");
  }

  return {
    fromDay, toDay, setFromDay, setToDay, busy, previewBusy, msg, lastFile, lastMode,
    previewMode, previewData, plants, selectedPlantId, setSelectedPlantId, filters, setFilters,
    periodLabel, handlePreview, handleExport, handleExportModeloParadas, handleExportFilteredExcel, handleTechAnalysisPdf,
  };
}
