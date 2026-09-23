export async function mockMicrophone(page, mode = "tone") {
  await page.addInitScript((mode) => {
    window.audioTest = { requests: 0, stops: 0, resolvePermission: null };
    Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
      value: async () => [
        {
          kind: "audioinput",
          deviceId: "test-mic",
          label: "Тестовый микрофон",
        },
      ],
    });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        window.audioTest.requests++;
        if (mode === "denied")
          throw new DOMException("Permission denied", "NotAllowedError");
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        oscillator.frequency.value = 220;
        window.audioTest.setFrequency = (frequency) => {
          oscillator.frequency.value = frequency;
        };
        const gain = context.createGain();
        gain.gain.value = mode === "silence" ? 0 : 0.2;
        const destination = context.createMediaStreamDestination();
        oscillator.connect(gain);
        gain.connect(destination);
        oscillator.start();
        await context.resume();
        const stream = destination.stream,
          track = stream.getAudioTracks()[0],
          stop = track.stop.bind(track);
        track.stop = () => {
          window.audioTest.stops++;
          stop();
          oscillator.stop();
          void context.close();
        };
        window.audioTest.track = track;
        track.getSettings = () => ({
          deviceId: "test-mic",
          sampleRate: context.sampleRate,
          echoCancellation: false,
        });
        if (mode === "pending")
          await new Promise((resolve) => {
            window.audioTest.resolvePermission = resolve;
          });
        return stream;
      },
    });
  }, mode);
}

export async function chooseOption(control, choice) {
  // Let Playwright finish any automatic page scroll before the popup subscribes
  // to scroll dismissal. This mirrors a user opening an already visible control.
  await control.scrollIntoViewIfNeeded();
  await control.click();
  const page = control.page();
  const option =
    typeof choice === "object"
      ? page.getByRole("option", { name: choice.label, exact: true })
      : page.locator(
          `[role="option"][data-value=${JSON.stringify(String(choice))}]`,
        );
  await option.click();
}
