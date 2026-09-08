import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Actual source modules, with explicit external-boundary mocks. No DB execution.
export function loadInstallationModule<T>(path: string, modules: Record<string, unknown>, env: Record<string, string | undefined> = {}) : T {
  const code = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  runInNewContext(code, {
    exports, Response, Request, TextEncoder, Date, crypto, URL, process: { env }, console,
    require(name: string) {
      if (name === "server-only") return {};
      if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
      return modules[name];
    },
  });
  return exports as T;
}
