// src/auth/roleGuard.ts
// Regras de acesso por papel — MENU e ROTAS usam esta mesma regra.

export type UserRole =
  | "apontador"
  | "controlador"
  | "gerencia"
  | "supervisor"
  | "gestao_vista"
  | "dev";

const GESTAO_VISTA_PATH = "/dashboard/gestao-vista-planta";

function norm(v: any): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");
}

export function normalizeRole(v: any): UserRole {
  const t = norm(v);

  if (!t) return "apontador";

  if (t === "gestao_vista" || t === "gestao_a_vista" || (t.includes("gestao") && t.includes("vista"))) {
    return "gestao_vista";
  }
  if (t === "dev" || t.includes("dev")) return "dev";
  if (t === "controlador" || t.includes("control")) return "controlador";
  if (t === "gerencia" || t.includes("gerenc")) return "gerencia";
  if (t === "supervisor" || t.includes("supervis")) return "supervisor";
  if (t === "apontador" || t.includes("apont")) return "apontador";

  return "apontador";
}

export function getUserRole(user: any): UserRole {
  const direct = user?.user_type ?? user?.role ?? user?.perfil ?? user?.type;
  if (direct) return normalizeRole(direct);

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

export function getDefaultPathByRole(role: UserRole): string {
  if (role === "gestao_vista") return GESTAO_VISTA_PATH;
  if (role === "apontador") return "/producao-planta";
  return "/dashboard";
}

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

  if (p === "/") return true;

  if (role === "dev") return true;

  if (isDevOnly(p)) return false;

  // Perfil exclusivo de painel: só acessa Gestão à Vista.
  if (role === "gestao_vista") {
    return isAllowedExactOrPrefix(p, [GESTAO_VISTA_PATH]);
  }

  if (role === "gerencia") {
    return isAllowedExactOrPrefix(p, [
      "/dashboard",
      "/ritmo",
      "/ritmo-do-turno",
      "/ufdf",
      "/previsao-paradas-estoque",
      "/controle-baixa-performance",
      "/statisticas"
    ]);
  }

  if (role === "controlador") {
    return isAllowedExactOrPrefix(p, [
      "/dashboard",
      "/ritmo",
      "/producao-planta",
      "/controle-baixa-performance",
      "/equipamentos",
      "/ritmo-do-turno",
      "/horimetros",
      "/lancamento-paradas",
      "/previsao-paradas-estoque",
      "/statisticas",
      "/metas",
      "/exportar",
      "/ufdf",
      "/desvio-producao",
      "/dashboard/gestao-vista-planta",
      "/equipamentos",
      "/supervisores-planta",
    ]);
  }

  if (role === "apontador") {
    return isAllowedExactOrPrefix(p, ["/producao-planta"]);
  }

  if (role === "supervisor") {
    return isAllowedExactOrPrefix(p, [
      "/dashboard",
      "/ritmo",
      "/ritmo-do-turno",
      "/producao-planta",
      "/controle-baixa-performance",
      "/equipamentos",
    ]);
  }

  return false;
}
