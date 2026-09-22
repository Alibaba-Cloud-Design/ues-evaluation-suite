#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const visualName = "evaluate-visual-quality-v0-9";
const shaPattern = /^[a-f0-9]{64}$/;
const signals = new Set(["strong", "mixed", "weak", "undetermined"]);
const dispositions = new Set(["confirmed", "downgraded", "resolved", "needs_evidence"]);
const axisIds = ["organization_control", "expression_coherence", "local_finish", "primary_content_presentation"];
const text = value => typeof value === "string" && value.trim().length > 0;
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));

function expectedCounts(diagnosis) {
  const counts = { raw_findings: 0, confirmed: 0, downgraded: 0, resolved: 0, needs_evidence: 0, issues: 0, strengths: 0 };
  for (const unit of diagnosis.units ?? []) {
    counts.raw_findings += unit.raw_findings?.length ?? 0;
    counts.issues += unit.issues?.length ?? 0;
    counts.strengths += unit.strengths?.length ?? 0;
    for (const item of unit.finding_dispositions ?? []) if (dispositions.has(item.status)) counts[item.status] += 1;
  }
  return counts;
}

function sameCounts(actual, expected) {
  return Object.keys(expected).every(key => actual?.[key] === expected[key]);
}

export function validateVisualQualityIntegration(assessment, assessmentPath, { checkLocal = true } = {}) {
  const errors = [];
  const need = (condition, message) => { if (!condition) errors.push(message); };
  const baseDir = path.dirname(path.resolve(assessmentPath));
  const specialist = (assessment.specialists ?? []).find(item => item?.name === visualName);
  const summary = assessment.visual_quality;

  need(Boolean(specialist), `specialists is missing ${visualName}`);
  if (!specialist) return errors;
  need(specialist.score === null, `${visualName}: specialists[].score must be null`);
  const active = ["executed", "limited"].includes(specialist.status);
  if (!active) {
    need(summary?.status === "not_assessed", "visual_quality.status must be not_assessed when the visual specialist was not executed");
    return errors;
  }

  need(summary && typeof summary === "object", "visual_quality summary is required when visual quality is executed or limited");
  if (!summary) return errors;
  need(summary.schema_version === "ues-visual-quality-summary/0.1", "visual_quality.schema_version must be ues-visual-quality-summary/0.1");
  need(["diagnosed", "scored", "limited"].includes(summary.status), "visual_quality.status must be diagnosed, scored, or limited");
  need(summary.score?.scale === 100 && summary.score?.experimental === true, "visual_quality.score must retain the experimental 0-100 scale");
  need(new Set(["calculated", "not_requested", "insufficient_evidence", "per_unit"]).has(summary.score?.status), "visual_quality.score.status is invalid");
  for (const key of ["raw", "cap", "final"]) need(summary.score?.[key] === null || (typeof summary.score[key] === "number" && summary.score[key] >= 0 && summary.score[key] <= 100), `visual_quality.score.${key} must be null or 0-100`);
  need(Array.isArray(summary.evidence_limitations), "visual_quality.evidence_limitations must be an array");
  need(Array.isArray(summary.units) && summary.units.length > 0, "visual_quality.units must be a non-empty array");
  for (const key of ["perception_path", "diagnosis_path"]) need(text(summary[key]), `visual_quality.${key} is required`);
  for (const key of ["perception_sha256", "diagnosis_sha256"]) need(shaPattern.test(summary[key] ?? ""), `visual_quality.${key} must be a SHA-256`);

  if (!checkLocal || !text(summary.perception_path) || !text(summary.diagnosis_path)) return errors;
  const perceptionPath = path.resolve(baseDir, summary.perception_path);
  const diagnosisPath = path.resolve(baseDir, summary.diagnosis_path);
  need(fs.existsSync(perceptionPath), `visual perception artifact does not exist: ${summary.perception_path}`);
  need(fs.existsSync(diagnosisPath), `visual diagnosis artifact does not exist: ${summary.diagnosis_path}`);
  if (!fs.existsSync(perceptionPath) || !fs.existsSync(diagnosisPath)) return errors;
  need(sha256(perceptionPath) === summary.perception_sha256, "visual perception SHA-256 mismatch");
  need(sha256(diagnosisPath) === summary.diagnosis_sha256, "visual diagnosis SHA-256 mismatch");

  let perception;
  let diagnosis;
  try { perception = readJson(perceptionPath); } catch (error) { errors.push(`invalid visual perception JSON: ${error.message}`); return errors; }
  try { diagnosis = readJson(diagnosisPath); } catch (error) { errors.push(`invalid visual diagnosis JSON: ${error.message}`); return errors; }
  need(perception.stage === "perception_frozen", "visual perception must be frozen");
  need(diagnosis.stage === "diagnosis_frozen", "visual diagnosis must be frozen");
  need(sha256(perceptionPath) === diagnosis.source_perception?.sha256, "visual diagnosis must reference the supplied frozen perception");

  const perceptionById = new Map((perception.units ?? []).map(unit => [unit.id, unit]));
  const diagnosisById = new Map((diagnosis.units ?? []).map(unit => [unit.id, unit]));
  need(perceptionById.size > 0 && perceptionById.size === diagnosisById.size, "visual perception and diagnosis units must match");
  for (const [unitId, unit] of diagnosisById) {
    const original = perceptionById.get(unitId);
    need(Boolean(original), `${unitId}: diagnosis unit is missing from perception`);
    if (!original) continue;
    need(JSON.stringify(unit.raw_findings) === JSON.stringify(original.raw_findings), `${unitId}: raw findings changed after perception freeze`);
    const rawIds = new Set((unit.raw_findings ?? []).map(item => item.id));
    const dispositionsById = new Map((unit.finding_dispositions ?? []).map(item => [item.finding_id, item.status]));
    need(dispositionsById.size === rawIds.size && [...rawIds].every(id => dispositionsById.has(id)), `${unitId}: every raw finding needs one disposition`);
    const issueSources = new Set((unit.issues ?? []).flatMap(item => item.source_finding_ids ?? []));
    for (const id of rawIds) {
      const status = dispositionsById.get(id);
      need(dispositions.has(status), `${unitId}/${id}: invalid disposition`);
      if (["confirmed", "downgraded"].includes(status)) need(issueSources.has(id), `${unitId}/${id}: confirmed or downgraded finding must feed an issue`);
      if (status === "resolved") need(!issueSources.has(id), `${unitId}/${id}: resolved finding cannot feed an issue`);
    }
  }

  need(sameCounts(summary.counts, expectedCounts(diagnosis)), "visual_quality.counts must match the frozen diagnosis");
  const summaryById = new Map((summary.units ?? []).map(unit => [unit.id, unit]));
  need(summaryById.size === diagnosisById.size, "visual_quality.units must summarize every diagnosis unit once");

  let evaluation = null;
  if (text(summary.evaluation_path)) {
    const evaluationPath = path.resolve(baseDir, summary.evaluation_path);
    need(fs.existsSync(evaluationPath), `visual evaluation artifact does not exist: ${summary.evaluation_path}`);
    if (fs.existsSync(evaluationPath)) {
      try { evaluation = readJson(evaluationPath); } catch (error) { errors.push(`invalid visual evaluation JSON: ${error.message}`); }
      if (evaluation) {
        need(evaluation.stage === "scored", "visual evaluation must be finalized with stage=scored");
        need(evaluation.source_diagnosis?.sha256 === sha256(diagnosisPath), "visual evaluation must reference the supplied frozen diagnosis");
      }
    }
  }
  need((summary.status === "scored") === Boolean(evaluation), "visual_quality.status=scored must match the presence of a valid evaluation");

  const scoredById = new Map((evaluation?.units ?? []).map(unit => [unit.id, unit]));
  for (const [unitId, diagnosisUnit] of diagnosisById) {
    const unitSummary = summaryById.get(unitId);
    need(Boolean(unitSummary), `${unitId}: missing visual unit summary`);
    if (!unitSummary) continue;
    need(unitSummary.overall_judgment === diagnosisUnit.overall_judgment?.signal, `${unitId}: overall judgment mismatch`);
    need(signals.has(unitSummary.overall_judgment), `${unitId}: invalid overall judgment`);
    need(new Set(["calculated", "not_requested", "insufficient_evidence"]).has(unitSummary.score?.status), `${unitId}: invalid score status`);
    const scored = scoredById.get(unitId);
    if (!scored) {
      need(unitSummary.score?.status === "not_requested", `${unitId}: unscored unit must use score.status=not_requested`);
      continue;
    }
    const result = scored.score_result ?? {};
    const expectedStatus = result.status === "complete" ? "calculated" : "insufficient_evidence";
    need(unitSummary.score?.status === expectedStatus, `${unitId}: score status mismatch`);
    need(unitSummary.score?.raw === result.raw_score && unitSummary.score?.cap === result.cap && unitSummary.score?.final === result.final_score, `${unitId}: raw/cap/final mismatch`);
    need(Array.isArray(unitSummary.axes) && unitSummary.axes.length === 4, `${unitId}: four visual axes are required for a scored unit`);
    const axisById = new Map((unitSummary.axes ?? []).map(axis => [axis.id, axis]));
    for (const axis of scored.scoring?.axes ?? []) {
      need(axisIds.includes(axis.id) && axisById.get(axis.id)?.rating === axis.rating, `${unitId}/${axis.id}: axis summary mismatch`);
    }
  }

  if ((summary.units ?? []).length === 1) {
    const unitScore = summary.units[0].score;
    need(summary.overall_judgment === summary.units[0].overall_judgment, "single-unit overall judgment must match its unit");
    need(summary.score?.status === unitScore?.status && summary.score?.raw === unitScore?.raw && summary.score?.cap === unitScore?.cap && summary.score?.final === unitScore?.final, "single-unit top-level score must match its unit");
  } else {
    need(summary.overall_judgment === null, "multi-unit visual summary must use overall_judgment=null");
    need(summary.score?.status === "per_unit" && summary.score?.raw === null && summary.score?.cap === null && summary.score?.final === null, "multi-unit visual summary must expose scores per unit without aggregation");
  }

  const visualIssueIds = new Set((diagnosis.units ?? []).flatMap(unit => unit.issues ?? []).map(issue => issue.id));
  const findingStatuses = new Map((diagnosis.units ?? []).flatMap(unit => unit.finding_dispositions ?? []).map(item => [item.finding_id, item.status]));
  for (const issue of assessment.issues ?? []) {
    if (!(issue.source_specialists ?? []).includes(visualName)) continue;
    need((issue.source_issue_ids ?? []).some(id => visualIssueIds.has(id)), `${issue.issue_id}: visual source_issue_ids must resolve in the frozen diagnosis`);
    need(Array.isArray(issue.visual_finding_refs) && issue.visual_finding_refs.length > 0, `${issue.issue_id}: visual_finding_refs is required for a visual issue`);
    for (const id of issue.visual_finding_refs ?? []) need(["confirmed", "downgraded"].includes(findingStatuses.get(id)), `${issue.issue_id}: visual finding ${id} is not confirmed or downgraded`);
  }
  return errors;
}

const current = process.argv[1] ? pathToFileURL(fs.realpathSync(process.argv[1])).href : null;
if (current === import.meta.url) {
  const file = process.argv[2];
  if (!file || process.argv.length > 3) {
    console.error("Usage: node validate_visual_quality_integration.mjs /absolute/path/to/assessment.json");
    process.exitCode = 2;
  } else {
    try {
      const resolved = path.resolve(file);
      const assessment = readJson(resolved);
      const errors = validateVisualQualityIntegration(assessment, resolved);
      if (errors.length) {
        for (const error of errors) console.error(`- ${error}`);
        process.exitCode = 1;
      } else {
        console.log("UES visual quality integration is valid.");
      }
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
