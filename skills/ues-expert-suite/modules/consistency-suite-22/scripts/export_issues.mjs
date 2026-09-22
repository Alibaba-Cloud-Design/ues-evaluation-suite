#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const input = argv[2];
  if (!input || input === "--help" || input === "-h") {
    console.log("Usage: node scripts/export_issues.mjs assessment.json --out issue-export");
    process.exit(input ? 0 : 1);
  }
  const outIndex = argv.indexOf("--out");
  if (outIndex < 0 || !argv[outIndex + 1]) fail("Missing --out <directory>");
  return { input, outDir: argv[outIndex + 1] };
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean).join("; ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).replace(/\r?\n/g, " ").trim();
}

function csvCell(value) {
  const text = cleanText(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function issueCriterion(issue) {
  return issue.primary_criterion ?? issue.criterion ?? "";
}

function evidenceRefs(issue) {
  const evidence = issue.evidence_items ?? issue.evidence ?? [];
  if (!Array.isArray(evidence)) return cleanText(evidence);
  return evidence.map((item) => item.path_or_ref ?? item.path ?? item.id ?? item.type).filter(Boolean);
}

function issueMarkdown(issue, assessmentName) {
  const evidence = Array.isArray(issue.evidence_items ?? issue.evidence)
    ? issue.evidence_items ?? issue.evidence
    : [];
  const linked = issue.linked_criteria ?? (issue.linked_flow_criterion ? [issue.linked_flow_criterion] : []);
  const lines = [
    `# ${issue.id} · ${issue.title}`,
    "",
    `- 评测：${assessmentName || ""}`,
    `- 严重度：${issue.severity || ""}`,
    `- 主准则：${issueCriterion(issue)}`,
    `- 关联准则：${cleanText(linked) || "无"}`,
    `- 缺陷量级：${issue.defect_level ?? ""}`,
    `- 置信度：${issue.confidence || ""}`,
    "",
    "## 基准与实际",
    "",
    `- 基准：${cleanText(issue.baseline) || issue.baseline_source || ""}`,
    `- 实际：${issue.actual || issue.evidence || ""}`,
    "",
    "## 用户影响",
    "",
    issue.impact || "",
    "",
    "## 修改建议",
    "",
    issue.recommendation || "",
    "",
    "## 证据",
    "",
  ];

  if (evidence.length === 0) {
    lines.push(issue.evidence_unavailable_reason || "当前问题未附结构化证据项。", "");
  } else {
    for (const item of evidence) {
      lines.push(
        `### ${item.id || item.type || "证据"}`,
        "",
        `- 类型：${item.type || ""}`,
        `- 页面／状态：${item.unit_id || item.state || ""}`,
        `- 视口：${cleanText(item.viewport)}`,
        `- 文件：${item.path_or_ref || item.path || ""}`,
        `- Selector：${item.selector || ""}`,
        `- 坐标：${cleanText(item.bounding_rect)}`,
        "",
        item.excerpt ? "```text" : "",
        item.excerpt || "",
        item.excerpt ? "```" : "",
        "",
      );
    }
  }
  return `${lines.join("\n").trim()}\n`;
}

const { input, outDir } = parseArgs(process.argv);
let assessment;
try {
  assessment = JSON.parse(fs.readFileSync(input, "utf8"));
} catch (error) {
  fail(`Cannot read assessment JSON: ${error.message}`);
}

if (!Array.isArray(assessment.issues)) fail("assessment.issues must be an array");

const ids = new Set();
for (const issue of assessment.issues) {
  if (!issue || typeof issue !== "object" || !issue.id) fail("Every issue requires an id");
  if (ids.has(issue.id)) fail(`Duplicate issue id: ${issue.id}`);
  ids.add(issue.id);
}

fs.mkdirSync(path.join(outDir, "issues"), { recursive: true });
fs.mkdirSync(path.join(outDir, "evidence"), { recursive: true });

const normalized = assessment.issues.map((issue) => ({
  ...issue,
  primary_criterion: issueCriterion(issue),
  linked_criteria: issue.linked_criteria ?? (issue.linked_flow_criterion ? [issue.linked_flow_criterion] : []),
  evidence_items: Array.isArray(issue.evidence_items) ? issue.evidence_items : [],
}));

fs.writeFileSync(path.join(outDir, "issues.json"), `${JSON.stringify(normalized, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, "issues.ndjson"), `${normalized.map((issue) => JSON.stringify(issue)).join("\n")}\n`);

const columns = [
  "id", "title", "severity", "primary_criterion", "linked_criteria", "defect_level", "confidence",
  "page_or_state", "viewport", "baseline_source", "actual", "impact", "recommendation", "evidence_refs",
];
const rows = normalized.map((issue) => {
  const evidence = issue.evidence_items;
  return {
    id: issue.id,
    title: issue.title,
    severity: issue.severity,
    primary_criterion: issue.primary_criterion,
    linked_criteria: issue.linked_criteria,
    defect_level: issue.defect_level,
    confidence: issue.confidence,
    page_or_state: evidence.map((item) => item.unit_id ?? item.state).filter(Boolean),
    viewport: evidence.map((item) => cleanText(item.viewport)).filter(Boolean),
    baseline_source: issue.baseline_source ?? issue.baseline,
    actual: issue.actual ?? issue.evidence,
    impact: issue.impact,
    recommendation: issue.recommendation,
    evidence_refs: evidenceRefs(issue),
  };
});
const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n");
fs.writeFileSync(path.join(outDir, "issues.csv"), `${csv}\n`);

for (const issue of normalized) {
  fs.writeFileSync(
    path.join(outDir, "issues", `${issue.id}.md`),
    issueMarkdown(issue, assessment.assessment_name),
  );
}

console.log(JSON.stringify({
  issue_count: normalized.length,
  output: path.resolve(outDir),
  files: ["issues.json", "issues.csv", "issues.ndjson", ...normalized.map((issue) => `issues/${issue.id}.md`)],
}, null, 2));
