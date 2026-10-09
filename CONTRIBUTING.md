# An ScreenRelay arbeiten

Der Code soll ohne Kenntnis des ursprünglichen Chats verständlich und änderbar sein. Einstieg: [Architektur](docs/architecture.md), [Entwicklung](docs/development.md) und [Konfiguration](docs/configuration.md).

## Leitlinien

- Namen beschreiben ihre Aufgabe. Fachliche Zustände wie Import, Prüfung und Archivierung ausdrücklich benennen; Abkürzungen außerhalb kleiner Schleifen vermeiden.
- Pro Modul eine zusammenhängende Verantwortung. HTTP-Routen behandeln Zugriff und Eingaben; Services enthalten die Fachlogik. UI-Seiten sollen eigene Module haben.
- Einfache Funktionen und explizite Datenflüsse bevorzugen. Keine generischen Frameworks oder zusätzlichen Abstraktionen für einen einzelnen Anwendungsfall einführen.
- Kommentare erklären Gründe, Grenzen und ungewöhnliches Verhalten. Den offensichtlichen Ablauf nicht nacherzählen. Insbesondere WhatsApp-Kompatibilitätscode mit dem betroffenen Verhalten erklären.
- Zeitintervalle, Grenzwerte und Standardwerte verständlich benennen und zentral halten. Unternehmensdaten gehören in die private Konfiguration, nicht in den Quellcode.
- Fehler nicht still verschlucken. Nutzbare Fehlermeldungen geben, ohne Schlüssel, Bildinhalte oder private URLs zu protokollieren.
- Refactoring und Verhaltensänderungen möglichst getrennt halten. Bestehende Daten, Archivierung, manuelle Freigaben und Verbindungsabbau erhalten.

## Änderung fertigstellen

Die passende Dokumentation bei geänderten Einstellungen, Datenflüssen oder Betriebsabläufen aktualisieren. Tests sollen relevantes Verhalten und Fehlerfälle prüfen, nicht nur die Implementierung wiederholen. Externe Dienste simulieren; niemals mit Produktionsdaten testen.

```sh
npm run check
npm run format:check
npm test
npm run release:check
```

UI-Änderungen zusätzlich in der betroffenen Ansicht prüfen. Eine erfolgreiche Testsuite ersetzt weder Sichtprüfung noch einen Test mit echten Integrationen. Nicht durchgeführte Prüfungen ausdrücklich nennen.

## Zuständigkeiten beibehalten

`public/admin.js` enthält nur Start, Navigation, Sitzungswechsel und Polling. Die Seiten und Inhaltseditoren liegen in `public/admin/`. Neue Seiten dort mit expliziten Abhängigkeiten ergänzen. Seiten lesen den aktuellen Datenstand über `getData()`; sie ändern ihn nicht selbst. API-Änderungen laufen über `api`, danach werden Daten über `refresh` aktualisiert. Suchfilter und Vorschau-Freigaben gehören ausschließlich der Medienseite.

`public/display.js` steuert Zugang, Feed und Wiedergabe. Rasterkoordination, Infotafel, Bildeinpassung und Slide-Ressourcen liegen in `public/display/`. Diese Module dürfen nicht wieder in den Einstiegspunkt wandern.

Seiten- und Formular-Markup gehört in `public/templates/*.html`, Verhalten ins zugehörige JavaScript-Modul. Keine HTML-Strings mit Nutzerdaten zusammensetzen. Texte über `textContent` und Formularwerte über DOM-Eigenschaften setzen; Rich-Text ausschließlich mit der vorhandenen Bereinigung ausgeben.

`npm run check` führt ESLint und den Syntaxcheck aus. Neue undefinierte Variablen, unbenutzte Importe oder unerreichbarer Code sind Fehler, keine stillschweigend akzeptierten Warnungen.

Die Dateilänge ist ein Warnsignal, kein starres Limit. Entscheidend ist, ob eine Änderung an einer Funktion an einer nachvollziehbaren Stelle vorgenommen werden kann.
