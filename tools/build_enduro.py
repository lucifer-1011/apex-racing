#!/usr/bin/env python3
"""Procedural 450 four-stroke enduro for the Canyon Motocross bike (Dune Raider 450) -> assets/bikes/enduro.js.

ORIGINAL WORK: every vertex is drawn by this script (lofted sections, flat angular panels, tubes, lathes). No third party
model is read or copied. Four reference renders of an orange enduro bike supplied by the project owner (front three-quarter,
side, rear, front) were only looked at for proportions, part layout and livery colours. No logo, lettering or badge is drawn:
the graphics are plain colour blocks and stripes. See assets/bikes/README.md.

Output: window.APEX_ENDURO = {anchors, tris, lod: {hi: [mesh], lo: [mesh]}}, same packing and parts as assets/bikes/motocross.js
(body, steer, fw, rw; decoded by MotoKit.decode in index.html).

Bike space: +y up, +z forward, +x the rider's LEFT, metres, wheelbase 1.48, ground at y = 0. Chain, front disc and (folded) side
stand on the left; exhaust, clutch cover and rear disc on the right, as on the reference bike.
Run:  python3 -I -B tools/build_enduro.py        (needs numpy; deterministic, no random numbers)
Shared primitives (lofts, tubes, panels, wheels, packing) are in tools/bikegeo.py.
"""
import argparse, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # tools/ (python -I leaves it off sys.path)
from bikegeo import *                                            # geometry kit: V, put, tube, loft, Q, STORE, raked, ...

# ------------------------------------------------------------------------------------------------- main dimensions
WB, RF, RR = 1.48, 0.40, 0.36              # must match BIKES.off.cfg (wheelie pivot, tyre smoke, camera)
K = raked(WB, RF, RR, 26.5, 0.03, .80)     # rake 26.5 degrees, fork line .03 ahead of the steering axis, pivot on the top clamp
F, R, UAX, NF = K.F, K.R, K.UAX, K.NF
FL, AXP = K.FL, K.AXP
RIMF, RIMR = 0.29, 0.245                   # rim radii (21 / 18 inch enduro wheels, scaled like the tyres)
SLOTS = ['paint', 'accent', 'trim', 'dark', 'metal', 'chrome', 'gold', 'luggage', 'tire', 'seat', 'head', 'tail',
         'indFL', 'indFR', 'indRL', 'indRR']
PARTS = ('body', 'steer', 'fw', 'rw')
EXH = -1                                   # exhaust side (-x = right)
BAR = AXP(.85) + V(0, .008, -.012)         # handlebar centre (on risers above the top clamp)
GRIP = BAR + V(.36, .062, -.06)            # left grip centre (the right one is mirrored)
# slots: paint = orange plastics, frame and hand guards (col1, the multiplayer colour); accent = white graphics, fork guards and
# swingarm (col2); trim = navy graphics (col3); luggage = grey engine cases; metal = silver alloy, tank, spokes; seat = black seat
# and grips; head / tail / ind* = lamps and indicators lit by setLights.

def set_lod(name):
    hi = name == 'hi'
    Q.clear()
    Q.update(hi=hi, seg=28 if hi else 16, rseg=28 if hi else 16, knobs=26 if hi else 18, spokes=18 if hi else 8,
             tn=8 if hi else 6, sn=12 if hi else 8, detail=hi, turns=6 if hi else 3, hseg=10 if hi else 6, teeth=40 if hi else 0,
             hg=5 if hi else 3, tf=6 if hi else 4)

# ------------------------------------------------------------------------------------------------- wheels
def tyre(part, C, Rt, Rim, hw):
    """Enduro knobby: carcass (lathe) plus tall, square, widely spaced knob blocks (zig-zag centre pair and shoulder rows)."""
    Rc = Rt - .02
    prof = [(-.70 * hw, Rim + .004), (-.93 * hw, Rim + .032), (-hw, Rc - .05), (-.80 * hw, Rc - .012), (0, Rc),
            (.80 * hw, Rc - .012), (hw, Rc - .05), (.93 * hw, Rim + .032), (.70 * hw, Rim + .004)]
    prof = [prof[i] for i in ((0, 1, 2, 3, 4, 5, 6, 7, 8) if Q['hi'] else (0, 2, 4, 6, 8))]
    lathe_x(part, 'tire', prof, C, Q['seg'], closed=False)
    n = Q['knobs']; p = 2 * PI / n
    for k in range(n):
        a = k * p
        if Q['hi']:
            knob(part, C, a, (.3 if k % 2 else -.3) * hw, Rc - .004, .022, .5 * hw, .03, 0)          # zig-zag centre blocks
            for s in (-1, 1):                                                                    # shoulder blocks, staggered
                knob(part, C, a + p / 2, s * .84 * hw, Rc - .02, .02, .42 * hw, .028, s * .6)
        else:
            s = 1 if k % 2 else -1
            knob(part, C, a, s * .42 * hw, Rc - .006, .022, .62 * hw, .036, s * .3)

