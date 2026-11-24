/* Game rules: aging, events, choices, items, breakthroughs, death. No DOM access, so
   the same code runs in the browser and in Node (see tools/simulate.js).
   Tunable numbers live in data/balance.json. */
(function () {
  const G = (globalThis.Game = globalThis.Game || {});
  const D = G.data, S = G.state, U = G.util, C = G.cond, I = G.items, T = G.tech, X = G.sects;
  const B = D.balance;

  const NUM_KEYS = ["health", "intelligence", "luck", "karma", "qi", "gold", "lifespan", "merit"];
  const LABEL = { health: "Health", intelligence: "Intelligence", luck: "Luck", karma: "Karma", qi: "Qi", gold: "Gold", lifespan: "Lifespan", merit: "Merit" };
  const NEG_IS_BAD = ["health", "intelligence", "luck", "karma", "qi", "lifespan", "merit"];

  const eventById = id => D.events.find(e => e.id === id);
  const lastRealm = () => D.realms.length - 1;
  const eff = (p, k) => C.value(p, k); // stat including equipment bonuses

  /* ---------- derived numbers ---------- */
  function passiveQi(p) {
    if (p.age < 6) return 0;
    return Math.round((3 + p.realm * 6) * D.roots[p.root].mult * (1 + eff(p, "intelligence") / 250) * (1 + I.mod(p, "qiMult")));
  }

  // The owned pill with the best breakthrough bonus, or null.
  function bestPill(p) {
    let best = null;
    for (const id of Object.keys(p.inv)) {
      const d = I.def(id);
      if (d && d.onBreakthrough && (!best || d.onBreakthrough > best.onBreakthrough)) best = d;
    }
    return best;
  }

  function breakChance(p) {
    let c = B.breakthrough.base + eff(p, "intelligence") / 300 + eff(p, "luck") / 400 +
      D.roots[p.root].brk - p.realm * 0.03 + I.mod(p, "breakBonus");
    const pill = bestPill(p);
    if (pill) c += pill.onBreakthrough;
    return U.clamp(c, 0.1, 0.95);
  }

  function isBreakthroughReady(p) {
    const need = D.realms[p.realm].need;
    return need != null && p.qi >= need;
  }

  const canSeclude = p => p.alive && !p.pending && p.age >= 6 && !isBreakthroughReady(p);

  // True when a failed breakthrough could kill the character right now.
  const breakthroughIsRisky = p => p.stats.health <= B.breakthrough.failDamageMax;

  // Armor: reduces a damage amount (positive number) by the player's guard.
  const guarded = (p, dmg) => { const g = I.mod(p, "guard"); return g ? Math.max(1, Math.round(dmg * (1 - g))) : dmg; };

  /* ---------- events ---------- */
  function eligibleEvents(p) {
    return D.events.filter(e =>
      p.age >= (e.minAge ?? 0) && p.age <= (e.maxAge ?? 999) &&
      p.realm >= (e.minRealm ?? 0) && p.realm <= (e.maxRealm ?? 99) &&
      !(e.once && U.hasOwn(p.flags, "seen_" + e.id)) &&
      C.testAll(p, e.if));
  }

  function pickEvent(p) {
    const pool = eligibleEvents(p);
    if (!pool.length) return null;
    let r = U.random() * pool.reduce((s, e) => s + (e.weight || 1), 0);
    for (const e of pool) { r -= e.weight || 1; if (r <= 0) return e; }
    return pool[pool.length - 1];
  }

  function startEvent(p, ev) {
    p.pending = ev.id;
    p.eventCount++;
    if (ev.once) p.flags["seen_" + ev.id] = p.age;
    S.addLog(ev.text, "event");
  }

  // Probability of one outcome: base chance + stat scaling + conditional bonuses.
  function outcomeChance(o, p) {
    if (o.chance === undefined) return 1;
    let c = o.chance;
    if (o.scale) for (const k in o.scale) c += C.value(p, k) * o.scale[k];
    if (o.bonus) for (const b of o.bonus) if (C.testAll(p, b.if)) c += b.add;
    return U.clamp(c, 0.01, 0.99);
  }

  // Outcomes are tried in order; the first one whose "if" holds and whose roll succeeds wins.
  function resolveOutcome(p, choice) {
    for (const o of choice.outcomes) {
      if (!C.testAll(p, o.if)) continue;
      if (o.chance === undefined || U.random() < outcomeChance(o, p)) return o;
    }
    return { text: "Nothing much happens." };
  }

  /* ---------- effects ---------- */
  const isStat = k => C.STAT_NAMES.includes(k);
  const current = (p, k) => (isStat(k) ? p.stats[k] : p[k]);
  function setValue(p, k, v) {
    if (isStat(k)) p.stats[k] = U.clamp(v, 0, 100);
    else if (k === "lifespan") p.lifespan = Math.max(1, v);
    else p[k] = Math.max(0, v);
  }

  // A value is a number, [min,max], {base, perRealm}, or "-all".
  function resolveValue(v, p, key) {
    if (typeof v === "number") return v;
    if (Array.isArray(v)) return U.rand(v[0], v[1]);
    if (v === "-all") return -current(p, key);
    if (v && typeof v === "object") return Math.round((v.base || 0) + (v.perRealm || 0) * p.realm);
    return 0;
  }

  function applyEffects(p, fx, text) {
    fx = fx || {};
    const deltas = {};
    const promoBefore = X.promotion(p);
    for (const k of NUM_KEYS) {
      if (fx[k] === undefined || (k === "merit" && !p.sect)) continue;
      let amount = resolveValue(fx[k], p, k);
      if (k === "health" && amount < 0) amount = -guarded(p, -amount);
      const before = current(p, k);
      setValue(p, k, before + amount);
      const d = current(p, k) - before;
      if (d) deltas[k] = d;
    }
    const gained = [];
    if (fx.items) {
      for (const id in fx.items) {
        const got = I.add(p, id, fx.items[id]);
        if (got) gained.push({ n: got, name: I.def(id).name });
      }
    }
    const learned = [];
    if (fx.learn) for (const id of fx.learn) if (T.learn(p, id)) learned.push({ name: T.def(id).name, worn: p.techEquip.includes(id) });
    if (fx.setFlags) fx.setFlags.forEach(f => (p.flags[f] = p.age));
    if (fx.sect && fx.sect !== p.sect) X.join(p, fx.sect);
    if (fx.leaveSect) X.leave(p);
    if (fx.die) p.deathCause = fx.die;

    const keys = Object.keys(deltas);
    const bad = !!fx.die || NEG_IS_BAD.some(k => deltas[k] < 0);
    const good = keys.some(k => deltas[k] > 0) || gained.some(g => g.n > 0) || learned.length > 0;
    const cls = fx.die ? "bad" : bad && !good ? "bad" : good && !bad ? "good" : "";
    const parts = keys.map(k => LABEL[k] + " " + (deltas[k] > 0 ? "+" : "") + deltas[k])
      .concat(gained.map(g => (g.n > 0 ? "+" : "") + g.n + " " + g.name))
      .concat(learned.map(l => "Learned " + l.name + (l.worn ? "" : " (no free slot, see Arts)")));
    S.addLog(text || "Nothing much happens.", cls, parts.join(", "));
    const promoAfter = X.promotion(p);
    if (promoAfter && promoAfter.ready && !(promoBefore && promoBefore.ready && promoBefore.next === promoAfter.next))
      S.addLog("You are ready for promotion to " + promoAfter.next.name + ". Open the Sect tab to take the trial.", "good");
  }

  /* ---------- time ---------- */
  // Advances one year. Returns the event that triggered (not yet shown), if any.
  function advanceYear(p, secluded, eventChance) {
    p.age++;
    p.meditated = false;
    const gain = Math.round(passiveQi(p) * (secluded ? B.seclusion.qiBonus : 1));
    p.qi += gain;
    const stipend = X.stipend(p);
    p.gold += stipend;
    const old = p.age > p.lifespan * B.oldAge.start;
    const change = old
      ? -Math.round(U.rand(B.oldAge.drainMin, B.oldAge.drainMax) * (1 - I.mod(p, "vitality")))
      : U.rand(B.regen.min, B.regen.max) + Math.round(p.realm * B.regen.perRealm);
    p.stats.health = U.clamp(p.stats.health + change + I.mod(p, "regen"), 0, 100);
    const ups = T.practice(p, secluded ? B.techniques.practice.seclusion : B.techniques.practice.year);
    const ev = U.chance(eventChance !== undefined ? eventChance : secluded ? B.seclusion.eventChance : B.eventChance) ? pickEvent(p) : null;
    return { gain, stipend, event: ev, ups };
  }

  function logLevelUps(ups) {
    for (const u of ups) S.addLog("Your " + u.name + " reaches the " + u.levelName + " level.", "good");
  }

  function ageUp() {
    const p = S.p;
    if (!p.alive || p.pending) return;
    const r = advanceYear(p, false);
    logLevelUps(r.ups);
    if (r.event) startEvent(p, r.event);
    else S.addLog(U.pick(D.flavor.quiet), "dim", [r.gain ? "Qi +" + r.gain : "", r.stipend ? "Gold +" + r.stipend + " (sect stipend)" : ""].filter(Boolean).join(", "));
    checkDeath(); S.save();
  }

  // Skip up to `years` years of quiet cultivation. Stops early for events, a
  // ready breakthrough, low health, or death.
  function seclude(years) {
    const p = S.p;
    if (!canSeclude(p)) return;
    years = years || 10;
    let total = 0, pay = 0, n = 0, reason = "", ev = null, ups = [];
    for (let i = 0; i < years; i++) {
      const r = advanceYear(p, true);
      total += r.gain; pay += r.stipend; n++; ups = ups.concat(r.ups);
      if (r.event) { ev = r.event; reason = "An event interrupts your seclusion."; break; }
      if (isDead(p)) break;
      if (isBreakthroughReady(p)) { reason = "You sense a breakthrough is near and emerge."; break; }
      if (p.stats.health < B.seclusion.stopBelowHealth) { reason = "Your body is weak, so you end the seclusion early."; break; }
    }
    S.addLog("You spend " + n + " year" + (n > 1 ? "s" : "") + " in seclusion." + (reason ? " " + reason : ""), "dim", "Qi +" + total + (pay ? ", Gold +" + pay : ""));
    logLevelUps(ups);
    if (ev) startEvent(p, ev);
    checkDeath(); S.save();
  }

  function meditate() {
    const p = S.p;
    if (!p.alive || p.pending || p.meditated) return;
    p.meditated = true;
    const gain = Math.round((passiveQi(p) * 2 + U.rand(5, 15)) * (1 + I.mod(p, "meditation")));
    const risk = Math.max(0, B.meditation.riskChance - I.mod(p, "safety"));
    logLevelUps(T.practice(p, B.techniques.practice.meditate));
    if (U.chance(risk)) {
      const dmg = U.rand(B.meditation.riskDamageMin, B.meditation.riskDamageMax), half = Math.round(gain / 2);
      p.qi += half; p.stats.health = U.clamp(p.stats.health - dmg, 0, 100);
      S.addLog("Your qi deviates during meditation!", "bad", "Health -" + dmg + ", Qi +" + half);
    } else {
      p.qi += gain;
      S.addLog("You meditate deeply and absorb spiritual energy.", "good", "Qi +" + gain);
    }
    checkDeath(); S.save();
  }

  function choose(i) {
    const p = S.p;
    if (!p.alive || !p.pending) return;
    const ev = eventById(p.pending);
    if (!ev) { p.pending = null; return; }
    const c = ev.choices[i];
    if (!c || !C.testAll(p, c.if)) return;
    const o = resolveOutcome(p, c);
    p.pending = null;
    applyEffects(p, o.effects, o.text);
    checkDeath(); S.save();
  }

  /* ---------- sect missions and promotion ---------- */
  const canSectAct = p => p.alive && !p.pending && !!X.current(p);

  // Spend a year on a mission from this year's board. No random event rolls that year: the mission is the event.
  function doMission(id) {
    const p = S.p;
    if (!canSectAct(p) || !X.board(p).some(m => m.id === id)) return;
    const m = X.missionById(id);
    const r = advanceYear(p, false, 0);
    logLevelUps(r.ups);
    S.addLog("Mission: " + m.name + ".", "dim", [r.gain ? "Qi +" + r.gain : "", r.stipend ? "Gold +" + r.stipend + " (stipend)" : ""].filter(Boolean).join(", "));
    const o = resolveOutcome(p, m);
    applyEffects(p, o.effects, o.text);
    checkDeath(); S.save();
  }

  // Spend a year on the trial for the next rank.
  function promotionTrial() {
    const p = S.p;
    if (!canSectAct(p)) return;
    const pr = X.promotion(p);
    if (!pr || !pr.ready) return;
    const chance = X.trialChance(p), bs = B.sect;
    const r = advanceYear(p, false);
    logLevelUps(r.ups);
    S.addLog("You sit the trial for " + pr.next.name + ".", "dim", r.stipend ? "Gold +" + r.stipend + " (stipend)" : "");
    if (U.random() < chance) {
      p.sectRank++;
      applyEffects(p, pr.next.reward && pr.next.reward.effects, "PROMOTED! You are now " + pr.next.name + " of the " + p.sect + ". " + (pr.next.reward ? pr.next.reward.text : ""));
    } else {
      const dmg = guarded(p, U.rand(bs.failHealthMin, bs.failHealthMax)), lost = Math.round(p.merit * bs.failMeritLoss);
      p.stats.health = U.clamp(p.stats.health - dmg, 0, 100);
      p.merit -= lost;
      S.addLog("You fail the trial. The examiners send you back to train.", "bad", "Health -" + dmg + ", Merit -" + lost);
    }
    checkDeath(); S.save();
  }

  function breakthrough() {
    const p = S.p;
    if (!p.alive || p.pending || !isBreakthroughReady(p)) return;
    const pill = bestPill(p);
    const chance = breakChance(p);
    if (pill) I.add(p, pill.id, -1);
    if (U.random() < chance) {
      const slotsBefore = T.slots(p);
      p.realm++; p.highest = Math.max(p.highest, p.realm); p.qi = 0;
      const bonus = D.realms[p.realm].life, heal = B.breakthrough.successHeal;
      p.lifespan += bonus;
      if (heal) p.stats.health = U.clamp(p.stats.health + heal, 0, 100);
      S.addLog("BREAKTHROUGH! You ascend to " + D.realms[p.realm].name + "!" + (pill ? " (" + pill.name + " aided you)" : ""), "good",
        "Lifespan +" + bonus + (heal ? ", Health +" + heal : ""));
      if (T.slots(p) > slotsBefore) S.addLog("Your understanding deepens: you can now hold " + T.slots(p) + " arts.", "good", "Open the Arts tab to equip");
      if (p.realm === lastRealm()) { p.ascended = true; p.deathCause = "Ascended to the Immortal Realm"; }
    } else {
      const dmg = guarded(p, U.rand(B.breakthrough.failDamageMin, B.breakthrough.failDamageMax));
      const lost = Math.floor(p.qi * 0.3), lifeLoss = p.realm >= 2 ? U.rand(2, 8) : 0;
      p.stats.health = U.clamp(p.stats.health - dmg, 0, 100);
      p.qi -= lost; p.lifespan -= lifeLoss;
      S.addLog("The breakthrough fails! Your meridians shudder." + (pill ? " (" + pill.name + " was wasted)" : ""), "bad",
        "Health -" + dmg + ", Qi -" + lost + (lifeLoss ? ", Lifespan -" + lifeLoss : ""));
    }
    checkDeath(); S.save();
  }

  /* ---------- items ---------- */
  function useItem(id) {
    const p = S.p, d = I.def(id);
    if (!p.alive || !d || d.type !== "consumable" || !d.use || I.count(p, id) < 1) return;
    I.add(p, id, -1);
    applyEffects(p, d.use, "You use a " + d.name + ".");
    checkDeath(); S.save();
  }

  function equipItem(id) {
    const p = S.p, d = I.def(id);
    if (!p.alive || !d || d.type !== "equipment" || I.count(p, id) < 1) return;
    p.equip[d.slot] = id;
    S.addLog("You equip the " + d.name + ".", "dim", d.desc);
    S.save();
  }

  function unequipSlot(slot) {
    const p = S.p, id = p.equip[slot], d = id && I.def(id);
    if (!p.alive || !d) return;
    p.equip[slot] = null;
    S.addLog("You put away the " + d.name + ".", "dim");
    S.save();
  }

  const canBuy = (p, d) => !!d && p.alive && !p.pending && d.price > 0 && p.gold >= d.price && !(d.type === "equipment" && I.count(p, d.id) > 0);

  function buyItem(id) {
    const p = S.p, d = I.def(id);
    if (!canBuy(p, d)) return;
    p.gold -= d.price;
    I.add(p, id, 1);
    S.addLog("You buy a " + d.name + " at the market.", "dim", "Gold -" + d.price);
    S.save();
  }

  /* ---------- techniques ---------- */
  function equipTechnique(id) {
    const p = S.p;
    if (!p.alive || !T.equip(p, id)) return;
    S.addLog("You settle into the " + T.def(id).name + ".", "dim");
    S.save();
  }

  function unequipTechnique(id) {
    const p = S.p;
    if (!p.alive || !T.unequip(p, id)) return;
    S.addLog("You set aside the " + T.def(id).name + ".", "dim");
    S.save();
  }

  const canBuyTechnique = (p, d) => !!d && p.alive && !p.pending && d.price > 0 && p.gold >= d.price &&
    !T.known(p, d.id) && p.realm >= (d.minRealm || 0);

  function buyTechnique(id) {
    const p = S.p, d = T.def(id);
    if (!canBuyTechnique(p, d)) return;
    p.gold -= d.price;
    T.learn(p, id);
    S.addLog("You buy and study the " + d.name + " manual.", "good", "Gold -" + d.price + (p.techEquip.includes(id) ? "" : ", no free slot (see Arts)"));
    S.save();
  }

  /* ---------- death ---------- */
  function deathCause(p) {
    if (p.deathCause) return p.deathCause;
    if (p.stats.health <= 0) return p.age > p.lifespan * B.oldAge.start ? "Died of old age" : "Succumbed to wounds and exhaustion";
    if (p.age >= p.lifespan) return "Died of old age";
    return null;
  }
  const isDead = p => !!deathCause(p);

  function checkDeath() {
    const p = S.p;
    if (!p.alive) return;
    const cause = deathCause(p);
    if (cause) { p.deathCause = cause; endLife(); }
  }

  function endLife() {
    const p = S.p;
    p.alive = false; p.pending = null;
    p.karmaGain = Math.round(p.highest * 12 + p.age / 10 + Math.max(0, p.stats.karma - 50) / 4 + (p.ascended ? 50 : 0));
    S.meta.karma += p.karmaGain;
    S.addLog(p.ascended ? "You shed your mortal shell and ascend beyond the heavens." : "Your life comes to an end: " + p.deathCause + ".", p.ascended ? "good" : "bad");
    S.save();
  }

  G.engine = {
    passiveQi, breakChance, bestPill, isBreakthroughReady, breakthroughIsRisky, canSeclude, eventById, eligibleEvents,
    ageUp, seclude, meditate, choose, breakthrough, checkDeath,
    useItem, equipItem, unequipSlot, buyItem, canBuy,
    equipTechnique, unequipTechnique, buyTechnique, canBuyTechnique,
    doMission, promotionTrial, canSectAct
  };
})();
