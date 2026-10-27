import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import pg from 'pg';
import { rateLimit } from 'express-rate-limit';
import cookie from 'cookie';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const required = ['DATABASE_URL','ADMIN_USERNAME','ADMIN_PASSWORD','SESSION_SECRET'];
for(const key of required) if(!process.env[key]) throw new Error('Missing required configuration: '+key);
if(process.env.ADMIN_PASSWORD.length<12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
if(process.env.SESSION_SECRET.length<32) throw new Error('SESSION_SECRET must be at least 32 characters');
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL, max:8, ssl:process.env.PGSSL==='true'?{rejectUnauthorized:true}:undefined});
const app=express();
app.disable('x-powered-by');app.set('trust proxy',Number(process.env.TRUST_PROXY||0));
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'","data:"],connectSrc:["'self'"],objectSrc:["'none'"],baseUri:["'self'"],frameAncestors:["'none'"]}}}));
app.use(express.json({limit:'2mb'}));
const initial=()=>({students:[],plans:[{id:'p1',name:'Oylik',price:350000,months:1},{id:'p2',name:'12 mashg‘ulot',price:400000,months:2,visits:12}],memberships:[],payments:[],attendance:[]});
export function validateState(s){
 if(!s||typeof s!=='object'||Array.isArray(s))return false;
 const keys=['students','plans','memberships','payments','attendance'];
 if(!keys.every(k=>Array.isArray(s[k])&&s[k].length<=20000))return false;
 if(!keys.every(k=>s[k].every(v=>v&&typeof v==='object'&&!Array.isArray(v)&&typeof v.id==='string'&&v.id.length<=120)))return false;
 const ids = new Set(s.students.map(x=>x.id)),planIds=new Set(s.plans.map(x=>x.id));
 const str=(v,n=500)=>typeof v==='string'&&v.length<=n;
 const money=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e12;
 const date=v=>str(v,10)&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v));
 if(!s.students.every(x=>str(x.name,180)&&x.name.trim()&&str(x.phone??'',80)&&str(x.group??'',120)&&str(x.note??'',2000)))return false;
 if(!s.plans.every(x=>str(x.name,180)&&x.name.trim()&&money(x.price)&&Number.isInteger(x.months)&&x.months>=1&&x.months<=120&&Number.isInteger(x.visits??0)&&(x.visits??0)>=0))return false;
 if(!s.memberships.every(x=>ids.has(x.studentId)&&planIds.has(x.planId)&&date(x.start)&&date(x.end)&&money(x.price)))return false;
 if(!s.payments.every(x=>ids.has(x.studentId)&&date(x.day)&&money(x.amount)&&x.amount>0&&['Naqd','Karta','O‘tkazma'].includes(x.method)))return false;
 if(!s.attendance.every(x=>ids.has(x.studentId)&&date(x.day)&&['Keldi','Kelmadi'].includes(x.status)))return false;
 return keys.every(k=>new Set(s[k].map(x=>x.id)).size===s[k].length);
}
const safeEqual=(a,b)=>{const ha=createHash('sha256').update(String(a)).digest(),hb=createHash('sha256').update(String(b)).digest();return timingSafeEqual(ha,hb)};
const hashToken=t=>createHash('sha256').update(t).digest('hex');
const cookieName='mma_session';
const sessionCookie=t=>cookie.serialize(cookieName,t,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:60*60*12});
async function setup(){
 await pool.query('CREATE TABLE IF NOT EXISTS mma_state (id integer PRIMARY KEY CHECK(id=1), content jsonb NOT NULL, revision bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now())');
 await pool.query('CREATE TABLE IF NOT EXISTS mma_sessions (token_hash text PRIMARY KEY, expires_at timestamptz NOT NULL)');
 await pool.query('CREATE TABLE IF NOT EXISTS mma_audit (id bigserial PRIMARY KEY, action text NOT NULL, at timestamptz NOT NULL DEFAULT now())');
 await pool.query('INSERT INTO mma_state(id,content) VALUES (1,$1) ON CONFLICT (id) DO NOTHING',[initial()]);
 await pool.query('DELETE FROM mma_sessions WHERE expires_at < now()');
}
const limit=rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Juda ko‘p urinish. Keyinroq urinib ko‘ring.'}});
const originCheck=(req,res,next)=>{
 if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
 const origin=req.get('origin');
 if(origin){try{if(new URL(origin).host!==req.get('host'))return res.status(403).json({error:'Origin mismatch'})}catch{return res.status(403).json({error:'Invalid origin'})}}
 if(req.path==='/api/login')return next();
 if(!origin && req.get('sec-fetch-site') && !['same-origin','none'].includes(req.get('sec-fetch-site')))return res.status(403).json({error:'Cross-site request rejected'});
 next();
};
app.use(originCheck);
app.post('/api/login',limit,async(req,res,next)=>{try{
 const {username,password}=req.body||{};
 if(!safeEqual(username||'',process.env.ADMIN_USERNAME)||!safeEqual(password||'',process.env.ADMIN_PASSWORD))return res.status(401).json({error:'Login yoki parol xato'});
 const token=randomBytes(32).toString('hex'),hash=hashToken(token);
 await pool.query("INSERT INTO mma_sessions(token_hash,expires_at) VALUES ($1,now()+interval '12 hours')",[hash]);
 res.setHeader('Set-Cookie',sessionCookie(token));res.json({ok:true});
 }catch(e){next(e)}});
