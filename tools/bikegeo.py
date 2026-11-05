#!/usr/bin/env python3
"""Shared geometry kit for the procedural bike generators (tools/build_motocross.py, tools/build_adventure.py).

Triangle soups are filed per (part, material slot) in STORE by put(), with normals smoothed by crease angle; primitives
(lofts, tubes, boxes, extruded outlines, flat graphics, lathes, wheel parts) all go through put(). Q holds the level-of-detail
settings, filled by each generator's set_lod(). raked() gives the steering geometry; make_lod() and write_js() pack the result
in the format decoded by MotoKit.decode in index.html. Not a script: the generators put tools/ on sys.path and import it.
"""
import base64, collections, json, math, os
from types import SimpleNamespace
import numpy as np

PI = math.pi
V = lambda *a: np.array(a, float)
def unit(v): return v / np.linalg.norm(v)

def rx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])

def raked(wb, rf, rr, rake_deg, off, piv_s):
    """Steering geometry: axles F and R, steering axis UAX (up and back), NF (perpendicular, forward), fork line FL(s), steering
    axis AXP(s) (OFF behind the fork line), pivot PIV = AXP(piv_s), ROT (bike space -> steer space, maps UAX to +y) and
    to_part_space() for the parts body, steer (local to PIV), fw (local to F, steer orientation) and rw (local to R)."""
    k = SimpleNamespace(WB=wb, RF=rf, RR=rr, OFF=off)
    k.F = V(0, rf, wb / 2); k.R = V(0, rr, -wb / 2); k.RAKE = math.radians(rake_deg)
    k.UAX = V(0, math.cos(k.RAKE), -math.sin(k.RAKE)); k.NF = V(0, math.sin(k.RAKE), math.cos(k.RAKE))
    k.FL = lambda s: k.F + s * k.UAX
    k.AXP = lambda s: k.F + s * k.UAX - off * k.NF
    k.PIV = k.AXP(piv_s); k.ROT = rx(k.RAKE)
    def to_part_space(part, T, N):
        if part == 'body': return T, N
        if part == 'steer': return (T - k.PIV) @ k.ROT.T, N @ k.ROT.T
        if part == 'fw': return (T - k.F) @ k.ROT.T, N @ k.ROT.T
        return T - k.R, N
    k.to_part_space = to_part_space
    k.anchors = lambda grip: dict(wb=wb, Rf=rf, Rr=rr, axleF=k.F.tolist(), axleR=k.R.tolist(), pivot=[round(float(x), 4) for x in k.PIV],
                                  rake=-k.RAKE, fwPos=[round(float(x), 4) for x in (k.F - k.PIV) @ k.ROT.T], grip=[grip, [-grip[0], grip[1], grip[2]]])
    return k

# ------------------------------------------------------------------------------------------------- level of detail
Q = {}

# ------------------------------------------------------------------------------------------------- mesh store
STORE = collections.defaultdict(list)     # (part, slot) -> list of (tris, normals)

