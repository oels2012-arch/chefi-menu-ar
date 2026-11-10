"""Archivos de realidad aumentada para iPhone (AR Quick Look) con botones DENTRO de la cámara.

La cámara de Apple no deja poner botones de la página, pero sí objetos 3D que reaccionan al toque
(esquemas Preliminary_Behavior / Preliminary_Trigger / Preliminary_Action de USDZ:
https://developer.apple.com/documentation/usd/actions-and-triggers). Aquí cada ingrediente tiene, frente al
plato, una placa 3D ("Con lechuga" / "Sin lechuga"). Al tocarla, el ingrediente se encoge hasta desaparecer o
vuelve a crecer, y lo que tiene encima baja o sube.

Todo el estado son transformaciones (nada de "visible / invisible"): cada pieza y cada placa tiene dos posturas,
"puesta" y "guardada" (encogida a casi nada), y cada toque las anima a una postura absoluta. Así, tocar dos veces
no descompone nada y el archivo puede arrancar en cualquier combinación.

Salida: modelos/variantes/<platillo>_<bits>.usdz, una por combinación inicial (la que se eligió en la página).

Uso, desde menu-web:  python herramientas/ar_iphone.py ../modelos3d/final
Requiere lo mismo que capas.py y lechuga.py.
"""
import io, itertools, os, sys, tempfile, zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from pxr import Gf, Sdf, Usd, UsdGeom, UsdShade, UsdUtils, Vt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import capas, lechuga  # noqa: E402

AQUI = capas.AQUI
FUENTE = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"
NARANJA, VERDE, CARBON, CREMA, GRIS = "#F26B1D", "#2E9E6A", "#1F1F1F", "#FFF6EC", "#8B7F75"
MINI = 0.001  # escala de lo "guardado"

# Placas: tamaño en metros y dónde van (frente al plato, recostadas hacia quien mira).
PLACA_ANCHO, PLACA_ALTO, PLACA_Z, PLACA_Y, PLACA_INCLINA = 0.112, 0.036, 0.185, 0.024, np.radians(38)


