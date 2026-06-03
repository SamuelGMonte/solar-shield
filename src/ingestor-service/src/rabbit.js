const amqp = require("amqplib");
const { v4: uuidv4 } = require("uuid");

let connection = null;
let channel = null;

const EXCHANGE = "space.events";
const ROUTING_KEY = "space.weather.alert";

async function connect() {
  const url = process.env.RABBITMQ_URL || "amqp://guest:guest@rabbitmq:5672";
  let attempts = 0;

  while (attempts < 10) {
    try {
      connection = await amqp.connect(url);
      channel = await connection.createChannel();

      await channel.assertExchange(EXCHANGE, "topic", { durable: true });
      console.log("[RabbitMQ] Conectado e exchange declarada");

      connection.on("error", (err) => {
        console.error("[RabbitMQ] Erro na conexão:", err.message);
      });

      return channel;
    } catch (err) {
      attempts++;
      console.warn(`[RabbitMQ] Tentativa ${attempts}/10 falhou: ${err.message}. Aguardando 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  throw new Error("[RabbitMQ] Não foi possível conectar após 10 tentativas");
}

function publishAlert(payload) {
  if (!channel) throw new Error("Canal RabbitMQ não inicializado");

  const eventId = payload.event_id || uuidv4();
  const message = { event_id: eventId, ...payload };
  const buf = Buffer.from(JSON.stringify(message));

  channel.publish(EXCHANGE, ROUTING_KEY, buf, {
    persistent: true,
    messageId: eventId,
    contentType: "application/json",
    headers: { "x-event-id": eventId },
  });

  console.log(`[RabbitMQ] Publicado event_id=${eventId} classification=${payload.classification}`);
  return eventId;
}

module.exports = { connect, publishAlert };
