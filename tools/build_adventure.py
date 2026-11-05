#!/usr/bin/env python3
"""Procedural adventure tourer for the Amazon Trail bike (Trail Master 1250) -> assets/bikes/adventure.js.

ORIGINAL WORK: every vertex is drawn by this script (lofted sections, flat angular panels, tubes, lathes, bevelled boxes). No
third party model is read or copied. A grey sculpt of a Tiger-style adventure tourer supplied by the project owner was only
looked at for the bike's proportions and part layout (its rider figure was ignored); see assets/bikes/README.md.

Output: window.APEX_ADV = {anchors, tris, lod: {hi: [mesh], lo: [mesh]}}, same packing and parts as assets/bikes/motocross.js
(body, steer, fw, rw; decoded by MotoKit.decode in index.html). The luggage (top box, panniers, roll bag) is rigid body geometry.

Bike space: +y up, +z forward, +x the rider's LEFT, metres, wheelbase 1.6, ground at y = 0. Chain and side stand on the left,
exhaust and rear disc on the right.
Run:  python3 -I -B tools/build_adventure.py        (needs numpy; deterministic, no random numbers)
Shared primitives (lofts, tubes, panels, wheels, packing) are in tools/bikegeo.py.
"""
import argparse, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # tools/ (python -I leaves it off sys.path)
from bikegeo import *                                            # geometry kit: V, put, tube, loft, Q, STORE, raked, ...

# ------------------------------------------------------------------------------------------------- main dimensions
WB, RF, RR = 1.6, 0.36, 0.36               # must match BIKES.adv.cfg (wheelie pivot, tyre smoke, camera)
K = raked(WB, RF, RR, 25, 0.03, .80)       # rake 25 degrees, fork line .03 ahead of the steering axis, pivot on the top clamp
F, R, UAX, NF = K.F, K.R, K.UAX, K.NF
FL, AXP = K.FL, K.AXP
RIMF, RIMR = 0.27, 0.235                   # rim radii (21 / 18 inch, scaled like the wheels)
SLOTS = ['paint', 'accent', 'trim', 'carbon', 'dark', 'metal', 'chrome', 'luggage', 'tire', 'seat', 'glass', 'gauge', 'plate',
         'head', 'tail', 'indFL', 'indFR', 'indRL', 'indRR']
PARTS = ('body', 'steer', 'fw', 'rw')
BAR = AXP(.90) + V(0, .008, -.012)         # handlebar centre (on risers above the top clamp)
GRIP = BAR + V(.37, .05, -.06)             # left grip centre (the right one is mirrored)

def set_lod(name):
    hi = name == 'hi'
    Q.clear()
    Q.update(hi=hi, seg=24 if hi else 16, rseg=24 if hi else 16, knobs=22 if hi else 16, spokes=18 if hi else 8,
             tn=8 if hi else 6, sn=12 if hi else 8, detail=hi, turns=5 if hi else 3, hseg=8 if hi else 6, tf=6 if hi else 4, teeth=28 if hi else 0)

# ------------------------------------------------------------------------------------------------- wheels
def tyre(part, C, Rt, Rim, hw):
    """Dual purpose tyre: rounder carcass and lower, wider tread blocks than a motocross knobby (centre pair + shoulder rows)."""
    Rc = Rt - .010
    prof = [(-.72 * hw, Rim + .004), (-.95 * hw, Rim + .03), (-hw, Rc - .04), (-.8 * hw, Rc - .012), (0, Rc),
            (.8 * hw, Rc - .012), (hw, Rc - .04), (.95 * hw, Rim + .03), (.72 * hw, Rim + .004)]
    prof = [prof[i] for i in ((0, 2, 3, 4, 5, 6, 8) if Q['hi'] else (0, 2, 4, 6, 8))]
    lathe_x(part, 'tire', prof, C, Q['seg'], closed=False)
    n = Q['knobs']; p = 2 * PI / n
    for k in range(n):
        a = k * p
        if Q['hi']:
            knob(part, C, a, (.22 if k % 2 else -.22) * hw, Rc - .003, .012, .5 * hw, .034, 0)          # zig-zag centre blocks
            for s in (-1, 1):
                knob(part, C, a + p / 2, s * .78 * hw, Rc - .012, .011, .38 * hw, .03, s * .55)         # shoulder blocks
        else:
            s = 1 if k % 2 else -1
            knob(part, C, a, s * .42 * hw, Rc - .005, .012, .6 * hw, .04, s * .3)

