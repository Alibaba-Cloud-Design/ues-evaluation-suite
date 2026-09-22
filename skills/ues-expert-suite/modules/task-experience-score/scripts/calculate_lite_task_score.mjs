#!/usr/bin/env node

import fs from "node:fs";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const CRITERIA_IMPORTANCE = Object.freeze({
  "A01.01": 3,
  "A01.02": 2,
  "A01.05": 3,
  "A01.10": 2,
  "A01.11": 1,
  "A03.05": 2,
  "A03.06": 2,
  "B01.08": 1,
  "F1.01": 3,
  "F1.05": 2,
  "F1.07": 3,
  "F2.01": 2,
  "F2.03": 2,
  "F2.04": 2,
  "F3.01": 2,
  "F3.04": 2,
  "F3.05": 2,
  "F3.06": 1,
  "F7.05": 1,
  "F7.06": 3,
});

const JUDGMENT_VALUE = Object.freeze({
  pass: 1,
  partial_pass: 0.5,
  fail: 0,
});

const JUDGMENT_ORDER = Object.freeze({
  fail: 0,
  partial_pass: 1,
  pass: 2,
  insufficient_evidence: 3,
  not_applicable: 4,
});

const EVIDENCE_CAP = Object.freeze({
  runtime: 10,
  log: 8.9,
  spec: 7.9,
  unverified: null,
});

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function ratingFor(score) {
  if (score < 5) return "差";
  if (score < 6) return "中";
  if (score < 8) return "优";
  return "卓越";
}

function validateJudgment(value, label) {
  if (!Object.hasOwn(JUDGMENT_ORDER, value)) {
    throw new Error(`${label} has unsupported judgment: ${value}`);
  }
}

function validateImportance(value, label) {
  const number = Number(value);
  if (![1, 2, 3].includes(number)) {
    throw new Error(`${label} importance must be 1, 2, or 3; received ${value}`);
  }
  return number;
}

function severityFor(importance, judgment) {
  if (judgment === "pass" || judgment === "insufficient_evidence" || judgment === "not_applicable") {
    return null;
  }
  if (importance === 3) return judgment === "fail" ? "Gate" : "Major";
  if (importance === 2) return judgment === "fail" ? "Major" : "Minor";
  return judgment === "fail" ? "Minor" : "Advisory";
}

function aggregateCriteria(instances) {
  const byId = new Map();
  for (const item of instances ?? []) {
    if (!Object.hasOwn(CRITERIA_IMPORTANCE, item.id)) {
      throw new Error(`Unknown task criterion id: ${item.id}`);
    }
    validateJudgment(item.judgment, `criterion ${item.id}`);
    if (item.importance != null && Number(item.importance) !== CRITERIA_IMPORTANCE[item.id]) {
      throw new Error(`criterion ${item.id} importance must be ${CRITERIA_IMPORTANCE[item.id]}`);
    }
    if (!byId.has(item.id)) byId.set(item.id, []);
    byId.get(item.id).push(item);
  }

  const aggregated = [];
  const missing = [];
  for (const [id, importance] of Object.entries(CRITERIA_IMPORTANCE)) {
    const items = byId.get(id) ?? [];
    if (items.length === 0) {
      missing.push(id);
      aggregated.push({
        id,
        importance,
        judgment: "insufficient_evidence",
        severity: null,
        affects_core: false,
        instance_count: 0,
      });
      continue;
    }

    const applicable = items.filter((item) => item.judgment !== "not_applicable");
    if (applicable.length === 0) {
      aggregated.push({
        id,
        importance,
        judgment: "not_applicable",
        severity: null,
        affects_core: false,
        instance_count: items.length,
      });
      continue;
    }

    const judged = applicable.filter((item) => Object.hasOwn(JUDGMENT_VALUE, item.judgment));
    const judgment = judged.length === 0
      ? "insufficient_evidence"
      : judged.reduce((worst, item) => (
        JUDGMENT_ORDER[item.judgment] < JUDGMENT_ORDER[worst] ? item.judgment : worst
      ), "pass");

    aggregated.push({
      id,
      importance,
      judgment,
      severity: severityFor(importance, judgment),
      affects_core: applicable.some((item) => item.affects_core === true),
      irreversible_risk: applicable.some((item) => item.irreversible_risk === true),
      instance_count: items.length,
    });
  }

  return { aggregated, missing };
}

