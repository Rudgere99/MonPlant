import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";

type ReminderType = "producao_horaria" | "impacto_aleatorio";
type ReminderStatus = "pendente" | "confirmado";

type ReminderItem = {
  id: string;
  type: ReminderType;
  title: string;
  message: string;
  created_at: string;
  scheduled_for: string;
  status: ReminderStatus;
  confirmed_at?: string | null;
  confirmed_by?: string | null;
};

type ReminderConfig = {
  hourlyEnabled: boolean;
  randomEnabled: boolean;
  hourlyMinute: number;
  randomMinMinutes: number;
  randomMaxMinutes: number;
  nextRandomAt: string | null;
};

const STORAGE_ITEMS = "monplant:auto_reminders:v1";
const STORAGE_CONFIG = "monplant:auto_reminders_config:v1";
const STORAGE_LAST_HOURLY = "monplant:auto_reminders_last_hourly:v1";
const REMINDER_EVENT = "monplant:avisos-notification-change";

const DEFAULT_CONFIG: ReminderConfig = {
  hourlyEnabled: true,
  randomEnabled: true,
  hourlyMinute: 5,
  randomMinMinutes: 40,
  randomMaxMinutes: 90,
  nextRandomAt: null,
};

const pad2 = (n: number) => String(n).padStart(2, "0");

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
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

function fmtTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function previousHourRange(now = new Date()) {
  const end = new Date(now);
  end.setMinutes(0, 0, 0);

  const start = new Date(end);
  start.setHours(start.getHours() - 1);

  return `${pad2(start.getHours())}:00–${pad2(end.getHours())}:00`;
}

function nextRandomDate(config: ReminderConfig, base = new Date()) {
  const min = Math.max(5, Number(config.randomMinMinutes || 40));
  const max = Math.max(min, Number(config.randomMaxMinutes || 90));
  const minutes = Math.floor(Math.random() * (max - min + 1)) + min;
  const d = new Date(base.getTime() + minutes * 60_000);
  return d.toISOString();
}

function isSameHourlySlot(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate() &&
    a.getHours() === b.getHours()
  );
}

function notifyUnreadChange(items: ReminderItem[]) {
  const unread = items.some((i) => i.status === "pendente");
  localStorage.setItem("monplant:avisos_unread", unread ? "true" : "false");
  window.dispatchEvent(new CustomEvent(REMINDER_EVENT, { detail: { unread } }));
}

