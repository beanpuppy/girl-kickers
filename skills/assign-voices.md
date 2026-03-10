# Assign Voice Lines

Given a character name and squad name, read the character's translated voice lines and assign them to Door Kickers 2 VOX sound IDs, then write/update the squad's voice XML file.

## Usage

```
Character: {character_name} (e.g. Alva)
Squad: {squad_name} (e.g. defy)
```

## Input files

- **Translations**: `mod/sounds/voice/{character_name}/_trans.txt`
- **Available voice files**: all `.wav` files in `mod/sounds/voice/{character_name}/`
- **Existing squad XML** (if any): `mod/sounds/gfl_voice_lines_{squad_name}.xml`
- **Reference**: look at existing voice XMLs in `mod/sounds/` for examples of how other characters are assigned

## Output

Write a `<Pack name="{character_name}-Voice" channel="voice">` block with all VOX IDs listed below. If the squad XML file already exists, add the new Pack before `</Sounds>`. If it doesn't exist, create it wrapped in `<Sounds>...</Sounds>`.

## Reassignment mode

If the character already has a `<Pack>` in the squad XML, this is a reassignment. Read the existing assignments first and preserve any that are already good. Only swap out lines where the translation clearly suggests a better match. Don't regenerate from scratch — manual tweaks may have been made that should be kept.

## Important guidelines

- **Translations are machine-generated and often wrong.** They come from Whisper transcribing Japanese audio. Short non-verbal sounds (grunts, yelps, battle cries) frequently get hallucinated into unrelated phrases like "Thank you for watching!" or "Please subscribe!" — ignore these and rely on the filename pattern instead. When a translation contradicts what the filename obviously means (e.g. `Series_HittedLast` translating as something cheerful), trust the filename.

- **Keep lines short.** Most tactical callouts repeat frequently during gameplay. Long lines become annoying quickly. The only exception is `VOX_TRPR_DONE_HERE` which plays once at mission end.
- **Use semantic matching.** The line's meaning should fit the game event — "Take this!" works for throwing grenades, "Roger that" works for acknowledgement. "Nice" doesn't work for reloading (no semantic connection).
- **Leave empty if no good match.** It's better to have no voice line than an inappropriate one.
- **Don't use daily/idle lines** (`Series_Daily_*`) for combat VOX — they're too long and conversational.
- **`Series_Ultimate` lines are often too long** for frequently-repeated VOX IDs like gear deployment. Prefer `Series_Skill` or `Series_Hit` for gear VOX instead.
- **Avoid reusing the same file across multiple VOX IDs.** Vary the lines — if multiple gear IDs need similar aggressive lines, spread different files across them rather than duplicating one.
- **Match the tone to the event, not just the translation.** Never use `Tone_Positive` files for damage/injury/distress VOX IDs (`VOX_INJURED`, `VOX_TRPR_PINNED_DOWN`, etc.) — even if the translation seems vaguely fitting, the audio tone will be wrong.

## How to assign voice lines

Read the `_trans.txt` file and match each translated voice line to the most appropriate VOX ID based on its content and tone. Use the filename hints too — the original GFL2 filenames contain useful categories:

- `Series_Kill` → kill confirmation lines
- `Series_Win` → victory/mission complete lines
- `Series_Lose` → defeat/retreat lines
- `Series_Hitted` / `Series_HittedLast` → injury/dying lines
- `Series_Die` → death lines
- `Series_Skill01`, `Series_Skill02` → ability activation lines (good for gear deployment, freeze, bomb defuse)
- `Series_Ultimate` → ultimate ability lines (often too long for gear VOX — better for grenade warnings or DONE_HERE)
- `Series_Shield_Broken` → damage/stress reactions (good for injured, pinned down — the audio sounds strained despite sometimes having Tone_Positive in the filename)
- `Series_Tone_Positive_*` → general positive/affirmative lines (good for acknowledgements, callouts, confirmations)
- `Series_Tone_Negative_*` → general negative lines (good for bad events, casualties, distress)
- `Series_Up_*` → general alert/ready lines (good for roger, orders, holding)
- `Series_Set_Click` → confirmation/click lines (good for roger, orders, bomb located)
- `Series_Set_Fall` → deployment/drop-in lines ("I'm here, ready to go") — short positive acknowledgements, good for roger, moving, orders
- `Series_Battle_Start` → combat start lines (good for go go go, pump up)
- `Series_Hit__` → attack vocalisations (distinct from `Series_Hitted` which is taking damage)
- `Series_Chosen` → selection lines (good for eyes on target, tangos spotted)
- `Series_Daily_*` → idle/ambient lines (usually not used for combat VOX — too long)
- `Single_Passive_SSR` → passive/idle lines (can work for reload, wait)

### Tone matching guidelines

- **Positive tone** → acknowledgements, confirmations, all-clear, target spotted
- **Negative tone** → casualties, hostage down, pinned down, man down, VIP dead
- **Aggressive/energetic** → go go go, pump up, freeze, go loud
- **Calm/controlled** → silent on, holding, wait, orders
- **Pain/distress** → injured, dying
- **Satisfied/confident** → tango down, clear, done here

