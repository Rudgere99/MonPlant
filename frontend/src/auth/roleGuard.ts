// src/auth/roleGuard.ts
// Regras de acesso por tipo de usuário (MonPlant)

export type UserRole = "apontador" | "controlador" | "gerencia" | "supervisor" | "dev";

// normaliza string (remove acentos, lower)
function norm(s?: string | null) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function getUserRole(user: any): UserRole {
  const t = norm(user?.user_type);

  if (t === "dev") return "dev";
  if (t === "gerencia") return "gerencia";
  if (t === "supervisor") return "supervisor";
  if (t === "controlador") return "controlador";
  return "apontador";
}

function pathOk(pathname: string, allowed: string[]) {
  const p = (pathname || "/").toLowerCase();
  if (p === "/") return true;
  return allowed.some((a) => {
    const aa = a.toLowerCase();
    return p === aa || p.startsWith(aa + "/");
  });
}

/**
 * canAccess:
 * - supervisor: dashboard + ritmo + avisos (tela de avisos) apenas
 * - gerencia: dashboard + ritmo (ajuste conforme sua política)
 * - apontador/controlador: tudo (exceto /dev)
 * - dev: tudo
 */
export function canAccess(role: UserRole, pathname: string): boolean {
  const p = (pathname || "/").toLowerCase();

  // sempre permitir login (segurança extra caso use canAccess fora do guard)
  if (p.startsWith("/login")) return true;

  if (role === "dev") return true;

  if (role === "supervisor") {
    return pathOk(p, ["/dashboard", "/ritmo", "/avisos"]);
  }

  if (role === "gerencia") {
    return pathOk(p, ["/dashboard", "/ritmo"]);
  }

  // apontador/controlador: bloqueia área DEV
  if (p.startsWith("/dev")) return false;

  return true;
}
