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
import {WebCommunityFormResponses} from '/src/components/WebCommunityFormResponses.tsx';
import {WebCommunityWorkflowMemberDossierModal} from '/src/components/WebCommunityWorkflowMemberDossierModal.tsx';
import {workflowActivityExplanation} from '/@fs/${root}/shared/workflowActivityExplanation.ts';
import '/src/index.css';import '/src/components/WebCommunityWorkflowsSection.css';window.React=React;
window.qa={saved:null};
const root=createRoot(document.getElementById('root'));
window.qa.responses=page=>root.render(<WebCommunityFormResponses gateway={{responses:async()=>page}} membershipId='qa'/>);
window.qa.activity=()=>root.render(<WebCommunityWorkflowMemberDossierModal isOpen={true} isLoading={false} error={null}
 dossier={{membership_id:'qa',display_name:'Example member',avatar_url:null,workflow:{id:'workflow',revision:1,current_milestone_key:'new',current_milestone_name:'New',current_milestone_entered_at:new Date().toISOString(),completed_at:null,goal:'Explain your goals.',requirements:[],action_progress:{actions:[{automation_key:'channel',action_key:'channel',label:'Create private channel',action_type:'create_service_channel',status:'complete',evidence:{run_id:'run',source_id:'channel',completed_at:Date.now()}},{automation_key:'form',action_key:'form',label:'Request intake form',action_type:'request_form',status:'pending',evidence:null},{automation_key:'agent',action_key:'agent',label:'Ask agent: Introduce yourself and help the member identify one concrete next step',action_type:'prompt_agent',status:'unavailable',evidence:null}],all_actions_complete:false,scan_truncated:false},override_state:{activation_sequence:1,transition_seq:0,next_milestone_name:'Ready'}},service_channel:{status:'unassigned',revision:0,channel_id:null,name:null},approved_community_context:[],milestone_history:[],recent_workflow_activity:
 ['channel_access_missing','workflow_member_context_changed','unknown'].map((code,i)=>({id:String(i),action_type:'prompt_agent',status:'failed',...workflowActivityExplanation('failed',code),milestone_name:'New',occurred_at:new Date().toISOString()})).concat([{id:'running',action_type:'prompt_agent',status:'running',milestone_name:'New',occurred_at:new Date().toISOString()}])}}
 channels={[]} channelsUnavailable={false} isServiceChannelSaving={false} serviceChannelError={null} onClose={()=>{}} onRetry={()=>{}} onSetServiceChannel={async()=>true} onForceMove={async()=>{}} onOpenServiceChannel={()=>{}}/>);
