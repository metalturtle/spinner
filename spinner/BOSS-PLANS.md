# Spinner Boss Plans

Date: 2026-04-26

This file collects detailed plans for boss fights we want to revisit and build one by one. The goal is to keep the ideas grounded in the current game's strengths:

- RPM as health, damage, pressure, and pacing
- collision-first combat
- readable arena hazards
- strong visual feedback through sparks, explosions, decals, lights, and motion

Recommended production order:

1. Spider Reliquary
2. The Gravity Organ
3. The Wyrm Coil


## 1. Spider Reliquary

Status: concept ready for implementation planning

### Fantasy

A sacred mechanical idol carried by giant spider legs. It begins stable and regal, then becomes damaged, lopsided, and feral as legs are destroyed. The fight should feel like bringing down a walking shrine.

### Why It Fits Spinner

- Closest match to existing multi-part boss systems
- Strong weak-point readability
- Easy to sell visually with tilt, sparks, breakage, and exposed core states
- Naturally supports collision gameplay instead of pure projectile dodging

### Encounter Pillars

- Destroy legs to destabilize the body
- Survive telegraphed stomps and enclosure attacks
- Punish the core during knockdown and collapse windows
- Make each destroyed limb change the shape of the fight

### Arena Concept

Theme: temple sanctuary or reliquary chamber

Room features:

- large central combat space
- outer ring with columns for visual scale
- braziers or torch lines for warm dramatic lighting
- cracked floor medallion beneath the boss

Arena behavior:

- center stays mostly open so the leg pattern is readable
- columns can be decorative at first, then optionally break during later phases

### Visual Direction

- bronze, stone, and gold body materials
- glowing stained-glass or rune-lit core chamber
- long articulated legs with pointed ceremonial tips
- hanging chains, bells, or banners around the room
- later phases expose sparks, severed cables, and unstable energy

### Core Combat Model

The core is protected while enough legs remain. Legs are individual destructible parts with their own HP. Destroying legs reduces stability, changes movement, and opens stagger windows where the player can slam the exposed body.

Suggested structure:

- 8 legs total for full fantasy
- implementation can start at 4 or 6 legs for MVP
- core shield active while 5 or more legs remain
- major collapse state when 3 or fewer legs remain

### Phase Plan

#### Phase 1: Processional

Boss behavior:

- slow deliberate movement
- front-facing body rotation tracks the player
- alternating leg stabs in simple patterns
- short radial pulse from the body after every few leg cycles

Player lesson:

- legs are the real first targets
- stomp markers are fair and readable
- core is not yet the main damage route

Main attacks:

- Leg Spear: one or two legs stab marked circles after a clear windup
- Shrine Pulse: short-range shockwave around the body that punishes hugging
- Pin Wheel: two legs stab opposite sides to cut off easy escape

Phase transition:

- after enough leg damage, one side of the boss collapses slightly
- movement becomes uneven
- core flashes through broken plating

#### Phase 2: Collapse Pattern

Boss behavior:

- gait becomes asymmetrical
- body leans harder during movement and turns
- occasional partial knockdown exposes the core
- remaining legs attack faster and in chained patterns

Player lesson:

- damaged positioning matters now
- collapse windows are the time for heavy body hits
- staying near the weak side is risky but rewarding

Main attacks:

- Cage Drop: several legs slam down in a rough ring around the player, briefly trapping movement
- Drag Sweep: a damaged leg scrapes sideways, leaving a hazard streak
- Collapse Slam: when a leg dies or the boss overcommits, the body falls and sends debris outward

Phase transition:

- the body falls lower to the floor
- shield fails completely
- lighting shifts from warm temple gold to unstable orange-white core light

#### Phase 3: Crawling Relic

Boss behavior:

- the shrine body is mostly grounded
- remaining legs are used more like hooks or dragging limbs than clean supports
- core stays exposed most of the time
- movement becomes faster, more desperate, and more collision-focused

Player lesson:

- this is the payoff phase
- higher risk, but the boss finally behaves like something the player can break with smart impacts

Main attacks:

