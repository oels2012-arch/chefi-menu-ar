// Modo "En mi mesa": el platillo en 3D a pantalla completa, con la cámara del celular de fondo y botones para
// quitar o poner ingredientes. Cada cambio se ve en el modelo al momento, con animación de entrada y de salida.
// Desde aquí "Fijar en mi mesa" abre la realidad aumentada con el platillo ya personalizado:
// - iPhone: AR Quick Look con el USDZ de esa combinación (la cámara de Apple no admite botones propios,
//   por eso los ingredientes se eligen aquí, antes de fijarlo).
// - Android: WebXR; los mismos botones siguen visibles dentro de la cámara y el modelo cambia en vivo.
//
// Los modelos de modelos/capas/ traen cada ingrediente en su propio nodo (ver herramientas/capas.py):
// - "capa" (hamburguesa): nodos con extras.capa y extras.alto; al quitar una, las de arriba bajan.
// - "lluvia" (parmesano, crotones): varios nodos que caen escalonados.
// - "posar" (cereza): una pieza que cae, rebota y se asienta.

import { icono } from "./iconos.js?v=202611101131";
import { efecto, vibrar } from "./sonido.js?v=202611101131";

const ES_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && "ontouchend" in document);
const ORBITA = "28deg 62deg 112%";

let actual = null; // { platillo, visor, eleccion, piezas, capas, escena, avisos, flujo }

// ---------- Elección ----------
export function eleccionInicial(platillo) {
  return Object.fromEntries((platillo.personalizar?.opciones ?? []).map((o) => [o.id, Boolean(o.incluido)]));
}

// "Sin lechuga · Con parmesano": solo lo que cambió respecto al platillo normal.
export function textoEleccion(platillo, eleccion) {
  return (platillo.personalizar?.opciones ?? [])
    .filter((o) => Boolean(eleccion?.[o.id] ?? o.incluido) !== Boolean(o.incluido))
    .map((o) => `${o.incluido ? "Sin" : "Con"} ${o.nombre.toLowerCase()}`)
    .join(" · ");
}

function urlVariante(platillo, eleccion) {
  const per = platillo.personalizar;
  const bits = per.opciones.map((o) => (eleccion[o.id] ? "1" : "0")).join("");
  return per.fijas?.[bits] ?? per.variantes.replace("{bits}", bits);
}

// Banner de AR Quick Look (iPhone): nombre, lo que se cambió, precio y "Agregar al pedido".
function urlIOS(platillo, eleccion) {
  const cambios = textoEleccion(platillo, eleccion);
  const datos = new URLSearchParams({
    checkoutTitle: platillo.nombre,
    checkoutSubtitle: cambios || `${platillo.kcal} kcal · ${platillo.porcion}`,
    price: `$${platillo.precio}.00`,
    callToAction: "Agregar al pedido",
  });
  return `${urlVariante(platillo, eleccion)}#${datos.toString().replace(/\+/g, "%20")}`;
}

// ---------- Animación de las piezas ----------
const CURVAS = {
  suave: (t) => 1 - (1 - t) ** 3,
  entra: (t) => t * t * t,
  cae: (t) => t * t,
  // Llega un poco de más y regresa (asentarse).
  rebote: (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
  // Rebote contra el plato: cae, da un botecito y se queda.
  bote: (t) => (t < 0.62 ? (t / 0.62) ** 2 : 1 - 0.09 * Math.sin(((t - 0.62) / 0.38) * Math.PI)),
};
const NEUTRO = { dx: 0, dy: 0, dz: 0, s: 1, sy: 1, ry: 0, op: 1 };

// Propiedad interna de <model-viewer> (la escena de three.js), buscada por el nombre de su símbolo.
function interno(obj, nombre) {
  for (let o = obj; o; o = Object.getPrototypeOf(o)) {
    const s = Object.getOwnPropertySymbols(o).find((x) => x.description === nombre);
    if (s) return obj[s];
  }
  return null;
}

// Caja de la pieza en sus propias coordenadas (sin girar), sumando las de sus hijos.
function medir(obj, origen = [0, 0, 0], escala = [1, 1, 1], caja = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }) {
  if (obj.geometry) {
    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
    const b = obj.geometry.boundingBox;
    ["x", "y", "z"].forEach((eje, i) => {
      caja.min[i] = Math.min(caja.min[i], origen[i] + b.min[eje] * escala[i]);
      caja.max[i] = Math.max(caja.max[i], origen[i] + b.max[eje] * escala[i]);
    });
  }
  for (const h of obj.children) {
    medir(h, [origen[0] + h.position.x * escala[0], origen[1] + h.position.y * escala[1], origen[2] + h.position.z * escala[2]],
      [escala[0] * h.scale.x, escala[1] * h.scale.y, escala[2] * h.scale.z], caja);
  }
  return caja;
}

