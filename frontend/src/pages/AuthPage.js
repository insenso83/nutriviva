import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Leaf } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AuthPage() {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const toggleMode = () => {
    setMode((prev) => (prev === "login" ? "register" : "login"));
    setForm({ name: "", email: "", password: "" });
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const cleanEmail = form.email.trim().toLowerCase();
      const cleanName = form.name.trim();
      if (mode === "login") {
        await login(cleanEmail, form.password);
      } else {
        await register(cleanName, cleanEmail, form.password);
      }
      setForm({ name: "", email: "", password: "" });
      toast.success("Benvenuto in NutriViva!");
      nav("/app");
    } catch (err) {
      console.error("Auth error:", err);
      toast.error(apiError(err) || "Errore imprevisto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:block relative">
        <img
          src="https://images.unsplash.com/photo-1512621776951-a57141f2eefd?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"
          alt="Ciotola salutare"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-primary/55" />
        <div className="absolute bottom-0 p-12 text-white max-w-lg animate-fade-up">
          <div className="flex items-center gap-2 mb-4">
            <Leaf className="w-7 h-7" />
            <span className="font-heading text-2xl font-bold">NutriViva</span>
          </div>
          <h1 className="font-heading text-4xl font-extrabold leading-tight">
            La tua dieta su misura, basata su ciò che hai nel frigo.
          </h1>
          <p className="mt-4 text-white/80">
            Obiettivi, tipo di dieta, 6 pasti al giorno per 7 giorni, calendario, check-in peso e umore, integratori. Tutto bilanciato e intelligente.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <div className="w-full max-w-md animate-fade-up">
          <div className="flex items-center gap-2 mb-8 lg:hidden text-primary">
            <Leaf className="w-6 h-6" />
            <span className="font-heading text-xl font-bold">NutriViva</span>
          </div>
          <h2 className="font-heading text-3xl font-bold text-primary">
            {mode === "login" ? "Bentornato" : "Crea il tuo account"}
          </h2>
          <p className="text-muted-foreground mt-1 mb-8">
            {mode === "login"
              ? "Accedi per vedere il tuo piano."
              : "Inizia il tuo percorso nutrizionale."}
          </p>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <div>
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  data-testid="input-name"
                  value={form.name}
                  required
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Marco Rossi"
                />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete={mode === "login" ? "email" : "email"}
                data-testid="input-email"
                value={form.email}
                required
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="tu@email.it"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                data-testid="input-password"
                value={form.password}
                required
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              data-testid="btn-submit-auth"
              className="w-full rounded-full h-12 text-base bg-primary hover:bg-primary/90"
            >
              {loading
                ? "Attendi…"
                : mode === "login"
                ? "Accedi"
                : "Registrati"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {mode === "login"
              ? "Non hai un account?"
              : "Hai già un account?"}{" "}
            <button
              type="button"
              data-testid="btn-toggle-mode"
              className="text-primary font-semibold underline"
              onClick={toggleMode}
            >
              {mode === "login" ? "Registrati" : "Accedi"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}