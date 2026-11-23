# Cookie Decliner installieren

Stand: 22.11.2026. Der Ordner, den der Browser lädt, ist immer
der Unterordner `extension` in diesem Projektordner.
Lass den Projektordner an seinem Platz; Chrome liest die Dateien bei jedem Start von dort.

| Browser | Temporär | Dauerhaft | Stand |
|---|---|---|---|
| Chrome | entfällt | „Entpackte Erweiterung laden" | getestet |
| Firefox | über `about:debugging` | signierte `.xpi` (eigenes Mozilla-Konto) | Ablehnen und Löschen getestet; Signieren nicht ausgeführt |
| Safari | „Unsignierte Erweiterungen erlauben" | mit Xcode selbst signieren | nicht getestet, Teile fehlen |

**Kurz gesagt:** In Chrome einmal laden, fertig. In Firefox erst temporär ausprobieren, dann über Weg A dauerhaft installieren. Safari vorerst auslassen.

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
2. Im Terminal:
   ```
   cd pfad/zu/cookie-decliner
   node tools/web-ext.mjs sign --source-dir extension --ignore-files "_metadata" "_metadata/**" --channel unlisted --api-key <Aussteller> --api-secret <Geheimnis> --artifacts-dir dist
   ```
3. Im Ordner `dist` liegt danach eine signierte `.xpi`.
4. `about:addons` → Zahnrad → **Add-on aus Datei installieren…** → die `.xpi` auswählen.
5. Schritte 4 und 5 aus dem temporären Weg einmalig setzen. Sie bleiben dann erhalten.
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

**Nicht getestet und in dieser Beta nicht vollständig.** Safari lädt Erweiterungen nur verpackt in einer Mac-App, die mit Xcode gebaut wird. Xcode ist auf diesem Mac installiert. Ein Probelauf des Apple-Umwandlers lief durch, meldete aber, dass Safari folgende Teile nicht unterstützt:

| Meldung des Umwandlers | Folge |
|---|---|
| `browsingData` | Der lokale Seitenspeicher wird beim Verlassen nicht gelöscht. Ob das Cookie-Löschen läuft, ist ungeprüft. |
| `world` | Seiten sehen das Privacy-Signal `navigator.globalPrivacyControl` nicht. |
| `type` (Hintergrund als Modul) | Möglicherweise startet der Hintergrundteil nicht. Dann lehnt die Erweiterung gar nichts ab. |
| `match_about_blank`, `match_origin_as_fallback` | Banner in eingebetteten leeren Frames werden nicht erreicht. |
| fehlende Symbole | Nur kosmetisch. |

Ob das Ablehnen der Banner in Safari funktioniert, weiß ich erst nach einem echten Test. Wenn du Safari ernsthaft nutzen willst, sag Bescheid, dann passe ich die Erweiterung dafür an.

### Zum Ausprobieren (temporär)

1. Im Terminal das Xcode-Projekt erzeugen:
   ```
   cd pfad/zu/cookie-decliner
   xcrun safari-web-extension-converter extension --project-location dist/safari --app-name "Cookie Decliner" --bundle-identifier local.cookiedecliner --macos-only --copy-resources
   ```
2. Xcode öffnet das Projekt. Oben auf **Ausführen** (▶) klicken. Die App „Cookie Decliner" startet einmal.
3. In Safari: **Einstellungen** → **Erweitert** → **Funktionen für Web-Entwickler anzeigen** einschalten.
4. **Einstellungen** → **Entwickler** → **Unsignierte Erweiterungen erlauben** einschalten (Mac-Passwort nötig).
5. **Einstellungen** → **Erweiterungen** → **Cookie Decliner** anhaken.
6. Dort **Websites bearbeiten** bzw. **Immer auf jeder Website erlauben** wählen.
7. Für private Fenster: in den Erweiterungs-Einstellungen **Im privaten Surfen erlauben** anhaken.

Die Einstellung aus Schritt 4 setzt Safari bei jedem Beenden zurück. Danach ist die Erweiterung wieder aus, bis du Schritt 4 wiederholst.

### Dauerhaft

Die App muss signiert sein, dann bleibt die Erweiterung ohne Schritt 4 aktiv.

1. In Xcode links das Projekt anklicken → **Signing & Capabilities**.
2. Für beide Ziele (App und Erweiterung) unter **Team** deine Apple-ID wählen. Ein kostenloses „Personal Team" sollte für den eigenen Mac genügen; das ist nicht geprüft.
3. Auf **Ausführen** (▶) klicken.
4. **Product** → **Show Build Folder in Finder** → die App „Cookie Decliner" aus `Products/Debug` in den Ordner „Programme" kopieren und von dort einmal starten.
5. Die Schritte 5 bis 7 von oben.

Die App muss auf dem Mac bleiben.

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

## Prüfen, ob sie läuft

1. `https://www.bild.de` öffnen: Die Abfrage „Akzeptieren oder PUR abonnieren" verschwindet nach etwa zwei Sekunden, die Seite ist scrollbar.
2. `https://www.otto.de` öffnen: Das Cookie-Banner verschwindet von selbst.
3. Alle bild.de-Tabs schließen und nach „bild" suchen; es darf kein Eintrag mehr da sein:
   - Firefox: **Einstellungen** → **Datenschutz & Sicherheit** → **Daten verwalten…**
   - Chrome: `chrome://settings/content/all`

Solange noch ein bild.de-Tab offen ist, wird nichts gelöscht. Einträge fremder Domains (Werbe- und Messdienste) fasst die Erweiterung nicht an.
