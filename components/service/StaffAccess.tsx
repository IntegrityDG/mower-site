"use client";
import { Field, formValues, serviceButton, serviceFetch, useServiceTask } from "./ui";
export default function StaffAccess({ token }: { token?: string }) {
  const task = useServiceTask();
  return <form className="mx-auto max-w-lg space-y-5 rounded-2xl border bg-white p-6" onSubmit={event => { const data = formValues(event); void task.run(async () => {
    if (token) await serviceFetch("/api/service/staff/activate", { token, password: data.get("password") });
    else await serviceFetch("/api/service/staff/session", { email: data.get("email"), password: data.get("password") });
    window.location.assign(token ? "/staff/service/login" : "/staff/service");
  }, ""); }}>{!token && <Field label="Staff email" name="email" type="email" autoComplete="username" required />}<Field label={token ? "Choose a password (at least 12 characters)" : "Password"} name="password" type="password" minLength={token ? 12 : undefined} autoComplete={token ? "new-password" : "current-password"} required />{task.status}<button disabled={task.busy} className={serviceButton}>{token ? "Activate individual staff account" : "Sign in"}</button><p className="text-sm">Staff access only. For a password reset, contact the IDS Master Admin.</p></form>;
}
