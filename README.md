# Stromtool

Planungstool für Stromverteilung mit Lastkabeln: Verteiler → Plugboxen → Abgänge → Verbraucher,
mit Auslastung je Abgang, Phasenbilanz L1/L2/L3, optionalem Spannungsfall und PDF-Export.

## Starten

```bash
npm install
```

```bash
npm run dev
```

Läuft dann auf <http://localhost:5180>.

## Aufbau

| Ebene | Bedeutung |
| --- | --- |
| **Verteiler** | z. B. `Avo1`, Modell frei benennbar. Zuleitung aus der Liste (CEE 16/32/63/125 A, Powerlock 200/400 A) oder eigener Wert; Absicherung je Netzphase und Watt-Budget bleiben einzeln editierbar. |
| **Plugbox** | z. B. `FS1`. Anzahl der Abgänge frei einstellbar (1–48, Standard 6) – ein 16-A-Verteiler bekommt so einfach 3. Optional eine Zuleitung für den Spannungsfall. |
| **Abgang** | heißt automatisch `FS1_1` … `FS1_6`, hat Netzphase (L1/L2/L3), Absicherung (16 A) und ein eigenes Ziel-Maximum (2 kW). |
| **Verbraucher** | Bibliothek mit Name, Watt/Stück, Farbe und optional eigenem cos φ. |

Abgänge bekommen ihre Netzphase automatisch nach dem Muster 1&4 → L1, 2&5 → L2, 3&6 → L3;
sie lässt sich pro Abgang überschreiben (Klick auf das Phasen-Badge).

## Ansichten

- **Plan** – grafische Übersicht: Verteilerkopf mit Budget, Phasenbalken und Schieflast, darunter
  die Plugboxen als Karten mit Auslastungsbalken je Abgang. Klick auf einen Abgang öffnet den
  Bestückungsdialog.
- **Tabelle** – die Excel-Matrix: Zeilen = Abgänge, Spalten = Verbrauchertypen mit farbigem Kopf.
  Stückzahlen direkt eintippen, `Max W` und Phase inline änderbar.
- **Verbraucher** / **Kabel** – Bibliotheken.
- **Einstellungen** – Spannung, cos φ, κ, Grenzwert Spannungsfall, Vorgaben für neue Plugboxen.

## Rechenwege

- Strom: `I = P / (U · cos φ)`, cos φ projektweit (Standard 0,95) oder je Verbrauchertyp.
- Spannungsfall Drehstrom (≥ 4 Adern): `ΔU = √3 · L · I · cos φ / (κ · A)`, bezogen auf `√3 · U`.
- Spannungsfall Wechselstrom (≤ 3 Adern): `ΔU = 2 · L · I · cos φ / (κ · A)`, bezogen auf `U`.
- Gerechnet wird mit dem Strom der höchstbelasteten Phase der Plugbox (ungünstigster Fall).
- κ = 56 m/(Ω·mm²) für Kupfer bei 20 °C; betriebswarm ist 48 der konservativere Wert
  (in den Einstellungen änderbar).

Warnungen und Fehler sitzen als Pille unten rechts und klappen als Overlay auf – bewusst außerhalb
des Layoutflusses, damit beim Tippen nichts verspringt. Geprüft werden: überschrittene Absicherung,
überschrittenes Ziel-Maximum, Verteilerbudget, Phasenabsicherung, Schieflast > 25 %, Spannungsfall
über Grenzwert und Kabel über Strombelastbarkeit.

## Speichern

Das Projekt liegt automatisch im `localStorage` des Browsers. **Speichern** legt eine
`*.stromtool.json` ab, **Öffnen** lädt sie wieder – das ist der Weg für Backups und zum Weitergeben.

## PDF

**PDF-Export** erzeugt einen Verteilerplan im Querformat:

- Kopf mit Projektdaten und fünf Kennzahlen (Gesamtleistung, Verbraucher, Verteiler, Plugboxen,
  belegte Abgänge), darunter eine Farblegende der eingesetzten Verbraucher mit Stückzahl.
- Je Verteiler ein Kennzahlenblock mit gezeichneten Balken für Budget und L1/L2/L3 – jeweils mit
  Ampere, Prozent und Ampelfarbe – plus Schieflast und Auslastungs-Pille in der Kopfzeile.
- Je Verteiler die Abgangsmatrix mit farbigen Verbraucherspalten, Zuleitung und Spannungsfall je
  Plugbox und einem Auslastungsbalken pro Abgang (Markierung = eigenes Ziel-Maximum).
- Stückliste mit Leistungsanteil und die Hinweisliste.

Das selbst gesetzte Ziel-Maximum je Abgang ist eine reine Planungshilfe und erscheint deshalb
**nicht** im Report – dort stehen nur echte Grenzwertverletzungen (Absicherung, Budget,
Phasenabsicherung, Schieflast, Spannungsfall, Kabelbelastbarkeit). In der App wird es weiter
angezeigt.

### Erweiterung: Labels

`exportPlanPdf(project, save)` in [src/lib/pdf.ts](src/lib/pdf.ts) gibt das jsPDF-Dokument zurück.
Ein Label-Export (Beschriftung für Plugboxen und Abgänge) lässt sich daneben als zweite Funktion
im selben Modul aufsetzen – Namen, Phase, Bestückung und Leistung je Abgang liefert
`calcProject()` aus [src/lib/calc.ts](src/lib/calc.ts) bereits fertig.

## Projektstruktur

```
src/
  types.ts              Datenmodell
  store.ts              Zustand-Store (zustand + immer, localStorage-Persistenz)
  lib/calc.ts           Leistung, Strom, Phasenbilanz, Spannungsfall, Hinweise
  lib/defaults.ts       Startprojekt, Verbraucher- und Kabelbibliothek, Verteiler-Vorlagen
  lib/pdf.ts            PDF-Export
  lib/projectFile.ts    Speichern / Öffnen der Projektdatei
  components/           Oberfläche
```
