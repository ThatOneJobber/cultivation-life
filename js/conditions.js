/* Condition mini-language used by the JSON data files ("if": [...]).
   Every entry in an "if" list must be true.

   Examples:
     "luck>=25"              stat / number comparison
     "gold>=10"
     "ageRatio>0.7"          age divided by lifespan
     "flag:hasRival"         a story flag has been set
     "!flag:rivalDone"       ...or has not
     "since:master>=5"       years since that flag was set
     "sect"  /  "!sect"      is in any sect / is not
     "sect:Azure Cloud Sect" is in that specific sect
     "root:Fire"             spiritual root is Fire
     "item:antidote"         you own at least one Antidote
     "item:healing_pill>=3"  you own three or more Healing Pills
     "tech:blazing_palm"     you know the Blazing Palm technique
   Stat names (health, luck, ...) include equipment bonuses. "power" is the total
   fighting bonus from equipment.
*/
(function () {
  const G = (globalThis.Game = globalThis.Game || {});
  const U = G.util;

  const STAT_NAMES = ["health", "intelligence", "luck", "karma"];
  const NUM_NAMES = STAT_NAMES.concat(["gold", "qi", "power", "age", "realm", "lifespan", "ageRatio", "qiRatio"]);
  const RE = /^(!?)([A-Za-z]+)(?::([A-Za-z0-9_ ]+?))?\s*(?:(>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?))?$/;

  function parse(expr) {
    const m = RE.exec(String(expr).trim());
    if (!m) return null;
    return { neg: m[1] === "!", name: m[2], arg: m[3], op: m[4], num: m[5] === undefined ? undefined : parseFloat(m[5]) };
  }

  function compare(a, op, b) {
    switch (op) {
      case ">=": return a >= b;
      case "<=": return a <= b;
      case ">": return a > b;
      case "<": return a < b;
      case "==": return a === b;
      case "!=": return a !== b;
    }
    return !!a;
  }

  // Numeric value of a named quantity for the current player.
  function value(p, name) {
    if (STAT_NAMES.includes(name)) return U.clamp(p.stats[name] + G.items.mod(p, name), 0, 100);
    switch (name) {
      case "power": return G.items.mod(p, "power");
      case "gold": case "qi": case "age": case "realm": case "lifespan": return p[name];
      case "ageRatio": return p.age / p.lifespan;
      case "qiRatio": {
        const need = G.data.realms[p.realm].need;
        return need == null ? 1 : p.qi / need;
      }
    }
    throw new Error("Unknown condition name: " + name);
  }

  function test(p, expr) {
    const e = parse(expr);
    if (!e) throw new Error("Bad condition: " + expr);
    let r;
    switch (e.name) {
      case "flag": r = U.hasOwn(p.flags, e.arg); break;
      case "since": r = U.hasOwn(p.flags, e.arg) && compare(p.age - p.flags[e.arg], e.op, e.num); break;
      case "root": r = G.data.roots[p.root].name === e.arg; break;
      case "sect": r = e.arg ? p.sect === e.arg : !!p.sect; break;
      case "item": { const n = G.items.count(p, e.arg); r = e.op ? compare(n, e.op, e.num) : n > 0; break; }
      case "tech": r = G.tech.known(p, e.arg); break;
      default: r = e.op ? compare(value(p, e.name), e.op, e.num) : !!value(p, e.name);
    }
    return e.neg ? !r : r;
  }

  const testAll = (p, list) => !list || list.every(c => test(p, c));

  // Returns an error message, or null when the expression is valid.
  function validate(expr, rootNames, itemIds, techIds) {
    if (typeof expr !== "string") return "condition must be a string";
    const e = parse(expr);
    if (!e) return "cannot parse \"" + expr + "\"";
    switch (e.name) {
      case "flag": return e.arg ? null : "flag needs a name, e.g. flag:master";
      case "since": return e.arg && e.op && e.num !== undefined ? null : "since needs e.g. since:master>=5";
      case "root": return rootNames.includes(e.arg) ? null : "unknown root \"" + e.arg + "\"";
      case "sect": return null;
      case "item": return itemIds.includes(e.arg) ? null : "unknown item \"" + e.arg + "\" (see data/items.json)";
      case "tech": return techIds.includes(e.arg) ? null : "unknown technique \"" + e.arg + "\" (see data/techniques.json)";
      default:
        if (!NUM_NAMES.includes(e.name)) return "unknown name \"" + e.name + "\" in \"" + expr + "\"";
        if (e.arg) return "\"" + e.name + "\" does not take a :argument";
        return null;
    }
  }

  // Flag name referenced by an expression (flag: / since:), or null.
  function referencedFlag(expr) {
    const e = parse(expr);
    return e && (e.name === "flag" || e.name === "since") ? e.arg : null;
  }

  G.cond = { parse, test, testAll, value, validate, referencedFlag, NUM_NAMES, STAT_NAMES };
})();
