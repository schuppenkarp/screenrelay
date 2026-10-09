# Betrieb, Sicherung und Integrationen

## Backups und Updates

Das gesamte `DATA_DIR` sichern: SQLite, Medien, Originale, `deleted`, Branding, private Integrationsdaten und WhatsApp-Profil. Google Drive ersetzt nicht das Backup von Datenbank, Einstellungen und Zugangsdaten.

Für konsistente Sicherungen die App stoppen:

```sh
docker compose -f compose.prod.yaml stop wall
mkdir -p backups
docker compose -f compose.prod.yaml run --rm --no-deps --user root \
  -v "$PWD/backups:/backup" --entrypoint sh wall \
  -c 'tar -czf /backup/wall-data.tar.gz -C /app/data .'
docker compose -f compose.prod.yaml start wall
```

Das Archiv anschließend mit Datumsnamen außerhalb des Servers sichern. Es enthält private Inhalte und Zugangsdaten. Wiederherstellung nur in eine gestoppte Instanz mit leerem Zielvolume; Eigentümer auf `node:node` setzen, siehe [Deployment](deployment.md).

Updates: Backup, neuen Versionsstand einspielen, `docker compose -f compose.prod.yaml up -d --build`, Logs und Monitor prüfen. Das Volume bleibt erhalten. Bei Datenbankmigrationen für Rollbacks einen kompatiblen Datenstand aus der Sicherung verwenden.

## Windows

`scripts/start-server.ps1` startet verborgen mit Supervisor; `stop-server.ps1` beendet geordnet. `install-autostart.ps1` / `remove-autostart.ps1` verwalten den Start bei Benutzeranmeldung. Sie verwenden `data/` und den Standardport; bei anderer Konfiguration anpassen. Der Registrierungseintrag heißt `ScreenRelay`.

Status: `data/managed-server.json`, Logs: `data/server.stdout.log` / `data/server.stderr.log`. PC eingeschaltet und wach lassen. Für Docker diese Windows-Skripte nicht verwenden.

## WhatsApp

QR scannen und eine oder mehrere Gruppen auswählen. Pro Gruppe lassen sich alle Bilder oder nur Bilder mit einem bestimmten Hashtag übernehmen; Groß-/Kleinschreibung ist dabei egal. Bildnachrichten dieser Gruppen werden verarbeitet, auch vom verbundenen Account. Andere Gruppen, Privatnachrichten, reiner Text, Videos, Sticker, Dokumente und erkannte Einmalansicht-Bilder werden ignoriert.

| Reaktion                   | Wirkung                                            |
| -------------------------- | -------------------------------------------------- |
| App sendet 👍              | Speicherung bestätigt, unabhängig von Sichtbarkeit |
| Teilnehmer sendet ❌       | Foto archivieren und aus Mediathek entfernen       |
| App sendet ❓ plus Antwort | KI-Sperre                                          |
| Teilnehmer sendet ✅       | KI-gesperrtes Bild freigeben                       |

Diese Reaktionen müssen zum Foto aus einer gewählten Gruppe gehören. Freigabe und Archivierung sind aktuell nicht auf bestimmte Gruppenadmins beschränkt. Teilnehmer der Gruppe können sie auslösen. Nicknames werden angezeigt, Telefonnummern und WhatsApp-IDs ausgeblendet. Bildtexte erscheinen nur bei ausreichendem Platz; Änderungen werden übernommen.

Nach Wiederverbindung werden bis zu 100 jüngste Nachrichten pro ausgewählter Gruppe aus den letzten 48 Stunden nachgeholt. Das ist eine begrenzte Wiederherstellung, kein vollständiger Export. Empfangs-IDs verhindern Doppelimport und Wiederbelebung archivierter Fotos. Fehlgeschlagene 👍-Bestätigungen werden erneut versucht.

## OpenAI

Unter **Einstellungen → KI-Bildprüfung** eigenen API-Schlüssel geschützt hinterlegen und aktivieren. Anzeigeversionen und Bildtexte werden an die kostenlose OpenAI-Moderation gesendet. Optional kann die Ausrichtung separat über Gemini oder OpenRouter geprüft werden; hierfür gelten die Gratislimits bzw. Kosten des ausgewählten Modells. Details unter [KI-Konfiguration](configuration.md#ki-inhaltsprüfung-und-ausrichtung).

Unsicherheit oder Prüffehler halten das Bild verborgen und markieren es im Adminbereich. WhatsApp erhält ❓ und standardmäßig „KI Inhaltserkennung hat ihr Bild temporär gesperrt“. Die WhatsApp-Antwort ist einstellbar. Der frühere freie KI-Kontext wird von der kategoriebasierten Moderation nicht verwendet. ✅ oder Admin-Freigabe hebt die Sperre auf. Eindeutige Drehempfehlungen korrigieren die Anzeige automatisch ohne Freigabe. Nur unklare Ausrichtung wird gesperrt. EXIF-Ausrichtung wird beim Import berücksichtigt; gespeicherte Dateien werden durch die KI-Drehung nicht verändert. Das Original bleibt erhalten. KI kann falsch entscheiden; Freigaben bei der Abnahme kontrollieren.

## Diagnose

| Problem                       | Prüfen                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------- |
| Keine Fotos                   | Verbindung, gewählte Gruppe, Importfehler, Speicherplatz                         |
| Gruppen fehlen / Frame-Fehler | Gruppen aktualisieren, geordnet neu verbinden; Sitzung erst zuletzt zurücksetzen |
| Fotos fehlen am Monitor       | Sichtbarkeit, KI-Sperre, Ablauf, Mindestbestand, Höchstzahl                      |
| Kalender fehlt                | Aktivierung, HTTPS-iCalendar, zukünftige Termine, Fehleranzeige                  |
| Drive pausiert                | OAuth, Zugriffsrechte, Quota, Testmodus-Token, Fehleranzeige                     |
| KI blockiert                  | Schlüssel, Modell, Guthaben, API; manuell prüfen/freigeben                       |
| Docker startet nicht          | Laufender Docker-Dienst, Compose-Konfiguration, SETUP_KEY, Rechte, Port          |

Monitor-Feed alle zehn Sekunden, Kalenderquelle nach eigenem Intervall. Bei Kalenderfehlern bleibt der Cache derselben Quelle erhalten; Deaktivierung/Quellenwechsel leert ihn.

## Abhängigkeiten

Vor Releases `npm audit` und Upstream-Hinweise prüfen. Der bisherige Stand enthält fünf High-Befunde aus Puppeteer/`extract-zip` (GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3). Browserdownloads sind deaktiviert und Uploads werden nicht darüber entpackt; Docker verwendet Debian-Chromium. Dies reduziert den betroffenen Pfad, beseitigt die Paketbefunde aber nicht. Kein unkontrolliertes `npm audit fix --force`, das WhatsApp zurückstufen kann.

WhatsApp-Web ist eine inoffizielle Integration: Upstream-Änderungen können Anpassungen, erneutes Koppeln oder Kontoeinschränkungen verursachen. Logs, freien Plattenplatz und Backups im laufenden Betrieb kontrollieren.
