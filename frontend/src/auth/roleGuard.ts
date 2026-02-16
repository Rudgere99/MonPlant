export type UserRole = "apontador" | "controlador" | "gerencia" | "dev";

function normalizeRole(v: any): UserRole {
  const t = String(v || "").trim().toLowerCase();
  if (t === "dev") return "dev";
  if (t === "controlador") return "controlador";
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
  if (role === "dev") return true;

  // bloqueios dev-only
  if (DEV_ONLY_PATHS.some((p) => path.startsWith(p))) return false;

  if (role === "apontador") {
    return path.startsWith("/producao-planta") || path.startsWith("/paradas");
  }

  // controlador: tudo menos dev-only (já bloqueado acima)
  return true;
}
