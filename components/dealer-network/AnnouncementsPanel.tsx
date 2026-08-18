"use client";

export type MemberBroadcast = {
  id: string;
  subject: string;
  body: string;
  sentAt: string;
  readAt: string | null;
  isRead: boolean;
};

export default function AnnouncementsPanel({
  broadcasts,
  onRefresh,
  onMessage,
}: {
  broadcasts: MemberBroadcast[];
  onRefresh: () => Promise<void>;
  onMessage: (value: string) => void;
}) {
  async function markRead(
    broadcast: MemberBroadcast,
  ) {
    if (broadcast.isRead) return;

    const response = await fetch(
      `/api/dealer-network/member/broadcasts/${broadcast.id}`,
      {
        method: "PATCH",
      },
    );

    const payload =
      await response.json().catch(() => ({}));

    if (!response.ok) {
      onMessage(
        payload.error ??
          "Announcement could not be marked as read.",
      );
      return;
    }

    await onRefresh();
  }

  return (
    <section className="mt-7">
      <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm">
        <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-400">
          Official IDS Communication
        </p>
        <h2 className="mt-2 text-3xl font-black">
          IDS Announcements
        </h2>
        <p className="mt-3 max-w-3xl text-slate-300">
          Company-wide announcements from Integrity Distribution
          Systems appear here. These announcements are read-only
          and cannot be replied to.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        {broadcasts.map((broadcast) => (
          <details
            key={broadcast.id}
            className={
              broadcast.isRead
                ? "rounded-3xl bg-white p-5 shadow-sm"
                : "rounded-3xl border-2 border-emerald-400 bg-emerald-50 p-5 shadow-sm"
            }
            onToggle={(event) => {
              if (
                event.currentTarget.open &&
                !broadcast.isRead
              ) {
                void markRead(broadcast);
              }
            }}
          >
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-black">
                      {broadcast.subject}
                    </h3>

                    {!broadcast.isRead && (
                      <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-black uppercase text-white">
                        New
                      </span>
                    )}
                  </div>

                  <time className="mt-1 block text-sm text-slate-500">
                    {new Date(
                      broadcast.sentAt,
                    ).toLocaleString()}
                  </time>
                </div>

                <span className="text-sm font-black text-emerald-700">
                  Open Announcement
                </span>
              </div>
            </summary>

            <div className="mt-5 border-t pt-5">
              <p className="whitespace-pre-wrap leading-7 text-slate-700">
                {broadcast.body}
              </p>
            </div>
          </details>
        ))}

        {!broadcasts.length && (
          <p className="rounded-3xl bg-white p-8 text-slate-500 shadow-sm">
            There are no IDS announcements yet.
          </p>
        )}
      </div>
    </section>
  );
}
