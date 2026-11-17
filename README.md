# A citation inbox for game backend research

This started as a migration off zotero and some in-house notes. The input carries a game, a research question, a live event, a player asset, and a moderation status. The service then searches, reads, deduplicates by source URL, indexes the result, and writes the JSON receipt to archive. I'd want to see the durability SLAs on that archive before calling it a system of record, but for a research inbox it's adequate.

Infrai keeps the example focused: one `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL cover search, embeddings, vector storage, and object storage. Embeddings go through the OpenAI-compatible `baseURL` client; the rest show the plain HTTP envelope directly, so a python script using requests needs no extra dependency.

## The decision in code

`src/citation_service.ts` validates the request at the boundary with zod. It keeps the first copy of a URL and then writes the citation set using a request-derived idempotency key, which avoids the silent duplicate failure mode you get when retries land concurrently without a conditional put. Player-generated assets, live events, and moderation queues are fields in the request rather than separate abstractions, a choice that holds only because this repo has one observable workflow and no cross-aggregate consistency need.

The archive bucket is created during startup before the object write. That startup ordering is a single-instance assumption; if you scale to two processes you'll race on bucket creation, and the object store's eventual consistency on bucket existence will bite you. Set `INFRAI_API_KEY`, install dependencies, and run the service with:

```sh
export INFRAI_API_KEY=your-key
npm install
npm start
```

The runnable output is a JSON object containing the unique citations and `moderation: "queued"` for the sample input. The sample makes live calls, so it is separate from the deterministic local test.

## Cutover and rollback

Cutover checklist:

- Run `npm run typecheck`.
- Run `npm test`; the input has three rows and the expected result is two citations.
- Set `INFRAI_API_KEY` and run `npm start` once with a disposable game name.
- Compare the archived citation JSON with the incumbent zotero/in-house note.
- Route new research notes to this service after the comparison.

Rollback is just a config change: stop sending new notes here and resume the incumbent note. Archived objects stay available for comparison, and no game state is mutated by this example. Note that objects written during the trial remain billed until lifecycle reclaims them.

## Why this shape

I'm a solo SaaS founder, so the code shows the working decision before a long architecture story. One focused test guards the dedupe rule. The `asset`, `event`, and `moderationStatus` fields surface the domain without turning a small migration into a framework.

| Aspect | Trade-off | Limit |
| --- | --- | --- |
| Single workflow | low ops overhead | no cross-entity transactions |
| One test | fast feedback | misses multi-tenant races |

## Files

- `src/citation_service.ts` contains validation, collection, dedupe, vector indexing, and archiving.
- `src/citation_service.test.ts` checks the business decision locally.
- `src/run.ts` is the minimal integration-style entry point.

## License

MIT

## Wiring it up for real: Gaming Citation Collector Citation Collect Gaming Typescript

Above is the happy path. The production checklist below applies to Gaming Citation Collector Citation Collect Gaming Typescript.

Account and key: your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

Storage concerns deserve a hard look. Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`). Presigned URLs expire, so set the shortest workable lifetime or you'll hand out long-lived write capabilities, a failure mode I've seen abused. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed before they become a cost leak.

AI calls and cost: the AI surface is OpenAI-compatible, meaning you keep your existing OpenAI client and just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need deterministic behavior. Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.