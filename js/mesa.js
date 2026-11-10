// Arma tu platillo: botones para quitar o poner ingredientes sobre el modelo 3D de siempre (el visor del platillo).
// Cada cambio se ve en el modelo al momento, con animación de entrada y de salida, y "Ver en mi mesa" abre la
// realidad aumentada con el platillo tal como quedó:
// - iPhone: AR Quick Look con el USDZ de esa combinación. La cámara de Apple no admite botones de la página, pero
//   el archivo trae placas 3D junto al plato que se tocan para quitar o poner el ingrediente (herramientas/ar_iphone.py).
// - Android: WebXR; los mismos botones siguen visibles dentro de la cámara y el modelo cambia en vivo.
//
// Los modelos de modelos/capas/ son los platillos escaneados con cada ingrediente en su propio nodo:
// - "anillo" (lechuga de la hamburguesa, herramientas/lechuga.py): sale del modelo original; al quitarla,
//   lo de arriba se asienta (personalizar.asentar).
// - "lluvia" (parmesano, crotones) y "posar" (cereza): extras agregados con herramientas/capas.py.

import { icono } from "./iconos.js?v=202611101409";
import { efecto, vibrar } from "./sonido.js?v=202611101409";

const ES_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && "ontouchend" in document);

let actual = null; // { platillo, visor, eleccion, lista, piezas, todas, cuerpo, escena, alCambiar }
let cache = null; // piezas ya preparadas del modelo que está cargado en el visor

// ---------- Elección ----------
export function eleccionInicial(platillo) {
  return Object.fromEntries((platillo.personalizar?.opciones ?? []).map((o) => [o.id, Boolean(o.incluido)]));
}

// "Sin lechuga · Con parmesano": solo lo que cambió respecto al platillo normal.
export function textoEleccion(platillo, eleccion) {
  return (platillo.personalizar?.opciones ?? [])
    .filter((o) => Boolean(eleccion?.[o.id] ?? o.incluido) !== Boolean(o.incluido))
    .map((o) => (o.incluido ? o.sin ?? `Sin ${o.nombre.toLowerCase()}` : `Con ${o.nombre.toLowerCase()}`))
    .join(" · ");
}

function urlVariante(platillo, eleccion) {
  const per = platillo.personalizar;
  const bits = per.opciones.map((o) => (eleccion[o.id] ? "1" : "0")).join("");
  return per.variantes.replace("{bits}", bits);
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
    apoyo.y + vy * e.s * e.sy + e.dy - (p.baja ?? 0),
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
  if (!actual?.todas) return;
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
    (p.aplicar ?? aplicar)(p);
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
  // Si es el mismo modelo que ya estaba preparado (volvieron a abrir el platillo) se reutilizan sus piezas.
  if (cache?.llave !== nombres[0] || cache.id !== platillo.id) {
    const piezas = {}, todas = [];
    for (const opcion of platillo.personalizar.opciones) {
      const es = (o) => o?.name === opcion.id || o?.name?.startsWith(`${opcion.id}_`);
      // Solo el nodo de arriba (los hijos de un grupo se llaman igual con _1, _2...).
      piezas[opcion.id] = nombres.filter((o) => es(o) && !es(o.parent)).map(crearPieza);
      todas.push(...piezas[opcion.id]);
    }
    const regla = platillo.personalizar.asentar;
    const cuerpo = regla ? crearCuerpo(nombres.find((o) => o.name === "cuerpo"), regla, piezas, nombres.find((o) => o.name === "relleno")) : null;
    if (cuerpo) todas.push(cuerpo);
    cache = { llave: nombres[0], id: platillo.id, piezas, todas, cuerpo };
  }
  Object.assign(actual, { piezas: cache.piezas, todas: cache.todas, cuerpo: cache.cuerpo });
  // Estado inicial sin animación.
  for (const opcion of platillo.personalizar.opciones) {
    for (const p of actual.piezas[opcion.id]) {
      parar(p);
      Object.assign(p.e, NEUTRO);
      p.obj.visible = Boolean(eleccion[opcion.id]);
      aplicar(p);
    }
  }
  if (actual.cuerpo) {
    parar(actual.cuerpo);
    for (const id of Object.keys(actual.cuerpo.e)) actual.cuerpo.e[id] = eleccion[id] ? 0 : 1;
    actual.cuerpo.aplicar(actual.cuerpo);
  }
  escena.queueShadowRender?.();
  escena.queueRender();
  return true;
}

