"use client";

import { useId, useState, type FormEvent } from "react";
import {
  TROUBLESHOOTING_COMMENT_LENGTH,
  TROUBLESHOOTING_COMMENT_LIMIT,
  TROUBLESHOOTING_UPDATE_LENGTH,
  troubleshootingCharacterCount,
  troubleshootingTextFields,
} from "@/lib/dealer-network/troubleshooting-activity-validation";
import { TROUBLESHOOTING_DESCRIPTION_LIMIT, TROUBLESHOOTING_TITLE_LIMIT } from "@/lib/dealer-network/troubleshooting-validation";
import type { MemberTroubleshootingEntry, TroubleshootingTextFields, TroubleshootingUpdate } from "@/lib/dealer-network/types";

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus-visible:outline-2 focus-visible:outline-emerald-700";
const buttonClass = "mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50";
const summaryClass = "cursor-pointer font-bold text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";

type Refresh = (saved?: boolean) => void;

class ActivityRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function saveTroubleshootingActivity(entryId: string, method: "PATCH" | "POST", body: unknown) {
  const response = await fetch(`/api/dealer-network/member/troubleshooting/${encodeURIComponent(entryId)}/activity`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new ActivityRequestError(response.status, result.error ?? "Could not save the change.");
  return result as { id?: string; status?: "saved" | "pending_review" };
}

function When({ date }: { date: string }) {
  return <time dateTime={date} className="text-xs text-slate-500">{new Date(date).toLocaleString()}</time>;
}

export function TroubleshootingUpdates({ updates }: { updates: TroubleshootingUpdate[] }) {
  if (!updates.length) return null;
  return (
    <section aria-label="Author updates" className="mt-5 border-t border-slate-200 pt-4">
      <h4 className="font-bold text-slate-900">Author Updates</h4>
      <ol className="mt-2 space-y-2">
        {updates.map((update) => (
          <li key={update.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <When date={update.createdAt} />
            <p className="whitespace-pre-wrap break-words">{update.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ActivityForm({ entryId, kind, onSaved }: { entryId: string; kind: "update" | "comment"; onSaved: Refresh }) {
  const counterId = useId();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const isComment = kind === "comment";
  const max = isComment ? TROUBLESHOOTING_COMMENT_LENGTH : TROUBLESHOOTING_UPDATE_LENGTH;
  const count = troubleshootingCharacterCount(value);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !value.trim() || count > max) return;
    setFeedback("");
    setSaving(true);
    setFailed(false);
    try {
      await saveTroubleshootingActivity(entryId, "POST", { kind, body: value });
      setValue("");
      setFeedback(isComment ? "Comment added." : "Dealer-only update added.");
      onSaved();
    } catch (error) {
      setFailed(true);
      setFeedback(error instanceof Error ? error.message : "Could not save the change.");
      if (isComment && error instanceof ActivityRequestError && error.status === 409) onSaved(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3">
      <label className="block text-sm font-semibold">
        {isComment ? "Add a comment" : "Add a dated update"}
        <textarea aria-describedby={counterId} required rows={3} value={value} className={inputClass}
          onChange={(event) => setValue(Array.from(event.target.value).slice(0, max).join(""))} />
      </label>
      <p id={counterId} className="mt-1 text-right text-xs text-slate-600">{count}/{max} characters</p>
      {isComment && <p className="mt-1 text-xs text-slate-600">Keep it relevant to this issue. Share a troubleshooting step, result, or fix.</p>}
      <button className={buttonClass} disabled={saving || !value.trim()}>
        {saving ? "Saving…" : isComment ? "Post Comment" : "Add Update"}
      </button>
      {feedback && <p role={failed ? "alert" : "status"} className="mt-2 text-sm">{feedback}</p>}
    </form>
  );
}

export function TroubleshootingComments({ entry, onSaved }: { entry: MemberTroubleshootingEntry; onSaved: Refresh }) {
  const count = entry.comments.length;
  return (
    <details className="mt-5 rounded-xl border border-slate-200 px-3 py-2">
      <summary className={summaryClass}>Comments {count}/{TROUBLESHOOTING_COMMENT_LIMIT}</summary>
      {count > 0 && (
        <ol className="mt-3 space-y-2">
          {entry.comments.map((comment) => (
            <li key={comment.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <p className="font-semibold">{comment.memberName} · {comment.companyName}</p>
              <When date={comment.createdAt} />
              <p className="whitespace-pre-wrap break-words">{comment.body}</p>
            </li>
          ))}
        </ol>
      )}
      {entry.isOwner
        ? <p className="mt-2 text-sm text-slate-600">Use Update under My Troubleshooting Submissions to add information to your post.</p>
        : count >= TROUBLESHOOTING_COMMENT_LIMIT
          ? <p className="mt-2 text-sm text-slate-600">This issue has reached its five-comment limit.</p>
          : <ActivityForm entryId={entry.id} kind="comment" onSaved={onSaved} />}
    </details>
  );
}

const fields: { name: keyof TroubleshootingTextFields; label: string; max?: number; description?: boolean }[] = [
  { name: "title", label: "Issue Title", max: TROUBLESHOOTING_TITLE_LIMIT },
  { name: "brand", label: "Brand", max: 120 },
  { name: "model", label: "Model", max: 160 },
  { name: "issueDate", label: "Issue Date" },
  { name: "firmwareSoftwareVersion", label: "Machine Firmware / Software Version", max: 160 },
  { name: "systemArea", label: "System Having the Issue", max: 160 },
  { name: "badPart", label: "Exact Part That Was Bad (if applicable)", max: 200 },
  { name: "issueDescription", label: "Issue", description: true, max: TROUBLESHOOTING_DESCRIPTION_LIMIT },
  { name: "fixDescription", label: "Fix", description: true, max: TROUBLESHOOTING_DESCRIPTION_LIMIT },
];

function OriginalTextEditor({ entry, onSaved }: { entry: MemberTroubleshootingEntry; onSaved: Refresh }) {
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const source = entry.pendingRevision?.patch ?? entry;
  const approved = entry.status === "approved";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || saved) return;
    setFeedback("");
    setSaving(true);
    setFailed(false);
    const form = new FormData(event.currentTarget);
    const patch = Object.fromEntries(Object.keys(troubleshootingTextFields).map((field) => [field, form.get(field)]));
    try {
      const result = await saveTroubleshootingActivity(entry.id, "PATCH", patch);
      setSaved(true);
      setFeedback(result.status === "pending_review" ? "Edit sent to IDS for review. The current version remains visible." : "Original text updated.");
      onSaved();
    } catch (error) {
      setFailed(true);
      setFeedback(error instanceof Error ? error.message : "Could not save the edit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="mt-3 rounded-lg border border-slate-200 px-3 py-2">
      <summary className={summaryClass}>Edit original issue text</summary>
      <p className="mt-2 text-xs text-slate-600">
        {approved ? "IDS reviews edits to approved posts. The current version remains unchanged until review." : "Editing text does not change the submission’s approval status."} Photos are unchanged.
      </p>
      <form onSubmit={submit} onChange={() => { if (saved) { setSaved(false); setFeedback(""); } }} className="mt-3 space-y-3">
        {fields.map(({ name, label, max, description }) => (
          <label key={name} className="block text-sm font-semibold">
            {label}
            {description ? <textarea name={name} defaultValue={source[name] ?? ""} rows={4} required maxLength={max} className={inputClass} />
              : <input name={name} defaultValue={source[name] ?? ""} type={name === "issueDate" ? "date" : "text"}
                max={name === "issueDate" ? new Date().toISOString().slice(0, 10) : undefined}
                required={name !== "badPart"} minLength={name === "title" ? 3 : undefined} maxLength={max} className={inputClass} />}
          </label>
        ))}
        <button className={buttonClass} disabled={saving || saved}>
          {saving ? "Saving…" : saved ? "Edit Submitted" : approved ? "Send Edit for Review" : "Save Original Text"}
        </button>
        {feedback && <p role={failed ? "alert" : "status"} className="text-sm">{feedback}</p>}
      </form>
    </details>
  );
}

export function OwnerTroubleshootingActivity({ entry, onSaved }: { entry: MemberTroubleshootingEntry; onSaved: Refresh }) {
  if (!entry.isOwner) return null;
  return (
    <>
      {!!entry.pendingRevision && <p className="mt-2 text-xs font-semibold text-amber-800">Original text edit awaiting IDS review</p>}
      <details className="mt-3 rounded-xl border border-emerald-200 px-3 py-2">
        <summary className={summaryClass}>Update</summary>
        <p className="mt-2 text-sm text-slate-600">Edit the original text or add a separate dated note. Notes stay in the Dealer Portal and do not use comment slots.</p>
        <OriginalTextEditor entry={entry} onSaved={onSaved} />
        <ActivityForm entryId={entry.id} kind="update" onSaved={onSaved} />
        <TroubleshootingUpdates updates={entry.updates} />
      </details>
    </>
  );
}
