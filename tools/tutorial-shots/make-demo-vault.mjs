// Writes test/demo-vault.json: a made-up vault for the tutorial pictures (same shape as test/vault.json).
// Nothing here comes from a real vault. Run: node tools/tutorial-shots/make-demo-vault.mjs
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { excerptOf } from '../../src/data.js';

const DAY = 86400000;
const NOW = Date.now();
// [path, made (days ago), edited (days ago), body]
const NOTES = [
  ['Home.md', 140, 0, `Welcome back. My projects:
- [[Garden Planner - Overview|Garden Planner]]
- [[Recipes - Overview|Recipes]]
- [[Reading List - Overview|Reading List]]
- [[Study Notes - Overview|Study Notes]]
- [[Space Game - Overview|Space Game]]
- [[Travel 2026 - Overview|Travel 2026]]
New stuff lands in [[Inbox]] first. #home`],
  ['Inbox.md', 130, 1, `Things to sort later: a boss idea for [[Space Game - Ideas]], buy compost, ask about the train pass.`],
  ['Shopping list.md', 9, 2, `Milk, eggs, basil, rice, dish soap, AA batteries.`],
  ['Quotes I like.md', 70, 30, `"The best time to plant a tree was twenty years ago. The second best time is now."`],

  // Garden Planner
  ['Projects/Garden Planner/Garden Planner - Overview.md', 120, 1, `Planning the back garden: four raised beds, herbs by the door.
See [[Bed layout]], [[Planting calendar]], [[Tomatoes]], [[Seeds to buy]], [[Pests and fixes]] and [[Watering schedule]]. #garden`],
  ['Projects/Garden Planner/Bed layout.md', 118, 12, `Bed 1 tomatoes and basil, bed 2 beans, bed 3 lettuce and radish, bed 4 strawberries. Timing is in [[Planting calendar]].`],
  ['Projects/Garden Planner/Planting calendar.md', 117, 4, `March: sow tomatoes indoors. May: plant out after the last frost. Buy from [[Seeds to buy]]. Notes on [[Tomatoes]].`],
  ['Projects/Garden Planner/Tomatoes.md', 110, 3, `Three kinds this year: cherry, roma and beefsteak. Watch for blight ([[Pests and fixes]]). Extras go into [[Tomato sauce]]. #garden #tomatoes`],
  ['Projects/Garden Planner/Seeds to buy.md', 100, 6, `Cherry tomato, roma, dwarf beans, butterhead lettuce, Genovese basil.`],
  ['Projects/Garden Planner/Pests and fixes.md', 95, 15, `Slugs: copper tape. Aphids: soapy water. Blight: remove leaves early and water the soil, not the plant.`],
  ['Projects/Garden Planner/Watering schedule.md', 90, 8, `Every second morning, daily in a heatwave. Drip line on beds 1 and 2.`],
  ['Projects/Garden Planner/Work log/Garden Planner work log - 2026-10-12 - raised beds.md', 5, 5, `Built the last two raised beds and filled them with compost. Updated [[Bed layout]].`],
  ['Projects/Garden Planner/Work log/Garden Planner work log - 2026-10-16 - autumn planting.md', 1, 1, `Planted garlic and broad beans. Moved the [[Planting calendar]] on a month.`],

  // Recipes
  ['Projects/Recipes/Recipes - Overview.md', 100, 2, `Things I actually cook. [[Meal plan]] for the week, plus [[Tomato sauce]], [[Weeknight pasta]], [[Curry night]] and [[Pancakes]]. #cooking`],
  ['Projects/Recipes/Tomato sauce.md', 98, 3, `Garden tomatoes, garlic, olive oil, basil. Simmer 40 minutes. Freezes well. Goes on [[Weeknight pasta]]. Tomatoes from [[Tomatoes|the garden]].`],
  ['Projects/Recipes/Weeknight pasta.md', 96, 7, `Twenty minutes: pasta, sauce, spinach, parmesan. Double it for lunches.`],
  ['Projects/Recipes/Curry night.md', 80, 11, `Chickpea and spinach curry with rice. Toast the spices first.`],
  ['Projects/Recipes/Pancakes.md', 75, 20, `1 cup flour, 1 egg, 1 cup milk, pinch of salt. Rest the batter ten minutes.`],
  ['Projects/Recipes/Meal plan.md', 60, 2, `Mon [[Weeknight pasta]], Wed [[Curry night]], Sun [[Pancakes]]. #cooking`],
  ['Projects/Recipes/Sourdough starter.md', 40, 40, `Day 1: flour and water. Feed every day. Still not bubbly.`],

  // Reading List
  ['Projects/Reading List/Reading List - Overview.md', 80, 4, `What I'm reading: [[Currently reading]], [[Want to read]], [[Finished 2026]]. Notes on [[Book notes - Dune]] and [[Book notes - Atomic Habits]]. #books`],
  ['Projects/Reading List/Currently reading.md', 78, 4, `Dune (page 310). See [[Book notes - Dune]].`],
  ['Projects/Reading List/Want to read.md', 76, 9, `The Hobbit, Project Hail Mary, a good guide for Japan ([[Japan travel guide]]).`],
  ['Projects/Reading List/Finished 2026.md', 70, 14, `Atomic Habits, The Martian, Circe. Notes in [[Book notes - Atomic Habits]].`],
  ['Projects/Reading List/Book notes - Dune.md', 50, 4, `Great desert world-building. The sandworms would make a fun enemy: [[Space Game - Ideas]]. #books #scifi`],
  ['Projects/Reading List/Book notes - Atomic Habits.md', 45, 18, `Make it easy, make it obvious. Tiny habits add up. Using this for my [[Study plan]].`],

  // Study Notes
  ['Projects/Study Notes/Study Notes - Overview.md', 60, 1, `Semester notes. [[Study plan]], [[Exam dates]], [[Linear algebra]], [[Physics basics]], [[Spanish vocab]]. #study`],
  ['Projects/Study Notes/Study plan.md', 58, 2, `Two 45-minute blocks a day. Revise [[Linear algebra]] and [[Physics basics]] before the [[Exam dates]].`],
  ['Projects/Study Notes/Linear algebra.md', 55, 3, `Vectors, matrices, dot and cross products. Rotation matrices show up in [[Physics basics]]. #study #maths`],
  ['Projects/Study Notes/Physics basics.md', 54, 2, `Velocity, acceleration, gravity, momentum. F = ma. #study`],
  ['Projects/Study Notes/Spanish vocab.md', 50, 6, `Hola, gracias, por favor, la cuenta. Handy list in [[Phrases for the trip]].`],
  ['Projects/Study Notes/Exam dates.md', 48, 10, `Maths 4 Nov, Physics 9 Nov, Spanish oral 14 Nov.`],
  ['Projects/Study Notes/Work log/Study Notes work log - 2026-10-13 - revision.md', 4, 4, `Two hours on [[Linear algebra]]. Matrices finally make sense.`],
  ['Projects/Study Notes/Work log/Study Notes work log - 2026-10-16 - practice exam.md', 1, 1, `Did a practice paper for [[Physics basics]]. 78%.`],

  // Space Game
  ['Projects/Space Game/Space Game - Overview.md', 40, 0, `A small arcade space shooter. [[Game design]], [[Enemies]], [[Levels]], [[Controls]], [[Art style]] and [[Space Game - Ideas|Ideas]]. #gamedev`],
  ['Projects/Space Game/Game design.md', 39, 1, `Short runs, three lives, power-ups drop from [[Enemies]]. Ten [[Levels]]. Movement from [[Physics basics]]. Keys in [[Controls]]. #gamedev`],
  ['Projects/Space Game/Enemies.md', 38, 0, `Drones, shooters, and a boss every fifth level. Waves get faster in later [[Levels]].`],
  ['Projects/Space Game/Levels.md', 36, 2, `1-3 asteroid belt, 4-6 nebula, 7-9 ice moons, 10 the mothership.`],
  ['Projects/Space Game/Controls.md', 35, 5, `Arrows or WASD to fly, Space to shoot, Shift to dash.`],
  ['Projects/Space Game/Art style.md', 30, 3, `Neon outlines on a black sky, soft glow. Matches the [[Game design]] mood board. #art`],
  ['Projects/Space Game/Space Game - Ideas.md', 28, 1, `Sandworm boss, a co-op mode, a daily challenge seed.`],
  ['Projects/Space Game/Work log/Space Game work log - 2026-10-14 - enemy waves.md', 3, 3, `Added wave spawning to [[Enemies]].`],
  ['Projects/Space Game/Work log/Space Game work log - 2026-10-15 - boss fight.md', 2, 2, `First boss fight in level 5. Tuned [[Levels]].`],
  ['Projects/Space Game/Work log/Space Game work log - 2026-10-17 - title screen.md', 0, 0, `New title screen in the [[Art style]].`],

  // Travel 2026
  ['Projects/Travel 2026/Travel 2026 - Overview.md', 20, 1, `Two weeks in Japan next spring. [[Itinerary]], [[Bookings]], [[Budget]], [[Packing list]], [[Japan travel guide]], [[Phrases for the trip]]. #travel`],
  ['Projects/Travel 2026/Itinerary.md', 19, 1, `Tokyo 5 nights, Kyoto 4, Osaka 3, Hiroshima day trip. Costs in [[Budget]], tickets in [[Bookings]].`],
  ['Projects/Travel 2026/Bookings.md', 18, 3, `Flights booked. Hotels: Tokyo yes, Kyoto pending. Rail pass to buy.`],
  ['Projects/Travel 2026/Budget.md', 17, 2, `Flights 1400, hotels 1800, rail pass 450, food 900.`],
  ['Projects/Travel 2026/Packing list.md', 15, 6, `Passport, adapters, comfy shoes, rain jacket, small towel.`],
  ['Projects/Travel 2026/Japan travel guide.md', 14, 4, `Best areas to stay, temple tips, how the trains work. Shapes the [[Itinerary]]. #travel`],
  ['Projects/Travel 2026/Phrases for the trip.md', 12, 5, `Arigatou, sumimasen, eki wa doko desu ka.`],
];

