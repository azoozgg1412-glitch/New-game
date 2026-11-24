#!/usr/bin/env python3
"""Inline three.js into src.html to make jungle-dash.html, one file that plays offline.
Usage: python3 build.py path/to/three.min.js   (three@0.160.0, build/three.min.js)"""
import pathlib, sys
here = pathlib.Path(__file__).parent
three = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8').replace('</script', '<\\/script')
src = (here / 'src.html').read_text(encoding='utf-8')
out = src.replace('<!--THREE-->', '<script>\n' + three + '\n</script>')
(here / 'jungle-dash.html').write_text(out, encoding='utf-8')
print('wrote jungle-dash.html', len(out.encode()) // 1024, 'KB')
