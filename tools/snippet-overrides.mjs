// Developer-time input for tools/vendor.mjs. Not part of the extension.
//
// Page-world snippets from @duckduckgo/autoconsent are copied verbatim into
// extension/vendor/autoconsent/snippets.generated.js, except for the ids below.

// Replaced source. Reason for each entry is given next to it.
export const OVERRIDES = {
  // Upstream: () => console.log(1). Writes to the page console.
  EVAL_0: '() => true',

  // Upstream calls console.warn(e) in its catch block. Same logic without it.
  EVAL_KLARO_TRY_API_OPT_OUT: `() => {
    if (window.klaro && typeof klaro.show === "function" && typeof klaro.getManager === "function") {
      try {
        klaro.getManager().changeAll(false);
        klaro.getManager().saveAndApplyConsents();
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }`,

  // Upstream searches every "div > button" for /Reject|Ablehnen/ and throws when
  // nothing matches. Scoped to the Microsoft banner, more languages, never throws.
  EVAL_MICROSOFT_0: `() => {
    const re = /^(reject|decline|ablehnen|refuser|rechazar|rifiuta|weigeren|rejeitar|recusar|odrzu\\u0107|avvisa|afvis|avvis|hylk\\u00e4\\u00e4|odm\\u00edtnout|elutas\\u00edt|respinge)/i;
    const button = Array.from(document.querySelectorAll("#wcpConsentBannerCtrl button")).find((el) => re.test((el.innerText || el.textContent || "").trim()));
    if (!button) return false;
    button.click();
    return true;
  }`,
};

// Opt-in / accept snippets. They are left out of the generated file entirely, so
// the background answers {r:false} for them and nothing can ever run them.
export const NEVER = [
  'EVAL_CONSENTMANAGER_4',
  'EVAL_CONSENTMANAGER_NCMP_ACCEPT',
  'EVAL_COOKIEINFORMATION_1',
  'EVAL_COOKIEREPORTS_OPT_IN',
  'EVAL_EZOIC_0',
  'EVAL_MICROSOFT_1',
  'EVAL_TARTEAUCITRON_1',
  'EVAL_TEALIUM_2',
  'EVAL_TRUSTCOMMANDER_OPTIN',
  'EVAL_USERCENTRICS_API_3',
];

// Snippets whose source trips the "looks like consent-granting" gate in
// vendor.mjs but were read and found to be harmless (they only read state).
export const REVIEWED = [
  'EVAL_EE_CONSENT_DECLINE_0', // sets every field of the one-button form to "n" (decline)
  'EVAL_USERCENTRICS_API_5', // UC_UI.areAllConsentsAccepted() === true  (read only)
  'EVAL_USERCENTRICS_API_6', // UC_UI.areAllConsentsAccepted() === false (read only)
];

// SHA-256 of the upstream source (fn.toString()) each override and review above
// was made against. vendor.mjs refuses to run when upstream changes one of
// these snippets, so a changed body is never trusted on the strength of its id.
export const UPSTREAM_SHA256 = {
  EVAL_0: 'aaf090f024051ddab7e1963ec84f6db09c6b40160a3d81a22da5a50e4d17dca3',
  EVAL_KLARO_TRY_API_OPT_OUT: '51f18016f6740d51194463c95f6ed0e5ad9a83d971d42684a1e9bffe22da3b88',
  EVAL_MICROSOFT_0: '5e5d22922de11bf4f1925ee79dc72a1c88367ba3f53958e8e50453a9cbeecb0d',
  EVAL_EE_CONSENT_DECLINE_0: '34281864a329af97f8ce288194c10f38fce8ff47e8ee095ab99f7e468bdada55',
  EVAL_USERCENTRICS_API_5: '16d2581b346414d66a501af44f11aec093b4d29118c4c5f71a316e8ccf61d11e',
  EVAL_USERCENTRICS_API_6: '50a337356774c7282bbc95124f593cdfc06e4745f9a26d4262622c97746641f6',
};
