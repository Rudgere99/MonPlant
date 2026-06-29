import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type UserType = "apontador" | "controlador" | "gerencia" | "supervisor" | "gestao_vista" | "dev";

export type MpUser = {
  id: string;
  full_name: string;
  sector: string;
  user_type: UserType;
  email: string;
  can_edit_retroactive?: boolean;
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
  const t = String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");

  if (t === "gestao_vista" || t === "gestao_a_vista" || (t.includes("gestao") && t.includes("vista"))) return "gestao_vista";
  if (t === "dev" || t.includes("dev")) return "dev";
  if (t === "supervisor" || t.includes("supervis")) return "supervisor";
  if (t === "gerencia" || t.includes("gerenc")) return "gerencia";
  if (t === "controlador" || t.includes("control")) return "controlador";
  return "apontador";
}

function normalizeUser(u: any): MpUser | null {
  if (!u) return null;
  return {
    ...u,
    user_type: normalizeUserType(u.user_type ?? u.role ?? u.perfil ?? u.type),
  } as MpUser;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUserState] = useState<MpUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("mp_token");
    const u = localStorage.getItem("mp_user");

    if (t) setTokenState(t);

    if (u) {
      try {
        const normalized = normalizeUser(JSON.parse(u));
        setUserState(normalized);
        if (normalized) localStorage.setItem("mp_user", JSON.stringify(normalized));
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
    const normalized = normalizeUser(u);
    setUserState(normalized);
    if (normalized) localStorage.setItem("mp_user", JSON.stringify(normalized));
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
