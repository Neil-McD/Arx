import {expect, test} from "vitest";
import {integrationStatus} from "../shared/communityIntegrationStatus";
const pending = {status:"pending" as const, connectedAccountId:"account", expiresAt:200, authorizationUrl:"https://connect.composio.dev/link", initiationState:"ready" as const};
test("new enabled connection and disabled connection",()=>{
  expect(integrationStatus(null,true,true,100).actions).toEqual(["connect"]);
  expect(integrationStatus(null,false,false,100).actions).toEqual([]);
});
test("pending link resumes while retaining disconnect",()=>{
  expect(integrationStatus(pending,true,false,100).actions).toEqual(["resume","disconnect"]);
});
test("expired or claimed callback never resumes",()=>{
  expect(integrationStatus(pending,true,false,300)).toMatchObject({status:"error",actions:["disconnect"]});
  expect(integrationStatus({...pending,callbackClaimed:true},true,false,100).actions).toEqual(["disconnect"]);
});
test("failed verification retains disconnect",()=>{
  expect(integrationStatus({...pending,status:"error"},true,false,100).actions).toEqual(["disconnect"]);
});
test("unknown initiation requires reconciliation and allows local denial",()=>{
  expect(integrationStatus({...pending,connectedAccountId:"",initiationState:"unknown"},true,false,100)).toMatchObject({reconciliationRequired:true,actions:["disconnect"]});
});
test("unknown cleanup has no misleading retry",()=>{
  expect(integrationStatus({...pending,status:"disconnected",connectedAccountId:"",initiationState:"unknown",revokePending:true},true,false,100)).toMatchObject({reconciliationRequired:true,actions:[]});
});
test("known cleanup offers only cleanup and lost access can disconnect",()=>{
  expect(integrationStatus({...pending,status:"disconnected",revokePending:true},false,false,100).actions).toEqual(["retry_cleanup"]);
  expect(integrationStatus({...pending,status:"active"},false,false,100).actions).toEqual(["disconnect"]);
});
test("in-flight initiation expires into reconciliation not a second create",()=>{
  expect(integrationStatus({...pending,connectedAccountId:"",authorizationUrl:undefined,initiationState:"awaiting"},true,false,300)).toMatchObject({reconciliationRequired:true,actions:["disconnect"]});
});
