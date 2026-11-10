// Panel de prueba de sonido y vibración (se abre con ?prueba en la dirección). Sirve para saber qué funciona en
// un celular en particular: cada botón prueba una sola cosa y el panel muestra el estado del audio.

import { audioActivo, desbloquearAudio, sonar, efecto, golpeIOS, haptico, ES_IOS } from "./sonido.js?v=202611101409";

export function abrirPrueba() {
  const panel = document.createElement("div");
  panel.className = "prueba";
  panel.innerHTML = `
    <strong>Prueba de sonido y vibración</strong>
    <p class="prueba-estado" data-prueba="estado"></p>
    <div class="prueba-botones">
      <button data-prueba="mp3">1. Sonido de archivo</button>
      <button data-prueba="sinte">2. Sonido sintetizado</button>
      <button data-prueba="golpe">3. Vibración iPhone (1 golpe)</button>
      <button data-prueba="patron">4. Vibración iPhone (patrón)</button>
      <button data-prueba="android">5. Vibración Android</button>
    </div>
    <label class="prueba-real">6. Toca este interruptor con el dedo <input type="checkbox" switch></label>
    <ol class="prueba-log" data-prueba="log"></ol>
    <button data-prueba="cerrar">Cerrar</button>`;
  document.body.append(panel);
  const log = panel.querySelector('[data-prueba="log"]');
  const anotar = (texto) => {
    const li = document.createElement("li");
    li.textContent = `${new Date().toLocaleTimeString("es-MX")} · ${texto}`;
    log.prepend(li);
  };
  const pintar = () => {
    panel.querySelector('[data-prueba="estado"]').textContent =
      `iPhone: ${ES_IOS ? "sí" : "no"} · audio: ${audioActivo() ? "sonando" : "bloqueado"} · ` +
      `audioSession: ${navigator.audioSession?.type ?? "no existe"} · vibrate: ${navigator.vibrate ? "sí" : "no"}`;
  };
  pintar();
  setInterval(pintar, 500);
  panel.addEventListener("click", (e) => {
    const b = e.target.closest("[data-prueba]");
    if (!b) return;
    e.stopPropagation();
    desbloquearAudio();
    const que = b.dataset.prueba;
    if (que === "mp3") { sonar("logo", 0.8); anotar("sonido de archivo pedido"); }
    if (que === "sinte") { efecto("agregar", false); anotar("sonido sintetizado pedido"); }
    if (que === "golpe") { golpeIOS(); anotar("1 golpe del interruptor oculto"); }
    if (que === "patron") { haptico([45, 60, 110, 60, 220]); anotar("patrón de golpes"); }
    if (que === "android") { anotar(navigator.vibrate ? `vibrate: ${navigator.vibrate([200, 100, 400])}` : "este celular no tiene vibrate"); }
    if (que === "cerrar") panel.remove();
    setTimeout(pintar, 300);
  });
  panel.querySelector(".prueba-real input").addEventListener("change", () => anotar("interruptor tocado con el dedo"));
}
