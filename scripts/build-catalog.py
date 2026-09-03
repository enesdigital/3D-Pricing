#!/usr/bin/env python3
"""
Perakende katalog JSON'larını (scripts/catalog/*.json) birleştirip src/data/catalog.ts üretir.
- Yazıcılar marka+model'e göre tekilleştirilir (fiyat: medyan), spec'ler sınıf sezgileriyle türetilir.
- Filament/reçine marka+tür'e göre tekilleştirilir (kg fiyatı: medyan).
Kullanım: python3 scripts/build-catalog.py
"""
import json, re, glob, statistics, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files = sorted(glob.glob(os.path.join(ROOT, 'scripts/catalog/*.json')))
if not files:
    sys.exit('scripts/catalog/*.json yok')

def slug(s):
    s = s.lower()
    s = s.replace('ı', 'i').replace('ş', 's').replace('ğ', 'g').replace('ç', 'c').replace('ö', 'o').replace('ü', 'u')
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s

# Aynı ürünün farklı yazımları ve gereksiz paket varyantları
DROP_RE = re.compile(r'laser|lazer|bundle|outlet|enclosed kit|mercury', re.I)
CANON = [
    (r'\boriginal prusa\b', ' '), (r'\bams combo\b', 'combo'), (r'\bams\b', ' '), (r'\bcore xz\b', ' '), (r'\bcorexz\b', ' '),
    (r'\bmars 5 ultra 9k\b', 'mars 5 ultra'), (r'\ba350t\b', 'a350'), (r'\bquick[- ]?swap\b', ' '), (r'\byeni versiyon\b', ' '),
    (r'\b20(2[4-9])\b', ' '), (r'\bdual nozzle\b', ' '), (r'\bidex\b', ' '), (r'\b3-?in-?1\b', ' '), (r'\bpremium\b', ' '), (r'\b3d printer\b', ' '), (r'\bmodular\b', ' '),
]
def canon(m):
    m = m.replace('+', ' plus ')
    for pat, rep in CANON: m = re.sub(pat, rep, m)
    return re.sub(r'\s+', ' ', m).strip()

def norm_model(brand, model):
    m = model.lower().replace(brand.lower(), '').strip()
    m = re.sub(r'\([^)]*\)', ' ', m)            # parantez içi (AMS lite, 16K, outlet…) tekilleştirmede yok sayılır
    m = re.sub(r'\*[^*]*\*', ' ', m)
    m = re.sub(r'\b(3d|yazıcı|yazici|printer|fdm|sla|msla|reçine|recine)\b', ' ', m)
    m = re.sub(r'\s+', ' ', m).strip(' -')
    return canon(m)

def median(vals):
    vals = [v for v in vals if isinstance(v, (int, float)) and v > 0]
    return round(statistics.median(vals)) if vals else None

BRAND_ALIASES = {'bambulab': 'Bambu Lab', 'bambu': 'Bambu Lab', 'bambu lab': 'Bambu Lab', 'creality': 'Creality', 'anycubic': 'Anycubic',
                 'elegoo': 'Elegoo', 'prusa': 'Prusa', 'prusa research': 'Prusa', 'flashforge': 'Flashforge', 'qidi': 'QIDI', 'qidi tech': 'QIDI',
                 'phrozen': 'Phrozen', 'sovol': 'Sovol', 'artillery': 'Artillery', 'kingroon': 'Kingroon', 'voxelab': 'Voxelab', 'formlabs': 'Formlabs',
                 'ultimaker': 'UltiMaker', 'raise3d': 'Raise3D', 'snapmaker': 'Snapmaker', 'elegoo ': 'Elegoo', 'twotrees': 'TwoTrees', 'two trees': 'TwoTrees',
                 'esun': 'eSUN', 'polymaker': 'Polymaker', 'sunlu': 'SUNLU', 'porima': 'Porima', 'microzey': 'Microzey', 'filameon': 'Filameon', 'kexcelled': 'Kexcelled',
                 'anycubic ': 'Anycubic', 'siraya tech': 'Siraya Tech', 'siraya': 'Siraya Tech', 'nova3d': 'Nova3D', 'ameralabs': 'AmeraLabs', 'elegoo standard': 'Elegoo'}
