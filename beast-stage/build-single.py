#!/usr/bin/env python3
"""Bundle Beast Stage into one self-contained HTML file (beast-stage-single.html).

Usage: python3 build-single.py path/to/three.min.js   (three@0.160.0, build/three.min.js)
The output inlines three.js and every game script, so it plays offline from a double-click.
"""
import pathlib, re, sys

here = pathlib.Path(__file__).parent
three = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
page = (here / 'index.html').read_text(encoding='utf-8')
files = ['util', 'textures', 'world', 'terrain', 'flora', 'props', 'car-model', 'vehicle', 'beast', 'fx', 'audio', 'input', 'hud', 'game']

def inline(code):
    return '<script>\n' + code.replace('</script', '<\\/script') + '\n</script>\n'

boot = """<script>
(function () {
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch-ui');
  var loadText = document.getElementById('loadText');
  function fail(msg) { loadText.textContent = msg; loadText.style.color = '#ff7a5a'; }
  window.addEventListener('error', function (e) { if (!window.__bs) fail('Something broke while loading: ' + (e.message || 'unknown error')); });
  var fonts = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 1200); })]) : Promise.resolve();
  fonts.then(function () { return BS.boot(); }).catch(function (err) { console.error(err); fail('Something broke while loading: ' + err.message); });
})();
</script>
"""
bundle = inline(three) + ''.join(inline((here / 'js' / (f + '.js')).read_text(encoding='utf-8')) for f in files) + boot
start = page.index('<script>\n// Bootstrap')
end = page.index('</script>', start) + len('</script>')
out = page[:start] + bundle + page[end:]
out = out.replace('Loading the 3D engine', 'Starting up')
(here / 'beast-stage-single.html').write_text(out, encoding='utf-8')
print('wrote beast-stage-single.html', len(out.encode()) // 1024, 'KB')
