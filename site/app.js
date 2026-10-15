/* World Mystery Archive - no credentials are ever stored in browser code. */
'use strict';
const $ = (sel) => document.querySelector(sel);
const STORE_FAVORITES = 'worldMysteryArchive.favorites.v1';
const STORE_MANUAL = 'worldMysteryArchive.manual.v1';
const MAX_LOCAL = 500;
const state = {
  catalog: [], live: null, tab: 'all', favorites: loadItems(STORE_FAVORITES),
  manual: loadItems(STORE_MANUAL), dictionary: [], searching: false,
  sources: [], query: '', updatedAt: null,
};

function loadItems(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(data) ? data.slice(0, MAX_LOCAL).map(normalizeRecord).filter(Boolean) : [];
  } catch (_) { return []; }
}
function saveItems(key, records) {
  try { localStorage.setItem(key, JSON.stringify(records.slice(0, MAX_LOCAL))); return true; }
  catch (_) { showNotice('端末の保存容量が不足しています。お気に入りをバックアップして整理してください。'); return false; }
}
function safeUrl(value) {
  try { const url = new URL(String(value || '').trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname && !url.username && !url.password ? url.href : null;
  } catch (_) { return null; }
}
function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const url = safeUrl(raw.url);
  if (!url) return null;
  const title = String(raw.title || '無題の動画').replace(/[\x00-\x1f]/g, ' ').slice(0, 180);
  const sites = ['peertube', 'niconico', 'vimeo', 'manual'];
  const site = sites.includes(raw.site) ? raw.site : 'manual';
  return {
    id: site + ':' + url, url,
    title, site, thumbnail: safeUrl(raw.thumbnail),
    views: raw.views !== null && raw.views !== undefined && raw.views !== '' && Number.isFinite(Number(raw.views)) && Number(raw.views) >= 0 ? Number(raw.views) : null,
    published: typeof raw.published === 'string' && !isNaN(Date.parse(raw.published)) ? raw.published : null,
    author: String(raw.author || '').slice(0, 90),
  };
}
function dedupe(items) { return Array.from(new Map(items.map((v) => [v.url, v])).values()); }
function showNotice(msg) { const el = $('#notice'); el.textContent = msg; el.hidden = !msg; }
function setStatus(msg) { $('#syncMessage').textContent = msg; }
function queryTerms(input, mode, extras) {
  const base = input.trim(); const terms = [base];
  if (mode === 'multi') {
    const group = state.dictionary.find(g => g.triggers.some(t => base.toLocaleLowerCase().includes(t.toLocaleLowerCase())));
    if (group) terms.push(...group.terms.slice(0, 5));
  }
  if (extras) terms.push(...extras.split(/[,，\n]/).map(s => s.trim()).filter(Boolean));
  return [...new Set(terms)].filter(t => t.length <= 120).slice(0, 8);
}
function render() {
  let pool = state.live !== null ? state.live : state.catalog;
  pool = dedupe([...pool, ...state.manual]);
  if (state.tab === 'favorites') pool = state.favorites.slice();
  if (state.tab === 'manual') pool = state.manual.slice();
  const source = $('#sourceFilter').value;
  if (source !== 'all') pool = pool.filter(v => v.site === source);
  const sort = $('#sortMode').value;
  if (sort === 'recent') pool.sort((a,b) => (Date.parse(b.published) || -Infinity) - (Date.parse(a.published) || -Infinity));
  else if (sort === 'popular') pool.sort((a,b) => (b.views || 0) - (a.views || 0));
  $('#count').textContent = pool.length.toLocaleString('ja-JP');
  $('#favoriteCount').textContent = state.favorites.length;
  $('#manualCount').textContent = state.manual.length;
  $('#cards').replaceChildren(...pool.map(makeCard));
  $('#empty').hidden = pool.length > 0;
  $('#empty h3').textContent = state.tab === 'favorites' ? 'お気に入りはまだありません' : state.tab === 'manual' ? '手動登録した動画はありません' : 'まだ動画はありません';
  $('#empty p').textContent = state.tab === 'favorites' ? '各動画カードのハートボタンでお気に入りに登録できます。' : state.tab === 'manual' ? '「URLを登録」から好きな動画ページを追加してください。' : '検索欄から世界の動画を探すか、動画URLを手動登録してください。公開データはGitHub Actionsで一括更新できます。';
}
function makeCard(video) {
  const article = document.createElement('article'); article.className = 'video-card';
  const thumb = document.createElement('div'); thumb.className = 'thumb';
  if (video.thumbnail) {
    const img = document.createElement('img'); img.src = video.thumbnail; img.alt = '';
    img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {img.remove(); addPlaceholder(thumb);}, {once:true}); thumb.append(img);
  } else addPlaceholder(thumb);
  const pill = document.createElement('span'); pill.className = 'site-pill';
  pill.textContent = ({peertube:'🌍 PeerTube',niconico:'🎬 ニコニコ',vimeo:'◈ Vimeo',manual:'✎ 手動登録'})[video.site] || video.site;
  thumb.append(pill);
  const body = document.createElement('div'); body.className = 'card-body';
  const title = document.createElement('span'); title.className='video-title'; title.textContent=video.title;
  const meta = document.createElement('div'); meta.className='video-meta';
  if (video.views !== null) { const s=document.createElement('span');s.textContent='▶ '+formatViews(video.views)+' 再生';meta.append(s); }
  if (video.published) { const d=document.createElement('span');d.textContent='◷ '+new Date(video.published).toLocaleDateString('ja-JP');meta.append(d); }
  if (video.author) { const a=document.createElement('span');a.textContent=video.author;meta.append(a); }
  const actions = document.createElement('div');actions.className='card-actions';
  const watch = document.createElement('a');watch.className='watch';watch.href=video.url;watch.target='_blank';watch.rel='noopener noreferrer';watch.textContent='動画を見る ↗';
  actions.append(watch);
  const liked=state.favorites.some(v=>v.url===video.url);
  const fav = document.createElement('button');fav.type='button';fav.className='icon-btn'+(liked?' liked':'');fav.textContent=liked?'♥':'♡';fav.title=liked?'お気に入りから削除':'お気に入りに登録';fav.setAttribute('aria-label',fav.title);
  fav.addEventListener('click',()=>toggleFavorite(video));actions.append(fav);
  if (state.manual.some(v=>v.url===video.url)) {
    const del=document.createElement('button');del.type='button';del.className='icon-btn';del.textContent='×';del.title='手動登録から削除';del.setAttribute('aria-label',del.title);
    del.addEventListener('click',()=>{if (confirm('手動登録から削除しますか？')) {const next=state.manual.filter(v=>v.url!==video.url);if(saveItems(STORE_MANUAL,next)){state.manual=next;render();}}});
    actions.append(del);
  }
  body.append(title,meta,actions);article.append(thumb,body);return article;
}
function addPlaceholder(thumb) { if (!thumb.querySelector('.placeholder')) {const span=document.createElement('span');span.className='placeholder';span.textContent='◉';thumb.prepend(span);} }
function formatViews(n) { return new Intl.NumberFormat('ja-JP',{notation:n>=10000?'compact':'standard',maximumFractionDigits:1}).format(n); }
function toggleFavorite(video) {
  const liked=state.favorites.some(v=>v.url===video.url);
  if (!liked && state.favorites.length>=MAX_LOCAL) {showNotice('お気に入りの上限は500件です。');return;}
  const next=liked ? state.favorites.filter(v=>v.url!==video.url) : [video,...state.favorites];
  if(saveItems(STORE_FAVORITES,next)){state.favorites=next;showNotice('');render();}
}
function setTab(tab) {state.tab=tab;document.querySelectorAll('[role="tab"]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));render();}
async function loadCatalog() {
  try {
    const res=await fetch('./data/catalog.json?fresh='+Date.now(),{cache:'no-store'});
    if (!res.ok) throw new Error('HTTP '+res.status);
    const json=await res.json();state.catalog=dedupe((json.videos||[]).map(normalizeRecord).filter(Boolean));
    state.updatedAt=json.updated_at || null;state.sources=Array.isArray(json.sources)?json.sources:[];
    $('#latestStamp').textContent=state.updatedAt?'公開データ最終更新 '+new Date(state.updatedAt).toLocaleString('ja-JP'):'公開データ未取得';
    if (state.sources.some(s=>(s.status==='error'||s.status==='partial'))) showNotice('前回の一括更新で一部サイトの取得が失敗しました。'+state.sources.filter(s=>(s.status==='error'||s.status==='partial')).map(s=>s.site).join('、'));
    else showNotice('');
    state.live=null;render();
    setStatus(state.catalog.length ? '公開データを'+state.catalog.length+'件読み込みました。検索欄から新しく探すこともできます。':'公開データはまだありません。検索を実行するか、Actionsで一括収集してください。');
  } catch (err) {
    render();setStatus('公開データを読み込めませんでした。表示中のデータは保持しています。');
  }
}
function responseItems(data) {
  if (!data || !Array.isArray(data.data)) throw new Error('APIの応答形式が不正です');
  return data.data.filter(v=>v && typeof v==='object');
}
function thumbnailUrl(value) {
  try {return value ? safeUrl(new URL(value,'https://sepiasearch.org').href) : null;} catch (_) {return null;}
}
async function searchPeerTube(term, safe) {
  const params=new URLSearchParams({search:term,count:'20',sort:'-match'});
  if (safe) params.set('nsfw','false');
  const resp=await fetch('https://sepiasearch.org/api/v1/search/videos?'+params,{signal:AbortSignal.timeout(12000)});
  if (!resp.ok) throw new Error('HTTP '+resp.status);
  const j=await resp.json();
  return responseItems(j).map(v => {
    const videoUrl=v.url || (v.uuid && (v.channel?.host || v.account?.host) ? 'https://'+(v.channel?.host || v.account?.host)+'/w/'+v.uuid : null);
    return normalizeRecord({url:videoUrl,title:v.name,site:'peertube',thumbnail:thumbnailUrl(v.thumbnailUrl || v.thumbnailPath),views:v.views,published:v.publishedAt||v.createdAt,author:v.channel?.displayName||v.account?.displayName});
  }).filter(Boolean);
}
async function searchNiconico(term) {
  const params=new URLSearchParams({q:term,targets:'title,description,tags',fields:'contentId,title,thumbnailUrl,viewCounter,startTime,userId',_sort:'-viewCounter',_limit:'30',_context:'WorldMysteryArchive'});
  const resp=await fetch('https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?'+params,{signal:AbortSignal.timeout(12000)});
  if (!resp.ok) throw new Error('HTTP '+resp.status);
  const j=await resp.json();
  return responseItems(j).map(v=>normalizeRecord({url:v.contentId?'https://www.nicovideo.jp/watch/'+encodeURIComponent(v.contentId):null,title:v.title,site:'niconico',thumbnail:v.thumbnailUrl,views:v.viewCounter,published:v.startTime})).filter(Boolean);
}
async function runSearch(event) {
  event?.preventDefault();
  if (state.searching) return;
  const query=$('#query').value.trim();if (!query) return;
  state.searching=true;$('#runSearch').disabled=true;state.query=query;
  const terms=queryTerms(query,$('#languageMode').value,$('#extraTerms').value);
  const source=$('#sourceFilter').value;const tasks=[];
  if (source==='all'||source==='peertube') terms.forEach(term=>tasks.push({site:'PeerTube',term,run:()=>searchPeerTube(term,$('#familySafe').checked)}));
  if (source==='all'||source==='niconico') tasks.push({site:'ニコニコ動画',term:query,run:()=>searchNiconico(query)});
  if (source==='vimeo') {showNotice('Vimeoの検索はGitHub Actionsの「Run workflow」から一括更新してください。APIトークンをブラウザに置かないための安全対策です。');state.searching=false;$('#runSearch').disabled=false;return;}
  if (source==='manual') {state.searching=false;$('#runSearch').disabled=false;setTab('manual');return;}
  setTab('all');setStatus('公開APIを検索中：'+tasks.length+'件の問い合わせ（無料・手動実行）');showNotice('');
  const settled=await Promise.allSettled(tasks.map(t=>t.run()));
  const success=settled.filter(r=>r.status==='fulfilled');
  const failures=settled.map((r,i)=>r.status==='rejected'?tasks[i].site+'('+tasks[i].term+')':null).filter(Boolean);
  state.live=success.length ? dedupe(success.flatMap(r=>r.value)) : null;state.searching=false;$('#runSearch').disabled=false;render();
  setStatus('新規検索：'+(state.live?.length || 0)+'件 / 成功 '+success.length+'回・失敗 '+failures.length+'回');
  if (failures.length) showNotice('一部のAPIに接続できませんでした：'+failures.slice(0,5).join('、')+'。ブラウザのCORS制限、API障害、検索件数制限等が考えられます。GitHub Actionsからの一括更新をお試しください。');
}

function setupGitHubLink() {
  const hostname=location.hostname;let dest='https://github.com';
  const repoConfig=(document.querySelector('meta[name="github-repo"]')?.content||'').trim();
  if (/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(repoConfig)) dest='https://github.com/'+repoConfig;
  else if (/^[a-zA-Z0-9-]+\.github\.io$/.test(hostname)) {
    const owner=hostname.slice(0,-10);const first=location.pathname.split('/').filter(Boolean)[0];
    const repo=first && first!=='index.html'?first:owner+'.github.io';
    dest='https://github.com/'+owner+'/'+repo;
  }
  $('#actionsLink').href=dest==='https://github.com'?dest:dest+'/actions/workflows/site.yml';
}
function openDialog() {$('#manualError').textContent='';$('#manualDialog').showModal();$('#manualUrl').focus();}
function addManual(event) {
  event.preventDefault();const url=safeUrl($('#manualUrl').value);
  if (!url) {$('#manualError').textContent='http または https で始まる正しいURLを入力してください。';return;}
  const title=$('#manualTitle').value.trim();if (!title) {$('#manualError').textContent='タイトルを入力してください。';return;}
  if (state.manual.length>=MAX_LOCAL) {$('#manualError').textContent='手動登録は最大500件までです。';return;}
  if (state.manual.some(v=>v.url===url)) {$('#manualError').textContent='このURLは登録済みです。';return;}
  const record=normalizeRecord({url,title,site:'manual'});const next=[record,...state.manual];
  if(!saveItems(STORE_MANUAL,next)){$('#manualError').textContent='保存できませんでした。ブラウザの保存設定と空き容量を確認してください。';return;}
  state.manual=next;$('#sourceFilter').value='all';
  $('#manualDialog').close();$('#manualForm').reset();state.live=null;setTab('manual');showNotice('動画URLを端末に保存しました。別の端末にも移す場合はバックアップをご利用ください。');
}
function exportBackup() {
  const payload={app:'WorldMysteryArchive',version:1,exportedAt:new Date().toISOString(),favorites:state.favorites,manual:state.manual};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='world-mystery-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
}
async function importBackup(event) {
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  if(file.size>2_000_000) {showNotice('バックアップファイルの最大サイズは2MBです。');return;}
  try {
    const content=JSON.parse(await file.text());if(content.app!=='WorldMysteryArchive'||content.version!==1||!Array.isArray(content.favorites)||!Array.isArray(content.manual)) throw new Error('形式が違います');
    const favorites=dedupe([...content.favorites.map(normalizeRecord).filter(Boolean),...state.favorites]);
    const manual=dedupe([...content.manual.map(normalizeRecord).filter(Boolean),...state.manual]);
    const favoritesSaved=saveItems(STORE_FAVORITES,favorites.slice(0,MAX_LOCAL));
    const manualSaved=saveItems(STORE_MANUAL,manual.slice(0,MAX_LOCAL));
    if(favoritesSaved)state.favorites=favorites.slice(0,MAX_LOCAL);
    if(manualSaved)state.manual=manual.slice(0,MAX_LOCAL);
    render();
    if(!favoritesSaved || !manualSaved){showNotice('復元の一部または全部を保存できませんでした。元のバックアップを保管し、ブラウザの保存設定と空き容量を確認してください。');return;}
    showNotice('お気に入り '+state.favorites.length+'件、手動登録 '+state.manual.length+'件に統合しました。');
  } catch (_) {showNotice('このファイルは対応するバックアップ形式ではありません。');}
}
async function init() {
  setupGitHubLink();
  $('#searchForm').addEventListener('submit',runSearch);
  $('#chips').addEventListener('click',e=>{const b=e.target.closest('button[data-key]');if(!b)return;$('#query').value=b.dataset.key;runSearch();});
  $('#sortMode').addEventListener('change',render);$('#sourceFilter').addEventListener('change',render);
  $('#refreshCatalog').addEventListener('click',loadCatalog);
  document.querySelectorAll('[role="tab"]').forEach(btn=>btn.addEventListener('click',()=>setTab(btn.dataset.tab)));
  $('#addManual').addEventListener('click',openDialog);$('#closeDialog').addEventListener('click',()=>$('#manualDialog').close());$('#cancelDialog').addEventListener('click',()=>$('#manualDialog').close());
  $('#manualForm').addEventListener('submit',addManual);
  $('#exportData').addEventListener('click',exportBackup);$('#importData').addEventListener('click',()=>$('#importFile').click());$('#importFile').addEventListener('change',importBackup);
  try {const r=await fetch('./data/dictionary.json');if(r.ok){const j=await r.json();state.dictionary=j.groups||[];}}catch(_){}
  await loadCatalog();
}
document.addEventListener('DOMContentLoaded',init);
