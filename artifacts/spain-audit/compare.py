import zipfile,re,json,collections
from pathlib import Path
with zipfile.ZipFile('qgisproject.qgz') as z:
 for n in z.namelist():
  if n.endswith('.qgs'):
   s=z.read(n).decode(); print('QGIS sources',re.findall(r'<datasource>(.*?)</datasource>',s));print('QGIS layers',re.findall(r'<layername>(.*?)</layername>',s))
rows=json.load(open('artifacts/spain-audit/first-two-years.json'))
sp=[r for r in rows if r['country']=='Spain']
for title,test in [('Canaries',lambda r:r['lng'] < -13),('Mainland',lambda r:r['lng']>-13 and r['lat']>36),('Ceuta',lambda r:r['lat']<36 and r['lng']>-13)]:
 rr=[r for r in sp if test(r)]; print(title,sum(r['nights'] for r in rr));c=collections.Counter()
 for r in rr:c[r['category']]+=r['nights']
 print(dict(c))
# Compare backup original source night values against live records
s=Path('danventures-backup.sql').read_text(encoding='utf-8');start=s.index('COPY public.locations ');block=s[start:].split('\\.')[0].splitlines();cols=block[0].split('(',1)[1].split(')',1)[0].split(', ');old={}
for l in block[1:]:
 vals=l.split('\t');r=dict(zip(cols,vals));old[int(r['id'])]=r
for r in sp:
 q=old.get(r['id'])
 if q and q['nonights']!=str(r['nights']): print('CHANGED',r['id'],r['name'],q['nonights'],r['nights'])
print('backup rows',len(old)); print('zero',[(r['id'],r['name']) for r in rows if r['nights']==0])
