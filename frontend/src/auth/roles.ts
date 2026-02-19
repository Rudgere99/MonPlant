// ⚠️ Este arquivo só é útil se você ainda o usa em algum lugar.
// O projeto já usa src/auth/roleGuard.ts como fonte principal de regras.
// Mesmo assim, manter aqui atualizado evita confusão.

export type Role = "apontador" | "controlador" | "gerencia" | "supervisor" | "dev";

export const ROLE_LABEL: Record<Role, string> = {
  apontador: "Apontador",
  controlador: "Controlador",
  dev: "Dev",
  gerencia: "Gerencia",
  supervisor: "Supervisor",
};

export const DEV_ONLY_PAGES = new Set<string>(["/logs", "/usuarios", "/dev-dash"]);

export const APONTADOR_ALLOWED = new Set<string>([
  "/producao-planta",
  "/paradas",
]);

export const GERENCIA_ALLOWED = new Set<string>([
  "/dashboard",
  "/ritmo",
  "/",
]);

export const SUPERVISOR_ALLOWED = new Set<string>([
  "/dashboard",
  "/ritmo",
  "/avisos",
  "/",
]);

export function canAccessPath(role: Role, path: string) {
  if (role === "dev") return true;

  if (role === "apontador") {
    return APONTADOR_ALLOWED.has(path);
  }

  if (role === "gerencia") {
    return GERENCIA_ALLOWED.has(path);
  }

  if (role === "supervisor") {
    return SUPERVISOR_ALLOWED.has(path);
  }

  // controlador
  if (role === "controlador") {
    return !DEV_ONLY_PAGES.has(path);
  }

  return false;
}