# ---------- Dibujo de las placas ----------
def dibujar_placas(textos):
    """textos: [(texto puesto, texto quitado)]. Devuelve el PNG con todas las placas, una por renglón (puesto, quitado)."""
    ancho, alto = 560, 180
    img = Image.new("RGB", (ancho, alto * len(textos) * 2), CREMA)
    d = ImageDraw.Draw(img)
    for k, par in enumerate(textos):
        for j, texto in enumerate(par):
            puesto = j == 0
            y0 = (k * 2 + j) * alto
            d.rectangle([0, y0, ancho, y0 + alto], fill="#FFFFFF" if puesto else CREMA)
            # marca: palomita verde (puesto) o signo de más naranja (quitado)
            cx, cy, r = ancho - 92, y0 + alto // 2, 46
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=VERDE if puesto else NARANJA)
            if puesto:
                d.line([cx - 21, cy + 1, cx - 6, cy + 17, cx + 22, cy - 16], fill="#FFFFFF", width=10, joint="curve")
            else:
                d.line([cx - 22, cy, cx + 22, cy], fill="#FFFFFF", width=10)
                d.line([cx, cy - 22, cx, cy + 22], fill="#FFFFFF", width=10)
            tam = 58
            while True:
                fuente = ImageFont.truetype(FUENTE, tam)
                if d.textlength(texto, font=fuente) <= ancho - 92 - r - 70 or tam <= 30:
                    break
                tam -= 2
            d.text((48, y0 + alto // 2), texto, font=fuente, fill=CARBON if puesto else GRIS, anchor="lm")
    b = io.BytesIO(); img.save(b, "PNG")
    return b.getvalue()


def malla_placa(renglon, renglones, borde=False):
    """Placa con puntas redondas, centrada en el origen, de pie mirando a +z. UV hacia su renglón del dibujo."""
    w, h = PLACA_ANCHO / 2, PLACA_ALTO / 2
    if borde:
        w, h = w + 0.0022, h + 0.0022
    pts = []
    for cx, a0 in ((w - h, -np.pi / 2), (-(w - h), np.pi / 2)):
        for a in np.linspace(a0, a0 + np.pi, 14):
            pts.append([cx + h * np.cos(a), h * np.sin(a)])
    pts = np.array(pts)
    P = np.concatenate([[[0, 0, 0]], np.column_stack([pts, np.zeros(len(pts))])])
    n = len(pts)
    F = np.array([[0, 1 + i, 1 + (i + 1) % n] for i in range(n)])
    u = 0.5 + P[:, 0] / PLACA_ANCHO
    v = 0.5 + P[:, 1] / PLACA_ALTO  # 0 abajo, 1 arriba, dentro de su renglón
    st = np.column_stack([np.clip(u, 0.01, 0.99), 1 - (renglon + 1 - np.clip(v, 0.02, 0.98)) / renglones])
    return P, F, st


# ---------- USD ----------
def matriz(traslada=(0, 0, 0), escala=1.0, centro=(0, 0, 0), gira_x=0.0):
    """Escala alrededor de `centro`, gira sobre x y traslada. Convención de USD (vector fila)."""
    c = Gf.Vec3d(*map(float, centro))
    m = Gf.Matrix4d().SetTranslate(-c) * Gf.Matrix4d().SetScale(float(escala)) * Gf.Matrix4d().SetRotate(Gf.Rotation(Gf.Vec3d(1, 0, 0), float(np.degrees(gira_x)))) * Gf.Matrix4d().SetTranslate(c)
    return m * Gf.Matrix4d().SetTranslate(Gf.Vec3d(*map(float, traslada)))


def xform(stage, ruta, m=None):
    x = UsdGeom.Xform.Define(stage, ruta)
    x.AddTransformOp().Set(m if m is not None else Gf.Matrix4d(1.0))
    return x


def malla(stage, ruta, P, F, st=None, material=None, doble=False):
    m = UsdGeom.Mesh.Define(stage, ruta)
    m.CreatePointsAttr(Vt.Vec3fArray.FromNumpy(np.asarray(P, np.float32)))
    m.CreateFaceVertexCountsAttr(Vt.IntArray.FromNumpy(np.full(len(F), 3, np.int32)))
    m.CreateFaceVertexIndicesAttr(Vt.IntArray.FromNumpy(np.asarray(F, np.int32).reshape(-1)))
    m.CreateSubdivisionSchemeAttr("none")
    m.CreateDoubleSidedAttr(doble)
    m.CreateExtentAttr([Gf.Vec3f(*map(float, np.min(P, 0))), Gf.Vec3f(*map(float, np.max(P, 0)))])
    if st is not None:
        UsdGeom.PrimvarsAPI(m).CreatePrimvar("st", Sdf.ValueTypeNames.TexCoord2fArray, "vertex").Set(Vt.Vec2fArray.FromNumpy(np.asarray(st, np.float32)))
    if material is not None:
        UsdShade.MaterialBindingAPI.Apply(m.GetPrim()).Bind(material)
    return m


def material_color(stage, ruta, color, rugosidad=0.8):
    mat = UsdShade.Material.Define(stage, ruta)
    sup = UsdShade.Shader.Define(stage, ruta + "/Superficie")
    sup.CreateIdAttr("UsdPreviewSurface")
    sup.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(*color))
    sup.CreateInput("roughness", Sdf.ValueTypeNames.Float).Set(rugosidad)
    sup.CreateInput("metallic", Sdf.ValueTypeNames.Float).Set(0.0)
    mat.CreateSurfaceOutput().ConnectToSource(sup.ConnectableAPI(), "surface")
    return mat


def material_imagen(stage, ruta, archivo):
    mat = UsdShade.Material.Define(stage, ruta)
    sup = UsdShade.Shader.Define(stage, ruta + "/Superficie")
    sup.CreateIdAttr("UsdPreviewSurface")
    sup.CreateInput("roughness", Sdf.ValueTypeNames.Float).Set(0.9)
    sup.CreateInput("metallic", Sdf.ValueTypeNames.Float).Set(0.0)
    lector = UsdShade.Shader.Define(stage, ruta + "/Lector")
    lector.CreateIdAttr("UsdPrimvarReader_float2")
    lector.CreateInput("varname", Sdf.ValueTypeNames.Token).Set("st")
    lector.CreateOutput("result", Sdf.ValueTypeNames.Float2)
    tex = UsdShade.Shader.Define(stage, ruta + "/Imagen")
    tex.CreateIdAttr("UsdUVTexture")
    tex.CreateInput("file", Sdf.ValueTypeNames.Asset).Set(archivo)
    tex.CreateInput("wrapS", Sdf.ValueTypeNames.Token).Set("clamp")
    tex.CreateInput("wrapT", Sdf.ValueTypeNames.Token).Set("clamp")
    tex.CreateInput("st", Sdf.ValueTypeNames.Float2).ConnectToSource(lector.ConnectableAPI(), "result")
    tex.CreateOutput("rgb", Sdf.ValueTypeNames.Float3)
    sup.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).ConnectToSource(tex.ConnectableAPI(), "rgb")
    mat.CreateSurfaceOutput().ConnectToSource(sup.ConnectableAPI(), "surface")
    return mat


