/* Game state: the current life (`p`), progress that survives death (`meta`),
   the life log, and saving / loading. No DOM access here. */
(function () {
  const G = (globalThis.Game = globalThis.Game || {});
  const D = G.data, U = G.util;
  const KEY = "cultivation_life_v1";
  const hasStorage = () => { try { return typeof localStorage !== "undefined" && !!localStorage; } catch (e) { return false; } };

  const S = (G.state = { p: null, meta: { karma: 0, lives: 0, spent: 0, upgrades: {}, achievements: {} } });

  S.addLog = function (text, cls, fx) {
    S.p.log.push({ age: S.p.age, text, cls: cls || "", fx: fx || "" });
  };

  // `heir` (optional): { child, legacy } continues a bloodline. See Game.family.
  S.newLife = function (heir) {
    const meta = S.meta;
    meta.lives++;
    const heavenlyIdx = D.roots.length - 1;
    const heavenlyChance = 0.05 + Math.min(0.15, meta.karma / 1000) + G.karma.heavenlyBonus(meta);
    let root = U.random() < heavenlyChance ? heavenlyIdx : U.rand(0, heavenlyIdx - 1);
    if (heir) root = heir.child.root;
    const p = (S.p = {
      name: heir ? heir.child.name : U.pick(D.flavor.names),
      age: 0,
      lifespan: 60 + U.rand(0, 20) + Math.min(20, Math.floor(meta.karma / 20)),
      realm: 0, highest: 0, qi: 0, root,
      stats: {
        health: 80 + U.rand(0, 15),
        intelligence: 30 + U.rand(0, 40),
        luck: U.clamp(30 + U.rand(0, 40) + Math.min(20, Math.floor(meta.karma / 15)), 0, 100),
        karma: 50
      },
      gold: 10, inv: {}, equip: {}, tech: {}, techEquip: [], sect: null, sectRank: 0, merit: 0, board: null, partner: null, children: [], generation: heir ? heir.legacy.generation + 1 : 1, flags: {}, log: [],
      meditated: false, pending: null, alive: true,
      deathCause: null, retired: false, eventCount: 0
    });
    G.karma.applyStart(p);
    D.balance.techniques.starter.forEach(id => G.tech.learn(p, id));
    if (heir) inherit(p, heir);
    const r = D.roots[root].name;
    S.addLog("Born in a small mountain village, " + p.name + " opens their eyes. Spiritual root: " + r + (root === heavenlyIdx ? " (a legendary talent!)" : "") + ".", "sys");
    if (heir) S.addLog("You are the child of " + heir.legacy.parent + ", generation " + p.generation + " of your bloodline." + (p.inheritance ? " " + p.inheritance : ""), "sys");
    if (meta.karma > 0) S.addLog("Karma from past lives gently shapes your fate.", "sys");
    S.save();
    return p;
  };

  // What a child gets from the parent: talent for the mind and luck, some gold, and the parent's best art.
  function inherit(p, heir) {
    const h = D.balance.family.heir, t = heir.child.talent, bits = [];
    const gold = Math.min(h.goldCap, Math.floor(heir.legacy.gold * h.goldShare));
    p.gold += gold;
    p.stats.intelligence = U.clamp(p.stats.intelligence + Math.round(t * h.intelligencePerTalent), 0, 100);
    p.stats.luck = U.clamp(p.stats.luck + Math.round(t * h.luckPerTalent), 0, 100);
    if (gold) bits.push(gold + " gold");
    if (heir.legacy.art && G.tech.def(heir.legacy.art) && G.tech.learn(p, heir.legacy.art)) bits.push("the art " + G.tech.def(heir.legacy.art).name);
    if (heir.legacy.item && G.items.def(heir.legacy.item)) { G.items.add(p, heir.legacy.item, 1); G.items.def(heir.legacy.item).type === "equipment" && (p.equip[G.items.def(heir.legacy.item).slot] = heir.legacy.item); bits.push("the heirloom " + G.items.def(heir.legacy.item).name); }
    p.inheritance = bits.length ? "You inherit " + bits.join(" and ") + "." : "";
  }

  S.save = function () {
    if (S.p && G.achievements) G.achievements.check(S.p);
    if (!hasStorage()) return;
    try { localStorage.setItem(KEY, JSON.stringify({ p: S.p, meta: S.meta })); } catch (e) { /* storage full or blocked */ }
  };

  S.load = function () {
    if (!hasStorage()) return false;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!isValidSave(d)) return false;
      normalize(d.p);
      S.p = d.p; S.meta = G.achievements.fixMeta(G.karma.fixMeta(d.meta));
      return true;
    } catch (e) { return false; }
  };

  // Brings saves from older versions up to date (and drops items that no longer exist).
  function normalize(p) {
    if (!p.inv) {
      p.inv = {};
      if (p.pills) p.inv.breakthrough_pill = p.pills; // v0.2 saves had a plain pill counter
    }
    delete p.pills;
    if (!p.equip) p.equip = {};
    Object.keys(p.inv).forEach(id => { if (!G.items.def(id) || !(p.inv[id] > 0)) delete p.inv[id]; });
    G.items.SLOTS.forEach(s => { if (p.equip[s] && !p.inv[p.equip[s]]) p.equip[s] = null; });
    if (!p.tech) { // v0.3 saves had no techniques: give them the starter art(s)
      p.tech = {}; p.techEquip = [];
      D.balance.techniques.starter.forEach(id => G.tech.learn(p, id));
    }
    if (!p.techEquip) p.techEquip = [];
    Object.keys(p.tech).forEach(id => { if (!G.tech.def(id)) delete p.tech[id]; });
    p.techEquip = p.techEquip.filter(id => U.hasOwn(p.tech, id)).slice(0, G.tech.slots(p));
    if (!G.sects.def(p.sect)) p.sect = null; // v0.4 saves: sects had no ranks, so members start at the bottom
    if (!p.sect || !(p.sectRank >= 0)) p.sectRank = 0;
    if (p.sect) p.sectRank = Math.min(p.sectRank, G.sects.def(p.sect).ranks.length - 1);
    if (!p.sect || !(p.merit >= 0)) p.merit = 0;
    p.board = null;
    if (!p.children) p.children = []; // v0.5 saves had no family
    if (p.partner && typeof p.partner.bond !== "number") p.partner = null;
    if (!p.partner) p.partner = null;
    if (!(p.generation >= 1)) p.generation = 1;
  }

  function isValidSave(d) {
    return !!(d && d.p && d.meta && d.p.stats && typeof d.p.age === "number" &&
      typeof d.p.realm === "number" && Array.isArray(d.p.log) && D.realms[d.p.realm] && D.roots[d.p.root]);
  }

  // A save as text the player can keep in a file.
  S.exportSave = () => JSON.stringify({ game: "cultivation-life", version: 1, p: S.p, meta: S.meta }, null, 2);

  // Returns null on success, or an error message.
  S.importSave = function (text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { return "That file is not valid JSON."; }
    if (!isValidSave(d)) return "That file does not look like a Cultivation Life save.";
    normalize(d.p);
    S.p = d.p; S.meta = G.achievements.fixMeta(G.karma.fixMeta(d.meta));
    S.save();
    return null;
  };

  S.reset = function () {
    if (hasStorage()) { try { localStorage.removeItem(KEY); } catch (e) {} }
    S.meta = { karma: 0, lives: 0, spent: 0, upgrades: {}, achievements: {} };
    S.newLife();
  };
})();
