"""Hamburguesa escaneada (la realista de siempre) con la lechuga separable.

No se redibuja nada: del modelo original se apartan las caras de la lechuga en su propio nodo y el resto queda igual.
Al quitar la lechuga, la parte de arriba de la hamburguesa "se asienta" sobre el pan de abajo (las papas no se mueven).

Salidas:
- modelos/capas/hamburguesa.glb          nodos: plato, cuerpo (todo menos la lechuga) y lechuga. El visor (js/mesa.js)
                                          esconde la lechuga y asienta el cuerpo con la misma regla que `asentar()`.
- modelos/variantes/hamburguesa_<bits>.usdz  una por combinación (bits: lechuga, carne), para AR Quick Look (iPhone).
  (con lechuga se usa el USDZ de siempre: modelos/fuerte_hamburguesa.usdz)

Uso, desde menu-web:  python herramientas/lechuga.py ../modelos3d/final
Requiere: numpy, pillow, trimesh, usd-core y npx (gltf-transform para comprimir con Draco).
"""
import json, os, struct, subprocess, sys, tempfile

import numpy as np
import trimesh
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ORIGEN = sys.argv[1] if len(sys.argv) > 1 else "../modelos3d/final"
AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Medidas de la hamburguesa dentro del platillo, en metros. Las mismas van en js/datos.js (personalizar.asentar).
ASENTAR = {
    "centro": [0.006, 0.040],  # eje de la hamburguesa (x, z); las papas quedan atrás (z negativa)
    "radio": [0.058, 0.066],   # atrás, lo que pasa de este radio ya son papas y no se mueve
    "frente": [-0.012, 0.0],   # de esta z hacia el frente todo es hamburguesa (tocino y aros que sobresalen)
    "alto": [0.080, 0.090],    # y de esta altura hacia arriba también (las papas no llegan tan alto)
    # Los ingredientes que se pueden cambiar, de abajo hacia arriba (mismo orden que las opciones de datos.js y que
    # los bits del USDZ):
    #  - "quita": vive entre esas dos alturas en el modelo escaneado; al quitarlo, lo de arriba baja ese alto.
    #  - "pone": pieza dibujada que entra a esa altura; al ponerla, lo de arriba sube su grosor ("alto").
    "pasos": [
        {"id": "lechuga", "quita": [0.029, 0.042]},
        {"id": "jitomate", "pone": 0.042, "alto": 0.0072},
        {"id": "carne", "quita": [0.042, 0.058]},
        {"id": "queso", "pone": 0.058, "alto": 0.0034},
    ],
}
ASENTAR["bandas"] = {p["id"]: p["quita"] for p in ASENTAR["pasos"] if "quita" in p}


def escalon(a, b, x):
    return np.clip((x - a) / (b - a), 0, 1)


def suave(a, b, x):
    t = escalon(a, b, x)
    return t * t * (3 - 2 * t)


def es_hamburguesa(P):
    """1 en la hamburguesa, 0 en las papas."""
    a = ASENTAR
    r = np.hypot(P[:, 0] - a["centro"][0], P[:, 2] - a["centro"][1])
    return np.maximum.reduce([1 - suave(*a["radio"], r), suave(*a["frente"], P[:, 2]), suave(*a["alto"], P[:, 1])])


def piezas_dibujadas():
    """Las piezas que se ponen (jitomate, queso extra), ya colocadas en su lugar: {id: [Malla de capas.py]}."""
    import copy
    import capas
    cx, cz = ASENTAR["centro"]
    hechas = {}
    for paso in ASENTAR["pasos"]:
        if "pone" not in paso:
            continue
        mallas, _ = getattr(capas, paso["id"])()
        if paso["id"] == "jitomate":
            # Cuatro rebanadas en cruz que llegan al borde, para que se vea por todos lados.
            otras = [copy.deepcopy(m).girar(capas.rot_y(np.pi / 2)).mover([0, 0.0005, 0]) for m in mallas]
            mallas = mallas + otras
            for m in mallas:
                m.P = m.P * [1.13, 0.86, 1.13]
        if paso["id"] == "queso":
            for m in mallas:
                m.P = m.P * [0.93, 1, 0.93]
        hechas[paso["id"]] = [m.mover([cx, paso["pone"], cz]) for m in mallas]
    return hechas


