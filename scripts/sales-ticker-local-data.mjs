import { createServer } from "node:http";
import { createTickerDatabaseFixture } from "./verify-sales-ticker-db.mjs";

/** Loopback Supabase HTTP boundary backed by the exact migrated PostgreSQL fixture. */
export async function startTickerLocalData() {
  const db = await createTickerDatabaseFixture();
  await db.exec("set role service_role");
  const requests = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1:45475");
    requests.push({ method: request.method, path: url.pathname });
    response.setHeader("content-type", "application/json");
    response.setHeader("cache-control", "no-store");
    const send = (value, status = 200) => { response.statusCode = status; response.end(JSON.stringify(value)); };
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
      if (url.pathname === "/rest/v1/rpc/dealer_network_consume_rate_limit") return send(true);
      if (url.pathname === "/rest/v1/rpc/save_homepage_sales_ticker") {
        const result = await db.query("select public.save_homepage_sales_ticker($1::jsonb,$2::bigint) as saved", [JSON.stringify(body.p_ticker), body.p_revision]);
        return send(result.rows[0].saved);
      }
      if (url.pathname === "/rest/v1/homepage_sales_specials") {
        if (request.method === "POST") {
          await db.query("update public.homepage_sales_specials set enabled=$1, cartoon_key=$2, headline=$3, description=$4, updated_at=$5 where id=$6", [body.enabled, body.cartoon_key, body.headline, body.description, body.updated_at, body.id]);
          return send(null);
        }
        const result = await db.query("select * from public.homepage_sales_specials order by id");
        const columns = url.searchParams.get("select")?.split(",") ?? [];
        const rows = result.rows.map((row) => ({ ...row, ticker_revision: Number(row.ticker_revision) }))
          .filter((row) => !url.searchParams.get("id")?.startsWith("eq.") || row.id === url.searchParams.get("id").slice(3))
          .map((row) => columns.length ? Object.fromEntries(columns.map((column) => [column, row[column]])) : row);
        const singleton = request.headers.accept?.includes("vnd.pgrst.object+json");
        return send(singleton ? rows[0] ?? null : rows);
      }
      // Unrelated public homepage sections use empty local content. No remote calls.
      return send([]);
    } catch (error) {
      send({ code: error.code ?? "LOCAL_FIXTURE", message: String(error.message) }, 400);
    }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(45475, "127.0.0.1", resolve); });
  return { db, requests, close: async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await db.close(); } };
}
