# Kameras, Layout und Touch-Ansicht

## Layout

Unter **Einstellungen → Layout** lassen sich 1–4 Spalten und 1–3 Zeilen wählen. Abstand und Außenrand sind in Pixeln einstellbar. Bei zwei Spalten ist auch deren Breitenverhältnis veränderbar. Die Infotafel reserviert ein Feld an der gewählten Ecke; sie kann dort auch ausgeblendet werden. Ein 1×1-Raster mit eingeblendeter Infotafel zeigt ausschließlich diese Tafel.

Das bestehende 2×2-Layout bleibt die Voreinstellung. Die gelegentliche große Hochformatansicht nutzt zwei übereinanderliegende Felder in jedem Raster mit mindestens zwei Zeilen. Bevorzugt wird das linke verfügbare Paar; die Infotafel wird niemals verdeckt. Gibt es kein freies Paar, bleibt die normale Aufteilung erhalten. Die Funktion kann ausgeschaltet werden. Wechsel in der normalen Rotation erfolgen weiterhin zeitlich versetzt.

## Kamera hinzufügen

Unter **Bilder** oder **Fixierte Inhalte** auf **Webcam hinzufügen** klicken. Einen Namen, die HTTP-/HTTPS-Stream-URL und das Format angeben:

| Format     | Erwartete Quelle                                                        |
| ---------- | ----------------------------------------------------------------------- |
| MJPEG      | Fortlaufender JPEG-Stream (`multipart/x-mixed-replace`)                 |
| HLS        | Eine `.m3u8`-Wiedergabeliste mit Segmenten                              |
| HTTP-Video | Video, das der Monitorbrowser direkt abspielen kann, beispielsweise MP4 |

