require("dotenv").config();
const amqp = require("amqplib");
const Redis = require("ioredis");

const { handleAlert } = require("./handler");
const { sendAlert } = require("./alert");

const EXCHANGE = "space.events";
const QUEUE = "notifier.alerts";
const ROUTING_KEY = "space.weather.alert";

const redis = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: 6379,
  retryStrategy: (times) => Math.min(times * 500, 3000),
});

redis.on("connect", () => console.log("[Redis] Conectado"));
redis.on("error", (err) => console.error("[Redis] Erro:", err.message));

async function startConsumer() {
  const url = process.env.RABBITMQ_URL || "amqp://guest:guest@rabbitmq:5672";
  let attempts = 0;

  while (attempts < 10) {
    try {
      const connection = await amqp.connect(url);
      const channel = await connection.createChannel();

      await channel.assertExchange(EXCHANGE, "topic", { durable: true });
      await channel.assertQueue(QUEUE, {
        durable: true,
        arguments: {
          // DLQ opcional
          "x-dead-letter-exchange": "space.events.dlx",
        },
      });
      await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
      await channel.prefetch(10);

      console.log(`[Notifier] Aguardando mensagens em ${QUEUE}...`);

      channel.consume(
        QUEUE,
        async (msg) => {
          if (!msg) return;

          const eventId =
            msg.properties.headers?.["x-event-id"] ||
            msg.properties.messageId;

          try {
            const payload = JSON.parse(msg.content.toString());

            const processed = await handleAlert(payload, {
              redis,
              notify: sendAlert,
            });

            channel.ack(msg);

            if (!processed) {
              console.log(`[Notifier] Descartado (duplicado) event_id=${eventId}`);
            }
          } catch (err) {
            console.error(`[Notifier] Erro ao processar event_id=${eventId}:`, err.message);
            channel.nack(msg, false, false); // envia para DLQ
          }
        },
        { noAck: false }
      );

      connection.on("error", (err) => {
        console.error("[RabbitMQ] Conexão perdida:", err.message);
        process.exit(1); // Docker vai reiniciar
      });

      return; // sucesso
    } catch (err) {
      attempts++;
      console.warn(`[RabbitMQ] Tentativa ${attempts}/10 falhou: ${err.message}. Aguardando 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  throw new Error("[RabbitMQ] Não foi possível conectar após 10 tentativas");
}

startConsumer().catch((err) => {
  console.error("[Notifier] Falha ao iniciar:", err.message);
  process.exit(1);
});