function crearPieza(obj) {
  const caja = medir(obj);
  const p0 = { x: obj.position.x, y: obj.position.y, z: obj.position.z };
  const s0 = obj.scale.x;
  const materiales = [];
  obj.traverse((o) => {
    if (!o.material) return;
    o.material = o.material.clone(); // propio de la pieza, para poder desvanecerla sola
    materiales.push(o.material);
  });
  return {
    obj, p0, s0, materiales,
    // Punto de apoyo: centro de la base. Las escalas y giros salen de ahí, no del origen del modelo.
    apoyo: { x: p0.x + ((caja.min[0] + caja.max[0]) / 2) * s0, y: p0.y + caja.min[1] * s0, z: p0.z + ((caja.min[2] + caja.max[2]) / 2) * s0 },
    e: { ...NEUTRO },
    cola: [], // movimientos pendientes: { prop, a, inicio, ms, curva, de }
  };
}

function aplicar(p) {
  const { obj, p0, s0, apoyo, e } = p;
  const vx = p0.x - apoyo.x, vy = p0.y - apoyo.y, vz = p0.z - apoyo.z;
  const cos = Math.cos(e.ry), sin = Math.sin(e.ry);
  obj.position.set(
    apoyo.x + (vx * cos + vz * sin) * e.s + e.dx,
    apoyo.y + vy * e.s * e.sy + e.dy,
    apoyo.z + (-vx * sin + vz * cos) * e.s + e.dz,
  );
  obj.rotation.y = e.ry;
  obj.scale.set(s0 * e.s, s0 * e.s * e.sy, s0 * e.s);
  for (const m of p.materiales) {
    const visible = e.op < 0.995;
    if (m.transparent !== visible) { m.transparent = visible; m.needsUpdate = true; }
    m.opacity = e.op;
  }
}

// Programa un movimiento: props = { dy: 0.02, s: 1 ... }. Devuelve una promesa que se cumple al terminar.
function mover(p, props, ms, curva = "suave", espera = 0) {
  const inicio = performance.now() + espera;
  for (const [prop, a] of Object.entries(props)) p.cola.push({ prop, a, inicio, ms, curva, de: null });
  encender();
  return new Promise((listo) => setTimeout(listo, espera + ms + 20));
}

function parar(p) {
  p.cola.length = 0;
}

let cuadroPedido = 0;
function encender() {
  if (!cuadroPedido) cuadroPedido = requestAnimationFrame(cuadro);
}

function cuadro(ahora) {
  cuadroPedido = 0;
  if (!actual?.piezas) return;
  let vivos = false;
  for (const p of actual.todas) {
    if (!p.cola.length) continue;
    const activos = {};
    // De cada propiedad manda el movimiento que empezó más tarde; los que aún esperan se quedan en la cola.
    for (const m of p.cola) {
      if (ahora < m.inicio) continue;
      const previo = activos[m.prop];
      if (previo && previo.inicio > m.inicio) { m.fuera = true; continue; }
      if (previo) previo.fuera = true;
      activos[m.prop] = m;
    }
    for (const m of Object.values(activos)) {
      m.de ??= p.e[m.prop];
      const t = Math.min(1, (ahora - m.inicio) / m.ms);
      p.e[m.prop] = m.de + (m.a - m.de) * CURVAS[m.curva](t);
      if (t >= 1) m.fuera = true;
    }
    p.cola = p.cola.filter((m) => !m.fuera);
    aplicar(p);
    vivos ||= p.cola.length > 0;
  }
  actual.escena.queueShadowRender?.();
  actual.escena.queueRender();
  if (vivos) encender();
}

