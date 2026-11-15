// Pure game engine: no DOM, no Three.js, no Math.random. Same seed + same actions = same result.
export const CFG = {
  days: 42, limit: 60, base: 1.2, flare: 25, sunDays: 14, cols: 5, rows: 3,
  cover: [1, 0.4, 0.12, 0.05], maxCover: 3, digNeed: 2, digCost: 10, baseCap: 40, credits: 700,
  mods: {
    hab:   { n: "Habitat", cost: 150, use: 8 },
    lab:   { n: "Lab", cost: 200, use: 6 },
    solar: { n: "Solar array", cost: 80, gen: 25 },
    batt:  { n: "Battery", cost: 60, cap: 60 },
  },
};
export function rng(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const isDay = (d) => Math.floor((d - 1) / CFG.sunDays) % 2 === 0;
export function newGame(seed) {
  const r = rng(seed), flares = [];
  for (let t = 0; flares.length < 3 && t < 500; t++) { const d = 6 + Math.floor(r() * 35); if (flares.every((f) => Math.abs(f - d) >= 8)) flares.push(d); }
  return { seed, day: 1, over: false, credits: CFG.credits, energy: 30, science: 0, nid: 1, mods: [], target: null, flares: flares.sort((a, b) => a - b),
    crew: ["Ada", "Ben", "Chen", "Dara"].map((name) => ({ name, loc: "out", dose: 0, health: 100 })), log: [] };
}
const find = (s, x, y) => s.mods.find((m) => m.x === x && m.y === y);
export const flareToday = (s) => s.flares.includes(s.day);
export const flareSoon = (s) => s.flares.includes(s.day + 1);
export const capacity = (s) => CFG.baseCap + CFG.mods.batt.cap * s.mods.filter((m) => m.type === "batt").length;
export function rate(s, c) { // mSv per day right now
  const m = c.loc === "out" ? null : s.mods.find((q) => q.id === c.loc);
  return CFG.base * (m ? CFG.cover[m.cover] : 1) * (flareToday(s) ? 1 + CFG.flare : 1);
}
export function act(s, a) {
  if (s.over) return { err: "GAME_OVER" };
  s = structuredClone(s);
  if (a.k === "build") {
    const d = CFG.mods[a.type];
    if (!d) return { err: "BAD_TYPE" };
    if (a.x < 0 || a.y < 0 || a.x >= CFG.cols || a.y >= CFG.rows) return { err: "OUT_OF_BOUNDS" };
    if (find(s, a.x, a.y)) return { err: "PAD_TAKEN" };
    if (s.credits < d.cost) return { err: "NOT_ENOUGH_CREDITS" };
    s.credits -= d.cost;
    const m = { id: s.nid++, type: a.type, x: a.x, y: a.y, cover: 0, prog: 0 };
    s.mods.push(m);
    if (a.type === "hab" && !s.mods.some((q) => q.type === "hab" && q !== m)) s.crew.forEach((c) => { if (c.loc === "out") c.loc = m.id; });
    return { s };
  }
  if (a.k === "target") { if (a.id !== null && !s.mods.some((m) => m.id === a.id)) return { err: "NO_MODULE" }; s.target = a.id; return { s }; }
  if (a.k === "loc") {
    const c = s.crew[a.i]; if (!c) return { err: "NO_CREW" };
    if (a.loc !== "out") { const m = s.mods.find((q) => q.id === a.loc); if (!m || (m.type !== "hab" && m.type !== "lab")) return { err: "NOT_HABITABLE" }; }
    c.loc = a.loc; return { s };
  }
  return { err: "UNKNOWN_ACTION" };
}
export function endDay(s) {
  if (s.over) return s; s = structuredClone(s);
  const sun = isDay(s.day), flare = flareToday(s), L = [];
  const gen = sun ? CFG.mods.solar.gen * s.mods.filter((m) => m.type === "solar").length : 0;
  const inside = (m) => s.crew.some((c) => c.health > 0 && c.loc === m.id);
  let e = s.energy + gen;
  e -= s.mods.filter((m) => m.type === "hab").length * CFG.mods.hab.use;
  const labs = s.mods.filter((m) => m.type === "lab" && inside(m));
  e -= labs.length * CFG.mods.lab.use;
  const powered = e >= 0; if (e < 0) { e = 0; L.push("Power failed. Crew froze, no science."); }
  const t = s.mods.find((m) => m.id === s.target);
  if (t && powered) for (const c of s.crew) if (c.health > 0 && c.loc === "out" && t.cover < CFG.maxCover && e >= CFG.digCost) {
    e -= CFG.digCost; t.prog++; if (t.prog >= CFG.digNeed) { t.cover++; t.prog = 0; L.push(`${CFG.mods[t.type].n} now has ${t.cover} regolith layer${t.cover > 1 ? "s" : ""}.`); }
  }
  if (powered) s.science += labs.length * 10;
  for (const c of s.crew) if (c.health > 0) {
    c.dose = Math.round((c.dose + rate(s, c)) * 100) / 100;
    if (!powered) c.health -= 8; if (c.dose > CFG.limit) c.health -= 12;
    c.health = Math.max(0, c.health);
    if (c.health === 0) L.push(`${c.name} died.`);
  }
  if (flare) L.push("Solar flare hit.");
  s.energy = Math.round(Math.min(capacity(s), e) * 100) / 100;
  s.log.unshift(`Day ${s.day}: ${L.join(" ") || (sun ? "Quiet day." : "Lunar night.")}`);
  if (s.crew.every((c) => c.health <= 0) || s.day >= CFG.days) s.over = true; else s.day++;
  return s;
}
export function score(s) {
  const alive = s.crew.filter((c) => c.health > 0), avg = s.crew.reduce((a, c) => a + c.dose, 0) / s.crew.length;
  const t = Math.round(Math.min(400, s.science) + alive.length * 100 + Math.max(0, 1 - avg / CFG.limit) * 200);
  return { t, alive: alive.length, avg: Math.round(avg * 10) / 10, rank: alive.length < 3 ? "Mission Lost" : t >= 750 ? "Regolith Master" : t >= 550 ? "Shelter Builder" : t >= 350 ? "Survivor" : "Lucky Landing" };
}
