# Genera los modelos 3D "por capas" para personalizar el platillo en "Ver en mi mesa":
#   - hamburguesa armada con capas dibujadas (pan, carne, queso, tocino, cebolla, jitomate, lechuga, pan)
#   - extras para la pasta (parmesano), el pastel (cereza) y la ensalada (crotones)
# Salidas (todo a escala real, en metros):
#   modelos/capas/<platillo>.glb          modelo del visor, con cada ingrediente en su propio nodo
#   modelos/variantes/<platillo>_<bits>.usdz  una versión por combinación, para AR Quick Look (iPhone)
#
# Uso (desde menu-web):  python herramientas/capas.py <carpeta con los GLB originales sin comprimir>
# Requiere: numpy, trimesh, rtree, pillow, usd-core, y npx (@gltf-transform/cli) para unir y comprimir.
#
# El color de cada pieza sale de una paleta (una textura chiquita de degradados): cada vértice apunta a una fila
# (el material) y a un punto del degradado. Así se ve igual en el visor web y en el iPhone.

import io, itertools, json, os, struct, subprocess, sys, tempfile, zipfile
import numpy as np
import trimesh
from PIL import Image
from pxr import Usd, UsdGeom, UsdShade, UsdUtils, Sdf, Gf, Vt

ORIGEN = sys.argv[1] if len(sys.argv) > 1 else "../modelos3d/final"
AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rng = np.random.default_rng(7)

# ---------- Paleta ----------
PALETA = {  # nombre: (colores del degradado, rugosidad)
    "corteza": (["#EDBE7B", "#C7802F", "#9A5216"], 0.55),
    "miga": (["#F6E2B8", "#E9C88F"], 0.9),
    "carne": (["#70402A", "#4A2817", "#331A0E"], 0.85),
    "queso": (["#FFCB45", "#F4A30C"], 0.35),
    "tocino": (["#F1C29B", "#C2543B", "#8E2A1E"], 0.45),
    "cebolla": (["#F7D58C", "#E2A441", "#C07F24"], 0.65),  # aros de cebolla empanizados
    "jitomate": (["#B9231A", "#E8503C", "#F7A98C"], 0.3),
    "lechuga": (["#DDF0A0", "#8CCB52", "#4C9E33"], 0.5),
    "papas": (["#F8DB86", "#E6AE3C", "#C98522"], 0.6),
    "ajonjoli": (["#FFF4D9", "#F3DDA8"], 0.5),
    "parmesano": (["#FFF6D2", "#F4DC93"], 0.6),
    "cereza": (["#F0364B", "#B8142B", "#7A0A1B"], 0.12),
    "tallo": (["#7C9A2E", "#4F6418"], 0.6),
    "crema": (["#FFFEFA", "#F2E7D2"], 0.5),
    "croton": (["#F0CD92", "#C98A3C", "#A8662A"], 0.8),
    "plato": (["#FFFFFF", "#EDEAE4"], 0.25),
}
FILAS = list(PALETA)
ANCHO = 64


def hex3(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float)


def paleta_png():
    img = np.zeros((len(FILAS) * 4, ANCHO, 3), np.uint8)
    for f, nombre in enumerate(FILAS):
        colores = [hex3(c) for c in PALETA[nombre][0]]
        for x in range(ANCHO):
            p = x / (ANCHO - 1) * (len(colores) - 1)
            i = min(int(p), len(colores) - 2)
            img[f * 4:f * 4 + 4, x] = colores[i] + (colores[i + 1] - colores[i]) * (p - i)
    b = io.BytesIO()
    Image.fromarray(img).save(b, "PNG")
    return b.getvalue()


# ---------- Mallas ----------
class Malla:
    def __init__(self, P, F, fila, t, doble=False):
        self.P = np.asarray(P, float).reshape(-1, 3)
        self.F = np.asarray(F, int).reshape(-1, 3)
        t = np.broadcast_to(np.asarray(t, float), (len(self.P),))
        self.UV = np.stack([np.clip(t, 0.03, 0.97), np.full(len(self.P), (FILAS.index(fila) + 0.5) / len(FILAS))], 1)
        self.fila = fila
        self.doble = doble

    def mover(self, d):
        self.P = self.P + np.asarray(d, float)
        return self

    def girar(self, M):
        self.P = self.P @ np.asarray(M, float).T
        return self

    def normales(self):
        n = np.zeros_like(self.P)
        a, b, c = self.P[self.F[:, 0]], self.P[self.F[:, 1]], self.P[self.F[:, 2]]
        fn = np.cross(b - a, c - a)
        for k in range(3):
            np.add.at(n, self.F[:, k], fn)
        largo = np.linalg.norm(n, axis=1, keepdims=True)
        return n / np.where(largo < 1e-12, 1, largo)


