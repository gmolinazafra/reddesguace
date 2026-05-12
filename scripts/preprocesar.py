#!/usr/bin/env python3
"""
Pre-procesar CSV de CRV NET en JSONs optimizados para la web estática.

Uso:
    python3 scripts/preprocesar.py path/al/csv.csv

Garantías:
- Escritura ATÓMICA: si falla a mitad, no deja datos a medias
- VERSIÓN sincronizada: meta.json incluye un hash que identifica esta versión
- VERIFICACIÓN automática: comprueba que precios coinciden listado vs ficha
  ANTES de escribir nada a disco
"""

import csv
import json
import re
import os
import sys
import hashlib
import tempfile
from datetime import datetime
from collections import Counter, defaultdict
from pathlib import Path


def slug(s):
    s = s.lower().strip()
    s = re.sub(r'[áàä]', 'a', s)
    s = re.sub(r'[éèë]', 'e', s)
    s = re.sub(r'[íìï]', 'i', s)
    s = re.sub(r'[óòö]', 'o', s)
    s = re.sub(r'[úùü]', 'u', s)
    s = re.sub(r'ñ', 'n', s)
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')


def parsear_precio(raw):
    """ÚNICO punto de parseo del precio. Mismo input siempre da el mismo output.
    
    Importante: usar SIEMPRE esta función. No parsear precios en otros sitios.
    Esto garantiza que listado y ficha tengan el mismo precio.
    """
    if not raw or not str(raw).strip():
        return None
    try:
        # CRV NET usa coma decimal (formato español): "1,48" → 1.48
        return round(float(str(raw).strip().replace(',', '.')), 2)
    except (ValueError, TypeError):
        return None


def parsear_entero(raw):
    if not raw or not str(raw).strip():
        return None
    try:
        return int(str(raw).strip())
    except (ValueError, TypeError):
        return None


