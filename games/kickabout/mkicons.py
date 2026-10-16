from PIL import Image,ImageDraw,ImageFont
import math
def art(W,H,pad=0):
    im=Image.new('RGB',(W,H),'#4fc25a');d=ImageDraw.Draw(im)
    for i in range(0,H,max(1,H//8)):
        if (i//max(1,H//8))%2: d.rectangle([0,i,W,i+H//8],fill='#44b14f')
    lw=max(2,W//80)
    d.ellipse([W/2-W*.22,H/2-W*.22,W/2+W*.22,H/2+W*.22],outline='white',width=lw)
    d.line([0,H/2,W,H/2],fill='white',width=lw)
    r=min(W,H)*.2*(1-pad)
    cx,cy=W*.5,H*.5
    d.ellipse([cx-r+r*.15,cy-r+r*.3,cx+r+r*.15,cy+r+r*.3],fill=(30,90,30))
    d.ellipse([cx-r,cy-r,cx+r,cy+r],fill='white',outline='#13223a',width=max(2,int(r*.08)))
    for k in range(5):
        a=k*2*math.pi/5-math.pi/2;px,py=cx+math.cos(a)*r*.68,cy+math.sin(a)*r*.68
        d.ellipse([px-r*.2,py-r*.2,px+r*.2,py+r*.2],fill='#13223a')
    d.regular_polygon((cx,cy,r*.28),5,fill='#13223a')
    return im
for s,n,p in [(192,'icon-192',0),(512,'icon-512',0),(512,'icon-maskable-512',.3),(180,'apple-touch-icon',0),(32,'favicon-32',0)]:
    art(s,s,p).save(f'icons/{n}.png')
c=art(800,450)
d=ImageDraw.Draw(c)
try: f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',84)
except: f=ImageFont.load_default()
for dx,dy,col in [(4,5,'#13223a'),(0,0,'white')]:
    d.text((400+dx,90+dy),'KICKABOUT',font=f,fill=col,anchor='mm')
for i,(x,y,col) in enumerate([(200,330,'#1e7bff'),(600,120+200,'#ff7a1a'),(290,250,'#1e7bff'),(520,230,'#ff7a1a')]):
    d.ellipse([x-24,y-16,x+30,y+22],fill=(30,90,30));d.ellipse([x-22,y-22,x+22,y+22],fill=col);d.ellipse([x-12,y-12,x+12,y+12],fill='#f2c497')
c.save('/tmp/kickabout-card.webp',quality=88)
art(192,192).save('/tmp/kickabout-icon.png')
