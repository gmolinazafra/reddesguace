/* =====================================================
   RED DESGUACE · CATÁLOGO
   Lógica de búsqueda, filtros (dropdowns horizontales) y paginación
   ===================================================== */

const ITEMS_POR_PAGINA = 24;

const state = {
  todasLasPiezas: [],      // todas cargadas (se llena al primer filtrado/búsqueda)
  resultados: [],          // resultados filtrados actuales
  pagina: 1,
  filtros: {
    familias: new Set(),
    marcas: new Set(),     // valores: nombre de marca en mayúsculas
    modelos: new Set(),    // valores: nombre de modelo exacto
    anoDesde: null,
    anoHasta: null,
    busqueda: ''
  },
  orden: 'relevancia',
  cargandoTodo: false,
  meta: null,
  dropdownAbierto: null    // 'familia' | 'marca' | 'modelo' | 'ano' | 'desguace' | null
};

// Datos originales de cada filtro (para búsqueda dentro del dropdown)
const datosOriginales = {
  familia: [],
  marca: [],
  modelo: []
};

// =====================================================
// INICIALIZACIÓN
// =====================================================
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const meta = await RD_Data.loadMeta();
    state.meta = meta;
    renderizarStats(meta);
    
    datosOriginales.familia = meta.familias || [];
    datosOriginales.marca = meta.marcas || [];
    
    renderOpcionesFamilia(datosOriginales.familia);
    renderOpcionesMarca(datosOriginales.marca);
    
    bindearEventos();

    // Cargar TODO el catálogo desde el inicio (como en ReciclaCAT).
    // Muestra spinner mientras descarga los 62 chunks de marca.
    mostrarLoadingInicial(meta.total);
    
    state.todasLasPiezas = await RD_Data.loadAllMarcas((c, t) => {
      const pct = Math.round((c / t) * 100);
      actualizarProgresoInicial(pct, c, t);
    });
    
    state.resultados = state.todasLasPiezas;
    aplicarOrden();
    render();
  } catch (e) {
    console.error('Error inicializando:', e);
    document.getElementById('loading').innerHTML = '<p style="color:#c33;">Error al cargar el catálogo. Recarga la página.</p>';
  }
});

function mostrarLoadingInicial(total) {
  const loadEl = document.getElementById('loading');
  loadEl.style.display = 'block';
  loadEl.innerHTML = `
    <div class="spinner"></div>
    <p>Cargando ${formatNum(total)} piezas del catálogo...</p>
    <p id="progreso-inicial" style="font-size:12px; color:#888; margin-top:6px;">Preparando descarga...</p>
  `;
}

function actualizarProgresoInicial(pct, cargadas, total) {
  const el = document.getElementById('progreso-inicial');
  if (el) el.textContent = `${pct}% (${cargadas} de ${total} marcas)`;
}

function renderizarStats(meta) {
  document.getElementById('stat-piezas').textContent = formatNum(meta.total);
  document.getElementById('stat-modelos').textContent = '+1.200';
}

// =====================================================
// RENDERIZADO DE OPCIONES EN LOS DROPDOWNS
// =====================================================
function renderOpcionesFamilia(familias) {
  const cont = document.getElementById('opciones-familia');
  if (familias.length === 0) {
    cont.innerHTML = '<div class="empty-state">No se encontró ninguna familia</div>';
    return;
  }
  cont.innerHTML = familias.map(f => `
    <label>
      <input type="checkbox" value="${escapar(f.n)}" data-tipo="familia" 
             ${state.filtros.familias.has(f.n) ? 'checked' : ''}>
      <span>${capitalizar(f.n)}</span>
      <span class="cnt">${formatNum(f.c)}</span>
    </label>
  `).join('');
  // Re-bindear eventos
  cont.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', onFiltroCambio);
  });
}

