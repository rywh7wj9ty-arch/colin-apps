import sys,glob
from PIL import Image, ImageStat
for f in sorted(glob.glob(sys.argv[1]+'/*.png')):
    im=Image.open(f).convert('L'); st=ImageStat.Stat(im); h=im.histogram(); n=sum(h)
    print(f"{f.split('/')[-1]:22s} mean {st.mean[0]/255:.3f}  black<10: {sum(h[:10])/n*100:4.1f}%")
