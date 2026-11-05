#!/usr/bin/env python3
"""Procedural superbike for the Skyline Highway bike (Veloce RR 1000) -> assets/bikes/superbike.js.

ORIGINAL WORK: every vertex is drawn by this script (lofted cross-sections, extruded panels, tubes, lathes). No third party
model is read or copied. Modern superbikes (Ducati Panigale V4, Yamaha R1, BMW S1000RR, Aprilia RSV4, Kawasaki ZX-10R) were
only studied for proportions and part layout; see assets/bikes/README.md.

Output: window.APEX_SUPER = {anchors, tris, lod: {hi: [mesh], lo: [mesh]}}; mesh = {p: part, s: material slot, v, i, min, max, b}
(b = base64 of uint16 positions scaled into min..max, int8 normals padded to an even length, uint16 triangle indices; same
packing as assets/bikes/moto.js, decoded by MotoKit.decode in index.html). Parts: body, steer (turns about the raked steering axis,
local space = bike space moved to the steering pivot and rotated by the rake), fw (front wheel, spins about x, local to the
front axle) and rw (rear wheel, local to the rear axle).

Bike space: +y up, +z forward, +x the rider's LEFT, metres, wheelbase 1.42, ground at y = 0.
Run:  python3 -I tools/build_superbike.py        (needs numpy; deterministic, no random numbers)
"""
import argparse, base64, collections, json, math, os
import numpy as np

PI = math.pi
V = lambda *a: np.array(a, float)
def unit(v): return v / np.linalg.norm(v)

# ------------------------------------------------------------------------------------------------- main dimensions
WB, RF, RR = 1.42, 0.30, 0.31
F = V(0, RF, WB / 2)                       # front axle
R = V(0, RR, -WB / 2)                      # rear axle
RAKE = math.radians(24.5)                  # steering head angle from vertical
UAX = V(0, math.cos(RAKE), -math.sin(RAKE))  # steering axis, pointing up and back
PIV = F + 0.595 * UAX                      # steering pivot (upper triple clamp)
RIM_R = 0.2159                             # 17 inch rim
SLOTS = ['paint', 'accent', 'trim', 'carbon', 'dark', 'metal', 'chrome', 'gold', 'tire', 'seat', 'plate', 'glass', 'gauge',
         'head', 'tail', 'indFL', 'indFR', 'indRL', 'indRR']
PARTS = ('body', 'steer', 'fw', 'rw')

def rx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, 0 + s, c]])
ROT = rx(RAKE)   # bike space -> steer space (after subtracting the origin)

# ------------------------------------------------------------------------------------------------- level of detail
Q = {}
def set_lod(name):
    hi = name == 'hi'
    Q.clear()
    Q.update(hi=hi, seg=30 if hi else 20, rseg=24 if hi else 16, tn=8 if hi else 6, sn=10 if hi else 6, holes=hi, split=hi,
             fins=hi, teeth=16 if hi else 0, detail=hi, rimband=hi, fender=12 if hi else 7)

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

def polytube(part, slot, pts, r, n=None, crease=60):
    n = n or Q['tn']; pts = [np.asarray(p, float) for p in pts]; S = []
    for i, p in enumerate(pts):
        d = unit((pts[i + 1] - pts[i]) if i == 0 else (pts[i] - pts[i - 1]) if i == len(pts) - 1 else (pts[i + 1] - pts[i - 1]))
        S.append(circ(p, d, r, n))
    T, g = loft(S, caps=True); put(part, slot, T, g, crease)

def obox(part, slot, c, size, ax=None, crease=30, bevel=0.0):
    """Box centred at c with half sizes size/2 along the axes ax = (x, y, z) (default world axes)."""
    ax = ax or (V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)); c = np.asarray(c, float)
    ex, ey, ez = [ax[i] * size[i] / 2 for i in range(3)]
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

def panel(part, slot, poly, o, n, depth, sc=0.95, up=V(0, 1, 0), tag=None):
    u, v, n = frame_from_n(n, up); extrude(part, slot, poly, o, u, v, n, depth, sc, tag)

def side_panel(part, slots, poly_zy, x_in, x_out, sx, sc=0.9, tag=None):
    """Panel with the outline given in (z, y), standing at x_in..x_out on side sx."""
    extrude(part, slots, poly_zy, V(x_in * sx, 0, 0), V(0, 0, 1), V(0, 1, 0), V(sx, 0, 0), (x_out - x_in), sc, tag)

