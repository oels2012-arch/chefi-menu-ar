// Lógica del menú digital: navegación, pedido, cuenta y pago.
// No depende del diseño: busca los elementos por sus atributos data-* (ver README.md).

import { CATEGORIAS, PLATILLOS, PROPINAS } from "./datos.js";
import { montarVisor, verEnMiMesa } from "./ar.js";

const estado = {
  mesa: new URLSearchParams(location.search).get("mesa"),
  categoria: CATEGORIAS[0].id,
  actual: null, // id del platillo abierto
  cantidad: 1,
  pedido: [],   // lo que aún no se envía a cocina: { id, cantidad, notas }
  enviados: [], // lo que ya se envió y va a la cuenta
  propina: 10,
  personas: 1,
  metodo: null,
  encuesta: null,
};

// ---------- Utilidades ----------

const dinero = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const pantalla = (nombre) => document.querySelector(`[data-pantalla="${nombre}"]`);
const ref = (nombre, raiz = document) => raiz.querySelector(`[data-ref="${nombre}"]`);
const lista = (nombre) => document.querySelector(`[data-lista="${nombre}"]`);
const platillo = (id) => PLATILLOS.find((p) => p.id === id);
const importe = (linea) => platillo(linea.id).precio * linea.cantidad;
const suma = (lineas) => lineas.reduce((total, l) => total + importe(l), 0);

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
  document.querySelector('[data-accion="atras"]').hidden = destino === "bienvenida";
  ({ menu: pintarMenu, detalle: () => pintarDetalle(parametro), pedido: pintarPedido, estado: pintarEstado,
     cuenta: pintarCuenta, pago: pintarPago, gracias: pintarGracias })[destino]?.();
  pintarBarra(destino);
  window.scrollTo(0, 0);
}

// ---------- Pantallas ----------

function pintarMenu() {
  lista("categorias").replaceChildren(...CATEGORIAS.map((c) => {
    const chip = copiar("categoria");
    chip.textContent = c.nombre;
    chip.dataset.id = c.id;
    chip.classList.toggle("activo", c.id === estado.categoria);
    return chip;
  }));

  lista("platillos").replaceChildren(...PLATILLOS.filter((p) => p.categoria === estado.categoria).map((p) => {
    const tarjeta = copiar("tarjeta-platillo");
    tarjeta.dataset.id = p.id;
    ref("foto", tarjeta).src = p.foto;
    texto("nombre", p.nombre, tarjeta);
    texto("descripcion", p.descripcion, tarjeta);
    texto("precio", dinero.format(p.precio), tarjeta);
    ref("etiqueta-ar", tarjeta).hidden = !p.modelo;
    return tarjeta;
  }));
}

function pintarDetalle(id) {
  const p = platillo(id);
  if (!p) return ir("menu");
  estado.actual = p.id;
  estado.cantidad = 1;

  const raiz = pantalla("detalle");
  const conModelo = Boolean(p.modelo);
  if (conModelo) montarVisor(ref("visor", raiz), p);
  else ref("visor", raiz).innerHTML = `<img src="${p.foto}" alt="">`;
  raiz.querySelector('[data-accion="ver-en-mi-mesa"]').hidden = !conModelo;
  ref("aviso-ar", raiz).hidden = true;

  texto("nombre", p.nombre, raiz);
  texto("precio", dinero.format(p.precio), raiz);
  texto("descripcion", p.descripcion, raiz);
  texto("porcion", p.porcion, raiz);
  texto("kcal", `≈ ${p.kcal} kcal`, raiz);
  texto("carbohidratos", p.carbohidratos, raiz);
  texto("carne", p.carne, raiz);
  texto("cantidad", estado.cantidad, raiz);
  ref("notas", raiz).value = "";
}

function pintarLineas(contenedor, lineas, editable) {
  contenedor.replaceChildren(...lineas.map((l, i) => {
    const fila = copiar("linea-pedido");
    texto("cantidad", `${l.cantidad}×`, fila);
    texto("nombre", platillo(l.id).nombre, fila);
    texto("notas", l.notas ? ` · ${l.notas}` : "", fila);
    texto("importe", dinero.format(importe(l)), fila);
    const quitar = fila.querySelector('[data-accion="quitar"]');
    if (editable) quitar.dataset.indice = i;
    else quitar.remove();
    return fila;
  }));
}

