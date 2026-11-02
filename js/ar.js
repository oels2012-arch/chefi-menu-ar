// Experiencia inmersiva: "Ver en mi mesa".
// Usa <model-viewer> (Google) para mostrar el platillo en 3D y abrir la cámara en realidad aumentada:
// - Android: Scene Viewer / WebXR.
// - iPhone: AR Quick Look (model-viewer convierte el GLB a USDZ al momento).
// Los modelos están a escala real (plato de 27 cm), así que el platillo aparece de su tamaño sobre la mesa.

let visor = null;

// Coloca el visor 3D dentro de `contenedor` y carga el platillo.
export function montarVisor(contenedor, platillo) {
  if (!visor) {
    visor = document.createElement("model-viewer");
    visor.setAttribute("camera-controls", "");
    visor.setAttribute("touch-action", "pan-y");
    visor.setAttribute("shadow-intensity", "1");
    visor.setAttribute("camera-orbit", "30deg 60deg auto");
    visor.setAttribute("ar", "");
    visor.setAttribute("ar-modes", "webxr scene-viewer quick-look");
    visor.setAttribute("ar-placement", "floor");
    visor.className = "visor-3d";
    // Oculta el botón AR propio de model-viewer: lo abre nuestro botón "Ver en mi mesa".
    const sinBoton = document.createElement("span");
    sinBoton.slot = "ar-button";
    sinBoton.hidden = true;
    visor.append(sinBoton);
  }
  visor.setAttribute("src", platillo.modelo);
  visor.setAttribute("poster", platillo.foto);
  visor.setAttribute("alt", `Modelo 3D de ${platillo.nombre}`);
  contenedor.replaceChildren(visor);
  return visor;
}

// Regresa el platillo a su lugar y a la vista inicial (después de que "se cayó").
export function reiniciarVisor() {
  if (!visor) return;
  visor.setAttribute("camera-orbit", "30deg 60deg auto");
  visor.cameraOrbit = "30deg 60deg auto";
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
