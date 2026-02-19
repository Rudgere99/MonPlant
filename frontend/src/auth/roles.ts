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
  controlador: ["*"],
  apontador: ["*"],

  // gerência: só dashboard + ritmo
  gerencia: ["/", "/dashboard", "/ritmo", "/ritmo-do-turno"],

  // supervisor: dashboard + ritmo + avisos
  supervisor: ["/", "/dashboard", "/ritmo", "/ritmo-do-turno", "/avisos", "/avisos-supervisor"],
};

export function normalizeRole(v: unknown): UserRole | null {
  const s = String(v ?? "").trim().toLowerCase();
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
