# Foundry training rules — original, limited gameplay

The bundled `original-training@0.1.0` pack is an original training game. It is **not** a verified implementation of Warhammer 40,000 11th Edition, and its unit names, characteristics, points, formations and mission must not be used as official faction data. The Ultramarines/Orks selectors identify the blue/green token themes. Official source research and the substantial unsupported edition requirements are recorded separately in `RULES_SOURCES.md` and `RULES_COVERAGE.md`.

This document describes actual engine behavior. Where a mechanic resembles an official rule, that resemblance does not certify full rules coverage, timing or interactions.

## Army and setup

- Two armies use a shared validated training pack. Each army needs at least one character, one formation, legal listed model counts, no more than each profile's copy limit, and a total within a 250–3000 point training budget. Profiles are fixed; there are no loadout choices, attached leaders or enhancements.
- Training formations consume an allowance of 2 points at budgets up to 1000, otherwise 3. Formation disposition is metadata with **no mission-selection or combat effect**.
- The board is 44 by 30 world inches. A token's diameter is its profile's `baseMm / 25.4`. Every surviving model has its own position, wounds and radius.
- Player 0 deploys all units with complete bases inside the leftmost 8 inches, then locks deployment. Player 1 does the same in the rightmost 8 inches. Undeployed models do not block movement. This is whole-army sequential training deployment, not a verified official deployment procedure.
- Both armies must deploy legally before the game starts. An opposed d6 roll determines first player; ties repeat. The seed and all accepted actions reproduce the same result.

## Turn sequence and resources

Each turn has Command → Movement → Shooting → Charge → Fight. Both players complete a turn per round; the configured limit is 1–5 rounds.

At each Command phase both players gain 1 CP. The active player's movement, shooting and charge flags reset. A unit already shocked or at/below half its starting model count rolls 2d6 against Leadership. Single-model units use remaining wounds versus half their profile's starting wounds. A total at least Leadership clears shock; failure causes shock and zero objective control. Tests and results are logged.

Each player can explicitly activate **Training reserves** once during their own Command phase to gain 2 CP. This is an original shared ability, not Combat Doctrines or Waaagh!. A steady unit can optionally spend 1 CP when attacking to reroll each failed hit once for that chosen profile. The engine never automatically spends CP on this option.

## Movement and geometry

Every destination is a world-space point. The engine validates each model, not a single squad marker. Only ground-level positions (`z=0`) are accepted in gameplay; geometry helpers separately support elevation distances. Positions must be finite and complete for all surviving models.

- Normal moves allow each model up to its profile's Move. Advance first reveals one d6, then allows Move plus that result. After revealing an advance roll, the unit must commit an advance; it cannot switch back or end the phase without completing that declaration.
- An engaged unit can remain stationary or fall back. A non-engaged unit cannot select fall back. Fall back prevents shooting and charging for that turn.
- Remaining stationary records a zero-distance move. Units that do not explicitly move are marked stationary when the Movement phase ends.
- Coherency requires a model to have another squadmate within 2 inches base-edge distance and 5 inches vertically, and every other model in the unit within 9 inches horizontally and 5 vertically. A single-model unit is coherent by definition. This replaces any assumption of an older edition's two-neighbour rule, but casualty-related coherency removal is not implemented.
- Bases cannot overlap, leave the board or cross impassable terrain, walls or other models. The engine uses continuous swept-circle/segment geometry, not sampled positions. Simultaneous paths within the moving squad are tested in relative coordinates.
- Normal/advance paths cannot cross an enemy's 2-inch engagement area. Fall back may leave engagement but cannot pass through an enemy base. A move must finish out of engagement except a stationary unit or a valid charge into its designated target.
- Paths are straight segments. Multi-waypoint routing, vertical movement, terrain-specific movement costs, fly, transports, reserves and reactive moves are not implemented. Touching a blocked terrain footprint is conservatively rejected.

Deployment and movement previews are advisory UI output; the reducer repeats legality checks when the player confirms the action.

## Terrain, objectives and visibility

Two layouts provide terrain polygons separate from circular model bases. Ruins and woods grant training cover. Walls and impassable areas block straight movement and visibility. Terrain height is recorded but does not change this ground-level training game's line of sight.

Line of sight is an explicit **centre-to-centre 2D ray**. A ray intersecting an opaque terrain polygon is blocked. It is not physical-model true line of sight. No Hidden/detection rules, sculpt geometry, obscuring-height logic or unit-to-unit obscuration are implemented.

Only marked objective-area polygons score. A model whose base overlaps an objective area contributes its profile's OC, unless the unit is shocked. The greater total controls that area; equal nonzero totals contest it, and zero totals leave it uncontrolled. At the end of **each full round**, every controlled area grants its owner 5 VP. This original scoring mission is not Take and Hold, Chapter Approved or another verified official mission.

## Shooting and combat

