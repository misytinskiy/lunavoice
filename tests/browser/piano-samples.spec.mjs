import { test, expect } from "@playwright/test";
import { loadTs } from "../load-ts.mjs";
const { pianoSampleUrl } = loadTs("app/lib/practice.ts");

test("all 49 WAV notes including C2 and C6 decode in the browser", async ({ page }) => {
  await page.goto("/");
  const urls = Array.from({ length: 49 }, (_, i) => pianoSampleUrl(36 + i));
  const decoded = await page.evaluate(async (urls) => {
    const context = new AudioContext();
    try {
      const result = [];
      for (const url of urls) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Missing sample: ${url}`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        result.push({ duration: buffer.duration, rate: buffer.sampleRate, channels: buffer.numberOfChannels });
      }
      return result;
    } finally { await context.close(); }
  }, urls);
  expect(decoded).toHaveLength(49);
  for (const sample of decoded) {
    expect(sample.duration).toBeGreaterThanOrEqual(5.9);
    expect(sample.channels).toBeGreaterThan(0);
  }
});