async function auth(req,res,next){try{
 const token=cookie.parse(req.headers.cookie||'')[cookieName];if(!token||!(/^[0-9a-f]{64}$/.test(token)))return res.status(401).json({error:'Login talab qilinadi'});
 const found=await pool.query('SELECT token_hash FROM mma_sessions WHERE token_hash=$1 AND expires_at>now()',[hashToken(token)]);
 if(!found.rowCount)return res.status(401).json({error:'Sessiya tugagan'});
 req.sessionToken=hashToken(token);next();
 }catch(e){next(e)}}
app.get('/api/me',auth,(_req,res)=>res.json({username:process.env.ADMIN_USERNAME}));
app.post('/api/logout',auth,async(req,res,next)=>{try{await pool.query('DELETE FROM mma_sessions WHERE token_hash=$1',[req.sessionToken]);res.setHeader('Set-Cookie',cookie.serialize(cookieName,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:0}));res.json({ok:true})}catch(e){next(e)}});
app.get('/api/state',auth,async(_req,res,next)=>{try{const r=await pool.query('SELECT content,revision FROM mma_state WHERE id=1');res.setHeader('Cache-Control','no-store');res.json({state:r.rows[0].content,revision:Number(r.rows[0].revision)})}catch(e){next(e)}});
app.put('/api/state',auth,async(req,res,next)=>{try{
 const {state,revision}=req.body||{};
 if(!Number.isSafeInteger(revision)||revision<0||!validateState(state))return res.status(400).json({error:'Ma’lumot noto‘g‘ri'});
 const r=await pool.query('UPDATE mma_state SET content=$1, revision=revision+1,updated_at=now() WHERE id=1 AND revision=$2 RETURNING revision',[state,revision]);
 if(!r.rowCount)return res.status(409).json({error:'Ma’lumot boshqa oynada yangilangan. Sahifani qayta yuklang.'});
 await pool.query("INSERT INTO mma_audit(action) VALUES ('state_updated')");
 res.json({revision:Number(r.rows[0].revision)});
 }catch(e){next(e)}});
app.get('/api/backup',auth,async(_req,res,next)=>{try{const r=await pool.query('SELECT content FROM mma_state WHERE id=1');res.setHeader('Content-Disposition','attachment; filename="mma-backup.json"');res.setHeader('Cache-Control','no-store');res.type('json').send(JSON.stringify(r.rows[0].content,null,2))}catch(e){next(e)}});
app.get('/api/health',async(_req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true})}catch{res.status(503).json({ok:false})}});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const name of ['app.js','style.css'])app.get('/'+name,(_req,res)=>res.sendFile(path.join(root,name)));
app.get('/favicon.ico',(_req,res)=>res.status(204).end());
app.get('/',(_req,res)=>res.sendFile(path.join(root,'index.html')));
app.use('/api',(_req,res)=>res.status(404).json({error:'Not found'}));
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'Server xatosi'})});
if(process.env.NODE_ENV!=='test'){
 setup().then(()=>app.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('USTOZ MMA running on port '+(process.env.PORT||3000)))).catch(err=>{console.error('Database initialization failed',err);process.exit(1)});
}
export {app,setup,pool};
