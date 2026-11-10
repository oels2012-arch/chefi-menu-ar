"""Hamburguesa escaneada (la realista de siempre) con la lechuga separable.

No se redibuja nada: del modelo original se apartan las caras de la lechuga en su propio nodo y el resto queda igual.
Al quitar la lechuga, la parte de arriba de la hamburguesa "se asienta" sobre el pan de abajo (las papas no se mueven).

Salidas:
- modelos/capas/hamburguesa.glb          nodos: plato, cuerpo (todo menos la lechuga) y lechuga. El visor (js/mesa.js)
                                          esconde la lechuga y asienta el cuerpo con la misma regla que `asentar()`.
- modelos/variantes/hamburguesa_0.usdz   la misma hamburguesa ya sin lechuga, para AR Quick Look (iPhone).
  (con lechuga se usa el USDZ de siempre: modelos/fuerte_hamburguesa.usdz)

Uso, desde menu-web:  python herramientas/lechuga.py ../modelos3d/final
Requiere: numpy, pillow, trimesh, usd-core y npx (gltf-transform para comprimir con Draco).
"""
import io, json, os, struct, subprocess, sys, tempfile, zipfile

import numpy as np
import trimesh
from PIL import Image
from pxr import Sdf, Usd, UsdGeom, UsdUtils, Vt

ORIGEN = sys.argv[1] if len(sys.argv) > 1 else "../modelos3d/final"
AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Medidas de la hamburguesa dentro del platillo, en metros. Las mismas van en js/datos.js (personalizar.asentar).
ASENTAR = {
    "centro": [0.006, 0.040],  # eje de la hamburguesa (x, z); las papas quedan atrás (z negativa)
    "radio": [0.058, 0.066],   # atrás, lo que pasa de este radio ya son papas y no se mueve
    "frente": [-0.012, 0.0],   # de esta z hacia el frente todo es hamburguesa (tocino y aros que sobresalen)
    "banda": [0.029, 0.042],   # alturas entre las que vive la lechuga
    "baja": 0.013,             # cuánto baja lo de arriba al quitarla (el alto de la banda: el hueco se cierra)
}


def escalon(a, b, x):
    return np.clip((x - a) / (b - a), 0, 1)


def suave(a, b, x):
    t = escalon(a, b, x)
    return t * t * (3 - 2 * t)


def es_hamburguesa(P):
    """1 en la hamburguesa, 0 en las papas."""
    a = ASENTAR
    r = np.hypot(P[:, 0] - a["centro"][0], P[:, 2] - a["centro"][1])
    return np.maximum(1 - suave(*a["radio"], r), suave(*a["frente"], P[:, 2]))


def asentar(P, cuanto=1.0):
    """Baja la parte de arriba de la hamburguesa. P en metros, en coordenadas del platillo."""
    Q = P.copy()
    Q[:, 1] -= ASENTAR["baja"] * cuanto * es_hamburguesa(P) * escalon(*ASENTAR["banda"], P[:, 1])
    return Q


