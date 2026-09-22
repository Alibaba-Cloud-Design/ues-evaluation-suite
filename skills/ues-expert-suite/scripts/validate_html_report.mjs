#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const [htmlPath, assessmentPath, diagnosisPath] = process.argv.slice(2);
if (!htmlPath || !assessmentPath || !diagnosisPath) {
  console.error('Usage: validate_html_report.mjs report.html assessment.json diagnosis.json');
  process.exit(2);
}
for (const p of [htmlPath, assessmentPath, diagnosisPath]) {
  if (!fs.existsSync(p)) { console.error(`Missing file: ${p}`); process.exit(2); }
}
const html = fs.readFileSync(htmlPath, 'utf8');
const assessment = JSON.parse(fs.readFileSync(assessmentPath, 'utf8'));
const diagnosis = JSON.parse(fs.readFileSync(diagnosisPath, 'utf8'));
const errors = [];
const escaped = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const requireText = (needle, message) => { if (!html.includes(needle)) errors.push(message); };

for (const label of ['总览', `整改优先级 · ${(assessment.issues || []).length}`, '范围与方法']) requireText(label, `Missing required tab: ${label}`);
if (html.includes('data-ues-score-breakdown="overall"')) errors.push('Overall score must not include an expandable score breakdown');
const specialistByName = new Map((assessment.specialists || []).map(item => [item?.name, item]));
const breakdowns = [
  ['ease', specialistByName.get('ease-of-use-suite-47') || specialistByName.get('usability-suite-47')],
  ['task', specialistByName.get('task-experience-score')],
  ['consistency', specialistByName.get('consistency-suite-22')],
  ['performance', specialistByName.get('page-performance-score')]
];
const numericBreakdowns = breakdowns.filter(([, item]) => typeof item?.score === 'number');
for (const [id] of numericBreakdowns) requireText(`data-ues-score-breakdown="${id}"`, `Missing score breakdown: ${id}`);
if (numericBreakdowns.length) for (const phrase of ['哪里没做好','怎样影响分数','为什么最终是']) requireText(phrase, `Missing plain-language score explanation phrase: ${phrase}`);
if (/class="ues-history-empty"|首次评估[^<]{0,30}(暂无|无可比)/.test(html)) errors.push('Empty history placeholders must be omitted');
const overviewMatch = html.match(/<section id="overview"[\s\S]*?<\/section><section id="issues"/);
if (overviewMatch && /反证排除|已排除的候选/.test(overviewMatch[0])) errors.push('Rejected-candidate counts must not appear on the overview');
requireText('data-ues-confirmed-issues', 'Missing confirmed issue workspace marker');
const audits = [
  ['baseline', specialistByName.get('ues-baseline-gate')],
  ['ease', specialistByName.get('ease-of-use-suite-47') || specialistByName.get('usability-suite-47')],
  ['consistency', specialistByName.get('consistency-suite-22')],
  ['task', specialistByName.get('task-experience-score')],
  ['performance', specialistByName.get('page-performance-score')]
];
for (const [id, item] of audits) if (['executed','limited'].includes(item?.status)) requireText(`data-ues-audit="${id}"`, `Missing complete audit marker: ${id}`);
const visual = specialistByName.get('evaluate-visual-quality-v0-9');
const visualActive = ['executed','limited'].includes(visual?.status);
const methodStart = html.indexOf('<section id="method"');
const methodEnd = html.indexOf('<footer', methodStart);
const methodHtml = methodStart >= 0 && methodEnd > methodStart ? html.slice(methodStart, methodEnd) : '';
if (visualActive) {
  requireText('data-ues-visual-quality', 'Missing visual quality method block');
  if (!methodHtml.includes('data-ues-visual-quality')) errors.push('Visual quality method block must be inside #method');
  if (overviewMatch?.[0].includes('data-ues-visual-quality')) errors.push('Visual quality specialist content must not appear on the overview');
  for (const phrase of ['视觉质量检测', '证据边界', '开放发现追溯']) requireText(phrase, `Missing visual quality method content: ${phrase}`);
} else if (html.includes('data-ues-visual-quality')) {
  errors.push('Visual quality method block must be omitted unless visual quality is executed or limited');
}

const rejected = (diagnosis.candidates || []).filter(x => x?.conclusion?.status === 'rejected');
const mentionsRejectedCount = /反证排除|已排除[^<]{0,12}\d|排除[^<]{0,8}项/.test(html);
if (rejected.length && mentionsRejectedCount) {
  requireText('data-ues-rejected-candidates', 'Rejected count is shown but rejected-candidate section is missing');
  for (const c of rejected) {
    for (const value of [c.id, c.hypothesis, c.verification?.action, c.conclusion?.summary]) {
      if (value && !html.includes(escaped(value))) errors.push(`Rejected candidate ${c.id} is missing required detail: ${String(value).slice(0,30)}`);
    }
  }
}
for (const issue of assessment.issues || []) {
  for (const value of [issue.issue_id, issue.title, issue.impact, issue.acceptance]) {
    if (value && !html.includes(escaped(value))) errors.push(`Issue ${issue.issue_id} is missing content: ${String(value).slice(0,30)}`);
  }
}
requireText('ues-banner-art', 'Official report-kit banner/style marker is missing');
requireText('role="tablist"', 'Accessible tablist is missing');

if (errors.length) {
  console.error('UES HTML report is invalid:');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log(`UES HTML report is valid: ${path.resolve(htmlPath)}`);