// ---------- Preparar el modelo ----------
function prepararEscena() {
  const { visor, platillo, eleccion } = actual;
  const escena = interno(visor, "scene");
  if (!escena?.queueRender) return false;
  actual.escena = escena;
  const nombres = [];
  escena.traverse((o) => { if (o.name) nombres.push(o); });
  actual.piezas = {};
  actual.todas = [];
  for (const opcion of platillo.personalizar.opciones) {
    const es = (o) => o?.name === opcion.id || o?.name?.startsWith(`${opcion.id}_`);
    // Solo el nodo de arriba (los hijos de un grupo se llaman igual con _1, _2...).
    const piezas = nombres.filter((o) => es(o) && !es(o.parent)).map(crearPieza);
    actual.piezas[opcion.id] = piezas;
    actual.todas.push(...piezas);
  }
  // Hamburguesa: la pila completa, de abajo hacia arriba (incluye pan y carne, que no se quitan).
  const deCapa = nombres.filter((o) => o.userData?.capa).sort((a, b) => a.position.y - b.position.y);
  actual.capas = deCapa.map((obj) => {
    const pieza = actual.todas.find((p) => p.obj === obj) ?? crearPieza(obj);
    if (!actual.todas.includes(pieza)) actual.todas.push(pieza);
    pieza.alto = obj.userData.alto;
    pieza.id = platillo.personalizar.opciones.find((o) => o.id === obj.name)?.id ?? null;
    return pieza;
  });
  actual.base = actual.capas[0]?.p0.y ?? 0;
  // Estado inicial sin animación.
  for (const opcion of platillo.personalizar.opciones) {
    if (eleccion[opcion.id]) continue;
    for (const p of actual.piezas[opcion.id]) p.obj.visible = false;
  }
  for (const [capa, dy] of destinos()) { capa.e.dy = dy; aplicar(capa); }
  escena.queueShadowRender?.();
  escena.queueRender();
  return true;
}

// A qué altura (relativa a la suya de origen) debe quedar cada capa según lo que está puesto.
function destinos() {
  let y = actual.base;
  const mapa = new Map();
  for (const capa of actual.capas) {
    if (capa.id && !actual.eleccion[capa.id]) continue;
    mapa.set(capa, y - capa.p0.y);
    y += capa.alto;
  }
  return mapa;
}