def wave_disc(part, C, x, ri, ro):
    """Wave brake disc (drilled on hi) with its carrier; both faces."""
    n = 36 if Q['hi'] else Q['rseg']
    wave = lambda ph: ro + (.005 * math.cos(12 * ph) if Q['hi'] else 0)
    for f in (-1, 1): ring(part, 'metal', x + f * .002, ri, wave, C, n, f)
    for f in (-1, 1): ring(part, 'dark', x + f * .003, .045, ri, C, Q['rseg'], f)
    if Q['hi']:
        rr = (ri + ro) / 2; m = 18
        for k in range(m):
            a = 2 * PI * k / m
            c = V(x, C[1] + rr * math.cos(a), C[2] + rr * math.sin(a))
            u = V(0, -math.sin(a), math.cos(a)); v = V(0, math.cos(a), math.sin(a))
            for f in (-1, 1): dot(part, 'dark', c + V(f * .0026, 0, 0), u, v, .0045, .0045, f)

def nipples(part, C, Rim):
    """Bright spoke nipples round the rim (the dotted ring seen on the reference wheels)."""
    if not Q['hi']: return
    m = Q['spokes']
    for s in (-1, 1):
        for k in range(m):
            a0 = 2 * PI * k / m + (0 if s > 0 else PI / m); a1 = a0 + (.5 if k % 2 else -.5)
            c = C + V(s * .012, (Rim - .02) * math.cos(a1), (Rim - .02) * math.sin(a1))
            dot(part, 'metal', c, V(0, -math.sin(a1), math.cos(a1)), V(0, math.cos(a1), math.sin(a1)), .004, .006, s)

def build_wheels():
    tyre('fw', F, RF, RIMF, .045); rim_spokes_hub('fw', F, RIMF, .052); nipples('fw', F, RIMF)
    wave_disc('fw', F, .062, .085, .14)                                        # front disc on the left
    tyre('rw', R, RR, RIMR, .062); rim_spokes_hub('rw', R, RIMR, .06); nipples('rw', R, RIMR)
    wave_disc('rw', R, -.07, .07, .11)                                         # rear disc on the right
    sprocket('rw', R + V(.074, 0, 0), .122, Q['teeth'])                        # rear sprocket on the left

