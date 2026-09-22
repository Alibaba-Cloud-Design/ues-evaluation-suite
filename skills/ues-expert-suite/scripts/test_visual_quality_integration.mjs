#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateVisualQualityIntegration } from "./validate_visual_quality_integration.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const reviewScript = path.resolve(scriptDir, "../modules/evaluate-visual-quality-v0-9/scripts/review.py");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ues-visual-integration-"));
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const runReview = args => {
  const result = spawnSync("python3", [reviewScript, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
};

try {
  const imagePath = path.join(tempDir, "screen.png");
  fs.writeFileSync(imagePath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
  const perceptionDraft = path.join(tempDir, "perception.json");
  const perceptionFrozen = path.join(tempDir, "perception.frozen.json");
  const diagnosisDraft = path.join(tempDir, "diagnosis.json");
  const diagnosisFrozen = path.join(tempDir, "diagnosis.frozen.json");
  const scoringDraft = path.join(tempDir, "scoring.json");
  const evaluationPath = path.join(tempDir, "evaluation.json");

  runReview(["init", "--images", imagePath, "--output", perceptionDraft]);
  const perception = read(perceptionDraft);
  Object.assign(perception.units[0], {
    scope: "完整静态页面",
    context: "合同测试页面",
    initial_overall: {
      first_impression: "主体清晰但层级略弱",
      visual_center: "中央主内容",
      spatial_character: "单列紧凑",
      designed_coherence: "主要区域保持一致",
      accidental_candidates: "次级信息与主标题竞争",
      uncertainty: "静态图不能证明交互状态"
    },
    raw_findings: [{
      id: "VQ-F01",
      locator: "主标题下方",
      visible_fact: "次级标签与主标题使用相近字号和对比度",
      anomaly_claim: "信息层级可能不够清楚",
      possible_intent: "可能希望保持紧凑",
      inspection_note: "按原始比例核对了标题和标签关系"
    }],
    no_findings_reason: ""
  });
  write(perceptionDraft, perception);
  runReview(["freeze", perceptionDraft, "--output", perceptionFrozen]);

  runReview(["diagnose", perceptionFrozen, "--output", diagnosisDraft]);
  const diagnosis = read(diagnosisDraft);
  const unit = diagnosis.units[0];
  unit.finding_dispositions[0] = { finding_id: "VQ-F01", status: "confirmed", reason: "层级竞争仍然存在", visible_basis: "标题和标签的字号及对比度接近" };
  unit.issues = [{
    id: "VQ-I01",
    source_finding_ids: ["VQ-F01"],
    locator: "主标题下方",
    visible_fact: "次级标签与主标题使用相近字号和对比度",
    effect: "主次阅读顺序减弱",
    severity: "medium",
    diagnosis_tag: "hierarchy",
    alternative_explanation: "紧凑布局不能解释相同视觉权重",
    recommendation: "降低次级标签字号或对比度"
  }];
  unit.strengths = [{ locator: "页面主体", visible_fact: "主体内容边界清晰" }];
  unit.evidence_limits = ["静态截图不能证明交互反馈"];
  unit.overall_judgment = { signal: "mixed", summary: "结构可用但层级存在明确弱点", integration: "优势与问题共同影响体验", confidence: "中", limitations: "仅评估静态页面" };
  write(diagnosisDraft, diagnosis);
  runReview(["validate", diagnosisDraft]);
  runReview(["freeze-diagnosis", diagnosisDraft, "--output", diagnosisFrozen]);

  runReview(["score-init", diagnosisFrozen, "--output", scoringDraft]);
  const scoring = read(scoringDraft);
  for (const axis of scoring.units[0].scoring.axes) {
    axis.status = "rated";
    axis.rating = 3;
    axis.evidence = ["冻结诊断中的VQ-I01与可见强项"];
    axis.counterevidence = "页面主体仍保持清晰";
    axis.rationale = "整体基本受控但存在明确弱点";
  }
  write(scoringDraft, scoring);
  runReview(["score-finalize", scoringDraft, "--output", evaluationPath]);
  const evaluation = read(evaluationPath);
  const result = evaluation.units[0].score_result;

  const assessmentPath = path.join(tempDir, "assessment.json");
  const assessment = {
    specialists: [{ name: "evaluate-visual-quality-v0-9", status: "executed", score: null, artifact_paths: ["perception.frozen.json", "diagnosis.frozen.json", "evaluation.json"] }],
    visual_quality: {
      schema_version: "ues-visual-quality-summary/0.1",
      status: "scored",
      overall_judgment: "mixed",
      score: { status: "calculated", scale: 100, raw: result.raw_score, cap: result.cap, final: result.final_score, experimental: true },
      units: [{
        id: "A",
        overall_judgment: "mixed",
        score: { status: "calculated", raw: result.raw_score, cap: result.cap, final: result.final_score },
        axes: evaluation.units[0].scoring.axes.map(axis => ({ id: axis.id, rating: axis.rating }))
      }],
      counts: { raw_findings: 1, confirmed: 1, downgraded: 0, resolved: 0, needs_evidence: 0, issues: 1, strengths: 1 },
      perception_path: "perception.frozen.json",
      diagnosis_path: "diagnosis.frozen.json",
      evaluation_path: "evaluation.json",
      perception_sha256: sha256(perceptionFrozen),
      diagnosis_sha256: sha256(diagnosisFrozen),
      evidence_limitations: ["静态截图不能证明交互反馈"]
    },
    issues: [{ issue_id: "UES-001", source_specialists: ["evaluate-visual-quality-v0-9"], source_issue_ids: ["VQ-I01"], visual_finding_refs: ["VQ-F01"] }]
  };
  write(assessmentPath, assessment);
  assert.deepEqual(validateVisualQualityIntegration(assessment, assessmentPath), []);

  const invalid = structuredClone(assessment);
  invalid.specialists[0].score = 7.5;
  assert(validateVisualQualityIntegration(invalid, assessmentPath).some(error => error.includes("must be null")));
  const invalidMapping = structuredClone(assessment);
  invalidMapping.issues[0].visual_finding_refs = ["UNKNOWN"];
  assert(validateVisualQualityIntegration(invalidMapping, assessmentPath).some(error => error.includes("not confirmed or downgraded")));
  console.log("UES visual quality integration tests passed (frozen perception, diagnosis, score, mapping, negative cases).");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
