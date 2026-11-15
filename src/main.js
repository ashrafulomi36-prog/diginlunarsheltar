import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CFG, newGame, act, endDay, rate, isDay, flareToday, flareSoon, capacity, score } from "./engine.js";

const $ = (q) => document.querySelector(q);
const ERR = { PAD_TAKEN: "That pad already has a module.", NOT_ENOUGH_CREDITS: "Not enough credits.", NOT_HABITABLE: "Crew can only shelter in a Habitat or Lab.", GAME_OVER: "The mission is over.", OUT_OF_BOUNDS: "That pad is off the map." };
let S = newGame(Date.now() % 100000), type = "hab", pad = "0,0", xray = false, msg = "";
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- 3D scene ---------- */
const canvas = $("#c"), renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
cam.position.set(0, 16, 20);
const ctl = new OrbitControls(cam, canvas); ctl.maxPolarAngle = Math.PI * 0.48; ctl.enableDamping = !reduce; ctl.minDistance = 8; ctl.maxDistance = 45;
const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(-12, 14, 8); scene.add(sun, new THREE.AmbientLight(0x8890a8, 0.5));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120, 60, 60), new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 1, flatShading: true }));
ground.rotation.x = -Math.PI / 2;
{ const p = ground.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, (Math.sin(p.getX(i) * 0.7) * Math.cos(p.getY(i) * 0.5)) * 0.12 + Math.sin(i * 12.9898) * 0.04); ground.geometry.computeVertexNormals(); }
scene.add(ground);
const pos = (x, y) => new THREE.Vector3((x - (CFG.cols - 1) / 2) * 5, 0, (y - (CFG.rows - 1) / 2) * 5);
const padMeshes = [], padMat = new THREE.MeshStandardMaterial({ color: 0x4a4740 }), selMat = new THREE.MeshStandardMaterial({ color: 0xffb454 });
for (let y = 0; y < CFG.rows; y++) for (let x = 0; x < CFG.cols; x++) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(4, 0.08, 4), padMat); m.position.copy(pos(x, y)); m.position.y = 0.04; m.userData = { x, y }; scene.add(m); padMeshes.push(m);
}
const dyn = new THREE.Group(); scene.add(dyn);
const lmat = (c, o = 1) => new THREE.MeshStandardMaterial({ color: c, transparent: o < 1, opacity: o, roughness: 0.7 });
function modMesh(m) {
  const g = new THREE.Group(), o = xray ? 0.45 : 1;
  if (m.type === "hab") { const d = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 12, 0, 6.283, 0, 1.571), lmat(0xe8e8e8, o)); g.add(d); }
  if (m.type === "lab") { const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 2.6), lmat(0x6fa8dc, o)); b.position.y = 0.6; g.add(b); }
  if (m.type === "solar") { const p = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 1.8), lmat(0x1c2f66)); p.position.y = 1; p.rotation.x = -0.4; const s = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1), lmat(0x999999)); s.position.y = 0.5; g.add(p, s); }
  if (m.type === "batt") { const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.4), lmat(0x6fd3a0)); b.position.y = 0.45; g.add(b); }
  if (m.cover > 0) { const h = 0.55 * m.cover + 0.7; const mound = new THREE.Mesh(new THREE.SphereGeometry(2.2, 28, 14, 0, 6.283, 0, 1.571), lmat(0x8c857a, xray ? 0.3 : 1)); mound.scale.y = h / 2.2; g.add(mound); }
  if (m.id === S.target) { const r = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.5, 32), new THREE.MeshBasicMaterial({ color: 0xffb454, side: 2 })); r.rotation.x = -Math.PI / 2; r.position.y = 0.1; g.add(r); }
  g.position.copy(pos(m.x, m.y)); return g;
}
function meterSprite(frac, rateNow) {
  const c = document.createElement("canvas"); c.width = 128; c.height = 32; const x = c.getContext("2d");
  x.fillStyle = "#000b"; x.fillRect(0, 0, 128, 32); x.fillStyle = frac > 0.8 ? "#ff6b6b" : frac > 0.4 ? "#ffb454" : "#6fd3a0"; x.fillRect(4, 4, 120 * Math.min(1, frac), 24);
  x.fillStyle = "#fff"; x.font = "bold 16px sans-serif"; x.fillText(rateNow.toFixed(1) + "/d", 8, 22);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); sp.scale.set(2, 0.5, 1); return sp;
}
function syncScene() {
  dyn.clear();
  S.mods.forEach((m) => dyn.add(modMesh(m)));
  S.crew.forEach((c, i) => {
    if (c.health <= 0) return;
    const m = S.mods.find((q) => q.id === c.loc);
    if (m && !xray) return;
    const base = m ? pos(m.x, m.y) : (S.mods.find((q) => q.id === S.target) ? pos(...Object.values(S.mods.find((q) => q.id === S.target)).slice(2, 4)) : new THREE.Vector3(-14, 0, 8));
    const g = new THREE.Group(), body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 8), lmat(0xffffff));
    body.position.y = 0.5; g.add(body);
    const sp = meterSprite(c.dose / CFG.limit, rate(S, c)); sp.position.y = 1.5; g.add(sp);
    g.position.copy(base).add(new THREE.Vector3(m ? (i - 1.5) * 0.5 : 2.6 + i * 0.5, 0, m ? 0 : 1.4)); dyn.add(g);
  });
  padMeshes.forEach((p) => { p.material = `${p.userData.x},${p.userData.y}` === pad ? selMat : padMat; });
  const day = isDay(S.day); scene.background = new THREE.Color(day ? 0x1b2336 : 0x05060a); sun.intensity = day ? 2 : 0.15;
}
/* radiation particles: absorbed by regolith with probability 1 - shielding multiplier */
const N = 500, pp = new Float32Array(N * 3), geo = new THREE.BufferGeometry();
const respawn = (i) => { pp[i * 3] = (Math.random() - 0.5) * 30; pp[i * 3 + 1] = 14 + Math.random() * 6; pp[i * 3 + 2] = (Math.random() - 0.5) * 18; };
for (let i = 0; i < N; i++) { respawn(i); pp[i * 3 + 1] = Math.random() * 18; }
geo.setAttribute("position", new THREE.BufferAttribute(pp, 3));
scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xff7a3d, size: 0.22, transparent: true, opacity: 0.9 })));
function tickParticles(dt) {
  const n = flareToday(S) ? N : 140, spd = (flareToday(S) ? 16 : 7) * dt; geo.setDrawRange(0, n);
  for (let i = 0; i < n; i++) {
    const y0 = pp[i * 3 + 1]; pp[i * 3 + 1] -= spd;
    for (const m of S.mods) {
      const c = pos(m.x, m.y), h = m.cover ? 0.55 * m.cover + 0.7 : 1.4;
      if (Math.hypot(pp[i * 3] - c.x, pp[i * 3 + 2] - c.z) < 2 && y0 > h && pp[i * 3 + 1] <= h && Math.random() > CFG.cover[m.cover]) { pp[i * 3 + 1] = -1; break; }
    }
    if (pp[i * 3 + 1] < 0) respawn(i);
  }
  geo.attributes.position.needsUpdate = true;
}
function resize() { const r = canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); cam.aspect = r.width / r.height; cam.updateProjectionMatrix(); }
addEventListener("resize", resize);
let last = performance.now();
renderer.setAnimationLoop((t) => { const dt = Math.min(0.05, (t - last) / 1000); last = t; if (!reduce) tickParticles(dt); ctl.update(); renderer.render(scene, cam); });
const ray = new THREE.Raycaster();
let down = null; canvas.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
canvas.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  const r = canvas.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam);
  const hit = ray.intersectObjects(padMeshes)[0]; if (hit) { pad = `${hit.object.userData.x},${hit.object.userData.y}`; render(); }
});

