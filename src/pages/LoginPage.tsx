import { useState } from "react";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { SHARED_ACCOUNT_EMAIL, isSupabaseConfigured } from "@/lib/config";
import { needsLocalSetup, setupLocalPassword, signIn } from "@/services/auth";
import { Button } from "@/components/Button";
import { Logo } from "@/components/Logo";

/** Page de connexion unique — compte partagé des quatre colocataires */
export function LoginPage() {
  const [email, setEmail] = useState(SHARED_ACCOUNT_EMAIL);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const setupMode = needsLocalSetup();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (setupMode) {
      if (password !== confirmPassword) {
        setError("Les deux mots de passe ne correspondent pas.");
        return;
      }
      setLoading(true);
      const setupResult = await setupLocalPassword(password);
      if (!setupResult.ok) {
        setError(setupResult.error);
        setLoading(false);
        return;
      }
      const signInResult = await signIn(email, password);
      setLoading(false);
      if (!signInResult.ok) setError(signInResult.error);
      return;
    }

    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (!result.ok) setError(result.error);
  };

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* Décor discret */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full opacity-[0.14] blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--accent), transparent)" }}
      />

      <div className="animate-rise relative w-full max-w-md">
        <div className="flex flex-col items-center">
          <div className="scale-125">
            <Logo />
          </div>
          <h1 className="mt-10 text-center text-[26px] font-light tracking-tight text-ink sm:text-3xl">
            {setupMode ? "Bienvenue" : "Connexion"}
          </h1>
          <p className="mt-2 text-center text-[13.5px] leading-relaxed text-ink-muted">
            {setupMode
              ? "Définissez le mot de passe du compte partagé. Il sera conservé de manière sécurisée (condensat SHA-256)."
              : "Compte unique partagé par les quatre colocataires."}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="mt-9 space-y-5 rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-7"
        >
          <div>
            <label htmlFor="email" className="mb-2 block text-[11px] font-medium uppercase tracking-[0.16em] text-ink-muted">
              Adresse e-mail
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 w-full rounded-xl border border-line bg-bg-elevated pl-11 pr-4 text-[15px] text-ink transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-[11px] font-medium uppercase tracking-[0.16em] text-ink-muted">
              {setupMode ? "Nouveau mot de passe" : "Mot de passe"}
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={setupMode ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 w-full rounded-xl border border-line bg-bg-elevated pl-11 pr-12 text-[15px] text-ink transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-ink-muted transition-colors hover:text-ink"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {setupMode && (
            <div>
              <label htmlFor="confirm" className="mb-2 block text-[11px] font-medium uppercase tracking-[0.16em] text-ink-muted">
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                <input
                  id="confirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 w-full rounded-xl border border-line bg-bg-elevated pl-11 pr-4 text-[15px] text-ink transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-[13px] leading-relaxed text-ink">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" loading={loading} className="w-full">
            {setupMode ? "Définir et se connecter" : "Se connecter"}
          </Button>
        </form>

        <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-muted">
          {isSupabaseConfigured
            ? "Authentification sécurisée via Supabase — accès réservé au compte partagé."
            : "Mode local : les données sont conservées dans ce navigateur. Connectez Supabase pour un usage partagé."}
        </p>
      </div>
    </div>
  );
}
