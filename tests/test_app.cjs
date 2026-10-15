const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../site/app.js'), 'utf8');
test('YouTube records remain identifiable in the library',()=>{
  assert.equal(app().run("normalizeRecord({site:'youtube',url:'https://www.youtube.com/watch?v=AbC123xyz_-'}).site"),'youtube');
});
test('YouTube filter searches saved results without exposing a key',async()=>{
  const a=app();a.element('#query').value='cats';a.element('#sourceFilter').value='youtube';
  a.run("makeCard=v=>v; state.catalogQuery='cats'; state.catalog=[normalizeRecord({site:'youtube',url:'https://www.youtube.com/watch?v=AbC123xyz_-',title:'Cats'})];");
  a.ctx.fetch=()=>{throw Error('must not request YouTube from browser');};
  await a.run('runSearch()');
  assert.equal(a.element('#cards').children.length,1);
  assert.equal(a.run('state.searching'),false);
});
test('failed niconico search keeps matching published results beside fresh results',async()=>{
  const a=app();a.element('#query').value='心霊映像';
  a.run("makeCard=v=>v; state.catalogQuery='心霊映像'; state.catalog=[normalizeRecord({site:'niconico',url:'https://www.nicovideo.jp/watch/sm1',title:'怖い動画'})]; searchPeerTube=async()=>[normalizeRecord({site:'peertube',url:'https://example.org/a'})]; searchNiconico=async()=>{throw Error('CORS');};");
  await a.run('runSearch()');
  assert.equal(a.run('state.live.length'),2);
  assert.match(a.element('#notice').textContent,/保存済みデータを表示/);
  assert.equal(a.run('state.searching'),false);
});
test('failed search for another query does not show unrelated old results',async()=>{
  const a=app();a.element('#query').value='UFO';
  a.run("makeCard=v=>v; state.catalogQuery='心霊映像'; state.catalog=[normalizeRecord({site:'niconico',url:'https://www.nicovideo.jp/watch/sm1',title:'幽霊'})]; searchPeerTube=async()=>[]; searchNiconico=async()=>{throw Error('CORS');};");
  await a.run('runSearch()');
  assert.equal(a.run('state.live.length'),0);
  assert.match(a.element('#notice').textContent,/保存済みデータはありません/);
});
test('published fallback supports title matching for a new query',()=>{
  const a=app();
  a.run("state.catalogQuery='心霊映像'; state.catalog=[normalizeRecord({site:'niconico',url:'https://www.nicovideo.jp/watch/sm1',title:'UFO 目撃映像'})];");
  assert.equal(a.run("catalogFallback('ufo 目撃',new Set(['niconico'])).length"),1);
});
function app() {
  const elements = new Map();
  const element = sel => {
    if (!elements.has(sel)) elements.set(sel, {value:'all', hidden:false, textContent:'',
      replaceChildren(...items){this.children=items;},close(){this.closed=true;},reset(){},
    });
    return elements.get(sel);
  };
  const storage = new Map();
  const ctx = vm.createContext({URL, URLSearchParams, Intl, AbortSignal,
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){}},
    location:{hostname:'example.org',pathname:'/'},
  });
  vm.runInContext(source,ctx);
  return {ctx,element,run:code=>vm.runInContext(code,ctx)};
}
test('distinct case and trailing slash URLs are not dropped',()=>{
  const a=app();
  assert.equal(a.run("dedupe(['Abc','abc','abc/'].map(x=>normalizeRecord({url:'https://example.org/'+x}))).length"),3);
});
test('all 500 saved favorites can be displayed',()=>{
  const a=app();
  a.run("makeCard=v=>v; state.tab='favorites'; state.favorites=Array.from({length:500},(_,i)=>normalizeRecord({url:'https://example.org/'+i})); render();");
  assert.equal(a.element('#cards').children.length,500);
});
test('failed favorite save leaves current state intact',()=>{
  const a=app();
  a.run("localStorage.setItem=()=>{throw Error('quota');}; toggleFavorite(normalizeRecord({url:'https://example.org/a'}));");
  assert.equal(a.run('state.favorites.length'),0);
  assert.ok(a.element('#notice').textContent);
});
test('failed manual save does not close dialog or report success',()=>{
  const a=app();a.element('#manualUrl').value='https://example.org/a';a.element('#manualTitle').value='test';
  a.run("localStorage.setItem=()=>{throw Error('quota');}; addManual({preventDefault(){}});");
  assert.equal(a.run('state.manual.length'),0);
  assert.equal(a.element('#manualDialog').closed,undefined);
  assert.ok(a.element('#manualError').textContent);
});
test('manual addition resets conflicting site filter',()=>{
  const a=app();a.element('#manualUrl').value='https://example.org/a';a.element('#manualTitle').value='test';a.element('#sourceFilter').value='vimeo';
  a.run('makeCard=v=>v; addManual({preventDefault(){}});');
  assert.equal(a.element('#sourceFilter').value,'all');
  assert.equal(a.element('#cards').children.length,1);
});
test('malformed API response fails instead of appearing empty',async()=>{
  const a=app();a.ctx.fetch=async()=>({ok:true,json:async()=>({error:'bad'})});
  await assert.rejects(a.run("searchPeerTube('ghost',true)"));
});
test('catalog reload failure retains displayed search results',async()=>{
  const a=app();a.run("makeCard=v=>v; state.live=[normalizeRecord({url:'https://example.org/a'})];");
  a.ctx.fetch=async()=>{throw Error('offline');};
  await a.run('loadCatalog()');
  assert.equal(a.run('state.live.length'),1);
});
test('invalid thumbnail does not discard otherwise valid video',async()=>{
  const a=app();a.ctx.fetch=async()=>({ok:true,json:async()=>({data:[{url:'https://example.org/a',thumbnailUrl:'https://[bad'}]})});
  assert.equal((await a.run("searchPeerTube('ghost',true)")).length,1);
});
test('failed backup saves are not reported as successful',async()=>{
  const a=app();a.run("localStorage.setItem=()=>{throw Error('quota');};");
  a.ctx.event={target:{files:[{size:100,text:async()=>JSON.stringify({app:'WorldMysteryArchive',version:1,favorites:[{url:'https://example.org/a'}],manual:[]})}]}};
  await a.run('importBackup(event)');
  assert.equal(a.run('state.favorites.length'),0);
  assert.match(a.element('#notice').textContent,/保存できません/);
});
