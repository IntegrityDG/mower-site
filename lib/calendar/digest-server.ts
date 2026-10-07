import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetch as privateFetch } from "undici";
import { sendServerEmail } from "@/lib/email";
import { type DigestClaim, type DigestDependencies, type DigestFinish, type DigestPayload, runDailyDigest } from "./digest";

function dependencies(env: NodeJS.ProcessEnv): DigestDependencies {
  // Lazy creation keeps unauthenticated, invalid and wrong-hour invocations from
  // performing any database or provider work.
  let client: SupabaseClient | undefined;
  const database = () => {
    if (client) return client;
    const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Digest unavailable");
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error("Digest unavailable");
    }
    const fetchDatabase: typeof fetch = (input, init) => privateFetch(input as Parameters<typeof privateFetch>[0], {
      ...init, cache: "no-store", redirect: "error",
      signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    } as Parameters<typeof privateFetch>[1]) as unknown as ReturnType<typeof fetch>;
    client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: fetchDatabase },
    });
    return client;
  };
  return {
    fetchFeed: privateFetch as unknown as typeof fetch,
    async readExisting(date) {
      const { data, error } = await database().rpc("read_proton_calendar_digest", { p_date: date });
      if (error) throw new Error("Digest unavailable");
      if (data === null) return null;
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Digest unavailable");
      return data as DigestPayload;
    },
    async claim(payload) {
      const { data, error } = await database().rpc("claim_proton_calendar_digest", {
        p_date: payload.date, p_from: payload.from, p_to: payload.to,
        p_subject: payload.subject, p_text: payload.text, p_event_count: payload.eventCount,
      });
      if (error || !data || typeof data !== "object" || Array.isArray(data)) throw new Error("Digest unavailable");
      return data as DigestClaim;
    },
    async finish(date, leaseId, outcome, providerId) {
      const { data, error } = await database().rpc("finish_proton_calendar_digest", {
        p_date: date, p_lease_id: leaseId, p_outcome: outcome,
        p_provider_message_id: providerId ?? null,
      });
      if (error || !data || typeof data !== "object" || Array.isArray(data)) throw new Error("Digest unavailable");
      return data as DigestFinish;
    },
    async send(payload) {
      const result = await sendServerEmail({
        to: payload.to, subject: payload.subject, text: payload.text,
        idempotencyKey: payload.idempotencyKey,
      });
      if (!result.data?.id) throw new Error("Digest unavailable");
      return { id: result.data.id };
    },
  };
}

export function serverDailyDigest(request: Request) {
  return runDailyDigest(request, process.env, dependencies(process.env));
}
