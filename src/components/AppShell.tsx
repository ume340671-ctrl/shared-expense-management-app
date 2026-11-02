import type { ReactNode } from "react";
import { Handshake, History, Home, LogOut, Moon, Plus, ShoppingBag, Sun, Users } from "lucide-react";
import type { Theme } from "@/hooks/useTheme";
import { Logo } from "./Logo";
import { cn } from "@/utils/cn";

export type View = "dashboard" | "purchases" | "people" | "audit" | "friends";

const NAV_ITEMS: { id: View; label: string; mobileLabel?: string; icon: typeof Home }[] = [
  { id: "dashboard", label: "Accueil", icon: Home },
  { id: "purchases", label: "Achats", icon: ShoppingBag },
  { id: "people", label: "Dépenses", icon: Users },
  { id: "audit", label: "Audit", icon: History },
  { id: "friends", label: "Dépenses entre amis", mobileLabel: "Amis", icon: Handshake },
];

/** Navigation shared by the house, audit and independent friends ledger. */
export function AppShell({
  view,
  onNavigate,
  email,
  theme,
  onToggleTheme,
  onSignOut,
  onAddPurchase,
  children,
}: {
  view: View;
  onNavigate: (view: View) => void;
  email: string | null;
  theme: Theme;
  onToggleTheme: () => void;
  onSignOut: () => void;
  onAddPurchase: () => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-bg">
      {/* ---- Sidebar (ordinateur) ---- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-bg-elevated px-5 py-7 md:flex">
        <Logo />

        <nav className="mt-10 flex flex-col gap-1" aria-label="Navigation principale">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[14px] transition-all duration-200",
                view === item.id
                  ? "bg-accent-soft font-semibold text-accent-text"
                  : "text-ink-secondary hover:bg-surface-2 hover:text-ink",
              )}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-3">
          {view !== "friends" && <button
            onClick={onAddPurchase}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-[14px] font-semibold text-accent-contrast transition-all duration-200 hover:bg-accent-strong active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} />
            Ajouter un achat
          </button>}

          <div className="rounded-xl border border-line bg-surface p-3.5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink-muted">Compte partagé</p>
            <p className="mt-1.5 truncate text-[13px] text-ink" title={email ?? ""}>
              {email ?? "—"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleTheme}
              aria-label={theme === "dark" ? "Activer le thème clair" : "Activer le thème sombre"}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-line text-ink-secondary transition-colors hover:border-line-strong hover:text-ink"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="text-[13px]">{theme === "dark" ? "Clair" : "Sombre"}</span>
            </button>
            <button
              onClick={onSignOut}
              aria-label="Se déconnecter"
              title="Se déconnecter"
              className="grid h-10 w-10 place-items-center rounded-xl border border-line text-ink-secondary transition-colors hover:border-danger/50 hover:text-danger"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ---- En-tête (mobile) ---- */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur-md md:hidden">
        <Logo compact />
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "Activer le thème clair" : "Activer le thème sombre"}
            className="grid h-10 w-10 place-items-center rounded-xl border border-line text-ink-secondary transition-colors active:scale-95"
          >
            {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>
          {view !== "friends" && <button
            onClick={onAddPurchase}
            aria-label="Ajouter un achat"
            className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-contrast transition-transform active:scale-95"
          >
            <Plus className="h-5 w-5" strokeWidth={2.4} />
          </button>}
        </div>
      </header>

      {/* ---- Contenu ---- */}
      <main className="md:pl-64">
        <div className="mx-auto max-w-5xl px-4 pb-28 pt-5 sm:px-6 md:pb-14 md:pt-10">{children}</div>
      </main>

      {/* ---- Barre de navigation inférieure (mobile) ---- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/92 backdrop-blur-md md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Navigation principale"
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium tracking-wide transition-colors",
                view === item.id ? "text-accent-text" : "text-ink-muted",
              )}
            >
              {view === item.id && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" aria-hidden="true" />
              )}
              <item.icon className="h-[21px] w-[21px]" strokeWidth={view === item.id ? 2.2 : 1.7} />
              {item.mobileLabel ?? item.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
