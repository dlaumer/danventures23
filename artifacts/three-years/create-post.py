import json,csv,math,zipfile
from pathlib import Path
from collections import Counter
from PIL import Image,ImageDraw,ImageFont
P=Path(__file__).parent
S=2; W=1080
GREEN='#355B3D'; LIGHT='#98BD77'; BLUE='#568E9E'; INK='#15221A'; MUTED='#637267'
def font(n,serif=False): return ImageFont.truetype(str(P/'fonts'/'BreeSerif-Regular.ttf') if serif else 'C:/Windows/Fonts/calibrib.ttf',round(n*S))
def text(im,xy,s,n=30,fill=INK,anchor='la',serif=False): ImageDraw.Draw(im).text((xy[0]*S,xy[1]*S),s,font=font(n,serif),fill=fill,anchor=anchor)
def base(title,num,sub=None):
 im=Image.new('RGB',(W*S,W*S),'white');text(im,(540,80),title,58,anchor='mm',serif=True)
 if sub:text(im,(540,135),sub,28,MUTED,anchor='mm')
 return im
def save(im,name):
 im.resize((1080,1080),Image.Resampling.LANCZOS).save(P/name)
 return im

def donut(im,box,values,colors,width=90):
 d=ImageDraw.Draw(im);a=-90
 for val,col in zip(values,colors):
  b=a+360*val/sum(values);d.pieslice(tuple(v*S for v in box),a,b,fill=col);a=b
 d.ellipse(((box[0]+width)*S,(box[1]+width)*S,(box[2]-width)*S,(box[3]-width)*S),fill='white')
def fmt(n):return f'{round(n):,}'.replace(',','\u2019')
transport=json.loads((P/'transport.json').read_text(encoding='utf-8'))
t={x['transport']:x for x in transport}
km=sum(t[k]['distance_m'] for k in ['car','truck','boat'])/1000
loc=json.loads((P/'locations.json').read_text(encoding='utf-8'))['features'];n=Counter()
for f in loc:
 q=f['properties']
 if q.get('pointtype')=='sleep':n[q.get('sleepcategory')]+=max(0,q.get('nonights') or 0)
assert sum(n.values())==1090
countries=list(csv.DictReader((P/'countries.csv').open(encoding='utf-8')))
assert sum(int(x['nights']) for x in countries)==1090
count=sum(x['country'] not in ['At sea','Gibraltar'] for x in countries)
im=base('Three years of hitchhiking',1,'27 September 2023 — 29 September 2026')
for y,value,label in [(350,fmt(km),'km hitchhiked'),(600,fmt(t['car']['leg_count']),'car rides'),(850,str(count),'countries visited')]:
 text(im,(515,y),value,136,GREEN,anchor='rm',serif=True);text(im,(560,y+10),label,43,GREEN,anchor='lm',serif=True)
save(im,'01-three-years.png')
im=base('Hitchhiked distance',2)
donut(im,(210,280,930,1000),[t[k]['distance_m'] for k in ['car','truck','boat']],[GREEN,LIGHT,BLUE],170)
text(im,(570,610),fmt(km),76,GREEN,anchor='mm',serif=True);text(im,(570,682),'kilometres',34,MUTED,anchor='mm')
for x,y,label,val,col in [(930,968,'Cars',t['car']['distance_km'],GREEN),(130,380,'Trucks',t['truck']['distance_km'],GREEN),(405,205,'Boats',t['boat']['distance_km'],BLUE)]:
 text(im,(x,y),label,42,col,anchor='mm',serif=True);text(im,(x,y+53),fmt(val)+' km',39,col,anchor='mm',serif=True)
save(im,'02-distance.png')
labels=[('camping','Camping','#70354F'),('friends','Friends','#FFA754'),('boat','Boat','#BF6968'),('house','Invited','#985264'),('couchsurfing','Couchsurfing','#E78055'),('volunteering','Volunteering','#D0AD3E'),('hostel','Hostel','#478CC4'),('campingPaid','Paid camping','#7C985E'),('airbnb','Airbnb','#344D5D'),('nightbusNighttrain','Overnight transport','#A0AAB1')]
free=sum(n[k] for k in ['camping','friends','boat','house','couchsurfing','volunteering'])
im=base('Where I slept',3,fmt(sum(n.values()))+' recorded nights · '+fmt(free)+' in free accommodation')
donut(im,(25,285,615,875),[n[k] for k,_,_ in labels],[c for _,_,c in labels],136)
text(im,(320,550),fmt(sum(n.values())),78,GREEN,anchor='mm',serif=True);text(im,(320,625),'nights',36,MUTED,anchor='mm')
d=ImageDraw.Draw(im)
for i,(k,label,c) in enumerate(labels):
 y=225+i*84;d.ellipse((638*S,(y-10)*S,660*S,(y+12)*S),fill=c)
 text(im,(680,y),label,34,c if k!='volunteering' else '#A18426',anchor='lm',serif=True)
 text(im,(1030,y+37),str(n[k])+' nights',29,MUTED,anchor='rm')
