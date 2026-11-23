# Contributing

Thank you for helping! The easiest and most valuable contribution is **writing events**. You only need a text editor.

## Quick start

1. Edit or add a file in `data/events/`.
2. Run `node tools/build.js`. It tells you exactly what is wrong, if anything.
3. Open `index.html` and play until your event appears.
4. (Optional) Run `node tools/simulate.js 500` to check you did not break the balance.

## An event, step by step

```json
{
  "id": "find_cave",
  "text": "You discover a hidden cave humming with spiritual energy.",
  "minAge": 10,
  "weight": 4,
  "if": ["luck>=25"],
  "choices": [
    {
      "label": "Enter the cave",
      "outcomes": [
        {
          "chance": 0.3,
          "scale": { "luck": 0.005 },
          "text": "Inside you find a pool of spirit liquid!",
          "effects": { "qi": { "base": 20, "perRealm": 25 }, "luck": 2 }
        },
        {
          "text": "A beast lairs inside and mauls you.",
          "effects": { "health": -25 }
        }
      ]
    },
    {
      "label": "Walk away",
      "outcomes": [ { "text": "Discretion is the better part of valor." } ]
    }
  ]
}
```

### Event fields

| Field | Meaning |
|---|---|
| `id` | Unique, lowercase letters/numbers/underscores. |
| `text` | What the player reads. |
| `minAge` / `maxAge` | Age range the event can appear in. |
| `minRealm` / `maxRealm` | Realm index range (0 = Mortal, 1 = Qi Condensation, ...). See `data/realms.json`. |
| `weight` | How common it is. Higher is more common (typical: 2 rare, 5 common). |
| `once` | `true` means it can happen only once per life. |
| `if` | List of conditions that must all be true (see below). |
| `choices` | The buttons the player can press. |

### Choices

Each choice has a `label`, optional `if` (the button is greyed out unless true, good for "costs 10 gold"), and a list of `outcomes`.

### Outcomes

Outcomes are tried **in order**. The first one whose `if` holds and whose `chance` roll succeeds is used. So:

- An outcome with `"chance": 0.7` happens 70% of the time.
- The **last outcome must have no `chance` and no `if`**. It is the fallback.
- `"scale"` adjusts the chance by the player's stats: `"scale": { "luck": 0.005 }` adds 0.5% per point of luck. Names: `health intelligence luck karma gold qi power age realm`. Use `"power": 0.01` on fights so a weapon helps (each point of power adds 1%).
- `"bonus"` adds to the chance when a condition holds: `"bonus": [ { "if": ["root:Fire"], "add": 0.15 } ]`.

### Effects

Inside an outcome's `"effects"`:

| Key | Meaning |
|---|---|
| `health`, `intelligence`, `luck`, `karma` | Change a stat (kept between 0 and 100). |
| `qi`, `gold` | Change the amount (never below 0). |
| `lifespan` | Change how many years the character can live. |
| `items` | Give or take items: `{ "healing_pill": 2 }` gives two, `{ "antidote": -1 }` removes one. Ids come from `data/items.json`. |
| `setFlags` | List of story flags to set, e.g. `["savedStranger"]`. |
| `sect` | Join a sect, e.g. `"Azure Cloud Sect"`. |
| `die` | Kill the character with this cause of death, e.g. `"Died of poisoning"`. |

A number can be written four ways:

- `-15` a fixed number
- `[5, 15]` a random number between 5 and 15
- `{ "base": 20, "perRealm": 25 }` scales with the player's realm (20 at Mortal, 45 at Qi Condensation, ...)
- `"-all"` removes everything (gold and qi only)

Armor reduces any negative `health` effect an event deals, so write damage as plain numbers and the game applies the armor.

### Conditions (`"if"`)

| Condition | True when |
|---|---|
| `"luck>=25"`, `"gold>=10"`, `"qi>30"` | A stat or number passes the comparison. Operators: `>= <= > < == !=` |
| `"ageRatio>0.7"` | Age divided by lifespan (0.7 = in the last 30% of life). |
| `"flag:hasRival"` | A story flag has been set. |
| `"!flag:hasRival"` | ...has NOT been set. Put `!` in front of anything to negate it. |
| `"since:master>=5"` | At least 5 years have passed since that flag was set. |
| `"sect"` / `"!sect"` | In any sect / in no sect. |
| `"sect:Azure Cloud Sect"` | In that specific sect. |
| `"root:Fire"` | Spiritual root is Fire. |
| `"item:antidote"` | The player owns at least one Antidote. Also `"item:healing_pill>=3"`. Great for "use your item" choices. |

## Items (`data/items.json`)

Two kinds. Items with a `price` are sold in the market, and the rest can only be found in events.

```json
{ "id": "healing_pill", "name": "Healing Pill", "type": "consumable",
  "desc": "Restores 25 health.", "use": { "health": 25 }, "price": 25 }

{ "id": "iron_sword", "name": "Iron Sword", "type": "equipment", "slot": "weapon",
  "desc": "+6 power in fights.", "mods": { "power": 6 }, "price": 80 }
```

- **Consumables** can have `use` (effects applied when the player taps Use; same numbers as event effects, limited to health, intelligence, luck, karma, qi and lifespan) or `onBreakthrough` (a bonus chance, used up automatically on a breakthrough attempt). A consumable with neither, like the Antidote, is only used by events through `"item:..."` choices.
- **Equipment** goes in the `weapon`, `armor` or `talisman` slot and gives `mods`: `power` (fight chance), `guard` (fraction of damage ignored, capped at 0.6), `regen` (extra health per year), `qiMult` (extra fraction of qi), `breakBonus` (breakthrough chance), `luck`, `intelligence`.
- Write a clear `desc`. It is what the player reads.

## Balance (`data/balance.json` and `data/realms.json`)

Health regeneration, old-age decline, event frequency, meditation and breakthrough risk are all numbers in `balance.json`. How much qi each realm needs and how many years it adds are in `realms.json`. Change them, then run `node tools/simulate.js` to see the effect. Pass `--set=path=value` to try a number first without editing a file.

## Story chains

A chain is just events linked by flags. Event 1 sets a flag, a later event requires it:

```json
{ "id": "stranger", "...": "...", "effects": { "setFlags": ["savedStranger"] } }
{ "id": "stranger2", "if": ["since:savedStranger>=6"], "weight": 20, "once": true, "...": "..." }
```

Give the follow-up a high `weight` and `once: true` so it shows up reasonably soon after it becomes available. The build tool warns you if you check a flag that nothing ever sets (usually a typo).

## Writing tips

- Keep event text to 1-3 sentences. Players read hundreds of them.
- Give choices real trade-offs. Avoid "the obviously best option".
- Match tone: classic xianxia (sects, cave dwellings, tribulations, pills, rivals).
- Write your own text. Do not copy from novels, games, or other copyrighted works.
- Run `node tools/simulate.js` after adding several events to catch ones that never appear or kill too often.

## Code contributions

- The game runs with no build step and no dependencies, and that should stay true. Plain JavaScript, no frameworks.
- `engine.js` and `state.js` must not touch the DOM (so `tools/simulate.js` can run them).
- Open an issue before a big change so we can agree on the direction.

## Art and audio

Only submit assets you made yourself or that are CC0 / CC-BY, and credit the author in `CREDITS.md`.
