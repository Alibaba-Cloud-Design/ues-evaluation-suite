#!/usr/bin/env node

import fs from "node:fs";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const EXPECTED_RATE = Object.freeze({ A: 0.72, B: 0.53, C: 0.43 });

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finiteRate(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new Error(`${label} must be a decimal in [0,1]; received ${value}`);
  }
  return number;
}

function complexityFromSteps(value) {
  const steps = Number(value);
  if (!Number.isFinite(steps) || steps < 0) {
    throw new Error(`median_steps must be a non-negative number; received ${value}`);
  }
  if (steps < 10) return "A";
  if (steps <= 30) return "B";
  return "C";
}

function normalizeComplexity(value) {
  const complexity = String(value ?? "").trim().toUpperCase();
  if (!Object.hasOwn(EXPECTED_RATE, complexity)) {
    throw new Error(`complexity must be A, B, or C; received ${value}`);
  }
  return complexity;
}

function ratingFor(score) {
  if (score < 5) return "差";
  if (score < 6) return "中";
  if (score < 8) return "优";
  return "卓越";
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateTaskScore(input) {
  const E = finiteRate(input.completion_rate ?? input.completionRate, "completion_rate");
  const P = finiteRate(input.relative_efficiency ?? input.relativeEfficiency, "relative_efficiency");
  const medianStepsValue = input.median_steps ?? input.medianSteps;
  const complexity = input.complexity != null
    ? normalizeComplexity(input.complexity)
    : complexityFromSteps(medianStepsValue);
  const s = EXPECTED_RATE[complexity];

  const X = E >= s
    ? 0.5 + 0.5 * ((E - s) / (1 - s))
    : 0.5 * (E / s);
  const adjustedEfficiency = Math.log(P * 100 + 1) / Math.log(101);
  const rawScore = clamp(10 * ((adjustedEfficiency * E + X) / (1 + E)), 0, 10);

  return {
    name: input.name ?? input.id ?? null,
    inputs: {
      completion_rate: E,
      relative_efficiency: P,
      median_steps: medianStepsValue == null ? null : Number(medianStepsValue),
      complexity,
    },
    expected_completion_rate: s,
    relative_completion_rate: round(X),
    adjusted_efficiency: round(adjustedEfficiency),
    score_raw: rawScore,
    score: round(rawScore),
    score_display_1dp: round(rawScore, 1),
    rating: ratingFor(rawScore),
    rating_scale: "FY25:[0,5)差;[5,6)中;[6,8)优;[8,10]卓越",
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === "self-test" || key === "pretty") {
      args[key] = true;
      continue;
    }
    const value = argv[i + 1];
    if (value == null || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args[key] = value;
    i += 1;
  }
  return args;
}

function runSelfTest() {
  for (const complexity of ["A", "B", "C"]) {
    const zero = calculateTaskScore({ completion_rate: 0, relative_efficiency: 1, complexity });
    assert.equal(zero.score_raw, 0);
    const perfect = calculateTaskScore({ completion_rate: 1, relative_efficiency: 1, complexity });
    assert.ok(Math.abs(perfect.score_raw - 10) < 1e-12);
    const midpoint = calculateTaskScore({
      completion_rate: EXPECTED_RATE[complexity],
      relative_efficiency: 0,
      complexity,
    });
    assert.ok(Math.abs(midpoint.relative_completion_rate - 0.5) < 1e-12);
  }
  assert.equal(complexityFromSteps(9.999), "A");
  assert.equal(complexityFromSteps(10), "B");
  assert.equal(complexityFromSteps(30), "B");
  assert.equal(complexityFromSteps(30.001), "C");
  assert.equal(ratingFor(4.9999), "差");
  assert.equal(ratingFor(5), "中");
  assert.equal(ratingFor(6), "优");
  assert.equal(ratingFor(8), "卓越");
  return { ok: true, tests: 17 };
}

function usage() {
  return [
    "Single task:",
    "  node calculate_task_score.mjs --completion-rate 0.64 --relative-efficiency 0.78 --median-steps 18 [--pretty]",
    "  node calculate_task_score.mjs --completion-rate 0.64 --relative-efficiency 0.78 --complexity B [--pretty]",
    "Batch JSON:",
    "  node calculate_task_score.mjs --input-json tasks.json [--pretty]",
    "Validation:",
    "  node calculate_task_score.mjs --self-test",
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["self-test"]) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  let output;
  if (args["input-json"]) {
    const parsed = JSON.parse(fs.readFileSync(args["input-json"], "utf8"));
    const tasks = Array.isArray(parsed) ? parsed : parsed.tasks;
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error("Batch input must be a non-empty array or an object with a non-empty tasks array");
    }
    const results = tasks.map(calculateTaskScore);
    const productRaw = results.reduce((sum, item) => sum + item.score_raw, 0) / results.length;
    output = {
      tasks: results,
      product: {
        task_count: results.length,
        official_task_count_range: "5-10",
        coverage_status: results.length >= 5 && results.length <= 10
          ? "完整产品口径"
          : "非完整产品口径",
        score_raw: productRaw,
        score: round(productRaw),
        score_display_1dp: round(productRaw, 1),
        rating: ratingFor(productRaw),
      },
    };
  } else {
    if (args["completion-rate"] == null || args["relative-efficiency"] == null) {
      throw new Error(`Missing required arguments.\n${usage()}`);
    }
    output = calculateTaskScore({
      name: args.name,
      completion_rate: args["completion-rate"],
      relative_efficiency: args["relative-efficiency"],
      median_steps: args["median-steps"],
      complexity: args.complexity,
    });
  }

  console.log(JSON.stringify(output, null, args.pretty ? 2 : 0));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
