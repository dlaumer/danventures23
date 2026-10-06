from pathlib import Path
import json,math,zipfile,re
from PIL import Image,ImageDraw,ImageFont
P=Path(__file__).parent; OUT=P/'maps'; S=2; SIZE=1080
LAND='#F8F9F3'; VISITED='#DCE7D5'; WATER='#EEF4F2'; EDGE='#B6C7B6'; GREEN='#355B3D'; BLUE='#438DA7'; AIR='#B87962'; INK='#203B2B'; MUTED='#75877B'
constants=(P.parents[1]/'frontend'/'src'/'constants.ts').read_text(encoding='utf-8')
color_block=constants.split('export const transportColors:')[1].split('};',1)[0]
free_block=constants.split('export const freeTransportModes = new Set([')[1].split(']);',1)[0]
FREE_MODES=set(re.findall(r'"(\w+)"',free_block))
COLORS=dict(re.findall(r'(\w+):\s*"(#[0-9a-fA-F]+)"',color_block))
world=json.loads((OUT/'countries.geojson').read_text(encoding='utf-8'))['features']
legs=json.loads((P/'legs.json').read_text(encoding='utf-8'))['features']
fontpath=P/'fonts'/'BreeSerif-Regular.ttf'
def font(n,serif=False):return ImageFont.truetype(str(fontpath) if serif else 'C:/Windows/Fonts/calibrib.ttf',round(n*S))
def text(im,xy,s,n=25,color=INK,anchor='mm',serif=False,halo=False):
 ImageDraw.Draw(im).text(tuple(v*S for v in xy),s,font=font(n,serif),fill=color,anchor=anchor,stroke_width=3*S if halo else 0,stroke_fill=WATER)
def merc(lat):return math.degrees(math.log(math.tan(math.pi/4+math.radians(max(-85,min(85,lat)))/2)))
class Map:
 def __init__(self,box,bounds):
  self.box=box;self.bounds=bounds; w,e=bounds[0],bounds[2];s,n=merc(bounds[1]),merc(bounds[3]);x,y,r,b=box
  self.k=min((r-x)/(e-w),(b-y)/(n-s)); self.cx=(x+r)/2;self.cy=(y+b)/2;self.mx=(w+e)/2;self.my=(n+s)/2
 def p(self,lon,lat):return ((self.cx+(lon-self.mx)*self.k)*S,(self.cy-(merc(lat)-self.my)*self.k)*S)
 def inside(self,c):return self.bounds[0]<=c[0]<=self.bounds[2] and self.bounds[1]<=c[1]<=self.bounds[3]
 def label(self,im,lon,lat,name,n=23,col=MUTED):
  x,y=self.p(lon,lat);text(im,(x/S,y/S),name,n,col,halo=True)
 def city(self,im,lon,lat,name,dx=10,dy=0,anchor='lm'):
  x,y=self.p(lon,lat);d=ImageDraw.Draw(im);d.ellipse((x-5*S,y-5*S,x+5*S,y+5*S),fill=GREEN,outline='white',width=2*S)
  text(im,(x/S+dx,y/S+dy),name,24,INK,anchor=anchor,halo=True)
def dashed(d,points,color,width=2,dash=8,gap=6):
 phase=0
 for a,b in zip(points,points[1:]):
  dist=math.dist(a,b)
  if not dist:continue
  pos=0
  while pos<dist:
   period=(dash+gap)*S; rem=period-phase;step=min(dist-pos,rem)
   if phase<dash*S:
    step=min(step,dash*S-phase);u=pos/dist;v=(pos+step)/dist
    d.line((a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,a[0]+(b[0]-a[0])*v,a[1]+(b[1]-a[1])*v),fill=color,width=width*S)
   pos+=max(step,.001);phase=(phase+step)%period

def basemap(im,m,visited):
 layer=Image.new('RGB',im.size,WATER);d=ImageDraw.Draw(layer)
 for f in world:
  geom=f['geometry']; polys=[geom['coordinates']] if geom['type']=='Polygon' else geom['coordinates']; name=f['properties'].get('name') or f['properties'].get('ADMIN')
  for poly in polys:
   ring=poly[0];xs=[c[0] for c in ring];ys=[c[1] for c in ring]
   if max(xs)<m.bounds[0]-4 or min(xs)>m.bounds[2]+4 or max(ys)<m.bounds[1]-3 or min(ys)>m.bounds[3]+3:continue
   pts=[m.p(*c[:2]) for c in ring];d.polygon(pts,fill=VISITED if name in visited else LAND);d.line(pts,fill=EDGE,width=S)
   for hole in poly[1:]:d.polygon([m.p(*c[:2]) for c in hole],fill=WATER)
 # Draw only flights whose endpoints are inside this regional view.
 # Paid routes are drawn first; free routes and their white outlines cover them.
 for free_layer in [False,True]:
  for f in legs:
   q=f['properties'];mode=q.get('transport')
   if (mode in FREE_MODES)!=free_layer:continue
   kind='air' if mode=='plane' else 'sea' if mode in ['boat','ferry'] else 'land'
   lines=f['geometry']['coordinates']
   if f['geometry']['type']=='LineString':lines=[lines]
   if not lines:continue
   if kind=='air' and not(m.inside(lines[0][0]) and m.inside(lines[-1][-1])):continue
   for line in lines:
    if len(line)<2:continue
    xs=[c[0] for c in line];ys=[c[1] for c in line]
    if max(xs)<m.bounds[0] or min(xs)>m.bounds[2] or max(ys)<m.bounds[1] or min(ys)>m.bounds[3]:continue
    pts=[m.p(*c[:2]) for c in line]
    if kind=='air':dashed(d,pts,COLORS[mode],2,7,6)
    else:
     d.line(pts,fill='white',width=5*S,joint='curve');d.line(pts,fill=COLORS.get(mode,GREEN),width=3*S,joint='curve')
 crop=tuple(round(x*S) for x in m.box);im.paste(layer.crop(crop),(crop[0],crop[1]))

