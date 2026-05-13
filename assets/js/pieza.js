/* =====================================================
   RED DESGUACE · FICHA DE PIEZA
   ===================================================== */

window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const refid = params.get('id');

  if (!refid) {
    mostrarError('No se ha especificado ninguna pieza.');
    return;
  }

  try {
    const ficha = await RD_Data.loadFicha(refid);
    if (!ficha) {
      mostrarError('Pieza no encontrada.');
      return;
    }

    renderFicha(ficha);
  } catch (e) {
    console.error(e);
    mostrarError('Error al cargar la ficha.');
  }
});

function renderFicha(p) {
  const anos = RD_Data.formatAnos(p.modeloinicio, p.modelofin);
  const precio = p.precio ? RD_Data.formatPrecio(p.precio) : null;
  const waURL = RD_Data.buildWhatsAppURL('+34649903695', p.articulo, p.refid);
  document.title = `${p.articulo} · ${p.marca} ${p.modelo} · Red Desguace`;

  // Breadcrumb
  document.getElementById('crumb-text').textContent = `${capitalizar(p.familia || '')} › ${p.articulo}`;

  // Galería
  let galleryHTML;
  
  // Placeholder con logo + nombre + tagline. El nombre se muestra SIEMPRE
  // porque no todos los logos de los CAT llevan el nombre integrado.
  const placeholderHTML = `
    <div class="ficha-placeholder">
      <img src="assets/logo-reciclacat.jpg" alt="ReciclaCAT" class="placeholder-logo-grande">
      <div class="placeholder-name-grande">ReciclaCAT</div>
      <div class="placeholder-city-grande">Málaga · Centro Autorizado de Tratamiento</div>
    </div>
  `;
  
  if (p.imgs && p.imgs.length > 0) {
    const mainImg = p.imgs[0];
    galleryHTML = `
      <div class="main-img" id="main-img">
        <img src="${mainImg}" alt="${escapar(p.articulo)}" id="main-img-tag"
             onerror="reemplazaImgFichaFallida(this)">
        <span class="badge">CAT autorizado</span>
      </div>
      <div class="thumbs">
        ${p.imgs.slice(0, 4).map((url, i) => `
          <div class="thumb ${i === 0 ? 'active' : ''}" onclick="cambiarFoto('${url}', this)">
            <img src="${url}" alt="" loading="lazy"
                 onerror="this.parentElement.style.display='none';">
          </div>
        `).join('')}
      </div>
    `;
  } else {
    galleryHTML = `
      <div class="main-img no-img" id="main-img">
        ${placeholderHTML}
        <span class="badge">CAT autorizado</span>
      </div>
    `;
  }

  // Detalles
  const detailsHTML = `
    <h3>${capitalizar(p.familia || '')}</h3>
    <h1>${escapar(p.articulo)}</h1>
    <div class="ficha-modelo">
      ${escapar(p.marca || '')} ${escapar(p.modelo || '')}
      ${anos ? ' · ' + anos : ''}
      ${p.motorversion ? ' · Motor ' + p.motorversion : ''}
    </div>

    ${precio ? `
      <div class="ficha-price">
        <span class="precio">${precio}</span>
        <span class="nota">Precio orientativo · IVA incluido</span>
      </div>
    ` : `
      <div class="ficha-price">
        <span class="precio" style="font-size:24px;">Consultar precio</span>
      </div>
    `}

    <div class="specs">
      ${(p.refvisual || p.refcatalogo || p.refid) ? `
        <h4>Referencias</h4>
        <div class="refs-group">
          <table>
            <tr><td class="lbl">Ref. interna</td><td class="val">${p.refid}</td></tr>
            ${p.refvisual ? `<tr><td class="lbl">Ref. visual</td><td class="val">${escapar(p.refvisual)}</td></tr>` : ''}
            ${p.refcatalogo ? `<tr><td class="lbl">Ref. catálogo</td><td class="val">${escapar(p.refcatalogo)}</td></tr>` : ''}
          </table>
        </div>
      ` : ''}

      <h4>Especificaciones</h4>
      <table>
        <tr><td class="lbl">Familia</td><td class="val">${capitalizar(p.familia || '')}</td></tr>
        <tr><td class="lbl">Marca</td><td class="val">${escapar(p.marca || '')}</td></tr>
        <tr><td class="lbl">Modelo</td><td class="val">${escapar(p.modelo || '')}</td></tr>
        ${anos ? `<tr><td class="lbl">Años</td><td class="val">${anos}</td></tr>` : ''}
        ${p.motorversion ? `<tr><td class="lbl">Motor</td><td class="val">${escapar(p.motorversion)}</td></tr>` : ''}
        ${p.anopieza ? `<tr><td class="lbl">Año de la pieza</td><td class="val">${escapar(p.anopieza)}</td></tr>` : ''}
        ${p.notapublica ? `<tr><td class="lbl">Nota</td><td class="val">${escapar(p.notapublica)}</td></tr>` : ''}
      </table>
    </div>

    <div class="seller-box">
      <div class="avatar">RC</div>
      <div class="info">
        <div class="name">ReciclaCAT</div>
        <div class="city">📍 Málaga · Centro Autorizado de Tratamiento</div>
      </div>
      <div class="pill">CAT</div>
    </div>

    <a class="wa-cta" href="${waURL}" target="_blank" rel="noopener">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
      Pedir por WhatsApp
    </a>
    <div class="wa-note">Te abrirá WhatsApp con un mensaje pre-rellenado a ReciclaCAT</div>
  `;

  document.getElementById('ficha-container').innerHTML = `
    <div class="ficha-gallery">${galleryHTML}</div>
    <div class="ficha-details">${detailsHTML}</div>
  `;
  document.getElementById('loading-ficha').style.display = 'none';
  document.getElementById('ficha-container').style.display = 'grid';
}