def lathe_x(part, slot, prof, C, n, closed=True, crease=45, inward=False):
    """Revolve a profile [(a, r)] about the x axis through C (wheel parts)."""
    S = []
    for k in range(n):
        ph = 2 * PI * k / n; cs, sn = math.cos(ph), math.sin(ph)
        S.append(np.array([[C[0] + a, C[1] + r * cs, C[2] + r * sn] for a, r in prof]))
    T, g = loft(S, cyclic=True, caps=False)
    if closed: put(part, slot, T, g, crease, 'vol')
    else: put(part, slot, T, g, crease, 'axis', axis=(np.asarray(C, float), V(1, 0, 0), inward))

def annulus(part, slot, x, ri, ro, C, n, facing, crease=60):
    S = []
    for k in range(n):
        ph = 2 * PI * k / n; cs, sn = math.cos(ph), math.sin(ph)
        S.append(np.array([[x, C[1] + ri * cs, C[2] + ri * sn], [x, C[1] + ro * cs, C[2] + ro * sn]]))
    T, g = loft(S, cyclic=True, caps=False)
    T2 = []
    # two-point loops make degenerate "quads" (ring strips): keep them
    fnl = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])[:, 0].sum()
    if (fnl >= 0) != (facing > 0): T = flip(T)
    put(part, slot, T, g, crease, None)

def dot(part, slot, c, u, v, hu, hv, facing):
    """Small flat quad (a drilled hole in a disc) facing +-x."""
    c = np.asarray(c, float)
    p = [c - u * hu - v * hv, c + u * hu - v * hv, c + u * hu + v * hv, c - u * hu + v * hv]
    T = np.array([[p[0], p[1], p[2]], [p[0], p[2], p[3]]])
    if (np.cross(T[0, 1] - T[0, 0], T[0, 2] - T[0, 0])[0] >= 0) != (facing > 0): T = flip(T)
    put(part, slot, T, None, 90, None)

def sym(half):
    return list(half) + [(-x, y) for x, y in half[-2:0:-1]]

def sec(z, pts):
    return np.array([[x, y, z] for x, y in pts])

def stripe_tag(nh, stripe=True, bot_from=99, low_from=99):
    L = 2 * nh - 2
    def t(i, j):
        h = min(j, L - 1 - j)
        if h >= bot_from: return 3
        if i >= low_from and h in (4, 5): return 1      # two-tone: lower half of the fairing in the accent colour
        if stripe and h == 0: return 1
        if stripe and h == 1: return 2
        return 0
    return t

def body_loft(part, stations, slots=('paint', 'accent', 'trim', 'carbon'), stripe=True, bot_from=99, crease=30, low_from=99):
    """Loft of sections made from (z, ytop, wtop, ywide, wide, ybot, wbot): top stripe bands, shoulder, widest line, belly."""
    S = []
    for z, ytop, wtop, yw, ww, yb, wb in stations:
        half = [(0, ytop), (0.052, ytop - .002), (0.064, ytop - .004), (wtop, ytop - .014 - .25 * (ytop - yw) * 0.5), (ww, yw),
                (ww * .86, yb + .55 * (yw - yb) * .45), (wb, yb), (0, yb)]
        S.append(sec(z, sym(half)))
    T, g = loft(S, tag=stripe_tag(8, stripe, bot_from, low_from)); put(part, list(slots), T, g, crease)

# ------------------------------------------------------------------------------------------------- wheels
def tyre(part, C, Rt, hw, n):
    sw = Rt - RIM_R
    prof = [(-.78 * hw, RIM_R), (-hw, RIM_R + .38 * sw), (-.93 * hw, RIM_R + .72 * sw), (-.62 * hw, Rt - .04 * sw), (0, Rt),
            (.62 * hw, Rt - .04 * sw), (.93 * hw, RIM_R + .72 * sw), (hw, RIM_R + .38 * sw), (.78 * hw, RIM_R)]
    if not Q['hi']: prof = [prof[0], prof[1], prof[3], prof[4], prof[5], prof[7], prof[8]]
    lathe_x(part, 'tire', prof, C, n, closed=False)

