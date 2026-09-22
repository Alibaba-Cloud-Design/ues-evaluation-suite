#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveScope, specialists, standardSpecialists, visualSpecialist } from "./resolve_scope.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const skillFiles = walk(skillRoot).filter((file) => path.basename(file).toLowerCase() === "skill.md");
assert.deepEqual(skillFiles, [path.join(skillRoot, "SKILL.md")], "package must contain exactly one SKILL.md");

for (const name of specialists) {
  assert.ok(fs.existsSync(path.join(skillRoot, "modules", name, "MODULE.md")), `missing module: ${name}`);
}

assert.equal(resolveScope({}).mode, "full");
assert.deepEqual(resolveScope({}).routed_specialists, standardSpecialists);
assert.deepEqual(resolveScope({}).not_selected_specialists, [visualSpecialist]);
assert.equal(resolveScope({}).include_visual, false);
assert.deepEqual(resolveScope({ include_visual: true }).routed_specialists, specialists);
assert.equal(resolveScope({ include_visual: true }).include_visual, true);
assert.equal(resolveScope({ explicit_scope: "auto" }).mode, "auto");
assert.deepEqual(resolveScope({ explicit_scope: "auto" }).routed_specialists, standardSpecialists);
assert.deepEqual(resolveScope({ explicit_scope: "auto", include_visual: true }).routed_specialists, specialists);
assert.deepEqual(
  resolveScope({ explicit_scope: "only", requested_specialists: ["ease-of-use-suite-47"] }).routed_specialists,
  ["ease-of-use-suite-47"],
);
assert.deepEqual(
  resolveScope({ explicit_scope: "only", requested_specialists: [visualSpecialist] }).routed_specialists,
  [visualSpecialist],
);
assert.throws(() => resolveScope({ explicit_scope: "only", requested_specialists: [] }));
assert.throws(() => resolveScope({ requested_specialists: ["ease-of-use-suite-47"] }));

console.log("UES single-package contracts passed (one SKILL.md, seven modules, default six, visual opt-in, explicit subset). ");
