import {spawn} from 'child_process'; import {fileURLToPath} from 'url'; import {snap,sleep} from './lib.mjs'
const P=+process.argv[2], door=process.argv[3]
const kids=Array.from({length:P},()=>spawn('node',[fileURLToPath(new URL('./08-instances-child.mjs',import.meta.url)),door],{stdio:'ignore'}))
await sleep(3500);const s=await snap();console.log(`${P} processes x pool max 10 via ${door}: backends r1=${s.by.r1||0}, total=${s.total}`,JSON.stringify(s.by))
await Promise.all(kids.map(k=>new Promise(r=>k.on('exit',r))))