// ---------- Poner y quitar ----------
// La hamburguesa escaneada: lo que está arriba de un ingrediente quitado baja (su peso = 1) o regresa a su lugar (0).
// Misma regla que herramientas/lechuga.py, que hace la versión sin lechuga para la cámara del iPhone.
function crearCuerpo(obj, regla, piezas, relleno) {
  let malla = null;
  obj?.traverse((o) => { if (!malla && o.isMesh) malla = o; });
  const pos = malla?.geometry?.getAttribute("position");
  if (!pos || pos.isInterleavedBufferAttribute || !(pos.array instanceof Float32Array)) return null;
  const escalon = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  const suave = (a, b, x) => { const t = escalon(a, b, x); return t * t * (3 - 2 * t); };
  const bandas = Object.entries(regla.bandas);
  const y0 = new Float32Array(pos.count);
  // El relleno oscuro de adentro se encoge desde arriba lo mismo que baja la hamburguesa, para no asomarse.
  const cajaRelleno = relleno ? medir(relleno) : null;
  const baja = bandas.map(() => new Float32Array(pos.count)); // cuánto baja cada vértice al quitar cada ingrediente
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x - regla.centro[0], z - regla.centro[1]);
    const esHamburguesa = Math.max(1 - suave(regla.radio[0], regla.radio[1], r), suave(regla.frente[0], regla.frente[1], z), suave(regla.alto[0], regla.alto[1], y));
    y0[i] = y;
    bandas.forEach(([, [a, b]], k) => { baja[k][i] = (b - a) * esHamburguesa * escalon(a, b, y); });
  }
  return {
    e: Object.fromEntries(bandas.map(([id]) => [id, 0])), cola: [],
    aplicar(p) {
      const pesos = bandas.map(([id]) => p.e[id]);
      for (let i = 0; i < pos.count; i++) {
        let y = y0[i];
        for (let k = 0; k < pesos.length; k++) y -= baja[k][i] * pesos[k];
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      if (cajaRelleno) {
        const [abajo, arriba] = [cajaRelleno.min[1], cajaRelleno.max[1]];
        const total = bandas.reduce((suma, [, [a, b]], k) => suma + (b - a) * Math.max(0, pesos[k]), 0);
        const sy = Math.max(0.05, (arriba - total - abajo) / (arriba - abajo));
        relleno.scale.y = sy;
        relleno.position.y = abajo * (1 - sy);
      }
      // Los ingredientes sueltos que están más arriba bajan junto con el cuerpo.
      bandas.forEach(([id, [a]], k) => {
        let baja = 0;
        bandas.forEach(([, [c, d]], j) => { if (d <= a) baja += (d - c) * pesos[j]; });
        for (const pieza of piezas[id] ?? []) { pieza.baja = baja; aplicar(pieza); }
      });
    },
  };
}

