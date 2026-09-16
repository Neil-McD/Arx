// Renders verified production panel/controller/gateways with isolated transport.
// Candidate backend authorization is covered separately by convex-test.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const root=process.cwd();
const prod=resolve(process.env.ARX_PRODUCTION_SOURCE || '../arx-channel-name-production-bridge-20260916');
const sha='496e06f42b6b4117b56c544fff75fc52e70c4716';
execFileSync('git',['diff','--exit-code',sha,'--','apps/web/src','shared'],{cwd:prod,stdio:'pipe'});
const output=process.env.ARX_QA_OUTPUT || '/tmp/arx-cached-client-browser';
await mkdir(output,{recursive:true});
const req=createRequire(resolve(root,'package.json'));
const {createServer}=await import(req.resolve('vite'));
const transport=`import {getFunctionName} from 'convex/server';
export const requireConvexUrl=()=>location.origin;
export async function bootstrapConvexAuthenticatedClient(){return {authSubject:'fixture-member',client:{
 mutation:async(ref,args)=>{const op=typeof ref==='string'?ref:getFunctionName(ref);const q=window.qa;q.calls.push({op,args});
 if(op.endsWith('generateCommunityChatAttachmentUploadUrl'))return {uploadUrl:location.origin+(q.mode==='upload-failure'?'/qa-upload-failure':'/qa-upload')};
 if(op.endsWith('createCommunityInteractionComposerMessage')){
 if(q.mode==='reattach' && args.attachments?.some(a=>a.storageId==='pre-receipt'))throw Error('Please reattach this file before sending. Its upload ownership could not be verified.');
 if(q.mode==='send-failure')throw Error('Connection interrupted. Try again.');
 q.sent.push(args);return {rows:[]};} throw Error('Unexpected operation '+op);},query:async()=>[]}};}`;
const entry=`import React,{useRef} from 'react';import {createRoot} from 'react-dom/client';
import {useWebCommunityChatController} from '/src/controllers/useWebCommunityChatController.ts';
import {WebCommunityChatPanel} from '/src/components/WebCommunityChatPanel.tsx';
import '/src/index.css';
window.qa={mode:'ok',calls:[],sent:[],optimistic:[],failed:[],completed:0};const q=window.qa;
const session={user:{id:'fixture-member'},access_token:'fixture-only'};const noop=()=>{};
function App(){const c=useWebCommunityChatController({activeCommunityId:'fixture-community',activeChannelId:'fixture-channel',canonicalSessionUserId:'fixture-member',
 ensureSession:async()=>session,session,isProfileSetupResolved:true,isProfileSetupComplete:true,canMentionEverybodyRef:useRef(false),onOpenProfileSetup:noop,
 onMessageSent:()=>q.completed++,interaction:{error:null,insertOptimistic:p=>q.optimistic.push(p),settleOptimistic:p=>q.failed.push(p)}});
 q.controller=c;
 return <div style={{height:'95vh',maxWidth:850,margin:'auto'}}><WebCommunityChatPanel
 activeCommunity={{id:'fixture-community',name:'Cached production client'}} session={session} sessionUserId="fixture-member"
 hasSession hasAuthenticatedPresentation canPostMessages isProfileSetupComplete isResolvingSelectedCommunity={false} isAuthRecoveringSignedIn={false}
 canMentionEverybody={false} everybodyMemberCount={1} typingPresence={{}} profilesByUserId={{}} mentionableCommunityMembers={[]}
 replyingToMessage={c.replyingToMessage} communityAttachments={c.attachments} communityMessageInput={c.messageInput}
 communityMessageMentions={c.messageMentions} setCommunityMessageMentions={c.setMessageMentions}
 communityAgentServeIssue={null} onDismissCommunityAgentServeIssue={noop} isSendingCommunityMessage={c.isSendingMessage} communityChatError={c.error}
 fileInputRef={c.fileInputRef} chatInputRef={c.inputRef} onRequireSignIn={noop} onFinishProfileSetup={noop} onSetReplyingToMessage={c.setReplyingToMessage}
 onCommunityFileInputChange={c.handleAttachmentFileInputChange} onCommunityAttachmentError={c.setError}
 onRemoveCommunityAttachment={c.removeAttachment} onIngestCommunityAttachmentsFromFileList={c.ingestAttachmentsFromFileList}
 onCommunityAttachmentDrop={c.handleAttachmentDrop} onCommunityAttachmentDragEnter={c.handleAttachmentDragEnter}
 onCommunityAttachmentDragOver={c.handleAttachmentDragOver} onCommunityAttachmentDragLeave={c.handleAttachmentDragLeave}
 onCommunityAttachmentPaste={c.handleAttachmentPaste} isCommunityAttachmentDragOver={c.isAttachmentDragOver}
 onCommunityMessageInputChange={c.setMessageInputFromTextarea} onSendCommunityMessage={c.handleSendCommunityMessage}
 displayName={v=>v} getAvatarColor={()=>'#555'} getInitials={()=>'QA'} formatChatTime={()=>''} truncateReplyPreview={v=>v} renderTextWithLinks={v=>v}
 onOpenCommunityChatLightbox={noop} onStartReply={c.handleStartReply} voiceButtonProps={{}} drawerVoiceButtonProps={{}} onCommunityVoiceInputClick={noop}
 interactionProjection={{roots:[],replies:[],onSelectRoot:noop,onCloseDrawer:noop}} lightboxModalProps={{isOpen:false,images:[],index:0,onClose:noop,onIndexChange:noop}} /></div>}
createRoot(document.getElementById('root')).render(<App/>);`;
let browser;let page;let uploadCount=0;
const server=await createServer({root:resolve(prod,'apps/web'),configFile:false,optimizeDeps:{noDiscovery:true,entries:[],include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','convex/react','convex/server','lucide-react']},esbuild:{jsx:'automatic'},resolve:{dedupe:['react','react-dom']},
 server:{host:'127.0.0.1',port:5199,strictPort:true,fs:{allow:[prod,root,resolve(root,'../arx-workflows-foundation-20260822')]}},
 plugins:[{name:'cached-client-proof',enforce:'pre',resolveId(id){if(id==='/qa-entry.tsx')return id;if(id==='./WebCommunityInteractionProjection')return '/qa-projection.tsx';if(id.endsWith('/convexAuthenticatedClient') || id==='./convexAuthenticatedClient')return '/qa-transport.ts';},
 load(id){if(id==='/qa-projection.tsx')return 'export function WebCommunityInteractionProjection(p){return <div style={{position:"relative",height:600}}><div className="community-interaction-main-composer">{p.mainComposer}</div><div className="community-interaction-drawer-composer">{p.drawerComposer}</div></div>}';if(id==='/qa-entry.tsx')return entry;if(id==='/qa-transport.ts')return transport;},configureServer(s){s.middlewares.use((req,res,next)=>{
 if(req.url==='/qa'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/qa-entry.tsx"></script></body></html>');return;}
 if(req.url==='/qa-upload-failure'){req.resume();res.statusCode=503;res.end('fixture upload failure');return;}
 if(req.url==='/qa-upload'){uploadCount++;req.resume();req.on('end',()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({storageId:'owned-'+uploadCount}));});return;}next();});}}]});
