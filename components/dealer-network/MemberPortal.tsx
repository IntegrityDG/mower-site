"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Image from "next/image";
import {
  LOCKED_MEMBER_MESSAGE,
  ROLE_LABELS,
  type AccountState,
  type DealerBrand,
  type ConversationDetail,
  type ConversationSummary,
  type DirectoryResult,
  type FriendResult,
  type MemberBlock,
  type MessageAttachment,
  type MemberAccountSecuritySummary,
  type MemberProfile,
  type UnavailableFriendResult,
} from "@/lib/dealer-network/types";
import { browserGeolocationErrorMessage } from "@/lib/dealer-network/browser-geolocation";
import {
  MESSAGE_TEXT_LIMIT,
  messageFileType,
  validateMessageFiles,
} from "@/lib/dealer-network/messaging-validation";
import { uploadMessagePhoto } from "@/lib/dealer-network/message-upload";
import { US_STATES } from "@/lib/dealer-network/validation";
import TroubleshootingPanel from "./TroubleshootingPanel";
import DealerNetworkBoardPanel from "./DealerNetworkBoardPanel";
import DealerNetworkNotificationBell from "./DealerNetworkNotificationBell";
import MemberInvitationPanel from "./MemberInvitationPanel";
import { useDealerNetworkNotifications } from "./useDealerNetworkNotifications";

type Tab =
  | "directory"
  | "friends"
  | "messages"
  | "announcements"
  | "invite"
  | "profile"
  | "account"
  | "troubleshooting"
  | "suggestions";
type Suggestion = {
  id: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
};
const inputClass =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200";

