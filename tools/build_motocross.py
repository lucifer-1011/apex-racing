#!/usr/bin/env python3
"""Procedural motocross bike for the Canyon Motocross bike (Dune Raider 450) -> assets/bikes/motocross.js.

ORIGINAL WORK: every vertex is drawn by this script (lofted sections, flat angular panels, tubes, lathes). No third party
model is read or copied. Three reference pictures supplied by the project owner (two wireframe renders of motocross bikes and
one colour render of a white / red / black race bike) were only looked at for proportions, part layout and livery colours;
see assets/bikes/README.md.

Output: window.APEX_MX = {anchors, tris, lod: {hi: [mesh], lo: [mesh]}}; mesh = {p: part, s: material slot, v, i, min, max, b}
(b = base64 of uint16 positions scaled into min..max, int8 normals padded to an even length, uint16 triangle indices; same
packing as assets/bikes/moto.js, decoded by MotoKit.decode in index.html). Parts: body, steer (turns about the raked steering
axis; local space = bike space moved to the steering pivot and rotated by the rake), fw (front wheel, spins about x, local to
the front axle, in steer orientation) and rw (rear wheel, local to the rear axle).

Bike space: +y up, +z forward, +x the rider's LEFT, metres, wheelbase 1.48, ground at y = 0. Chain and front disc on the left,
exhaust and rear disc on the right, as on a real motocross bike.
Run:  python3 -I -B tools/build_motocross.py        (needs numpy; deterministic, no random numbers)
Shared primitives (lofts, tubes, panels, wheels, packing) are in tools/bikegeo.py.
"""
import argparse, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # tools/ (python -I leaves it off sys.path)
from bikegeo import *                                            # geometry kit: V, put, tube, loft, Q, STORE, raked, ...

# ------------------------------------------------------------------------------------------------- main dimensions
WB, RF, RR = 1.48, 0.40, 0.36              # must match BIKES.off.cfg (wheelie pivot, tyre smoke, camera)
K = raked(WB, RF, RR, 27, 0.03, .80)       # rake 27 degrees, fork line .03 ahead of the steering axis, pivot on the top clamp
F, R, RAKE, UAX, NF, OFF = K.F, K.R, K.RAKE, K.UAX, K.NF, K.OFF
FL, AXP, PIV, ROT = K.FL, K.AXP, K.PIV, K.ROT    # fork line point, steering axis point, steering pivot, bike -> steer rotation
RIMF, RIMR = 0.29, 0.255                   # rim radii (21 / 19 inch, scaled like the wheels)
SLOTS = ['paint', 'accent', 'trim', 'carbon', 'dark', 'metal', 'chrome', 'gold', 'hivis', 'tire', 'seat', 'plate',
         'head', 'tail', 'indFL', 'indFR', 'indRL', 'indRR']
PARTS = ('body', 'steer', 'fw', 'rw')
EXH = -1                                   # exhaust side (-x = right)

# ------------------------------------------------------------------------------------------------- level of detail
def set_lod(name):
    hi = name == 'hi'
    Q.clear()
    Q.update(hi=hi, seg=24 if hi else 16, rseg=24 if hi else 16, knobs=22 if hi else 18, spokes=18 if hi else 8,
             tn=8 if hi else 6, sn=12 if hi else 8, detail=hi, turns=5 if hi else 3, hseg=10 if hi else 6, teeth=30 if hi else 0)

