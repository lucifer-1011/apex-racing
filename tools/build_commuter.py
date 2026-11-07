#!/usr/bin/env python3
"""Procedural 100 cc commuter for the Skyline Highway bike (BIKES.sport) -> assets/bikes/commuter.js.

ORIGINAL WORK: every vertex is drawn by this script (lofts, superellipse tank, tubes, lathes, boxes, extruded outlines). No
third party model is read or copied. Four product photos of an Indian 100 cc commuter (right side, front, left side, rear)
supplied by the project owner were only looked at for proportions, part layout and colours. No logo, badge or text is drawn:
the number plates are blank. See assets/bikes/README.md.

Output: window.APEX_COMMUTER = {anchors, tris, lod: {hi: [mesh], lo: [mesh]}}, same packing and parts as assets/bikes/adventure.js
(body, steer, fw, rw; decoded by MotoKit.decode in index.html).

Bike space: +y up, +z forward, +x the rider's LEFT, metres, ground at y = 0. Wheelbase and wheel radii follow BIKES.sport.cfg
(1.42, .30 / .31), so the photos are stretched about 8 % in length between the wheels. Chain case and gear lever on the left;
exhaust, kick starter, brake pedal and both drum brakes on the right.
Run:  python3 -I -B tools/build_commuter.py        (needs numpy; deterministic, no random numbers)
Shared primitives (lofts, tubes, panels, wheels, packing) are in tools/bikegeo.py.
"""
import argparse, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # tools/ (python -I leaves it off sys.path)
from bikegeo import *                                            # geometry kit: V, put, tube, loft, Q, STORE, raked, ...

# ------------------------------------------------------------------------------------------------- main dimensions
WB, RF, RR = 1.42, 0.30, 0.31              # must match BIKES.sport.cfg (wheelie pivot, tyre smoke, camera)
K = raked(WB, RF, RR, 26, 0.03, .74)       # rake 26 degrees, fork line .03 ahead of the steering axis, pivot on the top clamp
F, R, UAX, NF = K.F, K.R, K.UAX, K.NF
FL, AXP = K.FL, K.AXP
RIM = 0.229                                # 18 inch rims
SLOTS = ['paint', 'accent', 'trim', 'carbon', 'dark', 'metal', 'chrome', 'plate', 'tire', 'seat', 'gauge', 'head', 'tail',
         'indFL', 'indFR', 'indRL', 'indRR']
PARTS = ('body', 'steer', 'fw', 'rw')
BARC = V(0, .99, .30)                      # handlebar centre (flat bar on a short riser behind the top clamp)
GRIP = V(.315, 1.018, .168)                # left grip centre (the right one is mirrored)
EX = V(1, 0, 0)

def set_lod(name):
    hi = name == 'hi'
    Q.clear()
    Q.update(hi=hi, seg=32 if hi else 18, sn=12 if hi else 8, tn=8 if hi else 6, sm=6 if hi else 4, turns=6 if hi else 4,
             hseg=6 if hi else 5, ts=13 if hi else 7, tq=10 if hi else 6, lv=2 if hi else 1, spk=8 if hi else 4, fins=7 if hi else 4,
             arc=10 if hi else 6, detail=hi)

def interp(zs, vs): return lambda z: float(np.interp(z, zs, vs))

# ------------------------------------------------------------------------------------------------- skinned graphics
# Paint panels and pin-stripes on curved bodywork: a 2D outline in (z, y) is triangulated, subdivided and projected onto the
# surface x = sx * (surf(z, y) + off), so the graphic follows the curve of the tank instead of cutting through it.
def skin_tris(part, slot, T2, surf, sx, off, lv):
    for _ in range(lv):
        a, b, c = T2[:, 0], T2[:, 1], T2[:, 2]; ab, bc, ca = (a + b) / 2, (b + c) / 2, (c + a) / 2
        T2 = np.concatenate([np.stack(t, 1) for t in ((a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca))])
    T = np.zeros(T2.shape[:2] + (3,))
    for i in range(T2.shape[0]):
        for j in range(3):
            z, y = T2[i, j]; T[i, j] = (sx * (surf(z, y) + off), y, z)
    fn = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); bad = fn[:, 0] * sx < 0
    T[bad] = flip(T[bad]); put(part, slot, T, None, 35, None)

