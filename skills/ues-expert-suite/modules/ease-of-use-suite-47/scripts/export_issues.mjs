#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const [assessmentPath, outputDir] = process.argv.slice(2);
if (!assessmentPath || !outputDir) {
  console.error('Usage: node export_issues.mjs <assessment.json> <output-dir>');
  process.exit(1);
}

const assessment = JSON.parse(fs.readFileSync(assessmentPath, 'utf8'));
const issues = assessment.issues ?? [];
fs.mkdirSync(outputDir, { recursive: true });

const csvCell = (value) => {
  const text = Array.isArray(value)
    ? value.map((item) => typeof item === 'string' ? item : item.file).join('|')
    : String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
};

const markdown = (issue) => `# ${issue.id} · ${issue.title}

- 严重度：${issue.severity}
- 优先级：${issue.priority}
- 影响准则：${issue.criteria.join('、')}

## 问题证据

${issue.evidence}

## 用户影响

${issue.impact}

## 修改建议

${issue.recommendation}

## 实测截图

${(issue.screenshots ?? []).map((shot) => `- [${shot.description}](../evidence/${shot.file})`).join('\n') || '- 截图不可得；请核对问题记录中的非视觉证据。'}

采集时间：${assessment.meta?.tested_at ?? '未记录'}
`;

for (const issue of issues) {
  fs.writeFileSync(path.join(outputDir, `${issue.id}.md`), markdown(issue));
  fs.writeFileSync(path.join(outputDir, `${issue.id}.json`), `${JSON.stringify(issue, null, 2)}\n`);
}

const headers = ['id', 'severity', 'priority', 'title', 'criteria', 'evidence', 'impact', 'recommendation', 'screenshots'];
const rows = issues.map((issue) => headers.map((key) => csvCell(issue[key])).join(','));
fs.writeFileSync(path.join(outputDir, 'issues.csv'), `\uFEFF${[headers.join(','), ...rows].join('\n')}\n`);
fs.writeFileSync(path.join(outputDir, 'issues.json'), `${JSON.stringify(issues, null, 2)}\n`);

const index = ['# 问题导出', '', ...issues.map((issue) => `- [${issue.id} · ${issue.title}](./${issue.id}.md) · [JSON](./${issue.id}.json)`), '', '- [全部问题 CSV](./issues.csv)', '- [全部问题 JSON](./issues.json)', ''].join('\n');
fs.writeFileSync(path.join(outputDir, 'index.md'), index);

console.log(`Exported ${issues.length} issues to ${outputDir}`);
