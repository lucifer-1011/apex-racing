#!/usr/bin/env python3
"""Convert the "moto_simple" retro roadster OBJ into the Iron Stallion bike model used by the game.

    python3 tools/convert_moto.py <path to moto_simple_1.obj> [--out assets/bikes/moto.js]

The source is a ~11,650 triangle OBJ made of 29 named objects, all with flat grey materials. This tool:

  * turns it into game space: metres, forward = +z, up = +y, +x = the bike's left side, origin on the ground
    midway between the two axles, scaled so the wheel radius is WHEEL_R (the cruiser's physics radius);
  * drops the ground plane (object "Plane");
  * splits it into the parts the game moves separately: `body`, `steer` (forks, bars, headlight, gauges,
    front indicators, front fender: they turn with the bars), `fw` and `rw` (the wheels, spun about x);
  * paints every triangle with a game material slot (see SLOTS below), including two-tone paint bands that are
    cut into the mesh along planes (tank knee panel with a pinstripe, fender centre stripes, fork sliders);
  * builds two levels of detail with quadric-error edge-collapse decimation, `hi` for desktop and `lo` for
    touch devices (the wheels and the many-sided cylinders are where the triangles go);
  * computes smooth normals with a crease angle, so cylinders look round and box edges stay sharp;
  * measures anchor points (axles, steering axis, headlight lens, shocks, grips, seat outline...) that the game
    uses to place the extra procedural detail and to fit the rider.

Part frames: `body` is bike space. `steer` is relative to the steering pivot (top of the forks) and rotated so the
steering axis is +y (the game tilts the steer group by `rake`). `fw` is relative to the front axle in the steer
frame, `rw` relative to the rear axle.

Output: one JS file, window.APEX_MOTO = {src, scale, anchors, tris, lod: {hi: [mesh], lo: [mesh]}} where every mesh
is {p: part, s: slot, v, i, min, max, b}; b is base64 of positions (uint16 x3, scaled into min..max), normals
(int8 x3, padded to an even length) and triangle indices (uint16). See MotoKit in index.html.

Deterministic (no random numbers, stable ordering): re-running gives an identical file. Needs Python 3 and numpy.
Run it with `python3 -I` when the OBJ comes from a download. Build-time only; the game does not run any of it.
"""
import argparse
import base64
import collections
import heapq
import json
import math
import os

import numpy as np

WHEEL_R = 0.34          # wheel radius in metres after scaling (BIKES.cruiser.R)
CREASE_DEG = 38.0       # faces meeting at a sharper angle than this keep a hard edge
SEAT_PIPING = (.798, .031, .009)   # seat piping band: height at z = 0, rise per metre toward the back, width
FENDER_STRIPE = .008    # half width in metres of the pinstripe along the top of the fenders
POS_QUANT = 65535

# Which game part every source object belongs to (by name prefix). Anything not listed is `body`.
PARTS = [('Front_wheel', 'fw'), ('Rear_wheel', 'rw'),
         ('Front_bumper', 'steer'), ('Steering', 'steer'), ('Brake', 'steer'), ('Headlight', 'steer'),
         ('Gauges', 'steer'), ('Front_lights', 'steer'), ('Front_water', 'steer')]
DROP = ('Plane',)

# Triangle budget per object as a fraction of the source count: (hi, lo). Default (1, .6).
BUDGET = {'Front_wheel_Cylinder': (.3, .14), 'Rear_wheel_Cylinder': (.3, .14),
          'Exhaust': (.45, .22), 'Steering': (.35, .15), 'Engine_1': (.75, .4), 'Headlight': (.55, .26),
          'Engine_5': (.55, .26), 'Gauges': (.55, .25), 'Engine_4': (.8, .4), 'Rear_light': (.8, .45),
          'Front_lights': (.8, .45), 'Brake': (.7, .35), 'Engine_6': (.8, .45)}
# Decimation stops early when the cheapest collapse would move the surface more than this (metres, summed over the
# planes around the vertex), so detail such as the cylinder fins survives. The wheels (round and seen in motion) may go
# further on touch devices.
MAX_ERR = {'hi': .012, 'lo': .03}
MAX_ERR_WHEEL_LO = .06

