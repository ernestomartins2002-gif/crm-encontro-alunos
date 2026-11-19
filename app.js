// CRM · Encontro de Alunos
// Funciona com Supabase (equipe compartilhada) ou em modo demonstração (localStorage).

const CFG = window.CRM_CONFIG || {};
const DEMO = !CFG.supabaseUrl || !CFG.supabaseAnonKey;

const ORIGENS = {
  enquete:  { nome: 'Enquete do grupo',            curto: 'Enquete do grupo' },
  caixinha: { nome: 'Caixinha de perguntas',       curto: 'Caixinha de perguntas' },
  formacao: { nome: 'Cakto · Formação Elite',      curto: 'Cakto · Formação' },
  gps:      { nome: 'GPS · MS e estados vizinhos', curto: 'Comprador do GPS' },
};
const ETAPAS = {
  ligou1: 'Ligou 1 vez',
  ligou2: 'Ligou 2 vezes',
  ligou3: 'Ligou 3 vezes',
  ligou4: 'Ligou 4 vezes',
  ligou5: 'Ligou 5 vezes',
  atendeu: 'Atendeu a ligação',
  interesse: 'Demonstrou interesse',
  comprou: 'Comprou o ingresso',
};
const PROXIMA_LIGACAO = { origem: 'ligou1', ligou1: 'ligou2', ligou2: 'ligou3', ligou3: 'ligou4', ligou4: 'ligou5' };
const COLUNAS = [
  ...Object.entries(ORIGENS).map(([id, o]) => ({ key: 'o:' + id, nome: o.nome, tipo: 'origem', origem: id })),
  ...Object.entries(ETAPAS).map(([id, nome]) => ({ key: id, nome, tipo: 'funil', etapa: id })),
];

// ---------- utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dig = s => String(s ?? '').replace(/\D/g, '');
const semAcento = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hoje = () => new Date().toLocaleDateString('sv-SE');
const agora = () => new Date().toISOString();
const fmtData = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const fmtDataHora = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const telValido = t => dig(t).length >= 10;
const colunaDoLead = l => (l.etapa === 'origem' ? 'o:' + l.origem_principal : l.etapa);
const nomeEtapa = (etapa, l) => (etapa === 'origem' ? `origem (${ORIGENS[l.origem_principal]?.nome})` : ETAPAS[etapa]);
const icone = id => `<svg><use href="#i-${id}"/></svg>`;

let toastTimer;
function toast(msg, erro = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('erro', erro);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), erro ? 6000 : 3500);
}
function falha(e) {
  console.error(e);
  toast('Não foi possível salvar: ' + (e?.message || e), true);
}

// ---------- armazenamento: Supabase ----------
async function supabaseStore() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const sb = createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  const ok = ({ data, error }) => { if (error) throw error; return data; };
  return {
    async session() { return (await sb.auth.getSession()).data.session; },
    async login(email, senha) { ok(await sb.auth.signInWithPassword({ email, password: senha })); },
    async logout() { await sb.auth.signOut(); },
    async user() {
      const u = (await sb.auth.getUser()).data.user;
      if (!u) return null;
      const p = ok(await sb.from('perfis').select('*').eq('id', u.id).maybeSingle());
      if (!p) throw new Error('Seu usuário não tem perfil. Rode o schema.sql de novo no Supabase.');
      return { id: u.id, email: u.email, nome: p.nome || '', papel: p.papel };
    },
    async setNome(nome) { ok(await sb.from('perfis').update({ nome }).eq('id', (await sb.auth.getUser()).data.user.id)); },
    async perfis() { return ok(await sb.from('perfis').select('id,nome,email,papel,ativo').order('nome')); },
    async atribuir(ids, responsavel_id, patchExtra) {
      for (let i = 0; i < ids.length; i += 150) {
        ok(await sb.from('leads').update({ responsavel_id, ...patchExtra }).in('id', ids.slice(i, i + 150)));
      }
    },
    async addHistoricos(lista) {
      for (let i = 0; i < lista.length; i += 500) ok(await sb.from('historico').insert(lista.slice(i, i + 500)));
    },
    async leads() {
      const todos = [];
      for (let de = 0; ; de += 1000) {
        const pg = ok(await sb.from('leads').select('*').order('criado_em').order('id').range(de, de + 999));
        todos.push(...pg);
        if (pg.length < 1000) return todos;
      }
    },
    async updateLead(id, patch) { return ok(await sb.from('leads').update(patch).eq('id', id).select().single()); },
    async importar(linhas) {
      let novos = 0;
      for (let i = 0; i < linhas.length; i += 500) {
        const r = ok(await sb.from('leads').upsert(linhas.slice(i, i + 500), { onConflict: 'chave', ignoreDuplicates: true }).select('id'));
        novos += r.length;
      }
      return novos;
    },
    async tarefasPendentes() { return ok(await sb.from('tarefas').select('*').eq('feita', false)); },
    async tarefas(leadId) { return ok(await sb.from('tarefas').select('*').eq('lead_id', leadId).order('feita').order('data')); },
    async addTarefa(t) { return ok(await sb.from('tarefas').insert(t).select().single()); },
    async updateTarefa(id, patch) { return ok(await sb.from('tarefas').update(patch).eq('id', id).select().single()); },
    async delTarefa(id) { ok(await sb.from('tarefas').delete().eq('id', id)); },
    async observacoes(leadId) { return ok(await sb.from('observacoes').select('*').eq('lead_id', leadId).order('criado_em', { ascending: false })); },
    async addObservacao(o) { return ok(await sb.from('observacoes').insert(o).select().single()); },
    async historico(leadId) { return ok(await sb.from('historico').select('*').eq('lead_id', leadId).order('criado_em', { ascending: false })); },
    async addHistorico(h) { ok(await sb.from('historico').insert(h)); },
    onChange(cb) {
      sb.channel('crm')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, p => cb('leads', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas' }, p => cb('tarefas', p))
        .subscribe();
    },
  };
}

