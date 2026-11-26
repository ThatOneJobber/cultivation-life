/* Achievements: permanent milestones, defined in data/achievements.json. No DOM access.
   They are checked after every action. Each unlocks once per save and pays a little karma.
   meta.achievements = { id: lifeNumberWhenUnlocked } */
(function () {
  const G = (globalThis.Game = globalThis.Game || {});
  const all = () => G.data.achievements || [];
  const def = id => all().find(a => a.id === id) || null;
  const unlocked = (m, id) => !!(m.achievements && m.achievements[id]);
  const count = m => all().filter(a => unlocked(m, a.id)).length;

  // Unlock anything newly earned by this life. Returns the achievements just unlocked.
  function check(p) {
    const m = G.state.meta, got = [];
    if (!m.achievements) m.achievements = {};
    for (const a of all()) {
      if (m.achievements[a.id]) continue;
      let ok = false;
      try { ok = G.cond.testAll(p, a.if); } catch (e) { ok = false; }
      if (!ok) continue;
      m.achievements[a.id] = m.lives || 1;
      m.karma += a.reward || 0;
      (p.feats = p.feats || []).push(a.id);
      G.state.addLog("🏆 Achievement: " + a.name + (a.reward ? " (+" + a.reward + " karma)" : ""), "good");
      got.push(a);
    }
    return got;
  }

  function fixMeta(m) {
    const ok = {};
    if (m.achievements && typeof m.achievements === "object") Object.keys(m.achievements).forEach(id => { if (def(id)) ok[id] = m.achievements[id]; });
    m.achievements = ok;
    return m;
  }

  G.achievements = { all, def, unlocked, count, check, fixMeta };
})();
