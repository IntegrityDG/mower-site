import assert from "node:assert/strict";
export const BASE_DATABASE = "ids_installation_cash_review_20260907";
let disposableDatabase: string = BASE_DATABASE;
export function configureDisposableDatabase(name: string) {
  assert.ok(typeof name === "string" && name.length <= 63 && /^ids_installation_cash_review_20260907(?:_[a-z0-9_]{1,26})?$/.test(name), "Only a task-owned disposable database name is permitted");
  disposableDatabase = name;
}
export const TARGET = {
  project: "mower-site-installation-smoke", containerName: "/supabase_db_mower-site-installation-smoke",
  network: "mower-site-installation-smoke-loopback", get database() { return disposableDatabase; },
  host: "127.0.0.1", port: "54322", major: 17, role: "postgres",
} as const;
export type Phase = "preflight" | "create" | "test" | "cleanup";
export type Approval = { approved: boolean; containerId: string; database: string; project: string; hashes: Record<string, string> };
export type RunManifest = { runId: string; containerId: string; database: string; databaseOid: number; hashes: Record<string, string>; prepared: boolean; testsStarted: boolean; createdObjects: string[]; records: unknown[] };
export type Container = { Id: string; Name: string; State: { Running: boolean }; Config: { Labels: Record<string, string> }; HostConfig: { NetworkMode: string }; NetworkSettings: { Ports: Record<string, { HostIp: string; HostPort: string }[] | null> } };
export function assertApproval(approval: Approval, hashes: Record<string, string>, phase: Phase, token?: string) {
  assert.match(approval.containerId, /^[a-f0-9]{64}$/, "A reviewed full container ID is required");
  assert.equal(approval.project, TARGET.project); assert.equal(approval.database, TARGET.database);
  assert.deepEqual(approval.hashes, hashes, "Approved source/SQL hashes must match exactly");
  if (phase !== "preflight") { assert.equal(approval.approved, true, "Execution approval is absent"); assert.equal(token, TARGET.database, "Explicit phase-specific approval token is required"); }
}
export function assertLocalEndpoint(endpoint: string, inheritedHost?: string) {
  assert.match(endpoint, /^npipe:\/\/\/\/\.\/pipe\/[A-Za-z0-9_.-]+$/, "Only a local Windows Docker named pipe is allowed");
  if (inheritedHost) assert.equal(inheritedHost, endpoint, "DOCKER_HOST disagrees with reviewed local endpoint");
}
export function assertContainer(container: Container, approvedId: string) {
  assert.equal(container.Id, approvedId); assert.equal(container.Name, TARGET.containerName);
  assert.equal(container.State.Running, true); assert.equal(container.Config.Labels["com.supabase.cli.project"], TARGET.project);
  assert.equal(container.HostConfig.NetworkMode, TARGET.network);
  const ports = container.NetworkSettings.Ports;
  assert.ok(ports["5432/tcp"]?.length, "Database port mapping is absent");
  for (const [port, bindings] of Object.entries(ports)) for (const binding of bindings ?? []) {
    assert.equal(binding.HostIp, TARGET.host, "Non-loopback port binding");
    if (port === "5432/tcp") assert.equal(binding.HostPort, TARGET.port);
  }
}
export function assertDatabase(identity: { database: string; oid: number; role: string; sessionRole: string; version: number }, expected: string, oid?: number) {
  assert.equal(identity.database, expected); assert.equal(identity.role, TARGET.role); assert.equal(identity.sessionRole, TARGET.role);
  assert.equal(Math.floor(identity.version / 10000), TARGET.major); assert.ok(identity.oid > 0);
  if (oid !== undefined) assert.equal(identity.oid, oid, "Disposable database identity changed");
}
export function assertCreateAbsent(exists: boolean) { assert.equal(exists, false, "Candidate already exists: do not reuse or erase it"); }
export function assertRun(manifest: RunManifest, approval: Approval, marker: { runId: string; databaseOid: number }, cleanupToken?: string) {
  assert.equal(manifest.database, TARGET.database); assert.notEqual(manifest.database, "postgres");
  assert.equal(manifest.containerId, approval.containerId); assert.deepEqual(manifest.hashes, approval.hashes);
  assert.match(manifest.runId, /^[a-f0-9-]{36}$/); assert.equal(marker.runId, manifest.runId);
  assert.equal(marker.databaseOid, manifest.databaseOid); assert.ok(manifest.prepared);
  if (cleanupToken !== undefined) assert.equal(cleanupToken, TARGET.database);
}
export function parsePhase(value?: string): Phase {
  assert.ok(value && ["preflight", "create", "test", "cleanup"].includes(value), "Choose exactly one phase: preflight, create, test, cleanup. No default/all phase.");
  return value as Phase;
}