// ---------- armazenamento: demonstração (só neste navegador) ----------
function demoStore() {
  const K = 'crm-encontro-demo';
  let db = null;
  try { db = JSON.parse(localStorage.getItem(K)); } catch { /* sem storage */ }
  if (!db || !db.perfis) db = {
    perfis: [{ id: 'demo-gestor', nome: '', email: '', papel: 'admin', ativo: true }],
    comoId: 'demo-gestor', leads: [], tarefas: [], observacoes: [], historico: [],
  };
  const salvar = () => { try { localStorage.setItem(K, JSON.stringify(db)); } catch { /* cheio ou bloqueado */ } };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random());
  const doLead = (arr, id) => arr.filter(x => x.lead_id === id).map(x => ({ ...x }));
  const eu = () => db.perfis.find(p => p.id === db.comoId) || db.perfis[0];
  return {
    async session() { return {}; },
    async login() {},
    async logout() { db.comoId = 'demo-gestor'; salvar(); },
    async user() { const p = eu(); return { id: p.id, email: '', nome: p.nome, papel: p.papel }; },
    async setNome(n) { eu().nome = n; salvar(); },
    async perfis() { return db.perfis.map(p => ({ ...p })); },
    async addVendedor(nome) { db.perfis.push({ id: uid(), nome, email: '', papel: 'vendedor', ativo: true }); salvar(); },
    verComo(id) { db.comoId = id; salvar(); },
    async atribuir(ids, responsavel_id, patchExtra) {
      const set = new Set(ids);
      for (const l of db.leads) if (set.has(l.id)) Object.assign(l, { responsavel_id, ...patchExtra });
      salvar();
    },
    async addHistoricos(lista) { for (const h of lista) db.historico.push({ id: uid(), criado_em: agora(), ...h }); salvar(); },
    // simula a regra do banco: vendedor só recebe os leads dele
    async leads() {
      const p = eu();
      return db.leads.filter(l => p.papel === 'admin' || l.responsavel_id === p.id).map(l => ({ ...l }));
    },
    async updateLead(id, patch) { const l = db.leads.find(x => x.id === id); Object.assign(l, patch); salvar(); return { ...l }; },
    async importar(linhas) {
      const existe = new Set(db.leads.map(l => l.chave));
      let novos = 0;
      for (const r of linhas) {
        if (existe.has(r.chave)) continue;
        existe.add(r.chave);
        db.leads.push({ id: uid(), etapa: 'origem', sem_interesse: false, responsavel_id: null, criado_em: agora(), atualizado_em: agora(), ...r });
        novos++;
      }
      salvar();
      return novos;
    },
    async tarefasPendentes() {
      const meus = new Set((await this.leads()).map(l => l.id));
      return db.tarefas.filter(t => !t.feita && meus.has(t.lead_id)).map(t => ({ ...t }));
    },
    async tarefas(id) { return doLead(db.tarefas, id).sort((a, b) => a.feita - b.feita || a.data.localeCompare(b.data)); },
    async addTarefa(t) { const n = { id: uid(), feita: false, feita_em: null, autor_id: eu().id, criado_em: agora(), ...t }; db.tarefas.push(n); salvar(); return { ...n }; },
    async updateTarefa(id, p) { const t = db.tarefas.find(x => x.id === id); Object.assign(t, p); salvar(); return { ...t }; },
    async delTarefa(id) { db.tarefas = db.tarefas.filter(x => x.id !== id); salvar(); },
    async observacoes(id) { return doLead(db.observacoes, id).sort((a, b) => b.criado_em.localeCompare(a.criado_em)); },
    async addObservacao(o) { const n = { id: uid(), criado_em: agora(), ...o }; db.observacoes.push(n); salvar(); return { ...n }; },
    async historico(id) { return doLead(db.historico, id).sort((a, b) => b.criado_em.localeCompare(a.criado_em)); },
    async addHistorico(h) { db.historico.push({ id: uid(), criado_em: agora(), ...h }); salvar(); },
    onChange() {},
  };
}

// ---------- estado ----------
const state = { leads: [], pendentes: [], perfis: [], user: null, busca: '', filtro: 'todos', verSemInteresse: false, aberto: null };
let store;
const porId = id => state.leads.find(l => l.id === id);
const souAdmin = () => state.user?.papel === 'admin';
const nomeDe = id => state.perfis.find(p => p.id === id)?.nome || 'Vendedor sem nome';
const vendedores = () => state.perfis.filter(p => p.ativo !== false && p.nome).sort((a, b) => a.nome.localeCompare(b.nome));

function substituirLead(novo) {
  const i = state.leads.findIndex(l => l.id === novo.id);
  if (i >= 0) state.leads[i] = novo; else state.leads.push(novo);
}

// ---------- início ----------
async function iniciar() {
  $('#evento').textContent = CFG.evento || '';
  try {
    store = DEMO ? demoStore() : await supabaseStore();
  } catch (e) {
    document.body.innerHTML = `<p style="padding:24px">Não foi possível carregar o CRM: ${esc(e.message)}</p>`;
    return;
  }
  $('#demo-banner').hidden = !DEMO;
  ligarEventosFixos();
  if (await store.session()) await entrar();
  else $('#login').hidden = false;
}

