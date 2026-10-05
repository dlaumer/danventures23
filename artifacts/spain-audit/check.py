exec(open('artifacts/spain-audit/compare.py').read().split("for r in sp:\n q=old.get")[0])
print('Old backup same Spain IDs sum',sum(int(old[r['id']]['nonights']) for r in sp if r['id'] in old))
from datetime import date,timedelta
nightmap=collections.defaultdict(list)
for r in sp:
 for i in range(r['nights']): nightmap[(date.fromisoformat(r['date'])+timedelta(days=i)).isoformat()].append(r['id'])
print('Spain overlapping nights',[(k,v) for k,v in nightmap.items() if len(v)>1])
print('Manual stays count',sum(r['method']=='manual' for r in sp))
print('Manual 3 long stays',[(r['name'],r['date'],r['nights']) for r in sp if r['method']=='manual' and r['nights']>=10])
