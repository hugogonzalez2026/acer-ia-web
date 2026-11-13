# Acer IA · Finanzas y Generativa

Interfaz web estática gratuita, publicada mediante **GitHub Pages**, con tres modos:
- **Finanzas:** análisis de mercado, riesgos, estrategias y consulta pública de BTC/ETH en Kraken cuando la Acer esté encendida.
- **Generativa:** conversación, ideas y redacción utilizando un modelo local en la Acer.
- **Código:** programación y exportación de archivos con el mismo modelo generativo.

## Modo Código (nuevo)

La tercera pestaña **Código** usa el modelo generativo de la Acer para escribir programas en Python, JavaScript, HTML, CSS, Bash y SQL. Permite:
- Pedir código en lenguaje natural desde el navegador.
- Leerlo en el chat y en una vista previa de texto.
- Copiar y descargar un archivo con el nombre elegido.

**El código nunca se ejecuta automáticamente.** Se guarda únicamente si el usuario lo descarga. El navegador no recibe acceso a la consola de Debian ni a las claves de GitHub, brokers o Tailscale. Para actualizar esta web, los cambios se publican directamente en GitHub con el conector autorizado y Pages vuelve a desplegar la rama `main`.

El modo Código utiliza la ruta `creative` del backend para no necesitar instalación adicional en Debian. Si el modelo generativo más permisivo terminó de instalarse, será el utilizado también para escribir código.

## Publicación

Sitio previsto: https://hugogonzalez2026.github.io/acer-ia-web/

Para activar Pages en este repositorio:
1. **Settings → Pages**.
2. **Build and deployment → Source → Deploy from a branch**.
3. **Branch: main**, carpeta **/(root)**, y **Save**.

GitHub Pages aloja **solo la interfaz**. El motor de IA (Ollama/Qwen) y la API estarán en Debian; el navegador se comunicará por HTTPS con la URL Tailscale Funnel del servidor, ingresada por el usuario. Si la Acer está apagada, se podrá abrir esta página, pero no conversar con la IA.

## Privacidad y seguridad

- No hay claves de billeteras, brokers, Pionex ni secretos de Tailscale en este repositorio.
- GitHub Pages es público; el servidor exige usuario y contraseña para las consultas.
- El frontend no guarda contraseñas en localStorage; solo la URL del servidor, para no ingresarla cada vez.
- No guardar claves de inversión ni datos sensibles en los mensajes hasta que el acceso remoto esté auditado y reforzado.
- La Acer es **analista**, no ejecutora de operaciones financieras. Cualquier automatización operativa se reserva para la HP Mini.

**Estado:** archivos del frontend subidos. La configuración de GitHub Pages y la instalación/configuración del backend Acer son pasos separados.
Web Acer IA lista
