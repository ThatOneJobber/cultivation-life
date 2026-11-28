/* Entry point: start the game once the page has loaded. */
Game.ui.init();

// Make the game installable and playable offline. Needs http(s), so it does nothing when opened from a file.
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* offline support is optional */ });
}
