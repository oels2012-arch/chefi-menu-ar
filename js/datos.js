// Datos del menú. Para agregar un platillo, copia un bloque y cambia sus valores.
// Si un platillo no tiene modelo 3D, deja `modelo: null` y no se mostrará "Ver en mi mesa".
// Precios de ejemplo. Valores nutricionales aproximados de una porción de referencia.

export const RESTAURANTE = "Chefi";

export const CATEGORIAS = [
  { id: "fuertes", nombre: "Platos fuertes" },
  { id: "ensaladas", nombre: "Ensaladas" },
  { id: "postres", nombre: "Postres" },
];

export const PLATILLOS = [
  {
    id: "hamburguesa",
    categoria: "fuertes",
    nombre: "Hamburguesa con papas",
    descripcion: "Doble carne de res a la parrilla, cheddar, tocino, aros de cebolla, lechuga y papas a la francesa.",
    precio: 189,
    foto: "img/hamburguesa.webp",
    miniatura: "img/hamburguesa_chica.webp",
    modelo: "modelos/fuerte_hamburguesa.glb",
    modeloIOS: "modelos/fuerte_hamburguesa.usdz",
    alto: 0.131,
    porcion: "≈ 350 g",
    kcal: 950,
    carbohidratos: "95 g",
    carne: "120 g",
    contiene: "Gluten, lácteos",
    ingredientes: [["pan","Pan brioche"],["carne","Carne de res"],["queso","Queso cheddar"],["tocino","Tocino"],["cebolla","Aros de cebolla"],["lechuga","Lechuga"],["jitomate","Jitomate"],["papas","Papas"]],
    // "En mi mesa": ingredientes que se pueden quitar o poner sobre el modelo 3D (ver js/mesa.js y herramientas/capas.py).
    // El orden de las opciones es el de los bits del archivo de AR para iPhone (modelos/variantes/<platillo>_<bits>.usdz,
    // hechos con herramientas/ar_iphone.py: traen placas 3D para quitar y poner el ingrediente dentro de la cámara).
    personalizar: {
      modelo: "modelos/capas/hamburguesa.glb",
      variantes: "modelos/variantes/hamburguesa_{bits}.usdz",
      opciones: [
        { id: "lechuga", nombre: "Lechuga", icono: "lechuga", incluido: true, tipo: "anillo" },
        { id: "jitomate", nombre: "Jitomate", icono: "jitomate", incluido: false, tipo: "capa" },
        { id: "carne", nombre: "Doble carne", sin: "Carne sencilla", icono: "carne", incluido: true, tipo: "anillo" },
        { id: "queso", nombre: "Queso extra", icono: "queso", incluido: false, tipo: "capa" },
      ],
      // Cómo se acomoda la hamburguesa escaneada al cambiar un ingrediente. Mismas medidas (metros) que
      // herramientas/lechuga.py. "quita": al quitarlo, lo de arriba baja el alto de su banda. "pone": pieza
      // dibujada que entra a esa altura y levanta lo de arriba su grosor.
      asentar: {
        centro: [0.006, 0.04], radio: [0.058, 0.066], frente: [-0.012, 0], alto: [0.08, 0.09],
        pasos: [
          { id: "lechuga", quita: [0.029, 0.042] },
          { id: "jitomate", pone: 0.042, alto: 0.0072 },
          { id: "carne", quita: [0.042, 0.058] },
          { id: "queso", pone: 0.058, alto: 0.0034 },
        ],
      },
    },
  },
  {
    id: "pasta",
    categoria: "fuertes",
    nombre: "Pasta bolognesa",
    descripcion: "Spaghetti con salsa bolognesa de res, parmesano y albahaca.",
    precio: 165,
    foto: "img/pasta.webp",
    miniatura: "img/pasta_chica.webp",
    modelo: "modelos/pasta_bolognesa.glb",
    modeloIOS: "modelos/pasta_bolognesa.usdz",
    alto: 0.097,
    porcion: "≈ 350 g",
    kcal: 560,
    carbohidratos: "70 g",
    carne: "80 g",
    contiene: "Gluten, lácteos",
    ingredientes: [["spaghetti","Spaghetti"],["carne","Res molida"],["salsa","Salsa de jitomate"],["ajo","Ajo"],["parmesano","Parmesano"],["albahaca","Albahaca"]],
    personalizar: {
      modelo: "modelos/capas/pasta.glb",
      variantes: "modelos/variantes/pasta_{bits}.usdz",
      opciones: [{ id: "parmesano", nombre: "Parmesano", icono: "parmesano", incluido: false, tipo: "lluvia" }],
    },
  },
  {
    id: "ensalada",
    categoria: "ensaladas",
    nombre: "Ensalada fresca",
    descripcion: "Mezcla de lechugas, jitomate cherry, pepino, aguacate y vinagreta de la casa.",
    precio: 129,
    foto: "img/ensalada.webp",
    miniatura: "img/ensalada_chica.webp",
    modelo: "modelos/ensalada.glb",
    modeloIOS: "modelos/ensalada.usdz",
    alto: 0.071,
    porcion: "≈ 250 g",
    kcal: 220,
    carbohidratos: "15 g",
    carne: "Sin carne",
    contiene: "Sin alérgenos comunes",
    ingredientes: [["lechuga","Lechugas"],["tomate","Jitomate cherry"],["pepino","Pepino"],["aguacate","Aguacate"],["aceituna","Vinagreta de oliva"]],
    personalizar: {
      modelo: "modelos/capas/ensalada.glb",
      variantes: "modelos/variantes/ensalada_{bits}.usdz",
      opciones: [{ id: "crotones", nombre: "Crotones", icono: "crotones", incluido: false, tipo: "lluvia" }],
    },
  },
  {
    id: "pastel",
    categoria: "postres",
    nombre: "Pastel de chocolate",
    descripcion: "Rebanada de pastel de chocolate con betún de cacao.",
    precio: 85,
    foto: "img/pastel.webp",
    miniatura: "img/pastel_chica.webp",
    modelo: "modelos/postre_pastel.glb",
    modeloIOS: "modelos/postre_pastel.usdz",
    alto: 0.086,
    porcion: "≈ 120 g",
    kcal: 450,
    carbohidratos: "55 g",
    carne: "Sin carne",
    contiene: "Gluten, lácteos, huevo",
    ingredientes: [["chocolate","Chocolate"],["harina","Harina"],["huevo-entero","Huevo"],["mantequilla","Mantequilla"],["leche","Leche"]],
    personalizar: {
      modelo: "modelos/capas/pastel.glb",
      variantes: "modelos/variantes/pastel_{bits}.usdz",
      opciones: [{ id: "cereza", nombre: "Cereza", icono: "cereza", incluido: false, tipo: "posar" }],
    },
  },
];

