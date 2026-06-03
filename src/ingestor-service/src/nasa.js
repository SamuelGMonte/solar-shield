const axios = require("axios");
const axiosRetry = require("axios-retry").default ?? require("axios-retry");
const { v4: uuidv4 } = require("uuid");

const nasa = axios.create({
  baseURL: "https://api.nasa.gov",
  timeout: 5000,
  params: { api_key: process.env.NASA_API_KEY || "DEMO_KEY" },
});

axiosRetry(nasa, {
  retries: 3,
  retryDelay: (retryCount) => 500 * Math.pow(2, retryCount - 1), // 500ms, 1s, 2s
  retryCondition: (err) => {
    if (axiosRetry.isNetworkOrIdempotentRequestError(err)) return true;
    const status = err.response ? err.response.status : 0;
    return status === 429 || (status >= 500 && status <= 599);
  },
  onRetry: (retryCount, err, requestConfig) => {
    const correlationId = requestConfig.headers?.["x-correlation-id"] || uuidv4();
    console.log(
      `[NASA Retry] correlationId=${correlationId} attempt=${retryCount} url=${requestConfig.url} status=${err.response?.status ?? "network"}`
    );
  },
});

async function fetchDonkiGst(startDate, endDate) {
  const correlationId = uuidv4();
  console.log(`[NASA] fetchDonkiGst correlationId=${correlationId} start=${startDate} end=${endDate}`);

  const { data } = await nasa.get("/DONKI/notifications", {
    headers: { "x-correlation-id": correlationId },
    params: { startDate, endDate, type: "GST" },
  });

  return data;
}

async function fetchNeoFeed(startDate, endDate) {
  const correlationId = uuidv4();
  console.log(`[NASA] fetchNeoFeed correlationId=${correlationId} start=${startDate} end=${endDate}`);

  const { data } = await nasa.get("/neo/rest/v1/feed", {
    headers: { "x-correlation-id": correlationId },
    params: { start_date: startDate, end_date: endDate },
  });

  return data;
}

function countHazardousNeos(neoData) {
  if (!neoData?.near_earth_objects) return 0;

  let count = 0;
  for (const dateKey of Object.keys(neoData.near_earth_objects)) {
    for (const neo of neoData.near_earth_objects[dateKey]) {
      if (neo.is_potentially_hazardous_asteroid === true) count++;
    }
  }
  return count;
}

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

module.exports = { fetchDonkiGst, fetchNeoFeed, countHazardousNeos, formatDate };
