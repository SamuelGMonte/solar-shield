const fs = require("fs");
const path = require("path");

const LOG_FILE = process.env.ALERT_LOG_FILE || "/tmp/alerts.log";

async function sendAlert(payload) {
  const timestamp = new Date().toISOString();
  const level = payload.classification?.toUpperCase() ?? "UNKNOWN";

  const line = JSON.stringify({
    timestamp,
    level,
    event_id: payload.event_id,
    kp_index: payload.kp_index,
    classification: payload.classification,
    emergency_notification: payload.emergency_notification,
    neo_hazardous_count: payload.neo_hazardous_count ?? 0,
  });

  console.log(`[ALERT] ${level} — ${line}`);

  fs.appendFileSync(LOG_FILE, line + "\n");
}

module.exports = { sendAlert };
