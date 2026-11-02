// Efectos de sonido y vibración de las "mini conversiones" (agregar, pedir, pagar...).
// Los sonidos son los mismos del video de Chefi. Se cargan con Web Audio para que suenen sin retraso.
// El contexto se crea al cargar la página: si el navegador ya permite el audio, la intro suena desde el inicio;
// si no, se "desbloquea" con el primer toque.
// Los de la interfaz (estrellas, caritas, agregar, pagar...) se sintetizan aquí mismo: suaves, cortos y táctiles.
// Los archivos de media/sfx quedan para la intro y para "se cayó el platillo".

const NOMBRES = ["tap", "pop1", "pop3", "pop2", "bubble", "success", "chime", "bell", "slide", "pay2", "nfc",
  "stamp", "swipe", "whoosh1", "whooshlow", "tick", "plate", "shimmer", "assemble2", "logo"];

let ctx = null;
let salidaGeneral = null;
const buffers = {};
let cargando = null;

function crear() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Un compresor suave al final evita que los sonidos que coinciden se saturen.
    salidaGeneral = ctx.createDynamicsCompressor();
    salidaGeneral.threshold.value = -10;
    salidaGeneral.ratio.value = 3;
    salidaGeneral.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

function cargar() {
  if (cargando || !ctx) return cargando;
  cargando = Promise.all(NOMBRES.map(async (n) => {
    try {
      const datos = await (await fetch(`media/sfx/${n}.mp3`)).arrayBuffer();
      buffers[n] = await new Promise((ok, mal) => ctx.decodeAudioData(datos, ok, mal));
    } catch {}
  }));
  return cargando;
}

// Se prepara al cargar la página (sin sonar todavía).
export function prepararAudio() {
  if (crear()) cargar();
}

// true si el navegador ya deja reproducir sonido.
export const audioActivo = () => ctx?.state === "running";

// Se llama dentro de un toque del usuario.
export function desbloquearAudio() {
  if (!crear()) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  cargar();
}

export function sonar(nombre, volumen = 0.6) {
  if (!audioActivo() || !buffers[nombre]) return;
  const fuente = ctx.createBufferSource();
  const ganancia = ctx.createGain();
  ganancia.gain.value = volumen;
  fuente.buffer = buffers[nombre];
  fuente.connect(ganancia).connect(salidaGeneral);
  fuente.start();
}

// ---------- Sonidos sintetizados (estrellas y caritas) ----------

// Una nota tipo "gota de cristal": seno con un armónico muy suave, ataque de 3 ms y cola corta.
function gota(frecuencia, cuando, volumen, cola = 0.42) {
  const t = ctx.currentTime + cuando;
  const filtro = ctx.createBiquadFilter();
  filtro.type = "lowpass";
  filtro.frequency.value = 2600;
  filtro.Q.value = 0.4;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(volumen, t + 0.003);
  env.gain.exponentialRampToValueAtTime(0.0001, t + cola);
  filtro.connect(env).connect(salidaGeneral);
  [[1, 1], [2.0, 0.16], [3.01, 0.05]].forEach(([mult, nivel]) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frecuencia * mult * 1.012, t);
    osc.frequency.exponentialRampToValueAtTime(frecuencia * mult, t + 0.05);
    g.gain.value = nivel;
    osc.connect(g).connect(filtro);
    osc.start(t);
    osc.stop(t + cola + 0.05);
  });
}

// Un roce muy corto de ruido filtrado: la parte "táctil" del toque.
function roce(cuando, volumen, tono = 5200, largo = 0.018) {
  const t = ctx.currentTime + cuando;
  const muestras = Math.ceil(ctx.sampleRate * largo);
  const buffer = ctx.createBuffer(1, muestras, ctx.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < muestras; i++) datos[i] = (Math.random() * 2 - 1) * (1 - i / muestras) ** 2;
  const fuente = ctx.createBufferSource();
  fuente.buffer = buffer;
  const filtro = ctx.createBiquadFilter();
  filtro.type = "bandpass";
  filtro.frequency.value = tono;
  filtro.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.value = volumen;
  fuente.connect(filtro).connect(g).connect(salidaGeneral);
  fuente.start(t);
}

