"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { IDS_ACTION_CATEGORIES } from "@/lib/ids-action/types";
import {
  optimizeIdsActionImage,
  validateIdsActionSource,
} from "@/lib/ids-action/image-optimization";
import { uploadIdsActionTus } from "@/lib/ids-action/tus-upload";

type Media = {
  id: string;
  media_url: string;
  storage_path: string;
  alt_text: string;
  sort_order: number;
};
type Entry = {
  id?: string;
  title: string;
  description: string;
  category: string;
  location: string;
  event_date: string;
  featured: boolean;
  published: boolean;
  customer_permission_confirmed: boolean;
  sort_order: number;
  ids_action_media: Media[];
};
const blank: Entry = {
  title: "",
  description: "",
  category: "Equipment Demo",
  location: "",
  event_date: "",
  featured: false,
  published: false,
  customer_permission_confirmed: false,
  sort_order: 100,
  ids_action_media: [],
};
const loader = ({ src }: { src: string }) => src;
const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const safeUploadError = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : "Photo upload failed. Please try again.";
  return message
    .replace(
      /(x-signature|authorization|apikey)\s*[:=]\s*\S+/gi,
      "$1: [redacted]",
    )
    .replace(/eyJ[A-Za-z0-9._-]+/g, "[redacted token]");
};