def rim_and_spokes(part, C, rw):
    n = Q['rseg']; hw = rw / 2
    for s in (-1, 1):
        annulus(part, 'metal', s * hw, RIM_R - .034, RIM_R + .004, C, n, s)
        if Q['rimband']: annulus(part, 'accent', s * (hw + .0006), RIM_R - .012, RIM_R - .006, C, n, s)
    # barrel seen through the spokes
    S = [np.array([[C[0] + a, C[1] + (RIM_R - .034) * math.cos(2 * PI * k / n), C[2] + (RIM_R - .034) * math.sin(2 * PI * k / n)]
                   for a in (-hw, hw)]) for k in range(n)]
    T, g = loft(S, cyclic=True, caps=False)
    put(part, 'dark', T, g, 60, 'axis', axis=(np.asarray(C, float), V(1, 0, 0), True))
    # hub
    tube(part, 'metal', C + V(-hw * .95, 0, 0), C + V(hw * .95, 0, 0), .036, .036, Q['sn'])
    # five Y spokes (hi) or five straight spokes (lo)
    for k in range(5):
        a0 = k * 2 * PI / 5 + .3
        offs = (-.2, .2) if Q['split'] else (0.0,)
        for o in offs:
            def pt(a, r, x): return C + V(x, r * math.cos(a), r * math.sin(a))
            p0 = pt(a0, .04, 0.0); p1 = pt(a0 + o, RIM_R - .03, hw * .55 * 0 + 0.0)
            d = p1 - p0; L = np.linalg.norm(d); e = unit(d)
            side = V(1, 0, 0); tang = unit(np.cross(side, e))
            w0, w1 = (.022, .02) if Q['split'] else (.034, .028); th0, th1 = .05, .03
            def rect(c, w, t): return np.array([c - side * t / 2 - tang * w / 2, c + side * t / 2 - tang * w / 2,
                                                c + side * t / 2 + tang * w / 2, c - side * t / 2 + tang * w / 2])
            T, g = loft([rect(p0, w0, th0), rect(p1, w1, th1)], caps=False); put(part, 'metal', T, g, 50, 'convex')

def disc(part, C, ro, ri, sx, n, holes):
    x = sx
    for f in (-1, 1):
        annulus(part, 'metal', x + f * .0025, ri, ro, C, n, f)
    if holes and Q['holes']:
        m = 18
        for k in range(m):
            a = 2 * PI * (k + .5) / m; r = (ri + ro) / 2 + (.006 if k % 2 else -.006)
            c = V(x, C[1] + r * math.cos(a), C[2] + r * math.sin(a))
            u = V(0, math.cos(a + PI / 2), math.sin(a + PI / 2)); v = V(0, math.cos(a), math.sin(a))
            for f in (-1, 1): dot(part, 'dark', c + V(f * .003, 0, 0), u, v, .006, .006, f)
    # carrier (bell) ring
    for f in (-1, 1): annulus(part, 'dark', x + f * .0035, ri - .032, ri, C, n, f)

# ------------------------------------------------------------------------------------------------- the bike
def build_wheels():
    n = Q['seg']
    # front wheel (part fw, built in bike space and moved to the axle at encode time)
    tyre('fw', F, RF, .060, n); rim_and_spokes('fw', F, .095)
    for s in (-1, 1): disc('fw', F, .160, .105, s * .064, Q['rseg'] + 4, True)
    tube('fw', 'chrome', F + V(-.09, 0, 0), F + V(.09, 0, 0), .014, .014, 8)
    # rear wheel
    tyre('rw', R, RR, .095, n); rim_and_spokes('rw', R, .14)
    disc('rw', R, .113, .068, -.074, Q['rseg'] + 2, True)
    # rear sprocket on the left with its carrier
    tube('rw', 'metal', R + V(.07, 0, 0), R + V(.14, 0, 0), .05, .05, Q['sn'])
    sprocket('rw', R + V(.145, 0, 0), .098, Q['teeth'])
    tube('rw', 'chrome', R + V(-.1, 0, 0), R + V(.17, 0, 0), .012, .012, 8)