// Burbuja suave: el tono baja rápido, como una gota que cae en agua.
function burbuja(frecuencia, cuando, volumen) {
  const t = ctx.currentTime + cuando;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const filtro = ctx.createBiquadFilter();
  filtro.type = "lowpass";
  filtro.frequency.value = 1800;
  osc.type = "sine";
  osc.frequency.setValueAtTime(frecuencia * 1.9, t);
  osc.frequency.exponentialRampToValueAtTime(frecuencia, t + 0.07);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(volumen, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  osc.connect(filtro).connect(env).connect(salidaGeneral);
  osc.start(t);
  osc.stop(t + 0.25);
}

// Escala pentatónica (Do mayor), aguda y limpia.
const PENTATONICA = [1046.5, 1174.7, 1318.5, 1568, 1760];

// Estrellas: una gota por estrella, subiendo hasta la elegida; la última suena un poco más.
export function sonidoEstrella(valor) {
  if (!audioActivo()) return;
  roce(0, 0.05);
  for (let i = 0; i < valor; i++) {
    const ultima = i === valor - 1;
    gota(PENTATONICA[i], i * 0.045, ultima ? 0.13 : 0.05, ultima ? 0.6 : 0.3);
  }
  if (valor === 5) gota(PENTATONICA[4] * 1.5, 5 * 0.045 + 0.03, 0.04, 0.8);
}

// Caritas: burbuja grave para "mal" y más aguda y doble para "increíble".
const TONO_CARITA = [330, 392, 494, 587, 659];
export function sonidoCarita(nivel) {
  if (!audioActivo()) return;
  const i = Math.max(0, Math.min(4, nivel - 1));
  roce(0, 0.04, 3400, 0.014);
  burbuja(TONO_CARITA[i], 0.005, 0.2);
  if (i >= 3) burbuja(TONO_CARITA[i] * 1.26, 0.075, 0.12);
  if (i === 4) gota(1568, 0.15, 0.05, 0.5);
}

// Toque mínimo para chips y motivos.
export function sonidoToque() {
  if (!audioActivo()) return;
  roce(0, 0.05, 4200, 0.012);
  gota(1318.5, 0.004, 0.035, 0.12);
}

// ---------- Kit de sonidos de la interfaz (sintetizados) ----------
// Cortos, suaves y positivos; cada acción tiene el suyo y alude a lo que pasa (la terminal que aprueba,
// las monedas, el ticket que sale a cocina...).

// Ruido filtrado que recorre frecuencias: aire, papel, deslizar.
function soplo(cuando, desde, hasta, largo, volumen, tipo = "bandpass") {
  const t = ctx.currentTime + cuando;
  const muestras = Math.ceil(ctx.sampleRate * largo);
  const buffer = ctx.createBuffer(1, muestras, ctx.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < muestras; i++) datos[i] = Math.random() * 2 - 1;
  const fuente = ctx.createBufferSource();
  fuente.buffer = buffer;
  const filtro = ctx.createBiquadFilter();
  filtro.type = tipo;
  filtro.Q.value = 0.9;
  filtro.frequency.setValueAtTime(desde, t);
  filtro.frequency.exponentialRampToValueAtTime(hasta, t + largo);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(volumen, t + largo * 0.35);
  env.gain.exponentialRampToValueAtTime(0.0001, t + largo);
  fuente.connect(filtro).connect(env).connect(salidaGeneral);
  fuente.start(t);
}

// Golpe de madera suave (selecciones): grave, seco y sin brillo, nada de "ping pong".
function madera(cuando, volumen = 0.12, tono = 420) {
  const t = ctx.currentTime + cuando;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const filtro = ctx.createBiquadFilter();
  filtro.type = "lowpass";
  filtro.frequency.value = 1300;
  osc.type = "triangle";
  osc.frequency.setValueAtTime(tono, t);
  osc.frequency.exponentialRampToValueAtTime(tono * 0.72, t + 0.05);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(volumen, t + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  osc.connect(filtro).connect(env).connect(salidaGeneral);
  osc.start(t);
  osc.stop(t + 0.12);
  roce(cuando, volumen * 0.25, 2200, 0.01);
}

// Campana pequeña (parciales inarmónicos, cola larga).
function campana(frecuencia, cuando, volumen) {
  const t = ctx.currentTime + cuando;
  [[1, 1, 1.4], [2, 0.35, 0.9], [2.76, 0.22, 0.7], [4.07, 0.1, 0.45]].forEach(([mult, nivel, cola]) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frecuencia * mult;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(volumen * nivel, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + cola);
    osc.connect(env).connect(salidaGeneral);
    osc.start(t);
    osc.stop(t + cola + 0.05);
  });
}

// Moneda: tintineo metálico muy corto.
function moneda(cuando, volumen) {
  const t = ctx.currentTime + cuando;
  const base = 3000 + Math.random() * 900;
  [1, 1.47, 2.09, 2.56].forEach((mult, k) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.value = base * mult;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(volumen / (k + 1), t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.22 - k * 0.03);
    osc.connect(env).connect(salidaGeneral);
    osc.start(t);
    osc.stop(t + 0.25);
  });
}

