# Prepara los modelos 3D de cada variante de platillo para "Ver en mi mesa".
#
# Cada combinación de ingredientes tiene su propio modelo, hecho con IA (Higgsfield: la foto de la variante se
# edita con GPT Image y se convierte a 3D con Tripo H3.1). Tripo entrega un GLB enorme (≈1.4 M de triángulos,
# texturas de 2048 px, ≈45 MB) y sin escala. Este guion lo deja listo para el celular:
#   1. lo reduce (≈45 mil triángulos, texturas de 1024 px en JPEG),
#   2. lo pone a tamaño real, centrado y apoyado en el plato (plato de 27 cm),
#   3. agrega el plato blanco a los que se generaron sin plato (hamburguesa y pastel: Tripo deforma el plato
#      blanco, así que se generan sin él y se montan en el mismo plato de los modelos originales),
#   4. escribe modelos/variantes/<platillo>_<bits>.glb (Draco, para Android) y .usdz (para iPhone).
# Las variantes "de siempre" (hamburguesa_10, pasta_1, ensalada_1, pastel_0) son los modelos originales copiados.
#
# Uso (desde menu-web):  python herramientas/variantes.py <carpeta con los GLB crudos de Tripo> [nombre ...]
# Requiere: numpy, trimesh, pillow, usd-core y npx (@gltf-transform/cli).
# Después hay que revisar cada .usdz en la Mac:  herramientas/toca.swift (ver ese archivo).

import io, json, os, shutil, struct, subprocess, sys, tempfile
import numpy as np
import trimesh
from PIL import Image
from pxr import Usd, UsdGeom, UsdShade, UsdUtils, Sdf, Gf, Vt

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGINALES = os.path.join(AQUI, "..", "modelos3d", "final")
DESTINO = os.path.join(AQUI, "modelos", "variantes")
PLATO_Y = 0.006  # altura de la superficie del plato donde se apoya la comida

# nombre: (lado mayor real en metros, ¿agregar plato?, giro en grados alrededor del eje vertical)
# El lado mayor es el de los modelos originales: 21 cm la hamburguesa con sus papas, 15 cm la rebanada de pastel
# y 27 cm el plato completo en los que ya lo traen.
VARIANTES = {
    "hamburguesa_11": (0.21, True, 0),
    "hamburguesa_00": (0.21, True, 0),
    "hamburguesa_01": (0.21, True, 0),
    "pastel_1": (0.15, True, 270),  # Tripo lo entregó girado respecto al pastel original
    "pasta_0": (0.27, False, 0),
    "ensalada_0": (0.27, False, 0),
}
# Variantes que son el modelo original tal cual.
COPIAS = {"hamburguesa_10": "fuerte_hamburguesa", "pasta_1": "pasta_bolognesa", "ensalada_1": "ensalada", "pastel_0": "postre_pastel"}


def gltf_transform(*args):
    subprocess.run(["npx", "-y", "@gltf-transform/cli@4", *args], check=True, stdout=subprocess.DEVNULL)


def leer_glb(ruta):
    datos = open(ruta, "rb").read()
    largo = struct.unpack_from("<I", datos, 12)[0]
    return json.loads(datos[20:20 + largo]), datos[20 + largo:]


def escribir_glb(ruta, gltf, resto):
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    with open(ruta, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + len(resto)))
        f.write(struct.pack("<I4s", len(js), b"JSON"))
        f.write(js)
        f.write(resto)


def a_escala(entrada, salida, lado, con_plato, giro):
    """Pone el modelo a tamaño real, centrado y apoyado (en el plato o en el piso)."""
    gltf, resto = leer_glb(entrada)
    nodos = [n for n in gltf["nodes"] if "mesh" in n]
    assert len(nodos) == 1, "se esperaba una sola malla"
    nodo = nodos[0]
    assert not any(k in nodo for k in ("matrix", "rotation", "scale", "translation")), "la malla ya trae transformación"
    prims = gltf["meshes"][nodo["mesh"]]["primitives"]
    mins = np.min([gltf["accessors"][p["attributes"]["POSITION"]]["min"] for p in prims], axis=0)
    maxs = np.max([gltf["accessors"][p["attributes"]["POSITION"]]["max"] for p in prims], axis=0)
    s = lado / float((maxs - mins).max())
    a = np.radians(giro)
    centro = (mins + maxs) / 2
    # Con el giro, el centro (x, z) también gira.
    cx = centro[0] * np.cos(a) + centro[2] * np.sin(a)
    cz = -centro[0] * np.sin(a) + centro[2] * np.cos(a)
    piso = PLATO_Y if con_plato else 0.0
    nodo["scale"] = [s, s, s]
    nodo["rotation"] = [0.0, float(np.sin(a / 2)), 0.0, float(np.cos(a / 2))]
    nodo["translation"] = [float(-cx * s), float(piso - mins[1] * s), float(-cz * s)]
    nodo["name"] = "comida"
    escribir_glb(salida, gltf, resto)
    return float((maxs[1] - mins[1]) * s + piso)


