"use client";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from "react";
import {
  BOARD_BRANCH_LIMIT, BOARD_REPLY_LIMIT, boardPhotoLimit, boardTextCount, boardTextLimit,
  boardTopicFilter, boardVisibleBranchCount, filterBoardTopics, type BoardFilter,
  type BoardMemberComment, type BoardMemberTopic,
} from "@/lib/dealer-network/board-member";
import { messageFileType, validateMessageFiles } from "@/lib/dealer-network/messaging-validation";
import { uploadMessagePhoto } from "@/lib/dealer-network/message-upload";
import type { MessageUploadTicket } from "@/lib/dealer-network/types";

const path = "/api/dealer-network/member/board";
const field = "w-full rounded-xl border p-2 focus-visible:outline-2 focus-visible:outline-emerald-700";
const boardLink = (id: string) => `/dealer-tech-resources/member?boardTopic=${encodeURIComponent(id)}`;

async function request(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url, {
    method, cache: "no-store",
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new BoardRequestError(response.status, result.error ?? "The Board request failed.");
  return result;
}
class BoardRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function BoardComposer({ discussionId, parent, onSaved }: {
  discussionId: string; parent: string | null; onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [progress, setProgress] = useState("");
  const counterId = useId();
  const photoInput = useRef<HTMLInputElement>(null);
  const max = boardTextLimit(parent), photoMax = boardPhotoLimit(parent);
  const count = boardTextCount(draft);
  const label = parent ? "Reply" : "Comment";

  async function post(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !count || count > max) return;
    setBusy(true); setError(""); setSaved("");
    const endpoint = `${path}/discussions/${discussionId}`;
    let tickets: MessageUploadTicket[] = [];
    let uploaded = false, committed = false;
    try {
      if (photos.length) {
        const prepared: {bucket:string; tickets:MessageUploadTicket[]} = await request(`${endpoint}/uploads`, "POST", {
          parentCommentId: parent,
          files: photos.map(file => ({contentType: messageFileType(file), byteSize:file.size})),
        });
        tickets = prepared.tickets;
        if (prepared.bucket !== "dealer-network-board-private" || tickets.length !== photos.length)
          throw new Error("The photo upload could not be prepared.");
        for (const [i, ticket] of tickets.entries()) {
          const file = photos[i], contentType = messageFileType(file)!;
          const typedFile = file.type === contentType ? file : new File([file], file.name, {type:contentType});
          await uploadMessagePhoto({file:typedFile, bucket:prepared.bucket, endpoint:ticket.signedUrl, path:ticket.path, token:ticket.token,
            onProgress: percent => setProgress(`Photo ${i+1} of ${photos.length}: ${percent}%`)}).promise;
        }
        uploaded = true;
        setProgress("Verifying photo uploads…");
      }
      await request(`${endpoint}/comments`, "POST", {body:draft, parentCommentId:parent, uploadIds:tickets.map(ticket => ticket.id)});
      committed = true;
      setDraft(""); setPhotos([]);
      if (photoInput.current) photoInput.current.value = "";
      setSaved(`${label} added.`);
      await onSaved();
    } catch (failure) {
      setError(committed ? `${label} was saved. Refresh this page to see it.` : failure instanceof Error ? failure.message : `Could not post the ${label.toLowerCase()}.`);
      // Only cancel on a known failed upload or an explicit rejected save. On a lost response,
      // the DB may already have consumed the upload; the server also refuses consumed cancellations.
      if (!committed && (!uploaded || failure instanceof BoardRequestError)) {
        await Promise.allSettled(tickets.map(ticket => request(`${path}/uploads/${ticket.id}`, "DELETE")));
      }
      if (failure instanceof BoardRequestError && failure.status === 409) await onSaved().catch(() => {});
    } finally { setBusy(false); setProgress(""); }
  }

  return <form onSubmit={post} className="mt-4 space-y-2">
    <label className="block text-sm font-bold">
      {parent ? "Reply" : "Add a comment"}
      <textarea name="body" aria-describedby={counterId} rows={parent ? 2 : 3} required className={field}
        value={draft} onChange={event => setDraft(event.target.value)} />
    </label>
    <p id={counterId} className={`text-right text-xs ${count > max ? "font-bold text-red-700" : "text-slate-600"}`}>{count}/{max} characters</p>
    <label className="block text-sm font-semibold">
      {parent ? "Add one photo (optional)" : "Add up to 3 photos (optional)"}
      <input ref={photoInput} type="file" multiple={!parent} accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        disabled={busy} className="mt-1 block w-full text-sm" onChange={event => {
          const next = Array.from(event.target.files ?? []);
          const failure = next.length > photoMax ? `Attach at most ${photoMax} photo${photoMax === 1 ? "" : "s"}.` : validateMessageFiles(next);
          setError(failure ?? "");
          if (failure) { setPhotos([]); event.target.value = ""; } else setPhotos(next);
        }} />
    </label>
    {progress && <p role="status" className="text-sm">{progress}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {saved && <p role="status" className="text-sm">{saved}</p>}
    <button disabled={busy || !count || count > max} className="rounded-xl bg-slate-950 px-4 py-2 font-black text-white disabled:opacity-50">
      {busy ? "Posting…" : label}
    </button>
  </form>;
}

export default function DealerNetworkBoardPanel({ onMessage, selectedTopicId, onSelectedTopicHandled, onAttentionChanged, onPrivateMessage }: {
  onMessage: (message: string) => void; selectedTopicId: string | null;
  onSelectedTopicHandled: () => void; onAttentionChanged: () => Promise<void>;
  onPrivateMessage?: (memberId: string) => void;
}) {
  const [topics, setTopics] = useState<BoardMemberTopic[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<BoardFilter>("active");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editingBusy, setEditingBusy] = useState(false);
  const [focusedTopicId, setFocusedTopicId] = useState<string | null>(null);
  const picked = useRef<string | null>(null);
  const load = useCallback(async () => {
    const data = await request(path);
    setTopics(data.topics ?? []);
    setLoaded(true);
  }, []);
  useEffect(() => { void load().catch(error => onMessage(error.message)); }, [load, onMessage]);

  const openTopic = useCallback(async (topic: BoardMemberTopic) => {
    setFilter(boardTopicFilter(topic));
    setSearch("");
    setFocusedTopicId(topic.id);
    window.history.replaceState(window.history.state, "", boardLink(topic.id));
    window.requestAnimationFrame(() => document.getElementById(`board-topic-${topic.id}`)?.scrollIntoView({ block: "start" }));
    try {
      await request(`${path}/${topic.id}/read`, "PATCH");
      await Promise.all([load(), onAttentionChanged()]);
    } catch (error) { onMessage(error instanceof Error ? error.message : "Could not mark the topic as read."); }
  }, [load, onAttentionChanged, onMessage]);

  useEffect(() => {
    if (!selectedTopicId) { picked.current = null; return; }
    if (!loaded || picked.current === selectedTopicId) return;
    picked.current = selectedTopicId;
    const target = topics.find(topic => topic.id === selectedTopicId);
    if (target) void openTopic(target);
    else onMessage("That Board topic is unavailable to this account.");
    onSelectedTopicHandled();
  }, [loaded, onMessage, onSelectedTopicHandled, openTopic, selectedTopicId, topics]);

  function openFromCard(event: MouseEvent<HTMLAnchorElement>, topic: BoardMemberTopic) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); void openTopic(topic);
  }

  async function vote(pollId: string, optionId: string) {
    try {
      await request(`${path}/polls/${pollId}/vote`, "PUT", {optionId});
      onMessage("Response received."); await Promise.all([load(), onAttentionChanged()]);
    } catch (error) { onMessage(error instanceof Error ? error.message : "Response failed."); }
  }
  async function saveEdit(item: BoardMemberComment) {
    if (editingBusy || !boardTextCount(editBody) || boardTextCount(editBody) > boardTextLimit(item.parentCommentId)) return;
    setEditingBusy(true);
    try {
      await request(`${path}/comments/${item.id}`, "PATCH", {body:editBody});
      setEditing(null); setEditBody(""); onMessage("Comment updated."); await load();
    } catch (error) { onMessage(error instanceof Error ? error.message : "Edit failed."); }
    finally { setEditingBusy(false); }
  }
  async function deleteComment(commentId: string) {
    if (!window.confirm("Delete your comment? Replies and thread structure will be preserved.")) return;
    try { await request(`${path}/comments/${commentId}`, "DELETE"); onMessage("Comment deleted."); await load(); }
    catch (error) { onMessage(error instanceof Error ? error.message : "Delete failed."); }
  }

  function commentCard(topic: BoardMemberTopic, item: BoardMemberComment) {
    const reply = Boolean(item.parentCommentId);
    const children = reply ? [] : topic.comments.filter(candidate => candidate.parentCommentId === item.id && !candidate.hidden);
    const liveReplies = children.length;
    const open = topic.discussion?.status === "open" && topic.status === "active";
    const max = boardTextLimit(item.parentCommentId);
    const editCount = boardTextCount(editBody);
    return <div key={item.id} className={`${reply ? "ml-6 border-l-2 pl-3" : ""} mt-2 rounded-xl bg-slate-50 p-3`}>
      {item.author && <b>{item.author.firstName}{item.author.companyName ? ` · ${item.author.companyName}` : ""}</b>}
      <p className="text-xs text-slate-500"><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time> {item.edited && "· Edited"}</p>
      {editing === item.id ? <div className="mt-2"><textarea aria-label="Edit comment text" value={editBody} onChange={event => setEditBody(event.target.value)} rows={3} className={field} />
        <p className={`text-right text-xs ${editCount > max ? "text-red-700" : "text-slate-600"}`}>{editCount}/{max} characters</p>
        <div className="mt-2 flex gap-2"><button type="button" disabled={editingBusy || !editCount || editCount > max} onClick={() => void saveEdit(item)} className="font-black text-emerald-700 disabled:opacity-50">Save</button><button type="button" onClick={() => setEditing(null)} className="font-bold">Cancel</button></div>
      </div> : <p className="whitespace-pre-wrap break-words">{item.body}</p>}
      {item.attachments.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{item.attachments.map((photo, index) =>
        <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="block w-28 overflow-hidden rounded-lg border">
          {/* Same-origin private image route. Do not send it to an external image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} width={photo.width} height={photo.height} alt={`Attached photo ${index + 1}`} loading="lazy" className="aspect-square w-full object-contain" />
        </a>)}</div>}
      {editing !== item.id && <div className="mt-2 flex flex-wrap gap-3">
        {item.canEdit && <><button type="button" onClick={() => { setEditing(item.id); setEditBody(item.body); }} className="font-black text-blue-700">Edit</button>
          <button type="button" onClick={() => void deleteComment(item.id)} className="font-black text-red-700">Delete</button></>}
        {item.author?.messageMemberId && onPrivateMessage && <button type="button" onClick={() => onPrivateMessage(item.author!.messageMemberId!)} className="font-bold text-blue-800">Private Message</button>}
      </div>}
      {children.map(child => commentCard(topic, child))}
      {!reply && open && !item.hidden && topic.discussion && (liveReplies < BOARD_REPLY_LIMIT
        ? <BoardComposer discussionId={topic.discussion.id} parent={item.id} onSaved={load} />
        : <p className="mt-3 text-sm text-slate-600">This comment has reached its five-reply limit.</p>)}
    </div>;
  }

  const shown = filterBoardTopics(topics, filter, search, focusedTopicId);
  return <section className="mt-7">
    <div className="rounded-3xl bg-white p-6 shadow-sm"><h2 className="text-3xl font-black">Dealer Network Board</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {(["active","needs","archived"] as const).map(value => <button key={value} type="button" aria-pressed={filter === value}
          onClick={() => setFilter(value)} className={`rounded-xl px-4 py-2 font-black ${filter === value ? "bg-slate-950 text-white" : "border"}`}>
          {value === "needs" ? "Needs My Response" : value === "archived" ? "Archived" : "Active"}
        </button>)}
      </div>
      {filter === "archived" && <input aria-label="Search archive" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search topic history" className="mt-4 w-full rounded-xl border p-3" />}
    </div>
    <div className="mt-5 space-y-5">
      {shown.map(topic => <article id={`board-topic-${topic.id}`} key={topic.id} className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap justify-between gap-3"><h3 className="text-2xl font-black">{topic.title}</h3><b className="uppercase text-emerald-700">{topic.status}</b></div>
        <a href={boardLink(topic.id)} onClick={event => openFromCard(event, topic)} aria-label={`Open topic: ${topic.title}`} className="text-sm font-bold text-blue-800 underline">Open topic</a>
        {topic.announcement && <section className="mt-5 rounded-2xl bg-slate-50 p-4"><b>ANNOUNCEMENT {!topic.isRead && "— NEW"}</b><p className="mt-2 whitespace-pre-wrap">{topic.announcement.body}</p></section>}
        {topic.poll && <section className="mt-5 rounded-2xl border border-blue-200 p-4">
          <b>POLL — {topic.myVoteOptionId ? "RESPONSE RECEIVED" : topic.poll.effectiveOpen ? "RESPONSE NEEDED" : "CLOSED"}</b>
          <h4 className="mt-2 text-lg font-black">{topic.poll.question}</h4><p>{topic.poll.explanation}</p>
          {topic.poll.closes_at && <p className="mt-2 text-sm font-bold">Voting closes: {new Date(topic.poll.closes_at).toLocaleString()}</p>}
          <div className="mt-3 space-y-2">{topic.options.map(option => <button key={option.id}
            disabled={!topic.poll?.effectiveOpen || Boolean(topic.myVoteOptionId && !topic.poll.allow_vote_change)}
            onClick={() => void vote(topic.poll!.id, option.id)}
            className={`block w-full rounded-xl border p-3 text-left disabled:opacity-70 ${topic.myVoteOptionId === option.id ? "border-emerald-600 bg-emerald-50" : ""}`}>
            {option.label} — {option.voteCount}</button>)}</div><p className="mt-2 text-sm">{topic.responseCount} responses</p>
        </section>}
        {topic.discussion && <section className="mt-5 rounded-2xl border border-amber-200 p-4">
          <b>DISCUSSION — {topic.discussion.status === "open" && topic.status === "active" ? "OPEN" : "CLOSED"} — {topic.comments.filter(item => !item.hidden).length} COMMENTS</b>
          <p className="mt-2 whitespace-pre-wrap">{topic.discussion.context}</p>
          <PollSummary topic={topic} />
          <div className="mt-4 space-y-3">{topic.comments.filter(item => !item.parentCommentId && (!item.hidden || topic.comments.some(child => child.parentCommentId === item.id && !child.hidden))).map(item => commentCard(topic, item))}</div>
          {topic.discussion.status === "open" && topic.status === "active" && (boardVisibleBranchCount(topic.comments) < BOARD_BRANCH_LIMIT
            ? <BoardComposer discussionId={topic.discussion.id} parent={null} onSaved={load} />
            : <p className="mt-3 text-sm text-slate-600">This discussion has reached its five-comment limit.</p>)}
        </section>}
        {topic.status === "archived" && <p className="mt-4 font-bold text-slate-500">ARCHIVED — Completed / Archived — read only</p>}
      </article>)}
      {!shown.length && <p className="rounded-3xl bg-white p-6 text-slate-500">{loaded ? "No topics in this view." : "Loading Board topics…"}</p>}
    </div>
  </section>;
}

function PollSummary({ topic }: { topic: BoardMemberTopic }) {
  if (!topic.poll) return null;
  const total = topic.responseCount;
  return <div className="mt-3 rounded-xl bg-blue-50 p-3"><b>Discussion opened from poll</b>
    <p className="font-bold">Poll: {topic.poll.question}</p>
    <p>{topic.poll.effectiveOpen ? "Current / live results" : "Final results"}</p>
    {topic.options.map(option => <p key={option.id}>{option.label} — {option.voteCount} ({total ? Math.round(option.voteCount / total * 1000) / 10 : 0}%)</p>)}
    <p>Responses: {total} / {topic.recipientCount}</p>
  </div>;
}