def brand_name(b):
    if not b: return 'Diğer'
    k = b.strip().lower()
    return BRAND_ALIASES.get(k, b.strip())

printers, filaments, resins = {}, {}, {}
for f in files:
    d = json.load(open(f))
    site = re.sub(r'^https?://(www\.)?', '', d.get('site', os.path.basename(f))).strip('/')
    for p in d.get('printers', []):
        if not p.get('model') or p.get('tech') not in ('fdm', 'resin'): continue
        if DROP_RE.search(p['model']): continue  # lazer/bundle/3-in-1 paketleri: aynı yazıcının tekrarı
        brand = brand_name(p.get('brand'))
        key = slug(brand + ' ' + norm_model(brand, p['model']))
        e = printers.setdefault(key, {'brand': brand, 'model': p['model'].strip(), 'tech': p['tech'], 'prices': [], 'sites': [], 'specs': []})
        if p.get('priceTRY'): e['prices'].append(p['priceTRY'])
        e['sites'].append(site); e['specs'].append(p)
        # daha kısa/temiz model adı tercih
        if len(p['model'].strip()) < len(e['model']): e['model'] = p['model'].strip()
        e.setdefault('extras', set()).update(re.findall(r'\(([^)]*)\)', p['model']))
    for m in d.get('filaments', []):
        if not m.get('type'): continue
        brand = brand_name(m.get('brand')); key = slug(brand + ' ' + m['type'])
        e = filaments.setdefault(key, {'brand': brand, 'type': m['type'].strip(), 'ppk': [], 'sites': []})
        ppk = m.get('pricePerKgTRY') or (m.get('priceTRY') and m.get('spoolWeight_g') and m['priceTRY'] * 1000 / m['spoolWeight_g'])
        if ppk: e['ppk'].append(ppk)
        e['sites'].append(site)
    for r in d.get('resins', []):
        if not r.get('type'): continue
        brand = brand_name(r.get('brand')); key = slug(brand + ' ' + r['type'])
        e = resins.setdefault(key, {'brand': brand, 'type': r['type'].strip(), 'ppk': [], 'sites': []})
        ppk = r.get('pricePerKgTRY') or (r.get('priceTRY') and r.get('bottleWeight_g') and r['priceTRY'] * 1000 / r['bottleWeight_g'])
        if ppk: e['ppk'].append(ppk)
        e['sites'].append(site)

def first(specs, k, default=None):
    for s in specs:
        v = s.get(k)
        if v not in (None, '', 0): return v
    return default

def fdm_spec(specs, price):
    speed = first(specs, 'maxSpeed_mm_s', 250) or 250
    kin = (first(specs, 'kinematics', 'bedslinger') or 'bedslinger').lower()
    enclosed = bool(first(specs, 'enclosed', False))
    fast = speed >= 400
    eff = {'corexy': 1.1 if fast else 1.0, 'delta': 0.9, 'other': 0.9}.get(kin, 0.95 if fast else (0.85 if speed >= 200 else 0.7))
    maxflow = first(specs, 'maxFlow_mm3_s') or (28 if speed >= 500 else 22 if speed >= 300 else 12)
    mc = first(specs, 'multiColorSystem')
    dual = bool(first(specs, 'dualNozzleOrIdex', False))
    multi = bool(mc) or dual
    waste = {'AMS': 0.5, 'AMS lite': 0.5, 'AMS 2 Pro': 0.5, 'CFS': 0.6, 'ACE Pro': 1.2, 'MMU3': 0.4}.get(mc or '', 0.6 if multi else 0)
    avg = first(specs, 'avgPrintPowerW') or (180 if enclosed and price and price > 60000 else 130 if enclosed else 100 if fast else 90)
    rated = first(specs, 'ratedPowerW') or (1000 if enclosed else 350)
    return {
        'tech': 'fdm', 'maxFlow': maxflow, 'efficiencyScale': eff, 'outerWallSpeed': max(60, min(200, round(speed * 0.4))),
        'layerChangeSec': 1.3 if fast else 2.0, 'jobOverheadSec': 420 if enclosed else 300 if fast else 180,
        'jobWasteGrams': 1.0, 'colorChangeWasteGrams': waste, 'colorChangeTimeSec': 60 if multi else 0,
        'nozzleDiameter': first(specs, 'nozzleDiameter', 0.4) or 0.4, 'supportsMultiColor': multi,
        'dualNozzle': dual, 'nozzleSwitchWasteGrams': 0.03 if dual else 0, 'nozzleSwitchTimeSec': 8 if dual else 0,
        'avgPowerW': avg, 'heatupPowerW': round(min(rated, 1200) * 0.8),
    }

