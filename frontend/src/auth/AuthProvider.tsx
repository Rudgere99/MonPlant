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
  loading: boolean; // ✅ NOVO
  setToken: (t: string | null) => void;
  setUser: (u: MpUser | null) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUserState] = useState<MpUser | null>(null);
  const [loading, setLoading] = useState(true); // ✅ NOVO

  // 🔥 Hidratação inicial
  useEffect(() => {
    const t = localStorage.getItem("mp_token");
    const u = localStorage.getItem("mp_user");

    if (t) setTokenState(t);

    if (u) {
      try {
        setUserState(JSON.parse(u));
      } catch {
        setUserState(null);
      }
    }

    setLoading(false); // ✅ FINALIZA hidratação
  }, []);

  const setToken = (t: string | null) => {
    setTokenState(t);
    if (t) localStorage.setItem("mp_token", t);
    else localStorage.removeItem("mp_token");
  };

  const setUser = (u: MpUser | null) => {
    setUserState(u);
    if (u) localStorage.setItem("mp_user", JSON.stringify(u));
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
      loading, // ✅ exposto
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
