# 🎾 Doodle Pop

A juicy, browser-based **tennis-ball bubble shooter** starring a dark-grey
goldendoodle puppy with heterochromia (amber/brown left eye, parti icy-blue
right eye). Pop tennis-ball clusters, chain rising-pitch combos, fill the
**ZOOMIES** meter for a rainbow frenzy, and watch the pup **leap to catch** the
balls that fall. Built as an installable, offline-capable PWA with nothing but
HTML5 Canvas and Web Audio — **no frameworks, no build step, no dependencies.**

Sibling game to **Hoppy Pup** (the puppy renderer, audio engine and juice
helpers are lifted from it and extended here).

## Play

- **Drag to aim, release to pop** (touch) — or **move the mouse and click**.
- The dotted line previews your shot, **including the wall bank**.
- **Tap the held ball** (or right-click) to swap it with the next ball.
- Match **3+ of the same colour** to pop them. Balls left dangling drop — the
  puppy leaps to **catch** them, banking 🎾 **treats**.
- Don't let the descending net push the balls past the red **danger line**.

### Specials & systems

- **Squeaky toy** 🌈 — rainbow wildcard, matches any colour.
- **Bone bomb** — radial blast clears nearby balls.
- **Flaming serve** — clears the whole column it lands in.
- **Golden ball** — rare score jackpot + a shower of treats.
- **ZOOMIES meter** — fills from chains/drops; full = a few seconds of rainbow
  **frenzy** (every shot is a wildcard, the net stops descending).
- **Treat Shop** — spend treats on a bandana, sun visor, ball skins and court
  themes (all canvas-drawn). Unlocks persist.
- **Daily streak** bonus, persistent **best score**, optional **colourblind
  pips**.

### Keyboard

- `Space` / click — fire (aims toward the pointer; `←` `→` nudge the aim)
- `M` — mute / unmute   ·   `Esc` / `P` — pause   ·   `R` — restart

Best score, treats, unlocks, mute and streak are saved in your browser
(`localStorage`).

## Run it locally

You need either Node or Python. From this folder:

### Option A — Node (recommended; prints your phone URL)

```bash
node server.js
```

It prints `http://localhost:8080/` for this computer and a
`http://<your-ip>:8080/` link to open on your phone (same Wi-Fi).

### Option B — Python

```bash
python -m http.server 8080
```

(Use `py -m http.server 8080` on Windows if `python` isn't on your PATH.)

## Install on your phone 📱

1. Make sure your **phone and computer are on the same Wi-Fi network**.
2. Start the server and note the `http://<your-ip>:8080/` URL it prints.
3. Open that URL in your phone's browser (Safari on iPhone, Chrome on Android).

### Add to Home Screen

- **iPhone (Safari):** **Share** → **Add to Home Screen**.
- **Android (Chrome):** **⋮** menu → **Install app** / **Add to Home screen**.

It launches full-screen, portrait, with its own icon and works offline after
the first load.

> iOS only registers service workers over `http://localhost` or `https://`. Over
> a plain LAN IP the game still plays and installs perfectly; for full
> offline/standalone behaviour on a phone, serve it over HTTPS (any dev tunnel
> works) or deploy it (below).

## Deploy

The whole game is static files, so it hosts anywhere.

### GitHub Pages (the project's deploy target)

```bash
git init
git add .
git commit -m "Doodle Pop"
git branch -M main
git remote add origin https://github.com/<you>/doodle-pop.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Build and deployment → Source: Deploy
from a branch → Branch: `main` / `/ (root)`**. Your game goes live at
`https://<you>.github.io/doodle-pop/`. Because every path is relative
(`./game.js`, `./sw.js`, …) it works correctly from a project subpath. Bump the
`CACHE` constant in [`sw.js`](sw.js) whenever you change assets so clients pull
the update.

### Netlify

Drag this folder onto <https://app.netlify.com/drop>, or point Netlify at the
repo — no build command, publish directory `.`.

## Project layout

```
index.html      page shell + service-worker registration
game.js         game loop, board/physics, the goldendoodle launcher, audio, UI
style.css       full-screen mobile-friendly layout
manifest.json   PWA manifest (portrait, theme colours)
sw.js           cache-first service worker (offline) — bump CACHE on changes
server.js       zero-dependency LAN static server (prints your phone URL)
icons/          generated PWA icons
tools/          icon generator (node tools/make-icons.mjs)
```

## Regenerate the icons

```bash
node tools/make-icons.mjs
```

## Roadmap

v1 is **Arcade / Endless** only. The board, matching and catch code are kept
mode-agnostic so a **Levels** mode (fixed layouts, limited shots, 3-star
ratings) can slot in for v2.
