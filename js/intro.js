// Intro: "Toca para entrar" → logo reveal de Chefi (hecho en Remotion, con sus efectos de sonido) → experiencia.
// El toque es necesario: los celulares solo dejan reproducir video con sonido después de que el usuario toca.

import { desbloquearAudio, vibrar } from "./sonido.js";

export function iniciarIntro({ mostrar }) {
  const intro = document.querySelector("[data-ref='intro']");
  const hash = location.hash.slice(1);
  // Solo al llegar a la página (desde la tarjeta NFC o el QR), no al recargar dentro de una pantalla.
  if (hash && hash !== "bienvenida") {
    intro.remove();
    return;
  }
  document.body.classList.add("con-intro");
  const video = intro.querySelector("video");
  const tocar = intro.querySelector("[data-accion-intro='entrar']");
  const saltar = intro.querySelector("[data-accion-intro='saltar']");
  let terminado = false;

  function terminar() {
    if (terminado) return;
    terminado = true;
    intro.classList.add("saliendo");
    document.body.classList.remove("con-intro");
    mostrar();
    setTimeout(() => intro.remove(), 900);
  }

  tocar.addEventListener("click", () => {
    desbloquearAudio();
    vibrar(20);
    intro.classList.add("reproduciendo");
    video.muted = false;
    video.currentTime = 0;
    video.play().catch(() => {
      // Si el navegador no deja el sonido, se ve sin sonido.
      video.muted = true;
      video.play().catch(terminar);
    });
  });
  // Al terminar el logo reveal se queda un instante el logo y la experiencia entra.
  video.addEventListener("timeupdate", () => {
    if (video.duration && video.currentTime > video.duration - 0.45) terminar();
  });
  video.addEventListener("ended", terminar);
  video.addEventListener("error", () => intro.classList.contains("reproduciendo") && terminar());
  saltar.addEventListener("click", (e) => {
    e.stopPropagation();
    desbloquearAudio();
    terminar();
  });
}
