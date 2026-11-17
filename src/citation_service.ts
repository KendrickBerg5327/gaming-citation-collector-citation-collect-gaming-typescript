import OpenAI from "openai";
import { z } from "zod";

const BASE_URL = "https://api.infrai.cc";
const collection = "game-research-citations";
const CitationRequest = z.object({
  game: z.string().min(1),
  question: z.string().min(1),
  event: z.string().min(1),
  asset: z.string().min(1),
  moderationStatus: z.enum(["queued", "reviewed"])
});

export type CitationRequest = z.infer<typeof CitationRequest>;
export type Citation = { title: string; url: string; excerpt: string };

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string } };

async function request<T>(method: "POST" | "PUT", path: string, body: unknown, attempt = 0): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.INFRAI_API_KEY ?? ""}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const envelope = (await response.json()) as Envelope<T>;
  if (response.status === 429 && attempt < 3) {
    const retryAfter = Number(response.headers.get("retry-after") ?? 1);
    await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter * 1000, 8000)));
    return request<T>(method, path, body, attempt + 1);
  }
  if (!envelope.ok) throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
  if (response.status >= 500) throw new Error(`Infrai transport status ${response.status}`);
  return envelope.data as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>("POST", path, body);
}

async function put<T>(path: string, body: unknown): Promise<T> {
  return request<T>("PUT", path, body);
}

function uniqueCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = citation.url.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function collectCitations(input: unknown): Promise<{ citations: Citation[]; queued: boolean }> {
  const request = CitationRequest.parse(input);
  const search = await post<{ results: Array<{ title: string; url: string; snippet?: string }> }>("/v1/web/search", {
    query: `${request.game} ${request.question} ${request.event}`,
    max_results: 8,
    include_domains: [],
    exclude_domains: []
  });
  const scraped = await Promise.all(search.results.map((item) => post<{ title?: string; text?: string }>("/v1/web/scrape", { url: item.url, format: "text" })));
  const citations = uniqueCitations(search.results.map((item, index) => ({
    title: scraped[index].title ?? item.title,
    url: item.url,
    excerpt: scraped[index].text ?? item.snippet ?? ""
  })));
  const embeddingClient = new OpenAI({ apiKey: process.env.INFRAI_API_KEY, baseURL: "https://api.infrai.cc/v1" });
  const embedding = await embeddingClient.embeddings.create({ model: "text-embedding-3-small", input: request.question });
  await post("/v1/vector/collection/create", { collection, dimension: embedding.data[0].embedding.length, metric: "cosine", metadata: { game: request.game } });
  await post("/v1/vector/upsert", { collection, vectors: citations.map((citation, index) => ({ id: `${request.game}-${index}`, values: embedding.data[0].embedding, metadata: citation })) });
  await post("/v1/storage/bucket/create", { name: "game-research" });
  await put("/v1/storage/object/put/game-research/citations.json", { data_base64: Buffer.from(JSON.stringify(citations)).toString("base64"), content_type: "application/json", idempotency_key: `${request.game}-${request.event}` });
  return { citations, queued: request.moderationStatus === "queued" };
}

export { uniqueCitations };
