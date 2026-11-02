// Lógica del menú digital: navegación, grupo, pedido, estado del pedido, cuenta, pago y encuestas.
// No depende del diseño: busca los elementos por sus atributos data-* (ver README.md).

import { CATEGORIAS, PLATILLOS, PROPINA_INICIAL, MAX_PERSONAS, ALERGIAS, MESERO, RESENA_GOOGLE } from "./datos.js";
import { montarVisor, verEnMiMesa, reiniciarVisor } from "./ar.js";
import { vigilarSacudida, lluviaDeIngredientes } from "./caida.js";
import { desbloquearAudio, sonar, vibrar, sentir } from "./sonido.js";
import { iniciarIntro } from "./intro.js";
import { iniciarFondo, pedirMovimiento } from "./fondo.js";

const ORDEN = ["bienvenida", "mesa", "menu", "detalle", "pedido", "estado", "pago", "cuenta", "gracias"];
const FRASES = ["El menú se digitaliza.", "Acerca tu celular.", "Elige tu platillo.", "Míralo en tu mesa.", "Pídelo.",
  "Paga todo desde un mismo lugar."];
const ETAPAS = [
  { a: 0, titulo: "¡Pedido recibido!", texto: "Cocina ya tiene tu pedido." },
  { a: 5000, titulo: "Preparando tus alimentos", texto: "El chef ya está cocinando." },
  { a: 10000, titulo: "¡Ya está en tu mesa!", texto: "Buen provecho 🍽️" },
];
const CARITAS = [["😣", "Mal"], ["😕", "Regular"], ["🙂", "Bien"], ["😄", "Muy bien"], ["🤩", "¡Increíble!"]];
const ETIQUETAS_MESERO = ["Amable", "Rápido", "Atento", "Buenas recomendaciones", "Simpático"];
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
  dividir: "iguales",
  personasIguales: 1,
  quienPaga: 0, // en "lo que consumí": índice de la persona que paga ahora (-1 = toda la mesa)
  metodo: "tarjeta",
  mesero: null,
  meseroTags: [],
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
function avisar(mensaje) {
  const aviso = ref("aviso");
  aviso.textContent = mensaje;
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
function pintarBienvenida() {
  texto("saludo", estado.mesa ? `Bienvenido a la mesa ${estado.mesa}` : "Bienvenido");
  let i = 0;
  const frase = ref("frase-heroe");
  const puntos = lista("puntos-heroe");
  puntos.replaceChildren(...FRASES.map(() => document.createElement("i")));
  const poner = () => {
    frase.textContent = FRASES[i];
    reanimar(frase, "cambia");
    [...puntos.children].forEach((p, k) => p.classList.toggle("activo", k === i));
    i = (i + 1) % FRASES.length;
  };
  clearInterval(fraseTimer);
  poner();
  fraseTimer = setInterval(() => (vistaActual() === "bienvenida" ? poner() : clearInterval(fraseTimer)), 2300);

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
    ref("foto", tarjeta).src = p.foto;
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

  const raiz = pantalla("detalle");
  const conModelo = Boolean(p.modelo);
  if (conModelo) {
    const visor = montarVisor(ref("visor", raiz), p, { alAgregar: agregarDesdeRA });
    visor.classList.remove("cayendo");
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
  texto("contiene", p.contiene ? `⚠️ Contiene: ${p.contiene}` : "", raiz);
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
    boton.querySelector(".alergia-icono").textContent = a.icono;
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
  const notas = [nombres.length ? `Alergia: ${nombres.join(", ")}` : "", nota].filter(Boolean).join(" · ");
  const para = conAmigos() && estado.grupo.modo === "consumo" ? estado.para : 0;
  estado.pedido.push({ id: estado.actual, cantidad: estado.cantidad, notas, para });
  const p = platillo(estado.actual);
  sentir("success", [30, 40, 70], 0.7);
  if (!desdeRA) volarAlPedido(p.foto);
  avisar(`✓ ${p.nombre} se agregó a tu pedido`);
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
    const barra = ref("barra-pedido");
    reanimar(barra, "brinco");
    sonar("pop3", 0.5);
  });
}

