import { Navigate, useLocation } from "react-router-dom";
import { canAccess, getUserRole } from "../auth/roleGuard";
import { useAuth } from "../auth/AuthProvider";

function RequireRole({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth() as any; // ajuste se seu provider usa outro nome
  const loc = useLocation();

  // ✅ evita “loop” no primeiro render: token existe mas user ainda não chegou
  if (!user && token) return <>{children}</>;

  const role = getUserRole(user);

  if (!canAccess(role, loc.pathname)) {
    const fallback = role === "apontador" ? "/producao-planta" : "/dashboard";
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
