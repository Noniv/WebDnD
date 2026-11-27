import os, sys, xml.etree.ElementTree as ET, collections
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'art')
NS = '{http://www.w3.org/2000/svg}'
EXPECT = {'tiles': (64, 64), 'tokens': (128, 128), 'portraits': (200, 240), 'icons': (64, 64)}
bad = 0; count = 0; sizes = []
for folder in sorted(os.listdir(ROOT)):
    for f in sorted(os.listdir(os.path.join(ROOT, folder))):
        p = os.path.join(ROOT, folder, f)
        if os.path.isdir(p) or not f.endswith('.svg'):
            continue  # ui/gold/ has its own validator (tools/ui-gold/validate.cjs)
        count += 1
        raw = open(p, encoding='utf8').read()
        errs = []
        try:
            root = ET.fromstring(raw)
        except Exception as e:
            print('PARSE FAIL', folder, f, e); bad += 1; continue
        if root.tag != NS + 'svg': errs.append('root not svg')
        w, h, vb = root.get('width'), root.get('height'), root.get('viewBox')
        if not (w and h and vb): errs.append('missing width/height/viewBox')
        elif vb != f'0 0 {w} {h}': errs.append('viewBox mismatch')
        if folder in EXPECT and (int(w), int(h)) != EXPECT[folder]: errs.append(f'size {w}x{h}')
        for tag in ('<text', '<image', '<style', 'href', 'http://www.w3.org/1999/xlink', '@import'):
            if tag in raw: errs.append('contains ' + tag)
        ids = [el.get('id') for el in root.iter() if el.get('id')]
        dup = [i for i, c in collections.Counter(ids).items() if c > 1]
        if dup: errs.append('dup ids ' + ','.join(dup))
        stem = f[:-4]
        unpref = [i for i in ids if not i.startswith(stem)]
        if unpref: errs.append('ids not prefixed ' + ','.join(unpref))
        import re
        for ref in re.findall(r'url\(#([^)]+)\)', raw):
            if ref not in ids: errs.append('dangling ref ' + ref)
        if len(raw.encode()) > 12 * 1024: errs.append(f'size {len(raw)} bytes')
        sizes.append((len(raw), folder + '/' + f))
        if errs: bad += 1; print(folder + '/' + f, '; '.join(errs))
print(f'{count} files checked, {bad} with problems; largest:', sorted(sizes)[-3:])
