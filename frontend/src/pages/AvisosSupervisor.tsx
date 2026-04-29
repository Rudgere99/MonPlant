import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCircle2, Clock3, RefreshCw, AlertTriangle } from "lucide-react";

// Página nova: SOMENTE exibe e confirma lembretes.
// Toda regra de criação/cálculo fica no backend.

type ReminderType = "producao_horaria" | "impacto_aleatorio";
type ReminderStatus = "pendente" | "confirmado";

type ReminderItem = {
  id: number | string;
  type: ReminderType;
  title: string;
  message: string;
  scheduled_for: string;
  created_at: string;
  status: ReminderStatus;
  confirmed_at?: string | null;
  confirmed_by?: string | null;
};

type ApiResponse = {
  unread: boolean;
  pending_count: number;
  items: ReminderItem[];
};

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  (import.meta as any).env?.VITE_API_URL ||
  "https://monplant-production.up.railway.app/api";

const NOTIFICATION_KEY = "monplant:avisos_unread";
const NOTIFICATION_EVENT = "monplant:avisos-notification-change";

function getToken() {
  return localStorage.getItem("token") || localStorage.getItem("monplant_token") || "";
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function setUnreadFlag(unread: boolean) {
  localStorage.setItem(NOTIFICATION_KEY, unread ? "true" : "false");
  window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail: { unread } }));
}

function fmtDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function typeLabel(type: ReminderType) {
  if (type === "producao_horaria") return "Produção horária";
  return "Impacto / baixa produção";
}

