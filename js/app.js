// Lógica del menú digital: navegación, grupo, pedido, estado del pedido, cuenta, pago y encuestas.
// No depende del diseño: busca los elementos por sus atributos data-* (ver README.md).

import { CATEGORIAS, PLATILLOS, PROPINA_INICIAL, MAX_PERSONAS, ALERGIAS, MESERO, RESENA_GOOGLE, NIVELES, CALIFICAR, ASPECTOS_CHEF } from "./datos.js?v=202611101409";
import { montarVisor, verEnMiMesa, reiniciarVisor } from "./ar.js?v=202611101409";
import { personalizar, eleccionInicial, textoEleccion } from "./mesa.js?v=202611101409";
import { vigilarSacudida, lluviaDeIngredientes } from "./caida.js?v=202611101409";
import { prepararAudio, escucharDesbloqueo, desbloquearAudio, sonar, vibrar, sentir, efecto, sonidoEstrella, sonidoCarita, sonidoToque, sonidoPropina } from "./sonido.js?v=202611101409";
import { icono, carita, billete, monedaSvg } from "./iconos.js?v=202611101409";
import { iniciarIntro } from "./intro.js?v=202611101409";
import { iniciarFondo, pedirMovimiento } from "./fondo.js?v=202611101409";

const ORDEN = ["bienvenida", "mesa", "menu", "detalle", "pedido", "estado", "pago", "cuenta", "gracias"];
const FRASES = ["El menú se digitaliza.", "Acerca tu celular.", "Elige tu platillo.", "Míralo en tu mesa.", "Pídelo.",
  "Paga todo desde un mismo lugar."];
const ETAPAS = [
  { a: 0, titulo: "¡Pedido recibido!", texto: "Cocina ya tiene tu pedido." },
  { a: 5000, titulo: "Preparando tus alimentos", texto: "El chef ya está cocinando." },
  { a: 10000, titulo: "¡Ya está en tu mesa!", texto: "Buen provecho." },
];
const CADA_FRASE = 3000; // ms que dura cada frase del héroe
const LEYENDA_ESTRELLAS = ["", "Malo", "Regular", "Bueno", "Muy bueno", "Excelente"];
const COLORES_PERSONA = ["#F26B1D", "#2E9E6A", "#F6C445", "#1F1F1F", "#E0533A", "#4A90C2"];
const METODOS = { tarjeta: "Tarjeta (terminal en la mesa)", "en-linea": "Pago en línea", efectivo: "Efectivo" };

const estado = {
  mesa: new URLSearchParams(location.search).get("mesa"),
  categoria: CATEGORIAS[0].id,
  actual: null, // id del platillo abierto
  cantidad: 1,
  alergias: [], // alergias marcadas en el platillo abierto
  para: 0, // a quién se le carga el platillo abierto (índice en grupo.personas)
  grupo: { personas: ["Tú"], modo: "iguales" },
  pedido: [],   // lo que aún no se envía a cocina: { id, cantidad, notas, para }
  enviados: [], // lo que ya se envió y va a la cuenta
  pedidoEn: null, // hora en que se pidió (para recibido → preparando → en tu mesa)
  etapaVista: -1,
  propina: PROPINA_INICIAL,
  propinas: {}, // propina de cada persona (índice → %), si la cambió
  pagaCon: 0, // en efectivo: opción elegida en la barra de billetes
  ultimoPago: null,
  dividir: "iguales",
  personasIguales: 1,
  quienPaga: 0, // en "lo que consumí": índice de la persona que paga ahora (-1 = toda la mesa)
  metodo: "tarjeta",
  calif: { mesero: null, chef: null, motivos: { mesero: [], chef: [] }, aspectos: {} },
  encuesta: null,
  encuestaMenu: null,
  google: null,
};

// ---------- Utilidades ----------

const dinero = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const pantalla = (nombre) => document.querySelector(`[data-pantalla="${nombre}"]`);
const ref = (nombre, raiz = document) => raiz.querySelector(`[data-ref="${nombre}"]`);
const lista = (nombre) => document.querySelector(`[data-lista="${nombre}"]`);
const platillo = (id) => PLATILLOS.find((p) => p.id === id);
const importe = (linea) => platillo(linea.id).precio * linea.cantidad;
const suma = (lineas) => lineas.reduce((total, l) => total + importe(l), 0);
const personas = () => estado.grupo.personas;
const conAmigos = () => personas().length > 1;
const vistaActual = () => document.body.dataset.vista;

function copiar(plantilla) {
  return document.querySelector(`[data-plantilla="${plantilla}"]`).content.firstElementChild.cloneNode(true);
}

function texto(nombre, valor, raiz) {
  const el = ref(nombre, raiz);
  if (el) el.textContent = valor;
}

// Reinicia una animación CSS quitando y poniendo la clase.
function reanimar(el, clase) {
  el.classList.remove(clase);
  void el.offsetWidth;
  el.classList.add(clase);
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
function avisar(mensaje, dibujo = "check") {
  const aviso = ref("aviso");
  aviso.innerHTML = `<span class="aviso-icono aviso-${dibujo}">${icono(dibujo)}</span>`;
  aviso.append(mensaje);
  aviso.hidden = false;
  reanimar(aviso, "entrando");
  aviso.classList.remove("saliendo");
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => aviso.classList.add("saliendo"), 2400);
}

function avatar(el, i) {
  const nombre = personas()[i] ?? String(i + 1);
  el.textContent = nombre === "Tú" ? "Tú" : nombre.slice(0, 1).toUpperCase();
  el.style.background = COLORES_PERSONA[i % COLORES_PERSONA.length];
}

// ---------- Navegación ----------
// Cada pantalla tiene su dirección: #menu, #platillo/pasta, #pedido, #cuenta...

function ir(destino) {
  location.hash = destino;
}

