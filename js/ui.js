/* Everything that touches the page. Reads state, draws it, and forwards
   button presses to the engine. */
(function () {
  const G = (globalThis.Game = globalThis.Game || {});
  const D = G.data, S = G.state, E = G.engine, C = G.cond, I = G.items;
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
    $("sub").textContent = "Age " + p.age + " / " + p.lifespan + " · " + D.realms[p.realm].name + " · " + D.roots[p.root].name + " Root";
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
    inv.innerHTML = "<span>Gold: <b>" + p.gold + "</b></span><span>Sect: <b>" + esc(p.sect || "None") + "</b></span>";
    const bagBtn = el("button", "", "🎒 Bag (" + I.total(p) + ")");
    bagBtn.onclick = () => openBag("bag");
    inv.appendChild(bagBtn);

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
    if (!p.alive && deathShownFor !== p) { deathShownFor = p; showDeath(); }
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
      addBtn(a, "Reincarnate", reincarnate, "primary");
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
    addBtn(row, p.meditated ? "Meditated" : "🧘 Meditate", act(E.meditate), "", p.meditated || p.age < 3);
    addBtn(row, "🏔 Seclude 10 yrs", act(() => E.seclude(10)), "", !E.canSeclude(p));
    a.appendChild(row);
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
    const tabs = el("div", "tabs");
    [["bag", "🎒 Bag"], ["market", "🏮 Market"]].forEach(([id, label]) => {
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
    } else {
      card.appendChild(el("div", "note", "Gold: " + p.gold + (p.pending ? " · Finish what you are doing before shopping." : "")));
      I.all().filter(d => d.price).sort((a, b) => a.price - b.price).forEach(d => {
        const owned = d.type === "equipment" && I.count(p, d.id) > 0;
        const label = owned ? "Owned" : "Buy · " + d.price + "g";
        card.appendChild(itemRow(d, 0, [button(label, bagAct(() => E.buyItem(d.id)), owned || !E.canBuy(p, d))]));
      });
    }
  }

  /* ---------- death, saves ---------- */
  function showDeath() {
    closeBag();
    const p = S.p, hi = D.realms[p.highest].name;
    const cause = p.deathCause.charAt(0).toLowerCase() + p.deathCause.slice(1);
    const story = p.name + ", born with a " + D.roots[p.root].name + " root, " + (p.sect ? "joined the " + p.sect : "walked the path alone") +
      ", reached the " + hi + " realm, and " + (p.ascended ? "ascended to immortality" : cause) + " at age " + p.age + ".";
    $("deathCard").innerHTML =
      "<h2>" + (p.ascended ? "Ascension!" : "Your Life Has Ended") + "</h2>" +
      '<p class="big">' + esc(p.deathCause) + "</p><p>" + esc(story) + "</p>" +
      "<p>Age: " + p.age + " · Highest realm: " + esc(hi) + "<br>Events lived: " + p.eventCount +
      '<br>Karma earned: <b style="color:var(--gold)">+' + p.karmaGain + "</b> (total " + S.meta.karma + ")</p>" +
      '<div class="btns"><button class="primary" id="btnRe">Reincarnate</button><button id="btnClose">View Life Log</button></div>';
    $("btnRe").onclick = reincarnate;
    $("btnClose").onclick = () => $("death").classList.add("hidden");
    $("death").classList.remove("hidden");
  }

  function reincarnate() {
    $("death").classList.add("hidden");
    S.newLife();
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
    $("bag").onclick = ev => { if (ev.target === $("bag")) closeBag(); }; // click outside to close
  }

  G.ui = {
    init() {
      buildStats();
      wireFooter();
      if (!S.load()) S.newLife();
      render();
    },
    render
  };
})();
