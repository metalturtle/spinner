# Spinner Enemy Combat Plan

Date: 2026-04-29

## Purpose

This file captures a focused direction for making enemy spinner fights feel more like beyblade duels.

The aim is not just to make enemies stronger. The aim is to make them dangerous because of:

- attack timing
- movement patterns
- clash setup
- contact rules
- readable special behaviors

This should build on the recent shift toward velocity-led collision damage instead of undoing it.


## Current State

The current enemy spinner in `src/enemySpinner.ts` is a solid base, but it is still simple in behavior:

- default state machine is mostly `chase -> charge -> recover`
- threat comes mainly from direct collisions
- there is no enemy-specific special attack loop yet
- there is no sustained contact modifier like heat, shock, or grind pressure
- there is no distinction between a normal spinner, elite spinner, and duel specialist beyond config tuning

This means fights can work mechanically, but they still risk feeling like “move into each other until one breaks.”


## Design Goals

### Primary

1. Make enemy spinners dangerous because of what they do, not only because of their stats.
2. Make player positioning and dodge timing matter more.
3. Give spinner enemies more identity and variety without needing full boss complexity.
4. Preserve the collision-first combat identity of the game.

### Secondary

1. Create a clean path from normal spinner enemies to elite spinner rivals and spinner bosses.
2. Add attack hooks that can later drive sound, particles, camera shake, and telegraphs.
3. Keep behaviors readable enough that players can learn them over a run.


## Combat Pillars

### 1. Movement Is The Attack

Spinner enemies should mostly attack through movement states, not by spawning projectiles.

Their danger comes from:

- lining up angles
- bursting at the right time
- staying threatening after glancing collisions
- forcing the player into bad clash geometry

### 2. Specials Should Modify Contact

A good spinner special should change how it feels to collide with that enemy.

Examples:

- a dash changes burst speed and hit severity
- a combo changes how many follow-up collisions the enemy can chain
- a heat aura changes whether prolonged contact is safe

### 3. Readability Before Complexity

Normal spinner enemies should usually have:

- one main movement attack
- one occasional special or modifier

Do not stack too many mechanics onto a single normal enemy unless it is clearly elite-tier.


## Recommended Spinner Archetypes

### Rush Spinner

Fantasy:

- aggressive attacker
- low recovery
- wants fast direct bursts

Core behavior:

- circles briefly
- commits to a fast dash
- weak if baited into a miss

Good for:

- teaching dash timing
- making open arena space feel dangerous

### Combo Spinner

Fantasy:

- technical duelist
- strings together several short bursts

Core behavior:

- dash
- short pause
- redirect
- dash again

Good for:

- teaching that one dodge is not always enough
- making recovery windows more skill-based

### Heat Spinner

Fantasy:

- unstable overcharged top
- dangerous to scrape against

Core behavior:

- normal movement pattern
- occasional heat surge
- contact during surge adds extra RPM drain

Good for:

- punishing passive face-tanking
- making “just stay close” a bad answer

### Tank Spinner

Fantasy:

- slow heavy bruiser
- wants head-on clashes

Core behavior:

- slower turn and chase
- high momentum once committed
- weaker turning, stronger frontal presence

Good for:

- making impact angle matter
- adding a different duel rhythm from agile spinners

### Trick Spinner

Fantasy:

- deceptive movement
- angle manipulator

Core behavior:

- feints a charge
- cuts sideways
- may use wall rebounds or offset dashes later

Good for:

- advanced encounters
- elite rivals


## Specific Attack Ideas

### Fast Dash Attack

This should likely be the first and most common upgrade to enemy spinners.

Behavior:

- brief readable windup
- lock a direction
- burst forward at high speed for a short time
- enter recovery if it whiffs or hits a wall

Why it fits:

- very readable
- naturally velocity-led
- makes collisions exciting
- easy to support with sparks, camera kick, and sound later

Key tuning rules:

- short windup, but visible
- burst should be stronger than normal chase speed
- recovery should be punishable

### Combo Attack

Behavior:

- short chain of 2-3 smaller dashes
- slight retarget between dashes
- final dash is the strongest or longest

Why it fits:

- extends duel pressure
- forces the player to keep moving after first evade
- feels more like an aggressive spinner duel than a single lunge

Key tuning rules:

- each follow-up must stay readable
- do not let retargeting become perfect tracking
- should be occasional, not constant

### Heat Aura

Behavior:

- temporary aura state around the spinner
- if the player stays close or in repeated contact during this state, they take extra RPM drain
- aura should not be constant on normal enemies

Why it fits:

- discourages passive collision play
- gives the spinner danger even between big hits
- creates a strong visual identity

Key tuning rules:

- use short active windows
- apply gentle repeated drain, not instant burst deletion
- combine with obvious emissive or particle feedback

### Future Ideas

- rebound dash after wall contact
- lightning shell that briefly disrupts control
- scrape ring that improves side-contact damage
- burst pulse that shoves the player away after a charge-up


## First Recommended Enemy Package

For the first implementation pass, build one upgraded enemy spinner with:

