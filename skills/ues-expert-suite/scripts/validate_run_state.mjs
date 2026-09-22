#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateEvidenceIndex } from "./validate_evidence_index.mjs";
import { validateDiagnosis } from "./validate_diagnosis.mjs";

const executionStatuses = new Set(["pending", "waiting_confirmation", "ready", "running", "blocked", "completed", "validated", "stale", "failed"]);
const resultStatuses = new Set(["executed", "limited", "deferred", "not_applicable", "unavailable", "not_selected"]);
const validationStatuses = new Set(["not_run", "not_required", "valid", "invalid"]);
const confirmationStatuses = new Set(["not_required", "pending", "confirmed"]);
const reportStatuses = new Set(["not_started", "draft", "stale", "current", "failed"]);
const diagnosisStatuses = new Set(["draft", "validated", "stale", "failed"]);
const requiredSpecialists = ["ues-baseline-gate", "consistency-suite-22", "task-experience-score", "page-performance-score", "virtual-user-walkthrough"];
const text = value => typeof value === "string" && value.trim().length > 0;
const iso = value => text(value) && !Number.isNaN(Date.parse(value));
const strings = value => Array.isArray(value) && value.every(text);
const shaPattern = /^[a-f0-9]{64}$/;
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function dependencyMismatches(item, data) {
  const deps = item?.depends_on;
  if (!deps || typeof deps !== "object") return ["missing depends_on"];
  const mismatches = [];
  if (deps.input_snapshot_id !== data.input_snapshot?.id) mismatches.push("input_snapshot_id");
  if (deps.profile_version !== data.profile?.version) mismatches.push("profile_version");
  if (deps.routing_version !== data.routing?.version) mismatches.push("routing_version");
  if (deps.evidence_index_version !== data.evidence_index?.version) mismatches.push("evidence_index_version");
  if (Object.hasOwn(deps, "diagnosis_version") && deps.diagnosis_version !== data.diagnosis?.version) mismatches.push("diagnosis_version");
  const task = data.confirmations?.task_contract;
  if (Object.hasOwn(deps, "task_contract_version") && deps.task_contract_version !== task?.version) mismatches.push("task_contract_version");
  return mismatches;
}

