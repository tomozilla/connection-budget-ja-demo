import os, threading, time
H=os.environ.get("LAB_HOST","127.0.0.1");PW=os.environ.get("LAB_PASSWORD","postgres");DBP=os.environ.get("LAB_DB_PORT","54322")  # local CLI defaults
URL=f"postgresql://r1:{PW}@{H}:{DBP}/postgres"
import psycopg, psycopg_pool
# psycopg_pool: max_size 2, six 3 s queries; the default wait for a connection is 30 s, here timeout=4 to show the error text quickly
pool=psycopg_pool.ConnectionPool(URL,min_size=2,max_size=2,timeout=4,open=True); t0=time.time(); out=[]
def w(i):
    try:
        with pool.connection() as c: c.execute("select public.slow(3)").fetchone(); out.append(f"q{i} ok at {time.time()-t0:.1f}s")
    except Exception as e: out.append(f"q{i} {type(e).__name__}: {str(e)[:60]} at {time.time()-t0:.1f}s")
ts=[threading.Thread(target=w,args=(i,)) for i in range(1,7)];[t.start() for t in ts];[t.join() for t in ts]
print("psycopg_pool max 2, timeout=4 (default 30):"); print("\n".join(sorted(out))); pool.close()
# SQLAlchemy: pool_size 1, no overflow, timeout=2 (default 30)
from sqlalchemy import create_engine,text
e=create_engine(URL.replace("postgresql://","postgresql+psycopg://"),pool_size=1,max_overflow=0,pool_timeout=2); out=[]
def w2(i):
    try:
        with e.connect() as c: c.execute(text("select public.slow(3)")); out.append(f"q{i} ok at {time.time()-t0:.1f}s")
    except Exception as x: out.append(f"q{i} {type(x).__name__}: {str(x).splitlines()[0][:70]} at {time.time()-t0:.1f}s")
t0=time.time(); ts=[threading.Thread(target=w2,args=(i,)) for i in range(1,4)];[t.start() for t in ts];[t.join() for t in ts]
print("SQLAlchemy pool_size 1, pool_timeout=2 (default 30):"); print("\n".join(sorted(out)))
