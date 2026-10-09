# Google Drive als Bildarchiv

Im Adminbereich unter **Einstellungen → Bildarchiv · Google Drive** einrichten.

## Einmalige Einrichtung

1. In [Google Cloud Console](https://console.cloud.google.com/) ein Projekt wählen oder erstellen und **Google Drive API** aktivieren.
2. Unter Google Auth Platform die Anwendung und den OAuth-Zustimmungsdialog einrichten. Für eine externe Anwendung im Testmodus euren Google-Account als Testnutzer hinzufügen. Für dauerhaften Betrieb die App veröffentlichen: Im externen Testmodus können Refresh-Tokens nach sieben Tagen ablaufen. Bei einem Google-Workspace-Konto kann eine interne Anwendung geeignet sein.
3. Einen OAuth-Client vom Typ **Webanwendung** erstellen. Als autorisierte Weiterleitungs-URI exakt die Adresse aus dem Adminbereich eintragen. Lokal: `http://127.0.0.1:3000/api/drive/callback`. Auf dem VPS: `https://EURE-DOMAIN/api/drive/callback`. Für den VPS `PUBLIC_ORIGIN=https://EURE-DOMAIN` setzen.
4. Client-ID und Client-Secret im geschützten Adminformular speichern. Secrets niemals in Git oder im Chat veröffentlichen.
5. **Google Drive verbinden** wählen, mit dem Vereinsaccount anmelden und die angeforderten Berechtigungen erteilen. Danach startet die Übertragung des vorhandenen Bestands automatisch.

Die App fordert den begrenzten Scope `drive.file` an: Zugriff auf die von ihr erstellten Dateien. Sie erstellt einen eigenen Ordner im verbundenen Konto. Der Name ist unter **Organisation & Erscheinungsbild** einstellbar; die neutrale Vorgabe lautet **ScreenRelay**. Ein bestehender Archivordner wird durch eine Namensänderung nicht umbenannt. Die Dateien werden nicht öffentlich geteilt. Der Link zum Ordner erscheint im Adminbereich.

## Ordner und Dateien

- `active`: Fotos, die aktuell im Anzeigenbestand sind; inklusive fixierter Fotos.
- `inactive`: ausgeblendete, KI-gesperrte, abgelaufene und durch das Anzeigelimit zurückgehaltene Fotos.
- `deleted`: aus der Mediathek gelöschte Fotos. Diese werden in Drive verschoben und dauerhaft aufbewahrt.

Pro Foto: unverändertes Original, optimierte JPEG-Anzeigeversion und JSON mit Importzeit, Absender, Bildtext, Sichtbarkeit und KI-Prüfstatus. Bereits ältere Fotos ohne gespeichertes Original werden mit ihrer verfügbaren Anzeigeversion gesichert. Wechsel zwischen den Ordnern verschieben dieselben Drive-Dateien; es werden keine neuen Kopien erzeugt.

Neue Imports und Adminänderungen stoßen eine Synchronisierung an. Zusätzlich läuft sie jede Minute, damit auch WhatsApp-Freigaben, Bildtextänderungen und zeitlicher Ablauf berücksichtigt werden. Der Admin zeigt Fehler und den Zeitpunkt der letzten vollständig erfolgreichen Synchronisierung. Offlineimporte bleiben lokal und werden später nachgeliefert.

## Lokaler Cache

Standardmäßig bleiben lokale Kopien erhalten. Die optionale Cache-Bereinigung erfolgt erst nach erfolgreicher Sicherung **aller drei Dateien** eines Fotos und geprüften MD5-Prüfsummen der Uploads:

- Aktive Bilder: Anzeigeversion lokal; vorhandene Originale bleiben als zusätzliche lokale Kopie. Originale zuvor inaktiver Bilder können weiterhin nur in Drive liegen und werden bei Bedarf geladen.
- Inaktive Bilder: Original nur in Drive, kleine Anzeigeversion lokal für die Mediathek.
- Gelöschte Bilder: Bilddateien nur in Drive, JSON-Metadaten zusätzlich lokal.

Vor dem Archivieren eines inaktiven Fotos stellt die App das Original aus Drive wieder her und prüft seine Prüfsumme. Fehlende Anzeigeversionen werden ebenfalls wieder geladen. Ist Drive dabei nicht erreichbar, wird der Vorgang mit einer Fehlermeldung angehalten. Die Speicherauslastung im Admin misst die tatsächlich lokal liegenden Mediendateien.

## Betrieb und Sicherung

Zugangsdaten und Refresh-Token liegen ausschließlich in `data/google-drive.json`. Der Browser erhält keine gespeicherten Secrets oder Tokens. Die Verbindung verwendet OAuth-State, PKCE und ein Zeitlimit. `data/` ist von Git ausgeschlossen. Auf dem VPS das Datenverzeichnis nur dem Serverbenutzer zugänglich machen.

Weiterhin `data/wall.sqlite`, das Konfigurationsverzeichnis und den lokalen Cache sichern. Die Datenbank enthält die Zuordnung zu Drive-Dateien, WhatsApp-Importbelege und Einstellungen. Drive speichert das Bildarchiv; ein vollständiger Neuaufbau der Anwendung allein aus Drive ist noch kein automatisierter Wiederherstellungsweg.

**Verbindung trennen** pausiert die Speicherung und entfernt das lokale Refresh-Token. Drive-Dateien bleiben bestehen. Bereits ausschließlich in Drive gespeicherte Originale benötigen für einen späteren Abruf eine erneute Verbindung mit demselben Google-Konto. Ein Wechsel des Google-Kontos ist keine automatische Archivmigration.

## Technische Quellen

- [Google Drive: API-Berechtigungen](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Google Drive: Datei-Uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- [Google OAuth für Webanwendungen](https://developers.google.com/identity/protocols/oauth2/web-server)

Die Anbindung ist mit einer simulierten Google-API auf Übertragung, Statuswechsel, Wiederherstellung und Fehlerfälle geprüft. Ein echter Verbindungstest erfordert eure Google-OAuth-Zugangsdaten und Anmeldung.
