import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function RequireAuth({ children }: { children: JSX.Element }) {
  const { auth } = useAuth();

  // ✅ se não tem token, manda pro login
  if (!auth?.token) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