# ------------------------------------------------------------------------------------------------- front end (steer part)
def build_front():
    fx = (V(1, 0, 0), UAX, NF)
    for sx in (-1, 1):
        x = V(sx * .088, 0, 0)
        tube('steer', 'chrome', FL(.42) + x, FL(.90) + x, .03, .03, Q['sn'])             # silver outer tube (upside-down fork)
        tube('steer', 'dark', FL(.415) + x, FL(.445) + x, .033, .033, Q['sn'])           # dust seal collar
        tube('steer', 'gold', FL(.06) + x, FL(.43) + x, .021, .021, Q['sn'])             # gold inner tube
        tube('steer', 'metal', FL(.90) + x, FL(.915) + x, .024, .024, Q['tn'])           # top cap
        obox('steer', 'metal', FL(.035) + x + V(sx * .004, 0, 0), (.05, .12, .066), fx)  # axle foot
        tube('steer', 'metal', F + V(sx * .112, 0, 0), F + V(sx * .125, 0, 0), .015, .015, 6)   # axle pinch / nut
        # big white fork guard wrapped round the front and outside of the lower leg, with a thin navy line
        S = []
        for s in (.07, .24, .40):
            c = FL(s) + x; rr = .041 if s < .2 else .037
            loop = []
            for t in np.linspace(-1.7, 1.75, 6):          # angle from straight ahead, positive towards the outside
                d = math.cos(t) * NF + math.sin(t) * V(sx, 0, 0); loop.append(c + d * rr)
            for t in np.linspace(1.75, -1.7, 6):
                d = math.cos(t) * NF + math.sin(t) * V(sx, 0, 0); loop.append(c + d * (rr - .005))
            S.append(np.array(loop))
        T, g = loft(S); put('steer', 'accent', T, g, 30)
        o = FL(.25) + x + V(sx * .039, 0, 0) - NF * .006
        flat('steer', 'trim', [(-.004, -.12), (.004, -.12), (.004, .12), (-.004, .12)], o, NF, UAX, V(sx, 0, 0))
    # front brake caliper behind the left leg, brake line
    cc = F + V(.064, -.03, -.118)
    obox('steer', 'metal', cc, (.044, .072, .05), (V(1, 0, 0), unit(V(0, .97, .25)), unit(V(0, -.25, .97))))
    obox('steer', 'dark', cc + V(.024, 0, 0), (.004, .04, .028), (V(1, 0, 0), unit(V(0, .97, .25)), unit(V(0, -.25, .97))))
    # triple clamps (silver) and steering stem
    obox('steer', 'metal', FL(.62) - NF * .02, (.25, .045, .1), fx)
    obox('steer', 'metal', FL(.80) - NF * .02, (.25, .035, .1), fx)
    tube('steer', 'dark', AXP(.81), AXP(.83), .02, .02, Q['tn'])
    # tapered bar on risers, bar clamp, grips, levers, master cylinders, throttle housing
    yb, zb = BAR[1], BAR[2]
    for sx in (-1, 1): tube('steer', 'dark', AXP(.81) + V(sx * .035, 0, 0), BAR + V(sx * .035, -.01, .004), .016, .016, Q['tn'])
    tube('steer', 'dark', V(-.15, yb, zb), V(.15, yb, zb), .0145, .0145, Q['tn'])
    for sx in (-1, 1):
        polytube('steer', 'dark', [V(sx * .14, yb, zb), V(sx * .25, yb + .04, zb - .032), V(sx * .42, yb + .066, zb - .066)], .0115, Q['tn'], 30)
    obox('steer', 'dark', V(0, yb + .012, zb), (.11, .04, .05))                           # bar clamp
    for sx in (-1, 1):
        a, b = V(sx * .30, yb + .056, zb - .05), V(sx * .415, yb + .068, zb - .066)
        tube('steer', 'seat', a, b, .0175, .0175, Q['tn'])                                # grip
        tube('steer', 'dark', b, b + (b - a) * .08, .019, .019, Q['tn'])                  # bar end
        obox('steer', 'dark', V(sx * .245, yb + .048, zb - .033), (.03, .03, .04))         # lever perch
        polytube('steer', 'metal', [V(sx * .25, yb + .048, zb - .008), V(sx * .33, yb + .044, zb + .045), V(sx * .40, yb + .04, zb + .03)], .006, 5)
        obox('steer', 'dark', V(sx * .19, yb + .044, zb - .015), (.04, .035, .045))        # master cylinder / clutch
        obox('steer', 'dark', V(sx * .19, yb + .068, zb - .015), (.03, .012, .034))        # reservoir cap
        if sx < 0: obox('steer', 'dark', V(sx * .285, yb + .057, zb - .048), (.03, .04, .045))   # throttle housing
        else: obox('steer', 'dark', V(sx * .285, yb + .055, zb - .046), (.025, .03, .035))      # switch
        build_handguard(sx, a, b)
    if Q['detail']:                                                         # clutch and brake lines, throttle cables
        polytube('steer', 'dark', [V(.19, yb + .04, zb + .01), V(.12, yb - .06, zb + .1), V(.06, yb - .16, zb + .1), V(.02, yb - .3, zb + .05)], .0045, 4)
        polytube('steer', 'dark', [V(-.19, yb + .04, zb + .01), V(-.08, yb - .05, zb + .12), V(.05, .98, .50), V(.10, .66, .575),
                                   F + V(.07, .03, -.09)], .0045, 4)
        polytube('steer', 'dark', [V(-.27, yb + .05, zb - .03), V(-.18, yb - .03, zb + .02), V(-.08, yb - .18, zb - .02), V(-.03, yb - .32, zb - .06)], .004, 4)
    build_mask()
    build_fender_front()

