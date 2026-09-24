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
const approval=new URLSearchParams(location.search).get('approval');
const milestone={key:'milestone',name:'Getting started',goal:'',automations:[],
 ...(approval==='missing'?{}:{requireHumanApproval:approval==='true'})};
window.qa={saved:null};createRoot(document.getElementById('root')).render(<WebCommunityWorkflowMilestoneModal isOpen={true}
 milestone={milestone} milestoneNumber={1}
 forms={[{key:'intake',name:'Intake'}]} formsStatus='ready' channels={[]} channelsUnavailable={false}
 isSaving={false} canDelete={false} deleteDisabledReason={null} error={null} onClose={()=>{}} onDelete={()=>{}}
 onSave={row=>window.qa.saved=row}/>);`;
const server = await createServer({ root: resolve(root, 'apps/web'), configFile: false,
 server: { host: '127.0.0.1', port: 5196, strictPort: true }, plugins: [{
 name: 'workflow-editor-qa', resolveId: id => id === '/qa-entry.tsx' ? id : null,
 load: id => id === '/qa-entry.tsx' ? entry : null,
 configureServer(s) { s.middlewares.use((req, res, next) => {
   if (new URL(req.url, 'http://localhost').pathname !== '/qa') return next(); res.setHeader('Content-Type', 'text/html');
   res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/qa-entry.tsx"></script></body></html>');
 }); }
 }] });
let browser;
try {
 await server.listen(); browser = await chromium.launch({ headless: true });
 for (const [width, theme] of [[1100, 'dark'], [820, 'light'], [390, 'dark'], [390, 'light']]) {
   const page = await browser.newPage({ viewport: { width, height: 850 } });
   const errors = []; page.on('pageerror', error => errors.push(error.message));
   await page.goto('http://127.0.0.1:5196/qa');
   await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
   await page.waitForTimeout(250);
   const fullyAuto = page.getByRole('switch', { name: 'Fully Auto' });
   assert.equal(await fullyAuto.getAttribute('aria-checked'), 'true');
   assert.equal(await page.getByText('No actions configured. This stage will not advance automatically until you add an action.').count(), 1);
   const switchLayout = await fullyAuto.evaluate(button => {
     const label = button.querySelector('span').getBoundingClientRect();
     const track = button.querySelector('.workflow-fully-auto-track').getBoundingClientRect();
     return { inline: track.left > label.right, fits: button.scrollWidth <= button.clientWidth + 1 };
   });
   assert.deepEqual(switchLayout, { inline: true, fits: true });
   const switchColors = await fullyAuto.evaluate(button => ({
     label: getComputedStyle(button).color,
     trackBorder: getComputedStyle(button.querySelector('.workflow-fully-auto-track')).borderColor,
     trackBackground: getComputedStyle(button.querySelector('.workflow-fully-auto-track')).backgroundColor,
   }));
   assert.equal(switchColors.label, theme === 'light' ? 'rgb(23, 23, 25)' : 'rgb(252, 248, 240)');
   assert.equal(switchColors.trackBorder, theme === 'light' ? 'rgb(47, 85, 255)' : 'rgb(241, 237, 229)');
   assert.notEqual(switchColors.trackBackground, 'rgba(0, 0, 0, 0)');
   if (process.env.WORKFLOW_QA_CAPTURE_DIR) await page.screenshot({ path: `${process.env.WORKFLOW_QA_CAPTURE_DIR}/fully-auto-${width}-${theme}.png` });
   await page.getByRole('tab', { name: 'Automations' }).click();
   assert.equal(await page.getByRole('button', { name: 'Add condition' }).count(), 0);
   assert.equal(await page.getByText('Automatic advancement (existing system)').count(), 0);
   const addNew = page.getByRole('button', { name: 'Add new automation' });
   const addNewLayout = await addNew.evaluate((button) => {
     const label = Array.from(button.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
     const range = document.createRange();
     range.selectNodeContents(label);
     const textRects = Array.from(range.getClientRects());
     const icon = button.querySelector('svg').getBoundingClientRect();
     return {
       textLines: textRects.length,
       aligned: Math.abs(icon.top + icon.height / 2 - textRects[0].top - textRects[0].height / 2) < 5,
       fits: button.scrollWidth <= button.clientWidth + 1,
     };
   });
   assert.deepEqual(addNewLayout, { textLines: 1, aligned: true, fits: true });
   await addNew.click();
   await page.getByRole('combobox', { name: 'When' }).selectOption('form_submitted');
   await page.getByRole('combobox', { name: 'Form' }).selectOption('intake');
   const action = page.getByRole('combobox', { name: 'Then' });
   assert.equal(await action.locator('option[value="evaluate_goal"]').count(), 0);
   assert.equal(await action.locator('option[value="move_member"]').count(), 0);
   await action.selectOption('prompt_agent');
   await page.getByRole('textbox', { name: 'Agent instructions' }).fill('Help the member with their submitted answers.');
   await page.getByRole('button', { name: 'Add automation' }).last().click();
   await page.getByRole('tab', { name: 'Overview' }).click();
   await page.locator('textarea').nth(1).fill('The member can complete the next step.');
   assert.equal(await page.getByText('Automatically advances after every action is verified complete and any written goal is met. Fully Auto does not start follow-up work.').count(), 1);
   await page.getByRole('button', { name: 'Save milestone' }).click();
   const saved = await page.evaluate(() => window.qa.saved);
   assert.deepEqual(saved.automations.map(a => a.action.type), ['prompt_agent']);
   assert.equal(saved.requireHumanApproval, false);
   assert.deepEqual(errors, []);
   await page.close();
 }
 for (const storedApproval of ['true', 'false', 'missing']) {
   const page = await browser.newPage({ viewport: { width: 390, height: 850 } });
   await page.goto(`http://127.0.0.1:5196/qa?approval=${storedApproval}`);
   const fullyAuto = page.getByRole('switch', { name: 'Fully Auto' });
   assert.equal(await fullyAuto.getAttribute('aria-checked'), storedApproval === 'true' ? 'false' : 'true');
   assert.equal(await page.getByRole('button', { name: 'Save milestone' }).isEnabled(), false);
   await page.locator('textarea').nth(1).fill('A synthetic goal');
   await page.getByRole('button', { name: 'Save milestone' }).click();
   const preserved = await page.evaluate(() => window.qa.saved);
   assert.equal(preserved.requireHumanApproval, storedApproval === 'true');
   assert.deepEqual(preserved.automations, []);
   await page.goto(`http://127.0.0.1:5196/qa?approval=${preserved.requireHumanApproval}`);
   assert.equal(await fullyAuto.getAttribute('aria-checked'), storedApproval === 'true' ? 'false' : 'true');
   await fullyAuto.click();
   assert.equal(await fullyAuto.getAttribute('aria-checked'), storedApproval === 'true' ? 'true' : 'false');
   assert.equal(await page.getByText('Changing this setting will not recheck or move members whose actions were already complete.').count(), 1);
   assert.equal(await page.getByText('No actions configured. An owner or admin can approve this stage manually.').count(), storedApproval === 'true' ? 0 : 1);
   await page.getByRole('button', { name: 'Save milestone' }).click();
   const flipped = await page.evaluate(() => window.qa.saved);
   assert.equal(flipped.requireHumanApproval, storedApproval !== 'true');
   assert.deepEqual(flipped.automations, []);
   await page.close();
 }
 console.log('Workflow editor QA passed across themes, widths, and saved approval states.');
} finally { await browser?.close(); await server.close(); }
