// User-confirmed assessment framing, independent of task and score calculation.
export const PARADIGMS = ['narrative', 'exploration', 'task_system'];
const ensure = (ok, message) => { if (!ok) throw new Error(message); };
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export function normalizeParadigmSelection(selection) {
  ensure(object(selection), 'context.paradigm_selection is required; confirm the assessment framing with the user before dual scoring');
  ensure(Object.keys(selection).every(k => ['primary','secondary','confirmation'].includes(k)), 'paradigm_selection supports only primary, optional secondary and confirmation');
  const read = (value, role) => {
    ensure(object(value) && Object.keys(value).every(k => ['paradigm','share'].includes(k)), `${role} must contain paradigm and share`);
    ensure(PARADIGMS.includes(value.paradigm), `${role}.paradigm is invalid`);
    ensure(Number.isFinite(value.share) && value.share > 0 && value.share <= 1, `${role}.share must be in (0, 1]`);
    return {paradigm:value.paradigm, share:value.share};
  };
  const primary = read(selection.primary, 'primary');
  const secondary = selection.secondary == null ? null : read(selection.secondary, 'secondary');
  ensure(!secondary || primary.paradigm !== secondary.paradigm, 'primary and secondary paradigms must be distinct');
  ensure(!secondary || primary.share >= secondary.share, 'primary share must be at least secondary share');
  ensure(Math.abs(primary.share + (secondary?.share ?? 0) - 1) < 1e-9, 'paradigm shares must sum to 1');
  const confirmation = selection.confirmation;
  ensure(object(confirmation) && ['explicit_input','user_reply','delegated'].includes(confirmation.source), 'paradigm_selection requires user confirmation; model inference is not confirmation');
  ensure(typeof confirmation.user_statement === 'string' && confirmation.user_statement.trim(), 'confirmation.user_statement must record the actual user choice');
  const mix = Object.fromEntries(PARADIGMS.map(p => [p, p === primary.paradigm ? primary.share : p === secondary?.paradigm ? secondary.share : 0]));
  return {
    primary, secondary,
    confirmation:{source:confirmation.source,user_statement:confirmation.user_statement.trim()},
    paradigm_mix:mix,
    close_split:secondary !== null && primary.share-secondary.share <= .2+1e-9,
  };
}
