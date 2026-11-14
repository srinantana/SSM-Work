"""Regenerate Site Expense master rates from Master_rate_site_expense.xlsx.
Usage (from repo root): python3 database/rates/gen_rates.py
Writes database/site_expense_rates.sql and database/rates/rates.js.txt; paste rates.js.txt over the
"Master rate: generated" block in hub/site-expense/app.js (between the two marker comments)."""
import os
HERE=os.path.dirname(os.path.abspath(__file__))
XLSX=os.path.join(HERE,'Master_rate_site_expense.xlsx'); OUT_JS=os.path.join(HERE,'rates.js.txt'); OUT_SQL=os.path.join(HERE,'..','site_expense_rates.sql')
import openpyxl, json
wb=openpyxl.load_workbook(XLSX,data_only=True)
rows=lambda n:[r for r in wb[n].iter_rows(min_row=2,values_only=True) if any(v is not None for v in r)]
md=[[g,int(d),int(o)] for g,d,o in rows('Manday_rate')]
acc=[[t,p,int(r)] for t,p,r in rows('Accomodation_rate')]
zones={}
for z,band,desc,prov,_ in rows('Transportation_Zone'):
    zones.setdefault(z,{"band":band,"th":desc,"prov":[]})["prov"].append(prov)
veh=[[t,[int(a),int(b),int(c),int(d),int(e)],u,rem] for t,a,b,c,d,e,u,rem in rows('Transportation_Rate')]
trav={}
for t,dest,r in rows('Domestic_Travel_Rate'): trav.setdefault(t,[]).append([dest,int(r)])
J=lambda o:json.dumps(o,ensure_ascii=False)
js=f"""  // ---- Master rate: generated from Master_rate_site_expense.xlsx (Dew, 14 Nov 2026) by database/rates/gen_rates.py — edit the xlsx, not these lines ----
  const RATE_SRC = "Master rate 14 พ.ย. 2026";
  const RATE_MANDAY = {J(md)}; // [group, rate/day, OT/hour]
  const RATE_ACC = {J(acc)}; // [type, Daily|Monthly, rate]
  const ZONES = {J(zones)};
  const RATE_VEH = {J(veh)}; // [type, [Zone A..E], unit, remark]
  const RATE_TRAVEL = {J(trav)}; // type → [[destination, rate]]
  // ---- end of generated master rate ----
"""
open(OUT_JS,'w').write(js)
# SQL
q=lambda s:"'"+str(s).replace("'","''")+"'"
sql=["-- Site Expense master rates — generated from Master_rate_site_expense.xlsx (14 Nov 2026) by database/rates/gen_rates.py","-- Run once in the SSM Work Supabase SQL editor. Re-running replaces the rows (truncate + insert).","begin;",
"""create table if not exists se_rate_manday (grp text primary key, rate_per_day numeric not null, ot_rate_per_hour numeric not null, updated_at timestamptz default now());
create table if not exists se_rate_accommodation (acc_type text not null, period text not null check (period in ('Daily','Monthly')), rate numeric not null, updated_at timestamptz default now(), primary key (acc_type, period));
create table if not exists se_rate_transport_zone (province text primary key, zone text not null, distance_band text, zone_desc text, note text);
create table if not exists se_rate_transport (transport_type text primary key, zone_a numeric, zone_b numeric, zone_c numeric, zone_d numeric, zone_e numeric, unit text, remarks text, updated_at timestamptz default now());
create table if not exists se_rate_domestic_travel (travel_type text not null, destination text not null, budget_rate numeric not null, updated_at timestamptz default now(), primary key (travel_type, destination));
truncate se_rate_manday, se_rate_accommodation, se_rate_transport_zone, se_rate_transport, se_rate_domestic_travel;"""]
sql.append("insert into se_rate_manday (grp, rate_per_day, ot_rate_per_hour) values\n  "+",\n  ".join(f"({q(g)}, {d}, {o})" for g,d,o in md)+";")
sql.append("insert into se_rate_accommodation (acc_type, period, rate) values\n  "+",\n  ".join(f"({q(t)}, {q(p)}, {r})" for t,p,r in acc)+";")
sql.append("insert into se_rate_transport_zone (province, zone, distance_band, zone_desc, note) values\n  "+",\n  ".join(f"({q(prov)}, {q(z)}, {q(band)}, {q(desc)}, {q(n)})" for z,band,desc,prov,n in rows('Transportation_Zone'))+";")
sql.append("insert into se_rate_transport (transport_type, zone_a, zone_b, zone_c, zone_d, zone_e, unit, remarks) values\n  "+",\n  ".join(f"({q(t)}, {', '.join(map(str,v))}, {q(u)}, {q(rm)})" for t,v,u,rm in veh)+";")
sql.append("insert into se_rate_domestic_travel (travel_type, destination, budget_rate) values\n  "+",\n  ".join(f"({q(t)}, {q(d)}, {r})" for t,l in trav.items() for d,r in l)+";")
sql.append("""-- RLS on with no policies: browsers cannot read or write these tables directly; the SSM Work server reads them with the service role. Edit rates in Supabase or regenerate from the xlsx.
alter table se_rate_manday enable row level security; alter table se_rate_accommodation enable row level security; alter table se_rate_transport_zone enable row level security; alter table se_rate_transport enable row level security; alter table se_rate_domestic_travel enable row level security;
commit;""")
open(OUT_SQL,'w').write("\n\n".join(sql)+"\n")
print(len(md),len(acc),sum(len(z['prov']) for z in zones.values()),len(veh),sum(map(len,trav.values())))
