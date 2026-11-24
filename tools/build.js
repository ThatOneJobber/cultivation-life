#!/usr/bin/env node
/* Validates everything in data/ and bundles it into data/bundle.js.
   The browser loads bundle.js (a plain script), which is why the game works
   when you just double-click index.html.

   Usage:  node tools/build.js
   Run it after editing any file in data/. It exits with an error if the data is broken. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const errors = [];
const err = (where, msg) => errors.push(where + ": " + msg);

function readJson(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); }
  catch (e) { err(rel, "cannot read/parse JSON (" + e.message + ")"); return null; }
}

const realms = readJson("data/realms.json");
const roots = readJson("data/roots.json");
const flavor = readJson("data/flavor.json");
const items = readJson("data/items.json");
const balance = readJson("data/balance.json");
const techniques = readJson("data/techniques.json");
const sects = readJson("data/sects.json");
const missions = readJson("data/missions.json");
const eventFiles = fs.readdirSync(path.join(ROOT, "data/events")).filter(f => f.endsWith(".json")).sort();
const events = [];
const eventFileOf = {};
for (const f of eventFiles) {
  const list = readJson("data/events/" + f);
  if (!Array.isArray(list)) { if (list) err("data/events/" + f, "must contain an array of events"); continue; }
  for (const ev of list) { events.push(ev); eventFileOf[ev && ev.id] = f; }
}
if (errors.length) done();

/* Load the real helper modules so validation matches the game exactly. */
const ctx = vm.createContext({ console });
vm.runInContext("globalThis.Game = {}", ctx);
for (const f of ["js/util.js", "js/items.js", "js/conditions.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
const cond = ctx.Game.cond;
const SLOTS = ctx.Game.items.SLOTS;
const MOD_KEYS = ctx.Game.items.MOD_KEYS;
const rootNames = roots.map(r => r.name);
const sectNames = Array.isArray(sects) ? sects.map(s => s && s.name) : [];

/* ---------- validate realms / roots / flavor ---------- */
realms.forEach((r, i) => {
  const w = "data/realms.json[" + i + "]";
  if (typeof r.name !== "string") err(w, "needs a name");
  if (i < realms.length - 1 && !(r.need > 0)) err(w, "needs a positive \"need\" (qi to break through)");
  if (i === realms.length - 1 && r.need !== null) err(w, "the final realm must have \"need\": null");
  if (typeof r.life !== "number") err(w, "needs a numeric \"life\" bonus");
});
roots.forEach((r, i) => {
  if (typeof r.name !== "string" || typeof r.mult !== "number" || typeof r.brk !== "number") err("data/roots.json[" + i + "]", "needs name, mult, brk");
});
if (!Array.isArray(flavor.names) || !flavor.names.length) err("data/flavor.json", "needs a non-empty \"names\" array");
if (!Array.isArray(flavor.quiet) || !flavor.quiet.length) err("data/flavor.json", "needs a non-empty \"quiet\" array");

/* ---------- validate balance ---------- */
const BALANCE_PATHS = [
  "eventChance", "regen.min", "regen.max", "regen.perRealm", "oldAge.start", "oldAge.drainMin", "oldAge.drainMax",
  "seclusion.qiBonus", "seclusion.eventChance", "seclusion.stopBelowHealth",
  "meditation.riskChance", "meditation.riskDamageMin", "meditation.riskDamageMax",
  "breakthrough.base", "breakthrough.failDamageMin", "breakthrough.failDamageMax", "breakthrough.successHeal"
];
const getPath = (o, p) => p.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
for (const p of BALANCE_PATHS) if (!Number.isFinite(getPath(balance, p))) err("data/balance.json", "\"" + p + "\" must be a number");
for (const [a, b] of [["regen.min", "regen.max"], ["oldAge.drainMin", "oldAge.drainMax"], ["meditation.riskDamageMin", "meditation.riskDamageMax"], ["breakthrough.failDamageMin", "breakthrough.failDamageMax"]]) {
  if (getPath(balance, a) > getPath(balance, b)) err("data/balance.json", a + " is greater than " + b);
}
for (const p of ["eventChance", "seclusion.eventChance", "meditation.riskChance", "oldAge.start"]) {
  const v = getPath(balance, p);
  if (Number.isFinite(v) && (v < 0 || v > 1)) err("data/balance.json", "\"" + p + "\" must be between 0 and 1");
}

/* ---------- validate items ---------- */
const EFFECT_NUM = ["health", "intelligence", "luck", "karma", "qi", "gold", "lifespan"];
const USE_KEYS = ["health", "intelligence", "luck", "karma", "qi", "lifespan"];
const itemIds = [];

function checkUnknown(obj, allowed, where) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) err(where, "unknown key \"" + k + "\" (allowed: " + allowed.join(", ") + ")");
}
function checkValue(v, key, where) {
  if (typeof v === "number") return;
  if (Array.isArray(v)) { if (v.length !== 2 || !v.every(Number.isFinite) || v[0] > v[1]) err(where, key + ": a range must be [min, max]"); return; }
  if (v === "-all") return;
  if (v && typeof v === "object") { checkUnknown(v, ["base", "perRealm"], where + "." + key); return; }
  err(where, key + ": must be a number, [min,max], {base,perRealm}, or \"-all\"");
}

