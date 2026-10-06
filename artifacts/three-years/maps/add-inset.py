from pathlib import Path
p=Path('artifacts/three-years/create-maps.py')
s=p.read_text(encoding='utf-8-sig')
s=s.replace("save(im,'06-africa-canaries.png')", """# A larger island inset reveals the individual Canarian routes.
d=ImageDraw.Draw(im);d.rounded_rectangle(tuple(v*S for v in (53,155,472,337)),radius=10*S,fill='white',outline=EDGE,width=S)
mc=Map((61,182,464,329),(-18.4,27.4,-13,29.7));basemap(im,mc,{'Spain'})
text(im,(263,170),'CANARY ISLANDS · DETAIL',18,MUTED)
for lon,lat,name in [(-17.45,27.65,'La Gomera'),(-16.6,29.1,'Tenerife'),(-15.55,27.55,'Gran Canaria'),(-14.3,27.8,'Fuerteventura'),(-13.65,29.45,'Lanzarote')]:mc.label(im,lon,lat,name,15,INK)
save(im,'06-africa-canaries.png')""")
s=s.replace('Europe uses a separately scaled Iceland inset.', 'Europe uses a separately scaled Iceland inset; the Africa slide includes a Canary Islands detail inset.')
p.write_text(s,encoding='utf-8')
