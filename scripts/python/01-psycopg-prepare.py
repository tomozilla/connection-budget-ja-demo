import os
H=os.environ.get("LAB_HOST","127.0.0.1");PW=os.environ.get("LAB_PASSWORD","postgres");DBP=os.environ.get("LAB_DB_PORT","54322");PLP=os.environ.get("LAB_POOLER_PORT","54329");TENANT=os.environ.get("LAB_TENANT","pooler-dev")  # local CLI defaults
import threading,time,sys,collections,psycopg,subprocess,json
DIRECT=f"postgresql://r1:{PW}@{H}:{DBP}/postgres"
POOL=f"postgresql://r1.{TENANT}:{PW}@{H}:{PLP}/postgres"
def snap():
    with psycopg.connect(f"postgresql://supabase_admin:{PW}@{H}:{DBP}/postgres") as c:
        return c.execute("select count(*) from pg_stat_activity where usename='r1'").fetchone()[0]
# P1: psycopg auto-prepare (prepare_threshold=5) via transaction pooler vs direct
for name,url in (("pooler",POOL),("direct",DIRECT)):
    errs=collections.Counter()
    def w():
        try:
            with psycopg.connect(url,autocommit=True) as c:
                for i in range(8): c.execute("select %s::int + 1",(i,)).fetchone()
        except Exception as e: errs[type(e).__name__+': '+str(e).splitlines()[0][:70]]+=1
    ts=[threading.Thread(target=w) for _ in range(10)]; [t.start() for t in ts]; [t.join() for t in ts]
    print(f"P1 psycopg {psycopg.__version__} default prepare_threshold=5, {name}: 10 conns x 8 runs ->",dict(errs) or "no errors")
    errs.clear()
    def w2():
        try:
            with psycopg.connect(url,autocommit=True,prepare_threshold=None) as c:
                for i in range(8): c.execute("select %s::int + 1",(i,)).fetchone()
        except Exception as e: errs[type(e).__name__+': '+str(e).splitlines()[0][:70]]+=1
    ts=[threading.Thread(target=w2) for _ in range(10)]; [t.start() for t in ts]; [t.join() for t in ts]
    print(f"   same with prepare_threshold=None, {name} ->",dict(errs) or "no errors")
