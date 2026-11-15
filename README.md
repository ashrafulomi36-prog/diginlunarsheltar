# Dig In: Lunar Shelter Builder
Build a Moon base, then decide what to bury under regolith. Burying cuts radiation but costs crew time and energy, and the Moon has a 14-day night. Each astronaut has a live radiation meter.

Run: `npm install && npm run dev` · Test: `npm test` · Build: `npm run build`

Deploy on Vercel: push to GitHub, then Add New → Project → import the repo. The Vite preset is detected (build `npm run build`, output `dist`). No environment variables needed.

`src/engine.js` is pure game logic (seeded, tested). `src/main.js` is the Three.js scene and UI. All numbers are game-scaled, not real mission values.