function renderOpcionesMarca(marcas) {
  const cont = document.getElementById('opciones-marca');
  if (marcas.length === 0) {
    cont.innerHTML = '<div class="empty-state">No se encontró ninguna marca</div>';
    return;
  }
  cont.innerHTML = marcas.map(m => `
    <label>
      <input type="checkbox" value="${escapar(m.n)}" data-slug="${m.s}" data-tipo="marca"
             ${state.filtros.marcas.has(m.n) ? 'checked' : ''}>
      <span>${capitalizar(m.n)}</span>
      <span class="cnt">${formatNum(m.c)}</span>
    </label>
  `).join('');
  cont.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', onFiltroCambio);
  });
}

function renderOpcionesModelo(modelos) {
  const cont = document.getElementById('opciones-modelo');
  if (!modelos || modelos.length === 0) {
    cont.innerHTML = '<div class="empty-state">Selecciona una marca primero</div>';
    return;
  }
  cont.innerHTML = modelos.map(m => `
    <label>
      <input type="checkbox" value="${escapar(m.n)}" data-tipo="modelo"
             ${state.filtros.modelos.has(m.n) ? 'checked' : ''}>
      <span>${escapar(m.n)}</span>
      <span class="cnt">${formatNum(m.c)}</span>
    </label>
  `).join('');
  cont.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', onFiltroCambio);
  });
}

// Recalcula los modelos disponibles según las marcas seleccionadas.
// Si no hay marcas → dropdown deshabilitado.
function actualizarModeloDropdown() {
  const dropdown = document.getElementById('filter-modelo');
  const btn = dropdown.querySelector('.filter-btn');
  
  if (state.filtros.marcas.size === 0) {
    dropdown.classList.add('disabled');
    btn.disabled = true;
    // Si tenía modelos seleccionados los limpiamos al desactivar
    if (state.filtros.modelos.size > 0) {
      state.filtros.modelos.clear();
    }
    datosOriginales.modelo = [];
    renderOpcionesModelo([]);
    return;
  }
  
  dropdown.classList.remove('disabled');
  btn.disabled = false;
  
  // Reunir los modelos de todas las marcas seleccionadas
  const modelosUnificados = [];
  const vistos = new Set();
  
  for (const marcaNombre of state.filtros.marcas) {
    // Buscar el slug de la marca
    const marca = datosOriginales.marca.find(m => m.n === marcaNombre);
    if (!marca) continue;
    const modelosMarca = (state.meta.modelos && state.meta.modelos[marca.s]) || [];
    for (const mod of modelosMarca) {
      // Si dos marcas comparten el mismo nombre de modelo, sumamos contadores
      if (vistos.has(mod.n)) {
        const existente = modelosUnificados.find(x => x.n === mod.n);
        existente.c += mod.c;
      } else {
        vistos.add(mod.n);
        modelosUnificados.push({ n: mod.n, c: mod.c });
      }
    }
  }
  
  // Ordenar por contador descendente
  modelosUnificados.sort((a, b) => b.c - a.c);
  
  // Limpiar modelos seleccionados que ya no estén disponibles
  for (const m of Array.from(state.filtros.modelos)) {
    if (!vistos.has(m)) state.filtros.modelos.delete(m);
  }
  
  datosOriginales.modelo = modelosUnificados;
  renderOpcionesModelo(modelosUnificados);
}

// =====================================================
// DROPDOWNS: abrir, cerrar, buscar dentro
// =====================================================
function toggleDropdown(tipo) {
  const dropdown = document.querySelector(`.filter-dropdown[data-filter="${tipo}"]`);
  if (!dropdown) return;
  if (dropdown.classList.contains('disabled')) return;
  
  if (state.dropdownAbierto === tipo) {
    cerrarTodosDropdowns();
  } else {
    cerrarTodosDropdowns();
    dropdown.classList.add('open');
    state.dropdownAbierto = tipo;
    document.getElementById('dropdowns-overlay').classList.add('active');
    
    // Si es modelo, refrescar opciones por si cambiaron las marcas
    if (tipo === 'modelo') {
      actualizarModeloDropdown();
    }
    
    // Auto-focus en el campo de búsqueda si tiene
    const search = dropdown.querySelector('.filter-search');
    if (search) {
      setTimeout(() => search.focus(), 50);
    }
  }
}

