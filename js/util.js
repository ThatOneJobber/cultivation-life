/* Small shared helpers. Everything lives under the global `Game` namespace so the
   game works when index.html is simply double-clicked (no module loader needed). */
(function () {
  const G = (globalThis.Game = globalThis.Game || {});
  const U = (G.util = {
    // Replaceable so tests can use a seeded generator.
    random: () => Math.random(),
    rand: (a, b) => Math.floor(U.random() * (b - a + 1)) + a,
    chance: x => U.random() < x,
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    pick: arr => arr[U.rand(0, arr.length - 1)],
    hasOwn: (o, k) => Object.prototype.hasOwnProperty.call(o, k)
  });
})();
