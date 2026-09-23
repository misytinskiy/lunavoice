import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { AudioEngine } = loadTs("app/lib/audio/engine.ts");
const { exercise } = loadTs("app/lib/pitch.ts");
const { practiceNotes, practiceGuideNotes, practiceDuration } = loadTs(
  "app/lib/practice.ts",
);

test("a key-changing series schedules guides, pauses and completes as one scored attempt", async () => {
  const f = fixture(),
    events = [];
  const practice = {
    exerciseId: "descent",
    baseMidi: 48,
    bpm: 120,
    fragment: null,
    series: { rounds: 8, step: 2 },
  };
  f.engine.subscribeAttempts((event) => events.push(event));
  await f.engine.prepare(practice);
  f.advance(0.6);
  await f.engine.begin();
  assert.equal(
    f.contexts[0].scheduled.length,
    practiceNotes(practice).length + practiceGuideNotes(practice).length,
  );
  await f.engine.togglePause();
  const frozen = f.contexts[0].currentTime;
  f.advance(2);
  assert.equal(f.contexts[0].currentTime, frozen);
  await f.engine.togglePause();
  f.advance(practiceDuration(practiceNotes(practice)) + 1);
  assert.deepEqual(
    events.map((e) => e.type),
    ["started", "completed"],
  );
  assert.equal(f.contexts[0].state, "closed");
  assert.equal(f.streams[0].getTracks()[0].readyState, "ended");
});

