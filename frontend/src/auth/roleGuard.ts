// src/auth/roleGuard.ts
// Regras de acesso por papel — MENU e ROTAS usam esta mesma regra.

export type UserRole =
  | "apontador"
  | "controlador"
  | "gerencia"
  | "supervisor"
  | "gestao_vista"
  | "dev";

function norm(v: any): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

function normalizeRole(v: any): UserRole {
  const t = norm(v);

  // aceita variações comuns vindas do banco/token/localStorage
  // Ex.: "Gestão à Vista", "gestao_vista", "gestao-a-vista", "Gestao Vista"
  if (!t) return "apontador";

  if (t === "dev" || t.includes("dev")) return "dev";
  if (t === "gestao_vista" || t.includes("gestao_vista") || t.includes("gestao_a_vista")) {
    return "gestao_vista";
  }
  if (t === "controlador" || t.includes("control")) return "controlador";
  if (t === "gerencia" || t.includes("gerenc")) return "gerencia";
  if (t === "supervisor" || t.includes("supervis")) return "supervisor";
  if (t === "apontador" || t.includes("apont")) return "apontador";

  // fallback seguro
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

// ÚNICAS rotas liberadas para o perfil Gestão à Vista.
// Mantive as variações mais prováveis para evitar bloqueio caso a rota esteja nomeada diferente.
const GESTAO_VISTA_ONLY_PATHS = [
  "/gestao-vista",
  "/gestao-vista-planta",
  "/gestao-vista-planta/1",
  "/gestao-vista-planta/2",
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

export function getDefaultPathByRole(role: UserRole): string {
  if (role === "gestao_vista") return "/gestao-vista-planta";
  if (role === "apontador") return "/producao-planta";
  if (role === "supervisor") return "/dashboard";
  if (role === "controlador") return "/dashboard";
  if (role === "gerencia") return "/dashboard";
  if (role === "dev") return "/dashboard";
  return "/dashboard";
}

export function canAccess(role: UserRole, path: string): boolean {
  const p = (path || "/").toLowerCase();

  // home interno sempre ok — ele deve redirecionar pelo getDefaultPathByRole(role)
  if (p === "/") return true;

  // DEV: tudo
  if (role === "dev") return true;

  // ninguém (exceto dev) entra em rotas dev-only
  if (isDevOnly(p)) return false;

  // GESTÃO À VISTA: somente página Gestão à Vista
  if (role === "gestao_vista") {
    return isAllowedExactOrPrefix(p, GESTAO_VISTA_ONLY_PATHS);
  }

  // GERÊNCIA: acesso às páginas principais do app, exceto dev-only
  if (role === "gerencia") {
    return isAllowedExactOrPrefix(p, [
      "/dashboard",
      "/ritmo",
      "/ritmo-do-turno",
      "/ufdf",
      "/statisticas",
      "/gestao-vista",
      "/gestao-vista-planta",
    ]);
  }

  // CONTROLADOR
  if (role === "controlador") {
    return isAllowedExactOrPrefix(p, [
      "/dashboard",
      "/ritmo",
      "/producao-planta",
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
      "/abastecimento",
      "/desvio-producao",
      "/gestao-vista",
      "/gestao-vista-planta",
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
