// Dedicated LOCAL services only. Does not read the original checkout's env,
// retarget existing REST, modify cluster roles, or create/drop a database.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import {execFileSync,spawn} from "node:child_process";
import {createHmac,randomBytes,createHash} from "node:crypto";
import assert from "node:assert/strict";
import {TARGET,configureDisposableDatabase,assertContainer,assertLocalEndpoint,assertDatabase,assertRun,type Approval,type RunManifest} from "./guards";
import {sourceHashes} from "./runner";
async function main(){
const [phase,suffix,mode]=process.argv.slice(2);
assert.ok(["api","app"].includes(phase));assert.match(suffix,/^[a-z0-9_]{1,26}$/);
const root=process.cwd(),dir=path.join(root,"node_modules/.cache/ids-installation-test"),privateFile=path.join(dir,`${suffix}-services.json`);
const approval=JSON.parse(fs.readFileSync(`docs/review/installation-readiness/db-${suffix}-approval.json`,"utf8")) as Approval;
const manifest=JSON.parse(fs.readFileSync(`docs/review/installation-readiness/db-${suffix}-run.json`,"utf8")) as RunManifest;
configureDisposableDatabase(approval.database);assert.deepEqual(sourceHashes(root),approval.hashes,"Source changed after database preparation");
const docker=(args:string[],input?:string)=>execFileSync("docker",args,{input,encoding:"utf8",windowsHide:true,timeout:30000,stdio:["pipe","pipe","pipe"]});
const endpoint=JSON.parse(docker(["context","inspect","--format","{{json .Endpoints.docker.Host}}"]));assertLocalEndpoint(endpoint,process.env.DOCKER_HOST);
const local=(args:string[],input?:string)=>docker(["--host",endpoint,...args],input);
assertContainer(JSON.parse(local(["inspect","--format",'{"Id":{{json .Id}},"Name":{{json .Name}},"State":{"Running":{{json .State.Running}}},"Config":{"Labels":{"com.supabase.cli.project":{{json (index .Config.Labels "com.supabase.cli.project")}}}},"HostConfig":{"NetworkMode":{{json .HostConfig.NetworkMode}}},"NetworkSettings":{"Ports":{{json .NetworkSettings.Ports}}}}',approval.containerId])),approval.containerId);
const sql=(query:string)=>JSON.parse(local(["exec","-i","-e","PGOPTIONS=-c default_transaction_read_only=on",approval.containerId,"psql","-X","-w","-qAt","-U","postgres","-d",approval.database,"-v","ON_ERROR_STOP=1"],query+";\n"));
assertDatabase(sql("select json_build_object('database',current_database(),'oid',(select oid from pg_database where datname=current_database()),'role',current_user,'sessionRole',session_user,'version',current_setting('server_version_num')::integer)"),approval.database,manifest.databaseOid);
assertRun(manifest,approval,sql("select json_build_object('runId',run_id,'databaseOid',database_oid) from ids_cash_review.run_manifest"));
const restName=`ids_installation_review_rest_${suffix}`,restPort=45436,proxyPort=45437,appPort=3046;
const free=async(port:number)=>new Promise<void>((resolve,reject)=>{const server=net.createServer();server.once("error",reject);server.listen(port,"127.0.0.1",()=>server.close(()=>resolve()));});
if(phase==="api"){
  assert.ok(!fs.existsSync(privateFile),"Existing service configuration must be preserved");await free(restPort);await free(proxyPort);
  assert.equal(local(["ps","-a","--filter",`name=^/${restName}$`,"--format","{{.ID}}"]).trim(),"","Dedicated name already exists");
  const originalName="supabase_rest_mower-site-installation-smoke";
  const originalEnvRaw=local(["inspect","--format","{{json .Config.Env}}",originalName]);
  const env=Object.fromEntries((JSON.parse(originalEnvRaw) as string[]).map(s=>{const pos=s.indexOf("=");return[s.slice(0,pos),s.slice(pos+1)];}));
  const uri=new URL(env.PGRST_DB_URI);assert.equal(uri.pathname,"/postgres");assert.equal(uri.username,"authenticator");
  uri.hostname=TARGET.containerName.slice(1);uri.port="5432";uri.pathname=`/${approval.database}`;
  const image=local(["inspect","--format","{{.Config.Image}}",originalName]).trim();assert.equal(image,"public.ecr.aws/supabase/postgrest:v16.1");
  const secret=randomBytes(32).toString("base64url"),token=(role:string)=>{const h=Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url"),p=Buffer.from(JSON.stringify({role,iss:"ids-local-installation-review",exp:Math.floor(Date.now()/1000)+86400*7})).toString("base64url");return`${h}.${p}.${createHmac("sha256",secret).update(`${h}.${p}`).digest("base64url")}`;};
  fs.mkdirSync(dir,{recursive:true});const envFile=path.join(dir,`${suffix}-postgrest.env`);
  fs.writeFileSync(envFile,`PGRST_DB_URI=${uri.toString()}\nPGRST_DB_SCHEMAS=public\nPGRST_DB_ANON_ROLE=anon\nPGRST_JWT_SECRET=${secret}\nPGRST_SERVER_PORT=3000\nPGRST_DB_POOL=5\n`);
  const containerId=local(["run","-d","--name",restName,"--network",TARGET.network,"--publish",`127.0.0.1:${restPort}:3000`,"--label",`ids.installation.review=${manifest.runId}`,"--env-file",envFile,image]).trim();
  assert.match(containerId,/^[a-f0-9]{64}$/);
  const originalEnvAfter=local(["inspect","--format","{{json .Config.Env}}",originalName]);assert.equal(originalEnvAfter,originalEnvRaw,"Existing REST changed");
  const privateConfig={database:approval.database,databaseOid:manifest.databaseOid,runId:manifest.runId,containerId,restName,restPort,proxyPort,appPort,serviceKey:token("service_role"),anonKey:token("anon"),adminPassword:"ids-installation-local-only"};
  fs.writeFileSync(privateFile,JSON.stringify(privateConfig,null,2)+"\n");
  const {serviceKey,anonKey,adminPassword,...publicConfig}=privateConfig;void serviceKey;void anonKey;void adminPassword;
  fs.writeFileSync(`docs/review/installation-readiness/${suffix}-services.json`,JSON.stringify({...publicConfig,originalRestEnvironmentHash:createHash("sha256").update(originalEnvRaw).digest("hex"),originalRestUnchanged:true,loopbackOnly:true},null,2)+"\n");
  console.log(JSON.stringify({started:restName,database:approval.database,port:restPort,originalRestUnchanged:true}));
}else{
  assert.ok(mode==="disabled"||mode==="enabled");await free(proxyPort);await free(appPort);
  const config=JSON.parse(fs.readFileSync(privateFile,"utf8"));assert.equal(config.database,manifest.database);assert.equal(config.databaseOid,manifest.databaseOid);
  const ports=JSON.parse(local(["inspect","--format","{{json .NetworkSettings.Ports}}",config.containerId]));assert.deepEqual(ports["3000/tcp"],[{HostIp:"127.0.0.1",HostPort:String(restPort)}]);
  const proxy=http.createServer((req,res)=>{
    if(!req.url?.startsWith("/rest/v1/")){res.writeHead(404).end();return;}
    const forward=http.request({host:"127.0.0.1",port:restPort,path:req.url.slice(8),method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode??502,reply.headers);reply.pipe(res);});
    forward.on("error",()=>res.writeHead(502).end());req.pipe(forward);
  });await new Promise<void>(resolve=>proxy.listen(proxyPort,"127.0.0.1",resolve));
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!/SUPABASE|STRIPE|RESEND|SMTP|DATABASE|POSTGRES|ADMIN_PASSWORD|CHECKOUT_SIGNING|INSTALLATION_|NOTIFICATION|FROM_EMAIL|ORGANIZER_EMAIL|APP_BASE_URL|IDS_SITE_URL|VERCEL|EMAIL/.test(name)));
  Object.assign(env,{NODE_ENV:"development",SUPABASE_URL:`http://127.0.0.1:${proxyPort}`,SUPABASE_ANON_KEY:config.anonKey,SUPABASE_SERVICE_ROLE_KEY:config.serviceKey,
    REVIEWS_ADMIN_PASSWORD:config.adminPassword,STRIPE_MODE:"test",CHECKOUT_SIGNING_SECRET:randomBytes(32).toString("hex"),APP_BASE_URL:`http://127.0.0.1:${appPort}`,IDS_SITE_URL:`http://127.0.0.1:${appPort}`,
    INSTALLATION_INTAKE_ENABLED:String(mode==="enabled"),INSTALLATION_CASH_RECORDING_ENABLED:String(mode==="enabled"),INSTALLATION_ONLINE_PAYMENTS_ENABLED:"false",
    NEXT_TELEMETRY_DISABLED:"1",RESEND_API_KEY:"",NOTIFICATION_EMAIL_ENABLED:"false"});
  const stripeFile=path.join(dir,"stripe.env");if(fs.existsSync(stripeFile)){
    const values=Object.fromEntries(fs.readFileSync(stripeFile,"utf8").split(/\r?\n/).filter(l=>/^(STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET)=/.test(l)).map(l=>{const at=l.indexOf("=");return[l.slice(0,at),l.slice(at+1).trim()];}));
    assert.match(values.STRIPE_SECRET_KEY??"",/^sk_test_/);Object.assign(env,values);if(mode==="enabled")env.INSTALLATION_ONLINE_PAYMENTS_ENABLED="true";
  }
  const child=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port",String(appPort)],{cwd:root,env:env as NodeJS.ProcessEnv,stdio:"inherit",windowsHide:true});
  fs.writeFileSync(path.join(dir,`${suffix}-processes.json`),JSON.stringify({parentPid:process.pid,appPid:child.pid,root,mode,appPort,proxyPort,database:manifest.database})+"\n");
  console.log(JSON.stringify({appPort,proxyPort,database:manifest.database,mode,stripeTestKeyPresent:!!env.STRIPE_SECRET_KEY,emailSendingEnabled:false}));
  process.on("SIGINT",()=>{child.kill();proxy.close();});child.on("exit",code=>{proxy.close();process.exitCode=code??1;});
}
}
main().catch(error=>{console.error("Dedicated local service stopped:",error instanceof Error?error.message.split("\n")[0]:"Unknown error");process.exitCode=1;});
