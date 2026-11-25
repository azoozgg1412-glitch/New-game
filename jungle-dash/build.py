#!/usr/bin/env python3
"""Build jungle-dash.html: one self-contained file that plays offline.
Inlines three.js (three@0.160.0 build/three.min.js) and the shared Beast Stage engine
modules (textures, plant models, car model, beast model, particles, audio).
Usage: python3 build.py path/to/three.min.js"""
import pathlib, sys
here = pathlib.Path(__file__).parent
libs = here.parent / 'beast-stage' / 'js'
def inline(code): return '<script>\n' + code.replace('</script', '<\\/script') + '\n</script>\n'
three = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
parts = ''.join(inline((libs / (n + '.js')).read_text(encoding='utf-8')) for n in ['util', 'textures', 'flora', 'car-model', 'beast', 'fx', 'audio'])
src = (here / 'src.html').read_text(encoding='utf-8')
out = src.replace('<!--THREE-->', inline(three)).replace('<!--LIBS-->', parts)
(here / 'jungle-dash.html').write_text(out, encoding='utf-8')
print('wrote jungle-dash.html', len(out.encode()) // 1024, 'KB')
