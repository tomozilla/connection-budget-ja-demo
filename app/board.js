const $ = (id) => document.getElementById(id);
const C = window.Calc;
const lang = document.documentElement.lang === 'ja' ? 'ja' : 'en';
for (const k of Object.keys(C.COMPUTE)) $('compute').add(new Option(k, k));
for (const d of C.DOORS) $('door').add(new Option(d, d));
for (const k of Object.keys(C.FRAMEWORKS)) $('framework').add(new Option(k, k));
$('door').value = 'transaction pooler (6543)';

function render() {
  const fw = C.FRAMEWORKS[$('framework').value];
  const tx = C.fwText($('framework').value, lang);
  $('fwnote').textContent = tx.note || '';
  $('paramWrap').hidden = !fw.param;
  $('paramLabel').textContent = tx.param || '';
  const r = C.budget({
    lang, compute: $('compute').value, poolSize: $('poolSize').value, instances: Number($('instances').value) || 1,
    framework: $('framework').value, param: $('param').value, door: $('door').value, roles: $('roles').value, modes: $('modes').value,
    usesDataApi: $('usesDataApi').value === '1', otherServices: $('other').value, qps: $('qps').value, queryMs: $('queryMs').value,
  });
  $('nClients').textContent = r.clients; $('nBackend').textContent = r.backend; $('nTotal').textContent = r.total; $('nMax').textContent = r.maxConnections;
  $('findings').replaceChildren(...r.findings.map((f) => { const d = document.createElement('div'); d.className = 'f ' + f.level; d.textContent = f.text; return d; }));
}
$('compute').addEventListener('change', () => { $('poolSize').value = C.COMPUTE[$('compute').value].defaultPool; render(); });
for (const id of ['poolSize', 'door', 'framework', 'param', 'instances', 'roles', 'modes', 'usesDataApi', 'other', 'qps', 'queryMs']) $(id).addEventListener('input', render);
$('f').addEventListener('submit', (e) => e.preventDefault());
render();
