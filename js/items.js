/* Inventory helpers: owning, equipping and the bonuses equipment gives.
   Item definitions live in data/items.json. No DOM access.

   A character has:
     p.inv   = { itemId: count }            everything owned
     p.equip = { weapon, armor, talisman }  itemId currently worn in each slot
*/
(function () {
  const G = (globalThis.Game = globalThis.Game || {});

  const SLOTS = ["weapon", "armor", "talisman"];
  // Bonuses equipment can give (the "mods" of an item):
  //   power       added to fight chances        guard      fraction of damage ignored (max 0.6)
  //   regen       extra health healed per year  qiMult     extra fraction of qi gained
  //   breakBonus  added to breakthrough chance  luck, intelligence   added to those stats
  const MOD_KEYS = ["power", "guard", "regen", "qiMult", "breakBonus", "luck", "intelligence"];
  const GUARD_CAP = 0.6;

  let cache = null;
  function def(id) {
    if (!cache || cache.src !== G.data.items) {
      cache = { src: G.data.items, map: {} };
      (G.data.items || []).forEach(i => (cache.map[i.id] = i));
    }
    return cache.map[id] || null;
  }

  const count = (p, id) => (p.inv && p.inv[id]) || 0;
  const total = p => Object.keys(p.inv).reduce((s, k) => s + p.inv[k], 0);

  // Change the amount of an item (never below 0). Returns the actual change.
  function add(p, id, n) {
    const before = count(p, id);
    const after = Math.max(0, before + n);
    if (after) p.inv[id] = after; else delete p.inv[id];
    if (!after) SLOTS.forEach(s => { if (p.equip[s] === id) p.equip[s] = null; });
    return after - before;
  }

  const equippedIds = p => SLOTS.map(s => p.equip[s]).filter(id => id && count(p, id) > 0);

  function mod(p, key) {
    let sum = 0;
    for (const id of equippedIds(p)) {
      const d = def(id);
      if (d && d.mods && d.mods[key]) sum += d.mods[key];
    }
    return key === "guard" ? Math.min(sum, GUARD_CAP) : sum;
  }

  G.items = { SLOTS, MOD_KEYS, def, count, total, add, mod, equippedIds, all: () => G.data.items || [] };
})();
