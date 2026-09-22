#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { validateRunState } from "./validate_run_state.mjs";
import { validateEvidenceIndex } from "./validate_evidence_index.mjs";
import { validateDiagnosis } from "./validate_diagnosis.mjs";
import { validateVisualQualityIntegration } from "./validate_visual_quality_integration.mjs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node validate_suite_report.mjs /absolute/path/to/assessment.json");
  process.exit(2);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (error) {
  console.error(`Invalid JSON: ${error.message}`);
  process.exit(1);
}

const errors = [];
const requiredSpecialists = [
  "ues-baseline-gate",
  "consistency-suite-22",
  "task-experience-score",
  "page-performance-score",
  "virtual-user-walkthrough"
];
const allowedStatuses = new Set([
  "executed",
  "limited",
  "deferred",
  "not_applicable",
  "unavailable",
  "not_selected"
]);

const suiteSchemas = new Set(["ues-expert-suite/0.3", "ues-expert-suite/0.4", "ues-expert-suite/0.5", "ues-expert-suite/0.6"]);
if (!suiteSchemas.has(data.schema_version)) {
  errors.push("schema_version must be ues-expert-suite/0.3, ues-expert-suite/0.4, ues-expert-suite/0.5, or ues-expert-suite/0.6");
}
if (typeof data.generated_at !== "string" || Number.isNaN(Date.parse(data.generated_at))) {
  errors.push("generated_at must be an ISO-8601 date-time string");
}
if (!data.product || typeof data.product !== "object") {
  errors.push("product is required");
} else {
  for (const key of ["name", "version", "platform", "development_stage", "stage_basis"]) {
    if (typeof data.product[key] !== "string" || !data.product[key].trim()) errors.push(`product.${key} is required`);
  }
  for (const key of ["product_type", "target_users", "core_tasks"]) {
    if (!Array.isArray(data.product[key])) errors.push(`product.${key} must be an array`);
  }
}
if (!data.scope || typeof data.scope !== "object") {
  errors.push("scope is required");
} else {
  for (const key of ["inputs", "routes_or_screens", "authorization_limits", "assumptions", "evidence_limitations"]) {
    if (!Array.isArray(data.scope[key])) errors.push(`scope.${key} must be an array`);
  }
}
if (!Array.isArray(data.specialists)) {
  errors.push("specialists must be an array");
} else {
  const names = new Set(data.specialists.map((item) => item?.name));
  if (names.size !== data.specialists.length) errors.push("specialists must not contain duplicate names");
  if (!names.has("ease-of-use-suite-47") && !names.has("usability-suite-47")) {
    errors.push("specialists is missing ease-of-use-suite-47 (or legacy usability-suite-47)");
  }
  for (const name of requiredSpecialists) {
    if (!names.has(name)) errors.push(`specialists is missing ${name}`);
  }
  if (data.schema_version === "ues-expert-suite/0.6" && !names.has("evaluate-visual-quality-v0-9")) {
    errors.push("specialists is missing evaluate-visual-quality-v0-9");
  }
  for (const item of data.specialists) {
    if (!item || typeof item.name !== "string") {
      errors.push("each specialist must have a name");
      continue;
    }
    if (!allowedStatuses.has(item.status)) errors.push(`${item.name}: invalid status`);
    if (typeof item.reason !== "string" || !item.reason.trim()) errors.push(`${item.name}: reason is required`);
    if (item.score !== null && !(typeof item.score === "number" && item.score >= 0 && item.score <= 10)) {
      errors.push(`${item.name}: score must be null or a number from 0 to 10`);
    }
  }
  const visual = data.specialists.find(item => item?.name === "evaluate-visual-quality-v0-9");
  if (visual && visual.score !== null) errors.push("evaluate-visual-quality-v0-9: score must be null; use visual_quality for the experimental 0-100 result");
}