async function entrar() {
  state.user = await store.user();
  if (!state.user.nome) {
    state.user.nome = await pedirNome();
    await store.setNome(state.user.nome);
  }
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#usuario-nome').textContent = state.user.nome;
  $('#usuario-papel').textContent = souAdmin() ? 'Gestor' : 'Vendedor';
  $('#usuario-papel').classList.toggle('vendedor', !souAdmin());
  document.body.classList.toggle('admin', souAdmin());
  $('#menu-papel').textContent = souAdmin() ? 'Gestor: vê todos os leads' : 'Vendedor: vê só os seus leads';
  montarQuadro();
  await recarregar();
  store.onChange(onRemoto);
  setInterval(atualizarSino, 60_000);
  // quando o gestor tira um lead de um vendedor, ele some na próxima atualização
  setInterval(() => recarregar().catch(() => {}), 120_000);
  let ultimoFoco = Date.now();
  window.addEventListener('focus', () => {
    if (Date.now() - ultimoFoco > 30_000) { ultimoFoco = Date.now(); recarregar().catch(() => {}); }
  });
  const n = minhasTarefasDeHoje().length;
  if (n) toast(`Você tem ${n} tarefa${n > 1 ? 's' : ''} para hoje. Veja no sininho.`);
}

function pedirNome() {
  return new Promise(resolve => {
    const m = $('#nome-modal');
    const tag = $('#nome-papel');
    tag.textContent = souAdmin() ? 'Você entrou como GESTOR' : 'Você entrou como VENDEDOR';
    tag.classList.toggle('vendedor', !souAdmin());
    $('#nome-explica').textContent = souAdmin()
      ? (DEMO
        ? 'No modo demonstração, quem abre o CRM entra como gestor. Na versão da equipe, cada pessoa entra com e-mail e senha, e quem é gestor é definido no Supabase.'
        : 'Você vê todos os leads e divide os leads entre os vendedores. Seu nome aparece nas observações e no histórico.')
      : 'Você vê somente os leads que o gestor passou para você. Seu nome aparece nas observações, nas tarefas e no histórico.';
    m.hidden = false;
    $('#nome-input').focus();
    $('#nome-form').onsubmit = e => {
      e.preventDefault();
      const nome = $('#nome-input').value.trim();
      if (!nome) return;
      m.hidden = true;
      resolve(nome);
    };
  });
}

async function recarregar() {
  [state.leads, state.pendentes, state.perfis] = await Promise.all([store.leads(), store.tarefasPendentes(), store.perfis()]);
  if (state.aberto && !porId(state.aberto)) fecharFicha();
  montarFiltro();
  renderQuadro();
  atualizarSino();
  if (!$('#equipe-modal').hidden) renderEquipe();
}

function montarFiltro() {
  const sel = $('#filtro');
  sel.hidden = !souAdmin();
  $('#demo-vercomo').hidden = !DEMO;
  if (!souAdmin()) return;
  const opcoes = [['todos', 'Todos os vendedores'], ['livres', 'Sem vendedor'], ...vendedores().map(p => [p.id, p.nome])];
  if (!opcoes.some(([v]) => v === state.filtro)) state.filtro = 'todos';
  sel.innerHTML = opcoes.map(([v, t]) => `<option value="${esc(v)}"${v === state.filtro ? ' selected' : ''}>${esc(t)}</option>`).join('');
}

