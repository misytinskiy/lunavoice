import { pianoSampleUrl } from "./practice";

type Voice = { source?: AudioBufferSourceNode; gain?: GainNode; held: boolean };
/** Each physical key/pointer owns its voice, including while a sample loads. */
export class PianoPlayer {
  private context?: AudioContext;
  private output?: GainNode;
  private buffers = new Map<number, Promise<AudioBuffer>>();
  private voices = new Map<string, Voice>();
  private controller = new AbortController();
  private disposed = false;
  private sustain = false;
  private volume = 0.6;
  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.output && this.context)
      this.output.gain.setTargetAtTime(
        this.volume * 0.45,
        this.context.currentTime,
        0.02,
      );
  }
  setSustain(value: boolean) {
    this.sustain = value;
    if (!value)
      for (const [id, voice] of this.voices) if (!voice.held) this.release(id);
  }
  async press(id: string, midi: number) {
    if (this.disposed || this.voices.get(id)?.held) return;
    this.release(id);
    const context = (this.context ??= new AudioContext());
    if (!this.output) {
      this.output = context.createGain();
      this.output.gain.value = this.volume * 0.45;
      this.output.connect(context.destination);
    }
    const voice: Voice = { held: true };
    this.voices.set(id, voice);
    try {
      const resume = context.resume();
      let buffer = this.buffers.get(midi);
      if (!buffer) {
        buffer = fetch(pianoSampleUrl(midi), {
          signal: AbortSignal.any([
            this.controller.signal,
            AbortSignal.timeout(15000),
          ]),
        })
          .then((r) => {
            if (!r.ok) throw new Error("Sample unavailable");
            return r.arrayBuffer();
          })
          .then((b) => context.decodeAudioData(b));
        this.buffers.set(midi, buffer);
        void buffer.catch(() => this.buffers.delete(midi));
      }
      const [, decoded] = await Promise.all([resume, buffer]);
      if (this.disposed || this.voices.get(id) !== voice) return;
      if (context.state !== "running") throw new Error("Audio unavailable");
      const source = context.createBufferSource(),
        gain = context.createGain();
      source.buffer = decoded;
      voice.source = source;
      voice.gain = gain;
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(1, context.currentTime + 0.008);
      source.connect(gain).connect(this.output);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (this.voices.get(id) === voice) this.voices.delete(id);
      };
      source.start();
    } catch (error) {
      if (this.voices.get(id) !== voice || this.disposed) return;
      this.voices.delete(id);
      throw error;
    }
  }
  lift(id: string) {
    const voice = this.voices.get(id);
    if (!voice) return;
    voice.held = false;
    if (!this.sustain || !voice.source) this.release(id);
  }
  private release(id: string) {
    const voice = this.voices.get(id);
    this.voices.delete(id);
    if (voice?.source && voice.gain && this.context) {
      const now = this.context.currentTime;
      voice.gain.gain.cancelAndHoldAtTime(now);
      voice.gain.gain.linearRampToValueAtTime(0, now + 0.09);
      voice.source.stop(now + 0.1);
    }
  }
  stop() {
    for (const id of this.voices.keys()) this.release(id);
  }
  dispose() {
    this.disposed = true;
    this.stop();
    this.controller.abort();
    if (this.context) void this.context.close();
    this.buffers.clear();
  }
}
