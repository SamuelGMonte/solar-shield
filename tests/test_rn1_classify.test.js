const { classifyKp, extractMaxKp } = require("../src/ingestor-service/src/classify");

describe("RN1 — Classificação por Kp (valores de fronteira)", () => {
  test.each([
    [0,   "low",      false],
    [4,   "low",      false],
    [4.9, "moderate", false], // 4.9 > 4, então é moderate
    [5,   "moderate", false],
    [7,   "moderate", false],
    [7.9, "severe",   true ], // 7.9 > 7, então é severe
    [8,   "severe",   true ],
    [9,   "severe",   true ],
  ])("Kp=%s → classification=%s, emergency=%s", (kp, expectedClass, expectedEmergency) => {
    const result = classifyKp(kp);
    expect(result.classification).toBe(expectedClass);
    expect(result.emergency_notification).toBe(expectedEmergency);
    expect(result.kp_index).toBe(parseFloat(kp));
  });
});

describe("RN1 — extractMaxKp do payload DONKI", () => {
  test("retorna 0 para payload vazio", () => {
    expect(extractMaxKp([])).toBe(0);
  });

  test("extrai Kp direto do evento", () => {
    const data = [{ kpIndex: "6.5" }];
    expect(extractMaxKp(data)).toBe(6.5);
  });

  test("extrai Kp máximo de allKpIndex aninhado", () => {
    const data = [
      {
        allKpIndex: [
          { kpIndex: "3.0" },
          { kpIndex: "8.3" },
          { kpIndex: "5.0" },
        ],
      },
    ];
    expect(extractMaxKp(data)).toBe(8.3);
  });

  test("retorna maior Kp entre múltiplos eventos", () => {
    const data = [
      { kpIndex: "4.0" },
      { kpIndex: "7.5" },
      { allKpIndex: [{ kpIndex: "6.0" }] },
    ];
    expect(extractMaxKp(data)).toBe(7.5);
  });
});
