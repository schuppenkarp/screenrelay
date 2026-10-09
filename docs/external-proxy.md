# Docker hinter vorhandenem Reverse Proxy

`compose.proxy.yaml` enthält nur ScreenRelay, keinen eigenen HTTPS-Proxy. Standardport am Docker-Host ist **8045**. `PUBLIC_ORIGIN` ist die externe HTTPS-Adresse; der Proxy verbindet sich intern per HTTP mit Port 8045 und übergibt den ursprünglichen Host sowie `X-Forwarded-Proto: https`. WebSocket-Verbindungen für Kameras weiterleiten. `COOKIE_SECURE=true` und `TRUST_PROXY=true` sind gesetzt; Anmeldung deshalb über die externe HTTPS-Adresse durchführen. Der direkte HTTP-Healthcheck funktioniert trotzdem.

Den Backendport im LAN nur für den Reverse Proxy und vertrauenswürdige Verwaltungsgeräte freigeben. Die Anwendung vertraut einem vorgeschalteten Proxy; dessen Forwarded-Header müssen überschrieben statt von beliebigen Clients übernommen werden.

## Privates Migrationspaket auf Windows installieren

Das Paket besteht aus neutralem Quellcode, Linux-Docker-Image, privaten Laufzeitdaten und einer privaten `.env`. **Das gesamte Migrationspaket ist vertraulich und gehört nicht nach GitHub.** Für GitHub ausschließlich den separaten neutralen Quellcodeexport verwenden.

Voraussetzung: Docker mit Compose und einem **Linux-Container-Dienst**. Windows-Container können das Debian/Chromium-Image nicht ausführen. Wenn der Windows-Server nur Windows-Container unterstützt, einen Linux-Docker-Host bzw. eine Linux-VM bereitstellen und Port 8045 passend zum Reverse Proxy weiterleiten. Der Installer prüft den Engine-Typ und bricht bei Windows-Containern ab.

Im entpackten Paket:

```powershell
.\scripts\install-docker-package.ps1 -PublicOrigin https://wall.example.org -Port 8045
```

Das Skript prüft SHA-256-Prüfsummen, lädt das Image, importiert ausschließlich in ein **leeres** Volume, korrigiert Besitzrechte und setzt die neue Entra-App-Adresse. Bestehende Zielvolumes werden nicht überschrieben. Ohne `-Start` bleibt die Zielanwendung zunächst gestoppt.

Vor dem Start:

1. Neue Redirect-URI `https://wall.example.org/api/auth/entra/callback` in derselben Entra-App als **Web** ergänzen. Mandant, Client-Geheimnis und Benutzerfreigaben werden übernommen.
2. Reverse Proxy und DNS auf den neuen Host/Port einstellen; gegebenenfalls den Drive-Redirect ergänzen.
3. Quellinstanz geordnet stoppen. Nie beide Instanzen gleichzeitig mit demselben WhatsApp-Profil betreiben.
4. Starten:

```powershell
docker compose --project-name wallrelay --env-file .env -f compose.proxy.yaml up -d --wait
docker compose --project-name wallrelay --env-file .env -f compose.proxy.yaml ps
```

`-Start` am Installer ist nur geeignet, wenn diese Voraussetzungen bereits erfüllt sind. Bei langer Pause zwischen Snapshot und Umzug einen neuen konsistenten Datenexport erstellen, damit später eingegangene Bilder nicht fehlen.

## Übernommene Daten und Kontrolle

Enthalten sind SQLite, Bilder/Originale/Archiv, Branding, Infotafel, Gruppen und Filter, Entra-Freigaben, verschlüsselte Geheimnisse samt Schlüsseldateien, vorhandene KI-/Drive-Schlüssel und WhatsApp-Profil. Alte HTTP-Adminsitzungen werden beim Import verworfen; das Masterkennwort bleibt unverändert. Chromium-Prozesssperren werden auf der Kopie entfernt.

Ein WhatsApp-Profil von Windows kann unter Linux ein erneutes Koppeln verlangen. Profilübernahme ist vorbereitet, aber die erfolgreiche Kontoverbindung muss am Ziel geprüft werden. Kein Profil löschen oder zurücksetzen, bevor der erhaltene Bestand gesichert wurde.

Prüfen: `/healthz`, Masterlogin, Microsoft-Login, freigegebene Benutzer, vorhandene Bilder und Infotafel, Kalender, Kameraquellen sowie WhatsApp-Status. Erst nach erfolgreicher Abnahme den bisherigen Autostart deaktivieren. Bei Rückkehr zur Quelle zuerst den Zielcontainer stoppen.

Das Datenvolume bleibt bei `docker compose down` erhalten. **Kein `down -v`** für normale Updates oder Fehlersuche verwenden.
