export type UserRole = "apontador" | "controlador" | "gerencia" | "supervisor" | "dev";

function normalizeRole(v: any): UserRole {
  const s = String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (s === "dev") return "dev";
  if (s === "controlador") return "controlador";
  if (s === "gerencia" || s === "gerencia" || s === "gerência") return "gerencia";
  if (s === "supervisor" || s === "supervisao" || s === "supervisor_planta" || s === "supervisao_planta")
    return "supervisor";

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

  // default
  return "apontador";
}

const DEV_ONLY_PATHS = [
  "/dev/logs",
  "/dev/users",
  "/dashboard/producao-dia", // Dev Dash (você pediu bloquear)
];

export function canAccess(role: UserRole, path: string): boolean {
  const p = String(path || "/").toLowerCase();

  if (role === "dev") return true;

  // bloqueios dev-only
  if (DEV_ONLY_PATHS.some((x) => p.startsWith(x))) return false;

  if (role === "gerencia") {
    return p === "/" || p.startsWith("/dashboard") || p.startsWith("/ritmo");
  }

  if (role === "supervisor") {
    return (
      p === "/" ||
      p.startsWith("/dashboard") ||
      p.startsWith("/ritmo") ||
      p.startsWith("/avisos")
    );
  }

  if (role === "apontador") {
    return p.startsWith("/producao-planta") || p.startsWith("/paradas") || p.startsWith("/ritmo");
  }

  // controlador: tudo menos dev-only
  return true;
}