def canvas(title):
 im=Image.new('RGB',(SIZE*S,SIZE*S),'white');text(im,(540,72),title,58,INK,serif=True);return im

def footer(im):
 d=ImageDraw.Draw(im)
 modes=[('car','Car'),('truck','Truck'),('boat','Boat'),('friends','Friends'),('foot','Walking'),('bike','Bike'),('bus','Bus'),('train','Train'),('ferry','Ferry'),('taxi','Taxi/BlaBlaCar'),('rentalCar','Rental car'),('plane','Flight')]
 for i,(mode,label) in enumerate(modes):
  x=34+(i%6)*174;y=1005+(i//6)*31;col=COLORS[mode]
  if mode=='plane':dashed(d,[(x*S,y*S),((x+30)*S,y*S)],col,3,6,4)
  else:d.line((x*S,y*S,(x+30)*S,y*S),fill=col,width=5*S)
  text(im,(x+38,y),label,19 if mode=='taxi' else 22,INK,anchor='lm')
 text(im,(540,1066),'Map: Natural Earth  ·  Routes: my trip log',15,MUTED)
def save(im,name):
 footer(im);im.resize((SIZE,SIZE),Image.Resampling.LANCZOS).save(OUT/name)

# Europe: Iceland is an inset; mainland map retains enough scale to see the route.
im=canvas('Europe');m=Map((30,135,1050,985),(-12,35,23,59))
basemap(im,m,{'Spain','Portugal','France','Switzerland','Germany','Belgium','Netherlands','Sweden','Czechia','Poland','Italy','Austria','Iceland'})
for args in [(-4,39.2,'SPAIN'),(-8.5,39.7,'PORTUGAL'),(1.5,46,'FRANCE'),(9.7,51.3,'GERMANY'),(20.4,52,'POLAND'),(16.4,49.4,'CZECHIA'),(14,46.8,'AUSTRIA'),(12.8,43.2,'ITALY'),(17.5,57.4,'SWEDEN')]:m.label(im,*args)
for args in [(-4.4877,48.3775,'Brest',-14,-12,'rm'),(-8.846,42.122,'Baiona',-12,-8,'rm'),(2.148,41.410,'Barcelona',10,18,'lm'),(13.45,52.55,'Berlin',12,-10,'lm'),(13.01,55.59,'Malmö',14,-3,'lm')]:m.city(im,*args)
# Iceland inset placed in the untravelled north-west corner.
box=(53,157,360,363);d=ImageDraw.Draw(im);d.rounded_rectangle(tuple(v*S for v in (45,149,368,371)),radius=10*S,fill='white',outline=EDGE,width=S)
mi=Map(box,(-25,63, -12,67.5));basemap(im,mi,{'Iceland'});text(im,(205,176),'ICELAND',22,MUTED)
mi.city(im,-21.94,64.146,'Reykjavík',9,16,'lm')
save(im,'05-europe.png')

im=canvas('Africa & the Canary Islands');m=Map((30,135,1050,985),(-28,12,-0.5,37))
basemap(im,m,{'Spain','Morocco','Western Sahara','Mauritania','Senegal','Cabo Verde'})
for args in [(-5,31.5,'MOROCCO'),(-10,25.5,'WESTERN'),(-10,24.3,'SAHARA'),(-9,19.5,'MAURITANIA'),(-13.5,14,'SENEGAL')]:m.label(im,*args)
m.label(im,-22,27,'ATLANTIC',24,'#9AABA7');m.label(im,-22,25.8,'OCEAN',24,'#9AABA7')
for args in [(-5.314,35.89,'Ceuta',12,-10,'lm'),(-15.916,23.735,'Dakhla',14,0,'lm'),(-15.99,18.085,'Nouakchott',14,0,'lm'),(-17.36,14.75,'Dakar',-12,14,'rm'),(-24.995,16.887,'Mindelo',-10,17,'rm')]:m.city(im,*args)
m.label(im,-23.8,15.2,'CABO VERDE',23,GREEN)
m.label(im,-17,30.4,'CANARY ISLANDS',27,GREEN)
# Island names sit beside their actual outlines, with small unobtrusive leaders.
for lon,lat,name,dx,dy,anchor in [(-16.244,28.467,'Tenerife',-15,-22,'rm'),(-15.429,28.129,'Gran Canaria',13,30,'lm'),(-13.54,28.96,'Lanzarote',17,-5,'lm')]:
 x,y=m.p(lon,lat);text(im,(x/S+dx,y/S+dy),name,21,INK,anchor=anchor,halo=True)
# A larger island inset reveals the individual Canarian routes.
d=ImageDraw.Draw(im);d.rounded_rectangle(tuple(v*S for v in (53,155,472,337)),radius=10*S,fill='white',outline=EDGE,width=S)
mc=Map((61,182,464,329),(-18.4,27.4,-13,29.7));basemap(im,mc,{'Spain'})
text(im,(263,170),'CANARY ISLANDS · DETAIL',18,MUTED)
for lon,lat,name in [(-17.45,27.65,'La Gomera'),(-16.6,29.1,'Tenerife'),(-15.55,27.55,'Gran Canaria'),(-14.3,27.8,'Fuerteventura'),(-13.65,29.45,'Lanzarote')]:mc.label(im,lon,lat,name,15,INK)
save(im,'06-africa-canaries.png')

im=canvas('South America');m=Map((30,135,1050,985),(-85,-57,-32,14))
basemap(im,m,{'Colombia','Venezuela','Brazil','Ecuador','Peru','Bolivia','Chile','Argentina'})
for args in [(-70,6.5,'COLOMBIA'),(-63,8.5,'VENEZUELA'),(-53,-9,'BRAZIL'),(-66,-20,'BOLIVIA'),(-61,-38,'ARGENTINA'),(-75,-34,'CHILE'),(-80.5,-3,'ECUADOR'),(-76,-16,'PERU')]:m.label(im,*args)
m.label(im,-82,-29,'PACIFIC',23,'#9AABA7');m.label(im,-82,-31.5,'OCEAN',23,'#9AABA7');m.label(im,-43,-36,'ATLANTIC',23,'#9AABA7');m.label(im,-43,-38.5,'OCEAN',23,'#9AABA7')
for args in [(-74.0965,4.642,'Bogotá',-13,-12,'rm'),(-66.911,10.496,'Caracas',12,-14,'lm'),(-60.027,-3.138,'Manaus',12,0,'lm'),(-77.036,-12.060,'Lima',-12,0,'rm'),(-71.965,-13.526,'Cusco',12,-5,'lm'),(-70.63,-33.44,'Santiago',15,0,'lm'),(-68.298,-54.799,'Ushuaia',15,10,'lm')]:m.city(im,*args)
save(im,'07-south-america.png')
preview=Image.new('RGB',(1620,540),'#E5EBE4')
files=['05-europe.png','06-africa-canaries.png','07-south-america.png']
for i,name in enumerate(files):preview.paste(Image.open(OUT/name).resize((530,530),Image.Resampling.LANCZOS),(540*i+5,5))
preview.save(OUT/'maps-preview.jpg',quality=94)
legend=canvas('Transport colours');d=ImageDraw.Draw(legend)
modes=[('car','Car'),('truck','Truck'),('boat','Boat'),('friends','Friends'),('foot','Walking'),('bike','Bike'),('bus','Bus'),('train','Train'),('ferry','Ferry'),('taxi','Taxi/BlaBlaCar'),('rentalCar','Rental car'),('plane','Flight')]
for i,(mode,label) in enumerate(modes):
 col=i//6;row=i%6;x=90+col*505;y=250+row*132
 if mode=='plane':dashed(d,[(x*S,y*S),((x+110)*S,y*S)],COLORS[mode],8,15,10)
 else:d.line((x*S,y*S,(x+110)*S,y*S),fill=COLORS[mode],width=10*S)
 text(legend,(x+145,y),label,34 if mode=='taxi' else 43,INK,anchor='lm',serif=True)
legend.resize((SIZE,SIZE),Image.Resampling.LANCZOS).save(OUT/'08-transport-legend.png')
files.append('08-transport-legend.png')
with zipfile.ZipFile(OUT/'three-trip-maps.zip','w',zipfile.ZIP_DEFLATED) as z:
 for f in files:z.write(OUT/f,f)
(OUT/'map-notes.txt').write_text('Maps use the same 30 September 2026 database snapshot as the statistics slides, through 29 September 2026. Source geometry: legs.json, simplified by the API at 0.01 degrees. Each transport mode uses its exact colour from frontend/src/constants.ts on the original website. Paid transport is drawn first, then all free transport (car, truck, boat, friends, bike and foot) on top, using the website classification. Flights are dashed and shown only when both endpoints fall inside a regional view. Europe uses a separately scaled Iceland inset; the Africa slide includes a Canary Islands detail inset. Boundaries: Natural Earth, via github.com/datasets/geo-countries. Country colouring provides context, not a country-count definition. Western Sahara is labelled separately. Routes show the stored geometry; they are not reconstructed travel paths.\n',encoding='utf-8')
print('Created three map slides and a transport legend.')

