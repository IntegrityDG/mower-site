// Used ONLY by explicitly approved real DB phases. No connection at import time.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { TARGET, assertLocalEndpoint } from "./guards";
export type QueryResult = { code: string; output: string; message: string };
export class PsqlConnection {
  private child: ChildProcessWithoutNullStreams;
  private pending: { marker: string; output: string; error: string; resolve: (r: QueryResult) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private buffer = "";
  private closed = false;
  constructor(endpoint: string, containerId: string, database: string, env: NodeJS.ProcessEnv) {
    assertLocalEndpoint(endpoint); assert.equal(database, TARGET.database); assert.match(containerId, /^[a-f0-9]{64}$/);
    this.child = spawn("docker", ["--host", endpoint, "exec", "-i", containerId, "psql", "-X", "-w", "-qAt", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=0", "-v", "VERBOSITY=terse"], { env, windowsHide: true, stdio: "pipe" });
    this.child.stdout.on("data", chunk => {
      this.buffer += chunk.toString();
      let newline: number;
      while ((newline = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, newline).replace(/\r$/, ""); this.buffer = this.buffer.slice(newline + 1);
        const p = this.pending;
        if (!p) continue;
        if (line.startsWith(p.marker + " ")) {
          clearTimeout(p.timer); this.pending = null;
          const status = line.slice(p.marker.length + 1);
          p.resolve({ code: status.slice(0, 5), output: p.output.trim(), message: status.slice(6).trim() || "database_statement_failed" });
        } else p.output += line + "\n";
      }
    });
    this.child.stderr.on("data", chunk => { if (this.pending) this.pending.error += chunk.toString(); });
    const failed = () => { this.closed = true; if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new Error("Local psql connection closed")); this.pending = null; } };
    this.child.stdin.on("error", failed); this.child.on("error", failed); this.child.on("close", failed);
  }
  raw(sql: string): Promise<QueryResult> {
    assert.equal(this.closed, false, "Local psql connection is closed");
    assert.equal(this.pending, null, "Only one outstanding command per connection");
    const marker = "cash_review_" + randomUUID().replaceAll("-", "");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending = null; this.child.kill(); reject(new Error("Local database query timed out; no automatic cleanup")); }, 20000);
      this.pending = { marker, output: "", error: "", resolve, reject, timer };
      this.child.stdin.write(sql.trim().replace(/;?$/, ";") + "\n\\echo " + marker + " :SQLSTATE :LAST_ERROR_MESSAGE\n");
    });
  }
  async query(sql: string) {
    const result = await this.raw(sql);
    if (result.code !== "00000") throw Object.assign(new Error(result.message), { code: result.code });
    return result.output;
  }
  async json<T = unknown>(sql: string): Promise<T> { return JSON.parse(await this.query(sql)) as T; }
  close() { this.child.stdin.end("\\q\n"); }
}
export const literal = (value: unknown) => "'" + String(value).replaceAll("'", "''") + "'";
export const jsonLiteral = (value: unknown) => literal(JSON.stringify(value)) + "::jsonb";
