import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { MemberAccessError } from "./member-auth";
import {
  troubleshootingTextFromDatabase,
  validateTroubleshootingActivity,
  validateTroubleshootingTextEdit,
} from "./troubleshooting-activity-validation";
import type {
  MemberTroubleshootingEntry,
  TroubleshootingComment,
  TroubleshootingEntry,
  TroubleshootingRevision,
  TroubleshootingUpdate,
} from "./types";
import { validateUuid } from "./validation";

type RevisionRow = { id: string; entry_id: string; created_at: string; patch: unknown };
type UpdateRow = { id: string; entry_id: string; body: string; created_at: string };
type CommentRow = UpdateRow & { member_name_snapshot: string; company_name_snapshot: string };

const client = getSupabaseServiceClient;
const revisionTable = "dealer_network_troubleshooting_revisions";
const activityColumns = "id,entry_id,body,created_at";

export async function readTroubleshootingRevisions(entryIds: string[]) {
  if (!entryIds.length) return new Map<string, TroubleshootingRevision>();
  const { data, error } = await client().from(revisionTable)
    .select("id,entry_id,created_at,patch").in("entry_id", entryIds);
  if (error) throw error;
  const byEntry = new Map<string, TroubleshootingRevision>();
  for (const row of (data ?? []) as RevisionRow[]) {
    const patch = troubleshootingTextFromDatabase(row.patch);
    if (!patch) throw new Error("Invalid troubleshooting revision");
    byEntry.set(row.entry_id, { id: row.id, submittedAt: row.created_at, patch });
  }
  return byEntry;
}

async function readTroubleshootingUpdates(entryIds: string[], memberId: string) {
  const items: UpdateRow[] = [];
  if (!entryIds.length) return items;
  const batchSize = 500;
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await client().from("dealer_network_troubleshooting_updates")
      .select(`${activityColumns},parent:dealer_network_troubleshooting_entries!inner(status,member_id)`)
      .in("entry_id", entryIds).or(`status.eq.approved,member_id.eq.${memberId}`, { referencedTable: "parent" })
      .order("created_at").order("id").range(offset, offset + batchSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as UpdateRow[];
    items.push(...batch);
    if (batch.length < batchSize) return items;
  }
}

/** For the authenticated admin dashboard only; member visibility filtering is unchanged. */
export async function readAdminTroubleshootingUpdates(entryIds: string[]) {
  const byEntry = new Map<string, TroubleshootingUpdate[]>();
  const batchSize = 500;
  // Keep the UUID filter short even when the dashboard returns its full 500 entries.
  for (let start = 0; start < entryIds.length; start += 100) {
    const ids = entryIds.slice(start, start + 100);
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await client().from("dealer_network_troubleshooting_updates")
        .select(activityColumns).in("entry_id", ids)
        .order("created_at").order("id").range(offset, offset + batchSize - 1);
      if (error) throw error;
      const rows = (data ?? []) as UpdateRow[];
      for (const { entry_id, id, body, created_at } of rows) {
        const item = { id, body, createdAt: created_at };
        const group = byEntry.get(entry_id);
        if (group) group.push(item);
        else byEntry.set(entry_id, [item]);
      }
      if (rows.length < batchSize) break;
    }
  }
  return byEntry;
}

