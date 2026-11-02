import sys, concurrent.futures as cf
from sqlalchemy import create_engine, text
from common import *
door = sys.argv[1]; K = 20
port = 5432 if door == 'session' else 6543
url = f'postgresql+psycopg://conn_probe.{REF}:{PW}@{HOST}:{port}/postgres?sslmode=require'
kw = {'connect_args': {'prepare_threshold': None}} if door == 'transaction' else {}
eng = create_engine(url, **kw)
def q(_):
    try:
        with eng.connect() as c: c.execute(text('select 1 as x from pg_sleep(1)')); return 'ok'
    except Exception as e: return str(e).split('\n')[0][:110]
def run():
    with cf.ThreadPoolExecutor(K) as ex: out = list(ex.map(q, range(K)))
    d = {}
    for o in out: d[o] = d.get(o, 0) + 1
    return d
measure(f'SQLAlchemy 2 default pool (5+10 overflow) {door} K={K} threads', run)
eng.dispose(); final()
