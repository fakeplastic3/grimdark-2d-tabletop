# Grimdark 2D Tabletop

A browser tabletop project with individual circular model tokens, a deterministic TypeScript simulation, and a separate WebSocket server. The long-term target is Warhammer 40,000 11th Edition for Ultramarines and Orks.

**Current status: work in progress, training rules only.** The bundled Azure and Verdant units use original practice profiles. They are not official datasheets or current points. This project does not yet satisfy the full official-rules acceptance criteria: there is no verified official army roster or complete Chapter Approved mission. Read [rules coverage](docs/RULES_COVERAGE.md) and [known limitations](docs/KNOWN_LIMITATIONS.md) before relying on a mechanic.

Source repository: [fakeplastic3/grimdark-2d-tabletop](https://github.com/fakeplastic3/grimdark-2d-tabletop). A live frontend and hosted multiplayer endpoint have **not been verified**.

## Run locally

Use Node.js 22.15 or later and npm, with access to the npm registry. From this checkout:

```sh
npm install
npm run dev
```

Vite normally serves the frontend at `http://127.0.0.1:5173`; use the URL printed by the command if that port is occupied. Local hotseat runs in the browser without the multiplayer server. Both players must use the clearly labelled training mode.

For private-room testing, run a second terminal:

```sh
npm run server
```

The backend defaults to `127.0.0.1:8080`. Connect the frontend to `ws://127.0.0.1:8080`. Its default allowed browser origins are `http://127.0.0.1:5173` and `http://localhost:5173`. A local process is not a publicly hosted multiplayer service.

## What is in the source

- React interface, SVG battlefield, individual model footprints, squad selection and movement previews. SVG replaces the initially preferred PixiJS renderer; legality remains independent of rendering.
- Pure simulation transitions for training deployment, command, movement, shooting, charging, fighting, scoring and match results.
- Deterministic dice, attack histories, casualties and validation errors. The training combat pipeline is not certified as the current official attack-allocation procedure.
- A training army builder with model-count prices, copy limits, required commanders, faction checks and formation budgets.
- Versioned saves reconstructed from their action history, replay support and restricted positioning undo.
- A server-authoritative private-room protocol with room codes, seat tokens, revision checking and disk persistence.
- Geometry, rules-data and other test suites as source specifications; execution results must be reported separately.

These are implementation components, not a claim that the complete application or every integration has passed runtime testing. Formation choices currently have no additional combat effects. Official faction rules, complete mission pairings, attachments, transports, reserves, reactions and many abilities remain unsupported.

## Checks

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

`check` runs strict TypeScript checking, ESLint, Vitest, native Node engine tests and the production build. Browser tests are a separate required check. On a Linux CI machine, install browser system dependencies with `npx playwright install --with-deps chromium`.

The engine-only native tests can run without npm dependencies using `npm run test:core`. They do not replace the schema, backend, type-checking or browser suites.

Build and inspect the production frontend with:

```sh
npm run build
npm run preview
```

See [development and publication](docs/DEVELOPMENT.md) for environment failures, test commands, GitHub setup and Pages deployment. A configured workflow is not a passing workflow.

## Rules data and future factions

The engine and UI consume structured packs rather than specific unit names. Private imports must conform to the bounded schema in `packages/shared/validation.ts`; only `status: "training"` is currently accepted. Unknown effects and false official-verification claims are rejected. Save private packs under the ignored `private-packs/` directory, and do not commit proprietary source documents.

To add a faction, extend the faction identifier/schema and presentation metadata, add its unit and formation data, then implement any unsupported effects as reusable engine behavior. Add validation, interaction and full-match tests. A data import cannot implement missing rules. The complete process and current architectural limits are in [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Documentation

- [Architecture and extension points](docs/ARCHITECTURE.md)
- [Development, testing, backend hosting and publication](docs/DEVELOPMENT.md)
- [Official source register](docs/RULES_SOURCES.md)
- [Rules coverage matrix](docs/RULES_COVERAGE.md)
- [Rules decisions](docs/RULES_DECISIONS.md)
- [Known limitations and outstanding acceptance work](docs/KNOWN_LIMITATIONS.md)

## Unofficial project and licensing

This is an unofficial fan software project. It is not affiliated with, endorsed by, or licensed by Games Workshop. Warhammer 40,000, Ultramarines, Orks and related names belong to their respective rights holders. No official miniature imagery, rulebook PDFs or card artwork is bundled.

Original project code and original training content are released under the [MIT licence](LICENSE). That licence does not grant rights to Games Workshop material or private imported content. Publicly downloadable rules are not assumed to be freely redistributable. Official-content support requires lawful sources and a separate verification audit.