if (!Array.isArray(items)) err("data/items.json", "must be an array");
else items.forEach(it => {
  const w = "item \"" + (it && it.id) + "\" (data/items.json)";
  checkUnknown(it, ["id", "name", "type", "slot", "desc", "use", "onBreakthrough", "mods", "price"], w);
  if (typeof it.id !== "string" || !/^[a-z0-9_]+$/.test(it.id)) err(w, "\"id\" must be lowercase letters/numbers/underscores");
  else if (itemIds.includes(it.id)) err(w, "duplicate id");
  itemIds.push(it.id);
  if (typeof it.name !== "string" || !it.name) err(w, "needs a \"name\"");
  if (typeof it.desc !== "string" || !it.desc) err(w, "needs a \"desc\" (what the player reads)");
  if (it.price !== undefined && !(Number.isInteger(it.price) && it.price > 0)) err(w, "\"price\" must be a positive whole number (only items with a price appear in the market)");
  if (it.type === "consumable") {
    if (it.slot || it.mods) err(w, "consumables cannot have \"slot\" or \"mods\"");
    if (it.use !== undefined) {
      checkUnknown(it.use, USE_KEYS, w + " use");
      for (const k of USE_KEYS) if (it.use[k] !== undefined) checkValue(it.use[k], k, w);
    }
    if (it.onBreakthrough !== undefined && !(it.onBreakthrough > 0 && it.onBreakthrough <= 1)) err(w, "\"onBreakthrough\" must be between 0 and 1");
  } else if (it.type === "equipment") {
    if (!SLOTS.includes(it.slot)) err(w, "\"slot\" must be one of " + SLOTS.join(", "));
    if (it.use || it.onBreakthrough) err(w, "equipment cannot have \"use\" or \"onBreakthrough\"");
    if (!it.mods || typeof it.mods !== "object" || !Object.keys(it.mods).length) err(w, "equipment needs \"mods\"");
    else {
      checkUnknown(it.mods, MOD_KEYS, w + " mods");
      for (const k of Object.keys(it.mods)) if (typeof it.mods[k] !== "number") err(w, "mods." + k + " must be a number");
    }
  } else err(w, "\"type\" must be \"consumable\" or \"equipment\"");
});

