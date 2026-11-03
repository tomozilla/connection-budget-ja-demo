import {snap,sleep,API_URL} from './lib.mjs'
const N=+process.argv[2]||40,S=+process.argv[3]||4
const t0=Date.now();const out=[]
const w=Array.from({length:N},async()=>{const t=Date.now();const r=await fetch(`${API_URL}/rpc/slow`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({s:S})});const b=await r.text();out.push({st:r.status,s:+((Date.now()-t)/1000).toFixed(1),code:(b.match(/"code":"(\w+)"/)||['',''])[1]})})
await sleep(2000);console.log('backends at 2s',JSON.stringify((await snap()).by))
await Promise.all(w)
const g={};out.forEach(o=>{const k=o.st+' '+o.code;(g[k]=g[k]||[]).push(o.s)})
for(const k in g)console.log(k,'x',g[k].length,'latency s min',Math.min(...g[k]),'max',Math.max(...g[k]))
