/* Pure stopwatch and race calculations. Testable without Firebase or a browser. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PlankCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function formatTime(milliseconds) {
    const cs = Math.max(0, Math.floor((Number(milliseconds) || 0) / 10));
    const seconds = Math.floor(cs / 100);
    return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}.${String(cs % 100).padStart(2,'0')}`;
  }
  function getStatus(time, round) {
    if (!time || time.round !== round || !Number.isFinite(time.startedAt)) return 'ready';
    return Number.isFinite(time.stoppedAt) ? 'finished' : 'running';
  }
  function getDuration(time, round, now) {
    const status = getStatus(time, round);
    if (status === 'ready') return 0;
    return Math.max(0, (status === 'finished' ? time.stoppedAt : now) - time.startedAt);
  }
  function findWinner(players, times, round) {
    const completed = [], active = [];
    Object.entries(players || {}).forEach(([uid, player]) => {
      const time = (times || {})[uid];
      const status = getStatus(time, round);
      if (status === 'running') active.push(uid);
      if (status === 'finished') completed.push({uid, name: player.name, ms: getDuration(time, round, 0)});
    });
    if (active.length || completed.length < 2) return null;
    completed.sort((a,b) => b.ms-a.ms);
    const top = completed.filter(p => p.ms === completed[0].ms);
    return {winners:top, duration:completed[0].ms, tie:top.length > 1};
  }
  function cleanName(name) {return String(name || '').trim().replace(/\s+/g,' ').slice(0,32);}
  function escapeHtml(text) {return String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function roomUrl(url, roomId) {const u=new URL(url);u.searchParams.set('room',roomId);u.hash='';return u.toString();}
  function canStart(old, round) {return getStatus(old, round)==='ready';}
  function canStop(old, round) {return getStatus(old, round)==='running';}
  return {formatTime,getStatus,getDuration,findWinner,cleanName,escapeHtml,roomUrl,canStart,canStop};
});
