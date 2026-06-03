import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../utils/api";
import { Factory, Link2, Plus, RefreshCcw, Save, Trash2 } from "lucide-react";

type Equipment = {
  id: number;
  equipment_type: string;
  tag: string;
  bucket_ton: number;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type PlantInfo = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
};

type AllocationPayload = {
  plant_id: number;
  allocation: null | {
    id: number;
    plant_id: number;
    equipment_id: number;
    is_active: boolean;
    updated_at?: string | null;
  };
  equipment: null | Equipment;
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

type ProductionEquipmentPayload = {
  tag: string;
  plant_id: number;
  is_active?: boolean;
};

const card: React.CSSProperties = {
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(14,18,22,0.78)",
  boxShadow: "0 18px 55px rgba(0,0,0,.22)",
};

const input: React.CSSProperties = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.045)",
  color: "rgba(255,255,255,0.92)",
  padding: "11px 12px",
  outline: "none",
  fontWeight: 900,
};

const label: React.CSSProperties = {
  display: "block",
  marginBottom: 7,
  color: "rgba(255,255,255,0.58)",
  fontWeight: 950,
  fontSize: 12,
  letterSpacing: 0.3,
  textTransform: "uppercase",
};

const button: React.CSSProperties = {
  border: 0,
  borderRadius: 14,
  padding: "11px 14px",
  color: "#0b0f13",
  background: "linear-gradient(135deg,#ff9f1a,#ffb84d)",
  fontWeight: 1000,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  whiteSpace: "nowrap",
};

const ghostButton: React.CSSProperties = {
  ...button,
  color: "rgba(255,255,255,0.88)",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
};

