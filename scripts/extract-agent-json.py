#!/usr/bin/env python3
"""Ajan transkript (JSONL) dosyasından son {"site":...,"printers":[...]} JSON'unu çıkarır ve kaydeder."""
import json, re, sys
src, dst = sys.argv[1], sys.argv[2]
text = open(src, encoding='utf-8', errors='ignore').read()
best = None
# Transkriptte JSON string olarak (kaçışlı) yer alır; tüm "site" içeren string alanlarını dene
for m in re.finditer(r'"text"\s*:\s*"((?:[^"\\]|\\.)*)"', text):
    s = m.group(1)
    if '\\"printers\\"' not in s: continue
    try:
        cand = json.loads('"' + s + '"')  # kaçışları çöz
        i = cand.find('{'); j = cand.rfind('}')
        obj = json.loads(cand[i:j + 1])
        if 'printers' in obj and (best is None or len(obj['printers']) >= len(best['printers'])): best = obj
    except Exception:
        continue
if best is None:
    # düz metin olarak da dene
    for m in re.finditer(r'\{"site".*?"notes":.*?\}\s*$', text, flags=re.S):
        try: best = json.loads(m.group(0)); break
        except Exception: pass
if best is None: sys.exit('JSON bulunamadı: ' + src)
json.dump(best, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(dst, 'yazıcı', len(best['printers']), 'filament', len(best.get('filaments', [])), 'reçine', len(best.get('resins', [])))