### Multiple paths

Some VOX IDs benefit from multiple `<Path>` entries for random variety. Use multiple paths for:
- `VOX_INJURED` (2-4 paths if available — mix of hit reactions)
- `VOX_TRPR_ROGER` (2 paths if you have good options)
- `VOX_TRPR_TANGODOWN` (2 paths if available)

### IDs that are commonly left empty

These IDs are often left empty — only fill them if you find a genuinely good match:
- `VOX_TRPR_CANT`
- `VOX_TRPR_CAN_I_SHOOT`
- `VOX_TRPR_GETDOWN`
- `VOX_TRPR_GO_LOUD`
- `VOX_TRPR_KEEPMOVINGON`
- `VOX_TRPR_KEEPMOVINGOFF`
- `VOX_TRPR_MATCHSPEEDON`
- `VOX_TRPR_NOTANGOS`
- `VOX_TRPR_SUSP_SEC`
- `VOX_TRPR_BREACHING_DOOR`
- `VOX_TRPR_DISGUISED`
- `VOX_TRPR_COMPROMISED`
- `VOX_TRPR_GEAR_CHARGE_RDY`
- `VOX_TRPR_ON_ALPHA`, `VOX_TRPR_ON_BRAVO`, `VOX_TRPR_ON_CHARLIE`, `VOX_TRPR_ON_DELTA`
- `VOX_TRPR_PASS_ALPHA`, `VOX_TRPR_PASS_BRAVO`, `VOX_TRPR_PASS_CHARLIE`, `VOX_TRPR_PASS_DELTA`

## VOX ID reference

All IDs must be present in each Pack, even if empty.

### Health/damage
| ID | When it plays | What fits |
|---|---|---|
| `VOX_DYING` | Character is killed | Death cry, final words, pained collapse |
| `VOX_INJURED` | Character takes damage | Pain grunt, yelp, "ugh!" — use multiple paths |

### Weapons
| ID | When it plays | What fits |
|---|---|---|
| `VOX_RELOAD` | Reloading weapon | Brief action line, skill line |
| `VOX_RELOAD_PUMP` | Shotgun pump reload | Same as reload, or a different line for variety |

### Gear deployment
| ID | When it plays | What fits |
|---|---|---|
| `VOX_GEAR_FLASH` | Throwing flashbang | Aggressive shout, ultimate/skill line |
| `VOX_GEAR_FRAG` | Throwing frag grenade | Aggressive shout, ultimate/skill line |
| `VOX_GEAR_SMOKE` | Deploying smoke | Tactical call, skill line |
| `VOX_GEAR_MOLOTOV` | Throwing molotov | Aggressive shout, skill line |
| `VOX_GEAR_LAUNCHER` | Firing launcher | Powerful shout, ultimate line |
| `VOX_GEAR_ROCKET` | Firing rocket | Powerful shout, ultimate line |
| `VOX_GEAR_STINGER` | Deploying stinger/trap | Tactical call, skill line |
| `VOX_WARN_GRENADE` | Warning: incoming grenade | Urgent alert, ultimate line |
| `VOX_WARN_RPG` | Warning: incoming RPG | Urgent alert, ultimate line |

### Tactical — movement
| ID | When it plays | What fits |
|---|---|---|
| `VOX_TRPR_MOVING` | Moving to position | Determined, action-focused |
| `VOX_TRPR_GO_GO_GO` | Aggressive push forward | High energy, battle start line |
| `VOX_TRPR_COME` | Follow me | Commanding, rallying |
| `VOX_TRPR_WAIT` | Hold/pause | Controlled, authoritative |
| `VOX_TRPR_GETDOWN` | Take cover (often empty) | Urgent command |
| `VOX_TRPR_KEEPMOVINGON` | Keep pushing (often empty) | Encouraging |
| `VOX_TRPR_KEEPMOVINGOFF` | Fall back (often empty) | Tactical retreat |
| `VOX_TRPR_MATCHSPEEDON` | Matching speed with squad ("matching speed") | Coordination |
| `VOX_TRPR_GO_LOUD` | Switching from stealth to loud ("going loud") | Aggressive, decisive |
| `VOX_TRPR_TIME_TO_GO` | Time to extract | Urgent, extract call |

### Tactical — threats
| ID | When it plays | What fits |
|---|---|---|
| `VOX_TRPR_TANGOS` | Enemies spotted | Alert, matter-of-fact |
| `VOX_TRPR_NOTANGOS` | No enemies (often empty) | Calm all-clear |
| `VOX_TRPR_EYESONTARGET` | Visual on target | Confident targeting |
| `VOX_TRPR_EYESONTARGET_QUIET` | Visual on target (stealth) | Quiet/subdued version |
| `VOX_TRPR_ONTARGET` | Weapon aimed, ready | Ready confirmation |
| `VOX_TRPR_HVT_RUNNING` | HVT fleeing | Alert, pursuit |
| `VOX_TRPR_CAN_I_SHOOT` | Permission to fire (often empty) | Seeking confirmation |
| `VOX_TRPR_CANT` | Can't engage (often empty) | Frustrated |
| `VOX_TRPR_PINNED_DOWN` | Suppressed by fire | Strained, distressed |

