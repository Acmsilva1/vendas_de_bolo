import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { readCookie } from '../api/_auth.js';
import { verifyPasswordHash, hashPassword } from '../api/_db.js';
test('API rejeita ataques e preserva reserva salva quando falha a auditoria da notificação', async () => {
process.env.NODE_ENV='production';
process.env.URL_SUPABASE='https://audit-fixture.supabase.co';
process.env.SERVICE_ROLE_SUPABASE='sb_secret_audit_fixture';
process.env.ADMIN_SESSION_SECRET='audit-local-test-secret-more-than-32-characters';
delete process.env.ADMIN_INITIAL_PASSWORD;
process.env.TELEGRAM_BOT_TOKEN='';process.env.TELEGRAM_CHAT_ID='';
const nativeFetch=globalThis.fetch;
const rpcCalls:any[]=[];
let telemetryFailure=false;
let replayed=false;
let orderFailure=0;
let cartFailure=0;
let stockConflict=false;
const fixtureHash=hashPassword('fixture-password');
const cake=(id=1)=>({id,name:'Fixture',ingredients:[],category:'comum',price:10,stock_quantity:5,image_url:'',is_active:id===1});
const order={id:100,order_code:'FIXTURE',customer_name:'Fixture',customer_phone:'27999990000',delivery_block:'A',delivery_apartment:'1',payment_method:'pix',total_amount:10,status:'pendente',telegram_sent:false,items:[{cake_id:1,cake_name:'Fixture',quantity:1,unit_price:10,subtotal:10}]};
globalThis.fetch=(async(input:any,options:any)=>{
 if(String(input).startsWith('http://127.0.0.1:'))return nativeFetch(input,options);
 if(!String(input).startsWith(process.env.URL_SUPABASE!))throw Error('External request blocked');
 const {p_operation:op,p_data:data}=JSON.parse(options.body);rpcCalls.push({op,data});
 if(op==='health')return Response.json({ok:true,version:14});
 if(op==='admin_hash')return Response.json(data.username.toLowerCase()==='admin'?fixtureHash:null);
 if(op==='login_blocked')return Response.json(false);
 if(op==='cakes')return Response.json(data.onlyActive?[cake()]:[cake(),cake(2)]);
 if(op==='cake')return Response.json(cake(data.id));
 if(op==='cake_image')return Response.json({hex:'89504e470d0a1a0a',mimeType:'image/png'});
 if(op==='orders')return Response.json([order]);
 if(op==='cake_update'&&stockConflict)return Response.json({reservation_conflict:true,error:'Reserved units'});
 if(op==='cake_update'){
  if(data.price<0||data.price===null||data.stock_quantity===null)return Response.json({message:'constraint'}, {status:400});
  return Response.json({...cake(data.id),...data});
 }
 if((op==='stock'||op==='cake_update')&&stockConflict)return Response.json({reservation_conflict:true,error:'Reserved units'});
 if(op==='cart_get'||op==='cart_set')return Response.json({success:!cartFailure,...(cartFailure?{statusCode:cartFailure,error:'cart rejected'}:{}),cart:{version:1,server_time:new Date().toISOString(),items:[]}});
 if(op==='stock')return Response.json(cake(data.id));
 if(op==='cake_delete'||op==='order_delete')return Response.json(true);
 if(op==='order_status')return Response.json({...order,status:data.status});
 if(op==='order_create')return Response.json(orderFailure ? {order:null,success:false,statusCode:orderFailure,error:'fixture-rejection'} : {order,success:true,replayed});
 if(op==='telegram'&&telemetryFailure)return Response.json({message:'fixture failure'},{status:500});
 return Response.json(null);
}) as typeof fetch;
const { default:app }=await import('../api/index.js');
const server=app.listen(0,'127.0.0.1');await once(server,'listening');
const base='http://127.0.0.1:'+(server.address() as any).port;
const initialLogin=await nativeFetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json',origin:base},body:JSON.stringify({username:'Admin',password:'fixture-password'})});
const adminCookie=(initialLogin.headers.get('set-cookie')||'').split(';')[0];
if(initialLogin.status!==200||!adminCookie)throw Error('Fixture login failed');

const findings:any[]=[];let passed=0;
async function probe(name:string,path:string,expected:number,options:any={}){
 const r=await nativeFetch(base+path,options);const text=await r.text();
 const item={name,expected,actual:r.status};
 if(expected===r.status){passed++;}else {findings.push(item);}
 return {r,text};
}
const json=(value:any,auth=true,origin=base)=>({method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'fixture-request-0001','X-Cart-Token':'t'.repeat(43),...(auth?{cookie:adminCookie}:{}),origin},body:JSON.stringify(value)});
try{
 for(const [method,path]of [['GET','/orders'],['GET','/stats'],['GET','/dashboard'],['POST','/cakes'],['PUT','/cakes/1'],['PATCH','/cakes/1/stock'],['DELETE','/cakes/1'],['DELETE','/orders/1'],['PATCH','/orders/1/status']])await probe('anonymous denied '+method+' '+path,path,401,{method});
 await probe('forged cookie denied','/orders',401,{headers:{cookie:'__Host-delicias_admin=forged.token'}});
 await probe('wrong origin denied','/cakes/1',403,{method:'DELETE',headers:{cookie:adminCookie,origin:'https://foreign.invalid'}});
 await probe('missing origin denied','/cakes/1',403,{method:'DELETE',headers:{cookie:adminCookie}});
 await probe('admin orders allowed','/orders',200,{headers:{cookie:adminCookie}});
 await probe('login cross-origin denied','/auth/login',403,json({username:'Admin',password:'fixture-password'},false,'https://foreign.invalid'));
 const login=await probe('backend login succeeds','/auth/login',200,json({username:'Admin',password:'fixture-password'},false));
 const cookie=login.r.headers.get('set-cookie')||'';
 if(['HttpOnly','SameSite=Strict','Secure','__Host-'].every(p=>cookie.includes(p))){passed++;}else findings.push({name:'secure cookie attributes'});
 await probe('malformed cookie handled safely','/auth/session',200,{headers:{cookie:'__Host-delicias_admin=%ZZ'}});
 await probe('inactive cake hidden','/cakes/2',404);
 await probe('inactive cake image hidden','/cakes/2/image',404);
 await probe('strict numeric IDs','/cakes/1abc',400);
 await probe('negative price rejected at API','/cakes/1',400,{...json({price:-1}),method:'PUT'});
 await probe('non-finite price rejected at API','/cakes/1',400,{...json({price:'Infinity'}),method:'PUT'});
 await probe('negative quantity rejected at API','/cakes/1/stock',400,{...json({new_stock:-1}),method:'PATCH'});
 await probe('cart token required','/cart/reservation',400);
 const cartRead=await probe('cart snapshot is private/no-store','/cart/reservation',200,{headers:{'X-Cart-Token':'t'.repeat(43)}});
 assert.equal(cartRead.r.headers.get('cache-control'),'no-store');
 await probe('cart origin required','/cart/reservation',403,json({items:[],version:0},false,'https://foreign.invalid'));
 await probe('cart version required','/cart/reservation',400,json({items:[]},false));
 await probe('cart renewal must belong to items','/cart/reservation',400,json({items:[],version:0,renew_ids:[1]},false));
 await probe('valid cart update','/cart/reservation',200,json({items:[{cake_id:1,quantity:1}],version:0},false));
 const cartCall=rpcCalls.find(call=>call.op==='cart_set');
 assert.match(cartCall.data.token_hash,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(cartCall.data).includes('t'.repeat(43)),false);
 cartFailure=409;await probe('cart CAS conflict preserved','/cart/reservation',409,json({items:[],version:0},false));
 cartFailure=429;await probe('cart rate limit preserved','/cart/reservation',429,json({items:[],version:0},false));cartFailure=0;
 stockConflict=true;
 await probe('reserved inventory adjustment conflicts','/cakes/1/stock',409,{...json({new_stock:0}),method:'PATCH'});
 await probe('reserved inventory edit conflicts','/cakes/1',409,{...json({stock_quantity:0}),method:'PUT'});stockConflict=false;
 const payload={reservation_version:0,customer_name:'Fixture',customer_phone:'27999990000',delivery_block:'A',delivery_apartment:'1',payment_method:'pix',items:[{cake_id:1,quantity:-5}]};
 await probe('invalid order quantity rejected','/orders',400,json(payload,false));
 await probe('null order item rejected','/orders',400,json({...payload,items:[null]},false));
 await probe('boolean string rejected','/cakes/1',400,{...json({is_active:'false'}),method:'PUT'});
 await probe('blank name rejected','/cakes/1',400,{...json({name:' '}),method:'PUT'});
 await probe('fractional quantity rejected','/orders',400,json({...payload,items:[{cake_id:1,quantity:1.5}]},false));
 await probe('missing idempotency key rejected','/orders',400,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,items:[{cake_id:1,quantity:1}]})});
 const validPayload={...payload,items:[{cake_id:1,quantity:1}]};
 const missingToken=json(validPayload,false);delete (missingToken.headers as Record<string,string>)['X-Cart-Token'];
 await probe('order cart token required','/orders',400,missingToken);
 await probe('order reservation version required','/orders',400,json({...validPayload,reservation_version:null},false));
 telemetryFailure=true;
 await probe('committed order survives telemetry failure','/orders',201,json({...payload,items:[{cake_id:1,quantity:1}]},false));
 const auditCalls=rpcCalls.filter(call=>call.op==='telegram').length;
 replayed=true;
 await probe('idempotent replay returns existing order','/orders',200,json({...payload,items:[{cake_id:1,quantity:1}]},false));
 assert.equal(rpcCalls.filter(call=>call.op==='telegram').length,auditCalls);
 replayed=false;orderFailure=409;
 await probe('reused key conflict preserved','/orders',409,json({...payload,items:[{cake_id:1,quantity:1}]},false));
 orderFailure=429;
 await probe('order rate limit status preserved','/orders',429,json({...payload,items:[{cake_id:1,quantity:1}]},false));
 const hashAcceptsMalformed=verifyPasswordHash('anything','scrypt$fixture$zz');
 if(hashAcceptsMalformed)findings.push({name:'malformed scrypt hex accepts arbitrary password',conditional:'requires malformed hash stored in database'});else passed++;
 let cookieThrows=false;try{readCookie('delicias_admin=%ZZ','delicias_admin');}catch{cookieThrows=true;}
 assert.equal(cookieThrows,false);
 assert.equal(findings.length,0,JSON.stringify(findings));
 assert.ok(passed >= 26);
}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));globalThis.fetch=nativeFetch;}

});
