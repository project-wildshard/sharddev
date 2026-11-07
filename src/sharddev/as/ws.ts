/** The single ABI-v1 AssemblyScript transport source, injected as sdk/as/ws.ts by the author compiler.
 * It is a source string so guest globals never enter the host TypeScript program. No service is installed.
 * Transport helpers inline before structural metering; capability, IO and bounds checks remain intact. */
export const WS_CORE: string = String.raw`
@external("env", "ws_read") declare function scalar(op:i32,a:f64,b:f64):f64;
@external("env", "ws_list") declare function query(op:i32,a:f64,b:f64,out:usize,cap:i32):i32;
const IO:usize=memory.data(2496,8), LIST:usize=memory.data(768,8);
let states:i32=0,params:i32=0,commands:i32=0,current:i32=0,listCount:i32=0;
@inline export function init(s:i32,p:i32):void {
  assert(s>=0&&s<=16&&p>=0&&p<=32);states=s;params=p;
  store<f64>(IO+40,0);store<f64>(IO+48,0);store<f64>(IO+56,0);
}
@inline export function io():i32{return i32(IO);}
@inline export function begin():void{commands=0;current=0;listCount=0;}
@inline export function finish():i32{return commands;}
@inline export function header(index:i32):f64{assert(index>=0&&index<5);return load<f64>(IO+usize(index)*8);}
@inline export function state(index:i32):f64{assert(index>=0&&index<states);return load<f64>(IO+64+usize(index)*8);}
@inline export function setState(index:i32,value:f64):void{assert(index>=0&&index<states);store<f64>(IO+64+usize(index)*8,value);}
@inline export function parameter(index:i32):f64{assert(index>=0&&index<params);return load<f64>(IO+usize(8+states+index)*8);}
@inline export function events():i32{const n=i32(header(4));assert(n>=0&&n<=16);return n;}
@inline export function selectEvent(index:i32):void{assert(index>=0&&index<events());current=index;}
@inline export function event(field:i32):f64{assert(field>=0&&field<6);return load<f64>(IO+usize(8+states+params+current*6+field)*8);}
@inline export function command(op:i32,target:i32,a:f64=0,b:f64=0,c:f64=0):void{
  assert(commands<32);const out=IO+usize(8+states+params+96+commands*5)*8;
  store<f64>(out,f64(op));store<f64>(out+8,f64(target));store<f64>(out+16,a);store<f64>(out+24,b);store<f64>(out+32,c);commands++;
}
@inline export function read(op:i32,a:f64=0,b:f64=0):f64{return scalar(op,a,b);}
@inline export function list(op:i32,a:f64=0,b:f64=0):i32{listCount=query(op,a,b,LIST,96);assert(listCount>=0&&listCount<=96);return listCount;}
@inline export function listAt(index:i32):f64{assert(index>=0&&index<listCount);return load<f64>(LIST+usize(index)*8);}
`;