class Comportamientos:
    """Escribe los Preliminary_Behavior: al tocar `boton`, anima cada objeto a la postura de su destino."""

    def __init__(self, stage, raiz):
        self.stage, self.raiz, self.n = stage, raiz, 0
        UsdGeom.Scope.Define(stage, raiz)

    def al_tocar(self, boton, movimientos):
        """movimientos: [(ruta del objeto, ruta del destino, segundos)]"""
        self.n += 1
        base = f"{self.raiz}/Toque{self.n}"
        b = self.stage.DefinePrim(base, "Preliminary_Behavior")
        b.CreateAttribute("exclusive", Sdf.ValueTypeNames.Bool, variability=Sdf.VariabilityUniform).Set(False)
        t = self.stage.DefinePrim(base + "/Toque", "Preliminary_Trigger")
        t.CreateAttribute("info:id", Sdf.ValueTypeNames.Token, variability=Sdf.VariabilityUniform).Set("TapGesture")
        t.CreateRelationship("affectedObjects").SetTargets([Sdf.Path(boton)])
        g = self.stage.DefinePrim(base + "/Grupo", "Preliminary_Action")
        g.CreateAttribute("info:id", Sdf.ValueTypeNames.Token, variability=Sdf.VariabilityUniform).Set("Group")
        g.CreateAttribute("type", Sdf.ValueTypeNames.Token, variability=Sdf.VariabilityUniform).Set("parallel")
        g.CreateAttribute("loops", Sdf.ValueTypeNames.Bool, variability=Sdf.VariabilityUniform).Set(False)
        g.CreateAttribute("performCount", Sdf.ValueTypeNames.UInt, variability=Sdf.VariabilityUniform).Set(1)
        acciones = []
        for k, (objeto, destino, segundos) in enumerate(movimientos):
            a = self.stage.DefinePrim(f"{base}/Grupo/Mueve{k}", "Preliminary_Action")
            a.CreateAttribute("info:id", Sdf.ValueTypeNames.Token, variability=Sdf.VariabilityUniform).Set("Transform")
            a.CreateAttribute("type", Sdf.ValueTypeNames.Token, variability=Sdf.VariabilityUniform).Set("absolute")
            a.CreateAttribute("duration", Sdf.ValueTypeNames.Double, variability=Sdf.VariabilityUniform).Set(float(segundos))
            a.CreateAttribute("easeType", Sdf.ValueTypeNames.Token, variability=Sdf.VariabilityUniform).Set("inout")
            a.CreateAttribute("multiplePerformOperation", Sdf.ValueTypeNames.Token, variability=Sdf.VariabilityUniform).Set("allow")
            a.CreateRelationship("affectedObjects").SetTargets([Sdf.Path(objeto)])
            a.CreateRelationship("xformTarget").SetTargets([Sdf.Path(destino)])
            acciones.append(a.GetPath())
        g.CreateRelationship("actions").SetTargets(acciones)
        b.CreateRelationship("triggers").SetTargets([t.GetPath()])
        b.CreateRelationship("actions").SetTargets([g.GetPath()])


