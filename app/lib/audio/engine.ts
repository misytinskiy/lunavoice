import { getExercise, intervalBounds } from "../exercises";
import {
  DEFAULT_PRACTICE,
  normalizePractice,
  practiceNotes,
  practiceGuideNotes,
  pianoSampleUrl,
  suggestBase,
  type PracticeSettings,
} from "../practice";
import { noteName, type ExerciseNote } from "../pitch";
import {
  analyse,
  audibleTime,
  calibrateNoise,
  inputDelay,
  PitchScore,
  PitchTracker,
  VisualPitch,
  type Reading,
} from "./analysis";
import { audioError, bounded } from "./async";
import { calibrationChirp, findChirp, latencyCorrection } from "./latency";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  normalizeSettings,
  saveSettings,
  type AudioSettings,
  type OutputMode,
  type StorageLike,
} from "./settings";

export type AudioStatus =
  | "idle"
  | "loading"
  | "checking"
  | "playing"
  | "paused"
  | "finished";
export type VoicePoint = { time: number; midi: number | null; hit: boolean };
export type AudioSnapshot = {
  status: AudioStatus;
  time: number;
  pitch: number | null;
  score: number | null;
  error: string;
  notice: string;
  listening: boolean;
  volume: number;
  settings: AudioSettings;
  devices: { id: string; label: string }[];
  reading: Reading;
  heardVoice: boolean;
  setupRequired: boolean;
  practice: PracticeSettings;
  suggestedBaseMidi: number | null;
  referencePlaying: boolean;
  calibrationProgress: number | null;
  delayProgress: number | null;
  roundTripMs: number | null;
  scoreReason: string;
  result: ReturnType<PitchScore["result"]> | null;
  diagnostics: {
    sampleRate: number;
    inputMs: number | null;
    outputMs: number;
    correctionMs: number;
    analysisMs: number;
    maxAnalysisMs: number;
    maxGapMs: number;
    echoCancellation: boolean | null;
  } | null;
};
export type AttemptEvent = {
  type: "started" | "completed" | "interrupted";
  id: string;
  startedAt: string;
  snapshot: AudioSnapshot;
};
export type AudioEnvironment = {
  createContext: () => AudioContext;
  media: () => MediaDevices | undefined;
  storage: () => StorageLike | null;
  fetch: typeof fetch;
  now: () => number;
  setInterval: (
    callback: () => void,
    milliseconds: number,
  ) => ReturnType<typeof setInterval>;
  clearInterval: (id: ReturnType<typeof setInterval>) => void;
};
const browserEnvironment: AudioEnvironment = {
  createContext: () => new AudioContext({ latencyHint: "interactive" }),
  media: () => navigator.mediaDevices,
  storage: () => {
    try {
      return localStorage;
    } catch {
      return null;
    }
  },
  fetch: (...args) => fetch(...args),
  now: () => performance.now(),
  setInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
  clearInterval: (id) => clearInterval(id),
};
const EMPTY_READING: Reading = {
  rms: 0,
  db: -100,
  peak: 0,
  midi: null,
  state: "silence",
};
const initial = (): AudioSnapshot => ({
  status: "idle",
  time: 0,
  pitch: null,
  score: null,
  error: "",
  notice: "",
  listening: false,
  volume: 55,
  settings: { ...DEFAULT_SETTINGS },
  devices: [],
  reading: EMPTY_READING,
  heardVoice: false,
  setupRequired: false,
  practice: { ...DEFAULT_PRACTICE },
  suggestedBaseMidi: null,
  referencePlaying: false,
  calibrationProgress: null,
  delayProgress: null,
  roundTripMs: null,
  scoreReason: "",
  result: null,
  diagnostics: null,
});
type Resources = {
  abort: AbortController;
  context: AudioContext;
  stream: MediaStream | null;
  nodes: AudioNode[];
  sources: AudioBufferSourceNode[];
  output: GainNode | null;
  analyser: AnalyserNode | null;
  timer: ReturnType<typeof setInterval> | null;
  samples: Float32Array<ArrayBuffer>;
  work: Float32Array<ArrayBuffer>;
  buffers: Map<number, AudioBuffer>;
  notes: ExerciseNote[];
  practice: PracticeSettings;
  comfortablePitches: number[];
  referenceUntil: number;
  scorer: PitchScore;
  tracker: PitchTracker;
  visual: VisualPitch;
  origin: number;
  lastTick: number;
  lastPublish: number;
  lastAudioTime: number;
  inputLatency: number;
  inputReported: boolean;
  voiceSeconds: number;
  noiseStart: number | null;
  noiseReadings: Reading[];
  transition: boolean;
  delay: number;
  maxGap: number;
  maxAnalysis: number;
  computeTotal: number;
  computeCount: number;
  muted: boolean;
  loopback: {
    reference: Float32Array;
    times: number[];
    delays: (number | null)[];
    sources: AudioBufferSourceNode[];
  } | null;
};
const stopStream = (stream: MediaStream) =>
  stream.getTracks().forEach((track) => {
    track.onended = track.onmute = track.onunmute = null;
    track.stop();
  });