// ---------- Poner y quitar ----------
function animarCapa(id, poner) {
  const pieza = actual.piezas[id][0];
  const indice = actual.capas.indexOf(pieza);
  const arriba = actual.capas.slice(indice + 1).filter((c) => !c.id || actual.eleccion[c.id]);
  const destino = destinos();
  const lado = indice % 2 ? 1 : -1; // entran y salen alternando el lado
  parar(pieza);
  arriba.forEach(parar);
  if (poner) {
    const dy = destino.get(pieza);
    // Las de arriba se levantan para abrir espacio...
    arriba.forEach((c) => mover(c, { dy: destino.get(c) + 0.05 }, 220, "suave"));
    // ...el ingrediente entra girando desde un lado y se acomoda...
    Object.assign(pieza.e, { dx: lado * 0.1, dy: dy + 0.022, s: 0.35, ry: lado * 1.1, op: 0, sy: 1 });
    pieza.obj.visible = true;
    aplicar(pieza);
    mover(pieza, { op: 1 }, 160);
    mover(pieza, { dx: 0, s: 1, ry: 0 }, 420, "rebote", 40);
    mover(pieza, { dy: dy + 0.014 }, 340, "suave", 40);
    mover(pieza, { dy }, 200, "cae", 400);
    mover(pieza, { sy: 0.82 }, 90, "suave", 590);
    mover(pieza, { sy: 1 }, 320, "rebote", 680);
    // ...y las de arriba caen encima con un rebote.
    arriba.forEach((c, k) => {
      mover(c, { dy: destino.get(c) }, 300, "bote", 520 + k * 45);
      mover(c, { sy: 0.9 }, 80, "suave", 700 + k * 45);
      mover(c, { sy: 1 }, 300, "rebote", 780 + k * 45);
    });
    setTimeout(() => vibrar([55]), 600); // el "pum" al asentarse (dentro de 1 s del toque: el iPhone sí vibra)
  } else {
    const dy = pieza.e.dy;
    const ficha = (pieza.ficha = (pieza.ficha ?? 0) + 1);
    arriba.forEach((c) => mover(c, { dy: c.e.dy + 0.026 }, 200, "suave"));
    mover(pieza, { dy: dy + 0.02 }, 200, "suave");
    mover(pieza, { dx: lado * 0.11, ry: lado * -1.2, s: 0.3, dy: dy + 0.06 }, 340, "entra", 170);
    mover(pieza, { op: 0 }, 180, "suave", 330).then(() => {
      if (pieza.ficha === ficha && !actual?.eleccion[id]) pieza.obj.visible = false;
    });
    arriba.forEach((c, k) => {
      mover(c, { dy: destino.get(c) }, 320, "bote", 380 + k * 45);
      mover(c, { sy: 0.9 }, 80, "suave", 570 + k * 45);
      mover(c, { sy: 1 }, 300, "rebote", 650 + k * 45);
    });
    setTimeout(() => vibrar([40]), 600);
  }
}

function animarLluvia(id, poner) {
  actual.piezas[id].forEach((p, k) => {
    parar(p);
    const giro = (k % 2 ? 1 : -1) * 0.5;
    if (poner) {
      Object.assign(p.e, { dy: 0.085 + k * 0.012, ry: giro, op: 0, s: 1, sy: 1 });
      p.obj.visible = true;
      aplicar(p);
      const espera = k * 95;
      mover(p, { op: 1 }, 200, "suave", espera);
      mover(p, { dy: 0 }, 520, "bote", espera);
      mover(p, { ry: 0 }, 560, "suave", espera);
    } else {
      const ficha = (p.ficha = (p.ficha ?? 0) + 1);
      const espera = k * 60;
      mover(p, { dy: 0.07, ry: -giro }, 360, "entra", espera);
      mover(p, { op: 0 }, 260, "suave", espera + 100).then(() => {
        if (p.ficha === ficha && !actual?.eleccion[id]) p.obj.visible = false;
      });
    }
  });
  if (poner) setTimeout(() => vibrar([30, 60, 30, 60, 45]), 380);
}

function animarPosar(id, poner) {
  for (const p of actual.piezas[id]) {
    parar(p);
    if (poner) {
      Object.assign(p.e, { dy: 0.11, s: 0.5, ry: -2.6, op: 0, sy: 1 });
      p.obj.visible = true;
      aplicar(p);
      mover(p, { op: 1 }, 140);
      mover(p, { s: 1, ry: 0 }, 420, "suave");
      mover(p, { dy: 0 }, 400, "cae");
      mover(p, { sy: 0.78 }, 90, "suave", 400);
      mover(p, { sy: 1 }, 380, "rebote", 490);
      mover(p, { dy: 0.012 }, 130, "suave", 490);
      mover(p, { dy: 0 }, 170, "cae", 620);
      setTimeout(() => vibrar([70]), 400);
    } else {
      const ficha = (p.ficha = (p.ficha ?? 0) + 1);
      mover(p, { sy: 0.88 }, 90);
      mover(p, { sy: 1, dy: 0.1, ry: 2.4, s: 0.4 }, 360, "entra", 90);
      mover(p, { op: 0 }, 180, "suave", 280).then(() => {
        if (p.ficha === ficha && !actual?.eleccion[id]) p.obj.visible = false;
      });
    }
  }
}

