// ===== ESTADO EM MEMÓRIA (cache local) =====
let _produtos = [];
let _vendas = [];
let _notifIgnore = [];

const CATEGORIAS = ['Salgados', 'Doces', 'Temperos', 'Bebidas', 'Outros'];

// ===== SPLASH =====
// Usa flag para caso o firebase-ready já tenha disparado antes deste script registrar o listener
window._firebaseReady = false;
window._onFirebaseReady = iniciarApp;

window.addEventListener('firebase-ready', () => {
  window._firebaseReady = true;
  iniciarApp();
});

function iniciarApp() {
  const bar = document.getElementById('progress-bar');
  let w = 0;

  const interval = setInterval(() => {
    w = Math.min(w + 2, 90);
    bar.style.width = w + '%';
  }, 100);

  const minWait = new Promise(r => setTimeout(r, 2000));
  const dataLoad = Promise.all([
    window.FirebaseDB.getProdutos().then(d => { _produtos = d; }),
    window.FirebaseDB.getVendas().then(d => { _vendas = d; }),
    window.FirebaseDB.getNotifIgnore().then(d => { _notifIgnore = d; })
  ]);

  Promise.all([minWait, dataLoad]).then(() => {
    clearInterval(interval);
    bar.style.width = '100%';
    setTimeout(() => {
      document.getElementById('splash').style.display = 'none';
      document.getElementById('app').classList.remove('hidden');
      navigate('dashboard');
      checkNotificacoes();
    }, 300);
  }).catch(err => {
    console.error('Erro ao carregar dados:', err);
    clearInterval(interval);
    bar.style.width = '100%';
    setTimeout(() => {
      document.getElementById('splash').style.display = 'none';
      document.getElementById('app').classList.remove('hidden');
      navigate('dashboard');
    }, 300);
  });
}

// ===== NAVEGAÇÃO =====
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.remove('hidden');
  document.getElementById('nav-' + page).classList.add('active');
  const renders = { dashboard: renderDashboard, caixa: renderCaixa, estoque: renderEstoque, vendas: renderVendas, historico: renderHistorico };
  renders[page]();
}

// ===== UTILS =====
const fmt = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');
const fmtDate = (iso) => { const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('pt-BR'); };

function showModal(html, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-confirm]')?.addEventListener('click', () => { onConfirm(); overlay.remove(); });
  overlay.querySelector('[data-cancel]')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  return overlay;
}

