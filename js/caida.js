// "Se cayó el platillo": si el comensal gira el 3D con mucha fuerza (o sacude el celular),
// el platillo se cae y la pantalla se llena con sus ingredientes.

const VUELTAS_PARA_CAER = 1.6; // vueltas acumuladas en menos de un segundo
const VENTANA_MS = 1000;

// Llama a `alCaer` cuando el giro del visor o la sacudida del celular pasan el límite.
export function vigilarSacudida(visor, alCaer) {
  let anterior = null;
  let giros = []; // { t, angulo }

  visor.addEventListener("camera-change", (evento) => {
    if (evento.detail?.source !== "user-interaction") return;
    const { theta, phi } = visor.getCameraOrbit();
    const ahora = performance.now();
    if (anterior) {
      const delta = Math.abs(normalizar(theta - anterior.theta)) + Math.abs(phi - anterior.phi);
      giros.push({ t: ahora, angulo: delta });
    }
    anterior = { theta, phi };
    giros = giros.filter((g) => ahora - g.t < VENTANA_MS);
    const total = giros.reduce((s, g) => s + g.angulo, 0);
    if (total > VUELTAS_PARA_CAER * 2 * Math.PI) {
      giros = [];
      alCaer();
    }
  });

  // Android permite leer el acelerómetro sin pedir permiso; en iPhone basta con el giro del 3D.
  let golpes = [];
  window.addEventListener("devicemotion", (evento) => {
    if (!visor.isConnected) return;
    const a = evento.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    const fuerza = Math.hypot(a.x, a.y, a.z) - 9.8;
    const ahora = performance.now();
    if (fuerza > 16) golpes.push(ahora);
    golpes = golpes.filter((t) => ahora - t < 900);
    if (golpes.length >= 4) {
      golpes = [];
      alCaer();
    }
  });
}

function normalizar(angulo) {
  return Math.atan2(Math.sin(angulo), Math.cos(angulo));
}

// Lluvia de ingredientes que se apilan desde abajo hasta llenar la pantalla.
export function lluviaDeIngredientes(lienzo, emojis, alLlenarse) {
  const ctx = lienzo.getContext("2d");
  const escala = window.devicePixelRatio || 1;
  const ancho = window.innerWidth;
  const alto = window.innerHeight;
  lienzo.width = ancho * escala;
  lienzo.height = alto * escala;
  ctx.scale(escala, escala);

  const tam = Math.max(38, Math.min(56, ancho / 8));
  const anchoColumna = tam * 0.62;
  const columnas = new Array(Math.ceil(ancho / anchoColumna) + 1).fill(0);
  const piezas = [];
  // Cada emoji se dibuja una sola vez en su propio lienzo; luego solo se copia (mucho más rápido en celular).
  const sellos = Object.fromEntries(emojis.map((e) => {
    const c = document.createElement("canvas");
    const lado = Math.ceil(tam * 1.4 * escala);
    c.width = c.height = lado;
    const x = c.getContext("2d");
    x.font = `${tam * escala}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(e, lado / 2, lado / 2 + tam * 0.06 * escala);
    return [e, c];
  }));
  let avisado = false;
  let cuadro = 0;
  let activo = true;

  function nueva() {
    piezas.push({
      x: Math.random() * ancho,
      y: -tam - Math.random() * 200,
      vy: 2 + Math.random() * 3,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      e: emojis[Math.floor(Math.random() * emojis.length)],
      s: tam * (0.8 + Math.random() * 0.45),
      quieta: false,
    });
  }

  function paso() {
    if (!activo) return;
    cuadro++;
    const minimo = Math.min(...columnas);
    if (minimo < alto + tam) for (let i = 0; i < 6; i++) nueva();

    ctx.clearRect(0, 0, ancho, alto);
    for (const p of piezas) {
      if (!p.quieta) {
        p.vy += 0.6;
        p.y += p.vy;
        p.rot += p.vr;
        const col = Math.max(0, Math.min(columnas.length - 1, Math.floor(p.x / anchoColumna)));
        const piso = alto - columnas[col] - p.s * 0.35;
        if (p.y >= piso) {
          p.y = piso;
          p.quieta = true;
          const sube = p.s * 0.42;
          columnas[col] += sube;
          if (col > 0) columnas[col - 1] += sube * 0.5;
          if (col < columnas.length - 1) columnas[col + 1] += sube * 0.5;
        }
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      const lado = p.s * 1.4;
      ctx.drawImage(sellos[p.e], -lado / 2, -lado / 2, lado, lado);
      ctx.restore();
    }

    const lleno = Math.min(...columnas) > alto * 0.92;
    if (!avisado && (lleno || cuadro > 260)) {
      avisado = true;
      alLlenarse();
    }
    // Cuando ya no cae nada, se detiene la animación para no gastar batería.
    if (avisado && piezas.every((p) => p.quieta)) return;
    requestAnimationFrame(paso);
  }

  requestAnimationFrame(paso);
  return () => {
    activo = false;
    ctx.clearRect(0, 0, ancho, alto);
  };
}
