import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type UserType = "apontador" | "controlador" | "gerencia" | "dev";

export type MpUser = {
  id: string;
  full_name: string;
  sector: string;
  user_type: UserType;
  email: string;
};

type AuthCtx = {
  token: string | null;
  user: MpUser | null;
  isDev: boolean;
  loading: boolean;
  setToken: (t: string | null) => void;
  setUser: (u: MpUser | null) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthCtx | null>(null);

function normalizeUserType(v: any): UserType {
  const t = String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos

  if (t === "dev") return "dev";
  if (t === "controlador") return "controlador";
  if (t === "gerencia") return "gerencia";
  return "apontador";
}

function normalizeUser(u: any): MpUser | null {
  if (!u) return null;

  return {
    id: String(u.id ?? ""),
    full_name: String(u.full_name ?? ""),
    sector: String(u.sector ?? ""),
    user_type: normalizeUserType(u.user_type),
    email: String(u.email ?? ""),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUserState] = useState<MpUser | null>(null);
  const [loading, setLoading] = useState(true);

  // 🔥 Hidratação inicial
  useEffect(() => {
    const t = localStorage.getItem("mp_token");
    const u = localStorage.getItem("mp_user");

    if (t) setTokenState(t);

    if (u) {
      try {
        const parsed = JSON.parse(u);
        setUserState(normalizeUser(parsed));
      } catch {
        setUserState(null);
      }
    }

    setLoading(false);
  }, []);

  const setToken = (t: string | null) => {
    setTokenState(t);
    if (t) localStorage.setItem("mp_token", t);
    else localStorage.removeItem("mp_token");
  };

  const setUser = (u: MpUser | null) => {
    if (!u) {
      setUserState(null);
      localStorage.removeItem("mp_user");
      return;
    }

    const fixed = normalizeUser(u);
    setUserState(fixed);

    if (fixed) localStorage.setItem("mp_user", JSON.stringify(fixed));
    else localStorage.removeItem("mp_user");
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const value = useMemo<AuthCtx>(
    () => ({
      token,
      user,
      isDev: user?.user_type === "dev",
      loading,
      setToken,
      setUser,
      logout,
    }),
    [token, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
