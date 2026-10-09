# ScreenRelay

Eine selbst gehostete Bilderwand für Vereine, Werkstätten und Unternehmen: Fotos aus mehreren WhatsApp-Gruppen, fixierte Bilder, eine bearbeitbare Infotafel und Termine aus einem iCalendar-Kalender. Ein Browser am Monitor genügt.

ScreenRelay startet ohne Organisationsdaten, Kalenderquelle oder Kontoverbindungen. Name, Logos, Farben, Kontaktdaten und Integrationen werden ausschließlich im Adminbereich eingerichtet und im privaten Datenverzeichnis gespeichert.

## Funktionen

- Einstellbares Raster mit 1–4 Spalten und 1–3 Zeilen, Abständen und Infotafelposition. Standard: vier Bildschirmfelder, Querformat einzeln und Hochformat paarweise. Zeitlich versetzte Wechsel, zufällige Reihenfolge und einstellbare Übergänge.
- Eine Infotafel mit Rich-Text-Editor, numerischen Schriftgrößen, Farben, Schriftarten einschließlich lokalem Nunito und Vorschau. Kalender und Infotext teilen sich ein Bildschirmfeld.
- Fixierbare HTTP-Kameras: MJPEG, HLS, HTTP-FLV/Reolink und browserfähiges Video. Optionale Touch-Ansicht zeigt ausgewählte fixe Inhalte gleichzeitig als Raster und kehrt nach einstellbarer Zeit zur Rotation zurück.
- Einstellbare Lebensdauer, Mindestbestand und Anzeigelimit; fixierte Bilder bleiben erhalten. Originale werden gespeichert und gelöschte Fotos archiviert.
- WhatsApp-Import mit 👍, ❌ zum Archivieren und ✅ zur Freigabe gesperrter Fotos. Bildtexte und sichere Absendernamen; reiner Text wird ignoriert.
- Kostenlose OpenAI-Moderation für problematische Inhalte; optionale Ausrichtungsprüfung mit Gemini oder OpenRouter. Unklare Bilder bleiben gesperrt und erhalten ❓ sowie eine einstellbare WhatsApp-Antwort.
- Optional Google Drive für aktive, inaktive und gelöschte Fotos, mit lokalem Cache.
- Admin-Masterkennwort plus optionale Microsoft-365-/Entra-Anmeldung für freigegebene Benutzer; separater Monitor-Link. Fotos sind zugriffsgeschützt.

## Docker-Schnellstart

Voraussetzung: Docker mit Compose und laufendem Linux-Container-Dienst.

1. `.env.example` nach `.env` kopieren.
2. `SETUP_KEY` auf einen zufälligen Wert mit mindestens 24 Zeichen setzen, beispielsweise mit `openssl rand -hex 24`.
3. Die neutrale Konfiguration ist Standard; Organisation und Integrationen nach dem Start einrichten.
4. Starten:

```sh
docker compose up -d --build
docker compose ps
```

Auf [http://127.0.0.1:3000](http://127.0.0.1:3000) mit dem Einrichtungsschlüssel ein Adminpasswort festlegen. WhatsApp verbinden und Gruppen wählen; unter Monitor den Bildschirm-Link öffnen. Der lokale Docker-Port ist nur auf dem Host erreichbar. Für den VPS mit HTTPS die [Deployment-Anleitung](docs/deployment.md) verwenden.

## Lokal entwickeln

Node.js mindestens 22.11, empfohlen Node 24. Für WhatsApp `PUPPETEER_EXECUTABLE_PATH` auf ein installiertes Chrome/Chromium setzen. Docker bringt Chromium mit; automatische Browserdownloads sind deaktiviert.

```sh
npm ci
npm start
npm run check
npm run format:check
npm test
npm run release:check
```

Ohne `.env` hört die App auf `127.0.0.1:3000`, speichert in `./data` und erlaubt die Ersteinrichtung nur auf diesem Computer.

## Dokumentation

- [Monitor-Zugang und Token-Links](docs/viewer-access.md)
- [Versionen und einfache Server-Updates](docs/updates.md)
- [Einstellungen und Vorlagen](docs/configuration.md)
- [Architektur, HTML-Templates und Wartung](docs/architecture.md)
- [Zum Code beitragen](CONTRIBUTING.md)
- [Entwicklung und GitHub-Veröffentlichung](docs/development.md)
- [Docker, VPS und Umzug](docs/deployment.md)
- [Vorhandener Reverse Proxy und privates Migrationspaket](docs/external-proxy.md)
- [Betrieb, Backups und Integrationen](docs/operations.md)
- [Google Drive einrichten](docs/google-drive.md)
- [Microsoft 365 / Entra ID einrichten](docs/microsoft-entra.md)
- [Kameras, Layout und Touch-Ansicht](docs/cameras-and-touch.md)

## Daten und Grenzen

Eine Instanz verwaltet eine Organisation, mehrere ausgewählte WhatsApp-Gruppen und einen Monitorbestand. Mehrere Organisationen benötigen getrennte Instanzen und Datenvolumes. Die Oberfläche ist deutsch; Region und Zeitzone sind einstellbar.

`data/`, `.env`, Sitzungen, API-Schlüssel und lokale Kontaktpflege-Skripte gehören nicht in Git oder das Docker-Image. Der Git-Prüflauf erkennt typische private Dateien und Schlüssel, ersetzt aber keine Sichtprüfung. Persönliche Infotafeln, Logos und Kalenderquellen bleiben ausschließlich im Datenverzeichnis.

WhatsApp verwendet die inoffizielle Bibliothek whatsapp-web.js und kann bei Änderungen Anpassungen oder erneutes Koppeln erfordern. KI-Ergebnisse garantieren keine korrekte Moderation oder Ausrichtung. Bekannte Paketbefunde stehen in der Betriebsdokumentation.

Der Anwendungscode steht unter **GNU AGPL-3.0-only**; siehe [LICENSE](LICENSE). Nunito und gebündelte Bibliotheken behalten ihre eigenen mitgelieferten Lizenzen.
