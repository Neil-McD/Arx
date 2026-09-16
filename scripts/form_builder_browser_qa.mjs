// Actual editor with synthetic transport. No cloud writes or user-browser control.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
const requireWeb = createRequire(resolve(root, 'apps/web/package.json'));
const { createServer } = await import(requireWeb.resolve('vite'));
const entry = `import React,{useRef,useState} from 'react'; import {createRoot} from 'react-dom/client';
import {CommunityFormEditor,WebCommunityForms} from '/src/components/WebCommunityForms.tsx'; import '/src/index.css'; import '/src/components/WebCommunityWorkflowsSection.css'; window.React=React;
const question=(key,title)=>({key,title,description:'',type:'short_text',required:true,options:[]});
window.qa={row:{key:'qa',name:'Intake',questions:[question('q1','First question'),question('q2','')],revision:1,publishedRevision:null},calls:[],versions:{},delay:500};
const qa=window.qa;
const gateway={scopeKey:'qa',load:async()=>[structuredClone(qa.row)],save:async form=>{
 qa.calls.push({op:'save',form:structuredClone(form)}); await new Promise(r=>setTimeout(r,qa.delay));
 if(qa.failSave){qa.failSave=false;throw Error('offline');}
 if(qa.conflict)throw Error('form_revision_conflict');
 qa.row={...structuredClone(form),revision:qa.row.revision+1,publishedRevision:qa.row.publishedRevision};return structuredClone(qa.row);
},publish:async form=>{
 qa.calls.push({op:'publish',revision:form.revision});
 qa.versions[form.revision]=structuredClone(qa.row);qa.row.publishedRevision=form.revision;
 if(qa.failPublish){qa.failPublish=false;throw Error('response lost');}return structuredClone(qa.row);
}};
function App(){const guard=useRef(null);const [open,setOpen]=useState(true);
if(new URLSearchParams(location.search).has('layout'))return <div className="workflow-page workflow-sections" style={{position:'fixed',inset:16,left:innerWidth>760?340:16}}><div className="workflow-section-content"><WebCommunityForms gateway={gateway}/></div></div>;
return <>
<button onClick={async()=>{if(await guard.current?.())setOpen(false)}}>Leave Forms</button>
{open?<CommunityFormEditor initial={structuredClone(qa.row)} gateway={gateway} leaveGuard={guard} onBack={()=>setOpen(false)}/>:<button onClick={()=>setOpen(true)}>Reopen form</button>}</>}
createRoot(document.getElementById('root')).render(<App/>);`;
const server = await createServer({root:resolve(root,'apps/web'),configFile:false,server:{host:'127.0.0.1',port:5197,strictPort:true},
 plugins:[{name:'form-builder-qa',resolveId:id=>id==='/qa-entry.tsx'?id:null,load:id=>id==='/qa-entry.tsx'?entry:null,
 configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0]!=='/qa')return next();res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/qa-entry.tsx"></script></body></html>');});}}]});
let browser;
try {
 await server.listen();browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1100,height:800}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5197/qa');
 const title=page.getByRole('textbox',{name:'Question',exact:true});
 await page.getByRole('button',{name:'Publish',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Give every question'}).waitFor();
 assert.equal(await title.inputValue(),'');assert.equal(await title.evaluate(el=>el===document.activeElement),true);
 await title.fill('Second question');
 await page.waitForFunction(()=>window.qa.row.questions[1].title==='Second question');
 await page.getByLabel('Answer type').selectOption('single_choice');
 await page.getByLabel('Option 1',{exact:true}).fill('Yes');await page.getByLabel('Option 2',{exact:true}).fill('Yes');
 await page.getByRole('button',{name:/First question/}).click();
 await page.getByRole('button',{name:'Publish',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'distinct'}).waitFor();
 assert.equal(await page.getByLabel('Option 1',{exact:true}).evaluate(el=>el===document.activeElement),true);
 await page.getByLabel('Option 2',{exact:true}).fill('No');
 await page.waitForFunction(()=>window.qa.row.questions[1].options[1]==='No');
 await page.evaluate(()=>window.qa.failPublish=true);
 await page.getByRole('button',{name:'Publish',exact:true}).click();
 await page.getByRole('button',{name:'Retry publish'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Retry save'}).count(),0);
 await page.getByRole('button',{name:'Retry publish'}).click();
 await page.getByRole('status').filter({hasText:/^Published$/}).waitFor();
 const publishes=await page.evaluate(()=>window.qa.calls.filter(c=>c.op==='publish'));
 assert.equal(publishes.length,2);assert.deepEqual(publishes[0],publishes[1]);
 assert.equal(await page.evaluate(()=>Object.keys(window.qa.versions).length),1);
 // Changes made while a save is running must survive leave/reopen.
 const name=page.getByRole('textbox',{name:'Form name'});
 await name.fill('Older name');await page.waitForFunction(()=>window.qa.calls.some(c=>c.form?.name==='Older name'));
 await name.fill('Newest name');await page.getByRole('button',{name:'Leave Forms',exact:true}).click();
 await page.getByRole('button',{name:'Reopen form'}).click();assert.equal(await name.inputValue(),'Newest name');
 // A save failure never becomes a publish retry or silently permits navigation.
 await page.evaluate(()=>window.qa.failSave=true);await name.fill('Retained after failure');
 await page.getByRole('button',{name:'Retry save'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Retry publish'}).count(),0);
 await page.getByRole('button',{name:'Retry save'}).click();
 await page.waitForFunction(()=>window.qa.row.name==='Retained after failure');
 await page.evaluate(()=>window.qa.conflict=true);await name.fill('Unsaved conflicting edit');
 await page.getByRole('alert').filter({hasText:'another session'}).waitFor();
 const beforeLeave=await page.evaluate(()=>window.qa.calls.length);
 await page.getByRole('button',{name:'Leave Forms'}).click();
 await page.waitForFunction(n=>window.qa.calls.length>n && [...document.querySelectorAll('button')].some(b=>b.textContent==='Retry save'&&!b.disabled),beforeLeave);
 assert.equal(await name.inputValue(),'Unsaved conflicting edit');
 await page.evaluate(()=>window.qa.conflict=false);
 await page.getByRole('button',{name:'Discard edits and reload'}).click();
 assert.equal(await name.inputValue(),'Retained after failure');
 await page.getByRole('button',{name:'Publish',exact:true}).click();
 await page.getByRole('status').filter({hasText:/^Published$/}).waitFor();
 const versions=await page.evaluate(()=>Object.values(window.qa.versions));assert.equal(versions.length,2);
 assert.equal(versions[0].name,'Intake');assert.equal(versions[1].name,'Retained after failure');
 await page.getByRole('button',{name:'Preview',exact:true}).click();
 await page.getByRole('textbox',{name:'Your answer'}).fill('Preview only');
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('radio',{name:'Yes',exact:true}).check();await page.getByRole('button',{name:'Finish preview'}).click();
 await page.getByText('No answers were submitted.').waitFor();
 const output=resolve(root,'artifacts/workflow-editor-qa');await mkdir(output,{recursive:true});
 for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForFunction(t=>getComputedStyle(document.querySelector('.community-form-name')).color===(t==='light'?'rgb(23, 23, 25)':'rgb(252, 248, 240)'),theme);await page.screenshot({path:resolve(output,'form-builder-'+theme+'.png')});}
 assert.deepEqual(errors,[]);
 // Real list/editor inside the production section sizing contract, not a
 // standalone component whose body happens to provide enough space.
 for(const width of [2560,1440,1000,390]){
  await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:5197/qa?layout');
  await page.getByRole('button',{name:/Intake 2 questions/}).waitFor();
  const listFit=await page.locator('.community-form-list').evaluate(el=>{const p=el.parentElement,s=getComputedStyle(p);return {width:el.getBoundingClientRect().width,available:p.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),overflow:p.scrollWidth>p.clientWidth};});
  assert.ok(Math.abs(listFit.width-listFit.available)<2,JSON.stringify({width,listFit}));assert.equal(listFit.overflow,false);
  await page.screenshot({path:resolve(output,'forms-list-'+width+'.png')});
  await page.getByRole('button',{name:/Intake 2 questions/}).click();
  const fit=await page.locator('.community-form-workspace').evaluate(el=>{const p=document.querySelector('.workflow-section-content'),r=el.getBoundingClientRect();return {width:r.width,panel:p.getBoundingClientRect().width,overflow:p.scrollWidth>p.clientWidth,questionsDisplay:getComputedStyle(document.querySelector('.community-form-questions')).display};});
  assert.equal(fit.overflow,false,JSON.stringify({width,fit}));
  assert.equal(fit.questionsDisplay,fit.panel<=760?'flex':'block');
  if(fit.panel<=760)assert.ok(await page.locator('.community-form-questions').evaluate(el=>el.getBoundingClientRect().height<90),'Compact navigation must not stretch into a tall card');
  await page.screenshot({path:resolve(output,'forms-editor-'+width+'.png')});
 }
 console.log('PASS: actual form editor validation target/focus, lost publish response retry, slow save/newer edits, leave/reopen, save retry, conflict preservation/reload, immutable republish, preview isolation, dark/light screenshots. Synthetic transport only.');
} finally {await browser?.close();await server.close();}