# ------------------------------------------------------------------------------------------------- wheels
def tyre(part, C, Rt, Rim, hw):
    """Carcass (lathe) plus staggered rows of knob blocks; the knob tops reach the wheel radius Rt."""
    Rc = Rt - .014
    prof = [(-.70 * hw, Rim + .004), (-.93 * hw, Rim + .03), (-hw, Rc - .045), (-.78 * hw, Rc - .009), (0, Rc),
            (.78 * hw, Rc - .009), (hw, Rc - .045), (.93 * hw, Rim + .03), (.70 * hw, Rim + .004)]
    prof = [prof[i] for i in ((0, 2, 3, 4, 5, 6, 8) if Q['hi'] else (0, 2, 4, 6, 8))]
    lathe_x(part, 'tire', prof, C, Q['seg'], closed=False)
    n = Q['knobs']; p = 2 * PI / n
    for k in range(n):
        a = k * p
        if Q['hi']:
            knob(part, C, a, 0, Rc - .004, .018, .62 * hw, .024, 0)                      # centre row
            for s in (-1, 1):                                                            # shoulder rows, staggered
                knob(part, C, a + p / 2, s * .8 * hw, Rc - .012, .016, .44 * hw, .022, s * .55)
        else:
            s = 1 if k % 2 else -1                                                       # two staggered rows
            knob(part, C, a, s * .42 * hw, Rc - .006, .018, .62 * hw, .03, s * .3)

def wave_disc(part, C, x, ri, ro, holes):
    """Wave brake disc (drilled on hi) with its carrier; both faces."""
    n = 36 if Q['hi'] else Q['rseg']                 # 12 shallow waves of 3 facets each
    wave = lambda ph: ro + (.0045 * math.cos(12 * ph) if Q['hi'] else 0)
    for f in (-1, 1): ring(part, 'metal', x + f * .002, ri, wave, C, n, f)
    for f in (-1, 1): ring(part, 'dark', x + f * .003, .045, ri, C, Q['rseg'], f)           # carrier
    if holes and Q['hi']:
        rr = (ri + ro) / 2; m = 18
        for k in range(m):
            a = 2 * PI * k / m
            c = V(x, C[1] + rr * math.cos(a), C[2] + rr * math.sin(a))
            u = V(0, -math.sin(a), math.cos(a)); v = V(0, math.cos(a), math.sin(a))
            for f in (-1, 1): dot(part, 'dark', c + V(f * .0026, 0, 0), u, v, .0045, .0045, f)

def build_wheels():
    tyre('fw', F, RF, RIMF, .046); rim_spokes_hub('fw', F, RIMF, .052)
    wave_disc('fw', F, .062, .085, .135, True)                                 # front disc on the left
    tyre('rw', R, RR, RIMR, .058); rim_spokes_hub('rw', R, RIMR, .06)
    wave_disc('rw', R, -.07, .07, .11, True)                                   # rear disc on the right
    sprocket('rw', R + V(.074, 0, 0), .125, Q['teeth'])                        # rear sprocket on the left

