/* Player settings (sound, music, text size, tutorial seen). Stored apart from the save,
   so resetting the game keeps them. No game rules in here. */
(function () {
  const G = (globalThis.Game = globalThis.Game || {});
  const KEY = "cultivation_life_settings";
  const DEFAULTS = { sound: true, music: false, textSize: 0, tutorialDone: false };
  const s = Object.assign({}, DEFAULTS);

  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (d && typeof d === "object") for (const k of Object.keys(DEFAULTS)) if (typeof d[k] === typeof DEFAULTS[k]) s[k] = d[k];
  } catch (e) { /* storage blocked: defaults are fine */ }

  function save() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
  function applyTextSize() {
    if (typeof document === "undefined") return;
    document.documentElement.classList.remove("text-1", "text-2");
    if (s.textSize > 0) document.documentElement.classList.add("text-" + s.textSize);
  }
  function set(k, v) { s[k] = v; save(); if (k === "textSize") applyTextSize(); }

  applyTextSize();
  G.settings = { get: k => s[k], set, TEXT_SIZES: ["Normal", "Large", "Largest"] };
})();