function fixture() {
  let wall = 0,
    stored = null,
    permissionCalls = 0,
    getStreamOverride = null,
    failFetch = false;
  const timers = new Set(),
    contexts = [],
    streams = [];
  const settings = { deviceId: "mic-1", echoCancellation: false, latency: 0 };
  let signal = () => 220;
  let frame = null;
  const createStream = () => {
    const track = {
      readyState: "live",
      onended: null,
      onmute: null,
      onunmute: null,
      getSettings: () => settings,
      stop() {
        this.readyState = "ended";
      },
    };
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    streams.push(stream);
    return stream;
  };
  class Node {
    disconnected = false;
    gain = {
      value: 1,
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      setTargetAtTime(value) {
        this.value = value;
      },
    };
    connect(next) {
      return next;
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  class Context {
    state = "suspended";
    currentTime = 0;
    sampleRate = 48000;
    baseLatency = 0;
    outputLatency = 0;
    nodes = [];
    scheduled = [];
    scheduledSources = [];
    onstatechange = null;
    async resume() {
      this.state = "running";
      this.onstatechange?.();
    }
    async suspend() {
      this.state = "suspended";
      this.onstatechange?.();
    }
    async close() {
      this.state = "closed";
      this.onstatechange?.();
    }
    destination = new Node();
    make() {
      const node = new Node();
      this.nodes.push(node);
      return node;
    }
    createGain() {
      return this.make();
    }
    createMediaStreamSource() {
      return this.make();
    }
    createAnalyser() {
      const node = this.make();
      node.getFloatTimeDomainData = (samples) => {
        if (frame) {
          frame(samples, this);
          return;
        }
        const frequency = signal(this);
        for (let i = 0; i < samples.length; i++)
          samples[i] =
            frequency === null
              ? 0
              : 0.2 * Math.sin((2 * Math.PI * frequency * i) / this.sampleRate);
      };
      return node;
    }
    createBufferSource() {
      const node = this.make();
      node.stop = () => {};
      node.start = (at) => {
        this.scheduled.push(at);
        this.scheduledSources.push({ at, source: node });
      };
      return node;
    }
    createBuffer(_channels, length) {
      const data = new Float32Array(length);
      return {
        data,
        copyToChannel(source) {
          data.set(source);
        },
      };
    }
    async decodeAudioData() {
      return {};
    }
    getOutputTimestamp() {
      return { contextTime: this.currentTime, performanceTime: wall };
    }
  }
  const media = {
    getUserMedia: async () => {
      permissionCalls++;
      return getStreamOverride ? getStreamOverride() : createStream();
    },
    enumerateDevices: async () => [
      { kind: "audioinput", deviceId: "mic-1", label: "Test microphone" },
    ],
  };
  const engine = new AudioEngine({
    createContext: () => {
      const context = new Context();
      contexts.push(context);
      return context;
    },
    media: () => media,
    storage: () => ({
      getItem: () => stored,
      setItem: (_, value) => {
        stored = value;
      },
    }),
    fetch: async () => {
      if (failFetch) throw Error("network failed");
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    },
    now: () => wall,
    setInterval: (fn) => {
      timers.add(fn);
      return fn;
    },
    clearInterval: (fn) => timers.delete(fn),
  });
  return {
    engine,
    contexts,
    streams,
    timers,
    createStream,
    get permissionCalls() {
      return permissionCalls;
    },
    set frame(fn) {
      frame = fn;
    },
    set signal(fn) {
      signal = fn;
    },
    set getStream(fn) {
      getStreamOverride = fn;
    },
    set failFetch(value) {
      failFetch = value;
    },
    advance(seconds, step = 0.025) {
      for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += step) {
        wall += step * 1000;
        for (const context of contexts)
          if (context.state === "running") context.currentTime += step;
        for (const fn of [...timers]) fn();
      }
    },
  };
}
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

test("double preparation opens one mic; check requires real voiced input", async () => {
  const f = fixture();
  f.signal = () => null;
  await Promise.all([f.engine.prepare(3), f.engine.prepare(3)]);
  assert.equal(f.permissionCalls, 1);
  assert.equal(f.engine.getSnapshot().status, "checking");
  f.advance(0.5);
  assert.equal(await f.engine.begin(), false);
  f.signal = () => 220;
  f.advance(0.5);
  assert.equal(f.engine.getSnapshot().heardVoice, true);
  assert.equal(await f.engine.begin(), true);
  assert.equal(f.contexts[0].scheduled.length, 9);
  f.engine.reset();
  assert.equal(f.streams[0].getTracks()[0].readyState, "ended");
  assert.equal(f.timers.size, 0);
  assert.ok(f.contexts[0].nodes.every((node) => node.disconnected));
});
test("a late mic permission result after cancel cannot resurrect the session", async () => {
  const f = fixture();
  let resolve;
  f.getStream = () =>
    new Promise((r) => {
      resolve = r;
    });
  const pending = f.engine.prepare(3);
  await flush();
  f.engine.reset();
  await pending;
  assert.equal(f.contexts[0].state, "closed");
  const lateStream = f.createStream();
  resolve(lateStream);
  await flush();
  assert.equal(lateStream.getTracks()[0].readyState, "ended");
  assert.equal(f.engine.getSnapshot().status, "idle");
  assert.equal(f.timers.size, 0);
});
test("old async failure cannot overwrite a new session", async () => {
  const f = fixture();
  let reject;
  f.getStream = () =>
    new Promise((_, r) => {
      reject = r;
    });
  const first = f.engine.prepare(3);
  await flush();
  f.engine.reset();
  await first;
  f.getStream = null;
  await f.engine.prepare(3);
  reject(Error("old failure"));
  await flush();
  assert.equal(f.engine.getSnapshot().status, "checking");
  assert.equal(f.engine.getSnapshot().error, "");
  f.engine.reset();
});
test("loading failure stops mic and closes context; retry succeeds", async () => {
  const f = fixture();
  f.failFetch = true;
  await f.engine.prepare(3);
  assert.equal(f.engine.getSnapshot().status, "idle");
  assert.match(f.engine.getSnapshot().error, /network/);
  assert.equal(f.streams[0].getTracks()[0].readyState, "ended");
  assert.equal(f.contexts[0].state, "closed");
  f.failFetch = false;
  await f.engine.prepare(3);
  assert.equal(f.engine.getSnapshot().status, "checking");
  f.engine.reset();
});
test("preview never opens a microphone and finishes without a grade", async () => {
  const f = fixture();
  await f.engine.prepare(3, true);
  assert.equal(f.engine.getSnapshot().status, "playing");
  assert.equal(f.permissionCalls, 0);
  f.advance(21);
  assert.equal(f.engine.getSnapshot().status, "finished");
  assert.equal(f.engine.getSnapshot().score, null);
  assert.equal(f.contexts[0].state, "closed");
  assert.equal(f.timers.size, 0);
});
test("speaker practice cannot receive a score from the guide piano", async () => {
  const f = fixture();
  await f.engine.prepare(3);
  f.advance(0.5);
  await f.engine.begin();
  f.advance(21);
  assert.equal(f.engine.getSnapshot().score, null);
  assert.match(f.engine.getSnapshot().scoreReason, /динамиков/);
});
test("wired practice scores delayed target singing and releases resources at completion", async () => {
  const f = fixture();
  f.engine.configure({ outputMode: "wired" });
  await f.engine.prepare(3);
  f.advance(0.5);
  await f.engine.begin();
  const notes = exercise(3),
    origin = f.contexts[0].scheduled[0] - 3;
  f.signal = (ctx) => {
    const t = ctx.currentTime - origin - 2048 / 96000;
    const n = notes.find((n) => t >= n.start && t < n.start + n.duration);
    return n ? 440 * 2 ** ((n.midi - 69) / 12) : null;
  };
  f.advance(21);
  assert.equal(f.engine.getSnapshot().status, "finished");
  assert.ok(f.engine.getSnapshot().score >= 97);
  assert.equal(f.engine.getSnapshot().result.version, "pitch-time-v2");
  assert.equal(f.streams[0].getTracks()[0].readyState, "ended");
  assert.equal(f.timers.size, 0);
});
test("pause freezes the clock; interruption and device disconnection are recoverable", async () => {
  const f = fixture();
  await f.engine.prepare(3);
  f.advance(0.5);
  await f.engine.begin();
  f.advance(4);
  await f.engine.togglePause();
  const time = f.engine.getSnapshot().time;
  f.advance(3);
  assert.equal(f.engine.getSnapshot().time, time);
  await f.engine.togglePause();
  assert.equal(f.engine.getSnapshot().status, "playing");
  f.contexts[0].state = "interrupted";
  f.contexts[0].onstatechange();
  await flush();
  assert.equal(f.engine.getSnapshot().status, "paused");
  const track = f.streams[0].getTracks()[0];
  track.readyState = "ended";
  track.onended();
  assert.equal(f.engine.getSnapshot().status, "idle");
  assert.match(f.engine.getSnapshot().error, /отключён/);
  assert.equal(f.timers.size, 0);
});
test("a stalled analysis loop pauses and invalidates the grade", async () => {
  const f = fixture();
  f.engine.configure({ outputMode: "wired" });
  await f.engine.prepare(3);
  f.advance(0.5);
  await f.engine.begin();
  f.advance(0.5, 0.5);
  await flush();
  assert.equal(f.engine.getSnapshot().status, "paused");
  assert.match(f.engine.getSnapshot().scoreReason, /прервалась/);
  f.engine.reset();
});
test("silence calibration can be repeated and cancellation releases the input", async () => {
  const f = fixture();
  await f.engine.prepare(3);
  f.signal = () => null;
  f.engine.calibrate();
  f.advance(2.5);
  assert.equal(f.engine.getSnapshot().calibrationProgress, null);
  assert.equal(f.engine.getSnapshot().settings.thresholdDb, -60);
  f.engine.calibrate();
  f.engine.reset();
  f.advance(3);
  assert.equal(f.timers.size, 0);
  assert.equal(f.engine.getSnapshot().status, "idle");
});

test("loopback calibration measures three delayed chirps; failed retry preserves the correction", async () => {
  const f = fixture();
  f.engine.configure({ outputMode: "wired" });
  await f.engine.prepare(3);
  f.advance(0.5);
  f.frame = (samples, context) => {
    samples.fill(0);
    for (const { at, source } of context.scheduledSources) {
      if (!source.buffer?.data) continue;
      for (let i = 0; i < samples.length; i++) {
        const position = Math.round(
          (context.currentTime -
            (samples.length - i) / context.sampleRate -
            at -
            0.15) *
            context.sampleRate,
        );
        if (position >= 0 && position < source.buffer.data.length)
          samples[i] += source.buffer.data[position] * 0.4;
      }
    }
  };
  f.engine.measureDelay();
  f.advance(3.5);
  assert.equal(f.engine.getSnapshot().delayProgress, null);
  assert.ok(Math.abs(f.engine.getSnapshot().settings.correctionMs - 150) < 3);
  assert.ok(Math.abs(f.engine.getSnapshot().roundTripMs - 150) < 3);
  f.frame = (samples) => samples.fill(0);
  const saved = f.engine.getSnapshot().settings.correctionMs;
  f.engine.measureDelay();
  f.advance(3.5);
  assert.match(f.engine.getSnapshot().error, /три сигнала/);
  assert.equal(f.engine.getSnapshot().settings.correctionMs, saved);
  f.engine.reset();
  assert.equal(f.timers.size, 0);
});

test("temporary mic mute pauses and prevents resume until input returns", async () => {
  const f = fixture();
  await f.engine.prepare(3);
  f.advance(0.5);
  await f.engine.begin();
  const track = f.streams[0].getAudioTracks()[0];
  track.onmute();
  await flush();
  assert.equal(f.engine.getSnapshot().status, "paused");
  await f.engine.togglePause();
  assert.equal(f.engine.getSnapshot().status, "paused");
  assert.match(f.engine.getSnapshot().error, /ещё недоступен/);
  track.onunmute();
  await f.engine.togglePause();
  assert.equal(f.engine.getSnapshot().status, "playing");
  f.engine.reset();
});

test("range retarget preserves mic, preview cannot pass readiness, fragment schedules only selected notes", async () => {
  const f = fixture();
  await f.engine.prepare(3);
  f.engine.previewRange();
  f.advance(2);
  assert.equal(f.engine.getSnapshot().heardVoice, false);
  assert.equal(await f.engine.begin(), false);
  assert.equal(
    await f.engine.retarget({ baseMidi: 49, bpm: 100, fragment: null }),
    false,
  );
  f.advance(1.6);
  assert.equal(f.engine.getSnapshot().referencePlaying, false);
  assert.equal(f.engine.getSnapshot().suggestedBaseMidi, 53);
  const config = { baseMidi: 49, bpm: 100, fragment: { from: 4, to: 5 } };
  assert.equal(await f.engine.retarget(config), true);
  assert.equal(f.permissionCalls, 1);
  config.baseMidi = 60;
  assert.equal(f.engine.getSnapshot().practice.baseMidi, 49);
  await f.engine.begin();
  assert.equal(f.contexts[0].scheduled.length, 5); // 3 preview + 2 practice
  f.advance(8);
  assert.equal(f.engine.getSnapshot().status, "finished");
  assert.deepEqual(
    f.engine.getSnapshot().result.notes.map((n) => n.position),
    [4, 5],
  );
  assert.ok(Math.abs(f.engine.getSnapshot().result.targetSeconds - 2.4) < 1e-8);
  assert.equal(f.timers.size, 0);
});

test("confirmed microphone starts subsequent attempts without voiced preflight; disconnect requires setup again", async () => {
  const f = fixture();
  f.engine.configure({ outputMode: "wired" });
  await f.engine.prepare(3, false, true);
  assert.equal(f.engine.getSnapshot().status, "checking");
  assert.equal(f.engine.getSnapshot().setupRequired, true);
  f.advance(0.6);
  assert.equal(await f.engine.begin(), true);
  assert.equal(f.engine.getSnapshot().settings.checked, true);
  f.engine.reset();
  f.signal = () => null;
  await f.engine.prepare(3, false, true);
  assert.equal(f.engine.getSnapshot().status, "playing");
  assert.equal(f.engine.getSnapshot().setupRequired, false);
  const track = f.streams.at(-1).getTracks()[0];
  track.readyState = "ended";
  track.onended();
  assert.equal(f.engine.getSnapshot().settings.checked, false);
  assert.equal(f.engine.getSnapshot().setupRequired, true);
  await f.engine.prepare(3, false, true);
  assert.equal(f.engine.getSnapshot().status, "checking");
  f.engine.reset();
});

test("attempt events use stable IDs, ignore previews, and distinguish reset from completion", async () => {
  const f = fixture(),
    events = [];
  f.engine.subscribeAttempts((event) => events.push(event));
  await f.engine.prepare(3, true);
  f.advance(22);
  assert.equal(events.length, 0);
  await f.engine.prepare(3);
  f.advance(0.6);
  await f.engine.begin();
  await f.engine.togglePause();
  await f.engine.togglePause();
  f.advance(0.5);
  f.engine.reset();
  f.engine.reset();
  assert.deepEqual(
    events.map((e) => e.type),
    ["started", "interrupted"],
  );
  assert.equal(events[0].id, events[1].id);
  await f.engine.prepare(3, false, true);
  f.advance(22);
  f.engine.reset();
  assert.deepEqual(
    events.slice(2).map((e) => e.type),
    ["started", "completed"],
  );
  assert.notEqual(events[0].id, events[2].id);
  assert.equal(events[2].id, events[3].id);
});
