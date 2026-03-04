import React, { useEffect, useMemo, useState } from "react";

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
  day: string;      // YYYY-MM-DD
  ts: string;       // ISO
  horimetro?: number | null;
  liters_added: number;
  tank_full: boolean;
  level_after_pct?: number | null;
  note?: string | null;
};

type StopLaunchRow = {
  period: string;       // "03-04"
  equipamento: string;  // "BT-01"
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
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(digits);
}

function formatHM(hours: number) {
  if (!Number.isFinite(hours) || hours < 0) return "-";
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
 * Modelo v1 (simples, operacional):
 * consumo_Lh = max_Lh * (carga%/100) * fator
 */
function calcConsumptionLh(maxLh: number, cargaPct: number, fator: number) {
  return maxLh * (cargaPct / 100) * fator;
}

function trafficColor(levelPct: number, yellow: number, red: number) {
  if (!Number.isFinite(levelPct)) return "gray";
  if (levelPct <= red) return "red";
  if (levelPct <= yellow) return "yellow";
  return "green";
}

export default function AbastecimentoBT01() {
  const assetTag = "BT-01";

  const [day, setDay] = useState<string>(todayYMD());
  const [asset, setAsset] = useState<Asset | null>(null);
  const [refuels, setRefuels] = useState<Refuel[]>([]);
  const [stopRows, setStopRows] = useState<StopLaunchRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Inputs de operação (teste)
  const [turnHours, setTurnHours] = useState<number>(12); // teste (12h). Depois você pluga turno real.
  const [cargaPct, setCargaPct] = useState<number>(83);

  // Form abastecimento
  const [rfTs, setRfTs] = useState<string>(() => new Date().toISOString().slice(0, 16)); // yyyy-mm-ddThh:mm
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

      // stops-launch: { day, rows:[...] }
      const rows: StopLaunchRow[] = (sJson?.rows && Array.isArray(sJson.rows)) ? sJson.rows : [];
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
      .filter(r => (r.equipamento || "").toUpperCase() === assetTag)
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
        previsaoHora: "-",
        farol: "gray" as "green" | "yellow" | "red" | "gray",
      };
    }

    const consumoLh = calcConsumptionLh(
      Number(asset.consumption_max_lph),
      clamp(Number(cargaPct) || 0, 0, 100),
      Number(asset.consumption_factor) || 1
    );

    // Base de nível: último abastecimento do dia (se existir), senão assume cheio (v1)
    const last = refuels.length ? refuels[refuels.length - 1] : null;
    const capacidade = Number(asset.tank_capacity_l);

    let nivelBaseL = capacidade;
    if (last) {
      if (last.tank_full) {
        nivelBaseL = capacidade;
      } else if (last.level_after_pct != null) {
        nivelBaseL = capacidade * (Number(last.level_after_pct) / 100);
      } // se não tiver, mantém como capacidade (v1)
    }

    const consumoDecorridoL = consumoLh * horasRodando;
    const nivelAtualL = Math.max(0, nivelBaseL - consumoDecorridoL);
    const nivelAtualPct = capacidade > 0 ? (nivelAtualL / capacidade) * 100 : NaN;

    const autonomiaH = consumoLh > 0 ? (nivelAtualL / consumoLh) : NaN;

    // previsão simples: quando chega no red_pct
    const limiteL = capacidade * (Number(asset.red_pct) / 100);
    const litrosAteLimite = nivelAtualL - limiteL;
    const horasAteLimite = (consumoLh > 0) ? (litrosAteLimite / consumoLh) : NaN;

    const previsaoHora = (Number.isFinite(horasAteLimite) && horasAteLimite > 0)
      ? addHoursToNow(horasAteLimite)
      : "-";

    const farol = trafficColor(nivelAtualPct, Number(asset.yellow_pct), Number(asset.red_pct));

    return { consumoLh, consumoDecorridoL, nivelAtualL, nivelAtualPct, autonomiaH, previsaoHora, farol };
  }, [asset, cargaPct, horasRodando, refuels]);

  async function ensureAssetDefaultIfMissing() {
    if (asset) return;
    // cria config default rápida pra teste
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
    const lvlPct = rfTankFull ? null : (rfLevelPct.trim() ? Number(rfLevelPct) : null);

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

  const farolBadge =
    computed.farol === "green" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" :
    computed.farol === "yellow" ? "bg-amber-500/15 text-amber-300 border-amber-500/25" :
    computed.farol === "red" ? "bg-red-500/15 text-red-300 border-red-500/25" :
    "bg-slate-500/10 text-slate-300 border-slate-500/20";

  return (
    <div className="min-h-screen p-4 md:p-6 text-slate-100">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-400">Abastecimento</div>
            <h1 className="text-2xl font-semibold">BT-01</h1>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-sm text-slate-300">Dia</label>
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={fetchAll}
              className="px-3 py-2 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700/70"
            >
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-400">Nível atual</div>
            <div className="mt-1 flex items-center gap-2">
              <div className="text-xl font-semibold">
                {formatNum(computed.nivelAtualL, 1)} L
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border ${farolBadge}`}>
                {formatNum(computed.nivelAtualPct, 0)}%
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Farol: <span className="text-slate-200">{computed.farol.toUpperCase()}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-400">Consumo (L/h)</div>
            <div className="mt-1 text-xl font-semibold">{formatNum(computed.consumoLh, 2)}</div>
            <div className="text-xs text-slate-400 mt-1">
              Carga: <span className="text-slate-200">{clamp(cargaPct, 0, 100)}%</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-400">Consumo decorrido</div>
            <div className="mt-1 text-xl font-semibold">{formatNum(computed.consumoDecorridoL, 1)} L</div>
            <div className="text-xs text-slate-400 mt-1">
              Rodando: <span className="text-slate-200">{formatHM(horasRodando)}</span> | Parado:{" "}
              <span className="text-slate-200">{formatHM(horasParadas)}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-400">Autonomia / Próximo abastecimento</div>
            <div className="mt-1 text-xl font-semibold">{formatHM(computed.autonomiaH)}</div>
            <div className="text-xs text-slate-400 mt-1">
              Provável: <span className="text-slate-200">{computed.previsaoHora}</span> (limite vermelho)
            </div>
          </div>
        </div>

        {/* Controles de operação */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-sm font-semibold">Parâmetros do turno (teste)</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Horas do turno</label>
                <input
                  type="number"
                  value={turnHours}
                  min={1}
                  max={24}
                  step={1}
                  onChange={(e) => setTurnHours(Number(e.target.value))}
                  className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Carga (%)</label>
                <input
                  type="number"
                  value={cargaPct}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(e) => setCargaPct(Number(e.target.value))}
                  className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-400">
              Paradas BT-01 no dia: <span className="text-slate-200">{Math.round(minutosParadosBT01)} min</span>
            </div>

            <div className="mt-2 text-xs text-slate-500">
              * Na v2 a gente conecta com o ShiftBar (07–19 / 19–07) e calcula horas do turno automaticamente.
            </div>
          </div>

          {/* Form abastecimento */}
          <div className="md:col-span-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Registrar abastecimento</div>
              {!asset && (
                <span className="text-xs text-amber-300">
                  Sem config do BT-01 — ao salvar, será criada com padrão (100L / 10Lh).
                </span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-slate-400">Data/hora</label>
                <input
                  type="datetime-local"
                  value={rfTs}
                  onChange={(e) => setRfTs(e.target.value)}
                  className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400">Horímetro</label>
                <input
                  value={rfHorimetro}
                  onChange={(e) => setRfHorimetro(e.target.value)}
                  placeholder="ex: 1234.5"
                  className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400">Litros abastecidos</label>
                <input
                  value={rfLitros}
                  onChange={(e) => setRfLitros(e.target.value)}
                  placeholder="ex: 40"
                  className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  onClick={submitRefuel}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-emerald-600/80 hover:bg-emerald-600 border border-emerald-500/40"
                >
                  Salvar
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2 flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={rfTankFull}
                    onChange={(e) => setRfTankFull(e.target.checked)}
                  />
                  Tanque cheio
                </label>

                {!rfTankFull && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400">Nível após (%)</label>
                    <input
                      value={rfLevelPct}
                      onChange={(e) => setRfLevelPct(e.target.value)}
                      className="w-24 bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-slate-400">Observação</label>
                <input
                  value={rfNote}
                  onChange={(e) => setRfNote(e.target.value)}
                  placeholder="Opcional"
                  className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tabela de abastecimentos */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="text-sm font-semibold">Abastecimentos do dia</div>

          <div className="mt-3 overflow-auto">
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
                    <td className="py-3 text-slate-500" colSpan={6}>Nenhum abastecimento registrado.</td>
                  </tr>
                )}

                {refuels.map(r => {
                  const d = new Date(r.ts);
                  const hh = String(d.getHours()).padStart(2, "0");
                  const mm = String(d.getMinutes()).padStart(2, "0");

                  return (
                    <tr key={r.id} className="border-b border-slate-900/60">
                      <td className="py-2 pr-3">{hh}:{mm}</td>
                      <td className="py-2 pr-3">{r.horimetro ?? "-"}</td>
                      <td className="py-2 pr-3">{formatNum(Number(r.liters_added), 1)}</td>
                      <td className="py-2 pr-3">{r.level_after_pct ?? (r.tank_full ? 100 : "-")}</td>
                      <td className="py-2 pr-3">{r.tank_full ? "Sim" : "Não"}</td>
                      <td className="py-2 pr-3 text-slate-400">{r.note ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            * Nesta v1, o consumo decorrido usa as paradas somadas do BT-01 no dia (stops-launch). Na v2 a gente calcula por turno (07–19 / 19–07) e melhora a previsão.
          </div>
        </div>

      </div>
    </div>
  );
}
