<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Preserve the target TanStack bootstrap and generated Cloud integration modules when importing source; these bind the app to its runtime.
- Authenticate admin operations with server-signed, expiring sessions and server-only credentials; seller operations use Cloud identity and protected roles. Never bundle credentials.
- Keep immutable product/QC image bytes in private storage and expose only intentionally public archive/catalog prefixes through the cached photo endpoint.
- Use streaming image editing with an authenticated server route; persist terminal access blocks and never automatically retry denied requests.

- Strip caller-provided product IDs from seller inserts and disallow seller upserts to prevent overwriting another store.

- Homepage promotional photos, copy and destinations read admin-managed settings; defaults apply only when a field is empty.

- Scope homepage layout styling to the homepage; preserve the original shared palette and other public surfaces to avoid cross-page redesigns.
- Use the shared category symbol resolver in catalogue and category management so renamed categories keep consistent automatic symbols without schema changes.
- Whole-page translation runs client-side over text nodes via a server AI function with per-language localStorage cache; mark untranslatable areas with data-no-translate. Why: covers text outside the dictionary.
- Serve catalogue, agent and settings data from the hosted database; the bundled JSON snapshot is a read-only fallback merged by product id. Why: the panels edit the database, so a snapshot must never win over a stored row.