/* ---------- validate techniques ---------- */
const techIds = [];
if (!Array.isArray(techniques)) err("data/techniques.json", "must be an array");
else techniques.forEach(t => {
  const w = "technique \"" + (t && t.id) + "\" (data/techniques.json)";
  checkUnknown(t, ["id", "name", "desc", "element", "mods", "price", "minRealm"], w);
  if (typeof t.id !== "string" || !/^[a-z0-9_]+$/.test(t.id)) err(w, "\"id\" must be lowercase letters/numbers/underscores");
  else if (techIds.includes(t.id)) err(w, "duplicate id");
  techIds.push(t.id);
  if (typeof t.name !== "string" || !t.name) err(w, "needs a \"name\"");
  if (typeof t.desc !== "string" || !t.desc) err(w, "needs a \"desc\"");
  if (t.element !== undefined && !rootNames.includes(t.element)) err(w, "\"element\" must be one of the spiritual roots: " + rootNames.join(", "));
  if (t.price !== undefined && !(Number.isInteger(t.price) && t.price > 0)) err(w, "\"price\" must be a positive whole number (only arts with a price are sold as manuals)");
  if (t.minRealm !== undefined && !(Number.isInteger(t.minRealm) && t.minRealm >= 0 && t.minRealm < realms.length)) err(w, "\"minRealm\" must be a valid realm index");
  if (!t.mods || typeof t.mods !== "object" || !Object.keys(t.mods).length) err(w, "needs \"mods\"");
  else {
    checkUnknown(t.mods, MOD_KEYS, w + " mods");
    for (const k of Object.keys(t.mods)) if (typeof t.mods[k] !== "number") err(w, "mods." + k + " must be a number");
  }
});

/* technique numbers in balance.json */
{
  const tc = balance.techniques, w = "data/balance.json techniques";
  if (!tc || typeof tc !== "object") err("data/balance.json", "needs a \"techniques\" section");
  else {
    if (!Array.isArray(tc.starter) || !tc.starter.every(id => techIds.includes(id))) err(w, "\"starter\" must list technique ids");
    const numArr = (k, len) => { if (!Array.isArray(tc[k]) || !tc[k].every(Number.isFinite)) { err(w, "\"" + k + "\" must be an array of numbers"); return false; } if (len !== undefined && tc[k].length !== len) { err(w, "\"" + k + "\" must have " + len + " entries"); return false; } return true; };
    numArr("slots", realms.length);
    if (numArr("masteryYears") && (tc.masteryYears[0] !== 0 || tc.masteryYears.some((v, i) => i && v <= tc.masteryYears[i - 1]))) err(w, "masteryYears must start at 0 and increase");
    if (numArr("levelMult", Array.isArray(tc.masteryYears) ? tc.masteryYears.length : undefined) === false) { /* reported */ }
    if (!Array.isArray(tc.levelNames) || !tc.levelNames.every(s => typeof s === "string") || (Array.isArray(tc.masteryYears) && tc.levelNames.length !== tc.masteryYears.length)) err(w, "\"levelNames\" needs one name per mastery level");
    for (const k of ["match", "mismatch"]) if (!tc.affinity || !Number.isFinite(tc.affinity[k])) err(w, "affinity." + k + " must be a number");
    for (const k of ["year", "meditate", "seclusion"]) if (!tc.practice || !Number.isFinite(tc.practice[k])) err(w, "practice." + k + " must be a number");
  }
}

/* ---------- validate events ---------- */
const EVENT_KEYS = ["id", "text", "minAge", "maxAge", "minRealm", "maxRealm", "weight", "once", "if", "choices"];
const CHOICE_KEYS = ["label", "if", "outcomes"];
const OUTCOME_KEYS = ["chance", "scale", "bonus", "if", "text", "effects"];
const EFFECT_KEYS = EFFECT_NUM.concat(["merit", "items", "learn", "setFlags", "sect", "leaveSect", "die"]);
const SCALE_KEYS = cond.NUM_NAMES;

const seenIds = new Set();
const setFlags = new Set();
const flagRefs = [];

function checkConds(list, where) {
  if (list === undefined) return;
  if (!Array.isArray(list)) return err(where, "\"if\" must be an array of strings");
  for (const c of list) {
    const e = cond.validate(c, rootNames, itemIds, techIds, sectNames);
    if (e) err(where, e);
    const flag = cond.referencedFlag(c);
    if (flag) flagRefs.push({ flag, where });
  }
}

