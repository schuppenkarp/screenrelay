# Docker, VPS und Umzug

## Lokaler Container

`compose.yaml` startet die App mit Node 24 und System-Chromium als Benutzer `node`, persistentem `wall_data`-Volume und Portbindung an `127.0.0.1`.

```sh
cp .env.example .env
# SETUP_KEY mit mindestens 24 zufälligen Zeichen setzen.
# Für eine unabhängige Installation ORGANIZATION_PRESET=neutral setzen.
docker compose config --quiet
docker compose up -d --build
docker compose logs --tail 100 wall
```

Eine native Anwendung auf Port 3000 vorher beenden oder `PORT=3001` in `.env` wählen. Intern bleibt der Containerport 3000. Das Docker-Volume enthält zunächst keine Daten der Windows-Installation.

## VPS mit HTTPS

Linux-VPS mit Docker/Compose, Domain mit passendem DNS und Ports 80/443. Als Ausgangspunkt 2 vCPU, 2–4 GB RAM und genügend SSD für Originale, Archiv und Chromium einplanen.

```dotenv
DOMAIN=wall.example.org
SETUP_KEY=REPLACE_WITH_RANDOM_SECRET_OF_AT_LEAST_24_CHARACTERS
ORGANIZATION_PRESET=neutral
MAX_STORAGE_MB=1024
```

```sh
docker compose -f compose.prod.yaml config --quiet
docker compose -f compose.prod.yaml up -d --build
docker compose -f compose.prod.yaml ps
```

Immer denselben Compose-Dateinamen bei weiteren Aufrufen verwenden. Caddy stellt automatisch HTTPS bereit; nur der Proxy veröffentlicht Ports. Sichere Cookies und Vertrauen zum einzelnen Proxy sind konfiguriert, `PUBLIC_ORIGIN` wird aus `DOMAIN` abgeleitet. Einrichtung unter `https://wall.example.org` mit dem Schlüssel durchführen.

Chromium läuft im Container ohne eigene Sandbox. Der Container ist unprivilegiert und verwendet `no-new-privileges`; Docker und Host aktuell halten.

## Bestehende Installation übernehmen

1. Windows-Anwendung über `scripts/stop-server.ps1` geordnet stoppen, vollständiges `data/` sichern.
2. Ein Tar-Archiv des **Inhalts** von `data/` geschützt zum VPS übertragen, unter `backups/migration.tar.gz` ablegen. Es enthält auch Zugangsschlüssel und WhatsApp-Sitzungen. `.env` separat für den Zielserver konfigurieren.
3. Ein leeres Zielvolume vorbereiten und importieren:

```sh
docker compose -f compose.prod.yaml create wall
docker compose -f compose.prod.yaml run --rm --no-deps --user root \
  -v "$PWD/backups:/backup:ro" --entrypoint sh wall \
  -c 'tar -xzf /backup/migration.tar.gz -C /app/data && chown -R node:node /app/data'
docker compose -f compose.prod.yaml up -d
```

Nicht über einen bereits verwendeten Zielbestand entpacken. Quellserver während des Umzugs gestoppt lassen. Browserprofile können plattformabhängig sein; WhatsApp gegebenenfalls neu per QR koppeln. Passwort, Bilder und Organisationseinstellungen kommen aus SQLite. Drive-Redirect-URI auf die Domain ergänzen. Bei aktivem Microsoft-Login die App-Adresse und Entra-Redirect-URI ebenfalls anpassen; `entra-secrets.key` zusammen mit SQLite übernehmen. Siehe [Entra-Einrichtung](microsoft-entra.md). Monitor-Link am Bildschirm öffnen; alte Cookies sind an den bisherigen Host gebunden.

## Abnahme

- Healthcheck, Adminlogin und Monitor-Link funktionieren.
- HTTPS, sichere Cookies und kein direkt öffentlich erreichbarer App-Port.
- Neues Bild importiert und 👍 bestätigt; ❌ archiviert.
- Infotafel und Kalender passen ins Viertel und aktualisieren sich.
- Aktivierte KI und Drive mit echten Zugangsdaten prüfen.
- Backup und Wiederherstellung auf einem getrennten Volume testen.

Ein Container-Build bestätigt noch keine echte WhatsApp-, Drive- oder KI-Verbindung. Nur eine Instanz darf ein Datenvolume verwenden. `docker compose down -v` löscht Daten und gehört nicht zum normalen Updateablauf.

## Verifizierter Docker-Stand

Am 6. Oktober 2026 mit Docker Desktop (Linux-Engine 29.2.0) geprüft:

- Image-Build aus dem Dockerfile erfolgreich.
- Beide Compose-Dateien mit Testwerten für Einrichtungsschlüssel und Domain validiert.
- Getrennter Container mit leerem Datenverzeichnis startet neutral als ScreenRelay.
- Healthcheck, geschützter Adminzugriff, Ersteinrichtung und Bild-Upload funktionieren.
- Sharp verarbeitet Bilder; Chromium startet headless und lädt die Anmeldeseite ohne JavaScript-Fehler.
- Das gespeicherte Bild bleibt nach einem Container-Neustart in SQLite erhalten.
- Nach der Template- und Modulaufteilung wurde das Image erneut gebaut. Der vollständige Admin-/Monitor-Browsertest läuft auch darin erfolgreich: Formulare, Bildverwaltung, Rich-Text, Gruppenregeln, zeitversetzte Bildwechsel und Touch-Rückkehr.

Der Testcontainer wurde anschließend entfernt. Die laufende native Installation wurde weder umgezogen noch mit dem Testcontainer verbunden. Echte WhatsApp-Kopplung, externe Integrationen, HTTPS auf einem VPS und Wiederherstellung in einen neuen Container sind durch diese Prüfung nicht abgedeckt.