function calculateScenarioMetrics(scenarios, efficiencyBasis, warnings) {
  const applicable = (scenarios ?? []).filter((item) => item.judgment !== "not_applicable");
  if (applicable.length === 0) throw new Error("At least one applicable scenario is required");

  let applicableWeight = 0;
  let judgedWeight = 0;
  let completionWeighted = 0;
  let efficiencyWeighted = 0;
  let efficiencyWeight = 0;
  let coreJudged = false;
  let coreFailCount = 0;

  for (const scenario of applicable) {
    validateJudgment(scenario.judgment, `scenario ${scenario.id ?? "unnamed"}`);
    const importance = validateImportance(scenario.importance, `scenario ${scenario.id ?? "unnamed"}`);
    applicableWeight += importance;

    if (!Object.hasOwn(JUDGMENT_VALUE, scenario.judgment)) continue;
    judgedWeight += importance;
    completionWeighted += importance * JUDGMENT_VALUE[scenario.judgment];

    const isCore = scenario.core === true || importance === 3;
    if (isCore) coreJudged = true;
    if (isCore && scenario.judgment === "fail") coreFailCount += 1;

    if (scenario.judgment === "fail") continue;
    let ratio;
    if (efficiencyBasis === "duration") {
      const reference = Number(scenario.reference_duration);
      const observed = Number(scenario.observed_duration);
      if (Number.isFinite(reference) && Number.isFinite(observed) && reference > 0 && observed > 0) {
        ratio = reference / observed;
        if (ratio > 1) warnings.push(`${scenario.id ?? "scenario"}: reference_duration exceeds observed_duration; efficiency capped at 1`);
      }
    } else {
      const necessary = Number(scenario.necessary_actions);
      const observed = Number(scenario.observed_actions);
      if (Number.isFinite(necessary) && Number.isFinite(observed) && necessary > 0 && observed > 0) {
        ratio = necessary / observed;
        if (ratio > 1) warnings.push(`${scenario.id ?? "scenario"}: necessary_actions exceeds observed_actions; efficiency capped at 1`);
      }
    }
    if (ratio != null) {
      efficiencyWeighted += importance * clamp(ratio);
      efficiencyWeight += importance;
    }
  }

  return {
    completion: judgedWeight > 0 ? completionWeighted / judgedWeight : null,
    scenarioCoverage: applicableWeight > 0 ? judgedWeight / applicableWeight : 0,
    efficiency: efficiencyWeight > 0 ? efficiencyWeighted / efficiencyWeight : null,
    coreJudged,
    coreFailCount,
    applicableWeight,
    judgedWeight,
  };
}

function calculateCriteriaMetrics(aggregated) {
  let applicableWeight = 0;
  let judgedWeight = 0;
  let qualityWeighted = 0;
  const severityCounts = { Gate: 0, Major: 0, Minor: 0, Advisory: 0 };

  for (const item of aggregated) {
    if (item.judgment === "not_applicable") continue;
    applicableWeight += item.importance;
    if (!Object.hasOwn(JUDGMENT_VALUE, item.judgment)) continue;
    judgedWeight += item.importance;
    qualityWeighted += item.importance * JUDGMENT_VALUE[item.judgment];
    if (item.severity) severityCounts[item.severity] += 1;
  }

  return {
    quality: judgedWeight > 0 ? qualityWeighted / judgedWeight : null,
    criteriaCoverage: applicableWeight > 0 ? judgedWeight / applicableWeight : 0,
    severityCounts,
    applicableWeight,
    judgedWeight,
  };
}

function riskCapFor(task, scenarioMetrics, criteria) {
  const hasCoreGate = criteria.some((item) => item.severity === "Gate" && item.affects_core)
    || scenarioMetrics.coreFailCount > 0;
  const independentCoreGateCount = Number(task?.independent_core_gate_count ?? 0);
  const irreversibleGate = criteria.some((item) => item.severity === "Gate" && item.irreversible_risk)
    || (task?.high_risk_irreversible === true && hasCoreGate);
  const coreMajors = criteria.filter((item) => item.severity === "Major" && item.affects_core).length;

  if (independentCoreGateCount >= 2 || irreversibleGate) return { cap: 3.9, reason: "多个独立核心Gate或不可逆高风险失败" };
  if (hasCoreGate) return { cap: 4.9, reason: "核心任务Gate" };
  if (coreMajors > 0) return { cap: 5.9, reason: "影响核心任务的Major" };
  return { cap: 10, reason: null };
}