def build_handguard(sx, a, b):
    """Orange hand guard: a deep C-shaped shell wrapped round the front of the grip and lever, growing taller and
    bulging forward towards the bar end (as on the reference), on a black spar."""
    d = unit(b - a); fw, up = V(0, 0, 1), V(0, 1, 0)
    S = []
    for k in range(Q['hg']):
        t = k / (Q['hg'] - 1); c = a + d * ((-.07 + .23 * t) / abs(d[0])) + fw * (.012 * t)   # inboard of the lever to past the bar end
        r = .036 + .036 * t * (1.6 - .6 * t); loop = []
        ang = np.linspace(-.6, 1.45, 7 if Q['hi'] else 4)
        for q in ang: loop.append(c + (math.cos(q) * fw + math.sin(q) * up) * r)
        for q in ang[::-1]: loop.append(c + (math.cos(q) * fw + math.sin(q) * up) * (r - .005))
        S.append(np.array(loop))
    T, g = loft(S); put('steer', 'paint', T, g, 35)
    # black mounting spar along the bottom front edge, bolted to the bar inboard and to the bar end
    p0 = a + d * (-.10 / abs(d[0])) + V(0, -.012, .02); p1 = b + d * (.03 / abs(d[0])) + V(0, -.03, .075)
    tube('steer', 'dark', p0, p1, .007, .007, 5)
    tube('steer', 'dark', b + d * (.02 / abs(d[0])), p1, .007, .007, 5)

def build_mask():
    """Orange headlight mask with a rectangular headlamp, carried on the fork in front of the clamps."""
    o = FL(.78) + NF * .095; u, v, n = V(1, 0, 0), UAX, NF
    poly = [(-.085, .135), (.085, .135), (.102, .07), (.112, -.03), (.08, -.105), (.035, -.13), (-.035, -.13), (-.08, -.105),
            (-.112, -.03), (-.102, .07)]
    # the shield is folded into a shallow V about its vertical centre line (two halves swept back 11 degrees)
    ca, sa = math.cos(.19), math.sin(.19)
    for sx in (-1, 1):
        half = [q for q in poly if q[0] * sx > 0]
        half = [(0.0, .135)] + (half if sx > 0 else half[::-1]) + [(0.0, -.13)]
        uh, nh = ca * u - sx * sa * n, ca * n + sx * sa * u
        extrude('steer', 'paint', half, o - n * .03, uh, v, nh, .03, .93)
    # side wings folding back round the fork legs
    for sx in (-1, 1):
        w = [(.02, .12), (.0, .07), (-.01, -.03), (.03, -.10), (.075, -.06), (.085, .06)]
        extrude('steer', 'paint', [(q[0], q[1]) for q in w], o + u * sx * .108 - n * .03, -n, v, V(sx, 0, 0) * 1.0, .006, 1.0)
    # headlamp: dark housing, rectangular lens (lit by setLights through M.head), reflector frame
    fo = o + n * .0015
    extrude('steer', 'dark', [(-.064, -.092), (.064, -.092), (.067, .045), (-.067, .045)], fo, u, v, n, .006, .95)
    flat('steer', 'head', [(-.054, -.082), (.054, -.082), (.057, .035), (-.057, .035)], fo + n * .0065, u, v, n)
    if Q['detail']:
        for sx in (-1, 1):                                                  # rubber mounting straps
            obox('steer', 'dark', o + u * sx * .07 + v * .14, (.016, .03, .012), (u, v, n))
    # small amber indicators on short black stalks at the lower corners of the mask (+x = left; lit by setLights)
    for sx in (1, -1):
        c = o + u * sx * .125 + v * -.075 - n * .03
        tube('steer', 'dark', c - u * sx * .02, c + u * sx * .012, .006, .006, 5)
        obox('steer', 'indFL' if sx > 0 else 'indFR', c + u * sx * .024 + n * .004, (.026, .018, .022), (u, v, n))
    # a thin navy stripe along the lower edge of the mask
    flat('steer', 'trim', [(-.07, -.112), (.07, -.112), (.034, -.128), (-.034, -.128)], o + n * .0015, u, v, n)

def build_fender_front():
    """High front fender on the lower clamp (no beak): wide U shell climbing from the clamp, long tapered tip."""
    st = [(.34, .975, .042, .02), (.42, 1.0, .052, .03), (.52, 1.01, .074, .04), (.63, .995, .096, .046), (.74, .967, .102, .046),
          (.83, .932, .092, .04), (.91, .888, .07, .03), (.97, .852, .042, .018), (1.0, .836, .014, .01)]
    u_shell(st, 'steer', ['paint'], None)

# ------------------------------------------------------------------------------------------------- bodywork
SHROUD = lambda z, y: .098 + .15 * z + .11 * (1.06 - y)                  # outer plane of the radiator shroud
SIDE = lambda z, y: .112 + .05 * (y - .65) + .03 * min(0.0, z + .5)      # rear side panel plane

