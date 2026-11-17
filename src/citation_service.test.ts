import assert from "node:assert/strict";
import { uniqueCitations } from "./citation_service.ts";

const result = uniqueCitations([
  { title: "Patch notes", url: "HTTPS://example.test/patch", excerpt: "A" },
  { title: "Same source", url: "https://example.test/patch", excerpt: "B" },
  { title: "Event log", url: "https://example.test/event", excerpt: "C" }
]);

assert.deepEqual(result.map((citation) => citation.url), ["HTTPS://example.test/patch", "https://example.test/event"]);
console.log("dedupe decision: 3 inputs -> 2 citations");
