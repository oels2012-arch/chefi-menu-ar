// Experiencia inmersiva: "Ver en mi mesa".
// Usa <model-viewer> (Google) para mostrar el platillo en 3D y abrir la cámara en realidad aumentada:
// - Android: WebXR (con la etiqueta nutricional flotando junto al plato) o Scene Viewer.
// - iPhone: AR Quick Look con un USDZ pregenerado; abajo aparece un banner con la información nutricional,
//   el precio y el botón "Agregar al pedido".
// Los modelos están a escala real (plato de 27 cm), así que el platillo aparece de su tamaño sobre la mesa.

let visor = null;
let alAgregarDesdeRA = () => {};
const ORBITA = "30deg 62deg auto";

// Quita el brillo "plástico" de la vista 3D: los modelos generados traen un mapa de brillo/metal irregular que
// hace reflejar la comida como plástico. Se reemplaza por un acabado mate uniforme; el plato queda como cerámica.
function quitarPlastico() {
  for (const material of visor.model?.materials ?? []) {
    const pbr = material.pbrMetallicRoughness;
    pbr.setMetallicFactor(0);
    if (pbr.baseColorTexture?.texture) {
      pbr.metallicRoughnessTexture?.setTexture(null);
      pbr.setRoughnessFactor(0.74);
    } else pbr.setRoughnessFactor(0.38);
  }
}

function etiquetaRA(platillo) {
  const etiqueta = document.createElement("div");
  etiqueta.slot = "hotspot-nutricion";
  etiqueta.className = "etiqueta-ra";
  etiqueta.dataset.position = `0.17 ${(platillo.alto ?? 0.1) + 0.02} 0`;
  etiqueta.dataset.normal = "0 0 1";
  etiqueta.innerHTML = `
    <strong>${platillo.nombre}</strong>
    <span class="etiqueta-ra-precio">$${platillo.precio}</span>
    <dl>
      <div><dt>Porción</dt><dd>${platillo.porcion}</dd></div>
      <div><dt>Calorías</dt><dd>${platillo.kcal} kcal</dd></div>
      <div><dt>Carbs</dt><dd>${platillo.carbohidratos}</dd></div>
      <div><dt>Carne</dt><dd>${platillo.carne}</dd></div>
    </dl>
    ${platillo.contiene ? `<small>Contiene: ${platillo.contiene}</small>` : ""}`;
  return etiqueta;
}

// Banner de AR Quick Look (iPhone): título, subtítulo con datos nutricionales, precio y botón.
function urlIOS(platillo) {
  if (!platillo.modeloIOS) return "";
  const datos = new URLSearchParams({
    checkoutTitle: platillo.nombre,
    checkoutSubtitle: `${platillo.kcal} kcal · ${platillo.porcion} · Carbs ${platillo.carbohidratos}`,
    price: `$${platillo.precio}.00`,
    callToAction: "Agregar al pedido",
  });
  return `${platillo.modeloIOS}#${datos.toString().replace(/\+/g, "%20")}`;
}

// Coloca el visor 3D dentro de `contenedor` y carga el platillo.
export function montarVisor(contenedor, platillo, { alAgregar } = {}) {
  if (alAgregar) alAgregarDesdeRA = alAgregar;
  if (!visor) {
    visor = document.createElement("model-viewer");
    visor.setAttribute("camera-controls", "");
    visor.setAttribute("touch-action", "pan-y");
    visor.setAttribute("interaction-prompt", "none");
    visor.setAttribute("shadow-intensity", "1.4");
    visor.setAttribute("shadow-softness", "0.85");
    visor.setAttribute("exposure", "1.05");
    visor.setAttribute("tone-mapping", "agx");
    visor.setAttribute("camera-orbit", ORBITA);
    visor.setAttribute("min-camera-orbit", "auto 0deg auto");
    visor.setAttribute("max-camera-orbit", "auto 88deg auto");
    visor.setAttribute("ar", "");
    visor.setAttribute("ar-modes", "webxr scene-viewer quick-look");
    visor.setAttribute("ar-placement", "floor");
    visor.setAttribute("ar-scale", "fixed"); // siempre a tamaño real
    visor.className = "visor-3d";
    // Oculta el botón AR propio de model-viewer: lo abre nuestro botón "Ver en mi mesa".
    const sinBoton = document.createElement("span");
    sinBoton.slot = "ar-button";
    sinBoton.hidden = true;
    visor.append(sinBoton);
    visor.addEventListener("load", quitarPlastico);
    visor.addEventListener("quick-look-button-tapped", () => alAgregarDesdeRA());
  }
  visor.querySelector('[slot="hotspot-nutricion"]')?.remove();
  visor.append(etiquetaRA(platillo));
  visor.setAttribute("src", platillo.modelo);
  const ios = urlIOS(platillo);
  if (ios) visor.setAttribute("ios-src", ios);
  else visor.removeAttribute("ios-src");
  visor.setAttribute("poster", platillo.foto);
  visor.setAttribute("alt", `Modelo 3D de ${platillo.nombre}`);
  contenedor.replaceChildren(visor);
  return visor;
}

// Regresa el platillo a su lugar y a la vista inicial (después de que "se cayó").
export function reiniciarVisor() {
  if (!visor) return;
  visor.cameraOrbit = ORBITA;
  visor.jumpCameraToGoal();
}

// true si el celular puede abrir la cámara en AR. En computadora casi siempre es false.
export function arDisponible() {
  return Boolean(visor && visor.canActivateAR);
}

// Abre la cámara con el platillo sobre la mesa.
export function verEnMiMesa() {
  if (arDisponible()) {
    visor.activateAR();
    return true;
  }
  return false;
}