if ('baseline' in data) errors.push('legacy baseline field must be migrated explicitly');
const readArtifact = rel => {
  if (typeof rel !== 'string' || !rel.trim()) throw new Error('artifact_path required');
  return JSON.parse(fs.readFileSync(path.resolve(path.dirname(file), rel), 'utf8'));
};
const riskSpecialist=(data.specialists||[]).find(x=>x.name==='ues-baseline-gate');
if (riskSpecialist?.score !== null) errors.push('basic risk must not have a score');
try {
 const r=data.basic_risk;
 if (!r) throw new Error('basic_risk required');
 if(r.findings_status==='not_assessed') {
  if(r.artifact_path!==null||r.verification_status!=='not_assessed'||r.scope!=='not_assessed') throw new Error('invalid unassessed basic_risk');
  if(['executed','limited'].includes(riskSpecialist?.status)) throw new Error('executed risk must have assessment');
  if(data.release_gate?.status!=='not_assessed') throw new Error('unassessed risk cannot claim release gate');
 } else {
  const {validate:validateRisk}=await import('../modules/ues-baseline-gate/scripts/validate_baseline_result.mjs');
  const raw=readArtifact(r.artifact_path);errors.push(...validateRisk(raw).map(x=>'basic_risk: '+x));
  for(const k of ['findings_status','verification_status','scope'])if(r[k]!==raw[k])errors.push('basic_risk '+k+' mismatch');
  if(JSON.stringify(data.release_gate)!==JSON.stringify(raw.release_gate))errors.push('release_gate must match assessed risk artifact');
 }
} catch(e){errors.push(e.message);}
if ('accessibility' in data || (data.specialists||[]).some(x=>x.name==='accessibility-experience-score')) errors.push('Accessibility belongs inside BL-04; no independent specialist or score');
if (!data.release_gate || typeof data.release_gate.reason !== 'string') errors.push('release_gate reason required');
if (!data.ues_score || !["calculated", "not_calculated"].includes(data.ues_score.status)) {
  errors.push("ues_score.status must be calculated or not_calculated");
} else {
  const expectedWeights = {ease_of_use: 0.4, task: 0.3, consistency: 0.2, performance: 0.1};
  if (Object.keys(data.ues_score.weights||{}).length!==4) errors.push('only four UES weights allowed');
  for (const [key, expected] of Object.entries(expectedWeights)) {
    if (data.ues_score.weights?.[key] !== expected) errors.push(`ues_score.weights.${key} must be ${expected}`);
  }
  if (typeof data.ues_score.reason !== "string" || !data.ues_score.reason.trim()) errors.push("ues_score.reason is required");
  if (data.ues_score.status === "calculated") {
    if (!(typeof data.ues_score.value === "number" && data.ues_score.value >= 0 && data.ues_score.value <= 10)) {
      errors.push("calculated ues_score.value must be a number from 0 to 10");
    }
    const scoreByName = new Map((data.specialists ?? []).map((item) => [item.name, item.score]));
    const componentScores = [
      scoreByName.get("ease-of-use-suite-47") ?? scoreByName.get("usability-suite-47"),
      scoreByName.get("task-experience-score"),
      scoreByName.get("consistency-suite-22"),
      scoreByName.get("page-performance-score")
    ];
    if (componentScores.some((score) => typeof score !== "number")) {
      errors.push("calculated UES score requires all four numeric component scores");
    } else {
      const expected = Math.round((componentScores[0] * 0.4 + componentScores[1] * 0.3 + componentScores[2] * 0.2 + componentScores[3] * 0.1) * 10) / 10;
      if (data.ues_score.value !== expected) errors.push(`ues_score.value must equal weighted result ${expected}`);
    }
  } else if (data.ues_score.value !== null) {
    errors.push("not_calculated ues_score.value must be null");
  }
}

if (!Array.isArray(data.issues)) errors.push("issues must be an array");
if (!Array.isArray(data.next_evidence)) errors.push("next_evidence must be an array");

