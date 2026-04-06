import React, { useEffect, useMemo, useState } from "react";
import { Settings, Factory, Plus, RefreshCw, Hash, BadgeCheck } from "lucide-react";

type Plant = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
};

const API = String((import.meta as any)?.env?.VITE_API_BASE || "").replace(/\/+$/, "");

function authHeaders(): HeadersInit {
  const t = (localStorage.getItem("mp_token") || localStorage.getItem("token") || "").trim();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const card: React.CSSProperties = {
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(14,18,22,0.78)",
  boxShadow: "0 30px 60px rgba(0,0,0,0.55)",
  backdropFilter: "blur(14px)",
};

const input: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.92)",
  padding: "0 14px",
  outline: "none",
  fontWeight: 900,
};

const label: React.CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontWeight: 900,
  fontSize: 12,
  marginBottom: 8,
  textTransform: "uppercase",
  letterSpacing: 0.2,
};

const btnBase: React.CSSProperties = {
  height: 44,
  borderRadius: 14,
  padding: "0 14px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  fontWeight: 950,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

function StatusPill({ active }: { active?: boolean }) {
  return (
    <span
      style={{
        height: 30,
        padding: "0 12px",
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        fontWeight: 900,
        fontSize: 12,
        border: active
          ? "1px solid rgba(34,197,94,0.26)"
          : "1px solid rgba(148,163,184,0.20)",
        background: active
          ? "rgba(34,197,94,0.12)"
          : "rgba(148,163,184,0.10)",
        color: active ? "rgba(34,197,94,0.95)" : "rgba(255,255,255,0.72)",
      }}
    >
      <BadgeCheck size={14} />
      {active ? "Ativa" : "Inativa"}
    </span>
  );
}

export default function Configuracoes() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function loadPlants() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`${API}/api/plants`, { headers: { ...authHeaders() } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setPlants(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar plantas.");
      setPlants([]);
    } finally {
      setBusy(false);
    }
  }

  async function createPlant() {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const payload = {
        name: name.trim(),
        code: code.trim(),
        description: description.trim() || null,
      };

      if (!payload.name || !payload.code) {
        throw new Error("Preencha nome e código da planta.");
      }

      const r = await fetch(`${API}/api/plants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `HTTP ${r.status}`);
      }

      setName("");
      setCode("");
      setDescription("");
      setMsg("Planta adicionada com sucesso.");
      await loadPlants();
    } catch (e: any) {
      setErr(e?.message || "Falha ao adicionar planta.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadPlants();
  }, []);

  const activeCount = useMemo(
    () => plants.filter((p) => Boolean(p.is_active)).length,
    [plants]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ ...card, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "rgba(255,255,255,0.58)", fontWeight: 850, fontSize: 12 }}>
              Administração • Sistema
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                <Settings size={18} />
              </div>
              <div style={{ fontSize: 28, fontWeight: 980, color: "rgba(255,255,255,0.94)", letterSpacing: -0.4 }}>
                Configurações
              </div>
            </div>
            <div style={{ color: "rgba(255,255,255,0.68)", fontWeight: 800, marginTop: 6 }}>
              Cadastro e gestão das plantas do MonPlant.
            </div>
          </div>

          <button
            onClick={loadPlants}
            disabled={busy}
            style={{
              ...btnBase,
              opacity: busy ? 0.7 : 1,
            }}
          >
            <RefreshCw size={16} />
            {busy ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
          gap: 14,
        }}
      >
        <div style={{ ...card, padding: 16, gridColumn: "span 4" }}>
          <div style={{ ...label, marginBottom: 4 }}>Plantas cadastradas</div>
          <div style={{ fontSize: 34, fontWeight: 980, color: "rgba(255,255,255,0.94)" }}>
            {plants.length}
          </div>
        </div>

        <div style={{ ...card, padding: 16, gridColumn: "span 4" }}>
          <div style={{ ...label, marginBottom: 4 }}>Plantas ativas</div>
          <div style={{ fontSize: 34, fontWeight: 980, color: "rgba(34,197,94,0.95)" }}>
            {activeCount}
          </div>
        </div>

        <div style={{ ...card, padding: 16, gridColumn: "span 4" }}>
          <div style={{ ...label, marginBottom: 4 }}>Status do módulo</div>
          <div style={{ fontSize: 18, fontWeight: 950, color: "rgba(255,255,255,0.92)", marginTop: 8 }}>
            Cadastro operacional
          </div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontWeight: 800, marginTop: 4 }}>
            Base pronta para multi-planta.
          </div>
        </div>
      </div>

      {/* Form + list */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)",
          gap: 14,
        }}
      >
        {/* Form */}
        <div style={{ ...card, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 14,
                display: "grid",
                placeItems: "center",
                background: "rgba(255,159,26,0.10)",
                border: "1px solid rgba(255,159,26,0.18)",
                color: "rgba(255,255,255,0.92)",
              }}
            >
              <Plus size={18} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 960, color: "rgba(255,255,255,0.94)" }}>
                Cadastro de Plantas
              </div>
              <div style={{ color: "rgba(255,255,255,0.58)", fontWeight: 800, fontSize: 12 }}>
                Crie novas plantas para uso no sistema
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            <div>
              <div style={label}>Nome da planta</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Planta 1"
                style={input}
              />
            </div>

            <div>
              <div style={label}>Código</div>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex: P01"
                style={input}
              />
            </div>

            <div>
              <div style={label}>Descrição</div>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcional"
                style={input}
              />
            </div>

            <button
              onClick={createPlant}
              disabled={saving}
              style={{
                ...btnBase,
                background: "linear-gradient(180deg, rgba(255,159,26,0.22), rgba(255,159,26,0.10))",
                border: "1px solid rgba(255,159,26,0.25)",
                marginTop: 4,
              }}
            >
              <Plus size={16} />
              {saving ? "Adicionando..." : "Adicionar planta"}
            </button>

            {msg ? (
              <div
                style={{
                  borderRadius: 14,
                  padding: 12,
                  background: "rgba(34,197,94,0.10)",
                  border: "1px solid rgba(34,197,94,0.20)",
                  color: "rgba(255,255,255,0.88)",
                  fontWeight: 850,
                }}
              >
                {msg}
              </div>
            ) : null}

            {err ? (
              <div
                style={{
                  borderRadius: 14,
                  padding: 12,
                  background: "rgba(239,68,68,0.10)",
                  border: "1px solid rgba(239,68,68,0.20)",
                  color: "rgba(255,255,255,0.88)",
                  fontWeight: 850,
                }}
              >
                {err}
              </div>
            ) : null}
          </div>
        </div>

        {/* Table */}
        <div style={{ ...card, padding: 16, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 960, color: "rgba(255,255,255,0.94)" }}>
                Plantas cadastradas
              </div>
              <div style={{ color: "rgba(255,255,255,0.58)", fontWeight: 800, fontSize: 12 }}>
                Estrutura base do ambiente multi-planta
              </div>
            </div>

            <div
              style={{
                height: 34,
                padding: "0 12px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.05)",
                display: "inline-flex",
                alignItems: "center",
                color: "rgba(255,255,255,0.84)",
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              {plants.length} registro{plants.length === 1 ? "" : "s"}
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.08)",
              overflow: "hidden",
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "90px 140px minmax(220px, 1fr) 150px",
                gap: 0,
                background: "rgba(255,255,255,0.05)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {["ID", "Código", "Nome", "Status"].map((h) => (
                <div
                  key={h}
                  style={{
                    padding: "14px 16px",
                    color: "rgba(255,255,255,0.74)",
                    fontWeight: 950,
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: 0.2,
                  }}
                >
                  {h}
                </div>
              ))}
            </div>

            {plants.length === 0 ? (
              <div
                style={{
                  padding: 28,
                  display: "grid",
                  placeItems: "center",
                  color: "rgba(255,255,255,0.62)",
                  fontWeight: 850,
                  background: "rgba(0,0,0,0.16)",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <Factory size={24} style={{ marginBottom: 10, opacity: 0.75 }} />
                  <div>Nenhuma planta cadastrada.</div>
                </div>
              </div>
            ) : (
              plants.map((p, idx) => (
                <div
                  key={p.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px 140px minmax(220px, 1fr) 150px",
                    borderTop: idx === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                    background: idx % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.14)",
                  }}
                >
                  <div style={{ padding: "14px 16px", color: "rgba(255,255,255,0.92)", fontWeight: 950 }}>
                    {p.id}
                  </div>
                  <div style={{ padding: "14px 16px", color: "rgba(255,255,255,0.84)", fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }}>
                    <Hash size={14} />
                    {p.code}
                  </div>
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 950 }}>
                      {p.name}
                    </div>
                    {p.description ? (
                      <div style={{ color: "rgba(255,255,255,0.52)", fontWeight: 800, fontSize: 12, marginTop: 3 }}>
                        {p.description}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ padding: "14px 16px" }}>
                    <StatusPill active={Boolean(p.is_active)} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .cfg-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
