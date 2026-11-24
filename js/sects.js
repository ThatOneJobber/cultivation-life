/* Sects: membership, ranks, merit, stipends and promotion rules. No DOM access.
   Sect definitions live in data/sects.json, missions in data/missions.json.

   A character has:
     p.sect      name of the sect, or null
     p.sectRank  index into the sect's ranks (0 = lowest)
     p.merit     merit earned with the sect (spent on nothing, only measures standing)
     p.board     { age, ids } the mission board offered this year
*/
(function () {
  const G = (globalThis.Game = globalThis.Game || {});
  const U = G.util;

  let cache = null;
  function map() {
    if (!cache || cache.src !== G.data.sects) {
      cache = { src: G.data.sects, map: {} };
      (G.data.sects || []).forEach(s => (cache.map[s.name] = s));
    }
    return cache.map;
  }
  const def = name => (name && map()[name]) || null;
  const all = () => G.data.sects || [];
  const names = () => all().map(s => s.name);

  const current = p => def(p.sect);
  const rank = p => (current(p) ? p.sectRank || 0 : 0);
  const rankDef = p => { const s = current(p); return s ? s.ranks[rank(p)] : null; };
  const rankName = p => { const r = rankDef(p); return r ? r.name : null; };
  const nextRank = p => { const s = current(p); return s && s.ranks[rank(p) + 1] || null; };

  // Joining (or switching) always starts at the bottom.
  function join(p, name) {
    p.sect = name; p.sectRank = 0; p.merit = 0; p.board = null;
  }
  function leave(p) {
    p.sect = null; p.sectRank = 0; p.merit = 0; p.board = null;
  }

  // Bonuses from the current rank, using the same keys as equipment (see items.js).
  function mod(p, key) {
    const r = rankDef(p);
    return r && r.mods && r.mods[key] || 0;
  }

  const stipend = p => { const r = rankDef(p); return r ? r.stipend || 0 : 0; };

  // What is needed for the next promotion: { next, meritOk, realmOk, ready }
  function promotion(p) {
    const next = nextRank(p);
    if (!next) return null;
    const meritOk = (p.merit || 0) >= next.merit, realmOk = p.realm >= next.minRealm;
    return { next, meritOk, realmOk, ready: meritOk && realmOk };
  }

  // Chance of passing the promotion trial.
  function trialChance(p) {
    const t = G.data.balance.sect.trial, C = G.cond;
    const c = t.base + C.value(p, "intelligence") * t.intelligence + C.value(p, "power") * t.power + C.value(p, "luck") * t.luck;
    return U.clamp(c, 0.05, 0.95);
  }

  // Missions this character could be offered right now.
  function eligibleMissions(p) {
    return (G.data.missions || []).filter(m =>
      (!m.sects || m.sects.includes(p.sect)) &&
      rank(p) >= (m.minRank || 0) && p.realm >= (m.minRealm || 0) && G.cond.testAll(p, m.if));
  }

  const missionById = id => (G.data.missions || []).find(m => m.id === id) || null;

  // The board for this age: a few weighted random missions, kept for the whole year.
  function board(p) {
    if (!current(p)) return [];
    if (!p.board || p.board.age !== p.age) {
      const pool = eligibleMissions(p), ids = [];
      const size = Math.min(G.data.balance.sect.boardSize, pool.length);
      while (ids.length < size) {
        let r = U.random() * pool.reduce((s, m) => s + (m.weight || 1), 0), pick = pool[pool.length - 1];
        for (const m of pool) { r -= m.weight || 1; if (r <= 0) { pick = m; break; } }
        ids.push(pick.id);
        pool.splice(pool.indexOf(pick), 1);
      }
      p.board = { age: p.age, ids };
    }
    return p.board.ids.map(missionById).filter(Boolean);
  }

  G.sects = { def, all, names, current, rank, rankDef, rankName, nextRank, join, leave, mod, stipend, promotion, trialChance, eligibleMissions, missionById, board };
})();
