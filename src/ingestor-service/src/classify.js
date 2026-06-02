function classifyKp(kp) {
  const kpNum = parseFloat(kp);

  let classification;
  let emergency_notification;

  if (kpNum <= 4) {
    classification = "low";
    emergency_notification = false;
  } else if (kpNum <= 7) {
    classification = "moderate";
    emergency_notification = false;
  } else {
    classification = "severe";
    emergency_notification = true;
  }

  return {
    kp_index: kpNum,
    classification,
    emergency_notification,
  };
}

function extractMaxKp(donkiData) {
  if (!Array.isArray(donkiData) || donkiData.length === 0) return 0;

  let maxKp = 0;

  for (const event of donkiData) {
    // Kp direto no evento
    if (event.kpIndex != null) {
      const v = parseFloat(event.kpIndex);
      if (v > maxKp) maxKp = v;
    }

    // Kp aninhado em allKpIndex
    if (Array.isArray(event.allKpIndex)) {
      for (const kpEntry of event.allKpIndex) {
        const v = parseFloat(kpEntry.kpIndex ?? kpEntry.kp ?? 0);
        if (v > maxKp) maxKp = v;
      }
    }
  }

  return maxKp;
}

module.exports = { classifyKp, extractMaxKp };
