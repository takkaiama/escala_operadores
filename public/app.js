const API = '/api/v5';
const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const statusLabel = { NORMAL:'Trabalho', SAIDA:'Saída / início da folga', FOLGA:'Folga', RETORNO:'Retorno', FERIAS:'Férias', SEM_ESCALA:'Sem escala definida' };
const statusSymbol = { NORMAL:'', SAIDA:'S', FOLGA:'', RETORNO:'R', FERIAS:'F', SEM_ESCALA:'·' };
let state = { categoria:'MOTORISTA', funcao:'', data:null, search:'', changedOnly:false, selectedEmployee:null, auth:null, authToken:localStorage.getItem('escala_auth_token')||'', backupId:null,backupName:'' };
function canEdit(){return ['ADMIN','USUARIO'].includes(state.auth?.role)}
function isAdmin(){return state.auth?.role==='ADMIN'}
const mutationLocks = new Set();

const el = id => document.getElementById(id);
const mesEl=el('mes'), anoEl=el('ano'), tabela=el('tabelaEscala'), alertas=el('alertas'), summary=el('summary');

async function init(){
  meses.forEach((m,i)=>{const o=document.createElement('option');o.value=i+1;o.textContent=m;mesEl.appendChild(o)});
  const now=new Date();mesEl.value=now.getMonth()+1;anoEl.value=now.getFullYear();
  bind();
  await restoreAuth();
  updateAuthUI();
  carregar();
}
function bind(){
  document.querySelectorAll('.main-tab').forEach(b=>b.addEventListener('click',()=>switchCategory(b.dataset.category)));
  document.querySelectorAll('.role-pill').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.role-pill').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.funcao=b.dataset.role;carregar()}));
  mesEl.addEventListener('change',carregar); anoEl.addEventListener('change',carregar);
  el('btnHoje').addEventListener('click',()=>{const n=new Date();mesEl.value=n.getMonth()+1;anoEl.value=n.getFullYear();carregar()});
  el('busca').addEventListener('input',e=>{state.search=normalize(e.target.value);render()});
  el('somenteAlterados').addEventListener('change',e=>{state.changedOnly=e.target.checked;render()});
  el('btnNovo').addEventListener('click',()=>openEmployeeModal()); el('btnImprimir').addEventListener('click',printSchedule); el('btnExcel').addEventListener('click',exportExcel); el('btnPdf').addEventListener('click',exportPdf); el('btnFerias').addEventListener('click',openVacationModal);
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
  document.querySelectorAll('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id)}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach(m=>closeModal(m.id))});
  document.querySelectorAll('input[name="ajusteEscopo"]').forEach(r=>r.addEventListener('change',updateImpact)); el('ajusteCiclo').addEventListener('change',fillAdjustmentCycle); el('novaSaida').addEventListener('change',onNewExitChanged); el('novoRetorno').addEventListener('change',updateImpact); el('moverRetorno').addEventListener('change',()=>{if(el('moverRetorno').checked)onNewExitChanged();else updateImpact()});
  el('btnSalvarAjuste').addEventListener('click',saveAdjustment); el('btnReverterAjuste').addEventListener('click',revertAdjustment);
  el('btnSalvarColab').addEventListener('click',saveEmployee); el('btnDesativarColab').addEventListener('click',deactivateEmployee);
  el('btnSalvarFerias').addEventListener('click',saveVacation); el('feriasColaborador').addEventListener('change',()=>{resetVacationForm(false);renderExistingVacations()}); el('btnCancelarEdicaoFerias').addEventListener('click',()=>resetVacationForm());
  el('btnAuditoria').addEventListener('click',abrirAuditoria); el('auditLimpar').addEventListener('click',limparAuditoria); el('auditCsv').addEventListener('click',baixarAuditoriaCSV); el('auditAnterior').addEventListener('click',()=>carregarAuditoria(Math.max(0,paginaAuditoria-1))); el('auditProximo').addEventListener('click',()=>carregarAuditoria(paginaAuditoria+1)); for(const id of ['auditUsuario','auditAcao','auditInicio','auditFim']) el(id).addEventListener('change',()=>carregarAuditoria(0));
  el('btnHistorico').addEventListener('click',openHistoryModal); el('btnCriarBase').addEventListener('click',createHistoricalBaseline); el('btnCriarBackup').addEventListener('click',createCurrentBackup); el('btnSairHistorico').addEventListener('click',leaveHistoricalMode);
  el('btnLogin').addEventListener('click',openLoginModal); el('btnLogout').addEventListener('click',logout); el('btnEntrar').addEventListener('click',login); el('btnUsuarios').addEventListener('click',openUsersModal); el('btnCriarUsuario').addEventListener('click',createUser);
  el('loginSenha').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
}
function switchCategory(cat){state.categoria=cat;state.funcao='';document.querySelectorAll('.main-tab').forEach(b=>b.classList.toggle('active',b.dataset.category===cat));el('roleFilters').classList.toggle('hidden',cat!=='OPERADOR');document.querySelectorAll('.role-pill').forEach((b,i)=>b.classList.toggle('active',i===0));carregar()}
function normalize(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim()}
function fmtBR(iso){if(!iso)return'—';const [y,m,d]=iso.split('-');return `${d}/${m}/${y}`}
function addDaysISO(iso,n){const [y,m,d]=iso.split('-').map(Number);const dt=new Date(Date.UTC(y,m-1,d));dt.setUTCDate(dt.getUTCDate()+n);return dt.toISOString().slice(0,10)}
function daysBetween(a,b){const da=new Date(a+'T00:00:00Z'),db=new Date(b+'T00:00:00Z');return Math.round((db-da)/86400000)}
function daysInMonth(y,m){return new Date(y,m,0).getDate()}
function dayOfWeek(y,m,d){return new Date(y,m-1,d,12).getDay()}
function toast(msg){const t=el('toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._tm);t._tm=setTimeout(()=>t.classList.remove('show'),3000)}
async function request(url,opts={}){const headers={...(opts.headers||{})};if(state.authToken)headers.Authorization=`Bearer ${state.authToken}`;const r=await fetch(url,{cache:'no-store',...opts,headers});const data=await r.json().catch(()=>({}));if(r.status===401&&state.authToken&&!url.includes('/auth/login')){clearAuth();updateAuthUI();render();}if(!r.ok)throw new Error(data.erro||'Erro na operação');return data}
async function guarded(key,fn){if(mutationLocks.has(key))return;mutationLocks.add(key);try{return await fn()}finally{mutationLocks.delete(key)}}

function clearAuth(){state.auth=null;state.authToken='';localStorage.removeItem('escala_auth_token')}
async function restoreAuth(){
  if(!state.authToken)return;
  try{const data=await request(`${API}/auth/me`);state.auth=data.user||null}catch{clearAuth()}
}
function updateAuthUI(){
  const logged=canEdit();
  document.body.classList.toggle('can-edit',logged && !state.backupId);
  el('btnLogin').classList.toggle('hidden',logged);
  el('btnLogout').classList.toggle('hidden',!logged);
  el('btnUsuarios').classList.toggle('hidden',!isAdmin());
  el('btnAuditoria').classList.toggle('hidden',!isAdmin());
  el('btnHistorico').classList.toggle('hidden',!logged);
  el('btnNovo').classList.toggle('hidden',!logged || !!state.backupId);
  el('btnFerias').classList.toggle('hidden',!logged || !!state.backupId);
  el('authStatus').textContent=logged?`${state.auth.nome||state.auth.username} · ${state.auth.role==='ADMIN'?'Administrador':'Usuário'}`:'Somente visualização';
}
async function openLoginModal(){
  el('loginUsuario').value='';el('loginSenha').value='';el('loginSetupAviso').classList.add('hidden');
  try{const st=await request(`${API}/auth/status`);if(!st.has_users){const b=el('loginSetupAviso');b.textContent='Nenhum administrador foi criado. Configure ESCALA_ADMIN_USER e ESCALA_ADMIN_PASSWORD no Netlify e faça um novo deploy.';b.classList.remove('hidden')}}catch{}
  openModal('modalLogin');setTimeout(()=>el('loginUsuario').focus(),50);
}
async function login(){return guarded('login',async()=>{try{const data=await request(`${API}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:el('loginUsuario').value,password:el('loginSenha').value})});state.authToken=data.token;state.auth=data.user;localStorage.setItem('escala_auth_token',data.token);closeModal('modalLogin');updateAuthUI();render();toast('Login realizado. Edição liberada.')}catch(err){toast(err.message)}})}
function logout(){clearAuth();leaveHistoricalMode();updateAuthUI();render();toast('Sessão encerrada. Modo somente visualização.')}
async function openUsersModal(){if(!isAdmin())return;openModal('modalUsuarios');await loadUsers()}
async function loadUsers(){
  try{const rows=await request(`${API}/usuarios`);const box=el('listaUsuarios');if(!rows.length){box.innerHTML='<div class="empty-user">Nenhum acesso cadastrado.</div>';return}box.innerHTML=rows.map(u=>`<div class="user-row ${u.ativo?'':'inactive'}"><div><strong>${escapeHtml(u.nome||u.username)}</strong><small>${escapeHtml(u.username)} · ${u.role==='ADMIN'?'Administrador':'Usuário'}${u.ativo?'':' · DESATIVADO'}</small></div><div class="user-actions"><button class="btn outline compact" data-user-pass="${u.id}">Senha</button><button class="btn outline compact" data-user-role="${u.id}" data-role="${u.role}">${u.role==='ADMIN'?'Tornar usuário':'Tornar admin'}</button><button class="btn ${u.ativo?'danger ghost':'outline'} compact" data-user-active="${u.id}" data-active="${u.ativo}">${u.ativo?'Desativar':'Ativar'}</button></div></div>`).join('');box.querySelectorAll('[data-user-pass]').forEach(b=>b.addEventListener('click',()=>resetUserPassword(Number(b.dataset.userPass))));box.querySelectorAll('[data-user-role]').forEach(b=>b.addEventListener('click',()=>changeUserRole(Number(b.dataset.userRole),b.dataset.role)));box.querySelectorAll('[data-user-active]').forEach(b=>b.addEventListener('click',()=>toggleUser(Number(b.dataset.userActive),Number(b.dataset.active))))}catch(err){toast(err.message)}
}
async function createUser(){return guarded('createUser',async()=>{try{await request(`${API}/usuarios`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:el('novoUsuario').value,nome:el('novoUsuarioNome').value,role:el('novoUsuarioRole').value,password:el('novoUsuarioSenha').value})});el('novoUsuario').value='';el('novoUsuarioNome').value='';el('novoUsuarioSenha').value='';toast('Acesso criado.');await loadUsers()}catch(err){toast(err.message)}})}
async function resetUserPassword(id){const password=prompt('Digite a nova senha (mínimo 8 caracteres):');if(password==null)return;try{await request(`${API}/usuarios/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});toast('Senha atualizada.')}catch(err){toast(err.message)}}
async function changeUserRole(id,current){const next=current==='ADMIN'?'USUARIO':'ADMIN';if(!confirm(`Alterar este acesso para ${next==='ADMIN'?'Administrador':'Usuário'}?`))return;try{await request(`${API}/usuarios/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:next})});toast('Perfil atualizado.');await loadUsers()}catch(err){toast(err.message)}}
async function toggleUser(id,active){const next=!active;if(!confirm(`${next?'Ativar':'Desativar'} este acesso?`))return;try{await request(`${API}/usuarios/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ativo:next})});toast(next?'Acesso ativado.':'Acesso desativado.');await loadUsers()}catch(err){toast(err.message)}}


// Exibição operacional do estado efetivo; o JSON técnico fica acessível em Detalhes.
function dataLogBR(iso){return /^\d{4}-\d{2}-\d{2}$/.test(iso||'')?fmtBR(iso):iso||'—'}
function formatarEstadoCiclo(value){
  const dias=Number(value.regime_trabalho),folga=Number(value.regime_folga);
  return [
    ['Colaborador',value.colaborador],['Função',value.funcao],
    ['Ciclo original',dataLogBR(value.base_saida)+' → '+dataLogBR(value.base_retorno)],
    ['Saída efetiva',dataLogBR(value.saida)],['Retorno efetivo',dataLogBR(value.retorno)],
    ['Regime',`${dias} dias de trabalho / ${folga} dias de folga`],
    ['Origem',({ORIGINAL:'Programação original',UNICO:'Ajuste deste ciclo',SEGUINTES:'Início de série recorrente',HERDADO:'Herdado de série anterior'})[value.origem]||value.origem],
    ...(value.serie_inicio?[['Série iniciada em',dataLogBR(value.serie_inicio)]]:[]),
    ...(value.observacao?[['Observação',value.observacao]]:[])
  ];
}
function desenharEstadoAuditoria(col,value){
  if(value?.formato==='CICLO_EFETIVO_V1'){
    const quadro=document.createElement('dl');quadro.className='audit-state';
    for(const [nome,valor] of formatarEstadoCiclo(value)){
      const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=nome;dd.textContent=valor??'—';quadro.append(dt,dd);
    }
    col.append(quadro);
  }else{
    const pre=document.createElement('pre');
    pre.textContent=value==null?'—':JSON.stringify(value,null,2);col.append(pre);
  }
}
function desenharImpactoAuditoria(card,detalhes){
  if(!Array.isArray(detalhes?.ciclos_alterados))return;
  const d=document.createElement('details'),summary=document.createElement('summary');
  const ciclos=detalhes.ciclos_alterados;
  const futuros=ciclos.filter(c=>c.base_saida!==detalhes.base_saida);
  summary.textContent=`Ciclos afetados na prévia: ${ciclos.length} (ver detalhes)`;d.append(summary);
  const p=document.createElement('p');p.className='audit-note';
  p.textContent='Inclui o ciclo selecionado e uma prévia dos 12 ciclos seguintes. Uma alteração recorrente poderá continuar após esta janela; ciclos anteriores não são reescritos.';
  d.append(p);
  if(!futuros.length){const no=document.createElement('p');no.textContent='Não foram detectadas alterações nos 12 ciclos seguintes.';d.append(no)}
  for(const c of ciclos){
    const linha=document.createElement('div');linha.className='audit-impact-row';
    const title=document.createElement('strong');title.textContent=`Ciclo ${dataLogBR(c.base_saida)}`;linha.append(title);
    const anteriores=document.createElement('span');anteriores.textContent=`ANTES: ${dataLogBR(c.antes.saida)} → ${dataLogBR(c.antes.retorno)} (${c.antes.origem})`;
    const posteriores=document.createElement('span');posteriores.textContent=`DEPOIS: ${dataLogBR(c.depois.saida)} → ${dataLogBR(c.depois.retorno)} (${c.depois.origem})`;
    linha.append(anteriores,posteriores);d.append(linha);
  }
  card.append(d);
}
let paginaAuditoria=0,logsAuditoria=[],totalAuditoria=0;
async function abrirAuditoria(){if(!isAdmin())return;openModal('modalAuditoria');await carregarAuditoria(0)}
async function carregarAuditoria(pagina){
  if(!isAdmin())return;
  try{
    const q=new URLSearchParams({pagina:String(pagina),limite:'100'});
    for(const [id,key] of [['auditUsuario','usuario'],['auditAcao','acao'],['auditInicio','inicio'],['auditFim','fim']])if(el(id).value.trim())q.set(key,el(id).value.trim());
    const result=await request(`${API}/auditoria?${q}`);
    paginaAuditoria=result.pagina;logsAuditoria=result.registros;totalAuditoria=result.total;
    el('auditResumo').textContent=`${result.total} ocorrências encontradas · horário de Brasília`;
    const box=el('auditLista');box.replaceChildren();
    if(!logsAuditoria.length)box.textContent='Nenhum registro para estes filtros.';
    for(const item of logsAuditoria){
      const card=document.createElement('article');card.className='audit-entry';
      const head=document.createElement('div');head.className='audit-entry-header';
      const stamp=new Date(item.criado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
      const rotulo={AJUSTAR_CICLO:'AJUSTE DE CICLO',REVERTER_AJUSTE:'REVERSÃO DE AJUSTE'}[item.acao]||item.acao;
      head.textContent=`${stamp} · ${item.autor_usuario} · ${rotulo} · ${item.antes?.colaborador||item.depois?.colaborador||item.entidade+' '+(item.entidade_id||'')}`;card.append(head);
      const grid=document.createElement('div');grid.className='audit-compare';
      for(const [label,value] of [['ANTES',item.antes],['DEPOIS',item.depois]]){
        const col=document.createElement('div'),title=document.createElement('strong');title.textContent=label;
        col.append(title);desenharEstadoAuditoria(col,value);grid.append(col);
      }
      card.append(grid);
      if(item.acao==='AJUSTAR_CICLO'&&item.antes==null){const nota=document.createElement('p');nota.className='audit-note';nota.textContent='Registro antigo: a programação efetiva anterior não foi armazenada neste evento. Ela não pode ser reconstruída com segurança apenas a partir do log.';card.append(nota)}
      desenharImpactoAuditoria(card,item.detalhes);
      if(item.detalhes&&Object.keys(item.detalhes).length){
        const d=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');
        summary.textContent='Dados técnicos do evento';pre.textContent=JSON.stringify(item.detalhes,null,2);
        d.append(summary,pre);card.append(d);
      }
      box.append(card);
    }
    el('auditPaginacao').textContent=`Página ${paginaAuditoria+1} de ${Math.max(1,Math.ceil(totalAuditoria/100))}`;
    el('auditAnterior').disabled=paginaAuditoria===0;el('auditProximo').disabled=(paginaAuditoria+1)*100>=totalAuditoria;
  }catch(err){el('auditLista').textContent='Falha ao consultar log: '+err.message;}
}
function limparAuditoria(){for(const id of ['auditUsuario','auditAcao','auditInicio','auditFim'])el(id).value='';carregarAuditoria(0)}
function baixarAuditoriaCSV(){
  if(!logsAuditoria.length){toast('Nenhum registro nesta página.');return;}
  const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const rows=[['Data/hora (Brasília)','Usuário','Ação','Entidade','Identificador','Antes','Depois','Detalhes'],...logsAuditoria.map(r=>[new Date(r.criado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),r.autor_usuario,r.acao,r.entidade,r.entidade_id,JSON.stringify(r.antes),JSON.stringify(r.depois),JSON.stringify(r.detalhes)])];
  downloadBlob(new Blob(['\uFEFF'+rows.map(row=>row.map(esc).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),`escala_biotec_log_pagina_${paginaAuditoria+1}.csv`);
}

async function carregar(){
  try{const q=new URLSearchParams({categoria:state.categoria,mes:mesEl.value,ano:anoEl.value});if(state.funcao)q.set('funcao',state.funcao);state.data=await request(state.backupId?`${API}/backups/${state.backupId}/escala?${q}`:`${API}/escala?${q}&_=${Date.now()}`);render();return true}catch(e){toast(e.message);return false}
}
function filteredEmployees(){if(!state.data)return[];return state.data.employees.filter(e=>{if(state.search&&!normalize(`${e.nome} ${e.funcao} ${e.subtipo}`).includes(state.search))return false;if(state.changedOnly&&!e.changed)return false;return true})}
function render(){if(!state.data)return;renderSummary();renderAlerts();renderTable()}
function renderSummary(){const arr=filteredEmployees();const changed=arr.filter(e=>e.changed).length;const pending=arr.filter(e=>!e.anchor_saida).length;summary.innerHTML=`
  <div class="summary-card"><span>Exibidos</span><strong>${arr.length}</strong></div>
  <div class="summary-card changed"><span>Ajustados</span><strong>${changed}</strong></div>
  <div class="summary-card ${pending?'warning':''}"><span>Sem data base</span><strong>${pending}</strong></div>`}
function renderAlerts(){const visibleIds=new Set(filteredEmployees().map(e=>Number(e.id)));const list=(state.data.alerts||[]).filter(a=>visibleIds.has(Number(a.employee_id)));if(!list.length){alertas.innerHTML='<div class="alert empty">Sem saídas ou retornos para hoje e os próximos 2 dias.</div>';return}alertas.innerHTML=list.map(a=>`<div class="alert ${a.kind==='retorno'?'retorno':''}">${a.kind==='saida'?'⚠':'●'} ${escapeHtml(a.nome)}${a.funcao?` · ${escapeHtml(a.funcao)}`:''}: ${a.kind==='saida'?'saída':'retorno'} ${escapeHtml(a.when)} (${fmtBR(a.date)})</div>`).join('')}
function renderTable(){
  const y=Number(state.data.ano),m=Number(state.data.mes),total=daysInMonth(y,m),arr=filteredEmployees(),today=new Date();
  let h='<thead><tr><th class="sticky-name head-sticky" rowspan="2">COLABORADOR</th><th class="sticky-role head-sticky" rowspan="2">'+(state.categoria==='OPERADOR'?'FUNÇÃO':'TIPO')+'</th>';
  for(let d=1;d<=total;d++){const wd=dayOfWeek(y,m,d),isW=wd===0||wd===6,isT=today.getFullYear()===y&&today.getMonth()+1===m&&today.getDate()===d;h+=`<th class="${isW?'weekend ':''}${isT?'today-head':''}">${d}</th>`}h+='</tr><tr>';
  const letters=['D','S','T','Q','Q','S','S'];for(let d=1;d<=total;d++){const wd=dayOfWeek(y,m,d);h+=`<th class="${wd===0||wd===6?'weekend':''}">${letters[wd]}</th>`}h+='</tr></thead><tbody>';
  for(const e of arr){
    const subtype=(e.subtipo||'').toUpperCase();const nameCls=subtype==='FOLGUISTA'?'folguista':subtype==='FERISTA'?'ferista':'';const role=state.categoria==='OPERADOR'?e.funcao:(e.subtipo||'FIXO');
    const nameTitle=`${e.fonte||''}${e.anchor_saida?`\nData base: ${fmtBR(e.anchor_saida)} · regime ${e.regime_trabalho}/${e.regime_folga}`:'\nDATA BASE PENDENTE'}`;
    const badges=`${e.changed?'<span class="name-badge adjusted" title="Possui ajuste/sobreposição">AJ</span>':''}${!e.anchor_saida?'<span class="name-badge pending" title="Data base pendente">SEM DATA</span>':''}`;
    const actions=(canEdit()&&!state.backupId)?`<span class="name-actions"><button class="name-action ${e.changed?'adjusted':''}" data-action="adjust" data-id="${e.id}" title="Ajustar escala" aria-label="Ajustar escala" ${!e.anchor_saida?'disabled':''}>⚙</button><button class="name-action" data-action="edit" data-id="${e.id}" title="Editar colaborador" aria-label="Editar colaborador">✏</button><button class="name-action danger" data-action="delete" data-id="${e.id}" title="Excluir da escala (preserva histórico)" aria-label="Excluir colaborador">🗑</button></span>`:'';
    h+=`<tr class="${e.changed?'row-changed':''}" data-id="${e.id}"><td class="sticky-name employee-name ${nameCls}" title="${escapeAttr(nameTitle)}"><div class="name-line">${actions}<span class="name-text">${escapeHtml(e.nome)}</span>${badges}</div></td><td class="sticky-role"><span class="role-badge">${escapeHtml(role||'—')}</span></td>`;
    for(const c of e.cells){const curr=c.current,base=c.base,changed=c.changed;const orig=changed?`<span class="orig-mark" title="Original: ${statusLabel[base]}">${statusSymbol[base]||'•'}</span>`:'';const tt=`${e.nome} · ${fmtBR(c.date)}\nOriginal: ${statusLabel[base]}\nAtual: ${statusLabel[curr]}${changed?'\nDATA MODIFICADA':''}`;h+=`<td class="day-cell ${curr} ${changed?'changed ':''}${curr==='NORMAL'?'current-normal':''}" title="${escapeAttr(tt)}" data-action="cell" data-id="${e.id}" data-day="${c.day}">${orig}${statusSymbol[curr]}</td>`}
    h+='</tr>';
  }
  if(!arr.length)h+=`<tr><td colspan="${total+2}" class="empty-table">Nenhum colaborador encontrado nesta visualização.</td></tr>`;
  tabela.innerHTML=h+'</tbody>';
  tabela.querySelectorAll('[data-action="adjust"]').forEach(b=>b.addEventListener('click',()=>openAdjustment(Number(b.dataset.id))));
  tabela.querySelectorAll('[data-action="edit"]').forEach(b=>b.addEventListener('click',()=>openEmployeeModal(Number(b.dataset.id))));
  tabela.querySelectorAll('[data-action="delete"]').forEach(b=>b.addEventListener('click',()=>quickDeactivate(Number(b.dataset.id))));
  if(canEdit()&&!state.backupId)tabela.querySelectorAll('[data-action="cell"]').forEach(td=>td.addEventListener('dblclick',()=>openAdjustment(Number(td.dataset.id),Number(td.dataset.day))));
}
function findEmployee(id){return state.data?.employees.find(e=>Number(e.id)===Number(id))}
function openModal(id){el(id).classList.remove('hidden');el(id).setAttribute('aria-hidden','false')}
function closeModal(id){el(id).classList.add('hidden');el(id).setAttribute('aria-hidden','true')}
function openAdjustment(id,day){if(!canEdit()){toast('Faça login para editar a escala.');return}const e=findEmployee(id);if(!e)return;if(!e.anchor_saida){toast('Defina primeiro a data base deste colaborador.');return}state.selectedEmployee=e;el('ajusteNome').textContent=`${e.nome} · ${e.funcao||e.subtipo||''} · regime ${e.regime_trabalho}/${e.regime_folga}`;const sel=el('ajusteCiclo');sel.innerHTML=e.cycles.map((c,i)=>`<option value="${i}">${fmtBR(c.base_saida)} → ${fmtBR(c.base_retorno)}${c.adjusted?' · AJUSTADO':''}</option>`).join('');if(day){const target=`${state.data.ano}-${String(state.data.mes).padStart(2,'0')}-${String(day).padStart(2,'0')}`;let best=0,bestD=1e9;e.cycles.forEach((c,i)=>{const d=Math.abs(daysBetween(c.base_saida,target));if(d<bestD){best=i;bestD=d}});sel.value=String(best)}fillAdjustmentCycle();openModal('modalAjuste')}
function selectedCycle(){const e=state.selectedEmployee;if(!e)return null;return e.cycles[Number(el('ajusteCiclo').value||0)]}
function ajusteEscopoSelecionado(){return document.querySelector('input[name="ajusteEscopo"]:checked')?.value||'UNICO'}
function fillAdjustmentCycle(){
  const e=state.selectedEmployee,c=selectedCycle();if(!e||!c)return;
  el('originalSaida').textContent=fmtBR(c.base_saida);el('originalRetorno').textContent=fmtBR(c.base_retorno);
  el('novaSaida').value=c.nova_saida;el('novoRetorno').value=c.novo_retorno;
  el('ajusteObs').value=c.escopo==='HERDADO'?'':(c.observacao||'');
  el('moverRetornoTexto').textContent=`Mover o retorno junto e manter ${e.regime_folga} dias de folga`;
  el('moverRetorno').checked=false;
  // Em ciclo herdado, uma exceção pontual não altera o início da série anterior.
  document.querySelector(`input[name="ajusteEscopo"][value="${c.escopo==='SEGUINTES'?'SEGUINTES':'UNICO'}"]`).checked=true;
  el('btnReverterAjuste').classList.toggle('hidden',!c.adjusted);
  el('btnReverterAjuste').textContent=c.escopo==='HERDADO'?'Reverter a série inteira':'Reverter para original';
  updateImpact();
}
function onNewExitChanged(){const e=state.selectedEmployee;if(el('moverRetorno').checked&&e&&el('novaSaida').value)el('novoRetorno').value=addDaysISO(el('novaSaida').value,Number(e.regime_folga));updateImpact()}
function updateImpact(){
  const e=state.selectedEmployee,c=selectedCycle();if(!e||!c)return;
  const nova=el('novaSaida').value,ret=el('novoRetorno').value;
  if(!nova||!ret){el('ajusteImpacto').textContent='Informe nova saída e novo retorno.';return}
  const shift=daysBetween(c.base_saida,nova),off=daysBetween(nova,ret);
  const newWork=(Number(e.regime_trabalho)+Number(e.regime_folga))-off;
  const delta=newWork-Number(e.regime_trabalho);
  const recorrente=ajusteEscopoSelecionado()==='SEGUINTES';
  el('ajusteImpacto').innerHTML=`A saída foi deslocada <b>${shift>=0?'+':''}${shift} dia(s)</b>. Folga neste ciclo: <b>${off} dia(s)</b>. Trabalho no ciclo: <b>${e.regime_trabalho} → ${newWork} dia(s)</b> <span style="color:#7c3aed">(${delta>=0?'+':''}${delta})</span>. ${recorrente?'Os ciclos futuros repetirão o mesmo deslocamento.':'Somente este ciclo será modificado.'}`;
  const avisos=[];
  if(recorrente&&off!==Number(e.regime_folga))avisos.push(`Para repetir o ajuste, mantenha ${e.regime_folga} dias de folga; ajuste o retorno ou escolha Somente este ciclo.`);
  if(c.escopo==='HERDADO')avisos.push(`Este ciclo recebe um ajuste recorrente iniciado em ${fmtBR(c.serie_inicio_propria)}. Uma alteração pontual aqui não encerra a série.`);
  if(c.escopo==='SEGUINTES'&&!recorrente)avisos.push('Ao salvar como Somente este ciclo, a repetição anterior será encerrada a partir deste ciclo.');
  el('ajusteEscopoAviso').textContent=avisos.join(' ');
}
async function saveAdjustment(){return guarded('saveAdjustment',async()=>{
  const e=state.selectedEmployee,c=selectedCycle();if(!e||!c)return;
  const escopo=ajusteEscopoSelecionado();
  if(escopo==='SEGUINTES'&&daysBetween(el('novaSaida').value,el('novoRetorno').value)!==Number(e.regime_folga)){
    toast(`Para repetir, mantenha ${e.regime_folga} dias de folga.`);return;
  }
  if(c.escopo==='SEGUINTES'&&escopo==='UNICO'&&!confirm('Este ciclo iniciava uma repetição. Salvar como pontual encerrará essa repetição nos meses seguintes. Continuar?'))return;
  try{
    await request(`${API}/ajustes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({colaborador_id:e.id,base_saida:c.base_saida,nova_saida:el('novaSaida').value,novo_retorno:el('novoRetorno').value,observacao:el('ajusteObs').value,escopo})});
    closeModal('modalAjuste');toast(escopo==='SEGUINTES'?'Ajuste aplicado a este ciclo e aos futuros.':'Ajuste pontual salvo; demais ciclos preservados.');await carregar();
  }catch(err){toast(err.message)}
})}
async function revertAdjustment(){return guarded('revertAdjustment',async()=>{
  const e=state.selectedEmployee,c=selectedCycle();if(!e||!c)return;
  const herdado=c.escopo==='HERDADO';
  const origem=herdado?c.serie_inicio_propria:c.base_saida;
  const msg=herdado?`Reverter a série iniciada em ${fmtBR(origem)}? Todos os ciclos que herdam essa série serão recalculados; ajustes individuais continuarão salvos.`:
    c.escopo==='SEGUINTES'?`Reverter a série iniciada em ${fmtBR(origem)}? Todos os ciclos seguintes que herdam essa série serão recalculados.`:`Reverter apenas o ajuste deste ciclo de ${e.nome}?`;
  if(!confirm(msg))return;
  try{await request(`${API}/ajustes?colaborador_id=${e.id}&base_saida=${encodeURIComponent(origem)}`,{method:'DELETE'});
    closeModal('modalAjuste');toast(herdado||c.escopo==='SEGUINTES'?'Série removida e meses seguintes recalculados.':'Ajuste do ciclo revertido.');await carregar();
  }catch(err){toast(err.message)}
})}

function openEmployeeModal(id=null){if(!canEdit()){toast('Faça login para editar a escala.');return}const e=id?findEmployee(id):null;state.selectedEmployee=e;el('colabModalTitulo').textContent=e?'Editar colaborador':'Novo colaborador';el('colabId').value=e?.id||'';el('colabNome').value=e?.nome||'';el('colabCategoria').value=state.categoria==='MOTORISTA'?'Motorista — 23/7':'Operador — 24/6';el('fieldFuncao').classList.toggle('hidden',state.categoria!=='OPERADOR');el('fieldSubtipo').classList.toggle('hidden',state.categoria!=='MOTORISTA');el('colabFuncao').value=e?.funcao||state.funcao||'SKIDDER';el('colabSubtipo').value=e?.subtipo||'FIXO';el('colabAnchor').value=e?.anchor_saida||'';el('colabObs').value=e?.observacao||'';el('btnDesativarColab').classList.toggle('hidden',!e);openModal('modalColaborador')}
async function saveEmployee(){return guarded('saveEmployee',async()=>{const id=Number(el('colabId').value||0);const body={nome:el('colabNome').value,categoria:state.categoria,funcao:el('colabFuncao').value,subtipo:el('colabSubtipo').value,anchor_saida:el('colabAnchor').value,observacao:el('colabObs').value};try{await request(id?`${API}/colaboradores/${id}`:`${API}/colaboradores`,{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});closeModal('modalColaborador');toast(id?'Cadastro atualizado.':'Colaborador adicionado.');await carregar()}catch(err){toast(err.message)}})}
async function quickDeactivate(id){const e=findEmployee(id);if(!e)return;if(!confirm(`Excluir ${e.nome} da escala?\n\nO cadastro será desativado, mas o histórico e os ajustes serão preservados.`))return;return guarded(`deleteEmployee:${id}`,async()=>{try{await request(`${API}/colaboradores/${id}`,{method:'DELETE'});toast('Colaborador removido da escala. Histórico preservado.');await carregar()}catch(err){toast(err.message)}})}
async function deactivateEmployee(){const e=state.selectedEmployee;if(!e||!confirm(`Desativar ${e.nome}? O histórico será preservado.`))return;return guarded(`deleteEmployee:${e.id}`,async()=>{try{await request(`${API}/colaboradores/${e.id}`,{method:'DELETE'});closeModal('modalColaborador');toast('Colaborador desativado.');await carregar()}catch(err){toast(err.message)}})}
function openVacationModal(){if(!canEdit()||state.backupId){toast('Faça login para editar férias.');return}const arr=state.data?.employees||[];const s=el('feriasColaborador');s.innerHTML=arr.map(e=>`<option value="${e.id}">${escapeHtml(e.nome)}${e.funcao?` · ${escapeHtml(e.funcao)}`:''}</option>`).join('');resetVacationForm(false);renderExistingVacations();openModal('modalFerias')}
function resetVacationForm(renderList=true){const y=Number(state.data?.ano||new Date().getFullYear()),m=Number(state.data?.mes||new Date().getMonth()+1);el('feriasId').value='';el('feriasColaborador').disabled=false;el('feriasInicio').value=`${y}-${String(m).padStart(2,'0')}-01`;el('feriasFim').value=el('feriasInicio').value;el('feriasObs').value='';el('btnSalvarFerias').textContent='Registrar férias';el('btnCancelarEdicaoFerias').classList.add('hidden');if(renderList)renderExistingVacations()}
function renderExistingVacations(){const e=findEmployee(Number(el('feriasColaborador').value));const box=el('feriasExistentes');if(!e||!e.absences?.length){box.innerHTML='<span style="color:#94a3b8;font-size:11px">Nenhum período neste mês.</span>';return}box.innerHTML=e.absences.map(a=>`<div class="absence-item"><span>${fmtBR(a.inicio)} → ${fmtBR(a.fim)} ${a.observacao?`· ${escapeHtml(a.observacao)}`:''}</span><span class="absence-actions"><button data-edit-vac="${a.id}">editar</button><button data-del-vac="${a.id}">remover</button></span></div>`).join('');box.querySelectorAll('[data-edit-vac]').forEach(b=>b.addEventListener('click',()=>editVacation(Number(b.dataset.editVac))));box.querySelectorAll('[data-del-vac]').forEach(b=>b.addEventListener('click',()=>deleteVacation(Number(b.dataset.delVac))))}
function editVacation(id){const e=findEmployee(Number(el('feriasColaborador').value));const a=e?.absences?.find(x=>Number(x.id)===Number(id));if(!a)return;el('feriasId').value=String(a.id);el('feriasInicio').value=a.inicio;el('feriasFim').value=a.fim;el('feriasObs').value=a.observacao||'';el('feriasColaborador').disabled=true;el('btnSalvarFerias').textContent='Salvar alterações';el('btnCancelarEdicaoFerias').classList.remove('hidden')}
async function saveVacation(){return guarded('saveVacation',async()=>{const colaboradorId=Number(el('feriasColaborador').value),vacId=Number(el('feriasId').value||0);if(!colaboradorId)return;try{const body={colaborador_id:colaboradorId,inicio:el('feriasInicio').value,fim:el('feriasFim').value,observacao:el('feriasObs').value};await request(vacId?`${API}/ferias/${vacId}`:`${API}/ferias`,{method:vacId?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});toast(vacId?'Férias atualizadas.':'Férias registradas sem apagar a escala original.');await carregar();const keepId=colaboradorId;const arr=state.data?.employees||[];el('feriasColaborador').innerHTML=arr.map(e=>`<option value="${e.id}">${escapeHtml(e.nome)}${e.funcao?` · ${escapeHtml(e.funcao)}`:''}</option>`).join('');el('feriasColaborador').value=String(keepId);resetVacationForm();}catch(err){toast(err.message)}})}
async function deleteVacation(id){if(!confirm('Remover este período de férias?'))return;return guarded(`deleteVacation:${id}`,async()=>{try{await request(`${API}/ferias/${id}`,{method:'DELETE'});toast('Férias removidas.');await carregar();const arr=state.data?.employees||[];el('feriasColaborador').innerHTML=arr.map(e=>`<option value="${e.id}">${escapeHtml(e.nome)}${e.funcao?` · ${escapeHtml(e.funcao)}`:''}</option>`).join('');resetVacationForm();}catch(err){toast(err.message)}})}

const exportStatusCode = { NORMAL:'', SAIDA:'S', FOLGA:'FOLGA', RETORNO:'R', FERIAS:'FÉRIAS', SEM_ESCALA:'—' };
const exportStatusShort = { NORMAL:'', SAIDA:'S', FOLGA:'F', RETORNO:'R', FERIAS:'FÉR', SEM_ESCALA:'—' };
const excelStatusFill = {
  SAIDA:'FF7DD3FC',
  FOLGA:'FFE34B43',
  RETORNO:'FF86EFAC',
  FERIAS:'FFEF4444',
  SEM_ESCALA:'FFF1F5F9'
};
function exportContext(){
  if(!state.data)throw new Error('A escala ainda não foi carregada.');
  const y=Number(state.data.ano),m=Number(state.data.mes),total=daysInMonth(y,m),arr=filteredEmployees();
  const category=state.categoria==='OPERADOR'?'Operadores':'Motoristas';
  const roleLabel=state.categoria==='OPERADOR'?'FUNÇÃO':'TIPO';
  const roleFilter=state.funcao?` · ${state.funcao}`:'';
  const searchFilter=state.search?` · busca aplicada`:'';
  const changedFilter=state.changedOnly?' · somente alterados':'';
  return {y,m,total,arr,category,roleLabel,title:`${state.backupId?'VERSÃO HISTÓRICA #'+state.backupId+' — ':''}Escala BIOTEC — ${category}${roleFilter} — ${meses[m-1]}/${y}`,filterText:`${arr.length} colaborador(es)${searchFilter}${changedFilter}`};
}
function exportFileBase(ctx){return `${state.backupId?'versao_'+state.backupId+'_':''}escala_${state.categoria.toLowerCase()}_${String(ctx.m).padStart(2,'0')}_${ctx.y}`}
function downloadBlob(blob,filename){const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function setBusy(id,busy,label){const b=el(id);if(!b)return;if(busy){b.dataset.label=b.innerHTML;b.disabled=true;b.textContent='Gerando…'}else{b.disabled=false;b.innerHTML=b.dataset.label||label||b.innerHTML}}
function updatePrintHeader(){const ctx=exportContext();el('printHeader').innerHTML=`<div><strong>${escapeHtml(ctx.title)}</strong><span>${escapeHtml(ctx.filterText)}</span></div><small>Impresso em ${new Date().toLocaleString('pt-BR')}</small>`}
function printSchedule(){try{updatePrintHeader();window.print()}catch(err){toast(err.message)}}
async function exportExcel(){
  if(!window.ExcelJS){toast('Módulo de Excel não carregou. Atualize a página e tente novamente.');return}
  return guarded('exportExcel',async()=>{
    setBusy('btnExcel',true);
    try{
      const ctx=exportContext(),wb=new ExcelJS.Workbook(),ws=wb.addWorksheet(`${ctx.category} ${String(ctx.m).padStart(2,'0')}-${ctx.y}`,{views:[{state:'frozen',xSplit:2,ySplit:4}]});
      wb.creator='Escala BIOTEC';wb.created=new Date();
      const lastCol=ctx.total+2;
      ws.mergeCells(1,1,1,lastCol);const titleCell=ws.getCell(1,1);titleCell.value=ctx.title;titleCell.font={bold:true,size:16,color:{argb:'FFFFFFFF'}};titleCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF13203A'}};titleCell.alignment={vertical:'middle',horizontal:'left'};ws.getRow(1).height=25;
      ws.mergeCells(2,1,2,lastCol);const meta=ws.getCell(2,1);meta.value=`${ctx.filterText} · Exportado em ${new Date().toLocaleString('pt-BR')}`;meta.font={italic:true,size:9,color:{argb:'FF475569'}};
      const header=['COLABORADOR',ctx.roleLabel,...Array.from({length:ctx.total},(_,i)=>i+1)];
      const week=['','',...Array.from({length:ctx.total},(_,i)=>['D','S','T','Q','Q','S','S'][dayOfWeek(ctx.y,ctx.m,i+1)])];
      ws.addRow(header);ws.addRow(week);
      [3,4].forEach(r=>{ws.getRow(r).font={bold:true,size:9};ws.getRow(r).alignment={horizontal:'center',vertical:'middle'};ws.getRow(r).eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE7EBF0'}};c.border={top:{style:'thin',color:{argb:'FFAEB9C7'}},left:{style:'thin',color:{argb:'FFAEB9C7'}},bottom:{style:'thin',color:{argb:'FFAEB9C7'}},right:{style:'thin',color:{argb:'FFAEB9C7'}}}})});
      for(let d=1;d<=ctx.total;d++){const wd=dayOfWeek(ctx.y,ctx.m,d);if(wd===0||wd===6){[3,4].forEach(r=>ws.getCell(r,d+2).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFACC15'}})}}
      for(const e of ctx.arr){
        const role=state.categoria==='OPERADOR'?(e.funcao||'—'):(e.subtipo||'FIXO');
        const row=ws.addRow([e.nome,role,...e.cells.map(c=>exportStatusCode[c.current]??c.current)]);row.height=20;
        row.getCell(1).font={bold:true};row.getCell(1).alignment={horizontal:'left',vertical:'middle'};row.getCell(2).alignment={horizontal:'center',vertical:'middle'};
        e.cells.forEach((c,i)=>{const cell=row.getCell(i+3);cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};const fill=excelStatusFill[c.current];if(fill)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};if(c.current==='FOLGA'||c.current==='FERIAS')cell.font={bold:true,color:{argb:'FFFFFFFF'}};if(c.current==='SAIDA'||c.current==='RETORNO')cell.font={bold:true,color:{argb:'FF0F172A'}};if(c.changed)cell.border={top:{style:'medium',color:{argb:'FF7C3AED'}},left:{style:'medium',color:{argb:'FF7C3AED'}},bottom:{style:'medium',color:{argb:'FF7C3AED'}},right:{style:'medium',color:{argb:'FF7C3AED'}}};else cell.border={top:{style:'thin',color:{argb:'FFCBD5E1'}},left:{style:'thin',color:{argb:'FFCBD5E1'}},bottom:{style:'thin',color:{argb:'FFCBD5E1'}},right:{style:'thin',color:{argb:'FFCBD5E1'}}}});
      }
      ws.getColumn(1).width=32;ws.getColumn(2).width=13;for(let c=3;c<=lastCol;c++)ws.getColumn(c).width=6;
      ws.autoFilter={from:{row:3,column:1},to:{row:3,column:lastCol}};
      ws.addRow([]);const legend=ws.addRow(['LEGENDA','', 'S = saída','FOLGA = folga','R = retorno','FÉRIAS = férias','Borda roxa = data modificada']);legend.font={bold:true,size:8};
      const buffer=await wb.xlsx.writeBuffer();downloadBlob(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`${exportFileBase(ctx)}.xlsx`);toast('Excel exportado.');
    }catch(err){toast(`Falha ao exportar Excel: ${err.message}`)}finally{setBusy('btnExcel',false,'Excel')}
  })
}
async function exportPdf(){
  const jsPDF=window.jspdf?.jsPDF;if(!jsPDF){toast('Módulo de PDF não carregou. Atualize a página e tente novamente.');return}
  return guarded('exportPdf',async()=>{
    setBusy('btnPdf',true);
    try{
      const ctx=exportContext(),doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a3',compress:true});
      doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text(ctx.title,10,11);
      doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(71,85,105);doc.text(`${ctx.filterText} · Exportado em ${new Date().toLocaleString('pt-BR')}`,10,16);doc.setTextColor(15,23,42);
      const head=[['COLABORADOR',ctx.roleLabel,...Array.from({length:ctx.total},(_,i)=>String(i+1))]];
      const body=ctx.arr.map(e=>{
        const role=state.categoria==='OPERADOR'?(e.funcao||'—'):(e.subtipo||'FIXO');
        const cells=e.cells.map(c=>{const styles={halign:'center',valign:'middle'};if(c.current==='SAIDA')styles.fillColor=[125,211,252];if(c.current==='FOLGA'){styles.fillColor=[227,75,67];styles.textColor=[255,255,255]};if(c.current==='RETORNO')styles.fillColor=[134,239,172];if(c.current==='FERIAS'){styles.fillColor=[239,68,68];styles.textColor=[255,255,255]};if(c.current==='SEM_ESCALA'){styles.fillColor=[241,245,249];styles.textColor=[148,163,184]};if(c.changed){styles.lineColor=[124,58,237];styles.lineWidth=.45}return {content:exportStatusShort[c.current]??c.current,styles}});
        return [{content:e.nome,styles:{fontStyle:'bold',halign:'left'}},{content:role,styles:{halign:'center'}},...cells]
      });
      if(typeof doc.autoTable!=='function')throw new Error('Plugin de tabela PDF não disponível.');
      doc.autoTable({startY:20,head,body,theme:'grid',margin:{left:8,right:8,bottom:12},styles:{fontSize:5.4,cellPadding:.7,minCellHeight:4.8,overflow:'ellipsize',lineColor:[174,185,199],lineWidth:.12},headStyles:{fillColor:[231,235,240],textColor:[15,23,42],fontStyle:'bold',halign:'center',fontSize:5.8},columnStyles:{0:{cellWidth:48,halign:'left'},1:{cellWidth:20}},didParseCell:data=>{if(data.section==='head'&&data.column.index>=2){const d=data.column.index-1,wd=dayOfWeek(ctx.y,ctx.m,d);if(wd===0||wd===6)data.cell.styles.fillColor=[250,204,21]}},didDrawPage:data=>{doc.setFontSize(6);doc.setTextColor(71,85,105);doc.text(`Página ${doc.internal.getNumberOfPages()} · S=saída · F=folga · R=retorno · FÉR=férias · borda roxa=data modificada`,8,doc.internal.pageSize.getHeight()-5);doc.setTextColor(15,23,42)}});
      doc.save(`${exportFileBase(ctx)}.pdf`);toast('PDF exportado.');
    }catch(err){toast(`Falha ao exportar PDF: ${err.message}`)}finally{setBusy('btnPdf',false,'PDF')}
  })
}

function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]))}
function escapeAttr(v){return escapeHtml(v).replace(/\n/g,'&#10;')}

// Histórico versionado: uma escala de arquivo jamais concede permissão para editar o banco ativo.
function updateHistoricBanner(){
  const enabled=!!state.backupId;
  el('historicoBanner').classList.toggle('hidden',!enabled);
  el('historicoBannerTexto').textContent=enabled?`VISUALIZAÇÃO HISTÓRICA #${state.backupId} — ${state.backupName}. Edição bloqueada; exportações utilizam esta versão.`:'';
  document.body.classList.toggle('history-readonly',enabled);
}
async function openHistoryModal(){
  if(!canEdit())return;
  openModal('modalHistorico');
  await loadBackupList();
  if(isAdmin()){
    el('historicoCriacao').classList.remove('hidden');
    try{
      const info=await request(`${API}/backups/fontes`);
      el('fontesHistoricas').textContent=`Fontes encontradas: pacote histórico com ${info.base_codigo.contagens.colaboradores_v5} colaboradores, ${info.base_codigo.contagens.ajustes_v5} ajustes e ${info.base_codigo.contagens.ausencias_v5} férias; banco atual com ${info.banco_atual.contagens.colaboradores_v5} colaboradores, ${info.banco_atual.contagens.ajustes_v5} ajustes e ${info.banco_atual.contagens.ausencias_v5} férias. ${info.limite}`;
    }catch(err){el('fontesHistoricas').textContent='Não foi possível analisar as fontes: '+err.message}
  }else{el('historicoCriacao').classList.add('hidden');el('fontesHistoricas').textContent='Consulta de backups existentes (somente leitura).'}
}
async function loadBackupList(){
  try{
    const rows=await request(`${API}/backups`),box=el('listaBackups');
    box.replaceChildren();
    if(!rows.length){box.textContent='Ainda não há backups criados. O administrador pode preservar a base histórica disponível e a escala atual.';return;}
    for(const r of rows){
      const card=document.createElement('div');card.className='history-entry';
      const title=document.createElement('strong');title.textContent=`#${r.id} · ${r.titulo}`;
      const meta=document.createElement('p');meta.textContent=`${new Date(r.criado_em).toLocaleString('pt-BR')} · ${r.autor_nome} · ${r.tipo==='BASE_CODIGO'?'Fonte: código histórico; não é a primeira versão comprovada':'Fonte: banco no momento do backup'} · ${r.totais.colaboradores_v5} colaboradores`;
      const buttons=document.createElement('div');buttons.className='history-buttons';
      for(const [label,fn] of [['Visualizar escala',()=>viewBackup(r)],['Baixar backup JSON',()=>downloadBackup(r)]]){
        const b=document.createElement('button');b.className='btn outline';b.textContent=label;b.addEventListener('click',fn);buttons.appendChild(b);
      }
      card.append(title,meta,buttons);box.appendChild(card);
    }
  }catch(err){el('listaBackups').textContent='Falha ao carregar backups: '+err.message;}
}
async function createHistoricalBaseline(){
  if(!isAdmin()||!confirm('Preservar a base histórica disponível em bootstrap-data.json? Ela NÃO comprova ser a primeira escala publicada e não contém alterações posteriores.'))return;
  return guarded('backup-create',async()=>{try{
    await request(`${API}/backups`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tipo:'BASE_CODIGO',titulo:'Base histórica disponível no código (origem não comprovada)',descricao:'Base incorporada ao pacote original. Não afirmar que corresponde à primeira escala publicada.'})});
    toast('Base histórica preservada.');await loadBackupList();
  }catch(err){toast(err.message)}});
}
async function createCurrentBackup(){
  if(!isAdmin())return;
  const titulo=el('backupTitulo').value.trim();if(!titulo){toast('Informe um título.');return;}
  if(!confirm('Criar um backup imutável do banco atual? Os dados atuais não serão alterados.'))return;
  return guarded('backup-create',async()=>{try{
    await request(`${API}/backups`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tipo:'ATUAL',titulo,descricao:el('backupDescricao').value})});
    toast('Versão atual preservada.');await loadBackupList();
  }catch(err){toast(err.message)}});
}
async function viewBackup(r){
  const before=state.backupId,beforeName=state.backupName;
  state.backupId=r.id;state.backupName=r.titulo;
  try{if(!(await carregar())) throw new Error('Não foi possível abrir esta versão.');updateHistoricBanner();updateAuthUI();closeModal('modalHistorico');}
  catch(err){state.backupId=before;state.backupName=beforeName;updateHistoricBanner();updateAuthUI();await carregar();toast(err.message)}
}
async function leaveHistoricalMode(){
  state.backupId=null;state.backupName='';updateHistoricBanner();updateAuthUI();await carregar();
}
async function downloadBackup(r){
  try{
    const backup=await request(`${API}/backups/${r.id}`);
    downloadBlob(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),`escala_biotec_backup_${r.id}.json`);
  }catch(err){toast('Falha no download: '+err.message)}
}

init();