# ------------------------------------------------------------------------------------------------- front end (steer part)
def build_front():
    fx = (V(1, 0, 0), UAX, NF)
    for sx in (-1, 1):
        x = V(sx * .09, 0, 0)
        tube('steer', 'gold', FL(.40) + x, FL(.865) + x, .029, .029, Q['sn'])            # gold outer tube (inverted fork)
        tube('steer', 'plate', FL(.395) + x, FL(.43) + x, .032, .032, Q['sn'])           # dust seal collar
        if Q['detail']: tube('steer', 'gold', FL(.60) + x, FL(.62) + x, .031, .031, Q['sn'])   # anodised rings at the clamps
        tube('steer', 'accent', FL(.865) + x, FL(.88) + x, .022, .022, Q['tn'])          # red top cap
        tube('steer', 'chrome', FL(.06) + x, FL(.42) + x, .021, .021, Q['sn'])           # inner tube
        obox('steer', 'metal', FL(.035) + x + V(sx * .004, 0, 0), (.05, .12, .065), fx)  # axle foot
        tube('steer', 'accent', F + V(sx * .115, 0, 0), F + V(sx * .127, 0, 0), .014, .014, 6)   # axle nut
        # fork guard: angular plastic shell over the front and outside of the inner tube, with a yellow stripe
        S = []
        for s in (.10, .40):
            c = FL(s) + x; rr = .036 if s < .2 else .032
            loop = []
            for t in np.linspace(-1.9, 1.5, 5):          # angle from straight ahead, positive towards the outside
                d = math.cos(t) * NF + math.sin(t) * V(sx, 0, 0); loop.append(c + d * rr)
            for t in np.linspace(1.5, -1.9, 5):
                d = math.cos(t) * NF + math.sin(t) * V(sx, 0, 0); loop.append(c + d * (rr - .005))
            S.append(np.array(loop))
        T, g = loft(S); put('steer', 'dark', T, g, 25)
        o = FL(.25) + x + V(sx * .0335, 0, 0) + NF * .012
        for k, (s0, s1) in enumerate(((-.13, .1), (.105, .135))):
            flat('steer', 'hivis', [(-.004, s0), (.004, s0), (.004, s1), (-.004, s1)], o, NF, UAX, V(sx, 0, 0))
    # front brake caliper behind the left leg, on its bracket
    cc = F + V(.064, -.03, -.118)
    obox('steer', 'gold', cc, (.046, .075, .05), (V(1, 0, 0), unit(V(0, .97, .25)), unit(V(0, -.25, .97))))
    obox('steer', 'metal', F + V(.085, -.01, -.06), (.02, .05, .1))
    # triple clamps and steering stem
    obox('steer', 'metal', FL(.605) - NF * .02, (.25, .045, .1), fx)
    obox('steer', 'metal', FL(.79) - NF * .02, (.25, .035, .1), fx)
    tube('steer', 'dark', AXP(.81), AXP(.83), .02, .02, Q['tn'])
    # handlebar: risers, fat tapered bar, crossbar pad, grips, levers, master cylinders
    for sx in (-1, 1):
        tube('steer', 'dark', AXP(.81) + V(sx * .035, 0, 0), AXP(.86) + V(sx * .035, 0, 0) - NF * .01, .016, .016, Q['tn'])
    yb, zb = AXP(.86)[1] + .008, AXP(.86)[2] - .012
    polytube('steer', 'metal', [V(-.405, yb + .07, zb - .065), V(-.24, yb + .045, zb - .035), V(-.13, yb, zb), V(.13, yb, zb),
                                V(.24, yb + .045, zb - .035), V(.405, yb + .07, zb - .065)], .0115, Q['tn'], 30)
    obox('steer', 'accent', V(0, yb + .012, zb), (.17, .05, .055))
    for sx in (-1, 1):
        a, b = V(sx * .30, yb + .059, zb - .052), V(sx * .415, yb + .071, zb - .066)
        tube('steer', 'seat', a, b, .0175, .0175, Q['tn'])                               # grip
        tube('steer', 'dark', b, b + (b - a) * .08, .019, .019, Q['tn'])                 # bar end
        obox('steer', 'dark', V(sx * .25, yb + .05, zb - .035), (.03, .03, .04))          # lever perch
        polytube('steer', 'metal', [V(sx * .255, yb + .05, zb - .01), V(sx * .33, yb + .045, zb + .045), V(sx * .405, yb + .04, zb + .03)], .006, 5)
        obox('steer', 'dark', V(sx * .195, yb + .045, zb - .015), (.04, .035, .045))      # master cylinder / clutch
        if sx < 0:
            obox('steer', 'accent', V(sx * .195, yb + .07, zb - .015), (.03, .012, .034))  # red reservoir cap
            obox('steer', 'dark', V(sx * .29, yb + .058, zb - .05), (.03, .04, .045))      # throttle housing
    if Q['detail']:
        polytube('steer', 'dark', [V(-.195, yb + .04, zb + .01), V(-.05, yb - .1, zb + .1), V(.11, .96, .5), V(.118, .62, .64),
                                   F + V(.07, .02, -.1)], .004, 4)
    build_fender_front()
    build_plate()

