// "Ver en mi mesa": abre la cámara del celular con el platillo en 3D, a tamaño real (plato de 27 cm).
// Solo se ve el platillo, tal como se eligió en la página (cada combinación de ingredientes tiene su modelo).
// - iPhone / iPad: AR Quick Look de Apple con el archivo .usdz (sin banner ni botones).
// - Android: Scene Viewer de Google con el archivo .glb.
// La página ya no carga ningún visor 3D: la pantalla del platillo es una foto, así que abre rápido y no se traba.

const ES_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && "ontouchend" in document);
const ES_ANDROID = /Android/.test(navigator.userAgent);

// Combinación elegida → "10", "01"... (un 1 o un 0 por opción, en el orden de datos.js).
export function bitsDe(platillo, eleccion) {
  const opciones = platillo.personalizar?.opciones ?? [];
  return opciones.map((o) => ((eleccion?.[o.id] ?? o.incluido) ? "1" : "0")).join("");
}

// Archivos (foto, .glb y .usdz) de la combinación elegida.
export function archivosDe(platillo, eleccion) {
  const per = platillo.personalizar;
  if (!per) return { foto: platillo.foto, glb: platillo.modelo, usdz: platillo.modeloIOS };
  const bits = bitsDe(platillo, eleccion);
  const poner = (ruta) => ruta?.replace("{bits}", bits);
  return { foto: poner(per.fotos) ?? platillo.foto, glb: poner(per.modelos) ?? platillo.modelo, usdz: poner(per.modelosIOS) ?? platillo.modeloIOS };
}

function quickLookDisponible() {
  const a = document.createElement("a");
  return Boolean(a.relList?.supports?.("ar"));
}

// true si este celular puede abrir la cámara con el platillo. En computadora es false.
export function arDisponible() {
  return (ES_IOS && quickLookDisponible()) || ES_ANDROID;
}

// Baja el archivo de AR en segundo plano para que la cámara abra sin esperar.
const precargados = new Set();
export function precargarAR(platillo, eleccion) {
  if (!arDisponible()) return;
  const { glb, usdz } = archivosDe(platillo, eleccion);
  const archivo = ES_IOS ? usdz : glb;
  if (!archivo || precargados.has(archivo)) return;
  precargados.add(archivo);
  fetch(archivo, { priority: "low" }).catch(() => precargados.delete(archivo));
}

// Abre la cámara con el platillo sobre la mesa. Hay que llamarla dentro de un toque. Regresa false si no se puede.
export function verEnMiMesa(platillo, eleccion) {
  const { glb, usdz } = archivosDe(platillo, eleccion);
  if (ES_IOS && usdz && quickLookDisponible()) {
    // AR Quick Look se abre con un enlace rel="ar" que tiene una imagen dentro. Sin parámetros: solo el modelo.
    const enlace = document.createElement("a");
    enlace.rel = "ar";
    enlace.href = new URL(usdz, location.href).href;
    enlace.append(document.createElement("img"));
    enlace.style.display = "none";
    document.body.append(enlace);
    enlace.click();
    setTimeout(() => enlace.remove(), 1000);
    return true;
  }
  if (ES_ANDROID && glb) {
    const archivo = new URL(glb, location.href).href;
    const regreso = encodeURIComponent(location.href);
    location.href = `intent://arvr.google.com/scene-viewer/1.2?file=${encodeURIComponent(archivo)}&mode=ar_preferred&resizable=true` +
      `&title=${encodeURIComponent(platillo.nombre)}#Intent;scheme=https;package=com.google.android.googlequicksearchbox;` +
      `action=android.intent.action.VIEW;S.browser_fallback_url=${regreso};end;`;
    return true;
  }
  return false;
}
