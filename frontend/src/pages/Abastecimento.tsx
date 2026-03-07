import React, { useEffect, useMemo, useState } from "react";
import { Settings } from "lucide-react";

/**
 * Abastecimento BT-01 (v2)
 * Fixes:
 * - Inputs do modal são NUMÉRICOS (evita salvar texto como "tank_capacity_l")
 * - Após salvar config: chama fetchAll() e fecha modal
 * - Se backend retornar algo inesperado, mostra alerta com o conteúdo
 * - Tabela hora: evita NaN:NaN
 *
 * OBS: Se mesmo assim os cards ficarem "—", então o backend NÃO está retornando o objeto do asset
 * no PUT/GET. Nesse caso, precisamos ajustar o abastecimento.py para retornar os campos numéricos.
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
  period: string;
  equipamento: string;
  minutos: number;
  tipo_parada?: string;
  descricao?: string;
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

/** v1 */
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

function BT01FuelVisual({ pct, farol }: { pct: number; farol: Farol }) {
  const p = clamp(pct, 0, 100);
  const W = 1920;
  const H = 1080;
  const y = (1 - p / 100) * H;
  const maskId = "bt01MaskSvg";

  return (
    <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <div
        style={{
          width: "min(980px, 100%)",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,.10)",
          background: "rgba(255,255,255,.02)",
          overflow: "hidden",
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" preserveAspectRatio="xMidYMid meet">
          <defs>
            {/* máscara pela transparência do PNG */}
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
              <image href="/assets/BT-01.png" x="0" y="0" width={W} height={H} />
            </mask>

            <linearGradient id="fuelGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="rgba(249,115,22,.95)" />
              <stop offset="100%" stopColor="rgba(251,146,60,.70)" />
            </linearGradient>
          </defs>

          {/* Preenchimento (laranja) recortado pela forma do equipamento */}
          <g mask={`url(#${maskId})`}>
            <rect x="0" y={y} width={W} height={H - y} fill="url(#fuelGrad)" />
          </g>

          {/* Desenho por cima */}
          <image href="/assets/BT-01.png" x="0" y="0" width={W} height={H} />
        </svg>

        <div style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="mp-help">Laranja = combustível • Visual acompanha o nível</div>
          <div
            style={{
              fontWeight: 950,
              color: "rgba(255,255,255,.92)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${farolDotClass(farol)}`} />
            {Math.round(p)}%
          </div>
        </div>
      </div>
    </div>
  );
}


function isAssetLike(x: any): x is Asset {
  return (
    x &&
    typeof x === "object" &&
    typeof x.asset_tag === "string" &&
    typeof x.tank_capacity_l === "number" &&
    typeof x.consumption_max_lph === "number"
  );
}

export default function Abastecimento() {
  const assetTag = "BT-01";

  const [day, setDay] = useState<string>(todayYMD());
  const [asset, setAsset] = useState<Asset | null>(null);
  const [refuels, setRefuels] = useState<Refuel[]>([]);
  const [stopRows, setStopRows] = useState<StopLaunchRow[]>([]);
  const [loading, setLoading] = useState(false);

  // v1 (teste)
  const [turnHours, setTurnHours] = useState<number>(12);
  const [cargaPct, setCargaPct] = useState<number>(83);

  // form abastecimento
  const [rfTs, setRfTs] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [rfHorimetro, setRfHorimetro] = useState<string>("");
  const [rfLitros, setRfLitros] = useState<string>("0");
  const [rfTankFull, setRfTankFull] = useState<boolean>(true);
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

  useEffect(() => {
    syncCfgFromAsset(asset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id]);

  const minutosParadosBT01 = useMemo(() => {
    return stopRows
      .filter((r) => (r.equipamento || "").toUpperCase() === assetTag)
      .reduce((acc, r) => acc + (Number(r.minutos) || 0), 0);
  }, [stopRows]);

  const nowClock = new Date();
  const selectedDate = new Date(`${day}T00:00:00`);
  const isToday =
    nowClock.getFullYear() === selectedDate.getFullYear() &&
    nowClock.getMonth() === selectedDate.getMonth() &&
    nowClock.getDate() === selectedDate.getDate();
  const isHistoricalDay = !isToday;

  const minutosDecorridosDoDia = isToday
    ? nowClock.getHours() * 60 + nowClock.getMinutes()
    : 24 * 60;

  const minutosRodando = Math.max(0, minutosDecorridosDoDia - minutosParadosBT01);
  const horasParadas = minutosParadosBT01 / 60;
  const horasRodando = minutosRodando / 60;

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
        baseInfo: "Sem dados de configuração (clique na engrenagem)",
        capacity: NaN,
        yellowPct: NaN,
        redPct: NaN,
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
      yellowPct: Number(asset.yellow_pct),
      redPct: Number(asset.red_pct),
    };
  }, [asset, cargaPct, horasRodando, refuels]);

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
        alert("O limite VERMELHO deve ser menor ou igual ao AMARELO.");
        return;
      }

      const res = await fetch(`${API_BASE}/api/ab/assets/${assetTag}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });

      const txt = await res.text();
      if (!res.ok) {
        alert(`Erro ao salvar config: ${txt}`);
        return;
      }

      // tenta parsear JSON (o backend PRECISA retornar o objeto do asset)
      let json: any = null;
      try {
        json = txt ? JSON.parse(txt) : null;
      } catch {
        json = null;
      }

      if (!isAssetLike(json)) {
        alert(
          "Config salvou, mas o backend NÃO retornou o Asset (JSON esperado). " +
            "Abra o log/Network e verifique o retorno do PUT /api/ab/assets/BT-01.\n\nResposta recebida:\n" +
            (txt || "(vazio)")
        );
        // Mesmo assim, tenta recarregar via GET
        await fetchAll();
        setCfgOpen(false);
        return;
      }

      setAsset(json);
      await fetchAll();
      setCfgOpen(false);
    } finally {
      setCfgSaving(false);
    }
  }

  async function submitRefuel() {
    if (isHistoricalDay) return;
    // se não tiver asset ainda, salva config primeiro
    if (!asset) {
      await saveAssetConfig();
    }

    const litros = Number(rfLitros) || 0;
    const hor = rfHorimetro.trim() ? Number(rfHorimetro) : null;

    // Regra correta:
    // - tanque cheio => 100%
    // - parcial => nível atual + litros abastecidos (limitado à capacidade)
    const lvlPct =
      rfTankFull
        ? 100
        : asset && Number.isFinite(computed.nivelAtualL) && Number(asset.tank_capacity_l) > 0
        ? Math.min(
            100,
            ((Math.max(0, Number(computed.nivelAtualL)) + litros) / Number(asset.tank_capacity_l)) * 100
          )
        : null;

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

  const progressPct = clamp(Number.isFinite(computed.nivelAtualPct) ? computed.nivelAtualPct : 0, 0, 100);

  return (
    <div className="mp-container" style={{ paddingTop: 12, paddingBottom: 28 }}>
      {/* Header */}
      <div className="mp-card" style={{ marginBottom: 14 }}>
        <div className="mp-card-b">
          <div style={{ display: "flex", gap: 12, alignItems: "end", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ minWidth: 260 }}>
              <div className="mp-page-sub" style={{ marginTop: 0 }}>
                Operação • Abastecimento
              </div>
              <div className="mp-page-title" style={{ fontSize: 26, display: "flex", alignItems: "center", gap: 10 }}>
                Abastecimento — {assetTag}
                <button
                  className="mp-btn"
                  title="Configurar tanque/consumo"
                  onClick={() => (!isHistoricalDay ? setCfgOpen(true) : null)}
                  style={{ padding: "8px 10px", height: 38 }}
                >
                  <Settings size={16} />
                </button>
              </div>
              <div className="mp-help" style={{ marginTop: 6 }}>
                {computed.baseInfo}
              </div>
              {isHistoricalDay && (
                <div className="mp-help" style={{ marginTop: 6, color: "rgba(255,255,255,.72)" }}>
                  Dia fechado — visualização histórica. Sem edição e sem recálculo após a virada do dia.
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
              <div style={{ width: 160 }}>
                <div className="mp-label">DATA</div>
                <input className="mp-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
              </div>

              <div style={{ width: 140 }}>
                <div className="mp-label">CARGA (%)</div>
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

      {/* Banner semáforo */}
      <div
        className="mp-card"
        style={{
          marginBottom: 14,
          borderColor:
            computed.farol === "green"
              ? "rgba(16,185,129,.25)"
              : computed.farol === "yellow"
              ? "rgba(245,158,11,.25)"
              : computed.farol === "red"
              ? "rgba(239,68,68,.25)"
              : "rgba(255,255,255,.10)",
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
                  {bannerText}
                </div>
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div className="mp-label" style={{ marginBottom: 6 }}>
                SEMÁFORO
              </div>
              <span className="mp-chip" style={{ background: "rgba(255,255,255,.04)", borderColor: "rgba(255,255,255,.10)" }}>
                <span className={`h-2.5 w-2.5 rounded-full ${farolDotClass(computed.farol)}`} />
                {farolLabel(computed.farol).toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Barra tanque grande */}
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
            Nível atual: <b style={{ color: "rgba(255,255,255,.92)" }}>{formatNum(computed.nivelAtualL, 1)} L</b>{" "}
            {asset ? (
              <span>
                • Capacidade: <b style={{ color: "rgba(255,255,255,.92)" }}>{formatNum(computed.capacity, 0)} L</b>
              </span>
            ) : null}
          </div>
        </div>
      </div>


      {/* Grid principal */}
      <div className="mp-main-grid">
        <div className="mp-card" style={{ gridColumn: "span 4" }}>
          <div className="mp-card-b">
            <div className="mp-label">CAPACIDADE</div>
            <div className="big-number" style={{ marginTop: 8, fontWeight: 950 }}>
              {asset ? `${formatNum(computed.capacity, 0)} L` : "—"}
            </div>
            <div className="mp-help" style={{ marginTop: 6 }}>
              Limites: amarelo {asset ? `${formatNum(computed.yellowPct, 0)}%` : "—"} • vermelho{" "}
              {asset ? `${formatNum(computed.redPct, 0)}%` : "—"}
            </div>
          </div>
        </div>

        <div className="mp-card" style={{ gridColumn: "span 4" }}>
          <div className="mp-card-b">
            <div className="mp-label">CONSUMO (L/H)</div>
            <div className="big-number" style={{ marginTop: 8, fontWeight: 950 }}>
              {formatNum(computed.consumoLh, 2)}
            </div>
            <div className="mp-help" style={{ marginTop: 6 }}>
              Max {asset ? formatNum(Number(asset.consumption_max_lph), 2) : "—"} • fator{" "}
              {asset ? formatNum(Number(asset.consumption_factor), 3) : "—"}
            </div>
          </div>
        </div>

        <div className="mp-card" style={{ gridColumn: "span 4" }}>
          <div className="mp-card-b">
            <div className="mp-label">PRÓXIMO ABASTECIMENTO</div>
            <div
              className="big-number"
              style={{
                marginTop: 8,
                fontWeight: 950,
                color:
                  computed.farol === "red"
                    ? "rgba(248,113,113,.95)"
                    : computed.farol === "yellow"
                    ? "rgba(251,191,36,.95)"
                    : "rgba(255,255,255,.92)",
              }}
            >
              {computed.previsaoHora}
            </div>
            <div className="mp-help" style={{ marginTop: 6 }}>
              Autonomia: {formatHM(computed.autonomiaH)}
            </div>
          </div>
        </div>

        <div className="mp-card" style={{ gridColumn: "span 4" }}>
          <div className="mp-card-b">
            <div className="mp-label">CONSUMO DECORRIDO</div>
            <div className="big-number" style={{ marginTop: 8, fontWeight: 950 }}>
              {formatNum(computed.consumoDecorridoL, 1)} L
            </div>
            <div className="mp-help" style={{ marginTop: 6 }}>
              Rodando: {formatHM(horasRodando)}
            </div>
          </div>
        </div>

        <div className="mp-card" style={{ gridColumn: "span 4" }}>
          <div className="mp-card-b">
            <div className="mp-label">TEMPO (TURNO)</div>
            <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
              <div>
                <div className="big-number" style={{ fontWeight: 950 }}>
                  {formatHM(horasRodando)}
                </div>
                <div className="mp-help">Rodando</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 950, fontSize: 20, color: "rgba(255,255,255,.90)" }}>{formatHM(horasParadas)}</div>
                <div className="mp-help">{Math.round(minutosParadosBT01)} min parado</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mp-card" style={{ gridColumn: "span 4" }}>
          <div className="mp-card-b">
            <div className="mp-label">NÍVEL ATUAL</div>
            <div className="big-number" style={{ marginTop: 8, fontWeight: 950 }}>
              {formatNum(computed.nivelAtualL, 1)} L
            </div>
            <div className="mp-help" style={{ marginTop: 6 }}>
              {formatNum(progressPct, 0)}% • Farol:{" "}
              <b style={{ color: "rgba(255,255,255,.92)" }}>{farolLabel(computed.farol)}</b>
            </div>
          </div>
        </div>

        {/* Registrar abastecimento */}
        <div className="mp-card" style={{ gridColumn: "span 8" }}>
          <div className="mp-card-h">
            <div>
              <div style={{ fontWeight: 950 }}>Registrar abastecimento</div>
              <div className="mp-help" style={{ marginTop: 2 }}>
                {isHistoricalDay ? "Dia fechado — edição bloqueada." : asset ? "Config OK" : "Sem config — clique na engrenagem para definir capacidade/consumo."}
              </div>
            </div>

            <button className="mp-btn mp-btn-primary" onClick={submitRefuel} disabled={isHistoricalDay} style={{ opacity: isHistoricalDay ? 0.55 : 1, cursor: isHistoricalDay ? "not-allowed" : "pointer" }}>
              Salvar
            </button>
          </div>

          <div className="mp-card-b">
            <div className="mp-form-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
              <div style={{ gridColumn: "span 2" }}>
                <div className="mp-label">DATA/HORA</div>
                <input className="mp-input" type="datetime-local" value={rfTs} disabled={isHistoricalDay} onChange={(e) => setRfTs(e.target.value)} />
              </div>

              <div>
                <div className="mp-label">HORÍMETRO</div>
                <input className="mp-input" value={rfHorimetro} disabled={isHistoricalDay} onChange={(e) => setRfHorimetro(e.target.value)} placeholder="ex: 1234.5" />
              </div>

              <div>
                <div className="mp-label">LITROS</div>
                <input className="mp-input" value={rfLitros} disabled={isHistoricalDay} onChange={(e) => setRfLitros(e.target.value)} placeholder="ex: 40" />
              </div>

              <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 850 }}>
                  <input type="checkbox" checked={rfTankFull} disabled={isHistoricalDay} onChange={(e) => setRfTankFull(e.target.checked)} />
                  Tanque cheio
                </label>

              </div>
              <div style={{ gridColumn: "span 2" }}>
                <div className="mp-label">OBSERVAÇÃO</div>
                <input className="mp-input" value={rfNote} disabled={isHistoricalDay} onChange={(e) => setRfNote(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div className="mp-card" style={{ gridColumn: "span 12" }}>
          <div className="mp-card-h">
            <div style={{ fontWeight: 950 }}>Abastecimentos do dia</div>
            <div className="mp-help">* Consumo decorrido usa paradas somadas (stops-launch).</div>
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
                      <td style={{ padding: "10px 8px" }}>
                        <span style={{ fontWeight: 950 }}>
                          {hh}:{mm}
                        </span>
                      </td>
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

            <div className="mp-help" style={{ marginTop: 10 }}>
              Dica: clique na <b>engrenagem</b> para configurar capacidade/consumo.
            </div>
          </div>
        </div>
      </div>

      {/* MODAL CONFIG */}
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
          <div
            className="mp-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(820px, 100%)", borderColor: "rgba(255,255,255,.14)" }}
          >
            <div className="mp-card-h">
              <div style={{ fontWeight: 950, display: "flex", alignItems: "center", gap: 10 }}>
                <Settings size={16} />
                Configurar BT-01
              </div>
              <button className="mp-btn" onClick={() => (cfgSaving ? null : setCfgOpen(false))}>
                Fechar
              </button>
            </div>

            <div className="mp-card-b">
              <div className="mp-help" style={{ marginBottom: 12 }}>
                Defina <b>capacidade</b> e <b>consumo</b>. (Vermelho ≤ Amarelo)
              </div>

              <div className="mp-form-grid" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
                <div>
                  <div className="mp-label">CAPACIDADE (L)</div>
                  <input
                    className="mp-input"
                    type="number"
                    value={cfg.tank_capacity_l}
                    onChange={(e) => setCfg((s) => ({ ...s, tank_capacity_l: Number(e.target.value) }))}
                  />
                </div>

                <div>
                  <div className="mp-label">CONSUMO MÁX (L/H)</div>
                  <input
                    className="mp-input"
                    type="number"
                    value={cfg.consumption_max_lph}
                    onChange={(e) => setCfg((s) => ({ ...s, consumption_max_lph: Number(e.target.value) }))}
                  />
                </div>

                <div>
                  <div className="mp-label">FATOR</div>
                  <input
                    className="mp-input"
                    type="number"
                    step="0.01"
                    value={cfg.consumption_factor}
                    onChange={(e) => setCfg((s) => ({ ...s, consumption_factor: Number(e.target.value) }))}
                  />
                </div>

                <div>
                  <div className="mp-label">AMARELO (%)</div>
                  <input
                    className="mp-input"
                    type="number"
                    value={cfg.yellow_pct}
                    onChange={(e) => setCfg((s) => ({ ...s, yellow_pct: Number(e.target.value) }))}
                  />
                </div>

                <div>
                  <div className="mp-label">VERMELHO (%)</div>
                  <input
                    className="mp-input"
                    type="number"
                    value={cfg.red_pct}
                    onChange={(e) => setCfg((s) => ({ ...s, red_pct: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                <button className="mp-btn" onClick={() => syncCfgFromAsset(asset)} disabled={cfgSaving}>
                  Recarregar
                </button>
                <button className="mp-btn mp-btn-primary" onClick={saveAssetConfig} disabled={cfgSaving}>
                  {cfgSaving ? "Salvando..." : "Salvar configurações"}
                </button>
              </div>

              <div className="mp-help" style={{ marginTop: 12 }}>
                Se salvar e os cards não mudarem, o backend está retornando errado no PUT/GET do asset.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
