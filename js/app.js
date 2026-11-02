// Lógica del menú digital: navegación, pedido, cuenta y pago.
// No depende del diseño: busca los elementos por sus atributos data-* (ver README.md).

import { CATEGORIAS, PLATILLOS, PROPINA_INICIAL, MAX_PERSONAS, ALERGIAS, RESENA_GOOGLE } from "./datos.js";
import { montarVisor, verEnMiMesa, reiniciarVisor } from "./ar.js";
import { vigilarSacudida, lluviaDeIngredientes } from "./caida.js";

const estado = {
  mesa: new URLSearchParams(location.search).get("mesa"),
  categoria: CATEGORIAS[0].id,
  actual: null, // id del platillo abierto
  cantidad: 1,
  alergias: [], // alergias marcadas en el platillo abierto
  pedido: [],   // lo que aún no se envía a cocina: { id, cantidad, notas }
  enviados: [], // lo que ya se envió y va a la cuenta
  propina: PROPINA_INICIAL,
  personas: 1,
  metodo: "tarjeta",
  encuesta: null,
  encuestaMenu: null,
};

// ---------- Utilidades ----------

const dinero = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const pantalla = (nombre) => document.querySelector(`[data-pantalla="${nombre}"]`);
const ref = (nombre, raiz = document) => raiz.querySelector(`[data-ref="${nombre}"]`);
const lista = (nombre) => document.querySelector(`[data-lista="${nombre}"]`);
const platillo = (id) => PLATILLOS.find((p) => p.id === id);
const importe = (linea) => platillo(linea.id).precio * linea.cantidad;
const suma = (lineas) => lineas.reduce((total, l) => total + importe(l), 0);
const METODOS = { tarjeta: "Tarjeta (terminal en la mesa)", "en-linea": "Pago en línea", efectivo: "Efectivo" };

function copiar(plantilla) {
  return document.querySelector(`[data-plantilla="${plantilla}"]`).content.firstElementChild.cloneNode(true);
}

function texto(nombre, valor, raiz) {
  const el = ref(nombre, raiz);
  if (el) el.textContent = valor;
}

// El pedido se guarda en la pestaña para no perderlo si la página se recarga al volver de la cámara.
function guardar() {
  try {
    sessionStorage.setItem("chefi-estado", JSON.stringify(estado));
  } catch {}
}

function cargar() {
  try {
    const guardado = JSON.parse(sessionStorage.getItem("chefi-estado"));
    if (guardado) Object.assign(estado, guardado, { mesa: estado.mesa || guardado.mesa });
  } catch {}
}

let temporizadorAviso;
function avisar(mensaje) {
  const aviso = ref("aviso");
  aviso.textContent = mensaje;
  aviso.hidden = false;
  aviso.classList.remove("saliendo");
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => aviso.classList.add("saliendo"), 2200);
}

// ---------- Navegación ----------
// Cada pantalla tiene su dirección: #menu, #platillo/pasta, #pedido, #cuenta...

function ir(destino) {
  location.hash = destino;
}

function mostrar() {
  const [nombre = "bienvenida", parametro] = location.hash.slice(1).split("/");
  const destino = nombre === "platillo" ? "detalle" : nombre;
  if (!pantalla(destino)) return ir("bienvenida");

  document.querySelectorAll("[data-pantalla]").forEach((s) => (s.hidden = s.dataset.pantalla !== destino));
  document.body.dataset.vista = destino;
  document.querySelector('[data-accion="atras"]').hidden = destino === "bienvenida";
  cerrarCaida();
  ({ bienvenida: animarPasos, menu: pintarMenu, detalle: () => pintarDetalle(parametro), pedido: pintarPedido,
     estado: pintarEstado, pago: pintarPago, cuenta: pintarCuenta, gracias: pintarGracias })[destino]?.();
  pintarBarra(destino);
  window.scrollTo(0, 0);
}

// ---------- Pantallas ----------