# Material slots the game maps to its materials (makeMats in index.html):
#   paint / accent / trim = the bike's three colours (col1, col2, col3, or the alt / multiplayer scheme)
#   dark, metal (brushed alloy), chrome, tire, seat, plate, gauge, head (lit headlight lens), tail (lit tail lens),
#   indFL / indFR (front indicator lenses, +x = left)
SLOTS = ('paint', 'accent', 'trim', 'dark', 'metal', 'chrome', 'tire', 'seat', 'plate', 'gauge', 'head', 'tail',
         'indFL', 'indFR')


def obj_key(name):
    """Source object name without Blender's mesh suffix: Exhaust_left_Cylinder.027 -> Exhaust_left_Cylinder."""
    return name.split('.')[0]


def read_obj(path):
    """Return (positions (n,3), {object: [(material, [corner position indices])]}) for every face."""
    V, objs, cur, mat = [], collections.OrderedDict(), None, None
    with open(path, 'r', errors='ignore') as f:
        for ln in f:
            if ln.startswith('v '):
                x = ln.split(); V.append((float(x[1]), float(x[2]), float(x[3])))
            elif ln.startswith('o '):
                cur = ln.split()[1]; objs[cur] = []
            elif ln.startswith('usemtl'):
                mat = ln.split()[1]
            elif ln.startswith('f '):
                objs[cur].append((mat, [int(a.split('/')[0]) - 1 for a in ln.split()[1:]]))
    return np.array(V, dtype=np.float64), objs


def find(objs, prefix):
    for k in objs:
        if k.startswith(prefix):
            return k
    raise KeyError(prefix)


# ----------------------------------------------------------------------------------------------- geometry basics
def face_normals(T):
    n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    return n / np.maximum(ln, 1e-12), ln[:, 0] * .5


def fan(face):
    return [(face[0], face[k], face[k + 1]) for k in range(1, len(face) - 1)]


def slice_plane(T, S, n, d):
    """Cut triangles T (k,3,3) with slots S along the plane n.p = d. Returns (T, S, side) where side is +1 for
    triangles on the positive side and -1 on the negative side; crossing triangles are split into three."""
    outT, outS, side = [], [], []
    for tri, s in zip(T, S):
        dist = tri @ n - d
        pos = dist > 1e-9
        if pos.all() or (~pos).all():
            outT.append(tri); outS.append(s); side.append(1 if pos.all() else -1); continue
        # the lone vertex is the one on its own side of the plane; keep the winding by rotating it to the front
        lone = int(np.flatnonzero(pos if pos.sum() == 1 else ~pos)[0])
        i0, i1, i2 = lone, (lone + 1) % 3, (lone + 2) % 3
        a, b, c = tri[i0], tri[i1], tri[i2]
        da, db, dc = dist[i0], dist[i1], dist[i2]
        ab = a + (b - a) * (da / (da - db))
        ac = a + (c - a) * (da / (da - dc))
        sa = 1 if da > 0 else -1
        for t, sd in (((a, ab, ac), sa), ((ab, b, c), -sa), ((ab, c, ac), -sa)):
            outT.append(np.array(t)); outS.append(s); side.append(sd)
    return np.array(outT), list(outS), np.array(side)