/** Owns every audio resource, independent of React and of the canvas rendering loop. */
export class AudioEngine {
  private state = initial();
  private listeners = new Set<() => void>();
  private resource: Resources | null = null;
  private history: VoicePoint[] = [];
  private liveTime = 0;
  private attempt: { id: string; startedAt: string } | null = null;
  private attemptListeners = new Set<(event: AttemptEvent) => void>();
  subscribeAttempts = (listener: (event: AttemptEvent) => void) => {
    this.attemptListeners.add(listener);
    return () => {
      this.attemptListeners.delete(listener);
    };
  };
  private emitAttempt(type: AttemptEvent["type"]) {
    if (!this.attempt) return;
    const event = { type, ...this.attempt, snapshot: this.state };
    if (type !== "started") this.attempt = null;
    // Persistence failures must never interrupt audio or resource cleanup.
    this.attemptListeners.forEach((listener) => {
      try {
        listener(event);
      } catch {}
    });
  }
  constructor(private env: AudioEnvironment = browserEnvironment) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<AudioSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  restoreSettings() {
    this.publish({ settings: loadSettings(this.env.storage()) });
  }
  private persist() {
    if (!saveSettings(this.env.storage(), this.state.settings))
      this.publish({
        notice:
          "Настройки работают в этой вкладке, но браузер не разрешил их сохранить.",
      });
  }
  getVisual = () => ({ time: this.liveTime, history: this.history });
  private current(resource: Resources) {
    return this.resource === resource && !resource.abort.signal.aborted;
  }
  private disposeResources() {
    this.emitAttempt("interrupted");
    const r = this.resource;
    this.resource = null;
    if (!r) return;
    r.abort.abort();
    if (r.timer !== null) this.env.clearInterval(r.timer);
    r.context.onstatechange = null;
    if (r.stream) stopStream(r.stream);
    for (const source of r.sources) {
      try {
        source.stop();
      } catch {}
    }
    for (const node of r.nodes) {
      try {
        node.disconnect();
      } catch {}
    }
    if (r.context.state !== "closed") void r.context.close().catch(() => {});
  }
  dispose() {
    this.disposeResources();
    this.listeners.clear();
  }
  reset = () => {
    this.disposeResources();
    this.liveTime = 0;
    this.history = [];
    this.publish({
      status: "idle",
      setupRequired: false,
      suggestedBaseMidi: null,
      referencePlaying: false,
      time: 0,
      pitch: null,
      score: null,
      error: "",
      notice: "",
      reading: EMPTY_READING,
      heardVoice: false,
      calibrationProgress: null,
      delayProgress: null,
      roundTripMs: null,
      diagnostics: null,
      result: null,
      scoreReason: "",
      listening: false,
    });
  };
  private fail(error: unknown) {
    const microphoneFailure =
      !this.state.listening &&
      /микрофон|доступ|permission|device|notallowed|notfound|notreadable/i.test(
        audioError(error),
      );
    if (microphoneFailure) {
      this.publish({
        settings: { ...this.state.settings, checked: false },
        setupRequired: true,
      });
      this.persist();
    }
    this.disposeResources();
    this.history = [];
    this.liveTime = 0;
    this.publish({
      status: "idle",
      time: 0,
      pitch: null,
      reading: EMPTY_READING,
      calibrationProgress: null,
      delayProgress: null,
      heardVoice: false,
      error: audioError(error),
    });
  }
  clearError = () => this.publish({ error: "" });
  setVolume = (volume: number) => {
    const value = Number.isFinite(volume)
      ? Math.max(0, Math.min(100, volume))
      : this.state.volume;
    this.publish({ volume: value });
    if (this.resource?.output)
      this.resource.output.gain.setTargetAtTime(
        value / 100,
        this.resource.context.currentTime,
        0.02,
      );
  };
  configure = (patch: Partial<AudioSettings>) => {
    if (["playing", "paused", "loading"].includes(this.state.status)) return;
    if (this.resource?.loopback) return;
    const routeChanged =
      patch.deviceId !== undefined || patch.outputMode !== undefined;
    if (routeChanged) {
      const { deviceId, outputMode } = { ...this.state.settings, ...patch };
      this.reset();
      this.publish({
        settings: loadSettings(this.env.storage(), deviceId, outputMode),
      });
    } else {
      this.publish({
        settings: normalizeSettings({ ...this.state.settings, ...patch }),
      });
      if (this.resource) {
        this.resource.noiseStart = null;
        this.resource.tracker.reset();
        this.publish({ calibrationProgress: null });
      }
    }
    this.persist();
  };
  refreshDevices = async () => {
    try {
      const devices = await this.env.media()?.enumerateDevices();
      if (devices)
        this.publish({
          devices: devices
            .filter(
              (d) =>
                d.kind === "audioinput" &&
                d.deviceId &&
                d.deviceId !== "default",
            )
            .map((d, i) => ({
              id: d.deviceId,
              label: d.label || `Микрофон ${i + 1}`,
            })),
        });
      const track = this.resource?.stream?.getAudioTracks()[0];
      if (track?.readyState === "ended")
        this.fail(
          new Error(
            "Микрофон отключён. Выберите устройство и повторите проверку.",
          ),
        );
    } catch {
      /* Labels/devices may be unavailable until permission is granted. */
    }
  };
  prepare = async (
    input: PracticeSettings | number,
    preview = false,
    autoStart = false,
  ) => {
    if (["loading", "playing", "paused"].includes(this.state.status)) return;
    this.reset();
    const practice = normalizePractice(input);
    this.publish({
      practice,
      status: "loading",
      listening: preview,
      notice: preview
        ? "Загружаем звуки…"
        : "Разрешите доступ к микрофону в браузере…",
    });
    let r: Resources | null = null;
    try {
      if (!preview && !this.env.media()?.getUserMedia)
        throw new Error(
          "Микрофон доступен на localhost или по HTTPS. Откройте приложение по защищённому адресу.",
        );
      const context = this.env.createContext();
      const notes = practiceNotes(practice);
      r = {
        abort: new AbortController(),
        context,
        stream: null,
        nodes: [],
        sources: [],
        output: null,
        analyser: null,
        timer: null,
        samples: new Float32Array(2048),
        work: new Float32Array(2048),
        buffers: new Map(),
        notes,
        practice,
        comfortablePitches: [],
        referenceUntil: 0,
        scorer: new PitchScore(notes),
        tracker: new PitchTracker(),
        visual: new VisualPitch(),
        origin: 0,
        lastTick: this.env.now(),
        lastPublish: 0,
        lastAudioTime: -1,
        inputLatency: 0,
        inputReported: false,
        voiceSeconds: 0,
        noiseStart: null,
        noiseReadings: [],
        transition: false,
        delay: 0,
        maxGap: 0,
        maxAnalysis: 0,
        computeTotal: 0,
        computeCount: 0,
        muted: false,
        loopback: null,
      };
      this.resource = r;
      const resource = r;
      const signal = resource.abort.signal;
      await bounded(context.resume(), signal, 20000);
      if (!this.current(resource)) return;
      if (!preview) {
        const settings = this.state.settings;
        const stream = await bounded(
          this.env.media()!.getUserMedia({
            audio: {
              deviceId:
                settings.deviceId === "default"
                  ? undefined
                  : { exact: settings.deviceId },
              echoCancellation: settings.outputMode === "speakers",
              noiseSuppression: false,
              autoGainControl: false,
            },
            video: false,
          }),
          signal,
          20000,
          stopStream,
        );
        // The promise can settle just before reset; re-check ownership before assigning it.
        if (!this.current(resource)) {
          stopStream(stream);
          return;
        }
        resource.stream = stream;
        const track = stream.getAudioTracks()[0];
        if (!track || track.readyState === "ended")
          throw new Error(
            "Микрофон отключился во время подготовки. Попробуйте снова.",
          );
        resource.muted = track.muted;
        const actual = track.getSettings();
        const actualId = actual.deviceId || settings.deviceId;
        if (actualId !== settings.deviceId)
          this.publish({
            settings: loadSettings(
              this.env.storage(),
              actualId,
              settings.outputMode,
            ),
          });
        this.persist();
        resource.inputReported =
          typeof (actual as MediaTrackSettings & { latency?: number })
            .latency === "number";
        resource.inputLatency = Math.max(
          0,
          Math.min(
            0.5,
            Number(
              (actual as MediaTrackSettings & { latency?: number }).latency,
            ) || 0,
          ),
        );
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0;
        const input = context.createMediaStreamSource(stream);
        const silent = context.createGain();
        silent.gain.value = 0;
        input.connect(analyser);
        analyser.connect(silent);
        silent.connect(context.destination);
        resource.analyser = analyser;
        resource.nodes.push(input, analyser, silent);
        track.onended = () => {
          if (this.current(resource))
            this.fail(
              new Error(
                "Микрофон отключён. Выберите устройство и повторите проверку.",
              ),
            );
        };
        track.onmute = () => {
          if (this.current(resource)) {
            resource.muted = true;
            this.interrupt(
              "Микрофон временно недоступен. Проверьте устройство и продолжите.",
            );
          }
        };
        track.onunmute = () => {
          if (this.current(resource)) resource.muted = false;
        };
        await this.refreshDevices();
        if (!this.current(resource)) return;
      }
      this.publish({ notice: "Загружаем звуки упражнения…" });
      await this.loadSamples(resource, practice);
      if (!this.current(resource)) return;
      const output = context.createGain();
      output.gain.value = this.state.volume / 100;
      output.connect(context.destination);
      resource.output = output;
      resource.nodes.push(output);
      context.onstatechange = () => {
        if (!this.current(resource) || resource.transition) return;
        if (context.state === "closed")
          this.fail(
            new Error("Аудиосессия закрылась. Повторите проверку микрофона."),
          );
        else if (context.state !== "running")
          this.interrupt(
            "Звук прерван устройством. Нажмите «Продолжить» после возврата.",
          );
      };
      resource.lastTick = this.env.now();
      resource.timer = this.env.setInterval(() => {
        try {
          this.tick(resource);
        } catch (error) {
          if (this.current(resource)) this.fail(error);
        }
      }, 25);
      this.publish({ status: "checking", notice: "", error: "" });
      if (preview) await this.begin();
      else if (autoStart && this.state.settings.checked) await this.begin(true);
      else if (autoStart) this.publish({ setupRequired: true });
      if (!this.current(resource)) return;
      if (context.state !== "running")
        this.fail(
          new Error("Звук прерван во время подготовки. Повторите проверку."),
        );
    } catch (error) {
      if (!r || this.current(r)) this.fail(error);
    }
  };
  private async loadSamples(r: Resources, practice: PracticeSettings) {
    const bounds = intervalBounds(getExercise(practice.exerciseId));
    const midis = new Set([
      ...practiceNotes(practice).map((n) => n.midi),
      ...practiceGuideNotes(practice).map((n) => n.midi),
      practice.baseMidi + bounds.min,
      practice.baseMidi + bounds.max,
    ]);
    await bounded(
      Promise.all(
        [...midis]
          .filter((midi) => !r.buffers.has(midi))
          .map(async (midi) => {
            const response = await this.env.fetch(pianoSampleUrl(midi), {
              signal: r.abort.signal,
            });
            if (!response.ok)
              throw new Error(
                `Не удалось загрузить ${noteName(midi)}. Повторите подготовку.`,
              );
            const buffer = await r.context.decodeAudioData(
              await response.arrayBuffer(),
            );
            if (this.current(r)) r.buffers.set(midi, buffer);
          }),
      ),
      r.abort.signal,
      15000,
    );
  }
  retarget = async (input: PracticeSettings) => {
    const r = this.resource;
    if (
      !r ||
      this.state.status !== "checking" ||
      r.transition ||
      r.loopback ||
      r.noiseStart !== null ||
      this.state.referencePlaying
    )
      return false;
    const practice = normalizePractice(input);
    r.transition = true;
    this.publish({ status: "loading", notice: "Готовим новый диапазон…" });
    try {
      await this.loadSamples(r, practice);
      if (!this.current(r)) return false;
      if (r.context.state !== "running")
        throw new Error("Звук прерван. Повторите проверку микрофона.");
      r.notes = practiceNotes(practice);
      r.practice = practice;
      this.publish({ practice, status: "checking", notice: "", error: "" });
      return true;
    } catch (error) {
      if (this.current(r)) this.fail(error);
      return false;
    } finally {
      r.transition = false;
    }
  };
  previewRange = () => {
    const r = this.resource;
    if (
      !r ||
      this.state.status !== "checking" ||
      r.transition ||
      r.loopback ||
      r.noiseStart !== null ||
      this.state.referencePlaying
    )
      return;
    if (this.state.volume === 0) {
      this.publish({
        error: "Увеличьте громкость фортепиано, чтобы послушать диапазон.",
      });
      return;
    }
    const start = r.context.currentTime + 0.05;
    const bounds = intervalBounds(getExercise(r.practice.exerciseId));
    [
      r.practice.baseMidi + bounds.min,
      r.practice.baseMidi + bounds.max,
      r.practice.baseMidi + bounds.min,
    ].forEach((midi, i) => {
      const source = r.context.createBufferSource();
      const gain = r.context.createGain();
      source.buffer = r.buffers.get(midi)!;
      source.connect(gain);
      gain.connect(r.output!);
      const at = start + i * 0.85;
      gain.gain.setValueAtTime(1, at);
      gain.gain.linearRampToValueAtTime(0, at + 0.65);
      source.start(at);
      source.stop(at + 0.65);
      r.sources.push(source);
      r.nodes.push(source, gain);
    });
    r.referenceUntil = start + 2.8;
    r.comfortablePitches = [];
    r.tracker.reset();
    this.publish({
      referencePlaying: true,
      reading: EMPTY_READING,
      pitch: null,
      notice:
        "Слушайте нижнюю и верхнюю ноты. Затем попробуйте спеть их без напряжения.",
    });
  };
  begin = async (skipCheck = false) => {
    const r = this.resource;
    if (
      !r ||
      r.transition ||
      this.state.referencePlaying ||
      this.state.status !== "checking" ||
      r.noiseStart !== null ||
      r.loopback !== null ||
      (!this.state.listening &&
        !this.state.heardVoice &&
        !(skipCheck && this.state.settings.checked))
    )
      return false;
    r.transition = true;
    try {
      await bounded(r.context.resume(), r.abort.signal, 5000);
      if (!this.current(r)) return false;
      if (r.muted || r.context.state !== "running")
        throw new Error(
          "Микрофон или звук временно недоступен. Повторите проверку.",
        );
      if (!this.state.listening) {
        this.publish({
          settings: { ...this.state.settings, checked: true },
          setupRequired: false,
        });
        this.persist();
      }
      r.origin = r.context.currentTime + 0.12;
      r.delay = inputDelay(
        r.context.sampleRate,
        r.samples.length,
        r.inputLatency,
        this.state.settings.correctionMs,
      );
      r.scorer = new PitchScore(r.notes);
      r.tracker.reset();
      r.visual = new VisualPitch();
      r.lastTick = this.env.now();
      r.lastAudioTime = r.context.currentTime;
      this.history = [];
      this.liveTime = 0;
      const guide = practiceGuideNotes(r.practice);
      for (const note of [...r.notes, ...guide]) {
        const source = r.context.createBufferSource();
        source.buffer = r.buffers.get(note.midi)!;
        const envelope = r.context.createGain();
        source.connect(envelope);
        envelope.connect(r.output!);
        const at = r.origin + note.start;
        envelope.gain.setValueAtTime(0, at);
        const gain = guide.includes(note) ? 0.6 : 1;
        envelope.gain.linearRampToValueAtTime(gain, at + 0.015);
        envelope.gain.setValueAtTime(gain, at + note.duration - 0.08);
        envelope.gain.linearRampToValueAtTime(0, at + note.duration);
        r.sources.push(source);
        r.nodes.push(source, envelope);
        source.start(at);
        source.stop(at + note.duration);
      }
      this.publish({
        status: "playing",
        time: 0,
        pitch: null,
        error: "",
        notice: "",
        reading: EMPTY_READING,
        scoreReason: this.state.listening
          ? "Режим прослушивания"
          : this.state.settings.outputMode === "speakers"
            ? "В режиме динамиков процент отключён: микрофон может слышать фортепиано. Для оценки выберите наушники."
            : "",
      });
      if (!this.state.listening) {
        this.attempt = {
          id: crypto.randomUUID(),
          startedAt: new Date().toISOString(),
        };
        this.emitAttempt("started");
      }
      return true;
    } catch (error) {
      if (this.current(r)) this.fail(error);
      return false;
    } finally {
      r.transition = false;
    }
  };
  calibrate = () => {
    const r = this.resource;
    if (
      !r ||
      this.state.status !== "checking" ||
      r.loopback ||
      this.state.referencePlaying
    )
      return;
    r.noiseStart = this.env.now();
    r.noiseReadings = [];
    r.tracker.reset();
    this.publish({
      calibrationProgress: 0,
      error: "",
      notice: "Две секунды тишины. Не пойте и не касайтесь микрофона.",
    });
  };
  measureDelay = () => {
    const r = this.resource;
    if (
      !r ||
      this.state.status !== "checking" ||
      r.loopback ||
      this.state.referencePlaying ||
      r.noiseStart !== null
    )
      return;
    if (this.state.volume < 10) {
      this.publish({
        error: "Для измерения увеличьте громкость фортепиано хотя бы до 10%.",
      });
      return;
    }
    const reference = calibrationChirp(r.context.sampleRate);
    const times = [0.5, 1.4, 2.3].map(
      (offset) => r.context.currentTime + offset,
    );
    const buffer = r.context.createBuffer(
      1,
      reference.length,
      r.context.sampleRate,
    );
    buffer.copyToChannel(reference, 0);
    const sources = times.map((at) => {
      const source = r.context.createBufferSource();
      source.buffer = buffer;
      source.connect(r.output!);
      r.sources.push(source);
      r.nodes.push(source);
      source.start(at);
      return source;
    });
    r.loopback = { reference, times, delays: [null, null, null], sources };
    this.publish({
      delayProgress: 0,
      error: "",
      notice: "Три коротких сигнала. Держите наушник у микрофона и не пойте.",
    });
  };
  private sampleDelay(r: Resources) {
    const calibration = r.loopback;
    if (!calibration || !r.analyser) return;
    r.analyser.getFloatTimeDomainData(r.samples);
    const match = findChirp(r.samples, calibration.reference);
    if (match) {
      const arrived =
        r.context.currentTime -
        (r.samples.length - match.index) / r.context.sampleRate;
      const index = calibration.times.findIndex(
        (at, i) =>
          calibration.delays[i] === null && arrived >= at && arrived - at < 0.8,
      );
      if (index !== -1)
        calibration.delays[index] = arrived - calibration.times[index];
    }
    const elapsed = r.context.currentTime - (calibration.times[0] - 0.5);
    if (r.context.currentTime >= calibration.times[2] + 0.85) {
      r.loopback = null;
      for (const source of calibration.sources) source.disconnect();
      try {
        const measured = latencyCorrection(
          calibration.delays.filter((value): value is number => value !== null),
          Math.max(
            0,
            r.context.currentTime - audibleTime(r.context, this.env.now()),
          ),
          r.inputLatency,
        );
        this.publish({
          settings: {
            ...this.state.settings,
            correctionMs: measured.correctionMs,
          },
          roundTripMs: measured.roundTripMs,
          delayProgress: null,
          notice: `Измерено ${measured.roundTripMs} мс от выхода до входа. Поправка сохранена. Верните наушник на место и спойте ноту.`,
          heardVoice: false,
        });
        r.voiceSeconds = 0;
        r.tracker.reset();
        this.persist();
      } catch (error) {
        this.publish({
          delayProgress: null,
          error: audioError(error),
          notice: "",
        });
      }
    } else if (this.env.now() - r.lastPublish >= 80) {
      r.lastPublish = this.env.now();
      this.publish({ delayProgress: Math.min(1, elapsed / 3.15) });
    }
  }
  interrupt = (
    message = "Практика на паузе. Нажмите «Продолжить», когда вернётесь.",
  ) => {
    if (this.state.status === "playing") void this.pause(message);
    else if (["loading", "checking"].includes(this.state.status)) {
      this.reset();
      this.publish({
        notice:
          "Проверка остановлена. Повторите её после возврата в приложение.",
      });
    }
  };
  private pause = async (message = "") => {
    const r = this.resource;
    if (!r || this.state.status !== "playing" || r.transition) return;
    r.transition = true;
    r.scorer.break();
    r.tracker.reset();
    r.visual = new VisualPitch();
    this.history.push({ time: this.liveTime, midi: null, hit: false });
    this.publish({
      status: "paused",
      time: this.liveTime,
      pitch: null,
      notice: message,
      reading: EMPTY_READING,
    });
    try {
      await bounded(r.context.suspend(), r.abort.signal, 3000);
    } catch (error) {
      if (this.current(r)) this.fail(error);
    } finally {
      r.transition = false;
    }
  };
  togglePause = async () => {
    if (this.state.status === "playing") return this.pause();
    const r = this.resource;
    if (!r || this.state.status !== "paused" || r.transition) return;
    if (r.muted) {
      this.publish({
        error: "Микрофон ещё недоступен. Проверьте подключение.",
      });
      return;
    }
    r.transition = true;
    try {
      await bounded(r.context.resume(), r.abort.signal, 5000);
      if (!this.current(r)) return;
      if (r.context.state !== "running")
        throw new Error("Не удалось возобновить звук. Повторите упражнение.");
      r.lastTick = this.env.now();
      r.lastAudioTime = r.context.currentTime;
      r.scorer.break();
      r.tracker.reset();
      this.publish({ status: "playing", notice: "", error: "" });
    } catch (error) {
      if (this.current(r)) this.fail(error);
    } finally {
      r.transition = false;
    }
  };
  private tick(r: Resources) {
    if (
      !this.current(r) ||
      !["playing", "checking"].includes(this.state.status) ||
      r.context.state !== "running"
    )
      return;
    const now = this.env.now(),
      gap = (now - r.lastTick) / 1000;
    r.lastTick = now;
    if (this.state.status === "playing" && gap > 0.3) {
      this.publish({
        scoreReason:
          "Обработка звука прервалась. Повторите упражнение для достоверной оценки.",
      });
      this.interrupt(
        "Устройство не успело обработать звук. Закройте лишние приложения; можно продолжить без оценки или начать заново.",
      );
      return;
    }
    if (r.context.currentTime <= r.lastAudioTime) return;
    r.lastAudioTime = r.context.currentTime;
    r.maxGap = Math.max(r.maxGap, gap * 1000);
    const duration = r.notes.at(-1)!.start + r.notes.at(-1)!.duration;
    const playing = this.state.status === "playing";
    if (playing)
      this.liveTime = Math.min(
        duration,
        Math.max(this.liveTime, audibleTime(r.context, now) - r.origin),
      );
    if (r.loopback) {
      this.sampleDelay(r);
      return;
    }
    if (!playing && this.state.referencePlaying) {
      if (r.context.currentTime < r.referenceUntil) return;
      r.tracker.reset();
      this.publish({
        referencePlaying: false,
        notice:
          "Теперь спойте удобную ноту. Если края диапазона неудобны, сдвиньте его.",
      });
    }
    let reading = EMPTY_READING;
    if (r.analyser) {
      const before = this.env.now();
      r.analyser.getFloatTimeDomainData(r.samples);
      reading = analyse(
        r.samples,
        r.context.sampleRate,
        r.work,
        r.noiseStart !== null ? -75 : this.state.settings.thresholdDb,
        r.tracker,
      );
      const compute = this.env.now() - before;
      r.computeTotal += compute;
      r.computeCount++;
      r.maxAnalysis = Math.max(r.maxAnalysis, compute);
      if (!playing) {
        if (r.noiseStart === null && reading.midi !== null) {
          r.comfortablePitches.push(reading.midi);
          if (r.comfortablePitches.length > 40) r.comfortablePitches.shift();
          const suggestedBaseMidi = suggestBase(
            r.comfortablePitches,
            r.practice.exerciseId,
          );
          if (suggestedBaseMidi !== this.state.suggestedBaseMidi)
            this.publish({ suggestedBaseMidi });
        } else {
          r.comfortablePitches = [];
        }
        if (reading.midi !== null) r.voiceSeconds += Math.min(gap, 0.06);
        if (r.voiceSeconds >= 0.3 && !this.state.heardVoice)
          this.publish({ heardVoice: true });
        if (r.noiseStart !== null) {
          const elapsed = now - r.noiseStart;
          if (elapsed > 250) r.noiseReadings.push(reading);
          if (elapsed >= 2250) {
            r.noiseStart = null;
            try {
              const calibration = calibrateNoise(r.noiseReadings);
              this.publish({
                settings: { ...this.state.settings, ...calibration },
                calibrationProgress: null,
                notice:
                  "Чувствительность настроена. Теперь спойте удобную ноту.",
                heardVoice: false,
              });
              r.voiceSeconds = 0;
              r.tracker.reset();
              this.persist();
            } catch (error) {
              this.publish({
                calibrationProgress: null,
                error: audioError(error),
                notice: "",
              });
            }
          } else if (now - r.lastPublish >= 80)
            this.publish({ calibrationProgress: Math.min(1, elapsed / 2250) });
        }
      } else {
        const observedTime = audibleTime(r.context, now) - r.origin - r.delay;
        r.scorer.add(observedTime, reading.midi);
        const target = r.notes.find(
          (n) => observedTime >= n.start && observedTime < n.start + n.duration,
        );
        this.history.push({
          time: observedTime,
          midi: r.visual.update(reading.midi),
          hit:
            !!target &&
            reading.midi !== null &&
            Math.abs(reading.midi - target.midi) <= 0.5,
        });
        while (this.history.length && this.history[0].time < this.liveTime - 5)
          this.history.shift();
      }
    }
    if (now - r.lastPublish >= 80) {
      r.lastPublish = now;
      const track = r.stream?.getAudioTracks()[0];
      this.publish({
        time: this.liveTime,
        pitch: reading.midi,
        reading,
        diagnostics: {
          sampleRate: r.context.sampleRate,
          inputMs: r.inputReported ? Math.round(r.inputLatency * 1000) : null,
          outputMs: Math.round(
            Math.max(0, r.context.currentTime - audibleTime(r.context, now)) *
              1000,
          ),
          correctionMs: this.state.settings.correctionMs,
          analysisMs: r.computeTotal / Math.max(1, r.computeCount),
          maxAnalysisMs: r.maxAnalysis,
          maxGapMs: r.maxGap,
          echoCancellation: track?.getSettings().echoCancellation ?? null,
        },
      });
    }
    // Let delayed microphone samples arrive after the last note before closing the input.
    if (
      playing &&
      audibleTime(r.context, now) - r.origin - (r.analyser ? r.delay : 0) >=
        duration
    ) {
      const result = r.scorer.result();
      this.liveTime = duration;
      this.publish({
        status: "finished",
        time: duration,
        pitch: null,
        reading: EMPTY_READING,
        result,
        score: this.state.scoreReason ? null : result.percent,
      });
      this.emitAttempt("completed");
      this.disposeResources();
    }
  }
  selectOutput = (outputMode: OutputMode) => this.configure({ outputMode });
}
