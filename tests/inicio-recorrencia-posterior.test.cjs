const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const server=fs.readFileSync(path.join(root,'app.js'),'utf8');
const client=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const cut=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i); assert.ok(i>=0&&j>i,`${a} ausente`);return s.slice(i,j)};
const code=[cut(server,'const DAY_MS = ','\nlet initPromise = '),cut(server,'function gerarCiclosBase(','\nfunction marcarCiclo('),cut(server,'function conflitoCronologico(','\nasync function gravarLogAjuste('),cut(client,'function resolverCicloPosterior(','function fillAdjustmentCycle('),
'function daysBetween(a,b){return Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/86400000)}',
'globalThis.fix={gerarCiclosBase,conflitoCronologico,resolverCicloPosterior,parseISO,fmtISO,addDays}'].join('\n');
const ctx={Date,Map,Math,Set};vm.runInNewContext(code,ctx);
const {gerarCiclosBase:gerar,conflitoCronologico:conflito,resolverCicloPosterior:resolver,parseISO}=ctx.fix;
const emp={id:51,anchor_saida:'2026-08-20',regime_trabalho:23,regime_folga:7};
const row=(base,nova,escopo='SEGUINTES')=>({base_saida:base,base_retorno:new Date(Date.parse(base+'T00:00:00Z')+7*86400000).toISOString().slice(0,10),nova_saida:nova,novo_retorno:new Date(Date.parse(nova+'T00:00:00Z')+7*86400000).toISOString().slice(0,10),escopo,observacao:''});
const cycles=(rows=[])=>gerar(emp,parseISO('2026-08-01'),parseISO('2026-11-30'),new Map(rows.map(a=>[a.base_saida,a])));
const get=(rows,base)=>cycles(rows).find(c=>c.base_saida===base);
test('nova saída 22/09 com agosto selecionado inicia no ciclo 19/09, não em agosto',()=>{
 const before=cycles();const original=before.find(c=>c.base_saida==='2026-08-20');
 const chosen=resolver({...emp,cycles:before},original,'2026-09-22');
 assert.equal(chosen.ciclo.base_saida,'2026-09-19');assert.equal(chosen.delta,3);
 const rows=[row(chosen.ciclo.base_saida,'2026-09-22')];
 assert.equal(get(rows,'2026-08-20').nova_saida,'2026-08-20');
 assert.equal(get(rows,'2026-08-20').novo_retorno,'2026-08-27');
 assert.equal(get(rows,'2026-09-19').nova_saida,'2026-09-22');
 assert.equal(get(rows,'2026-09-19').novo_retorno,'2026-09-29');
 assert.equal(get(rows,'2026-10-19').nova_saida,'2026-10-22');
 assert.equal(conflito(emp,rows,'2026-09-19'),null);
});
test('recorrência antiga em agosto permanece, série nova começa em setembro',()=>{
 const prev=[row('2026-08-20','2026-08-22')];
 const chosen=resolver({...emp,cycles:cycles(prev)},get(prev,'2026-08-20'),'2026-09-22');
 assert.equal(chosen.ciclo.base_saida,'2026-09-19');
 const rows=[...prev,row('2026-09-19','2026-09-22')];
 assert.equal(get(rows,'2026-08-20').nova_saida,'2026-08-22');
 assert.equal(get(rows,'2026-08-20').novo_retorno,'2026-08-29');
 assert.equal(get(rows,'2026-09-19').novo_retorno,'2026-09-29');
 assert.equal(conflito(emp,rows,'2026-09-19'),null);
});
test('deslocamentos normais não alteram silenciosamente o ciclo selecionado',()=>{
 const orig=get([],'2026-08-20');assert.equal(resolver({...emp,cycles:cycles()},orig,'2026-08-22'),null);
});
test('data futura sem ciclo carregado não é remapeada automaticamente',()=>{
 const orig=get([],'2026-08-20');assert.equal(resolver({...emp,cycles:[orig]},orig,'2026-09-22'),null);
});
test('validação do servidor mantém barreira contra sobreposição real de folgas',()=>{
 const rows=[row('2026-08-20','2026-09-15','UNICO')];
 assert.match(conflito(emp,rows,'2026-08-20'),/retorno.*ciclo seguinte/i);
});
test('formulário envia base setembro mantendo datas escolhidas e agosto intacto',async()=>{
 const originals=cycles();const selected=originals.find(x=>x.base_saida==='2026-08-20');
 const fields={ajusteCiclo:{value:String(originals.indexOf(selected))},originalSaida:{textContent:''},originalRetorno:{textContent:''},novaSaida:{value:'2026-09-22'},novoRetorno:{value:'2026-09-29'},ajusteObs:{value:'Programação a partir de setembro'}};
 const calls=[],checks=[];
 const browser={
   state:{selectedEmployee:{...emp,cycles:originals}},
   el:id=>fields[id],
   selectedCycle:()=>selected,
   ajusteEscopoSelecionado:()=> 'SEGUINTES',
   resolverCicloPosterior:resolver,
   daysBetween:(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000),
   fmtBR:iso=>iso,
   confirm:msg=>{checks.push(msg);return true},toast:()=>{},
   guarded:async(_k,fn)=>fn(),request:async(_url,opts)=>{calls.push(JSON.parse(opts.body));return {ok:true}},
   API:'/api/v5',updateImpact:()=>{},closeModal:()=>{},carregar:async()=>{},
 };
 vm.runInNewContext(cut(client,'async function saveAdjustment()','async function revertAdjustment()')+'\nglobalThis.salvar=saveAdjustment;',browser);
 await browser.salvar();
 assert.equal(checks.length,1);assert.match(checks[0],/19.09.2026|2026-09-19/);
 assert.equal(calls.length,1);
 assert.equal(calls[0].base_saida,'2026-09-19');
 assert.equal(calls[0].nova_saida,'2026-09-22');assert.equal(calls[0].novo_retorno,'2026-09-29');
 assert.equal(fields.ajusteCiclo.value,String(originals.findIndex(x=>x.base_saida==='2026-09-19')));
 assert.equal(fields.novaSaida.value,'2026-09-22');
});
