# Versionen und Updates

ScreenRelay verwendet `MAJOR.MINOR.PATCH`, beginnend mit **1.1.0**. Der Tag `v1.1.0` und die Version in `package.json` müssen übereinstimmen. Stabile Releases werden auf [GitHub](https://github.com/schuppenkarp/screenrelay/releases) veröffentlicht. Tags nach Veröffentlichung nicht verschieben. Breaking Changes erhöhen die Hauptversion; Datenmigrationen in den Versionshinweisen nennen.

## Adminbereich

Unter **Updates** werden installierte Version, neueste stabile Veröffentlichung und Versionshinweise angezeigt. Die Abfrage erfolgt frühestens einmal pro Minute. Es gibt bewusst keinen Docker-Zugriff aus der Anwendung und keinen automatischen Neustart. Die Serveradministration startet Updates vor Ort.

## Windows-Server mit Docker (Linux-Container)

Voraussetzung: bestehende Installation mit `.env`, `compose.proxy.yaml` und genau einem `wall`-Container, dessen `/app/data` aus einem benannten Volume kommt. PowerShell 5.1, Docker mit Compose und Internetzugriff auf GitHub sowie die Paketquellen des Docker-Builds werden benötigt. Git ist am Server nicht erforderlich.

1. `UPDATE.cmd` und den Ordner `scripts` aus der Veröffentlichung in den Installationsordner übernehmen. `.env` und bestehende Compose-Einstellungen behalten.
2. **UPDATE.cmd doppelklicken.** Standard-Compose-Projekt ist aus Kompatibilitätsgründen `wallrelay`.
3. Das Skript lädt den Quellcode der neuesten stabilen GitHub-Veröffentlichung und baut das Image, während die bisherige Anwendung weiterläuft.
4. Erst nach erfolgreichem Build wird ausschließlich die Anwendung angehalten. Das gesamte Datenvolume, `.env`, Compose-Datei und vorherige Image-ID werden unter `backups/<Zeitpunkt>` gesichert. Chromium-Sperrdateien werden nur im gestoppten Profil entfernt.
5. Die neue Image-ID wird in `compose.version.yaml` gespeichert. Ports, Datenvolume und Konfiguration bleiben erhalten. Nach erfolgreichem Healthcheck den Monitor und die WhatsApp-Verbindung prüfen. WhatsApp kann bei ungültig gewordener Anmeldung eine neue QR-Kopplung verlangen.

Bestimmte Version oder anderes Projekt:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\update-docker.ps1 -InstallDirectory . -Version v1.1.0 -ProjectName wallrelay
```

Das Skript lädt nur stabile Versionen aus dem oben genannten Repository. Die Update-Sperrdatei verhindert parallele Skriptläufe. Ausreichend Platz für Source, Image und eine vollständige Datensicherung vorhalten; alte Sicherungen werden absichtlich nicht automatisch gelöscht. Sicherungen enthalten private Daten und Schlüssel: Installationsordner und Backupzugriff beschränken.

## Start und Rückkehr zu einer früheren Version

Nach dem ersten Skriptupdate für manuelle Compose-Aufrufe immer **beide** Dateien verwenden:

```powershell
docker compose -p wallrelay -f compose.proxy.yaml -f compose.version.yaml up -d
```

Scheitert der Build oder Download, läuft der alte Container weiter. Scheitert die Sicherung vor dem Image-Wechsel, versucht das Skript den alten Container wieder zu starten. Scheitert der Healthcheck der neuen Version, wird sie gestoppt und die Sicherung bleibt erhalten; keine automatische Datenrücksetzung, da inzwischen Datenmigrationen erfolgt sein können.

Für eine Rückkehr: Anwendung stoppen, den aktuellen fehlgeschlagenen Stand separat sichern, das bestätigte Datenvolume aus `backups/<Zeitpunkt>/data.tar.gz` wiederherstellen und die zugehörige vorherige Image-ID aus `restore.json` in `compose.version.yaml` setzen. Das bestehende Volume nicht versehentlich durch einen anderen Compose-Projektnamen ersetzen. Eine Wiederherstellung verwirft Änderungen seit dem gewählten Backup und sollte bewusst vom Serveradministrator ausgeführt werden. `docker compose down -v` ist kein Update-Schritt.

## Linux / eigener Git-Checkout

Veröffentlichung auschecken, Image bauen und vor dem Containerwechsel eine konsistente Sicherung des gestoppten Datenvolumes erstellen. Versionierte Tags verwenden, keine ungeprüften Zwischenstände von `main`. Beispiel für den Build:

```sh
git fetch --tags origin
git checkout v1.1.0
docker build -t screenrelay:v1.1.0 .
```

Danach das Image über eine Compose-Override-Datei einstellen und denselben Compose-Projektnamen und dasselbe Datenvolume verwenden. Konfiguration und Laufzeitdaten nie in den Source-Checkout oder ins Git-Repository kopieren.