// Pitido limpio de terminal (pago sin contacto).
function pitido(frecuencia, cuando, largo, volumen) {
  const t = ctx.currentTime + cuando;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frecuencia;
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(volumen, t + 0.006);
  env.gain.setValueAtTime(volumen, t + largo - 0.03);
  env.gain.exponentialRampToValueAtTime(0.0001, t + largo);
  osc.connect(env).connect(salidaGeneral);
  osc.start(t);
  osc.stop(t + largo + 0.02);
}

const EFECTOS = {
  toque: () => { roce(0, 0.035, 3000, 0.01); gota(880, 0.002, 0.025, 0.08); },
  seleccion: () => madera(0),
  abrir: () => { soplo(0, 500, 2400, 0.24, 0.05); gota(659, 0.07, 0.03, 0.35); gota(988, 0.12, 0.03, 0.45); },
  agregar: () => { roce(0, 0.03); gota(784, 0, 0.07, 0.35); gota(1175, 0.075, 0.08, 0.55); },
  llega: () => burbuja(240, 0, 0.12),
  quitar: () => { gota(784, 0, 0.045, 0.22); gota(523, 0.06, 0.045, 0.3); },
  mas: () => { roce(0, 0.03, 4000, 0.008); gota(1046.5, 0, 0.035, 0.1); },
  menos: () => { roce(0, 0.03, 3200, 0.008); gota(880, 0, 0.035, 0.1); },
  enviar: () => {
    soplo(0, 3200, 700, 0.26, 0.05, "lowpass"); // el ticket sale a cocina
    [1046.5, 1318.5, 1568].forEach((f, i) => gota(f, 0.14 + i * 0.065, i === 2 ? 0.09 : 0.06, i === 2 ? 0.7 : 0.35));
  },
  preparando: () => { gota(523.3, 0, 0.05, 0.6); gota(659.3, 0.09, 0.05, 0.7); },
  "en-mesa": () => { campana(1318.5, 0, 0.09); campana(1568, 0.2, 0.07); },
  "pago-tarjeta": () => { // la terminal aprueba
    pitido(1760, 0, 0.09, 0.05);
    gota(1318.5, 0.2, 0.07, 0.6);
    gota(1975.5, 0.2, 0.04, 0.7);
  },
  "pago-efectivo": () => { moneda(0, 0.03); moneda(0.09, 0.025); moneda(0.17, 0.03); gota(1046.5, 0.3, 0.05, 0.5); },
  "pago-en-linea": () => { soplo(0, 700, 3000, 0.2, 0.045); gota(1046.5, 0.15, 0.05, 0.4); gota(1568, 0.23, 0.07, 0.65); },
  billete: () => { soplo(0, 2600, 1500, 0.06, 0.07); madera(0.01, 0.04, 600); },
  nfc: () => { gota(1568, 0, 0.045, 0.15); gota(2093, 0.1, 0.045, 0.25); },
  publicar: () => [1046.5, 1318.5, 1568].forEach((f, i) => gota(f, i * 0.05, 0.05, 0.4)),
};

export function efecto(nombre) {
  if (!audioActivo() || !EFECTOS[nombre]) return;
  EFECTOS[nombre]();
}

// Propina: un clic que sube de tono con el porcentaje.
export function sonidoPropina(porcentaje) {
  if (!audioActivo()) return;
  roce(0, 0.03, 4500, 0.008);
  gota(700 + porcentaje * 22, 0, 0.022, 0.07);
}

// ---------- Vibración ----------
// Android: Vibration API con patrón. iPhone (iOS 18+): no tiene Vibration API, pero tocar un
// interruptor nativo produce un golpe háptico; solo funciona dentro de un toque del usuario.
let interruptor = null;
function golpeIOS() {
  if (!interruptor) {
    interruptor = document.createElement("label");
    interruptor.setAttribute("aria-hidden", "true");
    interruptor.style.cssText = "position:fixed;left:-9999px;opacity:0;pointer-events:none";
    const entrada = document.createElement("input");
    entrada.type = "checkbox";
    entrada.setAttribute("switch", "");
    entrada.tabIndex = -1;
    interruptor.append(entrada);
    document.body.append(interruptor);
  }
  interruptor.click();
}

export function vibrar(patron = 12) {
  if (navigator.vibrate) {
    try { navigator.vibrate(patron); } catch {}
    return;
  }
  const golpes = Array.isArray(patron) ? patron.filter((_, i) => i % 2 === 0).length : 1;
  golpeIOS();
  for (let i = 1; i < Math.min(golpes, 3); i++) setTimeout(golpeIOS, i * 120);
}

// Mini conversión: sonido + vibración juntos.
export function sentir(nombre, patron, volumen) {
  sonar(nombre, volumen);
  vibrar(patron);
}
