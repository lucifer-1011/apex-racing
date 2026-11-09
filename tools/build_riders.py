#!/usr/bin/env python3
"""Sculpted riders for the four bikes -> assets/riders.js (window.APEX_RIDERS).

ORIGINAL WORK: every surface is computed here from signed distance fields (tapered, elliptical capsules and ellipsoids joined with a
smooth union), meshed with a numpy surface-nets pass, snapped back onto the exact surface and given smooth normals from the field
gradient. No third party model or image is read. The result is a seamless, rounded body instead of stacked primitives.

Each rider is baked into the pose of its bike (hip, shoulder, grips, pegs, knee bend and head position as used by index.html addRider),
in bike space: +y up, +z forward, metres. Three regions are meshed at different resolutions: the body (torso, arms, legs, neck), the
head (helmet shell, chin bar, or the open-face dome and face of the cruiser rider) and the extremities (gloves and boots). Every vertex
carries a material slot (pri, sec, trim, glove, boot, skin, helm) chosen by the nearest part, and one mesh per slot is packed with the
same 16 bit quantisation as the bike models (decoded by MotoKit.decode in index.html).
Small details (visor, goggles, sunglasses, guards, stripes, buckles, soles) are still added by index.html; if this file is missing, or
a bike's pose no longer matches the one baked here, index.html builds the older procedural rider.

Run:  python3 -I -B tools/build_riders.py        (needs numpy; deterministic, no random numbers)
The POSES below are the values index.html computes for each bike (spec.cfg after its kit is applied): re-dump them if a bike model changes.
"""
import json, math, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # tools/ (python -I leaves it off sys.path)
from bikegeo import encode

POSES = {
 'commuter': dict(hip=[0, .9, -.3], sh=[0, 1.4, -.17], N=[0, 0.952, 0.3586], bar=dict(w=.315, y=.066, z=-.1906), peg=[.2, .27, -.12], kneeUp=.1, kneeFwd=.2, headFwd=.02),
 'cruiser':  dict(hip=[0, .92, -.46], sh=[0, 1.42, -.28], N=[-.0004, .9993, .4138], bar=dict(w=.3622, y=.104, z=-.1033), peg=[.2, .3, -.24], kneeUp=.12, kneeFwd=.2, headFwd=.02),
 'off':      dict(hip=[0, 1.17, -.24], sh=[0, 1.6, .14], N=[0, 1.1026, .3562], bar=dict(w=.36, y=.1147, z=-.0943), peg=[.205, .405, -.15], kneeUp=.13, kneeFwd=.2, headFwd=.06),
 'adv':      dict(hip=[0, 1.05, -.22], sh=[0, 1.58, -.1], N=[0, 1.0724, .4347], bar=dict(w=.37, y=.1486, z=-.1142), peg=[.215, .38, -.02], kneeUp=.1, kneeFwd=.2, headFwd=.03),
}
KIT = {   # body bulk (kw, kd) and boot height per rider style, the same numbers as K in index.html addRider
 'commuter': dict(kw=1.0, kd=1.0, boot=.1), 'cruiser': dict(kw=1.04, kd=1.04, boot=.12),
 'off': dict(kw=1.0, kd=1.0, boot=.3), 'adv': dict(kw=1.1, kd=1.12, boot=.2),
}
SLOTS = ['pri', 'sec', 'trim', 'glove', 'boot', 'skin', 'helm']
V = lambda *a: np.array(a, float)

# ------------------------------------------------------------------------------------------------- signed distance primitives
def smin(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0) / k
    return np.minimum(a, b) - h * h * k * .25

def ecap(a, b, rxa, rza, rxb=None, rzb=None):
    """Tapered capsule with an elliptical section (rx across the body's x axis, rz across the other); rounded ends."""
    a, b = np.array(a, float), np.array(b, float)
    rxb = rxa if rxb is None else rxb; rzb = rza if rzb is None else rzb
    d = b - a; L = float(np.linalg.norm(d)); T = d / L
    S = np.array([1., 0, 0]) - T * T[0]
    S = np.array([0., 0, 1]) if np.linalg.norm(S) < 1e-6 else S / np.linalg.norm(S)
    Nn = np.cross(T, S)
    def f(P):
        q = P - a; u = q @ T; uc = np.clip(u, 0, L); t = uc / L
        rx = rxa + (rxb - rxa) * t; rz = rza + (rzb - rza) * t
        x = q @ S; z = q @ Nn; rm = np.minimum(rx, rz); ex = np.abs(u - uc)
        return (np.sqrt((x / rx) ** 2 + (z / rz) ** 2 + (ex / rm) ** 2) - 1) * rm
    r = max(rxa, rza, rxb, rzb) + .02
    lo = np.minimum(a, b) - r; hi = np.maximum(a, b) + r
    return f, lo, hi