// La propina se elige libremente con un deslizador, de 0 a 30 %.
export const PROPINA_INICIAL = 15;
export const MAX_PERSONAS = 10;

// Alergias más comunes (con su ícono de js/iconos.js). Además hay un campo para escribir otra.
export const ALERGIAS = [
  { id: "gluten", nombre: "Gluten", icono: "gluten" },
  { id: "lacteos", nombre: "Lácteos", icono: "lacteos" },
  { id: "huevo", nombre: "Huevo", icono: "huevo" },
  { id: "nueces", nombre: "Nueces", icono: "nueces" },
  { id: "mariscos", nombre: "Mariscos", icono: "mariscos" },
];

export const MESERO = { nombre: "Carlos" };

// Calificaciones con carita (1 = mal ... 5 = increíble). Debajo de la carita elegida sale su mensaje con los
// motivos posibles; el comensal toca los que apliquen.
export const NIVELES = ["Mal", "Regular", "Bien", "Muy bien", "¡Increíble!"];
export const CALIFICAR = {
  mesero: [
    { mensaje: "Lamentamos que la atención no fuera buena. ¿Qué pasó?",
      motivos: ["Tardó en atendernos", "Poco amable", "Se equivocó en el pedido", "No volvió a la mesa", "Tardó con la cuenta"] },
    { mensaje: "Gracias por decirnos. ¿Qué pudo ser mejor?",
      motivos: ["Tardó un poco", "Poco atento", "No conocía el menú", "No explicó los platillos"] },
    { mensaje: "¡Gracias! ¿Qué le faltó para ser excelente?",
      motivos: ["Más atención", "Más rapidez", "Recomendaciones", "Más simpatía"] },
    { mensaje: "¡Qué bueno! ¿Qué te gustó de su atención?",
      motivos: ["Amable", "Rápido", "Atento", "Buenas recomendaciones"] },
    { mensaje: "¡Le daremos tus felicitaciones! ¿Qué te encantó?",
      motivos: ["Súper amable", "Muy rápido", "Atento sin agobiar", "Gran recomendación", "Nos hizo sentir en casa"] },
  ],
  chef: [
    { mensaje: "Lo sentimos mucho. ¿Qué no estuvo bien?",
      motivos: ["Le faltó sabor", "Llegó frío", "Mal cocido", "No era lo que pedí", "Tardó demasiado"] },
    { mensaje: "Gracias por decirnos. ¿Qué podemos mejorar?",
      motivos: ["Le faltó sazón", "Llegó tibio", "Porción chica", "Presentación descuidada"] },
    { mensaje: "¡Gracias! ¿Qué le faltó para ser excelente?",
      motivos: ["Más sabor", "Más caliente", "Mejor presentación", "Más rápido"] },
    { mensaje: "¡Qué gusto! ¿Qué te gustó?",
      motivos: ["Buen sabor", "Bien servido", "Temperatura perfecta", "Llegó rápido"] },
    { mensaje: "¡Se lo diremos al chef! ¿Qué te encantó?",
      motivos: ["Delicioso", "Presentación hermosa", "En su punto", "Porción generosa", "Volvería por él"] },
  ],
};
// Lo que se califica del chef, cada aspecto con estrellas.
export const ASPECTOS_CHEF = ["Sabor", "Presentación", "Temperatura", "Tiempo"];

// Reseña en Google. Cambiar por el enlace "Pedir reseñas" del perfil de Google Business del restaurante real
// (tiene la forma https://search.google.com/local/writereview?placeid=...).
export const RESENA_GOOGLE = "https://www.google.com/search?q=Chefi+restaurante";
