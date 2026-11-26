(function (root) {
  'use strict';
  const RATE = 8000, HOP = 160, SIZE = 1024;
  function pitch(data, offset) {
    let energy = 0;
    for (let i = 0; i < SIZE; i++) energy += data[offset + i] ** 2;
    if (energy / SIZE < 0.00003) return null;
    // Normalized difference avoids choosing a multiple of the fundamental period.
    const diff = new Float64Array(180);
    let sum = 0;
    for (let lag = 1; lag < diff.length; lag++) {
      let d = 0;
      for (let i = 0; i < SIZE - 180; i++) d += (data[offset + i] - data[offset + i + lag]) ** 2;
      sum += d;
      diff[lag] = sum ? d * lag / sum : 1;
    }
    for (let lag = 8; lag < 178; lag++) {
      if (diff[lag] < 0.16) {
        while (lag < 178 && diff[lag + 1] < diff[lag]) lag++;
        const a = diff[lag - 1], b = diff[lag], c = diff[lag + 1];
        const denominator = 2 * (2 * b - c - a);
        const period = lag + (denominator ? (c - a) / denominator : 0);
        const midi = Math.round(69 + 12 * Math.log2(RATE / period / 440));
        return midi >= 36 && midi <= 96 ? midi : null;
      }
    }
    return null;
  }
  function tempo(onsets) {
    if (onsets.length < 4) return 120;
    const votes = new Map();
    for (let i = 1; i < onsets.length; i++) {
      const gap = onsets[i] - onsets[i - 1];
      if (gap < 0.15 || gap > 2) continue;
      let bpm = 60 / gap;
      while (bpm < 70) bpm *= 2;
      while (bpm > 180) bpm /= 2;
      bpm = Math.round(bpm);
      votes.set(bpm, (votes.get(bpm) || 0) + 1);
    }
    return [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] || 120;
  }
  function quantize(notes, bpm, duration) {
    if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) throw new Error('Темп должен быть от 40 до 240 BPM.');
    const step = 60 / bpm / 4;
    const columns = Math.max(16, Math.ceil(duration / step));
    const cells = new Set();
    for (const n of notes) {
      const start = Math.max(0, Math.round(n.start / step));
      const end = Math.min(columns, Math.max(start + 1, Math.round(n.end / step)));
      for (let c = start; c < end; c++) cells.add(`${c}:${n.midi}`);
    }
    return { cells, columns, step };
  }
  function midi(cells, bpm) {
    const events = [];
    const sorted = [...cells].map(k => k.split(':').map(Number)).sort((a,b) => a[1]-b[1] || a[0]-b[0]);
    for (let i = 0; i < sorted.length; i++) {
      const [start, note] = sorted[i]; let end = start + 1;
      while (i + 1 < sorted.length && sorted[i+1][1] === note && sorted[i+1][0] === end) { end++; i++; }
      events.push([start * 120, 0x90, note, 90], [end * 120, 0x80, note, 0]);
    }
    events.sort((a,b) => a[0]-b[0] || a[1]-b[1]);
    const us = Math.round(60000000 / bpm);
    const track = [0,255,81,3,(us>>16)&255,(us>>8)&255,us&255];
    const variable = value => { const out=[value&127]; while((value >>= 7)) out.unshift((value&127)|128); return out; };
    let time = 0;
    for (const [tick,...bytes] of events) { track.push(...variable(tick-time),...bytes); time=tick; }
    track.push(0,255,47,0);
    const len=track.length;
    return new Uint8Array([77,84,104,100,0,0,0,6,0,0,0,1,1,224,77,84,114,107,(len>>>24)&255,(len>>>16)&255,(len>>>8)&255,len&255].concat(track));
  }
  const api = { RATE, HOP, SIZE, pitch, tempo, quantize, midi };
  if (typeof module !== 'undefined') module.exports = api;
  else root.MusicAnalysis = api;
})(typeof self !== 'undefined' ? self : globalThis);
