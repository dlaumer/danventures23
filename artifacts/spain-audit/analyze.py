import json,csv,collections
from pathlib import Path
from email.utils import parsedate_to_datetime
from datetime import datetime,timedelta
p=Path('artifacts/spain-audit')
a={int(r['id']):r for r in csv.DictReader(open('artifacts/three-years/country-audit.csv',encoding='utf-8'))}
rows=[]
for f in json.load(open(p/'locations.json',encoding='utf-8'))['features']:
 q=f['properties'];s=q.get('travel_date')
 if not s or q.get('pointtype')!='sleep':continue
 try:dt=parsedate_to_datetime(s)
 except:dt=datetime.fromisoformat(s.replace('Z','+00:00'))
 day=(dt+timedelta(hours=2)).date().isoformat()
 if day>='2025-10-01':continue
 r=a.get(q['id'],{})
 rows.append(dict(id=q['id'],date=day,name=q['name'],category=q['sleepcategory'],nights=q['nonights'] or 0,website_nights=q['nonights'] or 1,country=r.get('country','?'),method=r.get('method'),lng=f['geometry']['coordinates'][0],lat=f['geometry']['coordinates'][1]))
sp=[r for r in rows if r['country']=='Spain']
for r in sp:print(r)
print('SPAIN',sum(r['nights'] for r in sp),sum(r['website_nights'] for r in sp))
for key in ['method','category']:
 c=collections.Counter()
 for r in sp:c[r[key]]+=r['website_nights']
 print(key,dict(c))
c=collections.Counter()
for r in rows:c[r['country']]+=r['website_nights']
print('COUNTRIES',dict(c),'TOTAL',sum(c.values()))
with (p/'first-two-years.json').open('w',encoding='utf-8') as f:json.dump(rows,f,indent=2)
