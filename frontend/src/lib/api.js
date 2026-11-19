if (url.includes("/auth/login")) {
      const cleanEmail = String(body?.email || "").trim().toLowerCase();
      let { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: body?.password,
      });

      if (error) {
        const msg = String(error?.message || "").toLowerCase();
        if (
          msg.includes("session") ||
          msg.includes("user missing") ||
          msg.includes("refresh_token")
        ) {
          await supabase.auth.signOut({ scope: "local" }).catch(() => {});
          clearCorruptedSupabaseAuthKeys();
          const retry = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password: body?.password,
          });
          data = retry.data;
          error = retry.error;
        }
      }

      if (error) throw error;
      const u = data.user;
      if (u?.id) {
        clearOtherUsersStorage(u.id);
      }
      return {
        data: {
          id: u.id,
          email: u.email,
          name: u.user_metadata?.name || u.email?.split("@")[0] || "Utente",
          token: data.session?.access_token,
        },
      };
    }