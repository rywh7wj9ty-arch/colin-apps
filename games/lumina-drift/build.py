import re,time,os,json
D=os.path.dirname(os.path.abspath(__file__));S=os.path.join(D,'src')
r=lambda f:open(os.path.join(S,f)).read()
h=r('shell.html')
for k,f in [('CORE','core.js'),('AUDIO','audio.js'),('ART','art.js'),('GAME','game.js')]:
    h=h.replace('/*%s*/'%k,r(f))
open(os.path.join(D,'index.html'),'w').write(h)
build=time.strftime('%Y%m%d%H%M')
sw=open(os.path.join(S,'sw.js')).read().replace('__BUILD__',build)
open(os.path.join(D,'sw.js'),'w').write(sw)
print('built',build,len(h))