def earclip(P2):
    n = len(P2); idx = list(range(n))
    if sum(P2[i][0] * P2[(i + 1) % n][1] - P2[(i + 1) % n][0] * P2[i][1] for i in range(n)) < 0: idx.reverse()
    out = []; guard = 0
    def inside(p, a, b, c):
        d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1])
        d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1])
        d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1])
        return not ((d1 < -1e-12 or d2 < -1e-12 or d3 < -1e-12) and (d1 > 1e-12 or d2 > 1e-12 or d3 > 1e-12))
    while len(idx) > 3 and guard < 5000:
        guard += 1; done = False
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = P2[i0], P2[i1], P2[i2]
            if (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 1e-14: continue
            if any(inside(P2[j], a, b, c) for j in idx if j not in (i0, i1, i2)): continue
            out.append((i0, i1, i2)); idx.pop(k); done = True; break
        if not done:
            out.append((idx[-1], idx[0], idx[1])); idx.pop(0)
    if len(idx) == 3: out.append(tuple(idx))
    return out

def perp(d):
    d = unit(d); a = V(0, 1, 0) if abs(d[1]) < .9 else V(1, 0, 0)
    u = unit(np.cross(a, d)); return u, np.cross(d, u)

def cap(loop):
    n = len(loop); nr = np.zeros(3)
    for i in range(n): nr += np.cross(loop[i], loop[(i + 1) % n])
    if np.linalg.norm(nr) < 1e-14: return []
    u, w = perp(nr); P2 = np.stack([loop @ u, loop @ w], 1)
    return earclip(P2)

def loft(S, cyclic=False, caps=True, tag=None):
    """Quads between consecutive closed loops (all with the same point count). Returns (triangles, tags)."""
    S = [np.asarray(s, float) for s in S]; n = len(S[0]); ns = len(S); tris = []; tags = []
    for i in range(ns if cyclic else ns - 1):
        A, B = S[i], S[(i + 1) % ns]
        for j in range(n):
            j2 = (j + 1) % n
            a, b, c, d = A[j], A[j2], B[j2], B[j]
            t = tag(i, j) if tag else 0
            tris += [[a, b, c], [a, c, d]]; tags += [t, t]
    if caps and not cyclic:
        for st in (S[0], S[-1]):
            for tri in cap(st): tris.append(st[list(tri)]); tags.append(0)
    return np.array(tris), np.array(tags)

def flip(T): return T[:, [0, 2, 1]]
def fix_vol(T):
    return T if np.einsum('ij,ij->i', T[:, 0], np.cross(T[:, 1], T[:, 2])).sum() >= 0 else flip(T)
def fix_convex(T):
    c = T.reshape(-1, 3).mean(0); n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
    return T if (n * (T.mean(1) - c)).sum() >= 0 else flip(T)
def fix_axis(T, c, d, inward=False):
    d = unit(d); m = T.mean(1) - c; m = m - np.outer(m @ d, d)
    n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); s = (n * m).sum()
    return T if (s >= 0) != inward else flip(T)

def smooth(T, crease):
    fn = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); ar = np.linalg.norm(fn, axis=1)
    fnu = fn / np.maximum(ar, 1e-15)[:, None]
    keys = np.round(T.reshape(-1, 3) / 2e-4).astype(np.int64)
    idx = collections.defaultdict(list)
    for c in range(len(keys)): idx[tuple(keys[c])].append(c // 3)
    N = np.zeros((len(T), 3, 3)); cr = math.cos(math.radians(crease))
    for c in range(len(keys)):
        f = c // 3; lst = np.array(idx[tuple(keys[c])])
        sel = lst[fnu[lst] @ fnu[f] > cr]
        v = fn[sel].sum(0); ln = np.linalg.norm(v)
        N[f, c % 3] = v / ln if ln > 1e-12 else fnu[f]
    return N

def put(part, slots, T, tags=None, crease=40, fix='vol', axis=None):
    """Store a triangle set: orient it, smooth its normals by crease angle and file each triangle under its material slot."""
    if isinstance(slots, str): slots = [slots]
    T = np.asarray(T, float)
    if tags is None: tags = np.zeros(len(T), int)
    ar = np.linalg.norm(np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]), axis=1)
    keep = ar > 1e-10; T = T[keep]; tags = np.asarray(tags)[keep]
    if len(T) == 0: return
    if fix == 'vol': T = fix_vol(T)
    elif fix == 'convex': T = fix_convex(T)
    elif fix == 'axis': T = fix_axis(T, *axis)
    N = smooth(T, crease)
    for t in sorted(set(tags.tolist())):
        m = tags == t; STORE[(part, slots[t])].append((T[m], N[m]))

# ------------------------------------------------------------------------------------------------- primitives
def circ(c, d, r, n, ph=0.0):
    u, w = perp(d); a = np.arange(n) * 2 * PI / n + ph
    return c + np.outer(np.cos(a), u) * r + np.outer(np.sin(a), w) * r

def tube(part, slot, a, b, r0, r1=None, n=None, caps=True, crease=60):
    r1 = r0 if r1 is None else r1; n = n or Q['tn']; a, b = np.asarray(a, float), np.asarray(b, float)
    T, g = loft([circ(a, b - a, r0, n), circ(b, b - a, r1, n)], caps=caps)
    put(part, slot, T, g, crease, 'vol' if caps else 'convex')

