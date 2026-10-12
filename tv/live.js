/* CineTV 1.6 LIVE: canali gratuiti da feed M3U pubblico, no provider pay-TV.
 * Nessun proxy o aggiramento geografico. Le sorgenti possono non funzionare.
 * ES5+ per compatibilità con Samsung Tizen 2020.
 */
(function(){
'use strict';
var FEED='https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_italy.m3u8';
var HLS_SCRIPT='https://cdn.jsdelivr.net/npm/hls.js@1.4.14/dist/hls.min.js';
var liveView=null, focusFn=null, notify=null, channels=[], filtered=[], activeFilter='all', query='', favorites=[], opened=null, hls=null, playerOpen=false, loadingPromise=null, restoreFocus=null;
var FALLBACK=[
  {name:'Rai News 24',logo:'https://i.imgur.com/gdzGwB6.png',number:48,url:'https://d3k8wzt41aflvx.cloudfront.net/RAINEWS24/Live.m3u8'},
  {name:'Rai 3',logo:'https://i.imgur.com/9kuQCIi.png',number:3,url:'https://d3k8wzt41aflvx.cloudfront.net/RAI3/Live.m3u8'},
  {name:'Rai Storia',logo:'https://i.imgur.com/K8y5q8x.png',number:54,url:'https://d3k8wzt41aflvx.cloudfront.net/RAIStoria/Live.m3u8'},
  {name:'Rai Scuola',logo:'https://i.imgur.com/tmtJW6s.png',number:57,url:'https://d3k8wzt41aflvx.cloudfront.net/RAIScuola/Live.m3u8'},
  {name:'La7',logo:'https://i.imgur.com/F90mpSa.png',number:7,url:'https://d1chghleocc9sm.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-evfku205gqrtf/Live.m3u8'},
  {name:'Top Calcio 24',logo:'https://i.imgur.com/DnVPKPE.png',number:0,url:'https://sportitaliaamd.akamaized.net/live/Telelombardia/hls/1CCCD0BCA2F9C979BC0632230F8E31EAEA41562B/index.m3u8'}
];
var preferred=['Rai 1','Rai 2','Rai 3','Rete 4','Canale 5','Italia 1','La7','TV8','Nove','Rai News 24','Rai Sport','Rai Movie','Rai Premium','Rai 4','Rai 5','Rai Storia','Rai Scuola','Rai Yoyo','Rai Gulp','Cine34','Focus','Top Crime','Italia 2','Mediaset Extra','La7d','Cielo','Real Time','DMAX','Giallo','Food Network','Sportitalia','Top Calcio 24','RTL 102.5'];
function el(id){return document.getElementById(id);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function cleanName(n){return String(n||'').replace(/[ⒼⓎⓈ]/g,'').replace(/\s+/g,' ').trim();}
function safeUrl(u){return /^https:\/\/[^\s"'<>]+$/i.test(String(u||'')) ? String(u).trim():'';}
function parseM3u(text){
  var lines=String(text||'').split(/\r?\n/),entry=null,out=[],seen={};
  for(var i=0;i<lines.length;i++){
    var line=lines[i].trim();
    if(line.indexOf('#EXTINF:')===0){
      var get=function(field){var m=line.match(new RegExp(field+'="([^"]*)"'));return m?m[1]:'';};
      entry={name:cleanName(get('tvg-name')||line.slice(line.lastIndexOf(',')+1)),logo:safeUrl(get('tvg-logo')),number:Number(get('tvg-chno'))||0,group:get('group-title'),country:get('tvg-country')};
    }else if(entry&&line&&line.charAt(0)!=='#'){
      var url=safeUrl(line);
      // Evita manifest DASH e link web, utilizza soltanto sorgenti HLS HTTPS.
      var hlsOk=/\.m3u8(?:[?#]|$)/i.test(url);
      if(url&&hlsOk&&entry.name&&(entry.country==='IT'||entry.group==='Italy')){
        var key=entry.name.toLowerCase();
        if(!seen[key]){seen[key]=true;entry.url=url;out.push(entry);}
      }
      entry=null;
    }
  }
  out.sort(function(a,b){
    var ia=preferred.indexOf(a.name),ib=preferred.indexOf(b.name);
    if(ia>=0||ib>=0){if(ia<0)return 1;if(ib<0)return -1;return ia-ib;}
    if(a.number&&b.number&&a.number!==b.number)return a.number-b.number;
    return a.name.localeCompare(b.name);
  });
  return out;
}
function readFav(){try{var v=JSON.parse(localStorage.getItem('cinetv_live_favorites')||'[]');return Array.isArray(v)?v:[];}catch(e){return [];}}
function persistFav(){try{localStorage.setItem('cinetv_live_favorites',JSON.stringify(favorites));}catch(e){}}
function classify(ch){var s=ch.name.toLowerCase();
  if(/news|tg|notizi|inform|24|telelombardia|calcio|sport/.test(s))return 'news';
  if(/rai|canale 5|italia 1|rete 4|la7|tv8|nove|cielo|cine34|focus|mediaset/.test(s))return 'national';
  return 'other';
}
function channelRow(ch,i){
  var saved=favorites.indexOf(ch.name)>=0;
  return '<div class="live-row" role="listitem">'+
   '<span class="live-index">'+(i+1)+'</span>'+
   '<button class="live-channel tv-focus" data-action="liveOpen" data-live-index="'+i+'">'+
   '<span class="live-logo">'+(ch.logo?'<img src="'+esc(ch.logo)+'" alt="" loading="lazy">':'<b>'+esc(ch.name.slice(0,2))+'</b>')+'</span>'+
   '<span class="live-row-info"><strong>'+esc(ch.name)+'</strong><small>'+(ch.number?'Canale '+ch.number+' · ':'')+'Diretta gratuita · '+(classify(ch)==='news'?'News / Sport':'TV')+'</small></span>'+
   '<span class="live-air"><i></i> LIVE</span></button>'+
   '<button class="live-fav tv-focus" data-action="liveFav" data-live-index="'+i+'" aria-label="'+(saved?'Rimuovi dai preferiti':'Aggiungi ai preferiti')+'">'+(saved?'♥':'♡')+'</button></div>';
}
function renderList(){if(!liveView || !el('live-list'))return;
  var q=query.toLowerCase();filtered=channels.filter(function(ch){
    var ok=activeFilter==='all'||activeFilter==='fav'&&favorites.indexOf(ch.name)>=0||classify(ch)===activeFilter;
    return ok&&(!q||ch.name.toLowerCase().indexOf(q)>=0);
  });
  var container=el('live-list');
  container.innerHTML=filtered.length?filtered.slice(0,140).map(channelRow).join(''):'<div class="live-empty">Nessun canale corrisponde alla ricerca.</div>';
  if(el('live-counter'))el('live-counter').textContent=filtered.length+' canali'+(filtered.length>140?' (primi 140)':'');
  var filters=liveView.querySelectorAll('[data-action="liveFilter"]');
  for(var i=0;i<filters.length;i++)filters[i].classList.toggle('active',filters[i].getAttribute('data-live-filter')===activeFilter);
}
function setSourceStatus(msg){var p=el('live-source-status');if(p)p.textContent=msg;}
function refresh(){
  if(!liveView)return;
  setSourceStatus('Aggiornamento elenco canali…');
  var controller=typeof AbortController!=='undefined'?new AbortController():null;
  var timeout=setTimeout(function(){if(controller)controller.abort();},14000);
  var url=FEED+'?v='+Math.floor(Date.now()/3600000);
  loadingPromise=fetch(url,{cache:'no-store',signal:controller?controller.signal:undefined})
    .then(function(r){if(!r.ok)throw Error('HTTP '+r.status);return r.text();})
    .then(function(t){var parsed=parseM3u(t);if(!parsed.length)throw Error('playlist vuota');return parsed;})
    .then(function(parsed){clearTimeout(timeout);channels=parsed;if(liveView){setSourceStatus('Elenco gratuito aggiornato da Free-TV/IPTV · nessun programma EPG configurato');renderList();}})
    .catch(function(){clearTimeout(timeout);if(liveView){setSourceStatus('Feed non raggiungibile: elenco di riserva · alcuni canali potrebbero non partire');renderList();}});
  return loadingPromise;
}
function mount(v,focus,toast){
  liveView=v;focusFn=focus;notify=toast;favorites=readFav();channels=FALLBACK.slice();query='';activeFilter='all';
  v.innerHTML='<div class="live-page"><div class="live-header"><div class="hero-tag">● CINETV · DIRETTE</div><h1>TV in diretta <span>LIVE</span></h1><p>Canali italiani gratuiti, aggiornati da una playlist pubblica. L’accesso dipende dal broadcaster e dalla tua posizione.</p></div>'+
    '<div class="live-toolbar"><input class="live-search tv-focus" id="live-search" type="search" placeholder="⌕ Cerca canali…" aria-label="Cerca canali" autocomplete="off">'+
    '<button class="live-filter tv-focus active" data-action="liveFilter" data-live-filter="all">Tutti</button>'+ 
    '<button class="live-filter tv-focus" data-action="liveFilter" data-live-filter="national">Nazionali</button>'+ 
    '<button class="live-filter tv-focus" data-action="liveFilter" data-live-filter="news">News / Sport</button>'+ 
    '<button class="live-filter tv-focus" data-action="liveFilter" data-live-filter="fav">♥ Preferiti</button>'+ 
    '<button class="live-filter tv-focus" data-action="liveRefresh">↻ Aggiorna</button></div>'+
    '<div class="live-summary"><span id="live-counter">0 canali</span><span id="live-source-status">Caricamento…</span></div>'+ 
    '<div id="live-list" class="live-list" role="list"></div>'+ 
    '<div class="live-disclaimer">La playlist è mantenuta da <strong>Free-TV/IPTV</strong> e comprende canali dichiarati gratuiti. Alcuni link possono essere non disponibili o soggetti a geoblocco. I canali a pagamento (Sky, DAZN ecc.) non sono inclusi. La guida ai programmi richiede una fonte EPG autorizzata.</div></div>';
  var input=el('live-search');
  input.addEventListener('input',function(){query=input.value||'';renderList();});
  renderList();refresh();
}
function loadHlsScript(){
  if(window.Hls)return Promise.resolve();
  if(window.CineTVHlsPromise)return window.CineTVHlsPromise;
  window.CineTVHlsPromise=new Promise(function(resolve,reject){
    var s=document.createElement('script');s.src=HLS_SCRIPT;s.async=true;
    s.onload=function(){window.Hls?resolve():reject(Error('Lettore HLS non caricato'));};
    s.onerror=function(){reject(Error('Libreria HLS non disponibile'));};
    document.head.appendChild(s);
  });
  return window.CineTVHlsPromise;
}
function setVideoMessage(m){if(el('live-video-message'))el('live-video-message').textContent=m;}
function stopStream(){
  if(hls){try{hls.destroy();}catch(e){}hls=null;}
  var video=el('live-video');if(video){try{video.pause();video.removeAttribute('src');video.load();}catch(e){}}
}
function closePlayer(){if(!playerOpen)return;stopStream();playerOpen=false;opened=null;
  var layer=el('live-player-layer');if(layer){layer.classList.add('hidden');layer.setAttribute('aria-hidden','true');}
  if(restoreFocus && document.contains(restoreFocus) && focusFn)focusFn(restoreFocus);
}
function startPlayer(ch){
  if(!ch || !safeUrl(ch.url))return;
  var layer=el('live-player-layer'),video=el('live-video');if(!layer||!video)return;
  stopStream();restoreFocus=document.activeElement;opened=ch;playerOpen=true;
  layer.classList.remove('hidden');layer.setAttribute('aria-hidden','false');
  el('live-player-title').textContent=ch.name;
  el('live-external').href=ch.url;
  setVideoMessage('Connessione alla diretta…');
  video.onerror=function(){setVideoMessage('Impossibile riprodurre questo canale. Può essere bloccato dal provider, non disponibile o incompatibile con il browser.');};
  video.onplaying=function(){setVideoMessage('');};
  if(focusFn)focusFn(el('live-close'));
  // Su Tizen è preferibile l'HLS nativo, quando disponibile.
  if(video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL')){
    video.src=ch.url;video.play().catch(function(){setVideoMessage('Premi Play per avviare la diretta.');});return;
  }
  loadHlsScript().then(function(){
    if(!playerOpen || opened!==ch)return;
    if(!window.Hls||!window.Hls.isSupported()){setVideoMessage('Il browser non supporta HLS. Prova Apri sorgente.');return;}
    hls=new window.Hls({maxBufferLength:16});
    hls.loadSource(ch.url);hls.attachMedia(video);
    hls.on(window.Hls.Events.MANIFEST_PARSED,function(){video.play().catch(function(){setVideoMessage('Premi Play per avviare la diretta.');});});
    hls.on(window.Hls.Events.ERROR,function(ev,data){if(data&&data.fatal)setVideoMessage('Errore di riproduzione del canale. La sorgente potrebbe imporre CORS o restrizioni geografiche.');});
  }).catch(function(){setVideoMessage('Impossibile caricare il lettore HLS. Prova Apri sorgente.');});
}
function click(node){var action=node.getAttribute('data-action'),idx=Number(node.getAttribute('data-live-index'))||0;
  if(action==='liveOpen'){startPlayer(filtered[idx]);return;}
  if(action==='liveFav'){
    var ch=filtered[idx];if(!ch)return;
    var i=favorites.indexOf(ch.name);if(i>=0)favorites.splice(i,1);else favorites.push(ch.name);
    persistFav();renderList();if(notify)notify('Preferiti aggiornati');return;
  }
  if(action==='liveFilter'){activeFilter=node.getAttribute('data-live-filter')||'all';renderList();return;}
  if(action==='liveRefresh'){refresh();if(notify)notify('Aggiornamento richiesto');return;}
  if(action==='liveClose'){closePlayer();return;}
  if(action==='liveToggle'){
    var v=el('live-video');if(!v)return;
    if(v.paused)v.play().catch(function(){setVideoMessage('Riproduzione non consentita dalla sorgente.');});else v.pause();return;
  }
}
function back(){if(playerOpen){closePlayer();return true;}return false;}
function leave(){closePlayer();liveView=null;}
function isPlayer(){return playerOpen;}
function focusPlayer(direction,focus){
  var layer=el('live-player-layer');if(!layer)return;
  var arr=[].slice.call(layer.querySelectorAll('.tv-focus')).filter(function(n){return !n.classList.contains('hidden');});
  if(!arr.length)return;
  var i=arr.indexOf(document.activeElement);var step=direction==='left'||direction==='up'?-1:1;
  focus(arr[(i+step+arr.length)%arr.length]);
}
window.CineTVLive={mount:mount,refresh:refresh,click:click,back:back,leave:leave,isPlayer:isPlayer,focusPlayer:focusPlayer,parseM3u:parseM3u};
})();
