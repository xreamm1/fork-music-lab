const assert=require('node:assert/strict');
const A=require('./analysis.js');
for(const midi of [40,48,60,69,72,84]){
  const frequency=440*2**((midi-69)/12);
  const data=Float32Array.from({length:A.SIZE},(_,i)=>.4*Math.sin(2*Math.PI*frequency*i/A.RATE));
  assert.equal(A.pitch(data,0),midi,`pitch ${midi}`);
}
assert.equal(A.pitch(new Float32Array(A.SIZE),0),null);
assert.equal(A.tempo([0,.5,1,1.5,2]),120);
const q=A.quantize([{midi:69,start:0,end:.5}],120,1);
assert.equal(q.cells.size,4);assert.equal(q.step,.125);
assert.throws(()=>A.quantize([],0,1));
const bytes=A.midi(q.cells,120);
assert.equal(Buffer.from(bytes.slice(0,4)).toString(),'MThd');
assert.deepEqual([...bytes.slice(-4)],[0,255,47,0]);
assert.equal(bytes.filter(x=>x===0x90).length,1,'adjacent cells must merge');
console.log('Pitch, silence, tempo, quantization and MIDI checks passed.');
