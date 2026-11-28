/* Sound effects and gentle generated music, made with the Web Audio API.
   No audio files, so nothing to download and nothing to license.
   Browsers only allow sound after a click, so the audio engine starts on the first one. */
(function () {
  const G = (globalThis.Game = globalThis.Game || {});
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  let ctx = null, master = null, musicTimer = null, musicBus = null;

  function ensure() {
    if (!AC) return false;
    if (!ctx) {
      try {
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      } catch (e) { ctx = null; return false; }
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return true;
  }

  const hz = (note) => 440 * Math.pow(2, (note - 69) / 12); // MIDI note to frequency

  // One soft note: type, midi note, start offset, length, volume.
  function tone(note, at, len, vol, type, dest) {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine"; o.frequency.value = typeof note === "number" && note > 0 && note < 200 ? hz(note) : note;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(dest || master);
    o.start(t); o.stop(t + len + 0.05);
  }
  // A bell: a sine plus a quieter, inharmonic overtone.
  function bell(note, at, len, vol) { tone(note, at, len, vol); tone(hz(note) * 2.76, at, len * 0.6, vol * 0.3); }

  const SOUNDS = {
    tap: () => tone(76, 0, 0.06, 0.04, "triangle"),
    good: () => { bell(76, 0, 0.5, 0.08); bell(83, 0.09, 0.6, 0.07); },
    bad: () => { tone(48, 0, 0.35, 0.09, "sawtooth"); tone(43, 0.08, 0.4, 0.07, "sawtooth"); },
    event: () => bell(69, 0, 0.5, 0.06),
    breakthrough: () => { [60, 64, 67, 72, 76].forEach((n, i) => bell(n, i * 0.1, 0.9, 0.09)); },
    achievement: () => { [79, 84, 88].forEach((n, i) => bell(n, i * 0.12, 1.1, 0.07)); },
    promote: () => { [67, 72, 76, 79].forEach((n, i) => bell(n, i * 0.13, 1.0, 0.08)); tone(48, 0, 0.9, 0.05, "triangle"); },
    death: () => { [64, 60, 55, 48].forEach((n, i) => tone(n, i * 0.3, 1.2, 0.07, "sine")); }
  };

  function play(name) {
    if (!G.settings.get("sound") || !SOUNDS[name] || !ensure()) return;
    try { SOUNDS[name](); } catch (e) { /* never let sound break the game */ }
  }

  // Music: a low drone and slow, sparse notes. Good karma plays brighter, wicked karma darker.
  const SCALES = { good: [62, 66, 69, 71, 74, 78], neutral: [62, 65, 67, 69, 72, 74], evil: [62, 63, 67, 68, 70, 74] };
  function startMusic() {
    if (musicTimer || !G.settings.get("music") || !ensure()) return;
    musicBus = ctx.createGain(); musicBus.gain.value = 0.35;
    const delay = ctx.createDelay(1.5), fb = ctx.createGain();
    delay.delayTime.value = 0.7; fb.gain.value = 0.45;
    musicBus.connect(master); musicBus.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(master);
    [38, 45].forEach(n => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = hz(n); g.gain.value = 0.05; o.connect(g); g.connect(musicBus); o.start(); o.__drone = true; musicBus.__oscs = (musicBus.__oscs || []).concat(o); });
    musicTimer = setInterval(() => {
      if (!ctx || document.hidden) return;
      const p = G.state && G.state.p, band = p ? G.karma.band(p) : "neutral", sc = SCALES[band];
      const note = sc[Math.floor(Math.random() * sc.length)] + (Math.random() < 0.3 ? 12 : 0);
      tone(note, 0, 3.5, 0.06, "sine", musicBus);
    }, 2600);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (musicBus) { (musicBus.__oscs || []).forEach(o => { try { o.stop(); } catch (e) { /* already stopped */ } }); try { musicBus.disconnect(); } catch (e) { /* ok */ } musicBus = null; }
  }
  function syncMusic() { if (G.settings.get("music")) startMusic(); else stopMusic(); }

  G.audio = { play, startMusic, stopMusic, syncMusic, supported: !!AC };
})();