const paths = NOTES.map((n) => n[0]);
const byPath = new Map(paths.map((p) => [p.toLowerCase().replace(/\.md$/, ''), p]));
const byName = new Map(paths.map((p) => [basename(p, '.md').toLowerCase(), p]));
const files = [], links = {}, excerpts = {};
NOTES.forEach(([p, made, edited, body], i) => {
  const raw = `# ${basename(p, '.md')}\n\n${body}\n`;
  const tags = new Set([...raw.matchAll(/(?:^|\s)#([\p{L}\d_/-]+)/gu)].map((m) => m[1]));
  const jitter = ((i * 37) % 600) * 60000; // spread the times out a little
  files.push({ path: p, name: basename(p, '.md'), ctime: NOW - made * DAY - jitter - 3600000, mtime: NOW - edited * DAY - jitter - 1800000, tags: [...tags] });
  excerpts[p] = excerptOf(raw);
  const out = {};
  for (const m of raw.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const t = m[1].split('|')[0].split('#')[0].trim().toLowerCase();
    const hit = byPath.get(t) || byName.get(t.split('/').pop());
    if (!hit) throw new Error(`${p}: link to a missing note: ${m[1]}`);
    out[hit] = (out[hit] || 0) + 1;
  }
  links[p] = out;
});
writeFileSync('test/demo-vault.json', JSON.stringify({ files, links, groups: [], excerpts }, null, 1));
console.log(`wrote ${files.length} demo notes to test/demo-vault.json`);
