"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { uploadMessagePhoto } from "@/lib/dealer-network/message-upload";
import {
  messageFileType,
  validateMessageFiles,
} from "@/lib/dealer-network/messaging-validation";
import {
  TROUBLESHOOTING_DESCRIPTION_LIMIT,
  TROUBLESHOOTING_TITLE_LIMIT,
} from "@/lib/dealer-network/troubleshooting-validation";
import type {
  TroubleshootingEntry,
  TroubleshootingPhotoKind,
  TroubleshootingUploadTicket,
} from "@/lib/dealer-network/types";

const inputClass =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200";
const photoAccept = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

type PreparedFile = {
  file: File;
  photoKind: TroubleshootingPhotoKind;
  position: number;
  contentType: NonNullable<ReturnType<typeof messageFileType>>;
};

export default function TroubleshootingPanel({
  onMessage,
}: {
  onMessage: (value: string) => void;
}) {
  const [entries, setEntries] = useState<TroubleshootingEntry[]>([]);
  const [ownEntries, setOwnEntries] = useState<TroubleshootingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [issuePhotos, setIssuePhotos] = useState<File[]>([]);
  const [fixPhotos, setFixPhotos] = useState<File[]>([]);
  const [issueLength, setIssueLength] = useState(0);
  const [fixLength, setFixLength] = useState(0);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const load = useCallback(async (query = "") => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    const response = await fetch(
      `/api/dealer-network/member/troubleshooting?${params}`,
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "Troubleshooting entries are unavailable.");
    setEntries(payload.entries ?? []);
    setOwnEntries(payload.ownEntries ?? []);
  }, []);

  useEffect(() => {
    void load()
      .catch((error) =>
        onMessage(
          error instanceof Error
            ? error.message
            : "Troubleshooting entries are unavailable.",
        ),
      )
      .finally(() => setLoading(false));
  }, [load, onMessage]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    onMessage("");
    const query = String(new FormData(event.currentTarget).get("query") ?? "").trim();
    try {
      await load(query);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  function choosePhotos(
    next: FileList | null,
    update: (files: File[]) => void,
  ) {
    if (!next) return;
    const error = validateMessageFiles(next);
    if (error) {
      onMessage(error.replace("to a message", "for this section"));
      return;
    }
    update(Array.from(next));
    onMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const issueError = validateMessageFiles(issuePhotos);
    const fixError = validateMessageFiles(fixPhotos);
    if (issueError || fixError) {
      onMessage((issueError ?? fixError)!.replace("to a message", "for each section"));
      return;
    }
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const prepared: PreparedFile[] = [
      ...issuePhotos.map((file, position) => ({
        file,
        photoKind: "issue" as const,
        position,
        contentType: messageFileType(file)!,
      })),
      ...fixPhotos.map((file, position) => ({
        file,
        photoKind: "fix" as const,
        position,
        contentType: messageFileType(file)!,
      })),
    ];
    let tickets: TroubleshootingUploadTicket[] = [];
    const activeUploads: Array<{ cancel: () => void }> = [];
    setSubmitting(true);
    setProgress({});
    onMessage("");
    try {
      if (prepared.length) {
        const ticketResponse = await fetch(
          "/api/dealer-network/member/troubleshooting/uploads",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              files: prepared.map((item) => ({
                photoKind: item.photoKind,
                position: item.position,
                contentType: item.contentType,
                byteSize: item.file.size,
              })),
            }),
          },
        );
        const ticketPayload = await ticketResponse.json().catch(() => ({}));
        if (!ticketResponse.ok)
          throw new Error(ticketPayload.error ?? "Photo upload could not be prepared.");
        tickets = ticketPayload.tickets ?? [];
        if (tickets.length !== prepared.length)
          throw new Error("Photo upload could not be prepared.");
        const ticketBySlot = new Map(
          tickets.map((ticket) => [
            `${ticket.photoKind}:${ticket.position}`,
            ticket,
          ]),
        );
        await Promise.all(
          prepared.map((item) => {
            const ticket = ticketBySlot.get(`${item.photoKind}:${item.position}`);
            if (!ticket) throw new Error("Photo upload could not be prepared.");
            const uploadFile = item.file.type
              ? item.file
              : new File([item.file], item.file.name, {
                  type: item.contentType,
                  lastModified: item.file.lastModified,
                });
            const upload = uploadMessagePhoto({
              file: uploadFile,
              endpoint: ticket.signedUrl,
              bucket: ticketPayload.bucket,
              path: ticket.path,
              token: ticket.token,
              onProgress: (percent) =>
                setProgress((current) => ({
                  ...current,
                  [`${item.photoKind}:${item.position}`]: percent,
                })),
            });
            activeUploads.push(upload);
            return upload.promise;
          }),
        );
      }
      const response = await fetch("/api/dealer-network/member/troubleshooting", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, uploadIds: tickets.map((ticket) => ticket.id) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload.error ?? "Troubleshooting entry could not be submitted.");
      if (!payload.entry) throw new Error("Troubleshooting entry could not be loaded.");
      setOwnEntries((current) => [payload.entry, ...current]);
      form.reset();
      setIssuePhotos([]);
      setFixPhotos([]);
      setIssueLength(0);
      setFixLength(0);
      onMessage("Troubleshooting entry submitted to IDS for approval.");
      tickets = [];
    } catch (error) {
      for (const upload of activeUploads) void upload.cancel();
      await Promise.allSettled(
        tickets.map((ticket) =>
          fetch(`/api/dealer-network/member/troubleshooting/uploads/${ticket.id}`, {
            method: "DELETE",
          }),
        ),
      );
      onMessage(
        error instanceof Error
          ? error.message
          : "Troubleshooting entry could not be submitted.",
      );
    } finally {
      setSubmitting(false);
      setProgress({});
    }
  }

  return (
    <section className="mt-7 space-y-6">
      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-3xl font-black">Troubleshooting Library</h2>
        <p className="mt-2 text-slate-600">
          Search approved member solutions by keywords in the issue title.
        </p>
        <form onSubmit={search} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="troubleshooting-search">
            Search issue titles
          </label>
          <input
            id="troubleshooting-search"
            name="query"
            maxLength={100}
            placeholder="Search issue titles"
            className="w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200"
          />
          <button
            disabled={searching}
            className="rounded-xl bg-slate-950 px-6 py-3 font-black text-white disabled:opacity-50"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </form>
        <div className="mt-6 space-y-4">
          {entries.map((entry) => (
            <TroubleshootingCard key={entry.id} entry={entry} />
          ))}
          {!loading && !entries.length && (
            <p className="rounded-2xl bg-slate-50 p-5 text-slate-600">
              No approved troubleshooting entries matched your search.
            </p>
          )}
          {loading && <p className="text-slate-600">Loading troubleshooting entries…</p>}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">
        <form onSubmit={submit} className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-3xl font-black">Submit a Troubleshooting Entry</h2>
          <p className="mt-3 rounded-xl bg-amber-50 p-4 font-black text-amber-950">
            Please fill out completely.
          </p>
          <p className="mt-3 text-sm text-slate-600">
            IDS must approve your entry before it appears in the searchable library.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="Issue Title" name="title" maxLength={TROUBLESHOOTING_TITLE_LIMIT} />
            <Field label="Brand" name="brand" maxLength={120} />
            <Field label="Model" name="model" maxLength={160} />
            <Field
              label="Date"
              name="issueDate"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
            />
            <Field
              label="Machine Firmware / Software Version"
              name="firmwareSoftwareVersion"
              maxLength={160}
            />
            <label className="font-bold">
              System Having the Issue
              <input
                name="systemArea"
                list="troubleshooting-systems"
                required
                maxLength={160}
                placeholder="Cameras, GPS, motors, etc."
                className={inputClass}
              />
              <datalist id="troubleshooting-systems">
                <option value="Cameras" />
                <option value="GPS" />
                <option value="Motors" />
                <option value="Charging System" />
                <option value="Connectivity" />
                <option value="Cutting System" />
                <option value="Sensors" />
                <option value="Software" />
              </datalist>
            </label>
            <div className="md:col-span-2">
              <Field
                label="Exact Part That Was Bad (if applicable)"
                name="badPart"
                maxLength={200}
                required={false}
              />
            </div>
            <label className="font-bold md:col-span-2">
              Issue
              <textarea
                name="issueDescription"
                required
                rows={7}
                maxLength={TROUBLESHOOTING_DESCRIPTION_LIMIT}
                onChange={(event) => setIssueLength(event.target.value.length)}
                className={inputClass}
              />
              <span className="mt-1 block text-right text-xs font-medium text-slate-500">
                {issueLength}/{TROUBLESHOOTING_DESCRIPTION_LIMIT}
              </span>
            </label>
            <PhotoChooser
              label="Issue Photos"
              files={issuePhotos}
              progress={progress}
              photoKind="issue"
              onFiles={(files) => setIssuePhotos(files)}
              onChoose={(files) => choosePhotos(files, setIssuePhotos)}
            />
            <label className="font-bold md:col-span-2">
              Fix
              <textarea
                name="fixDescription"
                required
                rows={7}
                maxLength={TROUBLESHOOTING_DESCRIPTION_LIMIT}
                onChange={(event) => setFixLength(event.target.value.length)}
                className={inputClass}
              />
              <span className="mt-1 block text-right text-xs font-medium text-slate-500">
                {fixLength}/{TROUBLESHOOTING_DESCRIPTION_LIMIT}
              </span>
            </label>
            <PhotoChooser
              label="Fix Photos"
              files={fixPhotos}
              progress={progress}
              photoKind="fix"
              onFiles={(files) => setFixPhotos(files)}
              onChoose={(files) => choosePhotos(files, setFixPhotos)}
            />
          </div>
          <button
            disabled={submitting}
            className="mt-6 rounded-xl bg-emerald-600 px-6 py-3 font-black text-white disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit to IDS for Approval"}
          </button>
        </form>

        <aside className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black">My Troubleshooting Submissions</h2>
          <div className="mt-5 space-y-3">
            {ownEntries.map((entry) => (
              <article key={entry.id} className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-black">{entry.title}</h3>
                  <Status status={entry.status} />
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {entry.brand} {entry.model} · {entry.issueDate}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Submitted {new Date(entry.createdAt).toLocaleString()}
                </p>
              </article>
            ))}
            {!ownEntries.length && (
              <p className="text-sm text-slate-600">No submissions yet.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function Field({
  label,
  name,
  type = "text",
  maxLength,
  max,
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  maxLength?: number;
  max?: string;
  required?: boolean;
}) {
  return (
    <label className="font-bold">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        max={max}
        className={inputClass}
      />
    </label>
  );
}

function PhotoChooser({
  label,
  files,
  progress,
  photoKind,
  onFiles,
  onChoose,
}: {
  label: string;
  files: File[];
  progress: Record<string, number>;
  photoKind: TroubleshootingPhotoKind;
  onFiles: (files: File[]) => void;
  onChoose: (files: FileList | null) => void;
}) {
  return (
    <div className="rounded-2xl border p-4 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-black">{label}</h3>
          <p className="text-sm text-slate-600">
            Up to 3 photos · 15 MB each · JPEG, PNG, WebP, HEIC, or HEIF
          </p>
        </div>
        <label className="cursor-pointer rounded-xl border px-4 py-2 font-black">
          Choose Photos
          <input
            type="file"
            accept={photoAccept}
            multiple
            className="sr-only"
            onChange={(event) => {
              onChoose(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <div className="mt-3 space-y-2">
        {files.map((file, position) => (
          <div
            key={`${file.name}-${file.lastModified}`}
            className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm"
          >
            <span className="min-w-0 truncate">
              {file.name}
              {progress[`${photoKind}:${position}`]
                ? ` — ${progress[`${photoKind}:${position}`]}%`
                : ""}
            </span>
            <button
              type="button"
              onClick={() => onFiles(files.filter((_, index) => index !== position))}
              className="font-black text-red-700"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TroubleshootingCard({ entry }: { entry: TroubleshootingEntry }) {
  return (
    <article className="rounded-3xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-black">{entry.title}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {entry.brand} {entry.model} · {entry.issueDate} · {entry.systemArea}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Shared by {entry.memberName} · {entry.companyName}
          </p>
        </div>
        <Status status={entry.status} />
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-black">Firmware / Software</dt>
          <dd className="text-slate-700">{entry.firmwareSoftwareVersion}</dd>
        </div>
        {entry.badPart && (
          <div>
            <dt className="font-black">Bad Part</dt>
            <dd className="text-slate-700">{entry.badPart}</dd>
          </div>
        )}
      </dl>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <SolutionSection
          title="Issue"
          text={entry.issueDescription}
          photos={entry.photos.filter((photo) => photo.photoKind === "issue")}
        />
        <SolutionSection
          title="Fix"
          text={entry.fixDescription}
          photos={entry.photos.filter((photo) => photo.photoKind === "fix")}
        />
      </div>
    </article>
  );
}

function SolutionSection({
  title,
  text,
  photos,
}: {
  title: string;
  text: string;
  photos: TroubleshootingEntry["photos"];
}) {
  return (
    <section className="rounded-2xl bg-slate-50 p-4">
      <h4 className="text-lg font-black">{title}</h4>
      <p className="mt-2 whitespace-pre-wrap leading-7 text-slate-700">{text}</p>
      {!!photos.length && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
              <Image
                src={photo.url}
                alt={`${title} photo`}
                width={photo.width}
                height={photo.height}
                unoptimized
                className="aspect-square w-full rounded-xl border bg-white object-cover"
              />
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function Status({ status }: { status: TroubleshootingEntry["status"] }) {
  return (
    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase text-emerald-800">
      {status}
    </span>
  );
}
