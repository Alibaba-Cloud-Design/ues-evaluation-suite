#!/usr/bin/env node

import fs from "node:fs";
import { pathToFileURL } from "node:url";

const JUDGED = new Set(["pass", "partial_pass", "fail"]);
const ALLOWED_JUDGMENTS = new Set([
  ...JUDGED,
  "insufficient_evidence",
  "not_applicable",
]);
const ALLOWED_LEVELS = new Set(["page", "flow"]);
const ALLOWED_BASELINES = new Set([
  "specification",
  "approved_component",
  "approved_exception",
  "product_pattern",
  "provisional_pattern",
  "conflicted",
]);
const ALLOWED_ASSESSMENT_TYPES = new Set([
  "full_runtime",
  "demo_runtime",
  "limited_runtime",
  "design_review",
  "state_sequence",
  "cross_page_static",
  "local_static",
]);

function fail(message) {
  throw new Error(message);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function round1(value) {
  return round(value, 1);
}

function validateCriterion(item, index, ids) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    fail(`criteria[${index}] must be an object`);
  }
  if (typeof item.id !== "string" || item.id.trim() === "") {
    fail(`criteria[${index}].id must be a non-empty string`);
  }
  if (ids.has(item.id)) fail(`duplicate criterion id: ${item.id}`);
  ids.add(item.id);

  if (!ALLOWED_LEVELS.has(item.level)) {
    fail(`${item.id}.level must be page or flow`);
  }
  if (![1, 2, 3].includes(item.importance)) {
    fail(`${item.id}.importance must be 1, 2, or 3`);
  }
  if (!ALLOWED_JUDGMENTS.has(item.judgment)) {
    fail(`${item.id}.judgment is invalid`);
  }
  if (!ALLOWED_BASELINES.has(item.baseline_type)) {
    fail(`${item.id}.baseline_type is invalid`);
  }
  if (item.baseline_type === "conflicted" && item.judgment !== "insufficient_evidence") {
    fail(`${item.id}: conflicted baseline requires insufficient_evidence`);
  }

  const defect = item.defect_level;
  if (item.judgment === "pass" && defect !== 0) {
    fail(`${item.id}: pass requires defect_level 0`);
  }
  if (item.judgment === "partial_pass" && ![1, 2].includes(defect)) {
    fail(`${item.id}: partial_pass requires defect_level 1 or 2`);
  }
  if (item.judgment === "fail" && ![3, 4].includes(defect)) {
    fail(`${item.id}: fail requires defect_level 3 or 4`);
  }
  if (
    ["insufficient_evidence", "not_applicable"].includes(item.judgment) &&
    defect !== null
  ) {
    fail(`${item.id}: ${item.judgment} requires defect_level null`);
  }

  if (item.score_included === false) {
    if (!item.linked_to || typeof item.linked_to !== "string") {
      fail(`${item.id}: score_included false requires linked_to`);
    }
    if (!new Set(["partial_pass", "fail"]).has(item.judgment)) {
      fail(`${item.id}: only partial_pass or fail may be a linked non-scoring item`);
    }
  }
}

function emptyStatusCounts() {
  return {
    pass: 0,
    partial_pass: 0,
    fail: 0,
    insufficient_evidence: 0,
    not_applicable: 0,
  };
}

function summarizeCriteria(criteria) {
  const overall = emptyStatusCounts();
  const page = emptyStatusCounts();
  const flow = emptyStatusCounts();
  const baseline = Object.fromEntries([...ALLOWED_BASELINES].map((key) => [key, 0]));

  for (const item of criteria) {
    overall[item.judgment] += 1;
    (item.level === "page" ? page : flow)[item.judgment] += 1;
    baseline[item.baseline_type] += 1;
  }

  const addDerived = (counts) => {
    const judged = counts.pass + counts.partial_pass + counts.fail;
    const insufficient = counts.insufficient_evidence;
    const denominator = judged + insufficient;
    return {
      ...counts,
      judged,
      insufficient,
      evidence_gap_rate: denominator === 0 ? null : round(insufficient / denominator),
      total: Object.values(counts).reduce((sum, value) => sum + value, 0),
    };
  };

  return {
    overall: addDerived(overall),
    page: addDerived(page),
    flow: addDerived(flow),
    baseline,
  };
}

