/* Game state: the current life (`p`), progress that survives death (`meta`),
   the life log, and saving / loading. No DOM access here. */
(function () {
  const G = (globalThis.Game = globalThis.Game || {});
  const D = G.data, U = G.util;
  const KEY = "cultivation_life_v1";
  const hasStorage = () => { try { return typeof localStorage !== "undefined" && !!localStorage; } catch (e) { return false; } };

  const S = (G.state = { p: null, meta: { karma: 0, lives: 0 } });

  S.addLog = function (text, cls, fx) {
    S.p.log.push({ age: S.p.age, text, cls: cls || "", fx: fx || "" });
  };

  S.newLife = function () {
    const meta = S.meta;
    meta.lives++;
    const heavenlyIdx = D.roots.length - 1;
    const heavenlyChance = 0.05 + Math.min(0.15, meta.karma / 1000);
    const root = U.random() < heavenlyChance ? heavenlyIdx : U.rand(0, heavenlyIdx - 1);
    const p = (S.p = {
      name: U.pick(D.flavor.names),
      age: 0,
      lifespan: 60 + U.rand(0, 20) + Math.min(20, Math.floor(meta.karma / 20)),
      realm: 0, highest: 0, qi: 0, root,
      stats: {
        health: 80 + U.rand(0, 15),
        intelligence: 30 + U.rand(0, 40),
        luck: U.clamp(30 + U.rand(0, 40) + Math.min(20, Math.floor(meta.karma / 15)), 0, 100),
        karma: 50
      },
      gold: 10, inv: {}, equip: {}, tech: {}, techEquip: [], sect: null, sectRank: 0, merit: 0, board: null, flags: {}, log: [],
      meditated: false, pending: null, alive: true, ascended: false,
      deathCause: null, eventCount: 0
    });
    D.balance.techniques.starter.forEach(id => G.tech.learn(p, id));
    const r = D.roots[root].name;
    S.addLog("Born in a small mountain village, " + p.name + " opens their eyes. Spiritual root: " + r + (root === heavenlyIdx ? " (a legendary talent!)" : "") + ".", "sys");
    if (meta.karma > 0) S.addLog("Karma from past lives gently shapes your fate.", "sys");
    S.save();
    return p;
  };

  S.save = function () {
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
      S.p = d.p; S.meta = d.meta;
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
    S.p = d.p; S.meta = d.meta;
    S.save();
    return null;
  };

  S.reset = function () {
    if (hasStorage()) { try { localStorage.removeItem(KEY); } catch (e) {} }
    S.meta = { karma: 0, lives: 0 };
    S.newLife();
  };
})();