export default function MemberPortal() {
  const [account, setAccount] = useState<AccountState | null>(null),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState<Tab>("directory"),
    [message, setMessage] = useState("");
  const [profile, setProfile] = useState<MemberProfile | null>(null),
    [brands, setBrands] = useState<DealerBrand[]>([]),
    [suggestions, setSuggestions] = useState<Suggestion[]>([]),
    [results, setResults] = useState<DirectoryResult[]>([]),
    [searched, setSearched] = useState(false),
    [friends, setFriends] = useState<Array<FriendResult | UnavailableFriendResult>>([]),
    [blockedMembers, setBlockedMembers] = useState<MemberBlock[]>([]),
    [conversations, setConversations] = useState<ConversationSummary[]>([]),
    [unreadTotal, setUnreadTotal] = useState(0),
    [openConversationId, setOpenConversationId] = useState<string | null>(null),
    [openBoardTopicId, setOpenBoardTopicId] = useState<string | null>(null);
  const [unreadBroadcastTotal, setUnreadBroadcastTotal] =
    useState(0);
  const { summary: notificationSummary, unavailable: notificationsUnavailable, refreshNotifications } =
    useDealerNetworkNotifications(Boolean(account && !account.effectiveLocked));

  const searchForm = useRef<HTMLFormElement>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/dealer-network/auth/session");
    if (!response.ok) {
      setLoading(false);
      return;
    }
    const payload = await response.json();
    setAccount(payload.account);
    setLoading(false);
    if (!payload.account.effectiveLocked) {
      const [profileResponse, brandResponse, suggestionResponse, friendResponse, blockResponse, conversationResponse, broadcastResponse] =
        await Promise.all([
          fetch("/api/dealer-network/member/profile"),
          fetch("/api/dealer-network/brands"),
          fetch("/api/dealer-network/member/suggestions"),
          fetch("/api/dealer-network/member/friends"),
          fetch("/api/dealer-network/member/blocks"),
          fetch("/api/dealer-network/member/messages/conversations"),
          fetch("/api/dealer-network/member/broadcasts"),
        ]);
      if (profileResponse.ok)
        setProfile((await profileResponse.json()).profile);
      if (brandResponse.ok)
        setBrands((await brandResponse.json()).brands ?? []);
      if (suggestionResponse.ok)
        setSuggestions((await suggestionResponse.json()).suggestions ?? []);
      if (friendResponse.ok)
        setFriends((await friendResponse.json()).friends ?? []);
      if (blockResponse.ok)
        setBlockedMembers((await blockResponse.json()).blockedMembers ?? []);
      if (conversationResponse.ok) {
        const communication = await conversationResponse.json();
        setConversations(communication.conversations ?? []);
        setUnreadTotal(communication.unreadTotal ?? 0);
      }

      if (broadcastResponse.ok) {
        const announcements =
          await broadcastResponse.json();

        setUnreadBroadcastTotal(
          announcements.unreadTotal ?? 0,
        );
      }
    }
  }, []);
  useEffect(() => {
    // The initial fetch synchronizes this client-only portal with its server session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const refreshCommunication = useCallback(async () => {
    const sessionResponse = await fetch("/api/dealer-network/auth/session");
    if (!sessionResponse.ok) {
      setAccount(null);
      return;
    }
    const nextAccount = (await sessionResponse.json()).account as AccountState;
    setAccount(nextAccount);
    if (nextAccount.effectiveLocked) return;
    const [
      conversationResponse,
      broadcastResponse,
    ] = await Promise.all([
      fetch(
        "/api/dealer-network/member/messages/conversations",
      ),
      fetch(
        "/api/dealer-network/member/broadcasts",
      ),
    ]);

    if (conversationResponse.ok) {
      const communication =
        await conversationResponse.json();

      setConversations(
        communication.conversations ?? [],
      );

      setUnreadTotal(
        communication.unreadTotal ?? 0,
      );
    }

    if (broadcastResponse.ok) {
      const announcements =
        await broadcastResponse.json();

      setUnreadBroadcastTotal(
        announcements.unreadTotal ?? 0,
      );
    }
    await refreshNotifications();
  }, [refreshNotifications]);
  useEffect(() => {
    if (!account || account.effectiveLocked) return;
    const timer = window.setInterval(() => void refreshCommunication(), 30_000);
    return () => window.clearInterval(timer);
  }, [account, refreshCommunication]);
  async function refreshFriends() {
    const response = await fetch("/api/dealer-network/member/friends");
    if (response.ok) setFriends((await response.json()).friends ?? []);
  }
  async function toggleFriend(memberId: string, saved: boolean) {
    const response = await fetch("/api/dealer-network/member/friends", {
      method: saved ? "POST" : "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memberId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(payload.error ?? "Friend list could not be updated.");
    setResults((current) =>
      current.map((result) => result.id === memberId ? { ...result, isFriend: saved } : result),
    );
    await refreshFriends();
    setMessage(saved ? "Saved privately to My Friends." : "Removed from My Friends.");
  }
  async function startMessage(memberId: string) {
    const response = await fetch("/api/dealer-network/member/messages/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memberId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(payload.error ?? "Conversation could not be opened.");
    setOpenConversationId(payload.conversationId);
    setTab("messages");
    await refreshCommunication();
  }
  async function setBlock(memberId: string, blocked: boolean) {
    const response = await fetch("/api/dealer-network/member/blocks", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memberId, blocked }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error ?? "Block setting could not be changed.");
      return false;
    }
    setResults((current) => current.map((result) =>
      result.id === memberId ? { ...result, blockedByYou: blocked } : result,
    ));
    setFriends((current) => current.map((friend) =>
      friend.id === memberId && friend.available
        ? { ...friend, blockedByYou: blocked }
        : friend,
    ));
    const blockResponse = await fetch("/api/dealer-network/member/blocks");
    if (blockResponse.ok)
      setBlockedMembers((await blockResponse.json()).blockedMembers ?? []);
    return true;
  }
  async function signOut() {
    await fetch("/api/dealer-network/auth/logout", { method: "DELETE" });
    window.location.href = "/dealer-tech-resources/login";
  }
  if (loading)
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        Loading member portal…
      </main>
    );
  if (!account)
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5 text-white">
        <div className="max-w-md rounded-3xl bg-white p-8 text-slate-950">
          <h1 className="text-3xl font-black">Member session required</h1>
          <a
            href="/dealer-tech-resources/login"
            className="mt-6 inline-flex rounded-xl bg-emerald-600 px-5 py-3 font-black text-white"
          >
            Member Login
          </a>
        </div>
      </main>
    );
  if (account.effectiveLocked)
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5 text-white">
        <section className="w-full max-w-xl rounded-3xl border border-amber-300/40 bg-slate-900 p-9 text-center">
          <p className="text-sm font-black uppercase tracking-[.2em] text-amber-300">
            Member Account
          </p>
          <h1 className="mt-4 text-3xl font-black">{LOCKED_MEMBER_MESSAGE}</h1>
          <button
            onClick={() => void signOut()}
            className="mt-8 rounded-xl bg-white px-6 py-3 font-black text-slate-950"
          >
            Sign Out
          </button>
        </section>
      </main>
    );
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b bg-slate-950 px-5 py-6 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-400">
              Dealer &amp; Tech Community Resources
            </p>
            <h1 className="mt-1 text-2xl font-black">
              Welcome, {account.memberName}
            </h1>
            <p className="text-sm text-slate-300">{account.companyName}</p>
          </div>
          <div className="flex items-center gap-3">
            <DealerNetworkNotificationBell
              summary={notificationSummary}
              unavailable={notificationsUnavailable}
              onNavigate={(item) => {
                if (item.conversationId) {
                  setOpenConversationId(item.conversationId);
                  setTab("messages");
                } else if (item.topicId) {
                  setOpenBoardTopicId(item.topicId);
                  setTab("announcements");
                }
              }}
            />
            <button
              onClick={() => void signOut()}
              className="rounded-xl border border-white/30 px-4 py-3 font-black"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-7 md:px-8">
        <nav aria-label="Member portal" className="flex flex-wrap gap-2">
          {(
            [
              ["directory", "Directory Search"],
              ["friends", "My Friends"],
              ["messages", `Messages${unreadTotal ? ` (${unreadTotal})` : ""}`],
              [
                "announcements",
                `Dealer Network Board / IDS Announcements${unreadBroadcastTotal ? ` (${unreadBroadcastTotal})` : ""}`,
              ],
              ["invite", "Invite Someone"],
              ["profile", "My Profile"],
              ["account", "Account / Security"],
              ["troubleshooting", "Troubleshooting"],
              ["suggestions", "Contact IDS / Suggest an Improvement"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`rounded-xl px-4 py-3 font-black ${tab === value ? "bg-emerald-600 text-white" : "border bg-white"}`}
            >
              {label}
            </button>
          ))}
        </nav>
        {message && (
          <p
            role="status"
            className="mt-5 rounded-xl bg-white p-4 font-bold shadow-sm"
          >
            {message}
          </p>
        )}
        {tab === "directory" && (
          <DirectoryPanel
            formRef={searchForm}
            brands={brands}
            results={results}
            searched={searched}
            onResults={(value) => {
              setResults(value);
              setSearched(true);
            }}
            onMessage={setMessage}
            messagingEnabled={account.messagingEnabled}
            onFriend={toggleFriend}
            onStartMessage={startMessage}
            onBlock={setBlock}
          />
        )}{" "}
        {tab === "friends" && (
          <FriendsPanel
            friends={friends}
            blockedMembers={blockedMembers}
            messagingEnabled={account.messagingEnabled}
            onFriend={toggleFriend}
            onStartMessage={startMessage}
            onBlock={setBlock}
          />
        )}{" "}
        {tab === "messages" && (
          <MessagingPanel
            account={account}
            conversations={conversations}
            selectedId={openConversationId}
            onSelected={setOpenConversationId}
            onRefresh={refreshCommunication}
            onMessage={setMessage}
            onBlock={setBlock}
          />
        )}{" "}
        {tab === "announcements" && (
          <DealerNetworkBoardPanel
            onMessage={setMessage}
            selectedTopicId={openBoardTopicId}
            onSelectedTopicHandled={() => setOpenBoardTopicId(null)}
            onAttentionChanged={refreshNotifications}
          />
        )}{" "}
        {tab === "invite" && (
          <MemberInvitationPanel
            onMessage={setMessage}
          />
        )}{" "}
        {tab === "profile" && profile && (
          <ProfilePanel
            profile={profile}
            brands={brands}
            onProfile={setProfile}
            onMessage={setMessage}
          />
        )}{" "}
        {tab === "account" && <AccountSecurityPanel />}{" "}
        {tab === "troubleshooting" && (
          <TroubleshootingPanel onMessage={setMessage} />
        )}{" "}
        {tab === "suggestions" && (
          <SuggestionsPanel
            suggestions={suggestions}
            onSuggestions={setSuggestions}
            onMessage={setMessage}
          />
        )}
      </div>
    </main>
  );
}

