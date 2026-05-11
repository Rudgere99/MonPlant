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

export default function Equipamentos() {
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [plants, setPlants] = useState<PlantInfo[]>([]);
  const [allocations, setAllocations] = useState<Record<number, AllocationPayload>>({});
  const [tag, setTag] = useState("");
  const [bucketTon, setBucketTon] = useState("");
  const [equipmentType, setEquipmentType] = useState("escavadeira");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const activeEquipments = useMemo(() => equipments.filter((e) => e.is_active), [equipments]);

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
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar equipamentos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function resetForm() {
    setEditingId(null);
    setTag("");
    setBucketTon("");
    setEquipmentType("escavadeira");
  }

  function startEdit(e: Equipment) {
    setEditingId(e.id);
    setTag(e.tag);
    setBucketTon(fmtTon(e.bucket_ton));
    setEquipmentType(e.equipment_type || "escavadeira");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveEquipment() {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const payload = {
        equipment_type: equipmentType || "escavadeira",
        tag: tag.trim().toUpperCase(),
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
          <h1 style={{ margin: "6px 0 0", color: "white", fontSize: 28, letterSpacing: -0.6 }}>Equipamentos e Alocação</h1>
          <div style={{ marginTop: 8, color: "rgba(255,255,255,.62)", fontWeight: 750, maxWidth: 880 }}>
            Cadastre as escavadeiras, mantenha a tonelada da concha atualizada e vincule o equipamento à planta. A página Ritmo passa a buscar este valor automaticamente.
          </div>
        </div>

        <button style={ghostButton} onClick={loadAll} disabled={loading || saving}>
          <RefreshCcw size={16} /> Atualizar
        </button>
      </div>

      {error ? <div style={{ ...card, padding: 14, color: "#ff6b6b", fontWeight: 950 }}>{error}</div> : null}
      {ok ? <div style={{ ...card, padding: 14, color: "#ffb84d", fontWeight: 950 }}>{ok}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) 1fr", gap: 16 }}>
        <div style={{ ...card, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: 14, background: "rgba(255,159,26,.14)", color: "#ffb84d", display: "grid", placeItems: "center" }}>
              <Factory size={20} />
            </div>
            <div>
              <div style={{ color: "white", fontWeight: 1000, fontSize: 17 }}>{editingId ? "Editar equipamento" : "Novo equipamento"}</div>
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
              <div style={{ color: "white", fontWeight: 1000, fontSize: 18 }}>Alocação por planta</div>
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
            <div style={{ color: "white", fontWeight: 1000, fontSize: 18 }}>Equipamentos cadastrados</div>
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
