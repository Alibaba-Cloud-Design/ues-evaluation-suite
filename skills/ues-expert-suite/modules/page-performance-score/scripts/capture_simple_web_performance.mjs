#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const url = arg("url");
const outputDir = resolve(arg("output", "performance-filmstrip"));
const chromePath = arg("chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const width = Number(arg("width", "1440"));
const height = Number(arg("height", "900"));
const durationMs = Number(arg("duration-ms", "15000"));
if (!url) {
  console.error("Usage: capture_simple_web_performance.mjs --url <https://...> [--output dir] [--width 1440] [--height 900] [--duration-ms 15000]");
  process.exit(2);
}
for (const [name, value] of Object.entries({ width, height, durationMs })) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
}

await mkdir(outputDir, { recursive: true });
const profileDir = join(tmpdir(), `ues-chrome-${process.pid}-${Date.now()}`);
await mkdir(profileDir, { recursive: true });

const chrome = spawn(chromePath, [
  "--headless=new",
  "--remote-debugging-pipe",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-extensions",
  "--disable-features=Translate,MediaRouter",
  "--disable-sync",
  "--metrics-recording-only",
  "--no-first-run",
  "--no-default-browser-check",
  `--user-data-dir=${profileDir}`,
  `--window-size=${width},${height}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "inherit", "pipe", "pipe"] });

const input = chrome.stdio[3];
const output = chrome.stdio[4];
let nextId = 1;
let buffer = "";
const pending = new Map();
const events = [];
const screencastPackets = [];
let navigationClockAnchor = null;

output.setEncoding("utf8");
output.on("data", chunk => {
  buffer += chunk;
  for (;;) {
    const boundary = buffer.indexOf("\0");
    if (boundary < 0) break;
    const raw = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 1);
    if (!raw) continue;
    const message = JSON.parse(raw);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(`${message.error.message} (${message.error.code})`)) : resolve(message.result || {});
    } else if (message.method) {
      events.push({ method: message.method, params: message.params || {} });
      if (!navigationClockAnchor && message.method === "Network.requestWillBeSent" && message.params.type === "Document" && Number.isFinite(message.params.timestamp) && Number.isFinite(message.params.wallTime)) {
        navigationClockAnchor = { monotonic_seconds: message.params.timestamp, wall_seconds: message.params.wallTime, url: message.params.request?.url || null };
      }
      if (message.method === "Page.screencastFrame") {
        screencastPackets.push({ data: message.params.data, metadata: message.params.metadata || {} });
        const id = nextId++;
        input.write(`${JSON.stringify({ id, method: "Page.screencastFrameAck", params: { sessionId: message.params.sessionId }, sessionId: message.sessionId })}\0`);
      }
    }
  }
});

function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    input.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  });
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function metric(metrics, name) {
  const item = metrics.find(entry => entry.name === name);
  return item ? item.value : null;
}

async function metrics(sessionId) {
  const result = await send("Performance.getMetrics", {}, sessionId);
  return {
    timestamp: metric(result.metrics, "Timestamp"),
    navigationStart: metric(result.metrics, "NavigationStart"),
  };
}

async function captureFrame(sessionId, index, phase) {
  const before = await metrics(sessionId);
  const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, sessionId);
  const after = await metrics(sessionId);
  const timestamp = before.timestamp !== null && after.timestamp !== null ? (before.timestamp + after.timestamp) / 2 : null;
  const navigationStart = after.navigationStart ?? before.navigationStart;
  const offsetMs = timestamp !== null && navigationStart !== null ? (timestamp - navigationStart) * 1000 : null;
  const uncertaintyMs = before.timestamp !== null && after.timestamp !== null ? (after.timestamp - before.timestamp) * 1000 : null;
  const safeOffset = offsetMs === null ? "unknown" : String(Math.max(0, Math.round(offsetMs))).padStart(5, "0");
  const file = `${String(index).padStart(3, "0")}-${phase}-${safeOffset}ms.png`;
  await writeFile(join(outputDir, file), Buffer.from(shot.data, "base64"));
  return { index, phase, file, timestamp, navigation_start: navigationStart, offset_ms: offsetMs, capture_uncertainty_ms: uncertaintyMs };
}

let sessionId;
const frames = [];
try {
  const version = await send("Browser.getVersion");
  const target = await send("Target.createTarget", { url: "about:blank" });
  const attached = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  sessionId = attached.sessionId;
  await send("Page.enable", {}, sessionId);
  await send("Network.enable", {}, sessionId);
  await send("Performance.enable", { timeDomain: "timeTicks" }, sessionId);
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);

  frames.push(await captureFrame(sessionId, 0, "armed"));
  await send("Page.startScreencast", { format: "png", quality: 100, maxWidth: width, maxHeight: height, everyNthFrame: 1 }, sessionId);
  const navigation = await send("Page.navigate", { url }, sessionId);
  if (navigation.errorText) throw new Error(`Navigation failed: ${navigation.errorText}`);
  await delay(durationMs);
  await send("Page.stopScreencast", {}, sessionId);
  await delay(250);
  const navigationMetrics = await metrics(sessionId);
  if (!navigationClockAnchor) throw new Error("No paired wall/monotonic clock anchor was emitted for the document navigation");
  let index = 1;
  for (const packet of screencastPackets) {
    const wallTimestamp = Number.isFinite(packet.metadata.timestamp) ? packet.metadata.timestamp : null;
    const timestamp = wallTimestamp === null ? null : navigationClockAnchor.monotonic_seconds + (wallTimestamp - navigationClockAnchor.wall_seconds);
    const offsetMs = timestamp !== null && navigationMetrics.navigationStart !== null ? (timestamp - navigationMetrics.navigationStart) * 1000 : null;
    const phase = offsetMs !== null && offsetMs < 0 ? "pre-navigation" : "navigation";
    const safeOffset = offsetMs === null ? "unknown" : `${offsetMs < 0 ? "m" : ""}${String(Math.abs(Math.round(offsetMs))).padStart(5, "0")}`;
    const file = `${String(index).padStart(3, "0")}-${phase}-${safeOffset}ms.png`;
    await writeFile(join(outputDir, file), Buffer.from(packet.data, "base64"));
    frames.push({ index, phase, file, wall_timestamp: wallTimestamp, mapped_monotonic_timestamp: timestamp, navigation_start: navigationMetrics.navigationStart, offset_ms: offsetMs, capture_uncertainty_ms: null });
    index += 1;
  }
  frames.push(await captureFrame(sessionId, index, "stable-check"));

  const finalUrl = await send("Runtime.evaluate", { expression: "location.href", returnByValue: true }, sessionId);
  const navigationOffsets = frames.filter(frame => frame.phase === "navigation" && Number.isFinite(frame.offset_ms)).map(frame => frame.offset_ms);
  const observedIntervals = navigationOffsets.slice(1).map((value, i) => value - navigationOffsets[i]);
  const sortedIntervals = [...observedIntervals].sort((a, b) => a - b);
  const medianInterval = sortedIntervals.length ? sortedIntervals[Math.floor(sortedIntervals.length / 2)] : null;
  const manifest = {
    schema_version: "ues-simple-web-filmstrip/1.0",
    status: "captured_pending_review",
    metric: "simple_web_first_screen",
    route: url,
    final_url: finalUrl.result?.value || null,
    viewport: `${width}x${height}`,
    cache: "new temporary Chrome profile; HTTP cache initially empty",
    network: "actual network; throttling not applied",
    browser: version.product,
    clock: "Chrome monotonic timeTicks; screencast wall timestamps mapped through the document request's paired wallTime/timestamp anchor",
    clock_anchor: navigationClockAnchor,
    sampling_policy: "Page.startScreencast everyNthFrame=1; report the observed interval rather than a requested interval",
    observed_median_interval_ms: medianInterval,
    maximum_observation_gap_ms: observedIntervals.length ? Math.max(...observedIntervals) : null,
    duration_target_ms: durationMs,
    armed: true,
    capture_method: "Chrome CDP Page.startScreencast; final stability frame via Page.captureScreenshot",
    frames,
    review_required: "Choose the last incomplete frame, first visually complete frame, and a stable confirmation frame at least 100ms later. Do not score until this review is recorded.",
    event_names: [...new Set(events.map(event => event.method))].sort(),
  };
  await writeFile(join(outputDir, "capture-manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ output: outputDir, frames: frames.length, manifest: join(outputDir, "capture-manifest.json") }, null, 2));
} finally {
  try { if (sessionId) await send("Browser.close"); } catch {}
  if (!chrome.killed) chrome.kill("SIGTERM");
  if (chrome.exitCode === null) await Promise.race([once(chrome, "exit"), delay(2000)]);
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