// ---------- "Se cayó el platillo" ----------

let detenerLluvia = null;
function tirarPlatillo() {
  const p = platillo(estado.actual);
  const caida = ref("caida");
  if (!p?.ingredientes || !caida.hidden || vistaActual() !== "detalle") return;
  sentir("plate", [200, 60, 120], 0.8);
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
  ref("progreso").querySelectorAll("li").forEach((li) => {
    const n = Number(li.dataset.etapa);
    li.classList.toggle("hecho", n === 0 || n < etapa || etapa === 2);
    li.classList.toggle("actual", n === 1 && etapa === 1);
  });
  ref("cocina").hidden = etapa !== 1;
  const sello = ref("sello-ok");
  sello.classList.toggle("en-mesa", etapa === 2);
  sello.classList.toggle("quieto", !animar);
  if (animar) reanimar(sello, "sella");
}

// Revisa cada medio segundo si el pedido cambió de etapa; vibra y suena en cada una.
function revisarEtapa() {
  if (!estado.pedidoEn) return;
  const etapa = etapaActual();
  if (etapa <= estado.etapaVista) return;
  estado.etapaVista = etapa;
  guardar();
  if (etapa === 1) sentir("shimmer", [60, 40, 60], 0.6);
  if (etapa === 2) sentir("bell", [220, 90, 220, 90, 320], 0.9);
  if (vistaActual() === "estado") pintarEstado(true);
  else if (etapa > 0) avisar(etapa === 2 ? "🔔 ¡Tu pedido ya está en tu mesa!" : "🍳 Están preparando tus alimentos");
}

// ---------- 7–8. Pago y cuenta ----------

const montoPropina = () => Math.round(suma(estado.enviados) * estado.propina) / 100;
const totalCuenta = () => suma(estado.enviados) + montoPropina();

// Lo que le toca a cada persona en "lo que consumí": lo suyo + su parte de lo compartido, más propina.
function reparto() {
  const n = personas().length;
  const consumo = Array(n).fill(0);
  for (const l of estado.enviados) {
    if (l.para >= 0 && l.para < n) consumo[l.para] += importe(l);
    else consumo.forEach((_, i) => (consumo[i] += importe(l) / n));
  }
  return consumo.map((c) => c * (1 + estado.propina / 100));
}

function pintarPago() {
  texto("a-pagar", dinero.format(suma(estado.enviados)));
  const elegido = document.querySelector(`input[name="metodo"][value="${estado.metodo}"]`);
  if (elegido) elegido.checked = true;
}

function pintarCuenta() {
  texto("subtotal", dinero.format(suma(estado.enviados)));
  ref("propina-rango").value = estado.propina;
  texto("metodo-resumen", `Pagas con: ${METODOS[estado.metodo] || ""}`);
  pintarPropina();
}

