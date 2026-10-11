/* CineTV — Interfaccia TV 1.0 (Chromium/Tizen 5.5 friendly).
 * Catalogo dal Worker Cloudflare già configurato in ../config.js.
 * Nessuna chiave TMDB è inclusa in questo file.
 */
(function () {
  'use strict';
  var IMG = 'https://image.tmdb.org/t/p/';
  var worker = (window.CINETV_CONFIG && window.CINETV_CONFIG.workerUrl || '').trim().replace(/\/$/, '');
  var ready = /^https:\/\/[a-z0-9.-]+$/i.test(worker) && worker.indexOf('TUO-') < 0;
  var activePage = 'home', dialogMode = '', selected = null, season = 1, episode = 1, currentSeasons = [], currentEpisodes = [];
  var cache = {movies:[], series:[], all:[], providers:[], genres:[], genresTv:[]};
  var state = {heroIndex:0, catalogType:'movie', providerId:'', providerName:'', genreId:'', genreName:'', catalogPage:1, results:[], searchQuery:'', selectedBefore:null, menuOpen:false};
  var reqCounter = 0, lastMainFocus = null;
  var view = document.getElementById('view'), dialog = document.getElementById('dialog'), shade = document.getElementById('shade');
  var rail = document.getElementById('rail'), toastTimer = null;
  var searchTimer = null, searchFocusAfterSubmit = false, lastSearchRequest = 0;
  var playerLayer = el('player-layer'), trailerLayer = el('trailer-layer');
  var playback = {active:false, tracking:false, nextTimer:null, nextSeconds:0, autoQueued:false, startedAt:0, lastStoredTime:0};
  var trailerUrl = '';
  function el(id){return document.getElementById(id);}
  function read(key, fallback){try{return JSON.parse(localStorage.getItem(key)||'null')||fallback;}catch(e){return fallback;}}
  function save(key, val){try{localStorage.setItem(key,JSON.stringify(val));}catch(e){}}
  var favorites = read('cinetv_favorites',[]), recent = read('cinetv_recent_v3',[]);
  if(!Array.isArray(favorites))favorites=[];if(!Array.isArray(recent))recent=[];
  function escapeHTML(s){return String(s == null ? '' : s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function title(item){return item.title||item.name||'Titolo';}
  function kind(item){return item.media_type==='tv'?'tv':item.media_type==='movie'?'movie':item.first_air_date?'tv':'movie';}
  function img(item, size, field){var path = item && item[field||'backdrop_path'];return typeof path==='string' && /^\/[\w.-]+$/.test(path)?IMG+(size||'w780')+path:'';}
  function year(item){return String(item.release_date||item.first_air_date||'').slice(0,4) || '—';}
  function itemNorm(x,forcedType){if(!x)return null;return {id:Number(x.id),media_type:forcedType||kind(x),title:title(x),name:title(x),backdrop_path:x.backdrop_path||'',poster_path:x.poster_path||'',overview:x.overview||'',vote_average:Number(x.vote_average)||0,first_air_date:x.first_air_date||'',release_date:x.release_date||'',genres:x.genres||[],seasons:x.seasons||[]};}
  function getRecent(x){for(var i=0;i<recent.length;i++){if(Number(recent[i].id)===Number(x.id)&&recent[i].media_type===kind(x))return recent[i];}return null;}
  function isFav(x){for(var i=0;i<favorites.length;i++){if(Number(favorites[i].id)===Number(x.id)&&favorites[i].media_type===kind(x))return true;}return false;}
  function setToast(txt){var node=el('status');node.textContent=txt;node.classList.add('show');if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(function(){node.classList.remove('show');},3400);}
  function call(path,args){return new Promise(function(resolve,reject){
    if(!ready)return reject(new Error('Worker non configurato. Copia config.js del sito principale nella repository.'));
    var query=[];Object.keys(args||{}).forEach(function(k){if(args[k]!==''&&args[k]!=null)query.push(encodeURIComponent(k)+'='+encodeURIComponent(args[k]));});
    var url=worker+'/api'+path+(query.length?'?'+query.join('&'):'');
    var controller=(typeof AbortController!=='undefined')?new AbortController():null;
    var timer=setTimeout(function(){if(controller)controller.abort();},18000);
    fetch(url,{method:'GET',headers:{Accept:'application/json'},signal:controller?controller.signal:undefined}).then(function(r){if(!r.ok)throw new Error('Catalogo TMDB: HTTP '+r.status);return r.json();}).then(function(data){clearTimeout(timer);resolve(data);}).catch(function(e){clearTimeout(timer);reject(e);});
  });}
  function focusSafe(node){if(node && typeof node.focus==='function'){node.focus();node.classList.add('tv-active');setTimeout(function(){node.classList.remove('tv-active');},90); try{node.scrollIntoView({block:'nearest',inline:'nearest'});}catch(e){}}}
  function firstFocus(){focusSafe(view.querySelector('.tv-focus')||document.querySelector('.topnav .tv-focus'));}
  function navStatus(){document.querySelectorAll('.top-link').forEach(function(node){node.classList.toggle('selected',node.getAttribute('data-go')===activePage);});}
  function mainFocusTarget(){
    if(lastMainFocus && document.contains(lastMainFocus) && !isInRail(lastMainFocus) && lastMainFocus.classList.contains('tv-focus'))return lastMainFocus;
    return view.querySelector('.tv-focus') || document.querySelector('.top-link.selected') || document.querySelector('.topnav .tv-focus');
  }
  function menu(flag, firstAfterNavigation){
    state.menuOpen=flag;rail.classList.toggle('open',flag);
    if(flag){
      if(!isInRail(document.activeElement) && document.activeElement.classList.contains('tv-focus'))lastMainFocus=document.activeElement;
      focusSafe(rail.querySelector('.side-link[data-go="'+activePage+'"]')||rail.querySelector('.side-link'));
    }else{
      focusSafe(firstAfterNavigation?(view.querySelector('.tv-focus')||document.querySelector('.top-link.selected')):mainFocusTarget());
    }
  }
  function goto(page){closeDialog(false);if(page==='live'){activePage='live';navStatus();view.innerHTML='<div class="empty"><div class="hero-tag">CINETV · IN PREPARAZIONE</div><strong>TV in diretta</strong>Questa sezione arriverà in un futuro aggiornamento. Nessun canale è configurato in questa versione.</div>';menu(false);focusSafe(document.querySelector('.top-link[data-go="live"]'));return;}
    if(page==='search'){activePage=page;navStatus();renderSearch();}
    else if(page==='favorites'){activePage=page;navStatus();renderFavorites();}
    else if(page==='settings'){activePage=page;navStatus();renderSettings();}
    else if(page==='explore'){activePage=page;navStatus();renderExplore();}
    else if(page==='home'){activePage=page;navStatus();renderHome();}
    else if(page==='movie'||page==='tv'){activePage=page;state.catalogType=page;state.providerId='';state.providerName='';state.genreId='';state.genreName='';state.catalogPage=1;navStatus();renderCatalog();}
    lastMainFocus=null;menu(false,true);view.scrollTop=0;
  }
  function tile(item,idx,mode){var x=itemNorm(item),photo=img(x,'w780','backdrop_path')||img(x,'w500','poster_path'),r=getRecent(x);
    var label=mode==='recent' && r ? (kind(x)==='tv'?'STAGIONE '+(r.season||1)+' · EPISODIO '+(r.episode||1):'FILM · RIPRENDI') : (kind(x)==='tv'?'SERIE TV':'FILM');
    return '<button class="tile tv-focus" data-action="detail" data-source="'+mode+'" data-index="'+idx+'"><div class="tile-picture">'+(photo?'<img src="'+escapeHTML(photo)+'" alt="" loading="lazy">':'<div class="tile-placeholder">CineTV</div>')+'<span class="tile-kicker">'+escapeHTML(label)+'</span>'+(mode!=='recent'&&x.vote_average>=1?'<span class="tile-score">★ '+x.vote_average.toFixed(1)+'</span>':'')+'</div><div class="tile-bottom"><div class="tile-title">'+escapeHTML(title(x))+'</div><div class="tile-meta">'+(mode==='recent'?'Continua da qui':year(x))+'</div></div>'+(mode==='recent'?'<div class="tile-progress"><span></span></div>':'')+'</button>';
  }
  function strip(heading,sub,items,mode){if(!items || !items.length)return '';
    var h='<section class="section"><div class="section-heading"><h2>'+escapeHTML(heading)+'</h2><span class="subtitle">'+escapeHTML(sub||'')+'</span></div><div class="horizontal">';
    items.slice(0,17).forEach(function(x,i){h+=tile(x,i,mode);});return h+'</div></section>';
  }
  function heroBlock(items){if(!items.length)return '';
    var x=itemNorm(items[state.heroIndex%items.length]);var back=img(x,'w1280','backdrop_path')||img(x,'w780','poster_path');
    var excerpt=x.overview||'Scopri uno dei titoli più popolari del momento.';
    if(excerpt.length>185)excerpt=excerpt.slice(0,181).replace(/\s+\S*$/,'')+'…';
    var h='<div class="hero"><div class="hero-photo" style="background-image:url(&quot;'+escapeHTML(back)+'&quot;)"></div><div class="hero-scrim"></div><div class="hero-inner">'+
      '<div class="hero-tag"><i></i> CONSIGLIATO PER TE · '+(kind(x)==='tv'?'SERIE TV':'FILM')+'</div><h1 class="hero-title">'+escapeHTML(title(x))+'</h1><div class="hero-info"><span>'+escapeHTML(year(x))+'</span><span>'+(kind(x)==='tv'?'Serie TV':'Film')+'</span><span class="score">★ '+Number(x.vote_average||0).toFixed(1)+'</span></div><p class="hero-description">'+escapeHTML(excerpt)+'</p><div class="hero-buttons"><button class="action primary tv-focus" data-action="heroPlay">▶ &nbsp; Guarda ora</button><button class="action tv-focus" data-action="heroDetail">ⓘ &nbsp; Dettagli</button></div></div><div class="hero-pager">';
    for(var i=0;i<Math.min(items.length,5);i++)h+='<button class="pager-dot tv-focus '+(i===state.heroIndex?'active':'')+'" data-action="heroSlide" data-index="'+i+'" aria-label="Consigliato '+(i+1)+'"></button>';
    return h+'</div></div>';
  }
  function validRecent(){return recent.filter(function(r){return r && Number(r.id)>0 && (r.media_type==='tv'||r.media_type==='movie');}).slice(0,12).map(function(x){return itemNorm(x);});}
  function renderHome(){var pid=++reqCounter;
    var recentItems=validRecent();var cached=cache.all.length;
    if(cached){composeHome();return;}
    view.innerHTML='<div class="empty"><strong>La tua CineTV</strong>Caricamento dei titoli del momento…</div>';
    Promise.all([call('/trending/all/week',{page:1}),call('/trending/movie/week',{page:1}),call('/trending/tv/week',{page:1})]).then(function(all){if(pid!==reqCounter||activePage!=='home')return;
      cache.all=(all[0].results||[]).filter(function(x){return x.media_type==='movie'||x.media_type==='tv';});
      cache.movies=(all[1].results||[]).map(function(x){return itemNorm(x,'movie');});cache.series=(all[2].results||[]).map(function(x){return itemNorm(x,'tv');});composeHome();
    }).catch(function(e){if(pid!==reqCounter||activePage!=='home')return;cache.all=[];view.innerHTML=(recentItems.length?strip('Continua a guardare','',recentItems,'recent'):'')+'<div class="empty"><strong>Catalogo non disponibile</strong>'+escapeHTML(e.message)+'<div><button class="action tv-focus" data-action="retry">Riprova</button></div></div>';});
  }
  function composeHome(){var rec=validRecent();var list=cache.all.slice(0,5);
    view.innerHTML=heroBlock(list)+(rec.length?strip('Continua a guardare','Riprendi i tuoi ultimi titoli',rec,'recent'):'<section class="section"><div class="section-heading"><h2>Continua a guardare</h2></div></section><div class="empty-continue">I film e gli episodi che aprirai appariranno qui per ritrovarli più facilmente.</div>')+strip('Titoli del momento','Le novità più popolari',cache.all,'all')+strip('Film in evidenza','Da scoprire oggi',cache.movies,'movies')+strip('Serie TV più seguite','Scelte dal pubblico',cache.series,'series')+'<footer class="credits">Informazioni e locandine: TMDB. Cataloghi delle piattaforme: dati JustWatch tramite TMDB. Vixsrc è un servizio esterno indipendente. Utilizza soltanto contenuti di cui hai i diritti.</footer>';
  }
  function renderCatalog(){var pid=++reqCounter;var type=state.catalogType;
    view.innerHTML='<div class="contain-header"><div class="hero-tag">CINETV · CATALOGO</div><h1 class="section-title">'+(type==='tv'?'Serie TV':'Film')+'</h1><p class="page-description">'+escapeHTML(state.providerName?state.providerName+' · Disponibilità in abbonamento in Italia':state.genreName||'Scopri i titoli più popolari del momento')+'</p></div><div id="results"><div class="empty">Caricamento…</div></div>';
    var q={page:state.catalogPage,sort_by:'popularity.desc',include_adult:'false'};
    if(state.providerId){q.watch_region='IT';q.with_watch_providers=state.providerId;q.with_watch_monetization_types='flatrate';}
    if(state.genreId)q.with_genres=state.genreId;
    call('/discover/'+type,q).then(function(data){if(pid!==reqCounter||(activePage!=='movie'&&activePage!=='tv'&&activePage!=='catalog'))return;
      state.results=(data.results||[]).map(function(x){return itemNorm(x,type);});
      var resultHtml='<div class="catalog">'+state.results.map(function(x,i){return poster(x,i,'results');}).join('')+'</div>';
      if(!state.results.length)resultHtml='<div class="empty"><strong>Nessun risultato</strong>Prova altri filtri.</div>';
      if(Number(data.total_pages||0)>1)resultHtml+='<div class="pill-list" style="padding-left:80px"><button class="pill tv-focus" data-action="pagePrev" '+(state.catalogPage<=1?'disabled':'')+'>← Precedente</button><span class="pill" style="pointer-events:none">Pagina '+state.catalogPage+'</span><button class="pill tv-focus" data-action="pageNext" '+(state.catalogPage>=data.total_pages?'disabled':'')+'>Successiva →</button></div>';
      el('results').innerHTML=resultHtml;
    }).catch(function(e){if(pid===reqCounter&&el('results'))el('results').innerHTML='<div class="empty"><strong>Impossibile caricare</strong>'+escapeHTML(e.message)+'</div>';});
  }
  function poster(x,i,mode){var url=img(x,'w342','poster_path');return '<button class="poster tv-focus" data-action="detail" data-index="'+i+'" data-source="'+mode+'"><div class="poster-art">'+(url?'<img src="'+escapeHTML(url)+'" alt="" loading="lazy">':'')+'</div><div class="poster-name">'+escapeHTML(title(x))+'</div><div class="poster-detail">'+year(x)+' · '+(kind(x)==='tv'?'Serie TV':'Film')+'</div></button>';}
  function renderFavorites(){view.innerHTML='<div class="contain-header"><div class="hero-tag">LA TUA RACCOLTA</div><h1 class="section-title">Preferiti</h1><p class="page-description">I tuoi titoli salvati su questo dispositivo.</p></div>'+(favorites.length?'<div class="catalog">'+favorites.map(function(x,i){return poster(x,i,'favorites');}).join('')+'</div>':'<div class="empty"><strong>Non hai ancora preferiti</strong>Apri un film o una serie e seleziona «Aggiungi ai preferiti».</div>');}
  function renderSettings(){view.innerHTML='<div class="contain-header"><div class="hero-tag">CINETV · INFORMAZIONI</div><h1 class="section-title">La tua esperienza TV</h1><p class="page-description">Film, serie TV e catalogo aggiornato. Preferiti e cronologia sono salvati soltanto su questo dispositivo.</p></div><section class="section"><div class="section-heading"><h2>Come funziona</h2></div><div class="page-description" style="line-height:1.9">• Frecce per muoverti · OK per selezionare · Indietro per tornare.<br>• Cerca un titolo o apri Esplora per filtrare per piattaforma e genere.<br>• La traccia italiana è preferita quando il lettore la rende disponibile.<br>• «Continua a guardare» ricorda il titolo e, per le serie, stagione ed episodio: non il minuto preciso.</div></section><footer class="credits">Non affiliato a TMDB, JustWatch, Prime Video, Netflix, Disney+ o Vixsrc.</footer>';}
  var preferredProviders=[
    {label:'Netflix', names:['Netflix']},
    {label:'Prime Video', names:['Amazon Prime Video','Prime Video']},
    {label:'Disney+', names:['Disney Plus','Disney+']},
    {label:'NOW', names:['Now TV','NOW','NOW TV']},
    {label:'HBO / Max', names:['HBO Max','Max']},
    {label:'Apple TV+', names:['Apple TV Plus','Apple TV+','Apple TV']},
    {label:'Paramount+', names:['Paramount Plus','Paramount+']},
    {label:'RaiPlay', names:['Rai Play','RaiPlay']},
    {label:'Mediaset Infinity', names:['Mediaset Infinity','Infinity+']}
  ];
  function loadBrowseRefs(){if(cache.providers.length&&cache.genres.length&&cache.genresTv.length)return Promise.resolve();return Promise.all([call('/watch/providers/movie',{watch_region:'IT'}),call('/genre/movie/list',{}),call('/genre/tv/list',{})]).then(function(data){cache.providers=(data[0].results||[]);cache.genres=(data[1].genres||[]);cache.genresTv=(data[2].genres||[]);});}
  function renderExplore(){view.innerHTML='<div class="contain-header"><div class="hero-tag">CINETV · SCOPRI</div><h1 class="section-title">Esplora</h1><p class="page-description">Scegli una piattaforma o un genere per scoprire film e serie disponibili in Italia.</p></div><div id="explorer"><div class="empty">Caricamento categorie…</div></div>';
    var pid=++reqCounter;loadBrowseRefs().then(function(){if(pid!==reqCounter||activePage!=='explore')return;
      var picked=[];preferredProviders.forEach(function(option){
        for(var j=0;j<option.names.length;j++){
          var match=null;
          for(var i=0;i<cache.providers.length;i++){
            if(String(cache.providers[i].provider_name).toLowerCase()===option.names[j].toLowerCase()){
              match={provider_id:cache.providers[i].provider_id, provider_name:option.label};break;
            }
          }
          if(match){picked.push(match);break;}
        }
      });
      var html='<div class="section"><div class="section-heading"><h2>Scegli una piattaforma</h2><span class="subtitle">Disponibilità streaming in Italia · dati JustWatch</span></div></div><div class="platform-grid">';
      picked.forEach(function(p){html+='<button class="platform tv-focus" data-action="provider" data-id="'+p.provider_id+'" data-name="'+escapeHTML(p.provider_name)+'">'+escapeHTML(p.provider_name)+'<span class="platform-hint">Sfoglia titoli →</span></button>';});
      html+='</div><div class="section"><div class="section-heading"><h2>Oppure esplora per genere</h2></div></div><div class="genre-grid">';
      cache.genres.forEach(function(g){html+='<button class="genre tv-focus" data-action="genre" data-id="'+g.id+'" data-name="'+escapeHTML(g.name)+'">'+escapeHTML(g.name)+'</button>';});
      html+='</div><div class="filter-meta">Le piattaforme indicano la disponibilità ufficiale secondo TMDB/JustWatch; non garantiscono la riproduzione sul lettore esterno.</div>';
      el('explorer').innerHTML=html;
    }).catch(function(e){if(pid===reqCounter&&el('explorer'))el('explorer').innerHTML='<div class="empty"><strong>Esplora non disponibile</strong>'+escapeHTML(e.message)+'</div>';});
  }
  function renderSearch(){
    view.innerHTML='<div class="contain-header"><div class="hero-tag">CINETV · RICERCA</div><h1 class="section-title">Cosa vuoi guardare?</h1><p class="page-description">I risultati appaiono mentre scrivi, dopo due caratteri.</p><input id="search-input" class="search-box tv-focus" type="search" autocomplete="off" placeholder="Cerca un titolo…" value="'+escapeHTML(state.searchQuery)+'"><button class="action primary tv-focus" data-action="submitSearch">⌕ Cerca</button></div><div id="search-results"><div class="search-tip">Scrivi almeno 2 lettere per vedere i titoli corrispondenti.</div></div>';
    if(state.searchQuery.length>=2)runSearch(state.searchQuery,false);else focusSafe(el('search-input'));
  }
  function resultFocus(){var first=el('search-results')&&el('search-results').querySelector('.poster.tv-focus');return first||document.querySelector('[data-action="submitSearch"]');}
  function runSearch(value, focusWhenReady){
    var text=String(value||'').trim();state.searchQuery=text;
    var result=el('search-results');if(!result)return;
    if(searchTimer)clearTimeout(searchTimer);
    var pid=++reqCounter;
    if(text.length<2){state.results=[];result.innerHTML='<div class="search-tip">Scrivi almeno 2 lettere per vedere i titoli corrispondenti.</div>';return;}
    result.innerHTML='<div class="search-tip">Ricerca in corso…</div>';
    call('/search/multi',{query:text,include_adult:'false',page:1}).then(function(data){
      if(pid!==reqCounter||activePage!=='search'||state.searchQuery!==text)return;
      state.results=(data.results||[]).filter(function(x){return x.media_type==='tv'||x.media_type==='movie';}).map(function(x){return itemNorm(x);});
      result.innerHTML=state.results.length?'<div class="catalog">'+state.results.map(function(x,i){return poster(x,i,'results');}).join('')+'</div>':'<div class="empty"><strong>Nessun titolo trovato</strong>Prova un altro titolo.</div>';
      if(focusWhenReady || searchFocusAfterSubmit){searchFocusAfterSubmit=false;focusSafe(resultFocus());}
    }).catch(function(e){if(pid!==reqCounter||activePage!=='search')return;result.innerHTML='<div class="empty"><strong>Ricerca non disponibile</strong>'+escapeHTML(e.message)+'</div>';});
  }
  function submitSearch(){
    var field=el('search-input');if(!field)return;
    searchFocusAfterSubmit=true;field.blur();runSearch(field.value,true);
  }
  function choose(item){if(!item)return;selected=itemNorm(item);season=1;episode=1;var last=getRecent(selected);if(last){season=Number(last.season)||1;episode=Number(last.episode)||1;}
    currentSeasons=[];currentEpisodes=[];state.selectedBefore=document.activeElement;renderDetail();
    call('/'+kind(selected)+'/'+selected.id,{}).then(function(detail){if(!selected||Number(detail.id)!==selected.id)return;selected=itemNorm(Object.assign({},selected,detail));currentSeasons=detail.seasons||[];if(dialogMode==='detail')renderDetail();if(kind(selected)==='tv')loadEpisodes();}).catch(function(e){if(kind(selected)==='tv')loadEpisodes();});
  }
  function playerUrl(){if(!selected)return '';if(kind(selected)==='tv')return 'https://vixsrc.to/tv/'+selected.id+'/'+season+'/'+episode+'?lang=it';return 'https://vixsrc.to/movie/'+selected.id+'?lang=it';}
  function renderDetail(focusAction){if(!selected)return;dialogMode='detail';shade.classList.remove('hidden');dialog.classList.remove('hidden');
    var x=selected,photo=img(x,'w500','poster_path'),r=getRecent(x),f=isFav(x),isTv=kind(x)==='tv';
    var html='<button class="dialog-close tv-focus" data-action="close" aria-label="Chiudi">×</button><div class="detail-layout"><div class="detail-art">'+(photo?'<img src="'+escapeHTML(photo)+'" alt="">':'')+'</div><div class="detail-main"><span class="detail-kicker">'+(isTv?'SERIE TV':'FILM')+' · '+year(x)+'</span><h2>'+escapeHTML(title(x))+'</h2><div class="hero-info"><span class="score">★ '+Number(x.vote_average||0).toFixed(1)+'</span><span>TMDB</span></div><p>'+escapeHTML(x.overview||'Descrizione non disponibile in italiano.')+'</p><div class="detail-actions"><button class="action primary tv-focus" data-action="play">▶ Guarda ora</button><button class="action tv-focus" data-action="trailer">▷ Trailer</button><button class="action tv-focus" data-action="fav">'+(f?'♥ Nei preferiti':'♡ Aggiungi ai preferiti')+'</button></div>';
    if(isTv){var seasons=(currentSeasons||[]).filter(function(s){return Number(s.season_number)>0;});if(!seasons.length){seasons=[{season_number:season}];}
      html+='<div class="detail-divider"></div><div class="detail-kicker">STAGIONI</div><div class="season-row">';
      seasons.forEach(function(s){var v=Number(s.season_number);html+='<button class="season-btn tv-focus '+(v===season?'selected':'')+'" data-action="season" data-index="'+v+'">'+v+'</button>';});
      html+='</div><div class="detail-kicker" style="margin-top:20px">EPISODI</div><div class="episode-row">';
      if(currentEpisodes.length){currentEpisodes.slice(0,36).forEach(function(ep){var v=Number(ep.episode_number);if(v>0)html+='<button class="episodename tv-focus '+(v===episode?'selected':'')+'" data-action="episode" data-index="'+v+'">Episodio '+v+'</button>';});}
      else html+='<span style="color:#a9b5c8">Caricamento episodi…</span>';
      html+='</div>';
    }
    html+='</div></div>';dialog.innerHTML=html;focusSafe((focusAction==='season'?dialog.querySelector('[data-action="season"][data-index="'+season+'"]'):focusAction==='episode'?dialog.querySelector('[data-action="episode"][data-index="'+episode+'"]'):null)||dialog.querySelector('[data-action="play"]'));
  }
  function loadEpisodes(){if(!selected||kind(selected)!=='tv')return;var currentId=selected.id,requestedSeason=season;
    call('/tv/'+currentId+'/season/'+requestedSeason,{}).then(function(data){if(!selected||selected.id!==currentId||season!==requestedSeason)return;currentEpisodes=data.episodes||[];if(currentEpisodes.length&&!currentEpisodes.some(function(e){return Number(e.episode_number)===episode;}))episode=Number(currentEpisodes[0].episode_number)||1;if(dialogMode==='detail')renderDetail('season');}).catch(function(){currentEpisodes=[];});
  }
  function closeDialog(restore){if(!dialogMode)return;dialogMode='';dialog.classList.add('hidden');shade.classList.add('hidden');dialog.innerHTML='';if(restore!==false)focusSafe(state.selectedBefore);}
  function toggleFav(){if(!selected)return;var exists=isFav(selected);favorites=favorites.filter(function(x){return !(x.id===selected.id&&x.media_type===kind(selected));});if(!exists)favorites.unshift(itemNorm(selected));save('cinetv_favorites',favorites);renderDetail();setToast(exists?'Rimosso dai preferiti':'Aggiunto ai preferiti');}
  function rememberPlayback(time,duration){
    if(!selected)return;
    var x=itemNorm(selected),k=kind(x),now=Date.now();
    var old=getRecent(x);
    var entry=Object.assign({},x,{season:season,episode:episode,lastOpened:now,
      seconds:(typeof time==='number'&&isFinite(time)&&time>=0?Math.floor(time):old&&Number(old.seconds)||0),
      duration:(typeof duration==='number'&&isFinite(duration)&&duration>0?Math.floor(duration):old&&Number(old.duration)||0)});
    recent=recent.filter(function(r){return !(Number(r.id)===x.id&&r.media_type===k);});
    recent.unshift(entry);recent=recent.slice(0,20);save('cinetv_recent_v3',recent);
  }
  function embeddedLink(){
    var link=playerUrl();var r=getRecent(selected);
    if(r && r.seconds>=15 && (!r.duration||r.seconds<r.duration-30) &&
       (kind(selected)!=='tv'||(r.season===season&&r.episode===episode)))link+='&startAt='+Math.floor(r.seconds);
    return link+'&autoplay=true';
  }
  function launchPlay(){
    if(!selected||playback.active)return;
    rememberPlayback();closeDialog(false);
    playback.active=true;playback.tracking=false;playback.autoQueued=false;playback.startedAt=Date.now();playback.lastStoredTime=0;
    playerLayer.classList.remove('hidden');playerLayer.setAttribute('aria-hidden','false');
    el('playback-title').textContent=title(selected)+(kind(selected)==='tv'?' · S'+season+' E'+episode:'');
    el('player-external').href=playerUrl();
    el('player-frame').src=embeddedLink();
    el('player-hint').textContent='Usa i comandi del lettore per pausa e avanzamento. Se il video non si carica, scegli Apri direttamente.';
    el('up-next').classList.add('hidden');
    focusSafe(el('player-close'));
  }
  function clearNext(){
    if(playback.nextTimer){clearInterval(playback.nextTimer);playback.nextTimer=null;}
    playback.autoQueued=false;
    el('up-next').classList.add('hidden');
  }
  function closePlayback(returnToDetails){
    if(!playback.active)return;
    clearNext();
    playback.active=false;playback.tracking=false;
    el('player-frame').src='about:blank';
    playerLayer.classList.add('hidden');playerLayer.setAttribute('aria-hidden','true');
    if(returnToDetails && selected)renderDetail();else focusSafe(mainFocusTarget());
  }
  function nextEpisodeInfo(){
    if(!selected||kind(selected)!=='tv')return Promise.resolve(null);
    var id=selected.id,s=season,e=episode;
    return call('/tv/'+id+'/season/'+s,{}).then(function(result){
      var numbers=(result.episodes||[]).map(function(x){return Number(x.episode_number);}).filter(function(x){return x>e;}).sort(function(a,b){return a-b;});
      if(numbers.length)return {season:s,episode:numbers[0]};
      return call('/tv/'+id,{}).then(function(data){
        var valid=(data.seasons||[]).map(function(x){return Number(x.season_number);}).filter(function(x){return x>s;}).sort(function(a,b){return a-b;});
        if(!valid.length)return null;
        var newS=valid[0];
        return call('/tv/'+id+'/season/'+newS,{}).then(function(data2){
          var es=(data2.episodes||[]).map(function(x){return Number(x.episode_number);}).filter(function(x){return x>0;}).sort(function(a,b){return a-b;});
          return es.length?{season:newS,episode:es[0]}:null;
        });
      });
    });
  }
  function playNext(){
    var next=playback.pendingNext;if(!playback.active||!next)return;
    clearNext();
    season=next.season;episode=next.episode;currentEpisodes=[];playback.lastStoredTime=0;
    rememberPlayback(0,0);
    el('playback-title').textContent=title(selected)+' · S'+season+' E'+episode;
    el('player-external').href=playerUrl();
    el('player-frame').src=playerUrl()+'&autoplay=true';
    loadEpisodes();
    setToast('Riproduzione episodio '+episode+' della stagione '+season);
  }
  function announceNext(next){
    if(!next||!playback.active)return;
    playback.pendingNext=next;playback.autoQueued=true;
    playback.nextSeconds=6;
    el('up-next-title').textContent='Stagione '+next.season+' · Episodio '+next.episode;
    el('up-next-countdown').textContent='Riproduzione automatica tra '+playback.nextSeconds+' secondi';
    el('up-next').classList.remove('hidden');
    playback.nextTimer=setInterval(function(){
      if(!playback.active){clearNext();return;}
      playback.nextSeconds--;
      el('up-next-countdown').textContent='Riproduzione automatica tra '+playback.nextSeconds+' secondi';
      if(playback.nextSeconds<=0)playNext();
    },1000);
    focusSafe(el('play-next'));
  }
  window.addEventListener('message',function(ev){
    if(!playback.active||ev.origin!=='https://vixsrc.to')return;
    var frame=el('player-frame');if(!frame||ev.source!==frame.contentWindow)return;
    var msg=ev.data;
    if(typeof msg==='string'){try{msg=JSON.parse(msg);}catch(e){return;}}
    if(!msg||msg.type!=='PLAYER_EVENT'||!msg.data)return;
    var d=msg.data;
    if(d.event==='timeupdate'||d.event==='seeked'||d.event==='pause'){
      playback.tracking=true;
      if(isFinite(Number(d.currentTime)) && (d.event!=='timeupdate'||Date.now()-playback.lastStoredTime>=4000)){
        rememberPlayback(Number(d.currentTime),Number(d.duration));playback.lastStoredTime=Date.now();
      }
    }
    if(d.event==='ended'){
      playback.tracking=true;
      if(kind(selected)!=='tv'||playback.autoQueued)return;
      /* La fine dell'episodio è comunicata dal lettore; non la deduciamo da un timer. */
      playback.autoQueued=true;
      nextEpisodeInfo().then(function(next){if(!playback.active)return;
        if(next)announceNext(next);else{playback.autoQueued=false;setToast('Hai terminato gli episodi disponibili.');}
      }).catch(function(){playback.autoQueued=false;setToast('Impossibile verificare l’episodio successivo.');});
    }
  });
  function youtubeVideoRank(x){
    if(!x||x.site!=='YouTube'||!/^[A-Za-z0-9_-]{11}$/.test(x.key))return -1;
    if(x.type!=='Trailer'&&x.type!=='Teaser')return -1;
    return (x.iso_639_1==='it'?100:x.iso_639_1==='en'?50:10)
      +(x.type==='Trailer'?30:x.type==='Teaser'?12:0)
      +(x.official?8:0);
  }
  function launchTrailer(){
    if(!selected)return;
    var x=itemNorm(selected);
    var id=x.id,type=kind(x);
    el('trailer-caption').textContent='Ricerca trailer di '+title(x)+'…';
    trailerLayer.classList.remove('hidden');
    trailerLayer.setAttribute('aria-hidden','false');
    el('trailer-frame').src='about:blank';
    el('trailer-open').classList.add('hidden');
    closeDialog(false);focusSafe(el('trailer-close'));
    call('/'+type+'/'+id+'/videos',{include_video_language:'it,en,fr,es,de,ja,ko,zh,pt,ru,hi,ar,null'}).then(function(data){
      if(trailerLayer.classList.contains('hidden'))return;
      var videos=(data.results||[]).filter(function(v){return youtubeVideoRank(v)>0;});
      videos.sort(function(a,b){return youtubeVideoRank(b)-youtubeVideoRank(a);});
      if(!videos.length){el('trailer-caption').textContent='Trailer non disponibile per questo titolo.';return;}
      var chosen=videos[0];
      trailerUrl='https://www.youtube.com/watch?v='+chosen.key;
      el('trailer-caption').textContent=(chosen.iso_639_1==='it'?'Trailer italiano':chosen.iso_639_1==='en'?'Trailer in inglese':'Trailer in lingua originale')+' · '+title(x);
      el('trailer-open').classList.remove('hidden');
      el('trailer-frame').src='https://www.youtube-nocookie.com/embed/'+chosen.key+'?autoplay=1&rel=0';
    }).catch(function(err){el('trailer-caption').textContent='Trailer non disponibile: verifica che il Worker Cloudflare sia aggiornato.';});
  }
  function closeTrailer(){
    el('trailer-frame').src='about:blank';
    trailerLayer.classList.add('hidden');trailerLayer.setAttribute('aria-hidden','true');
    if(selected)renderDetail();else focusSafe(mainFocusTarget());
  }
  function openTrailerLink(){if(trailerUrl)window.location.assign(trailerUrl);}
  function doClick(node){if(!node)return;var action=node.getAttribute('data-action');var go=node.getAttribute('data-go');if(go){if(!isInRail(document.activeElement))lastMainFocus=document.activeElement;goto(go);return;}
    if(action==='heroSlide'){state.heroIndex=Number(node.getAttribute('data-index'))||0;composeHome();return;}
    if(action==='heroDetail'||action==='heroPlay'){choose(cache.all[state.heroIndex%cache.all.length]);if(action==='heroPlay'&&selected)launchPlay();return;}
    if(action==='detail'){var source=node.getAttribute('data-source'),index=Number(node.getAttribute('data-index')),items={recent:validRecent(),all:cache.all,movies:cache.movies,series:cache.series,results:state.results,favorites:favorites};choose((items[source]||[])[index]);return;}
    if(action==='close'){closeDialog();return;}
    if(action==='season'){season=Number(node.getAttribute('data-index'))||1;episode=1;currentEpisodes=[];renderDetail('season');loadEpisodes();return;}
    if(action==='episode'){episode=Number(node.getAttribute('data-index'))||1;renderDetail('episode');return;}
    if(action==='fav'){toggleFav();return;}
    if(action==='play'){launchPlay();return;}
    if(action==='trailer'){launchTrailer();return;}
    if(action==='playerClose'){closePlayback(true);return;}
    if(action==='nextEpisode'){playNext();return;}
    if(action==='cancelNext'){clearNext();return;}
    if(action==='trailerClose'){closeTrailer();return;}
    if(action==='youtubeOpen'){openTrailerLink();return;}
    if(action==='provider'){state.providerId=node.getAttribute('data-id');state.providerName=node.getAttribute('data-name');state.genreId='';state.genreName='';state.catalogType='movie';state.catalogPage=1;activePage='catalog';view.scrollTop=0;renderProviderSelect();return;}
    if(action==='genre'){state.genreId=node.getAttribute('data-id');state.genreName=node.getAttribute('data-name');state.providerId='';state.providerName='';state.catalogType='movie';state.catalogPage=1;activePage='catalog';view.scrollTop=0;renderProviderSelect();return;}
    if(action==='chooseType'){state.catalogType=node.getAttribute('data-type');state.catalogPage=1;renderProviderSelect();return;}
    if(action==='pageNext'||action==='pagePrev'){state.catalogPage+=action==='pageNext'?1:-1;if(state.catalogPage<1)state.catalogPage=1;renderCatalog();view.scrollTop=0;return;}
    if(action==='submitSearch'){submitSearch();return;}
    if(action==='retry'){renderHome();return;}
  }
  function renderProviderSelect(){var header='<div class="contain-header"><div class="hero-tag">CINETV · ESPLORA</div><h1 class="section-title">'+escapeHTML(state.providerName||state.genreName)+'</h1><p class="page-description">Sfoglia film e serie TV. Disponibilità ufficiale in Italia, quando applicabile.</p><div class="pill-list"><button class="pill tv-focus '+(state.catalogType==='movie'?'active':'')+'" data-action="chooseType" data-type="movie">Film</button><button class="pill tv-focus '+(state.catalogType==='tv'?'active':'')+'" data-action="chooseType" data-type="tv">Serie TV</button><button class="pill tv-focus" data-go="explore">← Tutte le categorie</button></div></div><div id="results"><div class="empty">Caricamento…</div></div>';
    view.innerHTML=header;var pid=++reqCounter;var t=state.catalogType;var q={page:state.catalogPage,sort_by:'popularity.desc',include_adult:'false'};if(state.providerId){q.watch_region='IT';q.with_watch_providers=state.providerId;q.with_watch_monetization_types='flatrate';}if(state.genreId){var gid=state.genreId;if(t==='tv'&&cache.genresTv.length){for(var gi=0;gi<cache.genresTv.length;gi++){if(cache.genresTv[gi].name.toLowerCase()===state.genreName.toLowerCase()){gid=cache.genresTv[gi].id;break;}}}q.with_genres=gid;}
    call('/discover/'+t,q).then(function(data){if(pid!==reqCounter||activePage!=='catalog')return;state.results=(data.results||[]).map(function(x){return itemNorm(x,t);});var r=el('results');if(!r)return;r.innerHTML='<div class="catalog">'+state.results.map(function(x,i){return poster(x,i,'results');}).join('')+'</div>'+(Number(data.total_pages)>1?'<div class="pill-list" style="padding-left:80px"><button class="pill tv-focus" data-action="pagePrev" '+(state.catalogPage<=1?'disabled':'')+'>← Precedente</button><span class="pill">Pagina '+state.catalogPage+'</span><button class="pill tv-focus" data-action="pageNext">Successiva →</button></div>':'');}).catch(function(e){if(pid===reqCounter&&el('results'))el('results').innerHTML='<div class="empty"><strong>Non disponibile</strong>'+escapeHTML(e.message)+'</div>';});
  }
  function back(){if(!trailerLayer.classList.contains('hidden')){closeTrailer();return;}if(playback.active){closePlayback(true);return;}if(dialogMode){closeDialog();return;}if(state.menuOpen){menu(false);return;}if(activePage==='catalog'){goto('explore');return;}if(activePage!=='home'){goto('home');return;}menu(true);}
  function isInRail(n){return n&&rail.contains(n);}
  function spatial(direction){var current=document.activeElement;if(current&&current.tagName==='INPUT')return;
    if(playback.active){
      var playerButtons=[].slice.call(playerLayer.querySelectorAll('.tv-focus')).filter(function(n){return !n.classList.contains('hidden')&&!n.closest('.hidden');});
      var pos=playerButtons.indexOf(current),step=(direction==='left'||direction==='up')?-1:1;
      focusSafe(playerButtons[(pos+step+playerButtons.length)%playerButtons.length]||el('player-close'));return;
    }
    if(!trailerLayer.classList.contains('hidden')){
      var trailerButtons=[].slice.call(trailerLayer.querySelectorAll('.tv-focus')).filter(function(n){return !n.classList.contains('hidden')&&!n.closest('.hidden');});
      var pos2=trailerButtons.indexOf(current),step2=(direction==='left'||direction==='up')?-1:1;
      focusSafe(trailerButtons[(pos2+step2+trailerButtons.length)%trailerButtons.length]||el('trailer-close'));return;
    }
    if(!current||!current.classList.contains('tv-focus')){firstFocus();return;}
    if(isInRail(current)&&direction==='right'){menu(false);return;}
    if(!dialogMode&&!isInRail(current)&&direction==='left'&&current.getBoundingClientRect().left<380){lastMainFocus=current;menu(true);return;}
    var scope=dialogMode?dialog:(state.menuOpen?rail:document);
    var nodes=[].slice.call(scope.querySelectorAll('.tv-focus')).filter(function(n){var r=n.getBoundingClientRect();return !n.disabled&&r.width>0&&r.height>0&&r.bottom>0&&r.top<window.innerHeight;});
    var a=current.getBoundingClientRect(),ax=a.left+a.width/2,ay=a.top+a.height/2,best=null,score=Infinity;
    nodes.forEach(function(n){if(n===current)return;var b=n.getBoundingClientRect(),bx=b.left+b.width/2,by=b.top+b.height/2,dx=bx-ax,dy=by-ay;
      if(direction==='right'&&dx<12 ||direction==='left'&&dx>-12 ||direction==='up'&&dy>-12 ||direction==='down'&&dy<12)return;
      var longitudinal=(direction==='right'||direction==='left')?Math.abs(dx):Math.abs(dy);
      var cross=(direction==='right'||direction==='left')?Math.abs(dy):Math.abs(dx);
      var s=longitudinal+cross*2.35;if(cross>longitudinal*1.8)s+=600;if(s<score){score=s;best=n;}
    });
    if(best){focusSafe(best);return;}
    // Let a horizontal row scroll when its next item is currently offscreen.
    var row=current.closest?current.closest('.horizontal'):null;
    if(row && (direction==='right'||direction==='left')){row.scrollLeft+=(direction==='right'?310:-310);return;}
    if(direction==='left'&&!dialogMode&&!state.menuOpen){lastMainFocus=current;menu(true);}
  }
  document.addEventListener('click',function(e){var node=e.target.closest?e.target.closest('[data-action],[data-go]'):null;if(node)doClick(node);});
  document.addEventListener('input',function(e){
    if(e.target.id!=='search-input')return;
    if(searchTimer)clearTimeout(searchTimer);
    var value=e.target.value;
    state.searchQuery=value;
    searchTimer=setTimeout(function(){runSearch(value,false);},360);
  });
  document.addEventListener('keydown',function(e){var code=e.keyCode||e.which;if(code===10009||code===27||code===8&&document.activeElement.tagName!=='INPUT'){e.preventDefault();back();return;}
    if(code===13){var node=document.activeElement;if(node&&node.id==='search-input'){e.preventDefault();submitSearch();}return;}
    if(code===37||code===38||code===39||code===40){
      if(document.activeElement.id==='search-input'){
        if(code===40){e.preventDefault();document.activeElement.blur();focusSafe(resultFocus());}
        return;
      }
      e.preventDefault();spatial(({37:'left',38:'up',39:'right',40:'down'})[code]);
    }
  },true);
  // TV apps may dispatch the key on window when focus is absent.
  window.addEventListener('pageshow',function(){if(activePage==='home'&&cache.all.length){composeHome();}});
  document.addEventListener('visibilitychange',function(){if(!document.hidden && activePage==='home'&&cache.all.length)composeHome();});
  /* Copertina consigliata ogni ~8 secondi. La rotazione si ferma durante l'uso del telecomando. */
  setInterval(function(){
    if(activePage!=='home'||dialogMode||state.menuOpen||playback.active||!trailerLayer.classList.contains('hidden')||cache.all.length<2||document.hidden)return;
    if(view.contains(document.activeElement))return;
    state.heroIndex=(state.heroIndex+1)%Math.min(cache.all.length,5);
    composeHome();
  },7800);
  goto('home');
})();
