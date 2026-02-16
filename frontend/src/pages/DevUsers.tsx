// src/pages/DevUsers.tsx
import React, { useEffect, useMemo, useState } from "react";

/**
 * DEV • Usuários
 * - Ajustado para usar /api/dev/users (evita confusão de base URL)
 * - Envia user_type SEM acento e em minúsculo: "gerencia"
 * - Mostra erro real do backend (quando vier JSON {detail: ...})
 *
 * Observação:
 * - Este arquivo usa fetch direto para não depender do seu apiGet/apiPost.
 * - Pega o token do localStorage (vários nomes comuns). Ajuste se o seu for outro.
 */

type UserRow = {
  id: string;
  full_name: string;
  sector: string;
  user_type: string;
  email: string;
  is_active: boolean;
  created_at?: string | null;
};

function getToken(): string | null {
  // tente os nomes mais comuns usados em projetos anteriores
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("auth_token") ||
    localStorage.getItem("bv_token") ||
    localStorage.getItem("monplant_token")
  );
}

function getApiBase(): string {
  // Ex.: VITE_API_BASE="https://monplant-production.up.railway.app"
  // ou "https://monplant-production.up.railway.app/api"
  const raw = (import.meta as any).env?.VITE_API_BASE || "";
  const base = String(raw).trim().replace(/\/+$/, "");

  if (!base) return ""; // cai para /api no mesmo host

  // Se já termina com /api, não duplica
  if (base.endsWith("/api")) return base;

  return base;
}

function joinUrl(base: string, path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!base) return p;
  return `${base}${p}`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const base = getApiBase();

  // Se VITE_API_BASE já termina com /api => path deve começar sem /api para evitar duplicar.
  // Aqui vamos sempre chamar com "/api/..." e se base já tiver /api, removemos o prefixo.
  let finalPath = path;
  if (base.endsWith("/api") && finalPath.startsWith("/api/")) {
    finalPath = finalPath.replace(/^\/api/, "");
  }

  const url = joinUrl(base, finalPath);

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();

  // tenta extrair erro detalhado
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!res.ok) {
    const msg =
      (payload && typeof payload === "object" && (payload.detail || payload.message)) ||
      (typeof payload === "string" && payload) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return payload as T;
}

function normalizeUserType(input: string) {
  // garante "gerencia" sem acento
  const s = (input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos
  return s;
}

export default function DevUsers() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  // form
  const [fullName, setFullName] = useState("MSA");
  const [sector, setSector] = useState("Administração");
  const [userType, setUserType] = useState<"apontador" | "controlador" | "gerencia" | "dev">("gerencia");
  const [email, setEmail] = useState("msa@monplant.com");
  const [password, setPassword] = useState("");

  const canSubmit = useMemo(() => {
    return fullName.trim() && sector.trim() && email.trim() && password.trim() && userType;
  }, [fullName, sector, email, password, userType]);

  async function loadUsers() {
    setLoading(true);
    setErr("");
    try {
      // ✅ usa o alias /api/dev/users
      const data = await apiFetch<UserRow[]>("/api/dev/users", { method: "GET" });
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Falha ao buscar usuários.");
    } finally {
      setLoading(false);
    }
  }

  async function createUser() {
    setLoading(true);
    setErr("");
    try {
      const payload = {
        full_name: fullName.trim(),
        sector: sector.trim(),
        user_type: normalizeUserType(userType), // ✅ garante "gerencia"
        email: email.trim().toLowerCase(),
        password: password,
      };

      await apiFetch<{ ok: boolean; id?: string }>("/api/dev/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setPassword("");
      await loadUsers();
    } catch (e: any) {
      setErr(e?.message || "Falha ao criar usuário.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen w-full px-6 py-6 text-zinc-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">DEV • Usuários</div>
          <div className="text-sm text-zinc-400">
            Somente DEV cria usuários. (Por enquanto não bloqueia páginas.)
          </div>
        </div>

        <button
          onClick={loadUsers}
          className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium ring-1 ring-white/10 hover:bg-white/15"
          disabled={loading}
        >
          Atualizar
        </button>
      </div>

      <div className="mt-6 rounded-2xl bg-zinc-950/40 p-4 ring-1 ring-white/10">
        {err ? (
          <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {err}
          </div>
        ) : null}

        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-4">
            <label className="block text-xs text-zinc-400">Nome completo</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10"
            />
          </div>

          <div className="col-span-12 md:col-span-2">
            <label className="block text-xs text-zinc-400">Setor</label>
            <input
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10"
            />
          </div>

          <div className="col-span-12 md:col-span-2">
            <label className="block text-xs text-zinc-400">Tipo</label>
            <select
              value={userType}
              onChange={(e) => setUserType(e.target.value as any)}
              className="mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10"
            >
              <option value="apontador">Apontador</option>
              <option value="controlador">Controlador</option>
              <option value="gerencia">Gerência</option>
              <option value="dev">DEV</option>
            </select>
            <div className="mt-1 text-[11px] text-zinc-500">
              Enviado como: <span className="text-zinc-300">{normalizeUserType(userType)}</span>
            </div>
          </div>

          <div className="col-span-12 md:col-span-2">
            <label className="block text-xs text-zinc-400">E-mail</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10"
            />
          </div>

          <div className="col-span-12 md:col-span-2">
            <label className="block text-xs text-zinc-400">Senha</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10"
            />
          </div>

          <div className="col-span-12 flex items-center justify-between gap-3">
            <button
              onClick={createUser}
              disabled={!canSubmit || loading}
              className="rounded-xl bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              Criar usuário
            </button>

            <div className="text-xs text-zinc-500">
              Endpoint: <span className="text-zinc-300">/api/dev/users</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-zinc-950/40 p-4 ring-1 ring-white/10">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Usuários cadastrados</div>
          <div className="text-xs text-zinc-500">{loading ? "Carregando…" : `${rows.length} usuário(s)`}</div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs text-zinc-400">
              <tr className="border-b border-white/10">
                <th className="py-2 pr-3">Nome</th>
                <th className="py-2 pr-3">Setor</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Ativo</th>
                <th className="py-2 pr-3">Criado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-white/5">
                  <td className="py-2 pr-3">{u.full_name}</td>
                  <td className="py-2 pr-3">{u.sector}</td>
                  <td className="py-2 pr-3">{u.user_type}</td>
                  <td className="py-2 pr-3">{u.email}</td>
                  <td className="py-2 pr-3">{u.is_active ? "Sim" : "Não"}</td>
                  <td className="py-2 pr-3 text-xs text-zinc-400">{u.created_at || "-"}</td>
                </tr>
              ))}
              {!rows.length && !loading ? (
                <tr>
                  <td className="py-6 text-center text-sm text-zinc-500" colSpan={6}>
                    Nenhum usuário listado.
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