def resin_spec(specs):
    px = first(specs, 'pixelSize_um')
    if isinstance(px, str):
        m = re.search(r'[\d.]+', px)
        px = float(m.group(0)) if m else None
    if not px:
        res = first(specs, 'resolution', '') or ''
        m = re.search(r'(\d{4,5})\s*[x×]\s*(\d{4,5})', res)
        bx = first(specs, 'bedX_mm')
        px = round(bx * 1000 / int(m.group(1)), 1) if (m and bx) else 35
    tilt = (first(specs, 'liftMechanism', 'standard') or 'standard') == 'tilt'
    rated = first(specs, 'ratedPowerW') or 150
    return {
        'tech': 'resin', 'pixelSizeMm': round(px / 1000, 4), 'defaultLayerHeight': 0.05, 'exposureSec': 2.5, 'bottomExposureSec': 25,
        'bottomLayers': 6, 'liftCycleSec': 6.0 if tilt else 7.5, 'vatCapacityMl': 500, 'avgPowerW': round(rated * 0.6), 'postPowerW': 50,
        'tiltRelease': tilt,
    }

out_printers = []
for key, e in sorted(printers.items(), key=lambda kv: (kv[1]['tech'], kv[1]['brand'].lower(), kv[1]['model'].lower())):
    s = e['specs']; price = median(e['prices'])
    bed = [first(s, 'bedX_mm'), first(s, 'bedY_mm'), first(s, 'bedZ_mm')]
    if not all(bed): continue
    spec = fdm_spec(s, price) if e['tech'] == 'fdm' else resin_spec(s)
    clean_name = re.sub(r'\s*\*[^*]*\*', '', re.sub(r'\s*\([^)]*\)', '', e['model'])).strip() or e['model']
    clean_name = re.sub(r'\bAMS Combo\b', 'Combo', clean_name)
    clean_name = re.sub(r'^Original Prusa\s+', '', clean_name).strip()
    clean_name = re.sub(r'\s*(3-in-1|3D Printer|Premium)\b', '', clean_name, flags=re.I).strip()
    extras = ', '.join(sorted(e.get('extras', set())))
    out_printers.append({
        'id': 'cat-' + key, 'name': clean_name, 'brand': e['brand'], 'tech': e['tech'],
        'bed': {'x': bed[0], 'y': bed[1], 'z': bed[2]}, 'priceTRY': price or 0,
        'lifetimeHours': (6000 if e['brand'] in ('Bambu Lab', 'Prusa') else 5000) if e['tech'] == 'fdm' else 2500,
        'maintenanceTRYPerHour': (4 if (price or 0) > 50000 else 3 if (price or 0) > 25000 else 2) if e['tech'] == 'fdm' else 5,
        'spec': spec, 'notes': (extras + ' · ' if extras else '') + 'Kaynak: ' + ', '.join(sorted(set(e['sites']))) + ('' if price else ' (fiyat bulunamadı)'),
    })

DENS = {'pla': 1.24, 'pla+': 1.24, 'pla silk': 1.24, 'pla matte': 1.24, 'pla-cf': 1.22, 'petg': 1.27, 'petg-cf': 1.25, 'abs': 1.04, 'asa': 1.07,
        'tpu': 1.21, 'pa': 1.14, 'nylon': 1.14, 'pa-cf': 1.17, 'pc': 1.20, 'hips': 1.04, 'pva': 1.23, 'wood': 1.28, 'pp': 0.90, 'pet': 1.30, 'pctg': 1.23}
