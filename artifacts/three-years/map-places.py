import json,re
fs=json.load(open('artifacts/three-years/locations.json',encoding='utf-8'))['features']
for region,pattern in [('Europe','Reyk|Brest|Baiona|Prag|Praha|Berlin|Wald|Stockholm|Malmo|Malmö|Wars|Paris|Amsterdam|Barcelona'),('Africa','Dakar|Nouak|Dakhla|Tanger|Ceuta|Mindelo|Praia|Las Palmas|Falkor'),('SA','Cartagena|Caracas|Manaus|Quito|Lima|Cusco|Santiago|Ushuaia|Buenos|Punta Arenas|La Paz|Bogot')]:
 print(region)
 seen=set()
 for f in fs:
  q=f['properties'];name=q.get('name') or ''
  if re.search(pattern,name,re.I) and name not in seen:
   seen.add(name);print(name,f['geometry']['coordinates'][:2])
