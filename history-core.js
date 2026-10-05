/* Pure history aggregation. Does not contact Firebase. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./race-core.js'));
  else root.PlankHistory = factory(root.PlankCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';
  const validStop = time => !!(time && Number.isFinite(time.startedAt) && Number.isFinite(time.stoppedAt) && time.stoppedAt >= time.startedAt);
  function collect(uid, soloData, roomsData) {
    const planks = [], races = [];
    Object.entries(soloData || {}).forEach(([key, time]) => {
      if (!validStop(time)) return;
      planks.push({id:`solo:${key}`,source:'solo',start:time.startedAt,end:time.stoppedAt,ms:time.stoppedAt-time.startedAt});
    });
    Object.entries(roomsData || {}).forEach(([roomId, room]) => {
      if (!room || !room.meta) return;
      const versions = {...(room.rounds || {})};
      // Old v2 rooms retain only their latest round, because earlier rounds were overwritten.
      if (room.times && Object.keys(room.times).length) {
        const key = String(room.meta.round);
        if (!versions[key] || !versions[key].times) versions[key] = {times:room.times,legacy:true};
      }
      Object.entries(versions).forEach(([round, roundData]) => {
        const roundTimes = (roundData || {}).times || {};
        const own = roundTimes[uid];
        const finished = Object.entries(roundTimes).filter(([,time]) => validStop(time));
        if (!own || !finished.length) return;
        if (validStop(own)) planks.push({id:`race:${roomId}:${round}:${uid}`,source:'race',roomId,round:Number(round),start:own.startedAt,end:own.stoppedAt,ms:own.stoppedAt-own.startedAt});
        const sorted = Object.entries(roundTimes).filter(([,t]) => t && Number.isFinite(t.startedAt))
          .map(([id,time]) => ({uid:id,name:(room.players && room.players[id] && room.players[id].name) || 'Player',ms:validStop(time) ? time.stoppedAt-time.startedAt : null,complete:validStop(time)}))
          .sort((a,b) => (b.ms === null ? -Infinity : b.ms) - (a.ms === null ? -Infinity : a.ms));
        const fullyFinished = sorted.every(p => p.complete);
        const winners = fullyFinished && sorted.length >= 2 ? Core.findWinner(room.players || {},roundTimes,Number(round)) : null;
        // A fully finished room with one player is practice, not a race victory.
        const high = Math.max(...finished.map(([,t])=>t.stoppedAt));
        races.push({id:`${roomId}:${round}`,roomId,round:Number(round),date:high,players:sorted,winnerIds:winners?winners.winners.map(x=>x.uid):[],complete:fullyFinished,legacy:!!roundData.legacy});
      });
    });
    planks.sort((a,b)=>b.end-a.end);
    races.sort((a,b)=>b.date-a.date);
    const totalMs=planks.reduce((n,p)=>n+p.ms,0);
    const best=planks.length?Math.max(...planks.map(p=>p.ms)):0;
    const won=races.filter(r=>r.complete && r.winnerIds.includes(uid)).length;
    return {planks,races,stats:{best,totalMs,total:planks.length,solo:planks.filter(p=>p.source==='solo').length,racesWon:won,racesFinished:races.filter(r=>r.complete).length}};
  }
  function groupByDate(items, key) {
    const groups=[], seen=new Map();
    for (const item of items) {
      const d=new Date(item[key]);
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (!seen.has(k)) {const group={key:k,label:d.toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}),items:[]};seen.set(k,group);groups.push(group);}
      seen.get(k).items.push(item);
    }
    return groups;
  }
  return {collect,groupByDate,validStop};
});
