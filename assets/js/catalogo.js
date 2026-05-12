/* =====================================================
   RED DESGUACE · CATÁLOGO
   Lógica de búsqueda, filtros y paginación
   ===================================================== */

const ITEMS_POR_PAGINA = 24;

const state = {
  todasLasPiezas: [],      // todas cargadas (se llena al primer filtrado o búsqueda)
  resultados: [],          // resultados filtrados actuales
  pagina: 1,
  filtros: {
    familias: new Set(),
    marcas: new Set(),
    anoDesde: null,
    anoHasta: null,
    busqueda: ''
  },
  orden: 'relevancia',
  cargandoTodo: false
};

// =====================================================
// INICIALIZACIÓN
// =====================================================
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const meta = await RD_Data.loadMeta();
    renderizarStats(meta);
    renderizarFiltrosFamilia(meta.familias);
    renderizarFiltrosMarca(meta.marcas);
    bindearEventos();

    // Mostrar las piezas destacadas (home)
    state.resultados = meta.home_piezas || [];
    render();
  } catch (e) {
    console.error('Error inicializando:', e);
    document.getElementById('loading').innerHTML = '<p style="color:#c33;">Error al cargar el catálogo. Recarga la página.</p>';
  }
});

// =====================================================
// RENDERIZADO INICIAL
// =====================================================
function renderizarStats(meta) {
  document.getElementById('stat-piezas').textContent = formatNum(meta.total);
  // Calcular modelos únicos aproximados (1 por marca tenemos los más comunes)
  document.getElementById('stat-modelos').textContent = '+1.200';
}

function renderizarFiltrosFamilia(familias) {
  const cont = document.getElementById('filtros-familia');
  cont.innerHTML = familias.slice(0, 14).map(f => `
    <label>
      <input type="checkbox" value="${f.n}" data-tipo="familia">
      ${capitalizar(f.n)}
      <span class="cnt">${formatNum(f.c)}</span>
    </label>
  `).join('');
}

function renderizarFiltrosMarca(marcas) {
  const cont = document.getElementById('filtros-marca');
  cont.innerHTML = marcas.map(m => `
    <label>
      <input type="checkbox" value="${m.n}" data-slug="${m.s}" data-tipo="marca">
      ${capitalizar(m.n)}
      <span class="cnt">${formatNum(m.c)}</span>
    </label>
  `).join('');
}

function bindearEventos() {
  // Cambios en checkboxes
  document.querySelectorAll('input[type="checkbox"][data-tipo]').forEach(cb => {
    cb.addEventListener('change', onFiltroCambio);
  });

  // Rango de años
  document.getElementById('ano-desde').addEventListener('change', onFiltroCambio);
  document.getElementById('ano-hasta').addEventListener('change', onFiltroCambio);

  // Búsqueda con debounce
  let timeout;
  document.getElementById('busqueda').addEventListener('input', (e) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      state.filtros.busqueda = e.target.value.trim().toLowerCase();
      aplicarBusqueda();
    }, 300);
  });
}

// =====================================================
// MANEJO DE FILTROS
// =====================================================
async function onFiltroCambio(e) {
  const cb = e.target;
  if (cb.dataset.tipo === 'familia') {
    if (cb.checked) state.filtros.familias.add(cb.value);
    else state.filtros.familias.delete(cb.value);
  } else if (cb.dataset.tipo === 'marca') {
    if (cb.checked) state.filtros.marcas.add(cb.value);
    else state.filtros.marcas.delete(cb.value);
  }

  state.filtros.anoDesde = parseInt(document.getElementById('ano-desde').value) || null;
  state.filtros.anoHasta = parseInt(document.getElementById('ano-hasta').value) || null;

  await aplicarBusqueda();
}