# ------------------------------------------------------------------------------------------------- decimation
def decimate(tris_pos, target, max_err):
    """Quadric-error edge collapse (half-edge collapse onto an existing vertex) of one triangle soup (k,3,3).
    Open boundaries and seams are locked, so pieces decimated separately still meet without cracks.
    Stops at `target` triangles or when the cheapest collapse would move the surface more than `max_err` metres."""
    key = np.round(tris_pos.reshape(-1, 3) * 1e6).astype(np.int64)
    uniq, inv = np.unique(key, axis=0, return_inverse=True)
    P = np.zeros((len(uniq), 3))
    np.add.at(P, inv, tris_pos.reshape(-1, 3))
    P /= np.bincount(inv, minlength=len(uniq))[:, None]
    F = [list(t) for t in inv.reshape(-1, 3)]
    F = [f for f in F if len(set(f)) == 3]
    if len(F) <= target:
        return np.array([[P[i] for i in f] for f in F]).reshape(-1, 3, 3)
    nv = len(P)
    vf = [set() for _ in range(nv)]
    for fi, f in enumerate(F):
        for v in f:
            vf[v].add(fi)
    edges = collections.Counter()
    for f in F:
        for k in range(3):
            a, b = f[k], f[(k + 1) % 3]
            edges[(min(a, b), max(a, b))] += 1
    locked = np.zeros(nv, bool)
    for (a, b), c in edges.items():
        if c != 2:
            locked[a] = locked[b] = True
    Q = np.zeros((nv, 4, 4))
    for f in F:
        p0, p1, p2 = P[f[0]], P[f[1]], P[f[2]]
        n = np.cross(p1 - p0, p2 - p0); ln = np.linalg.norm(n)
        if ln < 1e-14:
            continue
        n /= ln; pl = np.append(n, -n @ p0)
        q = np.outer(pl, pl)                    # sum of squared distances to the original planes
        for v in f:
            Q[v] += q
    alive = [True] * len(F)
    nfaces = len(F)
    stamp = [0] * nv

    def cost(u, v):
        """Cost of moving u onto v (v kept)."""
        if locked[u]:
            return None
        h = np.append(P[v], 1.0)
        return max(float(h @ (Q[u] + Q[v]) @ h), 0.0)

    heap = []

    def push(a, b):
        for u, v in ((a, b), (b, a)):
            c = cost(u, v)
            if c is not None:
                heapq.heappush(heap, (c, u, v, stamp[u], stamp[v]))
    for (a, b) in sorted(edges):
        push(a, b)
    lim = max_err * max_err
    while nfaces > target and heap:
        c, u, v, su, sv = heapq.heappop(heap)
        if su != stamp[u] or sv != stamp[v] or locked[u]:
            continue
        if c > lim:
            break
        shared = vf[u] & vf[v]
        if not shared:
            continue
        # link condition: u and v may share only the two vertices of their common faces
        nu = {w for fi in vf[u] for w in F[fi]} - {u}
        nvv = {w for fi in vf[v] for w in F[fi]} - {v}
        if len(nu & nvv) != 2:
            continue
        ok = True
        for fi in vf[u] - shared:
            f = F[fi]
            old = [P[w] for w in f]
            new = [P[v] if w == u else P[w] for w in f]
            n0 = np.cross(old[1] - old[0], old[2] - old[0]); n1 = np.cross(new[1] - new[0], new[2] - new[0])
            l0, l1 = np.linalg.norm(n0), np.linalg.norm(n1)
            if l1 < 1e-12 or (l0 > 1e-12 and n0 @ n1 < 0.5 * l0 * l1):
                ok = False; break
        if not ok:
            continue
        for fi in shared:
            alive[fi] = False; nfaces -= 1
            for w in F[fi]:
                vf[w].discard(fi)
        for fi in list(vf[u]):
            F[fi] = [v if w == u else w for w in F[fi]]
            vf[v].add(fi)
        vf[u] = set()
        Q[v] += Q[u]
        stamp[v] += 1
        ring = {w for fi in vf[v] for w in F[fi]} - {v}
        for w in ring:
            stamp[w] += 1
        for w in sorted(ring):
            push(v, w)
            for fi in vf[w]:
                for x in F[fi]:
                    if x != w and x != v:
                        push(w, x)
    out = [[P[w] for w in F[fi]] for fi in range(len(F)) if alive[fi]]
    return np.array(out).reshape(-1, 3, 3)


# --------------------------------------------------------------------------------------------- normals & encode
def crease_normals(T):
    """Per-corner normals: average of the area-weighted normals of the faces around a vertex that are within the
    crease angle of this face. T is (k,3,3)."""
    fn, area = face_normals(T)
    key = np.round(T.reshape(-1, 3) * 1e5).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.reshape(-1, 3)
    around = collections.defaultdict(list)
    for fi in range(len(T)):
        for k in range(3):
            around[inv[fi, k]].append(fi)
    cs = math.cos(math.radians(CREASE_DEG))
    N = np.zeros_like(T)
    for fi in range(len(T)):
        for k in range(3):
            acc = np.zeros(3)
            for fj in around[inv[fi, k]]:
                if fn[fj] @ fn[fi] >= cs:
                    acc += fn[fj] * max(area[fj], 1e-9)
            ln = np.linalg.norm(acc)
            N[fi, k] = acc / ln if ln > 1e-12 else fn[fi]
    return N


