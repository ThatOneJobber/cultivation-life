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
const eventFiles = fs.readdirSync(path.join(ROOT, "data/events")).filter(f => f.endsWith(".json")).sort();
const events = [];
const eventFileOf = {};
for (const f of eventFiles) {
  const list = readJson("data/events/" + f);
  if (!Array.isArray(list)) { if (list) err("data/events/" + f, "must contain an array of events"); continue; }
  for (const ev of list) { events.push(ev); eventFileOf[ev && ev.id] = f; }
}
if (errors.length) done();

/* Load the real condition parser so validation matches the game exactly. */
const ctx = vm.createContext({ console });
vm.runInContext("globalThis.Game = {}", ctx);
for (const f of ["js/util.js", "js/conditions.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
const cond = ctx.Game.cond;
const rootNames = roots.map(r => r.name);

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

/* ---------- validate events ---------- */
const EVENT_KEYS = ["id", "text", "minAge", "maxAge", "minRealm", "maxRealm", "weight", "once", "if", "choices"];
const CHOICE_KEYS = ["label", "if", "outcomes"];
const OUTCOME_KEYS = ["chance", "scale", "bonus", "if", "text", "effects"];
const EFFECT_NUM = ["health", "intelligence", "luck", "karma", "qi", "gold", "lifespan", "pills"];
const EFFECT_KEYS = EFFECT_NUM.concat(["setFlags", "sect", "die"]);
const SCALE_KEYS = cond.NUM_NAMES;

const seenIds = new Set();
const setFlags = new Set();
const flagRefs = [];

function checkUnknown(obj, allowed, where) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) err(where, "unknown key \"" + k + "\" (allowed: " + allowed.join(", ") + ")");
}
function checkConds(list, where) {
  if (list === undefined) return;
  if (!Array.isArray(list)) return err(where, "\"if\" must be an array of strings");
  for (const c of list) {
    const e = cond.validate(c, rootNames);
    if (e) err(where, e);
    const flag = cond.referencedFlag(c);
    if (flag) flagRefs.push({ flag, where });
  }
}
function checkValue(v, key, where) {
  if (typeof v === "number") return;
  if (Array.isArray(v)) { if (v.length !== 2 || !v.every(Number.isFinite) || v[0] > v[1]) err(where, key + ": a range must be [min, max]"); return; }
  if (v === "-all") return;
  if (v && typeof v === "object") { checkUnknown(v, ["base", "perRealm"], where + "." + key); return; }
  err(where, key + ": must be a number, [min,max], {base,perRealm}, or \"-all\"");
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
    c.outcomes.forEach((o, oi) => {
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
      const fx = o.effects || {};
      checkUnknown(fx, EFFECT_KEYS, ow + " effects");
      for (const k of EFFECT_NUM) if (fx[k] !== undefined) {
        checkValue(fx[k], k, ow);
        if (fx[k] === "-all" && !["gold", "qi", "pills"].includes(k)) err(ow, "\"-all\" only works for gold, qi and pills");
      }
      if (fx.setFlags !== undefined) {
        if (!Array.isArray(fx.setFlags) || !fx.setFlags.every(s => typeof s === "string")) err(ow, "setFlags must be an array of strings");
        else fx.setFlags.forEach(f => setFlags.add(f));
      }
      if (fx.sect !== undefined && typeof fx.sect !== "string") err(ow, "sect must be a string");
      if (fx.die !== undefined && typeof fx.die !== "string") err(ow, "die must be a string (the cause of death)");
    });
    const last = c.outcomes[c.outcomes.length - 1];
    if (last.chance !== undefined || last.if !== undefined) err(cw, "the LAST outcome must be a fallback: no \"chance\" and no \"if\"");
  });
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
  const data = { realms, roots, flavor, events };
  const out = "/* AUTO-GENERATED by tools/build.js from the files in data/. Do not edit by hand. */\n" +
    "globalThis.Game = globalThis.Game || {};\nGame.data = " + JSON.stringify(data) + ";\n";
  fs.writeFileSync(path.join(ROOT, "data/bundle.js"), out);
  console.log("✔ Built data/bundle.js: " + events.length + " events from " + eventFiles.length + " files, " + realms.length + " realms, " + roots.length + " roots.");
}
