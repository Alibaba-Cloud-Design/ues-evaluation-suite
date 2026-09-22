"""Versioned persona structure; constants shared by validation and fixtures."""

FIELDS = {
    "role": ("job_role", "professional_background", "years_experience", "mbti", "product_stage"),
    "skills": ("proficiency", "technical_background", "recovery_ability"),
    "operating_habits": ("information_preference", "path_tendency", "navigation_preference"),
    "goals": ("goal_intensity", "error_tolerance", "success_path"),
    "emotional_cognition": ("cognitive_load", "anxiety_sensitivity", "decision_expectation"),
    "feedback_expression": ("expression_preference", "understanding_preference", "feedback_motivation"),
    "behavioral_randomness": ("behavior_type", "random_behavior"),
}


def validate_persona(persona, sources):
    errors = []
    pid = str(persona.get("id", "?"))

    def need(ok, message):
        if not ok:
            errors.append(pid + ": " + message)

    def text(x):
        return isinstance(x, str) and bool(x.strip())

    def strings(x):
        return isinstance(x, list) and all(text(v) for v in x)

    need(persona.get("kind") in {"hypothetical", "evidence_based"}, "persona kind required")
    dims = persona.get("dimensions")
    if not isinstance(dims, dict):
        return errors + [pid + ": seven dimensions required"]
    need(set(dims) == set(FIELDS), "exactly seven dimensions required (v0.2.0)")
    all_refs = set()
    actionable = set()
    for key, names in FIELDS.items():
        dim = dims.get(key, {})
        fields = dim.get("fields", {}) if isinstance(dim, dict) else {}
        if not isinstance(fields, dict):
            need(False, key + ": fields must be object")
            continue
        need(set(fields) == set(names), key + ": exact subfields required")
        for name in names:
            ref = key + "." + name
            all_refs.add(ref)
            field = fields.get(name)
            if not isinstance(field, dict):
                need(False, ref + ": field object required")
                continue
            status = field.get("status")
            need(status in {"provided", "evidenced", "assumed", "unknown", "not_applicable"}, ref + ": invalid field status")
            need(text(field.get("value")) and text(field.get("reason")), ref + ": value/reason required")
            basis = field.get("basis")
            need(strings(basis), ref + ": basis array required")
            if strings(basis):
                need(all(s in sources for s in basis), ref + ": unknown reference in basis")
                if status in {"provided", "evidenced", "assumed"}:
                    need(bool(basis), ref + ": source required")
                if status == "assumed":
                    need(any(sources.get(s, {}).get("type") == "inferred" for s in basis), ref + ": assumed needs inferred source")
                if status == "provided":
                    need(any(sources.get(s, {}).get("type") == "user_provided" for s in basis), ref + ": provided needs user source")
                if status == "evidenced":
                    need(any(sources.get(s, {}).get("type") in {"research", "behavior_log", "user_provided"} for s in basis), ref + ": evidenced needs material source")
            if status in {"provided", "evidenced", "assumed"}:
                actionable.add(ref)
    context = persona.get("context", {})
    if not isinstance(context, dict):
        context = {}
    need(all(text(context.get(k)) for k in ("need", "product_experience")), "context need/product_experience required")
    need(all(strings(context.get(k)) for k in ("known_concepts", "unknown_concepts", "conditions")), "knowledge boundaries and conditions required")
    rules = persona.get("behavior_rules")
    need(isinstance(rules, list) and bool(rules), "behavior_rules required")
    used, rule_ids = set(), set()
    for rule in rules if isinstance(rules, list) else []:
        if not isinstance(rule, dict):
            need(False, "rule must be object")
            continue
        rid = rule.get("id")
        need(text(rid), "rule id required")
        if text(rid):
            need(rid not in rule_ids, "duplicate rule id")
            rule_ids.add(rid)
        need(all(text(rule.get(k)) for k in ("when", "action", "check")), "rule when/action/check required")
        refs = rule.get("field_refs")
        need(strings(refs) and bool(refs), "rule field_refs required")
        if strings(refs):
            need(set(refs) <= actionable, "rule cannot cite unknown, inactive or missing field")
            used.update(refs)
    inactive = persona.get("inactive_fields")
    need(isinstance(inactive, dict), "inactive_fields object required")
    if isinstance(inactive, dict):
        need(set(inactive) <= all_refs and all(text(v) for v in inactive.values()), "invalid inactive field/reason")
        need(not (set(inactive) & used), "used field cannot be inactive")
        need(used | set(inactive) == all_refs, "every field needs a rule or inactive reason")
    if persona.get("kind") == "hypothetical":
        for key in ("operating_habits", "goals"):
            need(any(r.startswith(key + ".") for r in used), key + ": hypothetical persona needs active behavioral setting")
        need(any(r.startswith("emotional_cognition.") or r == "skills.recovery_ability" for r in used), "hypothetical persona needs active recovery/cognition setting")
    return errors
