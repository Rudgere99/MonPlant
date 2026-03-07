import React, { useEffect, useMemo, useState } from "react";
import { Settings } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "";

type Asset = {
  id: number;
  asset_tag: string;
  tank_capacity_l: number;
  consumption_max_lph: number;
  consumption_factor: number;
  yellow_pct: number;
  red_pct: number;
};

type Refuel = {
  id: number;
  asset_tag: string;
  day: string;
  ts: string;
  horimetro?: number | null;
  liters_added: number;
  tank_full: boolean;
  level_after_pct?: number | null;
  note?: string | null;
};

type StopLaunchRow = {
  period: string;       // ex: "03-04"
  equipamento: string;  // ex: "BT-01"
  minutos: number;
  tipo_parada?: string;
  descricao?: string;
};

type Farol = "green" | "yellow" | "red" | "gray";

function authHeaders() {
  const t = localStorage.getItem("token") || "";
  return {
    "Content-Type": "application/json",
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function formatNum(n: number, digits = 1) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function formatHM(hours: number) {
  if (!Number.isFinite(hours) || hours < 0) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function addHoursToDate(d: Date, h: number) {
  const ms = d.getTime() + h * 3600_000;
  const out = new Date(ms);
  const hh = String(out.getHours()).padStart(2, "0");
  const mm = String(out.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function calcConsumptionLh(maxLh: number, cargaPct: number, fator: number) {
  return maxLh * (cargaPct / 100) * fator;
}

function farolFromPct(levelPct: number, yellow: number, red: number): Farol {
  if (!Number.isFinite(levelPct)) return "gray";
  if (levelPct <= red) return "red";
  if (levelPct <= yellow) return "yellow";
  return "green";
}

function farolLabel(f: Farol) {
  if (f === "green") return "OK";
  if (f === "yellow") return "ATENÇÃO";
  if (f === "red") return "CRÍTICO";
  return "INDISPONÍVEL";
}

function farolDotClass(f: Farol) {
  if (f === "green") return "bg-emerald-400";
  if (f === "yellow") return "bg-amber-400";
  if (f === "red") return "bg-red-400";
  return "bg-slate-400";
}

function bannerGradient(f: Farol) {
  if (f === "green") return "linear-gradient(90deg, rgba(6,95,70,.35), rgba(2,6,23,.35), rgba(6,95,70,.12))";
  if (f === "yellow") return "linear-gradient(90deg, rgba(120,53,15,.35), rgba(2,6,23,.35), rgba(120,53,15,.12))";
  if (f === "red") return "linear-gradient(90deg, rgba(127,29,29,.35), rgba(2,6,23,.35), rgba(127,29,29,.12))";
  return "linear-gradient(90deg, rgba(30,41,59,.28), rgba(2,6,23,.35), rgba(30,41,59,.10))";
}

function barColor(f: Farol) {
  if (f === "green") return "rgba(52,211,153,.85)";
  if (f === "yellow") return "rgba(251,191,36,.85)";
  if (f === "red") return "rgba(248,113,113,.85)";
  return "rgba(148,163,184,.55)";
}

function isAssetLike(x: any): x is Asset {
  return !!x && typeof x === "object" && typeof x.asset_tag === "string" &&
    typeof x.tank_capacity_l === "number" && typeof x.consumption_max_lph === "number";
}

function parsePeriodHour(period: string): number | null {
  const m = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec((period || "").trim());
  if (!m) return null;
  return Number(m[1]);
}

function selectedDayStart(day: string) {
  return new Date(`${day}T00:00:00`);
}

function selectedDayEnd(day: string) {
  return new Date(`${day}T23:59:59`);
}

function isSameYmd(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export default function Abastecimento() {
  const assetTag = "BT-01";

  const [day, setDay] = useState<string>(todayYMD());
  const [asset, setAsset] = useState<Asset | null>(null);
  const [refuels, setRefuels] = useState<Refuel[]>([]);
  const [stopRows, setStopRows] = useState<StopLaunchRow[]>([]);
  const [loading, setLoading] = useState(false);

  // parâmetro para consumo médio
  const [cargaPct, setCargaPct] = useState<number>(83);

  // form abastecimento
  const [rfTs, setRfTs] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [rfHorimetro, setRfHorimetro] = useState<string>("");
  const [rfLitros, setRfLitros] = useState<string>("0");
  const [rfTankFull, setRfTankFull] = useState<boolean>(true);
  const [rfLevelPct, setRfLevelPct] = useState<string>("100");
  const [rfNote, setRfNote] = useState<string>("");

  // modal config
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfg, setCfg] = useState({
    tank_capacity_l: 100,
    consumption_max_lph: 10,
    consumption_factor: 1.0,
    yellow_pct: 35,
    red_pct: 20,
  });

  function syncCfgFromAsset(a: Asset | null) {
    if (!a) {
      setCfg({ tank_capacity_l: 100, consumption_max_lph: 10, consumption_factor: 1.0, yellow_pct: 35, red_pct: 20 });
      return;
    }
    setCfg({
      tank_capacity_l: Number(a.tank_capacity_l ?? 100),
      consumption_max_lph: Number(a.consumption_max_lph ?? 10),
      consumption_factor: Number(a.consumption_factor ?? 1.0),
      yellow_pct: Number(a.yellow_pct ?? 35),
      red_pct: Number(a.red_pct ?? 20),
    });
  }

  async function fetchAll() {
    setLoading(true);
    try {
      const [aRes, rRes, sRes] = await Promise.all([
        fetch(`${API_BASE}/api/ab/assets/${assetTag}`, { headers: authHeaders() }),
        fetch(`${API_BASE}/api/ab/refuels?day=${day}&asset=${assetTag}`, { headers: authHeaders() }),
        fetch(`${API_BASE}/api/stops-launch?day=${day}`, { headers: authHeaders() }),
      ]);

      const aJson = aRes.ok ? await aRes.json() : null;
      const rJson = rRes.ok ? await rRes.json() : [];
      const sJson = sRes.ok ? await sRes.json() : null;

      setAsset(isAssetLike(aJson) ? aJson : null);
      setRefuels(Array.isArray(rJson) ? rJson : []);
      setStopRows(sJson?.rows && Array.isArray(sJson.rows) ? sJson.rows : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  }, [day]);

  useEffect(() => {
    syncCfgFromAsset(asset);
  }, [asset?.id]);

  const computed = useMemo(() => {
    const now = new Date();
    const selectedStart = selectedDayStart(day);
    const selectedEnd = selectedDayEnd(day);
    const calcEnd = isSameYmd(now, selectedStart) ? now : selectedEnd;

    if (!asset) {
      return {
        consumoLh: NaN,
        consumoDecorridoL: NaN,
        nivelAtualL: NaN,
        nivelAtualPct: NaN,
        autonomiaH: NaN,
        previsaoHora: "—",
        farol: "gray" as Farol,
        baseInfo: "Sem dados de configuração (clique na engrenagem)",
        capacity: NaN,
        yellowPct: NaN,
        redPct: NaN,
        startTs: selectedStart,
        endTs: calcEnd,
        stopMinutes: 0,
        runHours: 0,
        periodsCount: 0,
      };
    }

    const consumoLh = calcConsumptionLh(
      Number(asset.consumption_max_lph),
      clamp(Number(cargaPct) || 0, 0, 100),
      Number(asset.consumption_factor) || 1
    );

    const capacidade = Number(asset.tank_capacity_l);
    const last = refuels.length ? refuels[refuels.length - 1] : null;

    let nivelBaseL = capacidade;
    let baseInfo = "Base: tanque cheio (assumido)";
    let startTs = selectedStart;

    if (last?.ts) {
      const lastTs = new Date(last.ts);
      if (!Number.isNaN(lastTs.getTime())) {
        startTs = lastTs;
      }
      if (last.tank_full) {
        nivelBaseL = capacidade;
        baseInfo = "Base: tanque cheio (último abastecimento)";
      } else if (last.level_after_pct != null) {
        nivelBaseL = capacidade * (Number(last.level_after_pct) / 100);
        baseInfo = `Base: ${formatNum(Number(last.level_after_pct), 0)}% (último abastecimento)`;
      } else {
        nivelBaseL = capacidade;
        baseInfo = "Base: tanque cheio (último abastecimento sem %)";
      }
    }

    // Considera TODAS as paradas após o último abastecimento.
    // Para não duplicar o mesmo período quando há vários equipamentos,
    // usa o MAIOR valor de minutos por período.
    const byPeriod = new Map<string, number>();

    for (const r of stopRows) {
      const minutos = Number(r.minutos) || 0;
      if (minutos <= 0) continue;

      const h = parsePeriodHour(r.period);
      if (h == null) continue;

      const blockStart = new Date(`${day}T${String(h).padStart(2, "0")}:00:00`);
      const blockEnd = new Date(blockStart.getTime() + 60 * 60 * 1000);

      const overlapStart = Math.max(blockStart.getTime(), startTs.getTime());
      const overlapEnd = Math.min(blockEnd.getTime(), calcEnd.getTime());

      if (overlapEnd <= overlapStart) continue;

      const overlapMinutes = (overlapEnd - overlapStart) / 60000;
      const effectiveMinutes = Math.min(minutos, overlapMinutes);

      const current = byPeriod.get(r.period) ?? 0;
      byPeriod.set(r.period, Math.max(current, effectiveMinutes));
    }

    const stopMinutes = Array.from(byPeriod.values()).reduce((acc, v) => acc + v, 0);
    const periodsCount = byPeriod.size;

    const elapsedMinutes = Math.max(0, (calcEnd.getTime() - startTs.getTime()) / 60000);
    const runningMinutes = Math.max(0, elapsedMinutes - stopMinutes);
    const runHours = runningMinutes / 60;

    const consumoDecorridoL = consumoLh * runHours;
    const nivelAtualL = Math.max(0, nivelBaseL - consumoDecorridoL);
    const nivelAtualPct = capacidade > 0 ? (nivelAtualL / capacidade) * 100 : NaN;
    const autonomiaH = consumoLh > 0 ? nivelAtualL / consumoLh : NaN;

    const limiteL = capacidade * (Number(asset.red_pct) / 100);
    const litrosAteLimite = nivelAtualL - limiteL;
    const horasAteLimite = consumoLh > 0 ? litrosAteLimite / consumoLh : NaN;
    const previsaoHora =
      Number.isFinite(horasAteLimite) && horasAteLimite > 0 ? addHoursToDate(calcEnd, horasAteLimite) : "—";

    const farol = farolFromPct(nivelAtualPct, Number(asset.yellow_pct), Number(asset.red_pct));

    return {
      consumoLh,
      consumoDecorridoL,
      nivelAtualL,
      nivelAtualPct,
      autonomiaH,
      previsaoHora,
      farol,
      baseInfo,
      capacity: capacidade,
      yellowPct: Number(asset.yellow_pct),
      redPct: Number(asset.red_pct),
      startTs,
      endTs: calcEnd,
      stopMinutes,
      runHours,
      periodsCount,
    };
  }, [asset, cargaPct, day, refuels, stopRows]);

  async function saveAssetConfig() {
    setCfgSaving(true);
    try {
      const payload = {
        asset_tag: assetTag,
        tank_capacity_l: Number(cfg.tank_capacity_l) || 100,
        consumption_max_lph: Number(cfg.consumption_max_lph) || 10,
        consumption_factor: Number(cfg.consumption_factor) || 1.0,
        yellow_pct: clamp(Number(cfg.yellow_pct) || 35, 0, 100),
        red_pct: clamp(Number(cfg.red_pct) || 20, 0, 100),
      };

      if (payload.red_pct > payload.yellow_pct) {
        alert("O limite vermelho deve ser menor ou igual ao amarelo.");
        return;
      }

      const res = await fetch(`${API_BASE}/api/ab/assets/${assetTag}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        alert(`Erro ao salvar config: ${await res.text()}`);
        return;
      }

      await fetchAll();
      setCfgOpen(false);
    } finally {
      setCfgSaving(false);
    }
  }

  async function submitRefuel() {
    if (!asset) {
      await saveAssetConfig();
    }

    const payload = {
      asset_tag: assetTag,
      day,
      ts: new Date(rfTs).toISOString(),
      horimetro: rfHorimetro.trim() ? Number(rfHorimetro) : null,
      liters_added: Number(rfLitros) || 0,
      tank_full: rfTankFull,
      level_after_pct: rfTankFull ? null : (rfLevelPct.trim() ? Number(rfLevelPct) : null),
      note: rfNote.trim() || null,
    };

    const res = await fetch(`${API_BASE}/api/ab/refuels`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      alert(`Erro ao salvar abastecimento: ${await res.text()}`);
      return;
    }

    setRfLitros("0");
    setRfHorimetro("");
    setRfTankFull(true);
    setRfLevelPct("100");
    setRfNote("");
    await fetchAll();
  }

  const progressPct = clamp(Number.isFinite(computed.nivelAtualPct) ? computed.nivelAtualPct : 0, 0, 100);

  return (
    <div className="mp-container" style={{ paddingTop: 12, paddingBottom: 28 }}>
      <div className="mp-card" style={{ marginBottom: 14 }}>
        <div className="mp-card-b">
          <div style={{ display: "flex", gap: 12, alignItems: "end", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ minWidth: 260 }}>
              <div className="mp-page-sub" style={{ marginTop: 0 }}>Operação • Abastecimento</div>
              <div className="mp-page-title" style={{ fontSize: 26, display: "flex", alignItems: "center", gap: 10 }}>
                Abastecimento — {assetTag}
                <button className="mp-btn" onClick={() => setCfgOpen(true)} style={{ padding: "8px 10px", height: 38 }}>
                  <Settings size={16} />
                </button>
              </div>
              <div className="mp-help" style={{ marginTop: 6 }}>{computed.baseInfo}</div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
              <div style={{ width: 160 }}>
                <div className="mp-label">DATA</div>
                <input className="mp-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
              </div>

              <div style={{ width: 140 }}>
                <div className="mp-label">CARGA MÉDIA (%)</div>
                <input
                  className="mp-input"
                  type="number"
                  value={cargaPct}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(e) => setCargaPct(Number(e.target.value))}
                />
              </div>

              <button className="mp-btn" onClick={fetchAll} style={{ height: 40 }}>
                {loading ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        className="mp-card"
        style={{
          marginBottom: 14,
          borderColor:
            computed.farol === "green" ? "rgba(16,185,129,.25)" :
            computed.farol === "yellow" ? "rgba(245,158,11,.25)" :
            computed.farol === "red" ? "rgba(239,68,68,.25)" :
            "rgba(255,255,255,.10)",
          background: bannerGradient(computed.farol),
        }}
      >
        <div className="mp-card-b">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className={`h-3 w-3 rounded-full ${farolDotClass(computed.farol)}`} />
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{farolLabel(computed.farol)}</div>
                <div className="mp-help" style={{ color: "rgba(255,255,255,.80)" }}>
                  Consumo considera tempo de relógio desde o último abastecimento, abatendo paradas {'>'} 0 min.
                </div>
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div className="mp-label" style={{ marginBottom: 6 }}>SEMÁFORO</div>
              <span className="mp-chip" style={{ background: "rgba(255,255,255,.04)", borderColor: "rgba(255,255,255,.10)" }}>
                <span className={`h-2.5 w-2.5 rounded-full ${farolDotClass(computed.farol)}`} />
                {farolLabel(computed.farol).toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mp-card" style={{ marginBottom: 14 }}>
        <div className="mp-card-b">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div className="mp-label">PROGRESSO DO TANQUE</div>
            <div style={{ fontWeight: 950, color: "rgba(255,255,255,.90)" }}>{formatNum(progressPct, 0)}%</div>
          </div>

          <div style={{ marginTop: 10, height: 12, borderRadius: 999, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.10)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progressPct}%`, background: barColor(computed.farol) }} />
          </div>

          <div className="mp-help" style={{ marginTop: 8 }}>
            Nível atual: <b style={{ color: "rgba(255,255,255,.92)" }}>{formatNum(computed.nivelAtualL, 1)} L</b>
            {asset ? <span> • Capacidade: <b style={{ color: "rgba(255,255,255,.92)" }}>{formatNum(computed.capacity, 0)} L</b></span> : null}
          </div>
        </div>
      </div>

      <div className="mp-main-grid">
        <div className="mp-card" style={{ gridColumn: "span 4" }}>
          <div className="mp-card-b">
            <div className="mp-label">CAPACIDADE</div>
            <div className="big-number" style={{ marginTop: 8, fontWeight: 950 }}>
              {asset ? `${formatNum(computed.capacity, 0)} L` : "—"}
            </div>
            <div className="mp-help" style={{ marginTop: 6 }}>
              Limites: amarelo {asset ? `${formatNum(computed.yellowPct, 0)}%` : "—"} • vermelho {asset ? `${formatNum(computed.redPct, 0)}%` : "—"}
            </div>
          </div>
        </div>

        <div className="mp-card" style={{ gridColumn: "span 4" }}>
          <div className="mp-card-b">
            <div className="mp-label">CONSUMO MÉDIO (L/H)</div>
            <div className="big-number" style={{ marginTop: 8, fontWeight: 950 }}>{formatNum(computed.consumoLh, 2)}</div>
            <div className="mp-help" style={{ marginTop: 6 }}>
              Max {asset ? formatNum(Number(asset.consumption_max_lph), 2) : "—"} • fator {asset ? formatNum(Number(asset.consumption_factor), 3) : "—"}
            </div>
          </div>
        </div>

        <div className="mp-card" style={{ gridColumn: "span 4" }}>
          <div className="mp-card-b">
            <div className="mp-label">PRÓXIMO ABASTECIMENTO</div>
            <div className="big-number" style={{ marginTop: 8, fontWeight: 950 }}>{computed.previsaoHora}</div>
            <div className="mp-help" style={{ marginTop: 6 }}>Autonomia: {formatHM(computed.autonomiaH)}</div>
          </div>
        </div>

        <div className="mp-card" style={{ gridColumn: "span 4" }}>
          <div className="mp-card-b">
            <div className="mp-label">CONSUMO DECORRIDO</div>
            <div className="big-number" style={{ marginTop: 8, fontWeight: 950 }}>{formatNum(computed.consumoDecorridoL, 1)} L</div>
            <div className="mp-help" style={{ marginTop: 6 }}>
              Janela: {computed.startTs.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} → {computed.endTs.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>

        <div className="mp-card" style={{ gridColumn: "span 4" }}>
          <div className="mp-card-b">
            <div className="mp-label">TEMPO OPERANDO</div>
            <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
              <div>
                <div className="big-number" style={{ fontWeight: 950 }}>{formatHM(computed.runHours)}</div>
                <div className="mp-help">Rodando</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 950, fontSize: 20, color: "rgba(255,255,255,.90)" }}>{Math.round(computed.stopMinutes)} min</div>
                <div className="mp-help">Paradas abatidas</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mp-card" style={{ gridColumn: "span 4" }}>
          <div className="mp-card-b">
            <div className="mp-label">NÍVEL ATUAL</div>
            <div className="big-number" style={{ marginTop: 8, fontWeight: 950 }}>{formatNum(computed.nivelAtualL, 1)} L</div>
            <div className="mp-help" style={{ marginTop: 6 }}>
              {formatNum(progressPct, 0)}% • Farol: <b style={{ color: "rgba(255,255,255,.92)" }}>{farolLabel(computed.farol)}</b>
            </div>
          </div>
        </div>

        

        <div className="mp-card" style={{ gridColumn: "span 8" }}>
          <div className="mp-card-h">
            <div>
              <div style={{ fontWeight: 950 }}>Registrar abastecimento</div>
              <div className="mp-help" style={{ marginTop: 2 }}>
                Ao abastecer, a base do cálculo reinicia a partir deste horário.
              </div>
            </div>
            <button className="mp-btn mp-btn-primary" onClick={submitRefuel}>Salvar</button>
          </div>

          <div className="mp-card-b">
            <div className="mp-form-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
              <div style={{ gridColumn: "span 2" }}>
                <div className="mp-label">DATA/HORA</div>
                <input className="mp-input" type="datetime-local" value={rfTs} onChange={(e) => setRfTs(e.target.value)} />
              </div>

              <div>
                <div className="mp-label">HORÍMETRO</div>
                <input className="mp-input" value={rfHorimetro} onChange={(e) => setRfHorimetro(e.target.value)} placeholder="ex: 1234.5" />
              </div>

              <div>
                <div className="mp-label">LITROS</div>
                <input className="mp-input" value={rfLitros} onChange={(e) => setRfLitros(e.target.value)} placeholder="ex: 40" />
              </div>

              <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 850 }}>
                  <input type="checkbox" checked={rfTankFull} onChange={(e) => setRfTankFull(e.target.checked)} />
                  Tanque cheio
                </label>

                {!rfTankFull && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="mp-label" style={{ marginBottom: 0 }}>NÍVEL APÓS (%)</div>
                    <input className="mp-input" style={{ width: 110 }} value={rfLevelPct} onChange={(e) => setRfLevelPct(e.target.value)} />
                  </div>
                )}
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <div className="mp-label">OBSERVAÇÃO</div>
                <input className="mp-input" value={rfNote} onChange={(e) => setRfNote(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
          </div>
        </div>

        <div className="mp-card" style={{ gridColumn: "span 12" }}>
          <div className="mp-card-h">
            <div style={{ fontWeight: 950 }}>Abastecimentos do dia</div>
            <div className="mp-help">Último abastecimento vira o marco inicial do cálculo.</div>
          </div>

          <div className="mp-card-b" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,.10)", color: "rgba(255,255,255,.60)" }}>
                  <th style={{ textAlign: "left", padding: "10px 8px" }}>Hora</th>
                  <th style={{ textAlign: "left", padding: "10px 8px" }}>Horímetro</th>
                  <th style={{ textAlign: "left", padding: "10px 8px" }}>Litros</th>
                  <th style={{ textAlign: "left", padding: "10px 8px" }}>Pós (%)</th>
                  <th style={{ textAlign: "left", padding: "10px 8px" }}>Cheio</th>
                  <th style={{ textAlign: "left", padding: "10px 8px" }}>Obs</th>
                </tr>
              </thead>
              <tbody>
                {refuels.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 14, color: "rgba(255,255,255,.45)" }}>
                      Nenhum abastecimento registrado.
                    </td>
                  </tr>
                )}

                {refuels.map((r) => {
                  let hh = "--";
                  let mm = "--";
                  if (r.ts) {
                    const d = new Date(r.ts);
                    if (!Number.isNaN(d.getTime())) {
                      hh = String(d.getHours()).padStart(2, "0");
                      mm = String(d.getMinutes()).padStart(2, "0");
                    }
                  }

                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                      <td style={{ padding: "10px 8px" }}><span style={{ fontWeight: 950 }}>{hh}:{mm}</span></td>
                      <td style={{ padding: "10px 8px" }}>{r.horimetro ?? "—"}</td>
                      <td style={{ padding: "10px 8px" }}>{formatNum(Number(r.liters_added), 1)}</td>
                      <td style={{ padding: "10px 8px" }}>{r.level_after_pct ?? (r.tank_full ? 100 : "—")}</td>
                      <td style={{ padding: "10px 8px" }}>{r.tank_full ? "Sim" : "Não"}</td>
                      <td style={{ padding: "10px 8px", color: "rgba(255,255,255,.60)" }}>{r.note ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {cfgOpen && (
        <div
          onClick={() => (cfgSaving ? null : setCfgOpen(false))}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 60,
          }}
        >
          <div className="mp-card" onClick={(e) => e.stopPropagation()} style={{ width: "min(820px, 100%)", borderColor: "rgba(255,255,255,.14)" }}>
            <div className="mp-card-h">
              <div style={{ fontWeight: 950, display: "flex", alignItems: "center", gap: 10 }}>
                <Settings size={16} />
                Configurar BT-01
              </div>
              <button className="mp-btn" onClick={() => (cfgSaving ? null : setCfgOpen(false))}>Fechar</button>
            </div>

            <div className="mp-card-b">
              <div className="mp-help" style={{ marginBottom: 12 }}>
                Defina capacidade e consumo. O cálculo desce pelo relógio e abate paradas {'>'} 0 min.
              </div>

              <div className="mp-form-grid" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
                <div>
                  <div className="mp-label">CAPACIDADE (L)</div>
                  <input className="mp-input" type="number" value={cfg.tank_capacity_l} onChange={(e) => setCfg((s) => ({ ...s, tank_capacity_l: Number(e.target.value) }))} />
                </div>

                <div>
                  <div className="mp-label">CONSUMO MÁX (L/H)</div>
                  <input className="mp-input" type="number" value={cfg.consumption_max_lph} onChange={(e) => setCfg((s) => ({ ...s, consumption_max_lph: Number(e.target.value) }))} />
                </div>

                <div>
                  <div className="mp-label">FATOR</div>
                  <input className="mp-input" type="number" step="0.01" value={cfg.consumption_factor} onChange={(e) => setCfg((s) => ({ ...s, consumption_factor: Number(e.target.value) }))} />
                </div>

                <div>
                  <div className="mp-label">AMARELO (%)</div>
                  <input className="mp-input" type="number" value={cfg.yellow_pct} onChange={(e) => setCfg((s) => ({ ...s, yellow_pct: Number(e.target.value) }))} />
                </div>

                <div>
                  <div className="mp-label">VERMELHO (%)</div>
                  <input className="mp-input" type="number" value={cfg.red_pct} onChange={(e) => setCfg((s) => ({ ...s, red_pct: Number(e.target.value) }))} />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                <button className="mp-btn" onClick={() => syncCfgFromAsset(asset)} disabled={cfgSaving}>Recarregar</button>
                <button className="mp-btn mp-btn-primary" onClick={saveAssetConfig} disabled={cfgSaving}>
                  {cfgSaving ? "Salvando..." : "Salvar configurações"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