def skin(part, slot, poly, surf, sx, off=.0025, lv=None):
    P = np.asarray(poly, float)
    skin_tris(part, slot, P[np.array(earclip([tuple(p) for p in P]))], surf, sx, off, Q['lv'] if lv is None else lv)

def band(part, slot, pts, w, surf, sx, off=.0035, m=3):
    """Pin-stripe of width w along a (z, y) polyline, projected onto the surface."""
    P = np.asarray(pts, float); D = []
    for i in range(len(P) - 1):
        for k in range(m): D.append(P[i] + (P[i + 1] - P[i]) * k / m)
    D.append(P[-1]); D = np.array(D); T = []
    for i in range(len(D) - 1):
        d = D[i + 1] - D[i]; n = np.array([-d[1], d[0]]) / np.linalg.norm(d) * w
        a, b = D[i], D[i + 1]; T += [[a, b, b + n], [a, b + n, a + n]]
    skin_tris(part, slot, np.array(T), surf, sx, off, 0)

# ------------------------------------------------------------------------------------------------- wheels
def wheel(part, C, Rt, hw, hub):
    prof = [(-.8 * hw, RIM + .006), (-hw, RIM + .028), (-.96 * hw, Rt - .024), (-.62 * hw, Rt - .005), (0, Rt), (.62 * hw, Rt - .005),
            (.96 * hw, Rt - .024), (hw, RIM + .028), (.8 * hw, RIM + .006)]
    if not Q['hi']: prof = [prof[i] for i in (0, 1, 3, 4, 5, 7, 8)]
    lathe_x(part, 'tire', prof, C, Q['seg'], closed=False)
    rp = [(-.024, RIM - .018), (-.026, RIM + .007), (-.019, RIM + .007), (-.016, RIM - .004), (.016, RIM - .004), (.019, RIM + .007),
          (.026, RIM + .007), (.024, RIM - .018)]
    if not Q['hi']: rp = [rp[i] for i in (0, 1, 6, 7)]
    lathe_x(part, 'metal', rp, C, Q['seg'], closed=True, crease=50)
    # five straight alloy spokes, flaring where they meet the rim
    st = [(.045, .036, .030), (.13, .027, .022), (RIM - .014, .046, .020)]
    for k in range(5):
        a = 2 * PI * k / 5 + .3; er = V(0, math.cos(a), math.sin(a)); et = V(0, -math.sin(a), math.cos(a))
        S = []
        for r, w, t in st:
            c = np.asarray(C, float) + er * r
            if Q['spk'] == 8:
                q = [(-w / 2, -t * .3), (-w * .35, -t / 2), (w * .35, -t / 2), (w / 2, -t * .3), (w / 2, t * .3), (w * .35, t / 2), (-w * .35, t / 2), (-w / 2, t * .3)]
            else:
                q = [(-w / 2, -t / 2), (w / 2, -t / 2), (w / 2, t / 2), (-w / 2, t / 2)]
            S.append(np.array([c + et * u + EX * v for u, v in q]))
        T, g = loft(S); put(part, 'metal', T, g, 40)
    tube(part, 'metal', C + V(-hub, 0, 0), C + V(hub, 0, 0), .05, .05, Q['sn'])                # hub
    tube(part, 'metal', C + V(-hub - .012, 0, 0), C + V(-hub, 0, 0), .07, .07, Q['sn'])        # brake drum face (right)
    tube(part, 'metal', C + V(-hub - .03, 0, 0), C + V(hub + .03, 0, 0), .011, .011, 6)        # axle

# ------------------------------------------------------------------------------------------------- front end (steer part)
def arc_shell(part, slot, C, r, a0, a1, hw, n, dep=.032, th=.006):
    """Fender: an inverted U section swept round the wheel centre C (angles from +y towards +z)."""
    out = [(-hw, -dep), (-hw, -.008), (-hw * .6, .003), (0, .005), (hw * .6, .003), (hw, -.008), (hw, -dep)]
    inn = [(-hw + th, -dep), (-hw + th, -.008 - th * .5), (-hw * .6, .003 - th), (0, .005 - th), (hw * .6, .003 - th), (hw - th, -.008 - th * .5), (hw - th, -dep)]
    prof = out + inn[::-1]; S = []
    for k in range(n + 1):
        a = a0 + (a1 - a0) * k / n; er = V(0, math.cos(a), math.sin(a))
        S.append(np.array([np.asarray(C, float) + EX * x + er * (r + d) for x, d in prof]))
    T, g = loft(S); put(part, slot, T, g, 35)