def build_shrouds():
    up = [(-.10, 1.0), (.14, 1.045), (.36, 1.058), (.43, .975), (.448, .86), (.41, .76), (.35, .68), (.26, .70), (.16, .76),
          (.04, .84), (-.08, .905)]
    for sx in (-1, 1):
        slab('body', 'paint', up, SHROUD, sx, .006)
        # front return of the shroud: a strip folding in from its front edge towards the radiator, so it reads from the front
        edge = [(.36, 1.058), (.43, .975), (.448, .86), (.41, .76), (.35, .68)]
        O = [V(sx * SHROUD(z, y), y, z) for z, y in edge]; I = [V(sx * .085, y - .01, z - .05) for z, y in edge]
        T = []
        for k in range(len(edge) - 1):
            T += [[O[k], O[k + 1], I[k + 1]], [O[k], I[k + 1], I[k]]]
        T = np.array(T); put('body', 'paint', np.concatenate([T, flip(T)]), None, 30, None)
        # white block over the top of the shroud with navy slashes and a navy wedge at the front (plain shapes, no lettering)
        graphic('body', 'accent', [(-.085, .985), (.14, 1.032), (.355, 1.044), (.405, .99), (.33, .93), (.12, .895), (-.06, .915)], SHROUD, sx)
        graphic('body', 'trim', [(.25, .985), (.36, 1.03), (.395, .99), (.33, .945)], SHROUD, sx, .0032)
        for k in range(3 if Q['detail'] else 2):
            z0 = .02 + .075 * k
            graphic('body', 'trim', [(z0 + .05, 1.02 + .002 * k), (z0 + .075, 1.022 + .002 * k), (z0 + .03, .91), (z0 + .005, .905)], SHROUD, sx, .0032)
        graphic('body', 'trim', [(.33, .93), (.405, .99), (.415, .975), (.335, .918), (.12, .884), (.12, .895)], SHROUD, sx, .0032)
        graphic('body', 'accent', [(.30, .74), (.40, .79), (.415, .77), (.36, .705)], SHROUD, sx)            # white flash low
        # radiator behind the shroud, with fins on hi
        obox('body', 'dark', V(sx * .108, .80, .31), (.06, .26, .07))
        if Q['detail']:
            for k in range(6): obox('body', 'metal', V(sx * .108, .69 + .045 * k, .347), (.056, .007, .006))
            polytube('body', 'dark', [V(sx * .09, .70, .30), V(sx * .05, .66, .22), V(sx * .02, .70, .17)], .011, 5)   # hoses

def build_tank_seat():
    # silver-grey tank with side lobes straddling the frame (visible under the shrouds), black cap
    stn = [(.32, 1.035, .06, .95, .95), (.20, 1.05, .10, .80, .90), (.04, 1.035, .115, .76, .90), (-.12, 1.0, .105, .80, .92)]
    S = [sec(z, sym([(0, yt), (w * .7, yt - .004), (w, yt - .05), (w * .97, yb), (w * .55, yb + .02), (w * .4, yc), (0, yc)]))
         for z, yt, w, yb, yc in stn]
    T, g = loft(S); put('body', 'metal', T, g, 35)
    tube('body', 'dark', V(0, 1.03, .27), V(0, 1.052, .27), .028, .028, Q['sn'])                # fuel cap
    # small flat seat running onto the tank
    st = [(.25, 1.048, .04, .05), (.16, 1.044, .065, .06), (.04, 1.03, .09, .07), (-.12, 1.02, .105, .07), (-.32, 1.02, .11, .065),
          (-.50, 1.025, .10, .05), (-.64, 1.035, .078, .035), (-.70, 1.04, .05, .025)]
    S = [sec(z, sym([(0, yt), (w * .78, yt - .002), (w, yt - .02), (w * .96, yt - th), (0, yt - th)])) for z, yt, w, th in st]
    T, g = loft(S); put('body', 'seat', T, g, 40)

