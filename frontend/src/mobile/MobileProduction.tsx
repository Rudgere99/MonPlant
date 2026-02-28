
import { useEffect, useMemo, useState } from "react";
import MobileShell from "./MobileShell";
import { useAuth } from "../auth/AuthProvider";
import { apiGet, apiPut } from "../lib/api"; // se você não tiver apiPut, eu deixei alternativa logo abaixo
import { Save, RefreshCw } from "lucide-react";

type Row = { label: string; value: number };

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmt(v: number, digits = 0) {
  if (!Number.isFinite(v)) return "-";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export default function MobileProduction() {
  const { token } = useAuth();

  const [day, setDay] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [metaDay, setMetaDay] = useState<number>(0);
  const [rows, setRows] = useState<Row[]>([]);
  const totalDay = useMemo(() => rows.reduce((a, r) => a + (Number(r.value) || 0), 0), [rows]);
  const pct = useMemo(() => (metaDay > 0 ? Math.min(100, (totalDay / metaDay) * 100) : 0), [metaDay, totalDay]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiGet(token, `/api/plant-production/${day}`);
      const r = (data?.rows || []) as any[];
      setMetaDay(Number(data?.meta_day || data?.metaDia || 0));
      setRows(
        r
          .filter((x) => x?.label)
          .map((x) => ({ label: String(x.label), value: Number(x.value) || 0 }))
      );
      setLoading(false);
    } catch (e: any) {
      setLoading(false);
      setErr(e?.message || "Falha ao carregar");
    }
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      // payload padrão (ajusta se seu backend usar outro formato)
      const payload = {
        day,
        meta_day: metaDay,
        rows: rows.map((r) => ({ label: r.label, value: Number(r.value) || 0 })),
      };
      await apiPut(token, `/api/plant-production/${day}`, payload);
      setSaving(false);
    } catch (e: any) {
      setSaving(false);
      setErr(e?.message || "Falha ao salvar");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  return (
    <MobileShell title="Produção">
      {/* Cabeçalho compacto */}
      <div className="mp-card" style={{ borderRadius: 18 }}>
        <div className="mp-card-h mp-card-h-mobile">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label className="mp-small mp-muted">Data</label>
            <input
              className="mp-input"
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              style={{ height: 42 }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label className="mp-small mp-muted">Meta do dia</label>
            <input
              className="mp-input"
              inputMode="decimal"
              value={metaDay}
              onChange={(e) => setMetaDay(Number(String(e.target.value).replace(",", ".")) || 0)}
              style={{ height: 42, width: 140 }}
            />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button className="mp-btn" onClick={load} disabled={loading || saving}>
              <RefreshCw size={16} /> Atualizar
            </button>
            <button className="mp-btn primary" onClick={save} disabled={loading || saving}>
              <Save size={16} /> {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="mp-card" style={{ borderRadius: 16 }}>
            <div className="mp-muted mp-small">Produzido</div>
            <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>{fmt(totalDay, 0)} t</div>
          </div>
          <div className="mp-card" style={{ borderRadius: 16 }}>
            <div className="mp-muted mp-small">% Atingimento</div>
            <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>{fmt(pct, 0)}%</div>
          </div>
        </div>

        {err ? (
          <div className="mp-muted" style={{ marginTop: 10, color: "rgba(248,113,113,0.95)" }}>
            {err}
          </div>
        ) : null}
      </div>

      {/* Lista de horas (edição rápida) */}
      <div className="mp-card" style={{ borderRadius: 18, marginTop: 12 }}>
        <div className="mp-card-h mp-card-h-mobile">
          <div style={{ fontWeight: 900 }}>Produção por hora</div>
          <div className="mp-muted mp-small">
            {loading ? "Carregando..." : `${rows.length} linhas`}
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {rows.map((r, idx) => (
            <div
              key={r.label}
              className="mp-card"
              style={{
                borderRadius: 16,
                padding: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 800 }}>{r.label}</div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  className="mp-input"
                  inputMode="decimal"
                  value={r.value}
                  onChange={(e) => {
                    const v = Number(String(e.target.value).replace(",", ".")) || 0;
                    setRows((prev) => {
                      const copy = [...prev];
                      copy[idx] = { ...copy[idx], value: v };
                      return copy;
                    });
                  }}
                  style={{ height: 42, width: 140, textAlign: "right" }}
                />
                <span className="mp-muted mp-small">t</span>
              </div>
            </div>
          ))}

          {!loading && rows.length === 0 ? (
            <div className="mp-muted">Sem linhas para esta data.</div>
          ) : null}
        </div>
      </div>
    </MobileShell>
  );
}