1. dash attack
2. occasional combo attack
3. temporary heat aura

This is enough to make the enemy feel meaningfully richer without making the state machine too large too early.


## First Implementation Plan

### Phase 1: Expand enemy spinner state

Update `src/enemySpinner.ts`.

Add:

- explicit attack state enum beyond `chase`, `charge`, `recover`
- windup / dash / combo / aura timers
- locked dash direction
- cooldown timers for dash, combo, and heat aura
- optional visual state flags for future emissive effects

Recommended new states:

- `orbit`
- `dash_windup`
- `dash_commit`
- `combo_chain`
- `recover`

Definition of done:

- enemy spinner has enough state to support planned attacks cleanly

### Phase 2: Replace straight chase with orbit + cut-in

Goal:

- stop the enemy from only steering directly at the player

Behavior:

- outside attack windows, enemy prefers orbiting the player at a short range
- occasionally cuts inward to line up a dash
- recovery returns to orbit instead of immediately face-rushing again

Definition of done:

- even before specials, enemy positioning feels more duel-like

### Phase 3: Implement fast dash attack

Add config values:

- dash windup duration
- dash speed
- dash duration
- dash cooldown
- dash recovery
- dash preferred trigger range

Behavior:

- enter windup when range and angle are favorable
- lock direction at end of windup
- commit to dash without full retargeting
- recover after timer or wall hit

Definition of done:

- enemy can clearly telegraph and execute a burst attack

### Phase 4: Implement occasional combo attack

Add config values:

- combo chance or combo trigger cadence
- combo dash count
- combo interval
- combo retarget strength
- combo cooldown

Behavior:

- after a successful setup or at chosen intervals, enemy performs a short dash chain
- each chain segment retargets only partially
- final segment has slightly higher commitment

Definition of done:

- player must respond to more than one burst during the combo window

### Phase 5: Implement heat aura

Add config values:

- aura radius
- aura drain per second
- aura active duration
- aura cooldown
- aura visual intensity

Behavior:

- aura activates on a timer, on low RPM, or after a combo depending on tuning
- if player remains within radius, apply extra RPM drain over time
- direct collisions while aura is active can get a small extra penalty

Implementation note:

- prefer a proximity/range check over baking this into core collision damage math

Definition of done:

- passive face-tanking an empowered spinner becomes a bad plan

### Phase 6: Add visuals and feedback hooks

Add simple first-pass feedback:

- stronger emissive during dash windup
- trail or spark burst during dash commit
- heat glow during aura active
- different spark intensity on combo hits

Do not overbuild polish yet. Just add enough readability to support gameplay.

Definition of done:

- player can identify which dangerous state the spinner is in without reading code

### Phase 7: Tune by role

Use the new tier system to map behaviors:

- `enemy_spinner_tier_1`
  - mostly dash
  - little or no combo
  - weak or no aura

- `enemy_spinner_tier_2`
  - dash
  - occasional combo
  - moderate aura

- `enemy_spinner_tier_3`
  - stronger dash
  - more reliable combo
  - more dangerous aura

Definition of done:

- tier differences feel behavioral, not just numeric


## Suggested Data Additions

These can live on `EnemySpinnerConfig`:

- `orbitRange`
- `orbitStrafeStrength`
- `dashWindup`
- `dashSpeed`
- `dashDuration`
- `dashCooldown`
- `dashRecovery`
- `comboEnabled`
- `comboDashCount`
- `comboInterval`
- `comboCooldown`
- `comboRetargetLerp`
- `heatAuraRadius`
- `heatAuraDrain`
- `heatAuraDuration`
- `heatAuraCooldown`


## Tuning Guidance

### Dash

- should be scary because of commitment speed, not because of guaranteed tracking
- missing should create a punish window

### Combo

- should feel rare enough to stay exciting
- should not become unavoidable once started

### Heat Aura

- should punish lingering and scraping
- should not replace direct collision threat


## Risks

### 1. State explosion

If too many attack states are added at once, `enemySpinner.ts` can become hard to tune quickly.

Mitigation:

- build dash first
- add combo second
- add heat aura third

### 2. Unreadable pressure

If dash, combo, and aura overlap too often, the enemy may feel unfair.

Mitigation:

- use cooldown separation
- make aura and combo windows visually distinct
- keep tier 1 simple

### 3. Collision spam

If dash speed is high and cooldowns are short, the enemy may bounce into nonsense loops.

Mitigation:

- cap dash duration
- add clear recovery
- cancel dash on wall hit


## Recommended Build Order

1. Orbit movement
2. Dash attack
3. Dash visuals
4. Combo attack
5. Heat aura
6. Tier-specific tuning


## Definition Of Success

This direction is working if:

- a spinner enemy is dangerous even when its raw RPM is not overwhelming
- the player can win by dodging and counter-hitting, not just by owning the bigger number
- different spinner tiers feel different in behavior
- standing still is no longer a strong answer to spinner encounters
- fights create memorable “that spinner dashes twice” or “that one burns on contact” moments
