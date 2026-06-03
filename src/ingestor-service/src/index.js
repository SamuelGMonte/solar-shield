require("dotenv").config();
const express = require("express");
const Redis = require("ioredis");
const { v4: uuidv4 } = require("uuid");

const { classifyKp, extractMaxKp } = require("./classify");
const { fetchDonkiGst, fetchNeoFeed, countHazardousNeos, formatDate } = require("./nasa");
const rabbit = require("./rabbit");

const app = express();
app.use(express.json());

const redis = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: 6379,
  retryStrategy: (times) => Math.min(times * 500, 3000),
});

redis.on("connect", () => console.log("[Redis] Conectado"));
redis.on("error", (err) => console.error("[Redis] Erro:", err.message));

const CACHE_KEY = "space:current:weather";
const CACHE_TTL = 60; // segundos

const ALERTS_CACHE_KEY = "alerts:cache";
const ALERTS_CACHE_TTL = 10; // segundos

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/space-weather/current", async (req, res) => {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(JSON.parse(cached));
    }

    const today = new Date();
    const startDate = formatDate(new Date(today.getTime() - 7 * 86400000));
    const endDate = formatDate(today);

    const donkiData = await fetchDonkiGst(startDate, endDate);
    const maxKp = extractMaxKp(donkiData);
    const classified = classifyKp(maxKp);

    const payload = {
      kp_index: classified.kp_index,
      classification: classified.classification,
      emergency_notification: classified.emergency_notification,
      captured_at: new Date().toISOString(),
      source: "NASA DONKI",
      cache: "MISS",
    };

    await redis.set(CACHE_KEY, JSON.stringify({ ...payload, cache: "HIT" }), "EX", CACHE_TTL);

    res.setHeader("X-Cache", "MISS");
    return res.json(payload);
  } catch (err) {
    console.error("[/current] Erro:", err.message);
    return res.status(503).json({ error: "upstream_unavailable", detail: err.message });
  }
});

app.post("/ingest/gst", async (req, res) => {
  try {
    const today = new Date();
    const startDate = formatDate(new Date(today.getTime() - 7 * 86400000));
    const endDate = formatDate(today);

    const donkiData = await fetchDonkiGst(startDate, endDate);
    const maxKp = extractMaxKp(donkiData);
    const classified = classifyKp(maxKp);

    const eventId = `evt-${new Date().toISOString().replace(/[:.]/g, "-")}`;

    let neo_hazardous_count = 0;

    // RN2: busca NEOs perigosos para eventos severe
    if (classified.classification === "severe") {
      const neoStart = formatDate(new Date(today.getTime() - 86400000));
      const neoEnd = formatDate(new Date(today.getTime() + 86400000));
      const neoData = await fetchNeoFeed(neoStart, neoEnd);
      neo_hazardous_count = countHazardousNeos(neoData);
    }

    const message = {
      event_id: eventId,
      kp_index: classified.kp_index,
      classification: classified.classification,
      emergency_notification: classified.emergency_notification,
      neo_hazardous_count,
      captured_at: new Date().toISOString(),
      occurred_at: new Date().toISOString(),
    };

    rabbit.publishAlert(message);

    return res.status(202).json({ event_id: eventId, status: "queued" });
  } catch (err) {
    console.error("[/ingest] Erro:", err.message);
    return res.status(503).json({ error: "ingest_failed", detail: err.message });
  }
});

app.get("/alerts", async (req, res) => {
  try {
    const cached = await redis.get(ALERTS_CACHE_KEY);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(JSON.parse(cached));
    }

    const items = await redis.lrange("alerts:history", 0, 49);
    const alerts = items.map((item) => JSON.parse(item));
    const payload = { count: alerts.length, alerts };

    await redis.set(ALERTS_CACHE_KEY, JSON.stringify(payload), "EX", ALERTS_CACHE_TTL);
    res.setHeader("X-Cache", "MISS");
    return res.json(payload);
  } catch (err) {
    console.error("[/alerts] Erro:", err.message);
    return res.status(503).json({ error: "alerts_unavailable", detail: err.message });
  }
});

app.get("/neo/feed", async (req, res) => {
  try {
    const date = req.query.date || formatDate(new Date());
    const neoData = await fetchNeoFeed(date, date);
    const hazardousCount = countHazardousNeos(neoData);

    return res.json({
      date,
      total_objects: neoData.element_count ?? 0,
      hazardous_count: hazardousCount,
      source: "NASA NEO Feed",
    });
  } catch (err) {
    console.error("[/neo/feed] Erro:", err.message);
    return res.status(503).json({ error: "upstream_unavailable", detail: err.message });
  }
});

const PORT = process.env.PORT || 8080;

async function start() {
  await rabbit.connect();
  app.listen(PORT, () => {
    console.log(`[Ingestor] Rodando na porta ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[Ingestor] Falha ao iniciar:", err.message);
  process.exit(1);
});
