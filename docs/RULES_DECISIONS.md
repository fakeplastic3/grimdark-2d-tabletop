# Rules decisions

Decision date: 2026-11-01. Evidence IDs refer to [RULES_SOURCES.md](RULES_SOURCES.md).

## D01 — Training content is an explicit limited alternative

The full target remains current 11th Edition. Missing current faction, mission and amendment evidence prevents certification. The bundled alternative uses original training profiles and scoring, labelled throughout as training. It must never be described as official army legality, current MFM points, complete faction support or a verified Chapter Approved mission. Importing a data pack cannot by itself supply missing engine mechanics.

## D02 — No silent previous-edition fallback

No 10th Edition rulebook or remembered datasheet is an accepted source for this release. Every official-mode mechanic must reference a current source and amendment review. A familiar term is not evidence that its behavior remained the same. Training choices may resemble common tabletop mechanics but are documented as choices rather than attributed to an edition.

## D03 — Geometry is independent of rendering

World coordinates represent inches. Base radii convert millimetres by dividing diameter by 50.8. Camera transforms cannot change movement, range or legality. Distances use base edges; terrain has polygon footprints. A 2D circle plus elevation is an abstraction of physical miniatures, especially vehicles and unusual bases. It must be described as such. A line between token locations is not physical true line of sight.

## D04 — Edition regression requirements

The following evidence must inform future official-mode tests; it does not mark the current implementation complete:

| Area | Required regression/evidence |
| --- | --- |
| Coherency | CORE §03.03: one nearby partner and an all-model maximum span; do not retain the previous large-squad neighbor count. |
| Engagement | CORE §03.04 and COMBAT: updated horizontal range with separate vertical range. |
| Charge | COMBAT/CORE §11.04: roll precedes target choice; a target outside rolled distance remains ineligible even if engagement could be reached. |
| Fight | COMBAT: all initial pile-ins precede attacks; active player starts activation; priority and alternation continue across fighting categories. |
| Battle-shock | CORE §08: includes already-shocked units and the exact half-strength boundary. |
| Attack allocation | CORE §05: grouped save allocation and ordered results must be checked; old individual sequencing is not assumed equivalent. |
| Cover | TERRAIN: changes ranged attack accuracy; it is not the prior armour-save bonus. |
| Force Dispositions | MISSION: a pair selects the mission; changing only a displayed name is insufficient. |
| Army building | ARMY: 1,000 points allows 2DP, 2 enhancements and 2 copies; 2,000 allows 3DP, 4 enhancements and 3 copies; Battleline doubles that copy limit. Final current rules still need reconciliation. |
| Space Marines | SM: Assault permits advance-charge, Devastator grants Assault ranged attacks, Tactical permits fall-back shooting/charging; once-per-battle uses, per-unit replacement and exceptions need timing validation. |
| Orks | ORKS: the new army rule uses advance re-rolls and riled-up status. Do not reuse the old strength/attack bonus as the current Waaagh! rule. |

## D05 — Rules data and provenance

Keep source edition, document version/date, retrieval date, section and verification state with a pack. Preserve the pack version in saves and replays. A schema-valid private pack is unverified unless a separate audit establishes all relevant mechanics and data. Reject unsupported effects; do not silently ignore them. Private user packs, source PDFs, credentials and copyrighted art must remain outside Git and public build artifacts.

## D06 — Optional choices and dice integrity

An optional re-roll, ability, target or allocation remains a player decision. Online actions are proposals validated by the server, which controls randomness. Deterministic replay records accepted actions and random state; it does not authorize clients to choose live online dice. Undo must stop at information-revealing actions. Training simplifications must explain when allocation or timing choices are unavailable.

## D07 — Scoring is mission data

Terrain areas may be objectives, but geometry alone cannot establish official score. A mission needs the specific disposition pairing, control requirements, action rules, scoring windows, caps and end conditions. Training scoring is original and must not be given the name of an official mission unless it actually implements and verifies that mission.

## D08 — Honest verification and distribution

Research can confirm isolated differences without proving full rules compliance. A source fetch failure is recorded as a failure, and a passing source-code review is not a successful build or browser test. Publishing source does not certify playability. The original-code licence covers only original contributions; it does not relicense Games Workshop material or imported user content.
