// Per-issue strategy. Baseline severity and evidence judgments are supplied by the usability calculator.
export function scenarioIssueMultiplier(issue, profile) {
  const byid = new Map(profile.criteria.map(c => [c.id,c]));
  if (!Array.isArray(issue.scenario_links) || issue.scenario_links.length === 0) {
    throw new Error(`${issue.id}: dual mode requires scenario_links to observed criterion/scenario pairs`);
  }
  const pairs = new Set();
  const contributions = issue.scenario_links.map(link => {
    if (!link || !issue.criterion_ids.includes(link.criterion_id)) throw new Error(`${issue.id}: scenario link must reference an affected criterion`);
    const key = `${link.criterion_id}/${link.scenario_id}`;
    if (pairs.has(key)) throw new Error(`${issue.id}: duplicate scenario link ${key}`);
    pairs.add(key);
    const p = byid.get(link.criterion_id)?.scenarios.find(s => s.scenario_id === link.scenario_id);
    if (!p) throw new Error(`${issue.id}: scenario link outside frozen criterion scope: ${key}`);
    return { criterion_id:link.criterion_id, scenario_id:link.scenario_id, multiplier:p.multiplier };
  });
  const raw = Math.max(...contributions.map(c => c.multiplier));
  return { multiplier:raw, contributions };
}
