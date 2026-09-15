import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

/** Execute actual server modules; replace only authentication, database, and provider boundaries. */
export function loadDealerGeocodingModule<T>(path: string, modules: Record<string, unknown>,
  logs: string[] = [], env: Record<string, string | undefined> = {}): T {
  const code = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  const log = (...values: unknown[]) => logs.push(values.map(String).join(" "));
  runInNewContext(code, { exports, Response, Request, URL, Date, Error, DOMException, AbortSignal, fetch, setTimeout, process: { env },
    console: { info: log, warn: log, error: log },
    require(name: string) {
      if (name === "server-only") return {};
      if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
      return modules[name];
    },
  });
  return exports as T;
}