- Scrape Charge: low fast lunge with heavy sparks and floor scrape effects
- Core Pulse Burst: repeated short shock pulses while rotating in place
- Broken Halo Spin: damaged decorative ring detaches and spins outward as a temporary hazard

Kill moment:

- final defeat should feel like a toppled idol breakup
- legs fold, core cracks, sparks vent upward, room lighting dips, and debris scatters

### Mechanical Notes

- Best technical base is the current `Siege Engine` structure
- Each leg can behave like a `siege_part` with custom placement and HP
- Core immunity can map to existing shield logic
- Knockdown windows can be state-driven rather than fully physics-driven
- Collapse angle can be visual-only at first; no need for full inverse kinematics

### MVP Scope

Version 1:

- 4 legs instead of 8
- simple stomp telegraphs
- core shield until 2 legs destroyed
- partial knockdown state with exposed core
- no destructible columns

Version 2 polish:

- more legs
- cage pattern
- decorative room breakage
- chained attack patterns
- boss-specific death set piece

### Main Risks

- Too many legs can become noisy and hard to read
- If each leg has independent logic, orchestration complexity rises fast

Control plan:

- group attacks into patterns rather than thinking per-leg AI
- prioritize phase silhouette changes over full leg realism

### Web Snare Attack Plan

Status: planned, intentionally deferred until locomotion feels strong

Fantasy:

- the reliquary lashes out with a ceremonial web tether
- the player is dragged violently into the shrine body
- the core/body impact deals RPM damage
- the player is then repelled back into the arena

Why it fits:

- makes the boss feel more distinctly spider-like
- turns the body/core into a dramatic danger point
- reinforces the collision-first identity by using the player as the incoming object
- creates a memorable special attack without relying on standard projectile combat

Recommended attack flow:

1. Telegraph
- the boss braces and briefly commits to the attack
- front leg pose tightens or lowers
- a clear web/capture cue forms between the boss and the player
- short but readable warning window

2. Latch check
- if the player is inside the capture lane/radius when the attack resolves, the web connects
- treat this as a scripted capture event, not a standard projectile collision

3. Pull phase
- player motion is temporarily overridden or heavily constrained
- the player is reeled quickly toward the boss
- this should feel sharp and violent, not like a slow drag

4. Core impact
- when the player reaches a close radius near the shrine body/core, apply a burst of RPM damage
- use sparks, impact flash, and core glow to sell the slam
- the damage should come from the impact moment, not from the initial latch

5. Repel
- after impact, launch the player outward away from the boss
- the player regains motion through the repel rather than being held in place

Implementation approach:

- model this as a Spider Reliquary attack state, not as a generic projectile
- the boss update should emit a `webSnare` event on successful latch
- `game.ts` should own the temporary player pull state and handle:
  - pull motion
  - impact damage
  - repel impulse
- avoid relying on normal collision resolution for the pulled-in impact, since that is likely to jitter or be hard to tune

Recommended tuning:

- low frequency, high drama
- stronger in later phases, but still clearly telegraphed
- fast pull, short total duration
- never chain immediately into another unavoidable capture

First-pass scope:

- single-target web snare only
- no lingering floor webs
- no immobilize trap after impact
- no combo chain beyond pull, impact, and repel

### Attack Expansion Roadmap

Status: prioritized follow-up plan

Goal:

- make the Spider Reliquary feel more aggressive, more distinctly spider-like, and more phaseful without losing readability
- prioritize attacks that look impressive on screen and fit the current collision-first combat model

#### Priority Summary

Implement next:

1. Leg Slam / Leg Shove
2. Web Attack
3. Acid Spit

Implement later:

4. Mini spider spawn
5. Spinner egg / spinner spawn variant
6. Core transforms into spinner after the last leg is destroyed

#### 1. Leg Slam / Leg Shove

Priority: very high

Complexity: low to medium

Why it is strong:

- high visual payoff for relatively low implementation cost
- directly uses the spider fantasy and the existing articulated legs
- creates strong close-range punishment and lets the boss physically dominate space
- fits naturally with the current stomp/telegraph/event architecture

Recommended behavior:

- if the player is near the body, one active leg commits to a heavy strike
- the strike deals strong RPM damage
- the player is pushed backward with a clear knockback impulse
- use a strong contact effect: sparks, camera emphasis, and a sharp pose on the attacking leg

