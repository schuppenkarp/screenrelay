# Einstellungen und Vorlagen

Die linke Navigation enthält eigene Einstellungsseiten: **Layout**, **Touch-Ansicht**, **Wiedergabe**, **Foto-Lebensdauer**, **Organisation**, **Kalender**, **KI-Bildprüfung**, **Google Drive** und **Zugang & Speicher**. Jede Seite speichert nur die dort bearbeiteten Werte. Organisationsvorlagen erhalten die separat konfigurierten Kalenderwerte.

Unter **Einstellungen → Organisation & Erscheinungsbild** werden die organisationsbezogenen Vorgaben dauerhaft in SQLite gespeichert. Änderungen erscheinen sofort im Adminbereich und beim nächsten Feed-Abruf auf Monitoren, gewöhnlich nach zehn Sekunden.

| Bereich       | Einstellungen                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| Identität     | Name, Unterzeile, Homepage, E-Mail, Telefon, Adresse, Fußzeile                                       |
| Darstellung   | Wortmarke, Bildmarke, Browser-Symbol, Akzentfarbe, Monitor-Hintergrund, Standardschrift              |
| Leere Anzeige | Begrüßung und Beschreibung                                                                           |
| Datum         | Region wie `de-AT`, IANA-Zeitzone wie `Europe/Vienna`                                                |
| Kalender      | Aktivierung, HTTPS-iCalendar-URL, Überschrift, Abrufintervall 15–3600 Sekunden, maximal 1–20 Termine |
| Integrationen | WhatsApp-Gerätename, Name des neuen Drive-Ordners, KI-Einsatzkontext, Antwort bei KI-Sperre          |

Logos: PNG, JPEG oder WebP bis 3 MB; Normalisierung zu PNG unter `data/branding/`. Uploads werden sofort übernommen. SVG-Uploads sind nicht erlaubt; mitgelieferte Vorlagenlogos dürfen SVG sein. Logos sind öffentlich, Fotos bleiben zugriffsgeschützt. Ältere hochgeladene Logos werden aufbewahrt.

Nunito wird lokal ausgeliefert; alternativ Arial, Verdana, Georgia, Times New Roman oder Courier New. Die Infotafel kann zusätzlich explizite Schriftgrößen und Farben enthalten. Diese bleiben bei einem Wechsel der Standardschrift/Farbe erhalten. Kontaktdaten sind Stammdaten und werden nicht automatisch in die frei gestaltete Infotafel eingefügt.

Ein neuer WhatsApp-Gerätename wirkt beim nächsten Verbindungsstart. Der Drive-Ordnername wird beim erstmaligen Erstellen verwendet, vorhandene Ordner werden nicht umbenannt. Der Kalender zeigt höchstens die eingestellte Zahl und nur so viele Zeilen, wie ins Viertel passen.

## Bildschirmaufteilung und Touch

Unter **Layout**: Raster, Abstände, Spaltenbreite und Infotafelposition. Unter **Touch-Ansicht**: optionaler Touch-Modus mit Dauer, Raster und Inhaltsauswahl. Die Voreinstellung bleibt 2×2; Touch ist zunächst deaktiviert. Kameras werden unter **Webcam hinzufügen** angelegt. Details und unterstützte Formate stehen unter [Kameras, Layout und Touch-Ansicht](cameras-and-touch.md).

## Vorlagen

Die neutrale Vorlage enthält generische Logos, leere Kontaktdaten und einen deaktivierten Kalender. Eigene Logos werden über den Adminbereich hochgeladen und unter `data/branding/` gespeichert.

Neue Installationen erhalten neutrale Vorgaben. Bereits gespeicherte Organisationseinstellungen, Fotos, Inhalte und Sitzungen werden bei Updates nicht überschrieben.

Vorlagen-Schaltflächen ersetzen sämtliche Organisationseinstellungen, aber keine Inhalte oder Zugangsdaten. Vorherige Logos bleiben auf der Festplatte.

## Umgebung

