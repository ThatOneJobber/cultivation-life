/* Family: a partner, children, and heirs who carry a bloodline into the next life.
   No DOM access.

   p.partner    { name, bond 0-100, age, lifespan, cultivator } or null
   p.children   [{ name, born (the parent's age), root, talent 1-100 }]
   p.generation 1 for a first life; each heir is one more
*/
(function () {
  const G = (globalThis.Game = globalThis.Game || {});
  const D = G.data, U = G.util;
  const F = () => D.balance.family;

  const hasPartner = p => !!p.partner;
  const bond = p => (p.partner ? p.partner.bond : 0);

  // A bonded partner helps a little. A cultivator partner also helps your cultivation.
  function mod(p, key) {
    const pt = p.partner;
    if (!pt || pt.bond < F().bondPerk) return 0;
    if (key === "luck") return F().perkLuck;
    if (key === "qiMult" && pt.cultivator) return F().perkQi;
    return 0;
  }

  function addPartner(p, kind) {
    const cult = kind === "cultivator", f = F();
    p.partner = {
      name: U.pick(D.flavor.partnerNames), bond: f.startBond, cultivator: cult,
      age: cult ? p.age : p.age + U.rand(-5, 5),
      lifespan: cult ? f.cultivatorLifespan : U.rand(f.mortalLifespanMin, f.mortalLifespanMax)
    };
    return p.partner;
  }

  function addChild(p) {
    if (p.children.length >= F().maxChildren) return null;
    const heavenly = D.roots.length - 1;
    // Half the time the child takes after you, otherwise a fresh roll.
    const root = U.random() < 0.5 ? p.root : (U.random() < 0.05 ? heavenly : U.rand(0, heavenly - 1));
    const child = { name: U.pick(D.flavor.childNames), born: p.age, root, talent: U.rand(20, 60) + (root === heavenly ? 20 : 0) };
    p.children.push(child);
    return child;
  }

  // The eldest child with room to grow benefits from training.
  function trainChild(p, n) {
    const c = p.children.slice().sort((a, b) => a.talent - b.talent)[0];
    if (!c) return null;
    c.talent = U.clamp(c.talent + n, 1, 100);
    return c;
  }

  // Once a year: a mortal partner grows old. Returns a message when they die.
  function yearly(p) {
    const pt = p.partner;
    if (!pt) return null;
    pt.age++;
    if (pt.age >= pt.lifespan) {
      p.partner = null;
      p.flags.widowed = p.age;
      p.stats.luck = U.clamp(p.stats.luck - (pt.bond >= 60 ? 3 : 1), 0, 100);
      return pt.name + " has passed away after " + (pt.cultivator ? "a long road together" : "a full life") + ".";
    }
    return null;
  }

  // Everything an heir could inherit from this life.
  function legacy(p) {
    let art = null, best = -1;
    Object.keys(p.tech).forEach(id => {
      if (D.balance.techniques.starter.includes(id)) return;
      const lv = G.tech.level(p, id);
      if (lv > best) { best = lv; art = id; }
    });
    // A parent who retires on their own hands down their finest piece of equipment too.
    let item = null, price = -1;
    if (p.retired) I_equipped(p).forEach(d => { const v = (d.price || 0) + (d.mods ? Object.values(d.mods).reduce((a, b) => a + Math.abs(b), 0) * 100 : 0); if (v > price) { price = v; item = d.id; } });
    return { parent: p.name, generation: p.generation || 1, gold: p.gold, art, item };
  }

  const I_equipped = p => G.items.equippedIds(p).map(G.items.def).filter(Boolean);

  function heirs(p) {
    return p.children.map((c, i) => ({ index: i, name: c.name, root: c.root, talent: c.talent, rootName: D.roots[c.root].name }));
  }

  G.family = { hasPartner, bond, mod, addPartner, addChild, trainChild, yearly, legacy, heirs };
})();
