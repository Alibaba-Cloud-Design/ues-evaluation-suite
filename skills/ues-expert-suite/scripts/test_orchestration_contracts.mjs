#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateEvidenceIndex } from "./validate_evidence_index.mjs";
import { validateRunState } from "./validate_run_state.mjs";
import { validateDiagnosis } from "./validate_diagnosis.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ues-orchestration-test-"));
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const writeJson = (name, value) => {
  const target = path.join(tempDir, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  return target;
};

try {
  fs.mkdirSync(path.join(tempDir, "input"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "input", "source.txt"), "fixture\n");
  fs.writeFileSync(path.join(tempDir, "report.md"), "# Fixture\n");
  fs.writeFileSync(path.join(tempDir, "product-profile.json"), "{}\n");

  const evidence = {
    schema_version: "ues-evidence-index/0.1",
    run_id: "RUN-TEST-001",
    version: 1,
    generated_at: "2026-09-15T15:00:00+08:00",
    input_snapshot_id: "INPUT-001",
    evidence: [{
      id: "E-001",
      kind: "content",
      origin: "supplied",
      ref: "input/source.txt",
      sha256: hash("fixture\n"),
      recorded_at: "2026-09-15T15:00:00+08:00",
      subjects: { page_ids: [], state_ids: [], task_ids: [], run_ids: [] },
      locator: "完整文本",
      observable_fact: "用户提供的测试材料",
      authorization_scope: "user_supplied",
      sensitivity: "unknown",
      derivative_of: null,
      supersedes: null
    }]
  };
  const evidencePath = writeJson("evidence-index.json", evidence);
  const evidenceHash = hash(fs.readFileSync(evidencePath));
  assert.deepEqual(validateEvidenceIndex(evidence, tempDir, { checkLocal: true }), []);
  const diagnosis = {
    schema_version: "ues-diagnosis/0.1",
    run_id: "RUN-TEST-001",
    version: 1,
    input_snapshot_id: "INPUT-001",
    evidence_index_version: 1,
    scenarios: [{ id: "S1", goal: "检查示例", decision: "示例是否可用", required_information: ["页面内容"], success_outcome: "可作出判断", basis: "合同测试", assumptions: [] }],
    candidates: [{
      id: "D-01",
      scenario_ids: ["S1"],
      observation: "测试材料包含可定位事实",
      observation_evidence_ids: ["E-001"],
      hypothesis: "该事实可能影响示例任务",
      potential_consequence: "用户可能无法作出判断",
      verification: { action: "核对测试材料", expected_discriminator: "材料存在则支持", evidence_ids: ["E-001"], status: "confirmed" },
      counterevidence: { alternatives_checked: ["检查是否为刻意限制"], remaining_uncertainty: [] },
      conclusion: { status: "confirmed", confidence: "high", summary: "合同测试确认候选", linked_output_ids: ["UES-001"] }
    }],
    stage_metrics: []
  };
  writeJson("diagnosis.json", diagnosis);
  assert.deepEqual(validateDiagnosis(diagnosis), []);

  const names = ["ues-baseline-gate", "ease-of-use-suite-47", "consistency-suite-22", "task-experience-score", "page-performance-score", "virtual-user-walkthrough"];
  const specialists = names.map(name => ({
    name,
    execution_status: "validated",
    result_status: "not_selected",
    artifact_paths: [],
    depends_on: { input_snapshot_id: "INPUT-001", profile_version: 1, routing_version: 1, evidence_index_version: 1, diagnosis_version: 1 },
    validation: { status: "not_required", artifact_path: null },
    stale_reasons: []
  }));
  const routing = {
    schema_version: "ues-routing-plan/0.1",
    run_id: "RUN-TEST-001",
    version: 1,
    input_snapshot_id: "INPUT-001",
    profile_version: 1,
    generated_at: "2026-09-15T15:01:00+08:00",
    specialists: names.map(name => ({ name, result_status: "not_selected", reason: "contract fixture", evidence_basis: [], required_confirmations: [], dependencies: [], planned_outputs: [] }))
  };
  writeJson("routing-plan.json", routing);

  const state = {
    schema_version: "ues-run-state/0.2",
    run_id: "RUN-TEST-001",
    created_at: "2026-09-15T15:00:00+08:00",
    updated_at: "2026-09-15T15:10:00+08:00",
    input_snapshot: { id: "INPUT-001", version: 1, artifacts: ["input/source.txt"] },
    profile: { version: 1, status: "frozen", artifact_path: "product-profile.json" },
    confirmations: {
      paradigm: { status: "not_required", version: null, artifact_path: null, basis: "未选择场景赋权" },
      task_contract: { status: "not_required", version: null, artifact_path: null, basis: "未选择任务专项" }
    },
    routing: { version: 1, status: "frozen", artifact_path: "routing-plan.json" },
    evidence_index: { version: 1, path: "evidence-index.json", sha256: evidenceHash },
    diagnosis: { version: 1, status: "validated", artifact_path: "diagnosis.json" },
    specialists,
    report: {
      status: "current",
      artifact_paths: ["assessment.json", "report.md"],
      depends_on: { input_snapshot_id: "INPUT-001", profile_version: 1, routing_version: 1, evidence_index_version: 1, diagnosis_version: 1, specialist_validations: Object.fromEntries(names.map(name => [name, "not_required"])) },
      reason: "所有当前范围均已终结"
    }
  };

  const assessment = {
    schema_version: "ues-expert-suite/0.5",
    generated_at: "2026-09-15T15:10:00+08:00",
    run_id: "RUN-TEST-001",
    run_state_path: "run-state.json",
    evidence_index_path: "evidence-index.json",
    diagnosis_path: "diagnosis.json",
    routing_plan_path: "routing-plan.json",
    product: { name: "fixture", version: "1", platform: "other", product_type: ["unknown"], development_stage: "unknown", stage_basis: "fixture", target_users: [], core_tasks: [] },
    scope: { inputs: ["fixture"], routes_or_screens: [], authorization_limits: [], assumptions: [], evidence_limitations: [] },
    specialists: names.map(name => ({ name, status: "not_selected", reason: "contract fixture", evidence_level: "not_assessed", score: null, result: "未选择", artifact_paths: [] })),
    basic_risk: { findings_status: "not_assessed", verification_status: "not_assessed", scope: "not_assessed", artifact_path: null },
    release_gate: { status: "not_assessed", reason: "未评估" },
    ues_score: { status: "not_calculated", value: null, weights: { ease_of_use: 0.4, task: 0.3, consistency: 0.2, performance: 0.1 }, reason: "专项未选择" },
    issues: [{ issue_id: "UES-001", title: "合同测试问题", priority: "P2", source_specialists: ["ease-of-use-suite-47"], source_issue_ids: ["I-001"], diagnosis_refs: ["D-01"], evidence_refs: ["E-001"], affected_users_tasks: ["S1"], impact: "用于验证诊断映射", recommendation: "保留可定位信息", acceptance: "映射通过校验" }],
    next_evidence: []
  };
  writeJson("assessment.json", assessment);
  writeJson("run-state.json", state);
  assert.deepEqual(validateRunState(state, tempDir, { checkLocal: true }), []);

  const stale = structuredClone(state);
  stale.profile.version = 2;
  assert(validateRunState(stale, tempDir, { checkLocal: false }).some(error => error.includes("stale dependencies")));
  const duplicate = structuredClone(evidence);
  duplicate.evidence.push(structuredClone(duplicate.evidence[0]));
  assert(validateEvidenceIndex(duplicate, tempDir).some(error => error.includes("duplicates")));

  const suite = spawnSync(process.execPath, [path.join(scriptDir, "validate_suite_report.mjs"), path.join(tempDir, "assessment.json")], { encoding: "utf8" });
  assert.equal(suite.status, 0, suite.stderr || suite.stdout);
  const legacy = structuredClone(assessment);
  legacy.schema_version = "ues-expert-suite/0.3";
  for (const key of ["run_id", "run_state_path", "evidence_index_path", "routing_plan_path"]) delete legacy[key];
  writeJson("legacy-assessment.json", legacy);
  const legacySuite = spawnSync(process.execPath, [path.join(scriptDir, "validate_suite_report.mjs"), path.join(tempDir, "legacy-assessment.json")], { encoding: "utf8" });
  assert.equal(legacySuite.status, 0, legacySuite.stderr || legacySuite.stdout);

  const visualName = "evaluate-visual-quality-v0-9";
  const v6Names = [...names, visualName];
  const v6Specialists = v6Names.map(name => ({
    name,
    execution_status: "validated",
    result_status: name === "ease-of-use-suite-47" ? "deferred" : "not_selected",
    artifact_paths: [],
    depends_on: { input_snapshot_id: "INPUT-001", profile_version: 1, routing_version: 1, evidence_index_version: 1, diagnosis_version: 1 },
    validation: { status: "not_required", artifact_path: null },
    stale_reasons: []
  }));
  const v6Routing = {
    schema_version: "ues-routing-plan/0.2",
    scope_request: { mode: "only", requested_specialists: ["ease-of-use-suite-47"], basis: "合同测试只选择易用性" },
    run_id: "RUN-TEST-001",
    version: 1,
    input_snapshot_id: "INPUT-001",
    profile_version: 1,
    generated_at: "2026-09-15T15:01:00+08:00",
    specialists: v6Names.map(name => ({ name, result_status: name === "ease-of-use-suite-47" ? "deferred" : "not_selected", reason: "contract fixture", evidence_basis: [], required_confirmations: [], dependencies: [], planned_outputs: [] }))
  };
  writeJson("routing-plan-v6.json", v6Routing);
  const v6State = structuredClone(state);
  v6State.schema_version = "ues-run-state/0.3";
  v6State.routing.artifact_path = "routing-plan-v6.json";
  v6State.specialists = v6Specialists;
  v6State.report.artifact_paths = ["report.md"];
  v6State.report.depends_on.specialist_validations = Object.fromEntries(v6Names.map(name => [name, "not_required"]));
  writeJson("run-state-v6.json", v6State);
  assert.deepEqual(validateRunState(v6State, tempDir, { checkLocal: true }), []);

  const v6Assessment = structuredClone(assessment);
  v6Assessment.schema_version = "ues-expert-suite/0.6";
  v6Assessment.run_state_path = "run-state-v6.json";
  v6Assessment.routing_plan_path = "routing-plan-v6.json";
  v6Assessment.scope.request_mode = "only";
  v6Assessment.specialists = v6Names.map(name => ({ name, status: name === "ease-of-use-suite-47" ? "deferred" : "not_selected", reason: "contract fixture", evidence_level: "not_assessed", score: null, result: "未执行", artifact_paths: [] }));
  v6Assessment.visual_quality = { status: "not_assessed" };
  writeJson("assessment-v6.json", v6Assessment);
  const suiteV6 = spawnSync(process.execPath, [path.join(scriptDir, "validate_suite_report.mjs"), path.join(tempDir, "assessment-v6.json")], { encoding: "utf8" });
  assert.equal(suiteV6.status, 0, suiteV6.stderr || suiteV6.stdout);

  const invalidOnlyRouting = structuredClone(v6Routing);
  invalidOnlyRouting.specialists.find(item => item.name === visualName).result_status = "deferred";
  writeJson("routing-plan-invalid-only.json", invalidOnlyRouting);
  const invalidOnlyAssessment = structuredClone(v6Assessment);
  invalidOnlyAssessment.routing_plan_path = "routing-plan-invalid-only.json";
  writeJson("assessment-invalid-only.json", invalidOnlyAssessment);
  const invalidOnly = spawnSync(process.execPath, [path.join(scriptDir, "validate_suite_report.mjs"), path.join(tempDir, "assessment-invalid-only.json")], { encoding: "utf8" });
  assert.notEqual(invalidOnly.status, 0, "unrequested specialist must be rejected when only mode selects another specialist");
  console.log("UES orchestration contract tests passed (diagnosis, legacy, suite 0.5, suite 0.6 only mode, stale and negative routing). ");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