// Los pasos de la bienvenida se animan cuando aparecen en pantalla.
let observador;
function animarPasos() {
  const pasos = document.querySelectorAll(".paso");
  if (!("IntersectionObserver" in window)) return pasos.forEach((p) => p.classList.add("visible"));
  observador ??= new IntersectionObserver((entradas) => {
    entradas.forEach((e) => e.isIntersecting && e.target.classList.add("visible"));
  }, { threshold: 0.35 });
  pasos.forEach((p) => observador.observe(p));
}

function pintarMenu() {
  lista("categorias").replaceChildren(...CATEGORIAS.map((c) => {
    const chip = copiar("categoria");
    chip.textContent = c.nombre;
    chip.dataset.id = c.id;
    chip.classList.toggle("activo", c.id === estado.categoria);
    return chip;
  }));

  lista("platillos").replaceChildren(...PLATILLOS.filter((p) => p.categoria === estado.categoria).map((p, i) => {
    const tarjeta = copiar("tarjeta-platillo");
    tarjeta.dataset.id = p.id;
    tarjeta.style.animationDelay = `${i * 70}ms`;
    ref("foto", tarjeta).src = p.foto;
    texto("nombre", p.nombre, tarjeta);
    texto("descripcion", p.descripcion, tarjeta);
    texto("precio", dinero.format(p.precio), tarjeta);
    ref("etiqueta-ar", tarjeta).hidden = !p.modelo;
    return tarjeta;
  }));
}

let visorVigilado = false;
function pintarDetalle(id) {
  const p = platillo(id);
  if (!p) return ir("menu");
  estado.actual = p.id;
  estado.cantidad = 1;
  estado.alergias = [];

  const raiz = pantalla("detalle");
  const conModelo = Boolean(p.modelo);
  if (conModelo) {
    const visor = montarVisor(ref("visor", raiz), p);
    visor.classList.remove("cayendo");
    if (!visorVigilado) {
      visorVigilado = true;
      vigilarSacudida(visor, tirarPlatillo);
    }
  } else ref("visor", raiz).innerHTML = `<img src="${p.foto}" alt="">`;
  raiz.querySelector('[data-accion="ver-en-mi-mesa"]').hidden = !conModelo;
  raiz.querySelector(".pista-giro").hidden = !conModelo;
  ref("aviso-ar", raiz).hidden = true;

  texto("nombre", p.nombre, raiz);
  texto("precio", dinero.format(p.precio), raiz);
  texto("descripcion", p.descripcion, raiz);
  texto("contiene", p.contiene ? `Contiene: ${p.contiene}` : "", raiz);
  texto("porcion", p.porcion, raiz);
  texto("kcal", `≈ ${p.kcal} kcal`, raiz);
  texto("carbohidratos", p.carbohidratos, raiz);
  texto("carne", p.carne, raiz);
  texto("cantidad", estado.cantidad, raiz);
  ref("notas", raiz).value = "";
  pintarAlergias();
}

function pintarAlergias() {
  lista("alergias").replaceChildren(...ALERGIAS.map((a) => {
    const chip = copiar("alergia");
    const activa = estado.alergias.includes(a);
    chip.textContent = activa ? `✓ ${a}` : a;
    chip.dataset.valor = a;
    chip.classList.toggle("activo", activa);
    chip.setAttribute("aria-pressed", activa);
    return chip;
  }));
}

// ---------- "Se cayó el platillo" ----------

let detenerLluvia = null;
function tirarPlatillo() {
  const p = platillo(estado.actual);
  const caida = ref("caida");
  if (!p?.ingredientes || !caida.hidden || location.hash.indexOf("#platillo") !== 0) return;
  navigator.vibrate?.(180);
  document.querySelector(".visor-3d")?.classList.add("cayendo");
  texto("caida-nombre", p.nombre);
  lista("ingredientes").replaceChildren(...p.ingredientes.map(([emoji, nombre]) => {
    const chip = copiar("ingrediente");
    chip.textContent = `${emoji} ${nombre}`;
    return chip;
  }));
  caida.hidden = false;
  caida.classList.remove("con-tarjeta");
  setTimeout(() => {
    detenerLluvia = lluviaDeIngredientes(ref("lienzo-caida"), p.ingredientes.map(([e]) => e),
      () => caida.classList.add("con-tarjeta"));
  }, 350);
}