def unir(mallas):
    """Une mallas del mismo material (misma fila de la paleta)."""
    P, F, UV, base = [], [], [], 0
    for m in mallas:
        P.append(m.P); F.append(m.F + base); UV.append(m.UV); base += len(m.P)
    u = Malla(np.concatenate(P), np.concatenate(F), mallas[0].fila, 0, mallas[0].doble)
    u.UV = np.concatenate(UV)
    return u


def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_x(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_z(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def torno(perfil, fila, seg=36, onda=None):
    """Sólido de revolución. perfil: [(radio, altura, t)], de abajo hacia arriba por fuera.
    onda(ang, r, y) -> (r, y) deforma cada punto para que no quede perfecto."""
    ang = np.linspace(0, 2 * np.pi, seg, endpoint=False)
    P, T = [], []
    for r, y, t in perfil:
        for a in ang:
            rr, yy = onda(a, r, y) if onda else (r, y)
            P.append([rr * np.cos(a), yy, rr * np.sin(a)]); T.append(t)
    F = []
    for i in range(len(perfil) - 1):
        for j in range(seg):
            a, b = i * seg + j, i * seg + (j + 1) % seg
            c, d = a + seg, b + seg
            F += [[a, c, b], [b, c, d]]
    return Malla(P, F, fila, T)


def lamina(f, nu, nv, grosor, fila, cerrada=False):
    """Hoja delgada con grosor. f(u, v) -> (x, y, z, t), u y v de 0 a 1. cerrada=True une u=1 con u=0 (discos)."""
    us = np.linspace(0, 1, nu, endpoint=not cerrada)
    vs = np.linspace(0, 1, nv)
    G = np.array([[f(u, v) for v in vs] for u in us])
    P, T = G[..., :3], G[..., 3]
    du = (np.roll(P, -1, 0) - np.roll(P, 1, 0)) if cerrada else np.gradient(P, axis=0)
    dv = np.gradient(P, axis=1)
    n = np.cross(dv, du)
    n /= np.maximum(np.linalg.norm(n, axis=2, keepdims=True), 1e-12)
    if n[..., 1].mean() < 0:
        n = -n
    arriba, abajo = P.reshape(-1, 3), (P - n * grosor).reshape(-1, 3)
    N = nu * nv
    idx = lambda i, j: (i % nu) * nv + j
    F = []
    for i in range(nu if cerrada else nu - 1):
        for j in range(nv - 1):
            a, b, c, d = idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)
            F += [[a, c, b], [a, d, c], [a + N, b + N, c + N], [a + N, c + N, d + N]]
    borde = []  # pares de vértices consecutivos del contorno
    for i in range(nu if cerrada else nu - 1):
        borde.append((idx(i, nv - 1), idx(i + 1, nv - 1)))
        if not cerrada:
            borde.append((idx(i + 1, 0), idx(i, 0)))
    if not cerrada:
        for j in range(nv - 1):
            borde.append((idx(0, j), idx(0, j + 1)))
            borde.append((idx(nu - 1, j + 1), idx(nu - 1, j)))
    for a, b in borde:
        F += [[a, b, b + N], [a, b + N, a + N]]
    m = Malla(np.concatenate([arriba, abajo]), F, fila, np.concatenate([T.reshape(-1), T.reshape(-1)]))
    # Orienta las caras hacia afuera (la de arriba debe mirar hacia arriba).
    if m.normales()[:N, 1].mean() < 0:
        m.F = m.F[:, ::-1]
    return m


def caja(lx, ly, lz, fila, t, afila=1.0):
    """Caja con caras planas (24 vértices), centrada; afila estrecha las puntas en x."""
    P, F, T = [], [], []
    esquinas = lambda sx, sy, sz: [sx * lx / 2, sy * ly / 2 * (afila if sx > 0 else 1), sz * lz / 2 * (afila if sx > 0 else 1)]
    caras = [  # cada cara: 4 esquinas en sentido antihorario vistas desde afuera
        [(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)], [(-1, -1, 1), (-1, 1, 1), (-1, 1, -1), (-1, -1, -1)],
        [(-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)], [(-1, -1, 1), (-1, -1, -1), (1, -1, -1), (1, -1, 1)],
        [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)], [(1, -1, -1), (-1, -1, -1), (-1, 1, -1), (1, 1, -1)],
    ]
    for k, cara in enumerate(caras):
        b = len(P)
        P += [esquinas(*e) for e in cara]
        T += [t + (0.12 if k == 2 else 0) + (0.2 if k in (0, 1) else 0)] * 4
        F += [[b, b + 1, b + 2], [b, b + 2, b + 3]]
    return Malla(P, F, fila, T)


