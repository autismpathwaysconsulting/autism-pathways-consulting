"""Build the one-page school overview. Requires reportlab, fontTools and brotli."""
from pathlib import Path
from tempfile import TemporaryDirectory
from fontTools.ttLib import TTFont as FTFont
from fontTools.varLib.instancer import instantiateVariableFont
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT

root=Path(__file__).resolve().parents[1]
out=root/'APC-School-Training-Overview.pdf'
with TemporaryDirectory() as tmp:
 for name,file,weight in [('Body','dm-sans-latin-v17.woff2',400),('Bold','dm-sans-latin-v17.woff2',600),('Display','dm-serif-display-latin-v17.woff2',400)]:
  font=FTFont(root/file)
  if 'fvar' in font: font=instantiateVariableFont(font,{'wght':weight},inplace=True)
  font.flavor=None; path=Path(tmp)/(name+'.ttf');font.save(path);pdfmetrics.registerFont(TTFont(name,str(path)))
 c=canvas.Canvas(str(out),pagesize=(595.276,841.89),pageCompression=1)
 c.setTitle('APC School Training Overview');c.setAuthor('Autism Pathways Consulting');c.setSubject('Staff workshops and educator training with CJ Lim')
 teal=HexColor('#073734');muted=HexColor('#435d58');sage=HexColor('#6B9E7A');cream=HexColor('#FFFDF9');coral=HexColor('#E8997A')
 c.setFillColor(cream);c.rect(0,0,595.276,841.89,fill=1,stroke=0)
 def text(x,y,s,size=10,font='Body',color=teal):
  c.setFillColor(color);c.setFont(font,size);c.drawString(x,y,s)
 def para(x,top,s,width=499,size=10.6,leading=15.5,font='Body',color=muted):
  style=ParagraphStyle('p',fontName=font,fontSize=size,leading=leading,textColor=color)
  p=Paragraph(s,style);w,h=p.wrap(width,800);p.drawOn(c,x,top-h);return top-h
 c.drawImage(ImageReader(str(root/'apc-logo-160.webp')),48,778,width=80,height=45,mask='auto')
 text(325,799,'SCHOOLS & EDUCATORS',8.2,'Bold')
 text(325,785,'Malaysia · Training overview',8.2,color=muted)
 c.setFillColor(teal);c.rect(0,600,595.276,163,fill=1,stroke=0)
 text(48,735,'STAFF WORKSHOPS WITH CJ LIM',8.5,'Bold',HexColor('#A7D9C8'))
 text(48,693,'One classroom focus.',29,'Display',cream)
 text(48,658,'Shared next steps.',29,'Display',cream)
 para(48,639,'Practical discussion for teachers, shadow aides and school teams.',490,10.5,14,color=HexColor('#D7E8DF'))
 text(48,574,'Build around your team’s everyday questions.',16,'Display')
 para(48,557,'Choose a focus such as understanding distress, clearer communication or smoother transitions. Explore classroom examples together and discuss what your team could try.',size=10.7)
 # Three parallel activities, with simple numbered markers.
 rows=[('01','Notice the situation','Describe what happens in a classroom routine and what remains unclear.'),('02','Explore an adjustment','Discuss a practical change to instructions, support or the environment.'),('03','Plan what to review','Choose what to observe and discuss together after trying an adjustment.')]
 top=494
 for n,h,b in rows:
  c.setFillColor(sage);c.circle(61,top-8,13,fill=1,stroke=0)
  text(54,top-11,n,8.5,'Bold',cream)
  text(87,top-4,h,11,'Bold');para(87,top-12,b,width=455,size=10.2,leading=14)
  top-=59
 c.setStrokeColor(HexColor('#D6E1D8'));c.line(48,318,547,318)
 text(48,293,'Plan the right session',15,'Display')
 para(48,279,'Share your school, team size, main focus and preferred dates. CJ reviews fit and availability, then discusses delivery arrangements, duration, fees and any materials or follow-up. These are agreed before booking.',size=10.3,leading=14.7)
 para(48,225,'Team discussion and educator &amp; aide guidance are also available to discuss.',size=9.8,leading=14)
 c.drawImage(ImageReader(str(root/'cj-photo-224.webp')),48,125,width=62,height=62,mask='auto')
 text(126,176,'CJ Lim',13,'Bold');text(126,160,'Autism Educator & Founder of APC',9.5)
 text(126,144,'M.A. Special and Inclusive Education',9,color=muted)
 text(126,130,'University of Nottingham',9,color=muted)
 text(48,103,'Discuss training for your school',11,'Bold')
 text(48,86,'autismpathwaysconsulting.com/schools',10,color=HexColor('#0F766E'))
 c.linkURL('https://autismpathwaysconsulting.com/schools',(48,82,315,99),relative=0)
 text(48,70,'cjlim@autismpathwaysconsulting.com',9,color=HexColor('#0F766E'))
 c.linkURL('mailto:cjlim@autismpathwaysconsulting.com',(48,66,310,81),relative=0)
 para(332,107,'Educational training, not diagnosis, therapy or accredited certification. Enquiries do not reserve a date. Written payment permission and CJ’s confirmation are required.',width=215,size=8.2,leading=11.1)
 c.setStrokeColor(HexColor('#D6E1D8'));c.line(48,53,547,53)
 text(48,36,'CJ Special and Inclusive Consultancy (003030209-T) · Reg. 201903282307',7.2,color=muted)
 text(48,24,'Overview dated 21 September 2026. Scope and commercial terms are confirmed individually.',7,color=muted)
 c.save()
 print(out)