def sprocket(part, C, r, teeth, thick=.008):
    if teeth:
        pts = []
        for k in range(teeth * 2):
            a = PI * k / teeth; rr = r if k % 2 == 0 else r - .011
            pts.append((C[1] + rr * math.cos(a), C[2] + rr * math.sin(a)))
        extrude(part, 'dark', [(p[1], p[0]) for p in pts],
                V(C[0], 0, 0), V(0, 0, 1), V(0, 1, 0), V(1, 0, 0), thick, 1.0, None, 80)
    else:
        tube(part, 'dark', C, C + V(thick, 0, 0), r - .005, r - .005, 12)

def build_front():
    """Forks, clamps, clip-ons, brakes, front fender: all in the steer part (part 'steer' is rotated about the steering axis)."""
    pt = lambda s: F + s * UAX
    for sx in (-1, 1):
        x = sx * .098
        top = pt(.69) + V(x, 0, 0); mid = pt(.29) + V(x, 0, 0); low = pt(.045) + V(x, 0, 0)
        tube('steer', 'dark', mid, top, .0255, .0255, Q['sn'])                          # outer tube (top)
        tube('steer', 'gold', low, mid + .02 * UAX, .0195, .0195, Q['sn'])               # inner tube (gold, bottom)
        tube('steer', 'metal', top, top + .018 * UAX, .014, .014, 8)                     # preload adjuster
        ax = (V(1, 0, 0), UAX, np.cross(V(1, 0, 0), UAX))
        obox('steer', 'dark', pt(.04) + V(x, 0, .0), (.042, .1, .06), ax)                # axle clamp
        # radial caliper in front of the fork leg
        pc = math.radians(8); rad = V(0, math.sin(pc), math.cos(pc)); tan = V(0, math.cos(pc), -math.sin(pc))
        cc = F + rad * .148 + V(sx * .067, 0, 0)
        obox('steer', 'gold', cc, (.052, .055, .108), (V(1, 0, 0), rad, tan))
        obox('steer', 'dark', cc + rad * .003, (.056, .02, .04), (V(1, 0, 0), rad, tan))
        if Q['detail']:
            obox('steer', 'dark', F + rad * .12 + V(sx * .085, 0, 0), (.018, .028, .05), (V(1, 0, 0), rad, tan))
        tube('steer', 'chrome', F + V(sx * .093, 0, 0), F + V(sx * .113, 0, 0), .016, .016, 8)   # axle nut
    # brake lines from the master cylinder to the calipers
    for sx in (-1, 1):
        polytube('steer', 'dark', [V(sx * .205, .945, .45), V(sx * .15, .8, .5), pt(.36) + V(sx * .118, 0, .02), F + V(sx * .067, 0, .15)], .0045, 4)
    # triple clamps
    ax = (V(1, 0, 0), UAX, np.cross(V(1, 0, 0), UAX))
    obox('steer', 'dark', pt(.6), (.262, .034, .082), ax)
    obox('steer', 'metal', pt(.46), (.235, .03, .07), ax)
    tube('steer', 'metal', pt(.625), pt(.64), .022, .022, Q['sn'])                     # stem nut
    # clip-on bars, grips, levers, switchgear
    for sx in (-1, 1):
        base = V(sx * .115, 0, 0) + pt(.545); elb = V(sx * .245, .902, .405)
        tube('steer', 'dark', base, elb, .0125, .0125, 8)
        tube('steer', 'tire', V(sx * .235, .9, .4), V(sx * .365, .9, .4), .0185, .0185, 8)
        tube('steer', 'chrome', V(sx * .365, .9, .4), V(sx * .375, .9, .4), .015, .015, 8)
        # lever: pivot ahead of the grip, blade swept forward and down
        tube('steer', 'dark', V(sx * .27, .925, .43), V(sx * .285, .915, .54), .0065, .0065, 6)
        obox('steer', 'dark', V(sx * .245, .925, .44), (.05, .035, .06))                 # switchgear
        if sx < 0: obox('steer', 'dark', V(sx * .205, .945, .45), (.04, .04, .045))      # brake reservoir
        else: obox('steer', 'dark', V(sx * .205, .945, .45), (.036, .036, .04))          # clutch reservoir
    # front fender: an arc around the wheel, painted, with the livery stripe; stays to the fork
    n = Q['fender']; a0, a1 = math.radians(-4), math.radians(104)
    xs = [(-.05, .318), (-.052, .335), (-.03, .347), (.03, .347), (.052, .335), (.05, .318)]
    S = []
    for k in range(n + 1):
        a = a0 + (a1 - a0) * k / n; rad = V(0, math.sin(a), math.cos(a))
        S.append(np.array([F + V(x, 0, 0) + rad * r for x, r in xs]))
    tg = lambda i, j: 1 if j == 2 else 0
    T, g = loft(S, tag=tg); put('steer', ['paint', 'accent'], T, g, 50)
    for sx in (-1, 1):
        tube('steer', 'carbon', F + V(sx * .062, 0, 0) + V(0, math.sin(a1 - .2), math.cos(a1 - .2)) * .34,
             V(sx * .098, 0, 0) + pt(.34), .008, .008, 6)

