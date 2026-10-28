# Map modules: contract for the four map agents

Each map has ONE module file that only its agent may edit:

| Map | File | Stage id | Port for local testing |
|---|---|---|---|
| Skyline Highway | `stages/highway.js` | `highway` (stage index 0) | 8781 |
| Alpine Pass & Valley | `stages/mountain.js` | `mountain` (1) | 8782 |
| Canyon Motocross | `stages/offroad.js` | `offroad` (2) | 8783 |
| Amazon Trail | `stages/jungle.js` | `jungle` (3) | 8784 |

**Never edit** `index.html`, `server/`, another map's file, or anything outside your own file.
If you need a hook that does not exist, stop and report it; do not work around it.
**Nothing is deployed or pushed. Do not run `git commit`, `git push`, `vercel` or `wrangler`.**

## Registering

```js
(function(){
  if(!window.ApexKit)return;
  ApexKit.register('highway', { /* hooks below, all optional */ });
})();
```

Every hook is wrapped by the game in try/catch. If a hook throws, it is switched off and the
built-in look is used instead. Do not rely on that; write defensive code and test it.
`?mods=0` on the page address turns every module off (use it to compare before/after).

## Hooks (all optional)

| Hook | Called | Must return |
|---|---|---|
| `trackShape(st, kit)` | once, before the road is built | an array of 12 to 24 control points `[x, z]` in metres around the origin, in driving order, describing a CLOSED loop. The game draws a smooth closed curve through them, scales it to the same total length as the map's built-in loop, and uses it as the road centre line. Return `null` to keep the built-in loop. See "Track shape" below. |
| `roadTexture(st, kit)` | once, when the world is built | a `THREE.CanvasTexture` (any size up to 1024x1024, seamless top to bottom). U (x) runs across the road from left edge to right edge, V (y) along the road. Return `null` for the default. |
| `texLen` (number property) | once | metres of road per texture repeat (default is the stage's own value). |
| `terrainFeat(x, z, rho, dn, kit)` | per terrain vertex | extra height in metres. It is faded in automatically away from the road (zero within 8 m of the edge). `dn` = distance to the road centre line. Keep it smooth and small enough to stay driveable. |
| `terrainColor(cc, x, z, h, slope, dn, n1, near, kit, waterY)` | per terrain vertex | nothing: mutate the `THREE.Color` `cc` in place. Runs after the default colour. Colours are clamped to 0..1. |
| `atmosphere(ctx)` | once, after sky and lights exist | nothing. `ctx` has `scene, sunLight, hemi, sky, grp, st, rng, kit, L, M, DS, TOUCH`. You may adjust fog, light colours, add sky objects. Do not make the road harder to see. |
| `props(ctx)` | once, after the built-in scenery | nothing. Add scenery to `ctx.grp`. `ctx` also has `place, scatter, trees, rocks, rail` (the built-in helpers). |
| `propScale` (number property 0..2) | once | scales the density of the BUILT-IN scattered props (trees, rocks, cacti...). Use e.g. 0.4 to thin the plain built-in trees before adding better ones. |
| `kinds` (array property) | once | replaces the list of traffic vehicle kinds (strings) for this map. Only meaningful for maps that have traffic lanes (highway, mountain, jungle). |
| `vehicle(kind, rng, kit)` | once per traffic vehicle | `{obj, hw, hl}` or `null` for the built-in model. `obj` is a `THREE.Group`, facing +z, origin on the ground. `hw` / `hl` are the half width / half length in metres used for collisions, so they must match the visible body. |
| `obstKinds` (array property) | once | replaces the list of obstacle kinds for this map. |
| `nObst` (number 0..30) | once | how many fixed obstacles to place on the road (default: the map's own count; highway and mountain default to 0). Obstacles are spread evenly around the lap at random lateral positions inside the road width. |
| `obstacle(kind, rng, kit)` | once per obstacle | `{obj, hw, hl}` or `null`. Same conventions as vehicles. Kind `'log'` is special: the game places it near the road centre line with a small yaw; its long axis must lie along local x and `hw` is its half length. |
| `kit.addUpdater(fn)` | any time | `fn(dt, nowMs)` runs every frame (animation only). It is removed automatically if it throws. |

## Track shape (trackShape)

This hook is the one allowed change to the road centre line, and it is the only exception to hard rule 2 for road
position. It is used to make each map's loop non-circular, in the style of real race circuits: long straights,
hairpins, chicanes and sweepers. Rules for the points you return:

- Closed and in driving order. The first point is on the start/finish straight. The loop must NOT cross itself.
- Smooth enough to drive: no corner tighter than about 25 m radius on the highway and mountain maps, about 15 m on
  the off-road and jungle maps. Keep straights at least 80 m long where a straight is used.
- Keep the loop within about 1.6 times the map's `R` of the origin, so terrain and sky stay where they were.
- Lengths are matched automatically, so do not worry about metres; only the shape matters.
- Use `kit.mulberry(<fixed number>)` for any randomness so every player builds the same loop.
- Return `null` if you cannot meet these rules; the built-in loop is then used.

## The kit (`kit` / `ctx.kit`)

`THREE, PI, TAU, clamp, lerp, sstep, mod, angDiff, fbm, vnoise, hash2, mulberry, TOUCH`
`geo(type, ...args)` cached shared geometry (NEVER mutate it; `.clone()` first),
`mesh(geo, mat, pos, rot, scale)`, `box, ell, cyl, rod, fender` (add a part to a parent group),
`vm(hex)` shared car-paint material, `glassM, tyreM, redL, whiteL, carWheels(g, w, l, r)`,
`mergeByMaterial(group)` merges all direct child meshes of a group into one mesh per material,
`inst(geometry, material, items)` builds an `InstancedMesh`; items are `{x,y,z,sx,sy,sz,ry,c}` (`c` = hex colour),
`pose(s, off)` returns a COPY `{x,y,z,hd}` of the road position `s` metres along the track, `off` metres to the
right of the direction of travel, `nearest(x, z)` returns `{j,f,d,dist}` (`d` = signed lateral offset, `dist` = distance
to the centre line), `terrainH(x, z)` ground height, `roadYAt(f)`, and getters `st, L, M, DS`
(`st.half` = half road width, `st.id`, `st.lanes`, `st.laps`).

Coordinate rules: Y is up, a bike or vehicle faces +z, left of travel is +x in local space, positive `off` is the
right side of the road. Euler order for rotated groups is the default XYZ.

## Hard rules (these protect multiplayer and gameplay)

1. **Deterministic.** Everything that changes geometry, vehicles, obstacles or their positions must be a pure
   function of the `rng` / `ctx.rng` you are given, or of `kit.mulberry(<fixed number>)`. NEVER use `Math.random`,
   `Date`, `performance.now` or the screen size for that. All players must build the identical world.
   (`addUpdater` animation may use time, but must not move anything that collides.)
2. **Do not change gameplay.** Road width, road position, collision sizes of the default kinds, lane layout,
   physics and the clear driving line stay as they are. New obstacles and vehicles must be fair: the road stays
   passable, obstacles never fill the whole width, nothing hangs lower than 6 m above the road, and collision
   boxes (`hw`, `hl`) match the visible shape.
3. **Readability first.** Lane lines, road edges and obstacles must stay easy to see at speed. The road colour must
   stay clearly different from the ground beside it. Do not add heavy fog, glare or flicker.
4. **Performance budget** (the game also runs on phones; `kit.TOUCH` is true there):
   - at most +150 draw calls on desktop and +60 on touch from your additions;
   - at most +150k triangles on desktop and +60k on touch;
   - one `InstancedMesh` per repeated prop type (trees, rocks, poles...). Merge every vehicle with
     `mergeByMaterial` (a vehicle should be at most ~6 meshes);
   - textures no bigger than 1024x1024 (road) and 512x512 (everything else), generated with canvas
     (`document.createElement('canvas')` + `new THREE.CanvasTexture`). No external images, fonts or files
     (the page's security policy blocks them);
   - no new lights, no new shadow-casting lights, no real-time reflections, no per-frame allocations in updaters;
   - use `MeshLambertMaterial` for scenery. `MeshStandardMaterial` only for vehicles. Use `fog:false` only for
     things at sky distance. Transparent materials: `depthWrite:false` and keep them few.
   - When `kit.TOUCH`, build roughly 40% fewer scattered props and use smaller textures (256 or 512).
5. **Do not add scenery inside the road or within `st.half + 1.5` m of the centre line**, and nothing in the
   air above the road except a clearly visible overhead structure higher than 6 m (visual only).
6. **Colours** are linear and uncorrected in this renderer (no tone mapping): pick colours so they look right as
   plain sRGB hex values, like the existing code does.

## Testing your module

1. Syntax: `node --check stages/<yourfile>.js`.
2. Look at it with the headless screenshot command below (slow: about 2 to 3 minutes per picture, so run it in
   the background and take at most 6 pictures in total). The first start of a headless browser can be slow.

```bash
cd /Users/piyushpagare/Desktop/apex-rider
python3 -m http.server <your port> >/dev/null 2>&1 &        # your port from the table above
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --user-data-dir=/tmp/chrome-<yourid> \
  --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist --window-size=1280,720 \
  --virtual-time-budget=25000 --screenshot=/tmp/shots/<yourid>-1.png \
  "http://localhost:<port>/index.html?demo=<stage index>&at=<metres along track>&cam=<0..3>&touch=0"
```

`demo=` starts Free Roam parked at `at` metres along the lap. `cam=0` is the chase camera, `cam=1` close, `cam=3` side.
Add `&touch=1` to see the lighter phone build. Add `&mods=0` for the original look. The rider drawn in headless
screenshots can look black and red because of the software renderer; ignore that.
Read the PNG with the Read tool to inspect it. Kill your server when you are finished (`pkill -f "http.server <port>"`).