function cerrarTodosDropdowns() {
  document.querySelectorAll('.filter-dropdown').forEach(d => d.classList.remove('open'));
  document.getElementById('dropdowns-overlay').classList.remove('active');
  state.dropdownAbierto = null;
  // Limpiar campos de búsqueda al cerrar
  document.querySelectorAll('.filter-search').forEach(s => s.value = '');
  // Restaurar todas las opciones
  renderOpcionesFamilia(datosOriginales.familia);
  renderOpcionesMarca(datosOriginales.marca);
}

function filtrarOpciones(tipo, query) {
  const q = query.trim().toLowerCase();
  if (tipo === 'familia') {
    const filtradas = q
      ? datosOriginales.familia.filter(f => f.n.toLowerCase().includes(q))
      : datosOriginales.familia;
    renderOpcionesFamilia(filtradas);
  } else if (tipo === 'marca') {
    const filtradas = q
      ? datosOriginales.marca.filter(m => m.n.toLowerCase().includes(q))
      : datosOriginales.marca;
    renderOpcionesMarca(filtradas);
  } else if (tipo === 'modelo') {
    const filtradas = q
      ? datosOriginales.modelo.filter(m => m.n.toLowerCase().includes(q))
      : datosOriginales.modelo;
    renderOpcionesModelo(filtradas);
  }
}

// =====================================================
// EVENTOS DE CAMBIO EN FILTROS
// =====================================================
function bindearEventos() {
  // Búsqueda en el hero con debounce
  let timeout;
  document.getElementById('busqueda').addEventListener('input', (e) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      state.filtros.busqueda = e.target.value.trim().toLowerCase();
      aplicarBusqueda();
    }, 300);
  });
  
  // Tecla Escape cierra dropdowns
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarTodosDropdowns();
  });
}

async function onFiltroCambio(e) {
  const cb = e.target;
  const tipo = cb.dataset.tipo;
  const valor = cb.value;
  
  if (tipo === 'familia') {
    if (cb.checked) state.filtros.familias.add(valor);
    else state.filtros.familias.delete(valor);
  } else if (tipo === 'marca') {
    if (cb.checked) state.filtros.marcas.add(valor);
    else state.filtros.marcas.delete(valor);
    // Cambió la marca → refrescar dropdown de modelo
    actualizarModeloDropdown();
  } else if (tipo === 'modelo') {
    if (cb.checked) state.filtros.modelos.add(valor);
    else state.filtros.modelos.delete(valor);
  }

  await aplicarBusqueda();
}

async function onCambioAno() {
  state.filtros.anoDesde = parseInt(document.getElementById('ano-desde').value) || null;
  state.filtros.anoHasta = parseInt(document.getElementById('ano-hasta').value) || null;
  await aplicarBusqueda();
}

