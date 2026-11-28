/* Everything that touches the page. Reads state, draws it, and forwards
   button presses to the engine. */
(function () {
  const G = (globalThis.Game = globalThis.Game || {});
  const D = G.data, S = G.state, E = G.engine, C = G.cond, I = G.items, T = G.tech, X = G.sects, F = G.family, K = G.karma, AC = G.achievements;
  const $ = id => document.getElementById(id);

  const BARS = [
    ["health", "Health", "#e0605e"],
    ["intelligence", "Intelligence", "#5aa9e6"],
    ["luck", "Luck", "#d4af37"],
    ["karma", "Karma", "#b48ee0"],
    ["qi", "Qi", "#3ddc97"]
  ];
  const prev = {};
  let deathShownFor = null; // the life object whose death screen has been shown
  let bagTab = "bag";

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function buildStats() {
    const box = $("stats");
    box.innerHTML = "";
    BARS.forEach(([k, label, color]) => {
      const r = el("div", "row");
      r.id = "row-" + k;
      r.innerHTML = "<span>" + label + '</span><div class="bar"><div class="fill" id="fill-' + k + '" style="background:' + color + '"></div></div><span class="val" id="val-' + k + '"></span>';
      box.appendChild(r);
    });
    const inv = el("div");
    inv.id = "inv";
    box.appendChild(inv);
  }

  function flash(k, v) {
    if (prev[k] !== undefined && prev[k] !== v) {
      const r = $("row-" + k);
      r.classList.remove("up", "down");
      void r.offsetWidth; // restart the animation
      r.classList.add(v > prev[k] ? "up" : "down");
    }
    prev[k] = v;
  }

  function render() {
    const p = S.p, m = S.meta;
    $("name").textContent = p.name;
    $("sub").textContent = "Age " + p.age + " / " + p.lifespan + " · " + realmLabel(p) + " · " + D.roots[p.root].name + " Root";
    auraFor(p);
    soundFor(p);
    $("meta").innerHTML = "Life #" + m.lives + "<br>Karma " + m.karma;

    // Bars show the effective value (equipment bonuses included).
    ["health", "intelligence", "luck", "karma"].forEach(k => {
      const v = C.value(p, k), bonus = v - p.stats[k];
      $("fill-" + k).style.width = v + "%";
      $("val-" + k).textContent = v;
      $("val-" + k).title = bonus ? "Base " + p.stats[k] + ", equipment " + (bonus > 0 ? "+" : "") + bonus : "";
      flash(k, v);
    });
    const need = D.realms[p.realm].need;
    $("fill-qi").style.width = (need == null ? 100 : Math.min(100, (p.qi / need) * 100)) + "%";
    $("val-qi").textContent = need == null ? "MAX" : p.qi + "/" + need;
    flash("qi", p.qi);

    const inv = $("inv");
    inv.innerHTML = "";
    const info = el("span");
    info.innerHTML = "Gold: <b>" + p.gold + "</b> · Sect: <b>" + esc(p.sect ? p.sect + " · " + X.rankName(p) : "None") + "</b>";
    inv.appendChild(info);
    const btns = el("span", "invbtns");
    const bagBtn = el("button", "", "🎒 Bag (" + I.total(p) + ")");
    bagBtn.onclick = () => openBag("bag");
    const artsBtn = el("button", "", "📜 Arts (" + T.equipped(p).length + "/" + T.slots(p) + ")");
    artsBtn.onclick = () => openBag("arts");
    btns.appendChild(bagBtn);
    btns.appendChild(artsBtn);
    if (p.sect) {
      const sectBtn = el("button", "", "🏯 Sect");
      sectBtn.onclick = () => openBag("sect");
      btns.appendChild(sectBtn);
    }
    const karmaBtn = el("button", "", "☯ Karma" + (K.available(S.meta) > 0 ? " (" + K.available(S.meta) + ")" : ""));
    karmaBtn.onclick = () => openBag("karma");
    btns.appendChild(karmaBtn);
    if (hasFamily(p)) {
      const famBtn = el("button", "", "👪 Family");
      famBtn.onclick = () => openBag("family");
      btns.appendChild(famBtn);
    }
    inv.appendChild(btns);

    const log = $("log");
    log.innerHTML = "";
    p.log.slice(-150).forEach(e => {
      const d = el("div", "entry " + e.cls);
      d.appendChild(el("span", "age", "Age " + e.age));
      d.appendChild(document.createTextNode(e.text));
      if (e.fx) d.appendChild(el("span", "fx", e.fx));
      log.appendChild(d);
    });
    log.scrollTop = log.scrollHeight;
    renderActions();
    // The engine knows nothing about the page, so the UI opens the death screen
    // the first time it draws a dead character (including after a reload or import).
    if (!p.alive && deathShownFor !== p) { deathShownFor = p; G.audio.play("death"); showDeath(); }
  }

  // The character's name glows in a colour that deepens with their realm.
  const AURA = ["#c9c9c9", "#9fe3c4", "#3ddc97", "#7fd7ff", "#6fa8ff", "#b48ee0", "#e58bd6", "#ff9d6b", "#ffcf5a", "#fff0a8", "#ffffff"];
  function auraFor(p) {
    const c = AURA[Math.min(p.realm, AURA.length - 1)], n = $("name");
    n.style.color = p.realm === 0 ? "var(--gold)" : c;
    n.style.textShadow = p.realm === 0 ? "none" : "0 0 " + (4 + p.realm * 2) + "px " + c;
  }

  // Play a sound for what just happened in the log (not for old entries after a reload).
  let soundLife = null, soundLen = 0;
  function soundFor(p) {
    if (soundLife !== p) { soundLife = p; soundLen = p.log.length; return; }
    const fresh = p.log.slice(soundLen);
    soundLen = p.log.length;
    if (!fresh.length) return;
    const has = f => fresh.some(f);
    G.audio.play(has(e => e.text.startsWith("BREAKTHROUGH")) ? "breakthrough" : has(e => e.text.startsWith("🏆")) ? "achievement" :
      has(e => /PROMOTED/.test(e.text)) ? "promote" : has(e => e.cls === "bad") ? "bad" : has(e => e.cls === "good") ? "good" : has(e => e.cls === "event") ? "event" : "");
  }

  // "Golden Core (Middle)": how far through the realm your qi is.
  function realmLabel(p) {
    const r = D.realms[p.realm];
    if (r.need == null) return r.name;
    const f = p.qi / r.need;
    return r.name + " (" + (f >= 1 ? "Peak" : f >= 2 / 3 ? "Late" : f >= 1 / 3 ? "Middle" : "Early") + ")";
  }

  function addBtn(parent, text, fn, cls, disabled) {
    const b = el("button", cls || "", text);
    if (disabled) b.disabled = true;
    else b.onclick = fn;
    parent.appendChild(b);
    return b;
  }

  const act = fn => () => { fn(); render(); };

  function renderActions() {
    const p = S.p, a = $("actions");
    a.innerHTML = "";
    if (!p.alive) {
      addBtn(a, "View Summary", showDeath);
      addBtn(a, "Reincarnate", () => reincarnate(), "primary");
      return;
    }
    if (p.pending) {
      const ev = E.eventById(p.pending);
      a.appendChild(el("div", "prompt", "What do you do?"));
      ev.choices.forEach((c, i) => addBtn(a, c.label, act(() => E.choose(i)), "choice", !C.testAll(p, c.if)));
      return;
    }
    if (E.isBreakthroughReady(p)) {
      const pill = E.bestPill(p);
      const risky = E.breakthroughIsRisky(p);
      addBtn(a, "⚡ Attempt Breakthrough (" + Math.round(E.breakChance(p) * 100) + "%)" + (pill ? " + pill" : "") + (risky ? " ⚠ low health, failure could be fatal" : ""), act(E.breakthrough), "gold");
    }
    const row = el("div", "btnrow");
    const noArt = !T.equipped(p).length;
    addBtn(row, p.duty ? "On sect duty" : p.meditated ? "Meditated" : noArt ? "🧘 No method" : "🧘 Meditate", act(E.meditate), "", p.meditated || p.age < 3 || noArt);
    addBtn(row, "🏔 Seclude 10 yrs", act(() => E.seclude(10)), "", !E.canSeclude(p));
    a.appendChild(row);
    if (p.sect) {
      const pr = X.promotion(p);
      addBtn(a, pr && pr.ready ? "🎖 Promotion trial available · " + pr.next.name : "📋 Sect Missions", () => openBag("sect"), pr && pr.ready ? "gold" : "");
    }
    if (p.children.length && p.age >= 30) addBtn(a, "👪 Retire and pass on the legacy", () => { if (confirm("Retire from the world? Your life ends here and one of your children continues the bloodline, with your best equipment as an heirloom.")) { E.retire(); render(); } });
    addBtn(a, "Age Up ▶", act(E.ageUp), "primary");
  }

  /* ---------- bag and market ---------- */
  function openBag(tab) {
    bagTab = tab || "bag";
    $("bag").classList.remove("hidden");
    renderBag();
  }
  function closeBag() { $("bag").classList.add("hidden"); }
  const bagAct = fn => () => { fn(); renderBag(); render(); };

  function itemRow(d, count, buttons) {
    const row = el("div", "irow");
    const info = el("div", "info");
    const nm = el("div", "nm", d.name);
    if (count > 1) nm.appendChild(el("i", "", "×" + count));
    info.appendChild(nm);
    info.appendChild(el("div", "ds", d.desc));
    row.appendChild(info);
    buttons.forEach(b => row.appendChild(b));
    return row;
  }
  function button(text, fn, disabled) {
    const b = el("button", "", text);
    if (disabled) b.disabled = true; else b.onclick = fn;
    return b;
  }

  function renderBag() {
    const p = S.p, card = $("bagCard");
    card.innerHTML = "";
    if (bagTab === "sect" && !p.sect) bagTab = "bag";
    if (bagTab === "family" && !hasFamily(p)) bagTab = "bag";
    const tabs = el("div", "tabs");
    [["bag", "🎒 Bag"], ["arts", "📜 Arts"], ["sect", "🏯 Sect"], ["family", "👪 Family"], ["karma", "☯ Karma"], ["feats", "🏆 Feats"], ["market", "🏮 Market"]].filter(t => (t[0] !== "sect" || p.sect) && (t[0] !== "family" || hasFamily(p))).forEach(([id, label]) => {
      const b = el("button", bagTab === id ? "active" : "", label);
      b.onclick = () => { bagTab = id; renderBag(); };
      tabs.appendChild(b);
    });
    const x = el("button", "close", "✕");
    x.onclick = closeBag;
    tabs.appendChild(x);
    card.appendChild(tabs);

    if (bagTab === "bag") {
      card.appendChild(el("h3", "", "Equipment"));
      I.SLOTS.forEach(slot => {
        const id = p.equip[slot], d = id && I.def(id);
        const row = el("div", "irow");
        row.appendChild(el("span", "slot", slot));
        const info = el("div", "info");
        info.appendChild(el("div", "nm", d ? d.name : "(empty)"));
        if (d) info.appendChild(el("div", "ds", d.desc));
        row.appendChild(info);
        if (d) row.appendChild(button("Remove", bagAct(() => E.unequipSlot(slot))));
        card.appendChild(row);
      });

      card.appendChild(el("h3", "", "Items"));
      // Worn gear is already shown under Equipment, so only list spares here.
      const owned = Object.keys(p.inv).map(I.def).filter(Boolean)
        .filter(d => !(d.type === "equipment" && p.equip[d.slot] === d.id && p.inv[d.id] === 1))
        .sort((a, b) => (a.type === b.type ? 0 : a.type === "consumable" ? -1 : 1));
      if (!owned.length) card.appendChild(el("div", "note", "Your bag is empty. Find items in events, or buy some at the market."));
      owned.forEach(d => {
        const btns = [];
        if (d.type === "consumable" && d.use) btns.push(button("Use", bagAct(() => E.useItem(d.id))));
        else if (d.type === "consumable") btns.push(el("span", "note", d.onBreakthrough ? "Auto" : "For events"));
        else {
          const worn = p.equip[d.slot] === d.id;
          btns.push(button(worn ? "Worn" : "Equip", bagAct(() => E.equipItem(d.id)), worn));
        }
        card.appendChild(itemRow(d, p.inv[d.id], btns));
      });
      const bonus = I.mod(p, "power");
      if (bonus) card.appendChild(el("div", "note", "Fighting power from equipment: +" + bonus));
    } else if (bagTab === "arts") {
      renderArts(card, p);
    } else if (bagTab === "sect") {
      renderSect(card, p);
    } else if (bagTab === "family") {
      renderFamily(card, p);
    } else if (bagTab === "karma") {
      renderKarma(card, p);
    } else if (bagTab === "feats") {
      renderFeats(card, p);
    } else {
      card.appendChild(el("div", "note", "Gold: " + p.gold + (p.pending ? " · Finish what you are doing before shopping." : "")));
      card.appendChild(el("h3", "", "Goods"));
      I.all().filter(d => d.price).sort((a, b) => a.price - b.price).forEach(d => {
        const owned = d.type === "equipment" && I.count(p, d.id) > 0;
        const locked = p.realm < (d.minRealm || 0);
        const label = owned ? "Owned" : locked ? "Locked" : "Buy · " + d.price + "g";
        const row = itemRow(d, 0, [button(label, bagAct(() => E.buyItem(d.id)), owned || !E.canBuy(p, d))]);
        if (locked) row.querySelector(".info").appendChild(el("div", "ds", "Requires the " + D.realms[d.minRealm].name + " realm"));
        card.appendChild(row);
      });
      card.appendChild(el("h3", "", "Manuals"));
      const cultivator = p.realm >= 1 || Object.keys(p.tech).length > 0;
      if (!cultivator) card.appendChild(el("div", "note", "Nobody sells cultivation manuals to a mortal. You would have to be introduced, or find one."));
      else card.appendChild(el("div", "note", "Only common manuals are sold. Better ones are found in the world, and the best ones choose who reads them."));
      T.all().filter(d => d.price && cultivator).sort((a, b) => a.price - b.price).forEach(d => {
        const locked = p.realm < (d.minRealm || 0);
        const label = T.known(p, d.id) ? "Known" : locked ? "Locked" : "Buy · " + d.price + "g";
        card.appendChild(artRow(p, d, button(label, bagAct(() => E.buyTechnique(d.id)), T.known(p, d.id) || locked || !E.canBuyTechnique(p, d)), false));
      });
    }
  }

  // One technique: name, level, effects at the current level, and practice progress.
  function artRow(p, d, btn, showProgress) {
    const known = T.known(p, d.id);
    const lv = known ? T.level(p, d.id) : 1;
    const row = el("div", "irow");
    const info = el("div", "info");
    const nm = el("div", "nm", d.name);
    const tags = (known ? " · " + T.levelName(lv) : "") + (d.element ? " · " + d.element : "");
    if (tags) nm.appendChild(el("i", "", tags));
    info.appendChild(nm);
    info.appendChild(el("div", "ds gr g" + d.grade, T.gradeName(d.id) + " grade · " + T.typeName(d.id) + " · " + d.sub + (d.chosen ? " · chooses its reader" : "")));
    info.appendChild(el("div", "ds", d.desc));
    let fx = I.modText(d.mods, known ? T.scale(p, d.id) : 1);
    if (d.element) fx += D.roots[p.root].name === d.element ? " (matches your root)" : " (weaker: not your root)";
    info.appendChild(el("div", "ds fxline", fx));
    if (!known && p.realm < (d.minRealm || 0)) info.appendChild(el("div", "ds", "Requires the " + D.realms[d.minRealm].name + " realm"));
    if (known && showProgress) {
      const steps = D.balance.techniques.masteryYears, years = p.tech[d.id] || 0;
      info.appendChild(el("div", "ds", steps[lv] !== undefined ? "Practice " + years + "/" + steps[lv] + " years to the next level" : "Mastered"));
    }
    row.appendChild(info);
    row.appendChild(btn);
    return row;
  }

  function renderArts(card, p) {
    const eq = T.equipped(p), slots = T.slots(p);
    card.appendChild(el("div", "note", "Equipped " + eq.length + " of " + slots + " slots. More slots open as your realm grows. Equipped arts are practiced every year and level up from Initiate to Master."));
    const known = Object.keys(p.tech).map(T.def).filter(Boolean)
      .sort((a, b) => (eq.includes(b.id) ? 1 : 0) - (eq.includes(a.id) ? 1 : 0));
    known.forEach(d => {
      const worn = eq.includes(d.id);
      const btn = worn ? button("Set aside", bagAct(() => E.unequipTechnique(d.id)))
        : button(eq.length >= slots ? "No slot" : "Equip", bagAct(() => E.equipTechnique(d.id)), eq.length >= slots);
      const row = artRow(p, d, btn, true);
      if (worn) row.classList.add("worn");
      card.appendChild(row);
    });
    card.appendChild(el("div", "note", known.length ? "Find more arts in sect pavilions and rare events, or buy common manuals at the Market." : "You know no arts. A mortal cannot cultivate without a manual. Someone may take an interest in you, or you may find one by chance."));
  }

  /* ---------- achievements ---------- */
  function renderFeats(card, p) {
    const m = S.meta, all = AC.all();
    card.appendChild(el("h3", "", "Achievements (" + AC.count(m) + "/" + all.length + ")"));
    card.appendChild(el("div", "note", "Each achievement is unlocked once and pays a little karma. Hidden ones reveal themselves when you earn them."));
    const cats = [];
    all.forEach(a => { if (!cats.includes(a.cat)) cats.push(a.cat); });
    cats.forEach(cat => {
      const list = all.filter(a => a.cat === cat);
      card.appendChild(el("h3", "", cat + " (" + list.filter(a => AC.unlocked(m, a.id)).length + "/" + list.length + ")"));
      list.forEach(a => {
        const got = AC.unlocked(m, a.id), row = el("div", "irow" + (got ? " worn" : "")), info = el("div", "info");
        const nm = el("div", "nm", got ? "🏆 " + a.name : a.hidden ? "???" : a.name);
        if (a.reward) nm.appendChild(el("i", "", " · +" + a.reward + " karma"));
        info.appendChild(nm);
        info.appendChild(el("div", "ds", got || !a.hidden ? a.desc : "A hidden achievement."));
        row.appendChild(info);
        card.appendChild(row);
      });
    });
  }

  /* ---------- karma tree ---------- */
  const BRANCH_INFO = {
    trunk: ["Roots of Fate", "Gifts from your past lives, always active."],
    good: ["Path of the Righteous", "Powers that work while your karma is 60 or higher. Cost: you must keep your hands clean."],
    evil: ["Path of the Wicked", "Powers that work while your karma is 40 or lower. Cost: fate turns against you."],
    neutral: ["Path of Balance", "Powers that work while your karma stays between 41 and 59. Cost: little fire in battle."]
  };
  const BAND_NAME = { good: "righteous", evil: "wicked", neutral: "balanced" };

  function renderKarma(card, p) {
    const m = S.meta, b = K.band(p);
    card.appendChild(el("h3", "", "Karma Tree"));
    card.appendChild(el("div", "note", "Karma you earn when you die can buy permanent upgrades. You may follow only one vow (righteous, wicked or balanced). A path's bonuses work only while your karma in this life matches it, and every path has a price. Right now your karma is " + p.stats.karma + " (" + BAND_NAME[b] + "). You have " + K.available(m) + " karma to spend (" + m.karma + " earned in total)."));
    ["trunk", "good", "evil", "neutral"].forEach(branch => {
      card.appendChild(el("h3", "", BRANCH_INFO[branch][0]));
      card.appendChild(el("div", "note", BRANCH_INFO[branch][1]));
      K.nodes().filter(n => n.branch === branch).forEach(n => {
        const row = el("div", "irow" + (K.owned(m, n.id) ? " worn" : "")), info = el("div", "info");
        const nm = el("div", "nm", n.name);
        nm.appendChild(el("i", "", " · " + n.cost + " karma"));
        info.appendChild(nm);
        info.appendChild(el("div", "ds", n.desc));
        const lines = [];
        if (n.start) lines.push("Each life: " + Object.keys(n.start).map(k => k === "karma" ? "start at karma " + n.start[k] : k === "heavenly" ? "+" + Math.round(n.start[k] * 100) + "% chance of a Heavenly root" : "+" + n.start[k] + " " + k).join(", "));
        if (n.mods) lines.push("While " + BAND_NAME[n.branch] + ": " + I.modText(n.mods));
        if (n.always) lines.push("Always: " + I.modText(n.always));
        if (n.flow) lines.push((n.flow.gain !== undefined ? "Karma gains x" + n.flow.gain : "") + (n.flow.gain !== undefined && n.flow.loss !== undefined ? ", " : "") + (n.flow.loss !== undefined ? "karma losses x" + n.flow.loss : ""));
        lines.forEach(t => info.appendChild(el("div", "ds fxline", t)));
        row.appendChild(info);
        const why = K.blocked(m, n.id);
        row.appendChild(button(K.owned(m, n.id) ? "Owned" : why ? "Locked" : "Buy", () => { K.buy(n.id); S.save(); render(); renderBag(); }, !!why));
        if (why && why !== "owned") info.appendChild(el("div", "ds", why));
        card.appendChild(row);
      });
    });
    if (Object.keys(m.upgrades).length) {
      const rb = button("Forget all vows (refund " + Math.round((1 - D.karma.respecKeep) * 100) + "%)", () => { if (confirm("Forget every upgrade? You get back " + Math.round((1 - D.karma.respecKeep) * 100) + "% of the karma you spent.")) { K.respec(); S.save(); render(); renderBag(); } });
      card.appendChild(rb);
    }
  }

  /* ---------- family ---------- */
  const hasFamily = p => !!p.partner || p.children.length > 0;

  function renderFamily(card, p) {
    card.appendChild(el("h3", "", "Partner"));
    const pt = p.partner;
    if (!pt) card.appendChild(el("div", "note", p.flags.widowed !== undefined ? "You are alone now. Someone new may cross your path." : "You have no partner."));
    else {
      const row = el("div", "irow"), info = el("div", "info");
      const nm = el("div", "nm", pt.name);
      nm.appendChild(el("i", "", pt.cultivator ? " · dao companion" : " · mortal"));
      info.appendChild(nm);
      info.appendChild(el("div", "ds", "Bond " + pt.bond + "/100 · age " + pt.age + (pt.cultivator ? "" : " (mortal lives to about " + pt.lifespan + ")")));
      const f = D.balance.family;
      info.appendChild(el("div", "ds fxline", pt.bond >= f.bondPerk ? "Their love brings you +" + f.perkLuck + " luck" + (pt.cultivator ? " and +" + Math.round(f.perkQi * 100) + "% qi" : "") : "Reach a bond of " + f.bondPerk + " for a bonus"));
      row.appendChild(info);
      card.appendChild(row);
    }
    card.appendChild(el("h3", "", "Children (" + p.children.length + "/" + D.balance.family.maxChildren + ")"));
    if (!p.children.length) card.appendChild(el("div", "note", "No children yet."));
    p.children.forEach(c => {
      const row = el("div", "irow"), info = el("div", "info");
      const nm = el("div", "nm", c.name);
      nm.appendChild(el("i", "", " · age " + (p.age - c.born)));
      info.appendChild(nm);
      info.appendChild(el("div", "ds", D.roots[c.root].name + " root · talent " + c.talent + "/100"));
      row.appendChild(info);
      card.appendChild(row);
    });
    card.appendChild(el("div", "note", "When you die, one of your children can carry on your bloodline. They inherit their root, a gift for the mind and luck from their talent, some of your gold and your best art. Teach and raise them well."));
  }

  /* ---------- sect ---------- */
  const RISK_LABEL = { low: "Low risk", medium: "Some risk", high: "Dangerous" };
  // Accepting a mission or trial takes a year, so close the window to show the result in the log.
  const takeSect = fn => () => { fn(); closeBag(); render(); };

  function renderSect(card, p) {
    const sect = X.current(p), rank = X.rankDef(p), pr = X.promotion(p), busy = !E.canSectAct(p);
    card.appendChild(el("h3", "", sect.name));
    card.appendChild(el("div", "note", sect.desc));
    const info = el("div", "irow");
    const left = el("div", "info");
    const nm = el("div", "nm", rank.name);
    nm.appendChild(el("i", "", "rank " + (X.rank(p) + 1) + "/" + sect.ranks.length));
    left.appendChild(nm);
    left.appendChild(el("div", "ds fxline", Object.keys(rank.mods).length ? I.modText(rank.mods) : "No rank bonuses yet"));
    left.appendChild(el("div", "ds", "Stipend: " + rank.stipend + " gold a year · Merit: " + p.merit));
    info.appendChild(left);
    card.appendChild(info);

    card.appendChild(el("h3", "", "Promotion"));
    if (!pr) card.appendChild(el("div", "note", "You hold the highest rank the sect can give."));
    else {
      const need = [];
      if (!pr.meritOk) need.push((pr.next.merit - p.merit) + " more merit");
      if (!pr.realmOk) need.push("the " + D.realms[pr.next.minRealm].name + " realm");
      const row = el("div", "irow");
      const left2 = el("div", "info");
      left2.appendChild(el("div", "nm", pr.next.name));
      left2.appendChild(el("div", "ds fxline", Object.keys(pr.next.mods).length ? I.modText(pr.next.mods) + " · " + pr.next.stipend + " gold a year" : pr.next.stipend + " gold a year"));
      left2.appendChild(el("div", "ds", pr.ready ? "Merit " + p.merit + "/" + pr.next.merit + ". The trial takes a year and failing hurts." : "Needs " + need.join(" and ") + " (merit " + p.merit + "/" + pr.next.merit + ")"));
      row.appendChild(left2);
      row.appendChild(button(pr.ready ? "Trial · " + Math.round(X.trialChance(p) * 100) + "%" : "Locked", takeSect(E.promotionTrial), !pr.ready || busy));
      card.appendChild(row);
    }

    card.appendChild(el("h3", "", "Mission board"));
    const board = X.board(p);
    if (!board.length) card.appendChild(el("div", "note", "No missions are posted for you right now."));
    card.appendChild(el("div", "note", "A mission takes a year. You still gain qi and your stipend, but no other event happens. The board changes every year." + (p.pending ? " Finish what you are doing first." : "")));
    board.forEach(m => {
      const row = el("div", "irow");
      const left3 = el("div", "info");
      const n = el("div", "nm", m.name);
      n.appendChild(el("i", "risk-" + m.risk, " · " + RISK_LABEL[m.risk]));
      left3.appendChild(n);
      left3.appendChild(el("div", "ds", m.desc));
      row.appendChild(left3);
      row.appendChild(button("Accept", takeSect(() => E.doMission(m.id)), busy));
      card.appendChild(row);
    });

    card.appendChild(el("h3", "", "Ranks"));
    sect.ranks.forEach((r, i) => {
      const row = el("div", "irow" + (i === X.rank(p) ? " worn" : ""));
      const l = el("div", "info");
      l.appendChild(el("div", "nm", (i + 1) + ". " + r.name));
      l.appendChild(el("div", "ds", (i ? "Merit " + r.merit + " · " + D.realms[r.minRealm].name + " · " : "") + r.stipend + " gold a year" + (Object.keys(r.mods).length ? " · " + I.modText(r.mods) : "")));
      row.appendChild(l);
      card.appendChild(row);
    });
  }

  /* ---------- death, saves ---------- */
  function showDeath() {
    closeBag();
    const p = S.p, hi = D.realms[p.highest].name;
    const cause = p.deathCause.charAt(0).toLowerCase() + p.deathCause.slice(1);
    const story = p.name + ", born with a " + D.roots[p.root].name + " root, " + (p.generation > 1 ? "of the bloodline's generation " + p.generation + ", " : "") + (p.sect ? "joined the " + p.sect + " and rose to " + X.rankName(p) : "wandered as a rogue cultivator") +
      ", reached the " + hi + " realm, and " + (p.retired ? "retired and passed the legacy on" : cause) + " at age " + p.age + ".";
    $("deathCard").innerHTML =
      "<h2>" + (p.retired ? "A Legacy Passed On" : "Your Life Has Ended") + "</h2>" +
      '<p class="big">' + esc(p.deathCause) + "</p><p>" + esc(story) + "</p>" +
      "<p>Age: " + p.age + " · Highest realm: " + esc(hi) + "<br>Events lived: " + p.eventCount +
      '<br>Karma earned: <b style="color:var(--gold)">+' + p.karmaGain + "</b> (total " + S.meta.karma + (G.karma.available(S.meta) ? ", " + G.karma.available(S.meta) + " to spend in the ☯ Karma tree" : "") + ")" +
        ((p.feats || []).length ? "<br>🏆 Achievements this life: " + p.feats.map(id => esc(AC.def(id).name)).join(", ") : "") + "</p>" +
      '<div class="btns" id="heirBtns"></div><div class="btns"><button class="primary" id="btnRe">' + (p.children.length ? "Reincarnate as a new soul" : "Reincarnate") + '</button><button id="btnClose">View Life Log</button></div>';
    const legacy = F.legacy(p);
    F.heirs(p).forEach(h => {
      const b = el("button", "gold", "Continue as " + h.name + " (" + h.rootName + ", talent " + h.talent + ")");
      b.onclick = () => reincarnate({ child: p.children[h.index], legacy });
      $("heirBtns").appendChild(b);
    });
    $("btnRe").onclick = () => reincarnate();
    $("btnClose").onclick = () => $("death").classList.add("hidden");
    $("death").classList.remove("hidden");
  }

  function reincarnate(heir) {
    $("death").classList.add("hidden");
    S.newLife(heir);
    render();
  }

  function download(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function wireFooter() {
    $("export").onclick = () => download("cultivation-life-save.json", S.exportSave());
    $("import").onclick = () => $("importFile").click();
    $("importFile").onchange = ev => {
      const f = ev.target.files[0];
      ev.target.value = "";
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (!confirm("Replace your current game with this save?")) return;
        const err = S.importSave(String(reader.result));
        if (err) { alert(err); return; }
        $("death").classList.add("hidden");
        closeBag();
        render();
      };
      reader.readAsText(f);
    };
    $("reset").onclick = () => {
      if (!confirm("Erase all progress, including karma, and start over?")) return;
      $("death").classList.add("hidden");
      closeBag();
      S.reset();
      render();
    };
    $("helpBtn").onclick = () => G.help.open();
    const ST = G.settings;
    const refresh = () => {
      $("soundBtn").textContent = "🔊 Sound: " + (ST.get("sound") ? "On" : "Off");
      $("musicBtn").textContent = "🎵 Music: " + (ST.get("music") ? "On" : "Off");
      $("textBtn").textContent = "Aa Text: " + ST.TEXT_SIZES[ST.get("textSize")];
    };
    $("soundBtn").onclick = () => { ST.set("sound", !ST.get("sound")); refresh(); G.audio.play("good"); };
    $("musicBtn").onclick = () => { ST.set("music", !ST.get("music")); refresh(); G.audio.syncMusic(); };
    $("textBtn").onclick = () => { ST.set("textSize", (ST.get("textSize") + 1) % ST.TEXT_SIZES.length); refresh(); };
    refresh();
    // Browsers only start audio after a tap, so the first tap also starts the music if it is on.
    document.addEventListener("click", ev => {
      if (!ev.target.closest || !ev.target.closest("button")) return;
      if (ev.target.closest("#soundBtn,#musicBtn")) return;
      G.audio.play("tap");
      if (ST.get("music")) G.audio.syncMusic();
    }, true);
    // "Install" appears when the browser says this page can be installed as an app.
    window.addEventListener("beforeinstallprompt", ev => {
      ev.preventDefault();
      $("installBtn").hidden = false;
      $("installBtn").onclick = () => { ev.prompt(); $("installBtn").hidden = true; };
    });
    $("bag").onclick = ev => { if (ev.target === $("bag")) closeBag(); }; // click outside to close
  }

  G.ui = {
    init() {
      buildStats();
      wireFooter();
      const fresh = !S.load();
      if (fresh) S.newLife();
      render();
      if (!G.settings.get("tutorialDone") && S.meta.lives <= 1 && S.p.age === 0) G.help.open();
    },
    render
  };
})();