function pintarPedido() {
  pintarLineas(lista("pedido"), estado.pedido, true);
  ref("pedido-vacio").hidden = estado.pedido.length > 0;
  texto("total-pedido", dinero.format(suma(estado.pedido)));
  document.querySelector('[data-accion="enviar-pedido"]').disabled = estado.pedido.length === 0;
}

function pintarEstado() {
  pintarLineas(lista("enviados"), estado.enviados, false);
}

function totalCuenta() {
  const subtotal = suma(estado.enviados);
  return subtotal + Math.round(subtotal * estado.propina) / 100;
}

function pintarOpciones(contenedor, valores, activo, etiqueta) {
  contenedor.replaceChildren(...valores.map((v) => {
    const chip = copiar("opcion");
    chip.textContent = etiqueta(v);
    chip.dataset.valor = v;
    chip.classList.toggle("activo", v === activo);
    return chip;
  }));
}

function pintarCuenta() {
  pintarLineas(lista("cuenta"), estado.enviados, false);
  texto("subtotal", dinero.format(suma(estado.enviados)));
  pintarOpciones(lista("propinas"), PROPINAS, estado.propina, (v) => (v ? `${v}%` : "Sin propina"));
  texto("personas", estado.personas);
  texto("total-cuenta", dinero.format(totalCuenta()));
  texto("por-persona", estado.personas > 1 ? `${dinero.format(totalCuenta() / estado.personas)} por persona` : "");
}

function pintarPago() {
  const porPersona = totalCuenta() / estado.personas;
  texto("a-pagar", estado.personas > 1 ? `${dinero.format(porPersona)} (tu parte)` : dinero.format(porPersona));
}

function pintarGracias() {
  const metodos = { tarjeta: "Un mesero llevará la terminal a tu mesa.", efectivo: "Un mesero pasará a cobrar a tu mesa.",
                    "en-linea": "Pago en línea registrado." };
  texto("metodo-elegido", metodos[estado.metodo] || "");
  pintarOpciones(lista("encuesta"), [1, 2, 3, 4, 5], estado.encuesta, String);
  ref("encuesta-gracias").hidden = !estado.encuesta;
}

function pintarBarra(destino) {
  const barra = ref("barra-pedido");
  const piezas = estado.pedido.reduce((n, l) => n + l.cantidad, 0);
  barra.hidden = piezas === 0 || !["menu", "detalle"].includes(destino);
  texto("barra-cantidad", `${piezas} ${piezas === 1 ? "platillo" : "platillos"}`);
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
  agregar: () => {
    const notas = ref("notas", pantalla("detalle")).value.trim();
    estado.pedido.push({ id: estado.actual, cantidad: estado.cantidad, notas });
    ir("menu");
  },
  quitar: (el) => { estado.pedido.splice(Number(el.dataset.indice), 1); pintarPedido(); },
  "enviar-pedido": () => {
    estado.enviados.push(...estado.pedido);
    estado.pedido = [];
    ir("estado");
  },
  opcion: (el) => {
    const valor = Number(el.dataset.valor);
    if (el.closest('[data-lista="propinas"]')) { estado.propina = valor; pintarCuenta(); }
    else { estado.encuesta = valor; pintarGracias(); }
  },
  "mas-personas": () => { estado.personas++; pintarCuenta(); },
  "menos-personas": () => { estado.personas = Math.max(1, estado.personas - 1); pintarCuenta(); },
  pagar: () => {
    estado.metodo = document.querySelector('input[name="metodo"]:checked')?.value;
    estado.enviados = [];
    estado.personas = 1;
    ir("gracias");
  },
};

document.addEventListener("click", (evento) => {
  const el = evento.target.closest("[data-accion]");
  if (!el || !acciones[el.dataset.accion]) return;
  acciones[el.dataset.accion](el);
  guardar();
  pintarBarra(location.hash.slice(1).split("/")[0] === "platillo" ? "detalle" : location.hash.slice(1));
});

// ---------- Inicio ----------

cargar();
texto("mesa", estado.mesa ? `Mesa ${estado.mesa}` : "");
window.addEventListener("hashchange", mostrar);
mostrar();
