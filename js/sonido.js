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
const crudos = {}; // los mp3 sin decodificar, por si hay que recrear el contexto dentro de un toque
let cargando = null;
let creadoEnToque = false;

function crear() {
  if (ctx) return ctx;
  try {
    // iPhone: sin esto, Web Audio se calla con el interruptor de silencio (Safari 16.4+).
    if (navigator.audioSession) navigator.audioSession.type = "playback";
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
      crudos[n] ??= await (await fetch(`media/sfx/${n}.mp3`)).arrayBuffer();
      const contexto = ctx;
      const decodificado = await new Promise((ok, mal) => contexto.decodeAudioData(crudos[n].slice(0), ok, mal));
      if (contexto === ctx) buffers[n] = decodificado;
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

// Se llama dentro de un toque del usuario. En iPhone el audio solo se desbloquea al soltar el dedo (touchend,
// click), no al apoyarlo; y al volver de la cámara AR queda "interrumpido", así que se reanuda en cada toque
// mientras no esté sonando.
let silencioTocado = false;
let reanudando = null; // promesa mientras el audio arranca

// Si el audio está arrancando (primer toque), el sonido espera a que arranque en vez de perderse.
function cuandoSuene(fn) {
  if (audioActivo()) return fn();
  reanudando?.then(() => audioActivo() && fn());
}
export function desbloquearAudio() {
  if (!crear()) return;
  // iPhone: si el contexto creado al cargar la página no arranca con el toque, se crea uno nuevo aquí mismo
  // (dentro del toque sí arranca) y se vuelven a decodificar los sonidos.
  if (ctx.state !== "running" && !creadoEnToque && /iPhone|iPad|Macintosh/.test(navigator.userAgent) && "ontouchend" in document) {
    creadoEnToque = true;
    try { ctx.close(); } catch {}
    ctx = null;
    cargando = null;
    for (const n of Object.keys(buffers)) delete buffers[n];
    crear();
    silencioTocado = false;
  }
  if (ctx.state !== "running" && !reanudando) {
    reanudando = ctx.resume().catch(() => {}).finally(() => { reanudando = null; });
  }
  if (!silencioTocado) {
    // Un sonido vacío dentro del toque termina de "abrir" el audio en Safari.
    try {
      const fuente = ctx.createBufferSource();
      fuente.buffer = ctx.createBuffer(1, 1, 22050);
      fuente.connect(ctx.destination);
      fuente.start(0);
      silencioTocado = true;
    } catch {}
  }
  cargar();
}

// Escucha todos los gestos que sirven para desbloquear el audio.
export function escucharDesbloqueo() {
  for (const evento of ["touchend", "pointerup", "click", "keydown"]) {
    document.addEventListener(evento, desbloquearAudio, { capture: true, passive: true });
  }
}

export function sonar(nombre, volumen = 0.6) {
  if (!audioActivo()) return cuandoSuene(() => sonar(nombre, volumen));
  if (!buffers[nombre]) return;
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
export function sonidoEstrella(valor, conVibracion = true) {
  // Vibración en cascada con las notas: cada estrella un pulso más largo que la anterior (más estrellas, más intenso).
  if (conVibracion) {
    const patron = [];
    for (let i = 0; i < valor; i++) patron.push(35 + i * 25, 30);
    if (valor === 5) patron.push(220);
    haptico(patron);
  }
  if (!audioActivo()) return cuandoSuene(() => sonidoEstrella(valor, false));
  roce(0, 0.05);
  for (let i = 0; i < valor; i++) {
    const ultima = i === valor - 1;
    gota(PENTATONICA[i], i * 0.045, ultima ? 0.13 : 0.05, ultima ? 0.6 : 0.3);
  }
  if (valor === 5) gota(PENTATONICA[4] * 1.5, 5 * 0.045 + 0.03, 0.04, 0.8);
}

// Caritas: burbuja grave para "mal" y más aguda y doble para "increíble".
const TONO_CARITA = [330, 392, 494, 587, 659];
const VIBRA_CARITA = [[120], [60], [40, 60, 50], [40, 50, 40, 50, 90], [40, 40, 40, 40, 40, 40, 180]];
export function sonidoCarita(nivel, conVibracion = true) {
  if (conVibracion) haptico(VIBRA_CARITA[Math.max(0, Math.min(4, nivel - 1))]);
  if (!audioActivo()) return cuandoSuene(() => sonidoCarita(nivel, false));
  const i = Math.max(0, Math.min(4, nivel - 1));
  roce(0, 0.04, 3400, 0.014);
  burbuja(TONO_CARITA[i], 0.005, 0.2);
  if (i >= 3) burbuja(TONO_CARITA[i] * 1.26, 0.075, 0.12);
  if (i === 4) gota(1568, 0.15, 0.05, 0.5);
}

// Toque mínimo para chips y motivos.
export function sonidoToque(conVibracion = true) {
  if (conVibracion) haptico([28]);
  if (!audioActivo()) return cuandoSuene(() => sonidoToque(false));
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

// Patrón de vibración de cada acción (milisegundos: vibra, pausa, vibra...). En Android es literal; en iPhone se
// traduce a golpes hápticos con el mismo ritmo.
const HAPTICOS = {
  toque: [30],
  seleccion: [40],
  abrir: [25, 45, 50],
  agregar: [45, 60, 110],
  llega: [35],
  quitar: [90],
  mas: [30],
  menos: [30],
  enviar: [50, 50, 50, 50, 180], // tac, tac... ¡pum! el ticket sale a cocina
  preparando: [70, 90, 70],
  "en-mesa": [180, 90, 180, 90, 320],
  "pago-tarjeta": [60, 140, 60, 60, 220], // pitido de la terminal y "aprobado"
  "pago-efectivo": [35, 45, 35, 45, 35, 90, 160], // monedas
  "pago-en-linea": [40, 50, 80, 50, 200],
  billete: [45],
  nfc: [40, 80, 40],
  publicar: [40, 50, 40, 50, 120],
  logo: [120, 50, 280],
};

export function efecto(nombre, conVibracion = true) {
  if (conVibracion && HAPTICOS[nombre]) haptico(HAPTICOS[nombre]);
  if (!EFECTOS[nombre]) return;
  cuandoSuene(() => EFECTOS[nombre]());
}

// Propina: un clic que sube de tono con el porcentaje.
// Propina: cada punto da un clic que se siente más fuerte cuanto más alta la propina; cada 5 % un "tope" marcado.
export function sonidoPropina(porcentaje, conVibracion = true) {
  if (conVibracion) haptico(porcentaje % 5 === 0 ? [55 + porcentaje * 2] : [22 + porcentaje]);
  if (!audioActivo()) return cuandoSuene(() => sonidoPropina(porcentaje, false));
  roce(0, 0.03, 4500, 0.008);
  gota(700 + porcentaje * 22, 0, 0.022, 0.07);
}

// ---------- Vibración ----------
// Android: Vibration API (patrones de duración; la fuerza la pone el celular).
// iPhone (iOS 18+): no tiene Vibration API; tocar un interruptor nativo produce un golpe háptico (el del Taptic
// Engine), con fuerza fija y solo durante un toque del usuario. Los patrones se arman con varios golpes.
function golpeIOS() {
  const etiqueta = document.createElement("label");
  etiqueta.setAttribute("aria-hidden", "true");
  etiqueta.style.display = "none";
  const entrada = document.createElement("input");
  entrada.type = "checkbox";
  entrada.setAttribute("switch", "");
  etiqueta.append(entrada);
  document.head.append(etiqueta);
  etiqueta.click();
  etiqueta.remove();
}

// Reproduce un patrón [vibra, pausa, vibra, ...].
export function haptico(patron) {
  const pulsos = Array.isArray(patron) ? patron : [patron];
  if (navigator.vibrate) {
    // Android no deja elegir la fuerza: los pulsos de menos de ~30 ms casi no se sienten.
    const fuerte = pulsos.map((ms, i) => (i % 2 === 0 ? Math.min(600, Math.max(30, ms)) : ms));
    try { navigator.vibrate(fuerte); } catch {}
    return;
  }
  // iPhone: un golpe por pulso al mismo ritmo; los pulsos largos (más "pesados") llevan un segundo golpe pegado.
  let t = 0;
  const golpes = [];
  pulsos.forEach((ms, i) => {
    if (i % 2 === 0) {
      golpes.push(t);
      if (ms >= 110) golpes.push(t + 55);
      if (ms >= 260) golpes.push(t + 110);
    }
    t += ms;
  });
  let ultimo = -999;
  for (const g of golpes) {
    const cuando = Math.max(g, ultimo + 50); // más juntos se funden en uno
    ultimo = cuando;
    if (cuando === 0) golpeIOS();
    else setTimeout(golpeIOS, cuando);
  }
}

export const vibrar = haptico;

// Mini conversión: sonido + vibración juntos.
export function sentir(nombre, patron, volumen) {
  sonar(nombre, volumen);
  vibrar(patron);
}