// =====================================================
// APLICAR FILTROS
// =====================================================
async function aplicarBusqueda() {
  state.pagina = 1;

  try {
    // Siempre filtramos sobre la lista completa (cargada al inicio)
    const piezas = state.todasLasPiezas;

    // Preparar términos de búsqueda: separar por espacios, normalizar acentos,
    // ignorar palabras de 1 carácter para evitar ruido.
    let terminosBusqueda = [];
    if (state.filtros.busqueda) {
      terminosBusqueda = state.filtros.busqueda
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quitar acentos
        .split(/\s+/)
        .filter(t => t.length > 0);
    }

    if (!hayFiltrosActivos()) {
      // Sin filtros: mostrar todas las piezas
      state.resultados = piezas;
    } else {
      state.resultados = piezas.filter(p => {
        if (state.filtros.familias.size > 0 && !state.filtros.familias.has(p.f)) return false;
        if (state.filtros.marcas.size > 0 && !state.filtros.marcas.has(p.m)) return false;
        if (state.filtros.modelos.size > 0 && !state.filtros.modelos.has(p.mo)) return false;
        if (state.filtros.anoDesde && p.af && p.af < state.filtros.anoDesde) return false;
        if (state.filtros.anoHasta && p.ai && p.ai > state.filtros.anoHasta) return false;
        
        // Búsqueda multi-palabra: TODAS las palabras deben aparecer en
        // alguno de los campos (artículo, marca, modelo, motor, familia,
        // refid, ref. visual, ref. catálogo). Orden indiferente.
        // Ej. "motor bkd" → encuentra "TAPA MOTOR / SEAT / LEON / BKD / MOTOR / ..."
        if (terminosBusqueda.length > 0) {
          const campos = [p.t, p.m, p.mo, p.mt, p.f, p.i, p.rv, p.rc];
          const texto = campos
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          
          // Cada término debe estar en el texto. Si falta uno, descartamos.
          for (const termino of terminosBusqueda) {
            if (!texto.includes(termino)) return false;
          }
        }
        return true;
      });
    }

    aplicarOrden();
    render();
  } catch (e) {
    console.error('Error aplicando búsqueda:', e);
  }
}

function hayFiltrosActivos() {
  return state.filtros.familias.size > 0
      || state.filtros.marcas.size > 0
      || state.filtros.modelos.size > 0
      || state.filtros.anoDesde
      || state.filtros.anoHasta
      || state.filtros.busqueda;
}

async function cargarTodasLasPiezas() {
  // Función obsoleta — ahora se carga todo al inicio.
  // Se mantiene por si algún código viejo la referencia.
  return state.todasLasPiezas;
}

function aplicarOrden() {
  const sorted = [...state.resultados];
  if (state.orden === 'precio-asc') {
    sorted.sort((a, b) => (a.p ?? 999999) - (b.p ?? 999999));
  } else if (state.orden === 'precio-desc') {
    sorted.sort((a, b) => (b.p ?? -1) - (a.p ?? -1));
  }
  state.resultados = sorted;
}

function reordenar() {
  state.orden = document.getElementById('orden').value;
  aplicarOrden();
  render();
}

function limpiarFiltros() {
  state.filtros.familias.clear();
  state.filtros.marcas.clear();
  state.filtros.modelos.clear();
  state.filtros.anoDesde = null;
  state.filtros.anoHasta = null;
  state.filtros.busqueda = '';
  
  document.getElementById('ano-desde').value = '';
  document.getElementById('ano-hasta').value = '';
  document.getElementById('busqueda').value = '';
  
  renderOpcionesFamilia(datosOriginales.familia);
  renderOpcionesMarca(datosOriginales.marca);
  actualizarModeloDropdown();
  cerrarTodosDropdowns();
  
  aplicarBusqueda();
}

// Quitar un filtro individual desde un chip
function quitarFiltro(tipo, valor) {
  if (tipo === 'familia') state.filtros.familias.delete(valor);
  else if (tipo === 'marca') {
    state.filtros.marcas.delete(valor);
    actualizarModeloDropdown();
  }
  else if (tipo === 'modelo') state.filtros.modelos.delete(valor);
  else if (tipo === 'ano') {
    state.filtros.anoDesde = null;
    state.filtros.anoHasta = null;
    document.getElementById('ano-desde').value = '';
    document.getElementById('ano-hasta').value = '';
  }
  else if (tipo === 'busqueda') {
    state.filtros.busqueda = '';
    document.getElementById('busqueda').value = '';
  }
  
  // Refrescar visualmente las opciones para que se desmarquen
  renderOpcionesFamilia(datosOriginales.familia);
  renderOpcionesMarca(datosOriginales.marca);
  if (datosOriginales.modelo.length > 0) renderOpcionesModelo(datosOriginales.modelo);
  
  aplicarBusqueda();
}

// =====================================================
// PAGINACIÓN
// =====================================================
function paginaSiguiente() {
  const total = Math.ceil(state.resultados.length / ITEMS_POR_PAGINA);
  if (state.pagina < total) {
    state.pagina++;
    render();
    window.scrollTo({ top: document.querySelector('.results').offsetTop - 80, behavior: 'smooth' });
  }
}

