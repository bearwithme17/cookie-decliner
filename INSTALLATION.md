# Cookie Decliner installieren

Stand: 23.11.2026. Chrome und Firefox laden den Unterordner `extension` in diesem Projektordner.
Safari lädt eine Mac-App, die du mit Xcode aus diesem Ordner baust.
Lass den Projektordner an seinem Platz; Chrome liest die Dateien bei jedem Start von dort.

| Browser | Temporär | Dauerhaft | Stand |
|---|---|---|---|
| Chrome | entfällt | „Entpackte Erweiterung laden" | getestet |
| Firefox | über `about:debugging` | signierte `.xpi` (Mozilla) | Ablehnen und Löschen getestet; Signatur durch Mozilla ausstehend |
| Safari | „Unsignierte Erweiterungen erlauben" | mit eigener Apple-ID signieren | Ablehnen, Privacy-Signal und Cookie-Löschen getestet; Seitenspeicher wird nicht gelöscht |

**Kurz gesagt:** In Chrome einmal laden, fertig. In Firefox erst temporär ausprobieren, dann über Weg A dauerhaft installieren. In Safari die App bauen und einmal starten.

---

## Chrome

In Chrome gibt es keinen Unterschied zwischen temporär und dauerhaft: Eine entpackt geladene Erweiterung bleibt über Neustarts hinweg installiert.

### Installieren

1. `chrome://extensions` öffnen.
2. Oben rechts **Entwicklermodus** einschalten.
3. **Entpackte Erweiterung laden** klicken und den Ordner `extension` auswählen.
4. Für Inkognito-Fenster: **Details** → **Im Inkognitomodus zulassen**.

### Gut zu wissen

- Der Entwicklermodus muss eingeschaltet bleiben.
- Chrome zeigt beim Start gelegentlich einen Hinweis auf Erweiterungen im Entwicklermodus. Der Hinweis lässt sich schließen.
- Nach einem größeren Chrome-Update kann die Erweiterung deaktiviert sein. Dann auf `chrome://extensions` wieder einschalten.
- Nach einer Änderung an den Dateien: auf `chrome://extensions` den Neu-laden-Pfeil der Erweiterung klicken.
- Entfernen: auf `chrome://extensions` **Entfernen** klicken.

---

## Firefox

Das normale Firefox installiert dauerhaft nur signierte Erweiterungen. Zum Ausprobieren reicht der temporäre Weg.

### Temporär (weg nach jedem Firefox-Neustart)

1. `about:debugging#/runtime/this-firefox` öffnen.
2. **Temporäres Add-on laden…** klicken.
3. Die Datei `extension/manifest.json` auswählen.
4. `about:addons` → **Cookie Decliner** → Reiter **Berechtigungen** → **Auf Ihre Daten für alle Websites zugreifen** einschalten. Ohne diesen Schalter läuft die Erweiterung auf keiner Seite.
5. Für private Fenster: Reiter **Details** → **In privaten Fenstern ausführen** → **Erlauben**. Danach ein neues privates Fenster öffnen.

Nach jedem Firefox-Neustart ist die Erweiterung weg: Schritte 1 bis 3 wiederholen, dann 4 und 5 prüfen. Die Freigabe für private Fenster geht dabei verloren. Ist sie aktiv, steht in `about:addons` ein kleines Masken-Symbol neben dem Namen.

Nach einer Änderung an den Dateien: unter `about:debugging` bei Cookie Decliner **Neu laden** klicken und Schritt 5 prüfen.

### Dauerhaft, Weg A: selbst signieren (empfohlen)

Du brauchst ein eigenes Mozilla-Konto. Der Code wird dabei zur automatischen Prüfung an Mozilla hochgeladen, aber nicht öffentlich gelistet.

1. Auf `https://addons.mozilla.org/developers/addon/api/key/` anmelden und API-Schlüssel erzeugen. Du bekommst einen **JWT-Aussteller** und ein **JWT-Geheimnis**.
2. Die beiden in eine Datei schreiben, die nur du lesen kannst, z. B. `~/.web-ext-keys` (danach `chmod 600 ~/.web-ext-keys`):
   ```
   WEB_EXT_API_KEY=<Aussteller>
   WEB_EXT_API_SECRET=<Geheimnis>
   ```
   So stehen die Schlüssel nie auf der Kommandozeile oder im Verlauf des Terminals.
3. Im Terminal:
   ```
   cd pfad/zu/cookie-decliner
   set -a; . ~/.web-ext-keys; set +a
   node tools/web-ext.mjs sign --source-dir extension --ignore-files "_metadata" "_metadata/**" ".amo-upload-uuid" --channel unlisted --artifacts-dir dist
   ```
4. Im Ordner `dist` liegt danach eine signierte `.xpi`.
5. `about:addons` → Zahnrad → **Add-on aus Datei installieren…** → die `.xpi` auswählen.
6. Schritte 4 und 5 aus dem temporären Weg einmalig setzen. Sie bleiben dann erhalten.
6. Empfohlen: im Reiter **Details** die **automatischen Updates** für dieses Add-on ausschalten, damit Firefox dafür nicht bei Mozilla nachfragt.

Bei jeder neuen Version der Erweiterung: in `extension/manifest.json` die `version` erhöhen, Schritt 2 wiederholen, neue `.xpi` installieren.

Geprüft ist nur, dass der Befehl startet und diese Optionen kennt. Das Signieren selbst wurde nicht ausgeführt, weil es deine Zugangsdaten braucht. Falls es scheitert: die `.xpi` aus Weg B auf `https://addons.mozilla.org/developers/` unter „Neues Add-on einreichen" → „Selbst verteilen" hochladen und die signierte Datei dort herunterladen.

