import { Navigate, useLocation } from "react-router-dom";
import { canAccessPath, Role } from "./roles";
import { useAuth } from "./AuthProvider"; // ajuste se seu hook tiver outro nome

export default function RequireRole({ children }: { children: React.ReactNode }) {
  const { user } = useAuth() as any; // user.role precisa existir
  const role = (user?.role || "apontador") as Role;

  const loc = useLocation();
  const path = loc.pathname;

  if (!canAccessPath(role, path)) {
    // destino padrão por role
    const fallback =
      role === "apontador" ? "/producao-planta" : "/dashboard";
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
