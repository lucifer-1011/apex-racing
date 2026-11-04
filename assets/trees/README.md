# Tree models

Eight tree models from the "22 trees" pack (`trees9.obj`), rebuilt for the browser.

| File | What it is |
|---|---|
| `trees.js` | `window.APEX_TREES`: for each tree its height `h`, radius `r`, texture name and two quantised meshes (`hi` for desktop, `lo` for touch devices) as base64. **Generated, do not edit by hand.** |
| `<tree>.jpg` (lower case, e.g. `bark_s.jpg`) | 256x512 texture atlas of that tree (leaf cards in the upper half, bark in the lower half). |

The game decodes them in `TreeKit` (`index.html`, section "MODEL TREES").

## Trees

| Name | Height | Look | Used on |
|---|---|---|---|
| `Walnut_L` | 13 m | round, autumn colours | Skyline Highway, Alpine Pass |
| `Sonnerat` | 10 m | wide, flat topped | Skyline Highway, Canyon Motocross |
| `Bark___S` | 12 m | cone shaped | Alpine Pass |
| `Bark___0` | 17 m | narrow, layered, some orange cards | Alpine Pass |
| `Mossy_Tr` | 25 m | tall trunk, dome crown | Amazon Trail |
| `Bottom_T` | 45 m | forest giant with buttress roots | Amazon Trail |
| `Bark___1` | 35 m | tall forest tree | Amazon Trail |
| `Oak_Leav` | 2.7 m | shrub | Alpine Pass, Canyon Motocross, Amazon Trail |

Triangles per tree: about 230 to 1000 for `hi`, 150 to 380 for `lo`. The leaf textures have no transparency, so the
crowns are opaque cards; the outline comes from the card shapes.

## Regenerating

```bash
python3 tools/convert_trees.py <folder with trees9.obj and Texture/>
```

Needs Python 3 with numpy, scipy and Pillow. The output is deterministic. The triangle budgets per tree are in
the `TREES` table at the top of `tools/convert_trees.py`.

## Using the trees on a map

Add them to the stage's `models` list in `STAGES` (`index.html`):

```js
models:[{t:'Walnut_L', n:60, a:12, b:120, s:[.9,1.3], c:[0xffffff,0xf2e6d0]}]
// t = tree name, n = count on desktop (60% on touch), a..b = metres from the road edge,
// s = [min,max] scale, c = optional tint colours
```

Trees are placed by `placeModelTrees` with its own seeded random stream, so every player gets the same trees and
the rest of the world is generated exactly as before. They stay out of lakes and off steep slopes.

## Source and licence

The source pack was supplied by the project owner. It does not state a licence in the files we received
(`trees9.obj`, `trees9.mtl`, `Texture/`); confirm that it may be redistributed with the game before a public release.
