export type UserRole = "apontador" | "controlador" | "dev";

export function getUserRole(user: any): UserRole {
  const t = String(user?.user_type || "").toLowerCase();
  if (t === "dev") return "dev";
  if (t === "controlador") return "controlador";
  return "apontador";
}

export function canAccess(role: UserRole, path: string): boolean {
  if (role === "dev") return true;

  if (role === "apontador") {
    return (
      path.startsWith("/producao-planta") ||
      path.startsWith("/paradas")
    );
  }

  // controlador
  if (role === "controlador") {
    return !path.startsWith("/dev");
  }

  return false;
}
