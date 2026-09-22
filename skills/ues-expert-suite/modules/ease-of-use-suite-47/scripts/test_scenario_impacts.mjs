#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { calculateEaseOfUseScore } from "./calculate_ease_of_use_score.mjs";

const input = JSON.parse(fs.readFileSync(new URL("../references/scenario-example.json", import.meta.url), "utf8"));
const result = calculateEaseOfUseScore(input);
assert.equal(result.scoring_mode, "dual");
assert.equal(result.scenario_impacts.length, 1);
assert.equal(result.scenario_impacts[0].issue_id, "I01");
assert.equal(result.scenario_impacts[0].baseline_deduction, 0.75);
assert.equal(result.scenario_impacts[0].scenario_multiplier, 1.25);
assert.equal(result.scenario_impacts[0].scenario_deduction, 0.9375);
assert.equal(result.scenario_impacts[0].deduction_delta, 0.1875);
assert.equal(result.scenario_impacts[0].drivers[0].selected, true);
assert.match(result.scenario_impacts[0].explanation_zh, /A01\.02\/S1/);
console.log(`scenario impact tests passed (${fileURLToPath(import.meta.url)})`);