function mostrar() {
  const [nombre = "bienvenida", parametro] = location.hash.slice(1).split("/");
  const destino = nombre === "platillo" ? "detalle" : nombre || "bienvenida";
  if (!pantalla(destino)) return ir("bienvenida");

  const antes = ORDEN.indexOf(vistaActual());
  document.body.dataset.dir = antes > ORDEN.indexOf(destino) ? "atras" : "adelante";
  document.querySelectorAll("[data-pantalla]").forEach((s) => (s.hidden = s.dataset.pantalla !== destino));
  document.body.dataset.vista = destino;
  document.querySelector('[data-accion="atras"]').hidden = destino === "bienvenida";
  cerrarCaida();
  ({ bienvenida: pintarBienvenida, mesa: pintarMesa, menu: pintarMenu, detalle: () => pintarDetalle(parametro),
     pedido: pintarPedido, estado: pintarEstado, pago: pintarPago, cuenta: pintarCuenta, gracias: pintarGracias })[destino]?.();
  pintarBarra();
  window.scrollTo(0, 0);
}

// ---------- 1. Bienvenida ----------

let fraseTimer;
let observador;
// Cada frase entra palabra por palabra desde una máscara (con un subrayado que se dibuja) y la anterior
// sale hacia arriba desenfocándose.
function ponerFrase(titulo, texto) {
  const vieja = titulo.querySelector(".heroe-frase:not(.sale)");
  if (vieja) {
    vieja.classList.add("sale");
    vieja.removeAttribute("data-ref");
    setTimeout(() => vieja.remove(), 700);
  }
  const frase = document.createElement("span");
  frase.className = "heroe-frase";
  frase.dataset.ref = "frase-heroe";
  const palabras = texto.split(" ");
  palabras.forEach((p, i) => {
    const caja = document.createElement("span");
    caja.className = "palabra";
    const interior = document.createElement("span");
    interior.textContent = p;
    interior.style.setProperty("--i", i);
    caja.append(interior);
    frase.append(caja, i < palabras.length - 1 ? " " : "");
  });
  frase.style.setProperty("--n", palabras.length);
  titulo.append(frase);
}

function pintarBienvenida() {
  texto("saludo", estado.mesa ? `Bienvenido a la mesa ${estado.mesa}` : "Bienvenido");
  let i = 0;
  const titulo = document.querySelector(".heroe-titulo");
  titulo.replaceChildren();
  const puntos = lista("puntos-heroe");
  puntos.replaceChildren(...FRASES.map(() => document.createElement("i")));
  puntos.style.setProperty("--dura", `${CADA_FRASE}ms`);
  const poner = () => {
    ponerFrase(titulo, FRASES[i]);
    [...puntos.children].forEach((p, k) => {
      p.classList.toggle("activo", k === i);
      p.classList.toggle("visto", k < i);
    });
    i = (i + 1) % FRASES.length;
  };
  clearInterval(fraseTimer);
  poner();
  fraseTimer = setInterval(() => (vistaActual() === "bienvenida" ? poner() : clearInterval(fraseTimer)), CADA_FRASE);

  // Los pasos se animan cuando aparecen en pantalla.
  const pasos = document.querySelectorAll(".paso");
  if (!("IntersectionObserver" in window)) return pasos.forEach((p) => p.classList.add("visible"));
  observador ??= new IntersectionObserver((entradas) => {
    entradas.forEach((e) => e.isIntersecting && e.target.classList.add("visible"));
  }, { threshold: 0.3 });
  pasos.forEach((p) => observador.observe(p));
}

// ---------- 2. ¿Solo o con amigos? ----------

function pintarMesa() {
  ref("grupo").hidden = !conAmigos() && !ref("opcion-amigos").classList.contains("activo");
  ref("opcion-amigos").classList.toggle("activo", !ref("grupo").hidden);
  lista("personas-grupo").replaceChildren(...personas().map((nombre, i) => {
    const p = copiar("persona");
    avatar(p.querySelector(".persona-avatar"), i);
    p.querySelector(".persona-nombre").textContent = nombre;
    const quitar = p.querySelector(".persona-quitar");
    if (i === 0) quitar.remove();
    else quitar.dataset.indice = i;
    return p;
  }));
  document.querySelectorAll('[data-accion="modo"]').forEach((b) => b.classList.toggle("activo", b.dataset.valor === estado.grupo.modo));
}

// ---------- 3. Menú ----------

function pintarMenu() {
  precargarModelos();
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
    tarjeta.style.animationDelay = `${i * 80}ms`;
    ref("foto", tarjeta).src = p.miniatura ?? p.foto;
    texto("nombre", p.nombre, tarjeta);
    texto("descripcion", p.descripcion, tarjeta);
    texto("precio", dinero.format(p.precio), tarjeta);
    ref("etiqueta-ar", tarjeta).hidden = !p.modelo;
    return tarjeta;
  }));
}

// ---------- 4. Detalle ----------

let visorVigilado = false;
function pintarDetalle(id) {
  const p = platillo(id);
  if (!p) return ir("menu");
  estado.actual = p.id;
  estado.cantidad = 1;
  estado.alergias = [];
  estado.personal = eleccionInicial(p); // ingredientes puestos o quitados con los botones del visor

  const raiz = pantalla("detalle");
  const conModelo = Boolean(p.modelo);
  if (conModelo) {
    const visor = montarVisor(ref("visor", raiz), p, { alAgregar: agregarDesdeRA });
    visor.classList.remove("cayendo");
    personalizar(visor, p, estado.personal, { alCambiar: (eleccion) => { estado.personal = eleccion; } });
    if (!visorVigilado) {
      visorVigilado = true;
      vigilarSacudida(visor, tirarPlatillo);
      // iPhone necesita permiso para leer la sacudida: se pide la primera vez que tocan el platillo.
      visor.addEventListener("pointerdown", pedirMovimiento, { once: true });
    }
  } else ref("visor", raiz).innerHTML = `<img src="${p.foto}" alt="">`;
  raiz.querySelector('[data-accion="ver-en-mi-mesa"]').hidden = !conModelo;
  raiz.querySelector(".pista-giro").hidden = !conModelo;
  ref("aviso-ar", raiz).hidden = true;

  texto("nombre", p.nombre, raiz);
  texto("precio", dinero.format(p.precio), raiz);
  texto("descripcion", p.descripcion, raiz);
  ref("contiene", raiz).innerHTML = p.contiene ? `${icono("alerta")}<span>Contiene: ${p.contiene}</span>` : "";
  texto("porcion", p.porcion, raiz);
  texto("kcal", `${p.kcal} kcal`, raiz);
  texto("carbohidratos", p.carbohidratos, raiz);
  texto("carne", p.carne, raiz);
  ref("notas", raiz).value = "";
  ref("otra-alergia", raiz).value = "";
  pintarCantidad();
  pintarAlergias();
  pintarParaQuien();
}