function parseDecimal(v: string): number {
  const n = Number(String(v || "0").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function fmtTon(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function safeUpper(v: string) {
  return String(v || "").trim().toUpperCase();
}

export default function Equipamentos() {
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [plants, setPlants] = useState<PlantInfo[]>([]);
  const [allocations, setAllocations] = useState<Record<number, AllocationPayload>>({});

  // Cadastro usado pelo Ritmo.
  const [tag, setTag] = useState("");
  const [bucketTon, setBucketTon] = useState("");
  const [equipmentType, setEquipmentType] = useState("escavadeira");
  const [editingId, setEditingId] = useState<number | null>(null);

  // Novo módulo: equipamentos da Produção de Planta / Paradas Minutos.
  const [prodEquipments, setProdEquipments] = useState<PlantProductionEquipment[]>([]);
  const [prodTag, setProdTag] = useState("");
  const [prodPlantId, setProdPlantId] = useState<number | "">("");
  const [prodEditingId, setProdEditingId] = useState<number | null>(null);
  const [prodEndpointReady, setProdEndpointReady] = useState(true);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const activeEquipments = useMemo(() => equipments.filter((e) => e.is_active), [equipments]);
  const activeProdEquipments = useMemo(() => prodEquipments.filter((e) => e.is_active), [prodEquipments]);

  function plantNameById(plantId: number | null | undefined) {
    const p = plants.find((x) => x.id === Number(plantId));
    return p?.name || `Planta ${plantId || ""}`;
  }

  async function loadProductionEquipments() {
    try {
      const rows = await apiFetch<PlantProductionEquipment[]>("/api/plant-equipments?include_inactive=true");
      setProdEquipments(Array.isArray(rows) ? rows : []);
      setProdEndpointReady(true);
    } catch {
      // O front fica pronto, mas o backend precisa ser entregue no próximo passo.
      setProdEndpointReady(false);
      setProdEquipments([]);
    }
  }

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [eqs, pls] = await Promise.all([
        apiFetch<Equipment[]>("/api/equipments?include_inactive=true"),
        apiFetch<PlantInfo[]>("/api/plants"),
      ]);
      setEquipments(Array.isArray(eqs) ? eqs : []);
      const plantList = Array.isArray(pls) ? pls : [];
      setPlants(plantList);

      if (!prodPlantId && plantList.length) {
        setProdPlantId(plantList[0].id);
      }

      const entries = await Promise.all(
        plantList.map(async (p) => {
          try {
            const a = await apiFetch<AllocationPayload>(`/api/plants/${p.id}/equipment-allocation`);
            return [p.id, a] as const;
          } catch {
            return [p.id, { plant_id: p.id, allocation: null, equipment: null }] as const;
          }
        })
      );
      setAllocations(Object.fromEntries(entries));

      await loadProductionEquipments();
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar equipamentos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setEditingId(null);
    setTag("");
    setBucketTon("");
    setEquipmentType("escavadeira");
  }

  function resetProductionForm() {
    setProdEditingId(null);
    setProdTag("");
    setProdPlantId(plants[0]?.id || "");
  }

  function startEdit(e: Equipment) {
    setEditingId(e.id);
    setTag(e.tag);
    setBucketTon(fmtTon(e.bucket_ton));
    setEquipmentType(e.equipment_type || "escavadeira");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEditProductionEquipment(e: PlantProductionEquipment) {
    setProdEditingId(e.id);
    setProdTag(e.tag);
    setProdPlantId(Number(e.plant_id));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveProductionEquipment() {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const payload: ProductionEquipmentPayload = {
        tag: safeUpper(prodTag),
        plant_id: Number(prodPlantId),
        is_active: true,
      };

      if (!payload.tag) throw new Error("Informe a TAG do equipamento.");
      if (!payload.plant_id || payload.plant_id <= 0) throw new Error("Selecione a planta do equipamento.");

      if (prodEditingId) {
        await apiFetch(`/api/plant-equipments/${prodEditingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setOk("Equipamento da produção atualizado com sucesso.");
      } else {
        await apiFetch("/api/plant-equipments", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setOk("Equipamento da produção cadastrado com sucesso.");
      }

      resetProductionForm();
      await loadProductionEquipments();
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar equipamento da produção.");
    } finally {
      setSaving(false);
    }
  }

  async function removeProductionEquipment(e: PlantProductionEquipment) {
    if (!window.confirm(`Deseja inativar a TAG ${e.tag} da ${plantNameById(e.plant_id)}?`)) return;

    setSaving(true);
    setError(null);
    setOk(null);
    try {
      await apiFetch(`/api/plant-equipments/${e.id}`, { method: "DELETE" });
      setOk("Equipamento da produção inativado.");
      await loadProductionEquipments();
    } catch (err: any) {
      setError(err?.message || "Erro ao inativar equipamento da produção.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEquipment() {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const payload = {
        equipment_type: equipmentType || "escavadeira",
        tag: safeUpper(tag),
        bucket_ton: parseDecimal(bucketTon),
        is_active: true,
      };
      if (!payload.tag) throw new Error("Informe a TAG do equipamento.");
      if (!payload.bucket_ton || payload.bucket_ton <= 0) throw new Error("Informe a tonelada da concha.");

      if (editingId) {
        await apiFetch(`/api/equipments/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setOk("Equipamento atualizado com sucesso.");
      } else {
        await apiFetch("/api/equipments", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setOk("Equipamento cadastrado com sucesso.");
      }
      resetForm();
      await loadAll();
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar equipamento.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEquipment(e: Equipment) {
    const linked = Object.values(allocations).some((a) => a.equipment?.id === e.id);
    const msg = linked
      ? `A ${e.tag} está vinculada a uma planta. Deseja inativar mesmo assim?`
      : `Deseja inativar a ${e.tag}?`;
    if (!window.confirm(msg)) return;

    setSaving(true);
    setError(null);
    setOk(null);
    try {
      await apiFetch(`/api/equipments/${e.id}`, { method: "DELETE" });
      setOk("Equipamento inativado.");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Erro ao inativar equipamento.");
    } finally {
      setSaving(false);
    }
  }

  async function setAllocation(plantId: number, equipmentIdRaw: string) {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const equipment_id = equipmentIdRaw ? Number(equipmentIdRaw) : null;
      const payload = await apiFetch<AllocationPayload>(`/api/plants/${plantId}/equipment-allocation`, {
        method: "PUT",
        body: JSON.stringify({ equipment_id }),
      });
      setAllocations((prev) => ({ ...prev, [plantId]: payload }));
      setOk(equipment_id ? "Alocação atualizada." : "Alocação removida.");
    } catch (e: any) {
      setError(e?.message || "Erro ao atualizar alocação.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "rgba(255,255,255,.58)", fontWeight: 950, fontSize: 13 }}>MonPlant • Configurações</div>
          <h1 style={{ margin: "6px 0 0", color: "white", fontSize: 28, letterSpacing: -0.6 }}>Equipamentos</h1>
          <div style={{ marginTop: 8, color: "rgba(255,255,255,.62)", fontWeight: 750, maxWidth: 980 }}>
            Cadastre os equipamentos da produção de planta por TAG e planta. Depois, a tela Paradas Minutos poderá buscar estes equipamentos automaticamente, sem lista fixa no código.
          </div>
        </div>

        <button style={ghostButton} onClick={loadAll} disabled={loading || saving}>
          <RefreshCcw size={16} /> Atualizar
        </button>
      </div>

      {error ? <div style={{ ...card, padding: 14, color: "#ff6b6b", fontWeight: 950 }}>{error}</div> : null}
      {ok ? <div style={{ ...card, padding: 14, color: "#ffb84d", fontWeight: 950 }}>{ok}</div> : null}

      <div style={{ ...card, padding: 18, borderColor: "rgba(255,159,26,.28)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <div style={{ color: "white", fontWeight: 1000, fontSize: 19 }}>Equipamentos da Produção de Planta</div>
            <div style={{ color: "rgba(255,255,255,.58)", fontWeight: 850, fontSize: 12, marginTop: 4 }}>
              Cadastro que será usado pela tela Paradas Minutos. Informe somente a TAG e a planta à qual o equipamento pertence.
            </div>
          </div>
          <span style={{ borderRadius: 999, padding: "7px 11px", fontWeight: 1000, fontSize: 12, color: "#0b0f13", background: "#ffb84d" }}>
            Novo módulo
          </span>
        </div>

        {!prodEndpointReady ? (
          <div style={{ marginBottom: 14, borderRadius: 16, border: "1px solid rgba(255,184,77,.35)", background: "rgba(255,159,26,.08)", color: "#ffcf8a", padding: 12, fontWeight: 850 }}>
            Front preparado. Falta ativar no backend os endpoints <b>/api/plant-equipments</b>. Podemos fazer essa parte no próximo passo.
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 260px) minmax(220px, 320px) auto", gap: 12, alignItems: "end", marginBottom: 18 }}>
          <div>
            <label style={label}>TAG</label>
            <input
              style={input}
              value={prodTag}
              onChange={(e) => setProdTag(e.target.value.toUpperCase())}
              placeholder="Ex.: PN-02"
              disabled={saving}
            />
          </div>

          <div>
            <label style={label}>Planta</label>
            <select
              style={input}
              value={prodPlantId}
              onChange={(e) => setProdPlantId(e.target.value ? Number(e.target.value) : "")}
              disabled={saving}
            >
              <option value="">Selecione</option>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={button} onClick={saveProductionEquipment} disabled={saving || !prodEndpointReady}>
              {prodEditingId ? <Save size={16} /> : <Plus size={16} />}
              {prodEditingId ? "Salvar alteração" : "Adicionar TAG"}
            </button>
            {prodEditingId ? (
              <button style={ghostButton} onClick={resetProductionForm} disabled={saving}>
                Cancelar
              </button>
            ) : null}
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 8px" }}>
            <thead>
              <tr style={{ color: "rgba(255,255,255,.55)", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.3 }}>
                <th style={{ textAlign: "left", padding: "0 12px" }}>TAG</th>
                <th style={{ textAlign: "left", padding: "0 12px" }}>Planta</th>
                <th style={{ textAlign: "center", padding: "0 12px" }}>Status</th>
                <th style={{ textAlign: "right", padding: "0 12px" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {prodEquipments.map((e) => (
                <tr key={e.id} style={{ background: "rgba(255,255,255,.04)" }}>
                  <td style={{ padding: 12, borderRadius: "14px 0 0 14px", color: "white", fontWeight: 1000 }}>{e.tag}</td>
                  <td style={{ padding: 12, color: "rgba(255,255,255,.78)", fontWeight: 850 }}>
                    {e.plant_name || plantNameById(e.plant_id)}
                  </td>
                  <td style={{ padding: 12, textAlign: "center" }}>
                    <span style={{ borderRadius: 999, padding: "6px 10px", fontWeight: 950, fontSize: 12, color: e.is_active ? "#0b0f13" : "rgba(255,255,255,.7)", background: e.is_active ? "#ffb84d" : "rgba(255,255,255,.08)" }}>
                      {e.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td style={{ padding: 12, borderRadius: "0 14px 14px 0", textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 8 }}>
                      <button style={ghostButton} onClick={() => startEditProductionEquipment(e)} disabled={saving}>
                        Editar
                      </button>
                      {e.is_active ? (
                        <button style={{ ...ghostButton, color: "#ff6b6b" }} onClick={() => removeProductionEquipment(e)} disabled={saving}>
                          <Trash2 size={15} /> Inativar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!prodEquipments.length ? (
                <tr>
                  <td colSpan={4} style={{ padding: 22, textAlign: "center", color: "rgba(255,255,255,.55)", fontWeight: 850 }}>
                    {loading ? "Carregando..." : prodEndpointReady ? "Nenhum equipamento de produção cadastrado." : "Backend ainda não ativado para este módulo."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {activeProdEquipments.length ? (
          <div style={{ marginTop: 10, color: "rgba(255,255,255,.55)", fontWeight: 850, fontSize: 12 }}>
            {activeProdEquipments.length} TAG(s) ativa(s) disponíveis para puxar na tela Paradas Minutos.
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) 1fr", gap: 16 }}>
        <div style={{ ...card, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: 14, background: "rgba(255,159,26,.14)", color: "#ffb84d", display: "grid", placeItems: "center" }}>
              <Factory size={20} />
            </div>
            <div>
              <div style={{ color: "white", fontWeight: 1000, fontSize: 17 }}>{editingId ? "Editar equipamento do Ritmo" : "Novo equipamento do Ritmo"}</div>
              <div style={{ color: "rgba(255,255,255,.55)", fontWeight: 800, fontSize: 12 }}>Escavadeiras / concha</div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={label}>Equipamento</label>
              <select style={input} value={equipmentType} onChange={(e) => setEquipmentType(e.target.value)}>
                <option value="escavadeira">Escavadeira</option>
                <option value="pa_carregadeira">Pá-carregadeira</option>
                <option value="outro">Outro</option>
              </select>
            </div>

            <div>
              <label style={label}>TAG</label>
              <input style={input} value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} placeholder="Ex.: EH-009" />
            </div>

            <div>
              <label style={label}>Tonelada da concha</label>
              <input style={input} value={bucketTon} onChange={(e) => setBucketTon(e.target.value)} inputMode="decimal" placeholder="Ex.: 42,00" />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
              <button style={button} onClick={saveEquipment} disabled={saving}>
                {editingId ? <Save size={16} /> : <Plus size={16} />}
                {editingId ? "Salvar alteração" : "Adicionar"}
              </button>
              {editingId ? (
                <button style={ghostButton} onClick={resetForm} disabled={saving}>
                  Cancelar
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ ...card, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ color: "white", fontWeight: 1000, fontSize: 18 }}>Alocação por planta para Ritmo</div>
              <div style={{ color: "rgba(255,255,255,.55)", fontWeight: 800, fontSize: 12 }}>Define qual concha o Ritmo deve usar automaticamente</div>
            </div>
            <Link2 size={20} color="#ffb84d" />
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {plants.map((p) => {
              const currentId = allocations[p.id]?.equipment?.id || "";
              const current = allocations[p.id]?.equipment;
              return (
                <div key={p.id} style={{ border: "1px solid rgba(255,255,255,.09)", borderRadius: 18, padding: 14, display: "grid", gridTemplateColumns: "1fr minmax(220px, 360px)", gap: 14, alignItems: "center", background: "rgba(255,255,255,.035)" }}>
                  <div>
                    <div style={{ color: "white", fontWeight: 1000 }}>{p.name}</div>
                    <div style={{ color: "rgba(255,255,255,.55)", fontWeight: 800, fontSize: 12 }}>
                      {current ? `${current.tag} • ${fmtTon(current.bucket_ton)} t/conchada` : "Nenhum equipamento vinculado"}
                    </div>
                  </div>

                  <select style={input} value={currentId} onChange={(e) => setAllocation(p.id, e.target.value)} disabled={saving}>
                    <option value="">Sem alocação</option>
                    {activeEquipments.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.tag} • {fmtTon(e.bucket_ton)} t
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
            {!plants.length ? <div style={{ color: "rgba(255,255,255,.62)", fontWeight: 850 }}>Nenhuma planta encontrada.</div> : null}
          </div>
        </div>
      </div>

      <div style={{ ...card, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ color: "white", fontWeight: 1000, fontSize: 18 }}>Equipamentos do Ritmo cadastrados</div>
            <div style={{ color: "rgba(255,255,255,.55)", fontWeight: 800, fontSize: 12 }}>{equipments.length} equipamento(s)</div>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 8px" }}>
            <thead>
              <tr style={{ color: "rgba(255,255,255,.55)", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.3 }}>
                <th style={{ textAlign: "left", padding: "0 12px" }}>TAG</th>
                <th style={{ textAlign: "left", padding: "0 12px" }}>Equipamento</th>
                <th style={{ textAlign: "right", padding: "0 12px" }}>t/conchada</th>
                <th style={{ textAlign: "center", padding: "0 12px" }}>Status</th>
                <th style={{ textAlign: "right", padding: "0 12px" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {equipments.map((e) => (
                <tr key={e.id} style={{ background: "rgba(255,255,255,.04)" }}>
                  <td style={{ padding: 12, borderRadius: "14px 0 0 14px", color: "white", fontWeight: 1000 }}>{e.tag}</td>
                  <td style={{ padding: 12, color: "rgba(255,255,255,.78)", fontWeight: 850 }}>{e.equipment_type}</td>
                  <td style={{ padding: 12, textAlign: "right", color: "#ffb84d", fontWeight: 1000 }}>{fmtTon(e.bucket_ton)} t</td>
                  <td style={{ padding: 12, textAlign: "center" }}>
                    <span style={{ borderRadius: 999, padding: "6px 10px", fontWeight: 950, fontSize: 12, color: e.is_active ? "#0b0f13" : "rgba(255,255,255,.7)", background: e.is_active ? "#ffb84d" : "rgba(255,255,255,.08)" }}>
                      {e.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td style={{ padding: 12, borderRadius: "0 14px 14px 0", textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 8 }}>
                      <button style={ghostButton} onClick={() => startEdit(e)} disabled={saving}>
                        Editar
                      </button>
                      {e.is_active ? (
                        <button style={{ ...ghostButton, color: "#ff6b6b" }} onClick={() => removeEquipment(e)} disabled={saving}>
                          <Trash2 size={15} /> Inativar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!equipments.length ? (
                <tr>
                  <td colSpan={5} style={{ padding: 22, textAlign: "center", color: "rgba(255,255,255,.55)", fontWeight: 850 }}>
                    {loading ? "Carregando..." : "Nenhum equipamento cadastrado."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
