import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

function isoTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dayLabel(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}`;
}

function fmtBR0(n: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}

function safeNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

function authHeaders(): HeadersInit {
  const keys = ["mp_token", "token", "access_token", "auth_token"];
  for (const k of keys) {
    const v = (localStorage.getItem(k) || "").trim();
    if (v) return { Authorization: `Bearer ${v}` };
  }
  return {};
}

type Last7Item = { day: string; total_ton: number };

export default function Last7DaysView() {
  const today = isoTodayLocal();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Last7Item[]>([]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`${API_BASE}/api/plant-production/last7days`, {
        headers: authHeaders(),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `HTTP ${r.status}`);
      }
      const data = (await r.json()) as Last7Item[];
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar últimos 7 dias");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = useMemo(() => {
    return rows.map((x) => ({
      dia: dayLabel(x.day),
      total: safeNumber(x.total_ton),
    }));
  }, [rows]);

  return (
    <div className="mp-container">
      <div className="mp-page-title">Últimos 7 dias</div>
      <div className="mp-page-sub">Produção acumulada diária • Hoje: {today.split("-").reverse().join("/")}</div>

      <div className="mp-card" style={{ marginTop: 14 }}>
        <div className="mp-card-h" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <b>Totais por dia</b>
            <div className="mp-help">
              {loading ? "Carregando..." : err ? `Erro: ${err}` : `Dias: ${rows.length}`}
            </div>
          </div>

          <button className="mp-btn" onClick={load} disabled={loading} style={{ minWidth: 140 }}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        <div className="mp-card-b" style={{ height: 420 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 18, right: 18, bottom: 18, left: 6 }}>
              <CartesianGrid stroke="rgba(255,255,255,.08)" strokeDasharray="3 3" />
              <XAxis dataKey="dia" />
              <YAxis />
              <Tooltip formatter={(v: any) => fmtBR0(safeNumber(v))} />
              <Bar dataKey="total" fill="#22c55e" radius={[8, 8, 0, 0]} name="Total (t)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