Implementation notes:

- best built as a short-range attack state emitted from the Spider Reliquary update
- can reuse existing stomp telegraph ideas, but should feel directional and personal rather than area-denial only
- first pass does not need per-leg target selection logic beyond choosing a plausible attacking leg on the player-facing side

#### 2. Web Attack

Priority: very high

Complexity: medium

Why it is strong:

- gives the boss a signature spider mechanic
- creates a memorable control-denial moment
- pairs extremely well with leg slam follow-up pressure
- reinforces that the shrine body is dangerous even when the player is not directly ramming it

Recommended behavior:

- the boss shoots a web projectile or web burst at the player
- on hit, the player takes damage and becomes stuck or heavily slowed
- the spider then closes distance to attack while the player is compromised
- first version should be readable and dramatic rather than frequent

Implementation notes:

- the existing `Web Snare Attack Plan` remains the preferred structure for the full pull-and-impact version
- first implementation can start slightly simpler:
  - projectile lands
  - player is slowed/rooted briefly
  - boss advances and tries to capitalize
- later upgrade path:
  - full tether pull
  - impact into the body/core
  - repel afterward

#### 3. Acid Spit

Priority: high

Complexity: low to medium

Why it is strong:

- easy to add relative to the others
- gives the boss a ranged punish tool
- helps prevent the fight from being purely “stay out and wait for leg openings”

Recommended behavior:

- spider spits acid globules toward the player
- direct hit deals RPM damage
- later polish can leave lingering acid puddles or hazard decals

Implementation notes:

- this maps cleanly onto the current projectile architecture
- it is visually useful, but less identity-defining than the web attack, so it should complement rather than replace web behavior

#### 4. Mini Spiders

Priority: medium

Complexity: medium to high

Why it is strong:

- very thematic
- adds pressure and chaos in later phases
- makes the fight feel like an infestation rather than a single body

Risks:

- can create too much noise if the arena already has many hazards
- wants lightweight enemy logic so the fight does not become cluttered

Recommended direction:

- use small fast melee attackers
- spawn in controlled bursts, not endlessly
- best saved until the core fight loop is already satisfying

#### 5. Spinner Spawn Variant

Priority: medium to low

Complexity: medium

Why it is weaker:

- relatively easy because the game already has spinner enemies
- but it is less on-theme than mini spiders
- risks diluting the boss identity

Recommended use:

- only if we want a reliquary that mechanically “manufactures” other constructs
- otherwise prefer mini spiders for stronger thematic cohesion

#### 6. Core Becomes Spinner

Priority: high spectacle, later milestone

Complexity: medium

Why it is exciting:

- excellent final phase transition
- gives the fight a memorable last act
- pays off the exposed core fantasy in a way players will remember

Why it can come later:

- it depends on the base spider fight already feeling good
- it is easier than a whole new boss because the game already has spinner logic

Implementation direction:

- after the last leg is destroyed, retire the current spider-body phase
- spawn a tuned `enemy_spinner` or boss-flavored spinner from the core location
- preserve FX continuity:
  - collapsing shell
  - sparks
  - core flare
  - emergent spinner launch

Important note:

- this is relatively contained compared with inventing a whole new final-form ruleset
- it still needs careful transition handling, but it should be treated as an easier later addition rather than a rewrite

### Chosen Next Implementation Scope

Implement now:

1. Leg Slam / Leg Shove
2. Web Attack
3. Acid Spit

Reasoning:

- together these give the boss a strong melee punish, a signature control tool, and a ranged pressure option
- they materially improve the encounter without requiring a full summon/ecosystem phase yet
- the later additions remain good expansion paths once the core behavior set feels complete

Why defer it for now:

- the current priority is making the leg-driven locomotion feel convincing
- the web snare will land much better once the boss already feels alive and spider-like in motion


## 2. The Gravity Organ

Status: concept ready for encounter scripting

### Fantasy

A cathedral-sized machine-instrument that weaponizes gravity and resonance. The fight feels like surviving a hostile performance, then using its own push-pull rhythm to build a devastating hit.

