"use client";

import { useEffect, useState, type ReactNode } from "react";
import { signIn, signUp } from "@/lib/auth";
import { cloud, cloudEnabled } from "@/lib/cloud";
import { useStore } from "@/lib/store";
import { Banner, Button, Card, Field, Input, Screen } from "./ui";

type AuthState = "loading" | "signed-out" | "anonymous" | "signed-in";

export function AuthGate({ children }: { children: ReactNode }) {
  const { refresh } = useStore();
  const [state, setState] = useState<AuthState>(cloudEnabled ? "loading" : "signed-in");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!cloudEnabled) return;
    let active = true;
    const read = async () => {
      const { data: { user } } = await cloud().auth.getUser();
      if (active) setState(!user ? "signed-out" : user.is_anonymous ? "anonymous" : "signed-in");
    };
    void read();
    const { data: { subscription } } = cloud().auth.onAuthStateChange(() => {
      setTimeout(() => { if (active) void read(); }, 0);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setProblem(null);
    setBusy(true);
    try {
      if (mode === "signup") await signUp(username, password, state === "anonymous");
      else await signIn(username, password);
      await refresh();
      setState("signed-in");
      setPassword("");
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : "Couldn't sign in.");
    } finally { setBusy(false); }
  };

  if (state === "signed-in") return <>{children}</>;
  if (state === "loading") return <Screen><p className="mt-10 text-center text-muted">Loading account…</p></Screen>;
  return <Screen>
    <Card className="mt-10 mx-auto max-w-md p-5 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p className="text-sm text-muted mt-2">{state === "anonymous" && mode === "signup"
          ? "Choose a username and password to keep your existing groups on every device."
          : "Sign in to see your groups and receipt picks."}</p>
      </div>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <Field label="Username">
          <Input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username"
            autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={24} placeholder="chris92" />
        </Field>
        <Field label="Password">
          <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8} />
        </Field>
        {problem ? <Banner tone="negative">{problem}</Banner> : null}
        <Button type="submit" variant="primary" size="lg" disabled={busy} className="w-full">
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
        </Button>
      </form>
      <button type="button" className="text-sm text-accent underline underline-offset-2"
        onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setProblem(null); }}>
        {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
      {state === "anonymous" && mode === "login" ? <p className="text-sm text-muted">
        Have groups from an earlier visit? Create an account here first to keep them.
      </p> : null}
    </Card>
  </Screen>;
}
