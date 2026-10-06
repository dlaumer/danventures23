import json,collections,importlib.util
from pathlib import Path
p=Path('artifacts/three-years')
d=json.loads((p/'legs.json').read_text(encoding='utf-8'))
print('Geometry types',collections.Counter(f['geometry']['type'] for f in d['features']))
for region,b in [('Europe',(-27,35,30,70)),('Africa',(-27,10,0,36)),('South America',(-85,-57,-30,14))]:
 counts=collections.Counter();ends=[]
 for f in d['features']:
  g=f['geometry']; lines=[g['coordinates']] if g['type']=='LineString' else g['coordinates'];q=f['properties']
  if any(b[0]<=c[0]<=b[2] and b[1]<=c[1]<=b[3] for l in lines for c in l):
   counts[q['transport']]+=1
 print(region,dict(counts))
print('packages',{n:bool(importlib.util.find_spec(n)) for n in ['PIL','pyproj','shapely','matplotlib','requests']})