def repartir(P, F, UV, textura):
    """A qué ingrediente pertenece cada cara: {nombre: máscara}. Con la lechuga se van las caras verdes; con cada
    ingrediente, las que viven enteras dentro de su banda (al asentar quedarían aplastadas). UV con la v desde abajo."""
    tex = np.asarray(textura.convert("RGB")).astype(float)
    alto, ancho, _ = tex.shape

    def color(uv):
        return tex[np.clip((1 - uv[:, 1] % 1) * alto, 0, alto - 1).astype(int), np.clip((uv[:, 0] % 1) * ancho, 0, ancho - 1).astype(int)]

    # Se mira el centro y las tres esquinas de cada cara: basta con que la mitad sea verde.
    muestras = [color(UV[F].mean(axis=1))] + [color(UV[F[:, k]]) for k in range(3)]
    votos = sum(((c[:, 1] > c[:, 0] * 1.04) & (c[:, 1] > c[:, 2] * 1.2)).astype(int) for c in muestras)
    Y = P[F][:, :, 1]
    zona = es_hamburguesa(P[F].mean(axis=1)) > 0.5
    partes, tomadas = {}, np.zeros(len(F), bool)
    for nombre, (y0, y1) in ASENTAR["bandas"].items():
        caras = (Y.min(axis=1) >= y0) & (Y.max(axis=1) <= y1) & zona
        if nombre == "lechuga":  # las hojas se salen de la banda y se pegan a las papas: van todas, sin importar la zona
            caras |= (votos >= 2) & (Y.mean(axis=1) > y0 - 0.014) & (Y.mean(axis=1) < y1 + 0.014)
        partes[nombre] = caras & ~tomadas
        tomadas |= caras
    return partes


def compactar(P, F, *por_vertice):
    """Deja solo los vértices que usan las caras F."""
    usados = np.unique(F)
    mapa = np.full(len(P), -1); mapa[usados] = np.arange(len(usados))
    return (P[usados], mapa[F], *[a[usados] for a in por_vertice])


# ---------- GLB ----------
def leer_glb(ruta):
    datos = open(ruta, "rb").read()
    n = struct.unpack("<I", datos[12:16])[0]
    gltf = json.loads(datos[20:20 + n])
    return gltf, datos[20 + n + 8:]


def escribir_glb(ruta, nodos, imagenes, plato_color):
    """nodos: [(nombre, P, N, UV o None, F, material)]. imagenes: [color, normal, orm, paleta]. UV con la v desde arriba (glTF).
    Materiales: 0 plato, 1 comida escaneada, 2 relleno, 3 piezas dibujadas (paleta de capas.py)."""
    bin_, vistas, accesores, mallas, gnodos = bytearray(), [], [], [], []

    def vista(datos, destino=None):
        while len(bin_) % 4:
            bin_.append(0)
        v = {"buffer": 0, "byteOffset": len(bin_), "byteLength": len(datos)}
        if destino:
            v["target"] = destino
        bin_.extend(datos); vistas.append(v)
        return len(vistas) - 1

    def accesor(arr, tipo, comp, destino, limites=False):
        a = {"bufferView": vista(arr.tobytes(), destino), "componentType": comp, "count": len(arr), "type": tipo}
        if limites:
            a["min"], a["max"] = arr.min(0).tolist(), arr.max(0).tolist()
        accesores.append(a)
        return len(accesores) - 1

    for nombre, P, N, UV, F, material in nodos:
        atributos = {"POSITION": accesor(P.astype(np.float32), "VEC3", 5126, 34962, True), "NORMAL": accesor(N.astype(np.float32), "VEC3", 5126, 34962)}
        if UV is not None:
            atributos["TEXCOORD_0"] = accesor(UV.astype(np.float32), "VEC2", 5126, 34962)
        mallas.append({"name": nombre, "primitives": [{"attributes": atributos, "indices": accesor(F.astype(np.uint32).reshape(-1), "SCALAR", 5125, 34963), "material": material}]})
        gnodos.append({"name": nombre, "mesh": len(mallas) - 1})
    gltf = {
        "asset": {"version": "2.0", "generator": "chefi lechuga.py"},
        "scene": 0, "scenes": [{"name": "platillo", "nodes": list(range(len(gnodos)))}],
        "nodes": gnodos, "meshes": mallas,
        "images": [{"bufferView": vista(img), "mimeType": "image/png" if img[:4] == b"\x89PNG" else "image/jpeg"} for img in imagenes],
        "samplers": [{"magFilter": 9729, "minFilter": 9987}, {"magFilter": 9729, "minFilter": 9729, "wrapS": 33071, "wrapT": 33071}],
        "textures": [{"source": k, "sampler": 0} for k in range(3)] + [{"source": 3, "sampler": 1}],
        "materials": [
            {"name": "plato", "pbrMetallicRoughness": {"baseColorFactor": plato_color, "roughnessFactor": 0.25, "metallicFactor": 0}},
            {"name": "comida", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicRoughnessTexture": {"index": 2}}, "normalTexture": {"index": 1}},
            {"name": "relleno", "pbrMetallicRoughness": {"baseColorFactor": [0.07, 0.035, 0.02, 1], "roughnessFactor": 0.9, "metallicFactor": 0}},
            {"name": "dibujado", "pbrMetallicRoughness": {"baseColorTexture": {"index": 3}, "roughnessFactor": 0.4, "metallicFactor": 0}},
        ],
        "accessors": accesores, "bufferViews": vistas,
    }
    while len(bin_) % 4:
        bin_.append(0)
    gltf["buffers"] = [{"byteLength": len(bin_)}]
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    with open(ruta, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + 8 + len(bin_)))
        f.write(struct.pack("<I4s", len(js), b"JSON")); f.write(js)
        f.write(struct.pack("<I4s", len(bin_), b"BIN\0")); f.write(bin_)


