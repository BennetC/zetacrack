import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {builtins, answerMatches, parseDecimal, validateConfig, QuestionGenerator, type Config} from '../../../web/src/domain';
const allowed=[9,10,11,12,13,32,160,5760,...Array.from({length:11},(_,i)=>8192+i),8232,8233,8239,8287,12288,65279];
const rejected=[0,28,29,30,31,133,6158,8203,8288,1633,65297];
const fixtures=[];
for(const cp of allowed){
 const w=String.fromCodePoint(cp), config=structuredClone(builtins()[0].config);
 const op=config.operations[0],group=op.groups[0];
 op.share=w+'100'+w;group.share=w+'100'+w;
 group.first={min:w+'+0010.000'+w,max:w+'+0010.000'+w,decimalPlaces:0};
 group.second={min:w+'11'+w,max:w+'11'+w,decimalPlaces:0};
 assert.deepEqual(validateConfig(config),{});
 const q=new QuestionGenerator(config,'grammar-'+cp).next();
 const input=w+'+0021.000'+w;
 assert(answerMatches(input,q.expected));
 q.left=w+q.left+w;q.right=w+q.right+w;q.expected=w+q.expected+w;
 fixtures.push({cp,config,q,input});
}
for(const cp of rejected){
 const w=String.fromCodePoint(cp);
 assert(!answerMatches(w+'102'+w,'102'));
 assert.throws(()=>parseDecimal(w+'102'+w));
 const config=structuredClone(builtins()[0].config);
 config.operations[0].groups[0].first.min=w+'10'+w;
 assert(Object.keys(validateConfig(config)).length>0);
}
for(const input of ['1e2','1_02','1,02','١٠٢','１０２','102 x','10 2','++102','--102','NaN','Infinity','102\u0000']) assert(!answerMatches(input,'102'));
const config=structuredClone(builtins()[0].config), op=config.operations[0];op.id='multiplication';
op.groups[0].first={min:'9'.repeat(300)+'.125',max:'9'.repeat(300)+'.125',decimalPlaces:3};
op.groups[0].second={min:'-.125',max:'-.125',decimalPlaces:3};
assert.deepEqual(validateConfig(config),{});
const q=new QuestionGenerator(config,'huge-grammar').next(),input='\ufeff'+q.expected+'\ufeff';
assert(answerMatches(input,q.expected));
fixtures.push({cp:'huge',config,q,input});
writeFileSync(new URL('./grammar-fixtures.json',import.meta.url),JSON.stringify({synthetic:true,allowed,rejected,fixtures},null,2));
console.log(JSON.stringify({allowed:allowed.length,rejected:rejected.length,hugeProductDigits:q.expected.length,fixtures:fixtures.length}));
