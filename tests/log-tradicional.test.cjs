const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {getView,extraCsv}=require('../public/audit-view.js');
const root=path.join(__dirname,'..');
const info=(acao,antes,depois,detalhes={})=>({acao,autor_usuario:'admin.biotec',entidade:'COLABORADOR',entidade_id:'51',criado_em:'2026-09-24T18:00:00.000Z',antes,depois,detalhes});
test('editar colaborador apresenta apenas campos modificados em portugues, nunca JSON',()=>{
 const a={id:'6',nome:'JAIME',ativo:1,categoria:'MOTORISTA',anchor_saida:'2026-08-24',atualizado_em:'2026-09-24T00:00:00Z',senha_hash:'segredo'};
 const d={...a,anchor_saida:'2026-09-25',atualizado_em:'2026-09-25T00:00:00Z'};
 const r=getView(info('ALTERAR_CADASTRO',a,d));
 assert.equal(r.title,'Cadastro de colaborador alterado');
 assert.deepEqual(r.rows,[{label:'Data-base de saída',before:'24/08/2026',after:'25/09/2026'}]);
 assert.equal(r.subject,'JAIME');
});
test('criar colaborador mostra campos sem identificadores tecnicos e vazio nao vira linha',()=>{
 const r=getView(info('CADASTRO',null,{id:'51',nome:'PEDRO',funcao:'PICADOR',subtipo:'',regime_trabalho:24,regime_folga:6,senha_hash:'oculto',criado_em:'2026-09-24'}));
 assert.ok(r.rows.some(x=>x.label==='Regime' || x.label==='Dias de trabalho'));
 assert.equal(r.rows.some(x=>['id','senha_hash','Criado em','Tipo de colaborador'].includes(x.label)),false);
});
test('ajuste registra antes e depois das datas efetivas e abrangencia',()=>{
 const a={formato:'CICLO_EFETIVO_V1',colaborador:'PEDRO',base_saida:'2026-08-25',base_retorno:'2026-08-31',saida:'2026-08-25',retorno:'2026-08-31',origem:'ORIGINAL'};
 const d={...a,saida:'2026-08-18',retorno:'2026-08-24',origem:'SEGUINTES'};
 const r=getView(info('AJUSTAR_CICLO',a,d,{escopo_solicitado:'SEGUINTES'}));
 assert.match(r.intro,/Este ciclo e todos os seguintes/);
 assert.deepEqual(r.rows[0],{label:'Saída de folga',before:'25/08/2026',after:'18/08/2026'});
 assert.deepEqual(r.rows[1],{label:'Retorno da folga',before:'31/08/2026',after:'24/08/2026'});
});
test('eventos antigos sem antes nao recebem estados inventados',()=>{
 const r=getView(info('AJUSTAR_CICLO',null,{base_saida:'2026-08-25',nova_saida:'2026-08-18'}));
 assert.deepEqual(r.rows,[]);assert.match(r.note,/não contém a programação efetiva anterior/);
});
test('login e backup geram texto comum',()=>{
 const l=getView({...info('LOGIN',null,{username:'admin.biotec',role:'ADMIN'}),entidade:'ACESSO'});
 assert.match(l.intro,/entrou no sistema/);assert.deepEqual(l.rows,[]);
 const b=getView({...info('CRIAR_BACKUP',null,{titulo:'Escala Base',tipo:'ATUAL',sha256:'segredo'}),entidade:'BACKUP',entidade_id:'1'});
 assert.match(b.intro,/Escala Base/);assert.equal(b.rows[0].after,'Escala atual');assert.equal(b.rows.some(r=>r.label==='sha256'),false);
});
test('alterar ferias filtra campos iguais e formato de data e exportacao texto simples',()=>{
 const a={id:10,colaborador_id:51,inicio:'2026-10-01',fim:'2026-10-15',observacao:'A'};
 const d={...a,fim:'2026-10-20'};const event=info('ALTERAR_FERIAS',a,d);
 const r=getView(event);assert.deepEqual(r.rows,[{label:'Fim das férias',before:'15/10/2026',after:'20/10/2026'}]);
 const csv=extraCsv(event);assert.match(csv.before,/15\/10\/2026/);assert.doesNotMatch(csv.after,/\{|\"fim\"/);
});
test('alterar usuario protege senha e exibe mudanca de perfil',()=>{
 const r=getView({...info('EDITAR_USUARIO_E_SENHA',{username:'joao',nome:'Joao',role:'USUARIO'},{username:'joao',nome:'Joao',role:'ADMIN'}),entidade:'USUARIO',detalhes:{senha_alterada:true}});
 assert.ok(r.rows.some(x=>x.label==='Perfil'&&x.before==='Usuário'&&x.after==='Administrador'));
 assert.ok(r.rows.some(x=>x.label==='Senha de acesso'&&x.after.includes('Redefinida')));
});
test('tela carrega formatador antes do app e nao monta caixas JSON de auditoria',()=>{
 const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');const js=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
 assert.ok(html.indexOf('audit-view.js?v=5.8.0')<html.indexOf('app.js?v=5.8.1'));
 assert.ok(js.includes('desenharResumoAuditoria(card,item)'));
 assert.ok(!js.includes('pre.textContent=value==null'));
 assert.ok(!js.includes('JSON.stringify(r.antes)'));
});