### Dauerhaft, Weg B: Firefox Developer Edition, Nightly oder ESR

Diese Firefox-Varianten erlauben unsignierte Erweiterungen.

1. In `about:config` den Wert `xpinstall.signatures.required` auf `false` setzen.
2. Im Terminal `sh tools/package-firefox.sh` ausführen. Die Datei `dist/cookie-decliner-1.0.0.xpi` liegt bereits bereit.
3. `about:addons` → Zahnrad → **Add-on aus Datei installieren…** → die `.xpi` auswählen.
4. Berechtigung für alle Websites und, falls gewünscht, private Fenster wie oben setzen.

Im normalen Firefox wirkt diese Einstellung nicht.

### Entfernen

`about:addons` → Cookie Decliner → **…** → **Entfernen**.

---

## Safari

Safari lädt Erweiterungen nur verpackt in einer Mac-App. Die App baust du mit Xcode; dafür gibt es ein Skript.

Was in Safari anders ist:

- Beim Verlassen einer Bezahl-oder-Akzeptieren-Seite werden nur ihre Cookies gelöscht. Safari bietet Erweiterungen keine Möglichkeit, den Seitenspeicher (localStorage, IndexedDB) zu löschen.
- Safari wiederholt manchmal einen Seitenaufruf intern. Dieser zweite Aufruf geht gelegentlich ohne das Privacy-Signal `Sec-GPC` raus (in den Tests 2 von etwa 75 Seitenaufrufen). Die Seite selbst sieht `navigator.globalPrivacyControl` trotzdem.

### App bauen

Du brauchst Xcode und Node.js. Im Terminal:

```
cd pfad/zu/cookie-decliner
npm install
npm run build:safari
open "dist/safari/Cookie Decliner.app"
```

Die App öffnet ein kleines Fenster und kann wieder geschlossen werden. Lass sie im Ordner `dist/safari` liegen oder verschiebe sie in den Ordner „Programme".

### In Safari einschalten

1. **Safari** → **Einstellungen** → **Erweitert** → **Funktionen für Web-Entwickler anzeigen** einschalten.
2. **Einstellungen** → **Entwickler** → **Unsignierte Erweiterungen erlauben** einschalten (Mac-Passwort nötig).
3. **Einstellungen** → **Erweiterungen** → **Cookie Decliner** anhaken.
4. Dort **Auf jeder Website immer erlauben …** klicken und bestätigen. Ohne diesen Schritt tut die Erweiterung nichts.
5. Für private Fenster: **In „Privates Surfen" erlauben** anhaken.

Schritt 2 setzt Safari bei jedem Beenden zurück. Danach ist die Erweiterung aus, bis du Schritt 2 wiederholst. Das entfällt mit einer signierten App (nächster Abschnitt).

### Signiert bauen (dauerhaft, kostenlos)

Noch nicht ausprobiert: Auf diesem Mac war beim Test keine Apple-ID in Xcode eingetragen.

1. In Xcode: **Xcode** → **Einstellungen** → **Accounts** → **+** → Apple-ID hinzufügen. Es erscheint ein „Personal Team".
2. Die Team-ID ablesen: im selben Fenster das Team anklicken; sie steht dort als zehnstellige Kennung (z. B. `AB12CD34EF`).
3. Im Terminal:
   ```
   CD_TEAM=AB12CD34EF npm run build:safari
   open "dist/safari/Cookie Decliner.app"
   ```
4. Die Schritte 3 bis 5 von oben. Schritt 2 ist nicht mehr nötig.

Eine so signierte App läuft nur auf deinem eigenen Mac. Für andere braucht es eine Developer ID aus dem kostenpflichtigen Apple Developer Program.

### Entfernen

Die App „Cookie Decliner" löschen. Damit verschwindet die Erweiterung aus Safari.

---

## Einstellungen der Erweiterung

Das Ablehnen von Bannern ist immer an und braucht keine Einstellung. Es gibt nur zwei Schalter (englisch beschriftet):

| Schalter | Standard | Wirkung |
|---|---|---|
| Wipe pay-or-accept sites when I leave | an | Löscht Cookies und Seitenspeicher von Bezahl-oder-Akzeptieren-Seiten, sobald ihr letzter Tab geschlossen ist oder zu einer anderen Seite wechselt |
| Wipe every site when I leave | aus | Dasselbe für jede Website. Meldet dich überall ab. |

Zu finden unter:
- Chrome: `chrome://extensions` → **Details** → **Erweiterungsoptionen**
- Firefox: `about:addons` → Cookie Decliner → **Einstellungen**
- Safari: **Einstellungen** → **Erweiterungen** → Cookie Decliner → **Einstellungen**

## Prüfen, ob sie läuft

1. `https://www.bild.de` öffnen: Die Abfrage „Akzeptieren oder PUR abonnieren" verschwindet nach etwa zwei Sekunden, die Seite ist scrollbar.
2. `https://www.otto.de` öffnen: Das Cookie-Banner verschwindet von selbst.
3. Alle bild.de-Tabs schließen und nach „bild" suchen; es darf kein Eintrag mehr da sein:
   - Firefox: **Einstellungen** → **Datenschutz & Sicherheit** → **Daten verwalten…**
   - Chrome: `chrome://settings/content/all`
   - Safari: **Einstellungen** → **Datenschutz** → **Websitedaten verwalten …** (dort bleibt in Safari ein Eintrag für den Seitenspeicher; die Cookies sind weg)

Solange noch ein bild.de-Tab offen ist, wird nichts gelöscht. Einträge fremder Domains (Werbe- und Messdienste) fasst die Erweiterung nicht an.