def build_front():
    fx = (EX, UAX, NF)
    for sx in (-1, 1):
        x = V(sx * .078, 0, 0)
        tube('steer', 'metal', FL(-.03) + x, FL(.30) + x, .026, .025, Q['sn'])               # silver lower slider
        tube('steer', 'chrome', FL(.28) + x, FL(.57) + x, .017, .017, Q['sn'])               # chrome stanchion
        tube('steer', 'dark', FL(.55) + x, FL(.76) + x, .027, .027, Q['tn'])                 # black fork cover under the cowl
        obox('steer', 'metal', F + x + V(sx * .004, 0, 0), (.046, .07, .06), fx)              # axle foot
    tube('steer', 'metal', F + V(-.11, 0, 0), F + V(.11, 0, 0), .012, .012, 6)               # axle ends
    # front drum brake plate (right) with its torque arm
    tube('steer', 'metal', F + V(-.052, 0, 0), F + V(-.064, 0, 0), .086, .086, Q['sn'])
    tube('steer', 'dark', F + V(-.066, .03, -.06), FL(.2) + V(-.078, 0, 0), .007, .007, 5)
    obox('steer', 'dark', FL(.56) - NF * .015, (.21, .04, .07), fx)                          # bottom clamp
    obox('steer', 'dark', FL(.745) - NF * .015, (.21, .03, .07), fx)                         # top clamp
    polytube('steer', 'dark', [AXP(.745), AXP(.745) + V(0, .02, -.04), BARC + V(0, -.012, 0)], .018, Q['tn'])   # riser
    obox('steer', 'dark', BARC, (.09, .035, .045))                                           # bar clamp
    # flat wide bar (chrome), grips, switch cubes, levers, round mirrors on black stalks
    g = GRIP
    bar = [V(-.37, g[1] + .002, g[2] - .004), V(-.25, g[1] - .002, g[2] + .006), V(-.15, .997, .245), V(-.06, BARC[1], BARC[2]),
           V(.06, BARC[1], BARC[2]), V(.15, .997, .245), V(.25, g[1] - .002, g[2] + .006), V(.37, g[1] + .002, g[2] - .004)]
    polytube('steer', 'chrome', bar, .011, Q['tn'], 30)
    for sx in (-1, 1):
        tube('steer', 'seat', V(sx * .262, g[1] - .001, g[2] + .004), V(sx * .37, g[1] + .002, g[2] - .004), .018, .018, Q['tn'])
        obox('steer', 'dark', V(sx * .232, g[1] - .002, g[2] + .01), (.045, .04, .05))       # switch cube / throttle housing
        obox('steer', 'dark', V(sx * .19, g[1] - .006, g[2] + .03), (.035, .032, .04))       # lever mount
        polytube('steer', 'metal', [V(sx * .195, g[1] - .002, g[2] + .05), V(sx * .27, g[1] - .006, g[2] + .085), V(sx * .35, g[1] - .01, g[2] + .07)], .0055, 5)
        m0, m1 = V(sx * .22, g[1] + .01, g[2] + .03), V(sx * .31, 1.19, .20)
        polytube('steer', 'dark', [m0, m0 + V(sx * .03, .07, .005), m1], .0065, 5)
        mc = m1 + V(sx * .025, .035, -.005); n = Q['tq'] + 2
        oval = [(.048 * math.cos(2 * PI * k / n), .04 * math.sin(2 * PI * k / n)) for k in range(n)]
        extrude('steer', 'dark', oval, mc - V(0, 0, .004), EX, V(0, 1, 0), V(0, 0, 1), .024, .8)
        flat('steer', 'gauge', [(x * .9, y * .9) for x, y in oval], mc - V(0, 0, .005), EX, V(0, 1, 0), V(0, 0, -1))
        # front indicators on short stalks under the cowl
        tube('steer', 'dark', V(sx * .085, .842, .50), V(sx * .18, .845, .515), .007, .007, 5)
        obox('steer', 'indFL' if sx > 0 else 'indFR', V(sx * .205, .845, .52), (.05, .036, .046))
        obox('steer', 'dark', V(sx * .205, .845, .497), (.044, .03, .012))
    build_cowl()
    arc_shell('steer', 'carbon', F, RF + .03, math.radians(-52), math.radians(33), .05, Q['arc'])   # black front fender
    tube('steer', 'dark', FL(.12) + V(.062, 0, 0), FL(.12) + V(.078, 0, 0), .012, .012, 5)
    tube('steer', 'dark', FL(.12) + V(-.062, 0, 0), FL(.12) + V(-.078, 0, 0), .012, .012, 5)

