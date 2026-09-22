#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { registry, buildScenarioProfile, resolveMode, round } from './scenario_profile.mjs';
import { scenarioIssueMultiplier } from './scenario_scoring.mjs';

const DIMENSIONS = ['易见','易学','易操作'];
const PENALTY = { High:3, Major:1.5, Minor:.75, Advisory:.25 };
const ORDER = ['Advisory','Minor','Major','High'];
const JUDGED = ['pass','partial_pass','fail'];
const STATUSES = [...JUDGED,'insufficient_evidence','not_applicable'];
const TYPES = ['static','state_sequence','demo_runtime','full_runtime','limited_runtime'];
const fail = message => { throw new Error(message); };
const ensure = (ok,message) => { if (!ok) fail(message); };
const normalizeDimension = s => ({易见性:'易见',易学性:'易学',易操作性:'易操作'}[s] ?? s);
const defaultSeverity = (importance,judgment) => judgment === 'fail'
  ? ({3:'High',2:'Major',1:'Minor'}[importance]) : ({3:'Major',2:'Minor',1:'Advisory'}[importance]);
const highest = values => ORDER[Math.max(...values.map(v => ORDER.indexOf(v)))];

function summary(criteria, weight = () => 1) {
  const counts = Object.fromEntries(STATUSES.map(s => [s,criteria.filter(c => c.judgment === s).length]));
  const judged = criteria.filter(c => JUDGED.includes(c.judgment)).length;
  const eligible = criteria.filter(c => c.judgment !== 'not_applicable');
  const denominator = eligible.reduce((sum,c) => sum+weight(c),0);
  return { ...counts, judged, total:criteria.length,
    gap_rate:denominator ? eligible.filter(c => c.judgment === 'insufficient_evidence').reduce((sum,c) => sum+weight(c),0)/denominator : null };
}

function dimensionScores(criteria, issues, profile = null, baselineDimensions = null) {
  const byid = profile ? new Map(profile.criteria.map(c => [c.id,c])) : null;
  return DIMENSIONS.map(name => {
    const subset = criteria.filter(c => c.dimension === name);
    const coverage = summary(subset);
    const weighted = profile ? summary(subset,c => byid.get(c.id).aggregate_multiplier) : coverage;
    const baseOK = baselineDimensions ? baselineDimensions.find(d => d.name === name).status === 'scored' : true;
    const available = baseOK && coverage.judged >= 3 && coverage.gap_rate !== null && coverage.gap_rate <= .4 && weighted.gap_rate !== null && weighted.gap_rate <= .4;
    const deductions = issues.filter(i => i.primary_dimension === name).map(issue => {
      const detail = profile ? scenarioIssueMultiplier(issue,profile) : {multiplier:1};
      return { issue_id:issue.id, severity:issue.severity, base_penalty:PENALTY[issue.severity],
        ...detail, deduction:PENALTY[issue.severity]*detail.multiplier };
    });
    return { name, status:available ? 'scored' : 'unscored',
      reason:available ? null : coverage.judged<3 ? 'fewer_than_3_judged_criteria' : 'evidence_gap_above_40_percent',
      score:available ? Math.max(0,10-deductions.reduce((sum,i) => sum+i.deduction,0)) : null,
      coverage, weighted_gap_rate:weighted.gap_rate, deductions };
  });
}

function totalScore(dimensions) {
  const scored = dimensions.filter(d => d.status === 'scored');
  if (scored.length < 2) return {status:'unscored',raw_score:null,final_score:null,rating:null,reason:'fewer_than_2_scored_dimensions'};
  const raw = round(scored.reduce((sum,d) => sum+d.score,0)/scored.length,1);
  const final = raw;
  return {status:'scored',raw_score:raw,final_score:final,
    rating:final<5 ? '差' : final<7 ? '中' : final<8.5 ? '优' : '卓越',reason:null};
}

function scenarioImpacts(baselineDimensions, scenarioDimensions) {
  const baseline = new Map();
  for (const dimension of baselineDimensions) {
    for (const deduction of dimension.deductions) baseline.set(deduction.issue_id,{dimension:dimension.name,...deduction});
  }
  const impacts = [];
  for (const dimension of scenarioDimensions) {
    for (const deduction of dimension.deductions) {
      const base = baseline.get(deduction.issue_id);
      const baselineDeduction = base?.deduction ?? deduction.base_penalty;
      const scenarioDeduction = deduction.deduction;
      const delta = scenarioDeduction-baselineDeduction;
      const contributions = (deduction.contributions ?? []).map(item => ({...item,selected:item.multiplier===deduction.multiplier}));
      const selected = contributions.filter(item => item.selected).map(item => `${item.criterion_id}/${item.scenario_id}`);
      impacts.push({issue_id:deduction.issue_id,dimension:dimension.name,severity:deduction.severity,
        baseline_deduction:round(baselineDeduction),scenario_multiplier:round(deduction.multiplier),
        scenario_deduction:round(scenarioDeduction),deduction_delta:round(delta),drivers:contributions,
        explanation_zh:`${deduction.issue_id} 的基础扣分为 ${round(baselineDeduction)}，场景系数 ${round(deduction.multiplier)}，场景扣分为 ${round(scenarioDeduction)}，主要关联 ${selected.join('、') || '中性场景'}。`});
    }
  }
  return impacts.sort((a,b) => Math.abs(b.deduction_delta)-Math.abs(a.deduction_delta) || a.issue_id.localeCompare(b.issue_id));
}

