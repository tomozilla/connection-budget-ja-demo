const $ = (id) => document.getElementById(id);
const C = window.Calc;
for (const k of Object.keys(C.COMPUTE)) $('compute').add(new Option(k, k));
for (const d of C.DOORS) $('door').add(new Option(d, d));
for (const k of Object.keys(C.FRAMEWORKS)) $('framework').add(new Option(k, k));

function render() {
  const fw = C.FRAMEWORKS[$('framework').value];
  $('fwnote').textContent = fw.note;
  $('paramWrap').hidden = !fw.param;
  $('paramLabel').textContent = fw.param || '';
  const r = C.budget({
    compute: $('compute').value, poolSize: $('poolSize').value, instances: Number($('instances').value) || 1,
    framework: $('framework').value, param: $('param').value, door: $('door').value, servicesHeadroom: Number($('headroom').value) || 0,
  });
  $('nClients').textContent = r.clients; $('nBackend').textContent = r.backend; $('nTotal').textContent = r.total; $('nMax').textContent = r.maxConnections;
  $('findings').replaceChildren(...r.findings.map((f) => { const d = document.createElement('div'); d.className = 'f ' + f.level; d.textContent = f.text; return d; }));
}
$('compute').addEventListener('change', () => { const c = C.COMPUTE[$('compute').value]; if (c.defaultPool) $('poolSize').value = c.defaultPool; render(); });
for (const id of ['poolSize', 'door', 'framework', 'param', 'instances', 'headroom']) $(id).addEventListener('input', render);
$('f').addEventListener('submit', (e) => e.preventDefault());
render();
