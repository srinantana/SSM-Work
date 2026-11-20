import json, secrets, re
from b44 import *
uid=lambda: secrets.token_hex(4)
DEST_TH={'Bangkok':'กรุงเทพมหานคร','Ayutthaya':'พระนครศรีอยุธยา'}
NOW='2026-11-20T04:00:00.000Z'
def line(cat,kind,**f): return dict(id=uid(),cat=cat,kind=kind,phase='',**f)
amt={'mp':lambda r:r['qty']*r['days']*r['day_rate']+r['qty']*r['ot_hours']*r['ot_rate']+(r['qty']*r['days']*r['allow_rate'] if r['overnight'] else 0),
 'sub':lambda r:r['lump_qty']*r['lump_rate']+r['manday_qty']*r['manday_rate'],'veh':lambda r:r['vehicles_qty']*r['trips']*r['rate']+r['signal_crew']*r['signal_rate']*r['trips'],
 'acc':lambda r:r['unit_qty']*r['periods']*r['rate'],'air':lambda r:r['qty']*r['fare'],'doc':lambda r:r['qty']*r['rate'],'tground':lambda r:r['vehicles_qty']*r['trips']*r['rate'],'se':lambda r:r['qty']*r['rate']}
def n(x): return int(x) if float(x).is_integer() else x
out,report=[],[]
for k,(ij,jo,cus,name,ctry,city,dest,s,e,per,allow,sig,owner,created,b44tot) in P.items():
    phases=[dict(id='ph%d'%(i+1),name=l,start=a,end=b) for i,(l,a,b) in enumerate(per)]
    ph_of=lambda d: next((x['id'] for x in phases if d and x['start']<=d<=x['end']), phases[0]['id'] if len(phases)==1 else '')
    L=[]
    for (kk,pos,role,q,dr,days,st,oth,otr,ovn,note) in [m for m in MP if m[0]==k]:
        nt=', '.join(x for x in [role if role=='Site Manager' else '', note] if x)
        ph=ph_of(st); x=next((y for y in phases if y['id']==ph),None)
        from datetime import date
        pd=(date.fromisoformat(x['end'])-date.fromisoformat(x['start'])).days if x else None
        l=line('manpower','mp',position=pos,qty=q,days=n(days),day_rate=dr,ot_hours=oth,ot_rate=n(otr),overnight=ovn,allow_rate=allow,note=nt); l['phase']=ph
        if pd!=days: l['days_auto']=False
        L.append(l)
    single=phases[0]['id'] if len(phases)==1 else ''
    for (kk,t,sc,sup,lq,lr,mq,mr) in [x for x in SUB if x[0]==k]: L.append(line('subcontract','sub',title=t,scope=sc,supplier=sup,lump_qty=lq,lump_rate=lr,manday_qty=mq,manday_rate=mr))
    for (kk,d,v,tr,r,sc,sr,nt) in [x for x in VEH if x[0]==k]: L.append(line('transportation','veh',description=d.replace('6ล้อ','6 ล้อ'),vehicles_qty=v,trips=tr,rate=r,signal_crew=sc,signal_rate=sr,note=nt))
    for (kk,lb,bl,uq,r,pr) in [x for x in ACC if x[0]==k]: L.append(line('accommodation','acc',label=lb,billing=bl,unit_qty=uq,periods=pr,rate=r,note=''))
    for (kk,fl,q,c,al,fa) in [x for x in AIR if x[0]==k]: L.append(line('travel','air',for_label=fl,country=c,airline=al,ticket_type='Fixed',qty=q,fare=fa))
    for (kk,dn,q,r) in [x for x in DOC if x[0]==k]: L.append(line('travel','doc',doc_name=dn,qty=q,rate=r,note='รวมทุกคนที่ติ๊กใน Base44'))
    for (kk,d,v,tr,r) in [x for x in GRD if x[0]==k]: L.append(line('travel','tground',description=d,vehicles_qty=v,trips=tr,rate=r,note=''))
    for (kk,ti,d,q,r) in [x for x in SE if x[0]==k]: L.append(line('site_expense','se',tier_item=ti,description=d,qty=q,rate=r,holder_name=''))
    for l in L:
        if l['kind']!='mp' and single: l['phase']=single
    docs=[dict(id=uid(),type=t,title=ti,link=lk,file='',note=('ไฟล์เดิมบน Base44: '+f) if f else '',by='Base44',at=NOW) for (kk,t,ti,lk,f) in ATT if kk==k]
    overseas=ctry!='Thailand'
    pid=re.sub(r'[^a-z0-9_]+','-',ij.lower())+'-b44'
    p=dict(id=pid,ij=ij,jo='',name=name,customer=cus,city=f'{city} · {ctry}' if overseas else city,destination=DEST_TH.get(dest,'') ,country='',allowance_tier='' if overseas else 'Local (Thailand)',
           start=s or '',end=e or '',phases=phases,lines=L,docs=docs,status='draft',list='active',budget=None,lockedAt=None,award=None,actuals=[],createdAt=created,
           b44={'sc_owner':owner,'created':created},
           history=[dict(at=NOW,role='create',by='ดิว',action='import',note=f'ย้ายจาก Base44 · สร้างเมื่อ {created[:10]}'+(f' · SC {owner}' if owner else '')+' · สถานะเดิมไม่ได้ย้าย (เริ่มเป็น Draft)')])
    tot=sum(amt[l['kind']](l) for l in L)
    by={}; [by.__setitem__(l['cat'],by.get(l['cat'],0)+amt[l['kind']](l)) for l in L]
    flag=[]
    if b44tot is None: flag.append('Base44 ไม่มียอดรวม (ยังเป็น draft) — เทียบไม่ได้')
    elif abs(tot-b44tot)>0.5: flag.append(f'ยอดไม่ตรง: ใหม่ {tot:,.0f} vs Base44 {b44tot:,.0f} (ต่าง {tot-b44tot:+,.0f})')
    if overseas: flag.append(f'ต่างประเทศ ({ctry}) — เลือกประเทศใน “แก้ไขข้อมูล” แล้วเบี้ยเลี้ยงจะปรับจาก 150 เป็นอัตราของประเทศ')
    if not s: flag.append('ไม่มีวันทำงาน / phase')
    if len(phases)>1 and any(l['kind']=='mp' and not l['phase'] for l in L): flag.append('กำลังคนบางรายการไม่มีวันที่ใน Base44 → อยู่ในกลุ่ม “ทั้งโปรเจค”')
    report.append((ij,len(L),len(docs),tot,b44tot,flag)); out.append(p)