export default function AvisosSupervisor() {
  const { user } = useAuth();
  const userName = user?.full_name || user?.email || "Usuário";

  const [items, setItems] = useState<ReminderItem[]>([]);
  const [config, setConfig] = useState<ReminderConfig>(DEFAULT_CONFIG);
  const [now, setNow] = useState(new Date());

  const pending = useMemo(() => items.filter((i) => i.status === "pendente"), [items]);
  const doneToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return items.filter((i) => (i.confirmed_at || i.created_at).slice(0, 10) === today && i.status === "confirmado");
  }, [items]);

  const hourlyPending = pending.filter((i) => i.type === "producao_horaria").length;
  const impactPending = pending.filter((i) => i.type === "impacto_aleatorio").length;

  const saveItems = useCallback((next: ReminderItem[]) => {
    const ordered = [...next].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 300);
    setItems(ordered);
    writeJson(STORAGE_ITEMS, ordered);
    notifyUnreadChange(ordered);
  }, []);

  const saveConfig = useCallback((next: ReminderConfig) => {
    setConfig(next);
    writeJson(STORAGE_CONFIG, next);
  }, []);

  const createReminder = useCallback(
    (type: ReminderType, base = new Date()) => {
      const range = previousHourRange(base);
      const reminder: ReminderItem =
        type === "producao_horaria"
          ? {
              id: uid(),
              type,
              title: `Enviar produção da última hora (${range})`,
              message:
                `Lembrete automático do sistema: enviar nos grupos de WhatsApp a produção da última hora (${range}). ` +
                "Após enviar, confirme este aviso para retirar a notificação.",
              created_at: base.toISOString(),
              scheduled_for: base.toISOString(),
              status: "pendente",
            }
          : {
              id: uid(),
              type,
              title: "Confirmar impacto ou baixa produção",
              message:
                "Lembrete automático do sistema: perguntar ao supervisor se houve impacto operacional, baixa produção, parada relevante ou condição que precise entrar no boletim do turno.",
              created_at: base.toISOString(),
              scheduled_for: base.toISOString(),
              status: "pendente",
            };

      setItems((current) => {
        const existsSameHour =
          type === "producao_horaria" &&
          current.some((i) => i.type === "producao_horaria" && isSameHourlySlot(new Date(i.created_at), base));
        if (existsSameHour) return current;

        const next = [reminder, ...current].slice(0, 300);
        writeJson(STORAGE_ITEMS, next);
        notifyUnreadChange(next);
        return next;
      });
    },
    []
  );

  useEffect(() => {
    const loadedItems = readJson<ReminderItem[]>(STORAGE_ITEMS, []);
    const loadedConfig = { ...DEFAULT_CONFIG, ...readJson<Partial<ReminderConfig>>(STORAGE_CONFIG, {}) };

    if (!loadedConfig.nextRandomAt) loadedConfig.nextRandomAt = nextRandomDate(loadedConfig);

    setItems(loadedItems);
    setConfig(loadedConfig);
    writeJson(STORAGE_CONFIG, loadedConfig);
    notifyUnreadChange(loadedItems);
  }, []);

  useEffect(() => {
    const tick = () => {
      const current = new Date();
      setNow(current);

      setConfig((cfg) => {
        let nextCfg = { ...cfg };

        if (nextCfg.hourlyEnabled && current.getMinutes() === Number(nextCfg.hourlyMinute || 5)) {
          const lastRaw = localStorage.getItem(STORAGE_LAST_HOURLY);
          const last = lastRaw ? new Date(lastRaw) : null;
          if (!last || !isSameHourlySlot(last, current)) {
            createReminder("producao_horaria", current);
            localStorage.setItem(STORAGE_LAST_HOURLY, current.toISOString());
          }
        }

        if (nextCfg.randomEnabled) {
          const nextRandom = nextCfg.nextRandomAt ? new Date(nextCfg.nextRandomAt) : null;
          if (!nextRandom || current >= nextRandom) {
            createReminder("impacto_aleatorio", current);
            nextCfg = { ...nextCfg, nextRandomAt: nextRandomDate(nextCfg, current) };
            writeJson(STORAGE_CONFIG, nextCfg);
          }
        }

        return nextCfg;
      });
    };

    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [createReminder]);

  function confirmReminder(id: string) {
    const next = items.map((item) =>
      item.id === id
        ? {
            ...item,
            status: "confirmado" as ReminderStatus,
            confirmed_at: new Date().toISOString(),
            confirmed_by: userName,
          }
        : item
    );
    saveItems(next);
  }

  function confirmAll() {
    const date = new Date().toISOString();
    const next = items.map((item) =>
      item.status === "pendente"
        ? { ...item, status: "confirmado" as ReminderStatus, confirmed_at: date, confirmed_by: userName }
        : item
    );
    saveItems(next);
  }

  function updateConfig(partial: Partial<ReminderConfig>) {
    const next = { ...config, ...partial };
    if (partial.randomMinMinutes || partial.randomMaxMinutes || partial.randomEnabled) {
      next.nextRandomAt = next.randomEnabled ? nextRandomDate(next) : null;
    }
    saveConfig(next);
  }

  function forceHourly() {
    createReminder("producao_horaria", new Date());
  }

  function forceImpact() {
    createReminder("impacto_aleatorio", new Date());
    updateConfig({ nextRandomAt: nextRandomDate(config) });
  }

  return (
    <div className="mp-page">
      <div className="mp-container" style={{ maxWidth: 1220 }}>
        <div className="mp-breadcrumb">MonPlant • CCO • Lembretes automáticos</div>

        <div className="mp-hero" style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ minWidth: 300, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h1 className="mp-title" style={{ margin: 0 }}>Avisos Automáticos</h1>
                {pending.length > 0 && (
                  <span
                    title="Existem lembretes pendentes"
                    style={{
                      width: 13,
                      height: 13,
                      borderRadius: 999,
                      background: "#ef4444",
                      boxShadow: "0 0 0 5px rgba(239,68,68,.16), 0 0 18px rgba(239,68,68,.75)",
                      display: "inline-block",
                    }}
                  />
                )}
              </div>

              <p className="mp-lead" style={{ marginTop: 8 }}>
                Sistema de lembretes do CCO para envio horário da produção nos grupos de WhatsApp e confirmação aleatória de impactos ou baixa produção com o supervisor.
              </p>

              <div className="mp-muted" style={{ marginTop: 8 }}>
                Agora: <strong>{fmtDateTime(now.toISOString())}</strong> • Próximo lembrete aleatório: <strong>{fmtTime(config.nextRandomAt)}</strong>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button className="mp-btn" onClick={forceHourly}>Gerar lembrete produção</button>
              <button className="mp-btn" onClick={forceImpact}>Gerar lembrete impacto</button>
              <button className="mp-btn mp-btn-primary" onClick={confirmAll} disabled={pending.length === 0}>
                Confirmar todos
              </button>
            </div>
          </div>
        </div>

        <div className="mp-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, marginTop: 16 }}>
          <div className="mp-card" style={{ padding: 16 }}>
            <div className="mp-muted">Pendentes</div>
            <div style={{ fontSize: 34, fontWeight: 950, color: pending.length ? "#ef4444" : "#fff" }}>{pending.length}</div>
          </div>
          <div className="mp-card" style={{ padding: 16 }}>
            <div className="mp-muted">Produção horária</div>
            <div style={{ fontSize: 34, fontWeight: 950 }}>{hourlyPending}</div>
          </div>
          <div className="mp-card" style={{ padding: 16 }}>
            <div className="mp-muted">Impacto / baixa</div>
            <div style={{ fontSize: 34, fontWeight: 950 }}>{impactPending}</div>
          </div>
          <div className="mp-card" style={{ padding: 16 }}>
            <div className="mp-muted">Confirmados hoje</div>
            <div style={{ fontSize: 34, fontWeight: 950 }}>{doneToday.length}</div>
          </div>
        </div>

        <div className="mp-grid" style={{ gridTemplateColumns: "0.82fr 1.18fr", gap: 16, marginTop: 16 }}>
          <div className="mp-card">
            <div className="mp-card-h">
              <div>
                <div className="mp-card-title">Configuração automática</div>
                <div className="mp-muted" style={{ marginTop: 4 }}>Sem lançamento manual de aviso. O sistema gera sozinho.</div>
              </div>
            </div>

            <div className="mp-card-b">
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <label className="mp-card" style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Lembrete horário de produção</div>
                    <div className="mp-muted" style={{ fontSize: 12, marginTop: 4 }}>Gera aviso para enviar a produção da última hora.</div>
                  </div>
                  <input type="checkbox" checked={config.hourlyEnabled} onChange={(e) => updateConfig({ hourlyEnabled: e.target.checked })} />
                </label>

                <div>
                  <label className="mp-label">Minuto do disparo horário</label>
                  <select
                    className="mp-input"
                    value={config.hourlyMinute}
                    onChange={(e) => updateConfig({ hourlyMinute: Number(e.target.value) })}
                    disabled={!config.hourlyEnabled}
                  >
                    <option value={0}>Na virada da hora (:00)</option>
                    <option value={5}>5 minutos após (:05)</option>
                    <option value={10}>10 minutos após (:10)</option>
                    <option value={15}>15 minutos após (:15)</option>
                  </select>
                </div>

                <div className="mp-divider" />

                <label className="mp-card" style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Pergunta aleatória ao supervisor</div>
                    <div className="mp-muted" style={{ fontSize: 12, marginTop: 4 }}>Pergunta se houve impacto, baixa produção ou parada relevante.</div>
                  </div>
                  <input type="checkbox" checked={config.randomEnabled} onChange={(e) => updateConfig({ randomEnabled: e.target.checked })} />
                </label>

                <div className="mp-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label className="mp-label">Mínimo</label>
                    <input
                      className="mp-input"
                      type="number"
                      min={5}
                      value={config.randomMinMinutes}
                      onChange={(e) => updateConfig({ randomMinMinutes: Number(e.target.value) })}
                      disabled={!config.randomEnabled}
                    />
                  </div>
                  <div>
                    <label className="mp-label">Máximo</label>
                    <input
                      className="mp-input"
                      type="number"
                      min={10}
                      value={config.randomMaxMinutes}
                      onChange={(e) => updateConfig({ randomMaxMinutes: Number(e.target.value) })}
                      disabled={!config.randomEnabled}
                    />
                  </div>
                </div>

                <div className="mp-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                  Para a bolinha vermelha aparecer também no menu lateral, o AppShell deve ler <strong>localStorage.getItem("monplant:avisos_unread")</strong> e ouvir o evento <strong>{REMINDER_EVENT}</strong>.
                </div>
              </div>
            </div>
          </div>

          <div className="mp-card">
            <div className="mp-card-h">
              <div>
                <div className="mp-card-title">Fila de lembretes</div>
                <div className="mp-muted" style={{ marginTop: 4 }}>{pending.length} pendente(s) • {items.length} registro(s)</div>
              </div>
            </div>

            <div className="mp-card-b">
              {items.length === 0 ? (
                <div className="mp-empty">Nenhum lembrete gerado ainda.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {items.map((item) => {
                    const isPending = item.status === "pendente";
                    return (
                      <div
                        key={item.id}
                        className="mp-card"
                        style={{
                          padding: 14,
                          borderColor: isPending ? "rgba(239,68,68,.45)" : "rgba(148,163,184,.18)",
                          background: isPending ? "rgba(127,29,29,.16)" : "rgba(15,23,42,.34)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                          <div style={{ minWidth: 260, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              {isPending && <span style={{ width: 9, height: 9, borderRadius: 999, background: "#ef4444", display: "inline-block" }} />}
                              <div style={{ fontWeight: 950, fontSize: 16 }}>{item.title}</div>
                            </div>
                            <div className="mp-muted" style={{ marginTop: 5, fontSize: 12 }}>
                              Gerado em {fmtDateTime(item.created_at)}
                            </div>
                          </div>

                          <span className={isPending ? "mp-badge mp-badge-warn" : "mp-badge mp-badge-ok"}>
                            {isPending ? "Pendente" : "Confirmado"}
                          </span>
                        </div>

                        <div style={{ marginTop: 10, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{item.message}</div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                          <div className="mp-muted" style={{ fontSize: 12 }}>
                            {item.confirmed_at ? `Confirmado por ${item.confirmed_by || "—"} em ${fmtDateTime(item.confirmed_at)}` : "Aguardando confirmação"}
                          </div>

                          {isPending && (
                            <button className="mp-btn mp-btn-primary" onClick={() => confirmReminder(item.id)}>
                              Confirmar aviso
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
