/* Pocket Weather levels. Map key:
   . grass  , dirt  = stone  : sand  + snow  $ start  * goal  _ sky (no ground)
   s sprout (rain: vine bridge)   m spore (rain: mushroom, bounce up a ledge)   b dry basin (rain: lily pond)
   o lily pond   w deep water   B boat   c cloud platform   ~ mud (sun dries, snow freezes)   p puddle
   i ice   I ice block (sun melts)   f fire (rain/snow put out)   k bramble (lightning: burns)   r rock (lightning: shatters)
   F sunflower (sun: opens gates)   G gate   M windmill (wind: toggles lifts)   L lift   E coil (powered through water)
   D drawbridge (extends when a coil wakes)   R rainbow stone (rain, then sun)   d sand pile   n snow pile (wind pushes)
   ^ steps   T tree / pillar / decoration
   drops: [x, y, weather] for the three hidden sun drops. solution: the scripted solve used by the tests. par: challenge target. */
(function (root, factory) {
  var L = factory();
  if (typeof module === 'object' && module.exports) module.exports = L; else root.PWLevels = L;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var WORLDS = [
    { id: 0, name: 'Puddle Meadow', short: 'Meadow', blurb: 'Where the first raindrops fall.', weather: 'Rain + Sun' },
    { id: 1, name: 'Breezy Bazaar', short: 'Bazaar', blurb: 'Sails, sand and spinning mills.', weather: 'Wind' },
    { id: 2, name: 'Frost Peaks', short: 'Frost', blurb: 'Snow makes a floor of the sea.', weather: 'Snow' },
    { id: 3, name: 'Storm Works', short: 'Storm', blurb: 'A factory that runs on thunder.', weather: 'Lightning' },
    { id: 4, name: 'Sky Garden', short: 'Finale', blurb: 'Every weather, all at once.', weather: 'Everything' }
  ];

  var LEVELS = [
    // ───────── World 1: Puddle Meadow (rain, sun, rainbow) ─────────
    { id: '1-1', world: 0, name: 'First Drizzle', goal: 'seed', weathers: ['rain'],
      tip: 'Press and hold over the sprouts to rain on them.',
      map: ['.T..__.T.',
            '..$.ss..*',
            '....__...',
            '_.T.__.._'],
      drops: [[0, 0, 'rain'], [8, 2, 'rain'], [1, 3, 'rain']],
      solution: [{ w: 'rain', x: 4, y: 1 }] },

    { id: '1-2', world: 0, name: 'Morning Glow', goal: 'home',
      tip: 'Tap to shine the sun. Sunshine melts ice.',
      map: ['_..T__..',
            '.$..I..*',
            '_.T.I.T.',
            '__..T.._'],
      drops: [[2, 0, 'sun'], [6, 0, 'sun'], [2, 3, 'rain']],
      solution: [{ w: 'sun', x: 4, y: 1 }] },

    { id: '1-3', world: 0, name: 'Muddy Boots', goal: 'lantern',
      tip: 'Rain turns dirt into mud. Sun dries it. Aim the cloud with care!',
      map: ['__..T...',
            '.$,~,s,*',
            '_.T.T_T.',
            '__.._.__'],
      drops: [[7, 0, 'sun'], [2, 3, 'rain'], [0, 1, 'sun']],
      solution: [{ w: 'rain', x: 5, y: 0 }, { w: 'sun', x: 3, y: 1 }] },

    { id: '1-4', world: 0, name: 'Lily Hop', goal: 'friend',
      tip: 'Rain fills dry ponds. Lily pads float up to walk on.',
      map: ['..T__...',
            '.$.bb.m*',
            '..Tbb.T.',
            '_..__.._'],
      heights: ['00000001', '00000001', '00000001', '00000001'],
      drops: [[1, 2, 'rain'], [0, 0, 'sun'], [6, 3, 'rain']],
      solution: [{ w: 'rain', x: 3, y: 1 }, { w: 'rain', x: 6, y: 1 }] },

    { id: '1-5', world: 0, name: 'Sunflower Gate', goal: 'home',
      tip: 'Sunflowers love the sun. Gates love sunflowers.',
      map: ['__.T.F.__',
            '.$..bG,f*',
            '__.T.T.__'],
      drops: [[2, 0, 'sun'], [6, 2, 'rain'], [0, 1, 'sun']],
      solution: [{ w: 'rain', x: 4, y: 1 }, { w: 'sun', x: 5, y: 0 }, { w: 'rain', x: 7, y: 0 }] },

    { id: '1-6', world: 0, name: 'Rainbow Road', goal: 'lantern',
      tip: 'Wet a rainbow stone, then shine on it.',
      map: ['_..__..._',
            '..,___T._',
            '$,R___R.*',
            '..,___...'],
      drops: [[0, 3, 'rain'], [1, 0, 'sun'], [7, 3, 'sun']],
      solution: [{ w: 'rain', x: 2, y: 1 }, { w: 'sun', x: 2, y: 2 }] },

    // ───────── World 2: Breezy Bazaar (wind) ─────────
    { id: '2-1', world: 1, name: 'Set Sail', goal: 'friend',
      tip: 'Swipe to make wind. Blow the boat across!',
      map: ['_::wwww::_',
            '$::Bwww:*:',
            '_::wwww::_'],
      drops: [[1, 0, 'wind'], [8, 2, 'wind'], [2, 2, 'rain']],
      solution: [{ w: 'wind', x: 3, y: 1, dir: 'e' }] },

    { id: '2-2', world: 1, name: 'Up We Go', goal: 'lantern',
      tip: 'Wind spins the windmill. The windmill moves the lift.',
      map: ['_M:T==_',
            '$::L=.*',
            '_::T=._'],
      heights: ['0000110', '0000111', '0000110'],
      up: [[3, 1]],
      drops: [[2, 2, 'wind'], [5, 0, 'sun'], [5, 2, 'rain']],
      solution: [{ w: 'wind', x: 1, y: 0, dir: 'e' }, { w: 'wind', x: 1, y: 0, dir: 'e' }] },

    { id: '2-3', world: 1, name: 'Sand Shuffle', goal: 'seed',
      tip: 'Blow sand piles into gaps to make new ground.',
      map: [':::T__:::',
            '$::d:_:*:',
            '::::T_:::'],
      drops: [[0, 0, 'wind'], [8, 2, 'rain'], [6, 0, 'sun']],
      solution: [{ w: 'wind', x: 3, y: 1, dir: 'e' }, { w: 'wind', x: 4, y: 1, dir: 'e' }] },

    { id: '2-4', world: 1, name: 'Umbrella Day', goal: 'home',
      tip: 'Blow on your friend at the cliff edge. Umbrella up!',
      map: ['.T.__...',
            '$..__..*',
            '..T__.T.'],
      heights: ['22200111', '22200111', '22200111'],
      drops: [[0, 2, 'wind'], [7, 2, 'rain'], [5, 0, 'sun']],
      solution: [{ w: 'wind', x: 2, y: 1, dir: 'e' }] },

    { id: '2-5', world: 1, name: 'Kite Festival', goal: 'lantern',
      tip: 'Higher up, the wind carries you further.',
      map: ['M..___...',
            '$.L___..*',
            '...___.T.'],
      heights: ['111111111', '111111111', '111111111'],
      drops: [[1, 2, 'wind'], [7, 0, 'sun'], [0, 2, 'rain']],
      solution: [{ w: 'wind', x: 0, y: 0, dir: 's' }, { w: 'wind', x: 2, y: 1, dir: 'e' }] },

    { id: '2-6', world: 1, name: 'Bazaar Day', goal: 'friend',
      tip: 'Boats, sunflowers and sand. You know what to do.',
      map: ['::T:www:F::__',
            '$:::Bww:G:d_*',
            '::T:www:T::_:'],
      drops: [[1, 2, 'wind'], [0, 0, 'rain'], [10, 0, 'sun']],
      solution: [{ w: 'wind', x: 4, y: 1, dir: 'e' }, { w: 'sun', x: 8, y: 0 }, { w: 'wind', x: 10, y: 1, dir: 'e' }] },

    // ───────── World 3: Frost Peaks (snow) ─────────
    { id: '3-1', world: 2, name: 'First Frost', goal: 'home',
      tip: 'Hold, then tap the snowflake to switch your cloud to snow. Snow freezes water.',
      map: ['++T+ww++',
            '$+++ww+*',
            '+T++ww++'],
      drops: [[0, 0, 'snow'], [7, 2, 'sun'], [1, 0, 'wind']],
      solution: [{ w: 'snow', x: 4, y: 1 }] },

    { id: '3-2', world: 2, name: 'Mud Season', goal: 'seed',
      tip: 'Frozen mud is perfectly good ground.',
      map: ['+T~~T++',
            '$+~~f+*',
            '+T~~T++'],
      drops: [[0, 0, 'snow'], [6, 0, 'sun'], [6, 2, 'wind']],
      solution: [{ w: 'snow', x: 3, y: 1 }] },

    { id: '3-3', world: 2, name: 'Snowball', goal: 'lantern',
      tip: 'Snow piles roll in the wind and pack into new ground.',
      map: ['++T+_++T+',
            '$+n+_+ww*',
            '++T+_++T+'],
      drops: [[0, 2, 'wind'], [8, 0, 'snow'], [5, 2, 'sun']],
      solution: [{ w: 'wind', x: 2, y: 1, dir: 'e' }, { w: 'wind', x: 3, y: 1, dir: 'e' }, { w: 'snow', x: 6, y: 1 }] },

    { id: '3-4', world: 2, name: 'Thaw and Grow', goal: 'friend',
      tip: 'Rain makes mud, but snow can fix that.',
      map: ['+T,,T++',
            '$,,m++*',
            '+T,,T++'],
      heights: ['0000111', '0000111', '0000111'],
      drops: [[0, 0, 'snow'], [5, 2, 'sun'], [0, 2, 'wind']],
      solution: [{ w: 'rain', x: 4, y: 1 }] },

    { id: '3-5', world: 2, name: 'Glacier Glide', goal: 'home',
      tip: 'Make somewhere to land before you fly.',
      map: ['++T__ww++',
            '$++__ww+*',
            '++T__ww++'],
      heights: ['222000000', '222000000', '222000000'],
      drops: [[0, 2, 'snow'], [8, 0, 'wind'], [7, 2, 'sun']],
      solution: [{ w: 'snow', x: 6, y: 1 }, { w: 'wind', x: 2, y: 1, dir: 'e' }] },

    { id: '3-6', world: 2, name: 'Avalanche', goal: 'lantern',
      tip: 'Everything you have learned, on one mountain.',
      map: ['++T+_TwT+',
            '$+n+_~w+*',
            '++T+_Tw+T'],
      drops: [[0, 0, 'snow'], [8, 0, 'sun'], [1, 2, 'wind']],
      solution: [{ w: 'wind', x: 2, y: 1, dir: 'e' }, { w: 'wind', x: 3, y: 1, dir: 'e' }, { w: 'snow', x: 6, y: 1 }] },

    // ───────── World 4: Storm Works (lightning) ─────────
    { id: '4-1', world: 3, name: 'Spark', goal: 'friend', bolts: 1,
      tip: 'Tap the bolt, then tap a rock. One strike is all you get!',
      map: ['==T==__',
            '$=r===*',
            '==T==__'],
      drops: [[0, 0, 'rain'], [3, 2, 'wind'], [1, 2, 'sun']],
      solution: [{ w: 'bolt', x: 2, y: 1 }] },

    { id: '4-2', world: 3, name: 'Live Wire', goal: 'lantern', bolts: 1,
      tip: 'Coils are insulated. Strike the water touching them.',
      map: ['_=wwE=_=_',
            '$====DD=*',
            '_=T==__=_'],
      drops: [[1, 2, 'wind'], [7, 0, 'sun'], [7, 2, 'rain']],
      solution: [{ w: 'bolt', x: 2, y: 0 }] },

    { id: '4-3', world: 3, name: 'Rain Wires', goal: 'home', bolts: 1,
      tip: 'Puddles carry electricity too.',
      map: ['_w===E_=_',
            '$====DD=*',
            '_=T==__=_'],
      drops: [[1, 2, 'wind'], [7, 0, 'sun'], [7, 2, 'snow']],
      solution: [{ w: 'rain', x: 3, y: 0 }, { w: 'bolt', x: 1, y: 0 }] },

    { id: '4-4', world: 3, name: 'Cloud Hop', goal: 'seed', bolts: 0,
      tip: 'Clouds drift on the wind, and so do you.',
      map: ['__T_==*=',
            '__T_____',
            '$=c____T',
            '==T_____'],
      drops: [[0, 3, 'wind'], [7, 0, 'sun'], [1, 3, 'rain']],
      solution: [{ w: 'wind', x: 2, y: 2, dir: 'e' }, { w: 'wind', x: 6, y: 2, dir: 'n' }] },

    { id: '4-5', world: 3, name: 'Bramble Burn', goal: 'friend', bolts: 2,
      tip: 'Lightning sets brambles alight. Then what?',
      map: ['_,,T=wE__',
            '$,,k=DD=*',
            '_,,T=T___'],
      drops: [[1, 0, 'sun'], [2, 2, 'wind'], [1, 2, 'rain']],
      solution: [{ w: 'bolt', x: 3, y: 1 }, { w: 'rain', x: 4, y: 1 }, { w: 'bolt', x: 5, y: 0 }] },

    { id: '4-6', world: 3, name: 'The Big Machine', goal: 'lantern', bolts: 1,
      tip: 'Mills, coils and clouds all at once.',
      map: ['M=T=w==E__',
            '$=L=I==DD*',
            '==T=T==___'],
      heights: ['0001111111', '0001111111', '0001111111'],
      drops: [[0, 2, 'wind'], [6, 2, 'snow'], [1, 0, 'rain']],
      solution: [{ w: 'wind', x: 0, y: 0, dir: 'e' }, { w: 'sun', x: 4, y: 1 }, { w: 'rain', x: 6, y: 0 }, { w: 'bolt', x: 4, y: 0 }] },

    // ───────── Finale ─────────
    { id: '5-1', world: 4, name: 'Eye of the Storm', goal: 'lantern', bolts: 1,
      tip: 'Every kind of weather. One last walk home.',
      map: ['$.s..G..T',
            '.T_F__T._',
            '______ww_',
            'R__RD=d._',
            '*__TEw_._'],
      drops: [[0, 1, 'sun'], [7, 4, 'wind'], [6, 0, 'snow']],
      solution: [{ w: 'rain', x: 2, y: 0 }, { w: 'sun', x: 3, y: 1 }, { w: 'snow', x: 7, y: 2 }, { w: 'wind', x: 6, y: 3, dir: 's' },
                 { w: 'bolt', x: 5, y: 4 }, { w: 'rain', x: 3, y: 3 }, { w: 'sun', x: 3, y: 3 }] }
  ];

  // challenge targets: the fewest weather actions that win (found by the breadth-first solver in logic.js)
  var PAR = {"1-1":1, "1-2":1, "1-3":2, "1-4":2, "1-5":3, "1-6":2, "2-1":1, "2-2":2, "2-3":2, "2-4":1, "2-5":2, "2-6":3, "3-1":1, "3-2":1, "3-3":3, "3-4":1, "3-5":2, "3-6":3, "4-1":1, "4-2":1, "4-3":2, "4-4":2, "4-5":3, "4-6":4, "5-1":7};
  LEVELS.forEach(function (l) { l.par = PAR[l.id]; });

  return { WORLDS: WORLDS, LEVELS: LEVELS };
});
