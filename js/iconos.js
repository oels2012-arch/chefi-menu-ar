// Íconos de Chefi dibujados en SVG (la interfaz nunca usa emojis). Todos en una cuadrícula de 48 × 48.
// - Los de interfaz llevan contorno carbón, como el resto del diseño.
// - Los de alergias son "suaves": sin contorno duro, con el trazo en un tono más oscuro de su propio color.
// - Los de ingredientes se usan en los interruptores de "A tu gusto".

const K = "#1F1F1F";
const O = "#F26B1D";
const G = "#2E9E6A";
const Y = "#F6C445";
const C = "#FFF6EC";
const C2 = "#FBE7D2";
const PAN = "#E8A44A";
const CARNE = "#6B3A1F";
const ROJO = "#E0533A";

const linea = `fill="none" stroke="${K}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
const con = (relleno, extra = "") => `fill="${relleno}" stroke="${K}" stroke-width="2" stroke-linejoin="round" ${extra}`;
const palomita = (x, y, color = "#fff") =>
  `<path d="M${x - 3.6} ${y}l2.6 2.6 4.8-5.2" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
const ojos = (y = 18) => `<circle cx="20.5" cy="${y}" r="1.2" fill="${K}"/><circle cx="27.5" cy="${y}" r="1.2" fill="${K}"/>`;

