"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

type MemberInvitation = {
  id: string;
  inviteeName: string;
  inviteeEmail: string;
  personalMessage: string | null;
  createdAt: string;
  emailStatus: "sent" | "failed" | "pending";
};

const inputClass =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200";

export default function MemberInvitationPanel({
  onMessage,
}: {
  onMessage: (value: string) => void;
}) {
  const [invitations, setInvitations] =
    useState<MemberInvitation[]>([]);

  const [inviteeName, setInviteeName] =
    useState("");

  const [inviteeEmail, setInviteeEmail] =
    useState("");

  const [personalMessage, setPersonalMessage] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const [loading, setLoading] =
    useState(true);


  const loadInvitations = useCallback(
    async () => {
      const response = await fetch(
        "/api/dealer-network/member/invitations",
      );

      const payload =
        await response.json().catch(() => ({}));

      if (!response.ok) {
        setLoading(false);
        onMessage(
          payload.error ??
            "Invitation history is unavailable.",
        );
        return;
      }

      setInvitations(
        payload.invitations ?? [],
      );

      setLoading(false);
    },
    [onMessage],
  );


  useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);


  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    onMessage("");

    try {
      const response = await fetch(
        "/api/dealer-network/member/invitations",
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
          },
          body: JSON.stringify({
            inviteeName,
            inviteeEmail,
            personalMessage,
          }),
        },
      );

      const payload =
        await response.json().catch(() => ({}));

      if (!response.ok) {
        onMessage(
          payload.error ??
            "The invitation could not be sent.",
        );
        return;
      }

      setInviteeName("");
      setInviteeEmail("");
      setPersonalMessage("");

      await loadInvitations();

      onMessage(
        payload.emailStatus === "sent"
          ? "Invitation sent successfully."
          : payload.emailStatus === "skipped"
            ? "This invitation was already processed."
            : "Invitation was created, but the email delivery failed and was recorded for IDS review.",
      );
    } finally {
      setBusy(false);
    }
  }


  function statusLabel(
    status: MemberInvitation["emailStatus"],
  ) {
    if (status === "sent")
      return "Sent";

    if (status === "failed")
      return "Email Failed";

    return "Pending";
  }


  return (
    <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,.8fr)]">
      <form
        onSubmit={(event) =>
          void submit(event)
        }
        className="rounded-3xl bg-white p-6 shadow-sm"
      >
        <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">
          Grow the Community
        </p>

        <h2 className="mt-2 text-3xl font-black">
          Invite Someone
        </h2>

        <p className="mt-3 text-slate-600">
          Invite another robotic mower dealer,
          repair technician, or qualified
          industry professional to apply for
          the IDS Dealer & Tech Community.
        </p>

        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <b>Invitation limits:</b> Members
          may send up to 10 invitations in a
          24-hour period. The same email
          address cannot be invited more than
          once within 7 days.
        </div>

        <label className="mt-5 block font-bold">
          Their Name
          <input
            value={inviteeName}
            onChange={(event) =>
              setInviteeName(
                event.target.value,
              )
            }
            required
            maxLength={160}
            autoComplete="name"
            className={inputClass}
          />
        </label>

        <label className="mt-4 block font-bold">
          Their Email
          <input
            type="email"
            value={inviteeEmail}
            onChange={(event) =>
              setInviteeEmail(
                event.target.value,
              )
            }
            required
            maxLength={254}
            autoComplete="email"
            className={inputClass}
          />
        </label>

        <label className="mt-4 block font-bold">
          Personal Message{" "}
          <span className="font-medium text-slate-500">
            (optional)
          </span>
          <textarea
            value={personalMessage}
            onChange={(event) =>
              setPersonalMessage(
                event.target.value,
              )
            }
            rows={5}
            maxLength={500}
            className={inputClass}
            placeholder="Add a short personal note to the invitation."
          />
        </label>

        <p className="mt-2 text-right text-xs text-slate-500">
          {personalMessage.length}/500
        </p>

        <button
          disabled={busy}
          className="mt-5 rounded-xl bg-emerald-600 px-6 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? "Sending..."
            : "Send Invitation"}
        </button>

        <p className="mt-4 text-sm leading-6 text-slate-500">
          Invitations send the recipient to
          the existing IDS membership
          application. Invitations do not
          create an account, grant access, or
          guarantee approval.
        </p>
      </form>

      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-black">
          Invitations Sent
        </h2>

        <p className="mt-2 text-sm text-slate-600">
          Your recent invitation history is
          private to you and IDS.
        </p>

        {loading ? (
          <p className="mt-5 text-slate-500">
            Loading invitations...
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {invitations.map(
              (invitation) => (
                <article
                  key={invitation.id}
                  className="rounded-2xl border p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-black">
                        {
                          invitation.inviteeName
                        }
                      </h3>

                      <p className="break-all text-sm text-slate-600">
                        {
                          invitation.inviteeEmail
                        }
                      </p>
                    </div>

                    <span
                      className={
                        invitation.emailStatus ===
                        "sent"
                          ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black uppercase text-emerald-800"
                          : invitation.emailStatus ===
                              "failed"
                            ? "rounded-full bg-red-100 px-2.5 py-1 text-xs font-black uppercase text-red-800"
                            : "rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black uppercase text-amber-800"
                      }
                    >
                      {statusLabel(
                        invitation.emailStatus,
                      )}
                    </span>
                  </div>

                  {invitation.personalMessage && (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {
                        invitation.personalMessage
                      }
                    </p>
                  )}

                  <time className="mt-3 block text-xs text-slate-500">
                    {new Date(
                      invitation.createdAt,
                    ).toLocaleString()}
                  </time>
                </article>
              ),
            )}

            {!invitations.length && (
              <p className="text-slate-500">
                You have not sent any
                invitations yet.
              </p>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
