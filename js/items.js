/* Inventory helpers: owning, equipping and the bonuses equipment gives.
   Item definitions live in data/items.json. No DOM access.

   A character has:
     p.inv   = { itemId: count }            everything owned
     p.equip = { weapon, armor, talisman, ring }  itemId currently worn in each slot
*/
(function () {
  const G = (globalThis.Game = globalThis.Game || {});

  const SLOTS = ["weapon", "armor", "talisman", "ring"];
  // Bonuses equipment can give (the "mods" of an item):
  //   power       added to fight chances        guard      fraction of damage ignored (max 0.6)
  //   regen       extra health healed per year  qiMult     extra fraction of qi gained
  //   breakBonus  added to breakthrough chance  luck, intelligence   added to those stats
  //   meditation  extra fraction of qi from meditating   safety  lower chance of meditation deviation
  //   vitality    slows the health decline of old age (fraction)
  // Equipment and equipped techniques both use these keys.
  const MOD_KEYS = ["power", "guard", "regen", "qiMult", "breakBonus", "luck", "intelligence", "meditation", "safety", "vitality"];
  const CAPS = { guard: 0.6, vitality: 0.8, safety: 0.1 };

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

  // Total bonus for a key from worn equipment, equipped techniques AND sect rank.
  function mod(p, key) {
    let sum = (G.tech ? G.tech.mod(p, key) : 0) + (G.sects ? G.sects.mod(p, key) : 0) + (G.family ? G.family.mod(p, key) : 0) + (G.karma ? G.karma.mod(p, key) : 0);
    for (const id of equippedIds(p)) {
      const d = def(id);
      if (d && d.mods && d.mods[key]) sum += d.mods[key];
    }
    return CAPS[key] !== undefined ? Math.min(sum, CAPS[key]) : sum;
  }

  // Human-readable bonuses, e.g. "+9 power, +12% qi".
  const r1 = n => Math.round(n * 10) / 10;
  const pct = n => Math.round(n * 100) + "%";
  const FMT = {
    power: n => "+" + Math.round(n) + " power",
    guard: n => pct(n) + " less damage",
    regen: n => "+" + r1(n) + " health a year",
    qiMult: n => "+" + pct(n) + " qi",
    breakBonus: n => "+" + pct(n) + " breakthrough chance",
    luck: n => "+" + Math.round(n) + " luck",
    intelligence: n => "+" + Math.round(n) + " intelligence",
    meditation: n => "+" + pct(n) + " qi from meditating",
    safety: n => pct(n) + " lower meditation risk",
    vitality: n => pct(n) + " slower old-age decline"
  };
  // Negative values (the price of some bonuses) read as penalties.
  const NEG = {
    power: n => "-" + Math.round(n) + " power",
    guard: n => pct(n) + " more damage taken",
    regen: n => "-" + r1(n) + " health a year",
    qiMult: n => "-" + pct(n) + " qi",
    breakBonus: n => "-" + pct(n) + " breakthrough chance",
    luck: n => "-" + Math.round(n) + " luck",
    intelligence: n => "-" + Math.round(n) + " intelligence",
    meditation: n => "-" + pct(n) + " qi from meditating",
    safety: n => pct(n) + " higher meditation risk",
    vitality: n => pct(n) + " faster old-age decline"
  };
  const modText = (mods, scale) => Object.keys(mods).map(k => { const v = mods[k] * (scale || 1); return v < 0 ? NEG[k](-v) : FMT[k](v); }).join(", ");

  G.items = { SLOTS, MOD_KEYS, def, count, total, add, mod, modText, equippedIds, all: () => G.data.items || [] };
})();
