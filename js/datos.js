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
    foto: "img/hamburguesa.jpg",
    modelo: "modelos/fuerte_hamburguesa.glb",
    modeloIOS: "modelos/fuerte_hamburguesa.usdz",
    alto: 0.131,
    porcion: "≈ 350 g",
    kcal: 950,
    carbohidratos: "95 g",
    carne: "120 g",
    contiene: "Gluten, lácteos",
    ingredientes: [["🍞","Pan brioche"],["🥩","Carne de res"],["🧀","Queso cheddar"],["🥓","Tocino"],["🧅","Aros de cebolla"],["🥬","Lechuga"],["🍅","Jitomate"],["🍟","Papas"]],
  },
  {
    id: "pasta",
    categoria: "fuertes",
    nombre: "Pasta bolognesa",
    descripcion: "Spaghetti con salsa bolognesa de res, parmesano y albahaca.",
    precio: 165,
    foto: "img/pasta.jpg",
    modelo: "modelos/pasta_bolognesa.glb",
    modeloIOS: "modelos/pasta_bolognesa.usdz",
    alto: 0.097,
    porcion: "≈ 350 g",
    kcal: 560,
    carbohidratos: "70 g",
    carne: "80 g",
    contiene: "Gluten, lácteos",
    ingredientes: [["🍝","Spaghetti"],["🥩","Res molida"],["🍅","Salsa de jitomate"],["🧄","Ajo"],["🧀","Parmesano"],["🌿","Albahaca"]],
  },
  {
    id: "ensalada",
    categoria: "ensaladas",
    nombre: "Ensalada fresca",
    descripcion: "Mezcla de lechugas, jitomate cherry, pepino, aguacate y vinagreta de la casa.",
    precio: 129,
    foto: "img/ensalada.jpg",
    modelo: "modelos/ensalada.glb",
    modeloIOS: "modelos/ensalada.usdz",
    alto: 0.071,
    porcion: "≈ 250 g",
    kcal: 220,
    carbohidratos: "15 g",
    carne: "Sin carne",
    contiene: "Sin alérgenos comunes",
    ingredientes: [["🥬","Lechugas"],["🍅","Jitomate cherry"],["🥒","Pepino"],["🥑","Aguacate"],["🫒","Vinagreta de oliva"]],
  },
  {
    id: "pastel",
    categoria: "postres",
    nombre: "Pastel de chocolate",
    descripcion: "Rebanada de pastel de chocolate con betún de cacao.",
    precio: 85,
    foto: "img/pastel.jpg",
    modelo: "modelos/postre_pastel.glb",
    modeloIOS: "modelos/postre_pastel.usdz",
    alto: 0.086,
    porcion: "≈ 120 g",
    kcal: 450,
    carbohidratos: "55 g",
    carne: "Sin carne",
    contiene: "Gluten, lácteos, huevo",
    ingredientes: [["🍫","Chocolate"],["🌾","Harina"],["🥚","Huevo"],["🧈","Mantequilla"],["🥛","Leche"]],
  },
];

// La propina se elige libremente con un deslizador, de 0 a 30 %.
export const PROPINA_INICIAL = 15;
export const MAX_PERSONAS = 10;

// Alergias más comunes (con su ícono). Además hay un campo para escribir otra.
export const ALERGIAS = [
  { id: "gluten", nombre: "Gluten", icono: "🌾" },
  { id: "lacteos", nombre: "Lácteos", icono: "🥛" },
  { id: "huevo", nombre: "Huevo", icono: "🥚" },
  { id: "nueces", nombre: "Nueces", icono: "🥜" },
  { id: "mariscos", nombre: "Mariscos", icono: "🦐" },
];

export const MESERO = { nombre: "Carlos" };

// Reseña en Google. Cambiar por el enlace "Pedir reseñas" del perfil de Google Business del restaurante real
// (tiene la forma https://search.google.com/local/writereview?placeid=...).
export const RESENA_GOOGLE = "https://www.google.com/search?q=Chefi+restaurante";