def build_fender_front():
    st = [(.42, .885, .045, .02), (.50, .915, .055, .032), (.62, .935, .07, .04), (.76, .935, .086, .046), (.88, .918, .086, .042),
          (.98, .89, .07, .032), (1.06, .862, .045, .022), (1.12, .838, .014, .01)]
    def tag(i, j):
        if j in (2, 3) and i >= 6: return 1                 # red tip
        if j in (2, 3) and i in (4, 5): return 2            # black graphic band
        if j in (1, 4) and i in (3, 4, 5): return 1         # red side flash
        return 0
    u_shell(st, 'steer', ['paint', 'accent', 'trim'], tag)

def build_plate():
    """Front number plate: black plate with a white number field, a red slash, a small light and indicators."""
    o = FL(.74) + NF * .10; u, v, n = V(1, 0, 0), UAX, NF
    poly = [(-.118, .15), (.118, .15), (.124, .06), (.095, -.07), (.045, -.13), (-.045, -.13), (-.095, -.07), (-.124, .06)]
    extrude('steer', 'trim', poly, o - n * .012, u, v, n, .012, .97)
    fo = o + n * .0017
    flat('steer', 'paint', [(-.09, .125), (.09, .125), (.095, .03), (.065, -.06), (-.065, -.06), (-.095, .03)], fo, u, v, n)
    flat('steer', 'accent', [(.03, .135), (.105, .135), (.11, .095), (.06, .085)], fo + n * .0004, u, v, n)
    flat('steer', 'accent', [(-.105, .135), (-.03, .135), (-.06, .085), (-.11, .095)], fo + n * .0004, u, v, n)
    flat('steer', 'trim', [(-.035, .07), (.035, .07), (.035, .06), (-.035, .06)], fo + n * .0004, u, v, n)
    # number plate light (LED strip, lit by setLights through M.head) and its housing
    extrude('steer', 'dark', [(-.045, -.105), (.045, -.105), (.04, -.075), (-.04, -.075)], fo, u, v, n, .012, .9)
    flat('steer', 'head', [(-.037, -.1), (.037, -.1), (.033, -.08), (-.033, -.08)], fo + n * .0125, u, v, n)
    # small indicators on the plate edges (+x = left)
    for sx in (1, -1):
        c = o + u * sx * .128 + v * .02 + n * .002
        obox('steer', 'indFL' if sx > 0 else 'indFR', c, (.02, .03, .018), (u, v, n))

# ------------------------------------------------------------------------------------------------- bodywork
SHROUD = lambda z, y: .085 + .26 * z + .13 * (1.07 - y)                 # upper facet of the radiator shroud (outer plane)
SHROUD_LO = lambda z, y: SHROUD(z, y) - .15 * (.86 - y)                 # lower facet folds inwards below y = .86
SIDE = lambda z, y: .10 + .05 * (y - .65)                               # rear side panel (number board) plane

def build_shrouds():
    up = [(.43, 1.065), (.48, .95), (.448, .86), (.071, .86), (.06, .88), (-.02, 1.0), (.12, 1.04)]
    lo = [(.448, .86), (.42, .78), (.33, .60), (.24, .58), (.16, .70), (.071, .86)]
    for sx in (-1, 1):
        slab('body', 'paint', up, SHROUD, sx, .006); slab('body', 'paint', lo, SHROUD_LO, sx, .006)
        # red graphic with the dark vent window in it, black front edge, red flash at the back
        graphic('body', 'accent', [(.42, 1.055), (.465, .95), (.444, .868), (.25, .868), (.13, .95), (.09, 1.03), (.14, 1.035)], SHROUD, sx)
        graphic('body', 'dark', [(.385, 1.025), (.415, .955), (.395, .90), (.27, .90), (.215, .975)], SHROUD, sx, .0032)
        graphic('body', 'trim', [(.444, .852), (.418, .78), (.33, .612), (.295, .62), (.37, .78), (.40, .852)], SHROUD_LO, sx)
        graphic('body', 'accent', [(.075, .852), (.155, .715), (.19, .72), (.12, .852)], SHROUD_LO, sx)
        graphic('body', 'trim', [(.10, .99), (.02, .985), (.065, .90), (.12, .90)], SHROUD, sx)
        if Q['detail']:                                                   # louvres over the vent window
            for k in range(4):
                z0 = .25 + .035 * k
                graphic('body', 'trim', [(z0 + .06, 1.0), (z0 + .072, 1.0), (z0 + .022, .91), (z0 + .01, .91)], SHROUD, sx, .0046)
        # radiator behind the shroud
        obox('body', 'dark', V(sx * .105, .72, .27), (.07, .3, .06))
        if Q['detail']:
            for k in range(5): obox('body', 'metal', V(sx * .105, .6 + .055 * k, .302), (.066, .008, .006))

