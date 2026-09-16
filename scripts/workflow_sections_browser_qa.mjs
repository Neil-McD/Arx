// Real workflow/forms UI with synthetic transport; no cloud mutations.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const webRequire=createRequire(resolve(root,'apps/web/package.json'));
const {createServer}=await import(webRequire.resolve('vite'));
const entry=`import React from 'react'; import {createRoot} from 'react-dom/client';
import {WebCommunityWorkflowsSection} from '/src/components/WebCommunityWorkflowsSection.tsx';
import '/src/index.css'; window.React=React;
window.qa={fail:false,saves:0};
let form={key:'one',name:'Onboarding',revision:1,publishedRevision:1,questions:[{key:'q',title:'Your goal?',type:'short_text',required:true,description:'',options:[]}]};
const forms={scopeKey:'test',load:async()=>[structuredClone(form)],save:async row=>{
window.qa.saves++; await new Promise(r=>setTimeout(r,300)); if(window.qa.fail)throw Error('offline');
form={...row,revision:row.revision+1};return structuredClone(form);},publish:async row=>row};
createRoot(document.getElementById('root')).render(<WebCommunityWorkflowsSection forms={forms} channels={[]} members={[]} board={null} hasLoaded={true} totalCount={0} onClearActionError={()=>{}} />);`;
const server=await createServer({root:resolve(root,'apps/web'),configFile:false,server:{host:'127.0.0.1',port:5199,strictPort:true},
plugins:[{name:'workflow-sections-qa',resolveId:id=>id==='/qa-entry.tsx'?id:null,load:id=>id==='/qa-entry.tsx'?entry:null,
configureServer(s){s.middlewares.use((req,res,next)=>{if(!req.url.startsWith('/qa?')&&req.url!=='/qa')return next();res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" style="display:flex;height:100dvh"></div><script type="module" src="/qa-entry.tsx"></script></body></html>');});}}]});
let browser;
try{
await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1100,height:750}});
page.on('pageerror',e=>console.error(e.message));
await page.goto('http://127.0.0.1:5199/qa');
await page.getByRole('tab',{name:'Forms',exact:true}).click();
assert.ok(page.url().includes('section=forms'));
await page.reload();await page.getByRole('button',{name:/Onboarding/}).click();
await page.evaluate(()=>window.qa.fail=true);
await page.getByRole('textbox',{name:'Form name',exact:true}).fill('Changed form');
await page.getByRole('tab',{name:'Integrations',exact:true}).click();
await page.getByRole('alert').waitFor();
assert.equal(await page.getByRole('tab',{name:'Forms',exact:true}).getAttribute('aria-selected'),'true');
assert.equal(await page.getByRole('textbox',{name:'Form name',exact:true}).inputValue(),'Changed form');
await page.evaluate(()=>window.qa.fail=false);
await page.getByRole('tab',{name:'Integrations',exact:true}).click();
await page.getByRole('heading',{name:'Integrations are not available yet'}).waitFor();
await page.goBack();await page.getByRole('button',{name:/Changed form/}).waitFor();
await page.getByRole('tab',{name:'Workflows',exact:true}).click();
const output=resolve(root,'artifacts/workflow-editor-qa');await mkdir(output,{recursive:true});
for(const width of [1100,390,260]){
await page.setViewportSize({width,height:750});
for(const theme of ['dark','light']){
await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
await page.getByRole('tab',{name:'Forms',exact:true}).click();
const tabs=await page.getByRole('tablist').boundingBox();assert.ok(tabs.x>=0&&tabs.x+tabs.width<=width);
assert.ok(await page.getByRole('tab').evaluateAll(items=>items.every(el=>el.scrollWidth<=el.clientWidth)), 'tab labels must fit narrow content panes');
await page.screenshot({path:resolve(output,'workflow-tabs-'+width+'-'+theme+'.png'),animations:'disabled'});
await page.getByRole('tab',{name:'Workflows',exact:true}).click();
}}
console.log('PASS: three tabs, URL refresh/back, save failure retains edits, successful flush, responsive bounds. Synthetic transport.');
}finally{await browser?.close();await server.close();}