if (["ues-expert-suite/0.4", "ues-expert-suite/0.5", "ues-expert-suite/0.6"].includes(data.schema_version)) {
  const baseDir = path.dirname(path.resolve(file));
  const managedKeys = ["run_id", "run_state_path", "evidence_index_path", "routing_plan_path"];
  if (["ues-expert-suite/0.5", "ues-expert-suite/0.6"].includes(data.schema_version)) managedKeys.push("diagnosis_path");
  for (const key of managedKeys) {
    if (typeof data[key] !== "string" || !data[key].trim()) errors.push(`${key} is required for ${data.schema_version}`);
  }
  let runState = null;
  let evidenceIndex = null;
  let diagnosis = null;
  const loadLinked = (key, label) => {
    if (typeof data[key] !== "string" || !data[key].trim()) return null;
    const resolved = path.resolve(baseDir, data[key]);
    if (!fs.existsSync(resolved)) {
      errors.push(`${label} does not exist: ${data[key]}`);
      return null;
    }
    try { return { resolved, data: JSON.parse(fs.readFileSync(resolved, "utf8")) }; }
    catch (error) { errors.push(`invalid ${label}: ${error.message}`); return null; }
  };
  const evidenceLinked = loadLinked("evidence_index_path", "evidence index");
  if (evidenceLinked) {
    evidenceIndex = evidenceLinked.data;
    errors.push(...validateEvidenceIndex(evidenceIndex, path.dirname(evidenceLinked.resolved), { checkLocal: true }).map(error => `evidence_index: ${error}`));
    if (evidenceIndex.run_id !== data.run_id) errors.push("evidence index run_id must match assessment run_id");
  }
  const runLinked = loadLinked("run_state_path", "run state");
  if (runLinked) {
    runState = runLinked.data;
    errors.push(...validateRunState(runState, path.dirname(runLinked.resolved), { checkLocal: true }).map(error => `run_state: ${error}`));
    if (runState.run_id !== data.run_id) errors.push("run state run_id must match assessment run_id");
    if (runState.report?.status !== "current") errors.push(`${data.schema_version} final delivery requires run-state report.status=current`);
  }
  if (["ues-expert-suite/0.5", "ues-expert-suite/0.6"].includes(data.schema_version)) {
    const diagnosisLinked = loadLinked("diagnosis_path", "diagnosis");
    if (diagnosisLinked) {
      diagnosis = diagnosisLinked.data;
      errors.push(...validateDiagnosis(diagnosis).map(error => `diagnosis: ${error}`));
      if (diagnosis.run_id !== data.run_id) errors.push("diagnosis run_id must match assessment run_id");
    }
  }
  const routingLinked = loadLinked("routing_plan_path", "routing plan");
  if (routingLinked) {
    const routing = routingLinked.data;
    const allowedRoutingSchemas = data.schema_version === "ues-expert-suite/0.6" ? new Set(["ues-routing-plan/0.2"]) : new Set(["ues-routing-plan/0.1"]);
    if (!allowedRoutingSchemas.has(routing.schema_version)) errors.push(`routing plan schema_version is invalid for ${data.schema_version}`);
    if (data.schema_version === "ues-expert-suite/0.6") {
      const mode = routing.scope_request?.mode;
      if (!new Set(["auto", "full", "only"]).has(mode)) errors.push("routing plan scope_request.mode must be auto, full, or only");
      if (!Array.isArray(routing.scope_request?.requested_specialists)) errors.push("routing plan scope_request.requested_specialists must be an array");
      if (typeof routing.scope_request?.basis !== "string" || !routing.scope_request.basis.trim()) errors.push("routing plan scope_request.basis is required");
      if (mode === "only" && (!Array.isArray(routing.scope_request?.requested_specialists) || !routing.scope_request.requested_specialists.length)) errors.push("only mode requires at least one requested specialist");
      if (data.scope?.request_mode !== mode) errors.push("assessment scope.request_mode must match routing scope_request.mode");
      const known = new Set(["ues-baseline-gate", "ease-of-use-suite-47", "usability-suite-47", "consistency-suite-22", "task-experience-score", "page-performance-score", "virtual-user-walkthrough", "evaluate-visual-quality-v0-9"]);
      const requested = routing.scope_request?.requested_specialists ?? [];
      if (new Set(requested).size !== requested.length) errors.push("routing plan requested_specialists must not contain duplicates");
      for (const name of requested) if (!known.has(name)) errors.push(`routing plan requested unknown specialist: ${name}`);
      if (mode === "only" && Array.isArray(routing.specialists)) {
        const requestedSet = new Set(requested);
        for (const route of routing.specialists) {
          if (requestedSet.has(route?.name) && route.result_status === "not_selected") errors.push(`${route.name}: requested specialist cannot be not_selected in only mode`);
          if (!requestedSet.has(route?.name) && route.result_status !== "not_selected") errors.push(`${route.name}: unrequested specialist must be not_selected in only mode`);
        }
      }
    }
    if (routing.run_id !== data.run_id) errors.push("routing plan run_id must match assessment run_id");
    if (!Number.isInteger(routing.version) || routing.version < 1) errors.push("routing plan version must be a positive integer");
    if (!Array.isArray(routing.specialists)) errors.push("routing plan specialists must be an array");
    else {
      const routeByName = new Map(routing.specialists.map(item => [item?.name, item]));
      if (routeByName.size !== routing.specialists.length) errors.push("routing plan specialists must not contain duplicate names");
      for (const specialist of data.specialists ?? []) {
        const route = routeByName.get(specialist.name);
        if (!route) errors.push(`${specialist.name}: missing routing plan entry`);
        else if (route.result_status !== specialist.status) errors.push(`${specialist.name}: assessment status must match routing result_status`);
      }
    }
  }
  if (runState && evidenceIndex) {
    if (path.resolve(baseDir, data.evidence_index_path) !== path.resolve(path.dirname(path.resolve(baseDir, data.run_state_path)), runState.evidence_index?.path ?? "")) {
      errors.push("assessment and run-state must reference the same evidence index");
    }
    const stateByName = new Map((runState.specialists ?? []).map(item => [item.name, item]));
    for (const specialist of data.specialists ?? []) {
      const state = stateByName.get(specialist.name);
      if (!state) errors.push(`${specialist.name}: missing run-state specialist entry`);
      else if (state.result_status !== specialist.status) errors.push(`${specialist.name}: assessment status must match run-state result_status`);
    }
    const evidenceIds = new Set((evidenceIndex.evidence ?? []).map(item => item.id));
    for (const issue of data.issues ?? []) {
      if (!Array.isArray(issue?.evidence_refs) || !issue.evidence_refs.length) errors.push(`${issue?.issue_id ?? "issue"}: nonempty evidence_refs is required in suite 0.4`);
      for (const ref of issue?.evidence_refs ?? []) {
        if (!evidenceIds.has(ref)) errors.push(`${issue.issue_id ?? "issue"}: evidence_ref ${ref} is not registered in the shared evidence index`);
      }
    }
  }
  if (runState && diagnosis) {
    if (path.resolve(baseDir, data.diagnosis_path) !== path.resolve(path.dirname(path.resolve(baseDir, data.run_state_path)), runState.diagnosis?.artifact_path ?? "")) {
      errors.push("assessment and run-state must reference the same diagnosis");
    }
    const issueIds = new Set((data.issues ?? []).map(issue => issue?.issue_id));
    const candidateIds = new Set((diagnosis.candidates ?? []).map(candidate => candidate.id));
    for (const issue of data.issues ?? []) {
      if (issue.diagnosis_refs !== undefined) {
        if (!Array.isArray(issue.diagnosis_refs)) errors.push(`${issue.issue_id ?? "issue"}: diagnosis_refs must be an array`);
        for (const ref of issue.diagnosis_refs ?? []) if (!candidateIds.has(ref)) errors.push(`${issue.issue_id ?? "issue"}: unknown diagnosis_ref ${ref}`);
      }
    }
    for (const candidate of diagnosis.candidates ?? []) {
      if (candidate.conclusion?.status !== "confirmed") continue;
      for (const outputId of candidate.conclusion.linked_output_ids ?? []) {
        if (!issueIds.has(outputId)) errors.push(`${candidate.id}: confirmed linked output ${outputId} is missing from assessment issues`);
      }
    }
  }
}

