# Atmosphärenlabor

Deutschsprachiges Lernlabor für atmosphärische Stabilität, mit gemeinsamer HTML/JavaScript-Oberfläche für Android und Windows. Keine Flugwetterberatung.

## Anwendungen

- **Android 8 oder neuer (einschließlich Android 10):** Debug-APK aus dem Workflow `Android APK erstellen`. Auf einem Android-10-Gerät muss die Bedienung zusätzlich geprüft werden; der CI-Build ersetzt keinen Gerätetest.
- **Windows 10/11, x64:** `AtmosphaerenLabor-<Version>-Setup-x64.exe` installiert die App für den aktuellen Benutzer. Die installierte App prüft beim Start und alle vier Stunden GitHub-Releases, lädt neue stabile Versionen herunter und installiert sie beim Beenden. Die portable EXE hat keine automatische Updatefunktion.
- Installer und APK sind derzeit nicht mit einem eigenen Release-Zertifikat signiert. Windows kann beim ersten Start eine Herausgeberwarnung anzeigen.

Die Installationsdateien stehen als GitHub-Actions-Artefakte zur Verfügung. Der manuell gestartete Workflow `Windows-Version veröffentlichen` erstellt nach Tests ein GitHub-Release mit Installer, Blockmap und `latest.yml` für automatische Updates. Vor jedem Release müssen `desktop/package.json` und `desktop/package-lock.json` auf eine neue Version gesetzt werden. Der Versionsname der APK steht in `app/build.gradle`.

## Echte DWD-Profile

Der automatische Abruf unterstützt zunächst **Schleswig, WMO 10035**, Meldetermine 00 und 12 UTC. Andere Stationen können weiterhin per CSV importiert werden. Die Standortsuche bestimmt lediglich die nächste gelistete Station; sie garantiert keine DWD-Abdeckung.

