#!/usr/bin/env node
/* Balance tester: plays many lives with a random-choice bot using the real game
   engine, then prints statistics so you can see how a content change affects the game.

   Usage:  node tools/simulate.js [lives=500]
   (Run `node tools/build.js` first if you changed anything in data/.) */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const lives = parseInt(process.argv[2], 10) || 500;

const ctx = vm.createContext({ console, Math });
vm.runInContext("globalThis.Game = {}", ctx);
for (const f of ["data/bundle.js", "js/util.js", "js/conditions.js", "js/state.js", "js/engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
}
const G = ctx.Game, S = G.state, E = G.engine, C = G.cond, U = G.util, D = G.data;

const eventCount = {}, deaths = {}, realmHist = D.realms.map(() => 0);
let ascended = 0, ageSum = 0, eventSum = 0;

S.newLife();
for (let l = 0; l < lives; l++) {
  let guard = 0;
  while (S.p.alive && guard++ < 5000) {
    const p = S.p;
    if (p.pending) {
      eventCount[p.pending] = (eventCount[p.pending] || 0) + 1;
      const ev = E.eventById(p.pending);
      const ok = ev.choices.map((c, i) => i).filter(i => C.testAll(p, ev.choices[i].if));
      E.choose(ok[U.rand(0, ok.length - 1)]);
    } else if (E.isBreakthroughReady(p)) E.breakthrough();
    else {
      if (!p.meditated && p.age >= 3) E.meditate();
      if (S.p.alive) (U.chance(0.3) && E.canSeclude(S.p) ? E.seclude(10) : E.ageUp());
    }
  }
  const p = S.p;
  realmHist[p.highest]++;
  if (p.ascended) ascended++;
  ageSum += p.age; eventSum += p.eventCount;
  const cause = p.ascended ? "Ascended" : p.deathCause;
  deaths[cause] = (deaths[cause] || 0) + 1;
  S.newLife();
}

const pct = n => ((n / lives) * 100).toFixed(1) + "%";
console.log("\nSimulated " + lives + " lives (random-choice bot)\n");
console.log("Average age at death : " + (ageSum / lives).toFixed(1));
console.log("Average events/life  : " + (eventSum / lives).toFixed(1));
console.log("Reached Immortal     : " + ascended + " (" + pct(ascended) + ")");
console.log("\nHighest realm reached:");
D.realms.forEach((r, i) => console.log("  " + r.name.padEnd(26) + String(realmHist[i]).padStart(5) + "  " + pct(realmHist[i])));
console.log("\nCauses of death:");
Object.entries(deaths).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log("  " + c.padEnd(40) + String(n).padStart(5) + "  " + pct(n)));
const never = D.events.filter(e => !eventCount[e.id]).map(e => e.id);
console.log("\nEvents seen: " + (D.events.length - never.length) + "/" + D.events.length + (never.length ? "  (never seen: " + never.join(", ") + ")" : ""));
const sorted = Object.entries(eventCount).sort((a, b) => a[1] - b[1]);
console.log("Rarest 3 : " + sorted.slice(0, 3).map(([k, v]) => k + " (" + v + ")").join(", "));
console.log("Commonest 3: " + sorted.slice(-3).reverse().map(([k, v]) => k + " (" + v + ")").join(", "));
