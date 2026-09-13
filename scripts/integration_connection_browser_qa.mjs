// Synthetic gateway exists only in this local QA server, never in the app bundle.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
const webRequire = createRequire(resolve(root, 'apps/web/package.json'));
const { createServer } = await import(webRequire.resolve('vite'));
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client';
import {WebCommunityIntegration} from '/src/components/WebCommunityIntegration.tsx';
import {captureIntegrationCallback,completeStoredIntegrationCallback,INTEGRATION_ATTEMPT_KEY} from '/@fs${root}/shared/integrationCallback.ts';
import {integrationStatus} from '/@fs${root}/shared/communityIntegrationStatus.ts';
window.callbackQA={captureIntegrationCallback,completeStoredIntegrationCallback,key:INTEGRATION_ATTEMPT_KEY};
import '/src/index.css'; window.React=React;
const state={status:'disconnected',enabled:false,canManage:true};
window.qa={calls:0,fail:false,unavailable:false,delay:0};
window.recovery=(binding,key)=>{window.qa.binding=binding;window.render(key);};
const gateway={scopeKey:'one',load:async()=>window.qa.binding ? integrationStatus(window.qa.binding,state.enabled,true,Date.now()) : ({...state,cleanupPending:false,reconciliationRequired:false,actions:state.status==='active'?['disconnect']:['connect']}),enable:async enabled=>{state.enabled=enabled;},disconnect:async()=>{state.status='disconnected';window.qa.binding=null;},
connect:async()=>{window.qa.calls++; await new Promise(r=>setTimeout(r,window.qa.delay)); if(window.qa.fail){state.status='error';return {available:true};}
if(window.qa.unavailable)return {available:false};state.status='active';return {available:true};}};
const root=createRoot(document.getElementById('root'));
window.render=(key='one')=>root.render(<main style={{width:'100%'}}><WebCommunityIntegration builder gateway={{...gateway,scopeKey:key}}/><header className='community-channel-header'><h1>Agent</h1><WebCommunityIntegration gateway={{...gateway,scopeKey:key}}/></header></main>);
window.render();`;
const server = await createServer({ root: resolve(root, 'apps/web'), configFile: false,
  server: { host: '127.0.0.1', port: 5198, strictPort: true },
  plugins: [{ name:'integration-qa', resolveId:id=>id==='/qa-entry.tsx'?id:null, load:id=>id==='/qa-entry.tsx'?entry:null,
    configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url!=='/qa'&&!req.url.startsWith('/qa?'))return next();res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/qa-entry.tsx"></script></body></html>');});} }] });
let browser;
try {
  await server.listen(); browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1100,height:750}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5198/qa');
  await page.getByRole('switch').click();
  // Remount represents revisiting Agent after builder changes settings.
  await page.evaluate(()=>window.render());
  await page.getByRole('button',{name:'HubSpot connection'}).click();
  await page.getByRole('button',{name:'Connect account'}).click();
  await page.getByRole('status').filter({hasText:'Connected'}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('.modal-footer button').disabled);
  const output=resolve(root,'artifacts/integration-connection-qa'); await mkdir(output,{recursive:true});
  for(const width of [1100,390]) {
    await page.setViewportSize({width,height:750});
    const box=await page.getByRole('dialog').boundingBox(); assert.ok(box.x>=0&&box.x+box.width<=width);
    await page.screenshot({path:resolve(output,'connected-'+width+'.png')});
  }
  await page.getByRole('button',{name:'Disconnect',exact:true}).click();
  await page.getByRole('button',{name:'Connect account'}).waitFor();
  await page.evaluate(()=>window.qa.fail=true);
  await page.getByRole('button',{name:'Connect account'}).click();
  await page.getByRole('button',{name:'Connect account'}).waitFor();
  await page.evaluate(()=>{window.qa.fail=false;window.qa.unavailable=true;});
  await page.getByRole('button',{name:'Connect account'}).click();
  await page.getByRole('alert').filter({hasText:'unavailable'}).waitFor();
  await page.evaluate(()=>{window.qa.unavailable=false;window.qa.delay=350;});
  const before=await page.evaluate(()=>window.qa.calls);
  await page.getByRole('button',{name:'Connect account'}).dblclick();
  await page.getByRole('button',{name:'Disconnect',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.qa.calls),before+1);
  await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(await page.getByRole('button',{name:'HubSpot connection'}).evaluate(el=>el===document.activeElement),true);
  await page.getByRole('button',{name:'HubSpot connection'}).click();
  await page.getByRole('button',{name:'Disconnect',exact:true}).click();
  await page.getByRole('button',{name:'Connect account'}).click();
  await page.evaluate(()=>window.render('two'));
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.evaluate(()=>window.recovery({status:'pending',connectedAccountId:'mock',expiresAt:1,initiationState:'ready'},'expired'));
  await page.getByRole('button',{name:'HubSpot connection'}).click();
  await page.getByRole('button',{name:'Disconnect',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Connect account'}).count(),0);
  await page.evaluate(()=>window.recovery({status:'disconnected',connectedAccountId:'',initiationState:'unknown',revokePending:true},'unknown'));
  await page.getByRole('button',{name:'HubSpot connection'}).click();
  await page.getByText('Provider connection outcome is unknown.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Retry cleanup'}).count(),0);
  await page.evaluate(()=>window.recovery({status:'disconnected',connectedAccountId:'mock',revokePending:true},'cleanup'));
  await page.getByRole('button',{name:'HubSpot connection'}).click();
  await page.getByRole('button',{name:'Retry cleanup'}).waitFor();
  const callbackResult=await page.evaluate(async()=>{
    const {captureIntegrationCallback:capture,completeStoredIntegrationCallback:complete,key}=window.callbackQA;
    sessionStorage.setItem(key,JSON.stringify({communityId:'mock',userId:'owner',generation:1,expiresAt:Date.now()+60000}));
    history.replaceState({},'', '/integrations/callback?session_uri=synthetic-session');
    capture(location,history,sessionStorage);
    let calls=0;const verify=async()=>{calls++;return true;};
    const signedOut=await complete(sessionStorage,async()=>null,verify);
    const signedIn=await complete(sessionStorage,async()=>({user:{id:'owner'}}),verify);
    const replay=await complete(sessionStorage,async()=>({user:{id:'owner'}}),verify);
    return {signedOut,signedIn,replay,calls,url:location.pathname+location.search};
  });
  assert.deepEqual(callbackResult,{signedOut:'signin',signedIn:'connected',replay:'failed',calls:1,url:'/integrations/callback'});
  assert.deepEqual(errors,[]);
  console.log('PASS: enable, verified connect, disconnect, failure/retry, unavailable, duplicate-click lock, scope switch, Escape/focus and wide/narrow bounds. Mock only.');
} finally {await browser?.close();await server.close();}
