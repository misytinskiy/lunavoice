import { pianoSampleUrl } from "./practice";
import type { Event } from "./ear-training";

/** Independent output-only player: ear practice never requests microphone access. */
export class EarPlayer {
  private context: AudioContext | null = null;
  private buffers = new Map<number, AudioBuffer>();
  private sources = new Set<AudioBufferSourceNode>();
  private generation = 0;
  private controller: AbortController | null = null;
  private finish: ((completed: boolean) => void) | null = null;
  stop() {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
      source.disconnect();
    }
    this.sources.clear();
    this.finish?.(false);
    this.finish = null;
  }
  async play(events: Event[], bpm: number, volume: number): Promise<boolean> {
    this.stop();
    if (!events.length || !Number.isFinite(bpm) || bpm <= 0)
      throw new Error("Invalid audio sequence");
    const generation = this.generation;
    const context = (this.context ??= new AudioContext());
    const controller = (this.controller = new AbortController());
    // Resume synchronously from the user gesture, before fetching samples (Safari).
    const resumed = context.resume();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      await Promise.race([
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener(
            "abort",
            () => reject(new Error("Playback cancelled or timed out")),
            { once: true },
          );
        }),
        Promise.all([
          resumed,
          ...[...new Set(events.flatMap((e) => e.notes))].map(async (midi) => {
            if (this.buffers.has(midi)) return;
            const response = await fetch(pianoSampleUrl(midi), {
              signal: controller.signal,
            });
            if (!response.ok) throw new Error("Piano sample unavailable");
            const buffer = await context.decodeAudioData(
              await response.arrayBuffer(),
            );
            if (generation === this.generation) this.buffers.set(midi, buffer);
          }),
        ]),
      ]);
      clearTimeout(timeout);
      if (generation !== this.generation) return false;
      if (context.state !== "running") throw new Error("Audio is suspended");
      const start = context.currentTime + 0.06,
        beat = 60 / bpm;
      return await new Promise<boolean>((resolve) => {
        this.finish = resolve;
        let remaining = events.reduce(
          (sum, event) => sum + event.notes.length,
          0,
        );
        for (const event of events)
          for (const midi of event.notes) {
            const source = context.createBufferSource(),
              gain = context.createGain();
            source.buffer = this.buffers.get(midi)!;
            const at = start + event.beat * beat,
              duration = event.duration * beat;
            const level =
              (Math.max(0, Math.min(1, volume)) * 0.7) / event.notes.length;
            gain.gain.setValueAtTime(0, at);
            gain.gain.linearRampToValueAtTime(level, at + 0.012);
            gain.gain.setValueAtTime(
              level,
              at + Math.max(0.013, duration - 0.08),
            );
            gain.gain.linearRampToValueAtTime(0, at + duration);
            source.connect(gain).connect(context.destination);
            this.sources.add(source);
            source.onended = () => {
              source.disconnect();
              gain.disconnect();
              this.sources.delete(source);
              if (generation === this.generation && --remaining === 0) {
                this.finish = null;
                resolve(true);
              }
            };
            source.start(at);
            source.stop(at + duration + 0.02);
          }
      });
    } catch (error) {
      if (generation !== this.generation) return false;
      this.stop();
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  dispose() {
    this.stop();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.buffers.clear();
  }
}
