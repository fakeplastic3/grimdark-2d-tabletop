# Development and publication

Last environment review: 2026-11-02. Node `v26.13.0` and npm `11.20.0` are available. Network-enabled installation and GitHub authentication succeeded. Type checking, lint, 38 Vitest tests, 41 core tests and the production build passed. Local server checks require execution outside the restricted sandbox. The Chromium browser smoke test also passed; the source repository is https://github.com/fakeplastic3/grimdark-2d-tabletop. See [validation](VALIDATION.md).

## Install and run

Use Node 22.15+ and npm. CI targets Node 24. From the repository root:

```sh
npm install
npm run dev
```

The generated `package-lock.json` pins the installed dependencies. Use `npm ci` for reproducible installs.

Vite prints its local URL, normally `http://127.0.0.1:5173`. In another terminal, if testing online rooms:

```sh
npm run server
```

The default WebSocket endpoint is `ws://127.0.0.1:8080`; `http://127.0.0.1:8080/health` is the health endpoint. These are local addresses, not verified public services. If Vite selects another port, add that exact origin to the server allowlist.

## Required checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run check` combines the first four commands. `npm test` runs Vitest and the native Node engine suite. Browser tests remain a separate required check. Linux runners use `npx playwright install --with-deps chromium`. Tests must execute against the actual source/build; static inspection is not a substitute.

The pure-engine tests can run independently even while package installation is blocked:

```sh
npm run test:core
```

This uses the Node test runner and `scripts/core-loader.mjs` to load TypeScript. It does not type-check source or exercise dependency-backed schemas, backend transport, React rendering or Playwright. Record its actual results separately from the still-required full checks.

The CI workflow runs type checking, lint, unit/integration tests, build and browser tests. It retains browser reports on failure. An absent browser configuration or test suite should fail rather than silently skip the required checks. No workflow result is claimed merely because the YAML was added.

For build inspection:

```sh
npm run build
npm run preview
```

Use the preview URL printed by Vite. Screenshots in future documentation must come from the actual running application; no generated mockup should be labelled as a screenshot.

## Backend deployment contract

Choose a Node host with WebSocket support and a persistent writable volume. Run one replica until room storage is redesigned for distributed concurrency. Install dependencies and start with `npm run server` (the current server command uses the `tsx` development dependency, so a production-only dependency install is insufficient).

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` inside a hosted container/reverse-proxy environment. |
| `PORT` | `8080` | HTTP health and WebSocket listener port. |
| `ALLOWED_ORIGINS` | `http://127.0.0.1:5173,http://localhost:5173` | Comma-separated browser origins. Include the exact deployed frontend origin without a path or trailing slash. |
| `MATCH_DIRECTORY` | `runtime/matches` | Durable private room storage directory. Mount persistent storage here. |

For a local listener reachable on your LAN, for example:

```sh
HOST=0.0.0.0 PORT=8080 npm run server
```

For hosted use, configure the service variables in the host's settings, terminate TLS and forward WebSocket upgrades. An HTTPS frontend must use `wss://`. Keep room storage private. Do not commit runtime files or seat tokens. Confirm health, two-client synchronization, authorization rejection, disconnect/reconnect and process-restart recovery before reporting an endpoint as operational.

GitHub Pages hosts only the static client. It cannot run this Node/WebSocket backend. No backend deployment was verified in the development environment.

## GitHub authentication and publication

Publication is authorized by the project request. GitHub authentication succeeded for `fakeplastic3` on 2026-11-02. To authenticate a fresh environment:

```sh
gh auth login --hostname github.com --git-protocol https --web
gh auth status
```

Never paste a token into source code or chat. Inspect the staged files and run all required checks before publication. The initial publication uses the GitHub account no-reply identity as authorized by the user. Configure your preferred identity for future commits.

For a new repository, after identity and checks are ready:

```sh
git add .
git diff --cached --stat
git commit -m "Build training tabletop application and document rules gaps"
git branch -M main
gh repo create grimdark-2d-tabletop --public --source=. --remote=origin --push
gh repo view --json url --jq .url
gh run list --limit 5
```

Use `--private` instead of `--public` if source review discovers unresolved disclosure or licensing issues. If the repository already exists, inspect its remote and history before pushing; do not recreate it or force-push. Retain the distinction between distributable original code and private source packs.

Repository creation/push is successful only after the remote can be queried and the expected commit is present. Record the returned URL, not an assumed account/repository address. Do not report CI as passed until its actual run completes successfully.

## GitHub Pages

The Vite production base is configured by `GITHUB_PAGES=true` to use `/grimdark-2d-tabletop/`. A renamed repository requires updating that base. No client-side history router is needed for the current single-page interface.

1. Push the repository and make all checks pass.
2. In the repository's **Settings → Pages**, select **GitHub Actions** as the build source. Account/repository visibility must support Pages.
3. Run the manual **Deploy frontend to GitHub Pages** workflow. It runs the required checks, builds with the repository base path, uploads the artifact and deploys it.
4. Inspect the deployment job and verify the URL it returns. Play a complete local hotseat match on that actual deployment before claiming the published client satisfies playability acceptance.

CLI equivalents after Pages is configured:

```sh
gh workflow run pages.yml --ref main
gh run list --workflow pages.yml --limit 5
```

Use the resulting run ID with `gh run watch RUN_ID --exit-status`. Query the verified repository's Pages API or read the deployment result for its actual URL. Do not advertise online multiplayer until a separate backend has been hosted and tested.

## Completion reporting

Record executed command results, environment, browser screenshots, rules-pack version and commit ID. Report failed or blocked checks explicitly. Full official 11th Edition acceptance remains blocked by content and mechanics gaps even if training-mode builds and tests eventually pass.