export function calculateLiteTaskScore(input) {
  const assessmentType = input.assessment_type ?? input.assessmentType;
  if (!Object.hasOwn(EVIDENCE_CAP, assessmentType)) {
    throw new Error(`assessment_type must be runtime, log, spec, or unverified; received ${assessmentType}`);
  }
  const efficiencyBasis = input.efficiency_basis ?? "actions";
  if (!['actions', 'duration'].includes(efficiencyBasis)) {
    throw new Error(`efficiency_basis must be actions or duration; received ${efficiencyBasis}`);
  }

  const warnings = [];
  const { aggregated, missing } = aggregateCriteria(input.criteria);
  const scenarioMetrics = calculateScenarioMetrics(input.scenarios, efficiencyBasis, warnings);
  const criteriaMetrics = calculateCriteriaMetrics(aggregated);
  const coreTruthDefined = input.task?.core_truth_defined === true;
  const taskConfirmed = input.task?.confirmed === true;

  const coverageEligible = scenarioMetrics.scenarioCoverage >= 0.7
    && criteriaMetrics.criteriaCoverage >= 0.7;
  const calculationEligible = coverageEligible
    && taskConfirmed
    && coreTruthDefined
    && scenarioMetrics.coreJudged
    && scenarioMetrics.completion != null
    && scenarioMetrics.efficiency != null
    && criteriaMetrics.quality != null
    && assessmentType !== "unverified";

  const risk = riskCapFor(input.task, scenarioMetrics, aggregated);
  const evidenceCap = EVIDENCE_CAP[assessmentType];
  let rawScore = null;
  let finalScore = null;
  let rating = null;
  let ratingStatus = "未评分";

  if (calculationEligible) {
    rawScore = 10 * (
      0.5 * scenarioMetrics.completion
      + 0.2 * scenarioMetrics.efficiency
      + 0.3 * criteriaMetrics.quality
    );
    finalScore = Math.min(rawScore, risk.cap, evidenceCap ?? 10);
    rating = ratingFor(finalScore);
    ratingStatus = scenarioMetrics.scenarioCoverage >= 0.85 && criteriaMetrics.criteriaCoverage >= 0.85
      ? "简易任务评级"
      : "暂定简易任务评级";
  }

  const blockers = [];
  if (!taskConfirmed) blockers.push("任务链尚未获得用户确认");
  if (!coreTruthDefined) blockers.push("未定义可核对的成功真值");
  if (!scenarioMetrics.coreJudged) blockers.push("核心场景未判断");
  if (scenarioMetrics.scenarioCoverage < 0.7) blockers.push("场景覆盖率低于70%");
  if (criteriaMetrics.criteriaCoverage < 0.7) blockers.push("准则覆盖率低于70%");
  if (scenarioMetrics.efficiency == null) blockers.push("缺少路径效率数据");
  if (assessmentType === "unverified") blockers.push("输入只能形成待验证任务链");

  return {
    model: "non-aem-lite-task-score-v0.2.1",
    task: input.task ?? {},
    assessment_type: assessmentType,
    efficiency_basis: efficiencyBasis,
    rating_status: ratingStatus,
    metrics: {
      completion_proxy_E_lite: scenarioMetrics.completion == null ? null : round(scenarioMetrics.completion),
      path_efficiency_P_lite: scenarioMetrics.efficiency == null ? null : round(scenarioMetrics.efficiency),
      criteria_quality_Q: criteriaMetrics.quality == null ? null : round(criteriaMetrics.quality),
      scenario_coverage: round(scenarioMetrics.scenarioCoverage),
      criteria_coverage: round(criteriaMetrics.criteriaCoverage),
    },
    scoring: {
      formula: "10*(0.50*E_lite+0.20*P_lite+0.30*Q)",
      raw_score: rawScore == null ? null : round(rawScore),
      risk_cap: risk.cap,
      risk_cap_reason: risk.reason,
      evidence_cap: evidenceCap,
      final_score: finalScore == null ? null : round(finalScore),
      final_score_display_1dp: finalScore == null ? null : round(finalScore, 1),
      rating,
    },
    severity_counts: criteriaMetrics.severityCounts,
    criteria: aggregated,
    missing_criteria: missing,
    blockers,
    warnings,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === "self-test" || key === "pretty") {
      args[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value == null || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args[key] = value;
    index += 1;
  }
  return args;
}

function allPassCriteria() {
  return Object.entries(CRITERIA_IMPORTANCE).map(([id, importance]) => ({
    id,
    importance,
    judgment: "pass",
    affects_core: importance === 3,
  }));
}

function runSelfTest() {
  const base = {
    assessment_type: "runtime",
    efficiency_basis: "actions",
    task: { name: "测试任务", confirmed: true, core_truth_defined: true },
    scenarios: [
      { id: "normal", importance: 3, core: true, judgment: "pass", necessary_actions: 4, observed_actions: 4 },
      { id: "boundary", importance: 1, judgment: "pass", necessary_actions: 2, observed_actions: 2 },
      { id: "recovery", importance: 1, judgment: "pass", necessary_actions: 2, observed_actions: 2 },
    ],
    criteria: allPassCriteria(),
  };

  const perfect = calculateLiteTaskScore(base);
  assert.equal(perfect.scoring.final_score, 10);
  assert.equal(perfect.scoring.rating, "卓越");
  assert.equal(perfect.metrics.criteria_coverage, 1);

  const spec = calculateLiteTaskScore({ ...base, assessment_type: "spec" });
  assert.equal(spec.scoring.final_score, 7.9);
  assert.equal(spec.scoring.rating, "优");

  const gateCriteria = allPassCriteria().map((item) => (
    item.id === "F1.01" ? { ...item, judgment: "fail", affects_core: true } : item
  ));
  const gate = calculateLiteTaskScore({ ...base, criteria: gateCriteria });
  assert.equal(gate.scoring.risk_cap, 4.9);
  assert.equal(gate.scoring.final_score, 4.9);
  assert.equal(gate.scoring.rating, "差");

  const majorCriteria = allPassCriteria().map((item) => (
    item.id === "F1.05" ? { ...item, judgment: "fail", affects_core: true } : item
  ));
  const major = calculateLiteTaskScore({ ...base, criteria: majorCriteria });
  assert.equal(major.scoring.risk_cap, 5.9);
  assert.equal(major.scoring.final_score, 5.9);
  assert.equal(major.scoring.rating, "中");

  const incomplete = calculateLiteTaskScore({ ...base, criteria: base.criteria.slice(0, 2) });
  assert.equal(incomplete.rating_status, "未评分");
  assert.equal(incomplete.scoring.final_score, null);

  const unconfirmed = calculateLiteTaskScore({
    ...base,
    task: { ...base.task, confirmed: false },
  });
  assert.equal(unconfirmed.rating_status, "未评分");
  assert.equal(unconfirmed.scoring.final_score, null);
  assert.ok(unconfirmed.blockers.includes("任务链尚未获得用户确认"));

  return { ok: true, tests: 15 };
}

function summarizeProduct(assessments) {
  const results = assessments.map(calculateLiteTaskScore);
  const scored = results.filter((item) => item.scoring.final_score != null);
  const mean = scored.length > 0
    ? scored.reduce((sum, item) => sum + item.scoring.final_score, 0) / scored.length
    : null;
  return {
    tasks: results,
    product: {
      task_count: results.length,
      scored_task_count: scored.length,
      coverage_status: scored.length === results.length ? "完整" : "覆盖不完整",
      score: mean == null ? null : round(mean),
      score_display_1dp: mean == null ? null : round(mean, 1),
      rating: mean == null ? null : ratingFor(mean),
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["self-test"]) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }
  if (!args["input-json"]) {
    throw new Error("Usage: node calculate_lite_task_score.mjs --input-json assessment.json [--pretty]");
  }
  const parsed = JSON.parse(fs.readFileSync(args["input-json"], "utf8"));
  const output = Array.isArray(parsed.assessments)
    ? summarizeProduct(parsed.assessments)
    : calculateLiteTaskScore(parsed);
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
