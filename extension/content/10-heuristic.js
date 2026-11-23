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
  ];
  var ALL = '(?:all|alle|allen|alles|allem|every|tout|tous|toutes|todo|todos|todas|tudo|tutto|tutti|tutte|wszystkie|wszystko|alla|kaikki|vše|všetko|összes|toate|them all|to all|all of them)';
  var NOUN = '(?:(?:the|these|our|optional|alle|die|les|los|las|i|de) )?(?:cookies|cookie|cookies und tracking|tracking|services|dienste|partner|partners|vendors|purposes|zwecke|anbieter)';
  var TAIL = '(?: (?:(?:and|und|et|y|e|en|og|och|ja|a|i) )?(?:continue|close|proceed|go on|weiter|fortfahren|schließen|schliessen|continuer|fermer|poursuivre|continuar|cerrar|continua|chiudi|prosegui|doorgaan|sluiten|verder|fechar|prosseguir|fortsätt|stäng|fortsæt|luk|fortsett|lukk|jatka|sulje|weiterlesen|continue reading|read on|zur seite|zur website|go to site|visit the site|lire la suite|seguir leyendo|continua a leggere|verder lezen))?';
  var escaped = ACCEPT_VERBS.map(function (v) {
    return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  var VERB = '(?:' + escaped.join('|') + ')';
  // [all ][cookies ]VERB[ VERB ...][ all][ cookies][ and continue]
  // Several verbs in a row cover "Ja, ich bin einverstanden" and "OK, accept".
  var ACCEPT_RE = new RegExp(
    '^(?:' + ALL + ' )?(?:' + NOUN + ' )?' + VERB + '(?: ' + VERB + '){0,3}(?: ' + ALL + ')?(?: ' + NOUN + ')?' + TAIL + '$',
    'u',
  );

  // True when a button label, taken as a whole, means accept / agree / OK.
  // "Nur essenzielle Cookies akzeptieren", "Accept selected" or "Auswahl
  // akzeptieren" do not match: the pattern is anchored at both ends.
  function isAcceptLabel(text) {
    var label = normalize(text);
    if (label.length === 0 || label.length > 60) return false;
    return ACCEPT_RE.test(label);
  }

  function labelOf(el) {
    var text = '';
    try {
      text = el.innerText || el.textContent || '';
      if (!text.trim()) text = el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '';
    } catch (e) {
      text = '';
    }
    return typeof text === 'string' ? text : '';
  }

  // True when clicking this element would press an accept / agree / OK button.
  // Checkboxes and radios are toggles, not buttons, and are never matched here.
  function isAcceptElement(el) {
    if (!el || typeof el.getAttribute !== 'function') return false;
    var tag = (el.tagName || '').toLowerCase();
    var type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'input' && (type === 'checkbox' || type === 'radio')) return false;
    return isAcceptLabel(labelOf(el));
  }

  CD.heuristic = {
    normalize: normalize,
    isAcceptLabel: isAcceptLabel,
    isAcceptElement: isAcceptElement,
  };
})();
