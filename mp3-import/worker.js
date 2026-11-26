importScripts('analysis.js');
self.onmessage = ({data}) => {
  try {
    const {samples} = data, A = MusicAnalysis, frames = [], onsets = [];
    let previousEnergy = 0, lastOnset = -1;
    for (let offset=0; offset + A.SIZE <= samples.length; offset+=A.HOP) {
      const t=offset/A.RATE;
      let energy=0;
      for(let i=0;i<A.HOP;i++) energy+=samples[offset+i]**2;
      if (energy > 0.01 && energy > previousEnergy*1.8 && t-lastOnset > 0.18) {onsets.push(t);lastOnset=t;}
      previousEnergy=energy;
      frames.push(A.pitch(samples,offset));
      if(frames.length%50===0) postMessage({progress:offset/samples.length});
    }
    const smooth=frames.map((n,i) => {
      const group=frames.slice(Math.max(0,i-1),i+2);
      const majority=group.find(v=>group.filter(x=>x===v).length>=2);
      return majority===undefined?n:majority;
    });
    const notes=[];
    for(let i=0;i<smooth.length;) {
      const start=i, note=smooth[i];
      while(i<smooth.length && smooth[i]===note)i++;
      if(note!==null && (i-start)*A.HOP/A.RATE>=0.06) notes.push({midi:note,start:start*A.HOP/A.RATE,end:i*A.HOP/A.RATE});
    }
    postMessage({notes,bpm:A.tempo(onsets)});
  } catch(error) {postMessage({error:error.message});}
};
