#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const statuses = new Set(["confirmed", "rejected", "pending", "blocked"]);
const confidences = new Set(["high", "medium", "low"]);
const text = value => typeof value === "string" && value.trim().length > 0;
const strings = value => Array.isArray(value) && value.every(text);

export function validateDiagnosis(data) {
  const errors = [];
  const need = (condition, message) => { if (!condition) errors.push(message); };
  need(data?.schema_version === "ues-diagnosis/0.1", "schema_version must be ues-diagnosis/0.1");
  need(text(data?.run_id), "run_id is required");
  need(Number.isInteger(data?.version) && data.version > 0, "version must be a positive integer");
  need(text(data?.input_snapshot_id), "input_snapshot_id is required");
  need(Number.isInteger(data?.evidence_index_version) && data.evidence_index_version > 0, "evidence_index_version must be a positive integer");

  need(Array.isArray(data?.scenarios) && data.scenarios.length > 0, "scenarios must be a non-empty array");
  const scenarioIds = new Set();
  for (const [index, scenario] of (data?.scenarios ?? []).entries()) {
    const where = `scenarios[${index}]`;
    need(text(scenario?.id), `${where}.id is required`);
    if (text(scenario?.id)) {
      need(!scenarioIds.has(scenario.id), `${where}.id duplicates ${scenario.id}`);
      scenarioIds.add(scenario.id);
    }
    for (const key of ["goal", "decision", "success_outcome", "basis"]) need(text(scenario?.[key]), `${where}.${key} is required`);
    need(strings(scenario?.required_information) && scenario.required_information.length > 0, `${where}.required_information must be non-empty`);
    need(strings(scenario?.assumptions), `${where}.assumptions must be a string array`);
  }

  need(Array.isArray(data?.candidates), "candidates must be an array");
  const candidateIds = new Set();
  for (const [index, candidate] of (data?.candidates ?? []).entries()) {
    const where = `candidates[${index}]`;
    need(text(candidate?.id), `${where}.id is required`);
    if (text(candidate?.id)) {
      need(!candidateIds.has(candidate.id), `${where}.id duplicates ${candidate.id}`);
      candidateIds.add(candidate.id);
    }
    need(strings(candidate?.scenario_ids) && candidate.scenario_ids.length > 0, `${where}.scenario_ids must be non-empty`);
    for (const id of candidate?.scenario_ids ?? []) need(scenarioIds.has(id), `${where}.scenario_ids references unknown ${id}`);
    for (const key of ["observation", "hypothesis", "potential_consequence"]) need(text(candidate?.[key]), `${where}.${key} is required`);
    need(strings(candidate?.observation_evidence_ids), `${where}.observation_evidence_ids must be a string array`);
    const verification = candidate?.verification;
    need(verification && typeof verification === "object", `${where}.verification is required`);
    need(text(verification?.action), `${where}.verification.action is required`);
    need(text(verification?.expected_discriminator), `${where}.verification.expected_discriminator is required`);
    need(strings(verification?.evidence_ids), `${where}.verification.evidence_ids must be a string array`);
    need(statuses.has(verification?.status), `${where}.verification.status is invalid`);
    const counter = candidate?.counterevidence;
    need(counter && typeof counter === "object", `${where}.counterevidence is required`);
    need(strings(counter?.alternatives_checked), `${where}.counterevidence.alternatives_checked must be a string array`);
    need(strings(counter?.remaining_uncertainty), `${where}.counterevidence.remaining_uncertainty must be a string array`);
    const conclusion = candidate?.conclusion;
    need(conclusion && statuses.has(conclusion.status), `${where}.conclusion.status is invalid`);
    need(conclusion?.status === verification?.status, `${where} verification and conclusion status must match`);
    need(confidences.has(conclusion?.confidence), `${where}.conclusion.confidence is invalid`);
    need(text(conclusion?.summary), `${where}.conclusion.summary is required`);
    need(strings(conclusion?.linked_output_ids), `${where}.conclusion.linked_output_ids must be a string array`);
    if (conclusion?.status === "confirmed") {
      need(candidate.observation_evidence_ids?.length > 0, `${where} confirmed candidate requires observation evidence`);
      need(verification?.evidence_ids?.length > 0, `${where} confirmed candidate requires verification evidence`);
      need(counter?.alternatives_checked?.length > 0, `${where} confirmed candidate requires counterevidence checks`);
      need(conclusion?.linked_output_ids?.length > 0, `${where} confirmed candidate requires an issue or recommendation output`);
    }
    if (conclusion?.status === "rejected") need(counter?.alternatives_checked?.length > 0, `${where} rejected candidate requires a checked alternative`);
  }

  need(Array.isArray(data?.stage_metrics), "stage_metrics must be an array");
  const stages = new Set();
  for (const [index, metric] of (data?.stage_metrics ?? []).entries()) {
    const where = `stage_metrics[${index}]`;
    need(text(metric?.stage), `${where}.stage is required`);
    if (text(metric?.stage)) {
      need(!stages.has(metric.stage), `${where}.stage duplicates ${metric.stage}`);
      stages.add(metric.stage);
    }
    need(Number.isFinite(metric?.active_ms) && metric.active_ms >= 0, `${where}.active_ms must be non-negative`);
    need(Number.isFinite(metric?.wait_ms) && metric.wait_ms >= 0, `${where}.wait_ms must be non-negative`);
  }
  return errors;
}

const current = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (current === import.meta.url) {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3) {
    console.error("Usage: node validate_diagnosis.mjs /absolute/path/diagnosis.json");
    process.exitCode = 2;
  } else {
    try {
      const data = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
      const errors = validateDiagnosis(data);
      if (errors.length) {
        for (const error of errors) console.error(`- ${error}`);
        process.exitCode = 1;
      } else {
        console.log("UES diagnosis is valid.");
      }
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