def build_rear():
    # long tapered rear fender (tail), white flanks under the seat, orange top and tip
    st = [(-.44, 1.0, .12, .05), (-.58, 1.01, .124, .06), (-.72, 1.022, .112, .06), (-.84, 1.032, .09, .05), (-.94, 1.038, .062, .036),
          (-1.02, 1.04, .032, .02), (-1.065, 1.038, .01, .01)]
    tag = lambda i, j: 1 if (j in (0, 5) and i <= 3) else 0
    u_shell(st, 'body', ['paint', 'accent'], tag)
    # black plate holder / mud flap under the tail with the small red tail light at its top (lit through M.tail)
    n = unit(V(0, .22, -1)); u, v, n = frame_from_n(n, V(0, 1, 0))
    o = V(0, 1.0, -.93)
    extrude('body', 'dark', [(-.045, .0), (.045, .0), (.075, -.05), (.07, -.17), (-.07, -.17), (-.075, -.05)], o, u, v, n, .008, .95)
    extrude('body', 'dark', [(-.034, -.006), (.034, -.006), (.03, -.036), (-.03, -.036)], o + n * .008, u, v, n, .01, .9)
    flat('body', 'tail', [(-.029, -.01), (.029, -.01), (.026, -.032), (-.026, -.032)], o + n * .0185, u, v, n)
    for sx in (1, -1):                                                    # tiny rear indicators on stalks (+x = left)
        c = o + u * sx * .075 + v * -.07 + n * .004
        tube('body', 'dark', c, c + u * sx * .03, .005, .005, 5)
        obox('body', 'indRL' if sx > 0 else 'indRR', c + u * sx * .042 + n * .004, (.024, .016, .02), (u, v, n))
    # side panels (number boards): orange with a white band under the seat and navy wedges
    side = [(-.12, .955), (-.50, .965), (-.80, .99), (-.82, .96), (-.62, .84), (-.44, .69), (-.24, .67), (-.13, .78)]
    for sx in (-1, 1):
        slab('body', 'paint', side, SIDE, sx, .006)
        graphic('body', 'accent', [(-.12, .95), (-.80, .983), (-.76, .935), (-.55, .895), (-.25, .885), (-.13, .895)], SIDE, sx)
        graphic('body', 'trim', [(-.36, .948), (-.46, .952), (-.41, .89), (-.31, .888)], SIDE, sx, .0032)
        graphic('body', 'trim', [(-.17, .945), (-.22, .946), (-.19, .888), (-.14, .89)], SIDE, sx, .0032)
        graphic('body', 'trim', [(-.25, .885), (-.55, .895), (-.76, .935), (-.765, .925), (-.55, .884), (-.25, .874)], SIDE, sx, .0032)
        if Q['detail']: tube('body', 'dark', V(sx * (SIDE(-.33, .78) - .004), .78, -.33), V(sx * (SIDE(-.33, .78) + .004), .78, -.33), .012, .012, 6)  # panel bolt
    obox('body', 'dark', V(0, .88, -.42), (.17, .16, .34))                 # airbox

def build_exhaust():
    x = EXH
    # header leaves the front of the head, sweeps down and round in front of the engine, then back along the right side
    polytube('body', 'metal', [V(x * .015, .80, .21), V(x * .03, .76, .30), V(x * .06, .64, .35), V(x * .10, .53, .33),
                               V(x * .14, .50, .22), V(x * .155, .53, .05), V(x * .16, .60, -.12), V(x * .165, .70, -.28),
                               V(x * .17, .76, -.38)], .021, Q['tn'], 35)
    a, b = V(x * .17, .755, -.37), V(x * .175, .905, -.86)
    tube('body', 'metal', a, b, .056, .05, Q['sn'], crease=50)                # silencer (brushed alloy)
    d = unit(b - a)
    tube('body', 'chrome', b, b + d * .03, .05, .036, Q['sn'], crease=50)     # end cap
    tube('body', 'dark', b + d * .03, b + d * .04, .018, .018, Q['tn'])       # outlet
    tube('body', 'chrome', a - d * .02, a + d * .02, .058, .058, Q['sn'])     # front band
    if Q['detail']:
        c = a + d * .32; tube('body', 'dark', c, c + d * .012, .059, .058, Q['sn'])   # strap
    obox('body', 'dark', V(x * .135, .87, -.6), (.06, .02, .03))               # can bracket