def build_tank_seat():
    stn = [(.42, 1.05, .055, .92), (.32, 1.075, .085, .86), (.18, 1.06, .095, .84), (.04, 1.02, .09, .84)]
    S = [sec(z, sym([(0, yt), (w * .7, yt - .004), (w, yt - .04), (w * .9, yb), (0, yb)])) for z, yt, w, yb in stn]
    T, g = loft(S); put('body', 'trim', T, g, 35)
    tube('body', 'paint', V(0, 1.07, .345), V(0, 1.088, .345), .03, .03, Q['sn'])             # fuel cap
    tube('body', 'accent', V(0, 1.088, .345), V(0, 1.096, .345), .022, .022, Q['sn'])
    # long flat seat climbing onto the tank
    st = [(.31, 1.088, .045, .07), (.22, 1.082, .07, .085), (.10, 1.058, .09, .09), (-.05, 1.04, .11, .09), (-.25, 1.035, .122, .08),
          (-.45, 1.04, .12, .06), (-.60, 1.05, .105, .042), (-.68, 1.055, .08, .03)]
    S = [sec(z, sym([(0, yt), (w * .78, yt - .002), (w, yt - .022), (w * .96, yt - th), (0, yt - th)])) for z, yt, w, th in st]
    T, g = loft(S); put('body', 'seat', T, g, 40)
    if Q['detail']:                                                       # grip ribs across the seat top
        for k in range(10):
            z = .15 - k * .072
            j = max(i for i in range(len(st) - 1) if st[i][0] >= z) if z <= st[0][0] else 0
            a, b = st[j], st[min(j + 1, len(st) - 1)]; t = (a[0] - z) / max(a[0] - b[0], 1e-9)
            yt = a[1] + (b[1] - a[1]) * t; w = (a[2] + (b[2] - a[2]) * t) * .74
            obox('body', 'dark', V(0, yt + .001, z), (2 * w, .006, .014))

