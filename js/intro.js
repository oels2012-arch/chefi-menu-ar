// Intro: logo reveal de Chefi dibujado en vivo (SVG), con los mismos tiempos que ChaosLogo del video de Chefi
// (Remotion, ~/AGENTE MOTION GRAPHICS/src/compositions/chefi/v8/Cap5.tsx). Las bolitas de colores vuelan en espiral,
// se acomodan sobre la curva de la C, una línea las conecta, se funden en el trazo, cae el punto verde y aparece
// "chefi". Arranca sola. El navegador no deja sonar ni vibrar hasta que el usuario toca la pantalla: si ya trae el
// sonido permitido, suena desde el inicio; si no, en cuanto toca se activan el sonido y la vibración.

import { sonar, sonidoLogo, efecto, audioActivo, desbloquearAudio, vibrar } from "./sonido.js?v=202611121229";
import { icono } from "./iconos.js?v=202611121229";

const FPS = 30;
const FIN = 150; // cuadro en que la experiencia entra (el render web duraba 156)
const T0 = 30; // las bolitas empiezan a volar hacia la C
const R = 230; // radio de la C (unidades de la escena)
const K = R / 70; // escala respecto al símbolo de la marca (radio 70, trazo 30, punto 19)
const SW = 30 * K;
const N = 20;
const S = 2400; // lado de la escena
const TINTA = "#1F1F1F";
const VERDE_LOGO = "#1FA35B";
const COLORES = ["#2E9E6A", "#F6C445", "#F26B1D", "#FFF6EC"];
const LETRAS = ["c", "h", "e", "f", "ı"];
const SVGNS = "http://www.w3.org/2000/svg";