def esfera(r, fila, t0, t1, seg=14, anillos=9, sy=1.0, hoyo=0.0):
    perfil = []
    for i in range(anillos + 1):
        a = -np.pi / 2 + np.pi * i / anillos
        y = np.sin(a) * r * sy
        if hoyo and i >= anillos - 1:
            y -= hoyo * (1 if i == anillos else 0.35)
        perfil.append((max(np.cos(a) * r, 0), y + r * sy, t0 + (t1 - t0) * (1 - i / anillos)))
    return torno(perfil, fila, seg)


def tubo(puntos, radio, fila, t, lados=5):
    P, F = [], []
    puntos = np.asarray(puntos, float)
    for i, p in enumerate(puntos):
        d = puntos[min(i + 1, len(puntos) - 1)] - puntos[max(i - 1, 0)]
        d /= np.linalg.norm(d)
        u = np.cross(d, [1, 0, 0.3]); u /= np.linalg.norm(u)
        w = np.cross(d, u)
        rr = radio * (1.5 if i == len(puntos) - 1 else 1)
        for k in range(lados):
            a = 2 * np.pi * k / lados
            P.append(p + (np.cos(a) * u + np.sin(a) * w) * rr)
    for i in range(len(puntos) - 1):
        for k in range(lados):
            a, b = i * lados + k, i * lados + (k + 1) % lados
            F += [[a, b, a + lados], [b, b + lados, a + lados]]
    return Malla(P, F, fila, t)


# ---------- Hamburguesa por capas ----------
PLATO_Y = 0.006  # altura de la superficie del plato
CENTRO = np.array([-0.03, 0.0, 0.004])  # la hamburguesa va un poco a la izquierda; las papas a la derecha


def pan_abajo():
    onda = lambda a, r, y: (r * (1 + 0.012 * np.sin(3 * a + 1)), y)
    lado = torno([(0, 0, 0.6), (0.046, 0, 0.6), (0.0525, 0.004, 0.45), (0.0535, 0.011, 0.3), (0.051, 0.017, 0.15)], "corteza", onda=onda)
    tapa = torno([(0.051, 0.017, 0.3), (0.03, 0.0178, 0.1), (0, 0.018, 0.0)], "miga", onda=onda)
    return [lado, tapa], 0.018


def carne():
    def onda(a, r, y):
        k = 1 + 0.035 * np.sin(5 * a + 0.7) + 0.02 * np.sin(11 * a) + 0.012 * np.sin(23 * a + 2)
        return r * k, y + (0.0012 * np.sin(9 * a + r * 300) if y > 0.013 else 0)
    perfil = [(0, 0, 0.6), (0.049, 0, 0.7), (0.0555, 0.005, 0.45), (0.0565, 0.0135, 0.3), (0.051, 0.0186, 0.55), (0.03, 0.0192, 0.3), (0.012, 0.019, 0.5), (0, 0.019, 0.4)]
    return [torno(perfil, "carne", seg=44, onda=onda)], 0.019


def queso():
    L = 0.052
    def f(u, v):
        x, z = (u - 0.5) * 2 * L, (v - 0.5) * 2 * L
        r = np.hypot(x, z)
        caida = min(0.011, max(0, r - 0.05) ** 1.25 * 3.0)  # las esquinas cuelgan sobre la carne
        return x, 0.0032 - caida, z, 0.15 + 0.6 * min(1, r / 0.07)
    return [lamina(f, 15, 15, 0.0026, "queso")], 0.0034