if (data.schema_version === "ues-expert-suite/0.6") {
  errors.push(...validateVisualQualityIntegration(data, path.resolve(file), { checkLocal: true }).map(error => `visual_quality: ${error}`));
}

const performance = (data.specialists ?? []).find(item => item?.name === "page-performance-score");
if (performance) {
  const performanceFile = (performance.artifact_paths ?? []).find(item => path.basename(item) === "performance-capture.json");
  if (performanceFile) {
    const resolved = path.resolve(path.dirname(path.resolve(file)), performanceFile);
    if (!fs.existsSync(resolved)) {
      errors.push(`page-performance-score artifact does not exist: ${performanceFile}`);
    } else {
      try {
        const capture = JSON.parse(fs.readFileSync(resolved, "utf8"));
        if (typeof performance.score === "number") {
          if (performance.status !== "executed") errors.push("numeric performance score requires specialist status executed");
          if (capture.status !== "measured") errors.push("numeric performance score requires measured performance-capture.json");
          if (capture.result?.score !== performance.score) errors.push("performance specialist score must match performance-capture.json result.score");
        } else if (capture.status === "measured") {
          errors.push("measured performance-capture.json requires a numeric performance specialist score");
        }
      } catch (error) {
        errors.push(`invalid performance capture artifact: ${error.message}`);
      }
    }
  } else if (typeof performance.score === "number") {
    errors.push("numeric performance score requires performance-capture.json in artifact_paths");
  }
  if (typeof performance.score !== "number" && data.ues_score?.status === "calculated") {
    errors.push("calculated UES score requires a numeric performance score");
  }
}

if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("UES suite assessment is valid.");
