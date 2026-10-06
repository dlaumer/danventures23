from pathlib import Path
p=Path('artifacts/three-years/create-maps.py')
s=p.read_text(encoding='utf-8-sig').replace('import json,math,zipfile','import json,math,zipfile,re')
s=s.replace("world=json.loads", "constants=(P.parents[1]/'frontend'/'src'/'constants.ts').read_text(encoding='utf-8')\ncolor_block=constants.split('export const transportColors:')[1].split('};',1)[0]\nCOLORS=dict(re.findall(r'(\\w+):\\s*\"(#[0-9a-fA-F]+)\"',color_block))\nworld=json.loads",1)
s=s.replace("(8.916,47.294,'Wald',-12,18,'rm'),",'')
s=s.replace("dashed(d,pts,AIR,2,7,6)","dashed(d,pts,COLORS[mode],2,7,6)")
s=s.replace("fill=GREEN if kind=='land' else BLUE,width=3*S", "fill=COLORS.get(mode,GREEN),width=3*S")
a=s.index('def footer(im):');b=s.index('def save(im,name):',a)
s=s[:a]+'''def footer(im):
 d=ImageDraw.Draw(im)
 modes=[('car','Car'),('truck','Truck'),('boat','Boat'),('friends','Friends'),('foot','Walking'),('bike','Bike'),('bus','Bus'),('train','Train'),('ferry','Ferry'),('taxi','Taxi'),('rentalCar','Rental car'),('plane','Flight')]
 for i,(mode,label) in enumerate(modes):
  x=34+(i%6)*174;y=1005+(i//6)*31;col=COLORS[mode]
  if mode=='plane':dashed(d,[(x*S,y*S),((x+30)*S,y*S)],col,3,6,4)
  else:d.line((x*S,y*S,(x+30)*S,y*S),fill=col,width=5*S)
  text(im,(x+38,y),label,22,INK,anchor='lm')
 text(im,(540,1066),'Map: Natural Earth  ·  Routes: my trip log',15,MUTED)
''' +s[b:]
s=s.replace('All recorded overland modes are green; boat and ferry are blue.', 'Each transport mode uses its exact colour from frontend/src/constants.ts on the original website.')
p.write_text(s,encoding='utf-8')