// ---------- quadro ----------
function montarQuadro() {
  const board = $('#board');
  board.innerHTML = '';
  COLUNAS.forEach((c, i) => {
    if (i > 0 && COLUNAS[i - 1].tipo === 'origem' && c.tipo === 'funil') {
      const d = document.createElement('div');
      d.className = 'divisor';
      board.appendChild(d);
    }
    const col = document.createElement('section');
    col.className = `coluna ${c.tipo === 'origem' ? 'orig-' + c.origem : 'et-' + c.etapa}`;
    col.dataset.key = c.key;
    col.innerHTML = `<header class="col-head"><span class="col-tag">${c.tipo === 'origem' ? 'Origem' : 'Funil'}</span><h2>${esc(c.nome)}</h2><span class="col-count">0</span></header><div class="col-body"></div>`;
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drop'); });
    col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop'); });
    col.addEventListener('drop', e => {
      e.preventDefault();
      col.classList.remove('drop');
      const l = porId(e.dataTransfer.getData('text/plain'));
      if (l) mover(l, c.tipo === 'origem' ? 'origem' : c.etapa);
    });
    board.appendChild(col);
  });
  board.addEventListener('click', e => {
    if (e.target.closest('a')) return;
    const card = e.target.closest('.card');
    if (card) abrirLead(card.dataset.id);
  });
  board.addEventListener('dragstart', e => {
    const card = e.target.closest?.('.card');
    if (!card) return;
    e.dataTransfer.setData('text/plain', card.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('arrastando');
  });
  board.addEventListener('dragend', e => e.target.closest?.('.card')?.classList.remove('arrastando'));
}

function proximaTarefaPorLead() {
  const m = new Map();
  for (const t of state.pendentes) {
    const atual = m.get(t.lead_id);
    if (!atual || t.data < atual) m.set(t.lead_id, t.data);
  }
  return m;
}

function passaFiltro(l) {
  if (l.sem_interesse && !state.verSemInteresse) return false;
  if (souAdmin()) {
    if (state.filtro === 'livres' && l.responsavel_id) return false;
    if (state.filtro !== 'todos' && state.filtro !== 'livres' && l.responsavel_id !== state.filtro) return false;
  }
  const q = semAcento(state.busca.trim());
  if (!q) return true;
  const qd = dig(state.busca);
  if (semAcento(`${l.nome} ${l.email || ''}`).includes(q)) return true;
  return qd.length >= 3 && dig(l.telefone).includes(qd);
}

function renderQuadro() {
  const tarefas = proximaTarefaPorLead();
  const grupos = new Map(COLUNAS.map(c => [c.key, []]));
  for (const l of state.leads) if (passaFiltro(l)) grupos.get(colunaDoLead(l))?.push(l);

  for (const c of COLUNAS) {
    const col = $(`.coluna[data-key="${c.key}"]`);
    const body = $('.col-body', col);
    const lista = grupos.get(c.key);
    if (c.tipo === 'funil') {
      lista.sort((a, b) => (tarefas.get(a.id) || '9').localeCompare(tarefas.get(b.id) || '9') || String(b.atualizado_em).localeCompare(String(a.atualizado_em)));
    } else {
      lista.sort((a, b) => (tarefas.get(a.id) || '9').localeCompare(tarefas.get(b.id) || '9'));
    }
    $('.col-count', col).textContent = lista.length;
    const topo = body.scrollTop;
    body.innerHTML = lista.length ? lista.map(l => cardHTML(l, tarefas.get(l.id))).join('') : '<p class="vazio">Nenhum lead aqui</p>';
    body.scrollTop = topo;
  }

  const ativos = state.leads.filter(l => !l.sem_interesse);
  const vendidos = state.leads.filter(l => l.etapa === 'comprou').length;
  const emContato = ativos.filter(l => l.etapa !== 'origem' && l.etapa !== 'comprou').length;
  $('#resumo').innerHTML =
    `<span><strong>${state.leads.length}</strong>leads</span>` +
    `<span><strong>${emContato}</strong>em contato</span>` +
    `<span class="vendidos"><strong>${vendidos}</strong>ingressos vendidos</span>`;
}

function chipsHTML(l) {
  const chips = String(l.origens || l.origem_principal).split(',').filter(id => ORIGENS[id])
    .map(id => `<span class="chip c-${id}">${esc(ORIGENS[id].curto)}</span>`);
  if (l.sem_interesse) chips.push('<span class="chip sem">Sem interesse</span>');
  return chips.join('');
}

function cardHTML(l, proxTarefa) {
  const tel = telValido(l.telefone)
    ? `<a class="card-tel" href="tel:+55${dig(l.telefone)}">${icone('phone')}${esc(l.telefone)}</a>`
    : '<span class="card-tel falta">Sem número · verificar</span>';
  const meta = [];
  if (souAdmin()) {
    meta.push(l.responsavel_id
      ? `<span>${icone('user')}${esc(nomeDe(l.responsavel_id))}</span>`
      : `<span style="color:var(--c-enquete)">${icone('user')}Sem vendedor</span>`);
  }
  if (proxTarefa) meta.push(`<span class="${proxTarefa <= hoje() ? 'atrasada' : ''}">${icone('clock')}${proxTarefa === hoje() ? 'Hoje' : fmtData(proxTarefa)}</span>`);
  return `<article class="card${l.sem_interesse ? ' sem-interesse' : ''}" draggable="true" data-id="${esc(l.id)}">
    <div class="card-nome">${esc(l.nome)}</div>
    ${tel}
    <div class="chips">${chipsHTML(l)}</div>
    ${meta.length ? `<div class="card-meta">${meta.join('')}</div>` : ''}
  </article>`;
}

let renderPendente;
function agendarRender() {
  cancelAnimationFrame(renderPendente);
  renderPendente = requestAnimationFrame(renderQuadro);
}

// ---------- ações sobre o lead ----------
async function salvarLead(l, patch, descricaoHistorico) {
  const antes = { ...l };
  const novo = { ...l, ...patch, atualizado_em: agora(), atualizado_por: state.user.nome };
  substituirLead(novo);
  agendarRender();
  if (state.aberto === l.id) renderFichaTopo(novo);
  try {
    const salvo = await store.updateLead(l.id, { ...patch, atualizado_em: novo.atualizado_em, atualizado_por: novo.atualizado_por });
    substituirLead(salvo);
    if (descricaoHistorico) {
      await store.addHistorico({ lead_id: l.id, descricao: descricaoHistorico, autor: state.user.nome });
      if (state.aberto === l.id) carregarHistorico(l.id);
    }
  } catch (e) {
    substituirLead(antes);
    agendarRender();
    if (state.aberto === l.id) renderFichaTopo(antes);
    falha(e);
  }
}

function mover(l, etapa) {
  if (l.etapa === etapa) return;
  salvarLead(l, { etapa },`Moveu de "${nomeEtapa(l.etapa, l)}" para "${nomeEtapa(etapa, l)}"`);
}

// ---------- ficha do lead ----------
function abrirLead(id) {
  const l = porId(id);
  if (!l) return;
  state.aberto = id;
  $('#modal').hidden = false;
  document.body.classList.add('modal-aberto');
  $('#sino-painel').hidden = true;
  $('#tarefa-desc').value = '';
  $('#tarefa-data').value = hoje();
  $('#obs-texto').value = '';
  renderFichaTopo(l);
  for (const s of ['#tarefa-lista', '#obs-lista', '#hist-lista']) $(s).innerHTML = '<p class="vazio">Carregando…</p>';
  carregarTarefas(id);
  carregarObservacoes(id);
  carregarHistorico(id);
}

function fecharFicha() {
  state.aberto = null;
  $('#modal').hidden = true;
  document.body.classList.remove('modal-aberto');
}

function renderFichaTopo(l) {
  $('#m-nome').textContent = l.nome;
  const tel = $('#m-tel');
  const valido = telValido(l.telefone);
  tel.textContent = valido ? l.telefone : 'Sem número: confira no WhatsApp ou na Cakto';
  tel.classList.toggle('falta', !valido);
  $('#m-ligar').hidden = $('#m-whats').hidden = !valido;
  if (valido) {
    $('#m-ligar').href = `tel:+55${dig(l.telefone)}`;
    $('#m-whats').href = `https://wa.me/55${dig(l.telefone)}`;
  }
  $('#m-email').textContent = l.email || '';
  $('#m-email').hidden = !l.email;
  $('#m-chips').innerHTML = chipsHTML(l);
  $('#m-importada').textContent = l.observacao_importada ? 'Da planilha: ' + l.observacao_importada : '';
  $('#m-importada').hidden = !l.observacao_importada;

  const opcoes = [['origem', 'Voltar para a origem'], ...Object.entries(ETAPAS)];
  $('#m-etapas').innerHTML = opcoes.map(([id, nome]) =>
    `<button class="etapa${l.etapa === id ? ' ativa' : ''}" data-etapa="${id}">${esc(nome)}</button>`).join('');

  const prox = PROXIMA_LIGACAO[l.etapa];
  const reg = $('#m-registrar');
  reg.disabled = !prox;
  $('span', reg).textContent = prox ? `Registrar ligação sem resposta → ${ETAPAS[prox]}` : (l.etapa === 'ligou5' ? 'Já foram 5 ligações' : 'Ligação já atendida');

  $('#m-resp').hidden = souAdmin();
  $('#m-resp').textContent = 'Lead atribuído a você';
  if (souAdmin()) {
    const opcoes = [['', '— Sem vendedor —'], ...vendedores().map(p => [p.id, p.nome])];
    $('#m-resp-select').innerHTML = opcoes.map(([v, t]) => `<option value="${esc(v)}"${v === (l.responsavel_id || '') ? ' selected' : ''}>${esc(t)}</option>`).join('');
  }
  $('#m-sem-interesse').textContent = l.sem_interesse ? 'Reativar lead' : 'Marcar sem interesse';
}

async function carregarTarefas(id) {
  try {
    const lista = await store.tarefas(id);
    if (state.aberto !== id) return;
    const h = hoje();
    $('#tarefa-lista').innerHTML = lista.length ? lista.map(t => `
      <li class="tarefa${t.feita ? ' feita' : ''}" data-id="${esc(t.id)}">
        <input type="checkbox" ${t.feita ? 'checked' : ''} aria-label="Marcar como feita">
        <div><div class="desc">${esc(t.descricao)}</div>
          <div class="info"><span class="${!t.feita && t.data <= h ? 'atrasada' : ''}">${t.data === h ? 'Hoje' : fmtData(t.data)}</span> · ${esc(t.autor || '')}</div></div>
        <button class="del" aria-label="Excluir tarefa">${icone('trash')}</button>
      </li>`).join('') : '<p class="vazio">Nenhuma ação agendada.</p>';
  } catch (e) { falha(e); }
}

async function carregarObservacoes(id) {
  try {
    const lista = await store.observacoes(id);
    if (state.aberto !== id) return;
    $('#obs-lista').innerHTML = lista.length ? lista.map(o => `
      <li><div class="obs-texto">${esc(o.texto)}</div><div class="info">${fmtDataHora(o.criado_em)} · ${esc(o.autor || '')}</div></li>`).join('')
      : '<p class="vazio">Nenhuma observação ainda.</p>';
  } catch (e) { falha(e); }
}

async function carregarHistorico(id) {
  try {
    const lista = await store.historico(id);
    if (state.aberto !== id) return;
    $('#hist-lista').innerHTML = lista.length ? lista.map(h => `
      <li>${esc(h.descricao)}<div class="info">${fmtDataHora(h.criado_em)} · ${esc(h.autor || '')}</div></li>`).join('')
      : '<p class="vazio">Nenhuma movimentação ainda.</p>';
  } catch (e) { falha(e); }
}

// ---------- equipe e divisão de leads (gestor) ----------
function abrirEquipe() {
  if (!souAdmin()) return;
  $('#equipe-modal').hidden = false;
  document.body.classList.add('modal-aberto');
  renderEquipe();
}

function fecharEquipe() {
  $('#equipe-modal').hidden = true;
  if (!state.aberto) document.body.classList.remove('modal-aberto');
}

function renderEquipe() {
  // tabela
  const linha = (rotulo, lista, classe = '') => {
    const c = f => lista.filter(f).length;
    const ativos = lista.filter(l => !l.sem_interesse);
    return `<tr class="${classe}"><td>${rotulo}</td><td class="num">${ativos.length}</td>
      <td class="num">${c(l => !l.sem_interesse && l.etapa === 'origem')}</td>
      <td class="num">${c(l => !l.sem_interesse && l.etapa.startsWith('ligou'))}</td>
      <td class="num">${c(l => !l.sem_interesse && (l.etapa === 'atendeu' || l.etapa === 'interesse'))}</td>
      <td class="num">${c(l => l.etapa === 'comprou')}</td>
      <td class="num">${c(l => l.sem_interesse)}</td></tr>`;
  };
  const equipe = vendedores();
  $('#eq-tabela').innerHTML = `<thead><tr><th>Vendedor</th><th class="num">Leads</th><th class="num">Não ligou</th><th class="num">Ligando</th><th class="num">Atendeu/Interesse</th><th class="num">Vendidos</th><th class="num">Sem interesse</th></tr></thead><tbody>` +
    equipe.map(p => linha(`${esc(p.nome)}${p.papel === 'admin' ? '<span class="papel">gestor</span>' : ''}`, state.leads.filter(l => l.responsavel_id === p.id))).join('') +
    linha('Sem vendedor', state.leads.filter(l => !l.responsavel_id), 'livre') + '</tbody>';
  $('#eq-add-form').hidden = !DEMO;
  $('#eq-como-adicionar').textContent = DEMO
    ? 'No modo demonstração você cria vendedores aqui. Para ver a tela de um vendedor, use “Ver como” no menu com o seu nome.'
    : 'Para adicionar um vendedor: no Supabase, Authentication → Users → Add user. Ele aparece aqui depois do primeiro login, quando informa o nome.';

  // "pegar leads de"
  const deAtual = $('#div-de').value || 'livres';
  const opDe = [['livres', 'Leads sem vendedor'], ...equipe.map(p => [p.id, `Leads de ${p.nome} (redistribuir)`])];
  $('#div-de').innerHTML = opDe.map(([v, t]) => `<option value="${esc(v)}"${v === deAtual ? ' selected' : ''}>${esc(t)}</option>`).join('');

  // origens (mantém o que estava marcado)
  const origMarc = new Set([...document.querySelectorAll('#div-origens input')].filter(i => i.checked).map(i => i.value));
  const primeiraVez = !document.querySelector('#div-origens input');
  $('#div-origens').innerHTML = Object.entries(ORIGENS).map(([id, o]) =>
    `<label><input type="checkbox" value="${id}"${primeiraVez || origMarc.has(id) ? ' checked' : ''}> ${esc(o.nome)} <span class="n" data-n="${id}"></span></label>`).join('');

  // para quem
  // vendedor que acabou de aparecer já vem marcado; quem já estava mantém a escolha do gestor
  const antes = [...document.querySelectorAll('#div-para input')];
  const jaVistos = new Set(antes.map(i => i.value));
  const paraMarc = new Set(antes.filter(i => i.checked).map(i => i.value));
  $('#div-para').innerHTML = equipe.length ? equipe.map(p =>
    `<label><input type="checkbox" value="${esc(p.id)}"${(jaVistos.has(p.id) ? paraMarc.has(p.id) : p.papel !== 'admin') ? ' checked' : ''}> ${esc(p.nome)}${p.papel === 'admin' ? ' <span class="n">(gestor)</span>' : ''}</label>`).join('')
    : '<p class="mut">Nenhum vendedor cadastrado ainda.</p>';
  renderPrevia();
}

function filtroDivisao() {
  const de = $('#div-de').value;
  const soNovos = $('#div-so-novos').checked;
  return l => !l.sem_interesse && (de === 'livres' ? !l.responsavel_id : l.responsavel_id === de) && (!soNovos || l.etapa === 'origem');
}

function planoDivisao() {
  const de = $('#div-de').value;
  const origens = new Set([...document.querySelectorAll('#div-origens input:checked')].map(i => i.value));
  const para = [...document.querySelectorAll('#div-para input:checked')].map(i => i.value).filter(id => id !== de);
  const limite = parseInt($('#div-limite').value, 10) || Infinity;
  const ordem = Object.keys(ORIGENS);
  const base = filtroDivisao();
  // ordenado por origem: na distribuição em rodízio cada vendedor recebe uma fatia parecida de cada origem
  const candidatos = state.leads.filter(l => base(l) && origens.has(l.origem_principal))
    .sort((a, b) => ordem.indexOf(a.origem_principal) - ordem.indexOf(b.origem_principal) || String(a.criado_em).localeCompare(String(b.criado_em)));
  const plano = new Map(para.map(id => [id, []]));
  let i = 0;
  for (const l of candidatos) {
    const livres = para.filter(id => plano.get(id).length < limite);
    if (!livres.length) break;
    plano.get(livres[i++ % livres.length]).push(l.id);
  }
  return { plano, candidatos };
}

function renderPrevia() {
  const base = filtroDivisao();
  for (const el of document.querySelectorAll('#div-origens [data-n]')) {
    el.textContent = state.leads.filter(l => base(l) && l.origem_principal === el.dataset.n).length;
  }
  const { plano, candidatos } = planoDivisao();
  const total = [...plano.values()].reduce((s, ids) => s + ids.length, 0);
  const btn = $('#div-btn');
  btn.disabled = !total;
  if (!plano.size) { $('#div-previa').textContent = 'Marque pelo menos um vendedor para receber os leads.'; return; }
  if (!candidatos.length) { $('#div-previa').textContent = 'Nenhum lead encontrado com esses filtros.'; return; }
  $('#div-previa').innerHTML = `<strong>${total}</strong> de ${candidatos.length} leads serão divididos: ` +
    [...plano].map(([id, ids]) => `${esc(nomeDe(id))} recebe <strong>${ids.length}</strong>`).join(' · ') +
    (total < candidatos.length ? `. ${candidatos.length - total} continuam onde estão.` : '.');
  btn.textContent = `Dividir ${total} leads`;
}

async function dividir() {
  const { plano } = planoDivisao();
  const total = [...plano.values()].reduce((s, ids) => s + ids.length, 0);
  if (!total) return;
  const resumo = [...plano].map(([id, ids]) => `${nomeDe(id)}: ${ids.length}`).join('\n');
  if (!confirm(`Dividir ${total} leads assim?\n\n${resumo}`)) return;
  const btn = $('#div-btn');
  btn.disabled = true;
  btn.textContent = 'Dividindo…';
  try {
    const quando = agora();
    for (const [id, ids] of plano) {
      if (!ids.length) continue;
      await store.atribuir(ids, id, { atualizado_em: quando, atualizado_por: state.user.nome });
      await store.addHistoricos(ids.map(lead_id => ({ lead_id, descricao: `Gestor passou o lead para ${nomeDe(id)}`, autor: state.user.nome })));
    }
    await recarregar();
    toast(`${total} leads divididos.`);
  } catch (e) {
    falha(e);
    await recarregar();
  }
}

// ---------- sininho ----------
function minhasTarefasDeHoje() {
  const h = hoje();
  return state.pendentes.filter(t => t.autor_id === state.user.id && t.data <= h).sort((a, b) => a.data.localeCompare(b.data));
}

function atualizarSino() {
  if (!state.user) return;
  const lista = minhasTarefasDeHoje();
  const h = hoje();
  $('#sino-badge').hidden = !lista.length;
  $('#sino-badge').textContent = lista.length;
  $('#sino-lista').innerHTML = lista.length ? lista.map(t => {
    const l = porId(t.lead_id);
    const quando = t.data < h ? `<span class="atrasada">Atrasada desde ${fmtData(t.data)}</span>` : 'Hoje';
    return `<button class="sino-item" data-lead="${esc(t.lead_id)}"><strong>${esc(t.descricao)}</strong><span>${esc(l?.nome || 'Lead')} · ${quando}</span></button>`;
  }).join('') : '<p class="vazio">Nenhuma tarefa para hoje.</p>';
}

// ---------- tempo real ----------
function onRemoto(tabela, p) {
  if (tabela === 'leads') {
    if (p.eventType === 'DELETE') state.leads = state.leads.filter(l => l.id !== p.old.id);
    else {
      substituirLead(p.new);
      if (state.aberto === p.new.id) renderFichaTopo(p.new);
    }
  } else {
    const id = p.eventType === 'DELETE' ? p.old.id : p.new.id;
    state.pendentes = state.pendentes.filter(t => t.id !== id);
    if (p.eventType !== 'DELETE' && !p.new.feita) state.pendentes.push(p.new);
    atualizarSino();
  }
  agendarRender();
}

// ---------- importar / exportar CSV ----------
function parseCSV(texto) {
  texto = texto.replace(/^﻿/, '');
  const linhas = [];
  let linha = [], campo = '', aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = '';
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter(l => l.some(x => x.trim()));
}

function linhaParaLead(o) {
  const origem = semAcento(o['Origem']);
  const ids = [];
  if (origem.includes('enquete')) ids.push('enquete');
  if (origem.includes('caixinha')) ids.push('caixinha');
  if (origem.includes('lista da cakto') || origem.includes('formacao')) ids.push('formacao');
  if (origem.includes('gps')) ids.push('gps');
  const nome = (o['Nome'] || '').trim();
  if (!ids.length || !nome) return null;
  const tel = (o['Telefone / WhatsApp'] || '').trim();
  const d = dig(tel);
  return {
    chave: d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : 'nome:' + semAcento(nome),
    nome,
    telefone: d.length >= 10 ? tel : null,
    email: (o['@ / E-mail'] || '').trim() || null,
    origens: ids.join(','),
    origem_principal: ids[0],
    observacao_importada: (o['Observações'] || '').trim() || null,
    data_captacao: (o['Data de captação'] || '').trim() || null,
  };
}

async function importarArquivo(arquivo) {
  const linhas = parseCSV(await arquivo.text());
  const cab = linhas.shift()?.map(h => h.trim()) || [];
  if (!cab.includes('Nome') || !cab.includes('Origem')) {
    toast('O CSV precisa ter as colunas "Nome", "Telefone / WhatsApp" e "Origem".', true);
    return;
  }
  const porChave = new Map();
  for (const l of linhas) {
    const lead = linhaParaLead(Object.fromEntries(cab.map((h, i) => [h, l[i] ?? ''])));
    if (lead && !porChave.has(lead.chave)) porChave.set(lead.chave, lead);
  }
  try {
    const novos = await store.importar([...porChave.values()]);
    await recarregar();
    toast(`${novos} leads novos importados. ${porChave.size - novos} já estavam no CRM e não foram alterados.`);
  } catch (e) { falha(e); }
}

function exportarCSV() {
  const cel = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cab = ['Nome', 'Telefone / WhatsApp', '@ / E-mail', 'Origem', 'Etapa', 'Vendedor', 'Sem interesse', 'Atualizado em', 'Atualizado por'];
  const linhas = state.leads.map(l => [
    l.nome, l.telefone, l.email,
    String(l.origens).split(',').map(id => ORIGENS[id]?.nome || id).join(' + '),
    l.etapa === 'origem' ? 'Ainda não contatado' : ETAPAS[l.etapa],
    l.responsavel_id ? nomeDe(l.responsavel_id) : '', l.sem_interesse ? 'Sim' : '', l.atualizado_em ? fmtDataHora(l.atualizado_em) : '', l.atualizado_por,
  ].map(cel).join(','));
  const blob = new Blob(['﻿' + [cab.map(cel).join(','), ...linhas].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `crm-encontro-${hoje()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- eventos ----------
function ligarEventosFixos() {
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const erro = $('#login-erro');
    erro.hidden = true;
    try {
      await store.login($('#login-email').value.trim(), $('#login-senha').value);
      await entrar();
    } catch (err) {
      erro.textContent = /invalid/i.test(err.message) ? 'E-mail ou senha incorretos.' : err.message;
      erro.hidden = false;
    }
  });

  let buscaTimer;
  $('#busca').addEventListener('input', e => {
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(() => { state.busca = e.target.value; renderQuadro(); }, 150);
  });
  $('#filtro').addEventListener('change', e => { state.filtro = e.target.value; renderQuadro(); });
  $('#ver-sem-interesse').addEventListener('change', e => { state.verSemInteresse = e.target.checked; renderQuadro(); });

  $('#sino-btn').addEventListener('click', e => { e.stopPropagation(); $('#menu-painel').hidden = true; $('#sino-painel').hidden = !$('#sino-painel').hidden; });
  $('#sino-lista').addEventListener('click', e => { const b = e.target.closest('.sino-item'); if (b) abrirLead(b.dataset.lead); });
  $('#menu-btn').addEventListener('click', e => { e.stopPropagation(); $('#sino-painel').hidden = true; $('#menu-painel').hidden = !$('#menu-painel').hidden; });
  document.addEventListener('click', e => {
    if (!e.target.closest('.sino')) $('#sino-painel').hidden = true;
    if (!e.target.closest('.menu')) $('#menu-painel').hidden = true;
  });
  $('#btn-importar').addEventListener('click', () => $('#arquivo').click());
  $('#arquivo').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importarArquivo(f); });
  $('#btn-exportar').addEventListener('click', exportarCSV);
  $('#btn-sair').addEventListener('click', async () => { await store.logout(); location.reload(); });

  // ficha
  $('#m-fechar').addEventListener('click', fecharFicha);
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') fecharFicha(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.aberto) fecharFicha(); });
  $('#m-etapas').addEventListener('click', e => {
    const b = e.target.closest('.etapa');
    const l = porId(state.aberto);
    if (b && l) mover(l, b.dataset.etapa);
  });
  $('#m-registrar').addEventListener('click', () => {
    const l = porId(state.aberto);
    const prox = l && PROXIMA_LIGACAO[l.etapa];
    if (prox) mover(l, prox);
  });
  $('#m-resp-select').addEventListener('change', e => {
    const l = porId(state.aberto);
    if (!l || !souAdmin()) return;
    const novo = e.target.value || null;
    salvarLead(l, { responsavel_id: novo }, novo ? `Gestor passou o lead para ${nomeDe(novo)}` : 'Gestor tirou o lead do vendedor');
  });

  // equipe e divisão
  $('#btn-equipe').addEventListener('click', () => { $('#menu-painel').hidden = true; abrirEquipe(); });
  $('#eq-fechar').addEventListener('click', fecharEquipe);
  $('#equipe-modal').addEventListener('click', e => { if (e.target.id === 'equipe-modal') fecharEquipe(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#equipe-modal').hidden) fecharEquipe(); });
  for (const s of ['#div-de', '#div-limite', '#div-so-novos']) $(s).addEventListener('input', renderPrevia);
  $('#div-origens').addEventListener('change', renderPrevia);
  $('#div-para').addEventListener('change', renderPrevia);
  $('#div-btn').addEventListener('click', dividir);
  $('#eq-add-form').addEventListener('submit', async e => {
    e.preventDefault();
    const nome = $('#eq-add-nome').value.trim();
    if (!nome || !store.addVendedor) return;
    await store.addVendedor(nome);
    $('#eq-add-nome').value = '';
    await recarregar();
  });
  $('#vercomo').addEventListener('change', e => { store.verComo(e.target.value); location.reload(); });
  $('#menu-btn').addEventListener('click', () => {
    if (!DEMO) return;
    $('#vercomo').innerHTML = state.perfis.map(p =>
      `<option value="${esc(p.id)}"${p.id === state.user.id ? ' selected' : ''}>${esc(p.nome || 'Sem nome')} (${p.papel === 'admin' ? 'gestor' : 'vendedor'})</option>`).join('');
  });
  $('#m-sem-interesse').addEventListener('click', () => {
    const l = porId(state.aberto);
    if (l) salvarLead(l, { sem_interesse: !l.sem_interesse }, l.sem_interesse ? 'Reativou o lead' : 'Marcou como sem interesse');
  });

  $('#tarefa-form').addEventListener('submit', async e => {
    e.preventDefault();
    const id = state.aberto;
    const descricao = $('#tarefa-desc').value.trim();
    const data = $('#tarefa-data').value;
    if (!id || !descricao || !data) return;
    try {
      const t = await store.addTarefa({ lead_id: id, descricao, data, autor: state.user.nome });
      state.pendentes = state.pendentes.filter(x => x.id !== t.id).concat(t);
      $('#tarefa-desc').value = '';
      atualizarSino();
      agendarRender();
      carregarTarefas(id);
      toast(`Tarefa agendada para ${data === hoje() ? 'hoje' : fmtData(data)}.`);
    } catch (err) { falha(err); }
  });
  $('#tarefa-lista').addEventListener('click', async e => {
    const li = e.target.closest('.tarefa');
    if (!li) return;
    const id = state.aberto;
    try {
      if (e.target.closest('.del')) {
        await store.delTarefa(li.dataset.id);
        state.pendentes = state.pendentes.filter(t => t.id !== li.dataset.id);
      } else if (e.target.matches('input[type=checkbox]')) {
        const feita = e.target.checked;
        const t = await store.updateTarefa(li.dataset.id, { feita, feita_em: feita ? agora() : null });
        state.pendentes = state.pendentes.filter(x => x.id !== t.id);
        if (!feita) state.pendentes.push(t);
      } else return;
      atualizarSino();
      agendarRender();
      carregarTarefas(id);
    } catch (err) { falha(err); }
  });

  $('#obs-form').addEventListener('submit', async e => {
    e.preventDefault();
    const id = state.aberto;
    const texto = $('#obs-texto').value.trim();
    if (!id || !texto) return;
    try {
      await store.addObservacao({ lead_id: id, texto, autor: state.user.nome });
      $('#obs-texto').value = '';
      carregarObservacoes(id);
    } catch (err) { falha(err); }
  });
}

iniciar();
