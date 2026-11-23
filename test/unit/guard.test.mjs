// The hard deny-list: labels that mean accept / agree / OK must be recognised,
// and labels that decline (even when they contain an accept word) must not be.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension');
const sandbox = { CD: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(EXT, 'content', '10-heuristic.js'), 'utf8'), sandbox);
const { isAcceptLabel, isAcceptElement, normalize } = sandbox.CD.heuristic;

const MUST_VETO = [
  // de
  'Akzeptieren', 'Alle akzeptieren', 'Alle Cookies akzeptieren', 'Cookies akzeptieren', 'Akzeptieren und schließen',
  'Akzeptieren & schließen', 'AKZEPTIEREN', 'Zustimmen', 'Allen zustimmen', 'Zustimmen und weiter', 'Zustimmen und schließen',
  'Ich stimme zu', 'Einverstanden', 'Ich bin einverstanden', 'Alle zulassen', 'Alle erlauben', 'Zulassen', 'Alle annehmen',
  'Verstanden', 'Alles klar', 'OK', 'Ok', 'Okay', 'Ja', 'Alles akzeptieren', 'Akzeptieren ✓', '  Alle  akzeptieren  ',
  // en
  'Accept', 'Accept all', 'Accept All Cookies', 'Accept cookies', 'Accept & continue', 'Accept and close', 'I accept',
  'Agree', 'I agree', 'Agree and continue', 'Agree to all', 'Allow all', 'Allow all cookies', 'Allow', 'Allow cookies',
  'Got it', 'Got it!', 'Yes', 'Yes, I agree', 'I understand', 'Consent', 'Enable all', 'ACCEPT ALL', 'Accept all & close',
  // other languages
  "J'accepte", 'Tout accepter', 'Accepter', 'Accepter et continuer', "D'accord", 'Aceptar', 'Aceptar todo', 'Aceptar todas',
  'Accetta', 'Accetta tutto', 'Accetto', 'Accepteren', 'Alles accepteren', 'Akkoord', 'Aceitar', 'Aceitar tudo',
  'Akceptuję', 'Zgadzam się', 'Acceptera alla', 'Godkänn alla', 'Accepter alle', 'Tillad alle', 'Godta alle', 'Hyväksy kaikki',
  'Přijmout vše', 'Souhlasím',
];

const MUST_NOT_VETO = [
  // de: decline, necessary-only, save, settings
  'Ablehnen', 'Alle ablehnen', 'Alles ablehnen', 'Nur notwendige', 'Nur notwendige Cookies', 'Nur essenzielle Cookies',
  'Nur essenzielle Cookies akzeptieren', 'Nur notwendige Cookies akzeptieren', 'Nur erforderliche Cookies zulassen',
  'Notwendige Cookies akzeptieren', 'Auswahl akzeptieren', 'Auswahl speichern', 'Auswahl bestätigen', 'Auswahl erlauben',
  'Speichern', 'Speichern & Schließen', 'Meine Auswahl bestätigen', 'Einstellungen', 'Cookie-Einstellungen',
  'Weiter ohne Zustimmung', 'Ohne Zustimmung fortfahren', 'Nicht akzeptieren', 'Nicht zustimmen', 'Verweigern',
  'Mehr erfahren', 'Individuelle Datenschutzeinstellungen', 'Schließen', 'Optionale Cookies ablehnen',
  // en
  'Reject', 'Reject all', 'Decline', 'Decline all', 'Deny', 'Deny all', 'Refuse', 'Disagree', 'I do not agree', 'Do not accept',
  "Don't allow", 'Only necessary', 'Accept only necessary', 'Accept necessary', 'Accept necessary cookies', 'Allow necessary only',
  'Allow selection', 'Accept selected', 'Accept selection', 'Use necessary cookies only', 'Continue without accepting',
  'Save', 'Save preferences', 'Save & exit', 'Confirm my choices', 'Manage options', 'Settings', 'Close', 'No', 'No thanks',
  'Reject non-essential', 'Refuse non-essential cookies', 'Necessary only', 'Essential only',
  // other languages
  'Tout refuser', 'Refuser', 'Continuer sans accepter', 'Rechazar', 'Rechazar todo', 'Rifiuta', 'Rifiuta tutto', 'Weigeren',
  'Alles weigeren', 'Alleen noodzakelijke', 'Odrzuć wszystkie', 'Avvisa alla', 'Afvis alle', 'Hylkää kaikki',
  // not button labels at all
  '', '   ', '×', 'x',
  'Wir verwenden Cookies. Mit Klick auf Akzeptieren stimmen Sie der Verwendung aller Cookies zu, Sie können dies jederzeit widerrufen.',
];

test('normalize: case, punctuation, whitespace', () => {
  assert.equal(normalize('  Alle\n  AKZEPTIEREN! '), 'alle akzeptieren');
  assert.equal(normalize("J'accepte"), 'j accepte');
  assert.equal(normalize('Accept & close ✓'), 'accept close');
  assert.equal(normalize(null), '');
  assert.equal(normalize(undefined), '');
});

for (const label of MUST_VETO) {
  test(`accept label is vetoed: "${label.trim()}"`, () => assert.equal(isAcceptLabel(label), true));
}
for (const label of MUST_NOT_VETO) {
  test(`not an accept label: "${label.slice(0, 50)}"`, () => assert.equal(isAcceptLabel(label), false));
}

test('isAcceptElement: reads text, value and aria-label; never matches toggles', () => {
  const el = (props) => ({ tagName: 'BUTTON', textContent: '', getAttribute: (n) => (props.attrs || {})[n] ?? null, ...props });
  assert.equal(isAcceptElement(el({ textContent: ' Alle akzeptieren ' })), true);
  assert.equal(isAcceptElement(el({ innerText: 'OK', textContent: 'OK' })), true);
  assert.equal(isAcceptElement(el({ tagName: 'INPUT', value: 'Akzeptieren', attrs: { type: 'submit' } })), true);
  assert.equal(isAcceptElement(el({ attrs: { 'aria-label': 'Accept all cookies' } })), true);
  assert.equal(isAcceptElement(el({ textContent: 'Ablehnen' })), false);
  assert.equal(isAcceptElement(el({ tagName: 'INPUT', value: 'ok', attrs: { type: 'checkbox' } })), false);
  assert.equal(isAcceptElement(el({ tagName: 'INPUT', value: 'accept', attrs: { type: 'radio' } })), false);
  assert.equal(isAcceptElement(null), false);
  assert.equal(isAcceptElement({}), false);
});
