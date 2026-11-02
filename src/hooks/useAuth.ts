import { useCallback, useEffect, useState } from "react";
import {
  getSessionEmail,
  onAuthStateChange,
  signIn as signInService,
  signOut as signOutService,
} from "@/services/auth";

type AuthStatus = "loading" | "authenticated" | "anonymous";

/** Session du compte unique partagé */
export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSessionEmail().then((sessionEmail) => {
      if (!active) return;
      setEmail(sessionEmail);
      setStatus(sessionEmail ? "authenticated" : "anonymous");
    });
    const unsubscribe = onAuthStateChange((nextEmail) => {
      setEmail(nextEmail);
      setStatus(nextEmail ? "authenticated" : "anonymous");
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (emailValue: string, password: string) => {
    const result = await signInService(emailValue, password);
    return result;
  }, []);

  const signOut = useCallback(async () => {
    await signOutService();
    setEmail(null);
    setStatus("anonymous");
  }, []);

  return { status, email, signIn, signOut };
}