def caras_de_lechuga(P, F, UV, textura):
    """Caras que se van con la lechuga: las verdes y las que viven enteras dentro de su banda (la sombra de atrás,
    que al asentar quedaría aplastada). UV con la v medida desde abajo."""
    tex = np.asarray(textura.convert("RGB")).astype(float)
    alto, ancho, _ = tex.shape

    def color(uv):
        return tex[np.clip((1 - uv[:, 1] % 1) * alto, 0, alto - 1).astype(int), np.clip((uv[:, 0] % 1) * ancho, 0, ancho - 1).astype(int)]

    # Se mira el centro y las tres esquinas de cada cara: basta con que la mayoría sea verde.
    muestras = [color(UV[F].mean(axis=1))] + [color(UV[F[:, k]]) for k in range(3)]
    votos = sum(((c[:, 1] > c[:, 0] * 1.04) & (c[:, 1] > c[:, 2] * 1.2)).astype(int) for c in muestras)
    Y = P[F][:, :, 1]
    banda = ASENTAR["banda"]
    verdes = (votos >= 2) & (Y.mean(axis=1) > banda[0] - 0.006) & (Y.mean(axis=1) < banda[1] + 0.006)
    dentro = (Y.min(axis=1) >= banda[0]) & (Y.max(axis=1) <= banda[1])
    return (verdes | dentro) & (es_hamburguesa(P[F].mean(axis=1)) > 0.5)


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
    """nodos: [(nombre, P, N, UV o None, F, material)]. imagenes: [color, normal, orm] en JPEG. UV con la v desde arriba (glTF)."""
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
        "images": [{"bufferView": vista(img), "mimeType": "image/jpeg"} for img in imagenes],
        "samplers": [{"magFilter": 9729, "minFilter": 9987}],
        "textures": [{"source": k, "sampler": 0} for k in range(3)],
        "materials": [
            {"name": "plato", "pbrMetallicRoughness": {"baseColorFactor": plato_color, "roughnessFactor": 0.25, "metallicFactor": 0}},
            {"name": "comida", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicRoughnessTexture": {"index": 2}}, "normalTexture": {"index": 1}},
            {"name": "relleno", "pbrMetallicRoughness": {"baseColorFactor": [0.07, 0.035, 0.02, 1], "roughnessFactor": 0.9, "metallicFactor": 0}},
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
    r, y0, y1 = 0.047, ASENTAR["banda"][0] - 0.008, ASENTAR["banda"][1] + 0.006
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
    verdes = caras_de_lechuga(P, F, UV, comida.visual.material.baseColorTexture)
    print(f"lechuga: {verdes.sum()} caras de {len(F)}")

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
    for nombre, caras in (("cuerpo", F[~verdes]), ("lechuga", F[verdes])):
        p, f, n, uv = compactar(P, caras, N, uv_gltf)
        nodos.append((nombre, p, n, uv, f, 1))
    with tempfile.TemporaryDirectory() as tmp:
        crudo = os.path.join(tmp, "crudo.glb")
        escribir_glb(crudo, nodos, imagenes, plato_color)
        subprocess.run(["npx", "-y", "@gltf-transform/cli@4", "draco", crudo, destino], check=True, stdout=subprocess.DEVNULL)
    print(destino, os.path.getsize(destino) // 1024, "KB")


# ---------- USDZ ----------
def hacer_usdz(base, destino):
    """Copia el USDZ de siempre y le quita la lechuga a la malla de la comida."""
    with tempfile.TemporaryDirectory() as tmp:
        zipfile.ZipFile(base).extractall(tmp)
        stage = Usd.Stage.Open(os.path.join(tmp, "model.usdc"))
        for prim in stage.Traverse():
            if not prim.IsA(UsdGeom.Mesh):
                continue
            st = UsdGeom.PrimvarsAPI(prim).GetPrimvar("st")
            if not st or not st.HasValue():
                continue  # el plato no tiene textura
            malla = UsdGeom.Mesh(prim)
            M = np.array(UsdGeom.Xformable(prim).ComputeLocalToWorldTransform(Usd.TimeCode.Default()))  # vector fila
            local = np.array(malla.GetPointsAttr().Get(), dtype=float)
            P = local @ M[:3, :3] + M[3, :3]
            F = np.array(malla.GetFaceVertexIndicesAttr().Get()).reshape(-1, 3)
            UV = np.array(st.Get(), dtype=float)
            archivo = next(str(a.Get().path) for s in stage.Traverse() for a in s.GetAttributes() if a.GetName() == "inputs:file" and "diffuse" in s.GetName())
            verdes = caras_de_lechuga(P, F, UV, Image.open(os.path.join(tmp, archivo)))
            print(f"usdz: {verdes.sum()} caras de lechuga de {len(F)}")
            nuevo = (asentar(P) - M[3, :3]) @ np.linalg.inv(M[:3, :3])
            malla.GetPointsAttr().Set(Vt.Vec3fArray.FromNumpy(nuevo.astype(np.float32)))
            F = F[~verdes]
            malla.GetFaceVertexIndicesAttr().Set(Vt.IntArray.FromNumpy(F.reshape(-1).astype(np.int32)))
            malla.GetFaceVertexCountsAttr().Set(Vt.IntArray.FromNumpy(np.full(len(F), 3, dtype=np.int32)))
            normales = malla.GetNormalsAttr()
            if normales.HasValue() and malla.GetNormalsInterpolation() != "vertex":
                normales.Clear()  # venían por cara: ya no corresponden
        os.rename(os.path.join(tmp, "model.usdc"), os.path.join(tmp, "previo.usdc"))
        stage.GetRootLayer().Export(os.path.join(tmp, "model.usdc"))  # exportar compacta el archivo
        os.remove(os.path.join(tmp, "previo.usdc"))
        UsdUtils.CreateNewARKitUsdzPackage(Sdf.AssetPath(os.path.join(tmp, "model.usdc")), destino)
    print(destino, os.path.getsize(destino) // 1024, "KB")


if __name__ == "__main__":
    os.makedirs(os.path.join(AQUI, "modelos/capas"), exist_ok=True)
    os.makedirs(os.path.join(AQUI, "modelos/variantes"), exist_ok=True)
    hacer_glb(os.path.join(AQUI, "modelos/capas/hamburguesa.glb"))
    hacer_usdz(os.path.join(AQUI, "modelos/fuerte_hamburguesa.usdz"), os.path.join(AQUI, "modelos/variantes/hamburguesa_0.usdz"))