def build_engine_frame():
    # crankcase: angular side profile extruded both ways (bevelled outer faces), covers, cylinder, head and valve cover
    case = [(.22, .53), (.25, .45), (.21, .385), (.08, .36), (-.08, .365), (-.17, .40), (-.20, .48), (-.16, .56), (-.04, .60), (.12, .60)]
    for sx in (-1, 1): extrude('body', 'luggage', case, V(0, 0, 0), V(0, 0, 1), V(0, 1, 0), V(sx, 0, 0), .10, .9)
    tube('body', 'metal', V(-.098, .48, -.03), V(-.13, .48, -.03), .088, .082, Q['sn'])     # clutch cover (right)
    tube('body', 'metal', V(-.13, .48, -.03), V(-.137, .48, -.03), .05, .046, Q['sn'])     # clutch cover cap
    tube('body', 'metal', V(.098, .49, -.06), V(.128, .49, -.06), .072, .068, Q['sn'])     # ignition cover (left)
    tube('body', 'metal', V(.12, .43, .14), V(.132, .43, .14), .03, .03, Q['tn'])          # water pump / starter cover
    cy = (V(1, 0, 0), unit(V(0, 1, .2)), unit(V(0, -.2, 1)))
    obox('body', 'luggage', V(0, .69, .11), (.12, .2, .14), cy)
    obox('body', 'luggage', V(0, .815, .13), (.135, .07, .16), cy)
    obox('body', 'dark', V(0, .858, .138), (.105, .025, .13), cy)
    if Q['detail']:
        for k in range(5): obox('body', 'metal', V(0, .62 + .03 * k, .11 + .006 * k), (.124, .006, .144), cy)   # cylinder ribs
        for sx in (-1, 1):
            for zz in (-.1, .0, .1):
                c = V(sx * .1, .5, zz); tube('body', 'metal', c, c + V(sx * .006, 0, 0), .007, .007, 6)   # case bolts
            polytube('body', 'dark', [V(sx * .03, .80, .22), V(sx * .07, .79, .27), V(sx * .09, .76, .29)], .01, 5)  # hoses
        obox('body', 'dark', V(0, .76, -.06), (.09, .07, .13))                                   # throttle body
        polytube('body', 'dark', [V(0, .76, -.12), V(0, .82, -.22), V(0, .86, -.26)], .025, 6)  # intake boot
    # orange frame: head tube, twin main tubes past the tank, down tube splitting into the cradle round the engine
    tube('body', 'paint', AXP(.58), AXP(.80), .032, .032, Q['sn'])
    for sx in (-1, 1):
        polytube('body', 'paint', [AXP(.70) + V(sx * .03, 0, -.03), V(sx * .085, .93, .23), V(sx * .112, .82, .01), V(sx * .122, .70, -.13),
                                   V(sx * .122, .52, -.22)], .02, 6, 35)
        polytube('body', 'paint', [V(0, .52, .37), V(sx * .055, .40, .30), V(sx * .062, .355, .16), V(sx * .066, .345, -.08),
                                   V(sx * .10, .42, -.20)], .016, 6, 35)
        polytube('body', 'dark', [V(sx * .12, .82, -.08), V(sx * .092, .97, -.64)], .013, 6)     # subframe
        polytube('body', 'dark', [V(sx * .112, .60, -.22), V(sx * .09, .95, -.58)], .012, 6)
        obox('body', 'dark', V(sx * .122, .48, -.22), (.03, .16, .1))                             # pivot plates
    polytube('body', 'paint', [AXP(.62) + V(0, 0, -.02), V(0, .68, .42), V(0, .52, .37)], .024, 6, 35)
    tube('body', 'metal', V(-.15, .48, -.22), V(.15, .48, -.22), .014, .014, 8)                  # swingarm pivot bolt
    # orange bash plate / frame guard under the engine
    stn = [(.30, .37, .075), (.22, .325, .1), (.02, .31, .11), (-.14, .33, .1)]
    S = [np.array([[-w, yb + .07, z], [-w, yb + .02, z], [-w + .025, yb, z], [w - .025, yb, z], [w, yb + .02, z], [w, yb + .07, z]]) for z, yb, w in stn]
    T, g = loft(S); put('body', 'paint', T, g, 30)
    if Q['detail']:
        for xx in (-.05, 0, .05):
            c = V(xx, .312, .02); tube('body', 'metal', c, c + V(0, -.004, 0), .008, .008, 6)       # plate bolts

