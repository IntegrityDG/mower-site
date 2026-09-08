import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { readdirSync } from "node:fs";

// Known synthetic configuration only. Do not load/copy another directory's env.
const allowed = new Set(["test", "typecheck", "lint", "build", "dev"]);
const command = process.argv[2];
if (!allowed.has(command)) throw new Error("Choose test, typecheck, lint, build, or dev.");
if (readdirSync(process.cwd()).some(name => /^\.env($|\.(local|development|production|test))/.test(name))) throw new Error("This synthetic runner requires a worktree without environment files.");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/SUPABASE|STRIPE|RESEND|SMTP|DATABASE|POSTGRES|ADMIN_PASSWORD|CHECKOUT_SIGNING|INSTALLATION_|NOTIFICATION|FROM_EMAIL|ORGANIZER_EMAIL|APP_BASE_URL|IDS_SITE_URL|VERCEL|EMAIL/.test(key)));
Object.assign(env, {
  SUPABASE_URL: "http://127.0.0.1:45435", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:45435",
  SUPABASE_ANON_KEY: "synthetic-anon-not-a-credential", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-anon-not-a-credential",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-not-a-credential", REVIEWS_ADMIN_PASSWORD: "synthetic-local-admin",
  STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_test_synthetic_never_send", STRIPE_WEBHOOK_SECRET: "whsec_synthetic_never_send",
  CHECKOUT_SIGNING_SECRET: "synthetic-local-signing-secret-only", APP_BASE_URL: "http://127.0.0.1:3045",
  IDS_SITE_URL: "http://127.0.0.1:3045", INSTALLATION_CASH_RECORDING_ENABLED: "false", INSTALLATION_INTAKE_ENABLED: "false", INSTALLATION_ONLINE_PAYMENTS_ENABLED: "false",
  NEXT_TELEMETRY_DISABLED: "1", RESEND_API_KEY: "", NOTIFICATION_EMAIL_ENABLED: "false",
});
const npm = resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
const npx = resolve(dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const programs = {
  test: [npm, "test"],
  typecheck: [npx, "--no-install", "tsc", "--noEmit"],
  lint: [npm, "run", "lint"],
  build: [npm, "run", "build"],
  dev: ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3045"],
};
const child = spawn(process.execPath, programs[command], { env, stdio: "inherit", windowsHide: true });
child.on("exit", code => { process.exitCode = code ?? 1; });