function alternar(id) {
  const opcion = actual.platillo.personalizar.opciones.find((o) => o.id === id);
  if (!opcion) return;
  const poner = !actual.eleccion[id];
  actual.eleccion = { ...actual.eleccion, [id]: poner };
  efecto(poner ? "poner" : "retirar");
  if (actual.piezas?.[id]?.length) {
    ({ capa: animarCapa, lluvia: animarLluvia, posar: animarPosar })[opcion.tipo ?? "capa"](id, poner);
  }
  pintarOpciones();
  ponerVariante();
  actual.avisos.alCambiar?.(actual.eleccion);
}

// ---------- Pantalla ----------
function pintarOpciones() {
  const { platillo, eleccion, lista } = actual;
  if (!lista.childElementCount) {
    lista.innerHTML = platillo.personalizar.opciones.map((o) => `
      <button class="enmesa-chip" data-mesa-opcion="${o.id}">
        <span class="enmesa-chip-icono">${icono(o.icono)}</span>
        <span class="enmesa-chip-nombre">${o.nombre}</span>
        <span class="enmesa-chip-marca">${icono("check")}${icono("suma")}</span>
      </button>`).join("");
  }
  for (const chip of lista.children) {
    const puesto = Boolean(eleccion[chip.dataset.mesaOpcion]);
    if (chip.classList.contains("activo") !== puesto && chip.dataset.pintado) {
      chip.classList.remove("cambia");
      void chip.offsetWidth;
      chip.classList.add("cambia");
    }
    chip.dataset.pintado = "1";
    chip.classList.toggle("activo", puesto);
    chip.setAttribute("aria-pressed", puesto);
  }
  const cambios = textoEleccion(platillo, eleccion);
  actual.resumen.textContent = cambios || "Toca un ingrediente para quitarlo o ponerlo";
  actual.resumen.classList.toggle("con-cambios", Boolean(cambios));
}

// Deja listo el archivo de AR de la combinación actual (y en iPhone lo va bajando).
let bajada = 0;
function ponerVariante() {
  const { visor, platillo, eleccion } = actual;
  visor.setAttribute("ios-src", urlIOS(platillo, eleccion));
  if (!ES_IOS) return;
  clearTimeout(bajada);
  const url = urlVariante(platillo, eleccion);
  bajada = setTimeout(() => fetch(url, { priority: "low" }).catch(() => {}), 500);
}

async function encenderCamara() {
  const { raiz, video } = actual;
  if (!navigator.mediaDevices?.getUserMedia) return;
  try {
    const flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
    if (!actual || actual.video !== video) return flujo.getTracks().forEach((t) => t.stop());
    actual.flujo = flujo;
    video.srcObject = flujo;
    await video.play().catch(() => {});
    raiz.classList.add("con-camara");
  } catch {
    raiz.classList.remove("con-camara"); // sin permiso de cámara se queda el fondo del menú
  }
}

function apagarCamara() {
  actual?.flujo?.getTracks().forEach((t) => t.stop());
  if (actual) actual.flujo = null;
}

// Al volver de la cámara de AR (o de otra app) el video puede quedar congelado: se vuelve a pedir.
function alVolver() {
  if (!actual || document.visibilityState !== "visible") return;
  const vivo = actual.flujo?.getVideoTracks().some((t) => t.readyState === "live" && !t.muted);
  if (!vivo || actual.video.paused) {
    apagarCamara();
    encenderCamara();
  }
}

export function mesaAbierta() {
  return Boolean(actual);
}

export function cerrarMesa() {
  if (!actual) return;
  const { raiz, visor, avisos, eleccion } = actual;
  apagarCamara();
  actual.video.srcObject = null;
  raiz.hidden = true;
  raiz.classList.remove("con-camara", "cargado");
  document.body.classList.remove("con-enmesa");
  visor.remove();
  actual = null;
  avisos.alCerrar?.(eleccion);
}

