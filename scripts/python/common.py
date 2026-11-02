import json, time, threading, urllib.request, sys, os
# Configuration comes from environment variables only: PROJECT_REF, POOLER_HOST, PROBE_PASSWORD, PUBLISHABLE_KEY
def need(k):
    if k not in os.environ: sys.exit('missing env var ' + k)
    return os.environ[k]
REF = need('PROJECT_REF'); PUB = need('PUBLISHABLE_KEY'); PW = need('PROBE_PASSWORD'); HOST = need('POOLER_HOST')
def stats():
    req = urllib.request.Request(f'https://{REF}.supabase.co/rest/v1/rpc/conn_stats', data=b'{}', headers={'apikey': PUB, 'content-type': 'application/json'})
    rows = json.load(urllib.request.urlopen(req, timeout=10))
    s = lambda u: sum(int(r['n']) for r in rows if r['usename'] == u)
    return {'probe': s('conn_probe'), 'auth': s('authenticator'), 'total': sum(int(r['n']) for r in rows)}
def measure(label, fn):
    before = stats(); peak = {'p': 0}; stop = {'v': False}
    def poll():
        while not stop['v']:
            try: peak['p'] = max(peak['p'], stats()['probe'])
            except Exception: pass
            time.sleep(0.2)
    th = threading.Thread(target=poll, daemon=True); th.start()
    killer = threading.Timer(25, lambda: (print(json.dumps({'label': label, 'TIMEOUT_after_s': 25, 'peakProbe': peak['p']})), os._exit(3))); killer.start()
    t0 = time.time(); res = None; err = None
    try: res = fn()
    except Exception as e: err = str(e)[:160]
    killer.cancel(); ms = int((time.time() - t0) * 1000)
    time.sleep(1.5); stop['v'] = True; th.join(); time.sleep(1.5)
    print(json.dumps({'label': label, 'ms': ms, 'err': err, 'res': res, 'before': before, 'peakProbe': peak['p'], 'after': stats()}))
def final():
    time.sleep(3); print('final-after-close', json.dumps(stats()))
