// Local review artifacts and plain-file patch checks only. No Git index/ref write.
import fs from 'node:fs';import path from 'node:path';import {execFileSync,spawnSync} from 'node:child_process';import {createHash,randomUUID} from 'node:crypto';
const root=process.cwd(),out='docs/review/installation-readiness',baseline='99a4fdda55fd7c49f2d70bef4f2ed929021d0d65',stage='node_modules/.cache/ids-final-review/'+randomUUID();
const git=args=>execFileSync('git',['--no-optional-locks',...args],{encoding:'utf8',windowsHide:true,maxBuffer:80*1024*1024});
const normalize=s=>s.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n'),read=f=>normalize(fs.readFileSync(f,'utf8'));
const write=(f,s)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);},sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const tracked=new Set(git(['ls-tree','-r','--name-only',baseline]).trim().split(/\r?\n/));
const base=f=>tracked.has(f)?normalize(git(['show',`${baseline}:${f}`])):null;
function diff(file,old,next){if(old===next)return '';if(old===null){const lines=next.trimEnd().split('\n');return `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n`+lines.map(l=>'+'+l).join('\n')+'\n';}
 write(stage+'/old.txt',old);write(stage+'/new.txt',next);const r=spawnSync('git',['diff','--no-index','--no-ext-diff','--text','--',stage+'/old.txt',stage+'/new.txt'],{encoding:'utf8',windowsHide:true,maxBuffer:50*1024*1024});if(![0,1].includes(r.status))throw Error('Patch generation failed');return r.stdout.replace(/^diff --git .*$/m,`diff --git a/${file} b/${file}`).replace(/^--- .*$/m,`--- a/${file}`).replace(/^\+\+\+ .*$/m,`+++ b/${file}`);
}
if(git(['rev-parse','HEAD']).trim()!==baseline)throw Error('Baseline changed');
const source=git(['ls-files','-co','--exclude-standard']).trim().split(/\r?\n/).filter(f=>/^(app|components|lib|scripts|tests|supabase\/migrations)\//.test(f)||/^docs\/[^/]+\.md$/.test(f)||['AGENTS.md','CLAUDE.md'].includes(f));
const changes=[...new Set(source)].filter(f=>base(f)!==read(f)).sort();
const previous='docs/review/installation-activation-controls.patch',priorFiles=[...read(previous).matchAll(/^diff --git a\/(.+) b\//gm)].map(m=>m[1]);
for(const f of priorFiles){const b=base(f);if(b!==null)write(`${stage}/controls/${f}`,b);}
git(['apply','--check',`--directory=${stage}/controls`,previous]);git(['apply',`--directory=${stage}/controls`,previous]);
const controls=new Map(priorFiles.map(f=>[f,read(`${stage}/controls/${f}`)]));
for(const f of ['lib/installations/controls.ts','tests/installation-controls.test.ts','tests/installation-cash-controls.test.ts','docs/installation-controls.md'])controls.set(f,read(f));
controls.set('lib/installations/cash.ts',`import 'server-only';\nimport {isReviewAdmin} from '@/lib/reviews/admin-auth';\nimport {requireInstallationCashRecording} from './controls';\nasync function unavailable(){if(!(await isReviewAdmin()))throw Error('Unauthorized');requireInstallationCashRecording();throw Error('installation_cash_implementation_unavailable');}\nexport const recordInstallationCash=unavailable;\nexport const correctInstallationCash=unavailable;\nexport const refundInstallationCash=unavailable;\n`);
for(const suffix of ['','/corrections','/refunds'])controls.set(`app/api/admin/installations/[id]/cash${suffix}/route.ts`,`import {isReviewAdmin} from '@/lib/reviews/admin-auth';\nimport {requireInstallationCashRecording} from '@/lib/installations/controls';\nexport async function POST(request:Request,context:{params:Promise<{id:string}>}){void request;void context;if(!(await isReviewAdmin()))return Response.json({error:'Unauthorized'},{status:401});try{requireInstallationCashRecording();}catch{return Response.json({error:'Cash recording is disabled.'},{status:503});}return Response.json({error:'Cash implementation is unavailable in this controls-only release.'},{status:503});}\n`);
const controlsPatch=[...controls].map(([f,s])=>diff(f,base(f),s)).join('');write(`${out}/01-controls-only.patch`,controlsPatch);
const fresh=stage+'/controls-check';for(const f of controls.keys()){const b=base(f);if(b!==null)write(`${fresh}/${f}`,b);}
git(['apply','--check',`--directory=${fresh}`,`${out}/01-controls-only.patch`]);git(['apply',`--directory=${fresh}`,`${out}/01-controls-only.patch`]);write(`${fresh}/lib/stripe/config-values.ts`,base('lib/stripe/config-values.ts'));
const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>!/SUPABASE|STRIPE|RESEND|DATABASE|SMTP|ADMIN_PASSWORD|INSTALLATION_|EMAIL/.test(k))),NODE_ENV:'test'};
const test=execFileSync(process.execPath,['--import','tsx','--test',path.resolve(`${fresh}/tests/installation-controls.test.ts`),path.resolve(`${fresh}/tests/installation-cash-controls.test.ts`)],{encoding:'utf8',env,windowsHide:true});write(`${out}/controls-only-tests.log`,test);
const migrations=changes.filter(f=>f.startsWith('supabase/migrations/')),appFiles=changes.filter(f=>/^(app|components|lib)\//.test(f)),other=changes.filter(f=>!migrations.includes(f)&&!appFiles.includes(f));
write(`${out}/02-database.patch`,migrations.map(f=>diff(f,base(f),read(f))).join(''));
write(`${out}/03-application-after-controls.patch`,[...new Set([...appFiles,...controls.keys()].filter(f=>/^(app|components|lib)\//.test(f)))].sort().map(f=>diff(f,controls.get(f)??base(f),read(f))).join(''));
write(`${out}/04-tests-tooling-docs.patch`,[...new Set([...other,...controls.keys()].filter(f=>!/^app\/|^components\/|^lib\//.test(f)))].sort().map(f=>diff(f,controls.get(f)??base(f),read(f))).join(''));
write(`${out}/complete-candidate.patch`,changes.map(f=>diff(f,base(f),read(f))).join(''));
const check=stage+'/complete-check';for(const f of changes){const b=base(f);if(b!==null)write(`${check}/${f}`,b);}git(['apply','--check',`--directory=${check}`,`${out}/complete-candidate.patch`]);git(['apply',`--directory=${check}`,`${out}/complete-candidate.patch`]);for(const f of changes)if(read(`${check}/${f}`)!==read(f))throw Error('Patch reproduction mismatch: '+f);
// Prove the staged release patches reconstruct the same candidate without an index.
for(const f of changes){const b=base(f);if(b!==null&&!fs.existsSync(`${fresh}/${f}`))write(`${fresh}/${f}`,b);}
for(const patch of ['02-database.patch','03-application-after-controls.patch','04-tests-tooling-docs.patch']){git(['apply','--check',`--directory=${fresh}`,`${out}/${patch}`]);git(['apply',`--directory=${fresh}`,`${out}/${patch}`]);}
for(const f of changes)if(read(`${fresh}/${f}`)!==read(f))throw Error('Release sequence mismatch: '+f);
const start=JSON.parse(read(`${out}/start.json`)),taskChanges=changes.filter(f=>!start.sourceHashes[f]||sha(f)!==start.sourceHashes[f]);
write(`${out}/current-task-delta.patch`,taskChanges.map(f=>diff(f,fs.existsSync(`${out}/before/${f}.txt`)?read(`${out}/before/${f}.txt`):null,read(f))).join(''));
write(`${out}/exact-files.json`,JSON.stringify({baseline,worktree:root,changes:changes.map(file=>({file,sha256:sha(file),change:tracked.has(file)?'modified':'added',changedThisContinuation:taskChanges.includes(file)})),migrationOrder:['supabase/migrations/20260904204800_professional_installations.sql',...migrations],controlsFiles:[...controls.keys()],patchChecks:{complete:true,releaseSequence:true,realGitIndexTouched:false}},null,2)+'\n');
write(`${out}/exact-files.md`,'# Exact release source changes\n\nRelative to `'+baseline+'`. Generated evidence/snapshots are catalogued separately and are not release source.\n\n'+changes.map(f=>'- `'+f+'`'+(taskChanges.includes(f)?' — changed in this continuation':' — preserved prior implementation')).join('\n')+'\n');
console.log(JSON.stringify({sourceFiles:changes.length,continuationFiles:taskChanges.length,controlsTests:'passed',completePatchVerified:true,releaseSequenceVerified:true}));
