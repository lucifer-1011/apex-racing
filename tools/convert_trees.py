#!/usr/bin/env python3
"""Convert the "22 trees" OBJ pack into small, browser-ready tree assets.

    python3 tools/convert_trees.py <folder with trees9.obj and Texture/> [--out assets/trees]

The source is one 33 MB OBJ with eight trees (about 250k triangles), far too heavy for a phone. Every tree is
rebuilt as two light meshes, `hi` for desktop and `lo` for touch devices:

  * Leaves. In the source each leaf card is a 3x3-vertex grid (8 triangles). A card is collapsed to one quad
    (2 triangles). If a tree has more cards than the budget, a spread-out subset is kept (farthest-point
    sampling, so the crown keeps its outline) and the kept cards are scaled up to hold the same coverage.
  * Wood (trunk and branches). Vertex-clustering decimation: a grid cell size is searched until the wood fits
    its triangle budget.

Output:
  <out>/trees.js        window.APEX_TREES = {name: {h, r, tex, lod: {hi, lo}}} with quantised meshes in base64
  <out>/<slug>.jpg      256x512 texture atlas (power of two so every WebGL version can mip-map it)

The result is deterministic (fixed card order, no random numbers), so re-running gives identical files.
Needs numpy, scipy and Pillow. The converter is a build-time tool; the game does not run any of it.
"""
import argparse
import base64
import collections
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

# In the source atlases the OBJ "v" coordinate counts from the TOP of the image. Leaf triangles sample the
# upper half of the atlas (v below this), bark triangles the lower half.
LEAF_V_MAX = 0.5
CARD_INSET = 0.94      # card UVs are shrunk slightly so mip-mapping never pulls in the next cell's border
MAX_CARD_SCALE = 1.9   # limit for scaling kept cards up to make up for the dropped ones
TEX_SIZE = (256, 512)


def slug(name):
    """File name stem for a tree: lower case, single underscores (Bark___S -> bark_s)."""
    return '_'.join(part for part in name.lower().split('_') if part)
LEAF_UP_BIAS = 0.7     # leaf normals lean upwards so the underside of a crown is not pitch black
POS_QUANT = 65535

# Triangle budgets per tree: wood = (hi, lo) triangles, cards = (hi, lo) leaf cards (2 triangles each).
TREES = collections.OrderedDict([
    ('Walnut_L', dict(wood=(260, 110), cards=(300, 110))),   # 14 m round autumn tree
    ('Mossy_Tr', dict(wood=(360, 150), cards=(300, 110))),   # 25 m tall trunk, dome crown
    ('Bark___S', dict(wood=(200, 90), cards=(300, 110))),    # 13 m cone shaped
    ('Bark___0', dict(wood=(300, 130), cards=(300, 110))),   # 18 m layered, narrow
    ('Bottom_T', dict(wood=(400, 160), cards=(300, 110))),   # 47 m forest giant with buttress roots
    ('Sonnerat', dict(wood=(300, 130), cards=(300, 110))),   # 11 m flat-topped, wide
    ('Bark___1', dict(wood=(300, 130), cards=(300, 110))),   # 37 m tall forest tree
    ('Oak_Leav', dict(wood=(150, 70), cards=(300, 110))),    # 2.7 m shrub
])


def read_obj(path):
    """Return (positions, uvs, {object: (corner position indices, corner uv indices)}), triangles only."""
    V, VT, objs, cur = [], [], collections.OrderedDict(), None
    with open(path, 'r', errors='ignore') as f:
        for ln in f:
            if ln.startswith('v '):
                x = ln.split(); V.append((float(x[1]), float(x[2]), float(x[3])))
            elif ln.startswith('vt '):
                x = ln.split(); VT.append((float(x[1]), float(x[2])))
            elif ln.startswith('o '):
                cur = ln.split()[1]; objs[cur] = ([], [])
            elif ln.startswith('f '):
                corners = [a.split('/') for a in ln.split()[1:]]
                if len(corners) != 3:
                    raise ValueError('only triangulated OBJ files are supported')
                objs[cur][0].append([int(c[0]) - 1 for c in corners])
                objs[cur][1].append([int(c[1]) - 1 for c in corners])
    return np.array(V), np.array(VT), {k: (np.array(a), np.array(b)) for k, (a, b) in objs.items()}


def weld_components(corner_pos):
    """Label every triangle with its connected component. corner_pos is (n, 3, 3) corner positions."""
    key = np.round(corner_pos.reshape(-1, 3) / 1e-3).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.reshape(-1, 3)
    n = inv.max() + 1
    rows = np.concatenate([inv[:, 0], inv[:, 1]]); cols = np.concatenate([inv[:, 1], inv[:, 2]])
    _, lab = connected_components(coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n)), directed=False)
    return lab[inv[:, 0]]


