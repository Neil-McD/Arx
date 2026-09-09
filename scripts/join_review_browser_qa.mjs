// Real component, local synthetic callbacks only; no cloud connection.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const requireWeb = createRequire(resolve(root, 'apps/web/package.json'));
const { createServer } = await import(requireWeb.resolve('vite'));
const entry = `import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CommunityJoinRequestReview} from '/src/components/CommunityJoinRequestReview';
import {useMemberScrollPagination} from '/src/components/useMemberScrollPagination';
import {WebCommunityInteractionProjection} from '/src/components/WebCommunityInteractionProjection';
import '/src/index.css';
window.React = React;
function Fixture() {
 const [pending,setPending]=useState(false), [allowed,setAllowed]=useState(true), [loading,setLoading]=useState(false), [result,setResult]=useState('No decision');
 return <main style={{width:340,padding:20}}>
 <label><input type="checkbox" checked={allowed} onChange={e=>setAllowed(e.target.checked)}/>Reviewer permission</label>
 <label><input type="checkbox" checked={loading} onChange={e=>setLoading(e.target.checked)}/>Loading requests</label>
 <button onClick={()=>setPending(false)}>Finish simulated request</button>
 <output aria-label="Decision receipt">{result}</output>
 <CommunityJoinRequestReview canReviewJoinRequests={allowed} joinReviewMode="free_approval" displayName={()=>'Applicant'}
 pendingJoinRequests={[{id:'synthetic-request',userId:'synthetic-user',displayName:'Applicant',avatarUrl:null,message:'Synthetic request',createdAtLabel:'Today'}]}
 isLoadingJoinRequests={loading} decidingJoinRequestId={pending?'synthetic-request':null}
 onApproveJoinRequest={id=>{setResult('Approved '+id);setPending(true)}}
 onDenyJoinRequest={id=>{setResult('Denied '+id);setPending(true)}}/>
 </main>;
}
function RosterFixture() {
 const [wide,setWide]=useState(false);
 return <><label><input type="checkbox" checked={wide} onChange={e=>setWide(e.target.checked)}/>Desktop width</label>
 <div style={{container:'community-chat-area / inline-size',width:wide?1000:500,height:600,display:'flex'}}>
 <WebCommunityInteractionProjection roots={[]} replies={[]} activityEvents={[]} profilesByUserId={{}}
 communityId="synthetic" activeCommunityName="Synthetic community"
 activeChannel={{id:'general',name:'General',slug:'general',is_general:true}}
 displayName={()=>'Applicant'} getInitials={()=>'A'} getAvatarColor={()=>'gray'}
 formatChatTime={()=>''} renderTextWithLinks={text=>text} onSelectRoot={()=>{}}
 mainComposer={<input aria-label="Draft message" />}
 admission={{mode:'approval',canManage:true,pending:false,error:null,onChange:()=>{}}}/>
 </div></>;
}
function ScrollFixture() {
 const [page,setPage]=useState(1), [busy,setBusy]=useState(false);
 const {membersViewportRef,loadMoreSentinelRef,handleMembersScroll}=useMemberScrollPagination({
   membersHasMore:page<4,isLoadingMoreMembers:busy,
   onLoadMoreMembers:()=>{setBusy(true);setTimeout(()=>{setPage(n=>n+1);setBusy(false)},150)}
 },page);
 const count=page<3?2:page===3?20:30;
 return <><output>Page {page}; rows {count}</output>
 <div ref={membersViewportRef} onScroll={handleMembersScroll} style={{height:240,width:300,overflowY:'auto'}}>
 {Array.from({length:count},(_,i)=><div key={i} style={{height:40}}>Member {i+1}</div>)}
 <div ref={loadMoreSentinelRef}>{page===4?'Showing 30 of 30':'Loading more...'}</div>
 </div></>;
}
createRoot(document.getElementById('root')).render(location.search==='?scroll'?<ScrollFixture/>:location.search==='?roster'?<RosterFixture/>:<Fixture/>);`;
const server=await createServer({root:resolve(root,'apps/web'),configFile:false,server:{host:'127.0.0.1',port:5197,strictPort:true},plugins:[{
 name:'join-review-qa',resolveId:id=>id==='/qa-entry.tsx'?id:null,load:id=>id==='/qa-entry.tsx'?entry:null,
 configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0]!=='/qa')return next();res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><div id="root"></div><script type="module" src="/qa-entry.tsx"></script></body></html>');});}
}]});
await server.listen();
console.log('Synthetic join review fixture: http://127.0.0.1:5197/qa');
