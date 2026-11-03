import os
H=os.environ.get("LAB_HOST","127.0.0.1");PW=os.environ.get("LAB_PASSWORD","postgres");DBP=os.environ.get("LAB_DB_PORT","54322");PLP=os.environ.get("LAB_POOLER_PORT","54329");TENANT=os.environ.get("LAB_TENANT","pooler-dev")  # local CLI defaults
import threading,time,sqlalchemy as sa,psycopg
from sqlalchemy import create_engine,text
D=f"postgresql+psycopg://r2:{PW}@{H}:{DBP}/postgres"
def snap():
    with psycopg.connect(f"postgresql://supabase_admin:{PW}@{H}:{DBP}/postgres") as c:
        return c.execute("select count(*) from pg_stat_activity where usename='r2'").fetchone()[0]
def admin(q):
    with psycopg.connect(f"postgresql://supabase_admin:{PW}@{H}:{DBP}/postgres",autocommit=True) as c: c.execute(q)
e=create_engine(D)
def w():
    try:
        with e.connect() as c: c.execute(text("select 1 from pg_sleep(2)"))
    except Exception as x: print(' err',str(x)[:80])
ts=[threading.Thread(target=w) for _ in range(30)];[t.start() for t in ts];time.sleep(1.5);print(f"P2 SQLAlchemy {sa.__version__} default engine, 30 threads x 2s: backends at 1.5s =",snap(),"(5 pool + 10 overflow = 15; the other 15 threads wait)");[t.join() for t in ts]
print("   after threads done, backends still open (pool keeps 5):",snap());
# recovery: kill idle pooled connections, then run
for pre in (False,True):
    e=create_engine(D,pool_pre_ping=pre)
    with e.connect() as c: c.execute(text("select 1"))
    admin("select pg_terminate_backend(pid) from pg_stat_activity where usename='r2'")
    time.sleep(.5)
    try:
        with e.connect() as c: c.execute(text("select 1"));r='ok'
    except Exception as x: r='ERROR '+type(x).__name__
    print(f"P2b SQLAlchemy pool_pre_ping={pre}: first query after the server killed idle connections ->",r)
    e.dispose()