def build_rear():
    st = [(-.40, .995, .118, .05), (-.55, 1.005, .128, .06), (-.70, 1.025, .118, .06), (-.84, 1.048, .095, .05), (-.96, 1.065, .066, .038),
          (-1.06, 1.078, .036, .024), (-1.13, 1.086, .012, .01)]
    def tag(i, j):
        if j in (2, 3) and i == 5: return 1                 # red tip
        if j in (2, 3) and i in (3, 4): return 2            # black wedge on top
        if j in (0, 5) and i in (2, 3): return 1            # red flanks
        return 0
    u_shell(st, 'body', ['paint', 'accent', 'trim'], tag)
    # tail light on the top of the fender near the tip (lit by setLights through M.tail) and tiny rear indicators
    o = V(0, 1.073, -1.0); n = unit(V(0, .55, -.84)); u, v, n = frame_from_n(n, V(0, 0, -1))
    extrude('body', 'trim', [(-.05, -.02), (.05, -.02), (.038, .02), (-.038, .02)], o, u, v, n, .006, .9)
    flat('body', 'tail', [(-.042, -.014), (.042, -.014), (.032, .014), (-.032, .014)], o + n * .0065, u, v, n)
    for sx in (1, -1):
        obox('body', 'indRL' if sx > 0 else 'indRR', V(sx * .082, 1.025, -.9), (.022, .016, .03))
    # side panels (number boards) with their graphics
    side = [(-.04, .975), (-.66, 1.0), (-.70, .95), (-.52, .82), (-.30, .66), (-.12, .65), (-.04, .76)]
    for sx in (-1, 1):
        slab('body', 'paint', side, SIDE, sx, .006)
        graphic('body', 'accent', [(-.10, .95), (-.17, .95), (-.41, .70), (-.34, .70)], SIDE, sx)
        graphic('body', 'accent', [(-.21, .955), (-.24, .955), (-.47, .78), (-.44, .77)], SIDE, sx)
        graphic('body', 'trim', [(-.48, .985), (-.655, .995), (-.685, .955), (-.56, .885)], SIDE, sx)
        graphic('body', 'trim', [(-.06, .80), (-.13, .668), (-.22, .668), (-.08, .90)], SIDE, sx)
    obox('body', 'dark', V(0, .82, -.33), (.18, .2, .38))                  # airbox

def build_exhaust():
    x = EXH
    polytube('body', 'metal', [V(x * .03, .70, .23), V(x * .05, .62, .345), V(x * .10, .48, .35), V(x * .155, .42, .22),
                               V(x * .17, .44, .02), V(x * .172, .52, -.18), V(x * .178, .63, -.32), V(x * .185, .70, -.40)], .021, Q['tn'], 35)
    a, b = V(x * .185, .695, -.38), V(x * .19, .865, -.90)
    tube('body', 'metal', a, b, .052, .047, Q['sn'], crease=50)                 # silencer
    d = unit(b - a)
    tube('body', 'chrome', b, b + d * .035, .047, .03, Q['sn'], crease=50)     # end cap
    tube('body', 'dark', b + d * .035, b + d * .045, .02, .02, Q['tn'])        # outlet
    for k in range(3 if Q['detail'] else 1):                                   # straps
        c = a + d * (.06 + .03 * k); tube('body', 'dark', c, c + d * .01, .055, .055, Q['sn'])
    # red label on the outer side of the can
    c = a + d * .35 + V(x * .0545, 0, 0)
    flat('body', 'accent', [(-.06, -.024), (.06, -.024), (.06, .024), (-.06, .024)], c, d, V(0, 1, 0) - d * d[1], V(x, 0, 0))
    obox('body', 'dark', V(x * .14, .84, -.6), (.06, .02, .03))                 # can bracket

