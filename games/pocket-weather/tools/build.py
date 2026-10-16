#!/usr/bin/env python3
"""Build the deploy folder (runtime files only) with a version stamped into every cache-busting URL, then zip it."""
import json, os, shutil, sys, datetime
SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(SRC, 'dist')
version = sys.argv[1] if len(sys.argv) > 1 else datetime.datetime.now().strftime('%Y%m%d%H%M')
FILES = ['index.html', 'style.css', 'logic.js', 'levels.js', 'game.js', 'art.js', 'audio.js', 'sw.js', 'manifest.webmanifest',
         'vendor/three.module.js', 'vendor/LICENSE',
         'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/favicon-32.png']
VERSIONED = ['style.css', 'logic.js', 'levels.js', 'game.js', 'art.js', 'audio.js', 'manifest.webmanifest']
if os.path.isdir(DIST): shutil.rmtree(DIST)
for f in FILES:
    src = os.path.join(SRC, f); dst = os.path.join(DIST, f)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if f.endswith(('.html', '.css', '.js', '.webmanifest')) and not f.startswith('vendor/'):
        s = open(src, encoding='utf-8').read().replace('__BUILD__', version)
        if f == 'sw.js':
            assets = ['./', 'index.html'] + [x + '?v=' + version for x in VERSIONED] + [x for x in FILES if x not in VERSIONED and x not in ('index.html', 'sw.js', 'vendor/LICENSE')]
            s = s.replace('__ASSETS__', json.dumps(assets, indent=2))
        assert '__BUILD__' not in s and '__ASSETS__' not in s, f
        open(dst, 'w', encoding='utf-8').write(s)
    else:
        shutil.copyfile(src, dst)
out = shutil.make_archive(os.path.join(os.path.dirname(SRC), os.path.basename(SRC)), 'zip', DIST)
print('built', version, '->', DIST, '| zip:', out)
