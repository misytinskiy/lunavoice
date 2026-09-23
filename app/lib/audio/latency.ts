/** Short deterministic chirp; correlation rejects unrelated speech and room noise. */
export function calibrationChirp(sampleRate: number) {
  const size = Math.round(sampleRate * 0.008);
  return Float32Array.from({ length: size }, (_, i) => {
    const t = i / sampleRate;
    const phase =
      2 * Math.PI * (700 * t + ((0.5 * (1800 - 700)) / 0.008) * t * t);
    return 0.45 * Math.sin(phase) * Math.sin((Math.PI * i) / (size - 1)) ** 2;
  });
}
export function findChirp(samples: Float32Array, reference: Float32Array) {
  let referenceEnergy = 0;
  for (const value of reference) referenceEnergy += value * value;
  let best = 0.65,
    index = -1;
  for (
    let offset = 0;
    offset <= samples.length - reference.length;
    offset += 2
  ) {
    let cross = 0,
      energy = 0;
    for (let i = 0; i < reference.length; i++) {
      const value = samples[offset + i];
      cross += value * reference[i];
      energy += value * value;
    }
    if (energy / reference.length < 0.000009) continue;
    const correlation = Math.abs(cross) / Math.sqrt(energy * referenceEnergy);
    if (correlation > best) {
      best = correlation;
      index = offset;
    }
  }
  return index === -1 ? null : { index, confidence: best };
}
export function latencyCorrection(
  delays: number[],
  outputLatency: number,
  reportedInputLatency: number,
) {
  if (
    delays.length !== 3 ||
    delays.some((value) => !Number.isFinite(value) || value < 0 || value > 0.8)
  )
    throw new Error(
      "Не удалось услышать все три сигнала. Поднесите наушник ближе к микрофону и повторите или задайте поправку вручную.",
    );
  const sorted = [...delays].sort((a, b) => a - b);
  if (sorted[2] - sorted[0] > 0.06)
    throw new Error(
      "Задержка нестабильна. Повторите измерение в тишине; предыдущая настройка сохранена.",
    );
  return {
    roundTripMs: Math.round(sorted[1] * 1000),
    correctionMs: Math.max(
      -200,
      Math.min(
        800,
        Math.round((sorted[1] - outputLatency - reportedInputLatency) * 1000),
      ),
    ),
  };
}
