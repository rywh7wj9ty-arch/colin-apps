import shutil, os, time
V = time.strftime('%Y%m%d%H%M')
src = '/workspace/dig-buddies'; dst = '/workspace/dig-buddies-deploy'
shutil.rmtree(dst, ignore_errors=True); os.makedirs(dst + '/vendor/three'); os.makedirs(dst + '/icons')
for f in ['index.html', 'style.css', 'game.js', 'logic.js', 'levels.js', 'audio.js', 'render.js', 'sw.js', 'manifest.webmanifest']:
    open(f'{dst}/{f}', 'w').write(open(f'{src}/{f}').read().replace('__V__', V))
shutil.copy(f'{src}/fredoka.ttf', dst)
for f in ['three.module.js', 'LICENSE']: shutil.copy(f'{src}/vendor/three/{f}', dst + '/vendor/three/')
for f in os.listdir(src + '/icons'): shutil.copy(f'{src}/icons/{f}', dst + '/icons/')
open(dst + '/_headers', 'w').write('/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/\n  Cache-Control: no-cache\n')
z = shutil.make_archive('/workspace/dig-buddies', 'zip', dst)
print('built', V, z)