`tools/dwd_profiles.py` lädt die tatsächlich im [DWD-Verzeichnis](https://opendata.dwd.de/weather/weather_reports/radiosonde/bufr/) gelisteten Dateien. Es dekodiert ausschließlich das hochaufgelöste Aufstiegstemplate **309057** mit ECMWF ecCodes und prüft Stationskennung, Teilmeldungen (Subsets), Zeitangaben, Einheiten, bodennahen Profilbeginn und monotone Höhe/Druckwerte. Abstiegstemplate 309056, NIL-Meldungen, Trajektorien und andere Templates werden nicht als Aufstieg verwendet. Fehlende Temperatur-/Taupunktwerte werden verworfen und nie durch Modellwerte ersetzt. Geopotenzielle Höhen bleiben als solche in Metern über MSL dokumentiert. Die App bezieht die Profilhöhe auf die unterste gültige Messstufe.

Der Workflow `DWD-Profile aktualisieren` sucht stündlich (GitHub kann den Zeitplan verzögern) nach der neuesten verifizierten Messung und veröffentlicht JSON auf dem Branch `data`. Beide Apps laden dieses JSON über HTTPS von `raw.githubusercontent.com`; ein eigener Server oder Android-BUFR-Decoder ist nicht nötig. Der erste Lauf muss manuell gestartet werden. Zeitpläne laufen erst, wenn der Workflow im Standardbranch liegt. Scheitert die Suche, schlägt der Workflow fehl und bisherige Dateien bleiben erhalten. Es werden höchstens 240 Dateien aus den letzten 30 Stunden untersucht; diese Begrenzung kann bei verändertem DWD-Meldevolumen eine Messung verpassen. Bereits veröffentlichte Termine bleiben abrufbar; ein historisches DWD-Archiv wird nicht aufgebaut.

Die Oberfläche zeigt Quelle, WMO-Station, nominellen Meldetermin, tatsächlichen Start, Alter beim Laden und Zeitpunkt der serverseitigen Verarbeitung. Bei mehr als 24 Stunden erscheint ein Altershinweis. Ein fehlender Termin führt zu einer verständlichen Fehlermeldung; ein bereits geladenes Profil bleibt aktiv. TLS-Zertifikatsprüfung bleibt auf beiden Plattformen eingeschaltet.

**Nachgewiesener Referenzfall:** WMO 10035, Meldetermin 26.10.2026 00 UTC, Start 25.10.2026 22:44:54 UTC; 3.329 verwertbare Stufen, Messbasis 45,8 m MSL, Bodendruck 992,74 hPa. Die binäre Testdatei und ihre Herkunft/Prüfsumme liegen unter `tests/fixtures`. Die ursprüngliche Meldung enthält eine zusätzliche ungültige Stufe, die der Decoder verwirft. Synthetische Mehrstationsdateien prüfen zusätzlich komprimierte und unkomprimierte Subsets.

Der lokale CSV-Import akzeptiert die bisherigen eigenen und Wyoming-Spalten. Leere Taupunktfelder bleiben fehlend und werden nicht als 0 °C interpretiert. Winddiagramm und Scherungsbewertung verwenden weiterhin das einstellbare Modellwindprofil; gespeicherte BUFR-Windmessungen werden dort noch nicht verwendet. Die 3D-Fläche ist weiterhin eine Sensitivitätsanalyse. Eine unabhängige CAPE/CIN-Validierung mit MetPy sowie ein NOAA-Fallback sind noch offen.

## Entwicklung und Prüfung

Maßgebliche Oberfläche: `app/src/main/assets/index.html`. Die ältere Datei `app/assets/index.html` gehört nicht zum Android- oder Windows-Build.

```sh
python -m pip install eccodes==2.50.0
python -m unittest discover -s tests -v
node --test tests/*.test.cjs
python tools/dwd_profiles.py --output profiles
cd desktop
npm ci
npm start
npm run dist
```

Android: Java 17, Gradle 8.9, Android SDK 35; `gradle --no-daemon assembleDebug`. Der GitHub-Workflow richtet diese Werkzeuge ein. Windows: Node 24 und Electron; `npm run dist` erstellt Installer und portable EXE. Beide Builds laufen auch auf `codex/**`-Branches. Windows-CI startet außerdem die gepackte App unsichtbar, lädt die echte Referenzmessung, prüft Metriken/Zoom/Einstellungsmenü und speichert einen Screenshot.

Die Oberfläche läuft offline mit Idealprofil und lokalem CSV-Import. Internet ist für Standortsuche, Messdaten und Updateprüfung nötig. Ein fehlgeschlagener Updatecheck verhindert den App-Start nicht.

Ab Version 1.1.1 ist die 3D-Kachel kompakter: Die Grafik sitzt unten, das Einstellungsmenü öffnet oberhalb der Grafik, und die Auftriebsachse liegt an der rechten hinteren Kante. Modellregler, 3D-Optionen, Drehung, Zoom, Verschiebung, Stations-/Ortsauswahl und der geöffnete Menüzustand werden lokal gespeichert und beim nächsten Start wiederhergestellt. Messdateien und Meldetermine werden dadurch nicht als aktuelle Messung wiederhergestellt.

Version 1.1.2 ordnet die Sondenbedienung kompakt oberhalb von Atmosphärenreglern und 3D-Ansicht an. Beide beginnen auf derselben Höhe; die 3D-Kachel nutzt die gesamte Höhe bis zur folgenden Ergebniskachel. Die CSV-Spaltenhilfe entfällt, die Sondenhinweise sind einklappbar. Die Option „3D-Fläche glätten“ verwendet eine gewichtete Mittelung ausschließlich für das gezeichnete Flächennetz, gemittelte Beleuchtungsnormalen und geschlossene Zeichenränder. Originalmesswerte, Profillinie und CAPE/CIN bleiben unverändert; die Glättung lässt sich abschalten und wird als Einstellung gespeichert.

Version 1.1.3 ergänzt Start und letzte gültige Aufstiegsmessung mit MSL-Höhe, Druck, Temperatur und optional UTC-Zeit/Koordinaten aus BUFR. Die Positionsverschiebungen werden auf die Startkoordinaten bezogen, die Zeitverschiebungen auf den Startzeitpunkt. Ein Landepunkt wird daraus nicht abgeleitet. Ältere JSON-Profile und CSV-Dateien funktionieren weiterhin; fehlende Metadaten bleiben offen. Der Ausschnitt der Modellrechnung wird vom vollständigen Messprofil getrennt ausgewiesen. Diagramme markieren LCL, LFC, EL, stärksten Auftrieb, stärkste Temperaturinversion und gegebenenfalls ein inneres Temperaturminimum. Beschriftungen stehen in einer eigenen Spalte und zusätzlich in aufklappbaren Wertelisten. Ein Wolkensymbol am LCL illustriert eine mögliche Kondensationsbasis, ohne beobachtete Wolken oder deren Obergrenze zu behaupten. Ein aufklappbares Glossar erklärt die Größen und den Unterschied zwischen Ballonsonde und Modell-Luftpaket. CAPE-/CIN-Färbung folgt den tatsächlich verwendeten Integrationsgrenzen; die Berechnung selbst bleibt unverändert.

Fachliche Quellen für die Erläuterungen: [NOAA/NWS zu CAPE und CIN](https://www.weather.gov/lmk/indices), [NOAA-Glossar zu LFC](https://www.noaa.gov/jetstream/appendix/weather-glossary-l), [ECMWF BUFR User Guide](https://confluence.ecmwf.int/download/attachments/35752427/bufr_user_guide.pdf), [primäre Untersuchung zur BUFR-Positions-/Zeitrekonstruktion](https://gmd.copernicus.org/articles/17/3783/2024/gmd-17-3783-2024.html).

Quellen: [DWD Open Data](https://opendata.dwd.de/weather/weather_reports/radiosonde/), [ECMWF-Aufstiegs-/Abstiegstemplates](https://confluence.ecmwf.int/pages/viewpage.action?pageId=266590407), [ecCodes-Subset-Extraktion](https://confluence.ecmwf.int/spaces/UDOC/pages/140393053/How+to+split+subsets+-+ecCodes+BUFR+FAQ).

Version 1.1.4 zeigt die Wolke am LCL nur gefüllt, wenn das Luftpaket bereits gesättigt ist oder die eingestellte erzwungene Hebung das LCL erreicht. Andernfalls bleibt die Wolke hohl: mögliche Kondensationsbasis, aktuell im Szenario nicht erreicht. Ohne LCL im dargestellten Profil erscheint kein Symbol. Diese Darstellung ist keine beobachtete Bewölkung oder numerische Wetterwahrscheinlichkeit.
