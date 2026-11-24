/* Techniques ("arts"): cultivation methods a character learns, equips in a limited
   number of slots, and slowly masters. Definitions live in data/techniques.json and the
   numbers (slots, mastery, affinity) in data/balance.json. No DOM access.

   A character has:
     p.tech      = { techId: practiceYears }   every art they know
     p.techEquip = [techId, ...]               arts currently equipped (limited by slots)

   Equipped arts add their "mods" (same keys as equipment) through Game.items.mod(). */
(function () {
  const G = (globalThis.Game = globalThis.Game || {});
  const U = G.util;
  const cfg = () => G.data.balance.techniques;

  let cache = null;
  function def(id) {
    if (!cache || cache.src !== G.data.techniques) {
      cache = { src: G.data.techniques, map: {} };
      (G.data.techniques || []).forEach(t => (cache.map[t.id] = t));
    }
    return cache.map[id] || null;
  }

  const all = () => G.data.techniques || [];
  const known = (p, id) => U.hasOwn(p.tech, id);
  const slots = p => cfg().slots[p.realm];
  const equipped = p => p.techEquip.filter(id => known(p, id));

  // Mastery level 1..3 from years practiced.
  function level(p, id) {
    const years = p.tech[id] || 0, steps = cfg().masteryYears;
    let lv = 1;
    for (let i = 1; i < steps.length; i++) if (years >= steps[i]) lv = i + 1;
    return lv;
  }
  const levelName = lv => cfg().levelNames[lv - 1];

  // Multiplier on an art's bonuses: mastery level x element affinity.
  function scale(p, id) {
    const d = def(id);
    let s = cfg().levelMult[level(p, id) - 1];
    if (d.element) s *= G.data.roots[p.root].name === d.element ? cfg().affinity.match : cfg().affinity.mismatch;
    return s;
  }

  // Total bonus for one modifier key from all equipped arts.
  function mod(p, key) {
    let sum = 0;
    for (const id of equipped(p)) {
      const d = def(id);
      if (d && d.mods && d.mods[key]) sum += d.mods[key] * scale(p, id);
    }
    return sum;
  }

  // Learn an art (equips it automatically if a slot is free). Returns false if already known.
  function learn(p, id) {
    if (!def(id) || known(p, id)) return false;
    p.tech[id] = 0;
    if (p.techEquip.length < slots(p)) p.techEquip.push(id);
    return true;
  }

  function equip(p, id) {
    if (!known(p, id) || p.techEquip.includes(id) || p.techEquip.length >= slots(p)) return false;
    p.techEquip.push(id);
    return true;
  }

  function unequip(p, id) {
    const i = p.techEquip.indexOf(id);
    if (i < 0) return false;
    p.techEquip.splice(i, 1);
    return true;
  }

  // Every equipped art gains practice. Returns the arts that just reached a new level.
  function practice(p, amount) {
    const ups = [];
    for (const id of equipped(p)) {
      const before = level(p, id);
      p.tech[id] += amount;
      const after = level(p, id);
      if (after > before) ups.push({ id, name: def(id).name, levelName: levelName(after) });
    }
    return ups;
  }

  G.tech = { def, all, known, slots, equipped, level, levelName, scale, mod, learn, equip, unequip, practice };
})();
