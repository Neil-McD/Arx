// Actual milestone editor, synthetic transport; no cloud writes.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const webRequire=createRequire(resolve(root,'apps/web/package.json'));
const {createServer}=await import(webRequire.resolve('vite'));
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import {WebCommunityWorkflowMilestoneModal} from '/src/components/WebCommunityWorkflowMilestoneModal.tsx';
import '/src/index.css';import '/src/components/WebCommunityWorkflowsSection.css';window.React=React;
window.qa={saved:null};
createRoot(document.getElementById('root')).render(<WebCommunityWorkflowMilestoneModal isOpen={true}
 milestone={{key:'milestone',name:'Getting started',automations:[]}} milestoneNumber={1} nextMilestoneName='Ready'
 forms={[{key:'intake',name:'Intake'}]} formsStatus='ready' channels={[]} channelsUnavailable={false}
 isSaving={false} canDelete={false} deleteDisabledReason={null} error={null} onClose={()=>{}} onDelete={()=>{}}
 onSave={row=>window.qa.saved=row}/>);`;
const server=await createServer({root:resolve(root,'apps/web'),configFile:false,server:{host:'127.0.0.1',port:5196,strictPort:true},plugins:[{
 name:'requirements-qa',resolveId:id=>id==='/qa-entry.tsx'?id:null,load:id=>id==='/qa-entry.tsx'?entry:null,
 configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url!=='/qa')return next();res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/qa-entry.tsx"></script></body></html>');});}
}]});
let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1100,height:850}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5196/qa');
 await page.getByRole('button',{name:'Add requirement',exact:true}).click();
 assert.equal(await page.getByRole('radio',{name:'Ask agent',exact:true}).count(),0);
 await page.getByRole('button',{name:'Add requirement',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Each requirement'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Save milestone'}).isDisabled(),true);
 await page.getByRole('radio',{name:'Form submitted',exact:true}).check();
 await page.getByRole('combobox',{name:'Form',exact:true}).selectOption('intake');
 await page.getByRole('button',{name:'Add action',exact:true}).click();
 await page.getByRole('radio',{name:'Form submitted',exact:true}).check();
 await page.getByRole('combobox',{name:'Form',exact:true}).selectOption('intake');
 await page.getByRole('textbox',{name:'Agent instructions',exact:true}).fill('Help the member with their answers.');
 await page.getByRole('button',{name:'Save milestone'}).click();
 const saved=await page.evaluate(()=>window.qa.saved);
 assert.equal(saved.automations.filter(a=>a.action.type==='move_member').length,2);
 assert.equal(saved.automations.filter(a=>a.action.type==='prompt_agent').length,1);
 await page.getByRole('button',{name:/Ask community agent/}).click();
 await page.getByRole('textbox',{name:'Milestone name',exact:true}).scrollIntoViewIfNeeded();
 const output=resolve(root,'artifacts/workflow-editor-qa');await mkdir(output,{recursive:true});
 for(const width of [1100,390]){await page.setViewportSize({width,height:850});for(const theme of ['dark','light']){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  const dialog=await page.getByRole('dialog').boundingBox();assert.ok(dialog.x>=0&&dialog.x+dialog.width<=width+1);
  await page.screenshot({path:resolve(output,'requirements-'+width+'-'+theme+'.png'),animations:'disabled'});
 }}
 assert.deepEqual(errors,[]);console.log('PASS: independent actions and all-required conditions, duplicate validation, form action plus requirement, desktop/mobile themes.');
}finally{await browser?.close();await server.close();}
