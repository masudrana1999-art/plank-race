/* Plank Race: GitHub Pages + Firebase Realtime Database, no backend server. */
(() => {
  'use strict';
  const C = window.PlankCore;
  const $ = id => document.getElementById(id);
  const query = new URLSearchParams(location.search);
  let roomId = query.get('room');
  let database, auth, uid = null, meta = null, players = {}, times = {};
  let connected = false, clockReady = false, clockRemoteBase = 0, clockPerfBase = 0;
  let pendingAction = '', optimisticTime = null, pendingStop = null;
  let joined = false, toastTimer = null, lastPaint = 0;
  const roomPattern = /^[a-z0-9]{12,20}$/;

  function show(view) {
    ['setupView','joinView','raceView'].forEach(id => $(id).classList.toggle('hidden', id !== view));
  }
  function setConnection(label, status) {
    $('connectionText').textContent = label;
    $('connectionPill').classList.toggle('online', status === 'online');
    $('connectionPill').classList.toggle('offline', status === 'offline');
  }
  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 4500);
  }
  function niceError(error) {
    const code = error && error.code || '';
    if (code === 'PERMISSION_DENIED' || code === 'database/permission-denied')
      return 'Firebase denied access. Check that you published database.rules.json and enabled Anonymous Authentication.';
    if (code === 'auth/operation-not-allowed') return 'Enable Anonymous in Firebase Authentication > Sign-in method.';
    if (code === 'auth/unauthorized-domain') return 'Add this website domain to Firebase Authentication > Settings > Authorized domains.';
    if (code === 'auth/network-request-failed') return 'Cannot contact Firebase. Check the connection and try again.';
    return (error && error.message) || 'Something went wrong. Try again.';
  }
  function serverNow() {
    return clockReady ? clockRemoteBase + (performance.now() - clockPerfBase) : Date.now();
  }
  function setClockOffset(offset) {
    clockRemoteBase = Date.now() + Number(offset || 0);
    clockPerfBase = performance.now();
    clockReady = true;
  }
  function randomRoomId() {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
  }
  function roomPath() {return `rooms/${roomId}`;}
  function isHost() {return !!(meta && uid && meta.hostUid === uid);}
  function currentRound() {return meta ? meta.round : -1;}
  function timeFor(playerUid) {
    if (playerUid === uid && optimisticTime && meta && optimisticTime.round === meta.round) return optimisticTime;
    return times[playerUid] || null;
  }
  function getPendingStopKey() {return `plank-stop:${roomId}:${uid}`;}
  function restorePendingStop() {
    try {pendingStop = JSON.parse(localStorage.getItem(getPendingStopKey()) || 'null');}
    catch (_) {pendingStop = null;}
    if (pendingStop && (!meta || pendingStop.round !== meta.round)) clearPendingStop();
    if (pendingStop) {pendingAction = 'stop';optimisticTime = pendingStop;}
  }
  function clearPendingStop() {
    if (uid && roomId) localStorage.removeItem(getPendingStopKey());
    pendingStop = null;
  }
  function startConnectionListeners() {
    database.ref('.info/connected').on('value', snap => {
      connected = snap.val() === true;
      setConnection(connected ? 'Live connected' : 'Reconnecting', connected ? 'online' : 'offline');
      render();
      if (connected && joined && roomId) flushPendingStop();
    });
    database.ref('.info/serverTimeOffset').on('value', snap => setClockOffset(snap.val()));
  }
  async function bootstrap() {
    show('setupView');
    const config = window.PLANK_FIREBASE_CONFIG;
    if (!config || !config.apiKey || /PASTE_|YOUR_|HERE/.test([config.apiKey,config.projectId,config.databaseURL,config.appId].join(' '))) {
      setConnection('Setup needed', 'offline');
      return;
    }
    if (!window.firebase || !firebase.auth || !firebase.database) {
      $('setupError').textContent = 'Firebase JavaScript SDK could not load. Check your internet connection or browser blockers.';
      $('setupError').classList.remove('hidden');
      setConnection('SDK unavailable', 'offline');
      return;
    }
    try {
      firebase.initializeApp(config);
      auth = firebase.auth();
      database = firebase.database();
      await auth.signInAnonymously();
      uid = auth.currentUser.uid;
      startConnectionListeners();
      if (roomId !== null && !roomPattern.test(roomId)) {
        $('setupError').textContent = 'This race link has an invalid room ID. Open the main website to create a new race.';
        $('setupError').classList.remove('hidden');
        return;
      }
      if (!roomId) {configureJoin(false);return;}
      const roomRef = database.ref(roomPath());
      const existing = await roomRef.child('meta').once('value');
      if (!existing.exists()) {
        $('setupError').textContent = 'This race does not exist. Ask for the latest invitation, or open the website without ?room= to create a new one.';
        $('setupError').classList.remove('hidden');
        return;
      }
      const previous = await roomRef.child(`players/${uid}`).once('value');
      if (previous.exists()) {
        joined = true;
        watchRoom();
      } else {
        configureJoin(true);
      }
    } catch (error) {
      $('setupError').textContent = niceError(error);
      $('setupError').classList.remove('hidden');
      setConnection('Connection error', 'offline');
    }
  }
  function configureJoin(invited) {
    $('joinCaption').textContent = invited ? 'YOU HAVE BEEN INVITED' : 'NEW CHALLENGE';
    $('joinTitle').textContent = invited ? 'Join the challenge.' : 'Enter the arena.';
    $('joinSubtitle').textContent = invited ? 'Enter your name to compete with your friends.' : 'Pick a name to create your race.';
    $('joinButton').innerHTML = invited ? 'Join race <span aria-hidden="true">↗</span>' : 'Create race <span aria-hidden="true">↗</span>';
    $('nameInput').value = localStorage.getItem('plank-name') || '';
    show('joinView');
    $('nameInput').focus();
  }
  $('joinForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = C.cleanName($('nameInput').value);
    $('joinError').textContent = '';
    if (!name) {$('joinError').textContent = 'Please enter your name.';return;}
    if (!connected) {$('joinError').textContent = 'Waiting for Firebase to connect. Try again in a moment.';return;}
    $('joinButton').disabled = true;
    try {
      if (!roomId) {
        // A random invite room is created only after the host joins.
        let created = false;
        for (let tries = 0; tries < 3 && !created; tries++) {
          roomId = randomRoomId();
          const result = await database.ref(`${roomPath()}/meta`).transaction(value =>
            value === null ? {hostUid: uid, round: 1, createdAt: firebase.database.ServerValue.TIMESTAMP} : undefined,
            undefined, false);
          created = result.committed;
        }
        if (!created) throw new Error('Could not create a new room. Please retry.');
      }
      await database.ref(`${roomPath()}/players/${uid}`).set({name,joinedAt:firebase.database.ServerValue.TIMESTAMP});
      localStorage.setItem('plank-name',name);
      joined = true;
      history.replaceState(null, '', C.roomUrl(location.href, roomId));
      watchRoom();
    } catch (error) {
      $('joinError').textContent = niceError(error);
      // If room creation succeeded but join failed, retain the roomId to retry.
    } finally {
      $('joinButton').disabled = false;
    }
  });

  function watchRoom() {
    show('raceView');
    database.ref(roomPath()).on('value', snap => {
      const state = snap.val() || {};
      const oldRound = meta && meta.round;
      meta = state.meta || null;
      players = state.players || {};
      times = state.times || {};
      if (pendingStop && meta && pendingStop.round !== meta.round) {
        clearPendingStop();pendingAction = '';optimisticTime = null;
        toast('A new round started before your stop could sync.');
      }
      if (oldRound && meta && oldRound !== meta.round) {
        pendingAction = '';optimisticTime = null;
      }
      if (!pendingStop && uid) restorePendingStop();
      if (pendingStop && C.getStatus(times[uid],currentRound()) === 'finished') {
        clearPendingStop();pendingAction = '';optimisticTime = null;
      }
      render();
      if (connected) flushPendingStop();
    }, error => toast(niceError(error)));
  }

  function render() {
    if (!joined || !meta) return;
    $('roundLabel').textContent = `/ ROUND ${String(meta.round).padStart(2, '0')}`;
    const count = Object.keys(players).length;
    $('participantCount').textContent = `${count} competitor${count === 1 ? '' : 's'}`;
    $('resetBtn').classList.toggle('hidden', !isHost());
    const winner = C.findWinner(players,times,meta.round);
    $('winnerBanner').classList.toggle('hidden', !winner);
    if (winner) {
      $('winnerText').textContent = winner.tie ? `${winner.winners.map(p=>p.name).join(' & ')} tie!` : `${winner.winners[0].name} wins!`;
      $('winnerDetail').textContent = `Longest plank: ${C.formatTime(winner.duration)}`;
    }
    const entries = Object.entries(players).sort((a,b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
    $('playerGrid').innerHTML = entries.map(([id,player]) => {
      const mine = id === uid;
      const time = timeFor(id);
      const status = C.getStatus(time,currentRound());
      const winning = !!(winner && winner.winners.some(p => p.uid === id));
      const stateClass = status === 'finished' ? 'finished' : status === 'running' ? 'running' : '';
      const statusText = status === 'ready' ? 'Ready to plank' : status === 'running' ? 'Holding strong' : 'Finished';
      const action = status === 'ready' ? 'start' : status === 'running' ? 'stop' : '';
      let notes = mine ? 'Your stopwatch' : 'Watching live';
      if (mine && pendingAction === 'start') notes = 'Saving start…';
      if (mine && pendingStop) notes = connected ? 'Syncing your stop…' : 'Stop saved on this device';
      const disabled = !mine || !action || !!pendingAction || (action === 'start' && (!connected || !clockReady));
      let control = mine && action ? `<button type="button" data-action="${action}" class="button ${action === 'stop' ? 'button-danger' : 'button-primary'}" ${disabled ? 'disabled' : ''}>${action === 'stop' ? 'Stop timer ■' : 'Start timer ▶'}</button>` : '';
      if (mine && status === 'finished') control = `<span class="tag">Finished</span>`;
      const metaTags = [mine ? '<span class="tag me">YOU</span>' : '',meta.hostUid === id ? '<span class="tag">HOST</span>' : ''].join('');
      return `<article class="player-card ${mine ? 'mine' : ''} ${winning ? 'winner-card' : ''}">
        <div class="player-top"><div style="min-width:0"><h3 class="player-name">${C.escapeHtml(player.name || 'Player')}</h3><div class="player-meta">${mine ? 'Your card' : 'Competitor'}</div></div><div class="player-badges">${metaTags}</div></div>
        <div class="timer ${stateClass}" data-timer-id="${C.escapeHtml(id)}">${C.formatTime(C.getDuration(time,currentRound(),serverNow()))}</div>
        <div class="timer-status ${stateClass}"><span class="status-dot"></span>${statusText}</div>
        <div class="player-actions"><span class="player-actions-note">${notes}</span>${control}</div></article>`;
    }).join('');
  }
  function animate(timestamp) {
    if (timestamp - lastPaint >= 30 && joined && meta) {
      lastPaint = timestamp;
      const now = serverNow();
      $('playerGrid').querySelectorAll('[data-timer-id]').forEach(timer => {
        const time = timeFor(timer.getAttribute('data-timer-id'));
        if (C.getStatus(time,meta.round) === 'running') {
          timer.textContent = C.formatTime(C.getDuration(time,meta.round,now));
        }
      });
    }
    requestAnimationFrame(animate);
  }
  $('playerGrid').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;
    if (btn.dataset.action === 'start') startMyTimer();
    if (btn.dataset.action === 'stop') stopMyTimer();
  });
  async function startMyTimer() {
    if (!meta || !uid || !connected || !clockReady || pendingAction) return;
    const round = currentRound();
    if (!C.canStart(times[uid],round)) return;
    const startedAt = Math.round(serverNow());
    const draft = {round,startedAt};
    optimisticTime = draft;pendingAction = 'start';render();
    try {
      const outcome = await database.ref(`${roomPath()}/times/${uid}`).transaction(existing =>
        C.canStart(existing,round) ? draft : undefined, undefined, false);
      if (!outcome.committed) toast('This race changed. Refresh if the timer does not appear.');
    } catch (error) {toast(niceError(error));}
    finally {if (pendingAction === 'start') {pendingAction = '';optimisticTime = null;}render();}
  }
  function stopMyTimer() {
    if (!meta || !uid || pendingAction) return;
    const round = currentRound();
    const time = times[uid];
    if (!C.canStop(time,round)) return;
    const stoppedAt = Math.max(time.startedAt,Math.round(serverNow()));
    pendingStop = {round,startedAt:time.startedAt,stoppedAt};
    optimisticTime = pendingStop;
    pendingAction = 'stop';
    // Preserve the actual button press, even if Firebase is temporarily offline.
    localStorage.setItem(getPendingStopKey(),JSON.stringify(pendingStop));
    render();
    flushPendingStop();
  }
  let flushing = false;
  async function flushPendingStop() {
    if (flushing || !connected || !pendingStop || !meta || !uid) return;
    const entry = {...pendingStop};
    if (entry.round !== meta.round) return;
    flushing = true;
    try {
      const outcome = await database.ref(`${roomPath()}/times/${uid}`).transaction(existing => {
        if (!C.canStop(existing,entry.round)) return undefined;
        return {...existing,stoppedAt:Math.max(existing.startedAt,entry.stoppedAt)};
      },undefined,false);
      if (outcome.committed || C.getStatus(outcome.snapshot.val(),entry.round)==='finished') {
        clearPendingStop();pendingAction = '';optimisticTime = null;
      } else toast('Stop was not accepted. It may have been reset; check the round.');
    } catch (error) {if (connected) toast(niceError(error));}
    finally {flushing = false;render();}
  }
  $('resetBtn').addEventListener('click',async () => {
    if (!meta || !isHost() || !connected) return;
    if (!confirm('Start a new round? This will clear the current times for everyone.')) return;
    $('resetBtn').disabled = true;
    try {
      const result = await database.ref(`${roomPath()}/meta`).transaction(old => {
        if (!old || old.hostUid !== uid) return undefined;
        return {...old,round:old.round + 1};
      },undefined,false);
      if (result.committed) toast('New round started. Everyone can plank again.');
    } catch (error) {toast(niceError(error));}
    finally {$('resetBtn').disabled = false;}
  });
  $('copyLinkBtn').addEventListener('click',async () => {
    if (!roomId) return;
    const link = C.roomUrl(location.href,roomId);
    try {
      await navigator.clipboard.writeText(link);
      toast('Invite link copied. Send it to your friends!');
    } catch (_) {
      const input = document.createElement('textarea');
      input.value=link;document.body.appendChild(input);input.select();
      const copied = document.execCommand('copy');input.remove();
      toast(copied ? 'Invite link copied!' : `Copy this link: ${link}`);
    }
  });
  $('newRoomBtn').addEventListener('click', () => {
    if (confirm('Create a different race? You will leave this page, but the old race link stays valid.'))
      location.href = location.pathname;
  });
  requestAnimationFrame(animate);
  bootstrap();
})();
