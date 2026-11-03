import os
H=os.environ.get("LAB_HOST","127.0.0.1");PW=os.environ.get("LAB_PASSWORD","postgres");DBP=os.environ.get("LAB_DB_PORT","54322");PLP=os.environ.get("LAB_POOLER_PORT","54329");TENANT=os.environ.get("LAB_TENANT","pooler-dev")  # local CLI defaults
import threading,time,django,psycopg
from django.conf import settings
def run(label,opts,age=0):
    settings.configure(DATABASES={'default':{'ENGINE':'django.db.backends.postgresql','NAME':'postgres','USER':'r2','PASSWORD':PW,'HOST':H,'PORT':DBP,'CONN_MAX_AGE':age,'OPTIONS':opts}})
    django.setup()
    from django.db import connection
    def w():
        with connection.cursor() as c: c.execute("select 1 from pg_sleep(2)")
        connection.close()  # what a finished request does (CONN_MAX_AGE=0)
    ts=[threading.Thread(target=w) for _ in range(20)];[t.start() for t in ts];time.sleep(1.2)
    with psycopg.connect(f"postgresql://supabase_admin:{PW}@{H}:{DBP}/postgres") as c: n=c.execute("select count(*) from pg_stat_activity where usename='r2'").fetchone()[0]
    print(f"P3 Django {django.__version__} {label}: 20 threads x 2s -> backends at 1.2s =",n);[t.join() for t in ts]
import sys
run('default (no pool, CONN_MAX_AGE=0)',{}) if sys.argv[1]=='plain' else run('OPTIONS pool=True',{'pool':True})