async function aplicarBusqueda() {
  state.pagina = 1;
  mostrarLoading();

  try {
    // Si hay marcas seleccionadas, solo cargamos esas
    let piezas;
    if (state.filtros.marcas.size > 0) {
      piezas = [];
      const slugs = Array.from(document.querySelectorAll('input[data-tipo="marca"]:checked'))
        .map(cb => cb.dataset.slug);
      for (const slug of slugs) {
        const data = await RD_Data.loadMarca(slug);
        piezas = piezas.concat(data);
      }
    } else if (state.filtros.busqueda || state.filtros.familias.size > 0 || state.filtros.anoDesde || state.filtros.anoHasta) {
      // Filtrado global → necesitamos todas las piezas
      piezas = await cargarTodasLasPiezas();
    } else {
      // Sin filtros: mostrar destacadas
      const meta = await RD_Data.loadMeta();
      state.resultados = meta.home_piezas || [];
      render();
      return;
    }

    // Aplicar filtros adicionales
    state.resultados = piezas.filter(p => {
      // Familia
      if (state.filtros.familias.size > 0 && !state.filtros.familias.has(p.f)) return false;
      // Año
      if (state.filtros.anoDesde && p.af && p.af < state.filtros.anoDesde) return false;
      if (state.filtros.anoHasta && p.ai && p.ai > state.filtros.anoHasta) return false;
      // Búsqueda libre
      if (state.filtros.busqueda) {
        const q = state.filtros.busqueda;
        const texto = `${p.t} ${p.m} ${p.mo} ${p.f} ${p.i}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    });

    aplicarOrden();
    render();
  } catch (e) {
    console.error('Error aplicando búsqueda:', e);
  }
}

async function cargarTodasLasPiezas() {
  if (state.todasLasPiezas.length > 0) return state.todasLasPiezas;

  state.cargandoTodo = true;
  const loadEl = document.getElementById('loading');
  loadEl.innerHTML = `
    <div class="spinner"></div>
    <p>Cargando catálogo completo...</p>
    <p id="progreso" style="font-size:12px; color:#888; margin-top:6px;">0%</p>
  `;

  state.todasLasPiezas = await RD_Data.loadAllMarcas((c, t) => {
    const pct = Math.round((c / t) * 100);
    const progEl = document.getElementById('progreso');
    if (progEl) progEl.textContent = `${pct}% (${c}/${t} marcas)`;
  });

  state.cargandoTodo = false;
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
  state.filtros.anoDesde = null;
  state.filtros.anoHasta = null;
  state.filtros.busqueda = '';
  document.querySelectorAll('input[type="checkbox"][data-tipo]').forEach(cb => cb.checked = false);
  document.getElementById('ano-desde').value = '';
  document.getElementById('ano-hasta').value = '';
  document.getElementById('busqueda').value = '';
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
// RENDERIZADO DE RESULTADOS
// =====================================================
function render() {
  ocultarLoading();
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const pag = document.getElementById('paginacion');

  // Actualizar contador
  document.getElementById('count-resultados').textContent = formatNum(state.resultados.length);
  renderFiltrosActivos();

  if (state.resultados.length === 0) {
    grid.style.display = 'none';
    pag.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  grid.style.display = 'grid';

  // Página actual
  const inicio = (state.pagina - 1) * ITEMS_POR_PAGINA;
  const fin = inicio + ITEMS_POR_PAGINA;
  const pageItems = state.resultados.slice(inicio, fin);

  grid.innerHTML = pageItems.map(renderTarjeta).join('');

  // Paginación
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

  const img = p.th
    ? `<img src="${p.th}" alt="${escapar(p.t)}" loading="lazy" onerror="this.parentElement.classList.add('no-img'); this.remove();">`
    : '';
  const imgClass = p.th ? 'card-img' : 'card-img no-img';
  const badge = `<span class="card-badge">CAT</span>`;

  return `
    <article class="card">
      <a href="pieza.html?id=${p.i}" class="card-img-link">
        <div class="${imgClass}">${img}${badge}</div>
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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
        Pedir por WhatsApp
      </a>
    </article>
  `;
}

function renderFiltrosActivos() {
  const tags = [];
  if (state.filtros.busqueda) tags.push(`«${state.filtros.busqueda}»`);
  if (state.filtros.familias.size > 0) tags.push(`${state.filtros.familias.size} familias`);
  if (state.filtros.marcas.size > 0) tags.push(`${state.filtros.marcas.size} marcas`);
  if (state.filtros.anoDesde || state.filtros.anoHasta) {
    tags.push(`${state.filtros.anoDesde || '?'}–${state.filtros.anoHasta || '?'}`);
  }
  document.getElementById('filtros-activos').textContent = tags.length
    ? '· ' + tags.join(' · ')
    : '';
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
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