def plato_glb(ruta):
    """El plato blanco de 27 cm de los modelos originales, como GLB aparte."""
    escena = trimesh.load(os.path.join(ORIGINALES, "fuerte_hamburguesa.glb"), force="scene")
    nombre = next(n for n in escena.graph.nodes_geometry if n == "plato")
    T, g = escena.graph[nombre]
    plato = escena.geometry[g].copy()
    plato.apply_transform(T)
    trimesh.Scene({"plato": plato}).export(ruta)


def jpg(imagen, lado=1024, calidad=86):
    b = io.BytesIO()
    imagen.convert("RGB").resize((lado, lado), Image.LANCZOS).save(b, "JPEG", quality=calidad)
    return b.getvalue()


def usdz(glb, ruta):
    """Escribe el USDZ para AR Quick Look a partir del GLB ya a escala (metros, eje Y hacia arriba)."""
    escena = trimesh.load(glb, force="scene")
    with tempfile.TemporaryDirectory() as tmp:
        stage = Usd.Stage.CreateNew(os.path.join(tmp, "model.usdc"))
        UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y)
        UsdGeom.SetStageMetersPerUnit(stage, 1.0)
        stage.SetDefaultPrim(UsdGeom.Xform.Define(stage, "/Root").GetPrim())
        for k, nombre in enumerate(escena.graph.nodes_geometry):
            T, g = escena.graph[nombre]
            m = escena.geometry[g].copy()
            m.apply_transform(T)
            P, F, N = np.asarray(m.vertices, np.float32), np.asarray(m.faces, np.int32), np.asarray(m.vertex_normals, np.float32)
            malla = UsdGeom.Mesh.Define(stage, f"/Root/Pieza_{k}")
            malla.CreatePointsAttr(Vt.Vec3fArray.FromNumpy(P))
            malla.CreateFaceVertexCountsAttr([3] * len(F))
            malla.CreateFaceVertexIndicesAttr(Vt.IntArray.FromNumpy(F.reshape(-1)))
            malla.CreateNormalsAttr(Vt.Vec3fArray.FromNumpy(N))
            malla.SetNormalsInterpolation("vertex")
            malla.CreateSubdivisionSchemeAttr("none")
            malla.CreateExtentAttr([Gf.Vec3f(*P.min(0).tolist()), Gf.Vec3f(*P.max(0).tolist())])
            mat = UsdShade.Material.Define(stage, f"/Root/Materiales/Material_{k}")
            sup = UsdShade.Shader.Define(stage, f"/Root/Materiales/Material_{k}/Superficie")
            sup.CreateIdAttr("UsdPreviewSurface")
            sup.CreateInput("metallic", Sdf.ValueTypeNames.Float).Set(0.0)
            pbr = m.visual.material
            color = getattr(pbr, "baseColorTexture", None)
            uv = getattr(m.visual, "uv", None)
            if color is None or uv is None:
                # Plato: blanco liso y brillante, como en los modelos originales.
                sup.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0.96, 0.96, 0.95))
                sup.CreateInput("roughness", Sdf.ValueTypeNames.Float).Set(0.25)
            else:
                st = np.asarray(uv, np.float32)
                UsdGeom.PrimvarsAPI(malla).CreatePrimvar("st", Sdf.ValueTypeNames.TexCoord2fArray, "vertex").Set(Vt.Vec2fArray.FromNumpy(st))
                lector = UsdShade.Shader.Define(stage, f"/Root/Materiales/Material_{k}/Lector")
                lector.CreateIdAttr("UsdPrimvarReader_float2")
                lector.CreateInput("varname", Sdf.ValueTypeNames.Token).Set("st")

                def textura(sufijo, imagen, espacio):
                    archivo = f"t{k}_{sufijo}.jpg"
                    open(os.path.join(tmp, archivo), "wb").write(jpg(imagen))
                    t = UsdShade.Shader.Define(stage, f"/Root/Materiales/Material_{k}/Textura_{sufijo}")
                    t.CreateIdAttr("UsdUVTexture")
                    t.CreateInput("file", Sdf.ValueTypeNames.Asset).Set(archivo)
                    t.CreateInput("sourceColorSpace", Sdf.ValueTypeNames.Token).Set(espacio)
                    t.CreateInput("wrapS", Sdf.ValueTypeNames.Token).Set("repeat")
                    t.CreateInput("wrapT", Sdf.ValueTypeNames.Token).Set("repeat")
                    t.CreateInput("st", Sdf.ValueTypeNames.Float2).ConnectToSource(lector.ConnectableAPI(), "result")
                    return t

                t = textura("color", color, "sRGB")
                t.CreateOutput("rgb", Sdf.ValueTypeNames.Float3)
                sup.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).ConnectToSource(t.ConnectableAPI(), "rgb")
                orm = getattr(pbr, "metallicRoughnessTexture", None)
                if orm is not None:
                    t = textura("rugosidad", orm, "raw")
                    t.CreateOutput("g", Sdf.ValueTypeNames.Float)  # glTF guarda la rugosidad en el canal verde
                    sup.CreateInput("roughness", Sdf.ValueTypeNames.Float).ConnectToSource(t.ConnectableAPI(), "g")
                else:
                    sup.CreateInput("roughness", Sdf.ValueTypeNames.Float).Set(0.6)
                normal = getattr(pbr, "normalTexture", None)
                if normal is not None:
                    t = textura("normal", normal, "raw")
                    t.CreateInput("scale", Sdf.ValueTypeNames.Float4).Set(Gf.Vec4f(2, 2, 2, 1))
                    t.CreateInput("bias", Sdf.ValueTypeNames.Float4).Set(Gf.Vec4f(-1, -1, -1, 0))
                    t.CreateOutput("rgb", Sdf.ValueTypeNames.Float3)
                    sup.CreateInput("normal", Sdf.ValueTypeNames.Normal3f).ConnectToSource(t.ConnectableAPI(), "rgb")
            mat.CreateSurfaceOutput().ConnectToSource(sup.ConnectableAPI(), "surface")
            UsdShade.MaterialBindingAPI.Apply(malla.GetPrim()).Bind(mat)
        stage.GetRootLayer().Save()
        if os.path.exists(ruta):
            os.unlink(ruta)
        assert UsdUtils.CreateNewARKitUsdzPackage(Sdf.AssetPath(os.path.join(tmp, "model.usdc")), ruta)