def encode(T, N):
    """Index the corners (same position and normal = one vertex) and pack them like assets/trees/trees.js."""
    pos = T.reshape(-1, 3); nor = np.round(np.clip(N.reshape(-1, 3), -1, 1) * 127).astype(np.int8)
    lo, hi = pos.min(axis=0), pos.max(axis=0)
    span = np.maximum(hi - lo, 1e-6)
    q = np.round((pos - lo) / span * POS_QUANT).astype('<u2')
    keyed = np.concatenate([q.astype(np.int64), nor.astype(np.int64)], axis=1)
    uniq, first, inv = np.unique(keyed, axis=0, return_index=True, return_inverse=True)
    order = np.argsort(first)                    # keep first-use order (stable and cache friendly)
    rank = np.empty_like(order); rank[order] = np.arange(len(order))
    qv = q[first[order]]; nv = nor[first[order]]
    idx = rank[inv.reshape(-1)].reshape(-1, 3)
    idx = idx[(idx[:, 0] != idx[:, 1]) & (idx[:, 1] != idx[:, 2]) & (idx[:, 0] != idx[:, 2])]
    if len(qv) > 65535:
        raise ValueError('mesh too big for 16 bit indices')
    nb = nv.tobytes()
    if len(nb) % 2:
        nb += b'\0'
    blob = qv.tobytes() + nb + idx.astype('<u2').tobytes()
    return dict(v=int(len(qv)), i=int(idx.size), min=[round(float(x), 5) for x in lo], max=[round(float(x), 5) for x in hi],
                b=base64.b64encode(blob).decode('ascii')), len(idx)


# ------------------------------------------------------------------------------------------------- the model
class Model:
    def __init__(self, path):
        V, self.objs = read_obj(path)
        fw, rw = self.raw_bounds(V, 'Front_wheel_Cylinder'), self.raw_bounds(V, 'Rear_wheel_Cylinder')
        # source axes: length along x with the front toward -x, up = y, axles along z
        r_src = (fw[1][1] - fw[0][1]) / 2
        self.ground = fw[0][1]
        self.xmid = ((fw[0][0] + fw[1][0]) / 2 + (rw[0][0] + rw[1][0]) / 2) / 2
        self.K = WHEEL_R / r_src
        self.V = self.to_game(V)
        self.axleF = np.array([0.0, WHEEL_R, (self.xmid - (fw[0][0] + fw[1][0]) / 2) * self.K])
        self.axleR = np.array([0.0, WHEEL_R, (self.xmid - (rw[0][0] + rw[1][0]) / 2) * self.K])

    def raw_bounds(self, V, prefix):
        idx = sorted({i for m, f in self.objs[find(self.objs, prefix)] for i in f})
        return V[idx].min(axis=0), V[idx].max(axis=0)

    def to_game(self, p):
        return np.stack([p[:, 2] * self.K, (p[:, 1] - self.ground) * self.K, (self.xmid - p[:, 0]) * self.K], axis=1)

    def tris(self, prefix):
        """(triangles (k,3,3), source material per triangle, source face index per triangle) of one object, fan triangulated."""
        T, M, G = [], [], []
        for gi, (m, f) in enumerate(self.objs[find(self.objs, prefix)]):
            for t in fan(f):
                T.append(self.V[list(t)]); M.append(m); G.append(gi)
        return np.array(T), M, np.array(G)

    def ngons(self, prefix, min_sides=9):
        """Centre, normal and radius of the big flat n-gons (cylinder caps) of an object."""
        out = []
        for m, f in self.objs[find(self.objs, prefix)]:
            if len(f) >= min_sides:
                p = self.V[f]; c = p.mean(axis=0)
                n = np.cross(p[1] - p[0], p[2] - p[0]); n /= np.linalg.norm(n)
                out.append((c, n, float(np.linalg.norm(p - c, axis=1).mean()), m))
        return out