def build_swingarm_chain():
    for sx in (-1, 1):
        a, b = V(sx * .112, .48, -.22), V(sx * .108, .36, -.74); d = unit(b - a)
        side = V(1, 0, 0); up = unit(np.cross(d, side)) * (1 if np.cross(d, side)[1] > 0 else -1)
        def rect(c, w, h): return np.array([c - side * w / 2 - up * h / 2, c + side * w / 2 - up * h / 2, c + side * w / 2 + up * h / 2, c - side * w / 2 + up * h / 2])
        T, g = loft([rect(a, .046, .11), rect(a + d * .25, .046, .095), rect(b, .04, .06)]); put('body', 'accent', T, g, 25)
        obox('body', 'metal', V(sx * .108, .36, -.73), (.044, .05, .07))                    # axle block
        tube('body', 'dark', V(sx * .13, .36, -.765), V(sx * .13, .36, -.785), .008, .008, 6)  # chain adjuster
    obox('body', 'accent', V(0, .455, -.36), (.2, .05, .06))                                 # cross brace (shock mount)
    obox('body', 'dark', V(.105, .53, -.34), (.04, .012, .26), (V(1, 0, 0), unit(V(0, 1, -.23)), unit(V(0, .23, 1))))  # chain slider
    # countershaft sprocket and chain (left side)
    cs = V(.074, .43, -.12)
    tube('body', 'dark', cs, cs + V(.008, 0, 0), .042, .042, 10)
    for s in (1, -1):
        a, b = cs + V(.004, s * .044, 0), V(.078, RR + s * .124, R[2])
        d = unit(b - a); up = unit(np.cross(V(1, 0, 0), d))
        obox('body', 'dark', (a + b) / 2, (.011, .011, np.linalg.norm(b - a)), (V(1, 0, 0), up, d))
        if Q['detail']:
            L = np.linalg.norm(b - a); m = int(L / .028)
            for k in range(m): dot('body', 'metal', a + d * (k + .5) * L / m + V(.0058, 0, 0), d, up, .006, .0035, 1)   # link plates
    obox('body', 'dark', V(.078, .25, -.6), (.03, .05, .12))                                 # chain guide
    obox('body', 'metal', V(-.075, .30, -.71), (.04, .055, .07))                             # rear caliper (right)
    obox('body', 'dark', V(-.075, .30, -.65), (.012, .02, .06))
    # rear shock (mounted straight to the swingarm), silver body and reservoir, black coil spring
    top, bot = V(0, .84, -.12), V(0, .47, -.36); d = unit(bot - top); L = np.linalg.norm(bot - top)
    tube('body', 'metal', top, top + d * L * .55, .024, .024, Q['tn'])
    tube('body', 'chrome', top + d * L * .5, bot, .01, .01, Q['tf'])
    tube('body', 'chrome', top + V(.045, -.01, .01), top + V(.045, -.15, -.05), .021, .021, Q['tn'])   # reservoir (left)
    tube('body', 'dark', top + V(0, 0, 0), top + V(.045, -.02, .0), .01, .01, 5)
    tube('body', 'metal', top + d * L * .16, top + d * L * .19, .042, .042, Q['tn'])           # preload collar
    u, w = perp(d); pts = []
    nt, hs = Q['turns'], Q['hseg']
    for k in range(nt * hs + 1):
        a = 2 * PI * k / hs; t = k / (nt * hs)
        pts.append(top + d * (L * (.19 + .63 * t)) + (u * math.cos(a) + w * math.sin(a)) * .037)
    polytube('body', 'dark', pts, .0068, 4 if Q['hi'] else 3, 70, caps=False)
    tube('body', 'metal', bot - d * .02, bot + d * .02, .02, .02, Q['tn'])                    # clevis
    # footpegs, brake pedal (right), gear lever (left), side stand folded up on the left
    for sx in (-1, 1):
        obox('body', 'metal', V(sx * .205, .405, -.15), (.11, .018, .055))
        obox('body', 'dark', V(sx * .14, .415, -.15), (.03, .05, .05))
        if Q['detail']:
            for k in range(4): obox('body', 'metal', V(sx * (.165 + .028 * k), .417, -.15), (.006, .01, .057))
    polytube('body', 'metal', [V(-.13, .415, -.10), V(-.16, .385, .04), V(-.17, .395, .10)], .008, 5)
    obox('body', 'metal', V(-.17, .40, .105), (.03, .012, .045))
    polytube('body', 'metal', [V(.13, .48, -.05), V(.155, .45, .07)], .007, 5)
    obox('body', 'metal', V(.165, .45, .08), (.04, .012, .018))
    polytube('body', 'chrome', [V(.135, .40, -.08), V(.15, .385, -.24), V(.155, .38, -.42)], .011, Q['tf'])   # side stand
    obox('body', 'chrome', V(.155, .375, -.44), (.03, .012, .05))
    if Q['detail']: polytube('body', 'dark', [V(.13, .41, -.12), V(.14, .39, -.20)], .004, 4)            # stand spring

def build():
    build_wheels(); build_front(); build_shrouds(); build_tank_seat(); build_rear(); build_exhaust(); build_engine_frame()
    build_swingarm_chain()

# ------------------------------------------------------------------------------------------------- output
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'bikes', 'enduro.js'))
    a = ap.parse_args()
    grip = [round(float(x), 4) for x in GRIP]
    write_js(a.out, 'APEX_ENDURO', '/* Generated by tools/build_enduro.py (original procedural model): do not edit by hand.\n'
             '   450 four-stroke enduro (Canyon Motocross), quantised meshes per part and material slot; see EnduroKit in index.html. */\n',
             K.anchors(grip), lambda name: make_lod(name, set_lod, build, K.to_part_space, PARTS, SLOTS))

if __name__ == '__main__':
    main()
