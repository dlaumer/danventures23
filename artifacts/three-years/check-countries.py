import json,collections
from pathlib import Path
p=Path('artifacts/three-years'); d=json.loads((p/'locations.json').read_text(encoding='utf-8'))
for f in d['features']:
 f['properties']['pointtype']='sleep';f['properties']['nonights']=1
(p/'all-points-for-country.json').write_text(json.dumps(d),encoding='utf-8')
q=json.loads((p/'locations.json').read_text(encoding='utf-8'))
print('Madrid zero-night record',next(f['properties'] for f in q['features'] if f['properties']['id']==1134))