def build_cowl():
    """Headlamp visor: a fork-mounted shell with a rectangular headlight, twin round dials behind, blank plate below."""
    st = [(.40, .80, 1.068, .112), (.47, .79, 1.075, .12), (.55, .79, 1.045, .119), (.61, .80, .995, .112), (.635, .81, .975, .102)]
    S = []
    for z, yb, yt, hw in st:
        half = [(0, yb), (hw * .85, yb + .004), (hw, yb + .05), (hw * .98, (yb + yt) / 2 + .03), (hw * .8, yt - .028), (hw * .42, yt - .004), (0, yt)]
        S.append(sec(z, sym(half)))
    T, g = loft(S); put('steer', 'paint', T, g, 30)
    rect = [(-.08, -.043), (.08, -.043), (.08, .043), (-.08, .043)]
    o = V(0, .89, .635)
    extrude('steer', 'dark', [(x * 1.1, y * 1.18) for x, y in rect], o, EX, V(0, 1, 0), V(0, 0, 1), .008, .97)   # bezel
    flat('steer', 'head', rect, o + V(0, 0, .0085), EX, V(0, 1, 0), V(0, 0, 1))
    obox('steer', 'plate', V(0, .776, .62), (.26, .046, .006))                                 # blank front plate
    obox('steer', 'dark', V(0, .80, .605), (.06, .03, .03))
    # twin round dials on the back of the cowl, facing the rider
    nn = unit(V(0, .55, -.84)); u, w = EX, np.cross(nn, EX)
    for sx in (-1, 1):
        c = V(sx * .045, 1.035, .40)
        tube('steer', 'dark', c - nn * .03, c, .04, .04, Q['tn'] + 4)
        dial = [(.032 * math.cos(2 * PI * k / 12), .032 * math.sin(2 * PI * k / 12)) for k in range(12)]
        flat('steer', 'gauge', dial, c + nn * .001, u, w, nn)

# ------------------------------------------------------------------------------------------------- tank (superellipse sections)
TZ = [-.22, -.12, -.02, .08, .18, .26, .33, .37]
tyt = interp(TZ, [.80, .85, .885, .905, .908, .895, .875, .845])
tyb = interp(TZ, [.69, .68, .675, .675, .68, .69, .705, .73])
tw = interp(TZ, [.10, .128, .146, .152, .15, .14, .118, .08])
PT, PB = 2.4, 5.0

def tank_dims(z):
    yt, yb = tyt(z), tyb(z); return yt, yb, tw(z), yb + .42 * (yt - yb)

def tank_x(z, y):
    yt, yb, W, yw = tank_dims(z)
    t, p = ((y - yw) / (yt - yw), PT) if y >= yw else ((yw - y) / (yw - yb), PB)
    t = min(max(t, 0.0), 1.0); return W * (1 - t ** p) ** (1 / p)

def build_tank():
    n = Q['tq']; S = []
    for z in np.linspace(TZ[0], TZ[-1], Q['ts']):
        yt, yb, W, yw = tank_dims(z); half = []
        for k in range(n + 1):
            th = -PI / 2 + PI * k / n; c, s = math.cos(th), math.sin(th)
            p, H = (PT, yt - yw) if s > 0 else (PB, yw - yb)
            half.append((W * abs(c) ** (2 / p), yw + math.copysign(H * abs(s) ** (2 / p), s)))
        S.append(sec(z, half + [(-x, y) for x, y in half[-2:0:-1]]))
    T, g = loft(S); put('body', 'paint', T, g, 30)
    tube('body', 'metal', V(0, .895, .12), V(0, .913, .12), .036, .036, Q['sn'])                # fuel cap
    tube('body', 'dark', V(0, .913, .12), V(0, .916, .12), .024, .024, Q['tn'])
    silver = [(-.205, .700), (-.200, .758), (-.12, .773), (-.074, .781), (.0, .79), (.065, .798), (.12, .804), (.157, .81), (.20, .827),
              (.225, .836), (.243, .82), (.245, .79), (.225, .745), (.18, .715), (.11, .703), (0, .694), (-.10, .692)]
    stripe = [(-.20, .766), (-.12, .781), (0, .798), (.12, .812), (.165, .821), (.205, .838), (.232, .849), (.256, .834), (.261, .80),
              (.248, .758), (.22, .728)]
    for sx in (-1, 1):
        skin('body', 'accent', silver, tank_x, sx)
        band('body', 'trim', stripe, .008, tank_x, sx)