function pintarPropina() {
  const rango = ref("propina-rango");
  rango.style.setProperty("--avance", `${(estado.propina / Number(rango.max)) * 100}%`);
  texto("propina-valor", estado.propina ? `${estado.propina}%` : "Sin propina");
  texto("propina-monto", `${dinero.format(montoPropina())} de propina para el equipo de servicio`);
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

  const total = totalCuenta();
  texto("total-cuenta", dinero.format(total));
  if (!consumo) {
    const n = estado.personasIguales;
    texto("personas", n);
    lista("comensales").replaceChildren(...Array.from({ length: n }, (_, i) => {
      const c = document.createElement("span");
      c.className = "comensal";
      avatar(c, i);
      c.title = personas()[i] ?? `Persona ${i + 1}`;
      c.style.animationDelay = `${i * 40}ms`;
      return c;
    }));
    texto("por-persona", n > 1 ? `Cada quien paga ${dinero.format(total / n)}` : "");
    texto("boton-pagar", n > 1 ? `mi parte · ${dinero.format(total / n)}` : dinero.format(total));
    ref("aviso-nfc").hidden = n < 2;
    return;
  }

  // Lo que consumí: cada platillo con su dueño (se cambia tocando) y el reparto por persona.
  lista("asignar").replaceChildren(...estado.enviados.map((l, i) => {
    const fila = copiar("asignacion");
    fila.querySelector(".asignacion-nombre").textContent = `${l.cantidad}× ${platillo(l.id).nombre} · ${dinero.format(importe(l))}`;
    const chip = fila.querySelector(".chip-persona");
    chip.dataset.indice = i;
    chip.textContent = l.para >= 0 ? personas()[l.para] ?? "Tú" : "Entre todos";
    chip.style.setProperty("--color", l.para >= 0 ? COLORES_PERSONA[l.para % COLORES_PERSONA.length] : "#6E6259");
    return fila;
  }));
  const montos = reparto();
  const filas = personas().map((nombre, i) => {
    const fila = copiar("reparto");
    fila.dataset.valor = i;
    avatar(fila.querySelector(".persona-avatar"), i);
    fila.querySelector(".reparto-nombre").textContent = nombre === "Tú" ? "Tú" : nombre;
    const cuantos = estado.enviados.filter((l) => l.para === i).reduce((s, l) => s + l.cantidad, 0);
    fila.querySelector(".reparto-detalle").textContent = `${cuantos} platillo${cuantos === 1 ? "" : "s"}`;
    fila.querySelector(".reparto-monto").textContent = dinero.format(montos[i]);
    fila.classList.toggle("activo", estado.quienPaga === i);
    return fila;
  });
  const todos = copiar("reparto");
  todos.dataset.valor = -1;
  todos.querySelector(".persona-avatar").textContent = "★";
  todos.querySelector(".reparto-nombre").textContent = "Toda la mesa";
  todos.querySelector(".reparto-detalle").textContent = "una sola persona paga";
  todos.querySelector(".reparto-monto").textContent = dinero.format(total);
  todos.classList.toggle("activo", estado.quienPaga === -1);
  lista("reparto").replaceChildren(...filas, todos);

  const quien = estado.quienPaga;
  const monto = quien >= 0 ? montos[quien] : total;
  texto("por-persona", "");
  texto("boton-pagar", quien >= 0 ? `${quien === 0 ? "lo mío" : `lo de ${personas()[quien]}`} · ${dinero.format(monto)}` : `todo · ${dinero.format(total)}`);
  ref("aviso-nfc").hidden = !conAmigos();
}

// ---------- 9. Gracias ----------

function pintarGracias() {
  const mensajes = { tarjeta: "Un mesero llevará la terminal a tu mesa.", efectivo: "Un mesero pasará a cobrar a tu mesa.",
                     "en-linea": "Tu pago en línea quedó registrado." };
  texto("metodo-elegido", mensajes[estado.metodo] || "");
  texto("mesero-nombre", MESERO.nombre);
  pintarCaritas();
  pintarEstrellas(lista("encuesta"), estado.encuesta);
  pintarEstrellas(lista("encuesta-menu"), estado.encuestaMenu);
  pintarEstrellas(lista("estrellas-google"), estado.google);
  ref("encuesta-gracias").hidden = !(estado.encuesta && estado.encuestaMenu && estado.mesero != null);
}

function pintarCaritas() {
  lista("caritas").replaceChildren(...CARITAS.map(([cara, etiqueta], i) => {
    const b = document.createElement("button");
    b.className = "carita";
    b.dataset.accion = "carita";
    b.dataset.valor = i;
    b.textContent = cara;
    b.setAttribute("aria-label", etiqueta);
    b.classList.toggle("activo", estado.mesero === i);
    b.classList.toggle("apagada", estado.mesero != null && estado.mesero !== i);
    return b;
  }));
  texto("mesero-etiqueta", estado.mesero != null ? CARITAS[estado.mesero][1] : "Toca una carita");
  const tags = lista("mesero-tags");
  tags.hidden = estado.mesero == null;
  tags.replaceChildren(...ETIQUETAS_MESERO.map((t) => {
    const chip = copiar("opcion");
    chip.dataset.accion = "tag-mesero";
    chip.dataset.valor = t;
    chip.textContent = t;
    chip.classList.toggle("activo", estado.meseroTags.includes(t));
    return chip;
  }));
}