def build_nose():
    stn = [  # z, ytop, wtop, ywide, wide, ybot, wbot
        (1.005, .862, .040, .800, .062, .735, .036), (.955, .885, .066, .805, .110, .700, .060), (.865, .920, .096, .812, .150, .670, .078),
        (.745, .965, .118, .842, .184, .630, .094), (.625, 1.005, .138, .880, .212, .585, .104), (.505, 1.030, .152, .900, .230, .560, .108),
        (.405, 1.012, .160, .915, .238, .580, .110), (.325, .990, .150, .915, .220, .660, .100)]
    body_loft('body', stn, bot_from=7, low_from=2)
    # air intake scoop on the nose top and the duct on the tip
    z0 = .93; ys = lambda z: .862 + (.975 - z) * .39
    panel('body', 'carbon', [(-.028, -.01), (.028, -.01), (.042, .075), (-.042, .075)], V(0, ys(z0), z0), V(0, 1, .39), .007, .9, up=V(0, 0, 1))
    obox('body', 'carbon', V(0, .795, 1.016), (.046, .036, .006))
    # twin LED headlights: bezel + lens on each side of the nose
    for sx in (-1, 1):
        n = unit(V(sx * .62, .45, .64)); c = V(sx * .108, .838, .895)
        eye = [(-.048, .005), (-.02, .026), (.038, .03), (.056, .006), (.028, -.018), (-.028, -.022)]
        panel('body', 'carbon', [(x * 1.12, y * 1.25) for x, y in eye], c - n * .004, n, .01, .95)
        panel('body', 'head', eye, c + n * .004, n, .006, .9)
        # DRL strip under the lens
        panel('body', 'head', [(-.04, -.03), (.04, -.026), (.04, -.019), (-.04, -.023)], c + n * .004, n, .005, .9)
    # winglets
    for sx in (-1, 1):
        o = V(sx * .176, .846, .665); u = unit(V(sx, -.14, 0)); v = V(0, 0, 1)
        nn = unit(np.cross(u, v)); nn = nn if nn[1] > 0 else -nn
        extrude('body', 'carbon', [(0, .05), (.105, .012), (.105, -.01), (0, -.055)], o, u, v, nn, .008, .9)
    # windscreen: three facets
    B = [(-.118, .984, .71), (-.052, .995, .70), (.052, .995, .70), (.118, .984, .71)]
    Tp = [(-.092, 1.15, .50), (-.042, 1.19, .475), (.042, 1.19, .475), (.092, 1.15, .50)]
    for k in range(3):
        quad = np.array([B[k], B[k + 1], Tp[k + 1], Tp[k]], float)
        nn = unit(np.cross(quad[1] - quad[0], quad[3] - quad[0]))
        T, g = loft([quad, quad + nn * .006]); put('body', 'glass', T, g, 80)
    # screen trim + dash (TFT)
    nn = unit(V(0, .55, -.84))
    panel('body', 'carbon', [(-.095, -.055), (.095, -.055), (.082, .06), (-.082, .06)], V(0, 1.06, .405), nn, .018, .9)
    panel('body', 'gauge', [(-.078, -.04), (.078, -.04), (.07, .044), (-.07, .044)], V(0, 1.06, .405) + nn * .017, nn, .003, 1.0)
    # mirrors on the fairing sides with LED indicators
    for sx in (-1, 1):
        tube('body', 'carbon', V(sx * .205, .985, .5), V(sx * .285, 1.015, .465), .008, .008, 6)
        o = V(sx * .285, 1.0, .468); u = V(sx, 0, 0); v = V(0, 0, 1)
        extrude('body', 'paint', [(-.01, .04), (.07, .03), (.085, 0), (.07, -.035), (-.01, -.04)], o, u, v, V(0, 1, 0), .05, .8)
        c = o + V(sx * .04, .028, -.043)
        panel('body', 'gauge', [(-.032, -.018), (.032, -.018), (.032, .018), (-.032, .018)], c, V(0, .2, -1), .006, .95)
        panel('body', 'indFL' if sx > 0 else 'indFR', [(-.03, -.007), (.03, -.007), (.034, .007), (-.026, .007)],
              o + V(sx * .045, .028, .04), V(0, .2, 1), .006, .9)

