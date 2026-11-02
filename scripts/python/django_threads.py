import sys, concurrent.futures as cf
import django
from django.conf import settings
from common import *
door = sys.argv[1]; K = 20
port = 5432 if door == 'session' else 6543
settings.configure(DATABASES={'default': {'ENGINE': 'django.db.backends.postgresql', 'NAME': 'postgres', 'USER': f'conn_probe.{REF}', 'PASSWORD': PW, 'HOST': HOST, 'PORT': str(port),
    'OPTIONS': {'sslmode': 'require'}, 'DISABLE_SERVER_SIDE_CURSORS': door == 'transaction'}}, USE_TZ=True)
django.setup()
from django.db import connection, connections
def q(_):
    try:
        with connection.cursor() as c: c.execute('select 1 as x from pg_sleep(1)'); c.fetchall()
        return 'ok'
    except Exception as e: return str(e).split('\n')[0][:110]
    finally: connections.close_all()
def run():
    with cf.ThreadPoolExecutor(K) as ex: out = list(ex.map(q, range(K)))
    d = {}
    for o in out: d[o] = d.get(o, 0) + 1
    return d
print('CONN_MAX_AGE default =', settings.DATABASES['default'].get('CONN_MAX_AGE', 0))
measure(f'Django 4.2 default (one connection per thread, CONN_MAX_AGE=0) {door} K={K} threads', run)
final()
