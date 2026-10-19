import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Synthetic loopback-only configuration. Never load another checkout's env files.
export function tickerLocalEnvironment() {
  if (readdirSync(process.cwd()).some((name) => /^\.env($|\.(local|development|production|test))/.test(name))) {
    throw new Error("Run ticker verification in the isolated worktree without environment files.");
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/SUPABASE|STRIPE|RESEND|SMTP|DATABASE|POSTGRES|ADMIN_PASSWORD|CHECKOUT_SIGNING|NOTIFICATION|FROM_EMAIL|ORGANIZER_EMAIL|APP_BASE_URL|IDS_SITE_URL|VERCEL|EMAIL|NODE_ENV/.test(key)));
  return { ...env,
    SUPABASE_URL: "http://127.0.0.1:45475", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:45475",
    SUPABASE_ANON_KEY: "synthetic-anon-not-a-credential", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-anon-not-a-credential",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-not-a-credential", REVIEWS_ADMIN_PASSWORD: "synthetic-local-admin",
    STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_test_synthetic_never_send", STRIPE_WEBHOOK_SECRET: "whsec_synthetic_never_send",
    CHECKOUT_SIGNING_SECRET: "synthetic-local-signing-secret-only", APP_BASE_URL: "http://127.0.0.1:3047", IDS_SITE_URL: "http://127.0.0.1:3047",
    RESEND_API_KEY: "", NOTIFICATION_EMAIL_ENABLED: "false", NEXT_TELEMETRY_DISABLED: "1",
  };
}

const npm = resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
const commands = {
  test: [npm, "test"],
  typecheck: ["node_modules/typescript/bin/tsc", "--noEmit"],
  lint: [npm, "run", "lint"],
  build: [npm, "run", "build"],
  dev: ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3047"],
  start: ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3047"],
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = commands[process.argv[2]];
  if (!command) throw new Error("Choose test, typecheck, lint, build, dev, or start.");
  const child = spawn(process.execPath, command, { env: tickerLocalEnvironment(), stdio: "inherit", windowsHide: true });
  child.on("exit", (code) => { process.exitCode = code ?? 1; });
}
