// src/auth/roles.ts
// Centraliza tipos e regras de papéis do MonPlant

export type UserRole =
  | "apontador"
  | "controlador"
  | "gerencia"
  | "supervisor"
  | "dev";

export const ROLE_LABEL: Record<UserRole, string> = {
  apontador: "Apontador",
  controlador: "Controlador",
  gerencia: "Gerência",
  supervisor: "Supervisor",
  dev: "DEV",
};

// Rotas permitidas por papel
// (Ajuste aqui se quiser liberar mais páginas para algum papel.)
export const ROLE_ALLOWED_PATHS: Record<UserRole, string[]> = {
  // acesso total
  dev: ["*"],
  // controlador: conjunto específico
  controlador: [
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
  ],

  // apontador: apenas produção + paradas
  apontador: ["/", "/producao-planta", "/paradas"],

  // gerência: mantém o que já tem hoje (+ UF/DF)
  gerencia: ["/", "/dashboard", "/ritmo", "/ritmo-do-turno", "/ufdf"],

  // supervisor: dashboard + ritmo + produção + avisos
  supervisor: [
    "/",
    "/dashboard",
    "/producao-planta",
    "/ritmo",
    "/ritmo-do-turno",
    "/avisos",
    "/avisos-supervisor",
  ],
};

export function normalizeRole(v: unknown): UserRole | null {
  const s0 = String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // "supervisor planta" -> "supervisor_planta"
  const s = s0
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_")
    .replace(/__+/g, "_")
    .replace(/^_+|_+$/g, "");
  // sinônimos
  if (s === "supervisao") return "supervisor";
  if (s === "supervisor_planta" || s === "supervisao_planta") return "supervisor";
  if (s === "gerencia_planta") return "gerencia";

  const ok: UserRole[] = ["apontador", "controlador", "gerencia", "supervisor", "dev"];
  return (ok as string[]).includes(s) ? (s as UserRole) : null;
}

export function canAccessPath(role: UserRole | null | undefined, path: string): boolean {
  if (!role) return false;
  const allow = ROLE_ALLOWED_PATHS[role] ?? [];
  if (allow.includes("*")) return true;

  const p = (path || "/").toLowerCase();
  return allow.some((x) => x.toLowerCase() === p || (x.endsWith("/") && p.startsWith(x.toLowerCase())));
}