export default function IdsActionAdmin() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [message, setMessage] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const activeUpload = useRef<{ cancel: () => Promise<void> } | null>(null);
  const cancelBatch = useRef(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/ids-in-action");
    if (response.status === 401) {
      setAuthed(false);
      return;
    }
    const payload = await response.json();
    if (response.ok) {
      setEntries(payload.entries);
      setAuthed(true);
    } else setMessage(payload.error);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function login(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/reviews/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (response.ok) {
      setPassword("");
      await load();
    } else setMessage("Invalid password.");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    const body = {
      title: editing.title,
      description: editing.description || null,
      category: editing.category,
      location: editing.location || null,
      eventDate: editing.event_date || null,
      featured: editing.featured,
      published: editing.published,
      customerPermissionConfirmed: editing.customer_permission_confirmed,
      sortOrder: Number(editing.sort_order),
    };
    const response = await fetch(
      editing.id
        ? `/api/admin/ids-in-action/${editing.id}`
        : "/api/admin/ids-in-action",
      {
        method: editing.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.ok) {
      setMessage("Entry saved.");
      setEditing(null);
      await load();
    } else
      setMessage(
        payload.error || Object.values(payload.errors || {}).join(" "),
      );
  }
  async function cleanupUpload(entryId: string, path: string) {
    await fetch(`/api/admin/ids-in-action/${entryId}/upload`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
    }).catch(() => undefined);
  }
  async function upload(files: FileList) {
    if (!editing?.id || busy) return;
    const entryId = editing.id;
    const entryTitle = editing.title;
    const initialMediaCount = editing.ids_action_media.length;
    const selected = Array.from(files);
    let succeeded = 0;
    let failed = 0;
    const failureReasons: string[] = [];
    cancelBatch.current = false;
    setUploadMessage("");
    setBusy(true);
    for (let index = 0; index < selected.length; index += 1) {
      if (cancelBatch.current) break;
      const source = selected[index];
      let optimized: File;
      try {
        setUploadMessage(`Preparing photo ${index + 1} of ${selected.length}…`);
        validateIdsActionSource(source);
        setUploadMessage(`Optimizing photo ${index + 1} of ${selected.length}…`);
        optimized = await optimizeIdsActionImage(source);
        setUploadMessage(
          `Optimized ${formatMb(source.size)} → ${formatMb(optimized.size)}. Preparing upload ${index + 1} of ${selected.length}…`,
        );
      } catch (error) {
        failed += 1;
        const reason = safeUploadError(error);
        failureReasons.push(reason);
        setUploadMessage(
          `Photo ${index + 1} failed before upload started: ${reason}`,
        );
        continue;
      }
      let signed:
        | {
            path: string;
            token: string;
            publicUrl: string;
            tusEndpoint: string;
          }
        | undefined;
      let uploadBegan = false;
      try {
        const prep = await fetch(`/api/admin/ids-in-action/${entryId}/upload`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: optimized.name,
            type: optimized.type,
            size: optimized.size,
          }),
        });
        const payload = await prep.json();
        if (!prep.ok)
          throw new Error(payload.error || "Upload could not be prepared.");
        const signedUpload = payload as {
          path: string;
          token: string;
          publicUrl: string;
          tusEndpoint: string;
        };
        signed = signedUpload;
        const task = uploadIdsActionTus({
          file: optimized,
          tusEndpoint: signedUpload.tusEndpoint,
          bucket: "ids-action-media",
          path: signedUpload.path,
          signedToken: signedUpload.token,
          onProgress: (percent) => {
            uploadBegan = true;
            setUploadMessage(
              `Uploading photo ${index + 1} of ${selected.length} — ${percent}%`,
            );
          },
          onRetry: () =>
            setUploadMessage(
              `Connection interrupted. Retrying photo ${index + 1} of ${selected.length}…`,
            ),
        });
        activeUpload.current = task;
        await task.promise;
        activeUpload.current = null;
        if (cancelBatch.current) throw new Error("Upload cancelled.");
        setUploadMessage(`Attaching photo ${index + 1} of ${selected.length}…`);
        const attachment = await fetch(
          `/api/admin/ids-in-action/${entryId}/media`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              mediaType: "image",
              mediaUrl: signedUpload.publicUrl,
              storagePath: signedUpload.path,
              type: optimized.type,
              size: optimized.size,
              altText: entryTitle,
              sortOrder: (initialMediaCount + succeeded) * 10 + 10,
            }),
          },
        );
        const attachmentPayload = await attachment.json().catch(() => ({}));
        if (!attachment.ok) {
          await cleanupUpload(entryId, signedUpload.path);
          throw new Error(
            attachmentPayload.error || "Photo could not be attached.",
          );
        }
        succeeded += 1;
      } catch (error) {
        activeUpload.current = null;
        failed += 1;
        if (signed) await cleanupUpload(entryId, signed.path);
        const reason = safeUploadError(error);
        failureReasons.push(reason);
        setUploadMessage(
          `Photo ${index + 1} ${uploadBegan ? "upload failed" : "failed before upload started"}: ${reason}`,
        );
      }
    }
    setBusy(false);
    activeUpload.current = null;
    await load();
    const response = await fetch("/api/admin/ids-in-action");
    const payload = await response.json().catch(() => ({}));
    const item = payload.entries?.find(
      (candidate: Entry) => candidate.id === entryId,
    );
    if (item) setEditing(item);
    if (cancelBatch.current)
      setUploadMessage(
        succeeded
          ? `${succeeded} photo${succeeded === 1 ? "" : "s"} uploaded successfully. Remaining uploads cancelled.`
          : "Upload cancelled.",
      );
    else if (failed)
      setUploadMessage(
        `${succeeded} of ${selected.length} photos uploaded successfully. ${failed} failed: ${failureReasons.join("; ")}`,
      );
    else
      setUploadMessage(
        `${succeeded} photo${succeeded === 1 ? "" : "s"} uploaded successfully.`,
      );
  }
  async function cancelUploads() {
    cancelBatch.current = true;
    setUploadMessage("Cancelling upload…");
    await activeUpload.current?.cancel();
  }
  async function removeEntry(id: string) {
    if (!confirm("Delete this entry and all of its photos?")) return;
    const response = await fetch(`/api/admin/ids-in-action/${id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      setEditing(null);
      await load();
    } else setMessage("Entry could not be deleted.");
  }
  async function savePhoto(media: Media) {
    const response = await fetch(`/api/admin/ids-in-action/media/${media.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        altText: media.alt_text,
        sortOrder: Number(media.sort_order),
      }),
    });
    setMessage(
      response.ok ? "Photo details saved." : "Photo could not be updated.",
    );
    if (response.ok) await load();
  }
  async function removePhoto(id: string) {
    const response = await fetch(`/api/admin/ids-in-action/media/${id}`, {
      method: "DELETE",
    });
    if (response.ok && editing)
      setEditing({
        ...editing,
        ids_action_media: editing.ids_action_media.filter(
          (media) => media.id !== id,
        ),
      });
    else setMessage("Photo could not be removed.");
  }

  if (authed === null) return <main className="p-8">Loading admin…</main>;
  if (!authed)
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <form
          onSubmit={login}
          className="mx-auto max-w-md rounded-3xl bg-white p-8"
        >
          <p className="font-bold uppercase text-emerald-700">IDS Admin</p>
          <h1 className="mt-2 text-4xl font-black">IDS in Action</h1>
          <label className="mt-6 block font-bold">
            Admin password
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border p-3"
            />
          </label>
          <button className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 font-black text-white">
            Sign In
          </button>
          {message && (
            <p role="alert" className="mt-3 text-red-700">
              {message}
            </p>
          )}
        </form>
      </main>
    );
  return (
    <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="font-bold uppercase tracking-[.2em] text-emerald-700">
              IDS Admin
            </p>
            <h1 className="text-4xl font-black">IDS in Action</h1>
          </div>
          <button
            onClick={() => setEditing({ ...blank })}
            className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white"
          >
            Create Entry
          </button>
        </div>
        {message && (
          <p role="status" className="mt-5 rounded-xl bg-white p-4 font-bold">
            {message}
          </p>
        )}
        <div className="mt-7 space-y-4">
          {entries.map((entry) => (
            <article
              key={entry.id}
              className="flex flex-wrap items-center gap-4 rounded-3xl bg-white p-5 shadow-sm"
            >
              {entry.ids_action_media?.[0] ? (
                <Image
                  loader={loader}
                  unoptimized
                  src={entry.ids_action_media[0].media_url}
                  alt=""
                  width={120}
                  height={90}
                  className="h-20 w-28 rounded-xl object-cover"
                />
              ) : (
                <div className="h-20 w-28 rounded-xl bg-slate-200" />
              )}
              <div className="min-w-52 flex-1">
                <h2 className="text-xl font-black">{entry.title}</h2>
                <p className="text-sm text-slate-500">
                  {entry.category} · {entry.published ? "Published" : "Draft"} ·{" "}
                  {entry.featured ? "Featured" : "Not featured"} ·{" "}
                  {entry.ids_action_media?.length || 0} photos
                </p>
              </div>
              <button
                onClick={() => setEditing(entry)}
                className="rounded-xl border px-4 py-3 font-black"
              >
                Edit
              </button>
            </article>
          ))}
        </div>
        {editing && (
          <form
            onSubmit={save}
            className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/70 p-3 md:p-6"
          >
            <div className="mx-auto max-w-4xl rounded-3xl bg-white p-5 md:p-8">
              <div className="flex justify-between gap-4">
                <h2 className="text-2xl font-black">
                  {editing.id ? "Edit" : "Create"} IDS in Action Entry
                </h2>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="font-black"
                >
                  Close
                </button>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="font-bold md:col-span-2">
                  Title
                  <input
                    required
                    maxLength={120}
                    value={editing.title}
                    onChange={(event) =>
                      setEditing({ ...editing, title: event.target.value })
                    }
                    className="mt-1 w-full rounded-xl border p-3"
                  />
                </label>
                <label className="font-bold md:col-span-2">
                  Description
                  <textarea
                    maxLength={2000}
                    value={editing.description || ""}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        description: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border p-3"
                  />
                </label>
                <label className="font-bold">
                  Category
                  <select
                    value={editing.category}
                    onChange={(event) =>
                      setEditing({ ...editing, category: event.target.value })
                    }
                    className="mt-1 w-full rounded-xl border p-3"
                  >
                    {IDS_ACTION_CATEGORIES.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label className="font-bold">
                  General location
                  <input
                    maxLength={120}
                    value={editing.location || ""}
                    onChange={(event) =>
                      setEditing({ ...editing, location: event.target.value })
                    }
                    className="mt-1 w-full rounded-xl border p-3"
                  />
                </label>
                <label className="font-bold">
                  Event date
                  <input
                    type="date"
                    value={editing.event_date || ""}
                    onChange={(event) =>
                      setEditing({ ...editing, event_date: event.target.value })
                    }
                    className="mt-1 w-full rounded-xl border p-3"
                  />
                </label>
                <label className="font-bold">
                  Sort order
                  <input
                    type="number"
                    min="0"
                    value={editing.sort_order}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        sort_order: Number(event.target.value),
                      })
                    }
                    className="mt-1 w-full rounded-xl border p-3"
                  />
                </label>
              </div>
              <div className="mt-5 flex flex-wrap gap-5">
                <label className="flex gap-2 font-bold">
                  <input
                    type="checkbox"
                    checked={editing.customer_permission_confirmed}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        customer_permission_confirmed: event.target.checked,
                      })
                    }
                  />
                  Customer / Property Media Permission Confirmed
                </label>
                <label className="flex gap-2 font-bold">
                  <input
                    type="checkbox"
                    checked={editing.published}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        published: event.target.checked,
                      })
                    }
                  />
                  Published
                </label>
                <label className="flex gap-2 font-bold">
                  <input
                    type="checkbox"
                    checked={editing.featured}
                    onChange={(event) =>
                      setEditing({ ...editing, featured: event.target.checked })
                    }
                  />
                  Featured on homepage
                </label>
              </div>
              <button
                disabled={busy}
                className="mt-6 rounded-xl bg-emerald-600 px-5 py-3 font-black text-white"
              >
                {busy ? "Working…" : "Save Entry"}
              </button>
              {editing.id && (
                <>
                  <section className="mt-8 border-t pt-6">
                    <h3 className="text-xl font-black">Photos</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      JPEG, PNG, or WebP — up to 50 MB per photo. Large photos
                      are automatically optimized for fast web viewing.
                      HEIC/HEIF must be converted first. Lower sort order is
                      primary.
                    </p>
                    {uploadMessage && (
                      <div
                        role="status"
                        className="mt-4 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-bold"
                      >
                        {uploadMessage}
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <input
                        disabled={busy}
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) => {
                          if (event.target.files)
                            void upload(event.target.files);
                          event.target.value = "";
                        }}
                        className="block max-w-full"
                      />
                      {busy && (
                        <button
                          type="button"
                          onClick={() => void cancelUploads()}
                          className="rounded-lg bg-amber-600 px-4 py-2 font-bold text-white"
                        >
                          Cancel Uploads
                        </button>
                      )}
                    </div>
                    <div className="mt-5 space-y-4">
                      {editing.ids_action_media?.map((media) => (
                        <div
                          key={media.id}
                          className="grid gap-3 rounded-2xl border p-3 sm:grid-cols-[120px_1fr_auto]"
                        >
                          <Image
                            loader={loader}
                            unoptimized
                            src={media.media_url}
                            alt=""
                            width={120}
                            height={90}
                            className="h-24 w-full rounded-xl object-cover"
                          />
                          <div>
                            <label className="block text-sm font-bold">
                              Alt text
                              <input
                                maxLength={200}
                                value={media.alt_text}
                                onChange={(event) =>
                                  setEditing({
                                    ...editing,
                                    ids_action_media:
                                      editing.ids_action_media.map((item) =>
                                        item.id === media.id
                                          ? {
                                              ...item,
                                              alt_text: event.target.value,
                                            }
                                          : item,
                                      ),
                                  })
                                }
                                className="mt-1 w-full rounded-lg border p-2"
                              />
                            </label>
                            <label className="mt-2 block text-sm font-bold">
                              Photo order
                              <input
                                type="number"
                                min="0"
                                value={media.sort_order}
                                onChange={(event) =>
                                  setEditing({
                                    ...editing,
                                    ids_action_media:
                                      editing.ids_action_media.map((item) =>
                                        item.id === media.id
                                          ? {
                                              ...item,
                                              sort_order: Number(
                                                event.target.value,
                                              ),
                                            }
                                          : item,
                                      ),
                                  })
                                }
                                className="ml-2 w-24 rounded-lg border p-2"
                              />
                            </label>
                          </div>
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => void savePhoto(media)}
                              className="rounded-lg border px-3 py-2 font-bold"
                            >
                              Save Photo
                            </button>
                            <button
                              type="button"
                              onClick={() => void removePhoto(media.id)}
                              className="rounded-lg bg-red-700 px-3 py-2 font-bold text-white"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                  <button
                    type="button"
                    onClick={() => void removeEntry(editing.id!)}
                    className="mt-8 rounded-xl bg-red-700 px-5 py-3 font-black text-white"
                  >
                    Delete Entry
                  </button>
                </>
              )}
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
