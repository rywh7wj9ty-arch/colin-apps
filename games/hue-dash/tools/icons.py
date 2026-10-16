from PIL import Image, ImageDraw, ImageFilter
import random
def icon(sz, pad=0):
    S=1024; im=Image.new('RGB',(S,S),(246,238,232))
    sm=Image.new('RGBA',(S,S),(0,0,0,0)); sd=ImageDraw.Draw(sm); random.seed(3)
    for i in range(70):
        t=i/70; x=120+t*520+random.uniform(-30,30); y=640-t*170+random.uniform(-50,50); r=60+t*90*random.uniform(.6,1.1)
        c=(214,36,110,200) if t>0.35 else (160,150,160,120)
        sd.ellipse([x-r,y-r,x+r,y+r],fill=c)
    sm=sm.filter(ImageFilter.GaussianBlur(18)); im.paste(sm,(0,0),sm); d=ImageDraw.Draw(im)
    d.polygon([(560,700),(860,660),(866,690),(566,730)],fill=(255,255,255)); d.polygon([(600,705),(820,676),(822,688),(602,717)],fill=(226,162,29))
    d.rectangle([640,560,680,690],fill=(205,198,202)); d.rectangle([730,550,770,680],fill=(205,198,202))
    d.rectangle([620,400,790,570],fill=(214,36,110)); d.rectangle([650,260,790,400],fill=(250,247,246))
    d.rectangle([640,220,800,275],fill=(214,36,110)); d.rectangle([780,250,860,272],fill=(214,36,110))
    d.rectangle([790,420,830,540],fill=(214,36,110))
    if pad:
        im2=Image.new('RGB',(S,S),(246,238,232)); im2.paste(im.resize((int(S*.8),int(S*.8))),(int(S*.1),int(S*.1))); im=im2
    return im.resize((sz,sz),Image.LANCZOS)
icon(180).save('icons/apple-touch-icon.png'); icon(192).save('icons/icon-192.png'); icon(512).save('icons/icon-512.png')
icon(512,1).save('icons/icon-maskable-512.png'); icon(32).save('icons/favicon-32.png'); print('icons ok')
