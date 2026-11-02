// Efectos de sonido y vibración de las "mini conversiones" (agregar, pedir, pagar...).
// Los sonidos son los mismos del video de Chefi. Se cargan con Web Audio para que suenen sin retraso.
// Los de la interfaz (estrellas, caritas, agregar, pagar...) se sintetizan aquí mismo: suaves, cortos y táctiles.
// Los archivos de media/sfx quedan para la intro y para "se cayó el platillo".
//
// Cuándo puede sonar: el navegador solo deja sonar después de un toque válido (soltar el dedo o un clic).
// - En computadora y Android el contexto de audio se crea al cargar, por si el navegador ya lo permite.
// - En iPhone se crea dentro del primer toque válido (touchend o click); creado antes nace bloqueado.
// En cada toque se reintenta arrancar (también sirve al volver de la cámara AR, que lo deja "interrumpido").

const NOMBRES = ["tap", "pop1", "pop3", "pop2", "bubble", "success", "chime", "bell", "slide", "pay2", "nfc",
  "stamp", "swipe", "whoosh1", "whooshlow", "tick", "plate", "shimmer", "assemble2", "logo"];
export const ES_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && "ontouchend" in document);

let ctx = null;
let salidaGeneral = null;
const buffers = {};
const decodificando = {}; // nombre → promesa del sonido decodificado
const crudos = {}; // nombre → promesa del mp3 descargado (sin decodificar)

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
    ctx.addEventListener("statechange", vaciarCola);
    decodificar();
  } catch {
    ctx = null;
  }
  return ctx;
}

function descargar() {
  for (const n of NOMBRES) {
    crudos[n] ??= fetch(`media/sfx/${n}.mp3`).then((r) => r.arrayBuffer()).catch(() => null);
  }
}

function decodificar() {
  if (!ctx) return;
  descargar();
  for (const n of NOMBRES) {
    decodificando[n] ??= crudos[n].then((datos) => datos && new Promise((ok) =>
      ctx.decodeAudioData(datos.slice(0), (b) => { buffers[n] = b; ok(b); }, () => ok(null))));
  }
}

// Se prepara al cargar la página: descarga los sonidos y, fuera de iPhone, crea el contexto.
export function prepararAudio() {
  descargar();
  if (!ES_IOS) crear();
}

// true si el navegador ya deja reproducir sonido.
export const audioActivo = () => ctx?.state === "running";

// Lo que se pidió sonar mientras el audio arrancaba; suena en cuanto arranca (si fue hace menos de 1 s).
const cola = [];
function vaciarCola() {
  if (!audioActivo()) return;
  const ahora = performance.now();
  for (const { fn, t } of cola.splice(0)) if (ahora - t < 1000) fn();
}
function cuandoSuene(fn) {
  if (audioActivo()) return fn();
  if (!ctx) return;
  cola.push({ fn, t: performance.now() });
}

// Se llama en cada toque válido.
export function desbloquearAudio() {
  if (!crear()) return;
  if (ctx.state !== "running") {
    ctx.resume().then(vaciarCola).catch(() => {});
    // Un sonido vacío dentro del toque termina de "abrir" el audio en Safari.
    try {
      const fuente = ctx.createBufferSource();
      fuente.buffer = ctx.createBuffer(1, 1, 22050);
      fuente.connect(ctx.destination);
      fuente.start(0);
    } catch {}
  }
}

// Escucha los gestos que cuentan como toque válido (pointerup y touchstart no cuentan en Safari).
export function escucharDesbloqueo() {
  for (const evento of ["touchend", "click", "keydown", "mousedown"]) {
    document.addEventListener(evento, desbloquearAudio, { capture: true, passive: true });
  }
}