def paint(md):
    """Every object as a list of (name, part, triangles, slots). This is where the bike gets its colours."""
    out = []

    def add(name, T, S):
        part = next((p for pre, p in PARTS if name.startswith(pre)), 'body')
        out.append((name, part, T, list(S)))

    for name in md.objs:
        key = obj_key(name)
        if key.startswith(DROP):
            continue
        T, M, G = md.tris(key)
        C = T.mean(axis=1)
        fn, _ = face_normals(T)
        S = []
        for k, m in enumerate(M):
            s = 'metal'
            if key.startswith(('Front_wheel', 'Rear_wheel')):
                axle = md.axleF if key.startswith('Front') else md.axleR
                r = math.hypot(C[k, 1] - axle[1], C[k, 2] - axle[2])
                if 'inside' in key:
                    s = 'chrome'                                   # spokes
                elif r > WHEEL_R * .865:
                    s = 'tire'
                elif r > WHEEL_R * .6:
                    s = 'dark'                                     # dark rim
                else:
                    s = 'chrome' if m == 'tire' else 'metal'       # chrome hub, alloy hub caps
            elif key.startswith('Exhaust'):
                s = 'chrome'
            elif key.startswith('Rear_light'):
                s = 'tail' if m == 'rear_light' else 'chrome'
            elif key.startswith('Licence_plate'):
                s = 'plate' if abs(fn[k, 2]) > .7 else 'dark'
            elif key.startswith('Engine_1'):
                s = 'metal'                                        # finned barrel and head
            elif key.startswith('Engine_2'):
                s = 'dark'                                         # crankcase
            elif key.startswith('Engine_3'):
                s = 'paint' if abs(fn[k, 0]) > .6 else 'dark'      # side panels in body colour
            elif key.startswith('Engine_4'):
                s = 'chrome'                                       # round engine covers
            elif key.startswith('Engine_5'):
                s = 'chrome'                                       # carburettor
            elif key.startswith('Engine_6'):
                s = 'dark'                                         # air filter
            elif key.startswith('Main_shaft'):
                s = 'dark'                                         # frame down tube
            elif key.startswith('Headlight'):
                s = 'head' if m == 'front_light' else 'dark'       # black bucket (bezel and lens are added by the game)
            elif key.startswith(('Front_water', 'Rear_water')):
                s = 'paint'                                        # fenders
            elif key.startswith(('Rear_bumper', 'rea_bumper')):
                s = 'chrome'                                       # rear shock bodies (the game adds springs)
            elif key.startswith('Front_bumper'):
                s = 'chrome'                                       # fork legs: chrome stanchions, alloy sliders below
            elif key.startswith('Steering'):
                s = 'seat' if m == 'seat' else 'chrome'            # rubber grips, chrome bars
            elif key.startswith('Brake'):
                s = 'chrome'                                       # levers
            elif key.startswith('Gauges'):
                s = 'gauge' if m == 'gauge' else 'chrome'
            elif key.startswith('Front_lights'):
                s = ('indFL' if C[k, 0] > 0 else 'indFR') if m == 'flash' else 'dark'
            elif key.startswith('Seat'):
                s = 'seat'
            elif key.startswith('Gas_Tank'):
                s = 'paint'
            S.append(s)

        add(key, T, S)
    return out


def paint_bands(md, key, T, S):
    """Paint bands cut into an object along planes, applied after decimation so the cuts stay clean and cheap:
    two-tone tank with a pinstripe, fender pinstripes, seat piping, fork sliders. Returns (T, S)."""
    S = list(S)
    if key.startswith('Gas_Tank'):
        # two-tone tank: accent knee panel below a line that rises toward the front, a pinstripe on that line
        n = np.array([0.0, 1.0, -.09]); n /= np.linalg.norm(n)
        d0 = n @ np.array([0, .868, 0])
        T, S, side = slice_plane(T, S, n, d0)
        S = ['accent' if sd < 0 else s for s, sd in zip(S, side)]
        T, S, side = slice_plane(T, S, n, d0 + .014)
        S = ['trim' if (sd < 0 and s == 'paint') else s for s, sd in zip(S, side)]
    elif key.startswith(('Front_water', 'Rear_water')):
        # a centre pinstripe on both fenders: cut at x = +-STRIPE, the outer (top) faces in between turn trim
        for x0 in (FENDER_STRIPE, -FENDER_STRIPE):
            T, S, _ = slice_plane(T, S, np.array([1.0, 0, 0]), x0)
        Cc, fnn = T.mean(axis=1), face_normals(T)[0]
        S = ['trim' if (s == 'paint' and abs(c[0]) < FENDER_STRIPE and n[1] > -.2) else s for s, c, n in zip(S, Cc, fnn)]
    elif key.startswith('Seat'):
        # piping: a band around the sides of the seat just under the top bevel; the seat rises toward the back
        n = np.array([0.0, 1.0, SEAT_PIPING[1]]); n /= np.linalg.norm(n)
        d0 = n @ np.array([0, SEAT_PIPING[0], 0])
        for d in (d0, d0 + SEAT_PIPING[2]):
            T, S, _ = slice_plane(T, S, n, d)
        Cc, fnn = T.mean(axis=1), face_normals(T)[0]
        S = ['trim' if (abs(f[1]) < .5 and d0 < n @ c < d0 + SEAT_PIPING[2]) else s for s, c, f in zip(S, Cc, fnn)]
    elif key.startswith('Front_bumper'):
        # chrome stanchions above, brushed alloy sliders below (cut across the fork axis)
        caps = md.ngons(key)
        top = max(caps, key=lambda c: c[0][1])[0]; bot = min(caps, key=lambda c: c[0][1])[0]
        ax = (top - bot) / np.linalg.norm(top - bot)
        T, S, side = slice_plane(T, S, ax, ax @ (bot + (top - bot) * .36))
        S = ['metal' if sd < 0 else s for s, sd in zip(S, side)]
    return T, S