root.render(<WebCommunityWorkflowMilestoneModal isOpen={true}
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
 await page.getByRole('tab',{name:'Automations',exact:true}).click();
 await page.getByRole('button',{name:'Add condition',exact:true}).click();
 assert.equal(await page.getByRole('combobox',{name:'Then',exact:true}).count(),0);
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('button',{name:'Add condition',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Each condition'}).waitFor();
 await page.getByRole('button',{name:'Done',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Save milestone'}).isDisabled(),true);
 await page.getByRole('button',{name:/Posts or replies/}).last().click();
 await page.getByRole('combobox',{name:'When',exact:true}).selectOption('form_submitted');
 await page.getByRole('combobox',{name:'Form',exact:true}).selectOption('intake');
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('button',{name:'Add automation',exact:true}).click();
 assert.equal(await page.getByRole('combobox',{name:'When',exact:true}).inputValue(),'');
 assert.equal(await page.getByRole('combobox',{name:'Then',exact:true}).count(),0);
 await page.getByRole('combobox',{name:'When',exact:true}).selectOption('form_submitted');
 assert.equal(await page.getByRole('combobox',{name:'Then',exact:true}).count(),0);
 await page.getByRole('combobox',{name:'Form',exact:true}).selectOption('intake');
 assert.equal(await page.getByRole('combobox',{name:'Then',exact:true}).inputValue(),'');
 await page.getByRole('combobox',{name:'Then',exact:true}).selectOption('prompt_agent');
 await page.getByRole('textbox',{name:'Agent instructions',exact:true}).fill('Help the member with their answers.');
 await page.getByRole('button',{name:'Add automation',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.qa.saved),null);
 await page.getByRole('button',{name:'Save milestone'}).click();
 const saved=await page.evaluate(()=>window.qa.saved);
 assert.equal(saved.automations.filter(a=>a.action.type==='move_member').length,2);
 assert.equal(saved.automations.filter(a=>a.action.type==='prompt_agent').length,1);
 await page.evaluate(()=>window.qa.saved=null);
 await page.getByRole('button',{name:/Form submitted.*Ask community agent/}).click();
 await page.getByRole('combobox',{name:'Then',exact:true}).selectOption('evaluate_goal');
 // Changing the trigger must not retain an incompatible form-only action.
 await page.getByRole('combobox',{name:'When',exact:true}).selectOption('milestone_elapsed');
 assert.equal(await page.getByRole('combobox',{name:'Then',exact:true}).inputValue(),'prompt_agent');
 await page.getByRole('textbox',{name:'Agent instructions',exact:true}).fill('Check in with this member.');
 await page.getByRole('spinbutton',{name:'After',exact:true}).press('Enter');
 assert.equal(await page.evaluate(()=>window.qa.saved),null);
 await page.getByRole('combobox',{name:'When',exact:true}).selectOption('form_submitted');
 await page.getByRole('combobox',{name:'Form',exact:true}).selectOption('intake');
 await page.getByRole('combobox',{name:'Then',exact:true}).selectOption('evaluate_goal');
 await page.getByText('The same form is used for goal evaluation and movement.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('button',{name:'Add automation',exact:true}).click();
 await page.getByRole('combobox',{name:'When',exact:true}).selectOption('member_joined');
 assert.deepEqual(await page.getByRole('combobox',{name:'Then',exact:true}).locator('option:not([disabled])').evaluateAll(options=>options.map(o=>o.value)),['create_service_channel','request_form']);
 await page.getByRole('button',{name:'Cancel addition',exact:true}).click();
 await page.getByRole('tab',{name:'Overview',exact:true}).click();
 await page.getByRole('textbox',{name:/^Goal/}).fill('Member has explained their situation.');
 await page.getByRole('tab',{name:'Automations',exact:true}).click();
 await page.getByRole('button',{name:/Form submitted.*Evaluate goal/}).click();
 const output=resolve(root,'artifacts/workflow-editor-qa');await mkdir(output,{recursive:true});
 for(const width of [1100,390]){await page.setViewportSize({width,height:850});for(const theme of ['dark','light']){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  const dialog=await page.getByRole('dialog').boundingBox();assert.ok(dialog.x>=0&&dialog.x+dialog.width<=width+1);
  await page.screenshot({path:resolve(output,'requirements-'+width+'-'+theme+'.png'),animations:'disabled'});
 }}
 for(const state of [
  {rows:[],truncated:false,unavailable_records:0,expected:'No submitted forms in this membership activation.'},
  {rows:[],truncated:true,unavailable_records:0,expected:'Some responses are omitted from this view.'},
  {rows:[],truncated:false,unavailable_records:1,expected:'Some responses could not be verified and are unavailable.'},
  {rows:[{id:'r',answers:{q:'A useful answer'},submittedAt:Date.now(),form:{name:'Intake',questions:[{key:'q',title:'What helps?',type:'short_text'}]}}],truncated:false,unavailable_records:0,expected:'Intake'},
 ]) {
  await page.evaluate(s=>window.qa.responses(s),state);
  await page.getByText(state.expected,{exact:state.expected!=='Intake'}).waitFor();
  if(state.truncated||state.unavailable_records) assert.equal(await page.getByText('No submitted forms in this membership activation.',{exact:true}).count(),0);
  for(const theme of ['dark','light']) {
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   await page.screenshot({path:resolve(output,`responses-${state.rows.length}-${state.truncated}-${state.unavailable_records}-${theme}.png`)});
  }
 }
 await page.evaluate(()=>window.qa.activity());
 await page.getByRole('tab',{name:'Progress',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Force move…',exact:true}).isVisible(),false);
 await page.getByText('No automatic movement conditions configured.',{exact:true}).waitFor();
 await page.getByText('Channel ready',{exact:true}).waitFor();
 await page.getByText('Awaiting submission',{exact:true}).waitFor();
 await page.getByText('Completion unavailable',{exact:true}).waitFor();
 await page.getByRole('tab',{name:'Progress',exact:true}).focus();
 await page.keyboard.press('ArrowRight');
 await page.getByText('Form responses unavailable.',{exact:true}).waitFor();
 await page.keyboard.press('ArrowRight');
 await page.getByRole('heading',{name:'Service channel',exact:true}).waitFor();
 await page.getByRole('button',{name:'Force move…',exact:true}).click();
 await page.getByRole('alertdialog').waitFor();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Force move…',exact:true}).evaluate(e=>e===document.activeElement),true);
 await page.getByRole('tab',{name:'Progress',exact:true}).click();
 await page.getByText('Community agent · No longer applicable',{exact:true}).waitFor();
 await page.getByText('Community agent · Running',{exact:true}).waitFor();
 await page.getByText('Channel access was unavailable during execution.',{exact:false}).waitFor();
 assert.equal(await page.getByRole('button',{name:/retry|replay/i}).count(),0);
 for(const width of [1100,390]){await page.setViewportSize({width,height:850});for(const theme of ['dark','light']){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await page.getByText('Community agent · No longer applicable',{exact:true}).scrollIntoViewIfNeeded();
  const tabs=await page.getByRole('tablist',{name:'Member workflow'}).boundingBox();
  assert.ok(tabs && tabs.height>=30 && tabs.y>=0 && tabs.y+tabs.height<850);
  const dialog=await page.getByRole('dialog').boundingBox();assert.ok(dialog.x>=0&&dialog.x+dialog.width<=width+1);
  await page.screenshot({path:resolve(output,'activity-'+width+'-'+theme+'.png'),animations:'disabled'});
  await page.getByRole('heading',{name:'Actions',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:resolve(output,'action-progress-'+width+'-'+theme+'.png'),animations:'disabled'});
  for(const tab of ['Responses','Details']) {
   await page.getByRole('tab',{name:tab,exact:true}).click();
   await page.screenshot({path:resolve(output,'member-'+tab.toLowerCase()+'-'+width+'-'+theme+'.png'),animations:'disabled'});
  }
  await page.getByRole('tab',{name:'Progress',exact:true}).click();
 }}
 assert.deepEqual(errors,[]);console.log('PASS: requirements, assessment overlap, form history, activity explanations without retries, desktop/mobile themes.');
}finally{await browser?.close();await server.close();}