FLOW = {'pla': 18, 'pla+': 18, 'pla silk': 12, 'pla matte': 15, 'pla-cf': 15, 'petg': 12, 'petg-cf': 14, 'abs': 16, 'asa': 18, 'tpu': 3.6,
        'pa': 8, 'nylon': 8, 'pa-cf': 8, 'pc': 18, 'hips': 16, 'pva': 6, 'wood': 10, 'pp': 8, 'pet': 12, 'pctg': 12}
MINLT = {'petg': 12, 'petg-cf': 6, 'abs': 12, 'asa': 12, 'pla-cf': 8, 'pa': 2, 'nylon': 2, 'pa-cf': 2, 'pc': 2, 'tpu': 6}
POWER = {'petg': 1.15, 'petg-cf': 1.15, 'pctg': 1.15, 'abs': 1.9, 'asa': 1.9, 'pa': 2.0, 'nylon': 2.0, 'pa-cf': 2.0, 'pc': 2.0, 'hips': 1.8}
def type_key(t):
    t = t.lower().replace('plus', '+').replace(' ', '')
    for k in ['pa-cf', 'petg-cf', 'pla-cf', 'pctg', 'petg', 'pla+', 'plasilk', 'plamatte', 'pla', 'abs', 'asa', 'tpu', 'nylon', 'pa6', 'pa12', 'pa', 'pc', 'hips', 'pva', 'wood', 'pp', 'pet']:
        if k.replace(' ', '') in t:
            return {'plasilk': 'pla silk', 'plamatte': 'pla matte', 'pa6': 'pa', 'pa12': 'pa'}.get(k, k)
    return 'pla'

out_materials = []
for key, e in sorted(filaments.items(), key=lambda kv: (kv[1]['brand'].lower(), kv[1]['type'].lower())):
    ppk = median(e['ppk'])
    if not ppk: continue
    tk = type_key(e['type'])
    out_materials.append({'id': 'cat-f-' + key, 'name': f"{e['brand']} {e['type']}", 'brand': e['brand'], 'tech': 'fdm', 'density': DENS.get(tk, 1.24),
                          'pricePerKgTRY': ppk, 'maxFlow': FLOW.get(tk, 15), 'minLayerTime': MINLT.get(tk, 6), 'powerFactor': POWER.get(tk, 1.0),
                          'notes': 'Kaynak: ' + ', '.join(sorted(set(e['sites'])))})
RDENS = {'water': 1.13, 'abs': 1.12, 'tough': 1.12, 'flex': 1.05, 'castable': 1.05, 'dental': 1.15, 'standard': 1.10}
def rdens(t):
    t = t.lower()
    for k, v in RDENS.items():
        if k in t: return v
    return 1.10
for key, e in sorted(resins.items(), key=lambda kv: (kv[1]['brand'].lower(), kv[1]['type'].lower())):
    ppk = median(e['ppk'])
    if not ppk: continue
    out_materials.append({'id': 'cat-r-' + key, 'name': f"{e['brand']} {e['type']}", 'brand': e['brand'], 'tech': 'resin', 'density': rdens(e['type']),
                          'pricePerKgTRY': ppk, 'maxFlow': 0, 'minLayerTime': 0, 'powerFactor': 1.0,
                          'notes': 'Kaynak: ' + ', '.join(sorted(set(e['sites'])))})

ts = "// Otomatik üretildi: scripts/build-catalog.py — elle düzenlemeyin. Kaynak: scripts/catalog/*.json (Eylül 2026)\n"
ts += "import type { Material, PrinterProfile } from '../lib/cost/types.ts'\n\n"
ts += "export const CATALOG_PRINTERS: PrinterProfile[] = " + json.dumps(out_printers, ensure_ascii=False, indent=2) + "\n\n"
ts += "export const CATALOG_MATERIALS: Material[] = " + json.dumps(out_materials, ensure_ascii=False, indent=2) + "\n"
open(os.path.join(ROOT, 'src/data/catalog.ts'), 'w').write(ts)
print(f"yazıcı {len(out_printers)} (fdm {sum(1 for p in out_printers if p['tech']=='fdm')}, reçine {sum(1 for p in out_printers if p['tech']=='resin')}), malzeme {len(out_materials)}")