export function validateRunState(data, baseDir, { checkLocal = true } = {}) {
  const errors = [];
  const need = (condition, message) => { if (!condition) errors.push(message); };
  const schemaVersions = new Set(["ues-run-state/0.1", "ues-run-state/0.2", "ues-run-state/0.3"]);
  need(schemaVersions.has(data?.schema_version), "schema_version must be ues-run-state/0.1, ues-run-state/0.2, or ues-run-state/0.3");
  const hasDiagnosis = ["ues-run-state/0.2", "ues-run-state/0.3"].includes(data?.schema_version);
  const isV3 = data?.schema_version === "ues-run-state/0.3";
  need(text(data?.run_id), "run_id is required");
  need(iso(data?.created_at), "created_at must be an ISO-8601 date-time string");
  need(iso(data?.updated_at), "updated_at must be an ISO-8601 date-time string");
  if (iso(data?.created_at) && iso(data?.updated_at)) need(Date.parse(data.updated_at) >= Date.parse(data.created_at), "updated_at cannot precede created_at");

  need(data?.input_snapshot && typeof data.input_snapshot === "object", "input_snapshot is required");
  need(text(data?.input_snapshot?.id), "input_snapshot.id is required");
  need(Number.isInteger(data?.input_snapshot?.version) && data.input_snapshot.version > 0, "input_snapshot.version must be a positive integer");
  need(strings(data?.input_snapshot?.artifacts), "input_snapshot.artifacts must be a string array");
  need(data?.profile && Number.isInteger(data.profile.version) && data.profile.version > 0, "profile.version must be a positive integer");
  need(["draft", "frozen"].includes(data?.profile?.status), "profile.status must be draft or frozen");
  need(text(data?.profile?.artifact_path), "profile.artifact_path is required");

  need(data?.confirmations && typeof data.confirmations === "object", "confirmations is required");
  for (const key of ["paradigm", "task_contract"]) {
    const gate = data?.confirmations?.[key];
    need(gate && confirmationStatuses.has(gate.status), `confirmations.${key}.status is invalid`);
    need(text(gate?.basis), `confirmations.${key}.basis is required`);
    if (gate?.status === "confirmed") {
      need(Number.isInteger(gate.version) && gate.version > 0, `confirmations.${key}.version must be positive when confirmed`);
      need(text(gate.artifact_path), `confirmations.${key}.artifact_path is required when confirmed`);
    } else {
      need(gate?.version === null, `confirmations.${key}.version must be null unless confirmed`);
      need(gate?.artifact_path === null, `confirmations.${key}.artifact_path must be null unless confirmed`);
    }
  }

  need(data?.routing && Number.isInteger(data.routing.version) && data.routing.version > 0, "routing.version must be a positive integer");
  need(["draft", "frozen"].includes(data?.routing?.status), "routing.status must be draft or frozen");
  need(text(data?.routing?.artifact_path), "routing.artifact_path is required");
  need(data?.evidence_index && Number.isInteger(data.evidence_index.version) && data.evidence_index.version > 0, "evidence_index.version must be a positive integer");
  need(text(data?.evidence_index?.path), "evidence_index.path is required");
  need(shaPattern.test(data?.evidence_index?.sha256 ?? ""), "evidence_index.sha256 must be 64 lowercase hex characters");

  let evidenceData = null;
  if (text(data?.evidence_index?.path)) {
    const evidencePath = path.resolve(baseDir, data.evidence_index.path);
    if (!fs.existsSync(evidencePath)) {
      errors.push(`evidence index does not exist: ${data.evidence_index.path}`);
    } else {
      try {
        evidenceData = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
        errors.push(...validateEvidenceIndex(evidenceData, path.dirname(evidencePath), { checkLocal }).map(error => `evidence_index: ${error}`));
        need(sha256(evidencePath) === data.evidence_index.sha256, "evidence_index.sha256 does not match the evidence index file");
        need(evidenceData.run_id === data.run_id, "evidence index run_id must match run-state run_id");
        need(evidenceData.version === data.evidence_index.version, "evidence index version must match run-state evidence_index.version");
        need(evidenceData.input_snapshot_id === data.input_snapshot?.id, "evidence index input_snapshot_id must match run-state input snapshot");
      } catch (error) {
        errors.push(`invalid evidence index: ${error.message}`);
      }
    }
  }

  if (hasDiagnosis) {
    need(data?.diagnosis && typeof data.diagnosis === "object", "diagnosis is required for ues-run-state/0.2 and ues-run-state/0.3");
    need(Number.isInteger(data?.diagnosis?.version) && data.diagnosis.version > 0, "diagnosis.version must be a positive integer");
    need(diagnosisStatuses.has(data?.diagnosis?.status), "diagnosis.status is invalid");
    need(text(data?.diagnosis?.artifact_path), "diagnosis.artifact_path is required");
    if (text(data?.diagnosis?.artifact_path)) {
      const diagnosisPath = path.resolve(baseDir, data.diagnosis.artifact_path);
      if (!fs.existsSync(diagnosisPath)) {
        errors.push(`diagnosis does not exist: ${data.diagnosis.artifact_path}`);
      } else {
        try {
          const diagnosisData = JSON.parse(fs.readFileSync(diagnosisPath, "utf8"));
          errors.push(...validateDiagnosis(diagnosisData).map(error => `diagnosis: ${error}`));
          need(diagnosisData.run_id === data.run_id, "diagnosis run_id must match run-state run_id");
          need(diagnosisData.version === data.diagnosis.version, "diagnosis version must match run-state diagnosis.version");
          need(diagnosisData.input_snapshot_id === data.input_snapshot?.id, "diagnosis input_snapshot_id must match run-state input snapshot");
          need(diagnosisData.evidence_index_version === data.evidence_index?.version, "diagnosis evidence_index_version must match run-state evidence index");
        } catch (error) {
          errors.push(`invalid diagnosis: ${error.message}`);
        }
      }
    }
  }

  need(Array.isArray(data?.specialists), "specialists must be an array");
  const specialists = Array.isArray(data?.specialists) ? data.specialists : [];
  const names = new Set();
  for (const [index, item] of specialists.entries()) {
    const where = `specialists[${index}]`;
    need(text(item?.name), `${where}.name is required`);
    if (text(item?.name)) {
      need(!names.has(item.name), `${where}.name duplicates ${item.name}`);
      names.add(item.name);
    }
    need(executionStatuses.has(item?.execution_status), `${where}.execution_status is invalid`);
    need(item?.result_status === null || resultStatuses.has(item.result_status), `${where}.result_status is invalid`);
    need(strings(item?.artifact_paths), `${where}.artifact_paths must be a string array`);
    need(item?.validation && validationStatuses.has(item.validation.status), `${where}.validation.status is invalid`);
    need(item?.validation?.artifact_path === null || text(item?.validation?.artifact_path), `${where}.validation.artifact_path must be null or a path`);
    need(strings(item?.stale_reasons), `${where}.stale_reasons must be a string array`);
    const mismatches = dependencyMismatches(item, data);
    if (["ready", "running", "completed", "validated", "stale"].includes(item?.execution_status)) {
      need(item?.depends_on && typeof item.depends_on === "object", `${where}.depends_on is required for active or completed work`);
    }
    if (mismatches.length && item?.depends_on && item.execution_status !== "stale") errors.push(`${where} has stale dependencies (${mismatches.join(", ")}) but is not stale`);
    if (item?.execution_status === "stale") need(item.stale_reasons?.length > 0, `${where}.stale_reasons is required when stale`);
    if (item?.execution_status === "validated") {
      if (["executed", "limited"].includes(item.result_status)) need(item.artifact_paths?.length > 0, `${where} executed/limited validated result requires artifacts`);
      need(["valid", "not_required"].includes(item.validation?.status), `${where} validated result requires valid or not_required validation`);
      need(!mismatches.length, `${where} cannot be validated with stale dependencies`);
    }
    if (["completed", "validated"].includes(item?.execution_status)) need(item.result_status !== null, `${where}.result_status is required after completion`);
    if (isV3 && item?.name === "evaluate-visual-quality-v0-9" && item?.execution_status === "validated" && ["executed", "limited"].includes(item?.result_status)) {
      const basenames = new Set((item.artifact_paths ?? []).map(artifact => path.basename(artifact)));
      need(basenames.has("perception.frozen.json"), `${where} visual result requires perception.frozen.json`);
      need(basenames.has("diagnosis.frozen.json"), `${where} visual result requires diagnosis.frozen.json`);
      need(item.validation?.status === "valid", `${where} visual result requires valid integration validation`);
    }
    if (checkLocal && item?.execution_status === "validated") {
      for (const artifact of item.artifact_paths ?? []) need(fs.existsSync(path.resolve(baseDir, artifact)), `${where} artifact does not exist: ${artifact}`);
      if (item.validation?.status === "valid") {
        need(text(item.validation.artifact_path), `${where}.validation.artifact_path is required when validation is valid`);
        if (text(item.validation.artifact_path)) need(fs.existsSync(path.resolve(baseDir, item.validation.artifact_path)), `${where} validation artifact does not exist: ${item.validation.artifact_path}`);
      }
    }
  }
  if (data?.routing?.status === "frozen") {
    for (const name of requiredSpecialists) need(names.has(name), `specialists is missing ${name}`);
    need(names.has("ease-of-use-suite-47") || names.has("usability-suite-47"), "specialists is missing ease-of-use-suite-47 or legacy usability-suite-47");
    if (isV3) need(names.has("evaluate-visual-quality-v0-9"), "specialists is missing evaluate-visual-quality-v0-9");
  }

  const report = data?.report;
  need(report && reportStatuses.has(report.status), "report.status is invalid");
  need(strings(report?.artifact_paths), "report.artifact_paths must be a string array");
  need(text(report?.reason), "report.reason is required");
  if (["draft", "stale", "current"].includes(report?.status)) {
    const deps = report?.depends_on;
    need(deps && typeof deps === "object", "report.depends_on is required for draft, stale, or current report");
    if (deps) {
      need(deps.input_snapshot_id === data.input_snapshot?.id || report.status === "stale", "report input_snapshot_id is stale");
      need(deps.profile_version === data.profile?.version || report.status === "stale", "report profile_version is stale");
      need(deps.routing_version === data.routing?.version || report.status === "stale", "report routing_version is stale");
      need(deps.evidence_index_version === data.evidence_index?.version || report.status === "stale", "report evidence_index_version is stale");
      if (hasDiagnosis) need(deps.diagnosis_version === data.diagnosis?.version || report.status === "stale", "report diagnosis_version is stale");
      need(deps.specialist_validations && typeof deps.specialist_validations === "object", "report.depends_on.specialist_validations is required");
    }
  } else {
    need(report?.depends_on === null, "report.depends_on must be null when report is not_started or failed");
  }
  if (report?.status === "current") {
    need(report.artifact_paths.length > 0, "current report requires artifact_paths");
    need(fs.existsSync(path.resolve(baseDir, data.profile?.artifact_path ?? "")), `current report profile artifact does not exist: ${data.profile?.artifact_path ?? "missing"}`);
    need(fs.existsSync(path.resolve(baseDir, data.routing?.artifact_path ?? "")), `current report routing artifact does not exist: ${data.routing?.artifact_path ?? "missing"}`);
    if (hasDiagnosis) need(data.diagnosis?.status === "validated", "current report requires validated diagnosis");
    need(!specialists.some(item => ["pending", "waiting_confirmation", "ready", "running", "blocked", "stale", "failed"].includes(item.execution_status)), "current report cannot include unfinished, blocked, stale, or failed specialists");
    for (const item of specialists) {
      const expected = item.validation?.status;
      need(report.depends_on?.specialist_validations?.[item.name] === expected, `current report validation dependency mismatch for ${item.name}`);
      if (["executed", "limited"].includes(item.result_status)) {
        need(item.execution_status === "validated" && item.validation?.status === "valid", `current report requires validated ${item.name} result`);
      } else {
        need(["completed", "validated"].includes(item.execution_status), `current report requires terminal ${item.name} route state`);
      }
    }
  }
  if (checkLocal && report?.status === "current") {
    for (const artifact of report.artifact_paths) need(fs.existsSync(path.resolve(baseDir, artifact)), `current report artifact does not exist: ${artifact}`);
  }
  return errors;
}

const current = process.argv[1] ? pathToFileURL(fs.realpathSync(process.argv[1])).href : null;
if (current === import.meta.url) {
  const file = process.argv[2];
  if (!file || process.argv.length > 3) {
    console.error("Usage: node validate_run_state.mjs /absolute/path/run-state.json");
    process.exitCode = 2;
  } else {
    try {
      const resolved = path.resolve(file);
      const data = JSON.parse(fs.readFileSync(resolved, "utf8"));
      const errors = validateRunState(data, path.dirname(resolved));
      if (errors.length) {
        for (const error of errors) console.error(`- ${error}`);
        process.exitCode = 1;
      } else {
        console.log("UES run state is valid.");
      }
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