def disc(part, C, x, ri, ro):
    """Round brake disc, drilled on hi, with a dark carrier; both faces."""
    n = Q['rseg']
    for f in (-1, 1): ring(part, 'metal', x + f * .002, ri, ro, C, n, f)
    if Q['hi']:
        for f in (-1, 1): ring(part, 'dark', x + f * .003, .05, ri, C, 12, f)
        rr = (ri + ro) / 2; m = 12
        for k in range(m):
            a = 2 * PI * k / m
            c = V(x, C[1] + rr * math.cos(a), C[2] + rr * math.sin(a))
            u = V(0, -math.sin(a), math.cos(a)); v = V(0, math.cos(a), math.sin(a))
            for f in (-1, 1): dot(part, 'dark', c + V(f * .0026, 0, 0), u, v, .005, .005, f)

def build_wheels():
    tyre('fw', F, RF, RIMF, .048); rim_spokes_hub('fw', F, RIMF, .055)
    for s in (-1, 1): disc('fw', F, s * .072, .1, .15)                         # twin front discs
    tyre('rw', R, RR, RIMR, .072); rim_spokes_hub('rw', R, RIMR, .065)
    disc('rw', R, -.078, .07, .12)                                             # rear disc on the right
    sprocket('rw', R + V(.082, 0, 0), .115, Q['teeth'])                        # rear sprocket on the left

# ------------------------------------------------------------------------------------------------- front end (steer part)
def build_front():
    fx = (V(1, 0, 0), UAX, NF)
    for sx in (-1, 1):
        x = V(sx * .105, 0, 0)
        tube('steer', 'dark', FL(.42) + x, FL(.86) + x, .031, .031, Q['sn'])            # black outer tube (inverted fork)
        tube('steer', 'metal', FL(.415) + x, FL(.44) + x, .034, .034, Q['sn'])           # seal collar
        tube('steer', 'chrome', FL(.06) + x, FL(.44) + x, .022, .022, Q['sn'])           # silver stanchion
        tube('steer', 'metal', FL(.86) + x, FL(.875) + x, .024, .024, Q['tn'])           # top cap
        obox('steer', 'dark', FL(.035) + x + V(sx * .004, 0, 0), (.052, .13, .07), fx)   # axle foot
        # radial caliper behind each leg on the twin discs
        cc = F + V(sx * .074, -.035, -.13)
        obox('steer', 'dark', cc, (.048, .085, .05), (V(1, 0, 0), unit(V(0, .97, .25)), unit(V(0, -.25, .97))))
        obox('steer', 'metal', cc + V(sx * .026, 0, 0), (.004, .05, .03))                 # caliper badge
    tube('steer', 'metal', F + V(-.14, 0, 0), F + V(.14, 0, 0), .014, .014, 6)          # axle ends
    # triple clamps, stem, risers
    obox('steer', 'dark', FL(.62) - NF * .02, (.29, .05, .1), fx)
    obox('steer', 'metal', FL(.79) - NF * .02, (.29, .035, .1), fx)
    for sx in (-1, 1): tube('steer', 'dark', AXP(.80) + V(sx * .04, 0, 0), BAR + V(sx * .04, -.012, .004), .017, .017, Q['tn'])
    # handlebar, grips, levers, switchgear, mirrors
    yb, zb = BAR[1], BAR[2]
    polytube('steer', 'dark', [V(-.43, yb + .055, zb - .07), V(-.26, yb + .035, zb - .03), V(-.14, yb, zb), V(.14, yb, zb),
                               V(.26, yb + .035, zb - .03), V(.43, yb + .055, zb - .07)], .012, Q['tn'], 30)
    obox('steer', 'dark', V(0, yb + .01, zb), (.12, .04, .05))                           # bar clamp
    for sx in (-1, 1):
        a, b = V(sx * .31, yb + .044, zb - .046), V(sx * .43, yb + .055, zb - .07)
        tube('steer', 'seat', a, b, .019, .019, Q['tn'])                                 # grip
        obox('steer', 'dark', V(sx * .27, yb + .04, zb - .035), (.05, .04, .05))           # switchgear
        polytube('steer', 'metal', [V(sx * .25, yb + .04, zb - .01), V(sx * .33, yb + .035, zb + .045), V(sx * .41, yb + .03, zb + .03)], .006, 5)
        obox('steer', 'dark', V(sx * .2, yb + .04, zb - .01), (.045, .04, .05))            # master cylinder / clutch
        # mirror on a stalk
        m0, m1 = V(sx * .22, yb + .03, zb), V(sx * .29, yb + .2, zb - .02)
        tube('steer', 'dark', m0, m1, .007, .007, 5)
        mo = m1 + V(sx * .03, .04, 0)
        extrude('steer', 'dark', [(-.06, -.03), (.06, -.035), (.065, .03), (-.05, .035)], mo, V(sx, 0, 0), V(0, 1, 0), V(0, 0, 1), .025, .85)
        flat('steer', 'gauge', [(-.052, -.024), (.052, -.028), (.056, .024), (-.044, .028)], mo - V(0, 0, .002), V(sx, 0, 0), V(0, 1, 0), V(0, 0, -1))
        # rally handguard: orange shell around the front of the grip on a black spar, indicator in its face
        o = V(sx * .30, yb + .03, zb - .02); u = unit(V(sx * .13, .015, -.035)); w = V(0, 1, 0)
        n = unit(np.cross(u, w)); n = n if n[2] > 0 else -n
        guard = [(0, -.025), (.05, -.04), (.13, -.03), (.165, .0), (.15, .045), (.06, .06), (0, .03)]
        extrude('steer', 'trim', guard, o + n * .055, u, w, n, .012, .9)
        tube('steer', 'dark', V(sx * .3, yb + .02, zb), o + n * .055 + u * .02, .008, .008, 5)
        tube('steer', 'dark', V(sx * .44, yb + .056, zb - .072), o + n * .055 + u * .15, .008, .008, 5)
        flat('steer', 'indFL' if sx > 0 else 'indFR', [(.09, .0), (.135, -.005), (.14, .02), (.095, .028)], o + n * .068, u, w, n)
    build_pod()
    build_fenders()