save(im,'03-nights.png')
im=base('Nights per country',4)
rows=[x for x in countries if x['country']!='At sea']
d=ImageDraw.Draw(im)
for i,row in enumerate(rows):
 y=170+i*30.5;v=int(row['nights']);name=row['country']
 text(im,(254,y),name,29,INK,anchor='rm');end=280+v/218*695
 d.rounded_rectangle((280*S,(y-11)*S,end*S,(y+12)*S),radius=9*S,fill=LIGHT)
 text(im,(end+10,y),str(v),27,GREEN,anchor='lm')
text(im,(540,1040),'Plus 16 nights at sea.',24,MUTED,anchor='mm')
save(im,'04-countries.png')
caption=f'''Three years of hitchhiking! 🚗⛵

{fmt(km)} km hitchhiked, {fmt(t['car']['leg_count'])} car rides and {count} countries later, here are the updated stats from my trip.

I’ve kept track of my rides and places to sleep along the way. Swipe for the kilometres by car, truck and boat, where I slept, and how long I stayed in each country.

Behind every number are people who stopped, made space, offered a bed or shared a little of their lives. Thank you to everyone who has been part of this journey 💚

Three years on, the adventure continues!

Stats through 29 September 2026. Country totals include time back home; territories are counted separately.

#danventures23 #hitchhiking #slowtravel #travelstats
'''
(P/'caption.txt').write_text(caption,encoding='utf-8')
notes=f'''# Three-year Instagram carousel

Source: live read-only exports from https://danventures23-api.duckdns.org on 30 September 2026: /locations, /legs?simplify=0.01 and /stats/transport-distance.
Latest recorded day: 29 September 2026, using the project's Europe/Zurich date convention. First recorded day: 27 September 2023. Totals include the few days after the exact third anniversary.

## Definitions
- Hitchhiked distance: car + truck + boat, matching the three categories in the reference post. Exact total {km:.6f} km, rounded once to {round(km):,} km. Bike (25.17 km), friends, walking and paid transport are excluded.
- Car rides: {t['car']['leg_count']} database legs, not verified unique vehicles. The location table has 1,232 car-tagged points, which is a different measure. Routes may be split across legs, so this is the database ride count.
- Countries: {count} sovereign-country categories in the recorded stays; Gibraltar and the Western Sahara waypoint are excluded from this number. All location points were also checked for additional countries. Coastal unmatched points refer to countries already present or sea crossings.
- The old image lists four UK nights; the current database has no UK locations. This draft follows the current database. Confirm whether those historical UK nights should be restored before claiming this is a complete lifetime total.
- Nights: sum of explicit positive nonights values, {sum(n.values())}. A Madrid Airport sleep point (ID 1134) has 0 nights and is excluded. The website currently substitutes 1 for this zero, producing 1,091; this draft preserves the entered value.
- Free accommodation: camping, friends, boat, house (labelled Invited), couchsurfing and volunteering: {free} nights. Paid-category accommodation totals 154 nights. The remaining 9 nights are overnight transport and are not claimed as free. Missing cost fields are not treated as proof that a stay was free; free status follows the accommodation categories.
- Countries are assigned with the repository's nights-by-country.mjs polygon and coastal fallback rules. 16 nights at sea appear separately. All 1,090 nights are assigned. Switzerland and other stays back home remain included, like the original post.
- The old post's free-night title and donut labels do not fully reconcile, so the new post uses directly reconciled current totals instead of adding to last year's numbers.

## Files
Four 1080 × 1080 PNGs, in posting order, plus caption.txt. Database exports and calculation materials remain outside the shareable ZIP.
'''
(P/'stats-notes.md').write_text(notes,encoding='utf-8')
preview=Image.new('RGB',(1080,1080),'#e9ece7')
for i,name in enumerate(['01-three-years.png','02-distance.png','03-nights.png','04-countries.png']):
 tile=Image.open(P/name).resize((530,530),Image.Resampling.LANCZOS);preview.paste(tile,((i%2)*540+5,(i//2)*540+5))
preview.save(P/'preview.jpg',quality=93)
with zipfile.ZipFile(P/'instagram-three-years.zip','w',zipfile.ZIP_DEFLATED) as z:
 for name in ['01-three-years.png','02-distance.png','03-nights.png','04-countries.png','caption.txt','stats-notes.md']:z.write(P/name,name)
print(json.dumps({'distance_km':km,'car_rides':t['car']['leg_count'],'countries':count,'nights':sum(n.values()),'free_accommodation':free}))




