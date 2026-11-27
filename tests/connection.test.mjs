import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,stat} from "node:fs/promises";
import {createServer} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";

test("verify a candidate without changing the active instance; preserve the connection on rejection",async t=>{
  const home=await mkdtemp(join(tmpdir(),"dsh-plugin-test-"));
  const original=process.env.PASEO_HOME;
  process.env.PASEO_HOME=home;
  t.after(async()=>{if(original===undefined)delete process.env.PASEO_HOME;else process.env.PASEO_HOME=original;await rm(home,{recursive:true,force:true})});
  const {check,config,directory,rpc}=await import("../server/connection.ts");
  async function host(installed){
    const server=createServer(async(req,res)=>{
      if(req.url==="/?token=valid"){res.writeHead(303,{"set-cookie":"dsh-auth-test=test; HttpOnly","location":"/"});res.end();return}
      if(installed&&req.url==="/orchestrator/api/state"){res.end(JSON.stringify({masterId:"router-test",paused:false,setup:{},load:{}}));return}
      if(req.url==="/api/session/projections"&&req.headers.cookie==="dsh-auth-test=test"){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const body=JSON.parse(Buffer.concat(chunks));res.end(JSON.stringify({rpcId:body.rpcId,result:{ok:true,value:{kind:"sequenced"}}}));return;
      }
      res.writeHead(req.url.startsWith("/?token=")||req.url.startsWith("/api/")?401:404);res.end();
    });
    await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
    t.after(()=>new Promise(resolve=>server.close(resolve)));
    return "http://127.0.0.1:"+server.address().port;
  }
  const first=await host(true),second=await host(true),plain=await host(false);
  assert.equal((await check({url:first,token:"valid",save:false})).router,true);
  assert.notEqual((await config()).url,first);
  assert.equal((await check({url:first,token:"valid",save:true})).saved,true);
  assert.equal((await stat(join(directory,"connection.json"))).mode&0o777,0o600);
  assert.equal((await check({url:first,token:"",save:false})).router,true);
  const missing=await check({url:plain,token:"",save:true});
  assert.ok(missing.reachable&&!missing.superagent&&!missing.saved);
  const invalid=await check({url:second,token:"wrong",save:true});
  assert.equal(invalid.saved,false);
  assert.match(invalid.detail,/未接受刚填写的登录令牌.*HTTP 401.*验证并保存/);
  await assert.rejects(rpc({url:first,cookie:"expired"},"session/projections",{}),/已保存的登录凭据.*HTTP 401.*启动终端或日志.*验证并保存/);
  await assert.rejects(rpc({url:first,cookie:""},"session/projections",{}),/尚未登录.*HTTP 401/);
  assert.equal((await config()).url,first);
  assert.equal((await check({url:second,token:"",save:true})).router,false);
  assert.deepEqual(await config(),{url:first,cookie:"dsh-auth-test=test"});
});
