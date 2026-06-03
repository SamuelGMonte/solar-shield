const { classifyKp } = require("../src/ingestor-service/src/classify");
const { countHazardousNeos } = require("../src/ingestor-service/src/nasa");

// ─── Teste 3a: Cache HIT/MISS (mock Redis + NASA) ─────────────────────────────
describe("Cache TTL — comportamento HIT/MISS", () => {
  class RedisCacheFake {
    constructor() { this.store = new Map(); }
    async get(key) { return this.store.get(key) ?? null; }
    async set(key, value, ex, ttl) { this.store.set(key, value); return "OK"; }
  }

  async function getCurrentWeather(redis, fetchNasa) {
    const CACHE_KEY = "space:current:weather";
    const cached = await redis.get(CACHE_KEY);
    if (cached) return { ...JSON.parse(cached), cache: "HIT" };

    const kp = await fetchNasa();
    const classified = classifyKp(kp);
    const payload = {
      kp_index: classified.kp_index,
      classification: classified.classification,
      emergency_notification: classified.emergency_notification,
      source: "NASA DONKI",
    };

    await redis.set(CACHE_KEY, JSON.stringify(payload), "EX", 60);
    return { ...payload, cache: "MISS" };
  }

  test("primeira chamada retorna MISS e chama NASA", async () => {
    const redis = new RedisCacheFake();
    const fetchNasa = jest.fn().mockResolvedValue(6.3);

    const result = await getCurrentWeather(redis, fetchNasa);

    expect(result.cache).toBe("MISS");
    expect(result.classification).toBe("moderate");
    expect(fetchNasa).toHaveBeenCalledTimes(1);
  });

  test("segunda chamada retorna HIT sem chamar NASA", async () => {
    const redis = new RedisCacheFake();
    const fetchNasa = jest.fn().mockResolvedValue(6.3);

    await getCurrentWeather(redis, fetchNasa);
    const result = await getCurrentWeather(redis, fetchNasa);

    expect(result.cache).toBe("HIT");
    expect(fetchNasa).toHaveBeenCalledTimes(1); // NASA chamada apenas 1x
  });

  test("erros da NASA não são cacheados", async () => {
    const redis = new RedisCacheFake();
    const fetchNasa = jest.fn().mockRejectedValue(new Error("NASA 503"));

    await expect(getCurrentWeather(redis, fetchNasa)).rejects.toThrow("NASA 503");

    // Cache deve permanecer vazio
    const cached = await redis.get("space:current:weather");
    expect(cached).toBeNull();
  });
});

// ─── Teste 3b: Parsing do payload NEO ────────────────────────────────────────
describe("Parsing NEO — countHazardousNeos", () => {
  test("conta apenas asteroides hazardous=true", () => {
    const neoData = {
      near_earth_objects: {
        "2026-06-09": [
          { name: "NEO-1", is_potentially_hazardous_asteroid: true },
          { name: "NEO-2", is_potentially_hazardous_asteroid: false },
          { name: "NEO-3", is_potentially_hazardous_asteroid: true },
        ],
        "2026-06-10": [
          { name: "NEO-4", is_potentially_hazardous_asteroid: false },
        ],
      },
    };

    expect(countHazardousNeos(neoData)).toBe(2);
  });

  test("retorna 0 para payload sem near_earth_objects", () => {
    expect(countHazardousNeos({})).toBe(0);
    expect(countHazardousNeos(null)).toBe(0);
  });

  test("retorna 0 quando todos são não-hazardous", () => {
    const neoData = {
      near_earth_objects: {
        "2026-06-09": [
          { name: "NEO-1", is_potentially_hazardous_asteroid: false },
        ],
      },
    };
    expect(countHazardousNeos(neoData)).toBe(0);
  });
});
