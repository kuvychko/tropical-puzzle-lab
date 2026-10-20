"""Embed generated geometry into the portable viewer; no network dependencies."""
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parent
fragment=(ROOT/'viewer-fragment.html').read_text().replace('__GEOMETRY__',(ROOT/'generated/geometry.json').read_text())
(ROOT/'generated/viewer-fragment.html').write_text(fragment)
css='''
:root{color-scheme:light dark;--background:light-dark(#f5f3ee,#182026);--foreground:light-dark(#24323b,#e8eeee);--muted:light-dark(#d9dedc,#303c44);--viz-series-1:light-dark(#719d9f,#80b8bb);--viz-series-2:light-dark(#c5a638,#dcc369)}
body{margin:0;background:var(--background);color:var(--foreground);font:15px system-ui,sans-serif;padding:24px;max-width:960px;margin:auto}h3{font-size:20px;font-weight:500}.viz-controls{display:flex;flex-wrap:wrap;gap:16px}.form-label{display:grid;gap:6px;flex:1;min-width:140px}.form-select{font:inherit;padding:8px;color:var(--foreground);background:var(--background);border:1px solid var(--muted);border-radius:5px}.text-small{font-size:13px}svg{overflow:visible}
'''
(ROOT/'viewer.html').write_text('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tropical puzzle prototype</title><style>'+css+'</style></head><body>'+fragment+'</body></html>')
(ROOT/'generated/viewer-check.js').write_text(re.findall(r'<script>(.*?)</script>',fragment,re.S)[0])
print('Built viewer.html and embedded fragment')