def build_pod():
    """Rally style front: faceted headlight pod with twin headlights, tall tinted screen, TFT, high beak."""
    st = [(.64, 1.20, .12, 1.10, .17, .96, .10), (.74, 1.18, .12, 1.08, .165, .96, .10), (.82, 1.13, .10, 1.05, .14, .97, .08),
          (.865, 1.09, .07, 1.04, .10, .99, .05)]
    S = [sec(z, sym([(0, yt), (wt, yt - .012), (ww, yw), (wb, yb), (0, yb - .01)])) for z, yt, wt, yw, ww, yb, wb in st]
    T, g = loft(S, tag=lambda i, j: 1 if j in (1, 6) else 0); put('steer', ['paint', 'trim'], T, g, 25)
    # twin headlights: dark bezels with angular lenses, angled slightly outwards
    for sx in (-1, 1):
        n = unit(V(sx * .3, .05, 1)); c = V(sx * .052, 1.04, .872)
        u = unit(np.cross(V(0, 1, 0), n)); w = np.cross(n, u)
        lens = [(-.035, -.022), (.03, -.026), (.042, .0), (.03, .026), (-.035, .022)]
        extrude('steer', 'dark', [(x * 1.25, y * 1.3) for x, y in lens], c - n * .012, u, w, n, .012, .95)
        flat('steer', 'head', lens, c + n * .0015, u, w, n)
    # tall screen (three facets) and its dark frame strip
    B = [(-.17, 1.17, .675), (-.06, 1.19, .685), (.06, 1.19, .685), (.17, 1.17, .675)]
    Tp = [(-.13, 1.46, .55), (-.05, 1.49, .545), (.05, 1.49, .545), (.13, 1.46, .55)]
    for k in range(3):
        quad = np.array([B[k], B[k + 1], Tp[k + 1], Tp[k]], float)
        nn = unit(np.cross(quad[1] - quad[0], quad[3] - quad[0]))
        T, g = loft([quad, quad + nn * .006]); put('steer', 'glass', T, g, 80)
    for sx in (-1, 1): tube('steer', 'dark', V(sx * .09, 1.10, .58), V(sx * .1, 1.3, .6), .008, .008, 5)   # screen stays
    # cockpit: TFT on a dark binnacle behind the screen
    nn = unit(V(0, .6, -.8))
    panel = [(-.085, -.05), (.085, -.05), (.075, .05), (-.075, .05)]
    extrude('steer', 'dark', panel, V(0, 1.16, .6) - nn * .03, V(1, 0, 0), np.cross(nn, V(1, 0, 0)), nn, .03, .9)
    flat('steer', 'gauge', [(-.07, -.038), (.07, -.038), (.062, .04), (-.062, .04)], V(0, 1.16, .6) + nn * .0015, V(1, 0, 0), np.cross(nn, V(1, 0, 0)), nn)

