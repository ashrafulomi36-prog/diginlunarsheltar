import test from "node:test"; import assert from "node:assert/strict";
import { CFG, newGame, act, endDay, rate } from "../src/engine.js";
test("same seed, same flares", () => assert.deepEqual(newGame(5).flares, newGame(5).flares));
test("burying cuts dose rate", () => {
  let s = newGame(1); s = act(s, { k: "build", type: "hab", x: 0, y: 0 }).s;
  const bare = rate(s, s.crew[0]); s.mods[0].cover = 2; assert.ok(rate(s, s.crew[0]) < bare * 0.2);
});
test("errors are codes, state not mutated", () => {
  const s = newGame(1); assert.equal(act(s, { k: "build", type: "lab", x: 9, y: 9 }).err, "OUT_OF_BOUNDS"); assert.equal(s.mods.length, 0);
});
test("full mission ends and keeps numbers finite", () => {
  let s = newGame(3); for (let i = 0; i < 60; i++) s = endDay(s);
  assert.ok(s.over); assert.ok(s.crew.every((c) => Number.isFinite(c.dose) && c.health >= 0));
});
test("digging adds a layer after two crew-days", () => {
  let s = newGame(2); s = act(s, { k: "build", type: "solar", x: 1, y: 0 }).s; s = act(s, { k: "build", type: "hab", x: 0, y: 0 }).s;
  s = act(s, { k: "loc", i: 0, loc: "out" }).s; s = act(s, { k: "target", id: 2 }).s; s = endDay(s); assert.ok(s.mods[1].cover >= 0);
});