/* The "effects" object of an outcome or a rank reward. */
function checkEffects(fx, ow) {
  if (!fx || typeof fx !== "object" || Array.isArray(fx)) return err(ow, "effects must be an object");
  checkUnknown(fx, EFFECT_KEYS, ow + " effects");
  for (const k of EFFECT_NUM.concat(["merit"])) if (fx[k] !== undefined) {
    checkValue(fx[k], k, ow);
    if (fx[k] === "-all" && !["gold", "qi"].includes(k)) err(ow, "\"-all\" only works for gold and qi");
  }
  if (fx.items !== undefined) {
    if (!fx.items || typeof fx.items !== "object" || Array.isArray(fx.items)) err(ow, "items must be an object like { \"healing_pill\": 2 }");
    else for (const id of Object.keys(fx.items)) {
      if (!itemIds.includes(id)) err(ow, "items: unknown item \"" + id + "\" (see data/items.json)");
      if (!Number.isInteger(fx.items[id]) || fx.items[id] === 0) err(ow, "items." + id + " must be a non-zero whole number (negative removes)");
    }
  }
  if (fx.learn !== undefined) {
    if (!Array.isArray(fx.learn) || !fx.learn.every(s => typeof s === "string")) err(ow, "learn must be an array of technique ids");
    else fx.learn.forEach(id => { if (!techIds.includes(id)) err(ow, "learn: unknown technique \"" + id + "\" (see data/techniques.json)"); });
  }
  if (fx.setFlags !== undefined) {
    if (!Array.isArray(fx.setFlags) || !fx.setFlags.every(s => typeof s === "string")) err(ow, "setFlags must be an array of strings");
    else fx.setFlags.forEach(f => setFlags.add(f));
  }
  if (fx.sect !== undefined && !sectNames.includes(fx.sect)) err(ow, "sect: unknown sect \"" + fx.sect + "\" (see data/sects.json)");
  if (fx.leaveSect !== undefined && fx.leaveSect !== true) err(ow, "leaveSect must be true");
  if (fx.die !== undefined && typeof fx.die !== "string") err(ow, "die must be a string (the cause of death)");
}

/* Outcomes are shared by events and missions. `cw` names where they live (for messages). */
function checkOutcomes(outcomes, cw) {
  outcomes.forEach((o, oi) => {
    const ow = cw + " outcome " + (oi + 1);
    checkUnknown(o, OUTCOME_KEYS, ow);
    if (o.chance !== undefined && !(o.chance >= 0 && o.chance <= 1)) err(ow, "\"chance\" must be between 0 and 1");
    if (o.scale !== undefined) {
      if (o.chance === undefined) err(ow, "\"scale\" needs a \"chance\" to scale");
      for (const k of Object.keys(o.scale || {})) {
        if (!SCALE_KEYS.includes(k)) err(ow, "scale: unknown name \"" + k + "\"");
        else if (typeof o.scale[k] !== "number") err(ow, "scale." + k + " must be a number");
      }
    }
    if (o.bonus !== undefined) {
      if (!Array.isArray(o.bonus)) err(ow, "\"bonus\" must be an array of {if, add}");
      else o.bonus.forEach(b => { checkUnknown(b, ["if", "add"], ow + " bonus"); checkConds(b.if, ow + " bonus"); if (typeof b.add !== "number") err(ow, "bonus needs a numeric \"add\""); });
    }
    checkConds(o.if, ow);
    if (typeof o.text !== "string" || !o.text) err(ow, "needs \"text\"");
    checkEffects(o.effects || {}, ow);
  });
  const last = outcomes[outcomes.length - 1];
  if (last.chance !== undefined || last.if !== undefined) err(cw, "the LAST outcome must be a fallback: no \"chance\" and no \"if\"");
}