// ---------- Curvas (las mismas de Remotion) ----------
const limitar = (x) => Math.max(0, Math.min(1, x));
const cubica = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const cuadratica = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const salida = (t) => 1 - (1 - t) ** 3;
const rp = (f, a, b, curva = cubica) => curva(limitar((f - a) / (b - a)));
const lerp = (a, b, t) => a + (b - a) * t;
// Resorte amortiguado (equivale a spring() de Remotion a 30 fps).
function resorte(cuadros, { damping = 13, stiffness = 190, mass = 1 } = {}) {
  if (cuadros <= 0) return 0;
  const t = cuadros / FPS;
  const w = Math.sqrt(stiffness / mass);
  const z = damping / (2 * Math.sqrt(stiffness * mass));
  if (z >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}
function azar(semilla) {
  let h = 2166136261;
  for (const c of semilla) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// ---------- Trayectorias ----------
const aparece = (i) => 2 + (i % 10) * 2.2 + Math.floor(i / 10);
const LUGAR = Array.from({ length: N }, (_, i) => {
  const a = ((42 + (i / (N - 1)) * 276) * Math.PI) / 180;
  return [Math.cos(a) * R, Math.sin(a) * R];
});
const ANG = Array.from({ length: N }, (_, i) => azar(`iw-a${i}`) * Math.PI * 2);
const RAD = Array.from({ length: N }, (_, i) => 520 + azar(`iw-r${i}`) * 520);
function inicio(i, ff) {
  const propio = 1 - rp(ff, T0, T0 + 20, (t) => t);
  return [Math.cos(ANG[i]) * RAD[i] + Math.sin(ff / 7 + i) * 16 * propio, Math.sin(ANG[i]) * RAD[i] + Math.cos(ff / 8 + i) * 16 * propio];
}
function posicion(i, ff) {
  const d = i * 0.7;
  const j = rp(ff, T0 + d, T0 + d + 30);
  const [sx, sy] = inicio(i, ff);
  const [tx, ty] = LUGAR[i];
  const r0 = Math.hypot(sx, sy);
  const a0 = Math.atan2(sy, sx);
  let a1 = Math.atan2(ty, tx);
  while (a1 < a0 + 1.4) a1 += Math.PI * 2; // siempre gira hacia el mismo lado
  const ang = a0 + (a1 - a0) * j;
  const rad = r0 + (R - r0) * j ** 0.85;
  return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, j };
}

// ---------- Sonidos del logo reveal (los del render de Remotion) ----------
const POPS = ["pop1", "pop3", "bubble", "pop3", "pop2"];
const SFX = [
  { s: "whooshlow", at: 0, v: 0.5 },
  ...Array.from({ length: 10 }, (_, i) => ({ s: POPS[i % 5], at: aparece(i * 2), v: 0.28 })),
  { s: "assemble2", at: T0 + 24, v: 0.8 },
  ...Array.from({ length: 7 }, (_, k) => ({ s: "tick", at: T0 + 30 + k * 2.4, v: 0.9 })),
  { s: "logo", at: T0 + 54, v: 0.8, golpe: true },
  { s: "shimmer", at: T0 + 84, v: 0.5 },
];
const GANANCIA = 0.85;

function el(nombre, atributos = {}, padre) {
  const e = document.createElementNS(SVGNS, nombre);
  for (const [k, v] of Object.entries(atributos)) e.setAttribute(k, v);
  padre?.append(e);
  return e;
}

// Arma la escena una sola vez; cada cuadro solo cambia atributos.
function armarEscena(contenedor, mesa) {
  const escena = document.createElement("div");
  escena.className = "intro-escena";
  escena.style.cssText = `width:${S}px;height:${S}px;margin:${-S / 2}px 0 0 ${-S / 2}px`;
  const svg = el("svg", { viewBox: `${-S / 2} ${-S / 2} ${S} ${S}`, width: S, height: S }, null);
  escena.append(svg);

  const onda = el("g", {}, svg);
  const ondaC1 = el("circle", { fill: "none", stroke: "#2E9E6A" }, onda);
  const ondaC2 = el("circle", { fill: "none", stroke: "#fff" }, onda);
  const rayos = Array.from({ length: 12 }, (_, i) => el("line", { stroke: COLORES[i % 3], "stroke-linecap": "round" }, onda));

  const marca = el("g", {}, svg);
  const estelas = Array.from({ length: N }, (_, i) =>
    Array.from({ length: 9 }, () => el("circle", { fill: COLORES[i % 3] }, marca)));
  const linea = el("polyline", { fill: "none", stroke: TINTA, "stroke-linecap": "round", "stroke-linejoin": "round" }, marca);
  const a0 = (42 * Math.PI) / 180;
  const a1 = (318 * Math.PI) / 180;
  const arco = el("path", {
    d: `M ${Math.cos(a0) * R} ${Math.sin(a0) * R} A ${R} ${R} 0 1 1 ${Math.cos(a1) * R} ${Math.sin(a1) * R}`,
    fill: "none", stroke: TINTA, "stroke-linecap": "round",
  }, marca);
  const destello = el("circle", { r: SW * 0.42, fill: "#fff", opacity: 0.75 }, marca);
  const ondasPunto = [0, 6].map(() => el("circle", { cx: R, cy: 0, fill: "none", stroke: VERDE_LOGO }, marca));
  const bolitas = Array.from({ length: N }, () => el("circle", { stroke: TINTA }, marca));
  const grupoPunto = el("g", {}, svg);
  const punto = el("circle", { cx: R, r: 19 * K, fill: VERDE_LOGO }, grupoPunto);

  // El nombre sube desde una máscara, letra por letra.
  const nombre = document.createElement("div");
  nombre.className = "intro-nombre";
  nombre.style.cssText = `top:${S / 2 + R * 0.62}px;font-size:${R * 1.25}px;letter-spacing:${-R * 0.02}px`;
  const letras = LETRAS.map((ch, i) => {
    const caja = document.createElement("span");
    caja.className = "intro-letra";
    caja.style.padding = `${R * 0.14}px 2px 0`;
    const letra = document.createElement("span");
    letra.textContent = ch;
    caja.append(letra);
    nombre.append(caja);
    if (i === 4) {
      const p = document.createElement("i");
      p.className = "intro-punto-i";
      p.style.cssText = `top:${R * 0.2}px;width:${R * 0.21}px;height:${R * 0.21}px`;
      letra.append(p);
    }
    return letra;
  });
  const brillo = document.createElement("span");
  brillo.className = "intro-brillo";
  brillo.style.width = `${R * 0.6}px`;
  nombre.append(brillo);
  const rotulo = document.createElement("span");
  rotulo.className = "intro-rotulo";
  rotulo.textContent = mesa;
  rotulo.style.cssText = `top:${S / 2 + R * 0.62 + R * 1.72}px;font-size:${R * 0.24}px`;
  escena.append(nombre, rotulo);
  contenedor.prepend(escena);

  return { escena, onda, ondaC1, ondaC2, rayos, marca, estelas, linea, arco, destello, ondasPunto, bolitas, grupoPunto, punto, nombre, letras, brillo, rotulo };
}

function pintar(e, f) {
  const conn = rp(f, T0 + 30, T0 + 46, cuadratica) * (N - 1);
  const merge = rp(f, T0 + 45, T0 + 55);
  const dotT = T0 + 52;
  const nm = rp(f, T0 + 60, T0 + 78);
  const transf = `translate(0 ${-nm * R * 0.62}) scale(${1 - nm * 0.2})`;
  e.marca.setAttribute("transform", transf);
  e.grupoPunto.setAttribute("transform", transf);

  const pos = Array.from({ length: N }, (_, i) => posicion(i, f));
  // Estelas de color
  pos.forEach((p, i) => {
    const visible = p.j > 0.01 && p.j < 0.995 && f >= aparece(i);
    e.estelas[i].forEach((c, g) => {
      if (!visible) return c.setAttribute("opacity", 0);
      const q = posicion(i, f - (g + 1) * 0.9);
      c.setAttribute("cx", q.x.toFixed(1));
      c.setAttribute("cy", q.y.toFixed(1));
      c.setAttribute("r", ((lerp(150, SW, q.j) / 2) * (1 - g / 11)).toFixed(1));
      c.setAttribute("opacity", (0.42 * (1 - g / 9) * Math.sin(p.j * Math.PI)).toFixed(3));
    });
  });
  // La línea que conecta las bolitas en orden → el trazo de la C
  const hasta = Math.floor(conn);
  const puntos = LUGAR.slice(0, hasta + 1);
  if (hasta < N - 1 && conn > 0) {
    const [ax, ay] = LUGAR[hasta];
    const [bx, by] = LUGAR[hasta + 1];
    const fr = conn - hasta;
    puntos.push([ax + (bx - ax) * fr, ay + (by - ay) * fr]);
  }
  e.linea.setAttribute("points", conn > 0 ? puntos.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ") : "");
  e.linea.setAttribute("stroke-width", lerp(SW * 0.28, SW, merge));
  e.linea.setAttribute("opacity", conn > 0 ? 1 - merge * 0.999 : 0);
  e.arco.setAttribute("stroke-width", lerp(SW * 0.6, SW, merge));
  e.arco.setAttribute("opacity", merge);
  if (merge > 0 && merge < 1) {
    const a = ((42 + 276 * merge) * Math.PI) / 180;
    e.destello.setAttribute("cx", Math.cos(a) * R);
    e.destello.setAttribute("cy", Math.sin(a) * R);
    e.destello.setAttribute("opacity", 0.75);
  } else e.destello.setAttribute("opacity", 0);
  // Ondas cuando aterriza el punto
  [0, 6].forEach((d, k) => {
    const r = rp(f, dotT + 6 + d, dotT + 28 + d);
    const c = e.ondasPunto[k];
    c.setAttribute("opacity", r > 0 && r < 1 ? 1 - r : 0);
    c.setAttribute("r", 19 * K + r * 220);
    c.setAttribute("stroke-width", 14 * (1 - r));
  });
  // Bolitas
  pos.forEach((p, i) => {
    const c = e.bolitas[i];
    const a = aparece(i);
    if (f < a || merge >= 1) return c.setAttribute("opacity", 0);
    const golpe = Math.sin(rp(f, T0 + 30 + (i / (N - 1)) * 16 - 1, T0 + 30 + (i / (N - 1)) * 16 + 6) * Math.PI);
    const lado = lerp(150, SW * 0.98, p.j) * (1 + golpe * 0.18) * (1 - merge) * resorte(f - a);
    const borde = p.j < 0.7 ? 5 * (1 - p.j) : 0;
    c.setAttribute("opacity", 1);
    c.setAttribute("cx", p.x.toFixed(1));
    c.setAttribute("cy", p.y.toFixed(1));
    c.setAttribute("r", Math.max(0, lado / 2 - borde / 2).toFixed(1));
    c.setAttribute("stroke-width", borde);
    c.setAttribute("fill", conn >= i ? TINTA : COLORES[i % 4]);
  });
  // El punto verde cae con rebote
  const dotY = lerp(-R * 2.6, 0, resorte(f - dotT, { damping: 8, stiffness: 170, mass: 0.7 }));
  e.punto.setAttribute("cy", dotY);
  e.punto.setAttribute("opacity", f >= dotT ? 1 : 0);
  // Onda de choque cuando el caos se cierra en el logo
  const t = rp(f, T0 + 52, T0 + 70, salida);
  const choque = f >= T0 + 52 && t < 1;
  e.onda.setAttribute("opacity", choque ? 1 : 0);
  if (choque) {
    const r0 = 310;
    e.ondaC1.setAttribute("r", r0 + t * 520);
    e.ondaC1.setAttribute("stroke-width", 28 * (1 - t));
    e.ondaC1.setAttribute("opacity", 1 - t);
    e.ondaC2.setAttribute("r", r0 - 20 + t * 340);
    e.ondaC2.setAttribute("stroke-width", 16 * (1 - t));
    e.ondaC2.setAttribute("opacity", (1 - t) * 0.9);
    e.rayos.forEach((l, i) => {
      const an = (i / 12) * Math.PI * 2;
      const [c, s] = [Math.cos(an), Math.sin(an)];
      l.setAttribute("x1", c * (r0 + 30 + t * 300));
      l.setAttribute("y1", s * (r0 + 30 + t * 300));
      l.setAttribute("x2", c * (r0 + 70 + t * 460));
      l.setAttribute("y2", s * (r0 + 70 + t * 460));
      l.setAttribute("stroke-width", 14 * (1 - t));
    });
  }
  // El nombre
  e.nombre.style.opacity = nm > 0 ? 1 : 0;
  e.letras.forEach((l, i) => {
    const p = resorte(f - (T0 + 62) - i * 3, { damping: 14, stiffness: 170, mass: 0.7 });
    l.style.transform = `translateY(${(1 - p) * 110}%)`;
  });
  const puntoI = e.letras[4].querySelector("i");
  puntoI.style.transform = `translateX(-50%) scale(${resorte(f - (T0 + 80), { damping: 8, stiffness: 220, mass: 0.5 })})`;
  const barrido = lerp(-0.4, 1.4, rp(f, T0 + 84, T0 + 102));
  e.brillo.style.left = `${barrido * 100}%`;
  e.rotulo.style.opacity = rp(f, T0 + 92, T0 + 106);
  e.rotulo.style.transform = `translate(-50%, ${(1 - rp(f, T0 + 92, T0 + 110, salida)) * 30}px)`;
}

export function iniciarIntro({ mostrar, mesa }) {
  const intro = document.querySelector("[data-ref='intro']");
  const hash = location.hash.slice(1);
  // Solo al llegar a la página (desde la tarjeta NFC o el QR), no al recargar dentro de una pantalla.
  if (hash && hash !== "bienvenida") {
    intro.remove();
    mostrar();
    return;
  }
  document.body.classList.add("con-intro");
  const escena = armarEscena(intro, mesa);
  const aviso = intro.querySelector("[data-accion-intro='sonido']");
  aviso.insertAdjacentHTML("afterbegin", icono("sonido"));
  const saltar = intro.querySelector("[data-accion-intro='saltar']");
  let terminado = false;
  let tocado = false;
  let arranque = null;
  let ultimo = -1;
  let sonoLogo = false;

  // Escala la escena para que el logo completo quede centrado y nítido en cualquier pantalla.
  function acomodar() {
    const ancho = 840;
    const alto = 920;
    const k = Math.min((innerWidth * 0.84) / ancho, (innerHeight * 0.7) / alto, 0.56);
    escena.escena.style.setProperty("--k", k.toFixed(4));
    escena.escena.style.setProperty("--dy", `${(-90 * k).toFixed(1)}px`);
  }
  acomodar();
  addEventListener("resize", acomodar);

  function terminar() {
    if (terminado) return;
    terminado = true;
    intro.classList.add("saliendo");
    document.body.classList.remove("con-intro");
    removeEventListener("resize", acomodar);
    mostrar();
    setTimeout(() => intro.remove(), 900);
  }

  // Cámara: acercamiento lento (como el recorrido de Remotion) y un pequeño temblor en el golpe del logo.
  function camara(f) {
    const z = f < T0 + 40 ? lerp(0.8, 0.96, cubica(limitar(f / (T0 + 40)))) : lerp(0.96, 1.04, salida(limitar((f - T0 - 40) / (FIN - T0 - 40))));
    const temblor = Math.max(0, 1 - (f - (T0 + 54)) / 10) * (f >= T0 + 54 ? 1 : 0);
    const tx = Math.sin(f * 2.1) * 7 * temblor;
    const ty = Math.cos(f * 2.7) * 7 * temblor;
    escena.escena.style.transform = `translate(${tx}px, calc(var(--dy) + ${ty}px)) scale(calc(var(--k) * ${z.toFixed(4)}))`;
  }

  function cuadro(ahora) {
    if (terminado) return;
    arranque ??= ahora;
    const f = ((ahora - arranque) / 1000) * FPS;
    for (const s of SFX) {
      if (s.at > ultimo && s.at <= f) {
        // Ya tocaron: el audio puede estar arrancando; sonar() lo deja en espera y suena en cuanto arranque.
        if (audioActivo() || tocado) {
          sonar(s.s, s.v * GANANCIA);
          if (s.golpe) { sonidoLogo(); sonoLogo = true; }
        }
        if (s.golpe) vibrar([120, 50, 280]); // golpe del logo (Android, si ya tocó la pantalla)
      }
    }
    ultimo = f;
    pintar(escena, Math.min(f, FIN));
    camara(Math.min(f, FIN));
    if (f >= FIN) return terminar();
    requestAnimationFrame(cuadro);
  }

  // Si el navegador no deja sonar sin un toque, se invita a tocar; el primer toque activa sonido y vibración.
  setTimeout(() => !tocado && !audioActivo() && aviso.classList.add("visible"), 500);
  const alTocar = () => {
    if (tocado) return;
    tocado = true;
    desbloquearAudio();
    // Dentro del toque: en iPhone es el único momento en que se puede vibrar, así que va el golpe fuerte del logo.
    vibrar([120, 50, 280]);
    // Si el golpe del logo ya pasó sin sonido, suena ahora (espera a que el audio arranque).
    if (ultimo >= T0 + 54 && !sonoLogo) { sonar("logo", 0.8 * GANANCIA); sonidoLogo(); sonoLogo = true; }
    aviso.classList.remove("visible");
  };
  intro.addEventListener("click", alTocar);
  saltar.addEventListener("click", (e) => {
    e.stopPropagation();
    desbloquearAudio();
    efecto("toque");
    terminar();
  });

  // Espera la tipografía del logo (máximo 700 ms) para que "chefi" salga con su letra desde el primer cuadro.
  const fuentes = document.fonts?.load ? document.fonts.load(`800 100px "Inter Tight"`) : Promise.resolve();
  Promise.race([fuentes, new Promise((r) => setTimeout(r, 700))]).then(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      pintar(escena, FIN);
      camara(FIN);
      setTimeout(terminar, 1400);
      return;
    }
    requestAnimationFrame(cuadro);
  });
}