def polytube(part, slot, pts, r, n=None, crease=60, caps=True):
    n = n or Q['tn']; pts = [np.asarray(p, float) for p in pts]; S = []
    u0 = None
    for i, p in enumerate(pts):
        d = unit((pts[i + 1] - pts[i]) if i == 0 else (pts[i] - pts[i - 1]) if i == len(pts) - 1 else (pts[i + 1] - pts[i - 1]))
        # parallel transport of the section frame, so a bent tube does not twist
        if u0 is None: u0, _ = perp(d)
        u0 = unit(u0 - d * (u0 @ d)); w0 = np.cross(d, u0)
        a = np.arange(n) * 2 * PI / n
        S.append(p + np.outer(np.cos(a), u0) * r + np.outer(np.sin(a), w0) * r)
    T, g = loft(S, caps=caps); put(part, slot, T, g, crease)

def obox(part, slot, c, size, ax=None, crease=30):
    """Box centred at c with full sizes along the axes ax = (x, y, z) (default world axes)."""
    ax = ax or (V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)); c = np.asarray(c, float)
    ex, ey, ez = [np.asarray(ax[i], float) * size[i] / 2 for i in range(3)]
    L0 = [c - ex - ey - ez, c + ex - ey - ez, c + ex + ey - ez, c - ex + ey - ez]
    L1 = [p + 2 * ez for p in L0]
    T, g = loft([np.array(L0), np.array(L1)]); put(part, slot, T, g, crease)

def extrude(part, slots, poly, o, u, v, n, depth, sc=1.0, tag=None, crease=35):
    """Prism of a 2D outline placed in the frame (o, u, v) pushed along n by depth; the far face is scaled by sc (a bevel)."""
    P = np.asarray(poly, float); cen = P.mean(0); o = np.asarray(o, float)
    L0 = np.array([o + p[0] * u + p[1] * v for p in P])
    L1 = np.array([o + n * depth + (cen + (p - cen) * sc)[0] * u + (cen + (p - cen) * sc)[1] * v for p in P])
    T, g = loft([L0, L1], tag=tag); put(part, slots, T, g, crease)

def frame_from_n(n, up=V(0, 1, 0)):
    n = unit(n); v = up - n * (n @ up)
    if np.linalg.norm(v) < 1e-6: v = V(0, 0, 1) - n * n[2]
    v = unit(v); return np.cross(v, n), v, n

def flat(part, slot, poly, o, u, v, n):
    """Single sided flat polygon (a paint graphic or a lens) in the frame (o, u, v), facing n."""
    P = np.asarray(poly, float); pts = np.array([o + p[0] * u + p[1] * v for p in P])
    T = pts[np.array(earclip([tuple(p) for p in P]))]
    fn = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); bad = fn @ n < 0
    T[bad] = flip(T[bad]); put(part, slot, T, None, 5, None)

def lathe_x(part, slot, prof, C, n, closed=True, crease=45, inward=False):
    """Revolve a profile [(a, r)] about the x axis through C (wheel parts)."""
    S = []
    for k in range(n):
        ph = 2 * PI * k / n; cs, sn = math.cos(ph), math.sin(ph)
        S.append(np.array([[C[0] + a, C[1] + r * cs, C[2] + r * sn] for a, r in prof]))
    T, g = loft(S, cyclic=True, caps=False)
    if closed: put(part, slot, T, g, crease, 'vol')
    else: put(part, slot, T, g, crease, 'axis', axis=(np.asarray(C, float), V(1, 0, 0), inward))

def ring(part, slot, x, ri, ro, C, n, facing, crease=60):
    """Flat annulus in the plane x (ro may be a function of the angle: a wave disc), facing +-x."""
    S = []
    for k in range(n):
        ph = 2 * PI * k / n; cs, sn = math.cos(ph), math.sin(ph); r = ro(ph) if callable(ro) else ro
        S.append(np.array([[x, C[1] + ri * cs, C[2] + ri * sn], [x, C[1] + r * cs, C[2] + r * sn]]))
    T, g = loft(S, cyclic=True, caps=False)
    if (np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])[:, 0].sum() >= 0) != (facing > 0): T = flip(T)
    put(part, slot, T, g, crease, None)

def dot(part, slot, c, u, v, hu, hv, facing):
    """Small flat quad (a drilled hole, a bolt head) facing +-x."""
    c = np.asarray(c, float)
    p = [c - u * hu - v * hv, c + u * hu - v * hv, c + u * hu + v * hv, c - u * hu + v * hv]
    T = np.array([[p[0], p[1], p[2]], [p[0], p[2], p[3]]])
    if (np.cross(T[0, 1] - T[0, 0], T[0, 2] - T[0, 0])[0] >= 0) != (facing > 0): T = flip(T)
    put(part, slot, T, None, 90, None)