function cerrarCaida() {
  detenerLluvia?.();
  detenerLluvia = null;
  ref("caida").hidden = true;
  document.querySelector(".visor-3d")?.classList.remove("cayendo");
}

// ---------- Pedido, cuenta y pago ----------

function pintarLineas(contenedor, lineas, editable) {
  contenedor.replaceChildren(...lineas.map((l, i) => {
    const fila = copiar("linea-pedido");
    texto("cantidad", `${l.cantidad}×`, fila);
    texto("nombre", platillo(l.id).nombre, fila);
    texto("notas", l.notas || "", fila);
    texto("importe", dinero.format(importe(l)), fila);
    const quitar = fila.querySelector('[data-accion="quitar"]');
    if (editable) quitar.dataset.indice = i;
    else quitar.remove();
    return fila;
  }));
}

function pintarPedido() {
  pintarLineas(lista("pedido"), estado.pedido, true);
  const vacio = estado.pedido.length === 0;
  ref("pedido-vacio").hidden = !vacio;
  pantalla("pedido").querySelector(".total").hidden = vacio;
  texto("total-pedido", dinero.format(suma(estado.pedido)));
  document.querySelector('[data-accion="enviar-pedido"]').disabled = vacio;
}

function pintarEstado() {
  pintarLineas(lista("enviados"), estado.enviados, false);
}

const montoPropina = () => Math.round(suma(estado.enviados) * estado.propina) / 100;
const totalCuenta = () => suma(estado.enviados) + montoPropina();

function pintarPago() {
  texto("a-pagar", dinero.format(suma(estado.enviados)));
  const elegido = document.querySelector(`input[name="metodo"][value="${estado.metodo}"]`);
  if (elegido) elegido.checked = true;
}

function pintarCuenta() {
  pintarLineas(lista("cuenta"), estado.enviados, false);
  texto("subtotal", dinero.format(suma(estado.enviados)));
  const rango = ref("propina-rango");
  rango.value = estado.propina;
  pintarPropina();
  pintarPersonas();
  texto("metodo-resumen", `Pagas con: ${METODOS[estado.metodo] || ""}`);
}

function pintarPropina() {
  const rango = ref("propina-rango");
  const avance = (estado.propina / Number(rango.max)) * 100;
  rango.style.setProperty("--avance", `${avance}%`);
  texto("propina-valor", estado.propina ? `${estado.propina}%` : "Sin propina");
  texto("propina-monto", `${dinero.format(montoPropina())} de propina para el equipo de servicio`);
  pintarTotales();
}

function pintarPersonas() {
  texto("personas", estado.personas);
  lista("comensales").replaceChildren(...Array.from({ length: estado.personas }, (_, i) => {
    const persona = document.createElement("span");
    persona.className = "comensal";
    persona.textContent = i === 0 ? "Tú" : String(i + 1);
    persona.style.animationDelay = `${i * 40}ms`;
    return persona;
  }));
  ref("aviso-nfc").hidden = estado.personas < 2;
  pintarTotales();
}

function pintarTotales() {
  const total = totalCuenta();
  const parte = total / estado.personas;
  texto("total-cuenta", dinero.format(total));
  texto("por-persona", estado.personas > 1 ? `Cada quien paga ${dinero.format(parte)}` : "");
  texto("boton-pagar", estado.personas > 1 ? `mi parte · ${dinero.format(parte)}` : dinero.format(total));
}

function pintarGracias() {
  const mensajes = { tarjeta: "Un mesero llevará la terminal a tu mesa.", efectivo: "Un mesero pasará a cobrar a tu mesa.",
                     "en-linea": "Tu pago en línea quedó registrado." };
  texto("metodo-elegido", mensajes[estado.metodo] || "");
  pintarEstrellas(lista("encuesta"), estado.encuesta);
  pintarEstrellas(lista("encuesta-menu"), estado.encuestaMenu);
  ref("encuesta-gracias").hidden = !(estado.encuesta && estado.encuestaMenu);
  ref("resena-google").href = RESENA_GOOGLE;
}

