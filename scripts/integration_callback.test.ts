import { it, expect, vi } from "vitest";
import { captureIntegrationCallback, completeStoredIntegrationCallback, INTEGRATION_ATTEMPT_KEY as key } from "../shared/integrationCallback";
it.each(["bootstrap", "verify"])("preserves newer attempt after %s rejects", async (phase) => {
  const {storage}=fixture();
  const newer=JSON.stringify({...JSON.parse(storage.getItem(key)!),generation:3,sessionUri:"new"});
  const fail=async()=>{storage.setItem(key,newer);throw new Error("network");};
  expect(await completeStoredIntegrationCallback(storage,
    phase === "bootstrap" ? fail : async()=>({user:{id:"owner"}}),
    phase === "verify" ? fail : async()=>true)).toBe("failed");
  expect(storage.getItem(key)).toBe(newer);
});
function fixture() {
  const values=new Map<string,string>();
  const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)} as unknown as Storage;
  storage.setItem(key,JSON.stringify({communityId:"community",userId:"owner",generation:2,expiresAt:Date.now()+60000}));
  const history={state:null,replaceState:vi.fn()};
  captureIntegrationCallback({href:"https://example.com/integrations/callback?session_uri=secret",pathname:"/integrations/callback"},history,storage);
  return {storage,history};
}
it("scrubs callback before login and preserves it only in tab storage",async()=>{
  const {storage,history}=fixture(); const verify=vi.fn(async()=>true);
  expect(history.replaceState).toHaveBeenCalledWith(null,"","/integrations/callback");
  expect(await completeStoredIntegrationCallback(storage,async()=>null,verify)).toBe("signin");
  expect(verify).not.toHaveBeenCalled();
  expect(await completeStoredIntegrationCallback(storage,async()=>({user:{id:"owner"}}),verify)).toBe("connected");
  expect(await completeStoredIntegrationCallback(storage,async()=>({user:{id:"owner"}}),verify)).toBe("failed");
  expect(verify).toHaveBeenCalledTimes(1);
});
it("rejects a different signed-in user",async()=>{
  const {storage}=fixture();const verify=vi.fn();
  expect(await completeStoredIntegrationCallback(storage,async()=>({user:{id:"other"}}),verify)).toBe("failed");
  expect(verify).not.toHaveBeenCalled();expect(storage.getItem(key)).toBeNull();
});
it("rejects expiry during login",async()=>{
  const {storage}=fixture();const verify=vi.fn();
  expect(await completeStoredIntegrationCallback(storage,async()=>{storage.setItem(key,JSON.stringify({...JSON.parse(storage.getItem(key)!),expiresAt:0}));return {user:{id:"owner"}};},verify)).toBe("failed");
  expect(verify).not.toHaveBeenCalled();
});
it("does not consume a newer attempt when bootstrap races",async()=>{
  const {storage}=fixture();const verify=vi.fn();
  expect(await completeStoredIntegrationCallback(storage,async()=>{storage.setItem(key,JSON.stringify({...JSON.parse(storage.getItem(key)!),generation:3}));return {user:{id:"owner"}};},verify)).toBe("failed");
  expect(verify).not.toHaveBeenCalled();expect(JSON.parse(storage.getItem(key)!).generation).toBe(3);
});
