#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const registry = JSON.parse(fs.readFileSync(new URL('../references/scenario-tags.json', import.meta.url), 'utf8'));
export const policy = JSON.parse(fs.readFileSync(new URL('../references/scenario-policy.json', import.meta.url), 'utf8'));
import { PARADIGMS, normalizeParadigmSelection } from './paradigm_selection.mjs';
export { PARADIGMS };
export const TASKS = ['discover', 'compare', 'consume', 'diagnose', 'execute', 'create', 'collaborate', 'decide'];
const requireThat = (ok, message) => { if (!ok) throw new Error(message); };
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const unique = values => new Set(values).size === values.length;
export const round = (n, digits = 4) => Math.round((n + Number.EPSILON) * 10 ** digits) / 10 ** digits;
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;

// No evidence, judgments or scores enter this function. It only interprets frozen context and tags.
export function buildScenarioProfile(context, options = {}) {
  const rules = options.policy ?? policy;
  requireThat(object(context) && context.frozen === true, 'context.frozen must be true before scoring');
  requireThat(typeof context.id === 'string' && context.id.trim(), 'context.id is required');
  requireThat(Array.isArray(context.scenarios) && context.scenarios.length > 0, 'context.scenarios must be non-empty');
  requireThat(typeof rules.version === 'string', 'policy.version is required');
  for (const k of ['paradigm_strength', 'task_match_bonus', 'min_multiplier', 'max_multiplier']) {
    requireThat(Number.isFinite(rules[k]) && rules[k] >= 0, `invalid policy.${k}`);
  }
  requireThat(rules.min_multiplier > 0 && rules.min_multiplier <= 1 && rules.max_multiplier >= 1, 'policy must contain neutral multiplier 1');
  const selection = normalizeParadigmSelection(context.paradigm_selection);
  const ids = context.scenarios.map(s => s?.id);
  requireThat(ids.every(id => typeof id === 'string' && id.trim()) && unique(ids), 'scenario ids must be non-empty and unique');
  const scenarios = context.scenarios.map(s => {
    requireThat(typeof s.task_id === 'string' && s.task_id.trim(), `${s.id}.task_id is required`);
    requireThat(typeof s.goal === 'string' && s.goal.trim(), `${s.id}.goal is required`);
    requireThat(typeof s.basis === 'string' && s.basis.trim(), `${s.id}.basis is required`);
    requireThat(TASKS.includes(s.primary_task), `${s.id}.primary_task is invalid`);
    const secondary = s.secondary_tasks ?? [];
    requireThat(Array.isArray(secondary) && unique(secondary) && secondary.every(t => TASKS.includes(t) && t !== s.primary_task), `${s.id}.secondary_tasks is invalid`);
    requireThat(s.paradigm === undefined && s.paradigm_mix === undefined, `${s.id}: move scenario paradigms to context.paradigm_selection; scenario-level overrides are unsupported`);
    const mix = selection.paradigm_mix;
    return { id:s.id, task_id:s.task_id, goal:s.goal, basis:s.basis, role:s.role ?? null, primary_task:s.primary_task, secondary_tasks:[...secondary].sort(), paradigm_mix:mix };
  }).sort((a,b) => a.id.localeCompare(b.id));
  const taskIds = [...new Set(scenarios.map(s => s.task_id))].sort();
  const shares = context.task_shares ?? Object.fromEntries(taskIds.map(t => [t,1/taskIds.length]));
  requireThat(object(shares) && Object.keys(shares).length === taskIds.length && taskIds.every(t => Number.isFinite(shares[t]) && shares[t] > 0), 'task_shares must specify every task with a positive share');
  requireThat(Math.abs(Object.values(shares).reduce((a,b) => a+b,0)-1) < 1e-9, 'task_shares must sum to 1');
  for (const s of scenarios) s.share = shares[s.task_id] / scenarios.filter(x => x.task_id === s.task_id).length;
  const mapping = context.criterion_scenarios ?? {};
  const known = new Set(registry.criteria.map(c => c.id));
  requireThat(object(mapping), 'criterion_scenarios must be an object');
  for (const [id, values] of Object.entries(mapping)) {
    requireThat(known.has(id) && Array.isArray(values) && values.length > 0 && unique(values) && values.every(x => ids.includes(x)), `invalid criterion_scenarios.${id}`);
  }
  const normalized = { id:context.id, frozen:true, product_type:context.product_type ?? null,
    user_profile:context.user_profile ?? null, input_capability:context.input_capability ?? null,
    risk_capabilities:context.risk_capabilities ?? [],
    assumptions:context.assumptions ?? [], paradigm_selection:selection, scenarios, task_shares:shares,
    criterion_scenarios:Object.fromEntries(Object.entries(mapping).map(([id,v]) => [id,[...v].sort()])) };
  const profiles = registry.criteria.map(c => {
    const relevant = scenarios.filter(s => mapping[c.id] === undefined || mapping[c.id].includes(s.id));
    const parts = relevant.map(s => {
      const hasTags = c.tag_status === 'completed';
      let delta = 0;
      const missing = [];
      for (const p of PARADIGMS) {
        const r = hasTags ? c.paradigms?.[p] : null;
        if (![1,2,3].includes(r)) { if (s.paradigm_mix[p] > 0) missing.push(p); }
        else delta += s.paradigm_mix[p] * (r-2);
      }
      const scope = hasTags ? c.task_scope : null;
      const tasks = [s.primary_task,...s.secondary_tasks];
      const matched = scope?.mode === 'task_specific' && (scope.primary_tasks ?? []).some(t => tasks.includes(t));
      const multiplier = Math.max(rules.min_multiplier, Math.min(rules.max_multiplier, 1+rules.paradigm_strength*delta+rules.task_match_bonus*Number(matched)));
      return { scenario_id:s.id, task_id:s.task_id, share:s.share, multiplier,
        paradigm_delta:delta, task_match:Boolean(matched), neutral_fallback:missing,
        task_mapping_status:scope ? scope.mode : 'unspecified' };
    });
    const aggregate = parts.reduce((a,p) => a+p.share*p.multiplier,0)/parts.reduce((a,p) => a+p.share,0);
    return { id:c.id, importance:c.importance, level:c.level, dimension:c.dimension,
      aggregate_multiplier:aggregate, scenarios:parts, tag_status:c.tag_status };
  });
  const hash = createHash('sha256').update(JSON.stringify(canonical({ context:normalized, policy:rules, registry }))).digest('hex');
  return { schema_version:'ues.scenario-profile.v2', profile_id:hash, suite:registry.suite,
    policy_version:rules.version, calibration:rules.calibration, context:normalized, criteria:profiles,
    note:'Paradigm shares are user-confirmed assessment weights; task shares are separate review allocations, not measured traffic. Context weights do not decide applicability.' };
}

export function resolveMode(input) {
  const mode = input.scoring_mode ?? (input.context ? policy.default_mode : 'baseline');
  requireThat(['baseline','dual'].includes(mode), 'scoring_mode must be baseline or dual');
  if (mode === 'dual') requireThat(input.context, 'dual mode requires frozen context');
  return mode;
}

export function validateProfileCriteria(criteria, profile) {
  const byid = new Map(profile.criteria.map(c => [c.id,c]));
  for (const c of criteria) {
    const p = byid.get(c.id);
    requireThat(p, `unknown criterion for scene weighting: ${c.id}`);
    if (c.importance !== undefined) requireThat(c.importance === p.importance, `${c.id}.importance conflicts with current canon`);
    if (c.level !== undefined) requireThat(c.level === p.level, `${c.id}.level conflicts with current canon`);
  }
  return byid;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/scenario_profile.mjs context.json');
    const input = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
    process.stdout.write(JSON.stringify(buildScenarioProfile(input.context ?? input),null,2)+'\n');
  } catch (error) { process.stderr.write(error.message+'\n'); process.exitCode=1; }
}