function cambiarFoto(url, thumb) {
  document.querySelectorAll('.thumb').forEach(t => t.classList.remove('active'));
  thumb.classList.add('active');
  const mainImg = document.getElementById('main-img-tag');
  if (mainImg) {
    mainImg.src = url;
  } else {
    // Re-crear si no existía (era no-img)
    const cont = document.getElementById('main-img');
    cont.classList.remove('no-img');
    cont.innerHTML = `<img src="${url}" alt="" id="main-img-tag" onerror="this.parentElement.classList.add('no-img'); this.remove();"><span class="badge">CAT autorizado</span>`;
  }
}

function mostrarError(msg) {
  document.getElementById('loading-ficha').innerHTML = `
    <p style="color:#c33;">${msg}</p>
    <a href="index.html" style="display:inline-block; margin-top:16px; padding:10px 20px; background:var(--aad-mid); color:white; border-radius:6px; text-decoration:none;">← Volver al catálogo</a>
  `;
}

function capitalizar(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function escapar(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

// Función global: cuando la imagen principal de la ficha falla al cargar,
// la reemplaza con el placeholder del logo del desguace.
window.reemplazaImgFichaFallida = function(imgEl) {
  const cont = imgEl.parentElement;
  if (!cont) return;
  cont.classList.add('no-img');
  imgEl.remove();
  if (!cont.querySelector('.ficha-placeholder')) {
    const placeholder = document.createElement('div');
    placeholder.className = 'ficha-placeholder';
    placeholder.innerHTML = `
      <img src="assets/logo-reciclacat.jpg" alt="ReciclaCAT" class="placeholder-logo-grande">
      <div class="placeholder-name-grande">ReciclaCAT</div>
      <div class="placeholder-city-grande">Málaga · Centro Autorizado de Tratamiento</div>
    `;
    const badge = cont.querySelector('.badge');
    if (badge) cont.insertBefore(placeholder, badge);
    else cont.appendChild(placeholder);
  }
};