function paginaAnterior() {
  if (state.pagina > 1) {
    state.pagina--;
    render();
    window.scrollTo({ top: document.querySelector('.results').offsetTop - 80, behavior: 'smooth' });
  }
}

// =====================================================
// RENDERIZADO
// =====================================================
function render() {
  ocultarLoading();
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const pag = document.getElementById('paginacion');

  document.getElementById('count-resultados').textContent = formatNum(state.resultados.length);
  renderChipsActivos();
  actualizarBadges();
  actualizarBotonLimpiar();

  if (state.resultados.length === 0) {
    grid.style.display = 'none';
    pag.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  grid.style.display = 'grid';

  const inicio = (state.pagina - 1) * ITEMS_POR_PAGINA;
  const fin = inicio + ITEMS_POR_PAGINA;
  const pageItems = state.resultados.slice(inicio, fin);

  grid.innerHTML = pageItems.map(renderTarjeta).join('');

  const totalPag = Math.ceil(state.resultados.length / ITEMS_POR_PAGINA);
  if (totalPag > 1) {
    pag.style.display = 'flex';
    document.getElementById('info-pagina').textContent = `Página ${state.pagina} de ${formatNum(totalPag)}`;
    document.getElementById('btn-prev').disabled = state.pagina === 1;
    document.getElementById('btn-next').disabled = state.pagina === totalPag;
  } else {
    pag.style.display = 'none';
  }
}

function renderTarjeta(p) {
  const anos = RD_Data.formatAnos(p.ai, p.af);
  const precio = p.p ? RD_Data.formatPrecio(p.p) : null;
  const waURL = RD_Data.buildWhatsAppURL('+34649903695', p.t, p.i);

  // Placeholder con logo + nombre + ciudad del desguace.
  // El nombre se muestra SIEMPRE porque no todos los logos de los CAT
  // llevan el nombre integrado. Algunos socios mandarán logos solo
  // simbólicos (escudos, símbolos) y otros no tendrán logo profesional.
  const placeholder = `
    <div class="card-placeholder">
      <img src="assets/logo-reciclacat.jpg" alt="ReciclaCAT" class="placeholder-logo">
      <div class="placeholder-name">ReciclaCAT</div>
      <div class="placeholder-city">Sevilla · CAT</div>
    </div>
  `;

  const img = p.th
    ? `<img src="${p.th}" alt="${escapar(p.t)}" loading="lazy" onerror="reemplazaImgFallida(this)">`
    : '';
  const imgClass = p.th ? 'card-img' : 'card-img no-img';
  const contenidoSinImagen = p.th ? '' : placeholder;

  return `
    <article class="card">
      <a href="pieza.html?id=${p.i}" class="card-img-link">
        <div class="${imgClass}">${img}${contenidoSinImagen}<span class="card-badge">CAT</span></div>
      </a>
      <div class="card-info">
        <div class="card-cat">${capitalizar(p.f || '')}</div>
        <a href="pieza.html?id=${p.i}" style="color:inherit; text-decoration:none;">
          <div class="card-title">${escapar(p.t)}</div>
        </a>
        <div class="card-meta">${escapar(p.m || '')} ${escapar(p.mo || '')}${anos ? ' · ' + anos : ''}</div>
        ${precio
          ? `<div class="card-price">${precio}</div>`
          : `<div class="card-price no-precio">Consultar precio</div>`
        }
        <div class="card-seller">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ReciclaCAT · Sevilla
        </div>
      </div>
      <a href="${waURL}" class="card-wa" target="_blank" rel="noopener" onclick="event.stopPropagation();">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/></svg>
        Pedir por WhatsApp
      </a>
    </article>
  `;
}

// =====================================================
// CHIPS DE FILTROS ACTIVOS
// =====================================================
function renderChipsActivos() {
  const chips = [];
  
  if (state.filtros.busqueda) {
    chips.push(crearChip('busqueda', state.filtros.busqueda, `«${state.filtros.busqueda}»`));
  }
  for (const f of state.filtros.familias) {
    chips.push(crearChip('familia', f, capitalizar(f)));
  }
  for (const m of state.filtros.marcas) {
    chips.push(crearChip('marca', m, capitalizar(m)));
  }
  for (const mo of state.filtros.modelos) {
    chips.push(crearChip('modelo', mo, mo));
  }
  if (state.filtros.anoDesde || state.filtros.anoHasta) {
    const txt = `${state.filtros.anoDesde || '?'}–${state.filtros.anoHasta || '?'}`;
    chips.push(crearChip('ano', 'all', txt));
  }
  
  const cont = document.getElementById('chips-activos');
  cont.innerHTML = chips.join('');
}

function crearChip(tipo, valor, etiqueta) {
  return `
    <span class="chip">
      ${escapar(etiqueta)}
      <span class="chip-x" onclick="quitarFiltro('${tipo}', ${JSON.stringify(valor)})" title="Quitar filtro">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </span>
    </span>
  `;
}

// =====================================================
// BADGES Y BOTÓN LIMPIAR
// =====================================================
function actualizarBadges() {
  const setBadge = (id, n, dropdownId) => {
    const badge = document.getElementById(id);
    if (!badge) return;
    if (n > 0) {
      badge.textContent = n;
      badge.style.display = 'inline-block';
      // Marcar el dropdown como con selección
      document.querySelector(`.filter-dropdown[data-filter="${dropdownId}"]`)?.classList.add('has-selection');
    } else {
      badge.style.display = 'none';
      document.querySelector(`.filter-dropdown[data-filter="${dropdownId}"]`)?.classList.remove('has-selection');
    }
  };
  setBadge('badge-familia', state.filtros.familias.size, 'familia');
  setBadge('badge-marca', state.filtros.marcas.size, 'marca');
  setBadge('badge-modelo', state.filtros.modelos.size, 'modelo');
  const anoCount = (state.filtros.anoDesde ? 1 : 0) + (state.filtros.anoHasta ? 1 : 0);
  setBadge('badge-ano', anoCount, 'ano');
}

function actualizarBotonLimpiar() {
  const hayFiltros = state.filtros.familias.size > 0
                  || state.filtros.marcas.size > 0
                  || state.filtros.modelos.size > 0
                  || state.filtros.anoDesde
                  || state.filtros.anoHasta
                  || state.filtros.busqueda;
  document.getElementById('btn-limpiar').style.display = hayFiltros ? 'inline-flex' : 'none';
}

// =====================================================
// HELPERS
// =====================================================
function mostrarLoading() {
  document.getElementById('loading').style.display = 'block';
  document.getElementById('grid').style.display = 'none';
  document.getElementById('empty').style.display = 'none';
  document.getElementById('paginacion').style.display = 'none';
}

function ocultarLoading() {
  document.getElementById('loading').style.display = 'none';
}

function formatNum(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function capitalizar(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function escapar(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

// Función global: cuando una imagen del CDN falla al cargar, esta función
// reemplaza el <img> roto por el placeholder con el logo del desguace.
// Se llama desde el onerror del img.
window.reemplazaImgFallida = function(imgEl) {
  const cont = imgEl.parentElement;
  if (!cont) return;
  cont.classList.add('no-img');
  imgEl.remove();
  if (!cont.querySelector('.card-placeholder')) {
    const placeholder = document.createElement('div');
    placeholder.className = 'card-placeholder';
    placeholder.innerHTML = `
      <img src="assets/logo-reciclacat.jpg" alt="ReciclaCAT" class="placeholder-logo">
      <div class="placeholder-name">ReciclaCAT</div>
      <div class="placeholder-city">Sevilla · CAT</div>
    `;
    const badge = cont.querySelector('.card-badge');
    if (badge) cont.insertBefore(placeholder, badge);
    else cont.appendChild(placeholder);
  }
};