function legacyBand(score) {
  if (score < 7) return "差";
  if (score < 8) return "中";
  if (score < 9) return "优";
  return "卓越";
}

function riskResult(risks) {
  const coreGateCount = risks.core_gate_count ?? 0;
  const irreversibleGate = risks.irreversible_gate ?? false;
  const coreMajorCount = risks.core_major_count ?? 0;

  if (!isNonNegativeInteger(coreGateCount)) {
    fail("risks.core_gate_count must be a non-negative integer");
  }
  if (typeof irreversibleGate !== "boolean") {
    fail("risks.irreversible_gate must be boolean");
  }
  if (!isNonNegativeInteger(coreMajorCount)) {
    fail("risks.core_major_count must be a non-negative integer");
  }

  if (irreversibleGate || coreGateCount >= 2) {
    return { risk_cap: 3.9, trigger: "multiple_or_irreversible_core_gate" };
  }
  if (coreGateCount === 1) {
    return { risk_cap: 4.9, trigger: "core_gate" };
  }
  if (coreMajorCount > 0) {
    return { risk_cap: 6.4, trigger: "core_major" };
  }
  return { risk_cap: null, trigger: null };
}

function releaseDecision({ assessmentType, scored, finalScore, risks }) {
  const coreGateCount = risks.core_gate_count ?? 0;
  const irreversibleGate = risks.irreversible_gate ?? false;
  const coreMajorCount = risks.core_major_count ?? 0;

  if (irreversibleGate || coreGateCount > 0) return "不通过";
  if (coreMajorCount > 0) return "整改后复审";

  const isComplete = new Set(["full_runtime", "demo_runtime"]).has(assessmentType);
  if (!scored) return "未判定";
  if (!isComplete) return "未判定，需补充流程或受阻范围验证";
  return finalScore >= 7 ? "通过" : "整改后复审";
}

export function calculateConsistencyScore(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("input must be a JSON object");
  }
  if (!ALLOWED_ASSESSMENT_TYPES.has(input.assessment_type)) {
    fail("assessment_type is missing or invalid");
  }
  if (!Array.isArray(input.criteria)) fail("criteria must be an array");

  const ids = new Set();
  input.criteria.forEach((item, index) => validateCriterion(item, index, ids));
  for (const item of input.criteria) {
    if (item.score_included === false && !ids.has(item.linked_to)) {
      fail(`${item.id}: linked_to references missing criterion ${item.linked_to}`);
    }
  }

  const risks = input.risks ?? {};
  const risk = riskResult(risks);
  const coverage = summarizeCriteria(input.criteria);
  const judged = coverage.overall.judged;
  const gapRate = coverage.overall.evidence_gap_rate;
  const scoreItems = input.criteria.filter(
    (item) => JUDGED.has(item.judgment) && item.score_included !== false,
  );

  const scoreAllowed = judged >= 3 && gapRate !== null && gapRate <= 0.4 && scoreItems.length >= 3;
  let scoring = {
    status: scoreAllowed ? "scored" : "unscored",
    reason: null,
    J: scoreItems.length,
    n: null,
    nonconformance_rate: null,
    weighted_severity: null,
    raw_score: null,
    risk_cap: risk.risk_cap,
    risk_trigger: risk.trigger,
    final_score: null,
    legacy_reference_band: null,
  };

  if (!scoreAllowed) {
    const reasons = [];
    if (judged < 3) reasons.push("fewer_than_3_judged_criteria");
    if (gapRate === null || gapRate > 0.4) reasons.push("evidence_gap_above_40_percent");
    if (scoreItems.length < 3) reasons.push("fewer_than_3_scoring_criteria");
    scoring.reason = reasons.join(",");
  } else {
    const n = scoreItems.filter((item) => item.defect_level > 0).length;
    const weightSum = scoreItems.reduce((sum, item) => sum + item.importance, 0);
    const severitySum = scoreItems.reduce(
      (sum, item) => sum + item.importance * (item.defect_level / 4),
      0,
    );
    const R = n / scoreItems.length;
    const S = severitySum / weightSum;
    const rawScore = round1(10 * (1 - 0.5 * R - 0.5 * S));
    const finalScore = risk.risk_cap === null ? rawScore : round1(Math.min(rawScore, risk.risk_cap));

    scoring = {
      ...scoring,
      n,
      nonconformance_rate: round(R),
      weighted_severity: round(S),
      raw_score: rawScore,
      final_score: finalScore,
      legacy_reference_band: legacyBand(finalScore),
    };
  }

  return {
    schema_version: "ues.consistency-score.v1",
    assessment_name: input.assessment_name ?? null,
    assessment_type: input.assessment_type,
    coverage,
    scoring,
    release_decision: releaseDecision({
      assessmentType: input.assessment_type,
      scored: scoreAllowed,
      finalScore: scoring.final_score,
      risks,
    }),
  };
}

