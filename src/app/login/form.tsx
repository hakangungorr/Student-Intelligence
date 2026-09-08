"use client";
import { useActionState } from "react";
import { signIn } from "./actions";
export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, { error: "" });
  return <form action={action} className="form-stack">
    <label>E-posta<input name="email" type="email" autoComplete="username" required placeholder="Kurumsal e-posta adresiniz" /></label>
    <label>Şifre<input name="password" type="password" autoComplete="current-password" required /></label>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    <button className="primary" disabled={pending}>{pending ? "Giriş yapılıyor…" : "Giriş yap"}</button>
  </form>;
}
