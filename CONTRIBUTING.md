# Contributing

Thank you for helping! The easiest and most valuable contribution is **writing events**. You only need a text editor.

## Quick start

1. Edit or add a file in `data/events/`. You can do this right on github.com (pencil icon), with no tools installed.
2. Run `node tools/build.js`. It tells you exactly what is wrong, if anything. *(If you edited on github.com you can skip this: the **Build data bundle** workflow runs the same check and rebuilds `data/bundle.js` automatically. Its result shows in the Actions tab and on your pull request.)*
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
| `learn` | Teach the player arts: `["blazing_palm"]`. Ids come from `data/techniques.json`. It is equipped automatically if a slot is free. |
| `items` | Give or take items: `{ "healing_pill": 2 }` gives two, `{ "antidote": -1 }` removes one. Ids come from `data/items.json`. |
| `setFlags` | List of story flags to set, e.g. `["savedStranger"]`. |
| `sect` | Join a sect, e.g. `"Azure Cloud Sect"` (names come from `data/sects.json`). You start at its lowest rank. Joining a different sect resets your rank. |
| `partner` | `"mortal"` or `"cultivator"` gives the player a partner (ignored if they already have one). A cultivator partner lives much longer. |
| `bond` | Change the partner bond (0-100). Ignored with no partner. Put it in the same outcome as `partner` to start higher. |
| `child` | `true` adds a child (up to 3). |
| `trainChild` | Raise the talent of the least talented child by this amount. Heirs get a bonus from talent. |
| `losePartner` | `true` removes the partner (for example, a death in an event). |
| `leaveSect` | `true` leaves the current sect and loses rank and merit. |
| `merit` | Change merit with your sect (ignored if you are in no sect). Same number formats as below. |
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
| `"partner"` | Has a partner. Also `"partner:mortal"` and `"partner:cultivator"`. |
| `"bond>=40"`, `"children<3"`, `"partnerAge<=50"`, `"generation>=2"` | Family numbers. `generation` is 1 for a first life, higher for heirs. |
| `"rank>=2"` | Sect rank, 0 being the lowest. `"rank>=1"` is also a quick way to say "in a sect and promoted at least once". |
| `"merit>=100"` | Merit earned with the current sect. |
| `"root:Fire"` | Spiritual root is Fire. |
| `"tech:blazing_palm"` | The player knows that art (use `!tech:...` for "does not know"). |
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
- **Equipment** goes in the `weapon`, `armor`, `talisman` or `ring` slot and gives `mods`: `power` (fight chance), `guard` (fraction of damage ignored, capped at 0.6), `regen` (extra health per year), `qiMult` (extra fraction of qi), `breakBonus` (breakthrough chance), `luck`, `intelligence`.
- `minRealm` (optional) is the realm index needed to buy a market item. Items without a `price` are only found in events, which is how to make rare treasure.
- Write a clear `desc`. It is what the player reads.

## Sects and missions (`data/sects.json`, `data/missions.json`)

A sect has a `name` (letters, numbers and spaces only), `alignment` (`righteous`, `demonic` or `neutral`), a `desc`, and a list of `ranks`, lowest first:

```json
{ "name": "Inner Disciple", "merit": 150, "minRealm": 1, "stipend": 2,
  "mods": { "guard": 0.05 },
  "reward": { "text": "The sect issues you an inner disciple's kit.",
              "effects": { "items": { "healing_pill": 2 }, "qi": 30 } } }
```

- `merit` is the total merit needed (the first rank needs 0, and each rank needs more than the one before). `minRealm` is the realm index required too.
- `stipend` is the gold paid every year. `mods` uses the same bonus keys as equipment and apply only while the rank is held. `reward` uses normal effects and is given when promoted.
- A new sect also needs recruiting: add a choice with `"sect": "Your Sect"` to an event such as `recruit` and `sect_invitation`.

A mission is a one-year job with outcomes, written just like an event choice:

```json
{ "id": "escort_caravan", "name": "Escort a Caravan", "risk": "medium", "weight": 5, "minRealm": 1,
  "desc": "Guard a merchant caravan across bandit country.",
  "outcomes": [
    { "chance": 0.7, "scale": { "power": 0.01 }, "text": "The bandits think twice.",
      "effects": { "merit": { "base": 20, "perRealm": 8 }, "gold": 25 } },
    { "text": "An ambush!", "effects": { "merit": 8, "health": -20 } }
  ] }
```

