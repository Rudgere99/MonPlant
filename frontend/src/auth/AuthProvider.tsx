import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type AuthUser = {
  name?: string;
  email?: string;
};

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  isReady: boolean; // ✅ evita render antes de carregar localStorage
};

type AuthContextType = {
  auth: AuthState;
  setToken: (t: string | null) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  // ✅ carrega token do localStorage com segurança
  useEffect(() => {
    try {
      const t = localStorage.getItem("mp_token");
      setTokenState(t ? t.trim() : null);
    } catch {
      setTokenState(null);
    } finally {
      setIsReady(true);
    }
  }, []);

  const setToken = (t: string | null) => {
    setTokenState(t);
    try {
      if (t) localStorage.setItem("mp_token", t);
      else localStorage.removeItem("mp_token");
    } catch {
      // ignore
    }
  };

  const logout = () => setToken(null);

  const value = useMemo<AuthContextType>(
    () => ({
      auth: { token, user, isReady },
      setToken,
      logout,
    }),
    [token, user, isReady]
  );

  // ✅ enquanto não leu localStorage, não renderiza (evita bugs)
  if (!isReady) {
    return (
      <div style={{ background: "#0B0F14", color: "white", minHeight: "100vh", padding: 20 }}>
        Carregando...
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
