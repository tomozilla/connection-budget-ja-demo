import os, sys, threading, time, django
from django.conf import settings
H=os.environ.get("LAB_HOST","127.0.0.1");PW=os.environ.get("LAB_PASSWORD","postgres");DBP=os.environ.get("LAB_DB_PORT","54322")  # local CLI defaults
mode=sys.argv[1] if len(sys.argv)>1 else "request"   # request: close at the end like a web request; hold: never close (a long-lived thread)
settings.configure(DATABASES={'default':{'ENGINE':'django.db.backends.postgresql','NAME':'postgres','USER':'r1','PASSWORD':PW,'HOST':H,'PORT':DBP,'OPTIONS':{'pool':{'timeout':8} if mode=="hold" else True}}})
django.setup()
from django.db import connection
# Django 5.2 pool=True means psycopg_pool defaults: at most 4 connections, wait up to 30 s. 20 threads, each query 2 s.
res=[]; t0=time.time()
def w():
    s=time.time()
    try:
        with connection.cursor() as c: c.execute("select public.slow(2)")
        res.append(("ok",time.time()-s))
    except Exception as e: res.append((type(e).__name__,time.time()-s))
    finally:
        if mode=="request": connection.close()   # what the end of a request does; returns the connection to the pool
ts=[threading.Thread(target=w) for _ in range(20)];[t.start() for t in ts];[t.join() for t in ts]
ok=sorted(x[1] for x in res if x[0]=="ok"); bad=[x for x in res if x[0]!="ok"]
print(f"mode={mode}: {len(ok)} ok, {len(bad)} failed ({sorted(set(x[0] for x in bad))}); total {time.time()-t0:.1f}s"+(f"; per-thread time min {ok[0]:.1f}s median {ok[len(ok)//2]:.1f}s max {ok[-1]:.1f}s" if ok else ""))