function showLoading(msg = 'Salvando...') {
  let el = document.getElementById('loading-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-toast';
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 22px;border-radius:8px;font-size:0.88rem;z-index:9999;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
}
function hideLoading() {
  const el = document.getElementById('loading-toast');
  if (el) el.style.display = 'none';
}

// ===== NOTIFICAÇÕES =====
function checkNotificacoes() {
  const container = document.getElementById('notificacoes-container');
  container.innerHTML = '';
  const baixos = _produtos.filter(p => p.quantidade <= (p.qtdMin || 3) && !_notifIgnore.includes(p.id));
  baixos.forEach(p => {
    const card = document.createElement('div');
    card.className = 'notif-card';
    card.id = 'notif-' + p.id;
    card.innerHTML = `
      <div class="notif-title">⚠️ Estoque Baixo</div>
      <div class="notif-body"><strong>${p.nome}</strong> — apenas <strong>${p.quantidade}</strong> unidade(s) restante(s).</div>
      <div class="notif-actions">
        <button class="notif-btn notif-btn-min" onclick="minimizarNotif('${p.id}')">Minimizar</button>
        <button class="notif-btn notif-btn-close" onclick="fecharNotif('${p.id}')">Fechar</button>
        <button class="notif-btn notif-btn-never" onclick="naoMostrarMais('${p.id}')">Não mostrar mais</button>
      </div>`;
    container.appendChild(card);
  });
}

function minimizarNotif(id) {
  document.getElementById('notif-' + id)?.classList.toggle('notif-minimized');
}
function fecharNotif(id) {
  document.getElementById('notif-' + id)?.remove();
}
async function naoMostrarMais(id) {
  if (!_notifIgnore.includes(id)) {
    _notifIgnore.push(id);
    await window.FirebaseDB.saveNotifIgnore(_notifIgnore);
  }
  fecharNotif(id);
}

// ===== ESTOQUE =====
function renderEstoque() {
  const page = document.getElementById('page-estoque');
  page.innerHTML = `
    <div class="section-header">
      <h2>📦 Estoque</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <input class="search-bar" id="search-estoque" placeholder="🔍 Buscar produto..." oninput="filtrarEstoque()" />
        <button class="btn btn-primary" onclick="abrirModalProduto()">+ Novo Produto</button>
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Produto</th><th>Categoria</th><th>Qtd</th><th>Qtd Mín.</th>
            <th>Custo Unit.</th><th>Preço Venda</th><th>Status</th><th>Ações</th>
          </tr></thead>
          <tbody id="tbody-estoque"></tbody>
        </table>
      </div>
      ${_produtos.length === 0 ? '<div class="empty-state"><div class="empty-icon">📦</div><p>Nenhum produto cadastrado ainda.</p></div>' : ''}
    </div>`;
  renderTbodyEstoque(_produtos);
}

function renderTbodyEstoque(produtos) {
  const tbody = document.getElementById('tbody-estoque');
  if (!tbody) return;
  if (produtos.length === 0) { tbody.innerHTML = ''; return; }
  tbody.innerHTML = produtos.map(p => {
    const status = p.quantidade === 0 ? '<span class="badge badge-danger">Sem estoque</span>'
      : p.quantidade <= p.qtdMin ? '<span class="badge badge-warning">Estoque baixo</span>'
      : '<span class="badge badge-success">OK</span>';
    return `<tr>
      <td><strong>${p.nome}</strong></td>
      <td>${p.categoria}</td>
      <td>${p.quantidade}</td>
      <td>${p.qtdMin}</td>
      <td>${fmt(p.custo)}</td>
      <td>${fmt(p.preco)}</td>
      <td>${status}</td>
      <td>
        <button class="btn btn-warning btn-sm" onclick="abrirModalProduto('${p.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="excluirProduto('${p.id}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function filtrarEstoque() {
  const q = document.getElementById('search-estoque').value.toLowerCase();
  renderTbodyEstoque(_produtos.filter(p => p.nome.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q)));
}

function abrirModalProduto(id) {
  const p = id ? _produtos.find(x => x.id === id) : null;
  const cats = CATEGORIAS.map(c => `<option ${p?.categoria === c ? 'selected' : ''}>${c}</option>`).join('');
  showModal(`
    <div class="modal-title">${p ? '✏️ Editar Produto' : '+ Novo Produto'}</div>
    <div class="form-grid">
      <div class="form-group"><label>Nome</label><input id="m-nome" value="${p?.nome || ''}" placeholder="Nome do produto" /></div>
      <div class="form-group"><label>Categoria</label><select id="m-cat">${cats}</select></div>
      <div class="form-group"><label>Quantidade</label><input id="m-qtd" type="number" min="0" value="${p?.quantidade ?? 0}" /></div>
      <div class="form-group"><label>Qtd Mínima (alerta)</label><input id="m-qtdmin" type="number" min="1" value="${p?.qtdMin ?? 3}" /></div>
      <div class="form-group"><label>Custo Unitário (R$)</label><input id="m-custo" type="number" min="0" step="0.01" value="${p?.custo ?? ''}" /></div>
      <div class="form-group"><label>Preço de Venda (R$)</label><input id="m-preco" type="number" min="0" step="0.01" value="${p?.preco ?? ''}" /></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" data-cancel>Cancelar</button>
      <button class="btn btn-primary" data-confirm>Salvar</button>
    </div>`, () => salvarProduto(id));
}

async function salvarProduto(id) {
  const nome = document.getElementById('m-nome').value.trim();
  const categoria = document.getElementById('m-cat').value;
  const quantidade = parseInt(document.getElementById('m-qtd').value) || 0;
  const qtdMin = parseInt(document.getElementById('m-qtdmin').value) || 3;
  const custo = parseFloat(document.getElementById('m-custo').value) || 0;
  const preco = parseFloat(document.getElementById('m-preco').value) || 0;
  if (!nome) return alert('Informe o nome do produto.');
  showLoading('Salvando produto...');
  try {
    const produto = { nome, categoria, quantidade, qtdMin, custo, preco };
    if (id) produto.id = id;
    const savedId = await window.FirebaseDB.saveProduto(produto);
    if (id) {
      _produtos = _produtos.map(p => p.id === id ? { ...p, ...produto } : p);
    } else {
      _produtos.push({ id: savedId, ...produto });
    }
    renderEstoque();
    checkNotificacoes();
  } finally { hideLoading(); }
}

async function excluirProduto(id) {
  if (!confirm('Excluir este produto?')) return;
  showLoading('Excluindo...');
  try {
    await window.FirebaseDB.deleteProduto(id);
    _produtos = _produtos.filter(p => p.id !== id);
    renderEstoque();
    checkNotificacoes();
  } finally { hideLoading(); }
}

// ===== VENDAS =====
function renderVendas() {
  const page = document.getElementById('page-vendas');
  const opts = _produtos.map(p => `<option value="${p.id}">${p.nome} (estoque: ${p.quantidade})</option>`).join('');
  page.innerHTML = `
    <div class="section-header"><h2>🛒 Registrar Venda</h2></div>
    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">Nova Venda</div>
      <div class="form-grid">
        <div class="form-group"><label>Produto</label>
          <select id="v-produto" onchange="preencherPreco()">${opts || '<option>Nenhum produto cadastrado</option>'}</select>
        </div>
        <div class="form-group"><label>Quantidade</label><input id="v-qtd" type="number" min="1" value="1" /></div>
        <div class="form-group"><label>Preço de Venda Unit. (R$)</label><input id="v-preco" type="number" min="0" step="0.01" /></div>
        <div class="form-group"><label>Data</label><input id="v-data" type="date" value="${new Date().toISOString().slice(0,10)}" /></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-success" onclick="registrarVenda()">✅ Registrar Venda</button>
      </div>
    </div>
    <div class="section-header"><h2>📋 Vendas de Hoje</h2></div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Produto</th><th>Qtd</th><th>Preço Unit.</th><th>Total</th><th>Data</th><th>Ações</th></tr></thead>
          <tbody id="tbody-vendas"></tbody>
        </table>
      </div>
    </div>`;
  preencherPreco();
  renderTbodyVendas();
}

function preencherPreco() {
  const sel = document.getElementById('v-produto');
  if (!sel) return;
  const p = _produtos.find(x => x.id === sel.value);
  if (p) document.getElementById('v-preco').value = p.preco.toFixed(2);
}

function renderTbodyVendas() {
  const tbody = document.getElementById('tbody-vendas');
  if (!tbody) return;
  const hoje = new Date().toISOString().slice(0, 10);
  const vendas = _vendas.filter(v => v.data === hoje);
  if (!vendas.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">Nenhuma venda registrada hoje.</td></tr>';
    return;
  }
  tbody.innerHTML = vendas.map(v => `<tr>
    <td>${v.nomeProduto}</td><td>${v.quantidade}</td>
    <td>${fmt(v.preco)}</td><td><strong>${fmt(v.total)}</strong></td>
    <td>${fmtDate(v.data)}</td>
    <td><button class="btn btn-danger btn-sm" onclick="excluirVenda('${v.id}')">🗑️</button></td>
  </tr>`).join('');
}

async function registrarVenda() {
  const prodId = document.getElementById('v-produto').value;
  const qtd = parseInt(document.getElementById('v-qtd').value) || 0;
  const preco = parseFloat(document.getElementById('v-preco').value) || 0;
  const data = document.getElementById('v-data').value;
  if (!prodId || qtd <= 0 || preco <= 0) return alert('Preencha todos os campos corretamente.');
  const prod = _produtos.find(p => p.id === prodId);
  if (!prod) return alert('Produto não encontrado.');
  if (prod.quantidade < qtd) return alert(`Estoque insuficiente. Disponível: ${prod.quantidade}`);
  showLoading('Registrando venda...');
  try {
    // Atualiza estoque
    const novaQtd = prod.quantidade - qtd;
    await window.FirebaseDB.saveProduto({ ...prod, quantidade: novaQtd });
    _produtos = _produtos.map(p => p.id === prodId ? { ...p, quantidade: novaQtd } : p);
    // Salva venda
    const venda = { produtoId: prodId, nomeProduto: prod.nome, categoria: prod.categoria, quantidade: qtd, preco, total: preco * qtd, custo: prod.custo, data };
    const id = await window.FirebaseDB.saveVenda(venda);
    _vendas.push({ id, ...venda });
    renderTbodyVendas();
    checkNotificacoes();
    document.getElementById('v-qtd').value = 1;
  } finally { hideLoading(); }
}

async function excluirVenda(id) {
  if (!confirm('Excluir esta venda? O estoque será restaurado.')) return;
  const venda = _vendas.find(v => v.id === id);
  showLoading('Excluindo...');
  try {
    await window.FirebaseDB.deleteVenda(id);
    _vendas = _vendas.filter(v => v.id !== id);
    if (venda) {
      const prod = _produtos.find(p => p.id === venda.produtoId);
      if (prod) {
        const novaQtd = prod.quantidade + venda.quantidade;
        await window.FirebaseDB.saveProduto({ ...prod, quantidade: novaQtd });
        _produtos = _produtos.map(p => p.id === venda.produtoId ? { ...p, quantidade: novaQtd } : p);
      }
    }
    renderVendas();
    checkNotificacoes();
  } finally { hideLoading(); }
}

// ===== HISTÓRICO =====
function renderHistorico() {
  const page = document.getElementById('page-historico');
  page.innerHTML = `
    <div class="section-header">
      <h2>📋 Histórico de Vendas</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" onclick="exportarCSV()">⬇️ Exportar CSV</button>
        <button class="btn btn-primary btn-sm" onclick="exportarJSON()">💾 Backup JSON</button>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <div class="filter-bar">
        <label>De:</label><input type="date" id="h-de" />
        <label>Até:</label><input type="date" id="h-ate" />
        <select id="h-cat">
          <option value="">Todas categorias</option>
          ${CATEGORIAS.map(c => `<option>${c}</option>`).join('')}
        </select>
        <input class="search-bar" id="h-search" placeholder="🔍 Produto..." style="width:160px;" />
        <button class="btn btn-primary btn-sm" onclick="filtrarHistorico()">Filtrar</button>
        <button class="btn btn-outline btn-sm" onclick="limparFiltroHistorico()">Limpar</button>
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Produto</th><th>Categoria</th><th>Qtd</th><th>Preço Unit.</th><th>Total</th><th>Lucro</th></tr></thead>
          <tbody id="tbody-historico"></tbody>
        </table>
      </div>
      <div id="historico-totais" style="padding:14px 0 0;display:flex;gap:24px;flex-wrap:wrap;font-size:0.9rem;"></div>
    </div>`;
  renderTbodyHistorico(_vendas);
}

function renderTbodyHistorico(vendas) {
  const tbody = document.getElementById('tbody-historico');
  const totaisEl = document.getElementById('historico-totais');
  if (!tbody) return;
  const sorted = [...vendas].sort((a, b) => b.data.localeCompare(a.data));
  if (!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:20px;">Nenhuma venda encontrada.</td></tr>';
    if (totaisEl) totaisEl.innerHTML = '';
    return;
  }
  let totalVendas = 0, totalLucro = 0;
  tbody.innerHTML = sorted.map(v => {
    const lucro = (v.preco - v.custo) * v.quantidade;
    totalVendas += v.total; totalLucro += lucro;
    return `<tr>
      <td>${fmtDate(v.data)}</td><td>${v.nomeProduto}</td><td>${v.categoria}</td>
      <td>${v.quantidade}</td><td>${fmt(v.preco)}</td>
      <td><strong>${fmt(v.total)}</strong></td>
      <td class="${lucro >= 0 ? 'lucro-pos' : 'lucro-neg'}">${fmt(lucro)}</td>
    </tr>`;
  }).join('');
  if (totaisEl) totaisEl.innerHTML = `
    <span>Total vendido: <strong>${fmt(totalVendas)}</strong></span>
    <span>Lucro total: <strong class="${totalLucro >= 0 ? 'lucro-pos' : 'lucro-neg'}">${fmt(totalLucro)}</strong></span>
    <span>Registros: <strong>${sorted.length}</strong></span>`;
}

function filtrarHistorico() {
  let vendas = _vendas;
  const de = document.getElementById('h-de').value;
  const ate = document.getElementById('h-ate').value;
  const cat = document.getElementById('h-cat').value;
  const q = document.getElementById('h-search').value.toLowerCase();
  if (de) vendas = vendas.filter(v => v.data >= de);
  if (ate) vendas = vendas.filter(v => v.data <= ate);
  if (cat) vendas = vendas.filter(v => v.categoria === cat);
  if (q) vendas = vendas.filter(v => v.nomeProduto.toLowerCase().includes(q));
  renderTbodyHistorico(vendas);
}

function limparFiltroHistorico() {
  ['h-de','h-ate','h-search'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  const cat = document.getElementById('h-cat'); if(cat) cat.value='';
  renderTbodyHistorico(_vendas);
}

function exportarCSV() {
  if (!_vendas.length) return alert('Nenhuma venda para exportar.');
  const header = 'Data,Produto,Categoria,Quantidade,Preço Unit.,Total,Lucro\n';
  const rows = _vendas.map(v => {
    const lucro = (v.preco - v.custo) * v.quantidade;
    return `${v.data},"${v.nomeProduto}",${v.categoria},${v.quantidade},${v.preco.toFixed(2)},${v.total.toFixed(2)},${lucro.toFixed(2)}`;
  }).join('\n');
  download('vendas.csv', header + rows, 'text/csv');
}

function exportarJSON() {
  const data = { produtos: _produtos, vendas: _vendas, exportadoEm: new Date().toISOString() };
  download('backup-emporio.json', JSON.stringify(data, null, 2), 'application/json');
}

function download(filename, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename; a.click();
}

// ===== DASHBOARD =====
function renderDashboard() {
  const page = document.getElementById('page-dashboard');
  const vendas = _vendas;
  const produtos = _produtos;

  const totalVendido = vendas.reduce((s, v) => s + v.total, 0);
  const totalLucro = vendas.reduce((s, v) => s + (v.preco - v.custo) * v.quantidade, 0);
  const totalItens = vendas.reduce((s, v) => s + v.quantidade, 0);
  const hoje = new Date().toISOString().slice(0, 10);
  const totalHoje = vendas.filter(v => v.data === hoje).reduce((s, v) => s + v.total, 0);

  const porProduto = {};
  vendas.forEach(v => {
    if (!porProduto[v.nomeProduto]) porProduto[v.nomeProduto] = { qtd: 0, total: 0, lucro: 0 };
    porProduto[v.nomeProduto].qtd += v.quantidade;
    porProduto[v.nomeProduto].total += v.total;
    porProduto[v.nomeProduto].lucro += (v.preco - v.custo) * v.quantidade;
  });
  const rankQtd = Object.entries(porProduto).sort((a, b) => b[1].qtd - a[1].qtd);
  const rankLucro = Object.entries(porProduto).sort((a, b) => b[1].lucro - a[1].lucro);

  const estoqueBaixo = produtos.filter(p => p.quantidade <= p.qtdMin && p.quantidade > 0);
  const semEstoque = produtos.filter(p => p.quantidade === 0);

  const porCat = {};
  vendas.forEach(v => { porCat[v.categoria] = (porCat[v.categoria] || 0) + v.total; });
  const catEntries = Object.entries(porCat).sort((a, b) => b[1] - a[1]);

  const rankListHTML = (items, valFn, emptyMsg) => {
    if (!items.length) return `<div class="empty-state" style="padding:20px;"><p>${emptyMsg}</p></div>`;
    return `<ul class="rank-list">${items.slice(0, 5).map(([nome, d], i) => `
      <li><span class="rank-pos">${i+1}</span><span class="rank-name">${nome}</span><span class="rank-val">${valFn(d)}</span></li>`).join('')}</ul>`;
  };

  page.innerHTML = `
    <div class="dash-stats">
      <div class="stat-card"><div class="stat-icon">💰</div><div class="stat-value">${fmt(totalVendido)}</div><div class="stat-label">Total em Vendas</div></div>
      <div class="stat-card"><div class="stat-icon">📈</div><div class="stat-value" style="color:${totalLucro>=0?'var(--success)':'var(--danger)'}">${fmt(totalLucro)}</div><div class="stat-label">Lucro Total</div></div>
      <div class="stat-card"><div class="stat-icon">🛒</div><div class="stat-value">${totalItens}</div><div class="stat-label">Itens Vendidos</div></div>
      <div class="stat-card"><div class="stat-icon">📅</div><div class="stat-value">${fmt(totalHoje)}</div><div class="stat-label">Vendas Hoje</div></div>
      <div class="stat-card"><div class="stat-icon">📦</div><div class="stat-value">${produtos.length}</div><div class="stat-label">Produtos Cadastrados</div></div>
      <div class="stat-card"><div class="stat-icon">⚠️</div><div class="stat-value" style="color:var(--warning)">${estoqueBaixo.length+semEstoque.length}</div><div class="stat-label">Alertas de Estoque</div></div>
    </div>
    <div class="dash-grid" style="margin-bottom:20px;">
      <div class="card"><div class="card-title">🏆 Mais Vendidos</div>${rankListHTML(rankQtd, d=>d.qtd+' un.','Nenhuma venda ainda.')}</div>
      <div class="card"><div class="card-title">📉 Menos Vendidos</div>${rankListHTML([...rankQtd].reverse(), d=>d.qtd+' un.','Nenhuma venda ainda.')}</div>
      <div class="card"><div class="card-title">💚 Maior Lucro</div>${rankListHTML(rankLucro, d=>fmt(d.lucro),'Nenhuma venda ainda.')}</div>
      <div class="card"><div class="card-title">🔴 Menor Lucro</div>${rankListHTML([...rankLucro].reverse(), d=>fmt(d.lucro),'Nenhuma venda ainda.')}</div>
    </div>
    <div class="dash-grid">
      <div class="card">
        <div class="card-title">🏷️ Vendas por Categoria</div>
        ${catEntries.length ? `<ul class="rank-list">${catEntries.map(([cat,total],i)=>`<li><span class="rank-pos">${i+1}</span><span class="rank-name">${cat}</span><span class="rank-val">${fmt(total)}</span></li>`).join('')}</ul>` : '<div class="empty-state" style="padding:20px;"><p>Nenhuma venda ainda.</p></div>'}
      </div>
      <div class="card">
        <div class="card-title">⚠️ Alertas de Estoque</div>
        ${(estoqueBaixo.length+semEstoque.length)===0
          ? '<div class="empty-state" style="padding:20px;"><div class="empty-icon">✅</div><p>Todos os produtos com estoque OK.</p></div>'
          : `<ul class="rank-list">
              ${semEstoque.map(p=>`<li><span class="badge badge-danger" style="margin-right:8px;">Sem estoque</span><span class="rank-name">${p.nome}</span><span class="rank-val">0 un.</span></li>`).join('')}
              ${estoqueBaixo.map(p=>`<li><span class="badge badge-warning" style="margin-right:8px;">Baixo</span><span class="rank-name">${p.nome}</span><span class="rank-val">${p.quantidade} un.</span></li>`).join('')}
            </ul>`}
      </div>
    </div>`;
}

// ===== CAIXA / PDV =====
let _caixaItens = []; // [{ produto, quantidade }]

function renderCaixa() {
  const page = document.getElementById('page-caixa');
  page.innerHTML = `
    <div class="section-header"><h2>🧾 Caixa</h2></div>
    <div class="caixa-layout">
      <!-- Produtos -->
      <div class="card">
        <div class="card-title">Selecionar Produtos</div>
        <input class="caixa-search" id="caixa-search" placeholder="🔍 Buscar produto..." oninput="filtrarCaixaProdutos()" />
        <div class="produtos-grid" id="caixa-produtos-grid"></div>
      </div>
      <!-- Resumo -->
      <div class="caixa-resumo">
        <div class="card">
          <div class="card-title">🧾 Resumo da Venda</div>
          <div class="caixa-data-row">
            <label>Data:</label>
            <input type="date" id="caixa-data" value="${new Date().toISOString().slice(0,10)}" />
          </div>
          <ul class="caixa-itens" id="caixa-itens-lista"></ul>
          <div class="caixa-total">
            <span>Total</span>
            <span id="caixa-total-val">R$ 0,00</span>
          </div>
          <button class="btn-pago" id="btn-pago" onclick="finalizarCaixa()">✅ Pago</button>
          <button class="btn-limpar-caixa" onclick="limparCaixa()">🗑️ Limpar</button>
        </div>
      </div>
    </div>`;
  renderCaixaProdutos(_produtos);
  renderCaixaResumo();
}

function renderCaixaProdutos(lista) {
  const grid = document.getElementById('caixa-produtos-grid');
  if (!grid) return;
  if (!lista.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>Nenhum produto cadastrado.</p></div>';
    return;
  }
  grid.innerHTML = lista.map(p => {
    const semEstoque = p.quantidade === 0;
    return `<button class="produto-btn ${semEstoque ? 'sem-estoque' : ''}"
      onclick="${semEstoque ? '' : `adicionarAoCaixa('${p.id}')`}"
      ${semEstoque ? 'disabled' : ''}>
      <span class="pb-nome">${p.nome}</span>
      <span class="pb-preco">${fmt(p.preco)}</span>
      <span class="pb-estoque">${semEstoque ? 'Sem estoque' : `Estoque: ${p.quantidade}`}</span>
    </button>`;
  }).join('');
}

function filtrarCaixaProdutos() {
  const q = document.getElementById('caixa-search')?.value.toLowerCase() || '';
  renderCaixaProdutos(_produtos.filter(p => p.nome.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q)));
}

function adicionarAoCaixa(prodId) {
  const prod = _produtos.find(p => p.id === prodId);
  if (!prod) return;
  const existente = _caixaItens.find(i => i.produto.id === prodId);
  const qtdAtual = existente ? existente.quantidade : 0;
  if (qtdAtual >= prod.quantidade) {
    alert(`Estoque insuficiente. Disponível: ${prod.quantidade}`);
    return;
  }
  if (existente) {
    existente.quantidade++;
  } else {
    _caixaItens.push({ produto: prod, quantidade: 1 });
  }
  renderCaixaResumo();
}

function alterarQtdCaixa(prodId, delta) {
  const item = _caixaItens.find(i => i.produto.id === prodId);
  if (!item) return;
  const prod = _produtos.find(p => p.id === prodId);
  const novaQtd = item.quantidade + delta;
  if (novaQtd <= 0) {
    _caixaItens = _caixaItens.filter(i => i.produto.id !== prodId);
  } else if (prod && novaQtd > prod.quantidade) {
    alert(`Estoque insuficiente. Disponível: ${prod.quantidade}`);
    return;
  } else {
    item.quantidade = novaQtd;
  }
  renderCaixaResumo();
}

function removerDoCaixa(prodId) {
  _caixaItens = _caixaItens.filter(i => i.produto.id !== prodId);
  renderCaixaResumo();
}

function renderCaixaResumo() {
  const lista = document.getElementById('caixa-itens-lista');
  const totalEl = document.getElementById('caixa-total-val');
  const btnPago = document.getElementById('btn-pago');
  if (!lista) return;

  if (!_caixaItens.length) {
    lista.innerHTML = '<li style="color:var(--text-muted);font-size:0.85rem;padding:12px 0;text-align:center;">Nenhum item adicionado.</li>';
    if (totalEl) totalEl.textContent = 'R$ 0,00';
    if (btnPago) btnPago.disabled = true;
    return;
  }

  let total = 0;
  lista.innerHTML = _caixaItens.map(item => {
    const sub = item.produto.preco * item.quantidade;
    total += sub;
    return `<li class="caixa-item">
      <span class="caixa-item-nome">${item.produto.nome}</span>
      <span class="caixa-item-qtd">
        <button onclick="alterarQtdCaixa('${item.produto.id}', -1)">−</button>
        <span>${item.quantidade}</span>
        <button onclick="alterarQtdCaixa('${item.produto.id}', 1)">+</button>
      </span>
      <span class="caixa-item-sub">${fmt(sub)}</span>
      <button class="caixa-item-del" onclick="removerDoCaixa('${item.produto.id}')">✕</button>
    </li>`;
  }).join('');

  if (totalEl) totalEl.textContent = fmt(total);
  if (btnPago) btnPago.disabled = false;
}

async function finalizarCaixa() {
  if (!_caixaItens.length) return;
  const data = document.getElementById('caixa-data')?.value || new Date().toISOString().slice(0, 10);
  if (!confirm(`Confirmar pagamento de ${fmt(_caixaItens.reduce((s,i) => s + i.produto.preco * i.quantidade, 0))}?`)) return;

  showLoading('Registrando vendas...');
  try {
    for (const item of _caixaItens) {
      const prod = _produtos.find(p => p.id === item.produto.id);
      if (!prod) continue;
      // Atualiza estoque
      const novaQtd = prod.quantidade - item.quantidade;
      await window.FirebaseDB.saveProduto({ ...prod, quantidade: novaQtd });
      _produtos = _produtos.map(p => p.id === prod.id ? { ...p, quantidade: novaQtd } : p);
      // Registra venda
      const venda = {
        produtoId: prod.id, nomeProduto: prod.nome, categoria: prod.categoria,
        quantidade: item.quantidade, preco: prod.preco,
        total: prod.preco * item.quantidade, custo: prod.custo, data
      };
      const id = await window.FirebaseDB.saveVenda(venda);
      _vendas.push({ id, ...venda });
    }
    _caixaItens = [];
    renderCaixa();
    checkNotificacoes();
  } finally { hideLoading(); }
}

function limparCaixa() {
  if (_caixaItens.length && !confirm('Limpar todos os itens do caixa?')) return;
  _caixaItens = [];
  renderCaixaResumo();
}
