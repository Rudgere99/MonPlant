import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";

type PlantRow = { period: string; ton: number | null; freq: number | null };
type PlantDay = { day: string; obs?: string | null; rows: PlantRow[] };
type StopItem = any;
type HoriItem = any;
type ExportMode = "base" | "paradas";
type PreviewMode = "base" | "paradas";

type PreviewColumn = {
  key: string;
  label: string;
  width?: number;
};

type PreviewData = {
  title: string;
  subtitle: string;
  columns: PreviewColumn[];
  rows: Record<string, any>[];
  total: number;
};

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

function pick(obj: any, keys: string[]) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return null;
}

function normEq(v: any) {
  const s = String(v || "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");
  return s.replace(/-/g, "");
}

function normTurno(v: any) {
  const s = String(v ?? "").toLowerCase();
  if (!s) return "";
  if (s.includes("2")) return "2";
  if (s.includes("1")) return "1";
  return "";
}

function combineDateAndHour(dateStr: any, hourStr: any) {
  const d = String(dateStr || "").slice(0, 10);
  const h = String(hourStr || "").trim();
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !h) return null;
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

function classifyMaintenanceType(stop: any): "Corretiva" | "Preventiva" | "" {
  const raw =
    String(pick(stop, ["tipo", "tipo_parada", "stop_type", "type"]) || "") +
    " " +
    String(pick(stop, ["atividade", "activity"]) || "") +
    " " +
    String(pick(stop, ["descricao", "descricao_detalhada", "detail", "detalhe", "obs"]) || "");
  const s = raw.toUpperCase();

  if (s.includes("PREV")) return "Preventiva";
  if (s.includes("CORR") || s.includes("CORRET")) return "Corretiva";
  if (s.includes("PMP") || s.includes("PM ")) return "Preventiva";
  return "";
}

function stopDurationHours(stop: any): number {
  const dataIni = pick(stop, ["data_inicio", "dt_inicio", "data_ini", "day_ini"]);
  const horaIni = pick(stop, ["hora_inicio", "hr_inicio", "time_ini", "hora_ini"]);
  const dataFim = pick(stop, ["data_fim", "dt_fim", "data_end", "day_fim"]);
  const horaFim = pick(stop, ["hora_fim", "hr_fim", "time_end", "hora_end"]);

  const startV =
    combineDateAndHour(dataIni, horaIni) ??
    pick(stop, ["start_at", "inicio", "start", "dt_inicio", "data_inicio"]);

  const endV =
    combineDateAndHour(dataFim, horaFim) ??
    pick(stop, ["end_at", "fim", "end", "dt_fim", "data_fim"]);

  const tempo = Number(pick(stop, ["tempo_h", "tempo_parada_h", "duration_h", "duracao_h"]) ?? NaN);

  if (Number.isFinite(tempo)) return Math.round(tempo * 100) / 100;

  const hd = startV && endV ? hoursDiff(startV, endV) : null;
  return Number.isFinite(hd as any) ? (hd as number) : 0;
}

function periodStartHour(p: any): number | null {
  const s = String(p || "").trim();
  let m = s.match(/^(\d{2}):\d{2}\s*-\s*\d{2}:\d{2}$/);
  if (m) return Number(m[1]);
  m = s.replace(/\s+/g, "").match(/^(\d{2})-(\d{2})$/);
  if (m) return Number(m[1]);
  return null;
}

function turnoByHour(h: number): 1 | 2 {
  return h >= 7 && h <= 18 ? 1 : 2;
}

function eqToPlanta(eqNormNoHyphen: string): string {
  if (eqNormNoHyphen === "PN01" || eqNormNoHyphen === "PNR01" || eqNormNoHyphen === "PNR001") return "Peneira Pnr001";
  if (eqNormNoHyphen === "PN02" || eqNormNoHyphen === "PNR02" || eqNormNoHyphen === "PNR002") return "Peneira Pnr002";
  if (eqNormNoHyphen === "BT01" || eqNormNoHyphen === "BT001") return "Britador Primário";
  if (eqNormNoHyphen === "BT02" || eqNormNoHyphen === "BT002") return "Britador Secundário";
  return "";
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

function fmtDate(v: string) {
  const d = new Date(`${v}T12:00:00`);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("pt-BR");
}

function fmtDateTime(v: any) {
  if (!v) return "-";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR");
}

function fmtNum(v: any, digits = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function joinDateTime(dateStr: any, hourStr: any) {
  const d = String(dateStr || "").slice(0, 10);
  const h = String(hourStr || "").trim();
  if (!d && !h) return "-";
  if (!h) return d || "-";
  return `${d} ${h}`;
}

function StatCard({ title, value, sub }: { title: string; value: string | number; sub?: string }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,.08)",
        background: "linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015))",
        borderRadius: 18,
        padding: 16,
        minHeight: 88,
        boxShadow: "0 10px 30px rgba(0,0,0,.18)",
      }}
    >
      <div style={{ fontSize: 12, color: "rgba(255,255,255,.58)", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.1 }}>{value}</div>
      {sub ? <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,.48)" }}>{sub}</div> : null}
    </div>
  );
}

