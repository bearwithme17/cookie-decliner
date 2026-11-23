/* Generated from @duckduckgo/autoconsent@18.9.0 lib/eval-snippets.ts (MPL-2.0) by tools/vendor.mjs. Do not edit.
 * Each function runs in the page's MAIN world, returns a boolean and cannot throw.
 * Opt-in snippets are omitted; console output is removed (see tools/snippet-overrides.mjs). */
export const SAFE_SNIPPETS = Object.freeze({
__proto__: null,
  EVAL_0: () => { try { const r = (() => true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_ADOPT_TEST: () => { try { const r = (() => !!localStorage.getItem("adoptConsentMode"))(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_ADULTFRIENDFINDER_TEST: () => { try { const r = (() => !!localStorage.getItem("cookieConsent"))(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_AYLO_COOKIE_MANAGER_READY: () => { try { const r = (() => !!(window.wl_cookie_consent_manager || window._Cookie_Consent_Manager_brand))(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_BAHN_TEST: () => { try { const r = (() => utag.gdpr.getSelectedCategories().length === 1)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_BIGCOMMERCE_CONSENT_MANAGER_DETECT: () => { try { const r = (() => !!(window.consentManager && window.consentManager.version))(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_BING_NOTICE_CLOSE: () => { try { const r = (() => {
    const close = document.querySelector("#bnp_ttc_close");
    close.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    close.click();
    return true;
  })(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_BORLABS_0: () => { try { const r = (() => !JSON.parse(
    decodeURIComponent(
      document.cookie.split(";").find((c) => c.indexOf("borlabs-cookie") !== -1).split("=", 2)[1]
    )
  ).consents.statistics)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_CC_BANNER2_0: () => { try { const r = (() => !!document.cookie.match(/sncc=[^;]+D%3Dtrue/))(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_CONSENTMANAGER_1: () => { try { const r = (() => {
    const cmpData = window.__cmp?.("getCMPData");
    return !!cmpData && typeof cmpData === "object";
  })(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_CONSENTMANAGER_2: () => { try { const r = (() => window.__cmp?.("consentStatus")?.userChoiceExists === false)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_CONSENTMANAGER_3: () => { try { const r = (() => __cmp("setConsent", 0))(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_CONSENTMANAGER_5: () => { try { const r = (() => __cmp("consentStatus").userChoiceExists)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_CONSENTMANAGER_NCMP_REJECT: () => { try { const r = (() => {
    if (typeof window.__npcmp !== "function") return false;
    window.__npcmp("reject");
    return true;
  })(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_COOKIEBOT_1: () => { try { const r = (() => !!window.Cookiebot)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_COOKIEBOT_2: () => { try { const r = (() => !window.Cookiebot.hasResponse && window.Cookiebot.dialog?.visible === true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_COOKIEBOT_3: () => { try { const r = (() => window.Cookiebot.withdraw() || true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_COOKIEBOT_4: () => { try { const r = (() => window.Cookiebot.hide() || true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_COOKIEBOT_5: () => { try { const r = (() => window.Cookiebot.declined === true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_COOKIEFIRST_0: () => { try { const r = (() => ((o) => o.performance === false && o.functional === false && o.advertising === false)(
    JSON.parse(
      decodeURIComponent(
        document.cookie.split(";").find((c) => c.indexOf("cookiefirst") !== -1).trim()
      ).split("=")[1]
    )
  ))(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_COOKIEFIRST_1: () => { try { const r = (() => document.querySelectorAll("button[data-cookiefirst-accent-color=true][role=checkbox]:not([disabled])").forEach((i) => i.getAttribute("aria-checked") === "true" && i.click()) || true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_COOKIEINFORMATION_0: () => { try { const r = (() => CookieInformation.declineAllCategories() || true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_COOKIEREPORTS_OPT_OUT: () => { try { const r = (() => {
    const cr = window._cookiereports;
    if (typeof cr?.saveConsent !== "function") return false;
    cr.saveConsent({ 1: true, 2: false, 3: false, 4: false, 5: false });
    cr.processConsent("banner", { trigger: "ok" });
    cr.hideBanner();
    return true;
  })(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_COOKIEREPORTS_TEST: () => { try { const r = (() => {
    const levels = window._cookiereports?.loadConsent?.();
    return !!levels && Object.keys(levels).length > 0 && Object.values(levels).every((v) => !v);
  })(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_COOKIE_LAW_INFO_0: () => { try { const r = (() => {
    if (CLI.disableAllCookies) CLI.disableAllCookies();
    if (CLI.reject_close) CLI.reject_close();
    document.body.classList.remove("cli-barmodal-open");
    return true;
  })(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_COOKIE_LAW_INFO_DETECT: () => { try { const r = (() => !!window.CLI)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_COOKIE_POPUP_CLOSE: () => { try { const r = (() => document.querySelector("#cookie-popup #close-cookies").dispatchEvent(new MouseEvent("click", { bubbles: true })) || true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_DIDOMI_OPT_OUT: () => { try { const r = (() => {
    if (window.Didomi) {
      window.Didomi.setUserDisagreeToAll();
      return true;
    }
    return false;
  })(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_DIDOMI_TEST: () => { try { const r = (() => {
    const purposes = window.Didomi?.getCurrentUserStatus?.()?.purposes;
    if (purposes) {
      return Object.values(purposes).some((p) => !p.enabled);
    }
    const disabled = window.Didomi?.getUserConsentStatusForAll?.()?.purposes?.disabled;
    return Array.isArray(disabled) && disabled.length > 0;
  })(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_EE_CONSENT_DECLINE_0: () => { try { const r = (() => document.querySelectorAll('#cookieConsentFormAccept input[name^="ee:cookies_"]').forEach((i) => i.value = "n") || true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_ETSY_0: () => { try { const r = (() => document.querySelectorAll(".gdpr-overlay-body input").forEach((toggle) => {
    toggle.checked = false;
  }) || true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_ETSY_1: () => { try { const r = (() => document.querySelector(".gdpr-overlay-view button[data-wt-overlay-close]").click() || true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_FIDES_DETECT_POPUP: () => { try { const r = (() => window.Fides?.initialized)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_IFRAME_SHOWN: () => { try { const r = (() => window.innerHeight > 0)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_IUBENDA_0: () => { try { const r = (() => document.querySelectorAll(".purposes-item input[type=checkbox]:not([disabled])").forEach((x) => {
    if (x.checked) x.click();
  }) || true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_IUBENDA_1: () => { try { const r = (() => !!document.cookie.match(/_iub_cs-\d+=/))(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_KLARO_1: () => { try { const r = (() => {
    const config = globalThis.klaroConfig || globalThis.klaro?.getManager && globalThis.klaro.getManager().config;
    if (!config) {
      return true;
    }
    const optionalServices = (config.services || config.apps).filter((s) => !s.required).map((s) => s.name);
    if (klaro && klaro.getManager) {
      const manager = klaro.getManager();
      return optionalServices.every((name) => !manager.consents[name]);
    } else if (klaroConfig && klaroConfig.storageMethod === "cookie") {
      const cookieName = klaroConfig.cookieName || klaroConfig.storageName;
      const consents = JSON.parse(
        decodeURIComponent(
          document.cookie.split(";").find((c) => c.trim().startsWith(cookieName)).split("=")[1]
        )
      );
      return Object.keys(consents).filter((k) => optionalServices.includes(k)).every((k) => consents[k] === false);
    }
  })(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_KLARO_OPEN_POPUP: () => { try { const r = (() => {
    klaro.show(void 0, true);
  })(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_KLARO_TRY_API_OPT_OUT: () => { try { const r = (() => {
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
  })(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_KROWN_COOKIE_BANNER_TEST: () => { try { const r = (() => localStorage.getItem("krown-cookie-banner") === "true")(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_LETHPOLYTECH_DECLINE: () => { try { const r = (() => document.querySelector(".consent-banner .cookie-decline").dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window })) || true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_MICROSOFT_0: () => { try { const r = (() => {
    const re = /^(reject|decline|ablehnen|refuser|rechazar|rifiuta|weigeren|rejeitar|recusar|odrzu\u0107|avvisa|afvis|avvis|hylk\u00e4\u00e4|odm\u00edtnout|elutas\u00edt|respinge)/i;
    const button = Array.from(document.querySelectorAll("#wcpConsentBannerCtrl button")).find((el) => re.test((el.innerText || el.textContent || "").trim()));
    if (!button) return false;
    button.click();
    return true;
  })(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_MICROSOFT_2: () => { try { const r = (() => !!document.cookie.match("MSCC|GHCC"))(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_MOOVE_0: () => { try { const r = (() => document.querySelectorAll("#moove_gdpr_cookie_modal input").forEach((i) => {
    if (!i.disabled) i.checked = i.name === "moove_gdpr_strict_cookies" || i.id === "moove_gdpr_strict_cookies";
  }) || true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_NHNIEUWS_TEST: () => { try { const r = (() => !!localStorage.getItem("psh:cookies-seen"))(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_ONETRUST_1: () => { try { const r = (() => window.OnetrustActiveGroups.split(",").filter((s) => s.length > 0).length <= 1)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_OSANO_DETECT: () => { try { const r = (() => !!window.Osano?.cm?.dialogOpen)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_PANDECTES_TEST: () => { try { const r = (() => document.cookie.includes("_pandectes_gdpr=") && JSON.parse(
    atob(
      document.cookie.split(";").find((s) => s.trim().startsWith("_pandectes_gdpr")).split("=")[1]
    )
  ).status === "deny")(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_POSTHOG_TEST: () => { try { const r = (() => localStorage.getItem("cookie_consent") === "acknowledged")(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_POVR_GOBACK: () => { try { const r = (() => window.history.back() || true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_PUBTECH_0: () => { try { const r = (() => document.cookie.includes("euconsent-v2") && (document.cookie.match(/.YAAAAAAAAAAA/) || document.cookie.match(/.aAAAAAAAAAAA/) || document.cookie.match(/.YAAACFgAAAAA/)))(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_SHOPIFY_TEST: () => { try { const r = (() => document.cookie.includes("gdpr_cookie_consent=0") || document.cookie.includes("_tracking_consent=") && JSON.parse(
    decodeURIComponent(
      document.cookie.split(";").find((s) => s.trim().startsWith("_tracking_consent")).split("=")[1]
    )
  ).purposes.a === false)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_SIRDATA_UNBLOCK_SCROLL: () => { try { const r = (() => {
    document.documentElement.classList.forEach((cls) => {
      if (cls.startsWith("sd-cmp-")) document.documentElement.classList.remove(cls);
    });
    return true;
  })(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_SOURCEPOINT_RESTORE_SCROLL: () => { try { const r = (() => {
    const root = document.documentElement;
    const saved = root.dataset.previousScrollY;
    if (saved && saved !== "null") {
      root.dataset.previousScrollY = "null";
      const y = -parseInt(saved, 10);
      if (y > 0 && window.scrollY === 0) {
        const behavior = root.style.scrollBehavior;
        root.style.scrollBehavior = "auto";
        window.scrollTo(0, y);
        root.style.scrollBehavior = behavior;
      }
    }
    window.addEventListener("pagehide", () => {
      if (root.dataset.previousScrollY) root.dataset.previousScrollY = "null";
    });
    return true;
  })(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_STEAMPOWERED_0: () => { try { const r = (() => JSON.parse(
    decodeURIComponent(
      document.cookie.split(";").find((s) => s.trim().startsWith("cookieSettings")).split("=")[1]
    )
  ).preference_state === 2)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_TARTEAUCITRON_0: () => { try { const r = (() => tarteaucitron.userInterface.respondAll(false) || true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_TARTEAUCITRON_2: () => { try { const r = (() => document.cookie.match(/tarteaucitron=[^;]*/)?.[0].includes("false"))(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_TEALIUM_0: () => { try { const r = (() => typeof window.utag !== "undefined" && typeof utag.gdpr === "object")(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_TEALIUM_1: () => { try { const r = (() => utag.gdpr.setConsentValue(false) || true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_TEALIUM_3: () => { try { const r = (() => utag.gdpr.getConsentState() !== 1)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_TEALIUM_DONOTSELL: () => { try { const r = (() => utag.gdpr.dns?.setDnsState(false) || true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_TEALIUM_DONOTSELL_CHECK: () => { try { const r = (() => utag.gdpr.dns?.getDnsState() !== 1)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_TEALIUM_NO_DECISION: () => { try { const r = (() => utag.gdpr.getConsentState() === 0)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_TESTCMP_0: () => { try { const r = (() => window.results.results[0] === "button_clicked")(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_TESTCMP_COSMETIC_0: () => { try { const r = (() => window.results.results[0] === "banner_hidden")(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_TESTCMP_STEP: () => { try { const r = (() => !!document.querySelector("#reject-all"))(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_TRUSTARC_FRAME_GTM: () => { try { const r = (() => window && window.QueryString && window.QueryString.gtm === "1")(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_TRUSTARC_FRAME_TEST: () => { try { const r = (() => window && window.QueryString && window.QueryString.preferences === "0")(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_TRUSTARC_TOP: () => { try { const r = (() => window && window.truste && window.truste.eu.bindMap.prefCookie === "0")(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_TRUSTCOMMANDER_BANNER_SHOWN: () => { try { const r = (() => {
    const wrapper = document.getElementById("tc-privacy-wrapper");
    return !!wrapper && getComputedStyle(wrapper).visibility !== "hidden";
  })(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_TRUSTCOMMANDER_OPTOUT: () => { try { const r = (() => {
    if (typeof window.tC?.privacy?.clickBanner !== "function") return false;
    window.tC.privacy.clickBanner("optout");
    return true;
  })(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_USERCENTRICS_API_0: () => { try { const r = (() => typeof UC_UI === "object")(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_USERCENTRICS_API_1: () => { try { const r = (() => !!UC_UI.closeCMP())(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_USERCENTRICS_API_2: () => { try { const r = (() => !!UC_UI.denyAllConsents())(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_USERCENTRICS_API_4: () => { try { const r = (() => !!UC_UI.closeCMP())(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_USERCENTRICS_API_5: () => { try { const r = (() => UC_UI.areAllConsentsAccepted() === true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_USERCENTRICS_API_6: () => { try { const r = (() => UC_UI.areAllConsentsAccepted() === false)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_WBD_LTP_CLOSE: () => { try { const r = (() => document.querySelector("dialog#ltp-dialog").close() || true)(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
  EVAL_ZOHO_TEST: () => { try { const r = (() => localStorage.getItem("zglobal_Acookie_optOut") === "3")(); return r && typeof r.then === "function" ? Promise.resolve(r).then((v) => !!v, () => false) : !!r; } catch (e) { return false; } },
});
