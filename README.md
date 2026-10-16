# Finanzas Familiares (HTML + CSS + JS + Firestore en tiempo real)

Reemplaza el Excel "Control Financiero Familiar": Ingresos, Gastos, Categorías, Presupuesto y Dashboard, más módulos predictivos.

## Uso rápido
1. Sirve la carpeta con cualquier servidor estático (`python3 -m http.server`, Firebase Hosting, Netlify, GitHub Pages). Los módulos ES no funcionan con `file://`.
2. Abre la web, elige un **código de familia** y pulsa *Comenzar*. Sin Firebase funciona en modo local.
3. Pulsa **Cargar datos del Excel** para importar tus categorías, presupuestos, ingresos y gastos.

## Conectar Firestore (tiempo real)
1. Consola Firebase → crear proyecto.
2. Authentication → Método de acceso → habilitar **Anónimo**.
3. Firestore Database → crear base de datos.
4. Pestaña Reglas → pegar el contenido de `firestore.rules` → Publicar.
5. Configuración del proyecto → Tus apps → Web → copiar `firebaseConfig` y pegarlo en *Ajustes* (o en `firebase-config.js`).
6. Usa el mismo código de familia en todos los dispositivos: los cambios se ven al instante.

Datos en `familias/{codigo}/{categorias|ingresos|gastos|metas}`.
Seguridad: el código de familia es el secreto compartido; usa uno largo. Para más control, sustituye el acceso anónimo por Google/Email y restringe las reglas a tus UIDs.

## Funciones
- Gastos/Ingresos: alta, edición, duplicado, filtros, búsqueda, CSV (export/import), tecla **N** para gasto rápido.
- Predictivo al registrar: sugiere categoría, ingreso y monto según tu historial; gastos frecuentes en un clic; quincena automática.
- Dashboard: salud financiera 0-100, KPIs, proyección de cierre de mes, ritmo diario, pronóstico a 3 meses, presupuesto vs real, alertas de excesos, top 5, periodicidad, uso de cada ingreso, recomendaciones.
- Decisiones: simulador "¿y si…?" (recortes por categoría, ingreso extra), sugerencia de recortes para llegar al 20 % de ahorro, metas de ahorro con plazo.
- Ajustes: respaldo/restauración JSON, tema claro/oscuro.

## Archivos
index.html · styles.css · app.js · db.js · seed.js (datos del Excel) · firebase-config.js · firestore.rules
