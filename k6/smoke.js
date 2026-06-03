import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10,
  duration: "10s",
  thresholds: {
    http_req_failed: ["rate<0.01"],        // menos de 1% de erros
    http_req_duration: ["p(95)<500"],       // p95 abaixo de 500ms
  },
};

export default function () {
  const res = http.get("http://localhost:8080/api/space-weather/current");

  check(res, {
    "status 200 ou 429": (r) => r.status === 200 || r.status === 429,
    "tem classification (quando 200)": (r) =>
      r.status !== 200 || r.json("classification") !== undefined,
  });

  sleep(1);
}