def tocino():
    tiras = []
    for z0, giro, fase in [(-0.017, 0.16, 0.0), (0.016, -0.12, 1.3)]:
        def f(u, v, z0=z0, fase=fase):
            x = (u - 0.5) * 0.124
            caida = min(0.007, max(0, abs(x) - 0.05) ** 1.2 * 2.2)
            y = 0.0038 + 0.0016 * np.sin(u * 5.2 * np.pi + fase) - caida
            z = z0 + (v - 0.5) * 0.024 + 0.0022 * np.sin(u * 3 * np.pi + fase)
            return x, y, z, 0.5 + 0.48 * np.sin(v * 3.2 * np.pi + 0.4) * (0.75 + 0.25 * np.sin(u * 9))
        tiras.append(lamina(f, 26, 7, 0.0024, "tocino").girar(rot_y(giro)))
    return [unir(tiras)], 0.0062


def cebolla():
    aros = []
    for (x, z), R in [((-0.012, -0.012), 0.03), ((0.014, -0.004), 0.027), ((-0.002, 0.016), 0.024)]:
        perfil = []
        for k in range(9):
            a = 2 * np.pi * k / 8
            perfil.append((R + np.cos(a) * 0.0042, 0.0026 + np.sin(a) * 0.0024, 0.5 + 0.5 * np.cos(a)))
        aros.append(torno(perfil, "cebolla", seg=28).mover([x, 0, z]))
    return [unir(aros)], 0.0054


def jitomate():
    rebanadas = []
    for (x, z), sube in [((-0.019, 0.004), 0.0), ((0.02, -0.006), 0.0012)]:
        def onda(a, r, y):
            dentro = 0.0006 * np.sin(5 * a) if 0.005 < r < 0.03 and y > 0.004 else 0
            return r * (1 + 0.02 * np.sin(4 * a)), y + dentro
        perfil = [(0, 0, 0.5), (0.03, 0, 0.3), (0.0352, 0.001, 0.0), (0.0358, 0.0055, 0.0), (0.033, 0.0066, 0.2),
                  (0.027, 0.0064, 0.55), (0.017, 0.006, 0.95), (0.009, 0.0064, 0.6), (0, 0.0066, 0.75)]
        rebanadas.append(torno(perfil, "jitomate", seg=30, onda=onda).mover([x, sube, z]))
    return [unir(rebanadas)], 0.0078


def lechuga():
    def f(u, v):
        a = u * 2 * np.pi
        r = v * 0.066 * (1 + 0.07 * np.sin(3 * a + 0.5) + 0.04 * np.sin(7 * a))
        y = 0.0026 + v ** 3 * 0.0058 * np.sin(10 * a + 1.2) + v ** 2 * 0.0018 * np.sin(4 * a) - max(0, v - 0.82) * 0.012
        return r * np.cos(a), y, r * np.sin(a), 0.1 + 0.85 * v ** 1.5
    return [lamina(f, 72, 9, 0.0011, "lechuga", cerrada=True)], 0.0062


def pan_arriba():
    onda = lambda a, r, y: (r * (1 + 0.012 * np.sin(3 * a + 2.1)), y)
    base = torno([(0, 0.0005, 0.0), (0.03, 0.0003, 0.1), (0.0505, 0, 0.3)][::-1], "miga", onda=onda)
    base.F = base.F[:, ::-1]
    domo = [(0.0505, 0, 0.1), (0.0545, 0.005, 0.25), (0.055, 0.012, 0.42), (0.051, 0.022, 0.6), (0.042, 0.03, 0.75), (0.028, 0.036, 0.88), (0.013, 0.0392, 0.95), (0, 0.04, 1.0)]
    corteza = torno(domo, "corteza", seg=40, onda=onda)
    # Ajonjolí: semillas repartidas sobre el domo, acostadas sobre la superficie.
    rs, ys = np.array([p[0] for p in domo]), np.array([p[1] for p in domo])
    semillas = []
    for _ in range(46):
        r = 0.043 * np.sqrt(rng.uniform(0.02, 1))
        a = rng.uniform(0, 2 * np.pi)
        y = np.interp(-r, -rs, ys)
        pend = (np.interp(-(r + 0.002), -rs, ys) - np.interp(-(r - 0.002), -rs, ys)) / 0.004
        s = esfera(0.0016, "ajonjoli", 0.1, 0.9, seg=7, anillos=4)
        s.P = (s.P - [0, 0.0016, 0]) * [1.75, 0.55, 1.0]
        s.girar(rot_y(rng.uniform(0, np.pi))).girar(rot_z(np.arctan(pend))).girar(rot_y(-a)).mover([r * np.cos(a), y + 0.0004, r * np.sin(a)])
        semillas.append(s)
    return [corteza, base, unir(semillas)], 0.04