def sym(half):
    return list(half) + [(-x, y) for x, y in half[-2:0:-1]]

def sec(z, pts):
    return np.array([[x, y, z] for x, y in pts])

# ------------------------------------------------------------------------------------------------- flat side panels
# A side panel is a slab whose outer face is the plane x = sx * xf(z, y): flat and angular like moulded motocross plastics.
# Paint graphics are flat polygons a hair outside that plane (no textures).
def slab(part, slot, poly, xf, sx, thick):
    out = np.array([[sx * xf(z, y), y, z] for z, y in poly]); inn = out - V(sx * thick, 0, 0)
    T, g = loft([inn, out]); put(part, slot, T, g, 25)

def graphic(part, slot, poly, xf, sx, off=.0018):
    pts = np.array([[sx * (xf(z, y) + off), y, z] for z, y in poly])
    T = pts[np.array(earclip([(z, y) for z, y in poly]))]
    fn = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); bad = fn[:, 0] * sx < 0
    T[bad] = flip(T[bad]); put(part, slot, T, None, 5, None)

# ------------------------------------------------------------------------------------------------- wheels and plastics
def knob(part, C, a, x, r0, h, w, l, tilt):
    """One tyre knob: a tapered block standing on the carcass at angle a (about x), axial offset x, tilted outward by tilt."""
    er = V(0, math.cos(a), math.sin(a)); et = V(0, -math.sin(a), math.cos(a)); ex = V(1, 0, 0)
    n = unit(math.cos(tilt) * er + math.sin(tilt) * ex); ax = unit(np.cross(et, n))
    B = np.asarray(C, float) + x * ex + r0 * er
    def rect(c, ww, ll): return np.array([c - ax * ww / 2 - et * ll / 2, c + ax * ww / 2 - et * ll / 2,
                                          c + ax * ww / 2 + et * ll / 2, c - ax * ww / 2 + et * ll / 2])
    top = rect(B + n * h, w * .8, l * .78)
    T, g = loft([rect(B, w, l), top], caps=False)
    T = np.concatenate([T, np.array([[top[0], top[1], top[2]], [top[0], top[2], top[3]]])])
    put(part, 'tire', T, None, 30, 'convex')

def rim_spokes_hub(part, C, Rim, hub_w):
    n = Q['rseg']
    # black rim: U section with flanges (lathe, closed)
    prof = [(-.03, Rim - .012), (-.033, Rim + .006), (.033, Rim + .006), (.03, Rim - .012), (.012, Rim - .02), (-.012, Rim - .02)]
    prof = prof[:4]
    lathe_x(part, 'dark', prof, C, n, closed=True, crease=50)
    # hub with flanges
    tube(part, 'metal', C + V(-hub_w, 0, 0), C + V(hub_w, 0, 0), .034, .034, Q['sn'])
    for s in (-1, 1):
        tube(part, 'metal', C + V(s * (hub_w - .012), 0, 0), C + V(s * hub_w, 0, 0), .056, .056, Q['sn'])
    tube(part, 'metal', C + V(-hub_w - .03, 0, 0), C + V(hub_w + .03, 0, 0), .012, .012, 6)        # axle
    # tangent laced spokes, half per side, alternating leading / trailing
    m = Q['spokes']
    for s in (-1, 1):
        for k in range(m):
            a0 = 2 * PI * k / m + (0 if s > 0 else PI / m)
            a1 = a0 + (.5 if k % 2 else -.5)
            p0 = C + V(s * (hub_w - .006), .05 * math.cos(a0), .05 * math.sin(a0))
            p1 = C + V(s * .008, (Rim - .016) * math.cos(a1), (Rim - .016) * math.sin(a1))
            tube(part, 'metal', p0, p1, .0028, .0028, 3, caps=False)