export function sonar(nombre, volumen = 0.6) {
  if (!audioActivo()) return cuandoSuene(() => sonar(nombre, volumen));
  if (!buffers[nombre]) {
    // Recién creado el contexto, el sonido puede estar decodificándose: suena si tarda menos de 1 s.
    const t = performance.now();
    decodificando[nombre]?.then((b) => b && performance.now() - t < 1000 && sonar(nombre, volumen));
    return;
  }
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
  roce(0, 0.1, 4200, 0.012);
  gota(1318.5, 0.004, 0.13, 0.12);
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

// Golpe de madera suave (selecciones): seco y sin brillo, nada de "ping pong". Medio-agudo: la bocina del
// celular casi no reproduce graves (abajo de ~500 Hz se pierde).
function madera(cuando, volumen = 0.3, tono = 980) {
  const t = ctx.currentTime + cuando;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const filtro = ctx.createBiquadFilter();
  filtro.type = "lowpass";
  filtro.frequency.value = tono * 2.6;
  osc.type = "triangle";
  osc.frequency.setValueAtTime(tono, t);
  osc.frequency.exponentialRampToValueAtTime(tono * 0.72, t + 0.05);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(volumen, t + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  osc.connect(filtro).connect(env).connect(salidaGeneral);
  osc.start(t);
  osc.stop(t + 0.12);
  roce(cuando, volumen * 0.3, 2600, 0.01);
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
  toque: () => { roce(0, 0.1, 3000, 0.01); gota(1318.5, 0.002, 0.14, 0.11); },
  seleccion: () => madera(0),
  abrir: () => { soplo(0, 500, 2400, 0.24, 0.05); gota(659, 0.07, 0.03, 0.35); gota(988, 0.12, 0.03, 0.45); },
  agregar: () => { roce(0, 0.03); gota(784, 0, 0.07, 0.35); gota(1175, 0.075, 0.08, 0.55); },
  llega: () => burbuja(560, 0, 0.32),
  quitar: () => { gota(784, 0, 0.08, 0.22); gota(587.3, 0.06, 0.08, 0.3); },
  mas: () => { roce(0, 0.08, 4000, 0.008); gota(1568, 0, 0.13, 0.11); },
  menos: () => { roce(0, 0.08, 3200, 0.008); gota(1174.7, 0, 0.13, 0.11); },
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
  billete: () => { soplo(0, 2600, 1500, 0.07, 0.22); madera(0.01, 0.16, 820); },
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

// Golpe del logo: el mp3 del video es casi puro grave y en la bocina del celular casi no se oye; esta capa
// brillante (campanas en Do mayor) suena encima para que el golpe se escuche también en el teléfono.
export function sonidoLogo(volumen = 1) {
  if (!audioActivo()) return cuandoSuene(() => sonidoLogo(volumen));
  roce(0, 0.12 * volumen, 3800, 0.02);
  campana(1046.5, 0, 0.14 * volumen);
  campana(1568, 0.06, 0.1 * volumen);
  gota(2093, 0.12, 0.08 * volumen, 0.9);
}

// Propina: cada punto da un clic que se siente más fuerte cuanto más alta la propina; cada 5 % un "tope" marcado.
export function sonidoPropina(porcentaje, conVibracion = true) {
  if (conVibracion) haptico(porcentaje % 5 === 0 ? [55 + porcentaje * 2] : [22 + porcentaje]);
  if (!audioActivo()) return cuandoSuene(() => sonidoPropina(porcentaje, false));
  roce(0, 0.09, 4500, 0.008);
  gota(1000 + porcentaje * 25, 0, 0.16, 0.08);
}

// ---------- Vibración ----------
// Android: Vibration API (patrones de duración; la fuerza la pone el celular).
// iPhone (iOS 18+): no tiene Vibration API; tocar un interruptor nativo produce un golpe háptico (el del Taptic
// Engine), con fuerza fija y solo durante un toque del usuario. Los patrones se arman con varios golpes.
// El interruptor tiene que estar "dibujado" (dentro de la pantalla aunque invisible): con display:none el
// iPhone no da el golpe.
let interruptor = null;
export function golpeIOS() {
  if (!interruptor?.isConnected) {
    interruptor = document.createElement("label");
    interruptor.setAttribute("aria-hidden", "true");
    interruptor.style.cssText = "position:fixed;left:0;bottom:0;width:2px;height:2px;overflow:hidden;opacity:.011;pointer-events:none;z-index:-1";
    const entrada = document.createElement("input");
    entrada.type = "checkbox";
    entrada.setAttribute("switch", "");
    entrada.tabIndex = -1;
    entrada.style.margin = "0";
    interruptor.append(entrada);
    document.body.append(interruptor);
  }
  interruptor.click();
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
