// Our own rules, in autoconsent's full JSON rule format (AutoConsentCMPRule):
//   { name, detectCmp, detectPopup, optOut, prehideSelectors?, cosmetic?,
//     runContext?: { main?: boolean, frame?: boolean, urlPattern?: string },
//     minimumRuleStepVersion? }
// They are handed to the engine as `rules.autoconsent` next to the vendored
// compact rules. Rules here must only ever decline; there is deliberately no
// optIn field. Names must start with "cd-".
//
// v1 ships none: every candidate needs a check against the live site first.
export const EXTRA_RULES = Object.freeze([]);

// Same defaults as the engine: main frame yes, sub-frames no.
export function extraRulesFor(url, mainFrame, rules = EXTRA_RULES) {
  const out = [];
  for (const rule of rules) {
    if (!rule || typeof rule.name !== 'string' || !rule.name.startsWith('cd-')) continue;
    const ctx = rule.runContext || {};
    if (mainFrame ? ctx.main === false : ctx.frame !== true) continue;
    if (ctx.urlPattern) {
      let matches = false;
      try {
        matches = new RegExp(ctx.urlPattern).test(String(url));
      } catch (e) {
        matches = false;
      }
      if (!matches) continue;
    }
    out.push(rule);
  }
  return out;
}
