const IDEM_PREFIX = "idem:notifier:";
const IDEM_TTL = 86400; // 24h

const ALERTS_KEY = "alerts:history";
const MAX_ALERTS = 100;

async function handleAlert(payload, { redis, notify }) {
  const eventId = payload.event_id;
  if (!eventId) {
    console.warn("[Notifier] Mensagem sem event_id, descartando");
    return false;
  }

  const key = `${IDEM_PREFIX}${eventId}`;

  const first = await redis.set(key, "1", "NX", "EX", IDEM_TTL);

  if (!first && first !== "OK" && first !== true) {
    console.log(`[Notifier] Duplicate ignored event_id=${eventId}`);
    return false;
  }

  try {
    await notify(payload);

    const record = { ...payload, processed_at: new Date().toISOString() };
    await redis.lpush(ALERTS_KEY, JSON.stringify(record));
    await redis.ltrim(ALERTS_KEY, 0, MAX_ALERTS - 1);

    console.log(`[Notifier] Alerta enviado event_id=${eventId} classification=${payload.classification}`);
    return true;
  } catch (err) {
    // Libera a chave para permitir reprocessamento
    await redis.del(key);
    throw err;
  }
}

module.exports = { handleAlert };