def cap(a, b, ra, rb=None):
    return ecap(a, b, ra, ra, ra if rb is None else rb, ra if rb is None else rb)

def ell(c, r):
    c = np.array(c, float); r = np.array(r, float)
    def f(P): return (np.linalg.norm((P - c) / r, axis=1) - 1) * r.min()
    return f, c - r - .02, c + r + .02

def clip(prim, n, o):
    """Remove everything on the +n side of the plane through o."""
    f, lo, hi = prim; n = np.array(n, float) / np.linalg.norm(n); o = np.array(o, float)
    return (lambda P: np.maximum(f(P), (P - o) @ n)), lo, hi

class Region:
    def __init__(s, k): s.k = k; s.p = []
    def add(s, prim, slot):
        f, lo, hi = prim; s.p.append((f, SLOTS.index(slot), lo, hi))
    def field(s, P, slots=False):
        d = None; best = None; bs = None
        for f, sl, lo, hi in s.p:
            di = f(P)
            d = di if d is None else smin(d, di, s.k)
            if slots:
                if best is None: best = di.copy(); bs = np.full(len(P), sl)
                else:
                    m = di < best; best = np.where(m, di, best); bs = np.where(m, sl, bs)
        return (d, bs) if slots else d
    def bounds(s):
        return np.min([p[2] for p in s.p], axis=0) - .03, np.max([p[3] for p in s.p], axis=0) + .03

# ------------------------------------------------------------------------------------------------- surface nets
CORN = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (1, 1, 0), (0, 0, 1), (1, 0, 1), (0, 1, 1), (1, 1, 1)]
EDGES = [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)]

def mesh_region(R, h):
    lo, hi = R.bounds()
    xs = np.arange(lo[0], hi[0] + h, h); ys = np.arange(lo[1], hi[1] + h, h); zs = np.arange(lo[2], hi[2] + h, h)
    nx, ny, nz = len(xs), len(ys), len(zs)
    X, Y, Zg = np.meshgrid(xs, ys, zs, indexing='ij')
    P = np.stack([X, Y, Zg], -1).reshape(-1, 3)
    d = R.field(P).reshape(nx, ny, nz); ins = d < 0
    cs = (nx - 1, ny - 1, nz - 1)
    sl = lambda a, o: a[o[0]:o[0] + cs[0], o[1]:o[1] + cs[1], o[2]:o[2] + cs[2]]
    cin = [sl(ins, o) for o in CORN]; cd = [sl(d, o) for o in CORN]
    allin = np.logical_and.reduce(cin); anyin = np.logical_or.reduce(cin); mixed = anyin & ~allin
    ids = np.full(cs, -1, np.int64); cells = np.argwhere(mixed); ids[mixed] = np.arange(len(cells))
    acc = np.zeros((len(cells), 3)); cnt = np.zeros(len(cells))
    org = np.stack([sl(X, (0, 0, 0)), sl(Y, (0, 0, 0)), sl(Zg, (0, 0, 0))], -1)[mixed]
    for a, b in EDGES:
        m = (cin[a] != cin[b])[mixed]
        da = cd[a][mixed]; db = cd[b][mixed]
        t = np.where(m, da / np.where(da - db == 0, 1, da - db), 0)
        pa = np.array(CORN[a], float); pb = np.array(CORN[b], float)
        acc += m[:, None] * (pa + (pb - pa) * t[:, None]); cnt += m
    V0 = org + acc / np.maximum(cnt, 1)[:, None] * h
    quads = []
    # quads: one per grid edge that crosses the surface (a quad of the four cells around it)
    for axis in range(3):
        a0 = ins[:nx - 1, 1:ny - 1, 1:nz - 1] if axis == 0 else (ins[1:nx - 1, :ny - 1, 1:nz - 1] if axis == 1 else ins[1:nx - 1, 1:ny - 1, :nz - 1])
        a1 = ins[1:nx, 1:ny - 1, 1:nz - 1] if axis == 0 else (ins[1:nx - 1, 1:ny, 1:nz - 1] if axis == 1 else ins[1:nx - 1, 1:ny - 1, 1:nz])
        idx = np.argwhere(a0 != a1)
        for q in idx:
            if axis == 0: i, j, k = q[0], q[1] + 1, q[2] + 1; c = [(i, j - 1, k - 1), (i, j, k - 1), (i, j, k), (i, j - 1, k)]
            elif axis == 1: i, j, k = q[0] + 1, q[1], q[2] + 1; c = [(i - 1, j, k - 1), (i, j, k - 1), (i, j, k), (i - 1, j, k)]
            else: i, j, k = q[0] + 1, q[1] + 1, q[2]; c = [(i - 1, j - 1, k), (i, j - 1, k), (i, j, k), (i - 1, j, k)]
            v = [ids[x] for x in c]
            if min(v) >= 0: quads.append(v)
    quads = np.array(quads, np.int64)
    # snap the vertices onto the exact surface (Newton steps on the field) and take smooth normals from its gradient
    Vp = V0.copy(); e = .004
    def grad(Q):
        g = np.stack([R.field(Q + o) - R.field(Q - o) for o in (V(e, 0, 0), V(0, e, 0), V(0, 0, e))], 1) / (2 * e)
        return g
    for _ in range(3):
        g = grad(Vp); dd = R.field(Vp)
        Vp = Vp - (dd / np.maximum((g * g).sum(1), 1e-6))[:, None] * g
        Vp = np.clip(Vp, V0 - h * .9, V0 + h * .9)
    g = grad(Vp); Nn = g / np.maximum(np.linalg.norm(g, axis=1), 1e-9)[:, None]
    _, vslot = R.field(Vp, slots=True)
    tris = []
    for q in quads:
        d02 = np.linalg.norm(Vp[q[0]] - Vp[q[2]]); d13 = np.linalg.norm(Vp[q[1]] - Vp[q[3]])
        tris += ([(q[0], q[1], q[2]), (q[0], q[2], q[3])] if d02 <= d13 else [(q[1], q[2], q[3]), (q[1], q[3], q[0])])
    tris = np.array(tris, np.int64)
    A, B, C = Vp[tris[:, 0]], Vp[tris[:, 1]], Vp[tris[:, 2]]
    gn = np.cross(B - A, C - A); flip = (gn * (Nn[tris[:, 0]] + Nn[tris[:, 1]] + Nn[tris[:, 2]])).sum(1) < 0
    tris[flip] = tris[flip][:, [0, 2, 1]]
    s0, s1, s2 = vslot[tris[:, 0]], vslot[tris[:, 1]], vslot[tris[:, 2]]
    ts = np.where((s0 == s1) | (s0 == s2), s0, np.where(s1 == s2, s1, s0))
    return Vp, Nn, tris, ts