def build_fenders():
    # high beak under the headlight pod (paint, orange edge) and the low fender hugging the tyre (black)
    beak = [(.74, .985, .08, .03), (.86, .975, .09, .035), (.98, .945, .085, .035), (1.08, .90, .065, .03), (1.15, .86, .035, .02),
            (1.19, .835, .01, .008)]
    if not Q['hi']: beak = beak[::2] + [beak[-1]]
    u_shell(beak, 'steer', ['paint', 'trim'], lambda i, j: 1 if j in (0, 5) else 0)
    low = [(.60, .745, .055, .02), (.70, .78, .075, .035), (.82, .79, .08, .04), (.94, .77, .075, .035), (1.04, .735, .065, .025),
           (1.11, .69, .04, .015)]
    if not Q['hi']: low = low[::2] + [low[-1]]
    u_shell(low, 'steer', ['dark'], None)

# ------------------------------------------------------------------------------------------------- bodywork
SCOOP = lambda z, y: .17 + .12 * z + .06 * (1.1 - y)       # sand side panel beside the tank (outer plane)

def build_tank_panels():
    st = [(.44, 1.13, .10, 1.02, .13, .88, .08), (.36, 1.20, .14, 1.06, .19, .84, .13), (.22, 1.20, .16, 1.05, .21, .82, .15),
          (.08, 1.15, .14, 1.0, .19, .82, .13), (-.02, 1.08, .11, .98, .14, .84, .10)]
    S = [sec(z, sym([(0, yt), (wt, yt - .015), (ww, yw), (wb, yb), (0, yb)])) for z, yt, wt, yw, ww, yb, wb in st]
    T, g = loft(S); put('body', 'paint', T, g, 28)
    tube('body', 'dark', V(0, 1.20, .30), V(0, 1.21, .30), .045, .045, Q['sn'])                # fuel cap
    tube('body', 'metal', V(0, 1.21, .30), V(0, 1.215, .30), .03, .03, Q['sn'])
    scoop = [(.62, 1.10), (.665, .98), (.56, .80), (.40, .66), (.26, .70), (.20, .86), (.22, 1.04), (.40, 1.14)]
    for sx in (-1, 1):
        slab('body', 'paint', scoop, SCOOP, sx, .007)
        graphic('body', 'accent', [(.60, 1.09), (.64, .98), (.56, .83), (.34, .83), (.26, .93), (.24, 1.03), (.40, 1.125)], SCOOP, sx)   # sand panel
        graphic('body', 'dark', [(.55, 1.02), (.58, .95), (.52, .86), (.42, .86), (.38, .92), (.42, 1.0)], SCOOP, sx, .0032)   # scoop vent
        if Q['detail']:
            for k in range(3):
                z0 = .40 + .045 * k
                graphic('body', 'paint', [(z0 + .06, 1.0), (z0 + .07, 1.0), (z0 + .015, .87), (z0 + .005, .87)], SCOOP, sx, .0046)
        graphic('body', 'trim', [(.62, 1.085), (.655, .98), (.555, .805), (.545, .815), (.64, .98), (.605, 1.08)], SCOOP, sx)   # pinstripe
        graphic('body', 'trim', [(.34, .815), (.56, .815), (.555, .80), (.33, .80)], SCOOP, sx)                               # pinstripe under the sand panel
        obox('body', 'dark', V(sx * .12, .78, .42), (.1, .3, .04))                                   # radiator behind it
        if Q['detail']:
            for k in range(3): obox('body', 'metal', V(sx * .12, .68 + .08 * k, .442), (.096, .008, .006))

