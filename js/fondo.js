// Fondo con profundidad: piso en perspectiva, manchas de color y partículas en capas que se mueven
// con el scroll y con la inclinación del celular (paralaje). Mismo lenguaje que el video de Chefi.

export function iniciarFondo() {
  const fondo = document.querySelector("[data-ref='fondo']");
  const capaParticulas = fondo.querySelector(".particulas");
  const colores = ["#F26B1D", "#2E9E6A", "#F6C445", "#1F1F1F"];
  for (let i = 0; i < 26; i++) {
    const p = document.createElement("i");
    const z = Math.random(); // 0 = lejos, 1 = cerca
    p.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;` +
      `--z:${z.toFixed(2)};--t:${(7 + Math.random() * 9).toFixed(1)}s;--d:${(-Math.random() * 10).toFixed(1)}s;` +
      `background:${colores[i % 4]};width:${(3 + z * 9).toFixed(1)}px;height:${(3 + z * 9).toFixed(1)}px;opacity:${(0.25 + z * 0.5).toFixed(2)}`;
    capaParticulas.append(p);
  }

  let inclX = 0;
  let inclY = 0;
  let pendiente = false;
  const pintar = () => {
    pendiente = false;
    const scroll = Math.min(window.scrollY, 2000);
    fondo.style.setProperty("--scroll", scroll.toFixed(0));
    fondo.style.setProperty("--ix", inclX.toFixed(3));
    fondo.style.setProperty("--iy", inclY.toFixed(3));
  };
  const pedir = () => {
    if (!pendiente) {
      pendiente = true;
      requestAnimationFrame(pintar);
    }
  };
  window.addEventListener("scroll", pedir, { passive: true });
  window.addEventListener("deviceorientation", (e) => {
    if (e.gamma == null) return;
    inclX = Math.max(-1, Math.min(1, e.gamma / 30));
    inclY = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    pedir();
  });
  // En computadora, el mouse hace de inclinación.
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    inclX = (e.clientX / window.innerWidth) * 2 - 1;
    inclY = (e.clientY / window.innerHeight) * 2 - 1;
    pedir();
  });
  pintar();
}

// iPhone pide permiso para leer el movimiento (inclinación y sacudida). Se pide dentro de un toque.
export function pedirMovimiento() {
  const pedirA = [window.DeviceOrientationEvent, window.DeviceMotionEvent].filter((E) => E?.requestPermission);
  pedirA.forEach((E) => E.requestPermission().catch(() => {}));
}
