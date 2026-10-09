# Entwicklung und GitHub

Für Codeänderungen gelten die [Wartungsleitlinien](../CONTRIBUTING.md).

Node 24 verwenden, `npm ci` ausführen und eine eigene `.env` mit separatem `DATA_DIR` anlegen. Niemals Tests oder eine zweite Entwicklungsinstanz auf Produktionsdaten richten. Tests verwenden temporäre Verzeichnisse und simulierte externe Dienste.

```sh
npm run dev
npm run format
npm run check
npm run format:check
npm test
npm run release:check
```

Prettier und `.editorconfig` vereinheitlichen Formatierung und Zeilenenden. ESLint prüft unter anderem fehlende Variablen, unbenutzte Importe und unerreichbaren Code; der Syntaxcheck durchsucht auch Unterverzeichnisse. GitHub Actions prüft Node 24, Formatierung, Tests und Veröffentlichungskandidaten und baut das Docker-Image mit HTTP-Smoke-Test. Die Action veröffentlicht kein Image und deployt keinen Server.

Anzeigeänderungen zusätzlich im Browser mit Quer-/Hochformat, geteilten Fotos, langen Texten und 1920 × 1080 prüfen. Echte WhatsApp-Kopplung, Drive-OAuth und OpenAI mit eigenem Schlüssel sind manuelle Integrationsprüfungen; Mock-Tests ersetzen diese nicht.

## Veröffentlichung vorbereiten

Das Repository enthält Quellcode, neutrale Assets und Markdown-Dokumentation. `.gitignore` schließt Laufzeitdaten, `.env`, Schlüssel, Backups und einmalige Kontaktpflege-Skripte aus. `.dockerignore` und explizite `COPY`-Anweisungen halten diese Daten aus dem Image heraus.

```sh
git status --short
npm run release:check
git add .
git diff --cached --stat
git diff --cached
```

Den vollständigen Inhalt vor dem Commit prüfen, insbesondere persönliche Daten, Kalenderquellen, Beispielkonfiguration und Markenassets. Der Schlüsselprüfer erkennt bekannte Muster, nicht sämtliche vertraulichen Daten. Eigene Kalenderquellen ausschließlich im Adminbereich speichern.

Die Anwendung wird unter AGPL-3.0-only veröffentlicht; `LICENSE` muss Teil jeder Veröffentlichung bleiben. Drittanbieter- und Markenrechte separat beachten. Keine persönliche Infotafel aus der lokalen Installation als Demo exportieren.

## GitHub

Ein leeres Repository erstellen und die konkrete URL einsetzen. Vorhandenen Git-Verlauf erhalten, aktuellen Branch mit `git branch --show-current` prüfen.

```sh
git commit -m "Prepare ScreenRelay for public release"
git remote add origin https://github.com/ACCOUNT/wallrelay.git
git push -u origin HEAD
```

Falls `origin` vorhanden ist, zuerst `git remote -v` prüfen und nicht blind überschreiben. CI benötigt keine GitHub-Secrets. Tatsächliches Deployment oder Image-Publishing erfordert spätere separate Einrichtung. Produktive Versionen mit Tags kennzeichnen.

## Bereinigtes Quellpaket

`npm run release:package` prüft den Veröffentlichungsumfang und kopiert ausschließlich die von Git berücksichtigten Dateien nach `releases/wallrelay-<Zeitstempel>/`. Eine SHA-256-Dateiliste liegt als `RELEASE-MANIFEST.json` bei. Nur diesen Ordner veröffentlichen, niemals das vollständige Arbeitsverzeichnis. Der Export enthält weder Git-Verlauf noch lokale Laufzeitdaten.

Die eigene Installation bleibt über ihr privates `data/` erhalten, einschließlich Organisation, hochgeladener Logos, Infotafel, Fotos, Archiv und Integrationsschlüssel. Für einen Serverumzug diese Daten separat nach der [Deployment-Anleitung](deployment.md) übertragen. Ein neues leeres Datenverzeichnis startet neutral.

Bei öffentlich zugänglichem Betrieb einer veränderten Version die Anforderungen von Abschnitt 13 der AGPL beachten und Nutzern Zugang zum entsprechenden Quellcode anbieten. Drittanbieter-Lizenzen in `public/vendor/` und die Nunito-OFL in `public/assets/fonts/` beibehalten.

## Adminbereich im Browser prüfen

`npm run test:browser` startet eine getrennte temporäre Installation und einen Headless-Browser. Zuvor `PUPPETEER_EXECUTABLE_PATH` auf einen installierten Chrome-/Chromium-Browser setzen. Der Test prüft Einrichtung, alle Adminseiten, Editor-Dialoge, Speichern von Einstellungen, Foto-Upload, Bearbeiten, Suche, Fixieren, Archivieren und Abmelden. Produktivdaten und gekoppelte Konten werden nicht verwendet. Der Browser wird nicht automatisch heruntergeladen.

Der Browser-Test prüft außerdem Infotafel-Rich-Text, gespeicherte Gruppenregeln, HTML-artige Namen als reinen Text, mehrere Monitorfelder ohne gleichzeitige Wechsel und die zeitgesteuerte Rückkehr aus dem Touch-Modus. Screenshots liegen unter `test-results/`; `BROWSER_TEST_ARTIFACT_DIR` kann den Ausgabeort ändern. In GitHub Actions läuft derselbe Test mit dem System-Chromium des gebauten Docker-Images. Im Container wird dessen bestehende `CHROMIUM_NO_SANDBOX=true`-Einstellung übernommen; lokal bleibt die Browser-Sandbox aktiv.

### Tabellen im Infotafel-Editor

Der Editor unterstützt Tabellen mit drei anfänglichen Spalten. Nach Klick in eine Zelle können Zeilen und Spalten hinzugefügt oder entfernt und die gesamte Tabelle gelöscht werden. Tab und Umschalt+Tab wechseln zwischen vorhandenen Zellen. Der Button „Trennlinie“ fügt eine mit der Löschtaste entfernbare horizontale Linie ein. Tabellenzeilen werden in Editor, Vorschau und Monitor durch Linien getrennt. Mehrere Ansprechpartner können innerhalb einer Zelle mit Umschalt+Enter getrennt werden.

Die Strukturaktionen liegen in `public/notice-tables.js`, die Toolbar in `public/templates/notice-editor.html`. Änderungen verwenden die Undo-/Redo-Historie des Browsers und durchlaufen beim Speichern weiterhin `cleanNotice`. Der Browser-Test prüft die Strukturaktionen und das Einfügen einer Trennlinie.

Die Infotafel passt ihre Schrift automatisch in Breite und Höhe ein, einschließlich vorhandener Tabellen und individueller Schriftgrößen. Kleine Inhalte werden vergrößert, umfangreiche verkleinert; relative Größen bleiben erhalten. `notice-layout.js` misst dazu Textumbruch und Mindestbreite. Der Editor zeigt im eingebetteten 960 × 540-Infofeld dieselbe Monitor-Komponente samt aktuellem Kalender; die Vorschau wird proportional auf die verfügbare Editorbreite verkleinert. Dieses 16:9-Referenzfeld entspricht einem Viertel eines Full-HD-Monitors; abweichende Rasterfeld-Proportionen können anders umbrechen. Die gespeicherten Schriftgrößen werden durch das Einpassen nicht verändert.
