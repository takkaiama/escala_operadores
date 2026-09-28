const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function between(a,b){const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start);return source.slice(start,end)}
const code=[
  between('const DAY_MS = ','\nlet initPromise = '),
  between('function gerarCiclosBase(', '\nfunction marcarCiclo('),
  between('function capturarEstadoEfetivo(', '\napp.post(\'/api/v5/ajustes\''),
  'globalThis.auditoria={prepararAuditoriaAjuste,gravarLogAjuste,capturarEstadoEfetivo};'
].join('\n');
const ctx={Date,Map,Set,Math,JSON,Number,String};vm.runInNewContext(code,ctx);
const {prepararAuditoriaAjuste:capturar,gravarLogAjuste:gravar}=ctx.auditoria;
const emp={id:51,nome:'PEDRO HENRIQUE',funcao:'PICADOR',anchor_saida:'2026-08-25',regime_trabalho:24,regime_folga:6};
function make(base,saida,escopo='UNICO'){
 const add=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
 return {id:7,base_saida:base,base_retorno:add(base,6),nova_saida:saida,novo_retorno:add(saida,6),escopo,observacao:''};
}
test('novo ajuste registra o ciclo original efetivo como ANTES mesmo sem registro no banco',()=>{
 const logs=capturar(emp,[],[make('2026-08-25','2026-08-18')],'2026-08-25','UNICO');
 assert.equal(logs.antes.saida,'2026-08-25');assert.equal(logs.antes.retorno,'2026-08-31');
 assert.equal(logs.depois.saida,'2026-08-18');assert.equal(logs.depois.retorno,'2026-08-24');
 assert.equal(logs.antes.colaborador,'PEDRO HENRIQUE');
 assert.equal(logs.detalhes.ciclos_alterados.length,1);
});
test('série recorrente registra impactos mensais e prévia finita, incluindo travessia de ano',()=>{
 const logs=capturar(emp,[],[make('2026-08-25','2026-08-18','SEGUINTES')],'2026-08-25','SEGUINTES');
 assert.equal(logs.detalhes.ciclos_alterados.length,13);
 const sep=logs.detalhes.ciclos_alterados.find(x=>x.base_saida==='2026-09-24');
 assert.equal(sep.antes.saida,'2026-09-24');assert.equal(sep.depois.saida,'2026-09-17');
 const jan=logs.detalhes.ciclos_alterados.find(x=>x.base_saida==='2027-01-22');
 assert.equal(jan.depois.saida,'2027-01-15');
 assert.equal(logs.detalhes.previa_nao_representa_toda_a_recorrencia,true);
});
test('ajuste pontual herdado registra o ANTES vigente e preserva futuros da série',()=>{
 const antes=[make('2026-08-25','2026-08-18','SEGUINTES')];
 const depois=[...antes,make('2026-09-24','2026-09-20')];
 const logs=capturar(emp,antes,depois,'2026-09-24','UNICO');
 assert.equal(logs.antes.saida,'2026-09-17');assert.equal(logs.antes.origem,'HERDADO');
 assert.equal(logs.depois.saida,'2026-09-20');assert.equal(logs.depois.origem,'UNICO');
 assert.equal(logs.detalhes.ciclos_alterados.length,1);
});
test('reversão guarda a programação vigente no ANTES e a restaurada no DEPOIS',()=>{
 const antes=[make('2026-08-25','2026-08-18','SEGUINTES')];
 const logs=capturar(emp,antes,[],'2026-08-25','REVERTER');
 assert.equal(logs.antes.saida,'2026-08-18');assert.equal(logs.depois.saida,'2026-08-25');
 assert.equal(logs.detalhes.ciclos_alterados.length,13);
});
test('marco recorrente posterior encerra o impacto observado da série anterior',()=>{
 const seguinte=make('2026-10-24','2026-10-20','SEGUINTES');
 const logs=capturar(emp,[seguinte],[make('2026-08-25','2026-08-18','SEGUINTES'),seguinte],'2026-08-25','SEGUINTES');
 assert.equal(logs.detalhes.ciclos_alterados.length,2);
 assert.equal(logs.detalhes.ciclos_alterados.some(x=>x.base_saida==='2026-10-24'),false);
});
test('log de ajuste é persistido na mesma conexão e contém ANTES e DEPOIS efetivos',async()=>{
 const calls=[];const client={query:async(sql,params)=>{calls.push({sql,params});return {rows:[]}}};
 await gravar(client,{auth:{id:1,username:'admin.biotec',nome:'Admin'}},emp,'AJUSTAR_CICLO',null,make('2026-08-25','2026-08-18'),'2026-08-25',[],[make('2026-08-25','2026-08-18')]);
 assert.equal(calls.length,2);assert.match(calls[0].sql,/historico_v5/);assert.match(calls[1].sql,/auditoria_escala_v5/);
 const old=JSON.parse(calls[1].params[5]),next=JSON.parse(calls[1].params[6]);
 assert.equal(old.saida,'2026-08-25');assert.equal(next.saida,'2026-08-18');
 assert.equal(calls[1].params[1],'admin.biotec');
});
