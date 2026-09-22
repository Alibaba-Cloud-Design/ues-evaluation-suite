#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const standardSpecialists = [
  "ues-baseline-gate",
  "ease-of-use-suite-47",
  "consistency-suite-22",
  "task-experience-score",
  "page-performance-score",
  "virtual-user-walkthrough",
];
export const visualSpecialist = "evaluate-visual-quality-v0-9";
export const specialists = [...standardSpecialists, visualSpecialist];

export function resolveScope(input = {}) {
  const explicitScope = input.explicit_scope ?? "unspecified";
  const requested = [...new Set(input.requested_specialists ?? [])];
  const includeVisual = input.include_visual === true || requested.includes(visualSpecialist);
  const unknown = requested.filter((name) => !specialists.includes(name));

  if (unknown.length) {
    throw new Error(`Unknown specialists: ${unknown.join(", ")}`);
  }
  if (!new Set(["unspecified", "full", "auto", "only"]).has(explicitScope)) {
    throw new Error(`Invalid explicit_scope: ${explicitScope}`);
  }
  if (explicitScope === "only" && requested.length === 0) {
    throw new Error("explicit_scope=only requires requested_specialists");
  }
  if (explicitScope !== "only" && requested.length > 0) {
    throw new Error("requested_specialists requires explicit_scope=only");
  }

  const mode = explicitScope === "unspecified" ? "full" : explicitScope;
  const routed =
    mode === "only"
      ? requested
      : includeVisual
        ? specialists
        : standardSpecialists;
  return {
    mode,
    requested_specialists: mode === "only" ? requested : [],
    include_visual: includeVisual,
    routed_specialists: routed,
    not_selected_specialists: includeVisual ? [] : [visualSpecialist],
    basis:
      mode === "full"
        ? explicitScope === "unspecified"
          ? includeVisual
            ? "未限定其他专项且明确要求视觉，按六项常规度量加视觉质量"
            : "未明确限定专项，按默认六项常规全量度量；视觉质量未被明确要求"
          : includeVisual
            ? "用户明确要求完整评估并包含视觉质量"
            : "用户明确要求完整评估，但未明确要求视觉质量"
        : mode === "auto"
          ? includeVisual
            ? "用户明确要求按材料自适应选择专项并包含视觉质量"
            : "用户明确要求按材料自适应选择专项；视觉质量未被明确要求"
          : "用户明确限定专项范围",
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/resolve_scope.mjs /absolute/path/to/scope-input.json");
    process.exit(2);
  }
  try {
    const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
    process.stdout.write(`${JSON.stringify(resolveScope(input), null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