export async function addTroubleshootingActivity(
  memberId: string,
  entries: TroubleshootingEntry[],
  ownEntries: TroubleshootingEntry[],
) {
  // Never ask for activity on a pending/denied entry owned by another member.
  const owned = ownEntries.filter((entry) => entry.memberId === memberId);
  const approved = entries.filter((entry) => entry.status === "approved");
  const scope = [...new Set([...approved, ...owned].map((entry) => entry.id))];
  const approvedIds = approved.map((entry) => entry.id);
  // The library page is capped at 100 entries; each 50-ID query can return at most 250 comments.
  const commentsFetch = async () => {
    const all: CommentRow[] = [];
    for (let i = 0; i < approvedIds.length; i += 50) {
      const { data, error } = await client().from("dealer_network_troubleshooting_comments")
        .select(`${activityColumns},member_name_snapshot,company_name_snapshot,parent:dealer_network_troubleshooting_entries!inner(status)`)
        .eq("parent.status", "approved")
        .in("entry_id", approvedIds.slice(i, i + 50)).order("slot");
      if (error) throw error;
      all.push(...((data ?? []) as CommentRow[]));
    }
    return all;
  };
  const [updates, comments, revisions] = await Promise.all([
    readTroubleshootingUpdates(scope, memberId),
    commentsFetch(),
    readTroubleshootingRevisions(owned.map((entry) => entry.id)),
  ]);
  const updateMap = new Map<string, TroubleshootingUpdate[]>();
  const commentMap = new Map<string, TroubleshootingComment[]>();
  for (const { entry_id, id, body, created_at } of updates) {
    if (!updateMap.has(entry_id)) updateMap.set(entry_id, []);
    updateMap.get(entry_id)!.push({ id, body, createdAt: created_at });
  }
  for (const { entry_id, id, body, created_at, member_name_snapshot, company_name_snapshot } of comments) {
    if (!commentMap.has(entry_id)) commentMap.set(entry_id, []);
    commentMap.get(entry_id)!.push({ id, body, createdAt: created_at, memberName: member_name_snapshot, companyName: company_name_snapshot });
  }

  const enrich = (entry: TroubleshootingEntry): MemberTroubleshootingEntry => {
    const isOwner = entry.memberId === memberId;
    return {
      ...entry, isOwner, updates: updateMap.get(entry.id) ?? [], comments: commentMap.get(entry.id) ?? [],
      ...(isOwner && revisions.has(entry.id) ? { pendingRevision: revisions.get(entry.id) } : {}),
    };
  };
  return { entries: approved.map(enrich), ownEntries: owned.map(enrich) };
}

function activityError(error: { message: string }) {
  switch (error.message) {
    case "troubleshooting_entry_unavailable":
      return new MemberAccessError(404, "This troubleshooting entry is unavailable.");
    case "troubleshooting_owner_required":
      return new MemberAccessError(403, "Only the original author can update this issue.");
    case "troubleshooting_comment_requires_non_owner":
      return new MemberAccessError(403, "Authors should use Update to add information to their own issue.");
    case "troubleshooting_member_unavailable":
      return new MemberAccessError(403, "Member access is restricted.");
    case "troubleshooting_comment_limit":
      return new MemberAccessError(409, "This issue already has five comments.");
    case "troubleshooting_invalid_edit":
    case "troubleshooting_invalid_note":
    case "troubleshooting_invalid_comment":
      return new MemberAccessError(400, "Check the submitted text and try again.");
    default:
      return error;
  }
}

export async function editOwnTroubleshootingText(entryId: string, memberId: string, raw: unknown) {
  const patch = validateTroubleshootingTextEdit(raw);
  if (!validateUuid(entryId) || !patch) throw new MemberAccessError(400, "Complete the original issue fields to save the edit.");
  const { data, error } = await client().rpc("dealer_network_update_troubleshooting_text", {
    p_entry_id: entryId, p_member_id: memberId, p_patch: patch,
  });
  if (error) throw activityError(error);
  if (data !== "saved" && data !== "pending_review") throw new Error("Unexpected edit result");
  return data;
}

export async function appendTroubleshootingActivity(entryId: string, memberId: string, raw: unknown) {
  const activity = validateTroubleshootingActivity(raw);
  if (!validateUuid(entryId) || !activity) throw new MemberAccessError(400, "Enter a valid update or a comment of 250 characters or fewer.");
  const rpc = activity.kind === "comment"
    ? "dealer_network_add_troubleshooting_comment"
    : "dealer_network_append_troubleshooting_update";
  const { data, error } = await client().rpc(rpc, {
    p_entry_id: entryId, p_member_id: memberId, p_body: activity.body,
  });
  if (error) throw activityError(error);
  if (typeof data !== "string") throw new Error("Unexpected activity result");
  return { id: data, kind: activity.kind };
}
