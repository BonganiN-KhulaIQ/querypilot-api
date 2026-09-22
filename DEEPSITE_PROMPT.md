# Follow-up prompt for DeepSite

Once `querypilot-api` is deployed, replace `YOUR-DEPLOYED-URL` below with your real Vercel URL
(e.g. `https://querypilot-api.vercel.app`), then paste this into DeepSite as a follow-up
instruction on your existing QueryPilot site:

---

> Add a new "Ask in plain English" feature to this site, above the existing SQL editor:
>
> - A text input with placeholder "Ask a question about your data..." and a "Generate & Run"
>   button.
> - When clicked, send a POST request to `https://YOUR-DEPLOYED-URL/api/nl-to-sql` with a JSON
>   body: `{ "question": "<the user's typed text>", "schema": { "table": "<current table name>",
>   "columns": [{ "name": "<col>", "type": "<type>" }, ...] } }`, where the schema comes from
>   whichever dataset is currently loaded (the same table/column info already used to run raw SQL
>   queries against sql.js).
> - The response is JSON: either `{ "ok": true, "sql": "<generated SELECT statement>" }` or
>   `{ "ok": false, "error": "<message>" }`.
> - On success: show the generated SQL in a small read-only code block above the results (so the
>   user can see exactly what ran — never hide the generated query), then run that SQL against
>   the loaded sql.js database exactly the same way the existing manual SQL editor does, and show
>   the results in the same results table.
> - On failure: show the `error` message in a small, non-alarming inline message near the input
>   (not a browser alert), and don't touch the results table.
> - Show a loading state on the button while the request is in flight (e.g. "Thinking..."), and
>   disable the button until it resolves.
> - This request goes to a different domain than this site, so it's a cross-origin fetch — that's
>   expected and already handled server-side; just use a normal `fetch()` call with
>   `method: "POST"` and `headers: { "Content-Type": "application/json" }`.

---

If you set `APP_SHARED_SECRET` in Vercel, also tell DeepSite to add that header:

> Also add the header `"x-app-key": "YOUR-SHARED-SECRET-VALUE"` to that same fetch request.

(Only do this if you actually set `APP_SHARED_SECRET` in Vercel — otherwise skip it, since the
backend won't be checking for it.)