def build_seat_tail():
    rider = [(.04, 1.10, .10, .09), (-.06, 1.0, .15, .1), (-.24, .975, .17, .1), (-.40, .985, .16, .09), (-.46, 1.02, .13, .07)]
    pill = [(-.44, 1.06, .14, .08), (-.62, 1.07, .145, .08), (-.80, 1.07, .13, .07), (-.86, 1.06, .11, .05)]
    for st in (rider, pill):
        S = [sec(z, sym([(0, yt), (w * .78, yt - .003), (w, yt - .025), (w * .95, yt - th), (0, yt - th)])) for z, yt, w, th in st]
        T, g = loft(S); put('body', 'seat', T, g, 40)
    if Q['detail']:
        for k in range(6): obox('body', 'dark', V(0, .978 + (.012 if k in (0, 5) else 0), -.08 - .06 * k), (.2, .004, .01))  # seat stitching ribs
    # tail section under the pillion seat, orange pinstripe on the flanks
    st = [(-.40, .95, .13, .88, .15, .80, .10), (-.62, .99, .13, .92, .14, .82, .09), (-.86, 1.0, .11, .94, .12, .86, .07),
          (-.99, .99, .07, .95, .08, .89, .045)]
    S = [sec(z, sym([(0, yt), (wt, yt - .01), (ww, yw), (wb, yb), (0, yb)])) for z, yt, wt, yw, ww, yb, wb in st]
    T, g = loft(S, tag=lambda i, j: 1 if j in (2, 5) else 0); put('body', ['paint', 'trim'], T, g, 28)
    # tail light and rear indicators, plate on a hugger bracket
    flat('body', 'tail', [(-.05, -.018), (.05, -.018), (.04, .018), (-.04, .018)], V(0, .935, -.992), V(-1, 0, 0), V(0, 1, 0), V(0, 0, -1))
    for sx in (1, -1):
        tube('body', 'dark', V(sx * .05, .86, -.96), V(sx * .13, .86, -.96), .006, .006, 5)
        obox('body', 'indRL' if sx > 0 else 'indRR', V(sx * .14, .86, -.96), (.024, .02, .035))
    polytube('body', 'dark', [V(0, .87, -.95), V(0, .74, -1.02)], .012, 6)
    extrude('body', 'plate', [(-.1, -.07), (.1, -.07), (.1, .07), (-.1, .07)], V(0, .68, -1.03), V(1, 0, 0), V(0, 1, 0), V(0, 0, -1), .004, 1.0)

def case(slot, poly, x0, x1, sc=.94):
    """Box with a chamfered (z, y) outline between x0 and x1; the outer face (x1) is bevelled by sc."""
    sx = 1 if x1 > x0 else -1
    extrude('body', slot, poly, V(x0, 0, 0), V(0, 0, 1), V(0, 1, 0), V(sx, 0, 0), abs(x1 - x0), sc, None, 30)