const DIBUJOS = {
  // ---------- Alergias (estilo suave) ----------
  gluten: `
    <path d="M24 44V13" fill="none" stroke="#C99A1E" stroke-width="2" stroke-linecap="round"/>
    ${[16, 23, 30].map((y) => `
      <ellipse cx="19.4" cy="${y}" rx="3.3" ry="5.6" transform="rotate(-38 19.4 ${y})" fill="${Y}" stroke="#C99A1E" stroke-width="1.6"/>
      <ellipse cx="28.6" cy="${y}" rx="3.3" ry="5.6" transform="rotate(38 28.6 ${y})" fill="${Y}" stroke="#C99A1E" stroke-width="1.6"/>`).join("")}
    <ellipse cx="24" cy="9" rx="3" ry="5.4" fill="${Y}" stroke="#C99A1E" stroke-width="1.6"/>
    <path d="M18.4 14.6l1.6-1.4M18.4 21.6l1.6-1.4M18.4 28.6l1.6-1.4" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>`,
  lacteos: `
    <path d="M19 5.5h10v6.5l4.5 6.5v21.5a3.5 3.5 0 0 1-3.5 3.5H18a3.5 3.5 0 0 1-3.5-3.5V18.5L19 12z" fill="#fff" stroke="#D9C2A6" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M15.6 24h16.8v15.7a2.6 2.6 0 0 1-2.6 2.6H18.2a2.6 2.6 0 0 1-2.6-2.6z" fill="${C}"/>
    <rect x="18.4" y="3.5" width="11.2" height="4.6" rx="1.8" fill="${G}"/>
    <rect x="17.4" y="27" width="13.2" height="9.4" rx="2.4" fill="#8FD1AE"/>
    <path d="M24 28.6c-1.8 2.2-2.6 3.4-2.6 4.4a2.6 2.6 0 0 0 5.2 0c0-1-.8-2.2-2.6-4.4z" fill="#fff"/>
    <path d="M18.2 20v-1.4l2.6-3.8" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".9"/>`,
  huevo: `
    <path d="M24 5.5c-8 0-13.5 12.4-13.5 21.5 0 8.6 6 14.6 13.5 14.6S37.5 35.6 37.5 27C37.5 17.9 32 5.5 24 5.5z" fill="${C}" stroke="#E3B98F" stroke-width="1.6"/>
    <path d="M33.6 22.5c1.4 3 2 6.2 1.2 9.4-1.2 4.4-4.6 7.2-8.6 7.8 6.4-3.8 8.2-10.4 7.4-17.2z" fill="${C2}"/>
    <ellipse cx="18.6" cy="19" rx="2.6" ry="4.6" transform="rotate(22 18.6 19)" fill="#fff"/>`,
  nueces: `
    <path d="M24 5c-6.2 0-9.4 4.2-9.4 9.2 0 3.4 1.8 5.4 1.8 8 0 2.4-2.8 4-2.8 9 0 6.4 4.6 11.3 10.4 11.3s10.4-4.9 10.4-11.3c0-5-2.8-6.6-2.8-9 0-2.6 1.8-4.6 1.8-8C33.4 9.2 30.2 5 24 5z" fill="#F2B872" stroke="#C98A43" stroke-width="1.6"/>
    <g fill="#C98A43" opacity=".55">${[[20, 12], [27, 11], [24, 16], [19.5, 19], [28.5, 19], [21, 30], [27, 29], [24, 35], [19, 36], [29, 36]]
      .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.1" ry=".8"/>`).join("")}</g>
    <path d="M19 9.6c1-1.6 2.6-2.4 4-2.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".85"/>`,
  mariscos: `
    <path d="M31 9.5c-10.4-1-20.5 5.6-20.5 16.6 0 7.4 5.4 13.4 12.6 13.4 4.2 0 6.6-3 5.6-6.2-.8-2.2-3-3.2-5.2-3.2-3 0-4.4-2-4.4-4.2 0-5 4.8-8.8 10.8-8.8 3 0 4.6-1.8 4.6-3.8s-1.6-3.6-3.5-3.8z" fill="#F9A46B" stroke="#E0743A" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M16.4 18.6l5 3.4M12.8 25.6l6.4.4M14.6 32.6l5.6-2.6" fill="none" stroke="#E0743A" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M23 39.4l5.2 4.4 1.4-6.2z" fill="#F9A46B" stroke="#E0743A" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="31.4" cy="12.8" r="1.4" fill="${K}"/>
    <path d="M33.6 10.4c3.6-3.4 7.6-3.8 11-2M34.6 12.6c3.8-1.4 7-.6 9.4 1.8" fill="none" stroke="#E0743A" stroke-width="1.4" stroke-linecap="round"/>`,

  // ---------- ¿Solo o con amigos? ----------
  solo: `
    <path d="M10 43c0-8.6 6.2-14.4 14-14.4S38 34.4 38 43z" ${con(O)}/>
    <circle cx="24" cy="16.5" r="8" ${con(C2)}/>
    <path d="M16.2 15.4a8 8 0 0 1 15.6 0c-2.6-1.6-5.4-2.4-7.8-2.4s-5.2.8-7.8 2.4z" fill="${K}"/>
    ${ojos(18)}<path d="M21.4 21.4q2.6 2 5.2 0" ${linea} stroke-width="1.6"/>
    <path d="M38 8.5l1.2 2.6 2.6 1.2-2.6 1.2L38 16.1l-1.2-2.6-2.6-1.2 2.6-1.2z" fill="${Y}" stroke="${K}" stroke-width="1.4" stroke-linejoin="round"/>`,
  amigos: `
    <path d="M2.5 40c0-6.6 4.4-11 10-11s10 4.4 10 11z" ${con(G)}/><circle cx="12.5" cy="20" r="6" ${con(C2)}/>
    <path d="M25.5 40c0-6.6 4.4-11 10-11s10 4.4 10 11z" ${con(Y)}/><circle cx="35.5" cy="20" r="6" ${con(C2)}/>
    <path d="M12 44c0-7.6 5.4-12.6 12-12.6S36 36.4 36 44z" ${con(O)}/><circle cx="24" cy="22" r="7" ${con(C2)}/>
    <path d="M17.2 21a7 7 0 0 1 13.6 0c-2.2-1.4-4.6-2-6.8-2s-4.6.6-6.8 2z" fill="${K}"/>
    <path d="M21.6 25.6q2.4 1.8 4.8 0" ${linea} stroke-width="1.6"/>`,

  // ---------- Métodos de pago ----------
  tarjeta: `
    <rect x="4" y="11" width="40" height="27" rx="5" ${con(O)}/>
    <rect x="9" y="18" width="8.5" height="6.5" rx="1.6" fill="${Y}" stroke="${K}" stroke-width="1.6"/>
    <path d="M9 31h11M23.5 31h6" fill="none" stroke="${C}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M33 18.6a5 5 0 0 1 0 6M36.4 16.4a9 9 0 0 1 0 10.4" fill="none" stroke="${C}" stroke-width="2" stroke-linecap="round"/>`,
  "en-linea": `
    <rect x="13" y="4" width="22" height="40" rx="5.5" ${con(C)}/>
    <rect x="16.5" y="9.5" width="15" height="26" rx="2.5" fill="${C2}"/>
    <path d="M21.5 6.8h5" ${linea} stroke-width="1.6"/>
    <circle cx="24" cy="22" r="6" fill="${G}" stroke="${K}" stroke-width="1.8"/>${palomita(24, 22)}
    <circle cx="24" cy="39.6" r="1.4" fill="${K}"/>`,
  efectivo: `
    <rect x="3" y="11" width="34" height="23" rx="3.5" ${con(G)}/>
    <rect x="7" y="15" width="26" height="15" rx="2" fill="none" stroke="#fff" stroke-width="1.6" opacity=".7"/>
    <circle cx="20" cy="22.5" r="4.2" fill="none" stroke="#fff" stroke-width="2"/>
    <circle cx="36.5" cy="33.5" r="8.5" ${con(Y)}/>
    <circle cx="36.5" cy="33.5" r="5" fill="none" stroke="#C99A1E" stroke-width="1.6"/>
    <path d="M33 29.6a5.4 5.4 0 0 1 3-1.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`,

  // ---------- Etapas del pedido ----------
  recibido: `
    <path d="M12 5h22v35.5l-3.7-2.6-3.6 2.6-3.7-2.6-3.7 2.6-3.6-2.6-3.7 2.6z" ${con(C)}/>
    <path d="M17 13h12M17 19h8M17 25h10" ${linea} stroke-width="2.2" opacity=".55"/>
    <circle cx="34" cy="34" r="8" fill="${G}" stroke="${K}" stroke-width="2"/>${palomita(34, 34)}`,
  preparando: `
    <path d="M17 18c-2.2-3 2.2-5.2 0-8.6M23.5 18c-2.2-3 2.2-5.2 0-8.6M30 18c-2.2-3 2.2-5.2 0-8.6" fill="none" stroke="#9C8F84" stroke-width="2" stroke-linecap="round"/>
    <path d="M36 28.5h8.5" fill="none" stroke="${K}" stroke-width="4.4" stroke-linecap="round"/>
    <path d="M6 25h30c0 8-6 13-15 13S6 33 6 25z" ${con(K)}/>
    <ellipse cx="21" cy="25" rx="13" ry="3.2" fill="${O}" stroke="${K}" stroke-width="1.6"/>
    <circle cx="17" cy="24.6" r="1.6" fill="${Y}"/><circle cx="24.5" cy="25.4" r="1.4" fill="${Y}"/>`,
  "en-mesa": `
    <rect x="3.5" y="35" width="41" height="5" rx="2.5" ${con(C)}/>
    <path d="M7 35a17 17 0 0 1 34 0z" ${con(Y)}/>
    <path d="M13.6 30a11.4 11.4 0 0 1 6.4-8.4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="24" cy="15.5" r="3" ${con(O)}/>`,

  // ---------- Personas que se califican ----------
  mesero: `
    <path d="M8 46c0-9.6 6.6-16 16-16s16 6.4 16 16z" ${con(K)}/>
    <path d="M19 30.8l5 8.4 5-8.4" fill="${C}" stroke="${K}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M19.6 32.4l4.4 2.2 4.4-2.2v4.4l-4.4-2.2-4.4 2.2z" fill="${O}" stroke="${K}" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="24" cy="17.5" r="8.5" ${con(C2)}/>
    <path d="M15.6 16.2a8.5 8.5 0 0 1 16.8 0c-2.4-2.4-5.2-3.2-8.4-3.2-2.8 0-5.6.8-8.4 3.2z" fill="${K}"/>
    ${ojos(19)}<path d="M21.2 22.4q2.8 2.2 5.6 0" ${linea} stroke-width="1.6"/>`,
  chef: `
    <path d="M8 46c0-9.6 6.6-16 16-16s16 6.4 16 16z" ${con("#fff")}/>
    <path d="M19.4 30.6l4.6 3.6 4.6-3.6" fill="${O}" stroke="${K}" stroke-width="1.6" stroke-linejoin="round"/>
    <g fill="${K}"><circle cx="20.6" cy="38.4" r="1.2"/><circle cx="27.4" cy="38.4" r="1.2"/><circle cx="20.6" cy="43" r="1.2"/><circle cx="27.4" cy="43" r="1.2"/></g>
    <circle cx="24" cy="21" r="8" ${con(C2)}/>
    <path d="M14.6 13.6a5.4 5.4 0 0 1 4.6-8 6.4 6.4 0 0 1 9.6 0 5.4 5.4 0 0 1 4.6 8z" ${con("#fff")}/>
    <rect x="16.4" y="12.6" width="15.2" height="4.4" rx="1.4" ${con(C)}/>
    ${ojos(22)}<path d="M21.2 25.4q2.8 2.2 5.6 0" ${linea} stroke-width="1.6"/>`,

  // ---------- Avisos y pistas ----------
  alerta: `
    <path d="M24 6.5L43.5 40.5h-39z" fill="${Y}" stroke="${K}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M24 18.5v11" ${linea} stroke-width="3.4"/><circle cx="24" cy="34.6" r="2" fill="${K}"/>`,
  check: `<path d="M12 25.5l7.5 7.5L36 15.5" fill="none" stroke="currentColor" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  girar: `
    <path d="M24 9l11 6v12l-11 6-11-6V15z" fill="${O}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M13 15l11 6 11-6M24 21v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M6.5 27.5c-1 1-1.5 2-1.5 3 0 5 8.5 9 19 9s19-4 19-9c0-1-.5-2-1.5-3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M37.5 36.5l5.4 1-1.6-5.2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  plato: `
    <ellipse cx="24" cy="30" rx="17" ry="9.5" ${con("#fff")}/>
    <ellipse cx="24" cy="29" rx="10" ry="5" fill="${C2}"/>
    <path d="M5 8v9a3 3 0 0 0 3 3v20M8 8v7M11 8v9a3 3 0 0 1-3 3" ${linea}/>
    <path d="M40 40V8c-3 2-4 7-4 12h4" fill="${C}" stroke="${K}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  grupo: `
    <circle cx="16" cy="18" r="5" fill="currentColor"/><circle cx="32" cy="18" r="5" fill="currentColor"/>
    <path d="M6 36c0-6 4.4-10 10-10s10 4 10 10zM22 36c0-6 4.4-10 10-10s10 4 10 10z" fill="currentColor"/>`,
  sonido: `
    <path d="M8 19h7l9-7.5v25L15 29H8z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M30 18.5a7.5 7.5 0 0 1 0 11M34.5 14a13.5 13.5 0 0 1 0 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`,

  // ---------- Ingredientes ----------
  pan: `
    <path d="M5 25c0-10 8.4-16 19-16s19 6 19 16z" ${con(PAN)}/>
    <rect x="5" y="28.5" width="38" height="8.5" rx="3.6" ${con(PAN)}/>
    <g fill="${C}">${[[15, 16], [22, 14], [29, 15.4], [34.6, 19.6], [18.4, 20.6], [26.6, 20]].map(([x, y]) =>
      `<ellipse cx="${x}" cy="${y}" rx="1.6" ry=".9" transform="rotate(-20 ${x} ${y})"/>`).join("")}</g>
    <path d="M10.6 21a12.4 12.4 0 0 1 5-6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>`,
  carne: `
    <ellipse cx="24" cy="27" rx="19.5" ry="10" ${con(CARNE)}/>
    <ellipse cx="24" cy="24.4" rx="16.4" ry="6.4" fill="#8A4B27"/>
    <path d="M14 21.6l5 5M21.6 20.4l5 5.4M29.4 20.8l4.6 4.8" fill="none" stroke="#3B1E0D" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M10 25.6c1.6-2.4 4-3.8 6.6-4.4" fill="none" stroke="#B87447" stroke-width="1.8" stroke-linecap="round"/>`,
  queso: `
    <path d="M5 12h38v15c-3.4 0-3 7-6.6 7s-3.2-7-6.6-7H5z" ${con(Y)}/>
    <g fill="#E3A92B"><circle cx="13" cy="19" r="2.4"/><circle cx="24" cy="17" r="1.7"/><circle cx="34" cy="20" r="2.6"/><circle cx="19" cy="24.6" r="1.4"/></g>`,
  tocino: `
    <path d="M4 18c6-6.5 10.6 6 16.6 0S30.6 24 44 18v9c-13.4 6-16.4-6-23.4 0s-10.6-6.5-16.6 0z" ${con(ROJO)}/>
    <path d="M5 23.4c5.4-5 10 5.4 16 0s10.6 5.4 22 0" fill="none" stroke="${C}" stroke-width="2.4" stroke-linecap="round"/>`,
  cebolla: `
    <path d="M24 5a19 19 0 1 0 .01 0zM24 15a9 9 0 1 1-.01 0z" fill="${PAN}" fill-rule="evenodd" stroke="${K}" stroke-width="2"/>
    <g fill="#C27A2C"><circle cx="13" cy="17" r="1.2"/><circle cx="35" cy="15" r="1.1"/><circle cx="37" cy="30" r="1.3"/><circle cx="14" cy="33" r="1.1"/><circle cx="24" cy="39.6" r="1.2"/></g>`,
  lechuga: `
    <path d="M7 31c-2.6-8.4 3.6-16.6 12-18.6 2.2-4.2 8.4-6 12.4-3 5.2-1 9.4 3.2 8.4 8.4 4.2 3.2 3.2 9.4-1 11.4-1 5.2-7.2 7.2-11.4 5.2-5.2 3.2-12.4 2-15.6-2.2-3-.2-4.8-1.2-4.8-1.2z" ${con("#57B67F")}/>
    <path d="M10 34C18 27 27 20 37 13M19 27.4l-2-6M25 22.6l5 2M30 18.4l-1.4-5" fill="none" stroke="#E8F6EC" stroke-width="2" stroke-linecap="round"/>`,
  jitomate: `
    <circle cx="24" cy="26" r="17" ${con(ROJO)}/>
    <circle cx="24" cy="26" r="12.4" fill="${O}"/>
    <g fill="${Y}"><ellipse cx="24" cy="19.6" rx="2.6" ry="4" /><ellipse cx="18.4" cy="29" rx="2.6" ry="4" transform="rotate(60 18.4 29)"/><ellipse cx="29.6" cy="29" rx="2.6" ry="4" transform="rotate(-60 29.6 29)"/></g>
    <circle cx="24" cy="26" r="2.4" fill="${C}"/>`,
  tomate: `
    <circle cx="24" cy="27" r="16" ${con(ROJO)}/>
    <path d="M24 12l-3.6-4.4M24 12l5-3.4M24 12l-6.4 1.6M24 12l6.6 2.4M24 12V7" fill="none" stroke="${G}" stroke-width="3" stroke-linecap="round"/>
    <path d="M14 22a11 11 0 0 1 5-6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".75"/>`,
  papas: `
    <g ${con(Y)}><rect x="14" y="6" width="5" height="22" rx="1.4" transform="rotate(-8 16.5 17)"/><rect x="20.4" y="3" width="5" height="24" rx="1.4"/>
      <rect x="27" y="5" width="5" height="22" rx="1.4" transform="rotate(9 29.5 16)"/><rect x="32" y="9" width="4.6" height="18" rx="1.4" transform="rotate(16 34.3 18)"/></g>
    <path d="M10 22h28l-3.6 21H13.6z" ${con(O)}/>
    <path d="M17 30l7 4 7-4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  spaghetti: `
    <ellipse cx="24" cy="27" rx="18" ry="12" fill="#F3D27A" stroke="${K}" stroke-width="2"/>
    <path d="M10 27c4-6 10-7 14-3s9 3 12-1M12 32c5-4 10-2 13 0s8 2 11-3M15 21c4-2 8-1 10 1s7 2 10 0" fill="none" stroke="#D9A93A" stroke-width="2" stroke-linecap="round"/>
    <path d="M24 26c4-9 8-16 12-21" fill="none" stroke="${K}" stroke-width="2.4" stroke-linecap="round"/>`,
  salsa: `
    <path d="M6 22h36c0 10-8 18-18 18S6 32 6 22z" ${con(C)}/>
    <ellipse cx="24" cy="22" rx="18" ry="5" ${con(ROJO)}/>
    <circle cx="18" cy="21" r="1.6" fill="${O}"/><circle cx="28" cy="22.6" r="1.4" fill="${O}"/>
    <path d="M30 6c-2 3 2 5 0 8" fill="none" stroke="#9C8F84" stroke-width="2" stroke-linecap="round"/>`,
  ajo: `
    <path d="M24 6c2 4.4 13 10 13 21 0 7.4-6 13-13 13s-13-5.6-13-13c0-11 11-16.6 13-21z" ${con(C)}/>
    <path d="M24 11v28M18 17.6c-3.4 6.4-3.4 15 1.6 21.4M30 17.6c3.4 6.4 3.4 15-1.6 21.4" fill="none" stroke="#D8C3A8" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M20 42.6l-1 2.4M24 43v2.6M28 42.6l1 2.4" ${linea} stroke-width="1.6"/>`,
  parmesano: `
    <path d="M5 33L35 12l8 7v14z" fill="#FBE09A" stroke="${K}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M5 33h38v6H5z" fill="${Y}" stroke="${K}" stroke-width="2" stroke-linejoin="round"/>
    <g fill="#E3B23C"><circle cx="30" cy="24" r="2"/><circle cx="37" cy="27" r="1.5"/><circle cx="22" cy="29" r="1.3"/></g>`,
  albahaca: `
    <path d="M22 43C8 35 6 19 16 7c8 8 10.4 22.4 6 36z" ${con(G)}/>
    <path d="M26 41c4-10 12-15 19-14-2 9-9 15-19 14z" ${con("#57B67F")}/>
    <path d="M21 39c-2-9-3-18-5-27M28 38c4-4 8-7 13-8" fill="none" stroke="#B9E5C9" stroke-width="1.8" stroke-linecap="round"/>`,
  pepino: `
    <circle cx="24" cy="24" r="18" ${con(G)}/>
    <circle cx="24" cy="24" r="14.4" fill="#CFEBC4"/>
    <g fill="#F2F9EE">${Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return `<ellipse cx="${(24 + Math.cos(a) * 7).toFixed(1)}" cy="${(24 + Math.sin(a) * 7).toFixed(1)}" rx="1.5" ry="2.4" transform="rotate(${(i * 45 + 90)} ${(24 + Math.cos(a) * 7).toFixed(1)} ${(24 + Math.sin(a) * 7).toFixed(1)})"/>`;
    }).join("")}</g>`,
  aguacate: `
    <path d="M24 4c-7 0-9 9-12.6 16C8.6 25.6 8 29 8 31.6 8 39 14.6 45 24 45s16-6 16-13.4c0-2.6-.6-6-3.4-11.6C33 13 31 4 24 4z" ${con("#2F7D52")}/>
    <path d="M24 8.6c-5 0-6.6 7.4-9.6 13.4-2.2 4.4-2.8 7-2.8 9.4 0 5.8 5.4 10 12.4 10s12.4-4.2 12.4-10c0-2.4-.6-5-2.8-9.4-3-6-4.6-13.4-9.6-13.4z" fill="#D7EBA0"/>
    <circle cx="24" cy="30" r="6.6" fill="#8B5A2B" stroke="${K}" stroke-width="1.8"/>
    <path d="M21 27.6a3.4 3.4 0 0 1 2.4-1.6" fill="none" stroke="#C48A55" stroke-width="1.6" stroke-linecap="round"/>`,
  aceituna: `
    <path d="M8 12c10-6 22-6 32 2" fill="none" stroke="#5C7A2E" stroke-width="2" stroke-linecap="round"/>
    <path d="M24 10c-3 4-9 5-12 3 2-4 8-6 12-3z" fill="#7FA34A" stroke="${K}" stroke-width="1.6" stroke-linejoin="round"/>
    <ellipse cx="17" cy="29" rx="8" ry="10.5" transform="rotate(-14 17 29)" ${con("#7C9A3A")}/>
    <ellipse cx="32" cy="30" rx="8" ry="10.5" transform="rotate(12 32 30)" ${con("#5C7A2E")}/>
    <ellipse cx="14.6" cy="25" rx="2" ry="3.4" transform="rotate(-14 14.6 25)" fill="#fff" opacity=".55"/>`,
  chocolate: `
    <rect x="7" y="6" width="34" height="36" rx="3.4" ${con("#5A3218")}/>
    <path d="M18.3 6v36M29.6 6v36M7 18h34M7 30h34" fill="none" stroke="#3B1F0E" stroke-width="2"/>
    <path d="M10 9.6h5.6M21.4 9.6H27" fill="none" stroke="#8A5631" stroke-width="2" stroke-linecap="round"/>
    <path d="M27 42l14-14v10.6a3.4 3.4 0 0 1-3.4 3.4z" fill="${O}" stroke="${K}" stroke-width="2" stroke-linejoin="round"/>`,
  "huevo-frito": `
    <path d="M10 22c-4-8 4-15 11-12 5-5 15-3 16 4 7 1 9 9 5 14 2 7-5 12-11 10-5 5-14 3-16-3-7 0-10-8-5-13z" ${con("#fff")}/>
    <circle cx="24" cy="25" r="7.4" fill="${Y}" stroke="${K}" stroke-width="2"/>
    <path d="M20.6 22.4a4 4 0 0 1 3-2" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`,
  mantequilla: `
    <path d="M6 22l15-8 21 7-15 8.6z" fill="#FFF0B3" stroke="${K}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M6 22v10l21 8.6v-11z" fill="#FBE09A" stroke="${K}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M27 29.6v11L42 32V21z" fill="${Y}" stroke="${K}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M14 20.6l8-4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
};
// Extras de "En mi mesa" y marcas de los botones.
// Toque de entrada (intro): un punto con dos ondas, del color del texto.
DIBUJOS.toque = `
  <circle cx="24" cy="24" r="7" fill="currentColor"/>
  <circle cx="24" cy="24" r="13" fill="none" stroke="currentColor" stroke-width="3" opacity=".7"/>
  <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="2.4" opacity=".35"/>`;
DIBUJOS.cereza = `
    <path d="M26 20c1-6 5-11 12-14" ${linea} stroke-width="2.4"/>
    <path d="M36 7.4c3-2 6.4-1.6 8 .6-2.6 2.6-6 2.8-8-.6z" ${con(G)}/>
    <circle cx="23" cy="30" r="13" ${con(ROJO)}/>
    <path d="M14.6 27a9 9 0 0 1 5-5.6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".8"/>
    <path d="M21 19.6c1.6 1.4 4 1.4 5.6 0" ${linea} stroke-width="1.8"/>`;
DIBUJOS.crotones = `
    <rect x="5" y="20" width="19" height="19" rx="4" transform="rotate(-10 14.5 29.5)" ${con(PAN)}/>
    <rect x="24" y="8" width="18" height="18" rx="4" transform="rotate(12 33 17)" ${con("#F0C27A")}/>
    <rect x="27" y="28" width="14" height="14" rx="3.4" transform="rotate(-6 34 35)" ${con(PAN)}/>
    <g fill="#C27A2C"><circle cx="12" cy="27" r="1.3"/><circle cx="17.6" cy="33" r="1.1"/><circle cx="31" cy="15" r="1.2"/><circle cx="36" cy="20" r="1"/><circle cx="33" cy="35" r="1"/></g>`;
DIBUJOS.suma = `<path d="M24 11v26M11 24h26" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>`;
DIBUJOS.cerrar = `<path d="M13 13l22 22M35 13L13 35" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`;

// Los que se repiten con otro nombre.
DIBUJOS.harina = DIBUJOS.gluten;
DIBUJOS.leche = DIBUJOS.lacteos;
DIBUJOS["huevo-entero"] = DIBUJOS.huevo;

// Devuelve el SVG de un ícono como texto, listo para innerHTML (o para dibujarlo en un lienzo).
export function icono(nombre, clase = "") {
  const dibujo = DIBUJOS[nombre];
  if (!dibujo) return "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="ico ${clase}" aria-hidden="true">${dibujo}</svg>`;
}

