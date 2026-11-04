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
