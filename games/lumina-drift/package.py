import shutil,os
D='/workspace/lumina-drift';O='/workspace/lumina-drift-deploy'
shutil.rmtree(O,ignore_errors=True);os.makedirs(O)
for f in ['index.html','sw.js','manifest.json','icon-192.png','icon-512.png','icon-180.png']: shutil.copy(os.path.join(D,f),O)
open(os.path.join(O,'_headers'),'w').write('/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n')
if os.path.exists('/workspace/lumina-drift.zip'): os.remove('/workspace/lumina-drift.zip')
shutil.make_archive('/workspace/lumina-drift','zip',O)
import zipfile;print(zipfile.ZipFile('/workspace/lumina-drift.zip').namelist())
