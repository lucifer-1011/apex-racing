# Bike models

The Iron Stallion 1200 (the cruiser, ridden on Alpine Pass & Valley) is drawn from a retro roadster model
("moto_simple", `moto_simple_1.obj`): spoked wire wheels, round headlight, twin exhausts, single tank, bench seat.

| File | What it is |
|---|---|
| `moto.js` | `window.APEX_MOTO`: two levels of detail (`hi` for desktop, `lo` for touch devices) of quantised meshes, one per part (`body`, `steer`, `fw`, `rw`) and material slot (`paint`, `accent`, `trim`, `chrome`, `metal`, `tire`, `head`, `tail`...), plus anchor points measured on the model (axles, steering pivot and rake, headlight lens, shocks, grips, tank). **Generated, do not edit by hand.** |

The game decodes it in `MotoKit` and builds the bike in `buildMoto()` (`index.html`, section "MODEL BIKE"). The
material slots map to the bike's own materials (`makeMats`), so the colour schemes, the rival's alt scheme, the
multiplayer rider colours and the ghost all work as on the other bikes. `buildMoto()` adds the detail the source does
not have (headlight bezel and glass, mirrors, fork gaiters, shock springs, swingarm and frame rails, chain and
sprockets, brake discs and calipers, footpegs, kick stand, fuel cap, tank badges, rear indicators). If `moto.js` is
missing or broken, the game falls back to the old procedural cruiser.

Triangles of the model alone: `hi` 7,684, `lo` 4,926. With the added detail the whole bike (without the rider) is
about 10,400 triangles on desktop and 6,400 on touch devices.

## Regenerating

```bash
python3 -I tools/convert_moto.py <path to moto_simple_1.obj>
```

Needs Python 3 and numpy. The output is deterministic. Scale, paint rules, paint bands (tank two-tone, pinstripes,
seat piping, fork sliders) and the per-object triangle budgets are constants and functions at the top of
`tools/convert_moto.py`. Use `-I` because the OBJ is a downloaded file.

## Source and licence

The source pack (`22-moto_simple (1).zip`: `moto_simple_1.obj`, `.mtl`, `.3ds`, `.blend`) was supplied by the project
owner. It does not state a licence in the files we received; confirm that it may be redistributed with the game
before a public release.

# Veloce RR 1000 superbike (Skyline Highway)

The Veloce RR 1000 (the sport bike) is an **original procedural model** drawn by `tools/build_superbike.py`; no third party
model is read or copied, and there is no licence to track. Faceted lofted fairing, tank and tail with a livery stripe, mid fairing
panels with vents, twin LED headlights, winglets, faceted windscreen, TFT dash, mirrors with indicators, inverted gold forks,
radial calipers and drilled discs, five Y-spoke wheels with real tyre profiles, twin-spar frame, swingarm, engine block, chain,
under-seat exhaust, tail unit with LED light and plate holder.

| File | What it is |
|---|---|
| `superbike.js` | `window.APEX_SUPER`: `hi` (desktop) and `lo` (touch) LODs, same packing as `moto.js`, per part (`body`, `steer`, `fw`, `rw`) and material slot, plus anchors (wheelbase, axles, steering pivot and rake). **Generated, do not edit by hand.** |

