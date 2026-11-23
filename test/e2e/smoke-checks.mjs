// Fixture chain and checks shared by the Firefox and Safari smoke tests. Test code only.
//
// Both browsers load the fixtures in chain mode: each page moves on to the next
// by itself, and the fixture server records what happened.

export const ALL_FIXTURES = [
  { name: 'plain', expect: 'untouched', after: 4000 },
  { name: 'onetrust', expect: 'rejected' },
  { name: 'onetrust-settings', expect: 'rejected' },
  { name: 'cookiebot', expect: 'rejected' },
  { name: 'sourcepoint', expect: 'rejected' },
  { name: 'sourcepoint-manager', expect: 'rejected' },
  { name: 'usercentrics', expect: 'rejected' },
  { name: 'consentmanager', expect: 'rejected' },
  { name: 'didomi', expect: 'rejected' },
  { name: 'borlabs', expect: 'rejected' },
  { name: 'complianz', expect: 'rejected' },
  { name: 'generic-de', expect: 'rejected' },
  { name: 'generic-de-notwendige', expect: 'rejected' },
  { name: 'sourcepoint-wall', expect: 'untouched', after: 8000 },
  { name: 'accept-only', expect: 'untouched', after: 8000 },
  { name: 'accept-rule', expect: 'untouched', after: 8000 },
  { name: 'blocked-onetrust', expect: 'untouched', after: 14000 },
];

export function selectFixtures(only = process.env.CD_ONLY) {
  const list = ALL_FIXTURES.filter((fx) => !only || only.split(',').includes(fx.name));
  if (list.length === 0) throw new Error(`CD_ONLY=${only} selects no fixture`);
  return list;
}

export function chainUrls(server, fixtures) {
  return fixtures.map(
    (fx, i) => `${server.origin}/fixtures/${fx.name}.html?frame=${encodeURIComponent(server.frameOrigin)}&chain=${i}&after=${fx.after || 20000}`,
  );
}

export function budgetMs(fixtures) {
  return fixtures.reduce((sum, fx) => sum + (fx.after || 20000), 0) + 60000;
}

// `skip` names checks a browser cannot pass by design (reported, not counted).
export function runChecks(server, FIXTURES, check, skip = {}) {
  const has = (name) => FIXTURES.some((fx) => fx.name === name);
  const maybe = (name, ok, info) => {
    const key = Object.keys(skip).find((k) => name.startsWith(k));
    if (key) {
      process.stdout.write(`skip   ${name} (${skip[key]})\n`);
      return;
    }
    check(name, ok, info);
  };
  for (const fx of FIXTURES) {
    const ev = server.eventsFor(fx.name);
    const visited = server.requests.some((r) => r.path === `/fixtures/${fx.name}.html`);
    if (fx.expect === 'rejected') maybe(`${fx.name}: rejected`, ev.includes('rejected'), `visited=${visited} events: ${ev.join(',') || '(none)'}`);
    else maybe(`${fx.name}: left untouched`, visited && !ev.includes('rejected') && !ev.includes('accepted') && !ev.includes('subscribed'), `visited=${visited} events: ${ev.join(',')}`);
  }
  const bad = server.events.filter((e) => e.event === 'accepted' || e.event === 'subscribed');
  maybe('no fixture ever reported "accepted" or "subscribed"', bad.length === 0, JSON.stringify(bad));

  const ot = server.eventsFor('onetrust');
  if (has('onetrust')) maybe('onetrust: reject click came after the SDK was ready', ot.includes('sdk-ready') && ot.indexOf('sdk-ready') < ot.indexOf('rejected'), ot.join(','));
  const saved = server.events.find((e) => e.fixture === 'onetrust-settings' && e.event === 'rejected');
  if (has('onetrust-settings')) maybe('onetrust-settings: every optional toggle was off when saving', saved && saved.detail?.stillOn?.length === 0, JSON.stringify(saved?.detail));

  // The consentmanager fixture reports {api:true} only when __cmp('setConsent', 0)
  // was called in the page's own world, i.e. through scripting.executeScript.
  const cm = server.events.find((e) => e.fixture === 'consentmanager' && e.event === 'rejected');
  if (has('consentmanager')) maybe('consentmanager: rejected through the page-world API (MAIN-world eval works)', cm && cm.detail?.api === true, JSON.stringify(cm?.detail));

  if (has('plain')) maybe('navigator.globalPrivacyControl is true for the page (top frame)', server.eventsFor('plain').includes('gpc-top:true'), server.eventsFor('plain').join(','));
  if (has('plain')) {
    // plain.html embeds frame-child twice (a normal frame and a 1x1 pixel frame); both must see it.
    const frames = server.eventsFor('frame-child').filter((e) => e.startsWith('gpc-frame:'));
    maybe('navigator.globalPrivacyControl is true for the page (cross-origin child frame)', frames.length >= 2 && frames.every((e) => e === 'gpc-frame:true'), frames.join(','));
  }

  const byDest = {};
  for (const r of server.requests) (byDest[r.dest || '(none)'] ||= []).push(r);
  for (const dest of has('plain') ? ['document', 'iframe', 'script', 'style', 'image', 'empty'] : []) {
    const list = byDest[dest] || [];
    maybe(`Sec-GPC: 1 on every "${dest}" request (${list.length} seen)`, list.length > 0 && list.every((r) => r.gpc === '1'), JSON.stringify(list.filter((r) => r.gpc !== '1').slice(0, 3)));
  }
  const missing = server.requests.filter((r) => r.gpc !== '1');
  maybe(`Sec-GPC: 1 on all ${server.requests.length} requests the server received`, missing.length === 0, JSON.stringify(missing.slice(0, 5)));
  maybe('fixture server saw only known fixture routes', server.unknown.length === 0, server.unknown.join(' | '));

}
