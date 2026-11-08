import { writeFileSync } from 'node:fs';
import { subtractionDomain, decimalText, type NumberRange, SeededRandom } from '../../../web/src/domain.ts';
let state=143828;
const next=(n:number)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return (state>>>8)%n;};
const text=(n:number,p:number)=>decimalText({coefficient:BigInt(n),scale:p},true);
let pairs=0;
for(let k=0;k<15000;k++){
 const pa=next(4),pb=next(4),a=next(161)-80,b=next(161)-80,na=next(9)+1,nb=next(9)+1;
 const first:NumberRange={min:text(a,pa),max:text(a+na-1,pa),decimalPlaces:pa};
 const second:NumberRange={min:text(b,pb),max:text(b+nb-1,pb),decimalPlaces:pb};
 const expected:string[]=[];
 for(let ia=a;ia<a+na;ia++)for(let ib=b;ib<b+nb;ib++)if(ia*10**pb>=ib*10**pa)expected.push(text(ia,pa)+','+text(ib,pb));
 const domain=subtractionDomain(first,second);
 if(domain.count!==BigInt(expected.length))throw Error('Count mismatch '+JSON.stringify({first,second}));
 for(let i=0;i<expected.length;i++){
   const actual=domain.unrank(BigInt(i)).map(x=>decimalText(x,true)).join(',');
   if(actual!==expected[i])throw Error('Rank mismatch '+JSON.stringify({first,second,i,expected:expected[i],actual}));
   pairs++;
 }
}
const report={synthetic:true,randomizedSignedMixedPrecisionDomains:15000,orderedPairsEnumerated:pairs,precisions:[0,1,2,3],result:'passed'};
writeFileSync('docs/reviews/evidence-2026-10-14-correctness/domain-probes.json',JSON.stringify(report,null,2));
console.log(report);