json.dump(out,open('projects.json','w'),ensure_ascii=False)
for r in report: print(f"{r[0]:<12} lines {r[1]:>3} docs {r[2]} total {r[3]:>12,.0f} base44 {('-' if r[4] is None else f'{r[4]:,.0f}'):>11} | "+' / '.join(r[5]))
# SQL
ddl=open(__import__('os').path.join(__import__('os').path.dirname(__file__), '..', '..', 'site_expense_projects.sql')).read().split('begin;',1)[1].rsplit('commit;',1)[0]
q=lambda s:"'"+str(s).replace("'","''")+"'"
rows=[f"({q(p['id'])}, {q(p['ij'])}, '', 'draft', 'active', $j${json.dumps(p,ensure_ascii=False)}$j$::jsonb, 'base44-import', 'nantana.s')" for p in out]
sql=f"""-- Site Expense: projects moved from Base44 (rak-site-exp) — {len(out)} projects, estimate only, all as Draft (Dew, 20 Nov 2026).
-- Creates site_expense_projects if it is not there yet, then adds the projects. Safe to run more than once (existing ids are skipped).
begin;{ddl}
insert into site_expense_projects (id, ij, jo, status, list, data, created_by, updated_by) values
{(','+chr(10)).join(rows)}
on conflict (id) do nothing;
commit;
select ij, status, jsonb_array_length(data->'lines') as lines from site_expense_projects where created_by = 'base44-import' order by ij;
"""
open('site_expense_import_base44.sql','w').write(sql); print(len(sql),'bytes SQL')
