# Cultivation Life

An open-source, text-based **cultivation (xianxia) life simulator** that runs in your browser. Inspired by the "tap to age up" style of life sims: you live one year at a time, face events, make choices, break through realms, and reincarnate when you die.

No build step is needed to play. **Open `index.html` in any browser.** Your progress saves automatically.

## How to play

- **Age Up** moves one year forward and may trigger an event with choices.
- **Meditate** (once per year) gains extra qi, with a small risk of qi deviation.
- **Seclude 10 yrs** skips ahead in quiet cultivation. It stops early if an event happens, a breakthrough is ready, or your health is low.
- When your qi bar fills, **Attempt Breakthrough** to reach the next realm. Pills improve the odds. Failure hurts.
- When you die, you earn **karma** that makes your next life a little better. Reach *Immortal Ascension* to win a life.
- **Export Save / Import Save** let you back up your game or move it between devices.

## Project layout

```
index.html          the page
css/style.css       look and feel
js/
  util.js           small helpers (random, clamp)
  conditions.js     the "if" mini-language used by the data files
  state.js          player state, log, save/load
  engine.js         game rules (no DOM, so it can be tested in Node)
  ui.js             drawing the screen, buttons
  main.js           starts the game
data/
  realms.json       cultivation realms
  roots.json        spiritual roots
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

## Testing balance

```
node tools/simulate.js 500
```

Plays 500 lives with a random-choice bot and prints average lifespan, realms reached, causes of death, and which events are too rare or too common. Use it after changing events or numbers.

Requires [Node.js](https://nodejs.org) 16 or newer for the tools. The game itself needs only a browser.

## Roadmap

- [x] Playable core loop, 29 events, 3 story chains, realms, reincarnation
- [x] Content in JSON, validation, balance simulator, time skip, save export/import
- [ ] Inventory (pills, artifacts) and techniques
- [ ] Sect ranks and missions
- [ ] Relationships and heirs
- [ ] Karma upgrade tree and achievements
- [ ] 150+ events
- [ ] Art, music, tutorial, installable web app (PWA)
- [ ] Translations

## License

[MIT](LICENSE). Use it, change it, share it.