def papas():
    piezas = []
    for k in range(26):
        largo = rng.uniform(0.05, 0.078)
        nivel = k // 9
        p = caja(largo, 0.0078, 0.0078, "papas", rng.uniform(0.1, 0.7), afila=0.8)
        p.girar(rot_x(rng.uniform(0, np.pi / 2))).girar(rot_z(rng.uniform(-0.1, 0.1) + (0.22 if nivel == 2 else 0)))
        p.girar(rot_y(rng.uniform(-0.5, 0.5) + np.pi / 2 + (0.5 if nivel == 1 else 0)))
        x = rng.uniform(0.048, 0.078) - nivel * 0.002
        z = rng.uniform(-0.034, 0.034) * (1 - nivel * 0.25)
        p.mover([x, PLATO_Y + 0.0045 + nivel * 0.0075 + rng.uniform(0, 0.0015), z])
        piezas.append(p.mover([0, max(0, PLATO_Y + 0.0008 - p.P[:, 1].min()), 0]))  # ninguna atraviesa el plato
    return [unir(piezas)]


CAPAS = [  # de abajo hacia arriba; opcional=True se puede quitar
    ("pan_abajo", pan_abajo, False), ("carne", carne, False), ("queso", queso, True), ("tocino", tocino, True),
    ("cebolla", cebolla, True), ("jitomate", jitomate, True), ("lechuga", lechuga, True), ("pan_arriba", pan_arriba, False),
]


def plato():
    s = trimesh.load(os.path.join(ORIGEN, "fuerte_hamburguesa.glb"))
    g = s.geometry["plato"]
    return Malla(g.vertices, g.faces, "plato", 0.15)


# ---------- Extras sobre los platillos escaneados ----------
def superficie(nombre):
    s = trimesh.load(os.path.join(ORIGEN, nombre + ".glb"))
    m = s.to_geometry()
    def altura(x, z):
        loc, _, _ = m.ray.intersects_location([[x, 0.4, z]], [[0, -1, 0]], multiple_hits=False)
        return float(loc[0][1]) if len(loc) else 0.0
    return altura


def parmesano():
    h = superficie("pasta_bolognesa")
    grupos = [[] for _ in range(4)]
    n = 0
    while n < 150:
        x, z = rng.uniform(-0.075, 0.075, 2)
        y = h(x, z)
        if y < 0.04 + rng.uniform(0, 0.025):  # más queso hacia la cima de la pasta
            continue
        grande = rng.random() < 0.55
        largo, ancho = (rng.uniform(0.007, 0.013), rng.uniform(0.0022, 0.0038)) if grande else (rng.uniform(0.003, 0.005), 0.0016)
        curva = rng.uniform(-0.6, 0.6)
        def f(u, v):
            a = (u - 0.5) * curva
            return (u - 0.5) * largo * np.cos(a), 0.0009 + abs(u - 0.5) * largo * np.sin(abs(a)) * 0.6, (v - 0.5) * ancho, rng.uniform(0, 1)
        hoja = lamina(f, 4, 2, 0.0005, "parmesano")
        hoja.girar(rot_z(rng.uniform(-0.35, 0.35))).girar(rot_x(rng.uniform(-0.35, 0.35))).girar(rot_y(rng.uniform(0, np.pi)))
        grupos[n % 4].append(hoja.mover([x, y + 0.0006, z]))
        n += 1
    return [(f"parmesano_{i + 1}", [unir(g)]) for i, g in enumerate(grupos)]