// Carita de calificación (1 = mal ... 5 = increíble). El color de la cara lo pone el CSS (--cara).
export function carita(nivel) {
  const cejas = nivel === 1 ? `<path d="M12.6 17.6l6.4-2.6M35.4 17.6l-6.4-2.6" ${linea} stroke-width="2.2"/>` : "";
  const ojosC = nivel === 5
    ? `<path d="M14.6 21.4q3-4.2 6 0M27.4 21.4q3-4.2 6 0" ${linea} stroke-width="2.4"/>`
    : `<g class="carita-ojos"><ellipse cx="18" cy="21.4" rx="2" ry="${nivel === 1 ? 1.9 : 2.4}" fill="${K}"/><ellipse cx="30" cy="21.4" rx="2" ry="${nivel === 1 ? 1.9 : 2.4}" fill="${K}"/></g>`;
  const boca = {
    1: `<path d="M16.4 34.6q7.6-6.4 15.2 0" ${linea} stroke-width="2.4"/>`,
    2: `<path d="M17.4 32.4q6.6-2 13.2 0" ${linea} stroke-width="2.4"/>`,
    3: `<path d="M16.8 29.6q7.2 5.6 14.4 0" ${linea} stroke-width="2.4"/>`,
    4: `<path d="M15.4 28h17.2q-1.2 8.4-8.6 8.4T15.4 28z" fill="${K}" stroke="${K}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M19.6 33.8q4.4-2.6 8.8 0q-2 2.4-4.4 2.4t-4.4-2.4z" fill="${O}"/>`,
    5: `<path d="M13.6 27h20.8q-1.4 11-10.4 11T13.6 27z" fill="${K}" stroke="${K}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M18.4 34.4q5.6-3.2 11.2 0q-2.4 3.2-5.6 3.2t-5.6-3.2z" fill="${O}"/>`,
  }[nivel];
  const mejillas = nivel >= 4 ? `<ellipse class="carita-mejilla" cx="12.4" cy="28" rx="3" ry="2" fill="${O}" opacity=".35"/><ellipse class="carita-mejilla" cx="35.6" cy="28" rx="3" ry="2" fill="${O}" opacity=".35"/>` : "";
  const chispas = nivel === 5 ? `<g class="carita-chispas" fill="${Y}" stroke="${K}" stroke-width="1.2" stroke-linejoin="round">
      <path d="M41 4l1 2.4 2.4 1-2.4 1L41 10.8l-1-2.4-2.4-1 2.4-1z"/><path d="M5 36l.8 1.8 1.8.8-1.8.8L5 41.2l-.8-1.8-1.8-.8 1.8-.8z"/></g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="ico carita-svg" aria-hidden="true">
    <circle class="carita-cara" cx="24" cy="24" r="19.5" stroke="${K}" stroke-width="2"/>
    <path class="carita-brillo" d="M12.6 17.4a13 13 0 0 1 6.4-7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
    ${cejas}${ojosC}${boca}${mejillas}${chispas}</svg>`;
}

