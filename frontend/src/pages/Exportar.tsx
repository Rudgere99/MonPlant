import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function br(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
function parseISODate(s: string) {
  // "2026-01-07"
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

function authHeaders() {
  const t = localStorage.getItem("mp_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`${r.status} ${r.statusText} - ${txt}`);
  }
  return (await r.json()) as T;
}

// -------- tipos tolerantes (aceitam variações do backend) ----------
type PlantRow = { period: string; ton: number | null; freq: number | null };
type PlantDay = { day: string; obs?: string | null; rows: PlantRow[] };

type StopItem = any; // backend pode variar, então vamos mapear por "tentativas"
type HoriItem = any;

function pick(obj: any, keys: string[]) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return null;
}

function toDateTimeParts(v: any) {
  // aceita "2026-01-07T10:00:00", "2026-01-07 10:00:00", Date, etc
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
  return Math.round((ms / 3600000) * 100) / 100; // 2 casas
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
        // mantém célula/estilo, zera valor
        ws[addr].v = undefined as any;
        ws[addr].w = undefined as any;
      }
    }
  }
}

function setCell(ws: XLSX.WorkSheet, r1: number, c1: number, value: any) {
  // r1,c1 = 1-based
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

        // Horímetros do dia (se seu backend usa outro endpoint, ajuste aqui)
        try {
          const hh = await apiGet<any[]>(`/api/horimetros?day=${d}`);
          for (const h of hh || []) allHor.push(h);
        } catch {
          // ok
        }
      }

      // ============================================================
      // 4) ABA: PARADAS (template: cabeçalho na linha 1, dados na 2)
      // Colunas do template (11):
      // 1 Data do turno
      // 2 Turno
      // 3 Data Início
      // 4 Data fim
      // 5 Hora Início
      // 6 Hora Fim
      // 7 Equipamento
      // 8 Tipo de Parada
      // 9 Atividade
      // 10 Descrição detalhada da parada
      // 11 Tempo Parada(h)
      // ============================================================
      const wsParadas = getOrCreateSheet(wb, "Paradas");
      clearSheetValues(wsParadas, 2);

      // ordena por data/hora início (quando existir)
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

        const startV = pick(s, ["start_at", "inicio", "start", "data_inicio", "dt_inicio"]);
        const endV = pick(s, ["end_at", "fim", "end", "data_fim", "dt_fim"]);

        const start = toDateTimeParts(startV);
        const end = toDateTimeParts(endV);

        const equip =
          pick(s, ["equipamento", "equipment", "eq", "tag", "planta"]) || "";

        const tipo =
          pick(s, ["tipo", "tipo_parada", "stop_type", "type"]) || "";

        const ativ =
          pick(s, ["atividade", "activity"]) || "";

        const desc =
          pick(s, ["descricao", "descricao_detalhada", "detail", "detalhe", "obs"]) || "";

        const tempo =
          pick(s, ["tempo_h", "tempo_parada_h", "duration_h", "duracao_h"]) ??
          (startV && endV ? hoursDiff(startV, endV) : null);

        // Data do turno (Date)
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

      // ============================================================
      // 5) ABA: HORÍMETROS (template: cabeçalho na linha 1, dados na 2)
      // Colunas do template:
      // 1 DATA
      // 2 HE INCIAL - BRITADOR.P
      // 3 HE FINAL - BRITADOR.P
      // 4 HE INICIAL - BRITADOR.S
      // 5 HE FINAL - BRITADOR.S
      // 6 HE INICIAL - PNR01
      // 7 HE FINAL - PNR01
      // 8 HE INICIAL - PNR02
      // 9 HE FINAL - PNR02
      // 10 Turno
      // 11 h. Tr BT01
      // 12 h. Tr BT02
      // 13 h. Tr PN01
      // 14 h. Tr PN02
      // ============================================================
      const wsHor = getOrCreateSheet(wb, "HORÍMETROS");
      clearSheetValues(wsHor, 2);

      // agrupa por dia
      const horByDay = new Map<string, HoriItem[]>();
      for (const h of allHor) {
        const d = pick(h, ["day", "data", "data_turno"]);
        if (!d) continue;
        const key = String(d).slice(0, 10);
        const arr = horByDay.get(key) || [];
        arr.push(h);
        horByDay.set(key, arr);
      }

      let rHor = 2;
      for (const d of days) {
        const list = horByDay.get(d) || [];

        // mapeia por equipamento
        const byEq = new Map<string, { ini: number | null; fim: number | null; turno: any }>();

        for (const h of list) {
          const eq =
            String(pick(h, ["equipamento", "equipment", "eq", "tag"]) || "").toUpperCase();

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

        // ajuste de aliases de tag (se seu sistema usa BT-01 etc)
        const bt01 = byEq.get("BT-01") || byEq.get("BT01") || byEq.get("BT001") || null;
        const bt02 = byEq.get("BT-02") || byEq.get("BT02") || byEq.get("BT002") || null;
        const pn01 = byEq.get("PN-01") || byEq.get("PN01") || byEq.get("PNR001") || null;
        const pn02 = byEq.get("PN-02") || byEq.get("PN02") || byEq.get("PNR002") || null;

        // Colunas 2-9 (inic/final) – seguindo o template:
        // BRITADOR.P = BT01
        setCell(wsHor, rHor, 1, dt);
        setCell(wsHor, rHor, 2, bt01?.ini ?? "");
        setCell(wsHor, rHor, 3, bt01?.fim ?? "");

        // BRITADOR.S = BT02
        setCell(wsHor, rHor, 4, bt02?.ini ?? "");
        setCell(wsHor, rHor, 5, bt02?.fim ?? "");

        // PNR01 = PN01
        setCell(wsHor, rHor, 6, pn01?.ini ?? "");
        setCell(wsHor, rHor, 7, pn01?.fim ?? "");

        // PNR02 = PN02
        setCell(wsHor, rHor, 8, pn02?.ini ?? "");
        setCell(wsHor, rHor, 9, pn02?.fim ?? "");

        // turno (se existir)
        const t = bt01?.turno ?? bt02?.turno ?? pn01?.turno ?? pn02?.turno ?? "";
        setCell(wsHor, rHor, 10, t ? String(t) : "");

        // horas trabalhadas = fim - ini
        const hTr = (x: any) =>
          x?.ini != null && x?.fim != null ? Math.round((x.fim - x.ini) * 100) / 100 : "";

        setCell(wsHor, rHor, 11, hTr(bt01));
        setCell(wsHor, rHor, 12, hTr(bt02));
        setCell(wsHor, rHor, 13, hTr(pn01));
        setCell(wsHor, rHor, 14, hTr(pn02));

        rHor++;
      }

      // ============================================================
      // 6) ABA: PRODUÇÃO (template: cabeçalho na linha 2, dados na 3)
      // Colunas do template:
      // B = Data
      // C = Meta diaria
      // D = Produção da Planta
      // E = Observação (no seu exemplo tem texto nessa região)
      // ============================================================
      const wsProd = getOrCreateSheet(wb, "PRODUÇÃO");
      clearSheetValues(wsProd, 3);

      // map day -> total
      const prodMap = new Map<string, { total: number; obs: string }>();
      for (const pd of plantDays) {
        const total = (pd.rows || []).reduce((acc, r) => acc + (Number(r.ton) || 0), 0);
        prodMap.set(pd.day, { total, obs: String(pd.obs || "") });
      }

      let rProd = 3;
      for (const d of days) {
        const dt = parseISODate(d);
        const v = prodMap.get(d) || { total: 0, obs: "" };

        // coluna B (2) = Data
        setCell(wsProd, rProd, 2, dt);

        // coluna C (3) Meta diaria (deixa vazio; no template você pode ter fórmula/meta)
        setCell(wsProd, rProd, 3, "");

        // coluna D (4) Produção da Planta
        setCell(wsProd, rProd, 4, v.total || "");

        // coluna E (5) Observação
        setCell(wsProd, rProd, 5, v.obs || "");

        rProd++;
      }

      // 7) salva arquivo
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
            Obs.: coloque o template em <b>public/BASE_PLANTA.xlsx</b>.
          </div>
        </div>
      </div>
    </div>
  );
}
