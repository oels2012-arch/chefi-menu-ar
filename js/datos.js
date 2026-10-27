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
    descripcion: "Carne de res a la parrilla, queso cheddar, lechuga, jitomate y papas a la francesa.",
    precio: 189,
    foto: "img/hamburguesa.jpg",
    modelo: "modelos/fuerte_hamburguesa.glb",
    porcion: "≈ 350 g",
    kcal: 950,
    carbohidratos: "95 g",
    carne: "120 g",
  },
  {
    id: "pasta",
    categoria: "fuertes",
    nombre: "Pasta bolognesa",
    descripcion: "Spaghetti con salsa bolognesa de res, parmesano y albahaca.",
    precio: 165,
    foto: "img/pasta.jpg",
    modelo: "modelos/pasta_bolognesa.glb",
    porcion: "≈ 350 g",
    kcal: 560,
    carbohidratos: "70 g",
    carne: "80 g",
  },
  {
    id: "ensalada",
    categoria: "ensaladas",
    nombre: "Ensalada fresca",
    descripcion: "Mezcla de lechugas, jitomate cherry, pepino, aguacate y vinagreta de la casa.",
    precio: 129,
    foto: "img/ensalada.jpg",
    modelo: "modelos/ensalada.glb",
    porcion: "≈ 250 g",
    kcal: 220,
    carbohidratos: "15 g",
    carne: "Sin carne",
  },
  {
    id: "pastel",
    categoria: "postres",
    nombre: "Pastel de chocolate",
    descripcion: "Rebanada de pastel de chocolate con betún de cacao.",
    precio: 85,
    foto: "img/pastel.jpg",
    modelo: "modelos/postre_pastel.glb",
    porcion: "≈ 120 g",
    kcal: 450,
    carbohidratos: "55 g",
    carne: "Sin carne",
  },
];

export const PROPINAS = [0, 10, 15, 20];