def build_luggage():
    # rack on the tail, top box on its base plate
    for sx in (-1, 1): polytube('body', 'dark', [V(sx * .12, 1.0, -.62), V(sx * .13, 1.05, -.74), V(sx * .13, 1.05, -1.08)], .011, Q['tf'])
    for z in (-.78, -1.06): tube('body', 'dark', V(-.13, 1.05, z), V(.13, 1.05, z), .011, .011, Q['tf'])
    obox('body', 'dark', V(0, 1.065, -.94), (.26, .02, .34))
    box = [(-.78, 1.08), (-.76, 1.24), (-.80, 1.30), (-1.18, 1.30), (-1.22, 1.24), (-1.22, 1.10), (-1.19, 1.075)]
    for sx in (-1, 1): case('luggage', box, 0, sx * .2, .93)
    lid = [(-.79, 1.29), (-.81, 1.36), (-1.17, 1.36), (-1.21, 1.29)]
    for sx in (-1, 1): case('metal', lid, 0, sx * .205, .9)
    obox('body', 'trim', V(0, 1.2, -1.223), (.26, .03, .004))                                 # rear reflector strip
    for sx in (-1, 1): obox('body', 'dark', V(sx * .14, 1.29, -1.222), (.04, .03, .008))       # latches
    # roll bag on the pillion seat, two straps
    tube('body', 'accent', V(-.2, 1.14, -.66), V(.2, 1.14, -.66), .075, .075, Q['sn'])
    for sx in (-1, 1):
        tube('body', 'dark', V(sx * .205, 1.14, -.66), V(sx * .2, 1.14, -.66), .06, .06, Q['tn'])
        tube('body', 'trim', V(sx * .12, 1.14, -.66), V(sx * .145, 1.14, -.66), .079, .079, Q['tn'])
    # side cases: dark boxes with a lighter lid, black straps, orange reflector, on tubular frames; the right one sits wider
    # to clear the exhaust
    side = [(-.44, .60), (-.42, .90), (-.46, .95), (-.95, .95), (-.99, .90), (-.99, .58), (-.95, .53), (-.48, .53)]
    lidp = [(-.425, .89), (-.445, .965), (-.965, .965), (-.985, .89)]
    for sx in (1, -1):
        xi = .22 if sx > 0 else .27; xo = xi + .19
        case('luggage', side, sx * xi, sx * xo, .95)
        case('metal', lidp, sx * (xi - .004), sx * (xo + .004), .93)
        for z in (-.56, -.86):
            flat('body', 'seat', [(z - .02, .54), (z + .02, .54), (z + .02, .965), (z - .02, .965)], V(sx * (xo + .0016), 0, 0), V(0, 0, 1), V(0, 1, 0), V(sx, 0, 0))
        flat('body', 'trim', [(-.93, .62), (-.85, .62), (-.85, .66), (-.93, .66)], V(sx * (xo + .002), 0, 0), V(0, 0, 1), V(0, 1, 0), V(sx, 0, 0))
        xf = sx * (xi - .012)
        polytube('body', 'dark', [V(sx * .13, .62, -.32), V(xf, .58, -.42), V(xf, .56, -.98), V(xf, .9, -.98), V(xf, .92, -.6), V(sx * .12, .95, -.55)], .01, Q['tf'])