### Why It Fits Spinner

- Strong RPM and momentum identity
- Lets the arena itself participate in combat
- Gives the game a dramatic set-piece boss that is not just another chaser
- Builds naturally on the existing Magnetar-style design notes

### Encounter Pillars

- Learn the rhythm of push, pull, and silence
- read lane telegraphs quickly
- preserve momentum through dangerous force changes
- strike during neutral windows or overload stalls

### Arena Concept

Theme: temple choir hall, cosmic observatory, or hybrid sacred machine room

Room features:

- circular or octagonal central floor
- radial inlays to help read rings and safe wedges
- large organ pipes or tuning forks around the perimeter
- suspended floating core in the center

Arena behavior:

- room stays visually symmetric so the player can read forces fast
- later phases distort that symmetry without fully losing readability

### Visual Direction

- brass, ivory stone, and steel
- white-gold pulse light in temple version, blue-white or red emergency light in sci-fi version
- visible vibration on pipes and floor trim
- dust, embers, or debris lifting during heavy resonance
- expanding wave rings and lens-flare-like pulse blooms

### Core Combat Model

The boss cycles between gravity states. During pull and push windows it is protected or highly resistant. During silent or neutral beats, the field drops and the core becomes vulnerable. The player is encouraged to use stored speed from those force windows to land stronger collisions.

Suggested loop:

- pull phase creates tension and positioning pressure
- push phase can slam the player into walls or accelerate a counterattack
- silent beat is the intended punish window

### Phase Plan

#### Phase 1: First Movement

Boss behavior:

- simple alternating pull and push
- long telegraphs and clean timing
- outer pipes fire one lane attack at a time

Player lesson:

- read the room's rhythm
- do not waste speed during force phases
- attack only when the field drops

Main attacks:

- Bass Pull: steady inward force for a short duration
- Choir Push: radial blast that punishes poor wall positioning
- Pipe Beam: one perimeter pipe glows and fires a straight resonance lane
- Silent Beat: brief full stop in all forces where core vulnerability opens

Phase transition:

- additional pipes activate
- rhythm gets faster
- floor begins glowing in resonance patterns

#### Phase 2: Dissonance

Boss behavior:

- different sectors of the room pull or push at different intensities
- pipe attacks chain more often
- floor zones amplify RPM drain or knockback

Player lesson:

- safe space is now dynamic
- force states can be exploited, not just survived
- the player should start planning movement a beat ahead

Main attacks:

- Split Chorus: left and right halves of the room have different force states
- Harmonic Ring: expanding circular wave that must be crossed through gaps
- Resonance Floor: temporary zones that intensify movement or drain RPM
- Pipe Rotation: active attack lanes shift before firing

Phase transition:

- core cracks visibly
- room lights strobe and flicker off-tempo
- a brief overload stall gives a big reward window

#### Phase 3: Finale

Boss behavior:

- rhythm becomes faster and intentionally unstable
- silent beats are shorter but more rewarding
- the boss may fire a rapid sequence and then stall in an exposed overheat state

Player lesson:

- mastery phase
- if the player has learned the rhythm, this phase feels climactic instead of unfair

Main attacks:

- Overload Chorus: fast push-pull-push chain followed by total stall
- Fracture Beam Fan: several pipes fire in a rotating sequence
- Crushing Cadence: repeated short pull pulses that try to ruin timing
- Exposed Heart: core opens with strong light bloom and takes bonus collision damage

Kill moment:

- resonance shatters the room's lighting pattern
- the spindle drops, cracks open, and releases one final silent flash

### Mechanical Notes

- Best baseline is the `Magnetar` idea in `bossDesigns.ts`
- Pull and push should be predictable and state-driven, not chaotic
- Beam attacks can be implemented as telegraphed line hazards instead of full custom ray systems
- Vulnerability windows should be explicit in visuals and audio

### MVP Scope

Version 1:

- global pull state
- global push state
- one or two telegraphed pipe beams
- one silent vulnerability window
- simple boss damage gate tied to current force state

Version 2 polish:

- split-sector force logic
- harmonic rings
- rotating lane choreography
- overload set piece and richer light animation

