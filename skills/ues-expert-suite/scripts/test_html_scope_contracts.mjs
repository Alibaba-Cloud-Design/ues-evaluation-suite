#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const validator = path.join(scriptDir, "validate_html_report.mjs");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ues-html-scope-"));
const assessmentPath = path.join(tempDir, "assessment.json");
const diagnosisPath = path.join(tempDir, "diagnosis.json");
const htmlPath = path.join(tempDir, "report.html");
const write = (file, value) => fs.writeFileSync(file, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
const run = () => spawnSync(process.execPath, [validator, htmlPath, assessmentPath, diagnosisPath], { encoding: "utf8" });

try {
  write(assessmentPath, {
    specialists: [
      { name: "evaluate-visual-quality-v0-9", status: "executed", score: null },
      { name: "ease-of-use-suite-47", status: "not_selected", score: null }
    ],
    issues: []
  });
  write(diagnosisPath, { candidates: [] });
  const validHtml = `<!doctype html><html><body><main class="ues-shell ues-banner-art"><nav role="tablist"><button>总览</button><button>整改优先级 · 0</button><button>范围与方法</button></nav><section id="overview"><p>本次仅执行视觉质量检测。</p><a href="#visual-quality-method">查看范围与方法</a></section><section id="issues"><div data-ues-confirmed-issues></div></section><section id="method"><details id="visual-quality-method" data-ues-visual-quality><summary>视觉质量检测</summary><p>证据边界</p><details><summary>开放发现追溯</summary><p>finding lineage</p></details></details></section><footer>fixture</footer></main></body></html>`;
  write(htmlPath, validHtml);
  const valid = run();
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);

  write(htmlPath, validHtml.replace('<section id="overview">', '<section id="overview"><div data-ues-visual-quality>wrong placement</div>'));
  const invalid = run();
  assert.notEqual(invalid.status, 0, "visual quality specialist content on the overview must fail validation");

  write(assessmentPath, {
    specialists: [
      { name: "evaluate-visual-quality-v0-9", status: "not_selected", score: null },
      { name: "ease-of-use-suite-47", status: "not_selected", score: null }
    ],
    issues: []
  });
  const nonVisualHtml = `<!doctype html><html><body><main class="ues-shell ues-banner-art"><nav role="tablist"><button>总览</button><button>整改优先级 · 0</button><button>范围与方法</button></nav><section id="overview"><p>本次未启用视觉质量检测。</p></section><section id="issues"><div data-ues-confirmed-issues></div></section><section id="method"><p>常规评估范围与方法。</p></section><footer>fixture</footer></main></body></html>`;
  write(htmlPath, nonVisualHtml);
  const nonVisual = run();
  assert.equal(nonVisual.status, 0, nonVisual.stderr || nonVisual.stdout);

  write(htmlPath, nonVisualHtml.replace('<section id="method">', '<section id="method"><div data-ues-visual-quality>must be absent</div>'));
  const inactiveVisualBlock = run();
  assert.notEqual(inactiveVisualBlock.status, 0, "inactive visual quality block must be rejected");

  console.log("UES HTML scope tests passed (visual opt-in, non-visual omission, three tabs, method placement). ");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
