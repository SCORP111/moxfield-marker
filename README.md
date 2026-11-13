# Moxfield-Marker

Firefox-Erweiterung: Karten in Moxfield-Decks farblich markieren.

## Bedienung

- Auf jeder Deck-Seite erscheint unten links eine kleine Leiste mit sechs Farben.
- Farbe anklicken, dann Karten anklicken. Nochmal klicken entfernt diese Farbe wieder. `Esc` beendet den Malmodus.
- Eine Karte kann mehrere Farben haben: einfach mit einer weiteren Farbe anklicken. Die Markierung wird dann geteilt dargestellt.
- `Alt`+Klick auf eine Karte markiert sie jederzeit mit der zuletzt benutzten Farbe.
- Radierer: entfernt Markierungen unabhängig von der Farbe.
- Mülleimer: entfernt alle Markierungen des Decks (zweiter Klick bestätigt).
- Listen-Knopf: Legende. Dort kann jede Farbe eine Bedeutung bekommen (z. B. „raus“), und die Kartennamen einer Farbe lassen sich kopieren (Format `1 Kartenname`, passt in Bulk Edit).
- Die Zahl im Farbpunkt ist die Anzahl markierter Karten.
- Funktioniert in allen Ansichten (Text, Condensed Text, Visual Grid, Stacks, Spoiler).

Markierungen hängen am Kartennamen und werden pro Deck lokal in Firefox gespeichert. Sie sind nur im eigenen Browser sichtbar, nicht für andere und nicht auf anderen Geräten.

## Installation

Zum Ausprobieren (hält bis zum Firefox-Neustart):

1. Dieses Repository herunterladen (grüner Knopf „Code“ → „Download ZIP“) und entpacken
2. In Firefox `about:debugging#/runtime/this-firefox` öffnen
3. „Temporäres Add-on laden…“ und `extension/manifest.json` auswählen
4. Moxfield-Tab neu laden

Dauerhaft: von Mozilla signieren lassen (kostenlos, die Erweiterung bleibt dabei privat):

```
npx web-ext sign --source-dir extension --channel unlisted --api-key <JWT issuer> --api-secret <JWT secret>
```

Die `.xpi` aus `web-ext-artifacts/` in Firefox ziehen. Die Schlüssel gibt es unter https://addons.mozilla.org/developers/addon/api/key/.

## Wenn es nach einem Moxfield-Update nicht mehr geht

Die Erweiterung erkennt Karten an den Attributen `data-hash` + `data-row-key` und liest den Namen aus `[data-testid="deck-view-table-row-name"]` bzw. dem `alt` des Kartenbilds. Beides steht oben in `extension/content.js` (`CARD_SEL`, `NAME_SEL`, `cardName`).