def anchors(md):
    """Points the game needs (bike space, metres), rounded to millimetres."""
    A = {}
    caps = {}
    for side, name in (('L', 'Front_bumper_right'), ('R', 'Front_bumper_left')):
        c = sorted(md.ngons(name), key=lambda c: c[0][1])
        caps[side] = (c[0][0], c[-1][0], c[0][2])            # bottom, top, radius
    top = (caps['L'][1] + caps['R'][1]) / 2; bot = (caps['L'][0] + caps['R'][0]) / 2
    axis = (top - bot) / np.linalg.norm(top - bot)
    rake = math.atan2(axis[2], axis[1])                       # rotation about x that takes +y onto the steering axis
    pivot = top - axis * .02
    A.update(wb=float(md.axleF[2] - md.axleR[2]), R=WHEEL_R, axleF=md.axleF, axleR=md.axleR, pivot=pivot, rake=rake,
             forkR=caps['L'][2], forkTop=[caps['L'][1], caps['R'][1]], forkBot=[caps['L'][0], caps['R'][0]])
    # headlight lens
    lens = [c for c in md.ngons('Headlight') if c[3] == 'front_light'][0]
    A.update(lens=lens[0], lensN=lens[1] if lens[1][2] > 0 else -lens[1], lensR=lens[2])
    # rear shocks: (bottom, top) per side
    sh = []
    for name in ('rea_bumper_right', 'Rear_bumper_left'):
        c = sorted(md.ngons(name), key=lambda c: c[0][1]); sh.append([c[0][0], c[-1][0]])
    A.update(shock=sh, shockR=sorted(md.ngons('Rear_bumper_left'), key=lambda c: c[0][1])[0][2])
    # grips: the two end caps of the bars
    g = sorted([c for c in md.ngons('Steering', 30)], key=lambda c: -c[0][0])
    A.update(grip=[g[0][0], g[-1][0]])
    # tank: top centre (fuel cap) and side badge points
    T, _, _ = md.tris('Gas_Tank'); P = T.reshape(-1, 3)
    topi = P[:, 1] > P[:, 1].max() - .02
    A['tankTop'] = np.array([0.0, P[:, 1].max(), float(P[topi, 2].mean())])
    mid = (P[:, 1] > .9) & (P[:, 1] < .95)
    A['tankSide'] = np.array([float(np.abs(P[mid, 0]).max()), .925, float(P[mid, 2].mean())])
    T, _, _ = md.tris('Seat'); P = T.reshape(-1, 3)
    A['seatFront'] = np.array([0.0, float(P[P[:, 2] > P[:, 2].max() - .05, 1].max()), float(P[:, 2].max())])
    A['seatTop'] = float(P[:, 1].max())
    # engine box (for pegs, sprocket, kick stand), rear light, exhaust tips
    lo = np.full(3, 9.0); hi = np.full(3, -9.0)
    for k in ('Engine_2', 'Engine_3', 'Engine_4'):
        T, _, _ = md.tris(k); P = T.reshape(-1, 3); lo = np.minimum(lo, P.min(axis=0)); hi = np.maximum(hi, P.max(axis=0))
    A.update(engMin=lo, engMax=hi)
    tail = [c for c in md.ngons('Rear_light', 9) if c[3] == 'rear_light']
    A['tail'] = min(tail, key=lambda c: c[0][2])[0] if tail else np.array([0, .68, -1.04])
    T, _, _ = md.tris('Rear_water'); P = T.reshape(-1, 3)
    A['fenderR'] = [P.min(axis=0), P.max(axis=0)]
    tips = []
    for k in ('Exhaust_left', 'Exhaust_right'):
        T, _, _ = md.tris(k); P = T.reshape(-1, 3); i = P[:, 2].argmin(); tips.append(P[i])
    A['exhaustTip'] = tips

    def rnd(x):
        if isinstance(x, np.ndarray):
            return [round(float(v), 4) for v in x]
        if isinstance(x, (list, tuple)):
            return [rnd(v) for v in x]
        return round(float(x), 4)
    return {k: rnd(v) for k, v in A.items()}