# ------------------------------------------------------------------------------------------------- panels, seat, tail, rack
SIDEX = lambda z, y: .118 + .03 * (y - .48)       # side cover under the seat front (outer plane)
FIX = lambda z, y: .112                           # black panel under the tank, above the cylinder

def build_panels():
    side = [(-.432, .670), (-.074, .672), (-.062, .608), (-.155, .484), (-.316, .479), (-.420, .55)]
    sil = [(-.40, .57), (-.10, .59), (-.16, .492), (-.31, .488)]
    fi = [(-.062, .672), (.273, .673), (.284, .600), (.203, .538), (-.039, .534), (-.074, .597)]
    for sx in (-1, 1):
        slab('body', 'paint', side, SIDEX, sx, .014)
        graphic('body', 'accent', sil, SIDEX, sx)
        band('body', 'trim', [(-.40, .577), (-.25, .587), (-.10, .597)], .007, SIDEX, sx, .0032, 1)
        slab('body', 'paint', fi, FIX, sx, .02)
        tube('body', 'metal', V(sx * .112, .60, .135), V(sx * .12, .60, .135), .013, .013, Q['tn'])     # round cap on the panel
    obox('body', 'dark', V(0, .60, -.12), (.2, .15, .5))                                            # air box / battery filler

def build_seat_tail():
    st = [(-.15, .785, .09, .07), (-.22, .80, .125, .09), (-.35, .812, .138, .10), (-.55, .83, .14, .11), (-.75, .845, .138, .12),
          (-.88, .852, .13, .12), (-.95, .85, .11, .10), (-.975, .84, .08, .08)]
    if not Q['hi']: st = [st[i] for i in (0, 1, 3, 5, 6, 7)]
    S = [sec(z, sym([(0, yt), (w * .78, yt - .004), (w, yt - .03), (w * .94, yt - th), (0, yt - th)])) for z, yt, w, th in st]
    T, g = loft(S); put('body', 'seat', T, g, 40)
    # black tail cowl under the seat, tail lamp on its end
    tl = [(-.40, .74, .58, .12), (-.55, .755, .63, .118), (-.72, .77, .67, .112), (-.88, .79, .695, .10), (-1.0, .80, .71, .085), (-1.035, .797, .72, .07)]
    S = [sec(z, sym([(0, yt), (w * .8, yt - .004), (w, yt - .03), (w, yb + .02), (w * .8, yb), (0, yb)])) for z, yt, yb, w in tl]
    T, g = loft(S); put('body', 'paint', T, g, 30)
    extrude('body', 'dark', [(-.068, -.04), (.068, -.04), (.068, .04), (-.068, .04)], V(0, .76, -1.03), EX, V(0, 1, 0), V(0, 0, -1), .012, .95)
    flat('body', 'tail', [(-.062, -.034), (.062, -.034), (.062, .034), (-.062, .034)], V(0, .76, -1.0425), EX, V(0, 1, 0), V(0, 0, -1))
    # rear inner fender over the tyre, black mudguard flap with the blank plate and the rear indicators
    arc_shell('body', 'carbon', R, RR + .035, math.radians(-68), math.radians(8), .055, Q['arc'])
    path = [(-.97, .715, .085), (-1.04, .675, .085), (-1.10, .61, .08), (-1.14, .53, .075), (-1.165, .45, .068)]
    S = []
    for i, (z, y, hw) in enumerate(path):
        a, b = path[max(i - 1, 0)], path[min(i + 1, len(path) - 1)]
        d = unit(V(0, b[1] - a[1], b[0] - a[0])); nrm = unit(np.cross(EX, d)); c = V(0, y, z)
        S.append(np.array([c - EX * hw - nrm * .004, c + EX * hw - nrm * .004, c + EX * hw + nrm * .004, c - EX * hw + nrm * .004]))
    T, g = loft(S); put('body', 'carbon', T, g, 35)
    d = unit(V(0, .53 - .675, -1.14 + 1.04)); nrm = unit(np.cross(d, EX))
    nrm = nrm if nrm[2] < 0 else -nrm
    obox('body', 'plate', V(0, .615, -1.097) + nrm * .006, (.17, .085, .005), (EX, np.cross(nrm, EX) * (1 if np.cross(nrm, EX)[1] > 0 else -1), nrm))
    for sx in (1, -1):
        tube('body', 'dark', V(sx * .07, .685, -1.0), V(sx * .145, .685, -.99), .007, .007, 5)
        obox('body', 'indRL' if sx > 0 else 'indRR', V(sx * .168, .685, -.99), (.044, .034, .05))
        obox('body', 'dark', V(sx * .168, .685, -.967), (.04, .03, .01))

