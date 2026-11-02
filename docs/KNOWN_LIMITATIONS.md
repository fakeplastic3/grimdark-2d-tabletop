# Known limitations and verification blockers

Status updated 2026-11-02. This document describes a work-in-progress source deliverable, not a completed acceptance certification. See [RULES_COVERAGE.md](RULES_COVERAGE.md) for the detailed official-rules matrix.

## Rules and content

- Only an explicitly labelled **training** rules pack is bundled. Its Azure and Verdant profiles, squad sizes, points, weapons, formations, mission and abilities are original practice content. Ultramarines and Orks are team identities, not complete current Codex rosters.
- No fully verified legal official starter army or Chapter Approved mission is supplied. Army validation checks the training pack. It does not certify official list legality.
- The June 2026 Core Rules URL was identified, but full retrieval exceeded the browsing tool's 32 MB limit. Selected indexed sections and official preview pages were inspected. Complete Core Rules and current amendments have not been reconciled.
- The current MFM links returned HTTP 403. Older indexed numerical values were not accepted as current October 2026 points.
- Comprehensive faction rules, named characters, wargear options, attachments, enhancements, transports, reserves, reactions, stratagems, mission pairs, secondary missions and keyword interactions are incomplete or absent. See the coverage matrix before relying on any official mechanic.
- Import accepts the supported training schema only. Unsupported effects, arbitrary executable rules and claims of official verification are rejected. Imports cannot add missing engine behavior. The faction identifier currently supports the two initial identities; adding another requires extending that identifier/schema as well as adding data.
- Training formation selection currently validates cost and faction eligibility. Bundled formations explicitly have no additional combat effect. Their disposition labels are training metadata, not the five official Force Dispositions or mission-pair selection.
- Circular footprints and optional height metadata are a 2D approximation. Physical sculpt geometry, irregular vehicle hulls, multi-level floors and true line of sight are not faithfully reproduced. Terrain and visibility behavior must not be presented as a full physical-tabletop equivalent.

## Environment and execution

- Dependencies were installed on 2026-11-02 using Node `v26.13.0` and npm `11.20.0`. Type checking, lint, 38 Vitest tests, 41 core tests and the production build passed. See [validation](VALIDATION.md).
- Local socket binding is denied in the restricted sandbox. The multiplayer integration test passed with network-enabled execution, including two-seat synchronization, forged/stale action rejection and restart recovery.
- One Chromium smoke test passed for setup, automatic recovery, concession and replay; full combat and scoring browser coverage remains incomplete.
- The dependency audit reports 15 vulnerabilities (12 moderate, 1 high, 2 critical), including Zod in production dependencies and Vitest/tinypool in development tools. Fixes require reviewed major-version migrations; no forced audit fix was applied.

## Publication and online service

- GitHub authentication succeeded for `fakeplastic3` on 2026-11-02. The public source repository is https://github.com/fakeplastic3/grimdark-2d-tabletop; CI and deployments require separate verification.
- GitHub Pages requires an actual pushed repository and successful deployment. A configuration file alone is not a live site.
- Online multiplayer needs a running reachable backend. Server source and frontend connection controls do not establish an operational public endpoint. A static Pages deployment cannot host that backend.
- Any published frontend must retain the training limitation banner and the same source/coverage documentation. Publication cannot upgrade the rules-verification status.

## Required work before the requested acceptance criteria can pass

1. Resolve the dependency audit findings through reviewed upgrades and rerun the checks.
2. Execute browser tests for setup, deployment, movement, ranged and melee attacks, casualty removal, scoring, round completion, save/load and replay; inspect actual screenshots and fix failures.
3. Test two real clients, authorization rejection, disconnect/reconnect and durable match recovery against the running server.
4. Obtain lawful current rule/data access, implement missing mechanics and content, and run specific regression tests before enabling an official mode.
5. Verify remote CI and any deployment URLs. Host and verify a backend separately before advertising online play as available.

The original-code licence does not license third-party rules or assets. Keep private packs and proprietary source documents excluded from Git and deployed artifacts.