def main():
    crudos = sys.argv[1]
    cuales = sys.argv[2:] or list(VARIANTES)
    os.makedirs(DESTINO, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        plato = os.path.join(tmp, "plato.glb")
        plato_glb(plato)
        for nombre in cuales:
            lado, con_plato, giro = VARIANTES[nombre]
            t = lambda paso: os.path.join(tmp, f"{nombre}_{paso}.glb")
            gltf_transform("optimize", os.path.join(crudos, nombre + ".glb"), t(1), "--compress", "false", "--texture-compress", "false",
                           "--simplify-ratio", "0.031", "--simplify-error", "0.01")
            gltf_transform("resize", t(1), t(2), "--width", "1024", "--height", "1024")
            alto = a_escala(t(2), t(3), lado, con_plato, giro)
            if con_plato:
                gltf_transform("merge", t(3), plato, t(4), "--merge-scenes")
            else:
                shutil.copy(t(3), t(4))
            gltf_transform("jpeg", t(4), t(5), "--quality", "86", "--formats", "*")
            gltf_transform("draco", t(5), os.path.join(DESTINO, nombre + ".glb"))
            usdz(t(4), os.path.join(DESTINO, nombre + ".usdz"))
            pesos = [os.path.getsize(os.path.join(DESTINO, nombre + e)) // 1024 for e in (".glb", ".usdz")]
            print(f"{nombre}: alto {alto * 100:.1f} cm · glb {pesos[0]} KB · usdz {pesos[1]} KB")
    for nombre, original in COPIAS.items():
        for ext in (".glb", ".usdz"):
            shutil.copy(os.path.join(AQUI, "modelos", original + ext), os.path.join(DESTINO, nombre + ext))
    print("copias de los modelos originales:", ", ".join(COPIAS))


if __name__ == "__main__":
    main()
