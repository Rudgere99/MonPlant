import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Edit3, Plus, RefreshCw, Search, Trash2, Users } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

type Plant = {
  id: number;
  code?: string;
  name?: string;
  description?: string | null;
  is_active?: boolean;
};

type SupervisorPlanta = {
  id: number;
  owner_id?: string;
  nome_completo: string;
  empresa: string;
  plant_id: number;
  planta_id?: number;
  letra_turno: "A" | "B" | "C" | "D";
  ativo: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type FormState = {
  nome_completo: string;
  empresa: string;
  plant_id: number;
  letra_turno: "A" | "B" | "C" | "D";
  ativo: boolean;
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";
const letras: Array<"A" | "B" | "C" | "D"> = ["A", "B", "C", "D"];

const fallbackPlants: Plant[] = [
  { id: 1, code: "PLANTA_01", name: "Planta 01", is_active: true },
  { id: 2, code: "PLANTA_02", name: "Planta 02", is_active: true },
];

function emptyForm(defaultPlant = 1): FormState {
  return {
    nome_completo: "",
    empresa: "Trindade",
    plant_id: defaultPlant,
    letra_turno: "A",
    ativo: true,
  };
}

function plantLabel(plants: Plant[], plantId: number) {
  const p = plants.find((item) => Number(item.id) === Number(plantId));
  return p?.name || p?.code || `Planta ${String(plantId).padStart(2, "0")}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

export default function SupervisoresPlanta() {
  const { token } = useAuth() as any;
  const [plants, setPlants] = useState<Plant[]>(fallbackPlants);
  const [items, setItems] = useState<SupervisorPlanta[]>([]);
  const [form, setForm] = useState<FormState>(() => emptyForm(1));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [plantFilter, setPlantFilter] = useState<number | "all">("all");
  const [letterFilter, setLetterFilter] = useState<"all" | "A" | "B" | "C" | "D">("all");
  const [showInactive, setShowInactive] = useState(false);

  const headers = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const loadPlants = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/plants`, { headers });
      if (!r.ok) return;
      const data = await r.json();
      const rows = Array.isArray(data) && data.length ? data : fallbackPlants;
      setPlants(rows);
      setForm((prev) => ({ ...prev, plant_id: prev.plant_id || Number(rows[0]?.id || 1) }));
    } catch {
      setPlants(fallbackPlants);
    }
  }, [headers]);

  const loadSupervisores = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (plantFilter !== "all") params.set("plant_id", String(plantFilter));
      if (letterFilter !== "all") params.set("letra_turno", letterFilter);
      if (!showInactive) params.set("somente_ativos", "true");

      const url = `${API_BASE}/api/supervisores-planta${params.toString() ? `?${params.toString()}` : ""}`;
      const r = await fetch(url, { headers });
      const data = await r.json().catch(() => null);

      if (!r.ok) {
        throw new Error(data?.detail || `Erro ao carregar supervisores (${r.status})`);
      }

      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar supervisores.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [headers, plantFilter, letterFilter, showInactive]);

  useEffect(() => {
    loadPlants();
  }, [loadPlants]);

  useEffect(() => {
    loadSupervisores();
  }, [loadSupervisores]);

  const filteredItems = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => {
      const haystack = [
        item.nome_completo,
        item.empresa,
        item.letra_turno,
        plantLabel(plants, item.plant_id || item.planta_id || 0),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [items, plants, q]);

  const resumo = useMemo(() => {
    const ativos = items.filter((i) => i.ativo).length;
    const inativos = items.filter((i) => !i.ativo).length;
    const porLetra = letras.reduce<Record<string, number>>((acc, letra) => {
      acc[letra] = items.filter((i) => i.ativo && i.letra_turno === letra).length;
      return acc;
    }, {});
    return { ativos, inativos, porLetra };
  }, [items]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm(Number(plants[0]?.id || 1)));
    setError(null);
    setSuccess(null);
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload = {
      nome_completo: form.nome_completo.trim(),
      empresa: form.empresa.trim(),
      plant_id: Number(form.plant_id),
      letra_turno: form.letra_turno,
      ativo: Boolean(form.ativo),
    };

    if (!payload.nome_completo) {
      setSaving(false);
      setError("Informe o nome completo do supervisor.");
      return;
    }

    if (!payload.empresa) {
      setSaving(false);
      setError("Informe a empresa.");
      return;
    }

    try {
      const url = editingId
        ? `${API_BASE}/api/supervisores-planta/${editingId}`
        : `${API_BASE}/api/supervisores-planta`;

      const r = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const data = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(data?.detail || `Erro ao salvar supervisor (${r.status})`);
      }

      const message = editingId ? "Supervisor atualizado com sucesso." : "Supervisor cadastrado com sucesso.";
      resetForm();
      setSuccess(message);
      await loadSupervisores();
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar supervisor.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: SupervisorPlanta) => {
    setEditingId(item.id);
    setForm({
      nome_completo: item.nome_completo || "",
      empresa: item.empresa || "Trindade",
      plant_id: Number(item.plant_id || item.planta_id || 1),
      letra_turno: item.letra_turno || "A",
      ativo: Boolean(item.ativo),
    });
    setSuccess(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const inativar = async (item: SupervisorPlanta) => {
    const ok = window.confirm(`Inativar o supervisor ${item.nome_completo}?`);
    if (!ok) return;

    setError(null);
    setSuccess(null);
    try {
      const r = await fetch(`${API_BASE}/api/supervisores-planta/${item.id}`, {
        method: "DELETE",
        headers,
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(data?.detail || `Erro ao inativar supervisor (${r.status})`);
      }
      setSuccess("Supervisor inativado com sucesso.");
      await loadSupervisores();
    } catch (e: any) {
      setError(e?.message || "Erro ao inativar supervisor.");
    }
  };

  return (
    <div style={{ minHeight: "100%", padding: 18, color: "white" }}>
      <div style={{ display: "grid", gap: 16 }}>
        <section
          style={{
            borderRadius: 24,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "linear-gradient(180deg, rgba(17,24,39,0.84), rgba(5,8,12,0.92))",
            boxShadow: "0 24px 70px rgba(0,0,0,0.42)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "20px 22px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 18,
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(255,159,26,0.12)",
                  border: "1px solid rgba(255,159,26,0.24)",
                  color: "#FFB547",
                }}
              >
                <Users size={23} />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 24, letterSpacing: -0.6 }}>Cadastro de Supervisores da Planta</h1>
                <p style={{ margin: "5px 0 0", color: "rgba(255,255,255,0.58)", fontWeight: 700 }}>
                  Base para vincular supervisor, empresa, planta de operação e letra do turno.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={loadSupervisores}
              style={{
                height: 40,
                borderRadius: 13,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                fontWeight: 900,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "0 14px",
                cursor: "pointer",
              }}
            >
              <RefreshCw size={16} /> Atualizar
            </button>
          </div>

          <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
            <Metric title="Supervisores ativos" value={resumo.ativos} />
            <Metric title="Inativos" value={resumo.inativos} muted />
            <Metric title="Letra A / B" value={`${resumo.porLetra.A || 0} / ${resumo.porLetra.B || 0}`} />
            <Metric title="Letra C / D" value={`${resumo.porLetra.C || 0} / ${resumo.porLetra.D || 0}`} />
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(320px, 430px) minmax(0, 1fr)", gap: 16 }}>
          <form
            onSubmit={submit}
            style={{
              borderRadius: 22,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(10,14,20,0.82)",
              padding: 18,
              display: "grid",
              gap: 13,
              alignSelf: "start",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>{editingId ? "Editar cadastro" : "Novo cadastro"}</h2>
                <p style={{ margin: "4px 0 0", color: "rgba(255,255,255,0.48)", fontSize: 13, fontWeight: 700 }}>
                  Preencha os dados operacionais do supervisor.
                </p>
              </div>
              {editingId ? (
                <button type="button" onClick={resetForm} style={smallGhostButton}>
                  Novo
                </button>
              ) : null}
            </div>

            <Field label="Nome Completo">
              <input
                value={form.nome_completo}
                onChange={(e) => setForm((p) => ({ ...p, nome_completo: e.target.value }))}
                placeholder="Ex.: João Silva"
                style={inputStyle}
              />
            </Field>

            <Field label="Empresa">
              <input
                value={form.empresa}
                onChange={(e) => setForm((p) => ({ ...p, empresa: e.target.value }))}
                placeholder="Ex.: Trindade"
                style={inputStyle}
              />
            </Field>

            <Field label="Planta de operação">
              <select
                value={form.plant_id}
                onChange={(e) => setForm((p) => ({ ...p, plant_id: Number(e.target.value) }))}
                style={inputStyle}
              >
                {plants.map((plant) => (
                  <option key={plant.id} value={plant.id}>
                    {plant.name || plant.code || `Planta ${plant.id}`}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Letra do turno">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {letras.map((letra) => (
                  <button
                    type="button"
                    key={letra}
                    onClick={() => setForm((p) => ({ ...p, letra_turno: letra }))}
                    style={{
                      height: 42,
                      borderRadius: 14,
                      border: `1px solid ${form.letra_turno === letra ? "rgba(255,159,26,0.45)" : "rgba(255,255,255,0.12)"}`,
                      background: form.letra_turno === letra ? "rgba(255,159,26,0.16)" : "rgba(255,255,255,0.05)",
                      color: form.letra_turno === letra ? "#FFB547" : "rgba(255,255,255,0.82)",
                      fontWeight: 950,
                      cursor: "pointer",
                    }}
                  >
                    {letra}
                  </button>
                ))}
              </div>
            </Field>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "11px 12px",
                borderRadius: 15,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm((p) => ({ ...p, ativo: e.target.checked }))}
              />
              <span style={{ fontWeight: 850 }}>Cadastro ativo</span>
            </label>

            {error ? <Alert tone="error" text={error} /> : null}
            {success ? <Alert tone="success" text={success} /> : null}

            <button
              type="submit"
              disabled={saving}
              style={{
                height: 46,
                borderRadius: 15,
                border: "1px solid rgba(255,159,26,0.30)",
                background: "linear-gradient(180deg, rgba(255,159,26,0.95), rgba(231,126,22,0.92))",
                color: "#111827",
                fontWeight: 950,
                cursor: saving ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: saving ? 0.7 : 1,
              }}
            >
              {editingId ? <CheckCircle2 size={18} /> : <Plus size={18} />}
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar supervisor"}
            </button>
          </form>

          <div
            style={{
              borderRadius: 22,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(10,14,20,0.82)",
              overflow: "hidden",
              minWidth: 0,
            }}
          >
            <div
              style={{
                padding: 16,
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                display: "grid",
                gridTemplateColumns: "minmax(220px, 1fr) 160px 130px 150px",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div style={{ position: "relative" }}>
                <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: "rgba(255,255,255,0.44)" }} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Pesquisar supervisor..."
                  style={{ ...inputStyle, paddingLeft: 36 }}
                />
              </div>

              <select
                value={plantFilter}
                onChange={(e) => setPlantFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                style={inputStyle}
              >
                <option value="all">Todas as plantas</option>
                {plants.map((plant) => (
                  <option key={plant.id} value={plant.id}>
                    {plant.name || plant.code || `Planta ${plant.id}`}
                  </option>
                ))}
              </select>

              <select value={letterFilter} onChange={(e) => setLetterFilter(e.target.value as any)} style={inputStyle}>
                <option value="all">Todas letras</option>
                {letras.map((letra) => (
                  <option key={letra} value={letra}>
                    Letra {letra}
                  </option>
                ))}
              </select>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 850 }}>
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                Mostrar inativos
              </label>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                    <Th>Supervisor</Th>
                    <Th>Empresa</Th>
                    <Th>Planta</Th>
                    <Th>Letra</Th>
                    <Th>Status</Th>
                    <Th>Atualizado em</Th>
                    <Th align="right">Ações</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} style={emptyCellStyle}>Carregando supervisores...</td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={emptyCellStyle}>Nenhum supervisor encontrado.</td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr key={item.id} style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                        <Td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                              style={{
                                height: 34,
                                width: 34,
                                borderRadius: 13,
                                display: "grid",
                                placeItems: "center",
                                background: "rgba(59,130,246,0.10)",
                                border: "1px solid rgba(59,130,246,0.20)",
                              }}
                            >
                              <Users size={16} />
                            </div>
                            <strong>{item.nome_completo}</strong>
                          </div>
                        </Td>
                        <Td>{item.empresa}</Td>
                        <Td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                            <Building2 size={15} /> {plantLabel(plants, Number(item.plant_id || item.planta_id || 0))}
                          </span>
                        </Td>
                        <Td>
                          <span style={letterBadge}>{item.letra_turno}</span>
                        </Td>
                        <Td>
                          <span style={item.ativo ? statusActive : statusInactive}>{item.ativo ? "Ativo" : "Inativo"}</span>
                        </Td>
                        <Td>{formatDateTime(item.updated_at || item.created_at)}</Td>
                        <Td align="right">
                          <div style={{ display: "inline-flex", gap: 8 }}>
                            <button type="button" onClick={() => startEdit(item)} style={iconButton} title="Editar">
                              <Edit3 size={16} />
                            </button>
                            <button type="button" onClick={() => inativar(item)} style={dangerIconButton} title="Inativar">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ title, value, muted }: { title: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.09)",
        background: muted ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.055)",
        padding: 14,
      }}
    >
      <div style={{ color: "rgba(255,255,255,0.48)", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.6 }}>
        {title}
      </div>
      <div style={{ marginTop: 6, fontSize: 24, fontWeight: 950, color: muted ? "rgba(255,255,255,0.62)" : "#FFB547" }}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 7 }}>
      <span style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.72)" }}>{label}</span>
      {children}
    </label>
  );
}

