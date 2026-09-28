/* Apresentacao em linguagem comum dos dados de auditoria. Nenhum dado e gravado aqui. */
(function(root){
'use strict';
const titles={LOGIN:'Entrada no sistema',LOGIN_RECUSADO:'Tentativa de acesso recusada',CRIAR_BACKUP:'Backup da escala criado',CRIAR_USUARIO:'Usuário cadastrado',EDITAR_USUARIO:'Acesso de usuário alterado',EDITAR_USUARIO_E_SENHA:'Acesso e senha de usuário alterados',CADASTRO:'Colaborador cadastrado',REATIVAR:'Colaborador reativado',ALTERAR_CADASTRO:'Cadastro de colaborador alterado',DESATIVAR:'Colaborador desativado',FERIAS:'Férias cadastradas',ALTERAR_FERIAS:'Férias alteradas',REMOVER_FERIAS:'Férias removidas',AJUSTAR_CICLO:'Ciclo de folga ajustado',REVERTER_AJUSTE:'Ajuste de ciclo revertido'};
const fields=[
 ['nome','Nome'],['username','Usuário'],['role','Perfil'],['ativo','Situação'],
 ['categoria','Categoria'],['funcao','Função'],['subtipo','Tipo de colaborador'],
 ['regime_trabalho','Dias de trabalho'],['regime_folga','Dias de folga'],['anchor_saida','Data-base de saída'],
 ['saida','Saída de folga'],['retorno','Retorno da folga'],['inicio','Início das férias'],['fim','Fim das férias'],
 ['tipo','Tipo'],['base_saida','Saída originalmente prevista'],['base_retorno','Retorno originalmente previsto'],
 ['nova_saida','Nova saída'],['novo_retorno','Novo retorno'],['escopo','Abrangência'],['origem','Regra aplicada'],
 ['serie_inicio','Início da recorrência'],['observacao','Observação'],['titulo','Nome do backup']
];
const aliases={ADMIN:'Administrador',USUARIO:'Usuário',OPERADOR:'Operador',MOTORISTA:'Motorista',UNICO:'Somente este ciclo',SEGUINTES:'Este ciclo e todos os seguintes',ORIGINAL:'Programação original',HERDADO:'Herdado de ajuste recorrente',REVERTER:'Reversão',BASE_CODIGO:'Base histórica disponível',ATUAL:'Escala atual',FERIAS:'Férias'};
function dateBR(value){if(typeof value!=='string')return value;if(/^\d{4}-\d{2}-\d{2}$/.test(value)){const [y,m,d]=value.split('-');return `${d}/${m}/${y}`;}return value;}
function show(field,value){
 if(value==null||value==='')return '—';
 if(field==='ativo')return value===true||Number(value)===1?'Ativo':'Inativo';
 if(field==='role'||field==='categoria'||field==='escopo'||field==='origem'||field==='tipo')return aliases[String(value)]||String(value);
 if(['regime_trabalho','regime_folga'].includes(field))return `${value} dias`;
 return String(dateBR(value));
}
function row(label,before,after){return {label,before,after};}
function target(item){
 const a=item.antes||{},d=item.depois||{};
 if(item.entidade==='BACKUP')return d.titulo||`Backup nº ${item.entidade_id||'—'}`;
 if(item.entidade==='ACESSO')return item.autor_usuario||'Usuário não identificado';
 if(item.entidade==='USUARIO')return d.nome||a.nome||d.username||a.username||`Usuário nº ${item.entidade_id||'—'}`;
 return d.colaborador||a.colaborador||d.nome||a.nome||item.colaborador_nome||`Colaborador nº ${item.entidade_id||'—'}`;
}
function cycleView(item){
 const a=item.antes,d=item.depois,details=item.detalhes||{};
 if(!a||!d)return null;
 if(a.formato!=='CICLO_EFETIVO_V1'||d.formato!=='CICLO_EFETIVO_V1')return null;
 const rows=[];
 for(const [key,label] of [['saida','Saída de folga'],['retorno','Retorno da folga'],['origem','Regra aplicada'],['serie_inicio','Início da recorrência'],['observacao','Observação']]){
  const oldValue=show(key,a[key]),newValue=show(key,d[key]);
  if(oldValue!==newValue)rows.push(row(label,oldValue,newValue));
 }
 const escopo=show('escopo',details.escopo_solicitado||d.origem);
 return {title:titles[item.acao]||'Alteração de ciclo',subject:target(item),intro:`Ciclo previsto: ${dateBR(a.base_saida)} a ${dateBR(a.base_retorno)}. Abrangência: ${escopo}.`,rows,note:rows.length?'':'A regra foi registrada sem alteração nas datas principais deste ciclo; confira a prévia dos ciclos afetados.'};
}
function getView(item){
 const a=item.antes,d=item.depois,action=item.acao||'';
 const base={title:titles[action]||'Atividade registrada',subject:target(item),intro:'',rows:[],note:''};
 if(action==='LOGIN'){base.intro=`${item.autor_usuario||'Usuário'} entrou no sistema.`;return base;}
 if(action==='LOGIN_RECUSADO'){base.intro=`Tentativa de entrada recusada para o usuário ${item.autor_usuario||'não informado'}.`;return base;}
 if(action==='CRIAR_BACKUP'){base.intro=`Foi criada uma cópia da escala: ${d?.titulo||'Sem título'}.`;base.rows=[row('Tipo de backup','—',show('tipo',d?.tipo))];return base;}
 const cycle=cycleView(item);if(cycle)return cycle;
 if(['AJUSTAR_CICLO','REVERTER_AJUSTE'].includes(action)&&(!a||!d)){
   base.note='Este registro antigo não contém a programação efetiva anterior e posterior. Não é possível reconstruí-la com segurança apenas com os dados gravados.';
   return base;
 }
 if(a==null&&d==null){base.note='Este evento não contém dados de comparação.';return base;}
 // Apenas campos operacionais e identificadores legíveis, sem ids, hashes, tokens ou metadados técnicos.
 const created=a==null,removed=d==null;
 for(const [key,label] of fields){
   if((a==null||!Object.prototype.hasOwnProperty.call(a,key))&&(d==null||!Object.prototype.hasOwnProperty.call(d,key)))continue;
   const oldValue=show(key,a?.[key]),newValue=show(key,d?.[key]);
   if(created&&newValue==='—')continue;
   if(removed&&oldValue==='—')continue;
   if(created||removed||oldValue!==newValue)base.rows.push(row(label,oldValue,newValue));
 }
 if(action==='EDITAR_USUARIO_E_SENHA'||item.detalhes?.senha_alterada)base.rows.push(row('Senha de acesso','Não exibida','Redefinida (valor protegido)'));
 if(created)base.intro='Registro criado com as informações abaixo.';
 else if(removed)base.intro='Registro removido. Os dados anteriores permanecem no histórico.';
 else base.intro='Somente os campos alterados são apresentados.';
 if(!base.rows.length)base.note='Não houve diferença nos campos operacionais disponíveis neste registro.';
 return base;
}
function extraCsv(item){const v=getView(item);return {summary:[v.title,v.subject,v.intro,v.note].filter(Boolean).join(' — '),before:v.rows.map(r=>`${r.label}: ${r.before}`).join(' | '),after:v.rows.map(r=>`${r.label}: ${r.after}`).join(' | ')};}
const api={getView,extraCsv,dateBR,show};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root)root.AuditView=api;
})(typeof window!=='undefined'?window:null);
