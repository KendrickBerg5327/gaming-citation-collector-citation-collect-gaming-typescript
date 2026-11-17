import { collectCitations } from "./citation_service.ts";

const result = await collectCitations({
  game: "Skyforge Arena",
  question: "How did the ranked mode change after launch?",
  event: "season 4 live event",
  asset: "ranked reward badge",
  moderationStatus: "queued"
});

console.log(JSON.stringify({ citations: result.citations, moderation: result.queued ? "queued" : "reviewed" }, null, 2));