const ESTRELLA = '<svg viewBox="0 0 24 24"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z"/></svg>';
function pintarEstrellas(contenedor, valor, animar = false) {
  contenedor.replaceChildren(...[1, 2, 3, 4, 5].map((v, i) => {
    const b = document.createElement("button");
    b.className = "estrella";
    b.dataset.accion = "estrella";
    b.dataset.valor = v;
    b.setAttribute("aria-label", `${v} de 5`);
    b.innerHTML = `<span class="estrella-vacia">${ESTRELLA}</span><span class="estrella-llena">${ESTRELLA}</span>`;
    b.style.setProperty("--i", i);
    b.classList.toggle("activo", valor != null && v <= valor);
    return b;
  }));
  if (animar) reanimar(contenedor, "ola");
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
    sentir("pop3", 15);
    ir("menu");
  },
  "grupo-amigos": () => {
    ref("opcion-amigos").classList.add("activo");
    ref("grupo").hidden = false;
    sentir("pop3", 15);
    pintarMesa();
    ref("nombre-persona").focus();
  },
  "quitar-persona": (el) => {
    estado.grupo.personas.splice(Number(el.dataset.indice), 1);
    sonar("pop2", 0.4);
    pintarMesa();
  },
  modo: (el) => {
    estado.grupo.modo = el.dataset.valor;
    estado.dividir = el.dataset.valor;
    sentir("pop3", 15);
    pintarMesa();
  },
  categoria: (el) => { estado.categoria = el.dataset.id; sonar("swipe", 0.4); pintarMenu(); },
  "abrir-platillo": (el) => { sonar("whoosh1", 0.35); ir(`platillo/${el.dataset.id}`); },
  "ver-en-mi-mesa": () => { sentir("shimmer", 20, 0.5); ref("aviso-ar").hidden = verEnMiMesa(); },
  mas: () => { estado.cantidad++; sentir("tick", 10, 0.6); pintarCantidad(); },
  menos: () => { estado.cantidad = Math.max(1, estado.cantidad - 1); sentir("tick", 10, 0.6); pintarCantidad(); },
  alergia: (el) => {
    const a = el.dataset.valor;
    estado.alergias = estado.alergias.includes(a) ? estado.alergias.filter((x) => x !== a) : [...estado.alergias, a];
    sentir("bubble", 18, 0.5);
    pintarAlergias();
    reanimar(lista("alergias").querySelector(`[data-valor="${a}"]`), "rebote");
  },
  para: (el) => { estado.para = Number(el.dataset.valor); sentir("pop3", 12, 0.45); pintarParaQuien(); },
  agregar: () => { agregar(); ir("menu"); },
  quitar: (el) => { estado.pedido.splice(Number(el.dataset.indice), 1); sonar("pop2", 0.45); pintarPedido(); },
  "enviar-pedido": () => {
    estado.enviados.push(...estado.pedido);
    estado.pedido = [];
    estado.pedidoEn = Date.now();
    estado.etapaVista = 0;
    sentir("stamp", [90, 50, 160, 50, 90], 0.9);
    animarSello = true;
    ir("estado");
  },
  "elegir-metodo": () => {
    estado.metodo = document.querySelector('input[name="metodo"]:checked')?.value || "tarjeta";
    if (estado.personasIguales < personas().length) estado.personasIguales = personas().length;
    sonar("tap", 0.4);
    ir("cuenta");
  },
  dividir: (el) => { estado.dividir = el.dataset.valor; sentir("swipe", 12, 0.45); pintarDivision(); },
  "mas-personas": () => {
    estado.personasIguales = Math.min(MAX_PERSONAS, estado.personasIguales + 1);
    sentir("pop2", 12, 0.5);
    if (estado.personasIguales === 2) sonar("nfc", 0.5);
    pintarDivision();
  },
  "menos-personas": () => { estado.personasIguales = Math.max(1, estado.personasIguales - 1); sentir("pop2", 12, 0.5); pintarDivision(); },
  asignar: (el) => {
    const l = estado.enviados[Number(el.dataset.indice)];
    const n = personas().length;
    l.para = l.para >= n - 1 ? -1 : l.para + 1; // Tú → amigos → "Entre todos" → Tú
    sentir("pop3", 12, 0.45);
    pintarDivision();
  },
  "quien-paga": (el) => { estado.quienPaga = Number(el.dataset.valor); sentir("tick", 10, 0.5); pintarDivision(); },
  pagar: () => {
    sentir("pay2", [60, 40, 140], 0.8);
    estado.enviados = [];
    estado.pedidoEn = null;
    estado.mesero = null;
    estado.meseroTags = [];
    estado.encuesta = null;
    estado.encuestaMenu = null;
    estado.google = null;
    ir("gracias");
  },
  carita: (el) => {
    estado.mesero = Number(el.dataset.valor);
    sentir(estado.mesero >= 3 ? "success" : "pop3", estado.mesero >= 3 ? [30, 40, 60] : 20, 0.6);
    pintarCaritas();
    const activa = lista("caritas").querySelector(".activo");
    activa && reanimar(activa, "festeja");
    pintarGracias();
  },
  "tag-mesero": (el) => {
    const t = el.dataset.valor;
    estado.meseroTags = estado.meseroTags.includes(t) ? estado.meseroTags.filter((x) => x !== t) : [...estado.meseroTags, t];
    sentir("pop3", 10, 0.4);
    pintarCaritas();
  },
  estrella: (el) => {
    const contenedor = el.closest("[data-lista]");
    const v = Number(el.dataset.valor);
    const clave = { encuesta: "encuesta", "encuesta-menu": "encuestaMenu", "estrellas-google": "google" }[contenedor.dataset.lista];
    estado[clave] = v;
    sentir("stars", [15, 30, 15, 30, 40].slice(0, v * 2 - 1), 0.6);
    pintarEstrellas(contenedor, v, true);
    ref("encuesta-gracias").hidden = !(estado.encuesta && estado.encuestaMenu && estado.mesero != null);
  },
  "publicar-google": () => {
    const resena = ref("texto-google").value.trim();
    if (resena) navigator.clipboard?.writeText(resena).catch(() => {});
    sentir("success", 20, 0.5);
    window.open(RESENA_GOOGLE, "_blank", "noopener");
  },
  "volver-a-servir": () => { cerrarCaida(); reiniciarVisor(); sonar("whoosh1", 0.4); },
};

