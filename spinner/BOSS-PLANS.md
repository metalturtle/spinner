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