| Variable                    | Standard / Zweck                                                   |
| --------------------------- | ------------------------------------------------------------------ |
| `HOST`                      | `127.0.0.1`, im Container `0.0.0.0`                                |
| `PORT`                      | `3000`                                                             |
| `NODE_ENV`                  | `development`, Docker `production`                                 |
| `DATA_DIR`                  | `./data`, Docker `/app/data`                                       |
| `SETUP_KEY`                 | Produktion: mindestens 24 Zeichen zur Ersteinrichtung              |
| `PUBLIC_ORIGIN`             | Öffentliches Schema und Host, z. B. `https://wall.example.org`     |
| `COOKIE_SECURE`             | `true` bei HTTPS, `false` bei lokalem HTTP                         |
| `TRUST_PROXY`               | `true` hinter dem vorgesehenen einzelnen Reverse Proxy             |
| `MAX_STORAGE_MB`            | `1024`; Datenbank und Chromium benötigen zusätzlichen Speicher     |
| `ORGANIZATION_PRESET`       | `neutral`; bestehende Einstellungen bleiben erhalten               |
| `DOMAIN`                    | Produktions-Compose: Domain für Caddy                              |
| `PUPPETEER_EXECUTABLE_PATH` | Installiertes Chrome/Chromium, Docker `/usr/bin/chromium`          |
| `CHROMIUM_NO_SANDBOX`       | Docker `true`, außerhalb des Containers normalerweise nicht setzen |

Passwörter, OpenAI-Schlüssel und Drive-Zugangsdaten werden in geschützten Adminformularen eingerichtet. Der öffentliche Endpunkt `/api/appearance` enthält weder Zugangsschlüssel noch Kalenderquell-URL oder KI-Kontext.

## KI-Inhaltsprüfung und Ausrichtung

Unter **KI-Bildprüfung** verwendet die Inhaltsprüfung ausschließlich OpenAIs kostenlosen Endpunkt `/v1/moderations` mit `omni-moderation-latest`. Ein OpenAI-API-Schlüssel bleibt erforderlich. Die frühere kostenpflichtige GPT-Prüfung wird nicht mehr aufgerufen. Bestehende OpenAI-Schlüssel und die Aktivierung werden übernommen; die zusätzliche Ausrichtungsprüfung ist zunächst aus.

Bilder werden auf sexuelle Inhalte, Gewalt und Selbstverletzung geprüft. Kategorien wie Hass und Belästigung unterstützt die Moderation nur für den mitgesendeten Bildtext; eine Erkennung von Hasssymbolen im Foto wird nicht zugesichert. Von OpenAI markierte Inhalte sowie Kategorien über der einstellbaren Prüfschwelle (Standard 0,20) werden zur manuellen Kontrolle gesperrt. Diese Scores sind keine kalibrierten Prozentwahrscheinlichkeiten; Schwellen sollten anhand echter Beispiele geprüft werden.

Für die zusätzliche Ausrichtung stehen **Google Gemini** und **OpenRouter** bereit. Den jeweiligen Schlüssel und eine aktuell verfügbare Modellkennung mit Bildunterstützung eintragen. Bei OpenRouter lautet die Kennung typischerweise `anbieter/modell`. Die Anwendung wählt kein Modell automatisch und wechselt nicht auf einen kostenpflichtigen Ersatz. Gratislimits bzw. Gebühren richten sich nach Anbieter, Modell und Konto. Wird diese Option aktiviert, gehen nach erfolgreicher Inhaltsprüfung Fotos zusätzlich an den gewählten Dienst. Auffällige Fotos werden nicht weitergesendet.

EXIF-Orientierung wird bereits beim Import lokal berücksichtigt. Die Online-Prüfung beurteilt zusätzlich das Motiv. Eindeutige Drehvorschläge (90/180/270 Grad) werden automatisch für die Anzeige übernommen. Unklare Antworten, API-Fehler und Limitüberschreitungen sperren das Foto weiterhin zur Kontrolle. Die Korrektur wird als display_rotation gespeichert und beim Ausliefern der Anzeige angewendet; Bilddateien und Originale bleiben unverändert. Erneute Prüfung beurteilt stets die ungedrehte gespeicherte Anzeigeversion, sodass Drehungen nicht kumulieren. Der bestehende WhatsApp-Ablauf mit ❓, Textantwort und Freigabe durch ✅ bleibt bestehen. Manuelle Freigaben werden nicht durch spätere KI-Antworten überschrieben.

Schlüssel liegen ausschließlich serverseitig in `data/openai-key`, `data/gemini-key` und `data/openrouter-key` (Dateirechte 0600 auf unterstützten Systemen). Diese Dateien sind nicht verschlüsselt; Datenverzeichnis und Backups schützen. Alternativ sind `OPENAI_API_KEY`, `GEMINI_API_KEY` und `OPENROUTER_API_KEY` möglich; gespeicherte Dateien haben Vorrang. Leere Schlüsselfelder behalten bestehende Werte. API-Antworten an den Browser enthalten nur Konfigurationsstatus, nie die Schlüssel.