def farthest_points(pts, k):
    """Indices of k well spread points (greedy farthest-point sampling, starts at index 0)."""
    chosen = [0]
    d = np.linalg.norm(pts - pts[0], axis=1)
    for _ in range(min(k, len(pts)) - 1):
        i = int(d.argmax()); chosen.append(i)
        d = np.minimum(d, np.linalg.norm(pts - pts[i], axis=1))
    return chosen


def extract_cards(corner_pos, corner_uv):
    """Collapse every leaf card (a 3x3 vertex grid) to its 4 corners: (quads (n,4,3), uv (n,4,2))
    ordered (u min, v min), (u max, v min), (u max, v max), (u min, v max)."""
    comp = weld_components(corner_pos)
    quads, uvs, skipped = [], [], 0
    order = np.argsort(comp, kind='stable')
    bounds = np.flatnonzero(np.diff(comp[order])) + 1
    for idx in np.split(order, bounds):
        p = corner_pos[idx].reshape(-1, 3); uv = corner_uv[idx].reshape(-1, 2)
        lo, hi = uv.min(axis=0), uv.max(axis=0); eps = 1e-3
        q, quv = [], []
        for cu, cv in ((lo[0], lo[1]), (hi[0], lo[1]), (hi[0], hi[1]), (lo[0], hi[1])):
            hit = np.flatnonzero((np.abs(uv[:, 0] - cu) < eps) & (np.abs(uv[:, 1] - cv) < eps))
            if not len(hit):
                break
            q.append(p[hit[0]]); quv.append((cu, cv))
        if len(q) != 4:
            skipped += 1; continue
        quads.append(q); uvs.append(quv)
    return np.array(quads), np.array(uvs), skipped


def cluster_wood(corner_pos, corner_uv, target):
    """Vertex-clustering decimation to at most `target` triangles. Returns (positions, uvs, triangles)."""
    pos = corner_pos.reshape(-1, 3); uv = corner_uv.reshape(-1, 2)
    lo = pos.min(axis=0)

    def run(cell):
        q = np.floor((pos - lo) / cell).astype(np.int64)
        key = (q[:, 0] * (q[:, 1].max() + 1) + q[:, 1]) * (q[:, 2].max() + 1) + q[:, 2]
        _, inv = np.unique(key, return_inverse=True)
        tri = inv.reshape(-1, 3)
        tri = tri[(tri[:, 0] != tri[:, 1]) & (tri[:, 1] != tri[:, 2]) & (tri[:, 0] != tri[:, 2])]
        srt = np.sort(tri, axis=1)
        _, first = np.unique(srt, axis=0, return_index=True)
        return inv, tri[np.sort(first)]

    a, b = 0.02, 6.0                       # cell size search range in metres
    for _ in range(22):
        mid = (a * b) ** 0.5
        if len(run(mid)[1]) > target:
            a = mid
        else:
            b = mid
    inv, tri = run(b)
    n = inv.max() + 1
    cnt = np.bincount(inv, minlength=n).astype(np.float64)
    p = np.stack([np.bincount(inv, pos[:, k], minlength=n) / cnt for k in range(3)], axis=1)
    t = np.stack([np.bincount(inv, uv[:, k], minlength=n) / cnt for k in range(2)], axis=1)
    keep = np.unique(tri)                  # drop clusters no triangle uses any more
    remap = np.full(n, -1); remap[keep] = np.arange(len(keep))
    return p[keep], t[keep], remap[tri], b


