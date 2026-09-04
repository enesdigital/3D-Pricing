const assert = (c: boolean, msg: string) => { if (!c) { console.error('FAIL:', msg); process.exit(1) } }
import { computeThickness, thinFraction } from '../src/lib/mesh/thickness.ts'
const box = (x: number, y: number, z: number) => { const P=(a:number,b:number,c:number)=>[a,b,c]; const q=(a:number[],b:number[],c:number[],d:number[])=>[...a,...b,...c,...a,...c,...d]; return new Float32Array([
  ...q(P(0,0,0),P(0,y,0),P(x,y,0),P(x,0,0)), ...q(P(0,0,z),P(x,0,z),P(x,y,z),P(0,y,z)),
  ...q(P(0,0,0),P(x,0,0),P(x,0,z),P(0,0,z)), ...q(P(x,0,0),P(x,y,0),P(x,y,z),P(x,0,z)),
  ...q(P(x,y,0),P(0,y,0),P(0,y,z),P(x,y,z)), ...q(P(0,y,0),P(0,0,0),P(0,0,z),P(0,y,z))]) }
for (const [x,y,z] of [[10,10,10],[100,100,1],[50,50,0.4]]) {
  const t0 = performance.now(); const th = computeThickness(box(x,y,z), 5000)
  assert(Math.abs(th.p50 - Math.min(x, y, z)) < 0.05 * Math.min(x, y, z) + 0.05, `kutu ${x}x${y}x${z}: medyan kalınlık en küçük kenara eşit olmalı (${th.p50.toFixed(2)})`)
  console.log(`kutu ${x}x${y}x${z}: p5=${th.p5.toFixed(2)} p50=${th.p50.toFixed(2)} mm | ince<0.8: %${(100*thinFraction(th,0.8)).toFixed(0)} | ${(performance.now()-t0).toFixed(0)} ms`)
}
console.log('thickness: OK')
