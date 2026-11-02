# Pone la misma versión (?v=...) a todos los archivos JS y CSS, para que el celular nunca mezcle archivos
# viejos (de su caché) con nuevos. Correr antes de cada subida: python3 version.py
import re, glob, time
v = time.strftime("%Y%m%d%H%M")
for f in ["index.html"] + glob.glob("js/*.js"):
    s = open(f).read()
    s2 = re.sub(r'((?:from |import\()\s*"\./[\w-]+\.js)(?:\?v=\w+)?"', rf'\1?v={v}"', s)
    s2 = re.sub(r'((?:src|href)="(?:js|css)/[\w-]+\.(?:js|css))(?:\?v=\w+)?"', rf'\1?v={v}"', s2)
    if s2 != s: open(f, "w").write(s2)
print("versión", v)
