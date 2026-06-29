import React, { useEffect, useMemo, useState } from "react";

type Turno = 1 | 2;

type HorimetroRow = {
  id: number;
  plant_id?: number;
  day: string; // yyyy-mm-dd
  turno: Turno;
  equipamento: string;
  horimetro_ini: number;
  horimetro_fim: number;
  obs?: string | null;
  created_at?: string | null;
};

type PlantInfo = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
};

type PlantProductionEquipment = {
  id: number;
  tag: string;
  plant_id: number;
  plant_name?: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

/* ===================== helpers ===================== */
function isoTodayLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseBRNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  let s = String(v).trim();
  if (!s) return null;

  s = s.replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmtBR(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
}

function brDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/* ===================== API ===================== */
const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

function authHeaders(): HeadersInit {
  const keys = ["mp_token", "token", "access_token", "auth_token"];
  for (const k of keys) {
    const v = (localStorage.getItem(k) || "").trim();
    if (v) return { Authorization: `Bearer ${v}` };
  }
  return {};
}

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}

async function apiPost<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}

async function apiDelete(path: string): Promise<void> {
  const r = await fetch(`${API_BASE}${path}`, { method: "DELETE", headers: authHeaders() });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
}

/* ===================== page ===================== */
export default function Horimetros() {
  // filtros
  const [fDay, setFDay] = useState<string>(isoTodayLocal());
  const [fTurno, setFTurno] = useState<Turno | "ALL">(1);
  const [fEq, setFEq] = useState<string | "ALL">("ALL");

  // lançamento (IMPORTANTE: SEM TRAVA de dia anterior)
  const [day, setDay] = useState<string>(isoTodayLocal());
  const [turno, setTurno] = useState<Turno>(1);
  const [equipamento, setEquipamento] = useState<string>("");

  const [horimetroIni, setHorimetroIni] = useState<string>("");
  const [horimetroFim, setHorimetroFim] = useState<string>("");
  const [obs, setObs] = useState<string>("");

  const [plants, setPlants] = useState<PlantInfo[]>([]);
  const [prodEquipments, setProdEquipments] = useState<PlantProductionEquipment[]>([]);
  const [plantId, setPlantId] = useState<number | null>(null);
  const [rows, setRows] = useState<HorimetroRow[]>([]);
  const [lastByEq, setLastByEq] = useState<Record<string, HorimetroRow | null>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const equipamentoOptions = useMemo(() => {
    return prodEquipments
      .filter((e) => e.is_active && Number(e.plant_id) === Number(plantId))
      .map((e) => String(e.tag || "").trim().toUpperCase())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [prodEquipments, plantId]);

  async function loadProductionEquipments() {
    try {
      const data = await apiGet<PlantProductionEquipment[]>(`/api/plant-production-equipments?include_inactive=true`);
      setProdEquipments(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setProdEquipments([]);
      setErr(e?.message || "Erro ao carregar TAGs de equipamentos da produção de planta");
    }
  }

  async function loadPlants() {
    try {
      const data = await apiGet<PlantInfo[]>(`/api/plants`);
      const list = Array.isArray(data) ? data : [];
      setPlants(list);
      setPlantId((current) => {
        if (current && list.some((x) => Number(x.id) === Number(current))) return current;
        return list.length ? Number(list[0].id) : null;
      });
    } catch (e: any) {
      setPlants([]);
      setPlantId(null);
      setErr(e?.message || "Erro ao carregar plantas");
    }
  }

  async function loadLastByEq(selectedPlantId: number, eqTags: string[] = equipamentoOptions) {
    try {
      const data = await apiGet<any[]>(`/api/plants/${selectedPlantId}/horimetros/last-by-eq`);
      const map: Record<string, HorimetroRow | null> = {};

      for (const eq of eqTags) map[eq] = null;

      for (const r of data || []) {
        const tag = String(r?.equipamento || "").trim().toUpperCase();
        if (!tag || !eqTags.includes(tag)) continue;
        map[tag] = { ...(r as HorimetroRow), equipamento: tag };
      }

      setLastByEq(map);
    } catch {
      const map: Record<string, HorimetroRow | null> = {};
      for (const eq of eqTags) map[eq] = null;
      setLastByEq(map);
    }
  }

  async function loadFiltered(selectedPlantId: number) {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (fDay) qs.set("day", fDay);
      if (fTurno !== "ALL") qs.set("turno", String(fTurno));
      if (fEq !== "ALL") qs.set("equipamento", String(fEq));

      const data = await apiGet<HorimetroRow[]>(`/api/plants/${selectedPlantId}/horimetros?${qs.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar horímetros");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlants();
    loadProductionEquipments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!equipamentoOptions.length) {
      setEquipamento("");
      setFEq("ALL");
      setLastByEq({});
      return;
    }

    setEquipamento((current) => (current && equipamentoOptions.includes(current) ? current : equipamentoOptions[0]));
    setFEq((current) => (current === "ALL" || equipamentoOptions.includes(String(current)) ? current : "ALL"));
  }, [equipamentoOptions.join("|")]);

  useEffect(() => {
    if (!plantId) {
      setRows([]);
      return;
    }
    loadLastByEq(plantId, equipamentoOptions);
    loadFiltered(plantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantId, equipamentoOptions.join("|")]);

  useEffect(() => {
    if (!plantId) {
      setRows([]);
      return;
    }
    loadFiltered(plantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fDay, fTurno, fEq, plantId]);

  const selectedPlantName =
    plants.find((x) => Number(x.id) === Number(plantId))?.name || "Planta";

  const filtered = useMemo(() => {
    return [...rows].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [rows]);

  const difPreview = useMemo(() => {
    const a = parseBRNumber(horimetroIni);
    const b = parseBRNumber(horimetroFim);
    if (a === null || b === null) return null;
    return b - a;
  }, [horimetroIni, horimetroFim]);

  async function addRow() {
    setErr(null);

    // SEM qualquer regra de "dia anterior" aqui.
    if (!equipamentoOptions.length) {
      setErr("Cadastre pelo menos uma TAG ativa para a planta selecionada antes de lançar horímetro.");
      return;
    }

    if (!day || !equipamento) {
      setErr("Informe a data e selecione o equipamento.");
      return;
    }

    if (!equipamentoOptions.includes(equipamento)) {
      setErr("A TAG selecionada não pertence à planta atual.");
      return;
    }

    const ini = parseBRNumber(horimetroIni);
    const fim = parseBRNumber(horimetroFim);

    if (ini === null || ini < 0) {
      setErr("Horímetro Inicial inválido. Ex: 1234,5");
      return;
    }
    if (fim === null || fim < 0) {
      setErr("Horímetro Final inválido. Ex: 1238,0");
      return;
    }
    if (fim < ini) {
      setErr("Horímetro Final não pode ser menor que o Inicial.");
      return;
    }

    try {
      setLoading(true);

      if (!plantId) {
        setErr("Selecione uma planta.");
        return;
      }

      await apiPost(`/api/plants/${plantId}/horimetros`, {
        day,
        turno,
        equipamento,
        horimetro_ini: ini,
        horimetro_fim: fim,
        obs: obs || "",
      });

      await loadLastByEq(plantId, equipamentoOptions);
      await loadFiltered(plantId);

      // mostra o que lançou (mantém isso porque ajuda, mas não trava nada)
      setFDay(day);
      setFTurno(turno);
      setFEq(equipamento);

      setHorimetroIni("");
      setHorimetroFim("");
      setObs("");
    } catch (e: any) {
      setErr(e?.message || "Falha ao salvar horímetro");
    } finally {
      setLoading(false);
    }
  }

  async function removeRow(id: number) {
    try {
      if (!plantId) {
        setErr("Selecione uma planta.");
        return;
      }
      setLoading(true);
      await apiDelete(`/api/plants/${plantId}/horimetros/${id}`);
      await loadLastByEq(plantId, equipamentoOptions);
      await loadFiltered(plantId);
    } catch (e: any) {
      setErr(e?.message || "Falha ao excluir");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mp-container horimetros-page">
      <style>{`
        .horimetros-page{
          width:100% !important;
          max-width:none !important;
          margin:0 !important;
          padding:0 !important;
        }
        .horimetros-page *{ box-sizing:border-box; }
        .horimetros-page .mp-page-grid{
          width:100%;
          max-width:none;
          display:grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap:16px;
          align-items:start;
        }
        .horimetros-page .mp-col-span-12{ grid-column: span 12 / span 12; min-width:0; }
        .horimetros-page .mp-col-span-8{ grid-column: span 8 / span 8; min-width:0; }
        .horimetros-page .mp-col-span-4{ grid-column: span 4 / span 4; min-width:0; }
        .horimetros-page .mp-col-span-7{ grid-column: span 8 / span 8; min-width:0; }
        .horimetros-page .mp-col-span-5{ grid-column: span 4 / span 4; min-width:0; }
        .horimetros-page .mp-card{ min-width:0; width:100%; }
        .horimetros-page .mp-card-b{ min-width:0; }
        .horimetros-page .hor-kpi-grid{
          display:grid;
          gap:12px;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        }
        .horimetros-page .hor-main-table-wrap{
          width:100%;
          overflow-x:auto;
        }
        .horimetros-page .hor-actions-row{
          display:flex;
          gap:10px;
          align-items:end;
          justify-content:flex-end;
          flex-wrap:wrap;
        }
        @media (max-width: 1180px){
          .horimetros-page .mp-col-span-7,
          .horimetros-page .mp-col-span-8,
          .horimetros-page .mp-col-span-5,
          .horimetros-page .mp-col-span-4{ grid-column: span 12 / span 12 !important; }
        }
        @media (max-width: 720px){
          .horimetros-page .mp-page-title{ font-size:28px; }
          .horimetros-page .hor-actions-row{ justify-content:stretch; }
          .horimetros-page .hor-actions-row > *{ flex:1 1 100%; }
        }
      `}</style>

      <div className="mp-page-grid">
        <div className="mp-col-span-12">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mp-chip">Operação</div>
              <div className="mp-page-title">Horímetros</div>
              <div className="mp-page-sub">Histórico + filtros + lançamento (Inicial / Final) • {selectedPlantName} • permitido lançar qualquer data</div>
            </div>

            <div className="hor-actions-row">
              <div style={{ minWidth: 220 }}>
                <div className="mp-label">Planta</div>
                <select
                  className="mp-input"
                  value={plantId ?? ""}
                  onChange={(e) => setPlantId(e.target.value ? Number(e.target.value) : null)}
                  disabled={plants.length === 0}
                >
                  {plants.length === 0 ? <option value="">Sem plantas</option> : null}
                  {plants.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="mp-btn"
                onClick={() => {
                  if (plantId) {
                    loadLastByEq(plantId, equipamentoOptions);
                    loadFiltered(plantId);
                  }
                }}
                disabled={loading || !plantId}
              >
                {loading ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </div>
        </div>

        <div className="mp-col-span-12">
          <div className="mp-card">
            <div className="mp-card-h">
              <b>Último horímetro por equipamento</b>
              <span className="mp-help">Mostra o último registro (Final) encontrado</span>
            </div>
            <div className="mp-card-b">
              <div className="hor-kpi-grid">
                {equipamentoOptions.length === 0 ? (
                  <div className="mp-help">Nenhuma TAG ativa cadastrada para esta planta.</div>
                ) : null}
                {equipamentoOptions.map((eq) => {
                  const r = lastByEq?.[eq] || null;
                  return (
                    <div
                      key={eq}
                      style={{
                        borderRadius: 16,
                        padding: 12,
                        background: "rgba(255,255,255,.04)",
                        border: "1px solid rgba(255,255,255,.10)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                        <div style={{ fontWeight: 900 }}>{eq}</div>
                        <span className="mp-chip">{r ? fmtBR(r.horimetro_fim) : "—"}</span>
                      </div>
                      <div className="mp-help" style={{ marginTop: 6 }}>
                        {r ? `Dia ${brDate(r.day)} • Turno ${r.turno}` : "Sem registros ainda"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="mp-col-span-7" style={{ display: "grid", gap: 14 }}>
          <div className="mp-card">
            <div className="mp-card-h">
              <b>Histórico</b>
              <span className="mp-help">Exclusão remove do Postgres</span>
            </div>

            <div className="mp-card-b hor-main-table-wrap">
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    {["Data", "Turno", "Equipamento", "Inicial", "Final", "Dif", "Observação", ""].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "10px 10px",
                          fontSize: 12,
                          letterSpacing: 0.6,
                          textTransform: "uppercase",
                          color: "rgba(255,255,255,.55)",
                          borderBottom: "1px solid rgba(255,255,255,.10)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="mp-help" style={{ padding: 14 }}>
                        Nenhum horímetro encontrado com estes filtros.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r) => {
                      const dif = (r.horimetro_fim ?? 0) - (r.horimetro_ini ?? 0);
                      return (
                        <tr key={r.id}>
                          <td style={td}>{brDate(r.day)}</td>
                          <td style={td}>{r.turno}</td>
                          <td style={td}>
                            <span className="mp-chip">{r.equipamento}</span>
                          </td>
                          <td style={td}>{fmtBR(r.horimetro_ini)}</td>
                          <td style={td}>
                            <b>{fmtBR(r.horimetro_fim)}</b>
                          </td>
                          <td style={td}>{fmtBR(dif)}</td>
                          <td style={{ ...td, maxWidth: 520, whiteSpace: "normal" }}>
                            <div style={{ color: "rgba(255,255,255,.82)" }}>{r.obs || "—"}</div>
                          </td>
                          <td style={td}>
                            <button
                              className="mp-btn"
                              onClick={() => removeRow(r.id)}
                              disabled={loading}
                              style={{
                                height: 34,
                                padding: "0 10px",
                                borderRadius: 12,
                                border: "1px solid rgba(251,113,133,.30)",
                                background: "rgba(251,113,133,.12)",
                              }}
                            >
                              Excluir
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              <div className="mp-help" style={{ marginTop: 10 }}>
                * Dif = Final - Inicial.
              </div>
            </div>
          </div>
        </div>

        <div className="mp-col-span-5" style={{ display: "grid", gap: 14 }}>
          <div className="mp-card">
            <div className="mp-card-h">
              <b>Novo lançamento</b>
              <span className="mp-help">Salva Inicial e Final (sem travar dia anterior)</span>
            </div>
            <div className="mp-card-b">
              {err && <div className="mp-error">{err}</div>}

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  alignItems: "end",
                }}
              >
                <div>
                  <div className="mp-label">Data</div>
                  <input
                    className="mp-input"
                    type="date"
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                    // IMPORTANTE: não colocar min/max aqui
                  />
                </div>

                <div>
                  <div className="mp-label">Turno</div>
                  <select className="mp-input" value={turno} onChange={(e) => setTurno(Number(e.target.value) as Turno)}>
                    <option value={1}>Turno 1</option>
                    <option value={2}>Turno 2</option>
                  </select>
                </div>

                <div>
                  <div className="mp-label">Equipamento</div>
                  <select className="mp-input" value={equipamento} onChange={(e) => setEquipamento(e.target.value)} disabled={equipamentoOptions.length === 0}>
                    {equipamentoOptions.length === 0 ? <option value="">Sem TAGs para esta planta</option> : null}
                    {equipamentoOptions.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mp-label">Horímetro Inicial</div>
                  <input className="mp-input" value={horimetroIni} onChange={(e) => setHorimetroIni(e.target.value)} placeholder="Ex: 1234,5" />
                </div>

                <div>
                  <div className="mp-label">Horímetro Final</div>
                  <input className="mp-input" value={horimetroFim} onChange={(e) => setHorimetroFim(e.target.value)} placeholder="Ex: 1238,0" />
                </div>

                <div>
                  <div className="mp-label">Diferença</div>
                  <div className="mp-input" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 900 }}>
                    <span>{difPreview === null ? "—" : fmtBR(difPreview)}</span>
                    <span className="mp-help" style={{ margin: 0 }}>
                      auto
                    </span>
                  </div>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <div className="mp-label">Observação</div>
                  <textarea className="mp-textarea" value={obs} onChange={(e) => setObs(e.target.value)} style={{ minHeight: 90 }} />
                </div>

                <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
                  <button className="mp-btn mp-btn-primary" onClick={addRow} disabled={loading}>
                    {loading ? "Salvando..." : "Salvar horímetro"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mp-card">
            <div className="mp-card-h">
              <b>Filtros</b>
              <span className="mp-help">Pesquisa no histórico</span>
            </div>
            <div className="mp-card-b">
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  alignItems: "end",
                }}
              >
                <div>
                  <div className="mp-label">Data</div>
                  <input
                    className="mp-input"
                    type="date"
                    value={fDay}
                    onChange={(e) => setFDay(e.target.value)}
                    // IMPORTANTE: sem min/max
                  />
                </div>

                <div>
                  <div className="mp-label">Turno</div>
                  <select
                    className="mp-input"
                    value={fTurno}
                    onChange={(e) => setFTurno((e.target.value === "ALL" ? "ALL" : Number(e.target.value)) as any)}
                  >
                    <option value="ALL">Todos</option>
                    <option value={1}>Turno 1</option>
                    <option value={2}>Turno 2</option>
                  </select>
                </div>

                <div>
                  <div className="mp-label">Equipamento</div>
                  <select className="mp-input" value={fEq} onChange={(e) => setFEq(e.target.value)}>
                    <option value="ALL">Todos</option>
                    {equipamentoOptions.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mp-help" style={{ marginLeft: "auto" }}>
                  {loading ? (
                    "Carregando..."
                  ) : (
                    <>
                      Resultado: <b>{filtered.length}</b> registro(s)
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

const td: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(255,255,255,.06)",
  verticalAlign: "top",
  whiteSpace: "nowrap",
  color: "rgba(255,255,255,.85)",
};
