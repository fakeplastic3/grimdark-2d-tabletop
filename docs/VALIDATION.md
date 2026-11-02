# Validation record

Executed on 2026-11-02 with Node v26.13.0 and npm 11.20.0.

- Dependency installation succeeded; `package-lock.json` was generated.
- GitHub CLI authentication succeeded for `fakeplastic3`.
- `npm run check` passed: strict TypeScript, ESLint, 38 Vitest tests, 41 native Node core tests, and the Vite production build.
- The multiplayer integration test passed outside the sandbox, which denies local socket binding. It checks two-seat synchronization, forged/stale action rejection and persisted match recovery after server restart.
- `npm run test:e2e` passed in Chromium headless shell: one browser test covering match setup, recovery after reload, concession and replay, with no uncaught page errors. Full browser combat and scoring coverage remains incomplete.
- `npm audit` reports 15 vulnerabilities: 12 moderate, one high and two critical. Zod is affected in production dependencies; development findings include Vitest/tinypool and lint dependencies. Suggested fixes require major-version migrations and need separate review. No forced fix was applied.
- The public repository was created at https://github.com/fakeplastic3/grimdark-2d-tabletop on 2026-11-02. The user authorized publication using the GitHub account no-reply commit identity. CI and deployment results must be verified separately.

The bundled rules remain original training rules. Passing software checks does not verify official 11th Edition coverage.
