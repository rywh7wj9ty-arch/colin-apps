// Adventure boards. Every board is generated no-guess around the first dig (seeded, so it is the same each try from the same tile).
export const AREAS = [
  { id: 'garden', name: 'Sunny Garden', blurb: 'Where it all begins: soft grass, daisies and sleepy Boomshrooms.' },
  { id: 'beach', name: 'Breezy Beach', blurb: 'Sandy patches, stubborn boulders and islands in the surf.' },
  { id: 'orchard', name: 'Spooky Orchard', blurb: 'Night falls. Dig up lanterns to read the numbers.' },
  { id: 'snow', name: 'Cosy Snow Village', blurb: 'Frosty tiles keep their numbers secret until a neighbour is dug.' },
];
const B = (area, name, w, h, mines, x = {}) => ({ area, name, w, h, mines, ...x });
const raw = [
  B(0, 'First Dig', 7, 7, 5),
  B(0, 'Three Hearts', 8, 8, 8, { tip: 'hearts' }),
  B(0, 'Buried Treasure', 8, 10, 11, { tip: 'coins' }),
  B(0, 'Daisy Rows', 9, 10, 13),
  B(0, 'Good Nose', 9, 11, 16, { tip: 'sniff' }),
  B(0, 'Long Lawn', 10, 12, 20),
  B(0, 'Heart Patch', 13, 12, 22, { shape: 'heart', boss: true, tip: 'shape' }),
  B(1, 'Rock Pools', 9, 10, 12, { boulders: 6, tip: 'boulders' }),
  B(1, 'Little Island', 11, 11, 15, { shape: 'island', tip: 'island' }),
  B(1, 'Pebble Path', 10, 12, 19, { boulders: 9 }),
  B(1, 'Lagoon', 12, 12, 21, { shape: 'island', boulders: 4 }),
  B(1, 'Driftwood', 11, 13, 25, { boulders: 10 }),
  B(1, 'High Tide', 12, 14, 24, { shape: 'island', boulders: 6 }),
  B(1, 'Starfish Shore', 15, 15, 22, { shape: 'star', boulders: 5, boss: true, tip: 'star' }),
  B(2, 'First Lantern', 9, 10, 12, { night: true, tip: 'night' }),
  B(2, 'Apple Rows', 10, 11, 16, { night: true }),
  B(2, 'Owl Hollow', 10, 12, 19, { night: true, boulders: 5 }),
  B(2, 'Whispering Path', 11, 12, 20, { night: true, shape: 'island' }),
  B(2, 'Crooked Trees', 11, 13, 26, { night: true, boulders: 7 }),
  B(2, 'Midnight Harvest', 12, 14, 31, { night: true, lanternEvery: 12 }),
  B(2, 'Pumpkin Ring', 14, 14, 30, { night: true, shape: 'round', boss: true, tip: 'ring' }),
  B(3, 'Frosty Start', 9, 10, 12, { ice: 0.18, tip: 'ice' }),
  B(3, 'Snowball Yard', 10, 11, 17, { ice: 0.22 }),
  B(3, 'Village Green', 10, 12, 20, { ice: 0.22, boulders: 6 }),
  B(3, 'Frozen Pond', 12, 12, 21, { ice: 0.25, shape: 'island' }),
  B(3, 'Chimney Smoke', 11, 13, 27, { ice: 0.25, boulders: 6 }),
  B(3, 'Candle Night', 12, 14, 31, { ice: 0.2, night: true, tip: 'icenight' }),
  B(3, 'Snowflake Square', 15, 15, 21, { ice: 0.16, shape: 'star', boulders: 4, boss: true, tip: 'boss4' }),
];
export const BOARDS = raw.map((b, i) => {
  const twist = { hearts: i >= 1, coins: i >= 2 ? Math.round(b.w * b.h / 22) : 0, sniff: i >= 4 };
  const area = (b.w * b.h) * (b.shape ? 0.72 : 1);
  return { ...b, ...twist, id: i, seed: 1000 + i * 7919, target: Math.round(25 + area * 0.75 + (b.night ? 30 : 0) + (b.ice ? 20 : 0)) };
});
export const TIPS = {
  hearts: ['Three Hearts', 'You have three hearts on every board. Bumping a Boomshroom costs one heart instead of ending the dig!'],
  coins: ['Buried Treasure', 'Some safe tiles hide shiny coins. Spend them on hats for your mole!'],
  sniff: ['Good Nose', 'Clear lots of tiles with one chord tap to fill your Sniff meter. A Sniff digs up one safe tile for you.'],
  shape: ['Boss: Heart Patch', 'Boards come in shapes now! Holes are not tiles, so they never hide Boomshrooms.'],
  boulders: ['Boulders', 'Boulders can\u2019t be dug and never hide Boomshrooms. Numbers don\u2019t count them.'],
  island: ['Islands', 'Island boards have tidepools in them. Count only real tiles!'],
  star: ['Boss: Starfish Shore', 'A big star full of boulders. Take your time!'],
  night: ['Night Digging', 'It\u2019s dark! Numbers only show clearly near a lantern you have dug up. Your first dig always finds one.'],
  ring: ['Boss: Pumpkin Ring', 'A ring around the old pumpkin. Lanterns are scattered all the way round.'],
  ice: ['Frosty Tiles', 'Icy tiles hide their number until you dig one of their neighbours.'],
  icenight: ['Candle Night', 'Ice and darkness together. Light the way, then melt the frost!'],
  boss4: ['Boss: Snowflake Square', 'The final dig. Ice, boulders and a giant snowflake star.'],
};
export const CLASSIC = [
  { key: 'easy', name: 'Easy', w: 9, h: 9, mines: 10 },
  { key: 'medium', name: 'Medium', w: 16, h: 16, mines: 40 },
  { key: 'hard', name: 'Hard', w: 16, h: 30, mines: 99 },
];
export function dailyDef(seed) { return { area: seed % 4, name: 'Daily Garden', w: 12, h: 14, mines: 30, hearts: true, coins: 8, sniff: true, seed, target: 160, boulders: seed % 3 === 0 ? 5 : 0, ice: seed % 4 === 3 ? 0.2 : 0 }; }
export const HATS = [
  { id: 'none', name: 'No hat', price: 0 },
  { id: 'straw', name: 'Straw Hat', price: 0 },
  { id: 'flower', name: 'Daisy Crown', price: 15 },
  { id: 'beanie', name: 'Bobble Beanie', price: 25 },
  { id: 'party', name: 'Party Cone', price: 35 },
  { id: 'pot', name: 'Flowerpot', price: 45 },
  { id: 'top', name: 'Top Hat', price: 60 },
  { id: 'crown', name: 'Golden Crown', price: 100 },
];
export const ACHIEVEMENTS = [
  ['firstdig', 'First Scoop', 'Dig your first tile'],
  ['firstwin', 'Green Thumb', 'Clear a board'],
  ['three', 'Shining Stars', 'Earn 3 stars on a board'],
  ['flood', 'Happy Wave', 'Dig 30 tiles with one tap'],
  ['chord', 'Chord Champ', 'Open 6 tiles with one chord tap'],
  ['sniff', 'Good Nose', 'Use a Sniff'],
  ['coins50', 'Piggy Bank', 'Collect 50 coins'],
  ['hat', 'Dapper Mole', 'Buy a hat'],
  ['world1', 'Garden Hero', 'Clear Sunny Garden'],
  ['allworlds', 'Grand Tour', 'Clear every area'],
  ['streak3', 'Daily Digger', 'Keep a 3-day daily streak'],
  ['nofl', 'Feather Touch', 'Clear a patch without planting a single signpost'],
  ['hard', 'Expert Burrower', 'Win Classic Hard'],
];
