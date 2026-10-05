/* Plank Race v3. Firebase Auth username facade + timestamp-only live stopwatches. */
(() => {
  'use strict';
  const C = window.PlankCore, H = window.PlankHistory;
  const $ = id => document.getElementById(id);
  const views = ['setup','auth','home','solo','race','history','highlights','account'];
  const qs = new URLSearchParams(location.search);
  let initialRoom = qs.get('room');
  const validRoom = value => /^[a-f0-9]{20}$/.test(value || '');
  let db, auth, uid=null, profile=null, currentUser=null, roomId=null, meta=null, players={}, times={};
  let connected=false, clockReady=false, clockBase=0, perfBase=0, view='setup', registerMode=false;
  let roomListeners=[], soloRef=null, soloListener=null, soloRecords={}, pendingActions=false;
  let toastHandle=null, lastFrame=0, pendingQueue=[], flushing=false, raceStopLocal=null, soloStopLocal=null;
  let ownTimeDraft=null, roomPending=false, historyData=null, historyMode='planks', expandedDays=new Set(), historyLoading=false;
  let sessionEpoch=0, historyTouched=false;

  const escape = C.escapeHtml;
  const time = (ms) => C.formatTime(ms || 0);
  const now = () => clockReady ? clockBase + performance.now()-perfBase : Date.now();
  const normalizeUsername = s => String(s||'').trim().toLowerCase();
  const validUsername = s => /^[a-z0-9_]{3,20}$/.test(s);
  const loginAddress = s => `${s}@plankrace.example`;
  const err = error => {
    const code = error && (error.code || error.message) || '';
    const hints = {
      'auth/operation-not-allowed':'Enable Email/Password under Firebase Authentication → Sign-in method. Keep Anonymous enabled too.',
      'auth/email-already-in-use':'That username is already taken. Choose another or log in.',
      'auth/invalid-email':'Firebase rejected the generated login identifier. Contact the site owner.',
      'auth/weak-password':'Choose a password with at least 6 characters.',
      'auth/invalid-credential':'Incorrect username or password.',
      'auth/wrong-password':'Incorrect username or password.',
      'auth/user-not-found':'No account with that username.',
      'auth/too-many-requests':'Too many login attempts. Try again later.',
      'auth/requires-recent-login':'Enter your current password and try again.',
      'auth/unauthorized-domain':'Add this GitHub Pages domain under Authentication → Settings → Authorized domains.',
      'PERMISSION_DENIED':'Firebase denied access. Publish the NEW v3 database.rules.json before uploading the v3 website.',
      'database/permission-denied':'Firebase denied access. Publish the NEW v3 database.rules.json before uploading the v3 website.'
    };
    return hints[code] || (error && error.message) || 'Something went wrong. Please try again.';
  };
  function toast(msg) {
    $('toast').textContent=msg; $('toast').classList.remove('hidden');
    clearTimeout(toastHandle);toastHandle=setTimeout(()=>$('toast').classList.add('hidden'),5000);
  }
  function setConnection(){
    $('connectionText').textContent=connected?'Connected':'Offline / reconnecting';
    $('connectionPill').classList.toggle('online',connected);
    $('connectionPill').classList.toggle('offline',!connected);
  }
  function setView(name) {
    if (!views.includes(name)) return;
    view=name;
    for (const part of views) $(`${part}View`).classList.toggle('hidden',part!==name);
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
    closeDrawer();
    if (name==='solo') renderSolo();
    if (name==='race') renderRace();
    if (name==='history') {historyMode='planks'; updateHistoryTabs();loadHistory(true);}
    if (name==='highlights') loadHistory(true);
    if (name==='account') populateAccount();
  }
  function closeDrawer(){
    $('drawer').classList.remove('visible'); $('drawer').setAttribute('aria-hidden','true');
    $('drawerShade').classList.add('hidden'); $('openDrawer').setAttribute('aria-expanded','false');
  }
  function openDrawer(){if(!uid)return;$('drawer').classList.add('visible');$('drawer').setAttribute('aria-hidden','false');$('drawerShade').classList.remove('hidden');$('openDrawer').setAttribute('aria-expanded','true');}
  $('openDrawer').addEventListener('click',openDrawer);
  $('closeDrawer').addEventListener('click',closeDrawer);
  $('drawerShade').addEventListener('click',closeDrawer);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();});
  $('drawerNav').addEventListener('click',e=>{
    const btn=e.target.closest('[data-view]');if(!btn)return;
    const target=btn.dataset.view;
    if(target==='race'&&!roomId){setView('home');toast('Create a race to get started.');return;}
    setView(target);
  });
  function setAuthMode(register){
    registerMode=!!register;$('loginTab').classList.toggle('selected',!register);
    $('registerTab').classList.toggle('selected',register);
    $('displayField').classList.toggle('hidden',!register);
    $('repeatField').classList.toggle('hidden',!register);
    $('displayInput').required=register;$('repeatInput').required=register;
    $('passwordInput').autocomplete=register?'new-password':'current-password';
    $('authTitle').textContent=register?'Make it official.':'Welcome back.';
    $('authSubtitle').textContent=register?'Pick a username and a password you will remember.':'Your plank history is waiting.';
    $('authSubmit').textContent=register?'Create account ↗':'Log in ↗';
    $('authError').textContent='';
  }
  $('loginTab').onclick=()=>setAuthMode(false);
  $('registerTab').onclick=()=>setAuthMode(true);
  $('authForm').addEventListener('submit',async ev=>{
    ev.preventDefault(); if(pendingActions)return;
    const username=normalizeUsername($('usernameInput').value);
    const password=$('passwordInput').value;
    const display=C.cleanName($('displayInput').value)||username;
    $('authError').textContent='';
    if(!validUsername(username)){$('authError').textContent='Use 3–20 letters, numbers or underscores in your username.';return;}
    if(password.length<6){$('authError').textContent='Password must contain at least 6 characters.';return;}
    if(registerMode && password!==$('repeatInput').value){$('authError').textContent='The passwords do not match.';return;}
    pendingActions=true;$('authSubmit').disabled=true;
    try{
      if(registerMode){
        const cred=firebase.auth.EmailAuthProvider.credential(loginAddress(username),password);
        // Linking preserves an existing v2 anonymous account UID and room ownership.
        if(auth.currentUser && auth.currentUser.isAnonymous) await auth.currentUser.linkWithCredential(cred);
        else await auth.createUserWithEmailAndPassword(loginAddress(username),password);
        await auth.currentUser.getIdToken(true);
        await db.ref(`users/${auth.currentUser.uid}/profile`).transaction(old=>old?{...old,displayName:display}:{username,displayName:display,createdAt:firebase.database.ServerValue.TIMESTAMP},undefined,false);
        toast(`Welcome, ${display}! Your account is ready.`);
      }else{
        await auth.signInWithEmailAndPassword(loginAddress(username),password);
      }
      $('passwordInput').value=''; $('repeatInput').value='';
      // Auth-state callbacks manage the dashboard and outstanding invitations.
      if(auth.currentUser && !auth.currentUser.isAnonymous) await enterAccount(auth.currentUser);
    }catch(error){$('authError').textContent=err(error);}
    finally{pendingActions=false;$('authSubmit').disabled=false;}
  });
  async function enterAccount(user){
    if(!user || user.isAnonymous) return;
    const epoch=++sessionEpoch;
    try{
      const newUid=user.uid;
      const ref=db.ref(`users/${newUid}/profile`);
      let snap=await ref.once('value');
      if(epoch!==sessionEpoch) return;
      if(!snap.exists()){
        const username=String(user.email||'').split('@')[0];
        if(!validUsername(username))throw new Error('Account profile is missing a valid username.');
        await ref.set({username,displayName:username,createdAt:firebase.database.ServerValue.TIMESTAMP});
        snap=await ref.once('value');
      }
      if(epoch!==sessionEpoch) return;
      const oldUid=uid;
      if(oldUid!==newUid){leaveRoom();detachSolo();}
      uid=newUid;profile=snap.val();currentUser=user;
      $('drawerName').textContent=profile.displayName;
      $('drawerUser').textContent='@'+profile.username;
      $('drawer').querySelector('.avatar').textContent=(profile.displayName||'P')[0].toUpperCase();
      $('topUsername').textContent='@'+profile.username;
      $('topUsername').classList.remove('hidden'); $('openDrawer').classList.remove('hidden');
      $('welcomeName').textContent=profile.displayName.split(' ')[0];
      loadStopQueue(); startSoloListener();
      if(initialRoom){
        const wanted=initialRoom;initialRoom=null;
        if(validRoom(wanted)) await joinRoom(wanted);
        else{setView('home');toast('That invite link has an invalid race ID.');}
      }else if(!oldUid || oldUid!==newUid){setView('home');}
      else if(view==='auth'||view==='setup')setView('home');
      if(connected)flushStops();
    }catch(e){
      $('authError').textContent=err(e);
      setView('auth');
    }
  }
  function leaveRoom(){
    roomListeners.forEach(({ref,event,cb})=>ref.off(event,cb));roomListeners=[];
    roomId=null;meta=null;players={};times={};raceStopLocal=null;ownTimeDraft=null;
  }
  function detachSolo(){if(soloRef&&soloListener)soloRef.off('value',soloListener);soloRef=null;soloListener=null;soloRecords={};soloStopLocal=null;}
  $('logoutBtn').onclick=async()=>{
    if(!confirm('Log out? Running timers can be resumed when you log back in.'))return;
    closeDrawer();leaveRoom();detachSolo();uid=null;profile=null;historyData=null;
    initialRoom=null;history.replaceState(null,'',location.pathname);
    await auth.signOut();
  };
  async function setup(){
    setView('setup');const config=window.PLANK_FIREBASE_CONFIG;
    if(!config || !config.apiKey || /PASTE_|YOUR_|HERE/.test([config.apiKey,config.databaseURL,config.appId,config.projectId].join(' '))){
      $('setupError').textContent='Firebase configuration is missing. Keep the working firebase-config.js already in your GitHub repository.';return;
    }
    if(!window.firebase || !firebase.auth || !firebase.database){$('setupError').textContent='Firebase SDK failed to load. Check the internet connection.';return;}
    try{
      firebase.initializeApp(config);auth=firebase.auth();db=firebase.database();
      db.ref('.info/connected').on('value',s=>{connected=s.val()===true;setConnection();if(connected)flushStops();renderRace();renderSolo();});
      db.ref('.info/serverTimeOffset').on('value',s=>{clockBase=Date.now()+Number(s.val()||0);perfBase=performance.now();clockReady=true;});
      auth.onAuthStateChanged(async user=>{
        currentUser=user;
        if(!user || user.isAnonymous){
          ++sessionEpoch;leaveRoom();detachSolo();uid=null;profile=null;historyData=null;
          $('openDrawer').classList.add('hidden');$('topUsername').classList.add('hidden');
          setView('auth');setAuthMode(false);
        }else if(!(pendingActions && registerMode)) await enterAccount(user);
      });
    }catch(e){$('setupError').textContent=err(e);setView('setup');}
  }
  function randomRoomId(){return Array.from(crypto.getRandomValues(new Uint8Array(10)),x=>x.toString(16).padStart(2,'0')).join('');}
  function roomRef(path=''){return db.ref(`rooms/${roomId}${path?'/'+path:''}`);}
  function currentRound(){return meta?Number(meta.round):0;}
  function legacyRoom(){return meta && meta.schemaVersion!==3;}
  function activeTimesPath(r=currentRound()){return legacyRoom()?'times':`rounds/${r}/times`;}
  function mineTime(){
    if(ownTimeDraft && ownTimeDraft.roomId===roomId && ownTimeDraft.round===currentRound())return ownTimeDraft;
    const base=times[uid]||null;
    const queued=pendingQueue.find(p=>p.type==='race'&&p.roomId===roomId&&p.round===currentRound());
    if(queued && base && C.canStop(base,currentRound()))return {...base,stoppedAt:queued.stoppedAt};
    return base;
  }
  function getTime(id){return id===uid?mineTime():times[id]||null;}
  function addRoomListener(ref,callback){ref.on('value',callback,e=>toast(err(e)));roomListeners.push({ref,event:'value',cb:callback});}
  async function createRoom(){
    if(!uid||!connected){toast('Waiting for Firebase to connect.');return;}
    $('createRoomBtn').disabled=true;
    try{
      let id,created=false;
      for(let i=0;i<4&&!created;i++){
        id=randomRoomId();
        const result=await db.ref(`rooms/${id}/meta`).transaction(v=>v===null?{hostUid:uid,createdAt:firebase.database.ServerValue.TIMESTAMP,round:1,schemaVersion:3}:undefined,undefined,false);
        created=result.committed;
      }
      if(!created)throw new Error('Could not create a room. Try again.');
      await joinRoom(id);
    }catch(e){toast(err(e));}
    finally{$('createRoomBtn').disabled=false;}
  }
  $('createRoomBtn').onclick=createRoom;
  $('newRoomBtn').onclick=async()=>{
    if(!confirm('Create a different race? Your previous completed rounds will remain saved.'))return;
    leaveRoom();history.replaceState(null,'',location.pathname);setView('home');await createRoom();
  };
  async function joinRoom(id){
    if(!validRoom(id)){toast('Invalid race link.');return;}
    const room=db.ref(`rooms/${id}`);
    try{
      const found=await room.child('meta').once('value');
      if(!found.exists()){setView('home');toast('Race not found. Ask for a new invite link.');return;}
      const current=await room.child(`players/${uid}`).once('value');
      if(!current.exists())await room.child(`players/${uid}`).set({name:profile.displayName,joinedAt:firebase.database.ServerValue.TIMESTAMP});
      await db.ref(`users/${uid}/rooms/${id}`).set(true);
      if(roomId!==id)leaveRoom();
      roomId=id;meta=found.val();
      history.replaceState(null,'',C.roomUrl(location.href,id));
      subscribeRoom();setView('race');historyData=null;
    }catch(e){setView('home');toast(err(e));}
  }
  function subscribeRoom(){
    const base=roomRef();
    let activeRound=null, activePath=null;
    function watchTimes(){
      if(!meta)return;
      const next=activeTimesPath();
      if(next===activePath)return;
      if(activePath){
        const ref=roomRef(activePath);
        const list=roomListeners.find(x=>x.ref.toString()===ref.toString());
        if(list){list.ref.off('value',list.cb);roomListeners=roomListeners.filter(x=>x!==list);}
      }
      activePath=next;times={};ownTimeDraft=null;
      addRoomListener(roomRef(next),snap=>{
        times=snap.val()||{};historyData=null;
        if(ownTimeDraft && C.getStatus(times[uid],currentRound())!=='ready')ownTimeDraft=null;
        renderRace();
      });
    }
    addRoomListener(base.child('meta'),snap=>{
      const old=meta&&meta.round;meta=snap.val();
      if(!meta){toast('Race unavailable.');return;}
      if(old && old!==meta.round)toast(`Round ${meta.round} is ready.`);
      watchTimes();renderRace();
    });
    addRoomListener(base.child('players'),snap=>{players=snap.val()||{};renderRace();});
    // Ensure a missed history index write can be repaired whenever a race opens.
    db.ref(`users/${uid}/rooms/${roomId}`).set(true).catch(e=>toast('History link: '+err(e)));
  }
  function renderRace(){
    if(!roomId||!meta||!uid)return;
    $('roundLabel').textContent='/ ROUND '+String(meta.round).padStart(2,'0');
    $('participantCount').textContent=Object.keys(players).length+' competitor'+(Object.keys(players).length===1?'':'s');
    const host=meta.hostUid===uid;
    $('resetBtn').classList.toggle('hidden',!host);
    $('resetBtn').disabled=!connected;
    const active=Object.fromEntries(Object.entries(times));
    if(ownTimeDraft)active[uid]=getTime(uid);
    const winner=C.findWinner(players,active,currentRound());
    $('winnerBanner').classList.toggle('hidden',!winner);
    if(winner){$('winnerText').textContent=winner.tie?winner.winners.map(x=>x.name).join(' & ')+' tie!':winner.winners[0].name+' wins!';$('winnerDetail').textContent='Longest plank: '+time(winner.duration);}
    const entries=Object.entries(players).sort((a,b)=>(a[1].joinedAt||0)-(b[1].joinedAt||0));
    $('playerGrid').innerHTML=entries.map(([id,p])=>{
      const own=id===uid, t=getTime(id),status=C.getStatus(t,currentRound());
      const action=status==='ready'?'start':status==='running'?'stop':'';
      const isWinner=!!(winner&&winner.winners.some(x=>x.uid===id));
      let note=own?'Your stopwatch':'Watching live';
      if(own&&pendingQueue.some(p=>p.type==='race'&&p.round===currentRound()&&p.roomId===roomId))note=connected?'Saving stop…':'Stop saved on this device';
      let button='';
      if(own&&action){
        const disabled=(action==='start'&&(!connected||!clockReady))||!!ownTimeDraft||pendingActions;
        button=`<button type="button" class="button ${action==='stop'?'button-danger':'button-primary'}" data-race-action="${action}" ${disabled?'disabled':''}>${action==='stop'?'Stop timer ■':'Start timer ▶'}</button>`;
      }else if(own&&status==='finished')button='<span class="tag">Finished</span>';
      return `<article class="player-card ${own?'mine':''} ${isWinner?'winner-card':''}"><div class="player-top"><div style="min-width:0"><h3 class="player-name">${escape(p.name||'Player')}</h3><div class="player-meta">${own?'Your card':'Competitor'}</div></div><div class="player-badges">${own?'<span class="tag me">YOU</span>':''}${meta.hostUid===id?'<span class="tag">HOST</span>':''}</div></div><div class="timer ${status==='running'?'running':status==='finished'?'finished':''}" data-timer-id="${escape(id)}">${time(C.getDuration(t,currentRound(),now()))}</div><div class="timer-status ${status==='running'?'running':status==='finished'?'finished':''}"><span class="status-dot"></span>${status==='ready'?'Ready to plank':status==='running'?'Holding strong':'Finished'}</div><div class="player-actions"><span class="player-actions-note">${note}</span>${button}</div></article>`;
    }).join('');
  }
  $('playerGrid').addEventListener('click',e=>{
    const btn=e.target.closest('[data-race-action]');if(!btn||btn.disabled)return;
    if(btn.dataset.raceAction==='start')startRaceTimer();else if(btn.dataset.raceAction==='stop')stopRaceTimer();
  });
  async function startRaceTimer(){
    if(!uid||!meta||!connected||!clockReady||pendingActions||!C.canStart(times[uid],currentRound()))return;
    const round=currentRound(),startedAt=Math.round(now()),rid=roomId,path=activeTimesPath();
    const draft={round,startedAt};ownTimeDraft={...draft,roomId:rid};pendingActions=true;renderRace();
    try{
      const result=await db.ref(`rooms/${rid}/${path}/${uid}`).transaction(old=>C.canStart(old,round)?draft:undefined,undefined,false);
      if(!result.committed)toast('That timer already started or the round changed.');
    }catch(e){toast(err(e));}
    finally{ownTimeDraft=null;pendingActions=false;renderRace();}
  }
  function stopRaceTimer(){
    if(!uid||!meta||pendingActions)return;
    const round=currentRound(),r=roomId,existing=times[uid];
    if(!C.canStop(existing,round))return;
    const stop={type:'race',roomId:r,round,legacy:legacyRoom(),startedAt:existing.startedAt,stoppedAt:Math.max(existing.startedAt,Math.round(now()))};
    queueStop(stop);renderRace();flushStops();
  }
  $('resetBtn').onclick=async()=>{
    if(!meta||meta.hostUid!==uid||!connected)return;
    if(Object.values(times).some(t=>C.getStatus(t,currentRound())==='running')){toast('Wait until everyone who started has stopped before starting a new round.');return;}
    if(!confirm('Start a new round? Previous completed results will stay in History.'))return;
    $('resetBtn').disabled=true;
    try{
      const result=await roomRef('meta').transaction(old=>old&&old.hostUid===uid?{...old,round:old.round+1}:undefined,undefined,false);
      if(result.committed)toast('Next round ready. Previous times saved.');historyData=null;
    }catch(e){toast(err(e));}finally{$('resetBtn').disabled=false;}
  };
  $('copyLinkBtn').onclick=async()=>{
    if(!roomId)return;
    const link=C.roomUrl(location.href,roomId);
    try{await navigator.clipboard.writeText(link);toast('Invite link copied.');}
    catch(_){const t=document.createElement('textarea');t.value=link;document.body.appendChild(t);t.select();const ok=document.execCommand('copy');t.remove();toast(ok?'Invite link copied.':'Copy this link: '+link);}
  };
  $('soloHomeBtn').onclick=()=>setView('solo');
  $('homeHistoryBtn').onclick=()=>setView('history');
  function startSoloListener(){
    detachSolo();if(!uid)return;
    soloRef=db.ref(`users/${uid}/solo`).limitToLast(50);
    soloListener=s=>{
      soloRecords=s.val()||{};
      renderSolo();
    };
    soloRef.on('value',soloListener,e=>toast(err(e)));
  }
  function soloCurrent(){
    const entries=Object.entries(soloRecords).sort((a,b)=>(b[1].startedAt||0)-(a[1].startedAt||0));
    const running=entries.find(([,v])=>Number.isFinite(v.startedAt)&&!Number.isFinite(v.stoppedAt));
    if(running)return {key:running[0],time:running[1]};
    if(entries.length)return {key:entries[0][0],time:entries[0][1]};
    return null;
  }
  function renderSolo(){
    if(!uid)return;
    const entry=soloCurrent();
    const queued=entry&&pendingQueue.find(p=>p.type==='solo'&&p.key===entry.key);
    const data=entry?queued?{...entry.time,stoppedAt:queued.stoppedAt}:entry.time:null;
    const active=!!(data&&Number.isFinite(data.startedAt)&&!Number.isFinite(data.stoppedAt));
    const finished=!!(data&&H.validStop(data));
    $('soloTimer').textContent=time(data?Math.max(0,(finished?data.stoppedAt:now())-data.startedAt):0);
    $('soloTimer').classList.toggle('running',active);
    $('soloLabel').textContent=active?'PLANK IN PROGRESS':finished?'LAST COMPLETED HOLD':'READY WHEN YOU ARE';
    $('soloStatus').textContent=active?'Hold strong. Your stopwatch is running.':finished?`Last hold: ${time(data.stoppedAt-data.startedAt)}`:'Your next personal record starts here.';
    $('soloActionBtn').textContent=active?'Stop timer ■':'Start a new plank ▶';
    $('soloActionBtn').className='button '+(active?'button-danger':'button-primary')+' solo-button';
    $('soloActionBtn').disabled=pendingActions||(!active&&(!connected||!clockReady))||!!queued;
    $('soloInfo').textContent=queued?'Stop recorded locally. Waiting to synchronize.':active?'The Stop button also works when your connection drops.':'Only completed planks count toward your records.';
  }
  $('soloActionBtn').onclick=async()=>{
    const entry=soloCurrent();const running=!!(entry&&!Number.isFinite(entry.time.stoppedAt));
    if(running){
      if(pendingQueue.some(p=>p.type==='solo'&&p.key===entry.key))return;
      queueStop({type:'solo',key:entry.key,startedAt:entry.time.startedAt,stoppedAt:Math.max(entry.time.startedAt,Math.round(now()))});
      renderSolo();flushStops();return;
    }
    if(!connected||!clockReady||pendingActions)return;
    pendingActions=true;$('soloActionBtn').disabled=true;
    try{
      const key=db.ref(`users/${uid}/solo`).push().key;
      await db.ref(`users/${uid}/solo/${key}`).set({startedAt:Math.round(now())});
      historyData=null;
    }catch(e){toast(err(e));}
    finally{pendingActions=false;renderSolo();}
  };
  function queueStorageKey(){return `plankv3-pending:${uid}`;}
  function loadStopQueue(){
    try{pendingQueue=JSON.parse(localStorage.getItem(queueStorageKey())||'[]');if(!Array.isArray(pendingQueue))pendingQueue=[];}
    catch(_){pendingQueue=[];}
    pendingQueue=pendingQueue.filter(p=>p&&['solo','race'].includes(p.type)&&Number.isFinite(p.stoppedAt));
  }
  function saveQueue(){if(uid)localStorage.setItem(queueStorageKey(),JSON.stringify(pendingQueue));}
  function queueStop(item){
    if(pendingQueue.some(p=>p.type===item.type&&p.key===item.key&&p.roomId===item.roomId&&p.round===item.round))return;
    pendingQueue.push(item);saveQueue();historyData=null;
  }
  async function flushStops(){
    if(!uid||!connected||flushing||!pendingQueue.length)return;
    flushing=true;
    try{
      for(const entry of [...pendingQueue]){
        if(!connected||!uid)break;
        try{
          const id=entry.type==='solo'?`users/${uid}/solo/${entry.key}`:`rooms/${entry.roomId}/${entry.legacy?'times':`rounds/${entry.round}/times`}/${uid}`;
          const result=await db.ref(id).transaction(old=>{
            if(!old||!Number.isFinite(old.startedAt)||old.startedAt!==entry.startedAt)return undefined;
            if(Number.isFinite(old.stoppedAt))return undefined;
            if(entry.type==='race'&&old.round!==entry.round)return undefined;
            return {...old,stoppedAt:Math.max(old.startedAt,entry.stoppedAt)};
          },undefined,false);
          const stored=result.snapshot.val();
          if(result.committed || (stored && Number.isFinite(stored.stoppedAt))){
            const match=p=>p===entry;
            pendingQueue=pendingQueue.filter(p=>!match(p));saveQueue();historyData=null;
          }else{
            // Keep pending action until explicitly resolved, rather than silently dropping it.
            toast('A stop is awaiting a valid saved start. Please check this session.');
          }
        }catch(e){if(connected)toast('Could not sync a stop: '+err(e));break;}
      }
    }finally{flushing=false;renderRace();renderSolo();}
  }
  function updateHistoryTabs(){
    $('myPlanksTab').classList.toggle('selected',historyMode==='planks');
    $('myRacesTab').classList.toggle('selected',historyMode==='races');
  }
  $('myPlanksTab').onclick=()=>{historyMode='planks';expandedDays.clear();historyTouched=false;updateHistoryTabs();renderHistory();};
  $('myRacesTab').onclick=()=>{historyMode='races';expandedDays.clear();historyTouched=false;updateHistoryTabs();renderHistory();};
  $('refreshHistoryBtn').onclick=()=>loadHistory(true);
  $('refreshHighlightsBtn').onclick=()=>loadHistory(true);
  async function loadHistory(refresh){
    if(!uid)return;
    if(historyData&&!refresh){renderHistory();renderHighlights();return;}
    if(historyLoading)return;
    historyLoading=true;
    $('historyGroups').innerHTML='<div class="empty-state">Loading your completed planks…</div>';
    $('highlightsStats').innerHTML='<div class="empty-state">Loading records…</div>';
    const expected=uid;
    try{
      const [listSnap,soloSnap]=await Promise.all([db.ref(`users/${uid}/rooms`).once('value'),db.ref(`users/${uid}/solo`).once('value')]);
      if(expected!==uid)return;
      const roomKeys=Object.keys(listSnap.val()||{});
      const rooms={};
      // Read in small batches. Other people's data is only visible within shared rooms.
      let partial=0;
      for(let i=0;i<roomKeys.length;i+=10){
        const batch=roomKeys.slice(i,i+10);
        const results=await Promise.allSettled(batch.map(id=>db.ref(`rooms/${id}`).once('value')));
        if(expected!==uid)return;
        results.forEach((res,j)=>{if(res.status==='fulfilled')rooms[batch[j]]=res.value.val();else partial++;});
      }
      historyData=H.collect(uid,soloSnap.val(),rooms);
      if(partial)toast(`${partial} race rooms could not be loaded. Try refreshing History.`);
      expandedDays.clear();historyTouched=false;renderHistory();renderHighlights();
    }catch(e){
      if(expected!==uid)return;
      $('historyGroups').innerHTML=`<div class="empty-state">Could not load history. ${escape(err(e))}</div>`;
      $('highlightsStats').innerHTML=`<div class="empty-state">Could not load records. ${escape(err(e))}</div>`;
    }finally{historyLoading=false;}
  }
  function renderHistory(){
    if(!historyData)return;
    const items=historyMode==='planks'?historyData.planks:historyData.races;
    const groups=H.groupByDate(items,historyMode==='planks'?'end':'date');
    $('historySummary').textContent=`${items.length} ${historyMode==='planks'?'completed plank sessions':'race rounds'} across ${groups.length} day${groups.length===1?'':'s'}.`;
    if(!groups.length){$('historyGroups').innerHTML='<div class="empty-state">No history yet. Complete a plank and it will appear here.</div>';return;}
    $('historyGroups').innerHTML=groups.map((g,i)=>{
      const isOpen=expandedDays.has(g.key) || (!historyTouched&&i===0);
      const content=historyMode==='planks' ? g.items.map(p=>`<div class="history-entry"><div><strong>${p.source==='solo'?'Solo plank':'Race plank'}</strong><small>${new Date(p.end).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}${p.source==='race'?' · Round '+p.round:''}</small></div><span class="history-time">${time(p.ms)}</span></div>`).join('')
      :g.items.map(r=>`<div class="race-entry"><div class="race-entry-head"><strong>Race · Round ${r.round}</strong><span class="small-muted">${r.players.length} competitor${r.players.length===1?'':'s'} · ${r.complete?'Completed':'Some timers unfinished'}</span></div><div class="race-scores">${r.players.map((p,j)=>`<div class="race-score"><span class="rank-icon">${r.winnerIds.includes(p.uid)?'🏆':j+1+'.'}</span><span>${escape(p.name)}${p.uid===uid?' (you)':''}</span><span>${p.complete?time(p.ms):'Not stopped'}</span></div>`).join('')}</div></div>`).join('');
      return `<section class="history-day"><button type="button" class="history-day-btn" data-day="${g.key}" aria-expanded="${isOpen}"><span><strong>${escape(g.label)}</strong><small>${g.items.length} ${historyMode==='planks'?'session':'round'}${g.items.length===1?'':'s'}</small></span><span>${isOpen?'⌃':'⌄'}</span></button><div class="history-entries ${isOpen?'':'hidden'}">${content}</div></section>`;
    }).join('');
  }
  $('historyGroups').addEventListener('click',e=>{
    const b=e.target.closest('[data-day]');if(!b)return;
    const key=b.dataset.day;const open=b.getAttribute('aria-expanded')==='true';
    // Once users interact, opening/closing is controlled by explicit choices.
    if(!historyTouched){const first=H.groupByDate(historyMode==='planks'?historyData.planks:historyData.races,historyMode==='planks'?'end':'date')[0];if(first)expandedDays.add(first.key);}
    if(open)expandedDays.delete(key);else expandedDays.add(key);historyTouched=true;
    renderHistory();
  });
  function renderHighlights(){
    if(!historyData)return;
    const s=historyData.stats;
    const items=[['★','Personal best',time(s.best)],['◷','Completed planks',String(s.total)],['🏆','Races won',String(s.racesWon)],['◎','Total hold time',time(s.totalMs)],['⚑','Race rounds',String(historyData.races.length)],['▰','Solo planks',String(s.solo)]];
    $('highlightsStats').innerHTML=items.map(([icon,label,value])=>`<div class="stat-card"><div class="stat-icon">${icon}</div><strong>${value}</strong><div class="stat-label">${label}</div></div>`).join('');
    $('recentPlanks').innerHTML=historyData.planks.slice(0,8).map(p=>`<div class="history-entry"><div><strong>${p.source==='solo'?'Solo plank':'Race plank'}</strong><small>${new Date(p.end).toLocaleString()}</small></div><span class="history-time">${time(p.ms)}</span></div>`).join('')||'<div class="small-muted">No completed planks yet.</div>';
  }
  function populateAccount(){if(!profile)return;$('accountUsername').textContent='@'+profile.username;$('accountDisplayName').value=profile.displayName;}
  $('nameForm').addEventListener('submit',async e=>{
    e.preventDefault();if(!uid||!profile)return;
    const name=C.cleanName($('accountDisplayName').value);
    if(!name){toast('Enter a display name.');return;}
    try{
      await db.ref(`users/${uid}/profile/displayName`).set(name);profile.displayName=name;
      $('drawerName').textContent=name;$('welcomeName').textContent=name.split(' ')[0];
      $('drawer').querySelector('.avatar').textContent=name[0].toUpperCase();toast('Display name saved. New races will use it.');
    }catch(error){toast(err(error));}
  });
  $('passwordForm').addEventListener('submit',async e=>{
    e.preventDefault();if(!uid||!currentUser)return;
    const old=$('oldPassword').value,next=$('newPassword').value,confirmNew=$('confirmPassword').value;
    if(next.length<6){toast('Password must have at least 6 characters.');return;}
    if(next!==confirmNew){toast('New passwords do not match.');return;}
    const btn=$('passwordForm').querySelector('button');btn.disabled=true;
    try{
      const credential=firebase.auth.EmailAuthProvider.credential(currentUser.email,old);
      await currentUser.reauthenticateWithCredential(credential);
      await currentUser.updatePassword(next);
      $('passwordForm').reset();toast('Password updated successfully.');
    }catch(error){toast(err(error));}finally{btn.disabled=false;}
  });
  function animate(t){
    if(t-lastFrame>=30){
      lastFrame=t;
      if(view==='race'&&roomId&&meta){
        document.querySelectorAll('[data-timer-id]').forEach(el=>{
          const id=el.dataset.timerId,entry=getTime(id);
          if(C.getStatus(entry,currentRound())==='running')el.textContent=time(C.getDuration(entry,currentRound(),now()));
        });
      }
      if(view==='solo'){
        const entry=soloCurrent();
        if(entry&&!pendingQueue.some(p=>p.type==='solo'&&p.key===entry.key)&&!Number.isFinite(entry.time.stoppedAt))$('soloTimer').textContent=time(now()-entry.time.startedAt);
      }
    }
    requestAnimationFrame(animate);
  }
  // Keep history fresh when opening a page, but never put stopwatch animation updates in Firebase.
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&connected)flushStops();});
  requestAnimationFrame(animate);setup();
})();
