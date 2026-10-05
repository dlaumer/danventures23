import json, collections
from email.utils import parsedate_to_datetime
from datetime import datetime
from pathlib import Path
p=Path('artifacts/three-years')
for name in ['locations','legs']:
 d=json.loads((p/(name+'.json')).read_text(encoding='utf-8'))['features'];print(name,len(d));print('sample',d[0]['properties'])
 dates=sorted(str(x['properties'].get('travel_date')) for x in d)
 parsed=[]
 for x in d:
  s=x['properties'].get('travel_date')
  if s:
   try: dt=datetime.fromisoformat(s.replace('Z','+00:00'))
   except: dt=parsedate_to_datetime(s)
   parsed.append((dt.isoformat(),x['properties'].get('id'),x['properties'].get('nonights')))
 print('date bounds',sorted(parsed)[:2],sorted(parsed)[-5:])
 if name=='locations':
  counts=collections.Counter(); costs=collections.defaultdict(list)
  for f in d:
   q=f['properties']
   if q.get('pointtype')=='sleep':
    counts[q.get('sleepcategory')]+=q.get('nonights') or 1
    costs[q.get('sleepcategory')].append(q.get('sleepcost'))
  print('nights',counts,'total',sum(counts.values()))
  print('cost completeness',{k:dict(collections.Counter('missing' if x is None else 'zero' if x==0 else 'paid' for x in v)) for k,v in costs.items()})

