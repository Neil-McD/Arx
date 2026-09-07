// Local UI proof: real member component, synthetic transport, no cloud writes.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import assert from "node:assert/strict";
const root = resolve(import.meta.dirname, "..");
const requireWeb = createRequire(resolve(root, "apps/web/package.json"));
const { createServer } = await import(requireWeb.resolve("vite"));
const mock = `
let update;
const row = { id:'qa', name:'Your onboarding', revision:0, answers:{}, questions:[
 {key:'q1',title:'What would you like help with?',type:'short_text',required:true,description:'',options:[]},
 {key:'q2',title:'Where should we focus?',type:'single_choice',required:true,description:'',options:['Planning','Implementation']}
]};
window.qa = { calls:[], failSubmit:true };
function publish() { update([{id:'qa',name:row.name,answered:Object.keys(row.answers).length,total:2,createdAt:0}]); }
export function subscribeMemberForms(s,c,e,cb) { update=cb; publish(); return () => {}; }
export async function getMemberForm() { return structuredClone(row); }
export async function saveMemberForm(s,c,r,answers,submit) {
 window.qa.calls.push({answers:structuredClone(answers),submit,revision:r.revision});
 await new Promise(resolve => setTimeout(resolve, 900));
 if (submit && window.qa.failSubmit) { window.qa.failSubmit=false; throw new Error('lost response'); }
 row.answers=structuredClone(answers); row.revision++; publish();
 return {revision:row.revision,submitted:submit};
}
`;
const server = await createServer({ root:resolve(root,'apps/web'), configFile:false,
  server:{host:'127.0.0.1',port:5198,strictPort:true},
  plugins:[{name:'member-form-qa', enforce:'pre',
    resolveId(id) { if(id.includes('cloudCommunityFormRequestsGateway')) return '\0form-qa-mock'; if(id==='/qa-entry.tsx') return id; },
    load(id) {
      if(id==='\0form-qa-mock') return mock;
      if(id==='/qa-entry.tsx') return `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {WebCommunityNextStep} from '/src/components/WebCommunityNextStep.tsx';
        import '/src/index.css';
        window.React=React;
        const session={}; const ensureSession=async s=>s;
        createRoot(document.getElementById('root')).render(<WebCommunityNextStep communityId="synthetic" session={session} ensureSession={ensureSession}/>);`;
    },
    configureServer(s) { s.middlewares.use((req,res,next)=>{
      if(req.url!=='/qa') return next();
      res.setHeader('Content-Type','text/html');
      res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/qa-entry.tsx"></script></body></html>');
    }); }
  }],
});
let browser;
try {
  await server.listen();
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:700}});
  page.on('pageerror',e=>console.error(e.message));
  await page.goto('http://127.0.0.1:5198/qa');
  await page.getByRole('button',{name:/Your next step/}).click();
  const input=page.getByRole('textbox',{name:'What would you like help with?'});
  await input.fill('First answer');
  await page.waitForFunction(()=>window.qa.calls.length===1);
  assert.equal(await input.isEnabled(),true);
  assert.equal(await input.evaluate(el=>el===document.activeElement),true);
  await input.fill('Newer answer while saving');
  await page.waitForFunction(()=>window.qa.calls.length===2);
  await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent==='Saved');
  assert.equal(await input.inputValue(),'Newer answer while saving');
  await page.getByRole('button',{name:'Save and close form'}).click();
  await page.getByRole('button',{name:/Your next step/}).click();
  await page.getByRole('button',{name:'Submit',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Please answer'}).waitFor();
  await page.getByRole('radio',{name:'Planning'}).check();
  assert.equal(await page.getByText('Please answer this question.').count(),0);
  await page.getByRole('button',{name:'Submit',exact:true}).click();
  await page.getByRole('button',{name:'Retry',exact:true}).waitFor();
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await page.getByRole('heading',{name:'Submitted',exact:true}).waitFor();
  const submits=await page.evaluate(()=>window.qa.calls.filter(c=>c.submit));
  assert.equal(submits.length,2); assert.deepEqual(submits[0],submits[1]);
  assert.equal(await page.getByRole('button',{name:'Done',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByRole('button',{name:/Your next step/}).click();
  await input.waitFor();
  const output=resolve(root,'artifacts/workflow-editor-qa'); await mkdir(output,{recursive:true});
  for(const theme of ['dark','light']) {
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    await page.waitForFunction(t=>getComputedStyle(document.querySelector('.member-form-dialog input')).color === (t==='light'?'rgb(23, 23, 25)':'rgb(252, 248, 240)'),theme);
    const box=await page.getByRole('dialog').boundingBox();
    assert.ok(box.x>=0 && box.x+box.width<=390 && box.height<=700);
    await page.screenshot({path:resolve(output,'member-form-390-'+theme+'.png')});
  }
  console.log('PASS: actual member runner at 390px; typing during save, latest edit persistence, close/resume, validation clearing, exact submit retry, completion focus, dark/light bounds. Synthetic transport only.');
} finally { await browser?.close(); await server.close(); }
