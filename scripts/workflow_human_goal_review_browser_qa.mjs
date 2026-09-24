import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const webRequire = createRequire(resolve(root, 'apps/web/package.json'));
const { createServer } = await import(webRequire.resolve('vite'));
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';
import {WebCommunityWorkflowMemberDossierModal} from '/src/components/WebCommunityWorkflowMemberDossierModal.tsx';
import '/src/index.css';import '/src/components/WebCommunityWorkflowsSection.css';
const dossier={community_id:'community',user_id:'member',membership_id:'membership',display_name:'Grace Member',
 avatar_url:null,avatar_focus_x:.5,avatar_focus_y:.5,avatar_zoom:1,joined_at:new Date().toISOString(),
 service_channel:{status:'unassigned',revision:0,channel_id:null,name:null},submitted_form_evidence:{submissions:[],truncated:false,unavailable_records:0},
 approved_community_context:[],recent_workflow_activity:[],milestone_history:[],markdown:'',
 workflow:{id:'workflow',revision:1,current_milestone_key:'start',current_milestone_name:'Getting started',
 current_milestone_entered_at:new Date().toISOString(),completed_at:null,goal:'Member is ready',require_human_approval:true,
 override_state:{activation_sequence:1,transition_seq:0,next_milestone_name:'Review'},
 action_progress:{actions:[{automation_key:'a',action_key:'b',label:'Ask agent',action_type:'prompt_agent',status:'complete',
 evidence:{run_id:'run',source_id:'reply',completed_at:Date.now()}}],all_actions_complete:true,scan_truncated:false},
 goal_review:location.search.includes('retry')
 ? {status:'failed',reason:'Community AI funding is unavailable. Restore the founder plan before retrying.',retryable:true,receipt_ref:'review-1'}
 : {status:'not_yet',reason:'The required result is not established.'}}};
createRoot(document.getElementById('root')).render(<WebCommunityWorkflowMemberDossierModal isOpen={true}
 dossier={dossier} isLoading={false} error={null} onClose={()=>{}} onRetry={()=>{}}
 channels={[]} channelsUnavailable={false} isServiceChannelSaving={false} serviceChannelError={null}
 onSetServiceChannel={async()=>true} onForceMove={async()=>{}} onApproveMilestone={async()=>{}}
 onRetryGoalReview={async()=>{}}
 onOpenServiceChannel={()=>{}}/>);`;
const server = await createServer({ root: resolve(root, 'apps/web'), configFile: false,
  server: { host: '127.0.0.1', port: 0 }, plugins: [{
    name: 'workflow-human-review-qa', resolveId: id => id === '/qa-entry.tsx' ? id : null,
    load: id => id === '/qa-entry.tsx' ? entry : null,
    configureServer(s) { s.middlewares.use((req, res, next) => {
      if (new URL(req.url ?? '/', 'http://127.0.0.1').pathname !== '/qa') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/qa-entry.tsx"></script></body></html>');
    }); },
  }] });
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  browser = await chromium.launch({ headless: true });
  for (const width of [1100, 390]) {
    for (const retry of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${address.port}/qa${retry ? '?retry' : ''}`);
      const dialog = page.getByRole('dialog');
      if (retry) {
        await dialog.getByText('Agent assessment unavailable. You can still review and decide.').waitFor();
        assert.equal(await dialog.getByText('Community AI funding is unavailable. Restore the founder plan before retrying.').count(), 1);
        await dialog.getByRole('button', { name: 'Retry goal review' }).click();
        assert.equal(await dialog.getByRole('button', { name: 'Retry goal review' }).count(), 0);
      } else {
        await dialog.getByText('Agent assessment: goal not yet met. Review the evidence before deciding.').waitFor();
        assert.equal(await dialog.getByText('The required result is not established.').count(), 1);
      }
      assert.equal(await dialog.getByRole('button', { name: 'Approve and advance' }).isEnabled(), true);
      const bounds = await dialog.boundingBox();
      assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'dossier fits the viewport');
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
  console.log('Human goal review and retry dossier browser QA passed at desktop and narrow widths.');
} finally { await browser?.close(); await server.close(); }