function pintarEstrellas(contenedor, valor) {
  contenedor.replaceChildren(...[1, 2, 3, 4, 5].map((v) => {
    const estrella = copiar("opcion");
    estrella.textContent = "★";
    estrella.dataset.valor = v;
    estrella.setAttribute("aria-label", `${v} de 5`);
    estrella.classList.add("estrella");
    estrella.classList.toggle("activo", valor != null && v <= valor);
    return estrella;
  }));
}

function pintarBarra(destino) {
  const barra = ref("barra-pedido");
  const piezas = estado.pedido.reduce((n, l) => n + l.cantidad, 0);
  barra.hidden = piezas === 0 || destino !== "menu";
  texto("barra-cantidad", piezas);
  texto("barra-total", dinero.format(suma(estado.pedido)));
}

// ---------- Acciones (toques) ----------

const acciones = {
  ir: (el) => ir(el.dataset.destino),
  atras: () => history.back(),
  categoria: (el) => { estado.categoria = el.dataset.id; pintarMenu(); },
  "abrir-platillo": (el) => ir(`platillo/${el.dataset.id}`),
  "ver-en-mi-mesa": () => { ref("aviso-ar").hidden = verEnMiMesa(); },
  mas: () => texto("cantidad", ++estado.cantidad),
  menos: () => texto("cantidad", (estado.cantidad = Math.max(1, estado.cantidad - 1))),
  alergia: (el) => {
    const a = el.dataset.valor;
    estado.alergias = estado.alergias.includes(a) ? estado.alergias.filter((x) => x !== a) : [...estado.alergias, a];
    pintarAlergias();
  },
  agregar: () => {
    const nota = ref("notas", pantalla("detalle")).value.trim();
    const alergias = estado.alergias.length ? `Alergia: ${estado.alergias.join(", ")}` : "";
    const notas = [alergias, nota].filter(Boolean).join(" · ");
    estado.pedido.push({ id: estado.actual, cantidad: estado.cantidad, notas });
    avisar(`✓ ${platillo(estado.actual).nombre} agregado a tu pedido`);
    ir("menu");
  },
  quitar: (el) => { estado.pedido.splice(Number(el.dataset.indice), 1); pintarPedido(); },
  "enviar-pedido": () => {
    estado.enviados.push(...estado.pedido);
    estado.pedido = [];
    ir("estado");
  },
  "elegir-metodo": () => {
    estado.metodo = document.querySelector('input[name="metodo"]:checked')?.value || "tarjeta";
    ir("cuenta");
  },
  opcion: (el) => {
    const valor = Number(el.dataset.valor);
    if (el.closest('[data-lista="encuesta-menu"]')) estado.encuestaMenu = valor;
    else estado.encuesta = valor;
    pintarGracias();
  },
  "mas-personas": () => { estado.personas = Math.min(MAX_PERSONAS, estado.personas + 1); pintarPersonas(); },
  "menos-personas": () => { estado.personas = Math.max(1, estado.personas - 1); pintarPersonas(); },
  pagar: () => {
    estado.enviados = [];
    estado.personas = 1;
    estado.encuesta = null;
    estado.encuestaMenu = null;
    ir("gracias");
  },
  "volver-a-servir": () => { cerrarCaida(); reiniciarVisor(); },
};

document.addEventListener("click", (evento) => {
  const el = evento.target.closest("[data-accion]");
  if (!el || !acciones[el.dataset.accion]) return;
  acciones[el.dataset.accion](el);
  guardar();
  pintarBarra(document.body.dataset.vista);
});

// Deslizador de propina: cualquier porcentaje de 0 a 30.
ref("propina-rango").addEventListener("input", (evento) => {
  estado.propina = Number(evento.target.value);
  pintarPropina();
  guardar();
});

ref("aviso").addEventListener("animationend", (evento) => {
  if (evento.target.classList.contains("saliendo")) evento.target.hidden = true;
});

// ---------- Inicio ----------

cargar();
texto("mesa", estado.mesa ? `Mesa ${estado.mesa}` : "");
window.addEventListener("hashchange", mostrar);
mostrar();