def build_sides():
    for sx in (-1, 1):
        # mid fairing panel (accent colour) over the radiator, with air vents
        poly = [(.50, .62), (.46, .78), (.20, .80), (.02, .62), (-.07, .40), (.06, .30), (.36, .32), (.50, .42)]
        side_panel('body', 'paint', poly, .105, .228, sx, .72)
        side_panel('body', 'accent', [(.44, .40), (.02, .40), (-.04, .47), (.40, .48)], .2, .2285, sx, .96)
        for z0 in (.33, .24, .15):
            side_panel('body', 'carbon', [(z0 + .05, .62), (z0 + .075, .62), (z0 + .02, .45), (z0 - .005, .45)], .206, .229, sx, .9)

def build_tank_seat_tail():
    stn = [(.44, 1.030, .100, .960, .170, .800, .090), (.36, 1.015, .122, .950, .182, .790, .100), (.24, 1.026, .130, .940, .192, .780, .105),
           (.12, 1.005, .112, .925, .166, .780, .095), (.02, .975, .092, .900, .130, .780, .085), (-.08, .932, .082, .872, .110, .780, .082),
           (-.17, .902, .082, .852, .104, .790, .082)]
    body_loft('body', stn, bot_from=99)
    # fuel filler
    tube('body', 'metal', V(0, 1.019, .15), V(0, 1.027, .15), .034, .034, 14)
    # rider seat (black) and passenger step
    st = []
    for z, yt, wt, yw, ww, yb in [(-.04, .868, .098, .840, .112, .78), (-.20, .846, .118, .822, .134, .76), (-.38, .852, .130, .830, .150, .76), (-.52, .884, .112, .86, .130, .76)]:
        st.append(sec(z, sym([(0, yt), (wt, yt - .004), (ww, yw), (ww * .8, yb + .02), (0, yb)])))
    T, g = loft(st); put('body', 'seat', T, g, 50)
    # tail unit: livery stripe on top, dark underside
    stn = [(-.22, .842, .092, .800, .146, .700, .084), (-.36, .846, .090, .790, .150, .672, .082), (-.52, .886, .080, .820, .134, .690, .068), (-.74, .934, .064, .860, .108, .745, .054),
           (-.92, .964, .052, .906, .082, .800, .044), (-1.04, .975, .046, .925, .066, .855, .038)]
    body_loft('body', stn, bot_from=7)
    for sx in (-1, 1):
        # subframe side cover and tail side flash in the accent colour
        side_panel('body', 'paint', [(-.12, .80), (-.36, .79), (-.5, .72), (-.40, .60), (-.2, .56), (-.1, .64)], .085, .15, sx, .8)
        side_panel('body', 'accent', [(-.5, .86), (-.9, .925), (-.9, .90), (-.52, .835)], .1, .126, sx, .9)
    # LED tail light bar on the end cap, and rear indicators
    panel('body', 'tail', [(-.075, .012), (-.04, .024), (.04, .024), (.075, .012), (.07, -.012), (-.07, -.012)], V(0, .93, -1.036), V(0, 0, -1), .01, .9)
    panel('body', 'tail', [(-.06, -.02), (.06, -.02), (.05, -.034), (-.05, -.034)], V(0, .93, -1.036), V(0, 0, -1), .008, .9)
    for sx in (-1, 1):
        panel('body', 'indRL' if sx > 0 else 'indRR', [(-.02, -.01), (.02, -.01), (.024, .01), (-.016, .01)], V(sx * .088, .90, -1.0), unit(V(sx * .5, 0, -1)), .01, .9)
    # plate holder arm and plate
    tube('body', 'carbon', V(0, .79, -.9), V(0, .64, -1.045), .014, .012, 6)
    panel('body', 'plate', [(-.1, -.065), (.1, -.065), (.1, .065), (-.1, .065)], V(0, .625, -1.06), unit(V(0, -.2, -1)), .006, 1.0)