def cereza():
    h = superficie("postre_pastel")
    x, z = -0.03, -0.012
    y = h(x, z)
    def espiral(a, r, yy):
        return r * (1 + 0.1 * np.sin(6 * a + yy * 420)), yy
    crema = torno([(0, 0, 0.6), (0.019, 0, 0.9), (0.0215, 0.003, 0.6), (0.019, 0.008, 0.3), (0.013, 0.013, 0.1), (0.0085, 0.0155, 0.4), (0, 0.016, 0.2)], "crema", seg=36, onda=espiral)
    fruta = esfera(0.0118, "cereza", 0.95, 0.0, seg=20, anillos=12, sy=0.94, hoyo=0.0022).mover([0, 0.0125, 0])
    t = np.linspace(0, 1, 7)
    curva = np.stack([0.011 * t ** 1.6, 0.0125 + 0.0205 + 0.03 * t, -0.006 * t ** 2], 1)
    rabo = tubo(curva, 0.00075, "tallo", np.linspace(0.9, 0.1, 7).repeat(5))
    for m in (crema, fruta, rabo):
        m.mover([x, y - 0.001, z])
    return [("cereza", [crema, fruta, rabo])]


def crotones():
    h = superficie("ensalada")
    grupos = [[] for _ in range(2)]
    n = 0
    while n < 16:
        x, z = rng.uniform(-0.085, 0.085, 2)
        y = h(x, z)
        if y < 0.032 or any(np.hypot(x - c[0], z - c[1]) < 0.02 for c in (m.P.mean(0)[[0, 2]] for g in grupos for m in g)):
            continue
        lado = rng.uniform(0.011, 0.015)
        c = caja(lado, lado * rng.uniform(0.75, 1), lado * rng.uniform(0.85, 1.1), "croton", rng.uniform(0.05, 0.6))
        c.girar(rot_x(rng.uniform(-0.5, 0.5))).girar(rot_z(rng.uniform(-0.5, 0.5))).girar(rot_y(rng.uniform(0, np.pi)))
        grupos[n % 2].append(c.mover([x, y + lado * 0.32, z]))
        n += 1
    return [(f"crotones_{i + 1}", [unir(g)]) for i, g in enumerate(grupos)]


# ---------- Escribir GLB ----------
def escribir_glb(ruta, nodos, png):
    """nodos: [(nombre, [Malla], posición, extras)]"""
    bin_, vistas, accesores, mallas, gnodos = bytearray(), [], [], [], []
    materiales = {}

    def vista(datos, destino=None):
        while len(bin_) % 4:
            bin_.append(0)
        v = {"buffer": 0, "byteOffset": len(bin_), "byteLength": len(datos)}
        if destino:
            v["target"] = destino
        bin_.extend(datos); vistas.append(v)
        return len(vistas) - 1

    def accesor(arr, tipo, comp, destino=None, limites=False):
        a = {"bufferView": vista(arr.tobytes(), destino), "componentType": comp, "count": len(arr), "type": tipo}
        if limites:
            a["min"], a["max"] = arr.min(0).tolist(), arr.max(0).tolist()
        accesores.append(a)
        return len(accesores) - 1

    def material(m):
        clave = (m.fila, m.doble)
        if clave not in materiales:
            materiales[clave] = len(materiales)
        return materiales[clave]

    for nombre, piezas, pos, extras in nodos:
        prims = []
        for m in piezas:
            idx = m.F.astype(np.uint32 if len(m.P) > 65535 else np.uint16).reshape(-1)
            prims.append({"attributes": {
                "POSITION": accesor(m.P.astype(np.float32), "VEC3", 5126, 34962, True),
                "NORMAL": accesor(m.normales().astype(np.float32), "VEC3", 5126, 34962),
                "TEXCOORD_0": accesor(m.UV.astype(np.float32), "VEC2", 5126, 34962),
            }, "indices": accesor(idx, "SCALAR", 5125 if idx.dtype == np.uint32 else 5123, 34963), "material": material(m)})
        mallas.append({"name": nombre, "primitives": prims})
        n = {"name": nombre, "mesh": len(mallas) - 1, "translation": [float(v) for v in pos]}
        if extras:
            n["extras"] = extras
        gnodos.append(n)
    img = vista(png)
    gltf = {
        "asset": {"version": "2.0", "generator": "chefi capas.py"},
        "scene": 0, "scenes": [{"name": "extras", "nodes": list(range(len(gnodos)))}],
        "nodes": gnodos, "meshes": mallas, "accessors": accesores, "bufferViews": vistas,
        "buffers": [{"byteLength": len(bin_)}],
        "images": [{"bufferView": img, "mimeType": "image/png", "name": "paleta"}],
        "samplers": [{"magFilter": 9729, "minFilter": 9729, "wrapS": 33071, "wrapT": 33071}],
        "textures": [{"source": 0, "sampler": 0}],
        "materials": [{"name": f"{fila}{'_doble' if doble else ''}", "doubleSided": doble, "pbrMetallicRoughness": {
            "baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": PALETA[fila][1]}}
            for (fila, doble), _ in sorted(materiales.items(), key=lambda kv: kv[1])],
    }
    while len(bin_) % 4:
        bin_.append(0)
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    with open(ruta, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + 8 + len(bin_)))
        f.write(struct.pack("<I4s", len(js), b"JSON")); f.write(js)
        f.write(struct.pack("<I4s", len(bin_), b"BIN\0")); f.write(bin_)


