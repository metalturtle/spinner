# Diminishing Returns — RPM Pickup Scaling

The hard soft-cap at 70 feels rigid: pickups above the cap are wasted, and there's no
reward for efficient play. Instead, pickups should **always** help, but give less the
higher your RPM already is. This also opens the door to spinner upgrades that shift the
curve.

---

## Formula 1: Inverse Scaling (chosen)

```
gain = BASE_BOOST * HALF_POINT / (rpm + HALF_POINT)
```

**`HALF_POINT`** — the RPM at which a pickup gives exactly half its base value.
One parameter controls the entire curve.

| RPM | Gain (HP=100) | RPM After |
|-----|---------------|-----------|
| 0   | +20.0         | 20        |
| 50  | +13.3         | 63        |
| 70  | +11.8         | 82        |
| 100 | +10.0         | 110       |
| 130 | +8.7          | 139       |
| 200 | +6.7          | 207       |

### Why this wins

- **One tuning knob.** Raise `HALF_POINT` = more generous at high RPM. Lower it = harder
  to sustain. No thresholds, floors, or ceilings to keep in sync.
- **Upgradeable.** A spinner upgrade just raises `HALF_POINT`. If the player upgrades
  from HP=100 to HP=150, every pickup is more effective at high RPM without changing
  any other constant.
- **Never zero, never capped.** The gain asymptotically approaches zero but never hits it.
  RPM can grow without bound in theory — natural decay + overdrain create the practical
  ceiling.
- **Smooth feel.** No inflection point, no jarring "you've hit the wall" moment.

### Upgrades via HALF_POINT

| RPM | Gain (HP=100) | Gain (HP=150) | Gain (HP=200) |
|-----|---------------|---------------|---------------|
| 70  | +11.8         | +13.6         | +14.8         |
| 100 | +10.0         | +12.0         | +13.3         |
| 130 | +8.7          | +10.7         | +12.1         |
| 200 | +6.7          | +8.6          | +10.0         |

A single stat shift moves the whole curve. No ceiling/floor re-tuning.

---

## Formula 2: Exponential Falloff Above Threshold (rejected)

```
gain = rpm < THRESHOLD ? BASE_BOOST : BASE_BOOST * e^(-K * (rpm - THRESHOLD))
```

Full boost below a threshold, steep exponential drop above it.

| RPM   | Gain (THRESHOLD=50, K=0.02) |
|-------|-----------------------------|
| 0–50  | +20.0                       |
| 70    | +13.4                       |
| 100   | +7.4                        |
| 130   | +4.0                        |
| 200   | +1.0                        |

**Rejected because:**
- Three parameters to tune (THRESHOLD, K, BASE) instead of one.
- The drop is too sharp — high-RPM pickups feel worthless.
- The threshold creates a jarring inflection point.
- Upgrades require adjusting multiple constants.

---

## Formula 3: Fill Fraction (rejected)

```
gain = max(MIN_GAIN, BASE_BOOST * (1 - rpm / CEILING))
```

Linear falloff toward a ceiling, with a minimum gain floor.

| RPM | Gain (CEILING=200, MIN_GAIN=2) |
|-----|--------------------------------|
| 0   | +20.0                          |
| 100 | +10.0                          |
| 130 | +7.0                           |
| 180 | +2.0 (floor)                   |

**Rejected because:**
- `CEILING` is a hidden hard cap — the system breaks if RPM reaches it.
- Three parameters (CEILING, MIN_GAIN, BASE).
- Upgrades require adjusting CEILING + MIN_GAIN together.
- The MIN_GAIN floor is a band-aid, not a smooth curve.

---

## Hyper Pickup Behaviour

The hyper pickup **bypasses diminishing returns entirely** — always gives a flat `+HYPER_BOOST`
(50 RPM) regardless of current RPM. This keeps it feeling special and worth the risk at
every RPM level. The overdrain mechanic (extra decay above a threshold) naturally prevents
it from being overpowered.

---

## Interaction with Overdrain

The `RPM_OVERDRAIN` mechanic still applies above `RPM_SOFT_CAP`. Together with diminishing
returns, this creates a natural practical ceiling:

- Pickups give less the higher you go (diminishing returns)
- High RPM drains faster (overdrain)
- The equilibrium point where decay outpaces pickup gain = the effective soft ceiling
- Upgrading `HALF_POINT` pushes this equilibrium higher

No hard cap needed — the system self-balances.
