// src/auth/roleGuard.ts
// Regras de acesso por papel (inclui supervisor)

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
  if (t === "dev") return "dev";
  if (t === "controlador") return "controlador";
  if (t === "gerencia") return "gerencia";
  if (t === "supervisor") return "supervisor";
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
    // prefix match para rotas com subpaths
    return p.startsWith(aa.endsWith("/") ? aa : aa + "/");
  });
}

export function canAccess(role: UserRole, path: string): boolean {
  if (role === "dev") return true;
  if (isDevOnly(path)) return false;

  // ✅ Gerência: mantém o que já tem hoje
  // (libera tudo do app, exceto páginas dev-only)
  if (role === "gerencia") return true;

  // ✅ Apontador: somente Paradas e Produção da Planta
  if (role === "apontador") {
    return isAllowedExactOrPrefix(path, ["/", "/producao-planta", "/paradas"]);
  }

  // ✅ Supervisor: Dashboard, Ritmo, Produção da Planta e Avisos
  if (role === "supervisor") {
    return isAllowedExactOrPrefix(path, [
      "/",
      "/dashboard",
      "/ritmo",
      "/ritmo-do-turno",
      "/producao-planta",
      "/avisos",
      "/avisos-supervisor",
    ]);
  }

  // ✅ Controlador: conjunto específico de páginas
  if (role === "controlador") {
    return isAllowedExactOrPrefix(path, [
      "/",
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

  return false;
}