# ---------- Escribir USDZ ----------
def agregar_usd(stage, raiz, nodos, textura):
    """Agrega las mallas a un stage de USD (posición ya aplicada) con materiales que leen la paleta."""
    mats = {}
    for nombre, piezas, pos, _ in nodos:
        for k, m in enumerate(piezas):
            malla = UsdGeom.Mesh.Define(stage, f"{raiz}/{nombre}_{k}")
            P = m.P + np.asarray(pos, float)
            malla.CreatePointsAttr(Vt.Vec3fArray.FromNumpy(P.astype(np.float32)))
            malla.CreateFaceVertexCountsAttr([3] * len(m.F))
            malla.CreateFaceVertexIndicesAttr(Vt.IntArray.FromNumpy(m.F.reshape(-1).astype(np.int32)))
            malla.CreateNormalsAttr(Vt.Vec3fArray.FromNumpy(m.normales().astype(np.float32)))
            malla.SetNormalsInterpolation("vertex")
            malla.CreateSubdivisionSchemeAttr("none")
            malla.CreateDoubleSidedAttr(m.doble)
            malla.CreateExtentAttr([Gf.Vec3f(*P.min(0)), Gf.Vec3f(*P.max(0))])
            st = m.UV * [1, -1] + [0, 1]  # USD mide la v desde abajo
            UsdGeom.PrimvarsAPI(malla).CreatePrimvar("st", Sdf.ValueTypeNames.TexCoord2fArray, "vertex").Set(Vt.Vec2fArray.FromNumpy(st.astype(np.float32)))
            if m.fila not in mats:
                ruta = f"/Root/MaterialesChefi/{m.fila}"
                mat = UsdShade.Material.Define(stage, ruta)
                sup = UsdShade.Shader.Define(stage, ruta + "/Superficie")
                sup.CreateIdAttr("UsdPreviewSurface")
                sup.CreateInput("roughness", Sdf.ValueTypeNames.Float).Set(PALETA[m.fila][1])
                sup.CreateInput("metallic", Sdf.ValueTypeNames.Float).Set(0.0)
                lector = UsdShade.Shader.Define(stage, ruta + "/Lector")
                lector.CreateIdAttr("UsdPrimvarReader_float2")
                lector.CreateInput("varname", Sdf.ValueTypeNames.Token).Set("st")
                tex = UsdShade.Shader.Define(stage, ruta + "/Paleta")
                tex.CreateIdAttr("UsdUVTexture")
                tex.CreateInput("file", Sdf.ValueTypeNames.Asset).Set(textura)
                tex.CreateInput("wrapS", Sdf.ValueTypeNames.Token).Set("clamp")
                tex.CreateInput("wrapT", Sdf.ValueTypeNames.Token).Set("clamp")
                tex.CreateInput("st", Sdf.ValueTypeNames.Float2).ConnectToSource(lector.ConnectableAPI(), "result")
                tex.CreateOutput("rgb", Sdf.ValueTypeNames.Float3)
                sup.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).ConnectToSource(tex.ConnectableAPI(), "rgb")
                mat.CreateSurfaceOutput().ConnectToSource(sup.ConnectableAPI(), "surface")
                mats[m.fila] = mat
            UsdShade.MaterialBindingAPI.Apply(malla.GetPrim()).Bind(mats[m.fila])