A unit can fire **one selected ranged weapon profile** per Shooting phase. Only its own turn's eligible units may shoot. Engaged units, units that fell back, and units that already shot cannot shoot. Units that advanced need the training Assault flag. Shooting into a target engaged with a friendly unit is prohibited. Each firing model needs range from its base edge and a clear centre ray to at least one target model.

Combat resolves individual attacks in deterministic order. This is **not** the verified 11th Edition grouped defender allocation/save procedure. Fixed numeric attack and damage values are supported; variable damage, damage prevention, mixed defensive profiles and player-controlled casualty allocation are absent.

For each attack: roll to hit → roll to wound → choose the better armour/AP or invulnerable threshold → roll save → damage one model. A wounded target model receives damage first; otherwise the first surviving target model receives it. Excess damage is discarded and cannot spill to the next model. Destroyed models are removed from their unit; the unit record remains for history. Attacks stop when no target models remain. Eligibility of firing models is established at the start of the attack action.

Training wound thresholds are 2+ for Strength at least twice Toughness; 3+ above Toughness; 4+ equal; 6+ at most half; otherwise 5+. Hit/wound rolls of 1 fail and 6 succeed. Armour thresholds worsen by AP; saves of 1 always fail and a 6 does not rescue an impossible save. Cover imposes -1 to hit. Modifier combinations here are original training behavior, not official modifier caps.

Supported flag semantics in this limited pipeline:

| Flag | Training behavior |
| --- | --- |
| `assault` | Allows shooting after advancing |
| `heavy` | +1 to hit when explicitly/implicitly stationary |
| `rapidFire` | +1 attack for a firing model with a target within half range |
| `torrent` | Automatic hit without a critical hit |
| `lethal` | A natural hit 6 automatically wounds; it is not a critical wound |
| `sustained` | A natural hit 6 adds one extra hit; the extra hit rolls to wound |
| `twinLinked` | One automatic reroll of a failed wound roll |
| `devastating` | A natural wound 6 bypasses the save; no damage spill |

The log contains raw values, optional replacement rolls, thresholds, modifiers, success and notes for automatic effects, alongside actual attacks/hits/wounds/damage/destructions. A raw value of 0 marks an automatic effect, not a fake rolled die. Other weapon abilities, universal stratagems, optional response windows and an event-priority ability scheduler remain unsupported.

## Charges and fights

A legal charging unit first rolls 2d6 **before** selecting a target. It must not already be engaged, have advanced/fallen back or have attempted a charge that turn. The result is retained while the player chooses the target and positions. Cancelling spends the attempt; an illegal placement does not grant another roll.

At least one target base must be within the rolled base-edge distance before the move. The engine does **not** add engagement distance to that roll. Each model may move no farther than the roll, and at least one must reach target base contact. Other geometry/coherency and non-target enemy engagement checks apply. This training charge is still incomplete relative to official multi-target, reactive and model-priority requirements.

The training Fight phase prioritizes engaged units that charged this turn, then other engaged units. The current player has first choice where eligible. After each activation the other player gets the next eligible choice; if none is available, the remaining player acts. Every eligible unit must resolve one chosen melee profile before the phase ends. Melee participation requires a model within the 2-inch horizontal/5-inch vertical engagement threshold.

There is no pile-in, consolidation, contact-priority movement, Fights First ability system, response window or official comprehensive fight sequencing. The charged-unit priority used here is a named training simplification. Do not infer official sequencing from it.

## Match result, RNG, saves and replay

At the round limit, higher VP wins and equal VP draws. A player may concede. Eliminating all enemy units grants an immediate **training** victory; this is not a claim about official mission ending conditions.

The reducer clones state before resolving an action. Rejection returns the exact original state, preserving random state, resources and revision. Accepted actions increment the revision, append to history and preserve deterministic replay. Optional fields are removed rather than stored as `undefined`, keeping finished state JSON-serializable.

The engine uses seeded xorshift32 and unbiased rejection sampling of its nonzero state domain for d6 results. This deterministic generator is not cryptographically unpredictable. Online seed generation and hidden RNG state must remain server-owned; local players can inspect browser memory and saves. A local seed of zero maps to a documented nonzero fallback. Persistence/undo policy is implemented separately in `packages/engine/persistence.ts`; random-revealing actions must never be rerolled by undo.

## Executed headless verification

Run `npm run test:core` or `node --import ./scripts/core-loader.mjs --test tests/core/*.test.ts` with Node supporting synchronous module hooks and type stripping. This executes production TypeScript engine/data/geometry sources after type stripping, without the frontend's npm dependencies. It **does not perform TypeScript type-checking or browser testing**.

The suite includes a complete two-round match driven solely by legal reducer actions: deployment, initiative, movement, shooting, casualty removal, charge, alternating melee, area scoring, final draw, JSON state and exact replay. It also covers default-roster completion, rejection rollback, source-independent geometry, deterministic dice sequences, critical effects and a repeatable spatial/dice benchmark. Exact execution totals and frontend verification status belong in `TEST_RESULTS.md`.
