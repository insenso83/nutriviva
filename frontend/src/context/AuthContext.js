import { createContext, useContext, useEffect, useState } from "react";
import { api, supabase } from "@/lib/api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const clearLocalAppData = () => {
  try {
    localStorage.removeItem("nv_local_auth_session");
  } catch {}
};

const mapSessionUser = (sessionUser) => {
  if (!sessionUser) return null;
  return {
    id: sessionUser.id,
    email: sessionUser.email,
    name:
      sessionUser.user_metadata?.name ||
      sessionUser.email?.split("@")[0] ||
      "Utente",
  };
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=logged out
  const [ready, setReady] = useState(false);

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

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active) return;
        if (session?.user) {
          setUser(mapSessionUser(session.user));
          setReady(true);
        } else if (event === "SIGNED_OUT") {
          clearLocalAppData();
          setUser(false);
          setReady(true);
        }
      }
    );

    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const afterAuth = (payload) => {
    const authUser = payload?.user || payload;
    if (authUser?.id || authUser?.email) {
      setUser({
        id: authUser.id,
        email: authUser.email,
        name: authUser.name || authUser.email?.split("@")[0] || "Utente",
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
    const authUser = data?.user || data;
    if (!authUser?.id && !authUser?.email) {
      throw new Error("Registrazione non completata su Supabase");
    }
    afterAuth(authUser);
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