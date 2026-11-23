/* Game rules: aging, events, choices, breakthroughs, death. No DOM access, so the
   same code runs in the browser and in Node (see tools/simulate.js). */
(function () {
  const G = (globalThis.Game = globalThis.Game || {});
  const D = G.data, S = G.state, U = G.util, C = G.cond;

  const NUM_KEYS = ["health", "intelligence", "luck", "karma", "qi", "gold", "lifespan", "pills"];
  const LABEL = { health: "Health", intelligence: "Intelligence", luck: "Luck", karma: "Karma", qi: "Qi", gold: "Gold", lifespan: "Lifespan", pills: "Pills" };
  const NEG_IS_BAD = ["health", "intelligence", "luck", "karma", "qi", "lifespan"];
  const SECLUSION_QI_BONUS = 1.5;
  const SECLUSION_EVENT_CHANCE = 0.25;
  const NORMAL_EVENT_CHANCE = 0.75;

  const eventById = id => D.events.find(e => e.id === id);
  const lastRealm = () => D.realms.length - 1;

  /* ---------- derived numbers ---------- */
  function passiveQi(p) {
    if (p.age < 6) return 0;
    return Math.round((3 + p.realm * 6) * D.roots[p.root].mult * (1 + p.stats.intelligence / 250));
  }

  function breakChance(p) {
    let c = 0.35 + p.stats.intelligence / 300 + p.stats.luck / 400 + D.roots[p.root].brk - p.realm * 0.03;
    if (p.pills > 0) c += 0.15;
    return U.clamp(c, 0.1, 0.95);
  }

  function isBreakthroughReady(p) {
    const need = D.realms[p.realm].need;
    return need != null && p.qi >= need;
  }

  const canSeclude = p => p.alive && !p.pending && p.age >= 6 && !isBreakthroughReady(p);

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
    for (const k of NUM_KEYS) {
      if (fx[k] === undefined) continue;
      const before = current(p, k);
      setValue(p, k, before + resolveValue(fx[k], p, k));
      const d = current(p, k) - before;
      if (d) deltas[k] = d;
    }
    if (fx.setFlags) fx.setFlags.forEach(f => (p.flags[f] = p.age));
    if (fx.sect) p.sect = fx.sect;
    if (fx.die) p.deathCause = fx.die;

    const keys = Object.keys(deltas);
    const bad = !!fx.die || NEG_IS_BAD.some(k => deltas[k] < 0);
    const good = keys.some(k => deltas[k] > 0);
    const cls = fx.die ? "bad" : bad && !good ? "bad" : good && !bad ? "good" : "";
    S.addLog(text || "Nothing much happens.", cls, keys.map(k => LABEL[k] + " " + (deltas[k] > 0 ? "+" : "") + deltas[k]).join(", "));
  }

  /* ---------- time ---------- */
  // Advances one year. Returns the event that triggered (not yet shown), if any.
  function advanceYear(p, secluded) {
    p.age++;
    p.meditated = false;
    const gain = Math.round(passiveQi(p) * (secluded ? SECLUSION_QI_BONUS : 1));
    p.qi += gain;
    const old = p.age > p.lifespan * 0.8;
    p.stats.health = U.clamp(p.stats.health + (old ? -U.rand(1, 5) : U.rand(-1, 2) + (p.realm > 0 ? 1 : 0)), 0, 100);
    const ev = U.chance(secluded ? SECLUSION_EVENT_CHANCE : NORMAL_EVENT_CHANCE) ? pickEvent(p) : null;
    return { gain, event: ev };
  }

  function ageUp() {
    const p = S.p;
    if (!p.alive || p.pending) return;
    const r = advanceYear(p, false);
    if (r.event) startEvent(p, r.event);
    else S.addLog(U.pick(D.flavor.quiet), "dim", r.gain ? "Qi +" + r.gain : "");
    checkDeath(); S.save();
  }

  // Skip up to `years` years of quiet cultivation. Stops early for events, a
  // ready breakthrough, low health, or death.
  function seclude(years) {
    const p = S.p;
    if (!canSeclude(p)) return;
    years = years || 10;
    let total = 0, n = 0, reason = "", ev = null;
    for (let i = 0; i < years; i++) {
      const r = advanceYear(p, true);
      total += r.gain; n++;
      if (r.event) { ev = r.event; reason = "An event interrupts your seclusion."; break; }
      if (isDead(p)) break;
      if (isBreakthroughReady(p)) { reason = "You sense a breakthrough is near and emerge."; break; }
      if (p.stats.health < 30) { reason = "Your body is weak, so you end the seclusion early."; break; }
    }
    S.addLog("You spend " + n + " year" + (n > 1 ? "s" : "") + " in seclusion." + (reason ? " " + reason : ""), "dim", "Qi +" + total);
    if (ev) startEvent(p, ev);
    checkDeath(); S.save();
  }

  function meditate() {
    const p = S.p;
    if (!p.alive || p.pending || p.meditated) return;
    p.meditated = true;
    const gain = passiveQi(p) * 2 + U.rand(5, 15);
    if (U.chance(0.1)) {
      const dmg = U.rand(8, 22), half = Math.round(gain / 2);
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

  function breakthrough() {
    const p = S.p;
    if (!p.alive || p.pending || !isBreakthroughReady(p)) return;
    const usedPill = p.pills > 0;
    const chance = breakChance(p);
    if (usedPill) p.pills--;
    if (U.random() < chance) {
      p.realm++; p.highest = Math.max(p.highest, p.realm); p.qi = 0;
      const bonus = D.realms[p.realm].life;
      p.lifespan += bonus;
      S.addLog("BREAKTHROUGH! You ascend to " + D.realms[p.realm].name + "!" + (usedPill ? " (a pill aided you)" : ""), "good", "Lifespan +" + bonus);
      if (p.realm === lastRealm()) { p.ascended = true; p.deathCause = "Ascended to the Immortal Realm"; }
    } else {
      const dmg = U.rand(10, 25), lost = Math.floor(p.qi * 0.3), lifeLoss = p.realm >= 2 ? U.rand(2, 8) : 0;
      p.stats.health = U.clamp(p.stats.health - dmg, 0, 100);
      p.qi -= lost; p.lifespan -= lifeLoss;
      S.addLog("The breakthrough fails! Your meridians shudder.", "bad", "Health -" + dmg + ", Qi -" + lost + (lifeLoss ? ", Lifespan -" + lifeLoss : ""));
    }
    checkDeath(); S.save();
  }

  /* ---------- death ---------- */
  function deathCause(p) {
    if (p.deathCause) return p.deathCause;
    if (p.stats.health <= 0) return "Succumbed to wounds and exhaustion";
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
    passiveQi, breakChance, isBreakthroughReady, canSeclude, eventById, eligibleEvents,
    ageUp, seclude, meditate, choose, breakthrough, checkDeath
  };
})();