def build_engine_frame():
    # three cylinder engine: case profile (both halves), cylinder head and cam cover, side covers
    prof = [(.46, .60), (.42, .70), (.30, .74), (.16, .70), (.10, .58), (-.04, .55), (-.18, .52), (-.20, .36), (-.12, .25), (.10, .22),
            (.30, .26), (.44, .38)]
    for sx in (-1, 1): extrude('body', 'luggage', prof, V(0, 0, 0), V(0, 0, 1), V(0, 1, 0), V(sx, 0, 0), .16, .92)   # matt grey cases
    cy = (V(1, 0, 0), unit(V(0, 1, .35)), unit(V(0, -.35, 1)))
    obox('body', 'metal', V(0, .755, .29), (.29, .05, .17), cy)                                  # cam cover
    if Q['detail']:
        for k in range(3): obox('body', 'dark', V(-.09 + .09 * k, .785, .29), (.05, .012, .06), cy)  # coil packs
    tube('body', 'metal', V(.16, .40, .10), V(.185, .40, .10), .085, .08, Q['sn'])               # alternator cover (left)
    tube('body', 'metal', V(-.16, .40, .0), V(-.19, .40, .0), .095, .09, Q['sn'])               # clutch cover (right)
    # three headers into a collector under the engine, link pipe and high silencer on the right
    for k, x in enumerate((-.07, 0, .07)):
        polytube('body', 'chrome', [V(x, .62, .43), V(x, .48, .5), V(x * .6, .30, .45), V(-.03, .21, .26), V(-.05, .2, .1)], .019, 6, 40)
    polytube('body', 'chrome', [V(-.05, .2, .1), V(-.12, .27, -.06), V(-.16, .38, -.17), V(-.17, .45, -.22)], .03, Q['tn'], 40)
    a, b = V(-.17, .44, -.20), V(-.19, .60, -.66); d = unit(b - a)
    tube('body', 'metal', a, b, .06, .052, Q['sn'], crease=50)                                   # silencer
    tube('body', 'dark', b, b + d * .04, .052, .03, Q['sn'], crease=50)                          # end cap
    tube('body', 'chrome', b + d * .035, b + d * .05, .022, .022, Q['tn'])                       # outlet
    obox('body', 'dark', V(-.16, .62, -.52), (.03, .1, .03))                                     # hanger
    # bash plate
    stn = [(.50, .30, .12), (.42, .20, .16), (.10, .17, .17), (-.14, .21, .15)]
    S = [np.array([[-w, yb + .09, z], [-w, yb + .02, z], [-w + .035, yb, z], [w - .035, yb, z], [w, yb + .02, z], [w, yb + .09, z]]) for z, yb, w in stn]
    T, g = loft(S); put('body', 'carbon', T, g, 30)
    # steel trellis frame, swingarm pivot plates
    tube('body', 'dark', AXP(.60), AXP(.79), .036, .036, Q['sn'])
    for sx in (-1, 1):
        polytube('body', 'dark', [AXP(.74) + V(sx * .03, 0, -.03), V(sx * .12, .98, .24), V(sx * .13, .86, -.02), V(sx * .13, .66, -.14), V(sx * .13, .5, -.16)], .019, Q['tf'], 35)
        polytube('body', 'dark', [AXP(.64) + V(sx * .03, 0, -.02), V(sx * .1, .62, .36), V(sx * .12, .66, .12)], .016, Q['tf'], 35)
        polytube('body', 'dark', [V(sx * .13, .86, -.02), V(sx * .11, .95, -.5), V(sx * .1, .97, -.86)], .013, Q['tf'])
        polytube('body', 'dark', [V(sx * .13, .6, -.18), V(sx * .1, .9, -.6)], .012, Q['tf'])
        obox('body', 'dark', V(sx * .135, .47, -.16), (.03, .17, .11))
    tube('body', 'metal', V(-.16, .47, -.16), V(.16, .47, -.16), .015, .015, 8)                 # swingarm pivot bolt
    # crash bars: upper loop round the radiator and tank, lower loop round the engine, cross bar in front
    for sx in (-1, 1):
        polytube('body', 'dark', [V(sx * .1, .98, .44), V(sx * .27, .92, .47), V(sx * .31, .74, .43), V(sx * .28, .56, .30), V(sx * .16, .52, .14)], .014, Q['tf'], 35)
        polytube('body', 'dark', [V(sx * .1, .62, .40), V(sx * .22, .38, .42), V(sx * .27, .33, .30), V(sx * .27, .36, .06), V(sx * .16, .44, -.08)], .014, Q['tf'], 35)
        tube('body', 'dark', V(sx * .31, .74, .43), V(sx * .25, .36, .38), .012, .012, Q['tf'])
    tube('body', 'dark', V(-.27, .92, .47), V(.27, .92, .47), .013, .013, Q['tf'])

