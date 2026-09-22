#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kinds = new Set(["screenshot", "dom", "interaction", "log", "content", "design_source", "filmstrip", "metric", "other"]);
const origins = new Set(["captured", "supplied", "generated_annotation", "illustrative"]);
const sensitivities = new Set(["public", "internal", "confidential", "restricted", "unknown"]);
const subjectKeys = ["page_ids", "state_ids", "task_ids", "run_ids"];
const shaPattern = /^[a-f0-9]{64}$/;
const text = value => typeof value === "string" && value.trim().length > 0;
const iso = value => text(value) && !Number.isNaN(Date.parse(value));
const strings = value => Array.isArray(value) && value.every(text);
const remote = value => /^https?:\/\//i.test(value);
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

export function validateEvidenceIndex(data, baseDir, { checkLocal = false } = {}) {
  const errors = [];
  const need = (condition, message) => { if (!condition) errors.push(message); };
  need(data?.schema_version === "ues-evidence-index/0.1", "schema_version must be ues-evidence-index/0.1");
  need(text(data?.run_id), "run_id is required");
  need(Number.isInteger(data?.version) && data.version > 0, "version must be a positive integer");
  need(iso(data?.generated_at), "generated_at must be an ISO-8601 date-time string");
  need(text(data?.input_snapshot_id), "input_snapshot_id is required");
  need(Array.isArray(data?.evidence), "evidence must be an array");

  const entries = Array.isArray(data?.evidence) ? data.evidence : [];
  const ids = new Set();
  for (const [index, item] of entries.entries()) {
    const where = `evidence[${index}]`;
    need(item && typeof item === "object" && !Array.isArray(item), `${where} must be an object`);
    if (!item || typeof item !== "object") continue;
    need(text(item.id), `${where}.id is required`);
    if (text(item.id)) {
      need(!ids.has(item.id), `${where}.id duplicates ${item.id}`);
      ids.add(item.id);
    }
    need(kinds.has(item.kind), `${where}.kind is invalid`);
    need(origins.has(item.origin), `${where}.origin is invalid`);
    need(text(item.ref), `${where}.ref is required`);
    need(iso(item.recorded_at), `${where}.recorded_at must be an ISO-8601 date-time string`);
    need(item.subjects && typeof item.subjects === "object" && !Array.isArray(item.subjects), `${where}.subjects is required`);
    for (const key of subjectKeys) need(strings(item.subjects?.[key]), `${where}.subjects.${key} must be a string array`);
    need(text(item.locator), `${where}.locator is required`);
    need(text(item.observable_fact), `${where}.observable_fact is required`);
    need(text(item.authorization_scope), `${where}.authorization_scope is required`);
    need(sensitivities.has(item.sensitivity), `${where}.sensitivity is invalid`);
    need(item.derivative_of === null || text(item.derivative_of), `${where}.derivative_of must be null or an evidence ID`);
    need(item.supersedes === null || text(item.supersedes), `${where}.supersedes must be null or an evidence ID`);
    if (item.origin === "generated_annotation") need(text(item.derivative_of), `${where}: generated_annotation requires derivative_of`);
    if (item.sha256 !== undefined) need(shaPattern.test(item.sha256), `${where}.sha256 must be 64 lowercase hex characters`);
  }

  for (const [index, item] of entries.entries()) {
    const where = `evidence[${index}]`;
    for (const key of ["derivative_of", "supersedes"]) {
      if (text(item?.[key])) {
        need(item[key] !== item.id, `${where}.${key} cannot reference itself`);
        need(ids.has(item[key]), `${where}.${key} references unknown evidence ${item[key]}`);
      }
    }
    if (checkLocal && text(item?.ref) && !remote(item.ref)) {
      const resolved = path.resolve(baseDir, item.ref);
      need(fs.existsSync(resolved), `${where}.ref does not exist: ${item.ref}`);
      if (fs.existsSync(resolved) && item.sha256 && shaPattern.test(item.sha256)) {
        need(sha256(resolved) === item.sha256, `${where}.sha256 does not match ${item.ref}`);
      }
    }
  }
  return errors;
}

function parseArgs(argv) {
  const args = [...argv];
  const file = args.shift();
  const checkLocal = args.includes("--check-local");
  const unexpected = args.filter(value => value !== "--check-local");
  if (!file || unexpected.length) throw new Error("Usage: node validate_evidence_index.mjs <evidence-index.json> [--check-local]");
  return { file: path.resolve(file), checkLocal };
}

const current = process.argv[1] ? pathToFileURL(fs.realpathSync(process.argv[1])).href : null;
if (current === import.meta.url) {
  try {
    const { file, checkLocal } = parseArgs(process.argv.slice(2));
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const errors = validateEvidenceIndex(data, path.dirname(file), { checkLocal });
    if (errors.length) {
      for (const error of errors) console.error(`- ${error}`);
      process.exitCode = 1;
    } else {
      console.log("UES evidence index is valid.");
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