Referenzen: [OpenAI Moderation](https://developers.openai.com/api/docs/guides/moderation), [Gemini GenerateContent](https://ai.google.dev/api/generate-content), [OpenRouter-Bildeingaben](https://openrouter.ai/docs/guides/overview/multimodal/image-understanding).

### Intelligenter Zuschnitt

Optionaler Schalter unter **KI-Bildprüfung → Bildoptimierung**, standardmäßig aus. Er benötigt den aktivierten KI-Ablauf und Gemini oder OpenRouter. Die bestehende Ausrichtungsanfrage fragt zusätzlich nach einem geschützten Motivbereich; es entsteht kein separater API-Aufruf, aber die zusätzliche Ausgabe kann die Tokenkosten erhöhen.

Die Anwendung speichert ausschließlich normierte Bereichskoordinaten in `items.crop_focus`. Bilddatei, Original, Archiv und Drive-Kopie bleiben unverändert. Im Monitor wird pro Anzeigefeld berechnet, ob ein füllender Ausschnitt mindestens 80 % der Bildfläche sowie alle erkannten wichtigen Inhalte mit 3 % Randabstand erhält. Andernfalls wird das ganze Foto eingepasst, auch wenn zuvor „füllend“ eingestellt war. Das funktioniert bei verschiedenen Rastern und Hochformat-Splits. Die separate Touch-Ansicht bleibt unverändert.

Unsichere, fehlende oder ungültige Zuschnittdaten führen zum vollständigen Bild, nicht allein zu einer Sperre. Bei gedrehten oder unklar ausgerichteten Motiven erfolgt ebenfalls kein Zuschnitt. Erneute Prüfung verwirft alte Zuschnittdaten. Ausschalten deaktiviert vorhandene Zuschnitte beim nächsten Monitor-Feed (gewöhnlich zehn Sekunden). Bereits manuell freigegebene Bilder werden wie bisher nicht automatisch erneut geprüft. Die KI kann wichtige Inhalte übersehen; repräsentative Fotos vor Aktivierung kontrollieren.

## Mehrere WhatsApp-Gruppen

Unter **WhatsApp → Gruppen auswählen** können mehrere Gruppen per Checkbox gleichzeitig aktiviert werden. Die Auswahl wird dauerhaft gespeichert; die bisherige Einzelgruppe wird automatisch als Auswahl übernommen. Keine Auswahl pausiert den Bildimport, ohne die Sitzung zu trennen. Bilder aus nicht ausgewählten Gruppen bleiben ausgeschlossen.

Import, 👍-Bestätigung, ❓-Sperre, ✅-Freigabe, ❌-Archivierung und Bildtextänderungen berücksichtigen alle ausgewählten Gruppen. Nach Wiederverbindung und beim Speichern der Auswahl werden verfügbare Bilder der letzten 48 Stunden je Gruppe nachgeladen. Bereits importierte oder archivierte Nachrichten werden nicht doppelt übernommen. Abwählen einer Gruppe entfernt deren bereits gespeicherte Fotos nicht, verhindert aber weitere Imports und Reaktionsänderungen aus dieser Gruppe.

### Import pro Gruppe mit Hashtag

Jede ausgewählte WhatsApp-Gruppe hat einen eigenen Importmodus: **Alle Bilder** (Standard) oder **Nur mit Hashtag**, beispielsweise `#bilderwand`. Verglichen wird der vollständige Hashtag im Text direkt am Foto, ohne Groß-/Kleinschreibung. Reine Textnachrichten zählen nicht. Nicht passende Bilder werden vor dem Download ignoriert und nicht bestätigt. Der Filter gilt auch für Nachimporte und Wiederholungen. Wird der Hashtag nachträglich am Foto ergänzt, kann das Bild über das Bildtextänderungsereignis übernommen werden. Bereits gespeicherte Fotos werden beim Entfernen eines Hashtags oder Ändern der Regel nicht gelöscht; dafür bleibt ❌ verfügbar.

### Bildtext auf dem Monitor

Pro WhatsApp-Gruppe gibt es eine eigene Auswahl: **Ganzen Bildtext anzeigen**, **Nur Erkennungs-Hashtag entfernen** oder **Keinen Bildtext anzeigen**. Die Einstellung gilt auch für vorhandene Fotos beim nächsten Feed-Abruf. Der Erkennungs-Hashtag wird als vollständiges Wort ohne Groß-/Kleinschreibung entfernt; andere Hashtags bleiben bestehen. Der gespeicherte Originaltext und Absendername bleiben unverändert. Bestehende Hashtag-Gruppen behalten zunächst die bisherige ausgeblendete Textanzeige; sie lässt sich hier ausdrücklich ändern. Die allgemeine Bildtext-Einstellung und die Platzprüfung des Monitors gelten weiterhin.

### Automatische Gruppen mit Namensmustern

Unter WhatsApp können mehrere Namensregeln mit jeweils eigenem Hashtag und eigener Bildtext-Einstellung angelegt werden. `*` steht für beliebig viele Zeichen, `?` für ein Zeichen; Groß-/Kleinschreibung wird ignoriert. Beispiel: `*Verein*`. Es handelt sich um Wildcards, nicht reguläre Ausdrücke.

Einzeln angehakte Gruppen behalten Vorrang mit allen ihren Einstellungen. Für die übrigen bekannten Gruppen gilt die erste passende Namensregel. Die Vorschau zeigt die zusätzlich erfassten Gruppen vor dem Speichern. Eine nicht angehakte Gruppe ist kein Ausschluss: Sie kann durch eine Namensregel ausgewählt werden.

Die bekannten Gruppennamen werden bei bestehender WhatsApp-Verbindung alle 30 Sekunden aktualisiert. Neue passende Gruppen werden dadurch automatisch berücksichtigt; umbenannte Gruppen können aus der Auswahl fallen. Regeln gelten für Import, Wiederherstellung, Reaktionen und Bildtexte. Bereits gespeicherte Bilder bleiben erhalten. Speichern stößt wie bei der Einzelauswahl die Wiederherstellung verfügbarer Bilder der letzten 48 Stunden an.

### Fotos manuell drehen

Auf jeder Fotokarte in „WhatsApp-Bilder“ und „Fixierte Inhalte“ drehen **↩️ Links** und **↪️ Rechts** das Bild um jeweils 90°. Alternativ auf das ursprüngliche WhatsApp-Foto mit ↩️ (links) oder ↪️ (rechts) reagieren. Das gilt für importierte Fotos aus aktuell ausgewählten Gruppen, einschließlich Namensregeln. Es gibt hierfür keine zusätzliche Beschränkung auf Administratoren der WhatsApp-Gruppe.

Für weitere 90° die Reaktion entfernen und erneut setzen. Das Entfernen allein macht eine Drehung nicht rückgängig. Wiederholt gelieferte identische Reaktionsereignisse werden ignoriert. Die Änderung erscheint beim nächsten Abruf der Monitoranzeige. Originaldateien bleiben unverändert; manuelle Ausrichtung hat Vorrang vor KI-Drehvorschlägen. Vorhandene KI-Zuschnittkoordinaten werden verworfen, damit sie nicht zum gedrehten Motiv falsch angewendet werden. Drehen gibt gesperrte Bilder nicht frei.

### Fixinhalte aus WhatsApp

Pro Einzelgruppe oder Namensregel lässt sich **Fixinhalte per Doppelhashtag erlauben** einschalten (standardmäßig aus). Der konfigurierte Import-Hashtag plus direkt anschließendem `#fix` übernimmt ein neues Foto als Fixinhalt: beispielsweise `#bot#fix`. Groß-/Kleinschreibung ist egal. `#bot` allein bleibt ein normales Rotationsfoto. Auch im Modus „Alle Bilder“ ist für das Fixieren ein gültiger Basis-Hashtag einzutragen. Einzelregeln haben einschließlich dieser Freigabe Vorrang vor Namensregeln.

Fixierte Fotos erscheinen unter „Fixierte Inhalte“, nicht in „WhatsApp-Bilder“. Sie bleiben von der zeitlichen Foto-Ausblendung ausgenommen; KI-Sperren und manuelle Ausblendung gelten weiterhin. ❌ auf dem ursprünglichen Foto archiviert auch Fixinhalte. Bei der Bildtext-Option „Nur Erkennungs-Hashtag entfernen“ wird der vollständige Doppelhashtag entfernt. „Ganzen Bildtext anzeigen“ zeigt ihn unverändert. Die Option wirkt bei der erstmaligen Übernahme, nicht rückwirkend auf bereits importierte Fotos oder nachträgliche Textänderungen.
