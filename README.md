# Chefi · Menú digital con "Ver en mi mesa"

Menú web del restaurante. El comensal acerca el celular a la tarjeta NFC de la mesa y se abre esta página en el navegador, sin instalar ninguna app:

1. **Intro**: "Toca para entrar" y el logo reveal de Chefi con sonido (`media/intro_chefi.mp4`, hecho en Remotion: composición `ChefiIntroWeb` en `~/AGENTE MOTION GRAPHICS`).
2. **Bienvenida**: las acciones de la experiencia y "Así funciona" en 5 pasos animados. Un solo botón: **Empezar**.
3. **¿Solo o con amigos?**: se agregan los nombres y se decide antes de pedir cómo se divide la cuenta (partes iguales o cada quien lo suyo).
4. **Menú y platillo en 3D**: se gira; si se sacude, se cae y la pantalla se llena de ingredientes. **Ver en mi mesa** lo pone a tamaño real con la cámara, con su información nutricional (iPhone: banner de AR Quick Look con botón "Agregar al pedido"; Android: etiqueta flotante en WebXR).
5. **Pedido**: alergias comunes con ícono, otra alergia escrita y notas; con amigos, "¿para quién es?". Cada acción vibra y suena.
6. **Estado**: recibido → preparando (5 s) → en tu mesa (10 s), con vibración y sonido en cada etapa.
7. **Pago**: primero el método, luego la cuenta clara con propina libre (0–30 %) y división en partes iguales o por lo que consumió cada quien.
8. **Gracias**: calificación del mesero con caritas, 2 preguntas con estrellas y reseña con formato de Google.

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
| `js/sonido.js` | Efectos de sonido y vibración | Eddy / Claude |
| `js/intro.js` | Intro con el logo reveal | Eddy / Claude |
| `js/fondo.js` | Fondo con profundidad (paralaje) | Eddy / Claude |
| `media/` | Video del intro y efectos de sonido | No tocar |
| `modelos/` | Modelos 3D a escala real (plato de 27 cm): `.glb` para web/Android y `.usdz` para iPhone | No tocar |

## Regla para el diseño: los atributos `data-*`

Cambia todo el HTML y el CSS que quieras: etiquetas, clases, orden, íconos, animaciones. Lo único que hay que conservar son estos atributos, porque `js/app.js` los usa para encontrar cada cosa:

- `data-pantalla="..."`: cada pantalla. Son `bienvenida`, `mesa`, `menu`, `detalle`, `pedido`, `estado`, `pago`, `cuenta` y `gracias` (en ese orden). Solo se muestra una a la vez.
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
