import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, setUnauthorizedHandler, TOKEN_KEY } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { storage } from "@/src/utils/storage";

export type Role = "owner" | "kasir" | "mekanik" | "partman";
export type User = { id: string; username: string; name: string; role: Role };

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (...roles: Role[]) => boolean;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    (async () => {
      try {
        const token = await storage.secureGet<string | null>(TOKEN_KEY, null);
        if (token) setUser(await api<User>("/auth/me"));
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api<{ access_token: string; user: User }>("/auth/login", { body: { username, password } });
    await storage.secureSet(TOKEN_KEY, r.access_token);
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    queryClient.clear();
    setUser(null);
  }, []);

  // Mekanik dapat mengerjakan semua tugas kasir & partman.
  const can = useCallback(
    (...roles: Role[]) => {
      if (!user) return false;
      if (user.role === "owner") return true;
      if (roles.includes(user.role)) return true;
      return user.role === "mekanik" && (roles.includes("kasir") || roles.includes("partman"));
    },
    [user],
  );

  const value = useMemo(() => ({ user, loading, login, logout, can }), [user, loading, login, logout, can]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