function fijar() {
  const { visor, raiz } = actual;
  if (!visor.canActivateAR) {
    raiz.classList.add("sin-ar");
    return;
  }
  efecto("abrir");
  ponerVariante();
  visor.activateAR();
}

// Abre el modo "En mi mesa". eleccion = { idIngrediente: true/false }.
export function abrirMesa(platillo, eleccion, avisos = {}) {
  if (actual) cerrarMesa();
  const raiz = document.querySelector('[data-ref="en-mesa"]');
  const visor = document.createElement("model-viewer");
  for (const [k, v] of Object.entries({
    "camera-controls": "", "touch-action": "none", "interaction-prompt": "none", "shadow-intensity": "1.1",
    "shadow-softness": "0.9", "camera-orbit": ORBITA, "min-camera-orbit": "auto 15deg auto", "max-camera-orbit": "auto 86deg auto",
    ar: "", "ar-modes": "webxr scene-viewer quick-look", "ar-placement": "floor", "ar-scale": "auto",
    src: platillo.personalizar.modelo, alt: `Modelo 3D de ${platillo.nombre}`,
  })) visor.setAttribute(k, v);
  visor.className = "enmesa-visor";
  // Dentro del visor (no afuera) para que en Android los botones sigan visibles con la cámara de AR abierta.
  visor.innerHTML = `
    <span slot="ar-button" hidden></span>
    <div class="enmesa-panel">
      <p class="enmesa-resumen" data-mesa="resumen"></p>
      <div class="enmesa-opciones" data-mesa="opciones"></div>
      <div class="enmesa-acciones">
        <button class="enmesa-fijar" data-mesa="fijar">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3 6.6 3.7L12 11.7 5.4 8 12 4.3ZM5 9.7l6 3.4v6.6l-6-3.4V9.7Zm8 10v-6.6l6-3.4v6.6l-6 3.4Z"/></svg>
          <span>Fijar en mi mesa<small>Tamaño real</small></span>
        </button>
        <button class="boton-principal enmesa-listo" data-mesa="listo">Listo</button>
      </div>
      <p class="enmesa-nota" data-mesa="nota">Abre el menú en tu celular para fijarlo sobre tu mesa a tamaño real.</p>
    </div>`;
  raiz.querySelector('[data-mesa="escena"]').replaceChildren(visor);
  raiz.querySelector('[data-mesa="titulo"]').textContent = platillo.nombre;
  actual = {
    platillo, visor, raiz, avisos,
    eleccion: { ...eleccionInicial(platillo), ...eleccion },
    video: raiz.querySelector("video"),
    lista: visor.querySelector('[data-mesa="opciones"]'),
    resumen: visor.querySelector('[data-mesa="resumen"]'),
    piezas: null, todas: [], capas: [],
  };
  raiz.hidden = false;
  raiz.classList.remove("sin-ar", "cargado");
  document.body.classList.add("con-enmesa");
  pintarOpciones();
  ponerVariante();
  encenderCamara();
  visor.addEventListener("load", () => {
    if (actual?.visor !== visor) return;
    prepararEscena();
    raiz.classList.add("cargado");
    raiz.classList.toggle("sin-ar", !visor.canActivateAR);
  }, { once: true });
  visor.addEventListener("quick-look-button-tapped", () => actual?.avisos.alAgregar?.(actual.eleccion));
  visor.addEventListener("click", (evento) => {
    const boton = evento.target.closest("[data-mesa-opcion], [data-mesa]");
    if (!boton || !actual) return;
    if (boton.dataset.mesaOpcion) alternar(boton.dataset.mesaOpcion);
    else if (boton.dataset.mesa === "fijar") fijar();
    else if (boton.dataset.mesa === "listo") { efecto("toque"); cerrarMesa(); }
  });
}

document.addEventListener("visibilitychange", alVolver);
window.addEventListener("pageshow", alVolver);
document.addEventListener("click", (evento) => {
  if (actual && evento.target.closest('[data-mesa="cerrar"]')) { efecto("toque"); cerrarMesa(); }
});