def build_rack():
    """Chrome rear carrier over the tail, its side rails running down into grab rails along the seat."""
    tn = Q['sm']; y = .895
    polytube('body', 'chrome', [V(-.115, y, -.93), V(-.115, y, -1.15), V(-.09, y, -1.19), V(.09, y, -1.19), V(.115, y, -1.15), V(.115, y, -.93)], .009, tn)
    for z in (-.98, -1.06, -1.13): tube('body', 'chrome', V(-.115, y, z), V(.115, y, z), .006, .006, tn)
    for sx in (-1, 1):
        tube('body', 'chrome', V(sx * .045, y, -.93), V(sx * .045, y, -1.19), .006, .006, tn)
        polytube('body', 'chrome', [V(sx * .115, y, -.93), V(sx * .125, .88, -.89), V(sx * .135, .79, -.85), V(sx * .138, .745, -.76),
                                    V(sx * .135, .73, -.62), V(sx * .12, .715, -.54)], .01, tn)            # grab rail
        tube('body', 'chrome', V(sx * .09, y, -1.12), V(sx * .075, .795, -1.0), .008, .008, tn)          # rear support
        tube('body', 'chrome', V(sx * .135, .79, -.85), V(sx * .12, .70, -.84), .008, .008, tn)          # post to the frame

# ------------------------------------------------------------------------------------------------- engine, exhaust, frame
def case(slot, poly, x0, x1, sc=.94):
    sx = 1 if x1 > x0 else -1
    extrude('body', slot, poly, V(x0, 0, 0), V(0, 0, 1), V(0, 1, 0), V(sx, 0, 0), abs(x1 - x0), sc, None, 30)

def ellipse(cz, cy, a, b, p, n):
    out = []
    for k in range(n):
        t = 2 * PI * k / n; c, s = math.cos(t), math.sin(t)
        out.append((cz + a * math.copysign(abs(c) ** (2 / p), c), cy + b * math.copysign(abs(s) ** (2 / p), s)))
    return out

