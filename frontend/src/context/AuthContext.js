import { createContext, useContext, useEffect, useState } from "react";
import { api, supabase } from "@/lib/api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=logged out
  const [ready, setReady] = useState(false);

  const mapSessionUser = (sessionUser) => {
    if (!sessionUser) return false;
    return {
      id: sessionUser.id,
      email: sessionUser.email,
      name:
        sessionUser.user_metadata?.name ||
        sessionUser.email?.split("@")[0] ||
        "Utente",
    };
  };

  useEffect(() => {
    let active = true;

    api
      .get("/auth/me")
      .then((r) => {
        if (active) setUser(r.data);
      })
      .catch(() => {
        if (active) setUser(false);
      })
      .finally(() => {
        if (active) setReady(true);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) {
        setUser(mapSessionUser(session.user));
      } else {
        setUser(false);
      }
      setReady(true);
    });

    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const afterAuth = (data) => {
    if (data?.token) {
      localStorage.setItem("nv_token", data.token);
    } else {
      localStorage.removeItem("nv_token");
    }

    if (data?.id || data?.email) {
      setUser({
        id: data.id,
        email: data.email,
        name: data.name || data.email?.split("@")[0] || "Utente",
      });
    }
  };

  const login = async (email, password) => {
    const cleanEmail = String(email || "").trim().toLowerCase();
    const { data } = await api.post("/auth/login", {
      email: cleanEmail,
      password,
    });
    afterAuth(data);
  };

  const register = async (name, email, password) => {
    const cleanEmail = String(email || "").trim().toLowerCase();
    const { data } = await api.post("/auth/register", {
      name: String(name || "").trim(),
      email: cleanEmail,
      password,
    });
    afterAuth(data);
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    localStorage.removeItem("nv_token");
    setUser(false);
  };

  return (
    <AuthCtx.Provider value={{ user, ready, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}