/* The "How to play" guide. Shown once to new players and reopened with the ? Help button. */
(function () {
  const G = (globalThis.Game = globalThis.Game || {});
  const PAGES = [
    ["Welcome, cultivator", "You live a whole cultivator's life one year at a time. You will grow stronger, meet people, make hard choices and one day die. Nothing is permanent except what you carry into your next life: karma, your bloodline and your achievements. There is no ending to win, only how far each life goes."],
    ["Living a year", "<b>Age Up</b> moves one year forward and may bring an event with choices. <b>Meditate</b> (once a year) gains extra qi, with a small risk. <b>Seclude 10 yrs</b> skips ahead in quiet cultivation, stopping if something happens. Keep an eye on your <b>Health</b>: if it falls to 0, you die."],
    ["Breakthroughs", "Your <b>qi bar</b> fills as you cultivate. When it is full, <b>Attempt Breakthrough</b> to reach the next realm, which gives you more lifespan, power and art slots. Pills improve the odds. Failure hurts, so heal first if you are wounded."],
    ["Gear and arts", "Open <b>🎒 Bag</b> to use pills and equip a weapon, armor, talisman and ring. <b>📜 Arts</b> are techniques you practice and level up. You can equip only a few at a time. The <b>🏮 Market</b> sells common goods and arts for gold. Rarer treasures turn up in events."],
    ["People and places", "Many events can lead you into a <b>sect</b> with ranks, stipends and a mission board, or to a <b>partner and children</b> (👪 Family). Your children can carry on your bloodline when you die, or when you choose to retire."],
    ["After death", "When you die you earn <b>karma</b>. Spend it in the <b>☯ Karma</b> tree: pick one vow (righteous, wicked or balanced) and its bonuses work while your karma matches. <b>🏆 Feats</b> are permanent achievements that pay extra karma."],
    ["Tips", "Meditate most years and rest when health is low. Carry a few healing pills. Not every choice has a safe option. Your save lives in this browser, so use <b>Export Save</b> now and then to keep a backup. You can reopen this guide any time with <b>? Help</b>."]
  ];
  let page = 0;

  function render() {
    const card = document.getElementById("helpCard"), last = page === PAGES.length - 1;
    card.innerHTML = "<h2>" + PAGES[page][0] + "</h2><p>" + PAGES[page][1] + "</p>" +
      '<div class="dots">' + PAGES.map((_, i) => '<span class="' + (i === page ? "on" : "") + '"></span>').join("") + "</div>" +
      '<div class="btns"><button class="primary" id="helpNext">' + (last ? "Begin" : "Next") + "</button>" +
      (page > 0 ? '<button id="helpPrev">Back</button>' : "") + (last ? "" : '<button id="helpSkip">Skip</button>') + "</div>";
    document.getElementById("helpNext").onclick = () => (last ? close() : (page++, render()));
    const prev = document.getElementById("helpPrev"); if (prev) prev.onclick = () => { page--; render(); };
    const skip = document.getElementById("helpSkip"); if (skip) skip.onclick = close;
  }
  function open() { page = 0; document.getElementById("help").classList.remove("hidden"); render(); }
  function close() { document.getElementById("help").classList.add("hidden"); G.settings.set("tutorialDone", true); }

  G.help = { open, close, PAGES };
})();
