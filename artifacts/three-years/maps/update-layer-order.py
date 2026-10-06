from pathlib import Path
p=Path('artifacts/three-years/create-maps.py')
s=p.read_text(encoding='utf-8')
s=s.replace("COLORS=dict(re.findall", "free_block=constants.split('export const freeTransportModes = new Set([')[1].split(']);',1)[0]\nFREE_MODES=set(re.findall(r'\"(\\w+)\"',free_block))\nCOLORS=dict(re.findall",1)
s=s.replace(" for kind in ['air','land','sea']:\n  for f in legs:\n   q=f['properties'];mode=q.get('transport');k='air' if mode=='plane' else 'sea' if mode in ['boat','ferry'] else 'land'\n   if k!=kind:continue", " # Paid routes are drawn first; free routes and their white outlines cover them.\n for free_layer in [False,True]:\n  for f in legs:\n   q=f['properties'];mode=q.get('transport')\n   if (mode in FREE_MODES)!=free_layer:continue\n   kind='air' if mode=='plane' else 'sea' if mode in ['boat','ferry'] else 'land'")
s=s.replace('Each transport mode uses its exact colour from frontend/src/constants.ts on the original website.', 'Each transport mode uses its exact colour from frontend/src/constants.ts on the original website. Paid transport is drawn first, then all free transport (car, truck, boat, friends, bike and foot) on top, using the website classification.')
p.write_text(s,encoding='utf-8')
