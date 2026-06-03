const { handleAlert } = require("../src/notifier-service/src/handler");

// Fake Redis com comportamento SET NX
class RedisFake {
  constructor() {
    this.store = new Map();
  }

  async set(key, value, nx, ex, ttl) {
    // Suporta tanto set(k, v, "NX", "EX", ttl) quanto set(k, v, {nx, ex})
    const isNx = nx === "NX" || (typeof nx === "object" && nx?.nx);
    if (isNx && this.store.has(key)) return null;
    this.store.set(key, value);
    return "OK";
  }

  async del(key) {
    this.store.delete(key);
    return 1;
  }

  async lpush(key, value) {
    if (!this.store.has(key)) this.store.set(key, []);
    this.store.get(key).unshift(value);
    return this.store.get(key).length;
  }

  async ltrim(key, start, stop) {
    if (this.store.has(key)) {
      this.store.set(key, this.store.get(key).slice(start, stop + 1));
    }
    return "OK";
  }
}

describe("RN3 — Idempotência por event_id", () => {
  test("mesmo event_id processa notify apenas uma vez", async () => {
    const redis = new RedisFake();
    const notify = jest.fn().mockResolvedValue(true);

    const msg = {
      event_id: "evt-abc-001",
      kp_index: 8.1,
      classification: "severe",
      emergency_notification: true,
    };

    await handleAlert(msg, { redis, notify });
    await handleAlert(msg, { redis, notify });
    await handleAlert(msg, { redis, notify });

    expect(notify).toHaveBeenCalledTimes(1);
  });

  test("event_ids diferentes são processados separadamente", async () => {
    const redis = new RedisFake();
    const notify = jest.fn().mockResolvedValue(true);

    await handleAlert({ event_id: "evt-001", classification: "low" }, { redis, notify });
    await handleAlert({ event_id: "evt-002", classification: "moderate" }, { redis, notify });
    await handleAlert({ event_id: "evt-003", classification: "severe" }, { redis, notify });

    expect(notify).toHaveBeenCalledTimes(3);
  });

  test("mensagem sem event_id é descartada sem chamar notify", async () => {
    const redis = new RedisFake();
    const notify = jest.fn();

    const result = await handleAlert({ kp_index: 5 }, { redis, notify });

    expect(notify).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  test("libera chave Redis se notify lançar exceção (permite reprocessamento)", async () => {
    const redis = new RedisFake();
    const notify = jest.fn().mockRejectedValueOnce(new Error("falha de rede"));

    const msg = { event_id: "evt-fail-001", classification: "severe" };

    await expect(handleAlert(msg, { redis, notify })).rejects.toThrow("falha de rede");

    // Chave deve ter sido removida para permitir retry
    expect(redis.store.has("idem:notifier:evt-fail-001")).toBe(false);

    // Segunda tentativa deve funcionar
    notify.mockResolvedValueOnce(true);
    const result = await handleAlert(msg, { redis, notify });
    expect(result).toBe(true);
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
