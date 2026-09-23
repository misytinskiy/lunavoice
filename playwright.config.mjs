import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45000,
  expect: { timeout: 10000 },
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:3218",
    browserName: "chromium",
    channel: "chrome",
    headless: true,
    launchOptions: {
      args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3218",
    url: "http://127.0.0.1:3218",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
