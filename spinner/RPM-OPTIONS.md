# RPM Cap Design Options

## Option A: Hard Cap at 100 (current implementation)

RPM lives in `[0, 100]`. Pickups cannot exceed it.

**Pros:**
- Simple to reason about
- Clean gauge — 0% to 100%

**Cons:**
- At 100 RPM, pickups feel wasted — no reward for efficient play
- No "power fantasy" moment — every state feels the same above ~60%

---

## Option B: Soft Cap at 70, Hyper Boost Above (recommended)

Two tiers of RPM:

| Range   | State       | How you get there              |
| ------- | ----------- | ------------------------------ |
| 0–70    | Normal      | Regular pickups, natural state |
| 70–130  | Overcharged | Hyper boost pickup only        |

- Regular pickups cap at `RPM_SOFT_CAP` (70). You can never hit "full" from normal play.
- A rare **hyper boost** pickup pushes past 70, up to `RPM_HYPER_MAX` (130).
- Above 70, an extra decay (`RPM_OVERDRAIN`) bleeds the overcharge off faster.
- The player is always slightly under pressure in normal play — never truly "safe".

**Overcharged state gives:**
- Faster spin (visually dramatic)
- Higher effective mass in collisions — you bully enemies
- Brighter body material / HUD glow — the player *feels* powerful
- Extra decay ensures it's temporary — a surge, not a permanent upgrade

**Constants:**

| Constant        | Value | Description                                       |
| --------------- | ----- | ------------------------------------------------- |
| `RPM_SOFT_CAP`  | 70    | Normal pickups cap here                           |
| `RPM_MAX`       | 100   | Kept as visual normaliser / reference for physics |
| `RPM_HYPER_MAX` | 130   | Absolute ceiling even with hyper boost            |
| `RPM_OVERDRAIN` | 4.0   | Extra decay/s applied above `RPM_SOFT_CAP`        |
| `HYPER_BOOST`   | 50    | RPM granted by a hyper boost pickup               |

---

## Option C: Uncapped, Faster Decay at Higher RPM

No hard cap. Pickups always help. Decay scales with RPM: `decay = RPM_DECAY_RATE * (1 + rpm / 100)`.

At 200 RPM you drain 3x faster — self-balancing.

**Pros:**
- No ceiling frustration — always a reason to collect pickups
- Emergent balance through scaling drain

**Cons:**
- Harder to display on HUD (no fixed "full")
- Balance is unpredictable — extreme RPM values can break collision math
- No distinct "power moment" — just a gradual continuum