document.addEventListener("click", (evento) => {
  const el = evento.target.closest("[data-accion]");
  if (!el || !acciones[el.dataset.accion]) return;
  if (["ir", "atras", "opcion"].includes(el.dataset.accion)) sonar("tap", 0.35);
  acciones[el.dataset.accion](el);
  guardar();
  pintarBarra();
});

// Onda al tocar cualquier botón: sale desde el dedo.
document.addEventListener("pointerdown", (evento) => {
  desbloquearAudio();
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
  sentir("pop3", 15, 0.5);
  pintarMesa();
  guardar();
});

// Deslizador de propina: cualquier porcentaje de 0 a 30, con un clic por cada punto.
ref("propina-rango").addEventListener("input", (evento) => {
  const valor = Number(evento.target.value);
  if (valor !== estado.propina) {
    sonar("tick", 0.35);
    vibrar(5);
  }
  estado.propina = valor;
  pintarPropina();
  guardar();
});

document.querySelectorAll('input[name="metodo"]').forEach((r) => r.addEventListener("change", () => sentir("tap", 10, 0.4)));

ref("aviso").addEventListener("animationend", (evento) => {
  if (evento.target.classList.contains("saliendo")) evento.target.hidden = true;
});

// ---------- Inicio ----------

cargar();
texto("mesa", estado.mesa ? `Mesa ${estado.mesa}` : "");
texto("intro-mesa", estado.mesa ? `Mesa ${estado.mesa}` : "Bienvenido");
iniciarFondo();
window.addEventListener("hashchange", mostrar);
setInterval(revisarEtapa, 500);
iniciarIntro({ mostrar: () => document.body.classList.add("listo") });
mostrar();