def build_engine_frame():
    # crankcase: an angular side profile extruded both ways from the centre plane (bevelled outer faces), covers, cylinder, head
    case = [(.27, .43), (.29, .34), (.24, .245), (.10, .215), (-.06, .225), (-.15, .29), (-.165, .39), (-.11, .475), (.02, .50), (.19, .50)]
    for sx in (-1, 1): extrude('body', 'metal', case, V(0, 0, 0), V(0, 0, 1), V(0, 1, 0), V(sx, 0, 0), .11, .9)
    tube('body', 'metal', V(-.11, .37, .02), V(-.142, .37, .02), .085, .08, Q['sn'])       # clutch cover (right)
    tube('body', 'dark', V(.11, .38, .10), V(.135, .38, .10), .07, .066, Q['sn'])         # ignition cover (left)
    cy = (V(1, 0, 0), unit(V(0, 1, .15)), unit(V(0, -.15, 1)))
    obox('body', 'dark', V(0, .60, .13), (.13, .22, .15), cy)
    obox('body', 'metal', V(0, .73, .145), (.14, .06, .17), cy)
    obox('body', 'dark', V(0, .765, .15), (.11, .02, .13), cy)
    if Q['detail']:
        for sx in (-1, 1):
            tube('body', 'accent', V(sx * .072, .74, .1), V(sx * .08, .74, .1), .009, .009, 6)          # red bolts
            polytube('body', 'dark', [V(sx * .03, .72, .21), V(sx * .08, .74, .26), V(sx * .105, .76, .24)], .011, 5)  # hoses
        obox('body', 'dark', V(0, .66, -.05), (.1, .08, .14))                                       # throttle body
    # skid plate (carbon)
    stn = [(.36, .30, .08), (.26, .225, .11), (.02, .195, .12), (-.12, .22, .11)]
    S = [np.array([[-w, yb + .1, z], [-w, yb + .025, z], [-w + .03, yb, z], [w - .03, yb, z], [w, yb + .025, z], [w, yb + .1, z]]) for z, yb, w in stn]
    T, g = loft(S); put('body', 'carbon', T, g, 30)
    if Q['detail']:
        for k, (yy, xx) in enumerate(((.25, -.04), (.25, .0), (.25, .04))):
            c = V(xx, yy, .312); flat('body', 'dark', [(-.012, -.012), (.012, -.012), (.012, .012), (-.012, .012)], c, V(1, 0, 0), unit(V(0, 1, .9)), unit(V(0, -.9, 1)))
    # frame: head tube, twin spars, down tube and cradle, subframe, pivot plates
    tube('body', 'dark', AXP(.58), AXP(.79), .032, .032, Q['sn'])
    for sx in (-1, 1):
        polytube('body', 'dark', [AXP(.70) + V(sx * .03, 0, -.03), V(sx * .10, .95, .27), V(sx * .118, .84, .02), V(sx * .122, .73, -.12), V(sx * .122, .5, -.18)], .022, 6, 35)
        polytube('body', 'dark', [V(0, .40, .345), V(sx * .06, .25, .27), V(sx * .065, .22, -.06), V(sx * .10, .40, -.18)], .017, 6, 35)
        polytube('body', 'dark', [V(sx * .118, .82, -.08), V(sx * .092, .93, -.60)], .013, 6)
        polytube('body', 'dark', [V(sx * .112, .58, -.20), V(sx * .09, .90, -.52)], .012, 6)
        obox('body', 'dark', V(sx * .122, .45, -.18), (.03, .16, .1))
    polytube('body', 'dark', [AXP(.62) + V(0, 0, -.02), V(0, .62, .40), V(0, .40, .345)], .024, 6, 35)
    tube('body', 'metal', V(-.15, .45, -.18), V(.15, .45, -.18), .014, .014, 8)          # swingarm pivot bolt