def escribir_json_atomico(path, data):
    """Escritura atómica: archivo temporal + rename. Nunca deja archivo a medias."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(suffix='.tmp', dir=path.parent, prefix='.')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        os.replace(tmp_path, path)
    except Exception:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise


def procesar(csv_path, out_dir='data'):
    csv_path = Path(csv_path)
    out_dir = Path(out_dir)
    
    if not csv_path.exists():
        print(f"❌ No existe el archivo: {csv_path}")
        sys.exit(1)

    # buildId: timestamp YYYYMMDDHHMMSS (formato igual que en Soliva y Redia)
    # Sirve para cache-busting: las URLs de chunks llevan ?v={buildId}
    # Cuando se regenera el catálogo, este buildId cambia → el navegador
    # se ve obligado a descargar la versión nueva.
    build_id = datetime.now().strftime('%Y%m%d%H%M%S')
    csv_hash = hashlib.md5(open(csv_path, 'rb').read()).hexdigest()[:8]
    
    print(f"📂 Procesando {csv_path}")
    print(f"🏷️  buildId: {build_id} (csv hash: {csv_hash})\n")

    # ===========================================================
    # PASO 1: Construir todo EN MEMORIA antes de tocar disco
    # ===========================================================
    piezas_por_marca = defaultdict(list)
    fichas_chunks = defaultdict(dict)
    familias = Counter()
    marcas = Counter()
    modelos_por_marca = defaultdict(Counter)   # marca -> {modelo: count}
    total = 0
    con_imagen = 0
    home_piezas = []
    precios_check = {}  # refid -> precio (para auditoría posterior)
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        for row in reader:
            total += 1
            refid = row['refid'].strip()
            if not refid:
                continue
            
            familia = row['familia'].strip()
            marca = row['marca'].strip()
            modelo = row['modelo'].strip()
            articulo = row['articulo'].strip()
            
            # Registrar modelo asociado a marca (para dropdown dinámico)
            if marca and modelo:
                modelos_por_marca[marca][modelo] += 1
            
            # ---- PARSEO ÚNICO: usar siempre las MISMAS funciones ----
            precio = parsear_precio(row.get('precio'))
            ano_inicio = parsear_entero(row.get('modeloinicio'))
            ano_fin = parsear_entero(row.get('modelofin'))
            
            imgs_raw = row.get('imgs', '').strip()
            imgs = [i.strip() for i in imgs_raw.split(',') if i.strip()] if imgs_raw else []
            if imgs:
                con_imagen += 1
            
            if familia: familias[familia] += 1
            if marca: marcas[marca] += 1
            
            # ---- LISTADO: estructura compacta ----
            # Campos incluidos para BÚSQUEDA: marca, modelo, motor, refid,
            # refvisual, refcatalogo, familia y artículo. Se buscan por
            # texto libre desde el buscador del hero.
            motor = row.get('motorversion', '').strip() or None
            refvisual = row.get('refvisual', '').strip() or None
            refcatalogo = row.get('refcatalogo', '').strip() or None
            
            entrada_listado = {
                'i': refid,
                't': articulo,
                'f': familia,
                'm': marca,
                'mo': modelo,
                'mt': motor,          # ← Motor (M57TU, K4M782, etc.)
                'rv': refvisual,      # ← Ref. visual
                'rc': refcatalogo,    # ← Ref. catálogo
                'p': precio,            # ← MISMO precio que la ficha
                'ai': ano_inicio,
                'af': ano_fin,
                'th': imgs[0] if imgs else None
            }
            
            if marca:
                piezas_por_marca[marca].append(entrada_listado)
                precios_check[refid] = precio
            
            if imgs and precio and precio > 0 and len(home_piezas) < 60 and total % 3000 == 0:
                home_piezas.append(entrada_listado)
            
            # ---- FICHA: estructura completa ----
            chunk_id = int(refid[-2:]) if refid[-2:].isdigit() else 0
            fichas_chunks[chunk_id][refid] = {
                'refid': refid,
                'familia': familia,
                'articulo': articulo,
                'marca': marca,
                'modelo': modelo,
                'modeloinicio': ano_inicio,
                'modelofin': ano_fin,
                'motorversion': row.get('motorversion', '').strip() or None,
                'cambioversion': row.get('cambioversion', '').strip() or None,
                'refvisual': row.get('refvisual', '').strip() or None,
                'refcatalogo': row.get('refcatalogo', '').strip() or None,
                'precio': precio,       # ← MISMO precio que el listado
                'anopieza': row.get('anopieza', '').strip() or None,
                'notapublica': row.get('notapublica', '').strip() or None,
                'imgs': imgs
            }

    # ===========================================================
    # PASO 2: Verificación interna ANTES de escribir a disco
    # ===========================================================
    print(f"🔍 Verificando coherencia listado ↔ ficha...")
    errores = []
    sin_listado = 0
    
    for chunk_id, fichas in fichas_chunks.items():
        for refid, ficha in fichas.items():
            precio_ficha = ficha['precio']
            
            # Si la pieza no está en el listado (por no tener marca, etc.)
            # no hay nada que comparar. La ficha existe pero no se mostrará.
            if refid not in precios_check:
                sin_listado += 1
                continue
            
            precio_lista = precios_check[refid]
            # COMPARACIÓN ESTRICTA: deben ser exactamente iguales
            if precio_ficha != precio_lista:
                errores.append((refid, precio_lista, precio_ficha))
    
    if errores:
        print(f"\n❌ ABORTADO: {len(errores)} divergencias precio listado↔ficha")
        for refid, pl, pf in errores[:5]:
            print(f"   {refid}: listado={pl}  ficha={pf}")
        print(f"\n   No se ha escrito nada a disco. Revisa el código del script.")
        sys.exit(1)
    
    print(f"   ✅ {len(precios_check):,} precios coinciden listado↔ficha")
    if sin_listado > 0:
        print(f"   ℹ️  {sin_listado:,} piezas sin marca (ficha existe pero no aparecen en listado)")

    # ===========================================================
    # PASO 3: Escritura atómica de todos los archivos
    # ===========================================================
    print(f"\n💾 Escribiendo {len(piezas_por_marca)} chunks de marcas...")
    for marca, piezas in piezas_por_marca.items():
        escribir_json_atomico(out_dir / 'marcas' / f'{slug(marca)}.json', piezas)

    print(f"💾 Escribiendo {len(fichas_chunks)} chunks de fichas...")
    for chunk_id, fichas in fichas_chunks.items():
        escribir_json_atomico(out_dir / 'piezas' / f'{chunk_id:02d}.json', fichas)

    # meta.json AL FINAL: si llegamos aquí, todo lo demás está escrito
    # Limitamos a top-30 modelos por marca para que meta no crezca demasiado.
    # Si un socio busca un modelo poco común que no está en el top-30,
    # puede usar el buscador libre del hero.
    modelos_meta = {}
    for marca, contador in modelos_por_marca.items():
        top_modelos = contador.most_common(30)
        modelos_meta[slug(marca)] = [
            {'n': m, 'c': c} for m, c in top_modelos
        ]

    meta = {
        'buildId': build_id,
        'csvHash': csv_hash,
        'fecha': datetime.now().isoformat(),
        'total': total,
        'con_imagen': con_imagen,
        'familias': [{'n': f, 'c': c, 's': slug(f)} for f, c in familias.most_common()],
        'marcas': [{'n': m, 'c': c, 's': slug(m)} for m, c in marcas.most_common()],
        'modelos': modelos_meta,
        'desguace': {
            'nombre': 'ReciclaCAT',
            'ciudad': 'Sevilla',
            'cat': True,
            'whatsapp': '+34649903695'
        },
        'home_piezas': home_piezas[:60]
    }
    escribir_json_atomico(out_dir / 'meta.json', meta)

    print(f"\n✅ Procesadas {total:,} piezas (buildId: {build_id})")
    print(f"   - {con_imagen:,} con imagen ({con_imagen/total*100:.1f}%)")
    print(f"   - {len(familias)} familias")
    print(f"   - {len(marcas)} marcas")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Uso: python3 preprocesar.py <csv> [output_dir]")
        sys.exit(1)
    
    csv_path = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else 'data'
    procesar(csv_path, out_dir)