/* ---------- UI ---------- */
function run(a) { const r = act(S, a); if (r.err) msg = ERR[r.err] || r.err; else { S = r.s; msg = ""; } render(); }
const lvl = (f) => (f > 0.8 ? "hi" : f > 0.4 ? "lo" : "");
function render() {
  const day = isDay(S.day), left = CFG.sunDays - ((S.day - 1) % CFG.sunDays);
  $("#top").innerHTML = `<span>Day ${S.day}/${CFG.days}</span><span>${day ? "☀ Sunlit" : "☾ Night"} (${left}d left)</span><span>Energy ${Math.round(S.energy)}/${capacity(S)}</span><span>Credits ${S.credits}</span><span>Science ${S.science}</span>`;
  const w = $("#warn"); w.style.display = !S.over && (flareToday(S) || flareSoon(S)) ? "block" : "none";
  w.textContent = flareToday(S) ? "⚠ Solar flare TODAY. Get everyone under cover now." : "⚠ Solar flare tomorrow. Move crew into a buried module.";
  const [px, py] = pad.split(",").map(Number), here = S.mods.find((m) => m.x === px && m.y === py);
  const habs = S.mods.filter((m) => m.type === "hab" || m.type === "lab"), nm = (m) => `${CFG.mods[m.type].n} (${"ABCDE"[m.x]}${m.y + 1}, ${m.cover} layers)`;
  if (S.over) { const sc = score(S); $("#ui").innerHTML = `<div class="card"><h2>${sc.rank}: ${sc.t} / 1000</h2><p>${sc.alive} of 4 crew alive. Average dose ${sc.avg} of ${CFG.limit} mSv limit. Science ${S.science}.</p>
   <p>${sc.avg > CFG.limit * 0.6 ? "Too much exposure. Bury habitats earlier and send crew to a buried module before each flare." : "Good shielding. Next time, add a lab under cover to earn more science."}</p>
   <p class="mute">Numbers are game-scaled, not real mission values. Real lunar surface radiation is far higher than on Earth and flares can be dangerous, which is why NASA plans for regolith-covered shelters.</p><button class="p" id="again">Play again</button></div>`;
   $("#again").onclick = () => { S = newGame(Date.now() % 100000); render(); }; syncScene(); return; }
  $("#ui").innerHTML = `
  <div class="card"><h2>Crew radiation (limit ${CFG.limit} mSv)</h2>${S.crew.map((c, i) => { const f = c.dose / CFG.limit, r = rate(S, c); return `<div class="crew">
   <div class="row"><b>${c.name}</b><span class="mute">health ${Math.round(c.health)}</span><span>${f > 0.8 ? "⚠ " : ""}${r.toFixed(1)} mSv/day now · ${c.dose.toFixed(1)} total</span></div>
   <div class="meter ${lvl(f)}" role="img" aria-label="${c.name} dose ${c.dose.toFixed(1)} of ${CFG.limit}"><i style="width:${Math.min(100, f * 100)}%"></i></div>
   <label class="row">Today: <select data-crew="${i}"><option value="out">Outside (dig, unshielded)</option>${habs.map((m) => `<option value="${m.id}" ${c.loc === m.id ? "selected" : ""}>${nm(m)}</option>`).join("")}</select></label></div>`; }).join("")}</div>
  <div class="card"><h2>Build</h2><div class="row" role="group" aria-label="Module type">${Object.entries(CFG.mods).map(([k, d]) => `<button data-type="${k}" aria-pressed="${type === k}">${d.n} ${d.cost}</button>`).join("")}</div>
   <div class="row" style="margin-top:8px"><label>Pad <select id="pad">${Array.from({ length: CFG.rows * CFG.cols }, (_, i) => { const x = i % CFG.cols, y = Math.floor(i / CFG.cols); return `<option value="${x},${y}" ${pad === `${x},${y}` ? "selected" : ""}>${"ABCDE"[x]}${y + 1}${S.mods.some((m) => m.x === x && m.y === y) ? " (used)" : ""}</option>`; }).join("")}</select></label>
   <button class="p" id="build">Build here</button></div></div>
  <div class="card"><h2>Bury it</h2>${here ? `<p>${nm(here)}: ${CFG.cover[here.cover] * 100}% of surface radiation gets through. ${here.cover < CFG.maxCover ? `Each layer needs ${CFG.digNeed} crew-days outside and ${CFG.digCost} energy per crew-day (${here.prog}/${CFG.digNeed} done).` : "Fully buried."}</p>
   <button id="tgt" aria-pressed="${S.target === here.id}">${S.target === here.id ? "Digging here" : "Dig here"}</button>` : `<p class="mute">Select a pad with a module. Crew set to Outside will dig the target.</p>`}</div>
  <div class="row"><button class="p" id="end">End day</button><button id="xr" aria-pressed="${xray}">X-ray view</button></div><p class="msg" role="alert">${msg}</p>
  <div class="card"><h2>Log</h2><ol class="log" aria-live="polite">${S.log.slice(0, 10).map((l) => `<li>${l}</li>`).join("")}</ol></div>
  <p class="mute"><small>Dig on sunlit days: solar stops at night. Game-scaled numbers.</small></p>`;
  document.querySelectorAll("[data-type]").forEach((b) => (b.onclick = () => { type = b.dataset.type; render(); }));
  $("#pad").onchange = (e) => { pad = e.target.value; render(); };
  $("#build").onclick = () => run({ k: "build", type, x: px, y: py });
  document.querySelectorAll("[data-crew]").forEach((s) => (s.onchange = () => run({ k: "loc", i: +s.dataset.crew, loc: s.value === "out" ? "out" : +s.value })));
  const t = $("#tgt"); if (t) t.onclick = () => run({ k: "target", id: S.target === here.id ? null : here.id });
  $("#end").onclick = () => { S = endDay(S); msg = ""; render(); };
  $("#xr").onclick = () => { xray = !xray; render(); };
  syncScene();
}
resize(); render();
