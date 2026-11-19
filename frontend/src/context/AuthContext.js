import { createContext, useContext, useEffect, useState } from "react";
import { api, supabase } from "@/lib/api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const clearLocalAppData = () => {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith("nv_")) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
};

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
        clearLocalAppData();
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
    } else {
      setUser(false);
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
    const cleanName = String(name || "").trim();
    const { data } = await api.post("/auth/register", {
      name: cleanName,
      email: cleanEmail,
      password,
    });
    if (!data?.id && !data?.email) {
      throw new Error("Registrazione non completata su Supabase");
    }
    afterAuth(data);
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      const msg = String(err?.message || "").toLowerCase();
      if (!msg.includes("session") && !msg.includes("user missing")) {
        console.warn("Logout warning:", err);
      }
    } finally {
      clearLocalAppData();
      setUser(false);
    }
  };

  return (
    <AuthCtx.Provider value={{ user, ready, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}