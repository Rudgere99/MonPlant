import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { canAccess, getUserRole } from "../auth/roleGuard";
import { useAuth } from "../auth/AuthProvider";

function RequireRole({ children }: { children: React.ReactNode }) {
  const { user, token, loading } = useAuth() as any; // ajuste tipos se tiver MpUser

  const loc = useLocation();

  // ✅ enquanto está hidratando, não redireciona (evita flicker/loop)
  if (loading) return <>{children}</>;

  // ✅ token existe mas user ainda não chegou: segura mais um render
  if (!user && token) return <>{children}</>;

  const role = getUserRole(user);

  if (!canAccess(role, loc.pathname)) {
    // ✅ fallback coerente por perfil
    const fallback = role === "apontador" ? "/producao-planta" : "/dashboard";
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}

export default RequireRole;