function pintarCantidad() {
  texto("cantidad", estado.cantidad);
  texto("precio-agregar", `· ${dinero.format(platillo(estado.actual).precio * estado.cantidad)}`);
}

function pintarAlergias() {
  lista("alergias").replaceChildren(...ALERGIAS.map((a) => {
    const boton = copiar("alergia");
    const activa = estado.alergias.includes(a.id);
    boton.querySelector(".alergia-icono").innerHTML = icono(a.icono);
    pintarIconos(boton);
    boton.querySelector(".alergia-nombre").textContent = a.nombre;
    boton.dataset.valor = a.id;
    boton.classList.toggle("activo", activa);
    boton.setAttribute("aria-pressed", activa);
    return boton;
  }));
}

function pintarParaQuien() {
  const visible = conAmigos() && estado.grupo.modo === "consumo";
  ref("para-quien").hidden = !visible;
  if (!visible) return;
  estado.para = Math.min(estado.para, personas().length - 1);
  lista("para-quien").replaceChildren(...personas().map((nombre, i) => {
    const chip = copiar("opcion");
    chip.dataset.accion = "para";
    chip.dataset.valor = i;
    chip.textContent = nombre;
    chip.classList.add("chip-persona");
    chip.style.setProperty("--color", COLORES_PERSONA[i % COLORES_PERSONA.length]);
    chip.classList.toggle("activo", i === estado.para);
    return chip;
  }));
}

function agregar({ desdeRA = false } = {}) {
  const raiz = pantalla("detalle");
  const otra = ref("otra-alergia", raiz).value.trim();
  const nombres = estado.alergias.map((id) => ALERGIAS.find((a) => a.id === id).nombre);
  if (otra) nombres.push(otra);
  const nota = ref("notas", raiz).value.trim();
  const version = textoEleccion(platillo(estado.actual), estado.personal);
  const notas = [version, nombres.length ? `Alergia: ${nombres.join(", ")}` : "", nota].filter(Boolean).join(" · ");
  const para = conAmigos() && estado.grupo.modo === "consumo" ? estado.para : 0;
  estado.pedido.push({ id: estado.actual, cantidad: estado.cantidad, notas, para });
  const p = platillo(estado.actual);
  efecto("agregar");
  if (!desdeRA) volarAlPedido(p.foto);
  avisar(`${p.nombre} se agregó a tu pedido`);
  guardar();
}

// Desde el banner de AR Quick Look (iPhone): "Agregar al pedido" sin salir de la cámara.
function agregarDesdeRA() {
  agregar({ desdeRA: true });
  pintarBarra();
}

// La foto del platillo vuela hacia la barra del pedido.
function volarAlPedido(foto) {
  const origen = document.querySelector(".escenario")?.getBoundingClientRect();
  if (!origen) return;
  const img = document.createElement("img");
  img.src = foto;
  img.className = "vuela";
  const lado = Math.min(origen.width, origen.height) * 0.6;
  Object.assign(img.style, { left: `${origen.left + (origen.width - lado) / 2}px`, top: `${origen.top + (origen.height - lado) / 2}px`, width: `${lado}px`, height: `${lado}px` });
  document.body.append(img);
  const dx = window.innerWidth / 2 - (origen.left + origen.width / 2);
  const dy = window.innerHeight - 40 - (origen.top + origen.height / 2);
  img.animate([
    { transform: "translate(0,0) scale(1) rotate(0)", opacity: 1 },
    { transform: `translate(${dx * 0.4}px, ${dy * 0.2 - 60}px) scale(.55) rotate(-12deg)`, opacity: 1, offset: 0.45 },
    { transform: `translate(${dx}px, ${dy}px) scale(.12) rotate(20deg)`, opacity: 0.6 },
  ], { duration: 700, easing: "cubic-bezier(.5,0,.6,1)" }).finished.then(() => {
    img.remove();
    reanimar(ref("barra-pedido"), "brinco");
  });
  // Con temporizador (no al terminar la animación): así sigue "dentro del toque" y el iPhone deja vibrar.
  setTimeout(() => efecto("llega"), 700);
}

// ---------- "Se cayó el platillo" ----------

