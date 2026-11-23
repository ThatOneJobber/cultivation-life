/* Everything that touches the page. Reads state, draws it, and forwards
   button presses to the engine. */
(function () {
  const G = (globalThis.Game = globalThis.Game || {});
  const D = G.data, S = G.state, E = G.engine, C = G.cond;
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

  function buildStats() {
    const box = $("stats");
    box.innerHTML = "";
    BARS.forEach(([k, label, color]) => {
      const r = document.createElement("div");
      r.className = "row"; r.id = "row-" + k;
      r.innerHTML = '<span>' + label + '</span><div class="bar"><div class="fill" id="fill-' + k + '" style="background:' + color + '"></div></div><span class="val" id="val-' + k + '"></span>';
      box.appendChild(r);
    });
    const inv = document.createElement("div");
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

    ["health", "intelligence", "luck", "karma"].forEach(k => {
      $("fill-" + k).style.width = p.stats[k] + "%";
      $("val-" + k).textContent = p.stats[k];
      flash(k, p.stats[k]);
    });
    const need = D.realms[p.realm].need;
    $("fill-qi").style.width = (need == null ? 100 : Math.min(100, (p.qi / need) * 100)) + "%";
    $("val-qi").textContent = need == null ? "MAX" : p.qi + "/" + need;
    flash("qi", p.qi);
    $("inv").innerHTML = "<span>Gold: <b>" + p.gold + "</b></span><span>Pills: <b>" + p.pills + "</b></span><span>Sect: <b>" + (p.sect || "None") + "</b></span>";

    const log = $("log");
    log.innerHTML = "";
    p.log.slice(-150).forEach(e => {
      const d = document.createElement("div");
      d.className = "entry " + e.cls;
      const a = document.createElement("span");
      a.className = "age"; a.textContent = "Age " + e.age;
      d.appendChild(a);
      d.appendChild(document.createTextNode(e.text));
      if (e.fx) {
        const f = document.createElement("span");
        f.className = "fx"; f.textContent = e.fx;
        d.appendChild(f);
      }
      log.appendChild(d);
    });
    log.scrollTop = log.scrollHeight;
    renderActions();
    // The engine knows nothing about the page, so the UI opens the death screen
    // the first time it draws a dead character (including after a reload or import).
    if (!p.alive && deathShownFor !== p) { deathShownFor = p; showDeath(); }
  }

  function addBtn(parent, text, fn, cls, disabled) {
    const b = document.createElement("button");
    b.textContent = text;
    b.className = cls || "";
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
      const h = document.createElement("div");
      h.className = "prompt"; h.textContent = "What do you do?";
      a.appendChild(h);
      ev.choices.forEach((c, i) => addBtn(a, c.label, act(() => E.choose(i)), "choice", !C.testAll(p, c.if)));
      return;
    }
    if (E.isBreakthroughReady(p)) addBtn(a, "⚡ Attempt Breakthrough (" + Math.round(E.breakChance(p) * 100) + "%)", act(E.breakthrough), "gold");
    const row = document.createElement("div");
    row.className = "btnrow";
    addBtn(row, p.meditated ? "Meditated" : "🧘 Meditate", act(E.meditate), "", p.meditated || p.age < 3);
    addBtn(row, "🏔 Seclude 10 yrs", act(() => E.seclude(10)), "", !E.canSeclude(p));
    a.appendChild(row);
    addBtn(a, "Age Up ▶", act(E.ageUp), "primary");
  }

  function showDeath() {
    const p = S.p, hi = D.realms[p.highest].name;
    const cause = p.deathCause.charAt(0).toLowerCase() + p.deathCause.slice(1);
    const story = p.name + ", born with a " + D.roots[p.root].name + " root, " + (p.sect ? "joined the " + p.sect : "walked the path alone") +
      ", reached the " + hi + " realm, and " + (p.ascended ? "ascended to immortality" : cause) + " at age " + p.age + ".";
    $("deathCard").innerHTML =
      "<h2>" + (p.ascended ? "Ascension!" : "Your Life Has Ended") + "</h2>" +
      '<p class="big">' + p.deathCause + "</p><p>" + story + "</p>" +
      "<p>Age: " + p.age + " · Highest realm: " + hi + "<br>Events lived: " + p.eventCount +
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
        render();
      };
      reader.readAsText(f);
    };
    $("reset").onclick = () => {
      if (!confirm("Erase all progress, including karma, and start over?")) return;
      $("death").classList.add("hidden");
      S.reset();
      render();
    };
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
