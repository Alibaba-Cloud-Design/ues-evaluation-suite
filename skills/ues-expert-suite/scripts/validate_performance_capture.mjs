#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node validate_performance_capture.mjs /absolute/path/to/performance-capture.json");
  process.exit(2);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (error) {
  console.error(`Invalid JSON: ${error.message}`);
  process.exit(1);
}

const root = path.dirname(path.resolve(file));
const errors = [];
const statuses = new Set(["planned", "armed", "measured", "blocked", "failed"]);
const number = value => typeof value === "number" && Number.isFinite(value);
const exists = relative => typeof relative === "string" && fs.existsSync(path.resolve(root, relative));

if (!statuses.has(data.status)) errors.push("status must be planned, armed, measured, blocked, or failed");
for (const key of ["metric", "route", "viewport", "session", "cache", "network", "completion_rule", "stability_rule"]) {
  if (typeof data[key] !== "string" || !data[key].trim()) errors.push(`${key} is required`);
}
if (!data.preflight || typeof data.preflight !== "object") {
  errors.push("preflight is required");
} else if (data.status === "measured") {
  for (const key of ["navigation_pre_arm", "continuous_sampling", "unified_monotonic_clock", "raw_evidence_export"]) {
    if (data.preflight[key] !== true) errors.push(`measured capture requires preflight.${key}=true`);
  }
}
if (!Array.isArray(data.attempts)) errors.push("attempts must be an array");
if (!data.result || typeof data.result !== "object") errors.push("result is required");

function expectedScore(ms) {
  if (ms <= 1000) return 10;
  if (ms <= 1500) return 10 - (ms - 1000) / 250;
  if (ms <= 5500) return 8 - (ms - 1500) / 500;
  return 0;
}

if (data.status === "measured" && data.result) {
  const valid = (data.attempts ?? []).filter(attempt => attempt?.valid === true);
  if (!valid.length) errors.push("measured capture requires at least one valid attempt");
  if (data.result.valid_samples !== valid.length) errors.push("result.valid_samples must equal the number of valid attempts");
  if (!number(data.result.value_ms) || data.result.value_ms < 0) errors.push("measured result.value_ms must be a non-negative number");
  if (!number(data.result.score) || data.result.score < 0 || data.result.score > 10) errors.push("measured result.score must be from 0 to 10");
  if (number(data.result.value_ms) && number(data.result.score)) {
    const expected = Math.round(expectedScore(data.result.value_ms) * 10) / 10;
    if (Math.abs(data.result.score - expected) > 1e-9) errors.push(`result.score must equal ${expected} for ${data.result.value_ms}ms`);
  }
  for (const attempt of valid) {
    for (const key of ["navigation_start", "last_incomplete", "first_complete", "stability_confirm"]) {
      if (!number(attempt[key])) errors.push(`${attempt.id ?? "valid attempt"}.${key} must be numeric`);
    }
    if (number(attempt.last_incomplete) && number(attempt.first_complete) && attempt.first_complete <= attempt.last_incomplete) {
      errors.push(`${attempt.id ?? "valid attempt"}: first_complete must follow last_incomplete`);
    }
    if (number(attempt.first_complete) && number(attempt.stability_confirm) && (attempt.stability_confirm - attempt.first_complete) * 1000 < 100) {
      errors.push(`${attempt.id ?? "valid attempt"}: stability_confirm must be at least 100ms after first_complete`);
    }
    if (number(attempt.navigation_start) && number(attempt.first_complete) && number(data.result.value_ms)) {
      const measured = (attempt.first_complete - attempt.navigation_start) * 1000;
      if (Math.abs(measured - data.result.value_ms) > 0.1) errors.push(`${attempt.id ?? "valid attempt"}: first_complete offset does not match result.value_ms`);
    }
    if (!exists(attempt.raw_manifest)) errors.push(`${attempt.id ?? "valid attempt"}: raw_manifest does not exist`);
    if (!Array.isArray(attempt.evidence) || attempt.evidence.length < 3) {
      errors.push(`${attempt.id ?? "valid attempt"}: at least three boundary evidence files are required`);
    } else {
      for (const evidence of attempt.evidence) if (!exists(evidence)) errors.push(`missing evidence file: ${evidence}`);
    }
  }
  if (!Array.isArray(data.result.evidence_paths) || data.result.evidence_paths.length < 3) errors.push("measured result requires three evidence_paths");
  else for (const evidence of data.result.evidence_paths) if (!exists(evidence)) errors.push(`missing result evidence file: ${evidence}`);
} else if (["blocked", "failed"].includes(data.status) && data.result) {
  if (data.result.value_ms !== null || data.result.score !== null) errors.push(`${data.status} result must keep value_ms and score null`);
}

if (["planned", "armed"].includes(data.status)) errors.push("delivery capture cannot remain planned or armed");

if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("UES performance capture is valid.");
