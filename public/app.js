const API = '/api/v5';
const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const statusLabel = { NORMAL:'Trabalho', SAIDA:'Saída / início da folga', FOLGA:'Folga', RETORNO:'Retorno', FERIAS:'Férias', SEM_ESCALA:'Sem escala definida' };
const statusSymbol = { NORMAL:'', SAIDA:'S', FOLGA:'', RETORNO:'R', FERIAS:'F', SEM_ESCALA:'·' };
let state = { categoria:'MOTORISTA', funcao:'', data:null, search:'', changedOnly:false, selectedEmployee:null };
const mutationLocks = new Set();

const el = id => document.getElementById(id);
const mesEl=el('mes'), anoEl=el('ano'), tabela=el('tabelaEscala'), alertas=el('alertas'), summary=el('summary');

function init(){
  meses.forEach((m,i)=>{const o=document.createElement('option');o.value=i+1;o.textContent=m;mesEl.appendChild(o)});
  const now=new Date();mesEl.value=now.getMonth()+1;anoEl.value=now.getFullYear();
  bind();carregar();
}
function bind(){
  document.querySelectorAll('.main-tab').forEach(b=>b.addEventListener('click',()=>switchCategory(b.dataset.category)));
  document.querySelectorAll('.role-pill').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.role-pill').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.funcao=b.dataset.role;carregar()}));
  mesEl.addEventListener('change',carregar); anoEl.addEventListener('change',carregar);
  el('btnHoje').addEventListener('click',()=>{const n=new Date();mesEl.value=n.getMonth()+1;anoEl.value=n.getFullYear();carregar()});
  el('busca').addEventListener('input',e=>{state.search=normalize(e.target.value);render()});
  el('somenteAlterados').addEventListener('change',e=>{state.changedOnly=e.target.checked;render()});
  el('btnNovo').addEventListener('click',()=>openEmployeeModal()); el('btnFerias').addEventListener('click',openVacationModal);
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
  document.querySelectorAll('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id)}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach(m=>closeModal(m.id))});
  el('ajusteCiclo').addEventListener('change',fillAdjustmentCycle); el('novaSaida').addEventListener('change',onNewExitChanged); el('novoRetorno').addEventListener('change',updateImpact); el('moverRetorno').addEventListener('change',()=>{if(el('moverRetorno').checked)onNewExitChanged();else updateImpact()});
  el('btnSalvarAjuste').addEventListener('click',saveAdjustment); el('btnReverterAjuste').addEventListener('click',revertAdjustment);
  el('btnSalvarColab').addEventListener('click',saveEmployee); el('btnDesativarColab').addEventListener('click',deactivateEmployee);
  el('btnSalvarFerias').addEventListener('click',saveVacation); el('feriasColaborador').addEventListener('change',renderExistingVacations);
}
function switchCategory(cat){state.categoria=cat;state.funcao='';document.querySelectorAll('.main-tab').forEach(b=>b.classList.toggle('active',b.dataset.category===cat));el('roleFilters').classList.toggle('hidden',cat!=='OPERADOR');document.querySelectorAll('.role-pill').forEach((b,i)=>b.classList.toggle('active',i===0));carregar()}
function normalize(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim()}
function fmtBR(iso){if(!iso)return'—';const [y,m,d]=iso.split('-');return `${d}/${m}/${y}`}
function addDaysISO(iso,n){const [y,m,d]=iso.split('-').map(Number);const dt=new Date(Date.UTC(y,m-1,d));dt.setUTCDate(dt.getUTCDate()+n);return dt.toISOString().slice(0,10)}
function daysBetween(a,b){const da=new Date(a+'T00:00:00Z'),db=new Date(b+'T00:00:00Z');return Math.round((db-da)/86400000)}
function daysInMonth(y,m){return new Date(y,m,0).getDate()}
function dayOfWeek(y,m,d){return new Date(y,m-1,d,12).getDay()}
function toast(msg){const t=el('toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._tm);t._tm=setTimeout(()=>t.classList.remove('show'),3000)}
async function request(url,opts={}){const r=await fetch(url,{cache:'no-store',...opts});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.erro||'Erro na operação');return data}
async function guarded(key,fn){if(mutationLocks.has(key))return;mutationLocks.add(key);try{return await fn()}finally{mutationLocks.delete(key)}}
async function carregar(){
  try{const q=new URLSearchParams({categoria:state.categoria,mes:mesEl.value,ano:anoEl.value});if(state.funcao)q.set('funcao',state.funcao);state.data=await request(`${API}/escala?${q}&_=${Date.now()}`);render()}catch(e){toast(e.message)}
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
    h+=`<tr class="${e.changed?'row-changed':''}" data-id="${e.id}"><td class="sticky-name employee-name ${nameCls}" title="${escapeAttr(nameTitle)}"><div class="name-line"><span class="name-actions"><button class="name-action ${e.changed?'adjusted':''}" data-action="adjust" data-id="${e.id}" title="Ajustar escala" aria-label="Ajustar escala" ${!e.anchor_saida?'disabled':''}>⚙</button><button class="name-action" data-action="edit" data-id="${e.id}" title="Editar colaborador" aria-label="Editar colaborador">✏</button><button class="name-action danger" data-action="delete" data-id="${e.id}" title="Excluir da escala (preserva histórico)" aria-label="Excluir colaborador">🗑</button></span><span class="name-text">${escapeHtml(e.nome)}</span>${badges}</div></td><td class="sticky-role"><span class="role-badge">${escapeHtml(role||'—')}</span></td>`;
    for(const c of e.cells){const curr=c.current,base=c.base,changed=c.changed;const orig=changed?`<span class="orig-mark" title="Original: ${statusLabel[base]}">${statusSymbol[base]||'•'}</span>`:'';const tt=`${e.nome} · ${fmtBR(c.date)}\nOriginal: ${statusLabel[base]}\nAtual: ${statusLabel[curr]}${changed?'\nDATA MODIFICADA':''}`;h+=`<td class="day-cell ${curr} ${changed?'changed ':''}${curr==='NORMAL'?'current-normal':''}" title="${escapeAttr(tt)}" data-action="cell" data-id="${e.id}" data-day="${c.day}">${orig}${statusSymbol[curr]}</td>`}
    h+='</tr>';
  }
  if(!arr.length)h+=`<tr><td colspan="${total+2}" class="empty-table">Nenhum colaborador encontrado nesta visualização.</td></tr>`;
  tabela.innerHTML=h+'</tbody>';
  tabela.querySelectorAll('[data-action="adjust"]').forEach(b=>b.addEventListener('click',()=>openAdjustment(Number(b.dataset.id))));
  tabela.querySelectorAll('[data-action="edit"]').forEach(b=>b.addEventListener('click',()=>openEmployeeModal(Number(b.dataset.id))));
  tabela.querySelectorAll('[data-action="delete"]').forEach(b=>b.addEventListener('click',()=>quickDeactivate(Number(b.dataset.id))));
  tabela.querySelectorAll('[data-action="cell"]').forEach(td=>td.addEventListener('dblclick',()=>openAdjustment(Number(td.dataset.id),Number(td.dataset.day))));
}
function findEmployee(id){return state.data?.employees.find(e=>Number(e.id)===Number(id))}
function openModal(id){el(id).classList.remove('hidden');el(id).setAttribute('aria-hidden','false')}
function closeModal(id){el(id).classList.add('hidden');el(id).setAttribute('aria-hidden','true')}
function openAdjustment(id,day){const e=findEmployee(id);if(!e)return;if(!e.anchor_saida){toast('Defina primeiro a data base deste colaborador.');return}state.selectedEmployee=e;el('ajusteNome').textContent=`${e.nome} · ${e.funcao||e.subtipo||''} · regime ${e.regime_trabalho}/${e.regime_folga}`;const sel=el('ajusteCiclo');sel.innerHTML=e.cycles.map((c,i)=>`<option value="${i}">${fmtBR(c.base_saida)} → ${fmtBR(c.base_retorno)}${c.adjusted?' · AJUSTADO':''}</option>`).join('');if(day){const target=`${state.data.ano}-${String(state.data.mes).padStart(2,'0')}-${String(day).padStart(2,'0')}`;let best=0,bestD=1e9;e.cycles.forEach((c,i)=>{const d=Math.abs(daysBetween(c.base_saida,target));if(d<bestD){best=i;bestD=d}});sel.value=String(best)}fillAdjustmentCycle();openModal('modalAjuste')}
function selectedCycle(){const e=state.selectedEmployee;if(!e)return null;return e.cycles[Number(el('ajusteCiclo').value||0)]}
function fillAdjustmentCycle(){const e=state.selectedEmployee,c=selectedCycle();if(!e||!c)return;el('originalSaida').textContent=fmtBR(c.base_saida);el('originalRetorno').textContent=fmtBR(c.base_retorno);el('novaSaida').value=c.nova_saida;el('novoRetorno').value=c.novo_retorno;el('ajusteObs').value=c.observacao||'';el('moverRetornoTexto').textContent=`Mover o retorno junto e manter ${e.regime_folga} dias de folga`;el('moverRetorno').checked=false;el('btnReverterAjuste').classList.toggle('hidden',!c.adjusted);updateImpact()}
function onNewExitChanged(){const e=state.selectedEmployee;if(el('moverRetorno').checked&&e&&el('novaSaida').value)el('novoRetorno').value=addDaysISO(el('novaSaida').value,Number(e.regime_folga));updateImpact()}
function updateImpact(){const e=state.selectedEmployee,c=selectedCycle();if(!e||!c)return;const nova=el('novaSaida').value,ret=el('novoRetorno').value;if(!nova||!ret){el('ajusteImpacto').textContent='Informe nova saída e novo retorno.';return}const shift=daysBetween(c.base_saida,nova);const off=daysBetween(nova,ret);const newWork=(Number(e.regime_trabalho)+Number(e.regime_folga))-off;const delta=newWork-Number(e.regime_trabalho);el('ajusteImpacto').innerHTML=`A saída foi deslocada <b>${shift>=0?'+':''}${shift} dia(s)</b>. Folga neste ciclo: <b>${off} dia(s)</b>. Trabalho no ciclo: <b>${e.regime_trabalho} → ${newWork} dia(s)</b> <span style="color:#7c3aed">(${delta>=0?'+':''}${delta})</span>. A escala mensal será recalculada automaticamente.`}
async function saveAdjustment(){return guarded('saveAdjustment',async()=>{const e=state.selectedEmployee,c=selectedCycle();if(!e||!c)return;try{await request(`${API}/ajustes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({colaborador_id:e.id,base_saida:c.base_saida,nova_saida:el('novaSaida').value,novo_retorno:el('novoRetorno').value,observacao:el('ajusteObs').value})});closeModal('modalAjuste');toast('Ajuste salvo. A escala original foi preservada.');await carregar()}catch(err){toast(err.message)}})}
async function revertAdjustment(){return guarded('revertAdjustment',async()=>{const e=state.selectedEmployee,c=selectedCycle();if(!e||!c)return;if(!confirm(`Reverter ${e.nome} para as datas originais deste ciclo?`))return;try{await request(`${API}/ajustes?colaborador_id=${e.id}&base_saida=${encodeURIComponent(c.base_saida)}`,{method:'DELETE'});closeModal('modalAjuste');toast('Ciclo revertido para o original.');await carregar()}catch(err){toast(err.message)}})}
function openEmployeeModal(id=null){const e=id?findEmployee(id):null;state.selectedEmployee=e;el('colabModalTitulo').textContent=e?'Editar colaborador':'Novo colaborador';el('colabId').value=e?.id||'';el('colabNome').value=e?.nome||'';el('colabCategoria').value=state.categoria==='MOTORISTA'?'Motorista — 23/7':'Operador — 24/6';el('fieldFuncao').classList.toggle('hidden',state.categoria!=='OPERADOR');el('fieldSubtipo').classList.toggle('hidden',state.categoria!=='MOTORISTA');el('colabFuncao').value=e?.funcao||state.funcao||'SKIDDER';el('colabSubtipo').value=e?.subtipo||'FIXO';el('colabAnchor').value=e?.anchor_saida||'';el('colabObs').value=e?.observacao||'';el('btnDesativarColab').classList.toggle('hidden',!e);openModal('modalColaborador')}
async function saveEmployee(){return guarded('saveEmployee',async()=>{const id=Number(el('colabId').value||0);const body={nome:el('colabNome').value,categoria:state.categoria,funcao:el('colabFuncao').value,subtipo:el('colabSubtipo').value,anchor_saida:el('colabAnchor').value,observacao:el('colabObs').value};try{await request(id?`${API}/colaboradores/${id}`:`${API}/colaboradores`,{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});closeModal('modalColaborador');toast(id?'Cadastro atualizado.':'Colaborador adicionado.');await carregar()}catch(err){toast(err.message)}})}
async function quickDeactivate(id){const e=findEmployee(id);if(!e)return;if(!confirm(`Excluir ${e.nome} da escala?\n\nO cadastro será desativado, mas o histórico e os ajustes serão preservados.`))return;return guarded(`deleteEmployee:${id}`,async()=>{try{await request(`${API}/colaboradores/${id}`,{method:'DELETE'});toast('Colaborador removido da escala. Histórico preservado.');await carregar()}catch(err){toast(err.message)}})}
async function deactivateEmployee(){const e=state.selectedEmployee;if(!e||!confirm(`Desativar ${e.nome}? O histórico será preservado.`))return;return guarded(`deleteEmployee:${e.id}`,async()=>{try{await request(`${API}/colaboradores/${e.id}`,{method:'DELETE'});closeModal('modalColaborador');toast('Colaborador desativado.');await carregar()}catch(err){toast(err.message)}})}
function openVacationModal(){const arr=state.data?.employees||[];const s=el('feriasColaborador');s.innerHTML=arr.map(e=>`<option value="${e.id}">${escapeHtml(e.nome)}${e.funcao?` · ${escapeHtml(e.funcao)}`:''}</option>`).join('');const y=Number(state.data.ano),m=Number(state.data.mes);el('feriasInicio').value=`${y}-${String(m).padStart(2,'0')}-01`;el('feriasFim').value=el('feriasInicio').value;el('feriasObs').value='';renderExistingVacations();openModal('modalFerias')}
function renderExistingVacations(){const e=findEmployee(Number(el('feriasColaborador').value));const box=el('feriasExistentes');if(!e||!e.absences?.length){box.innerHTML='<span style="color:#94a3b8;font-size:11px">Nenhum período neste mês.</span>';return}box.innerHTML=e.absences.map(a=>`<div class="absence-item"><span>${fmtBR(a.inicio)} → ${fmtBR(a.fim)} ${a.observacao?`· ${escapeHtml(a.observacao)}`:''}</span><button data-del-vac="${a.id}">remover</button></div>`).join('');box.querySelectorAll('[data-del-vac]').forEach(b=>b.addEventListener('click',()=>deleteVacation(Number(b.dataset.delVac))))}
async function saveVacation(){return guarded('saveVacation',async()=>{const id=Number(el('feriasColaborador').value);if(!id)return;try{await request(`${API}/ferias`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({colaborador_id:id,inicio:el('feriasInicio').value,fim:el('feriasFim').value,observacao:el('feriasObs').value})});closeModal('modalFerias');toast('Férias registradas sem apagar a escala original.');await carregar()}catch(err){toast(err.message)}})}
async function deleteVacation(id){if(!confirm('Remover este período de férias?'))return;return guarded(`deleteVacation:${id}`,async()=>{try{await request(`${API}/ferias/${id}`,{method:'DELETE'});toast('Férias removidas.');await carregar();openVacationModal()}catch(err){toast(err.message)}})}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]))}
function escapeAttr(v){return escapeHtml(v).replace(/\n/g,'&#10;')}
init();
