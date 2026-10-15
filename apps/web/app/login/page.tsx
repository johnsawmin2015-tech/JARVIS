"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Sign in failed");
      }
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login">
      <form className="card login-card stack" onSubmit={(event) => void submit(event)}>
        <div className="brand">
          <span className="brand-mark" />
          JARVIS
        </div>
        <div>
          <p className="eyebrow">Owner access</p>
          <h1>Welcome back.</h1>
          <p className="subhead">Authenticate to access your private intelligence workspace.</p>
          <p className="demo-login-note">
            Local demo mode · process-local data resets when the development server restarts.
          </p>
        </div>
        <label className="stack">
          <span className="muted">Email</span>
          <input
            className="input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="stack">
          <span className="muted">Password</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button className="button" type="submit" disabled={pending}>
          {pending ? "Authenticating…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
