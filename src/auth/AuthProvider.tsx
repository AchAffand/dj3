import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../integrations/supabase/client";
import { loginIdentifierToEmail } from "./username";

type AuthStatus = "loading" | "unconfigured" | "signed-out" | "signed-in";
type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  signIn(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>(isSupabaseConfigured ? "loading" : "unconfigured");

  useEffect(() => {
    if (!supabase) {
      setStatus("unconfigured");
      return;
    }

    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setStatus(error ? "signed-out" : data.session ? "signed-in" : "signed-out");
    }).catch(() => {
      if (!active) return;
      setUser(null);
      setStatus("signed-out");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setStatus(session ? "signed-in" : "signed-out");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return "Koneksi Supabase belum diatur.";
    const { error } = await supabase.auth.signInWithPassword({ email: loginIdentifierToEmail(email), password });
    return error?.message ?? null;
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth harus digunakan di dalam AuthProvider");
  return value;
}
