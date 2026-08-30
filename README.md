# Autopod

Eine minimalistische Podcast-Player-Web-App, gebaut für den Einsatz im Auto
(z. B. auf einem alten Tablet oder Handy im Armaturenbrett) — große
Touch-Ziele, wenige Screens, kein Schnickschnack.

Läuft komplett statisch im Browser, keine Build-Toolchain nötig.
Live unter **https://weihemai.github.io/autopod/**.

## Kernfunktionen

- **Podcast-Suche** über die iTunes Search API (via Proxy, siehe unten)
- **Abos, Show-Seiten, Episodenlisten** und ein aggregierter **Posteingang**
  über alle Abos hinweg
- **Player** mit Wiedergabe, Skip ±10/30s, Warteschlange (Queue)
- **gpodder-API-Sync** gegen einen selbst gehosteten opodsync-/gpodder-API-
  kompatiblen Server (z. B. AntennaPod-Sync): Abos, Wiedergabeposition und
  gehörte Episoden werden synchronisiert; AntennaPod gilt dabei als
  Quelle der Wahrheit für Abos
- **Mehrsprachig** (Deutsch/Englisch) und **Auto-Home**: kehrt nach
  einstellbarer Inaktivität automatisch zum Home-Screen zurück (fürs
  Autodisplay)
- Einstellungen (Sprache, Idle-Timeout, gpodder-Zugangsdaten) werden nur
  lokal im Browser (`localStorage`) gespeichert

## Architektur

Reines HTML/CSS/JS ohne Framework oder Build-Schritt:

| Datei | Zweck |
|---|---|
| `index.html` | Markup aller Screens |
| `style.css` | Styling |
| `app.js` | App-Zustand, Navigation, Player, Queue, Einstellungen, Sync-Orchestrierung |
| `api.js` | Podcast-Suche & Feed-Parsing (über Proxy, siehe unten) |
| `gpodder.js` | gpodder-API-Client (Abos, Episode-Actions, Wiedergabeposition) |
| `i18n.js` | Übersetzungstexte (DE/EN) |

### CORS-Proxy

Weder die iTunes Search API noch die meisten Podcast-RSS-Feeds senden
CORS-Header, daher kann diese statische App sie nicht direkt aus dem
Browser abrufen. Alle Aufrufe laufen über einen kleinen serverseitigen
Proxy (`AUTOPOD_PROXY_URL` in `api.js`), der die Anfrage weiterleitet und
CORS-Header ergänzt.

### gpodder-Sync

- Server-URL/Nutzername/Passwort werden ausschließlich lokal im Browser
  gespeichert, niemals im Quelltext (das Repo ist öffentlich auf GitHub
  Pages).
- Der Standardwert für die Server-URL im Einstellungsfeld ist
  `https://gopodder-latest.onrender.com/`.
- Abos werden über den **kontoweiten** Endpunkt `/subscriptions/{user}.json`
  gepullt (aggregiert über alle Geräte), nicht über den geräte-spezifischen
  `/api/2/...`-Endpunkt — sonst bliebe die Liste für ein neues Gerät leer.
- "Force Sync" in den Einstellungen pullt Positionen und Abos vom Server
  und pusht anschließend lokale Änderungen (Abo-Liste, gehörte Episoden,
  aktuelle Wiedergabeposition, Queue).

## Deployment

Die App wird als statische Seite über **GitHub Pages** direkt aus dem
`master`-Branch (Root) ausgeliefert — kein separater Build- oder
Deploy-Schritt nötig, ein `git push` genügt.
