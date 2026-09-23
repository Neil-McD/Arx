import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const root = resolve(import.meta.dirname, '..');
const webRequire = createRequire(resolve(root, 'apps/web/package.json'));
const { createServer } = await import(webRequire.resolve('vite'));
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';
import {WebCommunityWorkflowMilestoneModal} from '/src/components/WebCommunityWorkflowMilestoneModal.tsx';
import '/src/index.css';import '/src/components/WebCommunityWorkflowsSection.css';
window.qa={saved:null};createRoot(document.getElementById('root')).render(<WebCommunityWorkflowMilestoneModal isOpen={true}
 milestone={{key:'milestone',name:'Getting started',goal:'',automations:[]}} milestoneNumber={1}
 forms={[{key:'intake',name:'Intake'}]} formsStatus='ready' channels={[]} channelsUnavailable={false}
 isSaving={false} canDelete={false} deleteDisabledReason={null} error={null} onClose={()=>{}} onDelete={()=>{}}
 onSave={row=>window.qa.saved=row}/>);`;
const server = await createServer({ root: resolve(root, 'apps/web'), configFile: false,
 server: { host: '127.0.0.1', port: 5196, strictPort: true }, plugins: [{
 name: 'workflow-editor-qa', resolveId: id => id === '/qa-entry.tsx' ? id : null,
 load: id => id === '/qa-entry.tsx' ? entry : null,
 configureServer(s) { s.middlewares.use((req, res, next) => {
   if (req.url !== '/qa') return next(); res.setHeader('Content-Type', 'text/html');
   res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/qa-entry.tsx"></script></body></html>');
 }); }
 }] });
let browser;
try {
 await server.listen(); browser = await chromium.launch({ headless: true });
 for (const width of [1100, 390]) {
   const page = await browser.newPage({ viewport: { width, height: 850 } });
   const errors = []; page.on('pageerror', error => errors.push(error.message));
   await page.goto('http://127.0.0.1:5196/qa');
   await page.getByRole('tab', { name: 'Automations' }).click();
   assert.equal(await page.getByRole('button', { name: 'Add condition' }).count(), 0);
   assert.equal(await page.getByText('Automatic advancement (existing system)').count(), 0);
   await page.getByRole('button', { name: 'Add automation' }).click();
   await page.getByRole('combobox', { name: 'When' }).selectOption('form_submitted');
   await page.getByRole('combobox', { name: 'Form' }).selectOption('intake');
   const action = page.getByRole('combobox', { name: 'Then' });
   assert.equal(await action.locator('option[value="evaluate_goal"]').count(), 0);
   assert.equal(await action.locator('option[value="move_member"]').count(), 0);
   await action.selectOption('prompt_agent');
   await page.getByRole('textbox', { name: 'Agent instructions' }).fill('Help the member with their submitted answers.');
   await page.getByRole('button', { name: 'Add automation' }).last().click();
   await page.getByRole('button', { name: 'Save milestone' }).click();
   const saved = await page.evaluate(() => window.qa.saved);
   assert.deepEqual(saved.automations.map(a => a.action.type), ['prompt_agent']);
   assert.deepEqual(errors, []);
   await page.close();
 }
 console.log('Workflow editor deletion browser QA passed at desktop and narrow widths.');
} finally { await browser?.close(); await server.close(); }
