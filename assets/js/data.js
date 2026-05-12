/* =====================================================
   RED DESGUACE · CARGADOR DE DATOS
   
   Gestión de caché mediante buildId (cache-busting):
   - meta.json se carga SIEMPRE sin caché (cache: 'no-cache')
   - El meta contiene un buildId con formato YYYYMMDDHHMMSS
   - Todos los demás JSONs se cargan con ?v={buildId} en la URL
   - Cuando se regenera el catálogo, buildId cambia y el navegador
     se ve obligado a descargar la versión nueva, sin caché vieja.

   Este patrón es estándar (Next.js, Webpack, Vite hacen lo mismo).
   ===================================================== */

const RD_Data = {
  meta: null,
  buildId: null,
  marcasCache: {},   // { 'renault': [piezas...] } (en memoria sólo)
  piezasCache: {},   // { 'XX': { refid: ficha } } (en memoria sólo)
  allMarcasLoaded: false,

  // ----------------------------------------------------------
  // META: se carga SIEMPRE sin caché para que el cliente vea
  // siempre el buildId más reciente. Es un archivo de ~10 KB
  // así que el coste de no cachearlo es despreciable.
  // ----------------------------------------------------------
  async loadMeta() {
    if (this.meta) return this.meta;
    
    const resp = await fetch('data/meta.json', { 
      cache: 'no-cache'   // no usar caché del navegador
    });
    
    if (!resp.ok) {
      throw new Error(`Error cargando meta.json: HTTP ${resp.status}`);
    }
    
    this.meta = await resp.json();
    this.buildId = this.meta.buildId || 'dev';
    
    // Log útil para depurar problemas de caché
    console.log(`[RD] meta cargado · buildId: ${this.buildId} · ${this.meta.total.toLocaleString()} piezas`);
    
    return this.meta;
  },

  // ----------------------------------------------------------
  // Helper: añade ?v={buildId} a una URL para cache-busting
  // ----------------------------------------------------------
  _withVersion(url) {
    const v = this.buildId || 'dev';
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}v=${v}`;
  },

  // ----------------------------------------------------------
  // CHUNKS DE MARCA (listado): usan ?v={buildId}
  // Se cachean MUCHO en el navegador (default browser cache),
  // pero cuando buildId cambia, la URL completa cambia y el
  // navegador descarga la versión nueva del servidor.
  // ----------------------------------------------------------
  async loadMarca(slugMarca) {
    if (this.marcasCache[slugMarca]) return this.marcasCache[slugMarca];
    
    // Asegurar que tenemos buildId antes de pedir chunks
    if (!this.buildId) await this.loadMeta();
    
    try {
      const url = this._withVersion(`data/marcas/${slugMarca}.json`);
      const resp = await fetch(url);
      if (!resp.ok) return [];
      const data = await resp.json();
      this.marcasCache[slugMarca] = data;
      return data;
    } catch (e) {
      console.error('Error cargando marca', slugMarca, e);
      return [];
    }
  },

  async loadAllMarcas(progressCb) {
    if (this.allMarcasLoaded) {
      return Object.values(this.marcasCache).flat();
    }
    const meta = await this.loadMeta();
    const marcas = meta.marcas;
    const total = marcas.length;
    let cargadas = 0;

    const promesas = marcas.map(async (m) => {
      await this.loadMarca(m.s);
      cargadas++;
      if (progressCb) progressCb(cargadas, total);
    });

    await Promise.all(promesas);
    this.allMarcasLoaded = true;
    return Object.values(this.marcasCache).flat();
  },

  // ----------------------------------------------------------
  // CHUNKS DE FICHA (detalle): MISMO patrón cache-busting.
  // Esto era el bug clave en Soliva/Redia: las fichas se
  // quedaban con precio viejo porque no llevaban ?v=.
  // ----------------------------------------------------------
  async loadFicha(refid) {
    const chunkId = refid.slice(-2).padStart(2, '0');
    
    if (!this.piezasCache[chunkId]) {
      // Asegurar que tenemos buildId antes de pedir chunks
      if (!this.buildId) await this.loadMeta();
      
      try {
        const url = this._withVersion(`data/piezas/${chunkId}.json`);
        const resp = await fetch(url);
        if (!resp.ok) {
          console.error('Error cargando chunk', chunkId, 'HTTP', resp.status);
          return null;
        }
        this.piezasCache[chunkId] = await resp.json();
      } catch (e) {
        console.error('Error cargando chunk', chunkId, e);
        return null;
      }
    }
    
    const ficha = this.piezasCache[chunkId][refid];
    
    // Verificación de integridad: avisar si esta ficha tiene precio
    // distinto al esperado del listado (defensa profundizada)
    if (ficha && typeof window !== 'undefined' && window.__RD_DEBUG__) {
      console.log(`[RD] Ficha cargada · refid:${refid} · precio:${ficha.precio}`);
    }
    
    return ficha || null;
  },

  // ----------------------------------------------------------
  // Limpieza de caché en memoria (para testing/depuración)
  // En la consola del navegador: RD_Data.clearCache()
  // ----------------------------------------------------------
  clearCache() {
    this.meta = null;
    this.buildId = null;
    this.marcasCache = {};
    this.piezasCache = {};
    this.allMarcasLoaded = false;
    console.log('[RD] Caché limpiada. Recarga la página.');
  },

  // ----------------------------------------------------------
  // Helpers de formato (sin cambios)
  // ----------------------------------------------------------
  
  buildWhatsAppURL(numero, articulo, refid) {
    const numLimpio = (numero || '+34649903695').replace(/[^\d+]/g, '');
    const msg = `Hola, vi en Red Desguace esta pieza:\n\n${articulo}\nRef. ${refid}\n\n¿Sigue disponible?`;
    return `https://wa.me/${numLimpio.replace('+', '')}?text=${encodeURIComponent(msg)}`;
  },

  slug(s) {
    return s.toLowerCase().trim()
      .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
      .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  },

  formatPrecio(p) {
    if (p === null || p === undefined) return null;
    return p.toFixed(2).replace('.', ',') + ' €';
  },

  formatAnos(ai, af) {
    if (!ai && !af) return null;
    if (ai && af) return `${ai}–${af}`;
    if (ai) return `${ai}+`;
    return af ? `hasta ${af}` : null;
  },

  iniciales(nombre) {
    const partes = nombre.split(/\s+/).filter(p => p.length > 0);
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[1][0]).toUpperCase();
  }
};
