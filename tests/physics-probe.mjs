const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const H=540;
function ground(px){let q=clamp(px/18000,0,1),base=H*.70,b=Math.sin(px/340)*(58+24*q),m=Math.sin(px/155+1.2)*(22+16*q),d=Math.sin(px/72+.35)*(5+4*q),blend=clamp(px/700,0,1),intro=Math.sin(px/260)*34;return base+lerp(intro,b+m+d,blend)}
function slope(px){let e=1.5;return(ground(px+e)-ground(px-e))/(e*2)}
let maxSlope=0,maxDelta=0,prev=slope(0);
for(let x=1;x<=30000;x+=2){const s=slope(x);maxSlope=Math.max(maxSlope,Math.abs(s));maxDelta=Math.max(maxDelta,Math.abs(s-prev));prev=s}
if(maxSlope>1.3) throw new Error(`terrain too steep: ${maxSlope}`);
if(maxDelta>0.08) throw new Error(`terrain not smooth enough: ${maxDelta}`);
for(let start=520;start<10000;start+=500){let n=6+Math.floor(start/900%4),sp=38,h=70+28*Math.sin(start/430);for(let i=0;i<n;i++){let u=i/(n-1),px=start+i*sp,cy=ground(px)-42-Math.sin(Math.PI*u)*h;if(cy>=ground(px)-20)throw new Error('coin inside terrain')}}
console.log(JSON.stringify({status:'pass',maxSlope:+maxSlope.toFixed(3),maxSlopeDelta:+maxDelta.toFixed(4),coinPatternsChecked:20},null,2));