let detenerLluvia = null;
function tirarPlatillo() {
  const p = platillo(estado.actual);
  const caida = ref("caida");
  if (!p?.ingredientes || !caida.hidden || vistaActual() !== "detalle") return;
  sentir("plate", [260, 80, 160, 80, 320], 0.8);
  document.querySelector(".visor-3d")?.classList.add("cayendo");
  texto("caida-nombre", p.nombre);
  lista("ingredientes").replaceChildren(...p.ingredientes.map(([dibujo, nombre]) => {
    const chip = copiar("ingrediente");
    chip.innerHTML = icono(dibujo);
    chip.append(nombre);
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

// ---------- 5. Pedido ----------

function pintarLineas(contenedor, lineas, editable) {
  contenedor.replaceChildren(...lineas.map((l, i) => {
    const fila = copiar("linea-pedido");
    texto("cantidad", `${l.cantidad}×`, fila);
    texto("nombre", platillo(l.id).nombre, fila);
    const quien = conAmigos() && estado.grupo.modo === "consumo" ? `Para ${personas()[l.para] ?? "todos"}` : "";
    texto("notas", [quien, l.notas].filter(Boolean).join(" · "), fila);
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

// ---------- 6. Estado: recibido → preparando → en tu mesa ----------

const etapaActual = () => {
  if (!estado.pedidoEn) return 0;
  const t = Date.now() - estado.pedidoEn;
  return ETAPAS.reduce((e, etapa, i) => (t >= etapa.a ? i : e), 0);
};

let animarSello = false;
function pintarEstado(animar = false) {
  animar ||= animarSello;
  animarSello = false;
  pintarLineas(lista("enviados"), estado.enviados, false);
  const etapa = etapaActual();
  texto("estado-titulo", ETAPAS[etapa].titulo);
  texto("estado-texto", ETAPAS[etapa].texto);
  pintarProgreso(etapa);
  if (estado.pedidoEn) texto("hora-0", new Date(estado.pedidoEn).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" }));
  ref("cocina").hidden = etapa !== 1;
  const sello = ref("sello-ok");
  sello.classList.toggle("en-mesa", etapa === 2);
  sello.classList.toggle("quieto", !animar);
  if (animar) reanimar(sello, "sella");
}

// Línea del tiempo: lo hecho en verde, lo que está pasando en amarillo y lo que sigue en espera (punteado).
// El tramo hacia la siguiente etapa se va llenando con el tiempo real del pedido.
function pintarProgreso(etapa = etapaActual()) {
  const t = estado.pedidoEn ? Date.now() - estado.pedidoEn : 0;
  ref("progreso").querySelectorAll("li").forEach((li) => {
    const n = Number(li.dataset.etapa);
    const enCurso = n === etapa && n === 1;
    li.classList.toggle("hecho", n <= etapa && !enCurso);
    li.classList.toggle("actual", enCurso);
    li.classList.toggle("espera", n > etapa);
    li.classList.toggle("siguiente", n === etapa + 1);
    const desde = ETAPAS[n - 1]?.a ?? 0;
    const avance = n <= etapa ? 1 : n === etapa + 1 ? Math.min(1, (t - desde) / (ETAPAS[n].a - desde)) : 0;
    li.style.setProperty("--avance", avance.toFixed(3));
  });
}

// Revisa cada medio segundo si el pedido cambió de etapa; vibra y suena en cada una.
function revisarEtapa() {
  if (!estado.pedidoEn) return;
  if (vistaActual() === "estado") pintarProgreso();
  const etapa = etapaActual();
  if (etapa <= estado.etapaVista) return;
  estado.etapaVista = etapa;
  guardar();
  if (etapa === 1) efecto("preparando");
  if (etapa === 2) efecto("en-mesa");
  if (vistaActual() === "estado") pintarEstado(true);
  else if (etapa > 0) avisar(etapa === 2 ? "¡Tu pedido ya está en tu mesa!" : "Están preparando tus alimentos", etapa === 2 ? "en-mesa" : "preparando");
}

// ---------- 7–8. Pago y cuenta ----------
// Cada quien puede dejar su propia propina. Con tarjeta la propina se elige en la terminal; en efectivo se elige
// el billete y se ve cuánto dejar y cuánto le regresan.

const propinaLibre = () => estado.metodo !== "tarjeta";
const pctDe = (i) => (i >= 0 ? estado.propinas[i] ?? estado.propina : estado.propina);
const nombreDe = (i) => personas()[i] ?? `Persona ${i + 1}`;

// Lo que consume cada quien (sin propina): partes iguales o lo suyo + su parte de lo compartido.
function bases() {
  const consumo = suma(estado.enviados);
  if (estado.dividir !== "consumo") return Array(estado.personasIguales).fill(consumo / estado.personasIguales);
  const n = personas().length;
  const c = Array(n).fill(0);
  for (const l of estado.enviados) {
    if (l.para >= 0 && l.para < n) c[l.para] += importe(l);
    else c.forEach((_, i) => (c[i] += importe(l) / n));
  }
  return c;
}

function cuentas() {
  return bases().map((base, i) => {
    const propina = propinaLibre() ? Math.round(base * pctDe(i)) / 100 : 0;
    return { base, propina, pct: pctDe(i), total: base + propina };
  });
}

// Lo que paga quien paga ahora (una persona o toda la mesa).
function aPagar() {
  const cs = cuentas();
  if (estado.quienPaga >= cs.length) estado.quienPaga = 0;
  const q = cs.length > 1 ? estado.quienPaga : -1;
  if (q >= 0) return { ...cs[q], quien: q, nombre: nombreDe(q) };
  const base = cs.reduce((s, c) => s + c.base, 0);
  const propina = cs.reduce((s, c) => s + c.propina, 0);
  return { base, propina, total: base + propina, pct: estado.propina, quien: -1, nombre: "Toda la mesa" };
}

// Efectivo: "exacto" y luego los billetes (o montos redondos) con los que alcanza.
const BILLETES = [1000, 500, 200, 100, 50, 20];
function opcionesEfectivo(monto) {
  const opciones = new Set([Math.ceil(monto)]);
  for (const b of [50, 100, 200, 500, 1000]) opciones.add(Math.ceil((monto + 0.001) / b) * b);
  return [...opciones].filter((v) => v <= monto + 1000).sort((x, y) => x - y).slice(0, 6);
}
// Cómo juntar un monto con billetes (y monedas para lo que sobra).
function desglosar(monto) {
  const piezas = [];
  let resto = Math.round(monto);
  for (const b of BILLETES) while (resto >= b) { piezas.push(b); resto -= b; }
  for (const m of [10, 5, 2, 1]) while (resto >= m) { piezas.push(m); resto -= m; }
  return piezas;
}

function pintarPago() {
  texto("a-pagar", dinero.format(suma(estado.enviados)));
  const elegido = document.querySelector(`input[name="metodo"][value="${estado.metodo}"]`);
  if (elegido) elegido.checked = true;
}

function pintarCuenta() {
  texto("subtotal", dinero.format(suma(estado.enviados)));
  const metodo = estado.metodo;
  ref("metodo-resumen").innerHTML = `${icono(metodo)}<span>Pagas con ${METODOS[metodo] || ""}</span>`;
  texto("titulo-cuenta", { efectivo: "Cuenta en efectivo", tarjeta: "Cuenta con tarjeta", "en-linea": "Cuenta clara" }[metodo]);
  pintarDivision();
}

function pintarDivision() {
  const consumo = estado.dividir === "consumo";
  document.querySelectorAll('[data-accion="dividir"]').forEach((b) => {
    b.classList.toggle("activo", b.dataset.valor === estado.dividir);
    b.setAttribute("aria-selected", b.dataset.valor === estado.dividir);
  });
  ref("panel-iguales").hidden = consumo;
  ref("panel-consumo").hidden = !consumo;
  texto("personas", estado.personasIguales);

  if (consumo) {
    lista("asignar").replaceChildren(...estado.enviados.map((l, i) => {
      const fila = copiar("asignacion");
      fila.querySelector(".asignacion-nombre").textContent = `${l.cantidad}× ${platillo(l.id).nombre} · ${dinero.format(importe(l))}`;
      const chip = fila.querySelector(".chip-persona");
      chip.dataset.indice = i;
      chip.textContent = l.para >= 0 ? personas()[l.para] ?? "Tú" : "Entre todos";
      chip.style.setProperty("--color", l.para >= 0 ? COLORES_PERSONA[l.para % COLORES_PERSONA.length] : "#6E6259");
      return fila;
    }));
  }

  // Quién paga ahora: cada persona con su parte y su propina, o toda la mesa.
  const cs = cuentas();
  const pago = aPagar();
  const varios = cs.length > 1;
  ref("bloque-quien").hidden = !varios;
  ref("aviso-nfc").hidden = !varios;
  if (varios) {
    const filas = cs.map((c, i) => {
      const fila = copiar("reparto");
      fila.dataset.valor = i;
      avatar(fila.querySelector(".persona-avatar"), i);
      fila.querySelector(".reparto-nombre").textContent = nombreDe(i);
      const que = consumo
        ? (() => { const n = estado.enviados.filter((l) => l.para === i).reduce((s, l) => s + l.cantidad, 0); return `${n} platillo${n === 1 ? "" : "s"}`; })()
        : "parte igual";
      fila.querySelector(".reparto-detalle").textContent = propinaLibre() ? `${que} · propina ${c.pct}%` : `${que} · + propina en la terminal`;
      fila.querySelector(".reparto-monto").textContent = dinero.format(c.total);
      fila.classList.toggle("activo", pago.quien === i);
      return fila;
    });
    const todos = copiar("reparto");
    todos.dataset.valor = -1;
    const avatarTodos = todos.querySelector(".persona-avatar");
    avatarTodos.innerHTML = icono("grupo");
    avatarTodos.style.background = "var(--carbon)";
    todos.querySelector(".reparto-nombre").textContent = "Toda la mesa";
    todos.querySelector(".reparto-detalle").textContent = "una sola persona paga todo";
    todos.querySelector(".reparto-monto").textContent = dinero.format(cs.reduce((s, c) => s + c.total, 0));
    todos.classList.toggle("activo", pago.quien === -1);
    lista("reparto").replaceChildren(...filas, todos);
  }

  // Propina de quien paga ahora (con tarjeta la elige la terminal).
  ref("bloque-propina").hidden = !propinaLibre();
  ref("aviso-terminal").hidden = propinaLibre();
  if (propinaLibre()) {
    const rango = ref("propina-rango");
    rango.value = pago.pct;
    rango.style.setProperty("--avance", `${(pago.pct / Number(rango.max)) * 100}%`);
    texto("propina-quien", !varios || pago.quien === 0 ? "Tu propina" : pago.quien === -1 ? "Propina de toda la mesa" : `Propina de ${pago.nombre}`);
    texto("propina-valor", pago.pct ? `${pago.pct}%` : "Sin propina");
    texto("propina-monto", `${dinero.format(pago.propina)} de propina sobre ${dinero.format(pago.base)} de consumo`);
  }

  pintarEfectivo(pago);

  const quien = !varios ? "" : pago.quien === -1 ? "todo" : pago.quien === 0 ? "lo mío" : `lo de ${pago.nombre}`;
  texto("total-etiqueta", varios && pago.quien !== -1 ? `Paga ${pago.nombre === "Tú" ? "tú" : pago.nombre}` : "Total");
  texto("total-cuenta", dinero.format(pago.total));
  texto("por-persona", estado.metodo === "tarjeta" ? "+ la propina que elijas en la terminal" : "");
  const verbo = { efectivo: "Listo, pago en efectivo", tarjeta: "Pedir la terminal", "en-linea": "Pagar" }[estado.metodo];
  texto("boton-pagar", `${verbo}${quien ? ` ${quien}` : ""} · ${dinero.format(pago.total)}`);
}

// Efectivo: barra para elegir el billete, los billetes dibujados y cuánto dejar, de propina y de cambio.
function pintarEfectivo(pago = aPagar()) {
  const bloque = ref("bloque-efectivo");
  bloque.hidden = estado.metodo !== "efectivo";
  if (bloque.hidden) return;
  const opciones = opcionesEfectivo(pago.total);
  estado.pagaCon = Math.min(estado.pagaCon ?? 0, opciones.length - 1);
  const rango = ref("billete-rango");
  rango.max = opciones.length - 1;
  rango.value = estado.pagaCon;
  rango.style.setProperty("--avance", `${opciones.length > 1 ? (estado.pagaCon / (opciones.length - 1)) * 100 : 100}%`);
  lista("marcas-billete").replaceChildren(...opciones.map((v, i) => {
    const m = document.createElement("span");
    m.textContent = i === 0 ? "Exacto" : `$${v}`;
    m.classList.toggle("activo", i === estado.pagaCon);
    return m;
  }));
  const con = opciones[estado.pagaCon];
  const cambio = con - pago.total;
  texto("paga-con", estado.pagaCon === 0 ? "Exacto" : `$${con}`);
  const piezas = desglosar(con);
  ref("billetes").innerHTML = piezas.map((v, i) => `<span class="billete-pieza" style="--i:${i}">${v >= 20 ? billete(v) : monedaSvg(v)}</span>`).join("");
  ref("desglose").innerHTML = `
    <div><dt>Consumo</dt><dd>${dinero.format(pago.base)}</dd></div>
    <div><dt>Propina (${pago.pct}%)</dt><dd>${dinero.format(pago.propina)}</dd></div>
    <div class="fuerte"><dt>Total a dejar</dt><dd>${dinero.format(pago.total)}</dd></div>
    <div><dt>Pagas con</dt><dd>${dinero.format(con)}</dd></div>
    <div class="cambio"><dt>Te regresan</dt><dd>${dinero.format(Math.max(0, cambio))}</dd></div>`;
}

// ---------- 9. Gracias ----------

function pintarGracias() {
  pintarAvisoPago();
  texto("mesero-nombre", MESERO.nombre);
  pintarCalificacion("mesero");
  pintarCalificacion("chef");
  pintarAspectos();
  pintarEstrellas(lista("encuesta"), estado.encuesta);
  pintarEstrellas(lista("encuesta-menu"), estado.encuestaMenu);
  pintarEstrellas(lista("estrellas-google"), estado.google);
  pintarGraciasEncuesta();
}

// Mensaje grande según cómo pagó: qué va a pasar y, en efectivo, qué tener listo.
function pintarAvisoPago() {
  const u = estado.ultimoPago ?? { metodo: estado.metodo };
  const titulos = { efectivo: "Un mesero irá a tu mesa en un momento", tarjeta: "Un mesero irá con la terminal",
                    "en-linea": "¡Tu pago quedó listo!" };
  ref("aviso-pago").dataset.metodo = u.metodo;
  ref("aviso-pago-icono").innerHTML = icono(u.metodo === "en-linea" ? "en-linea" : u.metodo === "tarjeta" ? "tarjeta" : "efectivo");
  texto("aviso-pago-titulo", titulos[u.metodo] ?? "");
  const fila = (dt, dd, clase = "") => `<div class="${clase}"><dt>${dt}</dt><dd>${dd}</dd></div>`;
  let detalle = "";
  if (u.total != null) {
    if (u.metodo === "efectivo") {
      detalle = fila("Ten listos", dinero.format(u.con), "fuerte") + fila("Ya incluye de propina", dinero.format(u.propina)) +
        fila("Te regresan", dinero.format(Math.max(0, u.con - u.total)), "cambio");
    } else if (u.metodo === "tarjeta") {
      detalle = fila("Se cobra", dinero.format(u.total), "fuerte") + `<p class="nota">La propina la eliges en la terminal.</p>`;
    } else {
      detalle = fila("Pagaste", dinero.format(u.total), "fuerte") + fila("Propina incluida", dinero.format(u.propina));
    }
  }
  ref("aviso-pago-detalle").innerHTML = detalle;
}

function pintarGraciasEncuesta() {
  const { mesero, chef } = estado.calif;
  ref("encuesta-gracias").hidden = !(estado.encuesta && estado.encuestaMenu && mesero != null && chef != null);
}

// Caritas (mesero o chef) y, debajo, el mensaje con los motivos posibles de la carita elegida.
function pintarCalificacion(quien) {
  const elegida = estado.calif[quien];
  const caritas = lista(`caritas-${quien}`);
  if (caritas.children.length !== NIVELES.length) {
    caritas.replaceChildren(...NIVELES.map((nombre, i) => {
      const b = document.createElement("button");
      b.className = "carita";
      b.dataset.accion = "carita";
      b.dataset.quien = quien;
      b.dataset.valor = i;
      b.style.setProperty("--i", i);
      b.innerHTML = `${carita(i + 1)}<span class="carita-nombre">${nombre}</span>`;
      b.setAttribute("aria-label", nombre);
      return b;
    }));
  }
  [...caritas.children].forEach((b, i) => {
    b.classList.toggle("activo", elegida === i);
    b.classList.toggle("apagada", elegida != null && elegida !== i);
    b.setAttribute("aria-pressed", elegida === i);
  });
  const caja = ref(`motivos-${quien}`);
  caja.hidden = elegida == null;
  if (elegida == null) return;
  const { mensaje, motivos } = CALIFICAR[quien][elegida];
  caja.dataset.nivel = elegida + 1;
  texto(`mensaje-${quien}`, mensaje);
  lista(`motivos-${quien}`).replaceChildren(...motivos.map((m, i) => {
    const chip = copiar("opcion");
    chip.dataset.accion = "motivo";
    chip.dataset.quien = quien;
    chip.dataset.valor = m;
    chip.textContent = m;
    chip.style.setProperty("--i", i);
    chip.classList.add("chip-motivo");
    chip.classList.toggle("activo", estado.calif.motivos[quien].includes(m));
    return chip;
  }));
}

function pintarAspectos() {
  const contenedor = lista("aspectos-chef");
  if (!contenedor.children.length) {
    contenedor.replaceChildren(...ASPECTOS_CHEF.map((nombre) => {
      const fila = document.createElement("div");
      fila.className = "aspecto";
      fila.innerHTML = `<span>${nombre}</span><div class="estrellas chicas" data-lista="aspecto" data-aspecto="${nombre}"></div>`;
      return fila;
    }));
  }
  contenedor.querySelectorAll('[data-lista="aspecto"]').forEach((c) => pintarEstrellas(c, estado.calif.aspectos[c.dataset.aspecto]));
}

// Estrellas: se arman una sola vez y luego solo cambian de estado, para que la animación sea continua.
// Al elegir, el relleno florece desde el centro de cada estrella, en cadena hasta la elegida, y la elegida brilla.
const ESTRELLA = "M12 2.9c.4 0 .7.2.9.6l2.3 4.7 5.2.8c.8.1 1.1 1.1.5 1.7l-3.8 3.7.9 5.2c.1.8-.7 1.4-1.4 1L12 18.2l-4.6 2.4c-.7.4-1.5-.2-1.4-1l.9-5.2-3.8-3.7c-.6-.6-.3-1.6.5-1.7l5.2-.8 2.3-4.7c.2-.4.5-.6.9-.6z";
function pintarEstrellas(contenedor, valor, animar = false) {
  const google = contenedor.classList.contains("google-estrellas");
  if (contenedor.querySelectorAll(".estrella").length !== 5) {
    const botones = [1, 2, 3, 4, 5].map((v, i) => {
      const b = document.createElement("button");
      b.className = "estrella";
      b.dataset.accion = "estrella";
      b.dataset.valor = v;
      b.setAttribute("aria-label", `${v} de 5`);
      b.style.setProperty("--i", i);
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
        <path class="estrella-fondo" d="${ESTRELLA}"/>
        <path class="estrella-relleno" d="${ESTRELLA}" fill="url(#${google ? "estrella-google" : "estrella-chefi"})"/>
        <path class="estrella-brillo" d="M8.6 7.6l1.2-2.3"/>
        <g class="estrella-chispa"><path d="M20.6 1.4l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z"/></g>
      </svg><span class="estrella-halo"></span>`;
      return b;
    });
    const leyenda = document.createElement("span");
    leyenda.className = "estrellas-leyenda";
    contenedor.replaceChildren(...botones, leyenda);
  }
  const antes = Number(contenedor.dataset.valor || 0);
  contenedor.dataset.valor = valor ?? 0;
  contenedor.querySelectorAll(".estrella").forEach((b, i) => {
    const v = i + 1;
    // Las que se llenan van en cadena desde la última que ya estaba llena; las que se vacían, al revés y rápido.
    const retraso = v > antes ? (v - antes - 1) * 55 : (antes - v) * 25;
    b.style.setProperty("--retraso", `${animar ? retraso : 0}ms`);
    b.classList.toggle("activo", valor != null && v <= valor);
    b.classList.toggle("elegida", animar && v === valor);
    b.setAttribute("aria-pressed", valor != null && v <= valor);
  });
  const leyenda = contenedor.querySelector(".estrellas-leyenda");
  leyenda.textContent = LEYENDA_ESTRELLAS[valor ?? 0];
  if (animar) reanimar(leyenda, "cambia");
}

function pintarBarra() {
  const barra = ref("barra-pedido");
  const piezas = estado.pedido.reduce((n, l) => n + l.cantidad, 0);
  barra.hidden = piezas === 0 || vistaActual() !== "menu";
  texto("barra-cantidad", piezas);
  texto("barra-total", dinero.format(suma(estado.pedido)));
}

// ---------- Acciones (toques) ----------

const acciones = {
  ir: (el) => ir(el.dataset.destino),
  atras: () => history.back(),
  "grupo-solo": () => {
    estado.grupo = { personas: ["Tú"], modo: "iguales" };
    estado.personasIguales = 1;
    estado.dividir = "iguales";
    efecto("seleccion");
    ir("menu");
  },
  "grupo-amigos": () => {
    ref("opcion-amigos").classList.add("activo");
    ref("grupo").hidden = false;
    efecto("seleccion");
    pintarMesa();
    ref("nombre-persona").focus();
  },
  "quitar-persona": (el) => {
    estado.grupo.personas.splice(Number(el.dataset.indice), 1);
    delete estado.propinas[Number(el.dataset.indice)];
    efecto("quitar");
    pintarMesa();
  },
  modo: (el) => {
    estado.grupo.modo = el.dataset.valor;
    estado.dividir = el.dataset.valor;
    efecto("seleccion");
    pintarMesa();
  },
  categoria: (el) => { estado.categoria = el.dataset.id; efecto("seleccion"); pintarMenu(); },
  "abrir-platillo": (el) => { efecto("abrir"); ir(`platillo/${el.dataset.id}`); },
  "ver-en-mi-mesa": () => {
    efecto("abrir");
    const abierto = verEnMiMesa();
    ref("aviso-ar").hidden = abierto;
    if (abierto) avisar("Apunta a la mesa · pellizca para cambiar el tamaño", "girar");
  },
  mas: () => { estado.cantidad++; efecto("mas"); pintarCantidad(); },
  menos: () => { estado.cantidad = Math.max(1, estado.cantidad - 1); efecto("menos"); pintarCantidad(); },
  alergia: (el) => {
    const a = el.dataset.valor;
    estado.alergias = estado.alergias.includes(a) ? estado.alergias.filter((x) => x !== a) : [...estado.alergias, a];
    sentir("bubble", [45, 40, 30], 0.5);
    pintarAlergias();
    reanimar(lista("alergias").querySelector(`[data-valor="${a}"]`), "rebote");
  },
  para: (el) => { estado.para = Number(el.dataset.valor); efecto("seleccion"); pintarParaQuien(); },
  agregar: () => { agregar(); ir("menu"); },
  quitar: (el) => { estado.pedido.splice(Number(el.dataset.indice), 1); efecto("quitar"); pintarPedido(); },
  "enviar-pedido": () => {
    estado.enviados.push(...estado.pedido);
    estado.pedido = [];
    estado.pedidoEn = Date.now();
    estado.etapaVista = 0;
    efecto("enviar");
    animarSello = true;
    ir("estado");
  },
  "elegir-metodo": () => {
    estado.metodo = document.querySelector('input[name="metodo"]:checked')?.value || "tarjeta";
    if (estado.personasIguales < personas().length) estado.personasIguales = personas().length;
    estado.quienPaga = conAmigos() ? 0 : -1;
    estado.pagaCon = 0;
    efecto("seleccion");
    ir("cuenta");
  },
  dividir: (el) => { estado.dividir = el.dataset.valor; efecto("seleccion"); pintarDivision(); },
  "mas-personas": () => {
    estado.personasIguales = Math.min(MAX_PERSONAS, estado.personasIguales + 1);
    efecto("mas");
    if (estado.personasIguales === 2) efecto("nfc");
    pintarDivision();
  },
  "menos-personas": () => { estado.personasIguales = Math.max(1, estado.personasIguales - 1); efecto("menos"); pintarDivision(); },
  asignar: (el) => {
    const l = estado.enviados[Number(el.dataset.indice)];
    const n = personas().length;
    l.para = l.para >= n - 1 ? -1 : l.para + 1; // Tú → amigos → "Entre todos" → Tú
    efecto("seleccion");
    pintarDivision();
  },
  "quien-paga": (el) => { estado.quienPaga = Number(el.dataset.valor); estado.pagaCon = 0; efecto("seleccion"); pintarDivision(); },
  pagar: () => {
    const pago = aPagar();
    const con = estado.metodo === "efectivo" ? opcionesEfectivo(pago.total)[estado.pagaCon] : null;
    estado.ultimoPago = { metodo: estado.metodo, total: pago.total, propina: pago.propina, con };
    efecto(`pago-${estado.metodo}`);
    estado.propinas = {};
    estado.enviados = [];
    estado.pedidoEn = null;
    estado.calif = { mesero: null, chef: null, motivos: { mesero: [], chef: [] }, aspectos: {} };
    estado.encuesta = null;
    estado.encuestaMenu = null;
    estado.google = null;
    ir("gracias");
  },
  carita: (el) => {
    const quien = el.dataset.quien;
    const nivel = Number(el.dataset.valor);
    if (estado.calif[quien] !== nivel) estado.calif.motivos[quien] = [];
    estado.calif[quien] = nivel;
    sonidoCarita(nivel + 1);
    pintarCalificacion(quien);
    reanimar(el, "festeja");
    reanimar(ref(`motivos-${quien}`), "aparece");
    pintarGraciasEncuesta();
  },
  motivo: (el) => {
    const { quien, valor } = el.dataset;
    const motivos = estado.calif.motivos[quien];
    estado.calif.motivos[quien] = motivos.includes(valor) ? motivos.filter((m) => m !== valor) : [...motivos, valor];
    sonidoToque();
    el.classList.toggle("activo", estado.calif.motivos[quien].includes(valor));
    reanimar(el, "rebote");
  },
  estrella: (el) => {
    const contenedor = el.closest("[data-lista]");
    const v = Number(el.dataset.valor);
    if (contenedor.dataset.lista === "aspecto") estado.calif.aspectos[contenedor.dataset.aspecto] = v;
    else estado[{ encuesta: "encuesta", "encuesta-menu": "encuestaMenu", "estrellas-google": "google" }[contenedor.dataset.lista]] = v;
    sonidoEstrella(v);
    pintarEstrellas(contenedor, v, true);
    pintarGraciasEncuesta();
  },
  "publicar-google": () => {
    const resena = ref("texto-google").value.trim();
    if (resena) navigator.clipboard?.writeText(resena).catch(() => {});
    efecto("publicar");
    window.open(RESENA_GOOGLE, "_blank", "noopener");
  },
  "volver-a-servir": () => { cerrarCaida(); reiniciarVisor(); efecto("abrir"); },
};

document.addEventListener("click", (evento) => {
  const el = evento.target.closest("[data-accion]");
  if (!el || !acciones[el.dataset.accion]) return;
  if (["ir", "atras", "opcion"].includes(el.dataset.accion)) efecto("toque");
  acciones[el.dataset.accion](el);
  guardar();
  pintarBarra();
});

// Onda al tocar cualquier botón: sale desde el dedo.
document.addEventListener("pointerdown", (evento) => {
  const el = evento.target.closest("button, .tarjeta, .metodos label");
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--tx", `${evento.clientX - r.left}px`);
  el.style.setProperty("--ty", `${evento.clientY - r.top}px`);
  reanimar(el, "tocado");
});

// Agregar personas al grupo.
ref("form-persona").addEventListener("submit", (evento) => {
  evento.preventDefault();
  const campo = ref("nombre-persona");
  const nombre = campo.value.trim();
  if (!nombre || personas().length >= MAX_PERSONAS) return;
  estado.grupo.personas.push(nombre[0].toUpperCase() + nombre.slice(1));
  campo.value = "";
  efecto("agregar");
  pintarMesa();
  guardar();
});

// Deslizador de propina: cualquier porcentaje de 0 a 30, con un clic por cada punto.
// Deslizador de propina: cualquier porcentaje de 0 a 30 para quien paga ahora, con un clic por cada punto.
ref("propina-rango").addEventListener("input", (evento) => {
  const valor = Number(evento.target.value);
  const pago = aPagar();
  if (valor !== pago.pct) {
    sonidoPropina(valor);
  }
  if (pago.quien === -1) {
    estado.propina = valor; // toda la mesa: la misma para todos
    estado.propinas = {};
  } else estado.propinas[pago.quien] = valor;
  pintarDivision();
  guardar();
});

// Barra de billetes (efectivo).
ref("billete-rango").addEventListener("input", (evento) => {
  const valor = Number(evento.target.value);
  if (valor !== estado.pagaCon) {
    efecto("billete");
  }
  estado.pagaCon = valor;
  pintarEfectivo();
  guardar();
});

document.querySelectorAll('input[name="metodo"]').forEach((r) => r.addEventListener("change", () => efecto("seleccion")));

ref("aviso").addEventListener("animationend", (evento) => {
  if (evento.target.classList.contains("saliendo")) evento.target.hidden = true;
});

// ---------- Inicio ----------

// Precarga en segundo plano: mientras corre la intro bajan las fotos; luego, sin estorbar, los modelos 3D.
// Así el menú y el visor abren al instante (GitHub Pages deja los archivos en la caché del navegador).
function precargar() {
  for (const p of PLATILLOS) {
    for (const src of [p.miniatura, p.foto]) if (src) Object.assign(new Image(), { decoding: "async", src });
  }
}

// Los modelos 3D se bajan cuando el comensal ya está en el menú (no mientras otro 3D está cargando).
let modelosPrecargados = false;
function precargarModelos() {
  if (modelosPrecargados) return;
  modelosPrecargados = true;
  const despues = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1200));
  despues(() => {
    for (const p of PLATILLOS) if (p.modelo) fetch(p.modelo, { priority: "low" }).catch(() => {});
  }, { timeout: 3000 });
}

// Pone el dibujo SVG en cada elemento con data-icono="nombre" (ver js/iconos.js).
function pintarIconos(raiz = document) {
  raiz.querySelectorAll("[data-icono]").forEach((el) => {
    if (!el.firstElementChild) el.innerHTML = icono(el.dataset.icono);
  });
}

cargar();
// Un estado guardado por la versión anterior no tiene calificaciones del chef.
estado.calif ??= { mesero: null, chef: null, motivos: { mesero: [], chef: [] }, aspectos: {} };
estado.propinas ??= {};
prepararAudio();
escucharDesbloqueo();
precargar();
pintarIconos();
texto("mesa", estado.mesa ? `Mesa ${estado.mesa}` : "");
iniciarFondo();
window.addEventListener("hashchange", mostrar);
setInterval(revisarEtapa, 500);
iniciarIntro({ mostrar: () => document.body.classList.add("listo"), mesa: estado.mesa ? `Mesa ${estado.mesa}` : "Bienvenido" });
mostrar();
// Panel de prueba de sonido y vibración: agregar ?prueba a la dirección.
if (new URLSearchParams(location.search).has("prueba")) import("./prueba.js?v=202611101409").then((m) => m.abrirPrueba());