def smooth_normals(p, tri):
    n = np.zeros_like(p)
    fn = np.cross(p[tri[:, 1]] - p[tri[:, 0]], p[tri[:, 2]] - p[tri[:, 0]])
    for k in range(3):
        np.add.at(n, tri[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    return np.where(ln > 1e-9, n / np.maximum(ln, 1e-9), [0, 1, 0])


def build_lod(name, wood, cards, n_cards, wood_tris, crown):
    """Assemble one LOD from the full-resolution wood and card sets."""
    wp, wt, wtri, cell = cluster_wood(wood[0], wood[1], wood_tris)
    wn = smooth_normals(wp, wtri)

    quads, quv = cards
    keep = farthest_points(quads.mean(axis=1), n_cards)
    quads, quv = quads[keep], quv[keep]
    scale = min(MAX_CARD_SCALE, (len(cards[0]) / len(keep)) ** 0.5)
    mid = quads.mean(axis=1, keepdims=True)
    quads = mid + (quads - mid) * scale
    uvmid = quv.mean(axis=1, keepdims=True)
    quv = uvmid + (quv - uvmid) * CARD_INSET
    # leaves are lit as a soft blob: normals point away from the crown centre (leaning up, see LEAF_UP_BIAS), and each card is wound to agree
    # with them so the double sided material does not flip the lighting on the outer face
    nrm = quads - crown + np.array([0.0, LEAF_UP_BIAS, 0.0]) * np.linalg.norm(quads - crown, axis=2, keepdims=True)
    nrm /= np.maximum(np.linalg.norm(nrm, axis=2, keepdims=True), 1e-9)
    cp, ct, cn, ci = [], [], [], []
    for q, uv, nv in zip(quads, quv, nrm):
        base = len(cp)
        order = (0, 1, 2, 3)
        geo = np.cross(q[1] - q[0], q[2] - q[0])
        if np.dot(geo, nv.mean(axis=0)) < 0:
            order = (0, 3, 2, 1)
        for k in order:
            cp.append(q[k]); ct.append(uv[k]); cn.append(nv[k])
        ci += [(base, base + 1, base + 2), (base, base + 2, base + 3)]
    cp, ct, cn, ci = np.array(cp), np.array(ct), np.array(cn), np.array(ci)

    pos = np.concatenate([wp, cp]); uv = np.concatenate([wt, ct]); nor = np.concatenate([wn, cn])
    tri = np.concatenate([wtri, ci + len(wp)])
    uv = np.stack([uv[:, 0], 1.0 - uv[:, 1]], axis=1)     # OBJ v counts from the top; three.js flipY textures from the bottom
    return pos, uv, nor, tri, dict(woodTris=len(wtri), cards=len(keep), cell=round(float(cell), 3), cardScale=round(float(scale), 2))


def encode(pos, uv, nor, tri):
    lo, hi = pos.min(axis=0), pos.max(axis=0)
    span = np.maximum(hi - lo, 1e-6)
    q = np.round((pos - lo) / span * POS_QUANT).astype('<u2')
    u = np.round(np.clip(uv, 0, 1) * 65535).astype('<u2')
    n = np.round(np.clip(nor, -1, 1) * 127).astype('i1')
    n_bytes = n.tobytes()
    if len(n_bytes) % 2:
        n_bytes += b'\0'
    blob = q.tobytes() + u.tobytes() + n_bytes + tri.astype('<u2').tobytes()
    return dict(v=int(len(pos)), i=int(tri.size), min=[round(float(x), 4) for x in lo], max=[round(float(x), 4) for x in hi],
                b=base64.b64encode(blob).decode('ascii'))


def convert(src, out):
    V, VT, objs = read_obj(os.path.join(src, 'trees9.obj'))
    os.makedirs(out, exist_ok=True)
    result, report = collections.OrderedDict(), []
    for name, cfg in TREES.items():
        F, T = objs[name]
        cpos, cuv = V[F], VT[T]
        is_leaf = cuv.mean(axis=1)[:, 1] < LEAF_V_MAX
        # centre the tree on its trunk: x/z from the lowest wood vertices, y stays as modelled (0 = ground)
        wood_pos = cpos[~is_leaf].reshape(-1, 3)
        low = wood_pos[wood_pos[:, 1] < wood_pos[:, 1].min() + 0.08 * (wood_pos[:, 1].max() - wood_pos[:, 1].min())]
        shift = np.array([low[:, 0].mean(), 0.0, low[:, 2].mean()])
        cpos = cpos - shift
        quads, quv, skipped = extract_cards(cpos[is_leaf], cuv[is_leaf])
        crown = quads.reshape(-1, 3).mean(axis=0)
        lods, info = collections.OrderedDict(), {}
        for lod, k in (('hi', 0), ('lo', 1)):
            pos, uv, nor, tri, meta = build_lod(name, (cpos[~is_leaf], cuv[~is_leaf]), (quads, quv),
                                                cfg['cards'][k], cfg['wood'][k], crown)
            lods[lod] = encode(pos, uv, nor, tri)
            info[lod] = dict(meta, tris=len(tri), verts=len(pos))
        allp = cpos.reshape(-1, 3)
        height = float(allp[:, 1].max())
        radius = float(np.abs(allp[:, [0, 2]]).max())
        result[name] = dict(h=round(height, 2), r=round(radius, 2), tex=slug(name) + '.jpg', lod=lods)
        report.append((name, round(height, 1), round(radius, 1), len(quads), skipped, info))
        im = Image.open(os.path.join(src, 'Texture', name + '.jpg')).convert('RGB').resize(TEX_SIZE, Image.LANCZOS)
        im.save(os.path.join(out, slug(name) + '.jpg'), quality=72, optimize=True)
    js = os.path.join(out, 'trees.js')
    with open(js, 'w') as f:
        f.write('/* Generated by tools/convert_trees.py from the "22 trees" pack: do not edit by hand.\n'
                '   Quantised meshes, see the TreeKit loader in index.html for the layout. */\n')
        f.write('window.APEX_TREES=' + json.dumps(result, separators=(',', ':')) + ';\n')
    for name, h, r, nc, sk, info in report:
        print('%-9s h=%5.1f m r=%5.1f m cards=%4d (skipped %d)  hi %4d tris / %4d verts  lo %4d tris / %4d verts' % (
            name, h, r, nc, sk, info['hi']['tris'], info['hi']['verts'], info['lo']['tris'], info['lo']['verts']))
    print('wrote %s (%d KB)' % (js, os.path.getsize(js) // 1024))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src', help='folder containing trees9.obj and Texture/')
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'trees'))
    a = ap.parse_args()
    convert(a.src, os.path.abspath(a.out))