def build_swingarm_chain():
    piv = V(0, .45, -.18)
    for sx in (-1, 1):
        a, b = V(sx * .112, .45, -.18), V(sx * .108, .36, -.73); d = unit(b - a)
        side = V(1, 0, 0); up = unit(np.cross(d, side)) * (1 if np.cross(d, side)[1] > 0 else -1)
        def rect(c, w, h): return np.array([c - side * w / 2 - up * h / 2, c + side * w / 2 - up * h / 2, c + side * w / 2 + up * h / 2, c - side * w / 2 + up * h / 2])
        T, g = loft([rect(a, .046, .11), rect(a + d * .3, .044, .085), rect(b, .04, .062)]); put('body', 'paint', T, g, 25)
        obox('body', 'metal', V(sx * .108, .36, -.72), (.044, .05, .07))                    # axle block
        tube('body', 'accent', V(sx * .13, .36, -.755), V(sx * .13, .36, -.775), .008, .008, 6)  # adjuster
    obox('body', 'paint', V(0, .43, -.32), (.2, .05, .05))                                   # cross brace
    obox('body', 'trim', V(.105, .505, -.3), (.04, .012, .24), (V(1, 0, 0), unit(V(0, 1, -.16)), unit(V(0, .16, 1))))  # chain slider
    # countershaft sprocket and chain (left side)
    cs = V(.074, .40, -.10)
    tube('body', 'dark', cs, cs + V(.008, 0, 0), .042, .042, 10)
    for s in (1, -1):
        a, b = cs + V(.004, s * .044, 0), V(.078, RR + s * .127, R[2])
        d = unit(b - a); up = unit(np.cross(V(1, 0, 0), d))
        obox('body', 'dark', (a + b) / 2, (.011, .011, np.linalg.norm(b - a)), (V(1, 0, 0), up, d))
        if Q['detail']:
            L = np.linalg.norm(b - a); m = int(L / .03)
            for k in range(m):
                dot('body', 'metal', a + d * (k + .5) * L / m + V(.0058, 0, 0), d, up, .006, .0035, 1)   # link plates
    obox('body', 'trim', V(.078, .24, -.62), (.03, .05, .12))                                # chain guide
    obox('body', 'gold', V(-.075, .30, -.70), (.04, .055, .07))                              # rear caliper (right)
    # linkage shock with spring
    top, bot = V(0, .80, -.09), V(0, .32, -.31); d = unit(bot - top); L = np.linalg.norm(bot - top)
    tube('body', 'metal', top, top + d * L * .55, .024, .024, Q['tn'])
    tube('body', 'chrome', top + d * L * .5, bot, .01, .01, 6)
    tube('body', 'metal', top + V(0, 0, .03), top + V(0, -.12, .03) + d * .02, .02, .02, 6)   # piggyback reservoir
    u, w = perp(d); pts = []
    nt, hs = Q['turns'], Q['hseg']
    for k in range(nt * hs + 1):
        a = 2 * PI * k / hs; t = k / (nt * hs)
        pts.append(top + d * (L * (.18 + .62 * t)) + (u * math.cos(a) + w * math.sin(a)) * .036)
    polytube('body', 'accent', pts, .0065, 4 if Q['hi'] else 3, 70, caps=False)
    obox('body', 'dark', V(0, .28, -.29), (.05, .05, .1))                                    # rocker
    polytube('body', 'dark', [V(0, .28, -.26), V(0, .24, -.14)], .012, 6)                     # pull rod
    # footpegs, brake pedal (right), gear lever (left)
    for sx in (-1, 1):
        obox('body', 'metal', V(sx * .205, .37, -.13), (.11, .018, .05))
        obox('body', 'dark', V(sx * .14, .38, -.13), (.03, .05, .05))
        if Q['detail']:
            for k in range(4): obox('body', 'metal', V(sx * (.165 + .028 * k), .382, -.13), (.006, .01, .052))
    polytube('body', 'metal', [V(-.13, .38, -.08), V(-.16, .35, .06), V(-.17, .36, .12)], .008, 5)
    obox('body', 'metal', V(-.17, .365, .125), (.03, .012, .045))
    polytube('body', 'metal', [V(.13, .45, -.03), V(.155, .42, .09)], .007, 5)
    obox('body', 'metal', V(.165, .42, .1), (.04, .012, .018))

def build():
    build_wheels(); build_front(); build_shrouds(); build_tank_seat(); build_rear(); build_exhaust(); build_engine_frame()
    build_swingarm_chain()

# ------------------------------------------------------------------------------------------------- output
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'bikes', 'motocross.js'))
    a = ap.parse_args()
    yb, zb = AXP(.86)[1] + .008, AXP(.86)[2] - .012
    grip = [round(.36, 4), round(float(yb + .065), 4), round(float(zb - .06), 4)]
    write_js(a.out, 'APEX_MX', '/* Generated by tools/build_motocross.py (original procedural model): do not edit by hand.\n'
             '   Dune Raider 450 motocross bike, quantised meshes per part and material slot; see MxKit in index.html. */\n',
             K.anchors(grip), lambda name: make_lod(name, set_lod, build, K.to_part_space, PARTS, SLOTS))

if __name__ == '__main__':
    main()