def to_frame(T, part, A):
    """Move a part's triangles into its own frame (see the module doc)."""
    if part == 'body':
        return T
    c, s = math.cos(-A['rake']), math.sin(-A['rake'])
    Rx = np.array([[1, 0, 0], [0, c, -s], [0, s, c]])          # undo the rake
    if part == 'rw':
        return T - np.array(A['axleR'])
    T = (T - np.array(A['pivot'])) @ Rx.T
    if part == 'fw':
        return T - (np.array(A['axleF']) - np.array(A['pivot'])) @ Rx.T
    return T


def build(src):
    md = Model(src)
    A = anchors(md)
    c, s = math.cos(-A['rake']), math.sin(-A['rake'])
    A['fwPos'] = [round(float(v), 4) for v in (np.array([[1, 0, 0], [0, c, -s], [0, s, c]]) @ (np.array(A['axleF']) - np.array(A['pivot'])))]
    objs = paint(md)
    lods, tris, report = {}, {}, []
    for li, lod in enumerate(('hi', 'lo')):
        groups = collections.OrderedDict()
        for name, part, T, S in objs:
            frac = next((v for pre, v in BUDGET.items() if name.startswith(pre)), (1.0, .6))[li]
            S = np.array(S)
            # decimate per slot so paint borders stay exact; budget split by triangle share
            DT, DS = [], []
            for slot in [x for x in SLOTS if x in set(S)]:
                sub = T[S == slot]
                target = max(4, int(round(len(sub) * frac)))
                err = MAX_ERR_WHEEL_LO if (lod == 'lo' and part in ('fw', 'rw')) else MAX_ERR[lod]
                dec = decimate(sub, target, err) if frac < 1 else sub
                DT.append(dec); DS += [slot] * len(dec)
            DT, DS = paint_bands(md, name, np.concatenate(DT), DS)
            DS = np.array(DS)
            for slot in [x for x in SLOTS if x in set(DS)]:
                groups.setdefault((part, slot), []).append(DT[DS == slot])
        meshes, total = [], 0
        for (part, slot), lst in groups.items():
            T = np.concatenate(lst)
            N = crease_normals(T)
            T = to_frame(T, part, A)
            c_, s_ = math.cos(-A['rake']), math.sin(-A['rake'])
            if part in ('steer', 'fw'):
                N = N @ np.array([[1, 0, 0], [0, c_, -s_], [0, s_, c_]]).T
            enc, n = encode(T, N)
            enc.update(p=part, s=slot)
            meshes.append(enc); total += n
        lods[lod] = sorted(meshes, key=lambda m: (('body', 'steer', 'fw', 'rw').index(m['p']), SLOTS.index(m['s'])))
        tris[lod] = total
    return dict(src='moto_simple_1.obj', scale=round(md.K, 5), anchors=A, tris=tris, lod=lods)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src', help='path to moto_simple_1.obj')
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'bikes', 'moto.js'))
    a = ap.parse_args()
    data = build(a.src)
    out = os.path.abspath(a.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as f:
        f.write('/* Generated by tools/convert_moto.py from the "moto_simple" retro roadster: do not edit by hand.\n'
                '   Iron Stallion 1200 model, quantised meshes per part and material slot; see MotoKit in index.html. */\n')
        f.write('window.APEX_MOTO=' + json.dumps(data, separators=(',', ':')) + ';\n')
    for lod in ('hi', 'lo'):
        per = collections.Counter()
        for m in data['lod'][lod]:
            per[m['p']] += m['i'] // 3
        print('%s: %5d triangles  %s  (%d meshes)' % (lod, data['tris'][lod], dict(per), len(data['lod'][lod])))
    print('scale %.5f  wheelbase %.3f m  rake %.1f deg' % (data['scale'], data['anchors']['wb'], math.degrees(data['anchors']['rake'])))
    print('wrote %s (%d KB)' % (out, os.path.getsize(out) // 1024))


if __name__ == '__main__':
    main()