# ------------------------------------------------------------------------------------------------- the riders
def build(name, lod):
    Pz = POSES[name]; K = KIT[name]; kw, kd = K['kw'], K['kd']
    hip, sh = V(*Pz['hip']), V(*Pz['sh']); N = V(*Pz['N']); bar = Pz['bar']
    dirv = (sh - hip); L = float(np.linalg.norm(dirv)); dirv /= L
    at = lambda t: hip + dirv * L * t
    head = sh + dirv * .19 + V(0, .02, Pz['headFwd'])
    hi = lod == 'hi'
    body = Region(.045); pants = Region(.04); hd = Region(.02); ext = Region(.02)   # body = jacket / jersey (pri), pants = legs (sec): separate surfaces, so the hem overlaps the pants without a stepped material edge
    # torso: pelvis, waist, chest, shoulder line as overlapping elliptical capsules
    pants.add(ecap(at(-.03), at(.3), .148 * kw, .104 * kd, .145 * kw, .102 * kd), 'sec')
    for t0, t1, a, b in [(.03, .2, (.176, .126), (.176, .126)), (.12, .45, (.17, .12), (.15, .105)), (.4, .72, (.15, .105), (.18, .128)), (.68, 1.03, (.18, .128), (.12, .075))]:
        body.add(ecap(at(t0), at(t1), a[0] * kw, a[1] * kd, b[0] * kw, b[1] * kd), 'pri')
    # neck and collar
    nb = head + V(0, -.09, -.015)
    body.add(cap(sh + dirv * .0, nb, .068, .05), 'pri')
    body.add(cap(sh + dirv * .03, sh + dirv * .1, .085, .068), 'pri')
    if name == 'cruiser': hd.add(cap(sh + dirv * .09, nb + V(0, .03, .0), .05, .048), 'skin')   # bare neck above the jacket collar
    for sx in (-1, 1):
        shoulder = sh + V(sx * .18 * kw, -.01, 0)
        grip = N + V(sx * bar['w'], bar['y'], bar['z'])
        elbow = shoulder + (grip - shoulder) * .5 + V(sx * .1, -.05, 0)
        fd = grip - elbow; fd /= np.linalg.norm(fd); wrist = grip - fd * .07
        body.add(ell(shoulder, (.078 * kw,) * 3), 'pri')
        body.add(cap(shoulder, elbow, .068 * kw, .05 * kw), 'pri')
        body.add(cap(elbow, wrist, .05 * kw, .04), 'pri')
        # glove: cuff, palm, fingers and thumb
        ext.add(cap(wrist - fd * .05, wrist + fd * .02, .048, .05), 'glove')
        ext.add(ell(grip + V(0, .005, -.02), (.044, .041, .062)), 'glove')
        ext.add(ell(grip + V(-sx * .012, -.03, .035), (.038, .032, .042)), 'glove')
        ext.add(ell(grip + V(sx * .02, -.012, .045), (.027, .027, .032)), 'glove')
        # leg
        hp = hip + V(sx * .1, 0, 0); foot = V(sx * Pz['peg'][0], Pz['peg'][1], Pz['peg'][2])
        knee = hp + (foot - hp) * .5 + V(sx * .07, Pz['kneeUp'], Pz['kneeFwd']); ankle = foot + V(0, .1, -.04)
        pants.add(ecap(hp + dirv * .02, hp + (knee - hp) * .45, .098 * kw, .092 * kd, .09, .086), 'sec')
        pants.add(cap(hp + (knee - hp) * .4, knee, .09, .067), 'sec')
        pants.add(ell(knee, (.072, .072, .076)), 'sec')
        pants.add(ecap(knee, knee + (ankle - knee) * .4, .064, .064, .066, .07), 'sec')
        pants.add(cap(knee + (ankle - knee) * .35, ankle + V(0, .02, 0), .066, .047), 'sec')
        # boot: shaft and toe box
        top = ankle + V(0, K['boot'], 0)
        ext.add(ecap(ankle + V(0, -.05, 0), top, .062, .066, .066, .07), 'boot')
        ext.add(ecap(foot + V(0, .05, -.04), foot + V(0, .045, .11), .052, .05, .052, .042), 'boot')
        ext.add(ell(foot + V(0, .05, .1), (.052, .045, .06)), 'boot')
    # head: full-face shell and chin bar, or the cruiser's open dome with a visible face
    c = head + V(0, 0, -.01)
    if name == 'cruiser':
        dome = clip(ell(c + V(0, .01, 0), (.13, .125, .155)), (0, -1, 0), c + V(0, -.012, 0))
        hd.add(dome, 'helm')
        hd.add(ell(head + V(0, -.04, .065), (.092, .104, .092)), 'skin')
        hd.add(ell(head + V(0, -.055, .15), (.018, .026, .026)), 'skin')
        hd.add(ell(head + V(0, -.112, .085), (.056, .043, .06)), 'skin')
    else:
        hd.add(ell(c, (.126, .134, .166)), 'helm')
        hd.add(ell(head + V(0, -.088, .062), (.094, .07, .105)), 'helm')
        if name == 'off': hd.add(ell(head + V(0, -.1, .1), (.08, .058, .12)), 'helm')
        if name == 'adv': hd.add(ell(head + V(0, -.1, .1), (.075, .055, .09)), 'helm')
    # voxel sizes: body, head, extremities
    vs = dict(hi=(.041, .021, .021), lo=(.064, .032, .033))[lod]
    per = {s: ([], []) for s in range(len(SLOTS))}
    for R, h in ((body, vs[0]), (pants, vs[0]), (hd, vs[1]), (ext, vs[2])):
        Vp, Nn, tris, ts = mesh_region(R, h)
        for s in range(len(SLOTS)):
            m = ts == s
            if m.any():
                per[s][0].append(Vp[tris[m]]); per[s][1].append(Nn[tris[m]])
    meshes = []; total = 0
    for s in range(len(SLOTS)):
        if not per[s][0]: continue
        T = np.concatenate(per[s][0]); Nrm = np.concatenate(per[s][1])
        enc, n = encode(T, Nrm); enc['s'] = SLOTS[s]; meshes.append(enc); total += n
    return meshes, total

def main():
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'riders.js')
    data = dict(poses=POSES, riders={})
    for name in POSES:
        data['riders'][name] = {}
        for lod in ('hi', 'lo'):
            meshes, tris = build(name, lod)
            data['riders'][name][lod] = meshes
            print('%-9s %s %6d triangles, %d meshes' % (name, lod, tris, len(meshes)))
    with open(out, 'w') as f:
        f.write('/* Sculpted riders for the four bikes (window.APEX_RIDERS), made by tools/build_riders.py: signed-distance sculpts meshed with\n'
                '   surface nets, one mesh per material slot (pri, sec, trim, glove, boot, skin, helm), baked into each bike\'s pose. Original work. */\n')
        f.write('window.APEX_RIDERS=' + json.dumps(data, separators=(',', ':')) + ';\n')
    print('wrote %s (%d KB)' % (out, os.path.getsize(out) // 1024))

if __name__ == '__main__':
    main()
