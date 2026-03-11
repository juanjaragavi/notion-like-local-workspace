type WorkspaceSearchResult = {
  source: "gmail" | "calendar" | "drive";
  id: string;
  title: string;
  snippet: string;
  url: string;
  timestamp: string;
};

type WorkerMessage = {
  requestId: number;
  engine: "webgpu" | "wasm-simd" | "scalar";
  query: string;
  results: WorkspaceSearchResult[];
};

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const payload = event.data;
  const ranked = [...payload.results].sort((left, right) => {
    const leftScore = scoreResult(payload.query, left);
    const rightScore = scoreResult(payload.query, right);
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }
    return right.timestamp.localeCompare(left.timestamp);
  });

  self.postMessage({
    requestId: payload.requestId,
    engine: payload.engine,
    results: ranked,
  });
};

function scoreResult(query: string, result: WorkspaceSearchResult) {
  const normalizedQuery = normalize(query);
  const normalizedText = normalize(`${result.title} ${result.snippet}`);
  const titleText = normalize(result.title);
  const tokens = normalizedQuery.split(" ").filter(Boolean);

  let score = 0;
  if (titleText.includes(normalizedQuery)) {
    score += 1.4;
  }
  if (normalizedText.includes(normalizedQuery)) {
    score += 0.8;
  }
  for (const token of tokens) {
    if (titleText.includes(token)) {
      score += 0.35;
    } else if (normalizedText.includes(token)) {
      score += 0.18;
    }
  }

  const ageDays = Math.max(
    0,
    (Date.now() - new Date(result.timestamp).getTime()) / 86_400_000,
  );
  return score + Math.max(0, 0.4 - ageDays / 90);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
