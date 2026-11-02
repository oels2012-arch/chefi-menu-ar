// Efectos de sonido y vibración de las "mini conversiones" (agregar, pedir, pagar...).
// Los sonidos son los mismos del video de Chefi. Se cargan con Web Audio para que suenen sin retraso;
// el navegador solo deja reproducir audio después del primer toque, por eso se "desbloquea" en el intro.

const NOMBRES = ["tap", "pop3", "pop2", "bubble", "success", "chime", "bell", "stars", "slide", "pay2", "nfc",
  "stamp", "swipe", "whoosh1", "tick", "plate", "shimmer"];

let ctx = null;
const buffers = {};
let cargando = null;

function cargar() {
  if (cargando) return cargando;
  cargando = Promise.all(NOMBRES.map(async (n) => {
    try {
      const datos = await (await fetch(`media/sfx/${n}.mp3`)).arrayBuffer();
      buffers[n] = await ctx.decodeAudioData(datos);
    } catch {}
  }));
  return cargando;
}

// Se llama dentro de un toque del usuario.
export function desbloquearAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    cargar();
  } catch {}
}

export function sonar(nombre, volumen = 0.6) {
  if (!ctx || !buffers[nombre]) return;
  const fuente = ctx.createBufferSource();
  const ganancia = ctx.createGain();
  ganancia.gain.value = volumen;
  fuente.buffer = buffers[nombre];
  fuente.connect(ganancia).connect(ctx.destination);
  fuente.start();
}

// Vibración. Android: Vibration API con patrón. iPhone (iOS 18+): no tiene Vibration API, pero tocar un
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
    navigator.vibrate(patron);
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
