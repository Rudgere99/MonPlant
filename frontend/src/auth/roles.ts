export type Role = "apontador" | "controlador" | "gerencia" | "dev";

export const ROLE_LABEL: Record<Role, string> = {
  apontador: "Apontador",
  controlador: "Controlador",
  dev: "Dev",
  gerencia: "Gerencia",
};

export const DEV_ONLY_PAGES = new Set<string>(["/logs", "/usuarios", "/dev-dash"]);

export const APONTADOR_ALLOWED = new Set<string>([
  "/producao-planta",
  "/paradas",
]);

export const GERENCIA_ALLOWED = new Set<string>([
  "/producao-planta",
]);

export function canAccessPath(role: Role, path: string) {
  if (role === "dev") return true;

  if (role === "apontador") {
    return APONTADOR_ALLOWED.has(path);
  }

    if (role === "gerencia") {
    return GERENCIA_ALLOWED.has(path);
  }

  // controlador
  if (role === "controlador") {
    return !DEV_ONLY_PAGES.has(path);
  }

  return false;
}


export const ROUTE_ACCESS: Record<UserRole, string[]> = {
  apontador: ["/producao-planta", "/paradas", "/ritmo"],
  controlador: ["*"],
  gerencia: ["/dashboard", "/ritmo"],
  supervisor: ["/dashboard", "/ritmo", "/avisos"],
  dev: ["*"],
};