def usdz_nuevo(ruta, nodos, png):
    with tempfile.TemporaryDirectory() as tmp:
        open(os.path.join(tmp, "paleta.png"), "wb").write(png)
        stage = Usd.Stage.CreateNew(os.path.join(tmp, "model.usdc"))
        UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y)
        UsdGeom.SetStageMetersPerUnit(stage, 1.0)
        stage.SetDefaultPrim(UsdGeom.Xform.Define(stage, "/Root").GetPrim())
        agregar_usd(stage, "/Root", nodos, "paleta.png")
        stage.GetRootLayer().Save()
        UsdUtils.CreateNewARKitUsdzPackage(Sdf.AssetPath(os.path.join(tmp, "model.usdc")), ruta)


def usdz_con_extras(base, ruta, nodos, png):
    """Copia el USDZ del platillo escaneado y le agrega los extras."""
    with tempfile.TemporaryDirectory() as tmp:
        zipfile.ZipFile(base).extractall(tmp)
        open(os.path.join(tmp, "paleta.png"), "wb").write(png)
        stage = Usd.Stage.Open(os.path.join(tmp, "model.usdc"))
        UsdGeom.Xform.Define(stage, "/Root/Extras")
        agregar_usd(stage, "/Root/Extras", nodos, "paleta.png")
        stage.GetRootLayer().Save()
        UsdUtils.CreateNewARKitUsdzPackage(Sdf.AssetPath(os.path.join(tmp, "model.usdc")), ruta)


# ---------- Armado ----------
def gltf_transform(*args):
    subprocess.run(["npx", "-y", "@gltf-transform/cli@4", *args], check=True, stdout=subprocess.DEVNULL)


def main():
    png = paleta_png()
    capas_dir, var_dir = os.path.join(AQUI, "modelos/capas"), os.path.join(AQUI, "modelos/variantes")
    os.makedirs(capas_dir, exist_ok=True); os.makedirs(var_dir, exist_ok=True)

    # Hamburguesa: un nodo por capa. extras.alto = grosor de la capa (el visor la usa para reacomodar la pila).
    hechas = [(nombre, *fn(), opcional) for nombre, fn, opcional in CAPAS]
    fijos = [("plato", [plato()], [0, 0, 0], None), ("papas", papas(), [0, 0, 0], None)]

    def pila(activas):
        y, nodos = PLATO_Y, []
        for nombre, piezas, alto, opcional in hechas:
            if opcional and nombre not in activas:
                continue
            nodos.append((nombre, piezas, [CENTRO[0], y, CENTRO[2]], {"capa": True, "alto": round(alto, 5), "opcional": opcional}))
            y += alto
        return nodos

    opcionales = [n for n, _, _, o in hechas if o]
    escribir_glb(os.path.join(capas_dir, "hamburguesa.glb"), fijos + pila(opcionales), png)
    for bits in itertools.product("01", repeat=len(opcionales)):
        activas = [n for n, b in zip(opcionales, bits) if b == "1"]
        usdz_nuevo(os.path.join(var_dir, f"hamburguesa_{''.join(bits)}.usdz"), fijos + pila(activas), png)
    print("hamburguesa: opciones", opcionales)

    # Platillos escaneados: el modelo de siempre + los extras en nodos aparte.
    for clave, archivo, extras in [("pasta", "pasta_bolognesa", parmesano()), ("pastel", "postre_pastel", cereza()), ("ensalada", "ensalada", crotones())]:
        nodos = [(nombre, piezas, [0, 0, 0], {"extra": True}) for nombre, piezas in extras]
        with tempfile.TemporaryDirectory() as tmp:
            suelto, unido = os.path.join(tmp, "extras.glb"), os.path.join(tmp, "unido.glb")
            escribir_glb(suelto, nodos, png)
            gltf_transform("merge", os.path.join(AQUI, f"modelos/{archivo}.glb"), suelto, unido, "--merge-scenes")
            gltf_transform("draco", unido, os.path.join(capas_dir, f"{clave}.glb"))
        usdz_con_extras(os.path.join(AQUI, f"modelos/{archivo}.usdz"), os.path.join(var_dir, f"{clave}_1.usdz"), nodos, png)
        print(clave, [n for n, _ in extras])


if __name__ == "__main__":
    main()