function Alert({ tone, text }: { tone: "success" | "error"; text: string }) {
  const good = tone === "success";
  return (
    <div
      style={{
        borderRadius: 14,
        border: `1px solid ${good ? "rgba(34,197,94,0.24)" : "rgba(239,68,68,0.24)"}`,
        background: good ? "rgba(34,197,94,0.09)" : "rgba(239,68,68,0.09)",
        color: good ? "#86efac" : "#fca5a5",
        padding: "10px 12px",
        fontSize: 13,
        fontWeight: 800,
      }}
    >
      {text}
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th style={{ textAlign: align, padding: "12px 14px", color: "rgba(255,255,255,0.50)", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.7 }}>
      {children}
    </th>
  );
}

function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <td style={{ textAlign: align, padding: "13px 14px", color: "rgba(255,255,255,0.82)", fontSize: 14 }}>{children}</td>;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.11)",
  background: "rgba(255,255,255,0.055)",
  color: "white",
  padding: "0 12px",
  outline: "none",
  fontWeight: 800,
  boxSizing: "border-box",
};

const smallGhostButton: React.CSSProperties = {
  height: 34,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)",
  color: "white",
  fontWeight: 900,
  padding: "0 12px",
  cursor: "pointer",
};

const iconButton: React.CSSProperties = {
  height: 34,
  width: 34,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.055)",
  color: "white",
  display: "inline-grid",
  placeItems: "center",
  cursor: "pointer",
};

const dangerIconButton: React.CSSProperties = {
  ...iconButton,
  border: "1px solid rgba(239,68,68,0.22)",
  background: "rgba(239,68,68,0.09)",
  color: "#fca5a5",
};

const letterBadge: React.CSSProperties = {
  display: "inline-grid",
  placeItems: "center",
  height: 30,
  minWidth: 34,
  borderRadius: 12,
  background: "rgba(255,159,26,0.13)",
  border: "1px solid rgba(255,159,26,0.26)",
  color: "#FFB547",
  fontWeight: 950,
};

const statusActive: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "6px 10px",
  background: "rgba(34,197,94,0.10)",
  color: "#86efac",
  border: "1px solid rgba(34,197,94,0.22)",
  fontSize: 12,
  fontWeight: 950,
};

const statusInactive: React.CSSProperties = {
  ...statusActive,
  background: "rgba(148,163,184,0.08)",
  color: "rgba(255,255,255,0.48)",
  border: "1px solid rgba(148,163,184,0.16)",
};

const emptyCellStyle: React.CSSProperties = {
  padding: 28,
  textAlign: "center",
  color: "rgba(255,255,255,0.48)",
  fontWeight: 850,
};
