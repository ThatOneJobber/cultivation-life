#!/usr/bin/env node
/* Balance tester: plays many lives with a simple bot using the real game engine,
   then prints statistics so you can see how a change affects the game.

   Usage:  node tools/simulate.js [lives=500] [--seed=N] [--no-items] [--no-techniques] [--meditate=0..1]
                                  [--grant=art_id,art_id] [--set=path=value ...]
           --meditate is the share of years the bot meditates (1 = every year, like a dedicated player)
   (Run `node tools/build.js` first if you changed anything in data/.)

   The bot picks event choices at random (so it is a "careless" player), but sensibly
   uses items: it equips gear, heals when hurt, and sometimes shops. Results with a
   careful human player will be better than the bot's. Compare runs with the same seed. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const lives = parseInt(args.find(a => /^\d+$/.test(a)), 10) || 500;
const seedArg = args.find(a => a.startsWith("--seed="));
const seed = seedArg ? parseInt(seedArg.slice(7), 10) : 1;
const useItems = !args.includes("--no-items");
const medArg = args.find(a => a.startsWith("--meditate="));
const meditateRate = medArg ? parseFloat(medArg.slice(11)) : 1; // share of years the bot meditates

const ctx = vm.createContext({ console, Math });
vm.runInContext("globalThis.Game = {}", ctx);
for (const f of ["data/bundle.js", "js/util.js", "js/items.js", "js/techniques.js", "js/conditions.js", "js/state.js", "js/engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
}
const G = ctx.Game, S = G.state, E = G.engine, C = G.cond, U = G.util, D = G.data, I = G.items, T = G.tech;
const useTech = !args.includes("--no-techniques");

// Try numbers without editing files:  --set=balance.breakthrough.base=0.3 --set=realms.2.life=40
for (const arg of args.filter(x => x.startsWith("--set="))) {
  const [pathStr, valStr] = arg.slice(6).split("=");
  const keys = pathStr.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], D);
  target[last] = Number(valStr);
  console.log("override: " + pathStr + " = " + valStr);
}

// Seeded random numbers so two runs with the same seed are comparable.
let a = seed >>> 0;
U.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// Rough value of an art for the bot: how much it is worth to a careful player.
const ART_WEIGHT = { power: 1, guard: 60, regen: 6, qiMult: 100, breakBonus: 100, luck: 1, intelligence: 1, meditation: 50, safety: 100, vitality: 40 };
const artScore = (p, id) => { const d = T.def(id), s = T.scale(p, id); return Object.keys(d.mods).reduce((sum, k) => sum + d.mods[k] * s * (ART_WEIGHT[k] || 0), 0); };

function manageArts(p) {
  // buy a manual when rich enough (sometimes), then keep the best arts equipped
  if (!p.pending && U.chance(0.3)) {
    const options = T.all().filter(d => E.canBuyTechnique(p, d));
    if (options.length) E.buyTechnique(options[U.rand(0, options.length - 1)].id);
  }
  for (const id of Object.keys(p.tech)) {
    if (T.equipped(p).includes(id)) continue;
    if (T.equipped(p).length < T.slots(p)) { E.equipTechnique(id); continue; }
    const weakest = T.equipped(p).reduce((w, x) => (artScore(p, x) < artScore(p, w) ? x : w));
    if (artScore(p, id) > artScore(p, weakest) * 1.2) { E.unequipTechnique(weakest); E.equipTechnique(id); }
  }
}

function manageItems(p) {
  if (useTech) manageArts(p);
  // equip anything that fits an empty slot, preferring pricier/rarer gear
  for (const d of I.all()) if (d.type === "equipment" && I.count(p, d.id) && !p.equip[d.slot]) E.equipItem(d.id);
  // upgrade weapons/armor/talismans by simple rule: higher total of mods wins
  for (const d of I.all()) {
    if (d.type !== "equipment" || !I.count(p, d.id)) continue;
    const cur = p.equip[d.slot] && I.def(p.equip[d.slot]);
    const score = x => Object.values(x.mods).reduce((s, v) => s + (v < 1 ? v * 100 : v), 0);
    if (cur && score(d) > score(cur)) E.equipItem(d.id);
  }
  if (p.stats.health < 40 && I.count(p, "healing_pill")) E.useItem("healing_pill");
  if (I.count(p, "qi_pill") && p.qi < 30) E.useItem("qi_pill");
  if (I.count(p, "clarity_pill")) E.useItem("clarity_pill");
  if (I.count(p, "longevity_pill") && p.age > p.lifespan * 0.7) E.useItem("longevity_pill");
  // shopping: when rich, buy something affordable at random
  if (!p.pending && p.gold >= 90 && U.chance(0.4)) {
    const options = I.all().filter(d => E.canBuy(p, d));
    if (options.length) E.buyItem(options[U.rand(0, options.length - 1)].id);
  }
}

const eventCount = {}, causes = {}, realmHist = D.realms.map(() => 0);
let ascended = 0, ageSum = 0, eventSum = 0, healthDeaths = 0, oldAgeDeaths = 0;
const ageByCause = {}, killer = {}, youngDeaths = { n: 0 };

// --grant=art_id,art_id gives every life those arts at birth (to test how strong an art is on its own)
const grantArg = args.find(a => a.startsWith("--grant="));
const grant = grantArg ? grantArg.slice(8).split(",") : [];
function startLife() { S.newLife(); for (const id of grant) T.learn(S.p, id); }

startLife();
for (let l = 0; l < lives; l++) {
  let guard = 0, lastAction = "";
  while (S.p.alive && guard++ < 5000) {
    const p = S.p;
    if (useItems) manageItems(p);
    if (!S.p.alive) break;
    if (p.pending) {
      eventCount[p.pending] = (eventCount[p.pending] || 0) + 1;
      const ev = E.eventById(p.pending);
      const ok = ev.choices.map((c, i) => i).filter(i => C.testAll(p, ev.choices[i].if));
      lastAction = "event: " + p.pending;
      E.choose(ok[U.rand(0, ok.length - 1)]);
    } else if (E.isBreakthroughReady(p) && !E.breakthroughIsRisky(p)) { lastAction = "failed breakthrough"; E.breakthrough(); }
    else {
      // a careful-ish player only meditates while healthy, and rests (ages up) before risky breakthroughs
      if (!p.meditated && p.age >= 3 && p.stats.health > 50 && U.chance(meditateRate)) { lastAction = "meditation"; E.meditate(); }
      if (S.p.alive) { lastAction = "aging"; (U.chance(0.3) && E.canSeclude(S.p) ? E.seclude(10) : E.ageUp()); }
    }
  }
  const p = S.p;
  if (p.deathCause === "Succumbed to wounds and exhaustion") killer[lastAction] = (killer[lastAction] || 0) + 1;
  if (!p.ascended && p.age < 25) youngDeaths.n++;
  realmHist[p.highest]++;
  if (p.ascended) ascended++;
  ageSum += p.age; eventSum += p.eventCount;
  const cause = p.ascended ? "Ascended" : p.deathCause;
  causes[cause] = (causes[cause] || 0) + 1;
  (ageByCause[cause] = ageByCause[cause] || []).push(p.age);
  startLife();
}

const pct = n => ((n / lives) * 100).toFixed(1) + "%";
const avg = arr => (arr.reduce((s, x) => s + x, 0) / arr.length).toFixed(0);
console.log("\nSimulated " + lives + " lives (seed " + seed + ", " + (useItems ? "bot uses items" : "items ignored") + ")\n");
console.log("Average age at death : " + (ageSum / lives).toFixed(1));
console.log("Average events/life  : " + (eventSum / lives).toFixed(1));
console.log("Reached Immortal     : " + ascended + " (" + pct(ascended) + ")");
console.log("\nHighest realm reached:");
D.realms.forEach((r, i) => console.log("  " + r.name.padEnd(26) + String(realmHist[i]).padStart(5) + "  " + pct(realmHist[i])));
console.log("\nCauses of death (average age):");
Object.entries(causes).sort((x, y) => y[1] - x[1]).forEach(([c, n]) => console.log("  " + c.padEnd(40) + String(n).padStart(5) + "  " + pct(n).padStart(6) + "   age " + avg(ageByCause[c])));
console.log("\nDied before age 25   : " + youngDeaths.n + " (" + pct(youngDeaths.n) + ")");
console.log("Health deaths, by the last thing that happened:");
Object.entries(killer).sort((x, y) => y[1] - x[1]).slice(0, 8).forEach(([k, n]) => console.log("  " + k.padEnd(34) + String(n).padStart(5)));
const never = D.events.filter(e => !eventCount[e.id]).map(e => e.id);
console.log("\nEvents seen: " + (D.events.length - never.length) + "/" + D.events.length + (never.length ? "  (never seen: " + never.join(", ") + ")" : ""));
const sorted = Object.entries(eventCount).sort((x, y) => x[1] - y[1]);
console.log("Rarest 3 : " + sorted.slice(0, 3).map(([k, v]) => k + " (" + v + ")").join(", "));
console.log("Commonest 3: " + sorted.slice(-3).reverse().map(([k, v]) => k + " (" + v + ")").join(", "));
