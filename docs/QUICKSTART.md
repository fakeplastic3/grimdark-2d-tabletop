# Quick start

This checkout is a work in progress. The rule pack contains original training values; selecting “Ultramarines” or “Orks” changes a team theme and does not provide current official faction rules. Use the coverage notice in the app and read [rules coverage](RULES_COVERAGE.md) before a game.

## Install and open the browser app

From the project folder, use Node.js 22.15 or newer and npm. Dependencies were installed successfully on 2026-11-02. For a fresh checkout, run:

```sh
cd ~/grimdark-2d-tabletop
npm ci
npm run dev
```

Open the local URL Vite prints, normally `http://127.0.0.1:5173`. The production build, type checking, lint and 79 unit/integration/core tests passed on 2026-11-02.

## Play a local training match

When the app is running, configure each commander’s army. Select a team theme, add or remove training units, adjust squad sizes, and watch the pack’s points and formation validation. Pick a training budget, battlefield and match length, then start the operation.

During deployment, select each unit and click the board to preview its formation inside its deployment zone. Confirm the placement; after every unit is placed, lock that commander’s deployment. Once both players lock deployment, follow the highlighted phase and active commander. Select units from the roster or their circular model tokens. The inspector shows the current legal actions and reports rejected orders. Use the event log to review combat rolls and casualties.

The ruler measures base edges when two model bases are selected. The grid, range overlay, labels, zoom, pan, fullscreen and settings controls change the view. They do not make an otherwise illegal move valid. The engine reports distance and placement errors when a move or charge is confirmed.

Use **Export save** to download a local match. The browser also keeps an automatic recovery save. **Replay match** steps through the saved actions; positioning undo is limited to safe deployment or movement actions. Do not share a save that contains a private rules pack.

## Run the dependency-free engine tests

The pure TypeScript engine tests do not need npm packages:

```sh
cd ~/grimdark-2d-tabletop
npm run test:core
```

This is not a TypeScript type check, browser test or production build. The latest recorded run passed 41 geometry, dice, combat, complete-training-match, replay and benchmark tests. Full check results are not available until registry downloads work:

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
```

## Use the private-room server

Once dependencies install, start the frontend in one terminal and the server in another:

```sh
npm run server
```

The local server uses `ws://127.0.0.1:8080`; health status is at `http://127.0.0.1:8080/health`. Open **Private online game** in the page, create a room, and join it from a second browser or device using its code and the server address. Both players choose a starter training army or import a valid army JSON and mark ready. A reconnect token is stored only for this browser tab’s session.

This endpoint is local to the machine; it is not a public online service. A remote server needs TLS, persistent storage, WebSocket support and the exact frontend origin in `ALLOWED_ORIGINS`. GitHub Pages alone cannot host this backend.

## GitHub status

The source repository is [fakeplastic3/grimdark-2d-tabletop](https://github.com/fakeplastic3/grimdark-2d-tabletop). GitHub authentication succeeded on 2026-11-02. For future publishing, follow [the publication steps](DEVELOPMENT.md#github-authentication-and-publication).

## Important gaps

This build is training-only, and the browser app has not yet passed a Vite build or browser test because dependencies could not be downloaded. There is no verified official army list, mission or complete 11th Edition rules coverage, and no live multiplayer endpoint. See [known limitations](KNOWN_LIMITATIONS.md) for the remaining acceptance work.