RTSP, die HTML-Anmeldeseite einer Kamera und ein beliebiger roher Videostream funktionieren nicht direkt. Bei solchen Kameras ist ein vorgeschalteter Konverter zu MJPEG oder HLS erforderlich. Für HLS verwendet die Anwendung das lokal gebündelte [hls.js](https://hlsjs.video-dev.org/api-docs/hls.js.hls); die Kamera-Codecs müssen vom jeweiligen Browser unterstützt werden. Streams laufen stumm, ohne Wiedergabeleiste. Es werden keine Kameraaufnahmen gespeichert und keine KI-Prüfungen auf Streams angewendet.

Der **Anwendungsserver** muss die Kamera erreichen können. Bei einem VPS und Kameras im lokalen Netzwerk beispielsweise eine VPN-Verbindung bereitstellen. Der Browser ruft nur den geschützten Stream-Proxy der Anwendung auf. Eine HTTPS-Bilderwand kann so auch eine interne HTTP-Kamera anzeigen.

Benutzername und Passwort werden in separaten Anmeldefeldern hinterlegt. Ein leeres Passwortfeld behält das gespeicherte Passwort bei; die Checkbox entfernt es ausdrücklich. Passwörter werden mit AES-256-GCM verschlüsselt gespeichert und weder als Klartext noch als verschlüsselter Wert an den Browser zurückgegeben. Bestehende Zugangsdaten in URLs werden automatisch migriert. HTTP Basic Auth und Reolink-Anmeldung verwenden diese Felder. Digest-Authentifizierung ist nicht implementiert. HTTPS-Zertifikate werden normal geprüft. HLS-Segmente und Schlüssel müssen vom selben Ursprung wie die Kamera-URL stammen; Weiterleitungen zu anderen Servern werden abgewiesen.

Der Schlüssel liegt separat unter `data/camera-secrets.key`. Bei Backup oder Docker-Umzug muss er zusammen mit dem Datenverzeichnis erhalten bleiben. Ohne Schlüssel sind gespeicherte Kamerapasswörter nicht wiederherstellbar. Die Verschlüsselung schützt einen isolierten Datenbankabzug; Zugriff auf Datenbank **und** Schlüssel erlaubt weiterhin die Entschlüsselung. Historische Backups werden durch die Migration nicht verändert.

**Aktiv** schaltet einen Inhalt insgesamt frei. **Fixiert** macht ihn für die Auswahl der Touch-Ansicht verfügbar. **In normaler Rotation anzeigen** bestimmt, ob eine Kamera auch im normalen Betrieb erscheint. Für eine reine Touch-Kamera: aktiv und fixiert lassen, normale Rotation ausschalten.

## Reolink und HTTP-FLV

In der Mediathek oder unter **Fixierte Inhalte → Reolink-Recorder** genügt die Recorder-IP (optional mit HTTP/HTTPS und Port) plus Benutzername und Passwort. **Kameras laden** liest Kanalnamen und Online-Status. Anschließend mehrere Kameras anhaken oder **Alle verbundenen auswählen** verwenden und gemeinsam hinzufügen. Bereits vorhandene Kanäle sind markiert und werden nicht doppelt angelegt. Die Auswahl bleibt zehn Minuten gültig.

Bekannte Recorder können aus der Liste gewählt werden; ein leeres Passwortfeld verwendet dann die gespeicherte Anmeldung, ausschließlich für denselben Recorder und Benutzer. Neue Kameras werden aktiv und fixiert angelegt. Normale Rotation und Aufnahme in die Touch-Auswahl sind im Assistenten wählbar. Offline-Kanäle dürfen ebenfalls angelegt werden. Die Touch-Ansicht bleibt auf zwölf Inhalte begrenzt.

Für HTTP-FLV steht ein eigener Player auf Basis des lokal gebündelten [mpegts.js](https://github.com/xqq/mpegts.js) bereit. Bei Reolink **Reolink · HTTP-FLV mit automatischer Anmeldung** auswählen. Die URL hat die Form `http://kamera/flv?port=1935&app=bcs&stream=channel4_sub.bcs`; Benutzername und Passwort separat eingeben. Die Anwendung meldet sich serverseitig an, hält Sitzungstokens aus dem Monitor fern und erneuert abgelaufene Tokens.

Die [Reolink-Dokumentation](https://support.reolink.com/articles/28256840140441-Introduction-to-FLV-Stream/) beschreibt die nullbasierten Kanal-IDs und die Varianten `sub`, `ext` und `main`. Für das Raster empfiehlt sich ein H.264-Substream. Die HTML-Startseite der Kamera ist keine Stream-URL. Kameraeinstellungen werden durch die Bilderwand nicht verändert.

## Touch-Ansicht

1. Die gewünschten Kameras oder Bilder fixieren und aktivieren.
2. In den Einstellungen die Touch-Ansicht aktivieren, eine Dauer von 5–3600 Sekunden und 1–4 Spalten wählen.
3. Bis zu zwölf fixe Inhalte auswählen und speichern.

Ein Klick oder Touch auf den Monitor zeigt **alle ausgewählten Inhalte gleichzeitig** im Raster. Die normale Rotation pausiert dabei. Eine weitere Berührung startet die eingestellte Dauer erneut. Nach Ablauf kehrt die Anzeige automatisch zur normalen Rotation zurück. Bereits angezeigte Kameras bleiben im Hintergrund verbunden und werden beim nächsten Einblenden wiederverwendet. Erst das Deaktivieren, Entfernen aus der jeweiligen Inhaltsauswahl, Abmelden oder Schließen der Seite beendet die Verbindung. Dadurch fließen auch bei ausgeblendeten Kameras weiterhin Videodaten. Ohne aktivierte Funktion oder ohne verfügbare Auswahl bleibt die normale Rotation bestehen.

Die Touch-Ansicht besitzt bewusst keine Weiter-/Pause-Tasten und keine Timeline. Layout und Inhaltsauswahl lassen sich unabhängig von der normalen Rotation konfigurieren.

## Fehlerbehebung

- **Kamera nicht erreichbar:** URL, Server-Netzwerkverbindung, Anmeldung und Stream-Format prüfen. Die Anzeige versucht nach fünf Sekunden erneut zu verbinden.
- **Video bleibt schwarz:** Browser-Codec-Unterstützung prüfen; die Anwendung konvertiert keine Videocodecs.
- **Touch hat keine Wirkung:** Funktion aktivieren und mindestens einen aktiven, fixierten Inhalt auswählen.
- **Verbindung bricht ab:** Der Monitor braucht weiterhin eine gültige Anmeldung oder einen gültigen Monitor-Link. Das Deaktivieren, Entfernen oder Ändern einer Kamera beendet bestehende Verbindungen.

Neue Einstellungen werden in der lokalen SQLite-Datenbank gespeichert. Es sind keine zusätzlichen Docker-Volumes oder Dienste notwendig. Bei Docker/VPS-Betrieb muss der Container die Kamera-URLs erreichen können.
