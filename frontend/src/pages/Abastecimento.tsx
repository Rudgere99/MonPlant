import React, { useEffect, useMemo, useState } from "react";

/**
 * Abastecimento BT-01 — estilo alinhado com a página "Ritmo do turno"
 * - Header em card com controles à direita
 * - Banner de semáforo (verde/amarelo/vermelho)
 * - KPIs em cards grandes (grid 3 + 3)
 * - Barra de progresso do tanque
 * - Área operacional em cards (parâmetros / registrar abastecimento)
 * - Tabela em card
 *
 * Observação: Mantém a lógica v1 (paradas somadas do stops-launch no dia).
 */

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
  day: string; // YYYY-MM-DD
  ts: string; // ISO
  horimetro?: number | null;
  liters_added: number;
  tank_full: boolean;
  level_after_pct?: number | null;
  note?: string | null;
};

type StopLaunchRow = {
  period: string; // "03-04"
  equipamento: string; // "BT-01"
  tipo_parada?: string;
  descricao?: string;
  minutos: number;
};

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

function addHoursToNow(h: number) {
  const now = new Date();
  const ms = now.getTime() + h * 3600_000;
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Modelo v1 (simples):
 * consumo_Lh = max_Lh * (carga%/100) * fator
 */
function calcConsumptionLh(maxLh: number, cargaPct: number, fator: number) {
  return maxLh * (cargaPct / 100) * fator;
}

type Farol = "green" | "yellow" | "red" | "gray";

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

function bannerBorder(f: Farol) {
  if (f === "green") return "border-emerald-500/25";
  if (f === "yellow") return "border-amber-500/25";
  if (f === "red") return "border-red-500/25";
  return "border-slate-700/50";
}

function bannerGradient(f: Farol) {
  // imita o "banner" do Ritmo: degradê sutil e escuro
  if (f === "green")
    return "bg-gradient-to-r from-emerald-900/35 via-slate-950/35 to-emerald-900/10";
  if (f === "yellow")
    return "bg-gradient-to-r from-amber-900/35 via-slate-950/35 to-amber-900/10";
  if (f === "red")
    return "bg-gradient-to-r from-red-900/35 via-slate-950/35 to-red-900/10";
  return "bg-gradient-to-r from-slate-900/30 via-slate-950/35 to-slate-900/10";
}

function bigCardClass() {
  return "rounded-2xl border border-slate-800/70 bg-slate-950/45 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]";
}

function subtleCardClass() {
  return "rounded-2xl border border-slate-800/70 bg-slate-950/35 p-5";
}

function progressBar(pct: number, farol: Farol) {
  const p = clamp(Number.isFinite(pct) ? pct : 0, 0, 100);
  const fill =
    farol === "green"
      ? "bg-emerald-500/80"
      : farol === "yellow"
      ? "bg-amber-500/80"
      : farol === "red"
      ? "bg-red-500/80"
      : "bg-slate-400/60";

  return (
    <div className="mt-4">
      <div className="h-2.5 w-full rounded-full bg-slate-800/70 overflow-hidden">
        <div className={`h-full ${fill}`} style={{ width: `${p}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
        <span>Nível</span>
        <span className="text-slate-200">{formatNum(p, 0)}%</span>
      </div>
    </div>
  );
}

export default function AbastecimentoBT01() {
  const assetTag = "BT-01";

  const [day, setDay] = useState<string>(todayYMD());
  const [asset, setAsset] = useState<Asset | null>(null);
  const [refuels, setRefuels] = useState<Refuel[]>([]);
  const [stopRows, setStopRows] = useState<StopLaunchRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Inputs operacionais (teste)
  const [turnHours, setTurnHours] = useState<number>(12);
  const [cargaPct, setCargaPct] = useState<number>(83);

  // Form abastecimento
  const [rfTs, setRfTs] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [rfHorimetro, setRfHorimetro] = useState<string>("");
  const [rfLitros, setRfLitros] = useState<string>("0");
  const [rfTankFull, setRfTankFull] = useState<boolean>(true);
  const [rfLevelPct, setRfLevelPct] = useState<string>("100");
  const [rfNote, setRfNote] = useState<string>("");

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

      setAsset(aJson);
      setRefuels(Array.isArray(rJson) ? rJson : []);

      const rows: StopLaunchRow[] = sJson?.rows && Array.isArray(sJson.rows) ? sJson.rows : [];
      setStopRows(rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const minutosParadosBT01 = useMemo(() => {
    return stopRows
      .filter((r) => (r.equipamento || "").toUpperCase() === assetTag)
      .reduce((acc, r) => acc + (Number(r.minutos) || 0), 0);
  }, [stopRows]);

  const horasParadas = minutosParadosBT01 / 60;
  const horasRodando = Math.max(0, (Number(turnHours) || 0) - horasParadas);

  const computed = useMemo(() => {
    if (!asset) {
      return {
        consumoLh: NaN,
        consumoDecorridoL: NaN,
        nivelAtualL: NaN,
        nivelAtualPct: NaN,
        autonomiaH: NaN,
        previsaoHora: "—",
        farol: "gray" as Farol,
        baseInfo: "Sem configuração do BT-01",
        capacity: NaN,
        redPct: NaN,
        yellowPct: NaN,
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
    if (last) {
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

    const consumoDecorridoL = consumoLh * horasRodando;
    const nivelAtualL = Math.max(0, nivelBaseL - consumoDecorridoL);
    const nivelAtualPct = capacidade > 0 ? (nivelAtualL / capacidade) * 100 : NaN;

    const autonomiaH = consumoLh > 0 ? nivelAtualL / consumoLh : NaN;

    const limiteL = capacidade * (Number(asset.red_pct) / 100);
    const litrosAteLimite = nivelAtualL - limiteL;
    const horasAteLimite = consumoLh > 0 ? litrosAteLimite / consumoLh : NaN;

    const previsaoHora =
      Number.isFinite(horasAteLimite) && horasAteLimite > 0 ? addHoursToNow(horasAteLimite) : "—";

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
      redPct: Number(asset.red_pct),
      yellowPct: Number(asset.yellow_pct),
    };
  }, [asset, cargaPct, horasRodando, refuels]);

  async function ensureAssetDefaultIfMissing() {
    if (asset) return;
    const payload = {
      asset_tag: assetTag,
      tank_capacity_l: 100,
      consumption_max_lph: 10,
      consumption_factor: 1.0,
      yellow_pct: 35,
      red_pct: 20,
    };

    const res = await fetch(`${API_BASE}/api/ab/assets/${assetTag}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Falha ao criar asset BT-01.");
    const json = await res.json();
    setAsset(json);
  }

  async function submitRefuel() {
    await ensureAssetDefaultIfMissing();

    const litros = Number(rfLitros) || 0;
    const hor = rfHorimetro.trim() ? Number(rfHorimetro) : null;
    const lvlPct = rfTankFull ? null : rfLevelPct.trim() ? Number(rfLevelPct) : null;

    const payload = {
      asset_tag: assetTag,
      day,
      ts: new Date(rfTs).toISOString(),
      horimetro: hor,
      liters_added: litros,
      tank_full: rfTankFull,
      level_after_pct: lvlPct,
      note: rfNote.trim() || null,
    };

    const res = await fetch(`${API_BASE}/api/ab/refuels`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const t = await res.text();
      alert(`Erro ao salvar abastecimento: ${t}`);
      return;
    }

    setRfLitros("0");
    setRfHorimetro("");
    setRfTankFull(true);
    setRfLevelPct("100");
    setRfNote("");
    await fetchAll();
  }

  const bannerText =
    computed.farol === "green"
      ? "Nível OK"
      : computed.farol === "yellow"
      ? "Atenção: programar abastecimento"
      : computed.farol === "red"
      ? "Crítico: abastecer o quanto antes"
      : "Sem dados de configuração";

  return (
    <div className="min-h-screen p-4 md:p-6 text-slate-100">
      <div className="max-w-[1400px] mx-auto space-y-4">
        {/* Header card (igual Ritmo) */}
        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-400">Operação • Abastecimento</div>
              <div className="mt-1 text-2xl font-semibold">Abastecimento — {assetTag}</div>
              <div className="mt-1 text-xs text-slate-500">{computed.baseInfo}</div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="text-[11px] text-slate-400 font-semibold">DATA</div>
                <input
                  type="date"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  className="mt-1 bg-slate-900/60 border border-slate-700/60 rounded-xl px-3 py-2 text-sm w-[160px]"
                />
              </div>

              <div>
                <div className="text-[11px] text-slate-400 font-semibold">CARGA (%)</div>
                <input
                  type="number"
                  value={cargaPct}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(e) => setCargaPct(Number(e.target.value))}
                  className="mt-1 bg-slate-900/60 border border-slate-700/60 rounded-xl px-3 py-2 text-sm w-[140px]"
                />
              </div>

              <button
                onClick={fetchAll}
                className="h-[42px] px-4 rounded-xl text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700/70"
              >
                {loading ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </div>
        </div>

        {/* Banner semáforo (igual Ritmo) */}
        <div className={`rounded-2xl border ${bannerBorder(computed.farol)} ${bannerGradient(computed.farol)} p-5`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${farolDotClass(computed.farol)}`} />
              <div>
                <div className="text-lg font-semibold">{farolLabel(computed.farol)}</div>
                <div className="text-sm text-slate-300/80">{bannerText}</div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] text-slate-400 font-semibold">SEMÁFORO</div>
              <div className="mt-1 flex items-center justify-end gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${farolDotClass(computed.farol)}`} />
                <span
                  className={
                    computed.farol === "green"
                      ? "text-emerald-300 font-semibold"
                      : computed.farol === "yellow"
                      ? "text-amber-300 font-semibold"
                      : computed.farol === "red"
                      ? "text-red-300 font-semibold"
                      : "text-slate-300 font-semibold"
                  }
                >
                  {farolLabel(computed.farol).toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* KPIs (grid 3 + 3 como no Ritmo) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className={bigCardClass()}>
            <div className="text-[11px] text-slate-400 font-semibold">CAPACIDADE</div>
            <div className="mt-2 text-3xl font-semibold">{asset ? `${formatNum(computed.capacity, 0)} L` : "—"}</div>
            <div className="mt-1 text-xs text-slate-500">
              Limites: amarelo {asset ? `${formatNum(computed.yellowPct, 0)}%` : "—"} • vermelho{" "}
              {asset ? `${formatNum(computed.redPct, 0)}%` : "—"}
            </div>
          </div>

          <div className={bigCardClass()}>
            <div className="text-[11px] text-slate-400 font-semibold">NÍVEL ATUAL</div>
            <div className="mt-2 text-3xl font-semibold">{formatNum(computed.nivelAtualL, 1)} L</div>
            {progressBar(computed.nivelAtualPct, computed.farol)}
          </div>

          <div className={bigCardClass()}>
            <div className="text-[11px] text-slate-400 font-semibold">PRÓXIMO ABASTECIMENTO</div>
            <div
              className={`mt-2 text-3xl font-semibold ${
                computed.farol === "red" ? "text-red-300" : computed.farol === "yellow" ? "text-amber-300" : ""
              }`}
            >
              {computed.previsaoHora}
            </div>
            <div className="mt-1 text-xs text-slate-500">Previsão simples (limite vermelho).</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className={subtleCardClass()}>
            <div className="text-[11px] text-slate-400 font-semibold">CONSUMO (L/H)</div>
            <div className="mt-2 text-3xl font-semibold">{formatNum(computed.consumoLh, 2)}</div>
            <div className="mt-1 text-xs text-slate-500">
              Max {asset ? formatNum(Number(asset.consumption_max_lph), 2) : "—"} • fator{" "}
              {asset ? formatNum(Number(asset.consumption_factor), 3) : "—"}
            </div>
          </div>

          <div className={subtleCardClass()}>
            <div className="text-[11px] text-slate-400 font-semibold">CONSUMO DECORRIDO</div>
            <div className="mt-2 text-3xl font-semibold">{formatNum(computed.consumoDecorridoL, 1)} L</div>
            <div className="mt-1 text-xs text-slate-500">Rodando: {formatHM(horasRodando)}</div>
          </div>

          <div className={subtleCardClass()}>
            <div className="text-[11px] text-slate-400 font-semibold">TEMPO (TURNO)</div>
            <div className="mt-2 flex items-end justify-between">
              <div>
                <div className="text-3xl font-semibold">{formatHM(horasRodando)}</div>
                <div className="text-xs text-slate-500">Rodando</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-semibold text-slate-200">{formatHM(horasParadas)}</div>
                <div className="text-xs text-slate-500">{Math.round(minutosParadosBT01)} min parado</div>
              </div>
            </div>
          </div>
        </div>

        {/* Operação */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Parâmetros */}
          <div className={subtleCardClass()}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Parâmetros do turno</div>
              <span className="text-[11px] text-slate-500">v1 (teste)</span>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] text-slate-400 font-semibold">HORAS DO TURNO</label>
                <input
                  type="number"
                  value={turnHours}
                  min={1}
                  max={24}
                  step={1}
                  onChange={(e) => setTurnHours(Number(e.target.value))}
                  className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded-xl px-3 py-2 text-sm"
                />
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/25 p-3">
                <div className="text-xs text-slate-400">Paradas BT-01 no dia</div>
                <div className="mt-1 text-lg font-semibold">{Math.round(minutosParadosBT01)} min</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Na v2: conectar ShiftBar (07–19 / 19–07) e calcular automaticamente.
                </div>
              </div>
            </div>
          </div>

          {/* Registrar abastecimento */}
          <div className={`lg:col-span-2 ${subtleCardClass()}`}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Registrar abastecimento</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {asset ? "Config OK" : "Sem config do BT-01 — ao salvar, será criada com padrão (100L / 10Lh)."}
                </div>
              </div>
              <button
                onClick={submitRefuel}
                className="px-4 py-2 rounded-xl text-sm bg-emerald-600/80 hover:bg-emerald-600 border border-emerald-500/40"
              >
                Salvar
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="text-[11px] text-slate-400 font-semibold">DATA/HORA</label>
                <input
                  type="datetime-local"
                  value={rfTs}
                  onChange={(e) => setRfTs(e.target.value)}
                  className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded-xl px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-semibold">HORÍMETRO</label>
                <input
                  value={rfHorimetro}
                  onChange={(e) => setRfHorimetro(e.target.value)}
                  placeholder="ex: 1234.5"
                  className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded-xl px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-semibold">LITROS</label>
                <input
                  value={rfLitros}
                  onChange={(e) => setRfLitros(e.target.value)}
                  placeholder="ex: 40"
                  className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded-xl px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2 flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input type="checkbox" checked={rfTankFull} onChange={(e) => setRfTankFull(e.target.checked)} />
                  Tanque cheio
                </label>

                {!rfTankFull && (
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-slate-400 font-semibold">NÍVEL APÓS (%)</label>
                    <input
                      value={rfLevelPct}
                      onChange={(e) => setRfLevelPct(e.target.value)}
                      className="w-24 bg-slate-900/60 border border-slate-700/60 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="text-[11px] text-slate-400 font-semibold">OBSERVAÇÃO</label>
                <input
                  value={rfNote}
                  onChange={(e) => setRfNote(e.target.value)}
                  placeholder="Opcional"
                  className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded-xl px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div className={subtleCardClass()}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Abastecimentos do dia</div>
              <div className="text-[11px] text-slate-500 mt-1">
                * Consumo decorrido usa as paradas somadas do BT-01 no dia (stops-launch).
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="text-slate-400">
                <tr className="border-b border-slate-800">
                  <th className="text-left py-2 pr-3">Hora</th>
                  <th className="text-left py-2 pr-3">Horímetro</th>
                  <th className="text-left py-2 pr-3">Litros</th>
                  <th className="text-left py-2 pr-3">Pós (%)</th>
                  <th className="text-left py-2 pr-3">Cheio</th>
                  <th className="text-left py-2 pr-3">Obs</th>
                </tr>
              </thead>

              <tbody className="text-slate-200">
                {refuels.length === 0 && (
                  <tr>
                    <td className="py-4 text-slate-500" colSpan={6}>
                      Nenhum abastecimento registrado.
                    </td>
                  </tr>
                )}

                {refuels.map((r) => {
                  const d = new Date(r.ts);
                  const hh = String(d.getHours()).padStart(2, "0");
                  const mm = String(d.getMinutes()).padStart(2, "0");
                  return (
                    <tr key={r.id} className="border-b border-slate-900/60">
                      <td className="py-2 pr-3">{hh}:{mm}</td>
                      <td className="py-2 pr-3">{r.horimetro ?? "—"}</td>
                      <td className="py-2 pr-3">{formatNum(Number(r.liters_added), 1)}</td>
                      <td className="py-2 pr-3">{r.level_after_pct ?? (r.tank_full ? 100 : "—")}</td>
                      <td className="py-2 pr-3">{r.tank_full ? "Sim" : "Não"}</td>
                      <td className="py-2 pr-3 text-slate-400">{r.note ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">
          Próximos passos: turno real (07–19 / 19–07) + previsão descontando paradas futuras (planejadas).
        </div>
      </div>
    </div>
  );
}
