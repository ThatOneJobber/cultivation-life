# Cultivation Life

An open-source, text-based **cultivation (xianxia) life simulator** that runs in your browser. Inspired by the "tap to age up" style of life sims: you live one year at a time, face events, make choices, break through realms, and reincarnate when you die.

No build step is needed to play. **Open `index.html` in any browser.** Your progress saves automatically.

## How to play

- **Age Up** moves one year forward and may trigger an event with choices.
- **Meditate** (once per year) gains extra qi, with a small risk of qi deviation.
- **Seclude 10 yrs** skips ahead in quiet cultivation. It stops early if an event happens, a breakthrough is ready, or your health is low.
- When your qi bar fills, **Attempt Breakthrough** to reach the next realm. Pills improve the odds. Failure hurts.
- When you die, you earn **karma** that makes your next life a little better. There is no ending to win: you live, cultivate and grow until you die of old age, an accident or a bad choice. Your realm (Mortal up to True Immortal, 11 in all, each split into Early, Middle, Late and Peak) is how far your life got. If you have children, you can also **retire** at any time after age 30 and pass the legacy on, handing your best equipment down as an heirloom.
- **🎒 Bag** holds your pills and equipment. Use pills, and equip a weapon, armor and talisman for bonuses. The **Market** tab sells common items for gold, and rarer ones turn up in events.
- **📜 Arts** are cultivation techniques. You can learn many, but only equip a few at a time (more slots open as your realm grows). Equipped arts are practiced every year and level up from Initiate to Adept to Master. Elemental arts are strongest when they match your spiritual root. Find arts in sect pavilions and rare events, or buy manuals at the Market.
- **🏯 Sects**: join one of three sects (righteous Azure Cloud, demonic Blood Moon, or the alchemist Verdant Pill Pavilion) through recruitment events. Each has five ranks. Take missions from the **mission board** (a year each, with low, some or high risk) to earn **merit**, then pass a promotion trial to rise. Every rank pays a yearly gold stipend, gives bonuses, and rewards you with items, qi or lifespan. Joining a different sect starts you over at the bottom.
- **👪 Family**: you may meet a partner (a mortal, or a fellow cultivator as a dao companion), strengthen your bond, and have up to three children. A strong bond gives a small luck bonus. Mortal partners grow old and pass away. Train your children with events. When you die, you can **continue as one of your children**: they keep their root, get a boost to intelligence and luck from their talent, and inherit some gold and your best art. Or reincarnate as a new soul.
- **☯ Karma tree:** karma you earn when you die buys permanent upgrades. Take one **vow**: the Righteous path (works while your karma is 60 or higher), the Wicked path (40 or lower) or the Path of Balance (41-59). Each path has real benefits and a real price (for example the wicked gain power but suffer bad luck and fragile bodies, while the righteous heal and are blessed but lose their edge and are held to a higher standard). Roots of Fate upgrades help every path. You can forget your vows later for a partial refund.
- **🏆 Feats (achievements):** 53 permanent milestones across cultivation, long life, wealth, sects, family, arts and many lives. Each unlocks once and pays a little karma. Some are hidden until you earn them.
- **Export Save / Import Save** let you back up your game or move it between devices.

## Project layout

```
index.html          the page
css/style.css       look and feel
js/
  util.js           small helpers (random, clamp)
  items.js          inventory and equipment helpers
  techniques.js     learning, equipping and mastering arts
  sects.js          sect ranks, merit, stipends and the mission board
  family.js         partner, children and heirs
  karma.js          the karma upgrade tree
  achievements.js   unlocking achievements
  conditions.js     the "if" mini-language used by the data files
  state.js          player state, log, save/load
  engine.js         game rules (no DOM, so it can be tested in Node)
  ui.js             drawing the screen, buttons
  main.js           starts the game
data/
  realms.json       cultivation realms (qi needed, lifespan gained)
  roots.json        spiritual roots
  items.json        pills and equipment
  techniques.json   arts (techniques) and the manuals sold at the market
  sects.json        sects, their ranks, stipends and bonuses
  missions.json     the missions on the sect mission board
  karma.json        the karma upgrade tree (three paths and a trunk)
  achievements.json the achievements
  balance.json      tuning numbers: health regen, old-age decline, risks, art slots and mastery
  flavor.json       names and "quiet year" text
  events/*.json     all life events (this is where most contributions go)
  bundle.js         GENERATED from the above by tools/build.js
tools/
  build.js          validates data/ and generates data/bundle.js
  simulate.js       plays many lives with a bot and prints balance statistics
```

