# Rules coverage

**The application is not a certified or complete Warhammer 40,000 11th Edition implementation.** A playable training match does not establish official army legality or mission correctness. There is no fully verified official mission or starter army bundled. See [the source register](RULES_SOURCES.md) for evidence and access failures.

Audit date: 2026-11-01. Source verification and implementation verification are separate. A source-confirmed rule must also have corresponding engine behavior and executed regression tests before it can enter the first category below.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| Verified and implemented | Current primary rule, engine implementation and executed tests all checked. |
| Implemented but pending verification | Training behavior or partial implementation exists, but complete current official evidence or execution is missing. |
| Requires licensed source data | Full authoritative content/current values and appropriate rights are needed. This does not assert that every missing source necessarily requires purchase. |
| Not implemented | No supported complete behavior. Partial scaffolding does not count. |
| Approximated due to 2D representation | An explicitly documented geometric abstraction differs from physical miniature/scenery geometry. |

## Official-content matrix

| Mechanic/content | Edition/source baseline | Distribution/implementation status | Remaining verification |
| --- | --- | --- | --- |
| Complete Core Rules + amendments | 11e; CORE 2026-06-01, HUB update 2026-08-26 | Not implemented as a complete official ruleset | Full document, amendment reconciliation, exhaustive interaction tests |
| Ultramarines legal roster and all wargear | 11e; SM 2026-09-10, current Codex + MFM | Requires licensed source data | All datasheets, squad compositions, points, chapter restrictions, bases and options |
| Orks legal roster and all wargear | 11e; ORKS 2026-08-14, current Codex + MFM | Requires licensed source data | Same, including August Codex changes |
| Current unit points and duplicate-cost tiers | 11e; MFM listed 2026-10-14 | Requires licensed source data | Live MFM returned 403; cached results cannot certify current values |
| Official detachments, enhancements, compatibility | 11e; ARMY, SM-DET, MFM | Requires licensed source data | Complete current rules, Unique tags, budgets and interaction tests |
| Leader/support and bodyguard interactions | 11e; ARMY, Codexes | Not implemented | Attachment eligibility, mixed profiles, allocation, destroyed-bodyguard handling |
| Five Force Dispositions and 25 pairings | 11e; MISSION | Not implemented | Full mission-deck data and current pair-specific scoring/layouts |
| Official secondary missions | 11e; Chapter Approved 2026–27 | Requires licensed source data | Fixed/tactical objectives, timing, limits, actions and discard rules |
| Deployment/pre-battle official procedures | 11e; CORE + mission deck | Not implemented in full | Reserves, attacker/defender, scouts, infiltrators and mission sequence |
| Complete Command timing/battle-shock | 11e; CORE §08 | Not implemented in full | Persistent shock, timing windows, optional abilities and current updates |
| Movement, fall-back and reserves | 11e; CORE §03, §09, §20 | Not implemented in full | All path modes, transports, ingress, vertical movement and reactive actions |
| Complete charge procedure | 11e; CORE §11, COMBAT | Not implemented in full | Multiple target choices, per-model mandatory proximity, paths and responses |
| Complete Fight procedure | 11e; CORE §12, COMBAT | Not implemented in full | Pile-in windows, compulsory eligible attacks, overrun and consolidation sequences |
| Mixed-profile attack allocation | 11e; CORE §05 | Not implemented | Group allocation choices, batch saves, ordering and character interactions |
| Complete weapon keywords | 11e; CORE §24 + updates | Not implemented | Current definitions and pairwise interactions for every supported ability |
| Combat Doctrines | 11e; SM 2026-09-10 | Not implemented as complete current faction rule | Activation window/duration, overrides, extra uses, unit restrictions |
| Waaagh!/riled up | 11e; ORKS 2026-08-14 | Not implemented as complete current faction rule | Advance re-roll choice, both-turn timing, duration, character sources |
| Official stratagems | 11e; CORE + Codexes | Not implemented | Costs, response windows, per-unit limits, target and timing validation |
| Terrain area/feature visibility | 11e; TERRAIN, CORE §13 | Approximated due to 2D representation | Hidden, Obscuring, model silhouettes, elevated floors and current exceptions |
| True line of sight | Physical geometry | Approximated due to 2D representation | Circular footprint/height abstraction cannot reproduce sculpt geometry |

## Training implementation

The bundled pack is expressly original training data. Its points, model characteristics, detachment effects, mission scoring and simplified abilities are not represented as official values. Successful army validation means valid **under that pack**, not tournament legal. Both named factions serve as selectable team identities only until a verified official-content release exists.

The implementation report and [known limitations](KNOWN_LIMITATIONS.md) describe the actual training features and test results. No official mechanic is currently labelled **Verified and implemented**: source gaps, amendment gaps and unavailable execution evidence prevent that claim. Shared geometry or a familiar phase name is not evidence of edition compliance.

## Acceptance gate for official mode

An official release needs at least one current, legally distributable or privately supplied legal roster per side; one complete verified mission pairing; all mechanics those selections can invoke; version-pinned evidence; and a browser-played full match with executed regression tests. Unsupported imports must not enable an official-mode badge. Unknown abilities must fail validation or produce an explicit unsupported-content error.
