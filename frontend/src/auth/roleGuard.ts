// src/auth/roleGuard.ts
// Regras de acesso por papel (inclui supervisor) — MENU e ROTAS usam esta mesma regra.

export type UserRole = "apontador" | "controlador" | "gerencia" | "supervisor" | "dev";

function norm(v: any): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeRole(v: any): UserRole {
  const t = norm(v);

  // aceita variações comuns (ex.: "Supervisor CCO", "GERÊNCIA", "Controlador_cco", etc.)
  if (!t) return "apontador";

  if (t === "dev" || t.includes("dev")) return "dev";
  if (t === "controlador" || t.includes("control")) return "controlador";
  if (t === "gerencia" || t.includes("gerenc")) return "gerencia";
  if (t === "supervisor" || t.includes("supervis")) return "supervisor";
  if (t === "apontador" || t.includes("apont")) return "apontador";

  // fallback
  return "apontador";
}

export function getUserRole(user: any): UserRole {
  // 1) vindo do AuthProvider
  const direct = user?.user_type ?? user?.role ?? user?.perfil ?? user?.type;
  if (direct) return normalizeRole(direct);

  // 2) fallback: localStorage mp_user
  try {
    const raw = localStorage.getItem("mp_user");
    if (raw) {
      const u = JSON.parse(raw);
      const fromLs = u?.user_type ?? u?.role ?? u?.perfil ?? u?.type;
      if (fromLs) return normalizeRole(fromLs);
    }
  } catch {}

  return "apontador";
}

// rotas dev-only (ninguém exceto dev acessa)
const DEV_ONLY_PATHS = [
  "/dev",
  "/dev/",
  "/dev/logs",
  "/dev/users",
  "/usuarios",
  "/logs",
  "/dev-dash",
];

function isDevOnly(path: string): boolean {
  const p = (path || "/").toLowerCase();
  return DEV_ONLY_PATHS.some((x) => p === x || p.startsWith(x.endsWith("/") ? x : x + "/"));
}

function isAllowedExactOrPrefix(path: string, allowed: string[]): boolean {
  const p = (path || "/").toLowerCase();
  return allowed.some((a) => {
    const aa = a.toLowerCase();
    if (aa === "*") return true;
    if (aa === p) return true;
    return p.startsWith(aa.endsWith("/") ? aa : aa + "/");
  });
}

export function canAccess(role: UserRole, path: string): boolean {
  const p = (path || "/").toLowerCase();

  // home interno (route index) sempre ok — ele já decide redirect por role
  if (p === "/") {
    // todos autenticados podem cair no shell
    return true;
  }

  // DEV: tudo
  if (role === "dev") return true;

  // ninguém (exceto dev) entra em rotas dev-only
  if (isDevOnly(p)) return false;

  // GERÊNCIA: mantém o que já tem hoje (assumindo: acesso total às páginas do app, exceto dev-only)
 if (role === "gerencia") {
    return isAllowedExactOrPrefix(p, [
      "/dashboard",
      "/ritmo",
      "/ritmo-do-turno",
      "/ufdf",
      "/statisticas",
    ]);
  }

  // CONTROLADOR: conforme sua lista
  if (role === "controlador") {
    return isAllowedExactOrPrefix(p, [
      "/dashboard",
      "/ritmo",
      "/ritmo-do-turno",
      "/avisos",
      "/avisos-supervisor",
      "/horimetros",
      "/paradas",
      "/lancamento-paradas",
      "/statisticas",
      "/metas",
      "/exportar",
      "/historico",
      "/ufdf",
    ]);
  }

  // APONTADOR: apenas Paradas e Produção da Planta
  if (role === "apontador") {
    return isAllowedExactOrPrefix(p, ["/producao-planta", "/paradas"]);
  }

  // SUPERVISOR: Dashboard, Ritmo, Produção da Planta e Avisos
  if (role === "supervisor") {
    return isAllowedExactOrPrefix(p, [
      "/dashboard",
      "/ritmo",
      "/ritmo-do-turno",
      "/producao-planta",
      "/avisos",
      "/avisos-supervisor",
    ]);
  }

  return false;
}
