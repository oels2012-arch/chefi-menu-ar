# Chefi · Menú digital con "Ver en mi mesa"

Menú web del restaurante. El comensal acerca el celular a la tarjeta NFC de la mesa y se abre esta página en el navegador, sin instalar ninguna app. Desde ahí puede:

1. Ver el menú por categorías.
2. Abrir un platillo, girarlo en 3D y tocar **Ver en mi mesa** para verlo a escala real sobre su mesa con la cámara (la experiencia inmersiva).
   Si lo gira con mucha fuerza (o sacude el celular en Android), el platillo "se cae" y la pantalla se llena con sus ingredientes.
3. Agregarlo al pedido con cantidad, alergias y notas, y tocar **Pedir alimentos**.
4. Pedir la cuenta: primero elige cómo pagar y luego ve la **cuenta clara**, con propina libre (deslizador de 0 a 30 %) y división entre hasta 10 personas.
5. Pagar (simulado), contestar 2 preguntas con estrellas y dejar reseña en Google.

## Cómo verlo en tu computadora

Desde esta carpeta:

```bash
python3 -m http.server 8000
```

Abre http://localhost:8000/?mesa=4 en el navegador. En la computadora el 3D se puede girar, pero la cámara AR solo abre en el celular, y tiene que ser con la página publicada en https.

## Qué archivo es de quién

| Archivo | Para qué sirve | ¿Quién lo toca? |
|---|---|---|
| `index.html` | Estructura de las 8 pantallas y plantillas | **Diego** (diseño) |
| `css/estilos.css` | Todos los estilos. Los actuales son provisionales | **Diego** (diseño) |
| `img/` | Fotos de los platillos | Diego, si quiere cambiarlas |
| `js/datos.js` | Platillos, precios, categorías y propinas | Cualquiera |
| `js/app.js` | Navegación, pedido, cuenta y pago | Eddy / Claude |
| `js/ar.js` | Experiencia inmersiva "Ver en mi mesa" | Eddy / Claude |
| `js/caida.js` | "Se cayó el platillo": lluvia de ingredientes | Eddy / Claude |
| `modelos/` | Modelos 3D a escala real (plato de 27 cm) | No tocar |

## Regla para el diseño: los atributos `data-*`

Cambia todo el HTML y el CSS que quieras: etiquetas, clases, orden, íconos, animaciones. Lo único que hay que conservar son estos atributos, porque `js/app.js` los usa para encontrar cada cosa:

- `data-pantalla="..."`: cada pantalla. Son `bienvenida`, `menu`, `detalle`, `pedido`, `estado`, `pago`, `cuenta` y `gracias` (en ese orden). Solo se muestra una a la vez.
- `data-ref="..."`: donde se escribe un dato, como `nombre`, `precio`, `kcal`, `total-cuenta` o `mesa`.
- `data-lista="..."`: contenedor que se llena con elementos repetidos, como `platillos`, `categorias`, `pedido` o `propinas`.
- `data-plantilla="..."`: el molde (`<template>`) de cada elemento repetido. Puedes rediseñar el molde por completo, siempre que dejes sus `data-ref` y `data-accion`.
- `data-accion="..."`: lo que pasa al tocar. Por ejemplo `ver-en-mi-mesa`, `agregar`, `enviar-pedido` o `pagar`. Con `data-accion="ir"` y `data-destino="pantalla"` se navega a otra pantalla.
- La clase `activo` la pone el código en el chip seleccionado (categoría, propina). Dale el estilo que quieras.

Si necesitas un dato o una acción nueva, déjalo anotado en un comentario o pídelo, y se agrega en `app.js`.

## Si el diseño viene en un HTML aparte

Se puede incorporar: pásalo y se le agregan los `data-*` de arriba, o reemplaza el contenido de cada `<section data-pantalla>` con tu versión manteniendo esos atributos.

## La tarjeta NFC

La tarjeta solo guarda la dirección del menú con el número de mesa, por ejemplo `https://<dominio>/?mesa=4`. Se graba con cualquier app de NFC (por ejemplo NFC Tools) como registro de tipo URL. El mismo enlace sirve para un QR de respaldo.

## En línea

https://oels2012-arch.github.io/chefi-menu-ar/?mesa=4

El enlace de reseña de Google está en `js/datos.js` (`RESENA_GOOGLE`).
