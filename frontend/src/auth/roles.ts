export type Role = "apontador" | "controlador" | "dev";

export const ROLE_LABEL: Record<Role, string> = {
  apontador: "Apontador",
  controlador: "Controlador",
  dev: "Dev",
};

export const DEV_ONLY_PAGES = new Set<string>(["/logs", "/usuarios", "/dev-dash"]);

export const APONTADOR_ALLOWED = new Set<string>([
  "/producao-planta",
  "/paradas",
]);

export function canAccessPath(role: Role, path: string) {
  if (role === "dev") return true;

  if (role === "apontador") {
    return APONTADOR_ALLOWED.has(path);
  }

  // controlador
  if (role === "controlador") {
    return !DEV_ONLY_PAGES.has(path);
  }

  return false;
}