def con_dos_posturas(stage, ruta, puesta, guardada, inicia_puesta):
    """Xform `ruta` con sus dos destinos hermanos (ruta_Puesta y ruta_Guardada). Devuelve las tres rutas."""
    xform(stage, ruta, puesta if inicia_puesta else guardada)
    xform(stage, ruta + "_Puesta", puesta)
    xform(stage, ruta + "_Guardada", guardada)
    return ruta, ruta + "_Puesta", ruta + "_Guardada"


def escena(stage):
    """Donde vive el platillo dentro del archivo (el ancla de la escena, si la hay)."""
    return "/Root/Scenes/Scene" if stage.GetPrimAtPath("/Root/Scenes/Scene") else "/Root"


def interactivo(stage, opciones, estado, png_nombre):
    """opciones: [{id, puesto, quitado, pieza: ruta Xform, centro, sube: (ruta Xform, metros) o None}]
    Las piezas ya existen como Xform sin transformación; aquí se les ponen posturas, placas y toques."""
    raiz = escena(stage) + "/Chefi"
    UsdGeom.Xform.Define(stage, raiz)
    mat_placa = material_imagen(stage, raiz + "/MatPlacas", png_nombre)
    mat_borde = material_color(stage, raiz + "/MatBorde", (0.12, 0.12, 0.12))
    toques = Comportamientos(stage, raiz + "/Toques")
    n = len(opciones)
    for k, (op, puesto) in enumerate(zip(opciones, estado)):
        # La pieza: puesta (tal cual) o guardada (encogida hacia su centro, dentro del platillo).
        prim = stage.GetPrimAtPath(op["pieza"])
        UsdGeom.Xformable(prim).ClearXformOpOrder()
        pieza = con_dos_posturas(stage, op["pieza"], Gf.Matrix4d(1.0), matriz(escala=MINI, centro=op["centro"]), puesto)
        mover = []
        if op.get("sube"):
            ruta, metros = op["sube"]
            UsdGeom.Xformable(stage.GetPrimAtPath(ruta)).ClearXformOpOrder()
            sube = con_dos_posturas(stage, ruta, Gf.Matrix4d(1.0), matriz(traslada=(0, -metros, 0)), puesto)
            mover = [sube]
        # Las dos placas, en el mismo lugar: una dice que está puesto y la otra que no. La que no toca se guarda.
        x = (k - (n - 1) / 2) * (PLACA_ANCHO + 0.012)
        lugar = matriz(traslada=(x, PLACA_Y, PLACA_Z), gira_x=-PLACA_INCLINA)
        guardada = matriz(escala=MINI) * lugar
        placas = []
        for j, nombre in enumerate(("Puesto", "Quitado")):
            ruta = f"{raiz}/Placa_{op['id']}_{nombre}"
            visible = puesto if j == 0 else not puesto
            placas.append(con_dos_posturas(stage, ruta, lugar, guardada, visible))
            P, F, st = malla_placa(k * 2 + j, n * 2)
            malla(stage, ruta + "/Cara", P + [0, 0, 0.0006], F, st, mat_placa, doble=True)
            Pb, Fb, _ = malla_placa(0, 1, borde=True)
            malla(stage, ruta + "/Borde", Pb, Fb, None, mat_borde, doble=True)
        (p_on, p_on_puesta, p_on_guardada), (p_off, p_off_puesta, p_off_guardada) = placas
        # Tocar "Con ...": quitar.   Tocar "Sin ..." / "Agregar ...": poner.
        toques.al_tocar(p_on, [(pieza[0], pieza[2], 0.45)] + [(s[0], s[2], 0.5) for s in mover] + [(p_on, p_on_guardada, 0.18), (p_off, p_off_puesta, 0.18)])
        toques.al_tocar(p_off, [(pieza[0], pieza[1], 0.45)] + [(s[0], s[1], 0.4) for s in mover] + [(p_off, p_off_guardada, 0.18), (p_on, p_on_puesta, 0.18)])