### Tactical — confirmations
| ID | When it plays | What fits |
|---|---|---|
| `VOX_TRPR_ROGER` | Acknowledging order | Professional confirmation |
| `VOX_TRPR_ORDERS` | Waiting for orders ("waiting for orders") | Idle/ready tone, not active acknowledgement |
| `VOX_TRPR_CLEAR` | Area clear | Confident all-clear |
| `VOX_TRPR_PUMPUP` | Pre-mission hype ("lock and load", "let's do this") | Aggressive, motivational |
| `VOX_TRPR_SILENTON` | Engaging stealth mode | Calm, quiet |
| `VOX_TRPR_SILENTOFF` | Disengaging stealth | Determined, action-ready |

### Combat results
| ID | When it plays | What fits |
|---|---|---|
| `VOX_TRPR_TANGODOWN` | Enemy killed | Satisfied kill confirm — use multiple paths |
| `VOX_TRPR_MANDOWN` | Friendly down | Urgent, concerned |
| `VOX_TRPR_FREEZE` | Commanding surrender | Authoritative, commanding |
| `VOX_TRPR_HANDCUFF` | Detaining suspect (often empty) | Professional, procedural |

### Hostage/VIP
| ID | When it plays | What fits |
|---|---|---|
| `VOX_TRPR_EYES_HOSTAGE` | Hostage spotted | Alert, protective |
| `VOX_TRPR_HOST_SEC` | Hostage secured | Confident confirmation |
| `VOX_TRPR_SUSP_SEC` | Suspect secured (often empty) | Procedural confirmation |
| `VOX_TRPR_HOLDING` | Holding position | Steady, defensive |
| `VOX_TRPR_HOST_DOWN` | Hostage killed | Urgent alarm |
| `VOX_TRPR_CIV_DOWN` | Civilian killed | Urgent alarm |
| `VOX_TRPR_VIP_DEAD` | VIP killed | Critical failure tone |

### Bomb/breaching
| ID | When it plays | What fits |
|---|---|---|
| `VOX_TRPR_BOMB_LOCATED` | Bomb found | Alert, discovery |
| `VOX_TRPR_BOMB_DEFUSING` | Defusing bomb | Focused, concentrated |
| `VOX_TRPR_BREACHING_DOOR` | Breaching a door | Short action callout, skill line |
| `VOX_TRPR_GEAR_CHARGE_PLACE` | Placing breach charge | Tactical placement |
| `VOX_TRPR_GEAR_CHARGE_RDY` | Charge ready to blow (often empty) | Readiness alert |

### Stealth/undercover
| ID | When it plays | What fits |
|---|---|---|
| `VOX_TRPR_DISGUISED` | In disguise/undercover | Calm, covert |
| `VOX_TRPR_COMPROMISED` | Cover blown | Urgent, alarmed |

### Mission
| ID | When it plays | What fits |
|---|---|---|
| `VOX_TRPR_DONE_HERE` | Mission complete | Victory, accomplished |
| `VOX_TRPR_EVAC` | Moving to evac zone after objectives complete | Urgent, positive "let's move!" — NOT a failure/retreat line. Do not use `Series_Lose` |

### Team positioning (all often empty)
| ID | When it plays |
|---|---|
| `VOX_TRPR_ON_ALPHA` | At alpha position |
| `VOX_TRPR_ON_BRAVO` | At bravo position |
| `VOX_TRPR_ON_CHARLIE` | At charlie position |
| `VOX_TRPR_ON_DELTA` | At delta position |
| `VOX_TRPR_PASS_ALPHA` | Handing off to alpha |
| `VOX_TRPR_PASS_BRAVO` | Handing off to bravo |
| `VOX_TRPR_PASS_CHARLIE` | Handing off to charlie |
| `VOX_TRPR_PASS_DELTA` | Handing off to delta |

### Misc
| ID | When it plays | What fits |
|---|---|---|
| `VOX_TRPR_TARGET_SEC` | Target secured | Positive confirmation |

## XML format

Use this exact format. Path names use `data/sounds/voice/` prefix (not `mod/`). Empty Sound elements should be self-closing style `<Sound ID="..."></Sound>` (on one line, no child elements).

```xml
<Pack name="{character_name}-Voice" channel="voice">
    <Sound ID="VOX_DYING">
      <Path name="data/sounds/voice/{character_name}/filename.wav" />
    </Sound>
    <!-- ... all other IDs ... -->
</Pack>
```

## Validation

After writing the XML, run `python scripts/validate_voice_files.py` to check that:
- All VOX IDs are present
- No invalid or duplicate IDs
- All referenced `.wav` files exist
- No file paths exceed 124 characters
