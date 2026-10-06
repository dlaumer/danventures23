from pathlib import Path
p=Path('artifacts/three-years/create-maps.py')
s=p.read_text(encoding='utf-8')
needle="with zipfile.ZipFile(OUT/'three-trip-maps.zip','w',zipfile.ZIP_DEFLATED) as z:"
insert="""legend=canvas('Transport colours');d=ImageDraw.Draw(legend)
modes=[('car','Car'),('truck','Truck'),('boat','Boat'),('friends','Friends'),('foot','Walking'),('bike','Bike'),('bus','Bus'),('train','Train'),('ferry','Ferry'),('taxi','Taxi'),('rentalCar','Rental car'),('plane','Flight')]
for i,(mode,label) in enumerate(modes):
 col=i//6;row=i%6;x=90+col*505;y=250+row*132
 if mode=='plane':dashed(d,[(x*S,y*S),((x+110)*S,y*S)],COLORS[mode],8,15,10)
 else:d.line((x*S,y*S,(x+110)*S,y*S),fill=COLORS[mode],width=10*S)
 text(legend,(x+145,y),label,43,INK,anchor='lm',serif=True)
legend.resize((SIZE,SIZE),Image.Resampling.LANCZOS).save(OUT/'08-transport-legend.png')
files.append('08-transport-legend.png')
"""
s=s.replace(needle,insert+needle)
s=s.replace("print('Created three 1080 x 1080 map slides.')","print('Created three map slides and a transport legend.')")
p.write_text(s,encoding='utf-8')