def build_engine_frame():
    ax = None
    # crankcase and gearbox
    obox('body', 'dark', V(0, .41, .08), (.25, .27, .46))
    # cylinder block (tilted forward) with fins
    cb = (V(1, 0, 0), unit(V(0, math.cos(.45), math.sin(.45))), unit(V(0, -math.sin(.45), math.cos(.45))))
    obox('body', 'dark', V(0, .66, .15), (.22, .27, .24), cb)
    if Q['fins']:
        for k in range(5): obox('body', 'metal', V(0, .6 + .035 * k, .15 + .035 * k * math.tan(.45) * .0), (.25, .008, .245), cb)
    # clutch cover (right) and sprocket cover (left)
    tube('body', 'metal', V(-.115, .43, -.03), V(-.14, .43, -.03), .08, .08, 14)
    tube('body', 'carbon', V(-.14, .43, -.03), V(-.146, .43, -.03), .05, .05, 12)
    obox('body', 'dark', V(.13, .41, -.14), (.03, .13, .2))
    # belly pan under the engine and a header collector
    stn = [(.56, .30, .09), (.30, .25, .15), (.02, .215, .17), (-.14, .255, .13)]
    S = [np.array([[-w, yb + .1, z], [-w, yb + .03, z], [-w + .035, yb, z], [w - .035, yb, z], [w, yb + .03, z], [w, yb + .1, z]]) for z, yb, w in stn]
    T, g = loft(S); put('body', 'carbon', T, g, 50)
    for sx in (-1, 1): polytube('body', 'metal', [V(sx * .06, .74, .3), V(sx * .075, .54, .34), V(sx * .05, .34, .3), V(sx * .03, .29, .1)], .017, 6)
    # exhaust: collector under the engine to a short high-mounted silencer on the right, angled tip
    polytube('body', 'chrome', [V(0, .275, .1), V(-.02, .27, -.1), V(-.1, .36, -.25), V(-.115, .52, -.38)], .026, 8)
    tube('body', 'metal', V(-.115, .5, -.4), V(-.125, .585, -.98), .05, .043, 10)
    tube('body', 'carbon', V(-.125, .585, -.98), V(-.127, .59, -1.03), .043, .036, 10)
    tube('body', 'chrome', V(-.1265, .5945, -1.0425), V(-.1268, .595, -1.043), .03, .03, 8)
    # twin spar frame, swingarm, subframe
    for sx in (-1, 1):
        ax = (V(1, 0, 0), V(0, 1, 0), V(0, 0, 1))
        for a, b in [((.085, .83, .45), (.14, .66, .15)), ((.14, .66, .15), (.148, .45, -.12))]:
            A, B = V(sx * a[0], a[1], a[2]), V(sx * b[0], b[1], b[2]); tube('body', 'metal', A, B, .03, .03, 6)
        obox('body', 'metal', V(sx * .142, .43, -.12), (.02, .17, .12))                           # pivot plate
        # swingarm arm: tapered box section
        a, b = V(sx * .135, .43, -.12), V(sx * .115, .312, -.71); d = unit(b - a); up = V(0, 1, 0)
        sidev = unit(np.cross(up, d)); upv = np.cross(d, sidev)
        def rect(c, w, h): return np.array([c - sidev * w / 2 - upv * h / 2, c + sidev * w / 2 - upv * h / 2, c + sidev * w / 2 + upv * h / 2, c - sidev * w / 2 + upv * h / 2])
        T, g = loft([rect(a, .05, .085), rect(b, .036, .06)]); put('body', 'metal', T, g, 30)
        obox('body', 'dark', V(sx * .115, .31, -.71), (.03, .07, .07))                              # axle adjuster
        # subframe rail under the seat
        tube('body', 'dark', V(sx * .08, .79, -.1), V(sx * .07, .74, -.62), .012, .012, 6)
        # footpeg hanger and peg
        side_panel('body', 'metal', [(-.04, .5), (-.2, .3), (-.17, .25), (-.02, .31), (.02, .47)], .13, .145, sx, .95)
        tube('body', 'metal', V(sx * .14, .345, -.12), V(sx * .27, .345, -.12), .011, .011, 6)
        tube('body', 'dark', V(sx * .2, .345, -.12), V(sx * .27, .345, -.12), .016, .016, 8)
    for sx in (-1, 1):
        side_panel('body', 'carbon', [(-.02, .5), (-.11, .35), (-.2, .36), (-.2, .5)], .165, .176, sx, .95)        # heel guard
    tube('body', 'dark', V(-.2, .30, -.02), V(-.2, .31, .14), .008, .008, 6); obox('body', 'dark', V(-.2, .305, .15), (.03, .012, .07))   # brake pedal
    tube('body', 'dark', V(.2, .30, -.02), V(.2, .31, .1), .008, .008, 6); obox('body', 'dark', V(.2, .305, .1), (.026, .012, .03))     # gear lever
    obox('body', 'dark', V(0, .295, -.3), (.24, .03, .04))                                        # swingarm brace
    # mono shock behind the engine
    tube('body', 'gold', V(0, .36, -.3), V(0, .6, -.2), .02, .02, 8)
    tube('body', 'trim', V(0, .43, -.27), V(0, .57, -.215), .034, .034, 10)
    # chain (left) and front sprocket, rear brake caliper, chain guard, hugger
    fs = V(.14, .40, -.2)
    sprocket('body', fs, .042, Q['teeth'] and 10)
    for s in (1, -1):
        tube('body', 'dark', V(.145, fs[1] + s * .042, fs[2]), V(.145, RR + s * .098, R[2]), .006, .006, 4)
    obox('body', 'dark', V(-.1, .43, -.65), (.04, .05, .09))                                        # rear caliper
    n = 8; S = []
    for k in range(n + 1):
        a = math.radians(55 + 70 * k / n); rad = V(0, math.sin(a), -math.cos(a) * -1 * 0 + math.cos(a))
        S.append(np.array([R + V(x, 0, 0) + V(0, math.sin(a), math.cos(a)) * r for x, r in [(-.055, .333), (-.06, .348), (.06, .348), (.055, .333)]]))
    T, g = loft(S); put('body', 'carbon', T, g, 50)