def build_swingarm_chain_stand():
    for sx in (-1, 1):
        a, b = V(sx * .125, .47, -.16), V(sx * .12, .36, -.79); d = unit(b - a)
        side = V(1, 0, 0); up = unit(np.cross(d, side)) * (1 if np.cross(d, side)[1] > 0 else -1)
        def rect(c, w, h): return np.array([c - side * w / 2 - up * h / 2, c + side * w / 2 - up * h / 2, c + side * w / 2 + up * h / 2, c - side * w / 2 + up * h / 2])
        T, g = loft([rect(a, .05, .12), rect(a + d * .3, .048, .095), rect(b, .042, .065)]); put('body', 'metal', T, g, 25)
        obox('body', 'dark', V(sx * .12, .36, -.78), (.046, .05, .07))                            # axle block
    obox('body', 'metal', V(0, .44, -.34), (.22, .05, .05))                                      # cross brace
    # rear hugger over the tyre, chain guard
    u_shell([(-.48, .76, .085, .03), (-.6, .78, .09, .035), (-.72, .78, .085, .03)], 'body', ['dark'], None)
    cs = V(.085, .42, -.10)
    tube('body', 'dark', cs, cs + V(.008, 0, 0), .045, .045, 10)
    for s in (1, -1):
        a, b = cs + V(.004, s * .047, 0), V(.086, RR + s * .117, R[2])
        d = unit(b - a); up = unit(np.cross(V(1, 0, 0), d))
        obox('body', 'dark', (a + b) / 2, (.012, .012, np.linalg.norm(b - a)), (V(1, 0, 0), up, d))
        if Q['detail']:
            L = np.linalg.norm(b - a); m = int(L / .032)
            for k in range(m): dot('body', 'metal', a + d * (k + .5) * L / m + V(.0062, 0, 0), d, up, .006, .0035, 1)
    obox('body', 'dark', V(.12, .52, -.4), (.012, .04, .3), (V(1, 0, 0), unit(V(0, 1, -.17)), unit(V(0, .17, 1))))   # chain guard
    obox('body', 'dark', V(-.085, .30, -.74), (.04, .06, .08))                                   # rear caliper (right)
    # linkage shock with an orange spring
    top, bot = V(0, .84, -.10), V(0, .33, -.32); d = unit(bot - top); L = np.linalg.norm(bot - top)
    tube('body', 'dark', top, top + d * L * .55, .026, .026, Q['tn'])
    tube('body', 'chrome', top + d * L * .5, bot, .011, .011, Q['tf'])
    u, w = perp(d); pts = []
    nt, hs = Q['turns'], Q['hseg']
    for k in range(nt * hs + 1):
        a = 2 * PI * k / hs; t = k / (nt * hs)
        pts.append(top + d * (L * (.18 + .62 * t)) + (u * math.cos(a) + w * math.sin(a)) * .04)
    polytube('body', 'trim', pts, .007, 4 if Q['hi'] else 3, 70, caps=False)
    obox('body', 'dark', V(0, .29, -.3), (.06, .05, .1))
    # footpegs (wide, with rubber inserts on hi), brake pedal (right), gear lever (left), side stand folded on the left
    for sx in (-1, 1):
        obox('body', 'metal', V(sx * .215, .37, -.02), (.12, .02, .06))
        obox('body', 'dark', V(sx * .145, .39, -.03), (.03, .06, .06))
        if Q['detail']:
            for k in range(4): obox('body', 'dark', V(sx * (.17 + .03 * k), .382, -.02), (.007, .01, .062))
    polytube('body', 'metal', [V(-.14, .39, .02), V(-.17, .36, .15), V(-.18, .37, .2)], .009, 5)
    obox('body', 'metal', V(-.18, .375, .205), (.035, .014, .05))
    polytube('body', 'metal', [V(.14, .46, .05), V(.17, .43, .18)], .008, 5)
    obox('body', 'metal', V(.18, .43, .19), (.045, .014, .02))
    polytube('body', 'dark', [V(.15, .36, -.12), V(.18, .24, -.42)], .014, Q['tf'])
    obox('body', 'dark', V(.18, .235, -.44), (.04, .014, .06))

def build():
    build_wheels(); build_front(); build_tank_panels(); build_seat_tail(); build_luggage(); build_engine_frame()
    build_swingarm_chain_stand()

# ------------------------------------------------------------------------------------------------- output
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'bikes', 'adventure.js'))
    a = ap.parse_args()
    grip = [round(float(x), 4) for x in GRIP]
    write_js(a.out, 'APEX_ADV', '/* Generated by tools/build_adventure.py (original procedural model): do not edit by hand.\n'
             '   Trail Master 1250 adventure tourer, quantised meshes per part and material slot; see AdvKit in index.html. */\n',
             K.anchors(grip), lambda name: make_lod(name, set_lod, build, K.to_part_space, PARTS, SLOTS))

if __name__ == '__main__':
    main()