def empacar(tmp, stage, destino):
    # Exportar a un archivo nuevo lo deja compacto (guardar sobre el mismo conserva lo borrado).
    limpio = os.path.join(tmp, "limpio")
    os.makedirs(limpio)
    stage.GetRootLayer().Export(os.path.join(limpio, "model.usdc"))
    for nombre in os.listdir(tmp):
        if nombre not in ("limpio", "model.usdc"):
            os.rename(os.path.join(tmp, nombre), os.path.join(limpio, nombre))
    UsdUtils.CreateNewARKitUsdzPackage(Sdf.AssetPath(os.path.join(limpio, "model.usdc")), destino)
    print(os.path.basename(destino), os.path.getsize(destino) // 1024, "KB")


def combinaciones(n):
    return [tuple(b == "1" for b in bits) for bits in map("".join, itertools.product("01", repeat=n))]


def nombre_bits(estado):
    return "".join("1" if e else "0" for e in estado)


# ---------- Hamburguesa: el modelo escaneado partido en piezas rígidas ----------
def hamburguesa(destino_dir):
    bandas = lechuga.ASENTAR["bandas"]
    textos = [("Con lechuga", "Sin lechuga"), ("Doble carne", "Carne sencilla")]
    png = dibujar_placas(textos)
    for estado in combinaciones(2):
        with tempfile.TemporaryDirectory() as tmp:
            zipfile.ZipFile(os.path.join(AQUI, "modelos/fuerte_hamburguesa.usdz")).extractall(tmp)
            open(os.path.join(tmp, "placas.png"), "wb").write(png)
            stage = Usd.Stage.Open(os.path.join(tmp, "model.usdc"))
            original = next(p for p in stage.Traverse() if p.IsA(UsdGeom.Mesh) and UsdGeom.PrimvarsAPI(p).GetPrimvar("st").HasValue())
            m = UsdGeom.Mesh(original)
            M = np.array(UsdGeom.Xformable(original).ComputeLocalToWorldTransform(Usd.TimeCode.Default()))
            P = np.array(m.GetPointsAttr().Get(), dtype=float) @ M[:3, :3] + M[3, :3]
            F = np.array(m.GetFaceVertexIndicesAttr().Get()).reshape(-1, 3)
            UV = np.array(UsdGeom.PrimvarsAPI(original).GetPrimvar("st").Get(), dtype=float)
            material = UsdShade.MaterialBindingAPI(original).ComputeBoundMaterial()[0]
            archivo = next(str(a.Get().path) for s in stage.Traverse() for a in s.GetAttributes() if a.GetName() == "inputs:file" and "diffuse" in s.GetName())
            partes = lechuga.repartir(P, F, UV, Image.open(os.path.join(tmp, archivo)))

            # A qué pieza va cada cara: las de un ingrediente con él; del resto, según su altura dentro de la hamburguesa.
            centro_cara = P[F].mean(axis=1)
            zona = lechuga.es_hamburguesa(centro_cara) > 0.5
            y = centro_cara[:, 1]
            suelto = partes["lechuga"] | partes["carne"]
            grupos = {
                "Lechuga": partes["lechuga"],
                "Carne": partes["carne"] | (~suelto & zona & (y >= bandas["carne"][0]) & (y < bandas["carne"][1])),
                "Arriba": ~suelto & zona & (y >= bandas["carne"][1]),
            }
            grupos["Medio"] = ~suelto & zona & (y >= bandas["lechuga"][0]) & (y < bandas["carne"][0])
            grupos["Base"] = ~np.logical_or.reduce(list(grupos.values()))

            # Árbol: lo de arriba de la lechuga cuelga de SobreLechuga; lo de arriba de la carne, de SobreCarne.
            raiz = escena(stage) + "/Hamburguesa"
            UsdGeom.Xform.Define(stage, raiz)
            rutas = {
                "Base": f"{raiz}/Base", "Lechuga": f"{raiz}/Lechuga", "Medio": f"{raiz}/SobreLechuga/Medio",
                "Carne": f"{raiz}/SobreLechuga/Carne", "Arriba": f"{raiz}/SobreLechuga/SobreCarne/Arriba",
            }
            for ruta in (f"{raiz}/Lechuga", f"{raiz}/SobreLechuga", f"{raiz}/SobreLechuga/Carne", f"{raiz}/SobreLechuga/SobreCarne"):
                UsdGeom.Xform.Define(stage, ruta)
            for nombre, caras in grupos.items():
                if not caras.any():
                    continue
                p, f, st = lechuga.compactar(P, F[caras], UV)
                ruta = rutas[nombre] + ("/Malla" if nombre in ("Lechuga", "Carne") else "")
                malla(stage, ruta, p, f, st, material)
            # Relleno oscuro por dentro: tapa las rendijas entre piezas.
            _, pr, _, _, fr, _ = lechuga.relleno()
            pr = pr.copy(); pr[:, 1] = np.where(pr[:, 1] > 0.03, bandas["lechuga"][0] + 0.004, pr[:, 1])
            malla(stage, f"{raiz}/Relleno", pr, fr, None, material_color(stage, f"{raiz}/MatRelleno", (0.07, 0.035, 0.02), 0.9), doble=True)
            stage.RemovePrim(original.GetPath())

            cx, cz = lechuga.ASENTAR["centro"]
            interactivo(stage, [
                {"id": "lechuga", "pieza": f"{raiz}/Lechuga", "centro": (cx, np.mean(bandas["lechuga"]), cz),
                 "sube": (f"{raiz}/SobreLechuga", bandas["lechuga"][1] - bandas["lechuga"][0])},
                {"id": "carne", "pieza": f"{raiz}/SobreLechuga/Carne", "centro": (cx, np.mean(bandas["carne"]), cz),
                 "sube": (f"{raiz}/SobreLechuga/SobreCarne", bandas["carne"][1] - bandas["carne"][0])},
            ], estado, "placas.png")
            empacar(tmp, stage, os.path.join(destino_dir, f"hamburguesa_{nombre_bits(estado)}.usdz"))


# ---------- Pasta, pastel y ensalada: el modelo de siempre + el extra ----------
def con_extra(destino_dir, clave, archivo, extras, identificador, textos):
    paleta = capas.paleta_png()
    png = dibujar_placas([textos])
    nodos = [(nombre, piezas, [0, 0, 0], None) for nombre, piezas in extras]
    todos = np.concatenate([m.P for _, piezas, _, _ in nodos for m in piezas])
    centro = (todos[:, 0].mean(), todos[:, 1].min(), todos[:, 2].mean())
    for estado in combinaciones(1):
        with tempfile.TemporaryDirectory() as tmp:
            zipfile.ZipFile(os.path.join(AQUI, f"modelos/{archivo}.usdz")).extractall(tmp)
            open(os.path.join(tmp, "paleta.png"), "wb").write(paleta)
            open(os.path.join(tmp, "placas.png"), "wb").write(png)
            stage = Usd.Stage.Open(os.path.join(tmp, "model.usdc"))
            extra = escena(stage) + "/Extra"
            UsdGeom.Xform.Define(stage, extra)
            capas.agregar_usd(stage, extra, nodos, "paleta.png")
            interactivo(stage, [{"id": identificador, "pieza": extra, "centro": centro}], estado, "placas.png")
            empacar(tmp, stage, os.path.join(destino_dir, f"{clave}_{nombre_bits(estado)}.usdz"))


if __name__ == "__main__":
    salida = os.path.join(AQUI, "modelos/variantes")
    os.makedirs(salida, exist_ok=True)
    hamburguesa(salida)
    # Mismo orden que capas.py, para que los extras salgan idénticos a los del visor.
    con_extra(salida, "pasta", "pasta_bolognesa", capas.parmesano(), "parmesano", ("Con parmesano", "Agregar parmesano"))
    con_extra(salida, "pastel", "postre_pastel", capas.cereza(), "cereza", ("Con cereza", "Agregar cereza"))
    con_extra(salida, "ensalada", "ensalada", capas.crotones(), "crotones", ("Con crotones", "Agregar crotones"))
