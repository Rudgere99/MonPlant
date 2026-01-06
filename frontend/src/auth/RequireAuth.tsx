import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

type RequireAuthProps = {
  children: React.ReactNode;
};

export function RequireAuth({ children }: RequireAuthProps) {
  const { auth } = useAuth();

  // ✅ se não tem token, manda pro login
  if (!auth?.token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
