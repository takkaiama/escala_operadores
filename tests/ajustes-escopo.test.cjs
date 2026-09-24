const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Exercita as próprias funções do servidor em um contexto isolado, sem Neon.
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const between = (a,b) => {
  const ini=source.indexOf(a), fim=source.indexOf(b,ini);
  assert.ok(ini>=0&&fim>ini, `Trecho ${a} não encontrado`);
  return source.slice(ini,fim);
};
const code = [
  between('const DAY_MS = ', '\nlet initPromise = '),
  between('function gerarCiclosBase(', '\nfunction marcarCiclo('),
  between('function conflitoCronologico(', '\nasync function gravarLogAjuste('),
  'globalThis.rotinas = {gerarCiclosBase,conflitoCronologico,parseISO,fmtISO,addDays};'
].join('\n');
const context = {Date,Map,Math,Set};
vm.runInNewContext(code,context);
const {gerarCiclosBase:gerar,conflitoCronologico:conflito,parseISO} = context.rotinas;
const emp={id:1,anchor_saida:'2026-08-25',regime_trabalho:24,regime_folga:6};
const make=(base,nova,escopo='UNICO')=>({base_saida:base,base_retorno:new Date(Date.parse(base+'T00:00:00Z')+6*864e5).toISOString().slice(0,10),nova_saida:nova,novo_retorno:new Date(Date.parse(nova+'T00:00:00Z')+6*864e5).toISOString().slice(0,10),escopo,observacao:''});
const cycles=(rows,start='2026-08-01',end='2027-02-01')=>gerar(emp,parseISO(start),parseISO(end),new Map(rows.map(a=>[a.base_saida,a])));
const by=(rows,base,start,end)=>cycles(rows,start,end).find(c=>c.base_saida===base);

test('ajuste antigo sem escopo continua restrito a um único ciclo',()=>{
  const a=make('2026-08-25','2026-08-18');delete a.escopo;
  assert.equal(by([a],'2026-08-25').nova_saida,'2026-08-18');
  assert.equal(by([a],'2026-09-24').nova_saida,'2026-09-24');
  assert.equal(conflito(emp,[a],'2026-08-25'),null);
});

test('recorrência mantém ritmo e funciona ao mudar de mês e ano',()=>{
  const a=make('2026-08-25','2026-08-18','SEGUINTES');
  assert.equal(by([a],'2026-08-25').nova_saida,'2026-08-18');
  assert.equal(by([a],'2026-09-24','2026-09-01','2026-09-30').nova_saida,'2026-09-17');
  assert.equal(by([a],'2026-10-24','2026-10-01','2026-10-31').nova_saida,'2026-10-17');
  assert.equal(by([a],'2027-01-22','2027-01-01','2027-01-31').nova_saida,'2027-01-15');
  assert.equal(by([a],'2026-09-24').serie_inicio_propria,'2026-08-25');
  assert.equal(conflito(emp,[a],'2026-08-25'),null);
});

test('exceção pontual durante série não altera meses seguintes',()=>{
  const a=make('2026-08-25','2026-08-18','SEGUINTES');
  const b=make('2026-09-24','2026-09-20','UNICO');
  assert.equal(by([a,b],'2026-09-24').nova_saida,'2026-09-20');
  assert.equal(by([a,b],'2026-10-24').nova_saida,'2026-10-17');
  assert.equal(conflito(emp,[a,b],'2026-09-24'),null);
});

test('nova regra recorrente substitui a anterior somente a partir do novo ciclo',()=>{
  const a=make('2026-08-25','2026-08-18','SEGUINTES');
  const b=make('2026-09-24','2026-09-20','SEGUINTES');
  assert.equal(by([a,b],'2026-08-25').nova_saida,'2026-08-18');
  assert.equal(by([a,b],'2026-09-24').nova_saida,'2026-09-20');
  assert.equal(by([a,b],'2026-10-24').nova_saida,'2026-10-20');
  assert.equal(conflito(emp,[a,b],'2026-09-24'),null);
});

test('validação rejeita cruzamentos com ciclo anterior ou seguinte',()=>{
  const a=make('2026-08-25','2026-07-28','UNICO');
  assert.match(conflito(emp,[a],'2026-08-25'),/retorno.*ciclo seguinte/i);
  const b=make('2026-08-25','2026-09-20','UNICO');
  assert.match(conflito(emp,[b],'2026-08-25'),/retorno.*ciclo seguinte/i);
});

test('retirar a série devolve os ciclos futuros ao original sem apagar exceções',()=>{
  const b=make('2026-09-24','2026-09-20','UNICO');
  assert.equal(by([b],'2026-09-24').nova_saida,'2026-09-20');
  assert.equal(by([b],'2026-10-24').nova_saida,'2026-10-24');
});