function ToneBadge({ children, tone = "muted" }: { children: any; tone?: "muted" | "info" | "ok" | "warn" }) {
  const styles: Record<string, React.CSSProperties> = {
    muted: {
      background: "rgba(148,163,184,.12)",
      border: "1px solid rgba(148,163,184,.20)",
      color: "#cbd5e1",
    },
    info: {
      background: "rgba(59,130,246,.14)",
      border: "1px solid rgba(59,130,246,.28)",
      color: "#93c5fd",
    },
    ok: {
      background: "rgba(34,197,94,.14)",
      border: "1px solid rgba(34,197,94,.28)",
      color: "#86efac",
    },
    warn: {
      background: "rgba(245,158,11,.14)",
      border: "1px solid rgba(245,158,11,.28)",
      color: "#fcd34d",
    },
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 0.2,
        ...styles[tone],
      }}
    >
      {children}
    </span>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: any }) {
  return (
    <button
      className={active ? "mp-btn mp-btn-primary" : "mp-btn"}
      onClick={onClick}
      style={{
        minWidth: 180,
        height: 40,
        borderRadius: 12,
        fontWeight: 900,
        opacity: active ? 1 : 0.92,
      }}
    >
      {children}
    </button>
  );
}

function ActionCard({
  title,
  description,
  buttonText,
  secondaryText,
  buttonTone,
  disabled,
  onPreview,
  onExport,
}: {
  title: string;
  description: string;
  buttonText: string;
  secondaryText: string;
  buttonTone: "primary" | "secondary";
  disabled: boolean;
  onPreview: () => void;
  onExport: () => void;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,.08)",
        background: "rgba(255,255,255,.03)",
        padding: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.56)", marginTop: 6 }}>{description}</div>
        </div>
        <ToneBadge tone={buttonTone === "primary" ? "info" : "warn"}>{buttonTone === "primary" ? "Relatório Base" : "Relatório Paradas"}</ToneBadge>
      </div>

      <div style={{ height: 14 }} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="mp-btn" onClick={onPreview} disabled={disabled} style={{ minWidth: 170, height: 42, borderRadius: 12, fontWeight: 800 }}>
          {secondaryText}
        </button>
        <button
          className={buttonTone === "primary" ? "mp-btn mp-btn-primary" : "mp-btn"}
          onClick={onExport}
          disabled={disabled}
          style={{ minWidth: 190, height: 42, borderRadius: 12, fontWeight: 900 }}
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
}

