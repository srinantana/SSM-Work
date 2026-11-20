# Base44 rak-site-exp → SSM Work site_expense_projects (Dew 20 Nov 2026: all real projects, estimate only, Draft, attachment links)
import json, re
T=True; N=None
P={ # key: ij, jo, customer, name, country, city, dest(EN), start, end, periods[(label,s,e)], allowance, signal, sc_owner, created, base44 total
'A':('IJ2607001',N,'SWAROVSKI MANUFACTURING (THAILAND) CO., LTD.','Centralized Air Blower for F5','Thailand','Ayutthaya','Ayutthaya','2027-04-10','2027-04-30',[('Phase 1 Installation','2027-04-10','2027-04-30')],150,4500,'ศักดิ์กมล จันทริมา','2026-11-16T10:14:11Z',None),
'B':('IJ2610005',N,'ULTRA CLEAN TECHNOLOGY (SINGAPORE)','New Dual EP Line','Singapore','Singapore','','2027-05-23','2027-05-30',[('Phase 1 Installation','2027-05-23','2027-05-30')],150,4500,'ศักดิ์กมล จันทริมา','2026-11-03T04:11:14Z',566350),
'C':('IJ2604012',N,'ULTRA CLEAN TECHNOLOGY (ISRAEL)','New Dual Ep Line','Israel','Tel Aviv','','2027-05-01','2027-05-11',[('Phase 1','2027-05-01','2027-05-11')],150,4500,'ธีร์ดนัย ฮุยสูงเนิน','2026-10-27T03:42:51Z',1268375),
'D':('IJ20602006',N,'ISOBE','Plating Line & WWTP relocation','Japan','Nagoya','','2027-06-10','2027-09-14',[('Phase 1 Supervision','2027-06-10','2027-06-15'),('Phase 2 Supervision','2027-07-15','2027-07-20'),('Phase 3 Installation','2027-08-15','2027-09-14')],150,4500,'ศักดิ์กมล จันทริมา','2026-10-18T11:51:22Z',2151000),
'E':('IJ2605007_1',N,'ENDO THAI CO., LTD.','Water & WWTP','Thailand','Bangkok','Bangkok','2027-08-01','2027-08-21',[('Phase 1','2027-08-01','2027-08-21')],150,4500,'','2026-10-08T07:56:01Z',1010625),
'F':('IJ2605007',N,'ENDO THAI CO., LTD.','New PLATING LINE ( AUTO NI. & CR. ) + Fume','Thailand','Bangkok','Bangkok','2027-06-01','2027-07-31',[('Phase 1','2027-06-01','2027-07-31')],150,4500,'นันทนา ศรีสกุลเตียว','2026-10-08T07:33:42Z',3376500),
'G':('IJ2609002',N,'SWAROVSKI MANUFACTURING (THAILAND) CO., LTD.','Wet Scrubber PL5270','Thailand','Ayutthaya','Ayutthaya','2027-02-01','2027-02-07',[('Phase 1','2027-02-01','2027-02-07')],150,4500,'ศักดิ์กมล จันทริมา','2026-09-30T02:58:28Z',450300),
'H':('IJ2606035',N,'ULTRA CLEAN TECHNOLOGY (MALAYSIA) SDN. BHD.','New Wet Scrubber','Malaysia','Penang','','2027-02-01','2027-02-07',[('Phase 1','2027-02-01','2027-02-07')],150,4500,'ธีร์ดนัย ฮุยสูงเนิน','2026-09-17T03:09:08Z',200000),
'I':('IJ2606020',N,'SWAROVSKI MANUFACTURING (THAILAND) CO., LTD.','Re-layout and Repair Structure 5270','Thailand','Ayutthaya','Ayutthaya','2026-10-18','2027-01-31',[('Phase 1','2026-10-18','2026-10-31'),('Phase 2','2026-12-01','2027-01-31')],150,4500,'ศักดิ์กมล จันทริมา','2026-08-20T10:43:11Z',2391600),
'J':('IJ2607004',N,'PANDORA PRODUCTION CO., LTD.','Flexible Program Phase 2','Thailand','Bangkok','Bangkok','2026-09-01','2026-09-07',[],150,4500,'นันทนา ศรีสกุลเตียว','2026-08-20T09:51:59Z',76000),
'K':('IJ2606007',N,'SWAROVSKI MANUFACTURING (THAILAND) CO., LTD.','Air Supply & Exhaust Post Plated SMT6-2','Thailand','Ayutthaya','Ayutthaya',None,None,[],150,4500,'ศักดิ์กมล จันทริมา','2026-07-22T09:08:56Z',93150),
'L':('IJ2605006',N,'ENDO THAI CO., LTD.','Dust Collector','Thailand','Bangkok','Bangkok','2027-04-10','2027-04-17',[],150,4500,'ศักดิ์กมล จันทริมา','2026-07-21T02:53:37Z',246900),
}
MP=[ # key, position, role, qty, day_rate, days, start, ot_h, ot_rate, overnight, note
('A','Engineer','Engineer',1,2000,10,'2027-04-20',0,375,T,''),('A','Technician','Technician',6,1000,20,'2027-04-10',10,187.5,T,''),('A','Team Lead','Technician',3,2000,20,'2027-04-10',10,375,T,''),('A','Site Engineer','SC',1,2000,20,'2027-04-10',10,375,T,''),
('B','Programmer','Engineer',1,5000,7,'2027-05-23',20,937.5,T,''),('B','Technician','Technician',3,1000,7,'2027-05-23',20,187.5,T,''),('B','Team Lead','Technician',2,2000,7,'2027-05-23',20,375,T,''),('B','Site Engineer','SC',1,2000,7,'2027-05-23',20,375,T,''),
('C','Engineer','Engineer',1,2000,10,N,10,375,T,'Programmer'),('C','Technician','Technician',3,1000,10,N,10,187.5,False,''),('C','Team Lead','Technician',3,2000,10,N,10,375,T,''),('C','Site Engineer','SC',1,2000,10,N,10,375,T,''),
('D','Engineer','Engineer',1,2000,10,N,0,375,T,'If needed'),('D','Technician','Technician',8,1000,30,N,0,187.5,T,'PP+ME+EE'),('D','Team Lead','Technician',3,2000,40,N,0,375,T,'PP+ME+EE'),('D','Site Engineer','SC',1,2000,40,N,0,375,T,''),
('E','Technician','Technician',5,1000,20,'2027-08-01',50,187.5,T,''),('E','Team Lead','Technician',3,2000,20,'2027-08-01',50,375,T,''),('E','Site Engineer','SC',1,2000,20,'2027-08-01',50,375,T,''),('E','Site Engineer','Site Manager',1,2000,20,'2027-08-01',50,375,T,''),
('F','Engineer','Engineer',4,2000,15,N,50,375,T,''),('F','Technician','Technician',12,1000,60,'2027-06-01',100,187.5,T,'EE,ME,PP'),('F','Team Lead','Technician',3,2000,60,'2027-06-01',100,375,T,'Lead EE,ME,PP'),('F','Site Engineer','SC',1,2000,60,'2027-06-01',100,375,T,''),('F','Site Engineer','Site Manager',1,2000,60,'2027-06-01',20,375,T,''),
('G','Technician','Technician',5,1000,6,'2027-02-01',0,187.5,T,''),('G','Team Lead','Technician',1,2000,6,'2027-02-01',0,375,T,'พิเศษ'),('G','Site Engineer','SC',1,2000,6,'2027-02-01',0,375,T,''),
('H','Site Engineer','SC',1,2000,6,'2027-02-01',0,375,T,''),('H','Technician','Technician',2,1000,6,'2027-02-01',0,187.5,T,''),('H','Team Lead','Technician',2,2000,6,'2027-02-01',0,375,T,''),
('I','Engineer','Engineer',3,2000,7,N,0,375,False,''),('I','Technician','Technician',6,1000,30,N,0,187.5,T,''),('I','Team Lead','Technician',2,2000,68,N,0,375,T,''),('I','Site Engineer','SC',2,2000,74,N,0,375,T,''),('I','Project Engineer','Site Manager',1,3000,15,N,0,562.5,False,''),
('J','Engineer','Engineer',1,2000,6,N,0,375,False,''),('J','Technician','Technician',1,1000,6,N,0,187.5,False,''),('J','Programmer','Engineer',1,5000,6,N,0,937.5,False,''),('J','Site Engineer','Site Manager',1,2000,6,N,0,375,False,''),
('K','Site Engineer','SC',1,2000,5,N,0,375,T,''),('K','Team Lead','Technician',1,2000,5,N,0,375,T,''),('K','Technician','Technician',3,1000,5,N,0,187.5,T,''),
('L','Technician','Technician',4,1000,7,N,2,187.5,T,''),('L','Team Lead','Technician',2,2000,7,N,2,375,T,''),('L','Site Engineer','SC',1,2000,7,N,2,375,T,''),
]
SUB=[ # key, title, scope, supplier, lump_qty, lump_rate, manday_qty, manday_rate
('D','Packing Line','Line','',200000,1,0,0),('D','Packing Tools','Tools','',10000,1,0,0),('B','Truck','CBT','',120000,1,0,0),('B','Packing','Tools packing','',1,10000,0,0),
('C','ส่งลังเครื่องมือ','Export&Re-Export','TBC',1,150000,0,0),('C','แพ็คลังเครื่องมือ','แพ็คลังเครื่องมือ','Thai Wattana',1,10000,0,0),('E','Electrical','','',0,0,150,2500),
('F','Labour','','',0,0,100,2500),('F','Electrical','','',0,0,200,2500),('I','แรงงานขนย้าย','ขนเข้า-ขนออก','TBC',0,0,200,2000),('I','แรงงานไฟฟ้า','แรงงานไฟฟ้า+Cer','NHP',0,0,250,2500),
('K','เซ็นต์นั่งร้าน','','',1,20000,0,0),('L','เช่านั่งร้าน','','',1,20000,0,0),('L','ตรวจสุขภาพ','สำหรับทำงานที่สูง','วิภาราม',4,1200,0,0),('L','จ้างเซ็นต์นั่งร้าน','พร้อมรายการคำนวณ','TBC',1,20000,0,0),
]
VEH=[ # key, description, vehicles, trips, rate, signal_crew, signal_rate, note
('A','6ล้อ (คอกยาว, ธรรมดา)',2,1,7000,0,4500,''),('A','รถเครน 100 ตัน',1,1,80000,0,4500,''),('F','รถเครน 200 ตัน',2,1,120000,0,4500,'เช่า X-Lift เดือนละ 100,000 โดยประมาณ ใช้ 2 คัน 1 เดือน'),
('E','รถ 6 ล้อ เฮี๊ยบติดเครน',1,3,7000,4,4500,''),('E','6ล้อ (คอกยาว, ธรรมดา)',1,2,6500,0,4500,''),('F','รถเครน 10 ตัน',1,2,7000,0,4500,''),('F','รถ 6 ล้อ เฮี๊ยบติดเครน',3,1,7000,0,4500,''),('F','6ล้อ (คอกยาว, ธรรมดา)',6,1,6500,0,4500,''),
('G','รถเครน 200 ตัน',1,3,120000,0,4500,''),('I','รถเครน 200 ตัน',1,1,120000,3,4500,'เผื่อ'),('I','6ล้อ (คอกยาว, ธรรมดา)',6,3,7000,0,4500,'ขนของจากRAK->SMT'),('K','6ล้อ (คอกยาว, ธรรมดา)',1,1,10000,0,4500,''),
('L','รถเครน 50 ตัน',1,1,50000,0,4500,'ยกเข้าที่'),('L','รถ 6 ล้อ เฮี๊ยบติดเครน',1,1,7000,0,4500,'ขนท่อพร้อมยกติดตั้ง พร้อมยกประกอบ'),('L','6ล้อ (คอกยาว, ธรรมดา)',3,1,6500,0,4500,'1.ขน Dust 2.ขน Cyclone 3.ขนท่อและนั่งร้าน'),
]
ACC=[ # key, label, billing, unit_qty, rate, periods
('A','Apartment rental — Single','month',1,6000,1),('A','Apartment rental — Twin','month',5,6000,1),('B','Twin Room','night',3,2500,6),('B','Single Room','night',1,2500,6),('C','Twin Room','night',2,3500,9),('C','Single Room','night',1,3500,9),
('D','Hotel Rental','night',2,2000,10),('D','House rental (Airbnb)','month',1,200000,1),('E','Apartment rental — Twin','month',4,4500,1),('E','Apartment rental — Single','month',2,4500,1),('F','Apartment rental — Twin','month',10,4500,2),('F','Apartment rental — Single','month',2,4500,2),
('G','Twin Room','night',3,700,5),('G','Single Room','night',1,700,5),('H','Twin Room','night',2,2000,5),('H','Single Room','night',1,2000,5),('I','Apartment rental — Single','month',2,5000,3),('I','Apartment rental — Twin','month',4,5000,3),
('K','Twin Room','night',2,700,4),('K','Single Room','night',1,700,4),('L','Single Room','night',1,700,6),('L','Twin Room','night',4,700,6),
]
AIR=[ # key, for_label, qty, country, airline, fare
('B','Site Engineer (SC)',1,'Singapore','OTHER',22000),('B','Team Lead (Technician)',2,'Singapore','OTHER',22000),('B','Technician (Technician)',3,'Singapore','OTHER',22000),('B','Programmer (Engineer)',1,'Singapore','OTHER',22000),
('C','Site Engineer (SC)',1,'','Thai Airways',90000),('C','Team Lead (Technician)',3,'','Thai Airways',90000),('C','Technician (Technician)',3,'','Thai Airways',90000),('C','Engineer (Engineer)',1,'','Thai Airways',90000),
('D','Site Engineer (SC)',3,'Japan','Thai Airways',50000),('D','Team Lead (Technician)',6,'Japan','Thai Airways',50000),('D','Technician (Technician)',8,'Japan','Thai Airways',50000),('D','Engineer (Engineer)',2,'Japan','Thai Airways',50000),
('H','Team Lead (Technician)',2,'Malaysia','Thai Airways',20000),('H','Technician (Technician)',2,'Malaysia','Thai Airways',20000),('H','Site Engineer (SC)',1,'Malaysia','Thai Airways',20000),
]
WP,INV,TI,VISA,PP,EB,TX='Work permit / COE ปลายทาง','Invitation letter / หนังสือเชิญจากปลายทาง','Travel Insurance','Visa fee / ค่าธรรมเนียมวีซ่า','Passport ทำใหม่/ต่ออายุ (เหลือ < 6 เดือน)','Excess baggage (เครื่องมือช่าง)','Taxi Airport Round trip (Destination)'
DOC=[ # ticked documents only, qty = people on the manpower lines that ticked it (Base44: manpower qty × rate)
('B',TI,7,1500),('B',INV,7,1000),('B',TX,1,4000),('C',WP,8,2000),('C',INV,8,1000),('C',TI,8,1500),('C',VISA,8,3000),
('D',PP,13,1500),('D',INV,12,1000),('D',TI,13,1500),('D',EB,13,2500),('H',TI,5,1500),
]
GRD=[ # key, description, vehicles, trips, rate
('A','รถตู้ (Round Trip)',1,4,3000),('A','รถตู้ (Site Trip)',1,15,1000),('B','รถตู้ (Site Trip)',1,1,1000),('B','Taxi Airport Round trip (Thailand)',2,6,1000),('C','รถตู้ (Site Trip)',2,20,1000),('C','Taxi Airport Round trip (Thailand)',1,2,1000),
('D','Taxi Airport Round trip (Thailand)',1,6,1000),('E','รถ Pick up (Round Trip)',1,5,2500),('E','รถตู้ (Site Trip)',1,20,1000),('E','รถตู้ (Round Trip)',1,3,2500),('F','รถ Pick up (Round Trip)',2,10,2500),('F','รถตู้ (Site Trip)',1,60,1000),('F','รถตู้ (Round Trip)',1,6,2500),
('G','รถตู้ (Site Trip)',1,5,1000),('G','รถตู้ (Round Trip)',1,2,3000),('H','Taxi Airport Round trip (Thailand)',1,2,1000),('I','รถตู้ (Site Trip)',1,10,1000),('I','รถ Pick up (Round Trip)',1,4,1000),('I','รถส่วนตัว (Site Trip)',1,15,500),('I','รถตู้ (Site Trip)',1,60,1000),('I','รถตู้ (Round Trip)',1,2,3000),
('J','รถ Pick up (Round Trip)',1,12,500),('K','รถ Pick up (Round Trip)',1,4,2000),('L','รถตู้ (Site Trip)',1,6,1000),('L','รถตู้ (Round Trip)',1,1,2500),
]
CASH='เงินสำรองหน้าไซส์ (Cash in advance)'
SE=[ # key, tier_item, description, qty, rate
('A',CASH,'',1,20000),('B','Pocket money 3 — scope ใหญ่','Pocket Money',1,30000),('C',CASH,'',1,30000),('D',CASH,'Cash',1,20000),('E',CASH,'',1,10000),('F',CASH,'',1,20000),('G','Site material expense 1 — scope เล็ก','',1,5000),
('H',CASH,'',1,5000),('H','Safety Equipments 1 — scope เล็ก','',1,3000),('I','Safety Equipments 2 — scope กลาง','',1,5000),('I',CASH,'',1,20000),('J','Site material expense 1 — scope เล็ก','',1,5000),('J','Safety Equipments 2 — scope กลาง','',1,5000),
('K','Safety Equipments 1 — scope เล็ก','',1,3000),('K',CASH,'',1,5000),('L','Safety Equipments 2 — scope กลาง','',1,5000),('L',CASH,'',1,10000),
]
ATT=[ # key, type, title, link, base44 file
('C','Layout','LAYOUT','https://drive.google.com/file/d/183aACnrmuIbcI4SpYq53BkOCpN7rOm6E/view?usp=sharing',''),
('D','Layout','LAYOUT','https://drive.google.com/drive/folders/1jYyqfEShWdZY_u087i74QU7C4ahF6vdr?usp=drive_link',''),
('E','Layout','ENDO THAI REQUIREMENT','https://drive.google.com/drive/u/0/folders/1mAeP8XFKHMpIlioOmsdkiNtNJAX_Ghc3',''),
('F','Layout','ENDO THAI REQUIREMENT','https://drive.google.com/drive/folders/1mAeP8XFKHMpIlioOmsdkiNtNJAX_Ghc3?usp=drive_link',''),
('H','Layout','Layout','https://drive.google.com/drive/folders/10uHEVzuusrW5v_Gooi79SbM8qccFr7kd?usp=drive_link',''),
('I','Other','Draft Plan','https://drive.google.com/drive/folders/1sgPlsTO9lcWhZrmLZ-tRCbxdncNUh7mC?usp=drive_link',''),
('I','Layout','Pipe & Duct Layout','https://drive.google.com/drive/folders/1As4JQylGtVre0f9YiYpECMq1W0HP2jih?usp=drive_link','https://base44.app/api/apps/6a5ed77b6bb2596e008aa3fa/files/mp/public/6a5ed77b6bb2596e008aa3fa/2b3a63db5_Ducting_OverallLayout5270.pdf'),
('I','Other','Inquiry (ClickUp)','https://app.clickup.com/t/1863860/86d3gy062',''),
('K','Layout','Plant Layout','https://drive.google.com/drive/folders/14jXqZFp4I-W0jTuZFXpj-7BGdXzNmpAC?usp=drive_link',''),
('L','Layout','Layout','https://drive.google.com/drive/folders/1CraX6_TgXIk-nB5IEUMrdR_gtR0rsikO?usp=drive_link',''),
]