### Main Risks

- readability collapse if too many force and lane systems overlap
- easy to become frustrating if the neutral window is too short

Control plan:

- every attack family gets a distinct color or shape language
- keep cadence learnable even in phase 3

### Alternate Build Path: Octoboss

Status: recommended implementation-first version for boss slot 2

If we want the second boss to ship sooner, the octoboss should be treated as a more collision-forward sibling to the Gravity Organ instead of a full replacement for it. The core idea is simpler, more physical, and maps better to the current Spider Reliquary work:

- central floating spinner-core body
- large eye with pupil that tracks the player continuously
- 2 tentacles ending in drill tips
- tentacles are the danger
- core is the real weakness

This version keeps the spectacle of a central set-piece boss, but avoids needing full room-wide push/pull scripting on the first pass. Gravity or resonance behavior can still be layered in later as phase seasoning rather than as the whole fight.

#### Fantasy

A hovering machine idol with a spinning base and a living mechanical eye. Two long drill-tipped tentacles lash around the arena like hostile instrument arms. The player survives the reach and chaos of the tentacles, then crashes into the exposed core during brief recovery windows.

#### Why This Fits Spinner

- strong readable weak point
- tentacles create moving collision hazards without needing lots of projectiles
- the eye gives the boss personality even while the body stays mostly anchored
- procedural animation does a lot of visual work for relatively little authored content
- builds directly on the current multi-part boss and IK experimentation

#### Encounter Pillars

- do not fight the tentacles directly
- read which tentacle is herding and which one is committing
- punish missed overextensions rather than forcing damage at all times
- make the core hit windows feel earned and dramatic

#### Combat Model

The octoboss should not behave like two always-on homing arms. That would be noisy and frustrating in top-down play. Instead, the boss should attack in readable patterns:

1. one tentacle claims space
2. one tentacle commits to the player
3. both drills overextend or cross
4. the core stalls and becomes vulnerable

The core remains shielded or heavily resistant during normal pressure states. The player wins by preserving RPM and position until the boss creates its own punish window.

Recommended damage model:

- drills and tentacle shafts are hazardous on contact
- tentacles do not have their own health in MVP
- core takes all meaningful damage
- stalled core takes bonus collision damage

#### Visual Direction

- spinner-like lower base so it still feels native to this game
- central iris with a bright pupil that rotates to face the player
- brass, steel, ivory, and orange-white eye glow
- tentacles feel slightly ceremonial or organ-like rather than pure monster flesh
- drill tips should silhouette clearly from the rest of the limb

#### Phase Plan

##### Phase 1: Probe

Boss behavior:

- core hovers near the arena center
- pupil tracks the player at all times
- tentacles flail with controlled idle motion, then take turns stabbing
- one tentacle may sweep while the other aims a direct strike

Player lesson:

- tentacles are contact hazards
- the core is not always punishable
- safe movement matters more than greed

Main attacks:

- Drill Jab: one tentacle reaches toward predicted player position
- Side Sweep: one tentacle scrapes laterally to deny an escape lane
- Double Plant: both tentacles stab outward and linger briefly
- Core Stall: after a committed miss, the core wobbles and opens for damage

##### Phase 2: Cross Rhythm

Boss behavior:

- tentacles chain into each other more quickly
- one arm herds while the other attacks
- the boss reorients faster to keep the eye and body facing the player

Player lesson:

- learn the attack role of each tentacle
- recognize when a pattern is ending and a punish window is coming
- stay out of the drill ends even when the arm path looks safe

Main attacks:

- Scissor Cross: tentacles cross in front of the core, then separate violently
- Corkscrew Chase: one drill tracks the player for a short committed burst
- Floor Rake: a tentacle drags low and leaves a temporary hazard streak
- Eye Flash Stall: after both arms overcommit, the eye blooms and the core becomes vulnerable

##### Phase 3: Frenzy Organ

Boss behavior:

- idle motion becomes more erratic and desperate
- core vulnerability windows are shorter but more rewarding
- the body may add a small pulse or shove when the arms reset

Player lesson:

- mastery phase
- read tempo, not just single telegraphs
- commit only during true stall windows

