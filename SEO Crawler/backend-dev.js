import http from "http";

const PORT = 3001;

// Mock data
const mockJobs = [
  {
    id: "1",
    seed: "seo",
    sources: "google,bing",
    status: "completed",
    created_at: Date.now(),
  },
];

const mockResults = [
  {
    id: "1",
    normalized_keyword: "seo basics",
    source: "google",
    intent: "informational",
    score: 45,
    difficulty: 25,
    roi_score: 55,
  },
  {
    id: "2",
    normalized_keyword: "best seo tools",
    source: "google",
    intent: "commercial",
    score: 62,
    difficulty: 55,
    roi_score: 72,
  },
  {
    id: "3",
    normalized_keyword: "seo tutorial",
    source: "bing",
    intent: "informational",
    score: 38,
    difficulty: 20,
    roi_score: 48,
  },
];

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Routes
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  if (path === "/api/jobs" && req.method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify({ data: mockJobs, total: 1 }));
    return;
  }

  if (path.match(/^\/api\/jobs\/\d+$/) && req.method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify(mockJobs[0]));
    return;
  }

  if (path.match(/^\/api\/jobs\/\d+\/results$/) && req.method === "GET") {
    const jobId = path.match(/\/api\/jobs\/(\d+)\/results/)?.[1] || "1";
    const pageParam = url.searchParams.get("page") || "1";
    const pageSizeParam = url.searchParams.get("pageSize") || "25";
    res.writeHead(200);
    res.end(
      JSON.stringify({
        jobId,
        keywords: mockResults,
        total: mockResults.length,
        page: parseInt(pageParam),
        pageSize: parseInt(pageSizeParam),
      }),
    );
    return;
  }

  if (path.match(/^\/api\/jobs$/) && req.method === "POST") {
    res.writeHead(201);
    res.end(
      JSON.stringify({
        id: "1",
        seed: "seo",
        sources: "google",
        status: "waiting",
      }),
    );
    return;
  }

  // 404
  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`✅ Mock Backend running on http://localhost:${PORT}`);
  console.log(`   Ready for testing Phase 4 fixes`);
});
