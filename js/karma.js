/* The karma tree: permanent upgrades bought with the karma you earn when you die.
   Definitions live in data/karma.json. No DOM access.

   meta.karma     total karma ever earned (also gives a small passive bonus at birth)
   meta.spent     karma spent on upgrades
   meta.upgrades  { nodeId: true } what you own

   Three paths (good, evil, neutral), one vow each, so a save commits to one. A path's
   "mods" only work while your life's karma stat is in that path's band; its "always"
   mods (the price of the path) and "flow" (how karma changes) always apply.
*/
(function () {
  const G = (globalThis.Game = globalThis.Game || {});
  const U = G.util;
  const K = () => G.data.karma;
  const meta = () => G.state.meta;

  let cache = null;
  function map() {
    if (!cache || cache.src !== K()) { cache = { src: K(), map: {} }; K().nodes.forEach(n => (cache.map[n.id] = n)); }
    return cache.map;
  }
  const def = id => map()[id] || null;
  const nodes = () => K().nodes;
  const owned = (m, id) => !!(m.upgrades && m.upgrades[id]);
  const ownedNodes = m => nodes().filter(n => owned(m, n.id));
  const available = m => Math.max(0, (m.karma || 0) - (m.spent || 0));

  // "good", "evil" or "neutral" for the karma stat of this life.
  function band(p) {
    const k = p.stats.karma, b = K().bands;
    return k >= b.good ? "good" : k <= b.evil ? "evil" : "neutral";
  }

  // Why a node cannot be bought right now, or null if it can.
  function blocked(m, id) {
    const n = def(id);
    if (!n) return "unknown";
    if (owned(m, id)) return "owned";
    for (const r of n.requires || []) if (!owned(m, r)) return "Needs " + def(r).name;
    for (const x of n.excludes || []) if (owned(m, x)) return "Excluded by " + def(x).name;
    if (available(m) < n.cost) return "Needs " + (n.cost - available(m)) + " more karma";
    return null;
  }

  function buy(id) {
    const m = meta();
    if (blocked(m, id)) return false;
    m.upgrades[id] = true;
    m.spent += def(id).cost;
    return true;
  }

  // Forget your vows. You get most of the karma back, but not all of it.
  function respec() {
    const m = meta();
    m.upgrades = {};
    m.spent = Math.round(m.spent * K().respecKeep);
  }

  // Bonus for a key (see items.js MOD_KEYS) from owned upgrades.
  function mod(p, key) {
    const m = meta();
    if (!m || !m.upgrades || !K()) return 0;
    const b = band(p);
    let sum = 0;
    for (const n of ownedNodes(m)) {
      if (n.always && n.always[key]) sum += n.always[key];
      if (n.mods && n.mods[key] && (n.branch === "trunk" || n.branch === b)) sum += n.mods[key];
    }
    return sum;
  }

  // Scales a change to the karma stat by upgrades such as "Dominion" (halves good karma gained).
  function flow(delta) {
    const m = meta();
    let mult = 1;
    for (const n of ownedNodes(m)) if (n.flow) mult *= delta > 0 ? (n.flow.gain === undefined ? 1 : n.flow.gain) : (n.flow.loss === undefined ? 1 : n.flow.loss);
    const x = Math.abs(delta) * mult;
    const whole = Math.floor(x);
    return Math.sign(delta) * (whole + (U.random() < x - whole ? 1 : 0)); // 0.5 becomes 0 or 1 at random, so small changes still happen
  }

  const heavenlyBonus = m => ownedNodes(m).reduce((s, n) => s + (n.start && n.start.heavenly || 0), 0);

  // Applied to a brand new life.
  function applyStart(p) {
    for (const n of ownedNodes(meta())) {
      const s = n.start;
      if (!s) continue;
      if (s.gold) p.gold += s.gold;
      if (s.intelligence) p.stats.intelligence = U.clamp(p.stats.intelligence + s.intelligence, 0, 100);
      if (s.health) p.stats.health = U.clamp(p.stats.health + s.health, 0, 100);
      if (s.lifespan) p.lifespan += s.lifespan;
      if (s.karma !== undefined) p.stats.karma = s.karma;
    }
  }

  // Clean up the meta object from old or imported saves.
  function fixMeta(m) {
    if (!(m.karma >= 0)) m.karma = 0;
    if (!(m.lives >= 0)) m.lives = 0;
    const up = {};
    if (m.upgrades && typeof m.upgrades === "object") Object.keys(m.upgrades).forEach(id => { if (def(id) && m.upgrades[id]) up[id] = true; });
    m.upgrades = up;
    m.spent = Object.keys(up).length || m.spent > 0 ? Math.min(Math.max(0, m.spent || 0), m.karma) : 0;
    return m;
  }

  G.karma = { def, nodes, owned, ownedNodes, available, band, blocked, buy, respec, mod, flow, heavenlyBonus, applyStart, fixMeta };
})();