## Adding content (no coding needed)

Events are plain JSON in `data/events/`. See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the format and examples. After editing, run:

```
node tools/build.js
```

This checks your data for mistakes (typos in flag names, missing fields, and so on) and regenerates `data/bundle.js`. Then refresh `index.html`.

### Editing directly on GitHub (nothing to install)

You can also edit any file in `data/` on github.com: open it, click the pencil icon, change it, and commit. A workflow called **Build data bundle** then validates your JSON and rebuilds `data/bundle.js` for you, so the live game updates about a minute later.

- Watch the **Actions** tab. A green check means it worked.
- A red X means the data has a mistake. Click the run to read the error (it names the file, the event and the line). The game keeps using the last good version until you fix it.
- Pull requests get the same validation as a check, so mistakes are caught before merging.
- The workflow lives in `.github/workflows/build.yml`.

## Testing balance

```
node tools/simulate.js 1000
```

Plays 1000 lives with a bot (random event choices, but it equips gear, heals when hurt, and shops) and prints average lifespan, realms reached, causes of death, what killed characters, and which events are too rare or too common. Use it after changing events or numbers.

You can try numbers **without editing any file**, and compare runs by fixing the random seed:

```
node tools/simulate.js 1000 --seed=5 --set=balance.regen.max=2 --set=realms.3.need=3000
node tools/simulate.js 1000 --meditate=0.3     # a player who meditates only 30% of years
node tools/simulate.js 1000 --no-items         # ignore the inventory system
node tools/simulate.js 1000 --no-techniques    # the bot stops buying and swapping arts
node tools/simulate.js 1000 --path=evil       # everyone owns the whole Wicked path (good, evil or neutral)
node tools/simulate.js 1000 --heirs            # each life continues as the most talented child
node tools/simulate.js 1000 --missions=0       # sect members never take missions (default 0.5 of years)
node tools/simulate.js 1000 --grant=void_meditation   # everyone starts with this art
```

`--grant` is handy for checking one art's strength. To compare arts fairly, also remove the slot limit, for example with `--no-techniques` plus `--set=balance.techniques.slots.0=10` for each realm slot.

Current target (bot that meditates every year): about 12% of lives reach Void Refinement (realm 6) or beyond, deeper realms get rarer, most lives end of old age, and under 10% die young or from danger. A player who meditates less usually peaks around Nascent Soul.

Requires [Node.js](https://nodejs.org) 16 or newer for the tools. The game itself needs only a browser.

## Roadmap

- [x] Playable core loop, 29 events, 3 story chains, realms, reincarnation
- [x] Content in JSON, validation, balance simulator, time skip, save export/import
- [x] Health and lifespan balance pass, inventory (pills, equipment), market
- [x] Techniques: learn, equip in limited slots, mastery levels, root affinity
- [x] Sect ranks and missions: three sects, five ranks each, mission board, promotion trials
- [x] Relationships and heirs: partner, children, bloodline
- [x] Karma upgrade tree with good, wicked and balanced paths
- [x] Achievements
- [x] More events (100+ now) and more gear, arts and realms. Still aiming for 150+
- [ ] Art, music, tutorial, installable web app (PWA)
- [ ] Translations

## License

[MIT](LICENSE). Use it, change it, share it.
