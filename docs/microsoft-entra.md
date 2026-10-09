# Microsoft 365 / Entra ID anmelden

Das Masterkennwort bleibt der lokale Wiederherstellungs- und Einrichtungszugang. Zusätzlich können mehrere explizit freigegebene Konten eines Microsoft-Entra-Mandanten die App verwalten. Ein Exchange-Online-Postfach ist dafür nicht notwendig. Die App liest keine E-Mails. Für die Benutzervorschläge verwendet sie Microsoft Graph; die reine Anmeldung funktioniert unabhängig davon.

## Einrichtung

1. Als Master unter **Zugang & Speicher → Microsoft 365 / Entra ID** öffnen.
2. In [Microsoft Entra](https://entra.microsoft.com/) unter **App-Registrierungen → Neue Registrierung** eine Anwendung für **nur dieses Organisationsverzeichnis** erstellen.
3. Unter **Authentifizierung → Plattform hinzufügen → Web** die in ScreenRelay angezeigte Redirect-URI eintragen: `https://wall.example.org/api/auth/entra/callback`. Keine SPA-Plattform oder impliziten Tokenflüsse aktivieren.
4. **Verzeichnis-ID (Mandant)** und **Anwendungs-ID (Client)** aus der Übersicht nach ScreenRelay übertragen.
5. Unter **Zertifikate & Geheimnisse** ein zeitlich begrenztes Client-Geheimnis anlegen. Dessen **Wert**, nicht die Geheimnis-ID, in ScreenRelay eingeben. Nach dem Speichern bleibt das Feld leer; ein vorhandenes Geheimnis wird beibehalten. Erneuerung vor Ablauf einplanen.
6. Unter **API-Berechtigungen → Berechtigung hinzufügen → Microsoft Graph → Anwendungsberechtigungen** die Berechtigung **User.Read.All** hinzufügen und **Administratorzustimmung erteilen**. Das ist eine Anwendungsberechtigung, keine delegierte Berechtigung. Mandanten-ID, Client-ID und Geheimnis zunächst bei deaktivierter Anmeldung in ScreenRelay speichern.
7. Unter **Freigegebene Benutzer** einen Namen oder eine E-Mail eingeben oder **Vorschläge laden** wählen. Gewünschte Personen mit **Auswählen** übernehmen; mehrere Personen sind möglich. **Entfernen** nimmt eine Person aus der noch nicht gespeicherten Auswahl. ScreenRelay übernimmt die unveränderliche Objekt-ID automatisch im Hintergrund; Namen und E-Mail-Adressen dienen nur zur Anzeige. Bereits vorhandene Freigaben bleiben erhalten.
8. Microsoft-Anmeldung aktivieren und speichern. Im privaten Browserfenster über **Mit Microsoft 365 anmelden** testen. Der Masterzugang bleibt immer sichtbar.

Alle aufgeführten Benutzer erhalten Verwaltungsrechte für Inhalte und Integrationen. Nur der Master darf Microsoft-Zugänge und das Masterkennwort ändern. Es gibt derzeit keine separaten Redakteur-/Leserrollen. Eine leere Benutzerliste gewährt niemandem Zugang; Aktivierung damit wird abgewiesen.

Optional kann die Entra-Unternehmensanwendung zusätzlich „Zuweisung erforderlich“ verwenden. Die lokale Objekt-ID-Freigabe bleibt dennoch erforderlich. Tenant-Richtlinien können Administratorzustimmung verlangen. MFA und Conditional Access werden bei der Microsoft-Anmeldung durch Entra angewendet.

## Adresse, HTTPS und Docker

Die öffentliche App-Adresse wird gespeichert und für Redirects verwendet, nicht aus fremden Host-Headern übernommen. Für den VPS `PUBLIC_ORIGIN=https://wall.example.org`, `COOKIE_SECURE=true` und beim mitgelieferten Reverse Proxy `TRUST_PROXY=true` setzen. Die Produktions-Compose-Datei konfiguriert diese Werte bereits. Bei Adressänderungen beide Seiten (ScreenRelay und Entra) anpassen.

Zum lokalen Test ist HTTP nur auf Loopback-Adressen erlaubt. Am einfachsten die App durchgängig über `http://localhost:3000` öffnen und genau diese Adresse konfigurieren. Für HTTP mit `127.0.0.1` können Microsofts Registrierungsregeln eine Manifest-Einstellung erfordern; localhost bevorzugen. Start und Rückruf müssen dieselbe Browser-Domain verwenden, sonst fehlt das Bindungscookie und die Anmeldung wird abgelehnt.

Der Button **Gespeicherten Mandanten prüfen** testet die Erreichbarkeit und den Herausgeber der Microsoft-Konfiguration. Er bestätigt weder Client-Geheimnis noch Redirect-Registrierung oder Benutzerfreigabe; das prüft erst eine vollständige Anmeldung.

## Sitzungen und Betrieb

- Lokale Sitzungen laufen nach zwölf Stunden ab. Abmelden beendet die lokale Sitzung, nicht die Microsoft-Sitzung im Browser. Beim nächsten Login erscheint die Kontoauswahl.
- Speichern der Entra-Einstellungen beendet alle Microsoft-Sitzungen und offenen Anmeldevorgänge sofort. Master- und Monitorsitzungen bleiben erhalten. Ein Passwortwechsel beendet sämtliche Verwaltungssitzungen.
- Entzug in der lokalen Benutzerliste wirkt sofort. Eine Sperre allein im Microsoft-Verzeichnis wird spätestens bei der nächsten Anmeldung geprüft; laufende lokale Sitzungen werden nicht kontinuierlich über Microsoft überprüft.
- Client-Geheimnisse sind in SQLite AES-256-GCM-verschlüsselt. `data/entra-secrets.key` gehört gemeinsam mit SQLite ins private Backup. Ohne Schlüssel kann ein gespeichertes Geheimnis nicht entschlüsselt werden; Schlüssel niemals getrennt von der Datenbank entsorgen.
- Keine Client-Geheimnisse, Schlüsseldateien, Benutzerlisten, Tokens oder persönlichen Mandantenwerte in Git, Docker-Images oder öffentliche Fehlermeldungen übernehmen. Die neutrale Veröffentlichung enthält nur die Funktion, keine Kontoverbindung.

## Implementierung und Prüfungen

`server/entra.js` führt Authorization Code + PKCE mit `state`, Browserbindung und `nonce` aus. Einmalige Anmeldevorgänge liegen zehn Minuten in SQLite. `jose` prüft die RS256-Signatur anhand der Microsoft-JWKS sowie Herausgeber, Zielanwendung und Gültigkeit. Zusätzlich werden Mandanten-ID und freigegebene Benutzer-Objekt-ID geprüft. Der Anmeldevorgang speichert keine Refresh-/Access-Tokens und fordert nur `openid profile` an. Die separate serverseitige Verzeichnissuche verwendet Client Credentials mit `https://graph.microsoft.com/.default`. Ihr Access-Token bleibt zeitlich begrenzt im Arbeitsspeicher und wird niemals an den Browser geschickt.

`server/entra-settings.js` validiert die Konfiguration; `server/entra-secrets.js` verschlüsselt das Geheimnis; `server/routes/entra.js` enthält HTTP-Routen. `auth.js` bindet individuelle Benutzer an lokale Sitzungen. Die Oberfläche liegt in `public/entra-settings.js` und `public/templates/entra-settings.html`; `public/entra-user-picker.js` verwaltet Vorschläge und Auswahl. `server/entra-directory.js` fragt maximal 25 aktive Benutzer pro Suche ab, nach Namens- oder E-Mail-Präfix. Weitere Treffer werden durch Eingrenzen des Suchbegriffs gefunden. Fremde Pagination-URLs werden nicht verfolgt. Nur der Masterzugang darf das Verzeichnis durchsuchen. Suche und Speicherung bleiben getrennt; eine Auswahl wird erst beim Speichern freigegeben.

Automatische Tests verwenden lokal signierte Testtokens und prüfen Erfolg, falsche Signatur, Mandant, Zielanwendung, Herausgeber, Ablauf, Nonce, Browserbindung, Wiederholung und Widerruf. Sie ersetzen keine echte Anmeldung mit der produktiven Entra-App.

Die Suche verwendet immer die gespeicherten Verbindungsdaten. Fehlt `User.Read.All` oder die Administratorzustimmung, zeigt die Oberfläche eine entsprechende Meldung. Bestehende Freigaben und die Anmeldung bleiben davon unabhängig. Die Berechtigung erlaubt grundsätzlich das Lesen von Benutzerprofilen im Mandanten; die Anwendung fordert nur ID, Anzeigename und E-Mail/UPN an. Es sind keine Mail- oder Kalenderberechtigungen erforderlich.

Quellen: [Microsoft Graph: Benutzer auflisten](https://learn.microsoft.com/en-us/graph/api/user-list?view=graph-rest-1.0), [Microsoft Authorization Code Flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [ID-Token-Claims](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference), [Claims und Berechtigungsprüfung](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation).

### Einrichtung ohne vorhandene Benutzer

**Verbindung speichern & Benutzer laden** speichert die Verbindungsdaten unabhängig von der Aktivierungs-Checkbox und öffnet die Benutzersuche. Bereits gespeicherte Freigaben und der Aktivierungszustand werden dabei beibehalten; ungespeicherte Auswahlen bleiben im Editor. Bei der Ersteinrichtung speichert auch der allgemeine Speichern-Button ohne Benutzer zunächst einen deaktivierten Entwurf, selbst wenn „Aktivieren“ bereits angehakt wurde. Danach Benutzer auswählen, Aktivierung anhaken und erneut speichern. Eine aktive Anmeldung mit leerer Freigabeliste bleibt serverseitig verboten.