def build_engine():
    crank = [(-.21, .30), (-.19, .42), (-.12, .48), (.0, .485), (.08, .46), (.13, .40), (.12, .30), (.07, .23), (-.03, .20), (-.15, .22)]
    for sx in (-1, 1): case('metal', crank, 0, sx * .10, .95)
    case('plate', ellipse(-.05, .345, .115, .088, 3.0, 16 if Q['hi'] else 10), -.095, -.148, .88)       # clutch cover (right)
    # left: magneto cover and full chain case in one light grey moulding round to the rear sprocket
    left = [(.09, .40), (.06, .45), (-.05, .46), (-.15, .43), (-.40, .42), (-.60, .425), (-.71, .425), (-.79, .39), (-.82, .32), (-.80, .25),
            (-.72, .205), (-.60, .22), (-.40, .26), (-.18, .265), (-.08, .22), (.03, .215), (.09, .27)]
    case('plate', left, .088, .132, .96)
    tube('body', 'chrome', V(.132, R[1], R[2]), V(.142, R[1], R[2]), .016, .016, 6)                    # axle nut through the case
    # forward inclined cylinder with square fins, head and spark plug cap
    c0, c1 = V(0, .415, .07), V(0, .455, .29); d = unit(c1 - c0); up = unit(np.cross(d, EX))
    up = up if up[1] > 0 else -up
    tube('body', 'metal', c0, c1, .045, .045, Q['sn'])
    for t in np.linspace(.03, .19, Q['fins']): obox('body', 'metal', c0 + d * t, (.15, .135, .007), (EX, up, d))
    obox('body', 'metal', c1 - d * .012, (.145, .13, .045), (EX, up, d))
    obox('body', 'plate', c1 - d * .01 + up * .07, (.11, .02, .05), (EX, up, d))                          # rocker cover
    tube('body', 'dark', c1 + up * .07 + V(.03, 0, -.03), c1 + up * .1 + V(.04, 0, -.05), .012, .012, 6)
    obox('body', 'dark', V(0, .50, .0), (.08, .06, .07))                                               # carburettor
    obox('body', 'dark', V(0, .215, -.04), (.14, .04, .2))                                             # sump
    # header curling under the engine into the long slim silencer on the right, heat shield, black end cap
    polytube('body', 'chrome', [V(-.02, .41, .31), V(-.03, .33, .335), V(-.05, .25, .30), V(-.08, .20, .18), V(-.11, .19, .02),
                                V(-.14, .205, -.12), V(-.16, .225, -.20)], .017, Q['tn'], 40)
    a, b = V(-.16, .225, -.20), V(-.17, .315, -.88); d = unit(b - a)
    tube('body', 'chrome', a, a + d * .08, .022, .043, Q['sn'], crease=50)
    tube('body', 'chrome', a + d * .08, b - d * .07, .043, .040, Q['sn'], crease=50)
    tube('body', 'chrome', b - d * .07, b, .040, .028, Q['sn'], crease=50)
    tube('body', 'dark', b, b + d * .012, .026, .02, Q['tn'])
    tube('body', 'chrome', a + d * .14, a + d * .44, .05, .049, Q['sn'], crease=50)                   # heat shield
    if Q['detail']:
        for k in range(3):
            c = a + d * (.2 + .08 * k) + V(-.05, .006, 0)
            obox('body', 'dark', c, (.003, .018, .05), (EX, np.cross(d, EX) * -1, d))
    obox('body', 'dark', V(-.16, .33, -.62), (.025, .07, .03))                                         # silencer hanger
    # kick starter, brake pedal and rear brake rod (right); gear lever (left); footpegs; pillion pegs; side stand (left)
    polytube('body', 'metal', [V(-.155, .40, -.12), V(-.175, .36, -.22), V(-.18, .33, -.30)], .01, 5)
    tube('body', 'seat', V(-.18, .33, -.30), V(-.215, .33, -.30), .012, .012, 5)
    polytube('body', 'metal', [V(-.13, .28, -.08), V(-.155, .26, .04), V(-.165, .265, .12)], .008, 5)
    obox('body', 'metal', V(-.168, .268, .13), (.04, .012, .035))
    tube('body', 'dark', V(-.11, .27, -.06), V(-.09, .33, -.66), .004, .004, 4)
    polytube('body', 'metal', [V(.14, .30, -.06), V(.165, .28, .05), V(.17, .29, .12)], .008, 5)
    obox('body', 'metal', V(.172, .29, .13), (.04, .012, .03))
    for sx in (-1, 1):
        tube('body', 'dark', V(sx * .09, .27, -.12), V(sx * .135, .27, -.12), .012, .012, 6)
        tube('body', 'seat', V(sx * .135, .27, -.12), V(sx * .245, .27, -.12), .017, .017, Q['tn'])      # rubber footpeg
        tube('body', 'seat', V(sx * .12, .38, -.55), V(sx * .2, .38, -.55), .013, .013, Q['sm'])         # pillion peg
        tube('body', 'dark', V(sx * .1, .40, -.50), V(sx * .12, .38, -.55), .01, .01, Q['sm'])
    polytube('body', 'dark', [V(.12, .25, -.18), V(.15, .20, -.42)], .012, Q['sm'])
    obox('body', 'dark', V(.152, .195, -.44), (.04, .012, .06))