def relleno(seg=40):
    """Cilindro oscuro escondido dentro de la hamburguesa: mientras la lechuga sale o entra, el hueco se ve
    como sombra y no deja ver el plato."""
    cx, cz = ASENTAR["centro"]
    alturas = [y for banda in ASENTAR["bandas"].values() for y in banda]
    r, y0, y1 = 0.047, min(alturas) - 0.008, max(alturas) + 0.006
    ang = np.linspace(0, 2 * np.pi, seg, endpoint=False)
    aro = np.stack([cx + r * np.cos(ang), np.zeros(seg), cz + r * np.sin(ang)], axis=1)
    P = np.concatenate([aro + [0, y0, 0], aro + [0, y1, 0]])
    N = np.tile(np.stack([np.cos(ang), np.zeros(seg), np.sin(ang)], axis=1), (2, 1))
    k = np.arange(seg); s = (k + 1) % seg
    F = np.concatenate([np.stack([k, k + seg, s], axis=1), np.stack([s, k + seg, s + seg], axis=1)])
    return ("relleno", P, N, None, F, 2)


def hacer_glb(destino):
    escena = trimesh.load(os.path.join(ORIGEN, "fuerte_hamburguesa.glb"))
    partes = {}
    for nodo in escena.graph.nodes_geometry:
        T, geo = escena.graph[nodo]
        m = escena.geometry[geo].copy(); m.apply_transform(T)
        partes["plato" if nodo == "plato" else "comida"] = m
    comida, plato = partes["comida"], partes["plato"]
    P, F, UV, N = np.asarray(comida.vertices), np.asarray(comida.faces), np.asarray(comida.visual.uv), np.asarray(comida.vertex_normals)
    partes = repartir(P, F, UV, comida.visual.material.baseColorTexture)
    print({nombre: int(caras.sum()) for nombre, caras in partes.items()}, "de", len(F))
    resto = ~np.logical_or.reduce(list(partes.values()))

    # Las texturas ya comprimidas del modelo publicado (mismo mapa UV que el original).
    gltf, bin_ = leer_glb(os.path.join(AQUI, "modelos/fuerte_hamburguesa.glb"))
    def imagen(indice_textura):
        v = gltf["bufferViews"][gltf["images"][gltf["textures"][indice_textura]["source"]]["bufferView"]]
        return bin_[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]
    mat = next(m for m in gltf["materials"] if "normalTexture" in m)
    imagenes = [imagen(mat["pbrMetallicRoughness"]["baseColorTexture"]["index"]), imagen(mat["normalTexture"]["index"]), imagen(mat["pbrMetallicRoughness"]["metallicRoughnessTexture"]["index"])]
    plato_color = next(m for m in gltf["materials"] if m["name"] == "plato")["pbrMetallicRoughness"]["baseColorFactor"]

    uv_gltf = UV * [1, -1] + [0, 1]  # trimesh mide la v desde abajo; glTF desde arriba
    nodos = [("plato", np.asarray(plato.vertices), np.asarray(plato.vertex_normals), None, np.asarray(plato.faces), 0), relleno()]
    for nombre, caras in [("cuerpo", F[resto])] + [(nombre, F[m]) for nombre, m in partes.items()]:
        p, f, n, uv = compactar(P, caras, N, uv_gltf)
        nodos.append((nombre, p, n, uv, f, 1))
    import capas
    for nombre, mallas in piezas_dibujadas().items():
        m = capas.unir(mallas)
        nodos.append((nombre, m.P, m.normales(), m.UV, m.F, 3))
    imagenes.append(capas.paleta_png())
    with tempfile.TemporaryDirectory() as tmp:
        crudo = os.path.join(tmp, "crudo.glb")
        escribir_glb(crudo, nodos, imagenes, plato_color)
        subprocess.run(["npx", "-y", "@gltf-transform/cli@4", "draco", crudo, destino], check=True, stdout=subprocess.DEVNULL)
    print(destino, os.path.getsize(destino) // 1024, "KB")


if __name__ == "__main__":
    os.makedirs(os.path.join(AQUI, "modelos/capas"), exist_ok=True)
    os.makedirs(os.path.join(AQUI, "modelos/variantes"), exist_ok=True)
    hacer_glb(os.path.join(AQUI, "modelos/capas/hamburguesa.glb"))
    # Los archivos de AR para iPhone los hace herramientas/ar_iphone.py.