def build():
    for k in list(STORE): del STORE[k]
    build_wheels(); build_front(); build_nose(); build_sides(); build_tank_seat_tail(); build_engine_frame()

# ------------------------------------------------------------------------------------------------- output
def to_part_space(part, T, N):
    if part == 'body': return T, N
    if part == 'steer': return (T - PIV) @ ROT.T, N @ ROT.T
    if part == 'fw': return (T - F) @ ROT.T, N @ ROT.T
    return T - R, N

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

def make_lod(name):
    set_lod(name); build(); meshes = []; total = 0; per = collections.Counter()
    for (part, slot), lst in STORE.items():
        T = np.concatenate([t for t, n in lst]); N = np.concatenate([n for t, n in lst])
        T, N = to_part_space(part, T, N); enc, n = encode(T, N); enc.update(p=part, s=slot); meshes.append(enc); total += n; per[part] += n
    meshes.sort(key=lambda m: (PARTS.index(m['p']), SLOTS.index(m['s'])))
    return meshes, total, per

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'bikes', 'superbike.js'))
    a = ap.parse_args(); lods = {}; tris = {}
    for name in ('hi', 'lo'):
        lods[name], tris[name], per = make_lod(name)
        print('%s: %5d triangles %s (%d meshes)' % (name, tris[name], dict(per), len(lods[name])))
    anchors = dict(wb=WB, Rf=RF, Rr=RR, axleF=F.tolist(), axleR=R.tolist(), pivot=[round(x, 4) for x in PIV], rake=-RAKE,
                   fwPos=[0, round(float((F - PIV) @ UAX), 4), 0], grip=[[.30, .9, .4], [-.30, .9, .4]])
    data = dict(anchors=anchors, tris=tris, lod=lods)
    out = os.path.abspath(a.out); os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as f:
        f.write('/* Generated by tools/build_superbike.py (original procedural model): do not edit by hand.\n'
                '   Veloce RR 1000 superbike, quantised meshes per part and material slot; see SuperKit in index.html. */\n')
        f.write('window.APEX_SUPER=' + json.dumps(data, separators=(',', ':')) + ';\n')
    print('wrote %s (%d KB)' % (out, os.path.getsize(out) // 1024))

if __name__ == '__main__':
    main()