function AccountSecurityPanel() {
  const [summary, setSummary] = useState<MemberAccountSecuritySummary | null>(null),
    [busy, setBusy] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/dealer-network/member/account", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) setSummary(payload.summary);
      else setNotice(payload.error ?? "Account security details are unavailable.");
    } catch {
      setNotice("Account security details are unavailable. Check your connection and try again.");
    }
  }, []);
  useEffect(() => {
    // This panel loads only the authenticated member's safe account summary.
    void refresh();
  }, [refresh]);

  async function accountAction(action: string) {
    if (busy) return;
    setBusy(action);
    setNotice("");
    try {
      const response = await fetch("/api/dealer-network/member/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({}));
      setNotice(payload.message ?? payload.error ?? "The request could not be completed.");
      await refresh();
    } catch {
      setNotice("The request could not be completed. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function changePin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("change_pin");
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/dealer-network/member/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "change_pin",
          currentPin: form.get("currentPin"),
          newPin: form.get("newPin"),
          confirmNewPin: form.get("confirmNewPin"),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(payload.error ?? "Your PIN could not be changed.");
        return;
      }
      window.location.href = "/dealer-tech-resources/login?notice=pin-changed";
    } catch {
      setNotice("Your PIN could not be changed. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function signOutEverywhere() {
    if (busy || !window.confirm("Sign out every active session, including this one?"))
      return;
    setBusy("sign_out_everywhere");
    try {
      const response = await fetch("/api/dealer-network/member/account", {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setNotice(payload.error ?? "Could not sign out all sessions.");
        return;
      }
      window.location.href = "/dealer-tech-resources/login?notice=signed-out-everywhere";
    } catch {
      setNotice("Could not sign out all sessions. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!summary)
    return (
      <section className="mt-7 rounded-3xl bg-white p-6 shadow-sm">
        {notice || "Loading account security…"}
      </section>
    );
  return (
    <section className="mt-7 space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-3xl font-black">Account &amp; Security</h2>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MemberSecurityDetail label="Account Status" value={summary.accountStatus} />
          <MemberSecurityDetail
            label="Email Verification"
            value={summary.emailVerified ? "Verified" : "Needs Attention"}
          />
          <MemberSecurityDetail
            label="Last Login"
            value={summary.lastLoginAt ? new Date(summary.lastLoginAt).toLocaleString() : "Not available"}
          />
          <MemberSecurityDetail label="Active Sessions" value={String(summary.activeSessionCount)} />
          <MemberSecurityDetail
            label="Current Session"
            value={`Expires ${new Date(summary.currentSessionExpiresAt).toLocaleString()}`}
          />
        </dl>
      </div>
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <h3 className="text-2xl font-black">Business Location</h3>
        <p className="mt-3 font-bold">
          {summary.businessLocationReady ? "Location Ready" : "Location Needs Attention"}
        </p>
        {!summary.businessLocationReady && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void accountAction("retry_business_location")}
            className="mt-4 rounded-xl border px-4 py-3 font-black disabled:opacity-60"
          >
            {busy === "retry_business_location" ? "Retrying…" : "Retry Business Location"}
          </button>
        )}
      </div>
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <h3 className="text-2xl font-black">Security Actions</h3>
        <form onSubmit={changePin} className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="font-bold">
            Current PIN
            <input name="currentPin" type="password" inputMode="numeric" pattern="[0-9]{6}" required className={inputClass} />
          </label>
          <label className="font-bold">
            New 6-digit PIN
            <input name="newPin" type="password" inputMode="numeric" pattern="[0-9]{6}" required className={inputClass} />
          </label>
          <label className="font-bold">
            Confirm New PIN
            <input name="confirmNewPin" type="password" inputMode="numeric" pattern="[0-9]{6}" required className={inputClass} />
          </label>
          <button disabled={busy !== null} className="rounded-xl bg-emerald-700 px-5 py-3 font-black text-white disabled:opacity-60 sm:col-span-3 sm:w-fit">
            {busy === "change_pin" ? "Changing PIN…" : "Change PIN"}
          </button>
        </form>
        <div className="mt-6 flex flex-wrap gap-3 border-t pt-5">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void accountAction("revoke_other_sessions")}
            className="rounded-xl border px-4 py-3 font-black disabled:opacity-60"
          >
            {busy === "revoke_other_sessions" ? "Signing Out…" : "Sign Out Other Sessions"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void signOutEverywhere()}
            className="rounded-xl border border-red-500 px-4 py-3 font-black text-red-800 disabled:opacity-60"
          >
            {busy === "sign_out_everywhere" ? "Signing Out…" : "Sign Out Everywhere"}
          </button>
        </div>
        {notice && <p role="status" className="mt-5 rounded-xl bg-slate-100 p-4 font-bold">{notice}</p>}
      </div>
    </section>
  );
}

function MemberSecurityDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <dt className="text-xs font-black uppercase tracking-[.12em] text-slate-500">{label}</dt>
      <dd className="mt-2 text-lg font-black">{value}</dd>
    </div>
  );
}

function DirectoryPanel({
  formRef,
  brands,
  results,
  searched,
  onResults,
  onMessage,
  messagingEnabled,
  onFriend,
  onStartMessage,
  onBlock,
}: {
  formRef: React.RefObject<HTMLFormElement | null>;
  brands: DealerBrand[];
  results: DirectoryResult[];
  searched: boolean;
  onResults: (value: DirectoryResult[]) => void;
  onMessage: (value: string) => void;
  messagingEnabled: boolean;
  onFriend: (memberId: string, saved: boolean) => Promise<void>;
  onStartMessage: (memberId: string) => Promise<void>;
  onBlock: (memberId: string, blocked: boolean) => Promise<boolean>;
}) {
  const [searching, setSearching] = useState(false);
  async function search(
    near?: "business" | "zip" | "coordinates",
    coordinates?: GeolocationCoordinates,
  ) {
    const form = formRef.current;
    if (!form) return;
    setSearching(true);
    onMessage("");
    const data = new FormData(form),
      params = new URLSearchParams();
    for (const key of [
      "query",
      "role",
      "brandId",
      "relationshipType",
      "region",
      "zip",
      "areaCode",
      "nearZip",
      "radius",
    ]) {
      const value = String(data.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    if (near) params.set("near", near);
    if (coordinates) {
      params.set("latitude", String(coordinates.latitude));
      params.set("longitude", String(coordinates.longitude));
    }
    try {
      const response = await fetch(
        `/api/dealer-network/member/directory?${params}`,
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        onMessage(
          payload && typeof payload.error === "string"
            ? payload.error
            : "Search failed.",
        );
        return;
      }
      if (!payload || !Array.isArray(payload.results)) {
        onMessage("Directory search returned an invalid response.");
        return;
      }
      onResults(payload.results);
    } catch {
      onMessage("Directory search is unavailable. Check your connection and try again.");
    } finally {
      setSearching(false);
    }
  }
  function useLocation() {
    if (searching) return;
    if (!window.isSecureContext) {
      onMessage(
        "Browser location requires a secure connection. Use ZIP or business location instead.",
      );
      return;
    }
    if (!navigator.geolocation) {
      onMessage(
        "Browser location is unavailable. Use ZIP or business location instead.",
      );
      return;
    }
    setSearching(true);
    onMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => void search("coordinates", position.coords),
      (error) => {
        onMessage(browserGeolocationErrorMessage(error.code));
        setSearching(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }
  return (
    <section className="mt-7">
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-3xl font-black">Directory Search</h2>
        <p className="mt-2 text-slate-600">
          <strong>
            Leave all fields blank and click Search to browse up to 100 members.
          </strong>{" "}
          Search approved, active, unlocked members. Street addresses and raw
          coordinates are never displayed.
        </p>
        <form
          ref={formRef}
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
          className="mt-6 grid gap-4 md:grid-cols-3"
        >
          <label className="font-bold md:col-span-2">
            Member or Company
            <input name="query" className={inputClass} />
          </label>
          <label className="font-bold">
            Role
            <select name="role" className={inputClass}>
              <option value="">Any role</option>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="font-bold">
            Brand
            <select name="brandId" className={inputClass}>
              <option value="">Any brand</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>
          <label className="font-bold">
            Brand Relationship
            <select name="relationshipType" className={inputClass}>
              <option value="">Sold or Serviced</option>
              <option value="sold">Sold</option>
              <option value="serviced">Serviced / Repaired</option>
            </select>
          </label>
          <label className="font-bold">
            Region / Service Area
            <input name="region" className={inputClass} />
          </label>
          <label className="font-bold">
            ZIP Code
            <input
              name="zip"
              inputMode="numeric"
              maxLength={10}
              className={inputClass}
            />
          </label>
          <label className="font-bold">
            Area Code
            <input
              name="areaCode"
              inputMode="numeric"
              maxLength={3}
              className={inputClass}
            />
          </label>
          <label className="font-bold">
            Near ZIP Code
            <input
              name="nearZip"
              inputMode="numeric"
              maxLength={10}
              className={inputClass}
            />
          </label>
          <label className="font-bold">
            Radius
            <select name="radius" defaultValue="100" className={inputClass}>
              {[25, 50, 100, 250].map((radius) => (
                <option key={radius} value={radius}>
                  {radius} miles
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-3">
            <button
              disabled={searching}
              className="rounded-xl bg-slate-950 px-5 py-3 font-black text-white"
            >
              Search
            </button>
            <button
              type="button"
              disabled={searching}
              onClick={() => void search("business")}
              className="rounded-xl border px-5 py-3 font-black"
            >
              Use My Business Location
            </button>
            <button
              type="button"
              disabled={searching}
              onClick={() => void search("zip")}
              className="rounded-xl border px-5 py-3 font-black"
            >
              Search Near ZIP
            </button>
            <button
              type="button"
              disabled={searching}
              onClick={useLocation}
              className="rounded-xl border border-emerald-700 px-5 py-3 font-black text-emerald-800"
            >
              Use My Location
            </button>
            <button
              type="reset"
              onClick={() => {
                onResults([]);
              }}
              className="rounded-xl px-5 py-3 font-black text-slate-600"
            >
              Clear Filters
            </button>
          </div>
        </form>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {results.map((result) => (
          <DirectoryCard
            key={result.id}
            result={result}
            messagingEnabled={messagingEnabled}
            onFriend={onFriend}
            onStartMessage={onStartMessage}
            onBlock={onBlock}
          />
        ))}
        {searched && results.length === 0 && (
          <p className="rounded-3xl bg-white p-8 text-slate-600">
            No eligible members matched those filters. Clear one or more filters
            and try again.
          </p>
        )}
      </div>
    </section>
  );
}
function DirectoryCard({
  result,
  messagingEnabled,
  onFriend,
  onStartMessage,
  onBlock,
}: {
  result: DirectoryResult;
  messagingEnabled: boolean;
  onFriend: (memberId: string, saved: boolean) => Promise<void>;
  onStartMessage: (memberId: string) => Promise<void>;
  onBlock: (memberId: string, blocked: boolean) => Promise<boolean>;
}) {
  return (
    <article className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="flex gap-4">
        {result.logoUrl ? (
          <Image
            src={result.logoUrl}
            alt={`${result.companyName} logo`}
            width={96}
            height={80}
            unoptimized
            className="h-20 w-24 rounded-xl border object-contain"
          />
        ) : (
          <div className="flex h-20 w-24 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-500">
            Company Logo
          </div>
        )}
        <div>
          <h3 className="text-2xl font-black">{result.companyName}</h3>
          <p className="font-bold text-emerald-700">
            {result.memberName} · {ROLE_LABELS[result.role]}
          </p>
          <p className="text-sm text-slate-600">
            {result.city}, {result.state}
            {result.distanceMiles !== null
              ? ` · ${result.distanceMiles} miles away`
              : ""}
          </p>
        </div>
      </div>
      <p className="mt-4 leading-7 text-slate-600">{result.introduction}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-black">Service Region</dt>
          <dd>{result.serviceRegion}</dd>
        </div>
        <div>
          <dt className="font-black">Experience</dt>
          <dd>{result.experience}</dd>
        </div>
        <div>
          <dt className="font-black">Phone</dt>
          <dd>
            <a
              href={`tel:${result.phone.replace(/\D/g, "")}`}
              className="text-emerald-700 underline"
            >
              {result.phone}
            </a>
          </dd>
        </div>
        <div>
          <dt className="font-black">Email</dt>
          <dd>
            <a
              href={`mailto:${result.email}`}
              className="break-all text-emerald-700 underline"
            >
              {result.email}
            </a>
          </dd>
        </div>
      </dl>
      {result.websiteUrl && (
        <a
          href={result.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex font-black text-emerald-700 underline"
        >
          Website / Social Page
        </a>
      )}
      <BrandList title="Brands Sold" items={result.brandsSold} />
      <BrandList
        title="Brands Serviced / Repaired"
        items={result.brandsServiced}
      />
      <div className="mt-5 flex flex-wrap gap-2 border-t pt-5">
        <button
          type="button"
          onClick={() => void onFriend(result.id, !result.isFriend)}
          className="rounded-xl border border-emerald-700 px-4 py-2 font-black text-emerald-800"
        >
          {result.isFriend ? "Remove Friend" : "Save Friend"}
        </button>
        <button
          type="button"
          disabled={!messagingEnabled || result.blockedByYou}
          onClick={() => void onStartMessage(result.id)}
          className="rounded-xl bg-slate-950 px-4 py-2 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Message
        </button>
        {result.blockedByYou && (
          <button
            type="button"
            onClick={() => void onBlock(result.id, false)}
            className="rounded-xl border border-red-300 px-4 py-2 font-black text-red-800"
          >
            Unblock
          </button>
        )}
      </div>
    </article>
  );
}

function FriendsPanel({
  friends,
  blockedMembers,
  messagingEnabled,
  onFriend,
  onStartMessage,
  onBlock,
}: {
  friends: Array<FriendResult | UnavailableFriendResult>;
  blockedMembers: MemberBlock[];
  messagingEnabled: boolean;
  onFriend: (memberId: string, saved: boolean) => Promise<void>;
  onStartMessage: (memberId: string) => Promise<void>;
  onBlock: (memberId: string, blocked: boolean) => Promise<boolean>;
}) {
  return (
    <section className="mt-7">
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-3xl font-black">My Friends</h2>
        <p className="mt-2 text-slate-600">
          Your saved list is private. Saving someone does not notify them or require approval.
        </p>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {friends.map((friend) =>
          friend.available ? (
            <DirectoryCard
              key={friend.id}
              result={friend}
              messagingEnabled={messagingEnabled}
              onFriend={onFriend}
              onStartMessage={onStartMessage}
              onBlock={onBlock}
            />
          ) : (
            <article key={friend.id} className="rounded-3xl bg-white p-6 shadow-sm">
              <h3 className="text-xl font-black">Member unavailable</h3>
              <p className="mt-2 text-slate-600">Their details are no longer available.</p>
              <button
                type="button"
                onClick={() => void onFriend(friend.id, false)}
                className="mt-4 rounded-xl border px-4 py-2 font-black"
              >
                Remove Friend
              </button>
            </article>
          ),
        )}
        {!friends.length && (
          <p className="rounded-3xl bg-white p-8 text-slate-600">
            No saved friends yet. Use Directory Search to build your private list.
          </p>
        )}
      </div>
      <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm">
        <h3 className="text-2xl font-black">Blocked Members</h3>
        <p className="mt-2 text-sm text-slate-600">
          This list is private. Blocked members are given only generic messaging availability behavior.
        </p>
        <div className="mt-4 space-y-3">
          {blockedMembers.map((member) => (
            <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
              <div>
                <b>{member.available ? member.memberName : member.displayName}</b>
                {member.available && <p className="text-sm text-slate-600">{member.companyName}</p>}
              </div>
              <button type="button" onClick={() => void onBlock(member.id, false)} className="rounded-xl border border-red-300 px-4 py-2 font-black text-red-800">
                Unblock
              </button>
            </div>
          ))}
          {!blockedMembers.length && <p className="text-sm text-slate-500">No blocked members.</p>}
        </div>
      </div>
    </section>
  );
}

function PrivateMessagePhoto({ attachment }: { attachment: MessageAttachment }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <p className="rounded-xl bg-black/10 p-3 text-sm" role="status">
        Private photo unavailable.
      </p>
    );
  return (
    <div className="relative min-h-24 overflow-hidden rounded-xl bg-black/10">
      <a href={attachment.url} target="_blank" rel="noreferrer" className="block">
        <Image
          src={attachment.url}
          alt="Private message photo"
          width={attachment.width}
          height={attachment.height}
          unoptimized
          onError={() => setFailed(true)}
          className="max-h-80 w-full rounded-xl object-contain"
        />
      </a>
    </div>
  );
}

function MessagingPanel({
  account,
  conversations,
  selectedId,
  onSelected,
  onRefresh,
  onMessage,
  onBlock,
}: {
  account: AccountState;
  conversations: ConversationSummary[];
  selectedId: string | null;
  onSelected: (id: string | null) => void;
  onRefresh: () => Promise<void>;
  onMessage: (message: string) => void;
  onBlock: (memberId: string, blocked: boolean) => Promise<boolean>;
}) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null),
    [body, setBody] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [progress, setProgress] = useState<number[]>([]),
    [busy, setBusy] = useState(false),
    [reporting, setReporting] = useState(false),
    [reportReason, setReportReason] = useState("");
  const clientMessageId = useRef<string | null>(null);
  const clientReportId = useRef<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    const response = await fetch(
      `/api/dealer-network/member/messages/conversations/${selectedId}`,
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setDetail(null);
      onMessage(payload.error ?? "Conversation unavailable.");
      return;
    }
    setDetail(payload.detail);
    await fetch(
      `/api/dealer-network/member/messages/conversations/${selectedId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lastVisibleMessageId:
            payload.detail.messages.at(-1)?.id ?? null,
        }),
      },
    );
    await onRefresh();
  }, [onMessage, onRefresh, selectedId]);

  useEffect(() => {
    // Loading is tied to the explicit conversation selection.
    void loadDetail();
  }, [loadDetail]);
  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setInterval(() => void loadDetail(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadDetail, selectedId]);

  function chooseFiles(chosen: FileList | null) {
    if (!chosen) return;
    const error = validateMessageFiles(chosen);
    if (error) {
      onMessage(error);
      return;
    }
    const normalized = Array.from(chosen).map((file) => {
      const type = messageFileType(file);
      return type && file.type !== type
        ? new File([file], file.name, { type, lastModified: file.lastModified })
        : file;
    });
    setFiles(normalized);
    setProgress(normalized.map(() => 0));
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || busy) return;
    if (!body.trim() && !files.length) {
      onMessage("Enter a message or add a photo.");
      return;
    }
    const fileError = validateMessageFiles(files);
    if (fileError) return onMessage(fileError);
    setBusy(true);
    onMessage("");
    let uploadIds: string[] = [];
    const activeUploads: Array<ReturnType<typeof uploadMessagePhoto>> = [];
    try {
      if (files.length) {
        const ticketResponse = await fetch(
          "/api/dealer-network/member/messages/uploads",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              conversationId: selectedId,
              files: files.map((file) => ({
                contentType: file.type,
                byteSize: file.size,
              })),
            }),
          },
        );
        const ticketPayload = await ticketResponse.json().catch(() => ({}));
        if (!ticketResponse.ok)
          throw new Error(ticketPayload.error ?? "Photo upload could not be prepared.");
        uploadIds = ticketPayload.tickets.map((ticket: { id: string }) => ticket.id);
        await Promise.all(
          files.map((file, index) => {
            const ticket = ticketPayload.tickets[index] as {
              path: string;
              signedUrl: string;
              token: string;
            };
            const upload = uploadMessagePhoto({
              file,
              endpoint: ticket.signedUrl,
              bucket: ticketPayload.bucket,
              path: ticket.path,
              token: ticket.token,
              onProgress(value) {
                setProgress((current) =>
                  current.map((item, position) =>
                    position === index ? value : item,
                  ),
                );
              },
            });
            activeUploads.push(upload);
            return upload.promise;
          }),
        );
      }
      const response = await fetch("/api/dealer-network/member/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedId,
          clientMessageId: (clientMessageId.current ??= crypto.randomUUID()),
          body,
          uploadIds,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Message could not be sent.");
      setBody("");
      clientMessageId.current = null;
      setFiles([]);
      setProgress([]);
      await loadDetail();
    } catch (error) {
      await Promise.allSettled(activeUploads.map((upload) => upload.cancel()));
      await Promise.allSettled(
        uploadIds.map((id) =>
          fetch(`/api/dealer-network/member/messages/uploads/${id}`, {
            method: "DELETE",
          }),
        ),
      );
      onMessage(error instanceof Error ? error.message : "Message could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function changeBlock() {
    if (!detail) return;
    const blocked = !detail.conversation.participant.blockedByYou;
    if (!(await onBlock(detail.conversation.participant.id, blocked))) return;
    onMessage(blocked ? "Member blocked. Message history was preserved." : "Member unblocked.");
    await loadDetail();
  }

  async function loadOlder() {
    if (!selectedId || !detail?.nextBefore) return;
    const response = await fetch(
      `/api/dealer-network/member/messages/conversations/${selectedId}?before=${encodeURIComponent(detail.nextBefore)}`,
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      return onMessage(payload.error ?? "Older messages could not be loaded.");
    const older = payload.detail as ConversationDetail;
    setDetail((current) =>
      current
        ? {
            ...current,
            messages: [...older.messages, ...current.messages],
            hasMore: older.hasMore,
            nextBefore: older.nextBefore,
          }
        : older,
    );
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const response = await fetch("/api/dealer-network/member/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: detail.conversation.id,
        clientReportId: (clientReportId.current ??= crypto.randomUUID()),
        reason: reportReason,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return onMessage(payload.error ?? "Report could not be submitted.");
    setReporting(false);
    setReportReason("");
    clientReportId.current = null;
    onMessage("Report sent privately to IDS for review.");
  }

  return (
    <section className="mt-7 overflow-hidden rounded-3xl bg-white shadow-sm">
      {!account.messagingEnabled && (
        <p className="border-b border-amber-200 bg-amber-50 p-4 font-bold text-amber-950">
          Messaging is disabled for this account. You can read existing conversations, but cannot send or upload photos.
        </p>
      )}
      <div className="grid min-h-[36rem] md:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="border-b bg-slate-50 p-3 md:border-b-0 md:border-r">
          <h2 className="px-2 py-3 text-xl font-black">Messages</h2>
          <div className="flex gap-2 overflow-x-auto md:block md:space-y-2">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => {
                  clientMessageId.current = null;
                  clientReportId.current = null;
                  setBody("");
                  setFiles([]);
                  setProgress([]);
                  onSelected(conversation.id);
                }}
                className={`min-w-56 rounded-xl p-3 text-left md:w-full ${selectedId === conversation.id ? "bg-slate-950 text-white" : "bg-white"}`}
              >
                <span className="flex items-center justify-between gap-2 font-black">
                  {conversation.participant.displayName}
                  {conversation.unreadCount > 0 && (
                    <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs text-white">
                      {conversation.unreadCount}
                    </span>
                  )}
                </span>
                <span className="mt-1 block truncate text-xs opacity-70">
                  {conversation.lastMessagePreview}
                </span>
              </button>
            ))}
            {!conversations.length && !selectedId && (
              <p className="p-2 text-sm text-slate-600">Start a conversation from Directory Search or My Friends.</p>
            )}
          </div>
        </aside>
        <div className="flex min-w-0 flex-col">
          {detail ? (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                <div>
                  <h3 className="text-xl font-black">{detail.conversation.participant.displayName}</h3>
                  {detail.conversation.participant.companyName && (
                    <p className="text-sm text-slate-600">{detail.conversation.participant.companyName}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setReporting((value) => !value)} className="rounded-lg border px-3 py-2 text-sm font-black">
                    Report
                  </button>
                  <button type="button" onClick={() => void changeBlock()} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-black text-red-800">
                    {detail.conversation.participant.blockedByYou ? "Unblock" : "Block"}
                  </button>
                </div>
              </header>
              {reporting && (
                <form onSubmit={(event) => void submitReport(event)} className="border-b bg-red-50 p-4">
                  <label className="font-bold">
                    Reason for report
                    <textarea required minLength={5} maxLength={2000} value={reportReason} onChange={(event) => setReportReason(event.target.value)} className={inputClass} />
                  </label>
                  <button className="mt-3 rounded-xl bg-red-800 px-4 py-2 font-black text-white">Submit Private Report</button>
                </form>
              )}
              <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
                {detail.hasMore && (
                  <button type="button" onClick={() => void loadOlder()} className="mx-auto block rounded-xl border px-4 py-2 text-sm font-black">
                    Load Older Messages
                  </button>
                )}
                {detail.messages.map((item) => (
                  <article key={item.id} className={`max-w-[85%] rounded-2xl p-3 ${item.sentByMe ? "ml-auto bg-emerald-700 text-white" : "bg-slate-100"}`}>
                    {item.body && <p className="whitespace-pre-wrap break-words">{item.body}</p>}
                    {item.attachments.length > 0 && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {item.attachments.map((attachment) => (
                          <PrivateMessagePhoto
                            key={attachment.id}
                            attachment={attachment}
                          />
                        ))}
                      </div>
                    )}
                    <time className="mt-2 block text-xs opacity-70">{new Date(item.createdAt).toLocaleString()}</time>
                  </article>
                ))}
                {!detail.messages.length && <p className="text-center text-slate-500">No messages yet.</p>}
              </div>
              <form onSubmit={(event) => void send(event)} className="border-t p-4">
                {!detail.canSend && (
                  <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-950">
                    You cannot send to this member right now. Existing history remains private and readable.
                  </p>
                )}
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={MESSAGE_TEXT_LIMIT}
                  disabled={!detail.canSend || busy}
                  aria-label="Message"
                  className={inputClass}
                  placeholder="Write a private message"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="cursor-pointer rounded-xl border px-4 py-2 font-black">
                    Add Photos
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple disabled={!detail.canSend || busy} onChange={(event) => chooseFiles(event.target.files)} className="sr-only" />
                  </label>
                  <span className="text-sm text-slate-600">{files.length}/3 photos · 15 MB each</span>
                  <button disabled={!detail.canSend || busy || (!body.trim() && !files.length)} className="ml-auto rounded-xl bg-emerald-700 px-5 py-2 font-black text-white disabled:opacity-50">
                    {busy ? "Sending…" : "Send"}
                  </button>
                </div>
                {files.map((file, index) => (
                  <p key={`${file.name}-${file.lastModified}`} className="mt-2 text-xs text-slate-600">
                    {file.name} {progress[index] ? `— ${progress[index]}%` : ""}
                  </p>
                ))}
                <p className="mt-2 text-right text-xs text-slate-500">{body.length}/{MESSAGE_TEXT_LIMIT}</p>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-500">
              Select a conversation, or start one from a member card.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
function BrandList({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; name: string }>;
}) {
  return items.length ? (
    <div className="mt-4">
      <h4 className="text-sm font-black">{title}</h4>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item.id}
            className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800"
          >
            {item.name}
          </span>
        ))}
      </div>
    </div>
  ) : null;
}

function ProfilePanel({
  profile,
  brands,
  onProfile,
  onMessage,
}: {
  profile: MemberProfile;
  brands: DealerBrand[];
  onProfile: (value: MemberProfile) => void;
  onMessage: (value: string) => void;
}) {
  const [brandId, setBrandId] = useState(""),
    [relationshipType, setRelationshipType] = useState("serviced"),
    [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const value = Object.fromEntries(form.entries());
    const response = await fetch("/api/dealer-network/member/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      onMessage(
        payload.error ??
          Object.values(payload.errors ?? {}).join(" ") ??
          "Save failed.",
      );
      return;
    }
    onProfile(payload.profile);
    onMessage(
      payload.reauthenticate
        ? "Profile saved. Sign in again because your login or recovery identity changed."
        : "Profile saved. Role changes take effect immediately; new brand requests remain pending.",
    );
    if (payload.reauthenticate)
      window.location.href = "/dealer-tech-resources/login";
  }
  async function addBrand() {
    if (!brandId) return;
    const response = await fetch("/api/dealer-network/member/brands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brandId, relationshipType }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      onProfile({ ...profile, brands: [...profile.brands, payload.brand] });
      onMessage("Brand affiliation submitted for IDS approval.");
      setBrandId("");
    } else onMessage(payload.error ?? "Brand request failed.");
  }
  async function removeBrand(id: string) {
    const response = await fetch(`/api/dealer-network/member/brands/${id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      onProfile({
        ...profile,
        brands: profile.brands.filter((brand) => brand.id !== id),
      });
      onMessage("Brand affiliation removed.");
    } else onMessage("Brand affiliation could not be removed.");
  }
  async function uploadLogo(file: File) {
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/dealer-network/member/logo", {
      method: "POST",
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      onProfile({ ...profile, logoUrl: payload.logoUrl });
      onMessage("Company logo updated.");
    } else onMessage(payload.error ?? "Logo upload failed.");
  }
  return (
    <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,.6fr)]">
      <form
        key={`${profile.id}-${profile.phone}-${profile.email}`}
        onSubmit={save}
        className="rounded-3xl bg-white p-6 shadow-sm"
      >
        <h2 className="text-3xl font-black">My Profile</h2>
        <p className="mt-2 text-slate-600">
          Your approved professional fields appear to other eligible members. A
          role change needs no IDS approval.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <ProfileField
            label="Member Name"
            name="memberName"
            value={profile.memberName}
          />
          <ProfileField
            label="Company Name"
            name="companyName"
            value={profile.companyName}
          />
          <ProfileField label="Phone" name="phone" value={profile.phone} />
          <ProfileField
            label="Email"
            name="email"
            type="email"
            value={profile.email}
          />
          <ProfileField
            label="Address Line 1"
            name="addressLine1"
            value={profile.addressLine1}
          />
          <ProfileField
            label="Address Line 2"
            name="addressLine2"
            required={false}
            value={profile.addressLine2 ?? ""}
          />
          <ProfileField label="City" name="city" value={profile.city} />
          <label className="font-bold">
            State
            <select
              name="state"
              defaultValue={profile.state}
              className={inputClass}
            >
              {US_STATES.map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
          </label>
          <ProfileField
            label="ZIP Code"
            name="zipCode"
            value={profile.zipCode}
          />
          <ProfileField
            label="Website / Social"
            name="websiteUrl"
            type="url"
            required={false}
            value={profile.websiteUrl ?? ""}
          />
          <label className="font-bold">
            Role
            <select
              name="role"
              defaultValue={profile.role}
              className={inputClass}
            >
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <ProfileField
            label="Experience"
            name="experience"
            value={profile.experience}
          />
          <label className="font-bold md:col-span-2">
            Service Region
            <textarea
              name="serviceRegion"
              defaultValue={profile.serviceRegion}
              rows={3}
              className={inputClass}
            />
          </label>
          <label className="font-bold md:col-span-2">
            Brief Introduction
            <textarea
              name="introduction"
              defaultValue={profile.introduction}
              rows={5}
              className={inputClass}
            />
          </label>
          <label className="font-bold md:col-span-2">
            Current PIN{" "}
            <span className="font-medium text-slate-500">
              (required only when changing phone or email)
            </span>
            <input
              name="currentPin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              className={inputClass}
            />
          </label>
        </div>
        <button
          disabled={busy}
          className="mt-6 rounded-xl bg-emerald-600 px-6 py-3 font-black text-white"
        >
          {busy ? "Saving…" : "Save Profile"}
        </button>
      </form>
      <aside className="space-y-6">
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Company Logo</h2>
          {profile.logoUrl && (
            <Image
              src={profile.logoUrl}
              alt={`${profile.companyName} logo`}
              width={480}
              height={128}
              unoptimized
              className="mt-4 h-32 w-full rounded-xl border object-contain"
            />
          )}
          <label className="mt-4 block cursor-pointer rounded-xl border p-3 text-center font-black">
            Upload JPEG, PNG, or WebP
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadLogo(file);
                event.target.value = "";
              }}
            />
          </label>
        </section>
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Brand Affiliations</h2>
          <p className="mt-2 text-sm text-slate-600">
            New affiliations remain pending and are not searchable until IDS
            approves them. Removals take effect immediately.
          </p>
          <div className="mt-4 space-y-2">
            {profile.brands.map((brand) => (
              <div
                key={brand.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"
              >
                <span>
                  <b>{brand.brandName}</b>
                  <span className="block capitalize text-slate-500">
                    {brand.relationshipType} · {brand.approvalStatus}
                  </span>
                </span>
                <button
                  onClick={() => void removeBrand(brand.id)}
                  className="font-black text-red-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <select
            aria-label="Brand"
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            className={inputClass}
          >
            <option value="">Choose active brand</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Relationship"
            value={relationshipType}
            onChange={(event) => setRelationshipType(event.target.value)}
            className={inputClass}
          >
            <option value="sold">Sold</option>
            <option value="serviced">Serviced / Repaired</option>
          </select>
          <button
            type="button"
            onClick={() => void addBrand()}
            className="mt-3 w-full rounded-xl bg-slate-950 px-4 py-3 font-black text-white"
          >
            Request Brand Affiliation
          </button>
        </section>
      </aside>
    </section>
  );
}
function ProfileField({
  label,
  name,
  value,
  type = "text",
  required = true,
}: {
  label: string;
  name: string;
  value: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="font-bold">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={value}
        className={inputClass}
      />
    </label>
  );
}

function SuggestionsPanel({
  suggestions,
  onSuggestions,
  onMessage,
}: {
  suggestions: Suggestion[];
  onSuggestions: (value: Suggestion[]) => void;
  onMessage: (value: string) => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    const response = await fetch("/api/dealer-network/member/suggestions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(data.entries())),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      onSuggestions([payload.suggestion, ...suggestions]);
      form.reset();
      onMessage("Suggestion sent to IDS.");
    } else
      onMessage(
        payload.error ??
          Object.values(payload.errors ?? {}).join(" ") ??
          "Suggestion failed.",
      );
  }
  return (
    <section className="mt-7 grid gap-6 lg:grid-cols-2">
      <form onSubmit={submit} className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-3xl font-black">
          Contact IDS / Suggest an Improvement
        </h2>
        <p className="mt-2 text-slate-600">
          Your submission is tied to your authenticated member account and
          company.
        </p>
        <label className="mt-5 block font-bold">
          Type
          <select name="category" className={inputClass}>
            <option value="new_brand">New Brand Request</option>
            <option value="database_correction">Database Correction</option>
            <option value="member_information">
              Member Information Concern
            </option>
            <option value="search_improvement">
              Search / Filter Suggestion
            </option>
            <option value="portal_improvement">Portal Improvement</option>
            <option value="inaccurate_information">
              Inaccurate Information Report
            </option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="mt-4 block font-bold">
          Subject
          <input
            name="subject"
            required
            maxLength={180}
            className={inputClass}
          />
        </label>
        <label className="mt-4 block font-bold">
          Message
          <textarea
            name="message"
            required
            rows={7}
            maxLength={3000}
            className={inputClass}
          />
        </label>
        <button className="mt-5 rounded-xl bg-emerald-600 px-6 py-3 font-black text-white">
          Submit to IDS
        </button>
      </form>
      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-black">My Submissions</h2>
        <div className="mt-5 space-y-3">
          {suggestions.map((suggestion) => (
            <article key={suggestion.id} className="rounded-2xl border p-4">
              <div className="flex justify-between gap-2">
                <h3 className="font-black">{suggestion.subject}</h3>
                <span className="text-xs font-black uppercase text-emerald-700">
                  {suggestion.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {suggestion.message}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {new Date(suggestion.created_at).toLocaleString()}
              </p>
            </article>
          ))}
          {suggestions.length === 0 && (
            <p className="text-slate-500">
              You have not submitted any suggestions.
            </p>
          )}
        </div>
      </section>
    </section>
  );
}