// Un ingrediente que rodea al platillo (la lechuga): se abre girando y se desvanece; al volver, se cierra con rebote.
function animarAnillo(id, poner) {
  const cuerpo = actual.cuerpo?.e[id] !== undefined ? actual.cuerpo : null;
  if (cuerpo) cuerpo.cola = cuerpo.cola.filter((m) => m.prop !== id); // solo lo de este ingrediente; el otro puede seguir moviéndose
  for (const p of actual.piezas[id]) {
    parar(p);
    if (poner) {
      // La hamburguesa se levanta un poco para abrir espacio...
      if (cuerpo) mover(cuerpo, { [id]: -0.4 }, 240, "suave");
      // ...la lechuga entra girando y se ajusta...
      Object.assign(p.e, { s: 1.32, ry: -0.9, dy: 0.012, op: 0, sy: 1 });
      p.obj.visible = true;
      aplicar(p);
      mover(p, { op: 1 }, 200, "suave", 60);
      mover(p, { s: 1, ry: 0 }, 480, "rebote", 60);
      mover(p, { dy: 0 }, 380, "suave", 60);
      // ...y todo cae encima con un rebote.
      if (cuerpo) mover(cuerpo, { [id]: 0 }, 380, "bote", 400);
      mover(p, { sy: 0.8 }, 90, "suave", 620);
      mover(p, { sy: 1 }, 340, "rebote", 710);
      setTimeout(() => vibrar([55]), 640); // el "pum" al asentarse (dentro de 1 s del toque: el iPhone sí vibra)
    } else {
      const ficha = (p.ficha = (p.ficha ?? 0) + 1);
      if (cuerpo) mover(cuerpo, { [id]: -0.25 }, 180, "suave");
      mover(p, { s: 0.95 }, 120, "suave");
      mover(p, { s: 1.34, ry: 0.9, dy: 0.01 }, 400, "suave", 120);
      mover(p, { op: 0 }, 240, "suave", 260).then(() => {
        if (p.ficha === ficha && !actual?.eleccion[id]) p.obj.visible = false;
      });
      if (cuerpo) mover(cuerpo, { [id]: 1 }, 400, "bote", 300);
      setTimeout(() => vibrar([40]), 560);
    }
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
    ({ anillo: animarAnillo, lluvia: animarLluvia, posar: animarPosar })[opcion.tipo ?? "posar"](id, poner);
  }
  pintarOpciones();
  ponerVariante();
  actual.alCambiar?.(actual.eleccion);
}

// ---------- Botones ----------
function pintarOpciones() {
  const { platillo, eleccion, lista } = actual;
  if (!lista.childElementCount) {
    lista.innerHTML = platillo.personalizar.opciones.map((o) => `
      <button class="arma-chip" data-arma="${o.id}">
        <span class="arma-icono">${icono(o.icono)}</span>
        <span class="arma-nombre"></span>
        <span class="arma-marca">${icono("check")}${icono("suma")}</span>
      </button>`).join("");
  }
  for (const chip of lista.children) {
    const puesto = Boolean(eleccion[chip.dataset.arma]);
    if (chip.classList.contains("activo") !== puesto && chip.dataset.pintado) {
      chip.classList.remove("cambia");
      void chip.offsetWidth;
      chip.classList.add("cambia");
    }
    chip.dataset.pintado = "1";
    chip.classList.toggle("activo", puesto);
    chip.setAttribute("aria-pressed", puesto);
    const opcion = platillo.personalizar.opciones.find((o) => o.id === chip.dataset.arma);
    const nombre = opcion.nombre.toLowerCase();
    chip.querySelector(".arma-nombre").textContent = puesto ? (opcion.sin ? opcion.nombre : `Con ${nombre}`) : opcion.incluido ? opcion.sin ?? `Sin ${nombre}` : `Agregar ${nombre}`;
  }
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

// Conecta los botones de ingredientes al visor del platillo. Se llama cada vez que se abre un platillo;
// si el platillo no se puede personalizar, solo desconecta lo anterior.
export function personalizar(visor, platillo, eleccion, { alCambiar } = {}) {
  let lista = visor.querySelector(".arma");
  if (!lista) {
    // Dentro del visor (no afuera) para que en Android los botones sigan visibles con la cámara de AR abierta.
    lista = document.createElement("div");
    lista.className = "arma";
    visor.append(lista);
    lista.addEventListener("click", (evento) => {
      const chip = evento.target.closest("[data-arma]");
      if (chip && actual) alternar(chip.dataset.arma);
    });
    // Que tocar un botón no gire el modelo.
    for (const tipo of ["pointerdown", "touchstart", "mousedown"]) lista.addEventListener(tipo, (e) => e.stopPropagation());
    visor.addEventListener("load", () => { if (actual?.visor === visor) prepararEscena(); });
  }
  lista.replaceChildren();
  lista.hidden = !platillo.personalizar;
  lista.classList.toggle("varios", (platillo.personalizar?.opciones.length ?? 0) > 1);
  if (!platillo.personalizar) { actual = null; return; }
  actual = { platillo, visor, lista, alCambiar, eleccion: { ...eleccionInicial(platillo), ...eleccion }, piezas: null, todas: [], cuerpo: null };
  pintarOpciones();
  ponerVariante();
  if (visor.loaded) prepararEscena(); // mismo modelo que ya estaba cargado
}