function criterion(id, judgment, defectLevel, importance = 2, extras = {}) {
  return {
    id,
    level: "page",
    importance,
    judgment,
    defect_level: defectLevel,
    baseline_type: "product_pattern",
    score_included: true,
    ...extras,
  };
}

function assert(condition, message) {
  if (!condition) fail(`self-test failed: ${message}`);
}

function selfTest() {
  const perfect = calculateConsistencyScore({
    assessment_type: "full_runtime",
    criteria: [
      criterion("A", "pass", 0),
      criterion("B", "pass", 0),
      criterion("C", "pass", 0),
    ],
    risks: {},
  });
  assert(perfect.scoring.final_score === 10, "all-pass score should be 10");
  assert(perfect.release_decision === "通过", "all-pass full audit should pass");

  const worst = calculateConsistencyScore({
    assessment_type: "full_runtime",
    criteria: [
      criterion("A", "fail", 4),
      criterion("B", "fail", 4),
      criterion("C", "fail", 4),
    ],
    risks: {},
  });
  assert(worst.scoring.final_score === 0, "all level-4 failures should score 0");

  const capped = calculateConsistencyScore({
    assessment_type: "full_runtime",
    criteria: [
      criterion("A", "pass", 0),
      criterion("B", "pass", 0),
      criterion("C", "pass", 0),
    ],
    risks: { core_gate_count: 1, irreversible_gate: false, core_major_count: 0 },
  });
  assert(capped.scoring.final_score === 4.9, "core gate should cap score at 4.9");
  assert(capped.release_decision === "不通过", "core gate should fail release");

  const unscored = calculateConsistencyScore({
    assessment_type: "cross_page_static",
    criteria: [
      criterion("A", "pass", 0),
      criterion("B", "pass", 0),
      criterion("C", "insufficient_evidence", null),
      criterion("D", "insufficient_evidence", null),
    ],
    risks: {},
  });
  assert(unscored.scoring.status === "unscored", "50% evidence gap should be unscored");

  const linked = calculateConsistencyScore({
    assessment_type: "cross_page_static",
    criteria: [
      criterion("A", "partial_pass", 2),
      criterion("B", "partial_pass", 2, 2, { score_included: false, linked_to: "A" }),
      criterion("C", "pass", 0),
      criterion("D", "pass", 0),
    ],
    risks: {},
  });
  assert(linked.coverage.overall.judged === 4, "linked item should remain in coverage");
  assert(linked.scoring.J === 3, "linked item should be excluded from formula");
  assert(linked.release_decision.startsWith("未判定"), "static audit cannot release-pass");

  let invalidRejected = false;
  try {
    calculateConsistencyScore({
      assessment_type: "full_runtime",
      criteria: [
        criterion("A", "pass", 1),
        criterion("B", "pass", 0),
        criterion("C", "pass", 0),
      ],
      risks: {},
    });
  } catch {
    invalidRejected = true;
  }
  assert(invalidRejected, "invalid pass/defect-level combination should be rejected");

  process.stdout.write("self-test passed\n");
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--self-test") {
    selfTest();
    return;
  }
  if (args.length !== 1) {
    process.stderr.write(
      "Usage: node calculate_consistency_score.mjs <assessment.json>\n" +
        "       node calculate_consistency_score.mjs --self-test\n",
    );
    process.exitCode = 2;
    return;
  }

  try {
    const input = JSON.parse(fs.readFileSync(args[0], "utf8"));
    const result = calculateConsistencyScore(input);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