for (const ev of events) {
  const w = "event \"" + (ev && ev.id) + "\" (" + eventFileOf[ev && ev.id] + ")";
  if (!ev || typeof ev !== "object") { err("events", "an entry is not an object"); continue; }
  checkUnknown(ev, EVENT_KEYS, w);
  if (typeof ev.id !== "string" || !/^[a-z0-9_]+$/.test(ev.id)) err(w, "\"id\" must be lowercase letters/numbers/underscores");
  else if (seenIds.has(ev.id)) err(w, "duplicate id");
  seenIds.add(ev.id);
  if (typeof ev.text !== "string" || !ev.text) err(w, "needs \"text\"");
  for (const k of ["minAge", "maxAge", "minRealm", "maxRealm", "weight"]) if (ev[k] !== undefined && typeof ev[k] !== "number") err(w, "\"" + k + "\" must be a number");
  if (ev.minAge !== undefined && ev.maxAge !== undefined && ev.minAge > ev.maxAge) err(w, "minAge is greater than maxAge");
  if (ev.minRealm !== undefined && ev.maxRealm !== undefined && ev.minRealm > ev.maxRealm) err(w, "minRealm is greater than maxRealm");
  for (const k of ["minRealm", "maxRealm"]) if (ev[k] !== undefined && (ev[k] < 0 || ev[k] >= realms.length)) err(w, k + " is not a valid realm index");
  checkConds(ev.if, w);

  if (!Array.isArray(ev.choices) || !ev.choices.length) { err(w, "needs at least one choice"); continue; }
  ev.choices.forEach((c, ci) => {
    const cw = w + " choice " + (ci + 1);
    checkUnknown(c, CHOICE_KEYS, cw);
    if (typeof c.label !== "string" || !c.label) err(cw, "needs a \"label\"");
    checkConds(c.if, cw);
    if (!Array.isArray(c.outcomes) || !c.outcomes.length) { err(cw, "needs at least one outcome"); return; }
    checkOutcomes(c.outcomes, cw);
  });
}

/* ---------- validate sects and missions ---------- */
const RISKS = ["low", "medium", "high"];
if (!Array.isArray(sects) || !sects.length) err("data/sects.json", "must be a non-empty array");
else sects.forEach(sc => {
  const w = "sect \"" + (sc && sc.name) + "\" (data/sects.json)";
  checkUnknown(sc, ["name", "alignment", "desc", "ranks"], w);
  if (typeof sc.name !== "string" || !sc.name || !/^[A-Za-z0-9 ]+$/.test(sc.name)) err(w, "\"name\" must use only letters, numbers and spaces (it is used in conditions)");
  if (sectNames.indexOf(sc.name) !== sectNames.lastIndexOf(sc.name)) err(w, "duplicate name");
  if (typeof sc.desc !== "string" || !sc.desc) err(w, "needs a \"desc\"");
  if (!["righteous", "demonic", "neutral"].includes(sc.alignment)) err(w, "\"alignment\" must be righteous, demonic or neutral");
  if (!Array.isArray(sc.ranks) || sc.ranks.length < 2) return err(w, "needs at least 2 ranks");
  sc.ranks.forEach((r, i) => {
    const rw = w + " rank " + (i + 1);
    checkUnknown(r, ["name", "merit", "minRealm", "stipend", "mods", "reward"], rw);
    if (typeof r.name !== "string" || !r.name) err(rw, "needs a \"name\"");
    if (!Number.isFinite(r.merit) || r.merit < 0) err(rw, "\"merit\" must be a number of 0 or more");
    else if (i === 0 && r.merit !== 0) err(rw, "the first rank must need 0 merit");
    else if (i > 0 && r.merit <= sc.ranks[i - 1].merit) err(rw, "merit must be higher than the previous rank");
    if (!Number.isInteger(r.minRealm) || r.minRealm < 0 || r.minRealm >= realms.length) err(rw, "\"minRealm\" must be a valid realm index");
    else if (i > 0 && r.minRealm < sc.ranks[i - 1].minRealm) err(rw, "minRealm must not go down as ranks rise");
    if (!Number.isFinite(r.stipend) || r.stipend < 0) err(rw, "\"stipend\" (gold a year) must be 0 or more");
    if (!r.mods || typeof r.mods !== "object") err(rw, "needs \"mods\" (use {} for none)");
    else {
      checkUnknown(r.mods, MOD_KEYS, rw + " mods");
      for (const k of Object.keys(r.mods)) if (typeof r.mods[k] !== "number") err(rw, "mods." + k + " must be a number");
    }
    if (r.reward !== undefined) {
      checkUnknown(r.reward, ["text", "effects"], rw + " reward");
      if (typeof r.reward.text !== "string" || !r.reward.text) err(rw, "reward needs \"text\"");
      checkEffects(r.reward.effects, rw + " reward");
    } else if (i > 0) err(rw, "ranks after the first need a \"reward\"");
  });
});

