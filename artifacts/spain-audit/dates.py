import json,csv,collections
from email.utils import parsedate_to_datetime
from datetime import timedelta
for file in ['artifacts/spain-audit/locations.json','hosted-locations-current.json','hosted-locations.json','artifacts/three-years/locations.json']:
 d=json.load(open(file,encoding='utf-8')); rs=[]
 for f in d['features']:
  q=f['properties']; s=q.get('travel_date')
  if not s or q.get('pointtype')!='sleep':continue
  day=(parsedate_to_datetime(s)+timedelta(hours=2)).date().isoformat()
  if '2025-09-20'<=day<='2025-10-05':print(file,day,q['id'],q['name'],q['nonights'])
  if day<'2025-09-27':rs.append(q)
 c=collections.Counter()
 for q in rs:c[q['sleepcategory']]+=q.get('nonights') or 0
 print(file,'anniversary sum',sum(c.values()),dict(c))
