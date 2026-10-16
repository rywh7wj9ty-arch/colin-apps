# icons + arcade card rendered from real in-game screenshots (tools/shots.cjs)
from PIL import Image, ImageDraw, ImageFont, ImageFilter
S='/tmp/cubby-shots/'
im=Image.open(S+'hero-closeup.png').convert('RGB'); W,H=im.size; k=W/1024
cx,cy,sz=int(512*k),int(440*k),int(330*k)
ic=im.crop((cx-sz//2,cy-sz//2,cx+sz//2,cy+sz//2))
for n,s in [('apple-touch-icon',180),('icon-192',192),('icon-512',512),('favicon-32',32)]: ic.resize((s,s),Image.LANCZOS).save(f'icons/{n}.png')
m=Image.new('RGB',(512,512),(143,211,240)); m.paste(ic.resize((410,410),Image.LANCZOS),(51,51)); m.save('icons/icon-maskable-512.png')
ic.resize((192,192),Image.LANCZOS).save('/workspace/cubby-isle-icon-192.png')
# arcade card 960x600
src=Image.open(S+'card-src.png').convert('RGB'); w,h=src.size
r=960/600; ch=int(w/r); top=int((h-ch)*0.55); card=src.crop((0,top,w,top+ch)).resize((960,600),Image.LANCZOS)
d=ImageDraw.Draw(card,'RGBA'); d.rectangle([0,0,960,190],fill=(0,0,0,0))
grad=Image.new('L',(1,600)); [grad.putpixel((0,y),int(max(0,140-y*0.9))) for y in range(600)]
card.paste(Image.new('RGB',(960,600),(60,40,90)),(0,0),grad.resize((960,600)))
f=ImageFont.truetype('fredoka.ttf',96); f.set_variation_by_axes([700]) if hasattr(f,'set_variation_by_axes') else None
def t(x,y,s,fill,sh):
    d=ImageDraw.Draw(card); d.text((x,y+7),s,font=f,fill=sh); d.text((x,y),s,font=f,fill=fill)
t(40,24,'Cubby',(255,255,255),(111,191,143)); wd=ImageDraw.Draw(card).textlength('Cubby ',font=f); t(40+wd,24,'Isle',(255,226,122),(229,154,74))
card.save('/workspace/cubby-isle-card.webp','WEBP',quality=82)
import os; print(os.path.getsize('/workspace/cubby-isle-card.webp'))