- `risk` is `low`, `medium` or `high` (shown to the player). `sects` (optional) restricts it to those sects, `minRank` and `minRealm` limit who sees it, and `if` takes the usual conditions.
- Missions replace the random event for that year, so the outcome text is the event. Keep merit rewards roughly: low 8-12, medium 20-25, high 40-55 (plus `perRealm`). Ranks are paced for about 34 missions in a life.
- The build checks that every sect has at least two missions at every rank.

## Achievements (`data/achievements.json`)

```json
{ "id": "centenarian", "cat": "Long Life", "name": "Centenarian",
  "desc": "Live to 100.", "if": ["age>=100"], "reward": 10 }
```

- `if` uses the normal conditions, checked after every action. Extra names for achievements: `highest` (best realm this life), `lives` (lives lived), `totalKarma`, `arts` (arts known), `masters` (arts at Master level), `retired`, `alive` (1 or 0), and `cause:old age` (true once dead with a cause of death containing that text). To check a death, add `"alive==0"`.
- `reward` is karma paid once. `hidden: true` shows "???" until it is earned. `cat` groups achievements in the Feats tab.
- The simulator prints which achievements it never saw unlocked, to catch ones that are impossible or too hard.

## Karma tree (`data/karma.json`)

```json
{ "id": "e_blood", "branch": "evil", "name": "Blood Tempering", "cost": 90,
  "desc": "While wicked: savage strength. Always: you leave yourself open.",
  "requires": ["e_vow"],
  "mods": { "power": 3, "regen": 1 },
  "always": { "guard": -0.1 } }
```

- `branch` is `trunk` (always on), `good` (works while the life's karma stat is 60 or more), `evil` (40 or less) or `neutral` (in between). The limits are `bands` at the top of the file.
- `mods` only work while the branch's band is active. `always` works all the time: use it for the price of the path (negative numbers are fine). Trunk nodes use `always` and `start` only.
- `start` changes each new life: `gold`, `intelligence`, `health`, `lifespan`, `karma` (sets the starting karma stat) and `heavenly` (extra chance of the Heavenly root, 0.04 = 4%).
- `flow` multiplies karma changes: `{ "gain": 0.5 }` halves good karma gained, `{ "loss": 1.5 }` makes losses 1.5 times bigger.
- `requires` lists nodes that must be owned first. `excludes` lists nodes that cannot be owned together (that is how each save commits to one vow).
- Keep the paths balanced: run `node tools/simulate.js 3000 --path=good`, `--path=evil` and `--path=neutral` and compare the "Reached realm 6+" lines. They should be close, with each path stronger in a different way and each paying a different price.

## Techniques / arts (`data/techniques.json`)

```json
{ "id": "blazing_palm", "name": "Blazing Palm", "element": "Fire",
  "desc": "Strikes wreathed in true flame.",
  "mods": { "power": 14 }, "price": 170, "minRealm": 1 }
```

- `mods` uses the same bonus keys as equipment (`power guard regen qiMult breakBonus luck intelligence`) plus three that arts and gear can both use: `meditation` (extra fraction of qi from meditating), `safety` (lowers the meditation deviation chance, in points, capped at 0.10) and `vitality` (slows old-age health decline, capped at 0.8).
- `element` (optional) names a spiritual root. The art is stronger (x1.3) for that root and weaker (x0.7) for others.
- `price` (optional) puts the art in the Market's Manuals list. Arts without a price can only be learned from events, which is how to make rare, special ones. `minRealm` (optional) is the realm index needed to buy it.
- Players only equip a few at once, so each art needs a clear identity: what kind of life does it suit?
- To teach an art from an event, add `"learn": ["art_id"]` to an outcome's effects. Look at `data/events/techniques.json` for examples, including one that gives a different art depending on the player's root.
- Numbers for slots per realm, mastery years and level multipliers are in `data/balance.json` under `techniques`.

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

The game currently ships no audio or image files: sounds and music are generated in `js/audio.js`, and the app icon (`icons/icon.svg`) is plain geometry. If you change the icon, re-render the PNGs from the SVG at 180, 192 and 512 px (plus a maskable 512 with 20% padding). Keep the sound code small and quiet by default.