export default function AvisosSupervisor() {
  const [items, setItems] = useState<ReminderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const pending = useMemo(() => items.filter((i) => i.status === "pendente"), [items]);
  const confirmedToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return items.filter((i) => i.status === "confirmado" && (i.confirmed_at || i.created_at).slice(0, 10) === today);
  }, [items]);

  const loadReminders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/avisos-supervisor`, {
        method: "GET",
        headers: authHeaders(),
      });

      if (!res.ok) throw new Error(`Falha ao carregar lembretes (${res.status})`);

      const data: ApiResponse = await res.json();
      const list = Array.isArray(data.items) ? data.items : [];

      setItems(list);
      setUnreadFlag(Boolean(data.unread || data.pending_count > 0));
      setLastSync(new Date().toISOString());
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar lembretes.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function confirmReminder(id: number | string) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/avisos-supervisor/${id}/confirmar`, {
        method: "POST",
        headers: authHeaders(),
      });

      if (!res.ok) throw new Error(`Falha ao confirmar lembrete (${res.status})`);

      await loadReminders();
    } catch (e: any) {
      setError(e?.message || "Erro ao confirmar lembrete.");
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReminders();
    const timer = window.setInterval(loadReminders, 30_000);
    return () => window.clearInterval(timer);
  }, [loadReminders]);

  return (
    <div className="min-h-screen bg-[#05080d] text-zinc-100">
      <style>{`
        .mp-page { padding: 22px; }
        .mp-head { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; flex-wrap:wrap; margin-bottom:18px; }
        .mp-title { font-size:26px; font-weight:950; letter-spacing:-0.04em; color:#f5f7fb; }
        .mp-sub { margin-top:6px; color:#9aa4b2; font-size:14px; font-weight:700; }
        .mp-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .mp-btn { border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.06); color:#f4f7fb; border-radius:14px; padding:10px 14px; font-weight:900; font-size:13px; display:inline-flex; align-items:center; gap:8px; cursor:pointer; }
        .mp-btn:hover { background:rgba(255,255,255,.1); }
        .mp-btn:disabled { opacity:.55; cursor:not-allowed; }
        .mp-btn-primary { background:rgba(249,115,22,.16); border-color:rgba(249,115,22,.45); color:#fff7ed; }
        .mp-grid { display:grid; grid-template-columns:repeat(12, minmax(0, 1fr)); gap:14px; }
        .mp-card { background:linear-gradient(180deg, rgba(18,24,33,.96), rgba(8,12,18,.96)); border:1px solid rgba(255,255,255,.09); border-radius:22px; box-shadow:0 18px 45px rgba(0,0,0,.22); }
        .mp-kpi { grid-column:span 4; padding:18px; min-height:116px; }
        .mp-list { grid-column:span 8; padding:18px; }
        .mp-side { grid-column:span 4; padding:18px; }
        .mp-kpi-label { color:#9aa4b2; font-size:12px; font-weight:950; text-transform:uppercase; letter-spacing:.08em; }
        .mp-kpi-value { margin-top:10px; font-size:34px; font-weight:1000; letter-spacing:-.04em; }
        .mp-muted { color:#9aa4b2; font-weight:700; }
        .mp-item { padding:16px; border:1px solid rgba(255,255,255,.08); border-radius:18px; background:rgba(255,255,255,.035); margin-top:12px; }
        .mp-item-new { border-color:rgba(239,68,68,.45); box-shadow:0 0 0 1px rgba(239,68,68,.10) inset; }
        .mp-row { display:flex; justify-content:space-between; gap:14px; flex-wrap:wrap; align-items:flex-start; }
        .mp-badge { display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:7px 10px; font-size:12px; font-weight:950; border:1px solid rgba(255,255,255,.12); }
        .mp-badge-red { background:rgba(239,68,68,.15); border-color:rgba(239,68,68,.36); color:#fecaca; }
        .mp-badge-ok { background:rgba(34,197,94,.13); border-color:rgba(34,197,94,.32); color:#bbf7d0; }
        .mp-badge-blue { background:rgba(14,165,233,.13); border-color:rgba(14,165,233,.32); color:#bae6fd; }
        .mp-empty { padding:28px; text-align:center; color:#9aa4b2; border:1px dashed rgba(255,255,255,.14); border-radius:18px; margin-top:12px; font-weight:800; }
        .mp-alert { margin-bottom:14px; padding:13px 14px; border-radius:16px; background:rgba(239,68,68,.12); border:1px solid rgba(239,68,68,.28); color:#fecaca; font-weight:850; }
        @media (max-width: 980px) { .mp-kpi, .mp-list, .mp-side { grid-column:span 12; } .mp-page { padding:14px; } }
      `}</style>

      <div className="mp-page">
        <div className="mp-head">
          <div>
            <div className="mp-title">Avisos do Supervisor</div>
            <div className="mp-sub">
              Lembretes automáticos gerados pelo sistema para rotina horária do CCO.
            </div>
          </div>

          <div className="mp-actions">
            <span className="mp-badge mp-badge-blue">
              <Clock3 size={14} /> Última sincronização: {fmtDateTime(lastSync)}
            </span>
            <button className="mp-btn" onClick={loadReminders} disabled={loading}>
              <RefreshCw size={16} /> Atualizar
            </button>
          </div>
        </div>

        {error && <div className="mp-alert">{error}</div>}

        <div className="mp-grid">
          <div className="mp-card mp-kpi">
            <div className="mp-kpi-label">Pendentes</div>
            <div className="mp-kpi-value" style={{ color: pending.length ? "#f87171" : "#e5e7eb" }}>{pending.length}</div>
            <div className="mp-muted">gera bolinha vermelha no menu</div>
          </div>

          <div className="mp-card mp-kpi">
            <div className="mp-kpi-label">Confirmados hoje</div>
            <div className="mp-kpi-value">{confirmedToday.length}</div>
            <div className="mp-muted">avisos tratados no dia</div>
          </div>

          <div className="mp-card mp-kpi">
            <div className="mp-kpi-label">Origem</div>
            <div className="mp-kpi-value" style={{ fontSize: 22 }}>Backend</div>
            <div className="mp-muted">sem cálculo no front</div>
          </div>

          <div className="mp-card mp-list">
            <div className="mp-row">
              <div>
                <div style={{ fontSize: 18, fontWeight: 950 }}>Lembretes ativos</div>
                <div className="mp-muted" style={{ marginTop: 4 }}>{pending.length} aviso(s) aguardando confirmação</div>
              </div>
              {pending.length > 0 && <span className="mp-badge mp-badge-red"><Bell size={14} /> Notificação ativa</span>}
            </div>

            {pending.length === 0 ? (
              <div className="mp-empty">Nenhum lembrete pendente no momento.</div>
            ) : (
              pending.map((item) => (
                <div key={item.id} className="mp-item mp-item-new">
                  <div className="mp-row">
                    <div style={{ minWidth: 260, flex: 1 }}>
                      <div style={{ fontSize: 17, fontWeight: 950 }}>{item.title}</div>
                      <div className="mp-muted" style={{ marginTop: 5, fontSize: 12 }}>{typeLabel(item.type)} • {fmtDateTime(item.scheduled_for)}</div>
                    </div>
                    <span className="mp-badge mp-badge-red"><AlertTriangle size={14} /> Pendente</span>
                  </div>

                  <div style={{ marginTop: 12, lineHeight: 1.55, color: "#d7dde7", whiteSpace: "pre-wrap" }}>{item.message}</div>

                  <div style={{ marginTop: 14 }}>
                    <button className="mp-btn mp-btn-primary" onClick={() => confirmReminder(item.id)} disabled={loading}>
                      <CheckCircle2 size={16} /> Confirmar lembrete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mp-card mp-side">
            <div style={{ fontSize: 18, fontWeight: 950 }}>Histórico recente</div>
            <div className="mp-muted" style={{ marginTop: 4 }}>últimos avisos confirmados/gerados</div>

            {items.length === 0 ? (
              <div className="mp-empty">Sem histórico.</div>
            ) : (
              items.slice(0, 12).map((item) => (
                <div key={item.id} className="mp-item" style={{ padding: 13 }}>
                  <div className="mp-row">
                    <div style={{ fontWeight: 950 }}>{item.title}</div>
                    {item.status === "pendente" ? (
                      <span className="mp-badge mp-badge-red">Pendente</span>
                    ) : (
                      <span className="mp-badge mp-badge-ok">Confirmado</span>
                    )}
                  </div>
                  <div className="mp-muted" style={{ marginTop: 7, fontSize: 12 }}>{fmtDateTime(item.created_at)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