Main attacks:

- Twin Chase: both drills pressure in sequence, not simultaneously
- Spiral Guard: tentacles circle the core before snapping outward
- Panic Pulse: a short-range body burst that protects the boss after a punish window
- Exposed Eye: the pupil dilates, iris opens, and core takes bonus damage

#### Technical Plan

Best baseline is the current Spider Reliquary, especially:

- body + weak-point structure
- state-driven attack scheduling
- procedural limb posing
- core damage gating and vulnerability windows

Recommended implementation structure:

1. `bossOctoboss.ts` with a dedicated state object
2. one core collidable tagged like the spider core
3. two tentacle data objects, each with segment positions, tip collider, and current intent
4. simple state machine for `idle`, `windup`, `commit`, `recover`, and `stall`
5. eye tracking solved as a visual-only rotation toward the player
6. first-pass tentacle IK can be lighter than the spider leg solver because it does not need foot planting

Recommended tentacle model for MVP:

- 3 or 4 segments per tentacle
- anchored at fixed sockets on the core body
- solve toward a moving target point
- add idle sine offsets so the limbs feel alive between attacks
- only the drill tip needs the strongest collider behavior

#### Reuse From Spider Reliquary

- copy the boss-level separation between AI, procedural sync, and visuals
- reuse the pattern of attack telegraph meshes and timed attack events
- reuse the core-only collision damage hookup in `game.ts`
- reuse IK math ideas, but not the foot planting gait logic

Important simplification:

- spider legs are support limbs
- octoboss tentacles are weapon limbs

That means the tentacles should not spend effort pretending to locomote. They only need to look threatening, reach well, and clearly overcommit.

#### MVP Scope

Version 1:

- floating core body
- animated eye with player tracking
- 2 tentacles with procedural segment motion
- dangerous drill tips
- 2 to 3 attack patterns
- explicit core vulnerability stall
- no tentacle health
- no room-wide gravity field

Version 2 polish:

- temporary scrape hazards
- stronger eye animation and emissive bloom
- body pulse during resets
- optional gravity tug or resonance ring added as a phase accent
- richer death sequence with collapsing limbs and exploding pupil/core

#### Main Risks

- fully freeform homing tentacles may become unreadable
- too much continuous hazard time may leave no real punish window
- per-segment collisions could become fiddly and frustrating

Control plan:

- choreograph attacks in patterns instead of full limb autonomy
- keep one tentacle in the spotlight at a time for most attacks
- treat shaft contact as lower-threat than drill-tip contact if needed
- make stall windows visually loud and mechanically generous in MVP

#### Implementation Checklist

1. Define `OctobossConfig` and the minimal state machine.
2. Build the core body mesh with spinner base, iris, and pupil.
3. Add visual-only eye tracking toward the player.
4. Implement two procedural tentacles with 3 to 4 segments and drill tips.
5. Add tip hazard collision and core-only damage rules.
6. Add telegraphed attack states: jab, sweep, double-commit.
7. Add a stall/exposed-core window after overextension.
8. Hook the boss into `game.ts` spawn, update, visuals, collisions, and death handling.
9. Tune timing first for readability, then tune damage and spectacle.
10. Only after the MVP feels good, decide whether to fold any Gravity Organ push/pull ideas back into later phases.


## 3. The Wyrm Coil

Status: high-potential spectacle boss, needs bespoke movement work

### Fantasy

A giant segmented spinner-serpent that sweeps and coils through the room. The player is fighting a living machine made of linked spinning segments, glowing joints, and violent turns.

### Why It Fits Spinner

- Strongest visual spectacle of the three
- excellent collision-driven threat profile
- can create a signature "dodge the whole body" experience
- fits both dragon and mechanical dungeon fantasy from the current idea space

### Encounter Pillars

- dodge the head and body as distinct threats
- hit exposed joints during turns, scrapes, or stun windows
- use arena geometry and boss overcommitment to create punish openings
- make the full-body movement itself the attack

### Arena Concept

Theme: forge tunnel, serpent vault, or long temple nave

Room features:

- rectangular or horseshoe-shaped chamber
- pillars or broken wall chunks to create route pressure
- enough runway for long body passes
- optional lava channels or embers for added spectacle