// Para el lienzo: convierte cada ícono en una imagen ya cargada.
export function imagenesDeIconos(nombres, lado) {
  return Promise.all(nombres.map((nombre) => new Promise((listo) => {
    const img = new Image(lado, lado);
    img.onload = () => listo([nombre, img]);
    img.onerror = () => listo([nombre, null]);
    const svg = icono(nombre).replace("<svg ", `<svg width="${lado}" height="${lado}" `);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }))).then((pares) => Object.fromEntries(pares.filter(([, img]) => img)));
}

// Billete dibujado con su color (aproximado al de los billetes mexicanos) y su denominación.
const COLOR_BILLETE = { 20: "#5BA7C9", 50: "#D96BA0", 100: "#E0533A", 200: "#2E9E6A", 500: "#4A7DBF", 1000: "#8E6BBF" };
export function billete(valor) {
  const color = COLOR_BILLETE[valor] ?? G;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 48" class="ico billete-svg" aria-hidden="true">
    <rect x="1.5" y="1.5" width="93" height="45" rx="6" fill="${color}" stroke="${K}" stroke-width="2"/>
    <rect x="7" y="7" width="82" height="34" rx="3.5" fill="none" stroke="#fff" stroke-width="1.4" opacity=".55"/>
    <circle cx="70" cy="24" r="11" fill="#fff" opacity=".28"/>
    <path d="M11 37c8-4 14-4 22 0" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".5"/>
    <text x="12" y="23" font-family="Unbounded, Arial Black, sans-serif" font-weight="700" font-size="${valor >= 1000 ? 12 : 14}" fill="#fff">$${valor}</text>
  </svg>`;
}

// Moneda con su valor.
export function monedaSvg(valor) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="ico moneda-svg" aria-hidden="true">
    <circle cx="24" cy="24" r="21" fill="${valor >= 10 ? "#D9D2C5" : Y}" stroke="${K}" stroke-width="2"/>
    <circle cx="24" cy="24" r="15.5" fill="none" stroke="${valor >= 10 ? "#A99F8F" : "#C99A1E"}" stroke-width="2"/>
    <text x="24" y="29.5" text-anchor="middle" font-family="Unbounded, Arial Black, sans-serif" font-weight="700" font-size="14" fill="${K}">${valor}</text>
  </svg>`;
}