The game decodes it in `SuperKit` (reusing `MotoKit.decode`) and builds it in `buildSuper()` (`index.html`, section "MODEL BIKE
(Veloce RR 1000)"). Material slots map to `makeMats` (new `carbon` slot), so colour schemes, the rival's alt scheme, multiplayer
rider colours and the ghost work. The wheelbase (1.42) and wheel radii (.30 / .31) are unchanged; the rider pose is
`BIKES.sport.fit`. If the file is missing or broken, the game falls back to the old procedural sport bike.

Triangles (bike without rider): `hi` 7,404 and `lo` 5,244 (rider about 4,200 more).

```bash
python3 -I tools/build_superbike.py      # needs Python 3 and numpy; deterministic
```

Design references (proportions and part layout only): Ducati Panigale V4 (nose with twin LED eyes and winglets, exposed front
frame), Yamaha R1, BMW S1000RR (mirror-mounted indicators), Aprilia RSV4, Kawasaki ZX-10R; public product pages such as
ducati.com and motorcycle.com were read for the layout of the parts. All geometry is our own.

# Dune Raider 450 motocross bike (Canyon Motocross)

The Dune Raider 450 (the off-road bike) is an **original procedural model** drawn by `tools/build_motocross.py`; no third party
model is read or copied, and there is no licence to track. Tall slim bodywork made of flat angular panels: high sweeping front
fender, wide two-facet radiator shrouds with a vent window, black number plate with a white number field, flat tall seat with grip
ribs, pointed rear fender and number boards. The red and black graphics are separate flat geometry in their own paint slots (no
textures). Inverted long-travel forks with gold outer tubes, fork guards with yellow stripes, 36-spoke wheels with knob-block
tyres (fewer spokes and knobs on touch), drilled wave front disc, rear sprocket and chain, white swingarm, linkage shock with a
red spring, high silencer with header pipe, carbon skid plate, fat bar with crossbar pad, grips, levers, footpegs.

| File | What it is |
|---|---|
| `motocross.js` | `window.APEX_MX`: `hi` (desktop) and `lo` (touch) LODs, same packing as `moto.js`, per part (`body`, `steer`, `fw`, `rw`) and material slot, plus anchors (wheelbase, axles, steering pivot and rake, grips). **Generated, do not edit by hand.** |

The game decodes it in `MxKit` (`packedKit()`, reusing `MotoKit.decode`) and builds it in `buildPacked()` (`index.html`, section
"MODEL BIKES (Dune Raider 450, Trail Master 1250)"). Material slots map to `makeMats` (new `hivis` slot for the fork-guard stripes), so the livery (white / red / black,
alt scheme orange), multiplayer rider colours and the ghost work. Wheelbase (1.48) and wheel radii (.40 / .36) are unchanged; the
rider pose is `BIKES.off.fit`. If the file is missing or broken, the game falls back to the old procedural off-road bike.

Triangles (bike without rider): `hi` 8,948 and `lo` 4,974 (rider about 4,000 more); 39 draw calls with the rider.

```bash
python3 -I -B tools/build_motocross.py   # needs Python 3 and numpy; deterministic (shared primitives in tools/bikegeo.py)
```

Design references (proportions, part layout and livery colours only): three pictures supplied by the project owner, two wireframe
renders of motocross bikes (side and front three-quarter) and a colour render of a white / red / black race bike with gold forks.
All geometry is our own.

# Trail Master 1250 adventure tourer (Amazon Trail)

The Trail Master 1250 (the adventure bike) is an **original procedural model** drawn by `tools/build_adventure.py` with the shared
kit `tools/bikegeo.py`; no third party model is read or copied, and there is no licence to track. Tall long-travel stance, rally
front with a faceted headlight pod, twin headlights, tall tinted screen, TFT and a high beak over a low fender; big tank with scooped
side panels (sand panel, vent, orange pinstripe); three-cylinder engine with three headers, high silencer on the right, black crash
bars round tank and engine, bash plate; black inverted forks with silver stanchions, twin front discs, 36-spoke wheels with dual
purpose tread blocks (fewer spokes and blocks on touch); stepped rider and pillion seat, rack with a top box, roll bag, two side
cases (dark grey with lighter lids, straps, reflectors, tubular frames; the right case sits wider to clear the exhaust); rally
handguards with indicators, mirrors, side stand, silver swingarm, linkage shock with an orange spring, chain. The luggage is part of
the rigid body.

| File | What it is |
|---|---|
| `adventure.js` | `window.APEX_ADV`: `hi` (desktop) and `lo` (touch) LODs, same packing and parts as `motocross.js`, plus anchors. **Generated, do not edit by hand.** |

The game decodes it in `AdvKit` (`packedKit()`) and builds it in `buildPacked()`, like the motocross bike. Material slots map to
`makeMats` (new `luggage` slot, matt dark grey, for the cases and engine), so the livery (olive / sand / orange, alt scheme sand /
black / orange), multiplayer rider colours and the ghost work. Wheelbase (1.6) and wheel radii (.36 / .36) are unchanged; the rider
pose is `BIKES.adv.fit`. If the file is missing or broken, the game falls back to the old procedural adventure bike.

Triangles (bike without rider): `hi` 9,344 and `lo` 5,362 (rider about 4,000 more); 38 draw calls with the rider.

```bash
python3 -I -B tools/build_adventure.py   # needs Python 3 and numpy; deterministic
```

Design reference (proportions and part layout only, its rider figure ignored): a grey sculpt of a Tiger-style adventure tourer
supplied by the project owner. All geometry is our own.