def build_frame():
    tube('body', 'dark', AXP(.52), AXP(.80), .03, .03, Q['sn'])                                     # head tube
    polytube('body', 'dark', [AXP(.58), V(0, .66, .37), V(0, .52, .30)], .022, Q['tn'])              # down tube
    polytube('body', 'dark', [AXP(.70), V(0, .74, .2), V(0, .70, -.18)], .024, Q['tn'])               # backbone
    for sx in (-1, 1):
        polytube('body', 'dark', [V(sx * .03, .70, -.18), V(sx * .085, .72, -.32), V(sx * .085, .74, -.97)], .013, Q['tn'])   # seat rail
        polytube('body', 'dark', [V(sx * .085, .70, -.36), V(sx * .095, .38, -.13)], .016, Q['tn'])   # down to the pivot
        # swingarm (outboard of the chain case on the left), shock bracket
        xs = .142 if sx > 0 else -.105
        a, b = V(xs, .36, -.13), V(xs, .315, -.71); dd = unit(b - a); upv = unit(np.cross(dd, EX)); upv = upv if upv[1] > 0 else -upv
        obox('body', 'dark', (a + b) / 2, (.02, .04, np.linalg.norm(b - a)), (EX, upv, dd))
        obox('body', 'dark', V(sx * .125, .40, -.62), (.02, .08, .03))
    tube('body', 'metal', V(-.15, .36, -.13), V(.155, .36, -.13), .012, .012, 8)                 # pivot bolt
    # rear brake plate (right, static) with torque arm
    tube('body', 'metal', R + V(-.05, 0, 0), R + V(-.064, 0, 0), .078, .078, Q['sn'])
    obox('body', 'dark', R + V(-.07, .05, .15), (.01, .02, .3), (EX, unit(V(0, 1, .2)), unit(V(0, -.2, 1))))
    # chrome crash guards (two loops in front of the engine)
    for sx in (-1, 1):
        polytube('body', 'chrome', [V(sx * .03, .70, .38), V(sx * .15, .70, .35), V(sx * .235, .66, .33), V(sx * .255, .58, .32),
                                    V(sx * .255, .44, .30), V(sx * .225, .37, .25), V(sx * .12, .33, .14)], .0125, Q['tn'], 40)
        tube('body', 'chrome', V(sx * .255, .52, .315), V(sx * .1, .45, .2), .009, .009, Q['sm'])
    # twin rear shocks: black top, chrome spring, chrome rod and lower body
    for sx in (-1, 1):
        top, bot = V(sx * .125, .665, -.50), V(sx * .125, .44, -.635); d = unit(bot - top); L = np.linalg.norm(bot - top)
        tube('body', 'dark', top + V(-.015, 0, 0), top + V(.015, 0, 0), .015, .015, 6)
        tube('body', 'dark', top, top + d * L * .24, .022, .022, Q['tn'])
        tube('body', 'chrome', top + d * L * .2, bot, .008, .008, Q['sm'])
        tube('body', 'chrome', top + d * L * .74, bot, .017, .017, Q['tn'])
        u, w = perp(d); pts = []; nt, hs = Q['turns'], Q['hseg']
        for k in range(nt * hs + 1):
            ang = 2 * PI * k / hs; t = k / (nt * hs)
            pts.append(top + d * (L * (.22 + .54 * t)) + (u * math.cos(ang) + w * math.sin(ang)) * .027)
        polytube('body', 'chrome', pts, .0045, 4 if Q['hi'] else 3, 70, caps=False)
        tube('body', 'dark', bot + V(-.014, 0, 0), bot + V(.014, 0, 0), .014, .014, 6)

def build():
    wheel('fw', F, RF, .035, .045); wheel('rw', R, RR, .04, .05)
    build_front(); build_tank(); build_panels(); build_seat_tail(); build_rack(); build_engine(); build_frame()

# ------------------------------------------------------------------------------------------------- output
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'bikes', 'commuter.js'))
    a = ap.parse_args()
    grip = [round(float(x), 4) for x in GRIP]
    write_js(a.out, 'APEX_COMMUTER', '/* Generated by tools/build_commuter.py (original procedural model): do not edit by hand.\n'
             '   100 cc commuter for the Skyline Highway bike, quantised meshes per part and material slot; see CommuterKit in index.html. */\n',
             K.anchors(grip), lambda name: make_lod(name, set_lod, build, K.to_part_space, PARTS, SLOTS))

if __name__ == '__main__':
    main()
