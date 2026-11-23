// Text classification for consent buttons. Pure functions on CD.heuristic; no DOM
// access except in isAcceptElement, so they also run under jsdom.
//
// This file currently holds only the hard deny-list: labels that mean "accept",
// "agree" or "OK". The supervisor uses it to veto any click the engine is about
// to make on such a button, whatever rule asked for it. The multilingual reject
// heuristic (classify / hasConsentContext / findTarget) is added to the same
// namespace later.
(function () {
  'use strict';

  // Lowercase, compatibility-normalised, letters and digits only, single spaces.
  function normalize(text) {
    if (typeof text !== 'string') return '';
    return text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  // Verbs and phrases that grant consent or acknowledge. Already normalised
  // (apostrophes are spaces). German and English first, then the other languages
  // the engine's rules commonly meet.
  var ACCEPT_VERBS = [
    // en
    'accept', 'i accept', 'accept it', 'agree', 'i agree', 'yes i agree', 'agreed', 'allow', 'consent', 'i consent',
    'enable', 'ok', 'okay', 'got it', 'yes', 'i understand', 'understood', 'fine', 'fine by me', 'sounds good',
    'that s ok', 'that s fine', 'accept recommended', 'accept recommended settings',
    // de
    'akzeptieren', 'akzeptiere', 'ich akzeptiere', 'akzeptiert', 'zustimmen', 'stimme zu', 'ich stimme zu',
    'einverstanden', 'ich bin einverstanden', 'zulassen', 'erlauben', 'annehmen', 'einwilligen', 'ich willige ein',
    'verstanden', 'alles klar', 'ja', 'in ordnung', 'geht klar', 'bestätigen und akzeptieren',
    // fr
    'accepter', 'j accepte', 'autoriser', 'd accord', 'j ai compris', 'compris', 'oui', 'consentir',
    // es
    'aceptar', 'acepto', 'permitir', 'de acuerdo', 'entendido', 'si', 'sí', 'consentir',
    // it
    'accetta', 'accetto', 'accettare', 'acconsento', 'consenti', 'ho capito', 'va bene',
    // nl
    'accepteren', 'accepteer', 'akkoord', 'ik ga akkoord', 'toestaan', 'begrepen', 'prima',
    // pt
    'aceitar', 'aceito', 'concordo', 'concordar', 'entendi', 'permitir',
    // pl
    'akceptuj', 'akceptuję', 'akceptuje', 'zaakceptuj', 'zgadzam się', 'zgadzam sie', 'zezwól', 'rozumiem',
    // sv, da, no, fi
    'acceptera', 'godkänn', 'jag godkänner', 'tillåt', 'accepter', 'acceptér', 'tillad', 'godta', 'godkjenn',
    'tillat', 'hyväksy', 'hyväksyn', 'salli',
    // cs, sk, hu, ro
    'přijmout', 'souhlasím', 'povolit', 'prijať', 'súhlasím', 'elfogad', 'elfogadom', 'accept', 'sunt de acord',
    // phrases that accept without an accept verb
    'got it', 'mit werbung weiterlesen', 'mit werbung lesen', 'weiter mit werbung', 'continue with ads',
    'continuer avec les cookies', 'wyrażam zgodę', 'wyrazam zgode', 'zgoda', 'oké', 'oke',
    // "select all" / "activate all" switch every purpose on
    'select', 'auswählen', 'aktivieren', 'activer', 'activate', 'turn on', 'einschalten',
  ];
  // Words that may stand around an accept verb without changing its meaning.
  var ALL = ['all', 'alle', 'allen', 'alles', 'allem', 'every', 'everything', 'tout', 'tous', 'toutes', 'todo', 'todos', 'todas',
    'tudo', 'tutto', 'tutti', 'tutte', 'wszystkie', 'wszystko', 'alla', 'kaikki', 'vše', 'všetko', 'összes', 'toate', 'them', 'of them'];
  var NOUN = ['the', 'these', 'our', 'optional', 'additional', 'die', 'les', 'los', 'las', 'i', 'de', 'cookies', 'cookie',
    'pliki cookie', 'plików cookie', 'tracking', 'services', 'dienste', 'partner', 'partners', 'vendors', 'purposes',
    'zwecke', 'anbieter', 'and tracking', 'und tracking'];
  var TAIL = ['and', 'und', 'et', 'y', 'e', 'en', 'og', 'och', 'ja', 'a', 'i', 'na', 'to', '&',
    'continue', 'close', 'close banner', 'hide', 'proceed', 'go', 'go on', 'weiter', 'fortfahren', 'schließen', 'schliessen',
    'continuer', 'fermer', 'poursuivre', 'continuar', 'cerrar', 'continua', 'chiudi', 'prosegui', 'doorgaan', 'ga verder',
    'sluiten', 'verder', 'fechar', 'prosseguir', 'fortsätt', 'stäng', 'fortsæt', 'luk', 'fortsett', 'lukk', 'jatka', 'sulje',
    'zamknij', 'przejdź dalej', 'przechodzę do serwisu', 'przechodze do serwisu', 'weiterlesen', 'continue reading',
    'read on', 'zur seite', 'zur website', 'go to site', 'visit the site', 'lire la suite', 'seguir leyendo',
    'seguir navegando', 'continua a leggere', 'verder lezen', 'save', 'speichern', 'enregistrer', 'guardar', 'salva',
    'opslaan', 'zapisz', 'thanks', 'thank you', 'danke', 'vielen dank', 'merci', 'gracias', 'grazie', 'dzięki', 'bedankt',
    'please', 'bitte', 'recommended', 'empfohlen', 'recommandé', 'recomendado', 'consigliato', 'aanbevolen', 'zalecane'];

  function alternation(list) {
    return list
      .slice()
      .sort(function (x, y) { return y.length - x.length; })
      .map(function (v) { return normalize(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); })
      .filter(Boolean)
      .join('|');
  }
  var VERB = '(?:' + alternation(ACCEPT_VERBS) + ')';
  var WORD = '(?:' + alternation(ACCEPT_VERBS.concat(ALL, NOUN, TAIL)) + ')';
  // The whole label is made of the words above, and at least one of them is an
  // accept verb. Any other word ("only", "nur", "necessary", "selected",
  // "ablehnen", "not") makes it something else.
  var ACCEPT_RE = new RegExp('^(?=(?:.* )?' + VERB + '(?: |$))(?:' + WORD + ')(?: (?:' + WORD + '))*$', 'u');

  // True when a button label, taken as a whole, means accept / agree / OK.
  // "Nur essenzielle Cookies akzeptieren", "Accept selected" or "Auswahl
  // akzeptieren" do not match.
  function isAcceptLabel(text) {
    var label = normalize(text);
    if (label.length === 0 || label.length > 120) return false;
    return ACCEPT_RE.test(label);
  }

  // Every name the element shows or announces: visible text, aria-label, title,
  // alt and value. A "×" whose aria-label says "Accept" counts as accept.
  function labelsOf(el) {
    var out = [];
    try {
      out.push(el.innerText || el.textContent || '');
      ['aria-label', 'title', 'alt', 'value'].forEach(function (name) {
        var v = el.getAttribute(name);
        if (v) out.push(v);
      });
      if (typeof el.value === 'string' && el.value) out.push(el.value);
    } catch (e) {
      // nothing readable
    }
    return out.filter(function (t) { return typeof t === 'string' && t.trim(); });
  }

  // Checkboxes and radios are toggles, not buttons (their value is form data).
  // A switch-like element that is on is switched off by a click; its label names
  // a purpose ("Consent", "Zulassen"), not an answer.
  function isToggleOn(el) {
    var tag = (el.tagName || '').toLowerCase();
    var type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'input' && (type === 'checkbox' || type === 'radio')) return true;
    var role = (el.getAttribute('role') || '').toLowerCase();
    var toggleRole = role === 'switch' || role === 'checkbox' || role === 'radio' || role === 'menuitemcheckbox';
    return toggleRole && el.getAttribute('aria-checked') === 'true';
  }

  function isAcceptSingle(el) {
    if (!el || typeof el.getAttribute !== 'function') return false;
    if (isToggleOn(el)) return false;
    return labelsOf(el).some(isAcceptLabel);
  }

  // True when clicking this element would press an accept / agree / OK button:
  // the element itself, the button or link it sits in, or the control a <label>
  // points to.
  function isAcceptElement(el) {
    if (!el || typeof el.getAttribute !== 'function') return false;
    if (isAcceptSingle(el)) return true;
    try {
      var outer = typeof el.closest === 'function' ? el.closest('button, a[href], [role="button"], input[type="submit"], input[type="button"]') : null;
      if (outer && outer !== el && isAcceptSingle(outer)) return true;
      var control = (el.tagName || '').toLowerCase() === 'label' ? el.control : null;
      if (control && control !== el && isAcceptSingle(control)) return true;
    } catch (e) {
      return true; // cannot tell: do not click
    }
    return false;
  }

  CD.heuristic = {
    normalize: normalize,
    isAcceptLabel: isAcceptLabel,
    isAcceptElement: isAcceptElement,
  };
})();
