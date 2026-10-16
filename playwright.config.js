import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "PORT=3100 DATA_DIR=/tmp/five-crown-browser-tests npm start",
    url: "http://127.0.0.1:3100/health",
    reuseExistingServer: false,
  },
});
