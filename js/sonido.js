// Efectos de sonido y vibración de las "mini conversiones" (agregar, pedir, pagar...).
// Los sonidos son los mismos del video de Chefi. Se cargan con Web Audio para que suenen sin retraso.
// El contexto se crea al cargar la página: si el navegador ya permite el audio, la intro suena desde el inicio;
// si no, se "desbloquea" con el primer toque.
// Estrellas y caritas usan sonidos sintetizados aquí mismo: suaves, cortos y táctiles (tipo ASMR).

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