function PreviewTable({ data, loading }: { data: PreviewData | null; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,.62)" }}>
        Carregando pré-visualização do relatório...
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,.58)" }}>
        Clique em <b>Pré-visualizar</b> para ver como o relatório será exibido antes da exportação.
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{data.title}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,.54)" }}>{data.subtitle}</div>
        </div>
        <ToneBadge tone="muted">Mostrando {data.rows.length} de {data.total} registro(s)</ToneBadge>
      </div>

      <div
        style={{
          overflowX: "auto",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,.07)",
          background: "rgba(7,10,18,.45)",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1160 }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,.035)" }}>
              {data.columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    textAlign: "left",
                    padding: "14px 14px",
                    fontSize: 12,
                    color: "rgba(255,255,255,.62)",
                    fontWeight: 800,
                    borderBottom: "1px solid rgba(255,255,255,.06)",
                    whiteSpace: "nowrap",
                    minWidth: col.width || 130,
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, idx) => (
              <tr key={idx} style={{ background: idx % 2 === 0 ? "rgba(255,255,255,.012)" : "transparent" }}>
                {data.columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: 14,
                      borderBottom: "1px solid rgba(255,255,255,.05)",
                      color: "rgba(255,255,255,.84)",
                      verticalAlign: "top",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row[col.key] ?? "-"}
                  </td>
                ))}
              </tr>
            ))}

            {!data.rows.length && (
              <tr>
                <td colSpan={data.columns.length} style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,.56)" }}>
                  Nenhum registro encontrado para este período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

const BASE_PREVIEW_COLUMNS: PreviewColumn[] = [
  { key: "dia", label: "Dia", width: 110 },
  { key: "turno", label: "Turno", width: 90 },
  { key: "bt01_ini", label: "BT-01 Inicial", width: 120 },
  { key: "bt01_fim", label: "BT-01 Final", width: 120 },
  { key: "bt02_ini", label: "BT-02 Inicial", width: 120 },
  { key: "bt02_fim", label: "BT-02 Final", width: 120 },
  { key: "pn01_ini", label: "PN-01 Inicial", width: 120 },
  { key: "pn01_fim", label: "PN-01 Final", width: 120 },
  { key: "pn02_ini", label: "PN-02 Inicial", width: 120 },
  { key: "pn02_fim", label: "PN-02 Final", width: 120 },
  { key: "producao_total", label: "Produção Total", width: 130 },
  { key: "observacao", label: "Observação", width: 220 },
];

const PARADAS_PREVIEW_COLUMNS: PreviewColumn[] = [
  { key: "dia", label: "Dia", width: 110 },
  { key: "equipamento", label: "Equipamento", width: 150 },
  { key: "inicio", label: "Início", width: 150 },
  { key: "fim", label: "Fim", width: 150 },
  { key: "tipo", label: "Tipo", width: 130 },
  { key: "atividade", label: "Atividade", width: 180 },
  { key: "descricao", label: "Descrição", width: 260 },
  { key: "horas", label: "Tempo (h)", width: 110 },
  { key: "classificacao", label: "Classificação", width: 130 },
  { key: "planta", label: "Área/Planta", width: 180 },
];

export default function Exportar() {
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

  const days = useMemo(() => dateRange(fromDay, toDay), [fromDay, toDay]);
  const periodLabel = useMemo(() => {
    if (fromDay === toDay) return fmtDate(fromDay);
    return `${fmtDate(fromDay)} até ${fmtDate(toDay)}`;
  }, [fromDay, toDay]);

  async function buildBasePreview(daysInput: string[]): Promise<PreviewData> {
    const plantDays: PlantDay[] = [];
    const allHor: HoriItem[] = [];

    for (const d of daysInput) {
      try {
        const pd = await apiGet<PlantDay>(`/api/plant-production/${d}`);
        plantDays.push(pd);
      } catch {
        plantDays.push({ day: d, obs: "", rows: [] });
      }

      try {
        const hh = await apiGet<any[]>(`/api/horimetros?day=${d}&limit=2000`);
        for (const h of hh || []) allHor.push(h);
      } catch {}
    }

    const prodShiftMap = new Map<string, { total: number; obs: string }>();
    for (const pd of plantDays) {
      let t1 = 0;
      let t2 = 0;

      for (const r of pd.rows || []) {
        const ton = Number((r as any)?.ton) || 0;
        if (!ton) continue;
        const h = periodStartHour((r as any)?.period);
        if (h === null) continue;
        const t = turnoByHour(h);
        if (t === 1) t1 += ton;
        else t2 += ton;
      }

      const total = Math.round((t1 + t2) * 100) / 100;
      prodShiftMap.set(pd.day, { total, obs: String(pd.obs || "") });
    }

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

    const rows: Record<string, any>[] = [];

    for (const d of daysInput) {
      const buckets = (["1", "2", "?"] as const)
        .map((t) => ({ t, list: horByKey.get(`${d}|${t}`) || [] }))
        .filter((x) => x.list.length);

      if (!buckets.length) {
        const prod = prodShiftMap.get(d);
        rows.push({
          dia: fmtDate(d),
          turno: "-",
          bt01_ini: "-",
          bt01_fim: "-",
          bt02_ini: "-",
          bt02_fim: "-",
          pn01_ini: "-",
          pn01_fim: "-",
          pn02_ini: "-",
          pn02_fim: "-",
          producao_total: prod?.total ? fmtNum(prod.total, 0) : "-",
          observacao: prod?.obs || "-",
        });
        continue;
      }

      for (const bucket of buckets) {
        const byEq = new Map<string, { ini: number | null; fim: number | null; turno: any }>();

        for (const h of bucket.list) {
          const eqRaw = pick(h, ["equipamento", "equipment", "eq", "tag"]);
          const eq = normEq(eqRaw);
          const ini = Number(pick(h, ["horimetro_ini", "ini", "inicial", "start"]) ?? NaN);
          const fim = Number(pick(h, ["horimetro_fim", "fim", "final", "end"]) ?? NaN);
          const turno = pick(h, ["turno", "shift", "turn"]);
          if (!eq) continue;

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
        const prod = prodShiftMap.get(d);

        rows.push({
          dia: fmtDate(d),
          turno: String((bt01?.turno ?? bt02?.turno ?? pn01?.turno ?? pn02?.turno ?? bucket.t) || "-"),
          bt01_ini: bt01?.ini != null ? fmtNum(bt01.ini, 0) : "-",
          bt01_fim: bt01?.fim != null ? fmtNum(bt01.fim, 0) : "-",
          bt02_ini: bt02?.ini != null ? fmtNum(bt02.ini, 0) : "-",
          bt02_fim: bt02?.fim != null ? fmtNum(bt02.fim, 0) : "-",
          pn01_ini: pn01?.ini != null ? fmtNum(pn01.ini, 0) : "-",
          pn01_fim: pn01?.fim != null ? fmtNum(pn01.fim, 0) : "-",
          pn02_ini: pn02?.ini != null ? fmtNum(pn02.ini, 0) : "-",
          pn02_fim: pn02?.fim != null ? fmtNum(pn02.fim, 0) : "-",
          producao_total: prod?.total ? fmtNum(prod.total, 0) : "-",
          observacao: prod?.obs || "-",
        });
      }
    }

    return {
      title: "Pré-visualização • Relatório Base",
      subtitle: "Horímetros consolidados por dia/turno com produção total do período selecionado.",
      columns: BASE_PREVIEW_COLUMNS,
      rows: rows.slice(0, 30),
      total: rows.length,
    };
  }

  async function buildParadasPreview(daysInput: string[]): Promise<PreviewData> {
    const stops: any[] = [];
    for (const d of daysInput) {
      try {
        const st = await apiGet<any[]>(`/api/stops?day=${d}`);
        for (const s of st || []) stops.push(s);
      } catch {}
    }

    const rows = stops
      .map((s) => {
        const day = String(pick(s, ["day", "data_turno", "data", "shift_day"]) || "").slice(0, 10);
        const equip = String(pick(s, ["equipamento", "equipment", "eq", "tag", "planta"]) || "");
        const eqNormNoHyphen = normEq(equip);
        const planta = eqToPlanta(eqNormNoHyphen) || "-";
        const tipo = String(pick(s, ["tipo", "tipo_parada", "stop_type", "type"]) || "");
        const atividade = String(pick(s, ["atividade", "activity"]) || "");
        const descricao = String(pick(s, ["descricao", "descricao_detalhada", "detail", "detalhe", "obs"]) || "");
        const horas = stopDurationHours(s);
        const classificacao = classifyMaintenanceType(s) || "-";

        return {
          dia: day ? fmtDate(day) : "-",
          equipamento: equip || "-",
          inicio: joinDateTime(pick(s, ["data_inicio", "dt_inicio", "data_ini", "day_ini"]), pick(s, ["hora_inicio", "hr_inicio", "time_ini", "hora_ini"])),
          fim: joinDateTime(pick(s, ["data_fim", "dt_fim", "data_end", "day_fim"]), pick(s, ["hora_fim", "hr_fim", "time_end", "hora_end"])),
          tipo: tipo || "-",
          atividade: atividade || "-",
          descricao: descricao || "-",
          horas: fmtNum(horas, 2),
          classificacao,
          planta,
          __sort: String(pick(s, ["created_at"]) || ""),
        };
      })
      .sort((a, b) => String(b.__sort || "").localeCompare(String(a.__sort || "")));

    return {
      title: "Pré-visualização • Relatório de Paradas",
      subtitle: "Lançamentos de paradas e manutenção que serão exportados no modelo resumido/detalhado.",
      columns: PARADAS_PREVIEW_COLUMNS,
      rows: rows.slice(0, 30).map(({ __sort, ...rest }) => rest),
      total: rows.length,
    };
  }

  async function handlePreview(mode: PreviewMode) {
    setPreviewMode(mode);
    setPreviewBusy(true);
    setMsg("");

    try {
      const d = dateRange(fromDay, toDay);
      const data = mode === "base" ? await buildBasePreview(d) : await buildParadasPreview(d);
      setPreviewData(data);
    } catch (e: any) {
      setPreviewData(null);
      setMsg(`❌ ${e?.message || String(e)}`);
    } finally {
      setPreviewBusy(false);
    }
  }

  async function handleExport() {
    setMsg("");
    setBusy(true);
    setLastMode("base");

    try {
      const tplRes = await fetch("/BASE_PLANTA.xlsx");
      if (!tplRes.ok) throw new Error("Não achei /BASE_PLANTA.xlsx em public/");
      const tplBuf = await tplRes.arrayBuffer();
      const wb = XLSX.read(tplBuf, { type: "array", cellDates: true });
      const days = dateRange(fromDay, toDay);

      const plantDays: PlantDay[] = [];
      const allStops: StopItem[] = [];
      const allHor: HoriItem[] = [];

      for (const d of days) {
        try {
          const pd = await apiGet<PlantDay>(`/api/plant-production/${d}`);
          plantDays.push(pd);
        } catch {
          plantDays.push({ day: d, obs: "", rows: [] });
        }

        try {
          const st = await apiGet<any[]>(`/api/stops?day=${d}`);
          for (const s of st || []) allStops.push(s);
        } catch {}

        try {
          const hh = await apiGet<any[]>(`/api/horimetros?day=${d}&limit=2000`);
          for (const h of hh || []) allHor.push(h);
        } catch {}
      }

      const wsParadas = getOrCreateSheet(wb, "Paradas");
      clearSheetValues(wsParadas, 2);

      const wsParTot = getOrCreateSheet(wb, "PARADAS TOTAIS");
      clearSheetValues(wsParTot, 3);

      allStops.sort((a, b) => {
        const sa = pick(a, ["start_at", "inicio", "start", "data_inicio", "dt_inicio"]);
        const sb = pick(b, ["start_at", "inicio", "start", "data_inicio", "dt_inicio"]);
        const da = sa ? new Date(String(sa)).getTime() : 0;
        const db = sb ? new Date(String(sb)).getTime() : 0;
        return da - db;
      });

      let rPar = 2;
      let rParTot = 3;

      for (const s of allStops) {
        const day = pick(s, ["day", "data_turno", "data", "shift_day"]) || null;
        const turno = pick(s, ["turno", "shift", "turn", "turno_nome"]) || pick(s, ["turno_num", "shift_num"]) || "";

        const dataIni = pick(s, ["data_inicio", "dt_inicio", "data_ini", "day_ini"]);
        const horaIni = pick(s, ["hora_inicio", "hr_inicio", "time_ini", "hora_ini"]);
        const dataFim = pick(s, ["data_fim", "dt_fim", "data_end", "day_fim"]);
        const horaFim = pick(s, ["hora_fim", "hr_fim", "time_end", "hora_end"]);

        const startV = combineDateAndHour(dataIni, horaIni) ?? pick(s, ["start_at", "inicio", "start", "dt_inicio", "data_inicio"]);
        const endV = combineDateAndHour(dataFim, horaFim) ?? pick(s, ["end_at", "fim", "end", "dt_fim", "data_fim"]);

        const start = toDateTimeParts(startV);
        const end = toDateTimeParts(endV);

        const equip = pick(s, ["equipamento", "equipment", "eq", "tag", "planta"]) || "";
        const tipo = pick(s, ["tipo", "tipo_parada", "stop_type", "type"]) || "";
        const ativ = pick(s, ["atividade", "activity"]) || "";
        const desc = pick(s, ["descricao", "descricao_detalhada", "detail", "detalhe", "obs"]) || "";

        const tempo = pick(s, ["tempo_h", "tempo_parada_h", "duration_h", "duracao_h"]) ?? (startV && endV ? hoursDiff(startV, endV) : null);

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

        const eqNormNoHyphen = normEq(equip);
        const planta = eqToPlanta(eqNormNoHyphen) || "";
        const t = normTurno(turno) || "";

        setCell(wsParTot, rParTot, 2, start.date ? new Date(start.date.getFullYear(), start.date.getMonth(), start.date.getDate()) : "");
        setCell(wsParTot, rParTot, 3, start.hhmm || "");
        setCell(wsParTot, rParTot, 4, planta);
        setCell(wsParTot, rParTot, 5, t ? Number(t) : "");
        setCell(wsParTot, rParTot, 6, String(tipo || ""));
        setCell(wsParTot, rParTot, 7, "");
        setCell(wsParTot, rParTot, 8, String(desc || ""));
        setCell(wsParTot, rParTot, 9, end.date ? new Date(end.date.getFullYear(), end.date.getMonth(), end.date.getDate()) : "");
        setCell(wsParTot, rParTot, 10, end.hhmm || "");
        rParTot++;
      }

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

          const hTr = (x: any) => (x?.ini != null && x?.fim != null ? Math.round((x.fim - x.ini) * 100) / 100 : "");

          setCell(wsHor, rHor, 1, dt);
          setCell(wsHor, rHor, 2, bt01?.ini ?? "");
          setCell(wsHor, rHor, 3, bt01?.fim ?? "");
          setCell(wsHor, rHor, 4, bt02?.ini ?? "");
          setCell(wsHor, rHor, 5, bt02?.fim ?? "");
          setCell(wsHor, rHor, 6, pn01?.ini ?? "");
          setCell(wsHor, rHor, 7, pn01?.fim ?? "");
          setCell(wsHor, rHor, 8, pn02?.ini ?? "");
          setCell(wsHor, rHor, 9, pn02?.fim ?? "");

          const t = bt01?.turno ?? bt02?.turno ?? pn01?.turno ?? pn02?.turno ?? bucket.t;
          setCell(wsHor, rHor, 10, t ? String(t) : "");
          setCell(wsHor, rHor, 11, hTr(bt01));
          setCell(wsHor, rHor, 12, hTr(bt02));
          setCell(wsHor, rHor, 13, hTr(pn01));
          setCell(wsHor, rHor, 14, hTr(pn02));
          rHor++;
        }
      }

      const wsProd = getOrCreateSheet(wb, "PRODUÇÃO");
      clearSheetValues(wsProd, 3);

      const prodShiftMap = new Map<string, { t1: number; t2: number; total: number; obs: string }>();

      for (const pd of plantDays) {
        let t1 = 0;
        let t2 = 0;

        for (const r of pd.rows || []) {
          const ton = Number((r as any)?.ton) || 0;
          if (!ton) continue;
          const h = periodStartHour((r as any)?.period);
          if (h === null) continue;
          const t = turnoByHour(h);
          if (t === 1) t1 += ton;
          else t2 += ton;
        }

        const total = Math.round((t1 + t2) * 100) / 100;
        prodShiftMap.set(pd.day, {
          t1: Math.round(t1 * 100) / 100,
          t2: Math.round(t2 * 100) / 100,
          total,
          obs: String(pd.obs || ""),
        });
      }

      let rProd = 3;
      for (const d of days) {
        const dt = parseISODate(d);
        const v = prodShiftMap.get(d) || { t1: 0, t2: 0, total: 0, obs: "" };
        setCell(wsProd, rProd, 2, dt);
        setCell(wsProd, rProd, 3, "");
        setCell(wsProd, rProd, 4, v.total || "");
        setCell(wsProd, rProd, 5, v.obs || "");
        rProd++;
      }

      const wsProdTurno = getOrCreateSheet(wb, "Planilha1");
      clearSheetValues(wsProdTurno, 2);

      let rPT = 2;
      for (const d of days) {
        const dt = parseISODate(d);
        const v = prodShiftMap.get(d) || { t1: 0, t2: 0, total: 0, obs: "" };
        setCell(wsProdTurno, rPT, 1, dt);
        setCell(wsProdTurno, rPT, 2, "");
        setCell(wsProdTurno, rPT, 3, v.t1 || "");
        setCell(wsProdTurno, rPT, 4, v.t2 || "");
        setCell(wsProdTurno, rPT, 5, v.total || "");
        rPT++;
      }

      const outBuf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const fileName = fromDay === toDay ? `BASE_PLANTA_${fromDay}.xlsx` : `BASE_PLANTA_${fromDay}_a_${toDay}.xlsx`;

      downloadArrayBuffer(outBuf, fileName);
      setLastFile(fileName);
      setMsg(`✅ Exportado com sucesso: ${fileName}`);
    } catch (e: any) {
      setMsg(`❌ ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleExportModeloParadas() {
    setMsg("");
    setBusy(true);
    setLastMode("paradas");

    try {
      const tplRes = await fetch("/MODELO_PARADAS.xlsx");
      if (!tplRes.ok) throw new Error("Não achei /MODELO_PARADAS.xlsx em public/");
      const tplBuf = await tplRes.arrayBuffer();
      const wb = XLSX.read(tplBuf, { type: "array", cellDates: true });

      const sheetName = wb.SheetNames[0] || "Modelo para exportação";
      const ws = getOrCreateSheet(wb, sheetName);
      const days = dateRange(fromDay, toDay);

      const stops: any[] = [];
      for (const d of days) {
        try {
          const st = await apiGet<any[]>(`/api/stops?day=${d}`);
          for (const s of st || []) stops.push(s);
        } catch {}
      }

      const byDay = new Map<string, { corr: number; prev: number; total: number }>();
      for (const d of days) byDay.set(d, { corr: 0, prev: 0, total: 0 });

      const detailRows: { day: string; desc: string; tipo: string; horas: number }[] = [];

      for (const s of stops) {
        const day = String(pick(s, ["day", "data_turno", "data", "shift_day"]) || "").slice(0, 10) || "";
        if (!day) continue;

        const tipo = classifyMaintenanceType(s);
        const horas = stopDurationHours(s);
        const desc = String(pick(s, ["descricao", "descricao_detalhada", "detail", "detalhe", "obs"]) || "").trim();

        const cur = byDay.get(day) || { corr: 0, prev: 0, total: 0 };
        if (tipo === "Corretiva") cur.corr += horas;
        else if (tipo === "Preventiva") cur.prev += horas;
        cur.total += horas;
        byDay.set(day, cur);

        detailRows.push({ day, desc, tipo: tipo || "", horas });
      }

      for (const [k, v] of byDay.entries()) {
        v.corr = Math.round(v.corr * 100) / 100;
        v.prev = Math.round(v.prev * 100) / 100;
        v.total = Math.round(v.total * 100) / 100;
        byDay.set(k, v);
      }

      clearSheetValues(ws, 4);

      let r = 4;
      for (const d of days) {
        const dt = parseISODate(d);
        const v = byDay.get(d) || { corr: 0, prev: 0, total: 0 };
        setCell(ws, r, 1, dt);
        setCell(ws, r, 2, v.corr || "");
        setCell(ws, r, 3, v.prev || "");
        setCell(ws, r, 4, v.total || "");
        r++;
      }

      detailRows.sort((a, b) => {
        if (a.day !== b.day) return a.day.localeCompare(b.day);
        return (b.horas || 0) - (a.horas || 0);
      });

      let r2 = 4;
      for (const row of detailRows) {
        const dt = parseISODate(row.day);
        setCell(ws, r2, 6, dt);
        setCell(ws, r2, 7, row.desc || "");
        setCell(ws, r2, 8, row.tipo || "");
        setCell(ws, r2, 9, row.horas || "");
        r2++;
      }

      const outBuf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const fileName = fromDay === toDay ? `PARADAS_MODELO_${fromDay}.xlsx` : `PARADAS_MODELO_${fromDay}_a_${toDay}.xlsx`;

      downloadArrayBuffer(outBuf, fileName);
      setLastFile(fileName);
      setMsg(`✅ Exportado com sucesso: ${fileName}`);
    } catch (e: any) {
      setMsg(`❌ ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 18 }}>
      <div
        className="mp-card"
        style={{
          borderRadius: 24,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,.08)",
          background:
            "radial-gradient(circle at top right, rgba(59,130,246,.10), transparent 24%), linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015))",
          boxShadow: "0 20px 60px rgba(0,0,0,.22)",
        }}
      >
        <div
          className="mp-card-h"
          style={{
            padding: "18px 18px 8px 18px",
            borderBottom: "1px solid rgba(255,255,255,.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: 0.2 }}>Central de Exportação</div>
            <div style={{ marginTop: 4, color: "rgba(255,255,255,.58)", fontSize: 13 }}>
              Visualize o relatório no site antes de gerar o Excel e exporte somente quando estiver tudo conferido.
            </div>
          </div>

          <ToneBadge tone="info">MonPlant • Exportação Assistida</ToneBadge>
        </div>
          <div
            style={{
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,.08)",
              background: "rgba(7,10,18,.42)",
              padding: 16,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,.02)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 14,
              }}
            >
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>1. Defina o período</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.52)", marginTop: 4 }}>
                  O usuário primeiro escolhe o intervalo, depois pré-visualiza o relatório e por fim exporta.
                </div>
              </div>
              <ToneBadge tone="muted">{periodLabel}</ToneBadge>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <div>
                <div className="mp-label" style={{ marginBottom: 6 }}>Data inicial</div>
                <input className="mp-input" type="date" value={fromDay} onChange={(e) => setFromDay(e.target.value)} disabled={busy || previewBusy} />
              </div>
              <div>
                <div className="mp-label" style={{ marginBottom: 6 }}>Data final</div>
                <input className="mp-input" type="date" value={toDay} onChange={(e) => setToDay(e.target.value)} disabled={busy || previewBusy} />
              </div>
            </div>
          </div>

          <div style={{ height: 14 }} />

          <div
            style={{
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,.08)",
              background: "rgba(7,10,18,.42)",
              padding: 16,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,.02)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>2. Escolha o tipo de relatório</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.52)", marginTop: 4 }}>
                  Cada modo tem sua própria prévia e sua própria exportação.
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <ModeButton active={previewMode === "base"} onClick={() => setPreviewMode("base")}>Relatório Base</ModeButton>
                <ModeButton active={previewMode === "paradas"} onClick={() => setPreviewMode("paradas")}>Relatório Paradas</ModeButton>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 12,
              }}
            >
              <ActionCard
                title="Relatório base da planta"
                description="Prévia com horímetros consolidados e produção do período. Exporta usando o template public/BASE_PLANTA.xlsx."
                buttonText={busy && lastMode === "base" ? "Gerando..." : "Exportar Excel Base"}
                secondaryText="Pré-visualizar Base"
                buttonTone="primary"
                disabled={busy || previewBusy}
                onPreview={() => handlePreview("base")}
                onExport={handleExport}
              />

              <ActionCard
                title="Relatório de paradas"
                description="Prévia dos lançamentos de parada/manutenção com tempo, tipo e descrição. Exporta usando public/MODELO_PARADAS.xlsx."
                buttonText={busy && lastMode === "paradas" ? "Gerando..." : "Exportar Excel Paradas"}
                secondaryText="Pré-visualizar Paradas"
                buttonTone="secondary"
                disabled={busy || previewBusy}
                onPreview={() => handlePreview("paradas")}
                onExport={handleExportModeloParadas}
              />
            </div>

            <div style={{ height: 14 }} />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,.06)",
                  background: "rgba(255,255,255,.03)",
                  padding: 14,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Template principal</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.58)" }}>
                  Arquivo esperado em <b>public/BASE_PLANTA.xlsx</b>
                </div>
              </div>

              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,.06)",
                  background: "rgba(255,255,255,.03)",
                  padding: 14,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Template de paradas</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.58)" }}>
                  Arquivo esperado em <b>public/MODELO_PARADAS.xlsx</b>
                </div>
              </div>
            </div>

            {msg ? (
              <div
                style={{
                  marginTop: 14,
                  borderRadius: 14,
                  border: msg.startsWith("✅") ? "1px solid rgba(34,197,94,.25)" : "1px solid rgba(239,68,68,.25)",
                  background: msg.startsWith("✅") ? "rgba(34,197,94,.10)" : "rgba(239,68,68,.10)",
                  padding: 12,
                  color: "rgba(255,255,255,.92)",
                }}
              >
                {msg}
              </div>
            ) : null}
          </div>

          <div style={{ height: 14 }} />

          <div
            className="mp-card"
            style={{
              borderRadius: 24,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,.08)",
              background: "linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015))",
              boxShadow: "0 20px 60px rgba(0,0,0,.20)",
            }}
          >
            <div
              className="mp-card-h"
              style={{
                padding: 18,
                borderBottom: "1px solid rgba(255,255,255,.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>3. Pré-visualização do relatório</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.52)", marginTop: 4 }}>
                  O usuário vê no site o que será exportado. A tabela abaixo mostra os primeiros registros reais do relatório.
                </div>
              </div>
              <ToneBadge tone={previewMode === "base" ? "info" : "warn"}>{previewMode === "base" ? "Prévia Base" : "Prévia Paradas"}</ToneBadge>
            </div>

            <div className="mp-card-b" style={{ padding: 18 }}>
              <PreviewTable data={previewData} loading={previewBusy} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