try{
 await server.listen();browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1000,height:800}});
 page.on('console',msg=>{if(msg.type()==='error')console.error(msg.text())});page.on('requestfailed',r=>console.error(r.url(),r.failure()));page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
 // No request may leave the local fixture, including accidental auth/provider calls.
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('http://127.0.0.1:5199/qa');
 await page.waitForFunction(()=>window.qa?.controller, null, {timeout:10000});
 await page.getByRole('textbox').waitFor();await page.screenshot({path:resolve(output,'initial.png')});
 const file={name:'recovery.txt',mimeType:'text/plain',buffer:Buffer.from('Local attachment recovery fixture')};
 const input=page.getByRole('textbox');const send=page.getByRole('button',{name:'Send',exact:true});
 const attach=async()=>{await page.locator('input[type=file]').setInputFiles(file);await page.getByRole('button',{name:'Remove recovery.txt'}).waitFor();};
 const idle=async()=>page.waitForFunction(()=>!window.qa.controller.isSendingMessage);
 const cases=[];
 for(const width of [1000,390]){
  await page.setViewportSize({width,height:800});
  await page.evaluate(()=>window.qa.mode='reattach');await input.fill('Keep this unsent draft');await attach();
  await page.evaluate(()=>{const a=window.qa.controller.attachments[0];a.storage_id='pre-receipt';a.file=null;});
  await send.click();await page.getByText('Please reattach this file before sending.',{exact:false}).waitFor();await idle();
  assert.equal(await input.inputValue(),'Keep this unsent draft');assert.equal(await page.getByRole('button',{name:'Remove recovery.txt'}).count(),1);
  await page.screenshot({path:resolve(output,'reattach-'+width+'.png')});
  await page.getByRole('button',{name:'Remove recovery.txt'}).click();await attach();
  const before=await page.evaluate(()=>window.qa.completed);await send.click();
  await page.waitForFunction(n=>window.qa.completed===n+1,before);await idle();assert.equal(await input.inputValue(),'');
  assert.equal(await page.getByRole('button',{name:'Remove recovery.txt'}).count(),0);
  cases.push({width,scenario:'pre-receipt rejection preserves text/file; remove and reattach succeeds',passed:true});
 }
 for(const mode of ['upload-failure','send-failure']){
  await page.evaluate(m=>window.qa.mode=m,mode);await input.fill('Recover from '+mode);await attach();await send.click();
  await page.locator('.auth-error').waitFor();await idle();assert.equal(await input.inputValue(),'Recover from '+mode);
  assert.equal(await page.getByRole('button',{name:'Remove recovery.txt'}).count(),1);
  assert.equal(await page.evaluate(()=>window.qa.controller.attachments[0].file instanceof File),true);
  await page.screenshot({path:resolve(output,mode+'.png')});
  await page.evaluate(()=>window.qa.mode='ok');const before=await page.evaluate(()=>window.qa.completed);await send.click();
  await page.waitForFunction(n=>window.qa.completed===n+1,before);await idle();
  cases.push({scenario:mode+' retains original File and text; retry succeeds',passed:true});
 }
 const calls=await page.evaluate(()=>window.qa.calls);const sent=await page.evaluate(()=>window.qa.sent);
 assert.equal(sent.length,4);assert.ok(sent.every(s=>s.attachments[0].storageId.startsWith('owned-')));
 assert.ok(calls.some(c=>c.op==='communityChat:generateCommunityChatAttachmentUploadUrl'));
 const receipt={productionSourceSha:sha,scope:'Unchanged production panel/controller/gateways rendered in Chromium; isolated transport and message-list host; NOT a deployed browser/backend end-to-end test',cases,uploads:uploadCount,successfulSends:sent.length,pageErrors:errors};
 await writeFile(resolve(output,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
 if(errors.length)throw Error(errors.join('\n'));
}catch(error){if(page){console.error(await page.locator('body').innerText());console.error(await page.evaluate(()=>({error:window.qa?.controller?.error,attachments:window.qa?.controller?.attachments,calls:window.qa?.calls})));await page.screenshot({path:resolve(output,'failure.png')});}throw error;}finally{await browser?.close();await server.close();}
