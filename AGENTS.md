# Project guidance

Never describe the bundled training rules as verified Warhammer 40,000 rules.
All core state changes go through the pure engine reducer; the UI is not authoritative.
Use strict TypeScript and explicit action unions. Keep private rules packs and secrets out of Git.
Record external verification and execution blockers honestly in docs.
Do not mark checks as passed unless executed successfully.