def sprocket(part, C, r, teeth, thick=.007):
    if teeth:
        pts = []
        for k in range(teeth * 2):
            a = PI * k / teeth; rr = r if k % 2 == 0 else r - .012
            pts.append((C[2] + rr * math.sin(a), C[1] + rr * math.cos(a)))
        extrude(part, 'metal', pts, V(C[0], 0, 0), V(0, 0, 1), V(0, 1, 0), V(1, 0, 0), thick, 1.0, None, 80)
        for k in range(6):                                                              # lightening holes
            a = 2 * PI * k / 6 + .3; c = V(C[0] + thick + .0015, C[1] + r * .6 * math.cos(a), C[2] + r * .6 * math.sin(a))
            dot(part, 'dark', c, V(0, -math.sin(a), math.cos(a)), V(0, math.cos(a), math.sin(a)), .016, .022, 1)
    else:
        tube(part, 'metal', C, C + V(thick, 0, 0), r - .006, r - .006, 16)

def u_shell(stations, part, slots, tag):
    """Thin plastic with an inverted U section (a fender): stations (z, ytop, half width, flange depth)."""
    S = []
    for z, yt, hw, dp in stations:
        th = min(.008, hw * .4)
        pts = [(-hw, yt - dp), (-hw, yt - .014), (-hw * .62, yt - .002), (0, yt), (hw * .62, yt - .002), (hw, yt - .014), (hw, yt - dp),
               (hw - th, yt - dp), (hw - th, yt - .014 - th * .5), (hw * .62, yt - .002 - th), (0, yt - th), (-hw * .62, yt - .002 - th),
               (-hw + th, yt - .014 - th * .5), (-hw + th, yt - dp)]
        S.append(sec(z, pts))
    T, g = loft(S, tag=tag); put(part, slots, T, g, 28)

# ------------------------------------------------------------------------------------------------- output
def encode(T, N):
    pos = T.reshape(-1, 3); nor = np.round(np.clip(N.reshape(-1, 3), -1, 1) * 127).astype(np.int8)
    lo, hi = pos.min(axis=0), pos.max(axis=0); span = np.maximum(hi - lo, 1e-6)
    q = np.round((pos - lo) / span * 65535).astype('<u2')
    keyed = np.concatenate([q.astype(np.int64), nor.astype(np.int64)], axis=1)
    uniq, first, inv = np.unique(keyed, axis=0, return_index=True, return_inverse=True)
    order = np.argsort(first); rank = np.empty_like(order); rank[order] = np.arange(len(order))
    qv = q[first[order]]; nv = nor[first[order]]; idx = rank[inv.reshape(-1)].reshape(-1, 3)
    idx = idx[(idx[:, 0] != idx[:, 1]) & (idx[:, 1] != idx[:, 2]) & (idx[:, 0] != idx[:, 2])]
    if len(qv) > 65535: raise ValueError('mesh too big for 16 bit indices')
    nb = nv.tobytes()
    if len(nb) % 2: nb += b'\0'
    blob = qv.tobytes() + nb + idx.astype('<u2').tobytes()
    return dict(v=int(len(qv)), i=int(idx.size), min=[round(float(x), 5) for x in lo], max=[round(float(x), 5) for x in hi],
                b=base64.b64encode(blob).decode('ascii')), len(idx)

def make_lod(name, set_lod, build, to_part_space, parts, slots):
    """Build one LOD and pack it: one mesh per (part, slot), in part space, sorted by part then slot."""
    set_lod(name)
    for k in list(STORE): del STORE[k]
    build(); meshes = []; total = 0; per = collections.Counter()
    for (part, slot), lst in STORE.items():
        T = np.concatenate([t for t, n in lst]); N = np.concatenate([n for t, n in lst])
        T, N = to_part_space(part, T, N); enc, n = encode(T, N); enc.update(p=part, s=slot); meshes.append(enc); total += n; per[part] += n
    meshes.sort(key=lambda m: (parts.index(m['p']), slots.index(m['s'])))
    return meshes, total, per

def write_js(out, var, comment, anchors, build_lod):
    """Build the hi and lo LODs with build_lod(name) and write window.<var> = {anchors, tris, lod} to out."""
    lods = {}; tris = {}
    for name in ('hi', 'lo'):
        lods[name], tris[name], per = build_lod(name)
        print('%s: %5d triangles %s (%d meshes)' % (name, tris[name], dict(per), len(lods[name])))
    data = dict(anchors=anchors, tris=tris, lod=lods)
    out = os.path.abspath(out); os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as f:
        f.write(comment)
        f.write('window.' + var + '=' + json.dumps(data, separators=(',', ':')) + ';\n')
    print('wrote %s (%d KB)' % (out, os.path.getsize(out) // 1024))