export function calculateEaseOfUseScore(input) {
  ensure(input && typeof input === 'object' && !Array.isArray(input),'input must be an object');
  ensure(TYPES.includes(input.assessment_type),'invalid assessment_type');
  ensure(Array.isArray(input.criteria) && Array.isArray(input.issues),'criteria and issues must be arrays');
  const mode = resolveMode(input);
  const profile = mode === 'dual' ? buildScenarioProfile(input.context) : null;
  const canon = new Map(registry.criteria.map(c => [c.id,c]));
  const ids = new Set();
  const allCriteria = input.criteria.map(c => {
    const known = canon.get(c.id);
    ensure(known && !ids.has(c.id),`unknown or duplicate criterion: ${c.id}`); ids.add(c.id);
    ensure(STATUSES.includes(c.judgment),`${c.id}: invalid judgment`);
    if (c.level !== undefined) ensure(c.level === known.level,`${c.id}: level conflicts with canon`);
    if (c.importance !== undefined) ensure(c.importance === known.importance,`${c.id}: importance conflicts with canon`);
    return {...c,level:known.level,dimension:known.dimension,importance:known.importance};
  });
  const criteria = allCriteria.filter(c => input.assessment_type !== 'static' || c.level === 'page');
  const byid = new Map(criteria.map(c => [c.id,c]));
  const issueIds = new Set();
  const issues = input.issues.map(issue => {
    ensure(typeof issue.id === 'string' && issue.id.trim() && !issueIds.has(issue.id),'issue ids must be non-empty and unique'); issueIds.add(issue.id);
    const linked = issue.criterion_ids ?? issue.criteria;
    ensure(Array.isArray(linked) && linked.length && new Set(linked).size === linked.length,`${issue.id}: criterion_ids (or existing criteria) must be a non-empty unique array`);
    const affected = linked.map(id => {
      const c = byid.get(id);
      ensure(c && ['fail','partial_pass'].includes(c.judgment),`${issue.id}: ${id} must be a defect in scoring scope`);
      return c;
    });
    const main = normalizeDimension(issue.primary_dimension);
    ensure(DIMENSIONS.includes(main) && affected.some(c => c.dimension === main),`${issue.id}: primary_dimension must match an affected criterion`);
    const minimum = highest(affected.map(c => defaultSeverity(c.importance,c.judgment)));
    // Accept the old label only as a migration alias, with no special behavior.
    const severity = issue.severity === 'Gate' ? 'High' : (issue.severity ?? minimum);
    ensure(ORDER.includes(severity) && ORDER.indexOf(severity) >= ORDER.indexOf(minimum),`${issue.id}: severity cannot be below rubric-derived ${minimum}`);
    if (severity !== minimum) ensure(typeof issue.severity_reason === 'string' && issue.severity_reason.trim(),`${issue.id}: upgraded severity needs severity_reason`);
    return {...issue,criterion_ids:linked,primary_dimension:main,severity};
  });
  for (const c of criteria.filter(c => ['fail','partial_pass'].includes(c.judgment))) {
    ensure(issues.some(i => i.criterion_ids.includes(c.id)),`${c.id}: defect requires an issue before scoring`);
  }
  const dimensions = dimensionScores(criteria,issues);
  const scoring = totalScore(dimensions);
  const page = summary(allCriteria.filter(c => c.level === 'page'));
  const flow = summary(allCriteria.filter(c => c.level === 'flow'));
  if (input.assessment_type === 'static' && page.gap_rate > .2) {scoring.rating=null;scoring.provisional=true;}
  const result = {schema_version:'ues.usability-score.v2',assessment_name:input.assessment_name ?? null,
    assessment_type:input.assessment_type,scoring_mode:mode,dimensions,scoring,
    coverage:{page,flow}};
  if (profile) {
    const scenarioDimensions = dimensionScores(criteria,issues,profile,dimensions);
    const scenario = totalScore(scenarioDimensions);
    // A dropped dimension must not make the contextual total compare a different dimension set.
    if (dimensions.some((d,i) => d.status === 'scored' && scenarioDimensions[i].status !== 'scored')) {
      Object.assign(scenario,{status:'unscored',raw_score:null,final_score:null,reason:'contextual_dimension_set_differs_from_baseline'});
    }
    result.scenario_profile=profile;
    result.scenario_dimensions=scenarioDimensions;
    result.scenario_impacts=scenarioImpacts(dimensions,scenarioDimensions);
    result.scenario_scoring={...scenario,rating:null,label:'场景易用性参考分（试行）',calibration:'experimental_not_calibrated',
      delta_from_baseline:scenario.final_score !== null && scoring.final_score !== null ? round(scenario.final_score-scoring.final_score,1) : null};
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/calculate_ease_of_use_score.mjs assessment.json');
    process.stdout.write(JSON.stringify(calculateEaseOfUseScore(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2)+'\n');
  } catch (error) { process.stderr.write(error.message+'\n'); process.exitCode=1; }
}