Arena behavior:

- the room should let the Wyrm carve dramatic paths
- too many tight obstacles will make the fight feel messy instead of grand

### Visual Direction

- glowing head-core
- 5 to 8 armored body rings
- molten or plasma seams between segments
- sparks when armor scrapes walls
- smoke, embers, or poison mist trailing from damaged sections

### Core Combat Model

The head leads movement and the body follows a delayed path. Segments are armored at first. Turns, wall scrapes, or specific damage thresholds expose glowing joint areas that take real damage. The player wins by reading movement arcs and attacking the inside of turns or exposed sections after a failed charge.

Possible health model:

- shared boss health plus per-segment armor values
- or head-only true HP, with segment breaks creating bigger stun and vulnerability windows

### Phase Plan

#### Phase 1: Hunt

Boss behavior:

- broad sweeping passes around the room
- front-facing head is dangerous to challenge directly
- body mostly acts as moving arena denial

Player lesson:

- treat the body as a real hazard, not background
- punish the inside of wide turns
- do not collide head-on with the head

Main attacks:

- Lance Charge: long straight rush
- Coil Sweep: broad turning attack that sweeps one side of the arena
- Tail Clip: fast tail flick to punish direct pursuit

Phase transition:

- first body armor break reveals glowing seams
- movement speed increases
- scrape and ember effects intensify

#### Phase 2: Shedding Armor

Boss behavior:

- some segments can now be damaged or broken
- the boss does sharper turns and more sudden redirects
- may use a burrow or tunnel move for repositioning

Player lesson:

- identify exposed joints quickly
- a shorter body is easier to read in one way but faster and more dangerous in another

Main attacks:

- Burrow Surge: disappears briefly and erupts on a marked line or endpoint
- Molten Trail: tail leaves temporary hazard streaks
- Snap Turn: abrupt directional change that exposes the inside joint for a short punish window

Phase transition:

- multiple segments destroyed or shed
- head and front segments begin glowing brighter
- movement becomes unstable and more desperate

#### Phase 3: Exposed Heart

Boss behavior:

- much of the armor is gone
- the body is shorter and faster
- wall hits or missed charges can stun the boss briefly
- head-core remains active and dangerous but finally vulnerable enough to commit against

Player lesson:

- the fight has become lethal, but readable mastery pays off

Main attacks:

- Frenzy Coil: rapid chained turns through the center of the arena
- Heart Charge: very fast head-first strike followed by a long recovery if it misses
- Core Vent: brief radial blast from exposed front segments before re-entry into motion

Kill moment:

- body segments lose coherence
- glowing seams rupture
- the serpent uncoils and crashes into the floor in stages

### Mechanical Notes

- Head movement should be authoritative; body just follows history points
- This does not need full snake physics to work
- Segment colliders can be simplified circles or capsules that sample prior head positions
- Exposed joints can be state-based visual swaps rather than procedural deformation
- Strong candidate for heavy use of trails, sparks, lava embers, and decals

### MVP Scope

Version 1:

- 1 head and 4 body segments
- wide-turn movement only
- simple charge and tail hazard
- one exposed-joint vulnerability rule

Version 2 polish:

- more segments
- burrow behavior
- armor break visuals
- wall scrape sparks and stun windows
- more advanced room choreography

### Main Risks

- movement can become clumsy if turns are too tight
- body-follow logic may look wrong if spacing drifts
- too many colliders can complicate combat readability

Control plan:

- start with a slow elegant pathing model
- tune spectacle and clarity before adding aggression


## Cross-Boss Build Notes

Shared systems that would help all three:

- stronger boss state machine conventions
- clearer telegraph materials and floor indicators
- reusable boss intro / defeat presentation hooks
- better arena-script support for lighting changes and hazard timing
- a cleaner way to register boss parts and weak points than adding more one-off logic to `game.ts`

Suggested follow-up when we pick one:

1. Write a boss-specific implementation checklist
2. Define the minimal room layout in level JSON
3. Identify reusable systems vs bespoke code
4. Build the MVP fight first
5. Add polish only after the core loop is fun
