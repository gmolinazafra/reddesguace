# Red Desguace — Demo

Demostración funcional de la plataforma común de la **Asociación Andaluza de Desguaces (AAD)** para el escaparate del stock de los 142 socios.

## ¿Qué es esto?

Una web pública donde un visitante puede:
- Buscar entre **177.720 piezas reales** (datos de un socio piloto: ReciclaCAT, Sevilla)
- Filtrar por familia, marca, año
- Ver la ficha completa de cada pieza con fotos, referencias y especificaciones
- Pulsar un botón **WhatsApp** que abre conversación directa con el desguace

**No es un marketplace.** La AAD no se mete en la venta. Cada socio cierra sus ventas como siempre.

## Ver online

🌐 **[gmolinazafra.github.io/reddesguace](https://gmolinazafra.github.io/reddesguace)**

## Estructura del proyecto

```
reddesguace/
├── index.html          # Catálogo público (home)
├── pieza.html          # Ficha individual de pieza
├── socios.html         # Listado de los 142 socios
├── sobre.html          # Información institucional
├── assets/
│   ├── css/styles.css  # Estilos completos
│   ├── js/data.js      # Cargador de datos
│   ├── js/catalogo.js  # Lógica de catálogo/filtros
│   ├── js/pieza.js     # Lógica ficha de pieza
│   └── favicon.svg
└── data/
    ├── meta.json       # Metadatos (familias, marcas, stats)
    ├── marcas/         # 62 chunks por marca (~33 MB total)
    └── piezas/         # 100 chunks de fichas (~78 MB total)
```

## Cómo se actualiza el catálogo

Los datos se pre-procesan del CSV original (`crvnet_export_stock.csv` de CRV NET). Para actualizarlo:

```bash
python3 scripts/preprocesar.py path/al/csv.csv
```

Esto regenera todos los JSONs de `data/`. La web es estática y no necesita base de datos.

## Sistema de caché (cache-busting con buildId)

⚠️ **Importante**: este proyecto resuelve un problema clásico de webs estáticas — que el navegador y CDN cacheen versiones viejas y los usuarios sigan viendo datos antiguos.

**Cómo funciona:**

1. Cada vez que se ejecuta `preprocesar.py`, se genera un `buildId` único (formato `YYYYMMDDHHMMSS`) que se guarda en `data/meta.json`.

2. El frontend (`data.js`) carga `meta.json` **siempre sin caché** (`cache: 'no-cache'`), por lo que ve inmediatamente cuando hay un buildId nuevo.

3. Todas las demás peticiones (`marcas/{x}.json` y `piezas/{NN}.json`) se cargan con `?v={buildId}` en la URL.

4. Cuando cambia el buildId, las URLs cambian, y el navegador descarga las versiones nuevas. Sin caché vieja.

**Verificación automática de coherencia:**

El script `preprocesar.py` también verifica que **el precio del listado coincida exactamente con el precio de la ficha** antes de escribir nada. Si hay divergencias, aborta sin tocar disco. Esto previene el bug clásico de "precio distinto en grid vs ficha".

**Si tras un deploy un usuario ve datos viejos:** debe hacer Ctrl+F5 una sola vez. Después, todas las actualizaciones futuras se verán automáticamente sin intervención.

## Plan de desarrollo

| Fase | Estado | Descripción |
|------|--------|-------------|
| 0 — Maquetas | ✅ Completa | Diseño visual aprobado |
| **Demo (estás aquí)** | ✅ Completa | Demo pública con datos reales de 1 socio |
| 1 — Setup técnico | ⏳ Pendiente | Cuentas Vercel + Supabase + Cloudflare |
| 2 — Base de datos real | ⏳ Pendiente | Migración a Supabase con esquema multi-socio |
| 3 — Importador FTP | ⏳ Pendiente | Cron jobs descargando CSVs de cada socio cada 6h |
| 4 — Mapeador de columnas | ⏳ Pendiente | Cada socio mapea su CSV al esquema interno |
| 5 — Panel del socio | ⏳ Pendiente | Login + gestión autónoma |
| 6 — Despliegue piloto | ⏳ Pendiente | 3-5 socios reales en producción |
| 7 — Onboarding 142 socios | ⏳ Pendiente | Migración completa de la asociación |

## Modelo económico

- **Cuota mensual:** 20 €/socio
- **Total ingreso:** 2.840 €/mes (142 socios)
- **Reparto:** hosting (50 €) + dominio (8 €) + **Google Ads (2.000 €)** + SEO/contenidos (200 €) + mantenimiento (400 €) + reserva (182 €)

## Tecnologías

- HTML + CSS + JavaScript (sin frameworks, sin build step)
- Hosting: GitHub Pages (demo) → Vercel (producción)
- Imágenes: CDN de metasync (mismas URLs que ya usan los socios)

## Licencia

Proyecto institucional de la Asociación Andaluza de Desguaces. Datos de stock propiedad de cada socio.

## Contacto

- Web: [reddesguace.com](https://reddesguace.com) *(próximamente)*
- Email: info@reddesguace.com