const missionIds = new Set();
if (!Array.isArray(missions)) err("data/missions.json", "must be an array");
else missions.forEach(m => {
  const w = "mission \"" + (m && m.id) + "\" (data/missions.json)";
  checkUnknown(m, ["id", "name", "desc", "risk", "sects", "minRank", "minRealm", "if", "weight", "outcomes"], w);
  if (typeof m.id !== "string" || !/^[a-z0-9_]+$/.test(m.id)) err(w, "\"id\" must be lowercase letters/numbers/underscores");
  else if (missionIds.has(m.id)) err(w, "duplicate id");
  missionIds.add(m.id);
  if (typeof m.name !== "string" || !m.name) err(w, "needs a \"name\"");
  if (typeof m.desc !== "string" || !m.desc) err(w, "needs a \"desc\"");
  if (!RISKS.includes(m.risk)) err(w, "\"risk\" must be one of " + RISKS.join(", "));
  if (m.sects !== undefined && (!Array.isArray(m.sects) || !m.sects.length || !m.sects.every(n => sectNames.includes(n)))) err(w, "\"sects\" must list sect names from data/sects.json");
  for (const k of ["minRank", "minRealm", "weight"]) if (m[k] !== undefined && typeof m[k] !== "number") err(w, "\"" + k + "\" must be a number");
  checkConds(m.if, w);
  if (!Array.isArray(m.outcomes) || !m.outcomes.length) err(w, "needs at least one outcome");
  else checkOutcomes(m.outcomes, w);
});
/* every sect needs missions it can be offered at every rank */
if (Array.isArray(sects) && Array.isArray(missions)) for (const sc of sects) {
  if (!Array.isArray(sc.ranks)) continue;
  sc.ranks.forEach((r, i) => {
    const n = missions.filter(m => (!m.sects || m.sects.includes(sc.name)) && (m.minRank || 0) <= i && (m.minRealm || 0) <= Math.max(r.minRealm, 0)).length;
    if (n < 2) err("data/missions.json", "sect \"" + sc.name + "\" has fewer than 2 missions available at rank " + (i + 1) + " (add more missions)");
  });
}
{
  const bs = balance.sect, w = "data/balance.json sect";
  if (!bs || typeof bs !== "object") err("data/balance.json", "needs a \"sect\" section");
  else {
    if (!Number.isInteger(bs.boardSize) || bs.boardSize < 1) err(w, "\"boardSize\" must be a whole number of 1 or more");
    for (const k of ["base", "intelligence", "power", "luck"]) if (!bs.trial || !Number.isFinite(bs.trial[k])) err(w, "trial." + k + " must be a number");
    for (const k of ["failHealthMin", "failHealthMax", "failMeritLoss"]) if (!Number.isFinite(bs[k])) err(w, "\"" + k + "\" must be a number");
    if (bs.failHealthMin > bs.failHealthMax) err(w, "failHealthMin is greater than failHealthMax");
  }
}

/* Flags: catch typos like flag:savedStanger. A flag is fine if some effect sets it,
   or it is the automatic "seen_<id>" flag of a one-time event. */
for (const { flag, where } of flagRefs) {
  const seenOf = flag.startsWith("seen_") && seenIds.has(flag.slice(5));
  if (!setFlags.has(flag) && !seenOf) err(where, "flag \"" + flag + "\" is checked but never set by any outcome (typo?)");
}

done();

function done() {
  if (errors.length) {
    console.error("\n✖ Data has " + errors.length + " problem" + (errors.length > 1 ? "s" : "") + ":\n");
    errors.forEach(e => console.error("  - " + e));
    console.error("\nbundle.js was NOT updated.");
    process.exit(1);
  }
  const data = { realms, roots, flavor, balance, items, techniques, sects, missions, events };
  const out = "/* AUTO-GENERATED by tools/build.js from the files in data/. Do not edit by hand. */\n" +
    "globalThis.Game = globalThis.Game || {};\nGame.data = " + JSON.stringify(data) + ";\n";
  fs.writeFileSync(path.join(ROOT, "data/bundle.js"), out);
  console.log("✔ Built data/bundle.js: " + events.length + " events from " + eventFiles.length + " files, " + items.length + " items, " + techniques.length + " techniques, " + sects.length + " sects, " + missions.length + " missions, " + realms.length + " realms, " + roots.length + " roots.");
}
