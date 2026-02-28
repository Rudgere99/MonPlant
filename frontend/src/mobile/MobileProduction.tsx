import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import MobileShell from "./MobileShell";
import { apiGet, apiPut } from "../utils/api";

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
  return v.toLocaleString("pt-BR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function isNotFound(errMsg: string) {
  const s = (errMsg || "").toLowerCase();
  // cobre mensagens comuns vindas do apiGet (texto puro do backend ou "404")
  return s.includes("404") || s.includes("not found") || s.includes("não encontrado") || s.includes("nao encontrado");
}

export default function MobileProduction() {
  const [day, setDay] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [metaDay, setMetaDay] = useState<number>(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [emptyHint, setEmptyHint] = useState<string | null>(null);

  const totalDay = useMemo(
    () => rows.reduce((a, r) => a + (Number(r.value) || 0), 0),
    [rows]
  );
  const pct = useMemo(
    () => (metaDay > 0 ? Math.min(100, (totalDay / metaDay) * 100) : 0),
    [metaDay, totalDay]
  );

  async function load() {
    setLoading(true);
    setErr(null);
    setEmptyHint(null);
    try {
      const data = await apiGet<any>(`/api/plant-production/${encodeURIComponent(day)}`);
      const r = (data?.rows || []) as any[];

      // Compat: meta pode vir com nomes diferentes dependendo do backend/versões
      const meta =
        Number(data?.meta_day ?? data?.metaDia ?? data?.meta_ton ?? data?.metaTon ?? data?.meta ?? 0) || 0;

      setMetaDay(meta);
      setRows(
        r
          .filter((x) => x?.label)
          .map((x) => ({ label: String(x.label), value: Number(x.value) || 0 }))
      );

      // Se vier sem linhas, mostra dica em vez de "tela vazia" silenciosa
      if (!r?.length) setEmptyHint("Sem dados salvos para esta data. Você pode preencher e clicar em Salvar.");
      setLoading(false);
    } catch (e: any) {
      const msg = e?.message || "Falha ao carregar";

      // Se for 404: trata como dia sem cadastro (igual ao desktop costuma fazer)
      if (isNotFound(msg)) {
        setMetaDay(0);
        setRows([]);
        setEmptyHint("Sem dados salvos para esta data. Você pode preencher e clicar em Salvar.");
        setLoading(false);
        return;
      }

      setLoading(false);
      setErr(msg);
    }
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        day,
        meta_day: Number(metaDay) || 0,
        rows: rows.map((r) => ({
          label: r.label,
          value: Number(r.value) || 0,
        })),
      };

      await apiPut(`/api/plant-production/${encodeURIComponent(day)}`, payload);
      setSaving(false);
      setEmptyHint("Salvo! ✅");
      // Recarrega pra garantir que está sincronizado com o backend
      await load();
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
    <MobileShell title="Produção" active="production">
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

          <div style={{ display: "flex", gap: 10, width: "100%" }}>
            <button className="mp-btn" onClick={load} disabled={loading || saving} style={{ flex: 1 }} type="button">
              <RefreshCw size={16} /> Atualizar
            </button>
            <button className="mp-btn primary" onClick={save} disabled={loading || saving} style={{ flex: 1 }} type="button">
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

        {!err && emptyHint ? (
          <div className="mp-muted" style={{ marginTop: 10, color: "rgba(226,232,240,0.70)" }}>
            {emptyHint}
          </div>
        ) : null}
      </div>

      <div className="mp-card" style={{ borderRadius: 18, marginTop: 12 }}>
        <div className="mp-card-h mp-card-h-mobile">
          <div style={{ fontWeight: 900 }}>Produção por hora</div>
          <div className="mp-muted mp-small">{loading ? "Carregando..." : `${rows.length} linhas`}</div>
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

          {!loading && rows.length === 0 ? <div className="mp-muted">Sem linhas para esta data.</div> : null}
        </div>
      </div>
    </MobileShell>
  );
}
