# Add New Squad

Given a squad name, display name, description, flag colour, and a list of dolls, set up all the files needed for a new playable unit in the mod.

## Usage

The user may provide all details upfront, or just a squad name. Ask for anything missing before starting. The required information is:

- **Squad ID** (e.g. POL03, DEFY, 404)
- **Display name** (e.g. POL-03 Security Divisions)
- **Description** (can be a placeholder)
- **Flag colour** (hex, e.g. 82b90c)
- **Dolls** — for each doll:
  - Internal ID (e.g. STECHKIN, MOSINNAGANT)
  - Display name (e.g. Ksenia, Papasha)
  - Weapon name (e.g. Stechkin APS, PPSh-41)
  - Weapon type (pistol, smg, rifle, dmr, sniper, lmg, shotgun)

Also ask:
- **Which weapons get suppressed variants?** Not all weapons should have one (e.g. revolvers, bolt-action rifles typically don't). Suggest sensible defaults based on weapon type but confirm with the user.

If the user doesn't know weapon types or flag colours, suggest reasonable defaults. If doll descriptions aren't provided, use placeholders like "Description pending."

## What to create/modify

### 1. Weapons (`mod/equipment/gfl_weapons.xml`)

Add a `<Firearm>` definition for each new weapon. Copy from a similar existing weapon in the file and adjust:
- `name` → `GFL-WEAP-{DOLL_ID}` (e.g. `GFL-WEAP-MOSINNAGANT`)
- `tooltip` → `@WEAP-{DOLL_ID}-NAME`
- `description` → `@WEAP-{DOLL_ID}-DESC`
- `img` → `data/models/signatures/{doll_lowercase}_ui.dds`
- `category` → weapon type (rifle, smg, pistol, dmr, sniper, lmg, shotgun)

Find a similar weapon already in the file to base stats on:
- Sniper (bolt-action/anti-materiel) → copy from GFL-WEAP-OM50
- DMR (semi-auto precision) → copy from GFL-WEAP-G28
- SMG → copy from GFL-WEAP-MP5
- Pistol → copy from GFL-WEAP-CZ75
- Rifle → copy from GFL-WEAP-AN94
- LMG → copy from GFL-WEAP-LEWIS
- Shotgun → copy from GFL-WEAP-SPAS12

Also add suppressed variant (`{name}-SUP`) following the same pattern as other suppressed weapons in the file.

### 2. Ammo (`mod/equipment/gfl_ammo.xml`)

Add one default ammo entry per weapon. Copy from the same similar weapon. Do NOT add alternate ammo types (AP, hollow point, etc.) unless the user specifically asks for them.

Each ammo entry needs:
- The `<Ammo>` block with a unique `name` (e.g. `762R_GFL_MOSINNAGANT`)
- A `<Bind>` entry in the weapons file linking ammo to the weapon

Update the `name` attribute to include the new weapon's suffix (e.g. `_GFL_MOSINNAGANT`). Also create matching ammo for suppressed variants if applicable (same stats but with `silenced="1"` and lower `audibleSoundRadius`).

### 3. Entities (`mod/entities/gfl_humans.xml`)

Add an `<Entity>` for each doll, appended before `</Entities>`. Follow this template:

```xml
<Entity name="{SQUAD}-{DOLL_ID}" type="Human" editorAutoHeight="false">
    <RenderObject3D
        model="data/models/dolls/cubebodies/{doll_lowercase}.khm"
        diffuseTex="data/models/dolls/{doll_lowercase}.dds"
    />
    <Breakable template="GenericTrooperGibs" breakOnDamage="explosive" deleteOnDeath="false" />
    <PhysicalParams health="100" />
    <Human type="GoodGuy" unit="GFL-UNIT-{SQUAD}" class="GFL-DOLL-{DOLL_ID}">
        <Id
            name="{SQUAD}-{DOLL_ID}"
            portrait="data/textures/portraits/gfl_{doll_lowercase}.dds"
            gender="0"
            voicePack="{CharacterName}-Voice"
        />
        <FOV degrees="90" distanceMeters="999" eyeRadiusMeters="1" />
        <Brain suppressionRecovery="40.0" />
        <Mobility>
            <MoveSpeed min="1.3" defaultMetersPerSec="2.8" max="10" />
            <TurnSpeed min="6" defaultMetersPerSec="16" max="20" />
        </Mobility>
        <Equipment>
            <Item name="GFL-WEAP-{DOLL_ID}" />
            <Item name="scope_GFL_IronSights_Primary" />
            <Item name="GFL_FeetOfGunmetal" />
            <Item name="GFL_Lockpick" />
            <Item name="GFL_BasicCore" />
            <Item name="GFL_NightVision" />
            <Item name="GFL_CombatFrame" />
        </Equipment>
    </Human>
</Entity>
```

Notes:
- `voicePack` must match the Pack name in the voice lines XML (e.g. `Ksenia-Voice`)
- Only use `data/models/dolls/cubebodies/{name}.khm` if the doll has skins in `mod/models/dolls/skins/{name}/`. Cubebody models are for dolls with swappable skins only. If no skins exist, use the normal model path `data/models/dolls/{name}.khm`.
- If the doll has skins, also add entries to `mod/equipment/gfl_skins.xml` (Bind + Scope for each skin) and add the default skin as the last Equipment item. See existing entries in `gfl_skins.xml` for the pattern.

### 4. Unit definition (`mod/units/gfl_unit.xml`)

Add a new `<Unit>` block before `</Units>`. Copy the structure from an existing unit (DEFY is a good template). Key attributes:
- `name="GFL-UNIT-{SQUAD}"`
- `nameUI="@GFL-UNIT-{SQUAD}-NAME"`
- `description="@GFL-UNIT-{SQUAD}-DESC"`
- `flagTex="data/textures/gfl_{squad_lower}_bg.dds"` (use `gfl_girl_bg.dds` if no custom flag exists)
- `flagColor="{hex without #}"`
- `rndNameEntry="@#GFL-UNIT-{SQUAD}-NAME-RND"`
- `incapacitationChance="60"` / `incapacitationChanceCrit="30"`

Add a `<Class>` entry per doll. Copy `<TrooperRanks>`, `<Ranks>`, and `<Doctrine>` from an existing unit — use the shared doctrine nodes (OptimizedPerformance, CommunicationProtocols, etc.) and leave squad-specific doctrines out for now.

### 5. Human identities (`mod/units/gfl_human_identities.xml`)

Add a `<Portrait>` entry per doll before `</HumanIdentities>`:

```xml
<Portrait
    tex="data/textures/portraits/gfl_{doll_lowercase}.dds"
    unit="GFL-UNIT-{SQUAD}"
    class="GFL-DOLL-{DOLL_ID}"
    gender="0"
    customName="{DISPLAY_NAME}"
/>
```

### 6. Localisation (`mod/localization/gfl_game.txt`)

Add these strings:

```
@GFL-UNIT-{SQUAD}-NAME={Display Name}
@GFL-UNIT-{SQUAD}-DESC={Description}
@#GFL-UNIT-{SQUAD}-NAME-RND={Display Name}

@DOLL-{DOLL_ID}-NAME={Doll Display Name}
@DOLL-{DOLL_ID}-DESC={Doll Description}

@WEAP-{DOLL_ID}-NAME={Weapon Name}
@WEAP-{DOLL_ID}-DESC={Weapon Description}
```

### 7. Deploy screen

Run `python scripts/generate_deploy.py` to regenerate the deploy GUI XMLs. Do NOT manually edit deploy XML files.

### 8. Voice lines

If not already done, use the `/assign-voices` skill to set up voice lines for each doll.

## Verification

After all files are updated:
1. Run `python scripts/validate_voice_files.py` to check voice line references
2. Run `python scripts/generate_deploy.py` to generate deploy screens
3. Check that all referenced textures/models exist: portraits, cubebody models, weapon signature models
4. Grep for the new unit ID across all files to make sure everything references it consistently

## Notes

- The `movie` attribute on the Unit is for an unlock animation video. Use `""` or omit it if none exists.
- Flag textures are `.dds` files in `mod/textures/`. If no custom flag exists yet, reference an existing one as a placeholder.
- All dolls use standardised stats (100 HP, 2.8 move speed, 40 suppression recovery) unless there's a specific reason to differ.
