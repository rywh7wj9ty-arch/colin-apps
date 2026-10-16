from PIL import Image, ImageDraw, ImageFilter
import math
def icon(n):
    im=Image.new('RGB',(n,n));d=ImageDraw.Draw(im)
    for y in range(n):
        t=y/n; c=(int(40+ (230-40)*t**1.6),int(50+(150-50)*t**1.4),int(130+(170-130)*t)); d.line([(0,y),(n,y)],fill=c)
    g=Image.new('L',(n,n),0);gd=ImageDraw.Draw(g)
    # island silhouette
    isl=Image.new('RGBA',(n,n),(0,0,0,0));idr=ImageDraw.Draw(isl)
    idr.polygon([(n*.18,n*.74),(n*.82,n*.74),(n*.62,n*.9),(n*.5,n*.97),(n*.4,n*.9)],fill=(70,60,120,255))
    idr.rounded_rectangle([n*.16,n*.71,n*.84,n*.77],radius=n*.03,fill=(140,220,150,255))
    glow=Image.new('RGBA',(n,n),(0,0,0,0));gd=ImageDraw.Draw(glow)
    cx,cy=n*.5,n*.46
    for r,a in [(n*.36,40),(n*.24,80),(n*.15,150)]:
        gd.ellipse([cx-r,cy-r,cx+r,cy+r],fill=(255,225,170,a))
    glow=glow.filter(ImageFilter.GaussianBlur(n*.05))
    im=im.convert('RGBA');im.alpha_composite(glow);im.alpha_composite(isl)
    d=ImageDraw.Draw(im); r=n*.085
    d.ellipse([cx-r,cy-r*1.1,cx+r,cy+r*1.1],fill=(255,252,240,255))
    for i in range(14):
        a=i*2.4; x=n*(.15+.7*((i*37)%100)/100); y=n*(.08+.3*((i*53)%100)/100); s=n*.006+ (i%3)*n*.003
        d.ellipse([x-s,y-s,x+s,y+s],fill=(255,255,255,200))
    return im.convert('RGB')
for s in (192,512,180): icon(s).save('icon-%d.png'%s)
icon(192).save('/workspace/lumina-drift-icon-192.png')
