'use strict';
const $ = id => document.getElementById(id), A = MusicAnalysis;
const canvas=$('grid'), ctx=canvas.getContext('2d'), W=22, H=18, LEFT=54, TOP=24;
let context, worker, notes=[], duration=2, cells=new Set(), columns=16, step=.125, sourceUrl, oscillators=[], timer;
function status(text){$('status').textContent=text;}
function draw(active=-1){
  canvas.width=LEFT+columns*W; canvas.height=TOP+61*H;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  for(let midi=96;midi>=36;midi--){
    const y=TOP+(96-midi)*H;
    ctx.fillStyle=[1,3,6,8,10].includes(midi%12)?'#edf0f7':'#fafbff';ctx.fillRect(LEFT,y,columns*W,H);
    ctx.fillStyle='#526078';ctx.font='11px system-ui';ctx.fillText(names[midi%12]+(Math.floor(midi/12)-1),4,y+13);
    ctx.strokeStyle='#e1e6ef';ctx.beginPath();ctx.moveTo(LEFT,y);ctx.lineTo(canvas.width,y);ctx.stroke();
  }
  for(let c=0;c<=columns;c++){
    ctx.strokeStyle=c%4===0?'#aebbd2':'#e1e6ef';ctx.beginPath();ctx.moveTo(LEFT+c*W,TOP);ctx.lineTo(LEFT+c*W,canvas.height);ctx.stroke();
    if(c%16===0){ctx.fillStyle='#526078';ctx.fillText(String(c/16+1),LEFT+c*W+3,16);}
  }
  for(const key of cells){const [c,m]=key.split(':').map(Number);ctx.fillStyle=`hsl(${(m%12)*30} 70% 52%)`;ctx.fillRect(LEFT+c*W+1,TOP+(96-m)*H+1,W-2,H-2);}
  if(active>=0){ctx.fillStyle='#365cde30';ctx.fillRect(LEFT+active*W,TOP,W,61*H);}
}
function stop(){for(const o of oscillators){try{o.stop();}catch{}}oscillators=[];clearInterval(timer);$('stop').disabled=true;draw();}
function requantize(){stop();const result=A.quantize(notes,Number($('bpm').value),duration);({cells,columns,step}=result);draw();}
canvas.addEventListener('click',e=>{
  if($('play').disabled)return;
  stop();const r=canvas.getBoundingClientRect(), c=Math.floor((e.clientX-r.left-LEFT)/W), m=96-Math.floor((e.clientY-r.top-TOP)/H);
  if(c<0||c>=columns||m<36||m>96)return;
  const key=`${c}:${m}`;cells.has(key)?cells.delete(key):cells.add(key);draw();
});
$('quantize').onclick=()=>{try{requantize();status('Сетка заново построена по распознанным нотам.');}catch(e){status(e.message);}};
$('bpm').onchange=()=>{stop();const bpm=Number($('bpm').value);if(bpm<40||bpm>240){$('bpm').value=120;}step=60/Number($('bpm').value)/4;};
$('stop').onclick=stop;
$('play').onclick=async()=>{
  try{
    stop();context ||= new AudioContext();await context.resume();
    const start=context.currentTime+.08, end=start+columns*step;
    for(const key of cells){
      const [c,m]=key.split(':').map(Number);
      if(cells.has(`${c-1}:${m}`))continue;
      let count=1;while(cells.has(`${c+count}:${m}`))count++;
      const t=start+c*step, length=count*step;
      const o=context.createOscillator(), gain=context.createGain();o.type='triangle';o.frequency.value=440*2**((m-69)/12);
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.1,t+.008);gain.gain.setValueAtTime(.1,t+Math.max(.01,length-.02));gain.gain.linearRampToValueAtTime(0,t+length);
      o.connect(gain).connect(context.destination);o.start(t);o.stop(t+length+.01);o.onended=()=>{o.disconnect();gain.disconnect();};oscillators.push(o);
    }
    $('stop').disabled=false;
    timer=setInterval(()=>{if(context.currentTime>=end){stop();return;}draw(Math.floor((context.currentTime-start)/step));},45);
  }catch(e){status('Не удалось воспроизвести: '+e.message);}
};
$('save').onclick=()=>{
  const url=URL.createObjectURL(new Blob([A.midi(cells,Number($('bpm').value))],{type:'audio/midi'}));
  const link=document.createElement('a');link.href=url;link.download='melody.mid';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('file').onchange=async()=>{
  const file=$('file').files[0];if(!file)return;
  stop();if(worker)worker.terminate();
  if(file.size>30*1024*1024){status('Выбери файл размером до 30 МБ.');return;}
  $('file').disabled=true;for(const id of ['play','save','quantize'])$(id).disabled=true;
  $('progress').hidden=false;$('progress').value=0;status('Читаю аудио…');
  function finish(){ $('file').disabled=false;$('progress').hidden=true; }
  try{
    context ||= new AudioContext();const buffer=await context.decodeAudioData(await file.arrayBuffer());
    if(buffer.duration>90)throw new Error('Запись длиннее 90 секунд. Сначала обрежь нужный фрагмент.');
    duration=buffer.duration;
    const offline=new OfflineAudioContext(1,Math.ceil(duration*A.RATE),A.RATE);
    const source=offline.createBufferSource();source.buffer=buffer;source.connect(offline.destination);source.start();
    const mono=await offline.startRendering(), samples=mono.getChannelData(0);
    if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=URL.createObjectURL(file);$('original').src=sourceUrl;
    status('Определяю мелодию и темп…');worker=new Worker('mp3-import/worker.js');
    worker.onerror=()=>{status('Ошибка анализа. Открой приложение через HTTP-сервер, а не двойным щелчком по файлу.');worker.terminate();finish();};
    worker.onmessage=({data})=>{
      if(data.progress!==undefined){$('progress').value=data.progress;return;}
      worker.terminate();finish();
      if(data.error){status(data.error);return;}
      notes=data.notes;$('bpm').value=data.bpm;requantize();
      for(const id of ['play','save','quantize'])$(id).disabled=false;
      status(notes.length?`Готово: ${notes.length} нотных событий. Предполагаемый темп ${data.bpm} BPM — проверь на слух. Результат можно исправить в сетке.`:'Уверенные ноты не найдены. Попробуй запись с одним инструментом или нарисуй мелодию в сетке.');
    };
    worker.postMessage({samples},[samples.buffer]);
  }catch(e){status('Не удалось обработать файл: '+e.message);finish();}
};
draw();
