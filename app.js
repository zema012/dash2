// Vlimp Analytics - Interactive Dashboard Controller
// Handles state, filtering, HTML5 Canvas 2D cluster visualization, Chart.js instances, modal 360°, and what-if simulator.

(function() {
  'use strict';

  // Global State
  const state = {
    raw: window.VLIMP_DATA || {},
    filteredClients: [],
    filters: {
      canal: 'ALL',
      uf: 'ALL',
      regiao: 'ALL',
      porte: 'ALL',
      cluster: 'ALL',
      vendedor: 'ALL',
      search: ''
    },
    tablePagination: {
      page: 1,
      pageSize: 15,
      sortKey: 'rec_liq',
      sortOrder: 'desc'
    },
    charts: {},
    canvas: {
      zoom: 1,
      panX: 0,
      panY: 0,
      isDragging: false,
      startX: 0,
      startY: 0,
      hoveredClient: null,
      highlightSearch: ''
    }
  };

  // Formatters
  const fmt = {
    currency: (v) => {
      if (v >= 1e6) return 'R$ ' + (v / 1e6).toFixed(2).replace('.', ',') + 'M';
      if (v >= 1e3) return 'R$ ' + (v / 1e3).toFixed(1).replace('.', ',') + 'k';
      return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    currencyFull: (v) => 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    number: (v) => (v || 0).toLocaleString('pt-BR'),
    pct: (v) => (v || 0).toFixed(2).replace('.', ',') + '%',
    pct1: (v) => (v || 0).toFixed(1).replace('.', ',') + '%'
  };

  // DOM Elements
  const el = {
    navItems: document.querySelectorAll('.nav-item'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    headerTitle: document.getElementById('headerTitle'),
    headerSubtitle: document.getElementById('headerSubtitle'),
    activeFilterBadge: document.getElementById('activeFilterBadge'),
    
    // Filters
    filterCanal: document.getElementById('filterCanal'),
    filterUF: document.getElementById('filterUF'),
    filterRegiao: document.getElementById('filterRegiao'),
    filterPorte: document.getElementById('filterPorte'),
    filterCluster: document.getElementById('filterCluster'),
    filterVendedor: document.getElementById('filterVendedor'),
    btnResetFilters: document.getElementById('btnResetFilters'),
    
    // Macro KPIs
    kpiReceita: document.getElementById('kpiReceita'),
    kpiReceitaBruta: document.getElementById('kpiReceitaBruta'),
    kpiMargemPct: document.getElementById('kpiMargemPct'),
    kpiMargemValor: document.getElementById('kpiMargemValor'),
    kpiPDVsAtivos: document.getElementById('kpiPDVsAtivos'),
    kpiTaxaAtivacao: document.getElementById('kpiTaxaAtivacao'),
    kpiTicketMedio: document.getElementById('kpiTicketMedio'),
    kpiTotalPedidos: document.getElementById('kpiTotalPedidos'),
    kpiDescontoPct: document.getElementById('kpiDescontoPct'),
    kpiDescontoValor: document.getElementById('kpiDescontoValor'),
    kpiConvVisitas: document.getElementById('kpiConvVisitas'),

    // Containers
    clustersSummaryGrid: document.getElementById('clustersSummaryGrid'),
    crossSellHeatmapContainer: document.getElementById('crossSellHeatmapContainer'),
    
    // Table
    clientsTableBody: document.getElementById('clientsTableBody'),
    tableSearchInput: document.getElementById('tableSearchInput'),
    paginationInfo: document.getElementById('paginationInfo'),
    btnPrevPage: document.getElementById('btnPrevPage'),
    btnNextPage: document.getElementById('btnNextPage'),

    // Sellers & SKUs
    sellersTableBody: document.getElementById('sellersTableBody'),
    productsTableBody: document.getElementById('productsTableBody'),
    searchProductInput: document.getElementById('searchProductInput'),

    // Canvas
    clusterCanvas: document.getElementById('clusterCanvas'),
    canvasContainer: document.getElementById('canvasContainer'),
    canvasLegend: document.getElementById('canvasLegend'),
    canvasTooltip: document.getElementById('canvasTooltip'),
    btnZoomIn: document.getElementById('btnZoomIn'),
    btnZoomOut: document.getElementById('btnZoomOut'),
    btnZoomReset: document.getElementById('btnZoomReset'),
    canvasSearchPDV: document.getElementById('canvasSearchPDV'),

    // Modal
    modalOverlay: document.getElementById('clientModalOverlay'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    modalClientName: document.getElementById('modalClientName'),
    modalClientSub: document.getElementById('modalClientSub'),
    modalClientClusterTag: document.getElementById('modalClientClusterTag'),
    modalClusterRationaleTitle: document.getElementById('modalClusterRationaleTitle'),
    modalClusterRationaleDesc: document.getElementById('modalClusterRationaleDesc'),
    modalClusterBox: document.getElementById('modalClusterBox'),
    modalRecLiq: document.getElementById('modalRecLiq'),
    modalRecYoY: document.getElementById('modalRecYoY'),
    modalMargemPct: document.getElementById('modalMargemPct'),
    modalMargemVal: document.getElementById('modalMargemVal'),
    modalTicket: document.getElementById('modalTicket'),
    modalPedidos: document.getElementById('modalPedidos'),
    modalRecencia: document.getElementById('modalRecencia'),
    modalUltimaCompra: document.getElementById('modalUltimaCompra'),
    modalMixContainer: document.getElementById('modalMixContainer'),
    modalTopSKUs: document.getElementById('modalTopSKUs'),
    modalSellerInfo: document.getElementById('modalSellerInfo'),

    // Simulator
    simSliderDesconto: document.getElementById('simSliderDesconto'),
    simSliderChurn: document.getElementById('simSliderChurn'),
    simSliderCrossSell: document.getElementById('simSliderCrossSell'),
    simSliderRotas: document.getElementById('simSliderRotas'),
    simValDesconto: document.getElementById('simValDesconto'),
    simValChurn: document.getElementById('simValChurn'),
    simValCrossSell: document.getElementById('simValCrossSell'),
    simValRotas: document.getElementById('simValRotas'),
    simResReceita: document.getElementById('simResReceita'),
    simResReceitaPct: document.getElementById('simResReceitaPct'),
    simResMargem: document.getElementById('simResMargem'),
    simResMargemPct: document.getElementById('simResMargemPct')
  };

  // Tab Titles Configuration
  const tabTitles = {
    'tab-macro': { title: 'Visão Executiva & Estratégica Macro', sub: 'Diagnóstico comercial integrado, clusterização de PDVs e oportunidades de receita' },
    'tab-clusters': { title: 'Análise de Clusters & Projeção Dimensional 2D', sub: 'Mapeamento estatístico K-Means/PCA dos 4.000 PDVs com radar comparativo de perfis' },
    'tab-patterns': { title: 'Descoberta de Padrões & Correlações Comerciais', sub: 'Destruição de margem por descontos, produtividade de visitas e matriz de cross-sell' },
    'tab-clients': { title: 'Raio-X de Clientes (Visão Micro - PDV 360°)', sub: 'Ficha detalhada de cada PDV com histórico recente, mix de categorias e score RFM' },
    'tab-sellers': { title: 'Força de Vendas (Visão Micro - Vendedores 360°)', sub: 'Scorecards dos 60 vendedores, metas, conversão de visitas e custo por rota' },
    'tab-products': { title: 'Mix de Produtos & Matriz Curva ABC', sub: 'Rentabilidade por SKU, sensibilidade promocional e itens prioritários de reposição' },
    'tab-simulator': { title: 'Simulador Tático & Plano de Ação Estratégico', sub: 'Alavancas de crescimento, impacto financeiro projetado e plano de execução comercial' }
  };

  // Initialize Application
  function init() {
    if (!state.raw.clientes || state.raw.clientes.length === 0) {
      console.error('Dados não encontrados em window.VLIMP_DATA');
      return;
    }

    state.filteredClients = [...state.raw.clientes];

    populateFilterDropdowns();
    setupEventListeners();
    setupCanvas();

    renderMacroKPIs();
    renderClusterCards();
    renderMacroCharts();
    renderClusterCharts();
    renderPatternCharts();
    renderCrossSellHeatmap();
    renderClientsTable();
    renderSellersView();
    renderProductsView();
    initSimulator();

    // Resize canvas properly
    resizeCanvas();
    window.addEventListener('resize', () => {
      resizeCanvas();
      drawCanvas();
    });
  }

  // Populate Filter Dropdowns
  function populateFilterDropdowns() {
    const canais = [...new Set(state.raw.clientes.map(c => c.canal))].sort();
    canais.forEach(c => {
      el.filterCanal.innerHTML += `<option value="${c}">${c}</option>`;
    });

    const ufs = [...new Set(state.raw.clientes.map(c => c.uf))].sort();
    ufs.forEach(u => {
      el.filterUF.innerHTML += `<option value="${u}">${u}</option>`;
    });

    const regioes = [...new Set(state.raw.clientes.map(c => c.regiao))].sort();
    regioes.forEach(r => {
      el.filterRegiao.innerHTML += `<option value="${r}">${r}</option>`;
    });

    state.raw.clusters.forEach(cl => {
      el.filterCluster.innerHTML += `<option value="${cl.cluster_raw}">${cl.nome}</option>`;
    });

    const vendedores = [...state.raw.vendedores].sort((a, b) => a.nome.localeCompare(b.nome));
    vendedores.forEach(v => {
      el.filterVendedor.innerHTML += `<option value="${v.id}">${v.nome} (${v.id})</option>`;
    });
  }

  // Event Listeners Setup
  function setupEventListeners() {
    // Navigation Tabs
    el.navItems.forEach(item => {
      item.addEventListener('click', () => {
        const targetTab = item.getAttribute('data-tab');
        el.navItems.forEach(n => n.classList.remove('active'));
        el.tabPanes.forEach(p => p.classList.remove('active'));

        item.classList.add('active');
        const activePane = document.getElementById(targetTab);
        if (activePane) activePane.classList.add('active');

        // Update header
        if (tabTitles[targetTab]) {
          el.headerTitle.innerText = tabTitles[targetTab].title;
          el.headerSubtitle.innerText = tabTitles[targetTab].sub;
        }

        // Trigger chart resizes or redraw canvas if opening cluster tab
        if (targetTab === 'tab-clusters') {
          setTimeout(() => {
            resizeCanvas();
            drawCanvas();
          }, 50);
        }
      });
    });

    // Filters change
    const filterInputs = [el.filterCanal, el.filterUF, el.filterRegiao, el.filterPorte, el.filterCluster, el.filterVendedor];
    filterInputs.forEach(input => {
      input.addEventListener('change', () => {
        applyFilters();
      });
    });

    el.btnResetFilters.addEventListener('click', () => {
      el.filterCanal.value = 'ALL';
      el.filterUF.value = 'ALL';
      el.filterRegiao.value = 'ALL';
      el.filterPorte.value = 'ALL';
      el.filterCluster.value = 'ALL';
      el.filterVendedor.value = 'ALL';
      if (el.tableSearchInput) el.tableSearchInput.value = '';
      if (el.canvasSearchPDV) el.canvasSearchPDV.value = '';
      state.canvas.highlightSearch = '';
      applyFilters();
    });

    // Search in Clients Table
    if (el.tableSearchInput) {
      el.tableSearchInput.addEventListener('input', (e) => {
        state.filters.search = e.target.value.toLowerCase().trim();
        state.tablePagination.page = 1;
        renderClientsTable();
      });
    }

    // Search in Canvas 2D
    if (el.canvasSearchPDV) {
      el.canvasSearchPDV.addEventListener('input', (e) => {
        state.canvas.highlightSearch = e.target.value.toLowerCase().trim();
        drawCanvas();
      });
    }

    // Search Products
    if (el.searchProductInput) {
      el.searchProductInput.addEventListener('input', () => {
        renderProductsView();
      });
    }

    // Pagination
    el.btnPrevPage.addEventListener('click', () => {
      if (state.tablePagination.page > 1) {
        state.tablePagination.page--;
        renderClientsTable();
      }
    });

    el.btnNextPage.addEventListener('click', () => {
      const totalPages = Math.ceil(getFilteredClientsForTable().length / state.tablePagination.pageSize);
      if (state.tablePagination.page < totalPages) {
        state.tablePagination.page++;
        renderClientsTable();
      }
    });

    // Table sorting
    document.querySelectorAll('#clientsTable th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const sortKey = th.getAttribute('data-sort');
        if (state.tablePagination.sortKey === sortKey) {
          state.tablePagination.sortOrder = state.tablePagination.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          state.tablePagination.sortKey = sortKey;
          state.tablePagination.sortOrder = 'desc';
        }
        renderClientsTable();
      });
    });

    // Modal Close
    el.modalCloseBtn.addEventListener('click', closeModal);
    el.modalOverlay.addEventListener('click', (e) => {
      if (e.target === el.modalOverlay) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // Export Button
    document.getElementById('btnExportSummary').addEventListener('click', exportSummaryCSV);
  }

  // Filter Application
  function applyFilters() {
    state.filters.canal = el.filterCanal.value;
    state.filters.uf = el.filterUF.value;
    state.filters.regiao = el.filterRegiao.value;
    state.filters.porte = el.filterPorte.value;
    state.filters.cluster = el.filterCluster.value;
    state.filters.vendedor = el.filterVendedor.value;

    let hasActiveFilter = false;
    state.filteredClients = state.raw.clientes.filter(c => {
      if (state.filters.canal !== 'ALL') {
        hasActiveFilter = true;
        if (c.canal !== state.filters.canal) return false;
      }
      if (state.filters.uf !== 'ALL') {
        hasActiveFilter = true;
        if (c.uf !== state.filters.uf) return false;
      }
      if (state.filters.regiao !== 'ALL') {
        hasActiveFilter = true;
        if (c.regiao !== state.filters.regiao) return false;
      }
      if (state.filters.porte !== 'ALL') {
        hasActiveFilter = true;
        if (c.porte !== state.filters.porte) return false;
      }
      if (state.filters.cluster !== 'ALL') {
        hasActiveFilter = true;
        if (c.cluster_raw !== parseInt(state.filters.cluster)) return false;
      }
      if (state.filters.vendedor !== 'ALL') {
        hasActiveFilter = true;
        if (c.vendedor_id !== state.filters.vendedor) return false;
      }
      return true;
    });

    el.activeFilterBadge.style.display = hasActiveFilter ? 'inline-block' : 'none';
    if (hasActiveFilter) {
      el.activeFilterBadge.innerText = `${state.filteredClients.length} de 4.000 PDVs filtrados`;
    }

    state.tablePagination.page = 1;

    renderMacroKPIs();
    renderClusterCards();
    renderClientsTable();
    drawCanvas();
    updateMacroCharts();
  }

  // Render Macro KPIs
  function renderMacroKPIs() {
    const clients = state.filteredClients;
    const isFiltered = clients.length !== state.raw.clientes.length;

    let recLiq, recBruta, descTotal, margemTotal, pedidosTotal, ativosCount;

    if (!isFiltered) {
      const k = state.raw.kpis;
      recLiq = k.receita_liquida_total;
      recBruta = k.receita_bruta_total;
      descTotal = k.desconto_total;
      margemTotal = k.margem_total;
      pedidosTotal = k.total_pedidos;
      ativosCount = k.total_clientes_ativos;
    } else {
      recLiq = clients.reduce((acc, c) => acc + c.rec_liq, 0);
      recBruta = clients.reduce((acc, c) => acc + c.rec_bruta, 0);
      descTotal = clients.reduce((acc, c) => acc + c.desconto, 0);
      margemTotal = clients.reduce((acc, c) => acc + c.margem, 0);
      pedidosTotal = clients.reduce((acc, c) => acc + c.pedidos, 0);
      ativosCount = clients.filter(c => c.rec_liq > 0).length;
    }

    const margemPct = recLiq > 0 ? (margemTotal / recLiq) * 100 : 0;
    const descPct = recBruta > 0 ? (descTotal / recBruta) * 100 : 0;
    const ticketMedio = pedidosTotal > 0 ? recLiq / pedidosTotal : 0;
    const taxaAtivacao = clients.length > 0 ? (ativosCount / clients.length) * 100 : 0;

    el.kpiReceita.innerText = fmt.currency(recLiq);
    el.kpiReceitaBruta.innerText = fmt.currency(recBruta);
    el.kpiMargemPct.innerText = fmt.pct(margemPct);
    el.kpiMargemValor.innerText = fmt.currency(margemTotal);
    el.kpiPDVsAtivos.innerText = fmt.number(ativosCount);
    el.kpiTaxaAtivacao.innerText = fmt.pct1(taxaAtivacao);
    el.kpiTicketMedio.innerText = fmt.currency(ticketMedio);
    el.kpiTotalPedidos.innerText = fmt.number(pedidosTotal);
    el.kpiDescontoPct.innerText = fmt.pct(descPct);
    el.kpiDescontoValor.innerText = fmt.currency(descTotal);
  }

  // Render Cluster Summary Cards
  function renderClusterCards() {
    el.clustersSummaryGrid.innerHTML = '';
    const totalFiltered = state.filteredClients.length;

    state.raw.clusters.forEach(c => {
      const countInFilter = state.filteredClients.filter(cli => cli.cluster_raw === c.cluster_raw).length;
      const recInFilter = state.filteredClients.filter(cli => cli.cluster_raw === c.cluster_raw).reduce((acc, cli) => acc + cli.rec_liq, 0);
      const isSelected = state.filters.cluster === String(c.cluster_raw);

      const card = document.createElement('div');
      card.className = `cluster-card ${isSelected ? 'active-cluster' : ''}`;
      card.style.setProperty('--cluster-color', c.color);
      card.style.setProperty('--cluster-glow', c.color + '40');

      card.innerHTML = `
        <div class="cluster-card-header">
          <div class="cluster-card-title">
            <span class="cluster-dot"></span>
            <span>${c.nome}</span>
          </div>
          <span class="cluster-tag" style="color: ${c.color}; border: 1px solid ${c.color}40;">${c.tag}</span>
        </div>
        <p class="cluster-desc">${c.desc}</p>
        <div class="cluster-metrics-row">
          <div class="c-metric">
            <span class="c-metric-lbl">PDVs</span>
            <span class="c-metric-val">${countInFilter} (${totalFiltered > 0 ? ((countInFilter / totalFiltered) * 100).toFixed(0) : 0}%)</span>
          </div>
          <div class="c-metric">
            <span class="c-metric-lbl">Faturamento</span>
            <span class="c-metric-val">${fmt.currency(recInFilter)}</span>
          </div>
          <div class="c-metric">
            <span class="c-metric-lbl">Margem Média</span>
            <span class="c-metric-val" style="color: ${c.color};">${c.margem_pct_med}%</span>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        if (state.filters.cluster === String(c.cluster_raw)) {
          el.filterCluster.value = 'ALL';
        } else {
          el.filterCluster.value = String(c.cluster_raw);
        }
        applyFilters();
      });

      el.clustersSummaryGrid.appendChild(card);
    });
  }

  // Macro Charts Rendering
  function renderMacroCharts() {
    // 1. Evolução Mensal
    const ctx1 = document.getElementById('chartEvolucaoMensal').getContext('2d');
    const meses = state.raw.temporal.map(t => t.mes);
    const recs = state.raw.temporal.map(t => t.rec_liq);
    const margens = state.raw.temporal.map(t => t.margem_pct);

    state.charts.evolucao = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: meses,
        datasets: [
          {
            label: 'Receita Líquida (R$)',
            data: recs,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            fill: true,
            tension: 0.35,
            yAxisID: 'y'
          },
          {
            label: 'Margem %',
            data: margens,
            borderColor: '#10b981',
            borderDash: [5, 5],
            pointRadius: 3,
            tension: 0.2,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#9ca3af', font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (item) => item.datasetIndex === 0 ? `Receita: ${fmt.currencyFull(item.raw)}` : `Margem: ${item.raw.toFixed(2)}%`
            }
          }
        },
        scales: {
          x: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: {
            ticks: { color: '#6b7280', callback: (v) => fmt.currency(v) },
            grid: { color: 'rgba(255,255,255,0.04)' }
          },
          y1: {
            position: 'right',
            min: 15,
            max: 35,
            ticks: { color: '#10b981', callback: (v) => v + '%' },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });

    // 2. Share de Mercado vs Potencial por Estado
    const ctx2 = document.getElementById('chartShareMercado').getContext('2d');
    const ufs = state.raw.geografia.map(g => g.uf);
    const shares = state.raw.geografia.map(g => g.share_pct);
    const potenciais = state.raw.geografia.map(g => g.potencial_24m / 1e6);

    state.charts.share = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: ufs,
        datasets: [
          {
            label: 'Share Vlimp (%)',
            data: shares,
            backgroundColor: '#3b82f6',
            borderRadius: 6,
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => `Share de Mercado Vlimp: ${item.raw.toFixed(2)}%`
            }
          }
        },
        scales: {
          x: { ticks: { color: '#9ca3af' }, grid: { display: false } },
          y: {
            ticks: { color: '#6b7280', callback: (v) => v + '%' },
            grid: { color: 'rgba(255,255,255,0.04)' }
          }
        }
      }
    });
  }

  function updateMacroCharts() {
    // When filters change, update chart data if desired
  }

  // Cluster Charts (Radar & Breakdown por Canal)
  function renderClusterCharts() {
    // 1. Radar Multidimensional dos Clusters
    const ctxRadar = document.getElementById('chartRadarClusters').getContext('2d');
    const radarLabels = ['Ticket Médio', 'Frequência (Pedidos)', 'Recência (Inverso)', 'Margem %', 'Mix SKUs', 'Porte Físico (Checkouts)'];

    // Normalizar atributos dos 5 clusters para escala 0 a 100
    const radarDatasets = state.raw.clusters.map(c => {
      // Normalizações
      const normTicket = Math.min(100, (c.ticket_med / 1200) * 100);
      const normFreq = Math.min(100, (c.pedidos_med / 35) * 100);
      const normRecencia = Math.max(0, 100 - (c.recencia_med / 300) * 100);
      const normMargem = Math.min(100, (c.margem_pct_med / 30) * 100);
      const normMix = Math.min(100, (c.skus_med / 25) * 100);
      const normPorte = Math.min(100, (c.checkouts_med / 6) * 100);

      return {
        label: c.nome,
        data: [normTicket, normFreq, normRecencia, normMargem, normMix, normPorte],
        borderColor: c.color,
        backgroundColor: c.color + '25',
        pointBackgroundColor: c.color,
        borderWidth: 2
      };
    });

    state.charts.radar = new Chart(ctxRadar, {
      type: 'radar',
      data: {
        labels: radarLabels,
        datasets: radarDatasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#9ca3af', font: { size: 10 }, boxWidth: 12 }
          }
        },
        scales: {
          r: {
            angleLines: { color: 'rgba(255,255,255,0.06)' },
            grid: { color: 'rgba(255,255,255,0.06)' },
            pointLabels: { color: '#e5e7eb', font: { size: 11, weight: '500' } },
            ticks: { display: false, max: 100, min: 0 }
          }
        }
      }
    });

    // 2. Distribuição de Clusters por Canal
    const ctxCanal = document.getElementById('chartClusterPorCanal').getContext('2d');
    const canais = [...new Set(state.raw.clientes.map(c => c.canal))].sort();

    const canalDatasets = state.raw.clusters.map(cl => {
      const counts = canais.map(canal => {
        return state.raw.clientes.filter(c => c.canal === canal && c.cluster_raw === cl.cluster_raw).length;
      });
      return {
        label: cl.nome,
        data: counts,
        backgroundColor: cl.color,
        stack: 'channels'
      };
    });

    state.charts.canalStack = new Chart(ctxCanal, {
      type: 'bar',
      data: {
        labels: canais,
        datasets: canalDatasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 10 }, boxWidth: 12 } }
        },
        scales: {
          x: { ticks: { color: '#9ca3af', font: { size: 11 } }, grid: { display: false } },
          y: {
            stacked: true,
            ticks: { color: '#6b7280' },
            grid: { color: 'rgba(255,255,255,0.04)' }
          }
        }
      }
    });
  }

  // Pattern Charts Rendering
  function renderPatternCharts() {
    // 1. Desconto vs Destruição de Margem
    const ctxDesc = document.getElementById('chartDescontoMargem').getContext('2d');
    const faixas = state.raw.desconto_curva.map(d => d.faixa);
    const margensDesc = state.raw.desconto_curva.map(d => d.margem_pct);

    state.charts.desconto = new Chart(ctxDesc, {
      type: 'bar',
      data: {
        labels: faixas,
        datasets: [
          {
            label: 'Margem de Contribuição %',
            data: margensDesc,
            backgroundColor: faixas.map((f, i) => i < 2 ? '#10b981' : i < 4 ? '#f59e0b' : '#ef4444'),
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => `Margem Média: ${item.raw.toFixed(2)}% (Queda acentuada com descontos altos)`
            }
          }
        },
        scales: {
          x: { ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { display: false } },
          y: {
            min: 0,
            max: 32,
            ticks: { color: '#6b7280', callback: (v) => v + '%' },
            grid: { color: 'rgba(255,255,255,0.04)' }
          }
        }
      }
    });

    // 2. Visitas Duração x Conversão
    const ctxVis = document.getElementById('chartVisitasEficiencia').getContext('2d');
    const duracoes = ['0-15 min', '16-30 min', '31-45 min', '46-60 min', '61-90 min', '90+ min'];

    const planData = duracoes.map(d => {
      const match = state.raw.visitas_padroes.find(v => v.faixa === d && v.tipo === 'Planejada');
      return match ? match.conversao_pct : 0;
    });

    const extraData = duracoes.map(d => {
      const match = state.raw.visitas_padroes.find(v => v.faixa === d && v.tipo === 'Extra-rota');
      return match ? match.conversao_pct : 0;
    });

    state.charts.visitas = new Chart(ctxVis, {
      type: 'bar',
      data: {
        labels: duracoes,
        datasets: [
          {
            label: 'Planejada (% Conversão)',
            data: planData,
            backgroundColor: '#10b981',
            borderRadius: 6
          },
          {
            label: 'Extra-rota (% Conversão)',
            data: extraData,
            backgroundColor: '#f59e0b',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#9ca3af', font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (item) => `${item.dataset.label}: ${item.raw.toFixed(1)}% de conversão em pedido`
            }
          }
        },
        scales: {
          x: { ticks: { color: '#9ca3af' }, grid: { display: false } },
          y: {
            min: 0,
            max: 100,
            ticks: { color: '#6b7280', callback: (v) => v + '%' },
            grid: { color: 'rgba(255,255,255,0.04)' }
          }
        }
      }
    });
  }

  // Cross-Sell Heatmap Table
  function renderCrossSellHeatmap() {
    const cs = state.raw.cross_sell;
    if (!cs || !cs.categorias) return;

    let html = '<table class="heatmap-table"><thead><tr><th>Categoria Base (Linha) \\ Co-ocorrência (Coluna)</th>';
    cs.categorias.forEach(cat => {
      html += `<th>${cat}</th>`;
    });
    html += '</tr></thead><tbody>';

    cs.categorias.forEach((catRow, rIdx) => {
      html += `<tr><th>${catRow}</th>`;
      cs.categorias.forEach((catCol, cIdx) => {
        const val = cs.matrix[rIdx][cIdx];
        const isSelf = rIdx === cIdx;
        const opacity = isSelf ? 0.9 : Math.min(0.85, (val / 100) * 0.9 + 0.1);
        const bg = isSelf ? 'rgba(99, 102, 241, 0.4)' : `rgba(16, 185, 129, ${opacity})`;
        const textColor = opacity > 0.4 ? '#fff' : '#9ca3af';

        html += `<td style="background: ${bg}; color: ${textColor};" class="heatmap-cell">${val.toFixed(1)}%</td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    el.crossSellHeatmapContainer.innerHTML = html;
  }

  // HTML5 Canvas 2D Scatterplot Engine (Zoom, Pan, Hover, Click, Search)
  function setupCanvas() {
    const canvas = el.clusterCanvas;
    const ctx = canvas.getContext('2d');

    // Legend rendering
    el.canvasLegend.innerHTML = '';
    state.raw.clusters.forEach(cl => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `<span class="cluster-dot" style="background: ${cl.color};"></span><span>${cl.nome}</span>`;
      item.addEventListener('click', () => {
        el.filterCluster.value = String(cl.cluster_raw);
        applyFilters();
      });
      el.canvasLegend.appendChild(item);
    });

    // Zoom buttons
    el.btnZoomIn.addEventListener('click', () => {
      state.canvas.zoom = Math.min(5, state.canvas.zoom * 1.3);
      drawCanvas();
    });
    el.btnZoomOut.addEventListener('click', () => {
      state.canvas.zoom = Math.max(0.6, state.canvas.zoom / 1.3);
      drawCanvas();
    });
    el.btnZoomReset.addEventListener('click', () => {
      state.canvas.zoom = 1;
      state.canvas.panX = 0;
      state.canvas.panY = 0;
      drawCanvas();
    });

    // Mouse drag for pan
    canvas.addEventListener('mousedown', (e) => {
      state.canvas.isDragging = true;
      state.canvas.startX = e.clientX - state.canvas.panX;
      state.canvas.startY = e.clientY - state.canvas.panY;
      canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mouseup', () => {
      state.canvas.isDragging = false;
      canvas.style.cursor = 'default';
    });

    canvas.addEventListener('mousemove', (e) => {
      if (state.canvas.isDragging) {
        state.canvas.panX = e.clientX - state.canvas.startX;
        state.canvas.panY = e.clientY - state.canvas.startY;
        drawCanvas();
      } else {
        handleCanvasHover(e);
      }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      state.canvas.zoom = Math.max(0.5, Math.min(6, state.canvas.zoom * zoomFactor));
      drawCanvas();
    });

    // Click on node to open 360 modal
    canvas.addEventListener('click', () => {
      if (state.canvas.hoveredClient) {
        openClientModal(state.canvas.hoveredClient);
      }
    });
  }

  function resizeCanvas() {
    const canvas = el.clusterCanvas;
    const container = el.canvasContainer;
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    }
  }

  function drawCanvas() {
    const canvas = el.clusterCanvas;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Background Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    const step = 40 * state.canvas.zoom;
    const offsetX = (w / 2 + state.canvas.panX) % step;
    const offsetY = (h / 2 + state.canvas.panY) % step;

    for (let x = offsetX; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = offsetY; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Axes Center
    const centerX = w / 2 + state.canvas.panX;
    const centerY = h / 2 + state.canvas.panY;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(w, centerY);
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, h);
    ctx.stroke();

    // Scale coordinates (PCA dimensions typically span roughly -4 to 6)
    const scaleFactor = 45 * state.canvas.zoom;

    // Filter set for quick lookup
    const filteredIdSet = new Set(state.filteredClients.map(c => c.id));
    const searchQuery = state.canvas.highlightSearch;

    // Draw all clients
    state.raw.clientes.forEach(cli => {
      const px = centerX + cli.x * scaleFactor;
      const py = centerY - cli.y * scaleFactor; // Invert Y

      // Skip if offscreen
      if (px < -20 || px > w + 20 || py < -20 || py > h + 20) return;

      const isFilteredIn = filteredIdSet.has(cli.id);
      const isSearchMatch = searchQuery && (cli.nome.toLowerCase().includes(searchQuery) || cli.id.toLowerCase().includes(searchQuery) || cli.cidade.toLowerCase().includes(searchQuery));
      const isHovered = state.canvas.hoveredClient && state.canvas.hoveredClient.id === cli.id;

      let radius = Math.max(3, Math.min(10, Math.sqrt(cli.rec_liq) / 20));
      if (!isFilteredIn) radius = 2.5;
      if (isHovered || isSearchMatch) radius = Math.max(8, radius * 1.6);

      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);

      if (isFilteredIn) {
        ctx.fillStyle = cli.cluster_color;
        ctx.globalAlpha = searchQuery ? (isSearchMatch ? 1.0 : 0.25) : 0.82;
        ctx.fill();

        if (isHovered || isSearchMatch) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Pulsing glow ring
          ctx.beginPath();
          ctx.arc(px, py, radius + 5, 0, Math.PI * 2);
          ctx.strokeStyle = cli.cluster_color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#4b5563';
        ctx.globalAlpha = 0.15;
        ctx.fill();
      }
    });

    ctx.restore();
  }

  function handleCanvasHover(e) {
    const canvas = el.clusterCanvas;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const centerX = w / 2 + state.canvas.panX;
    const centerY = h / 2 + state.canvas.panY;
    const scaleFactor = 45 * state.canvas.zoom;

    let closest = null;
    let minDist = 12; // hover threshold in pixels

    for (let i = 0; i < state.filteredClients.length; i++) {
      const cli = state.filteredClients[i];
      const px = centerX + cli.x * scaleFactor;
      const py = centerY - cli.y * scaleFactor;

      const dist = Math.hypot(mouseX - px, mouseY - py);
      if (dist < minDist) {
        minDist = dist;
        closest = cli;
      }
    }

    if (closest !== state.canvas.hoveredClient) {
      state.canvas.hoveredClient = closest;
      drawCanvas();

      if (closest) {
        canvas.style.cursor = 'pointer';
        el.canvasTooltip.style.display = 'block';
        el.canvasTooltip.style.left = `${Math.min(w - 220, mouseX + 15)}px`;
        el.canvasTooltip.style.top = `${Math.min(h - 140, mouseY + 15)}px`;
        el.canvasTooltip.innerHTML = `
          <div style="font-weight: 700; color: #fff; font-size: 0.88rem;">${closest.nome} (${closest.id})</div>
          <div style="color: ${closest.cluster_color}; font-weight: 600; font-size: 0.75rem; margin-bottom: 0.3rem;">● ${closest.cluster_nome}</div>
          <div style="color: #9ca3af; font-size: 0.72rem;">${closest.cidade}, ${closest.uf} • ${closest.canal} (${closest.porte})</div>
          <div style="display: flex; justify-content: space-between; margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px solid rgba(255,255,255,0.08);">
            <span>Receita: <strong style="color: #fff;">${fmt.currency(closest.rec_liq)}</strong></span>
            <span>Margem: <strong style="color: #10b981;">${closest.margem_pct}%</strong></span>
          </div>
          <div style="color: #6366f1; font-size: 0.68rem; margin-top: 0.3rem; text-align: right;">👉 Clique para Raio-X 360°</div>
        `;
      } else {
        canvas.style.cursor = 'default';
        el.canvasTooltip.style.display = 'none';
      }
    }
  }

  // Clients Table (Micro 360 View List)
  function getFilteredClientsForTable() {
    let list = [...state.filteredClients];
    const search = state.filters.search;
    if (search) {
      list = list.filter(c => 
        c.nome.toLowerCase().includes(search) || 
        c.id.toLowerCase().includes(search) || 
        c.cidade.toLowerCase().includes(search) ||
        c.uf.toLowerCase().includes(search) ||
        c.vendedor_id.toLowerCase().includes(search)
      );
    }

    // Sort
    const { sortKey, sortOrder } = state.tablePagination;
    list.sort((a, b) => {
      let valA = a[sortKey];
      let valB = b[sortKey];
      if (typeof valA === 'string') return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    return list;
  }

  function renderClientsTable() {
    const list = getFilteredClientsForTable();
    const { page, pageSize } = state.tablePagination;
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const startIdx = (page - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, total);
    const pageItems = list.slice(startIdx, endIdx);

    el.paginationInfo.innerText = `Mostrando ${total === 0 ? 0 : startIdx + 1}-${endIdx} de ${fmt.number(total)} clientes`;
    el.btnPrevPage.disabled = page <= 1;
    el.btnNextPage.disabled = page >= totalPages;

    el.clientsTableBody.innerHTML = '';
    if (pageItems.length === 0) {
      el.clientsTableBody.innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 2rem; color: #6b7280;">Nenhum cliente encontrado com os filtros selecionados.</td></tr>`;
      return;
    }

    pageItems.forEach(cli => {
      const tr = document.createElement('tr');
      tr.className = 'clickable';
      tr.innerHTML = `
        <td style="font-weight: 600; color: #6366f1;">${cli.id}</td>
        <td style="font-weight: 600;">${cli.nome}</td>
        <td>${cli.cidade} / ${cli.uf}</td>
        <td>${cli.canal}</td>
        <td><span class="badge" style="background: rgba(255,255,255,0.06);">${cli.porte}</span></td>
        <td><span class="badge" style="color: ${cli.cluster_color}; border: 1px solid ${cli.cluster_color}40; background: ${cli.cluster_color}15;">${cli.cluster_nome}</span></td>
        <td style="font-weight: 600;">${fmt.currency(cli.rec_liq)}</td>
        <td style="color: ${cli.margem_pct >= 25 ? '#10b981' : cli.margem_pct >= 20 ? '#f59e0b' : '#ef4444'}; font-weight: 600;">${cli.margem_pct}%</td>
        <td>${cli.pedidos}</td>
        <td>${cli.recencia_dias >= 900 ? 'Nunca' : cli.recencia_dias + 'd'}</td>
        <td>${cli.skus} SKUs (${cli.categorias} cat)</td>
        <td><button class="btn-reset-filters" style="padding: 0.2rem 0.5rem; font-size: 0.72rem; color: #6366f1; border-color: rgba(99,102,241,0.3);">Raio-X 360°</button></td>
      `;

      tr.addEventListener('click', () => openClientModal(cli));
      el.clientsTableBody.appendChild(tr);
    });
  }

  // Client 360° Modal (Raio-X Completo)
  function openClientModal(cli) {
    el.modalClientName.innerText = `${cli.nome} (${cli.id})`;
    el.modalClientSub.innerText = `${cli.canal} • Porte ${cli.porte} • ${cli.cidade}, ${cli.uf} • Vendedor: ${cli.vendedor_id} • Cadastrado em: ${cli.data_cad || 'N/A'}`;
    el.modalClientClusterTag.innerText = cli.cluster_nome;
    el.modalClientClusterTag.style.backgroundColor = cli.cluster_color + '20';
    el.modalClientClusterTag.style.color = cli.cluster_color;
    el.modalClientClusterTag.style.border = `1px solid ${cli.cluster_color}40`;

    // Diagnostic & Rationale
    el.modalClusterBox.style.borderLeftColor = cli.cluster_color;
    el.modalClusterRationaleTitle.innerText = `Diagnóstico de Cluster: ${cli.cluster_nome} (${cli.cluster_tag})`;
    
    let rationaleText = "";
    if (cli.cluster_raw === 0) {
      rationaleText = `PDV de alto volume faturado (R$ ${fmt.currency(cli.rec_liq)}) com compra regular de ${cli.skus} SKUs. Ação: Blindagem comercial e visitação quinzenal obrigatória.`;
    } else if (cli.cluster_raw === 1) {
      rationaleText = `PDV com infraestrutura relevante (${cli.checkouts} checkouts, ${cli.area_m2}m²), mas com baixa positivação de categorias na Vlimp. Ação prioritária: Introduzir combo de categorias secundárias.`;
    } else if (cli.cluster_raw === 2) {
      rationaleText = `PDV sem compras nos últimos ${cli.recencia_dias} dias (Status: ${cli.status}). Ação: Campanha de reativação com visita presencial e condição promocional de reentrada.`;
    } else if (cli.cluster_raw === 3) {
      rationaleText = `PDV com alta sensibilidade a preço (Desconto médio: ${cli.desconto_pct}%, Margem: ${cli.margem_pct}%). Ação: Estipular teto de desconto e condicionar ofertas a mix completo.`;
    } else {
      rationaleText = `PDV de pequeno porte com recompra estável e rentabilidade saudável (${cli.margem_pct}% de margem). Ação: Manter rotina de atendimento via telefone/visita periódica.`;
    }
    el.modalClusterRationaleDesc.innerText = rationaleText;

    // Metrics
    el.modalRecLiq.innerText = fmt.currency(cli.rec_liq);
    el.modalRecYoY.innerText = `${cli.cresc_yoy >= 0 ? '+' : ''}${cli.cresc_yoy}% YoY (2024 vs 2025)`;
    el.modalRecYoY.style.color = cli.cresc_yoy >= 0 ? '#10b981' : '#ef4444';

    el.modalMargemPct.innerText = fmt.pct(cli.margem_pct);
    el.modalMargemVal.innerText = fmt.currency(cli.margem);
    el.modalTicket.innerText = fmt.currency(cli.ticket_medio);
    el.modalPedidos.innerText = `${cli.pedidos} pedidos faturados`;
    el.modalRecencia.innerText = cli.recencia_dias >= 900 ? 'Inativo' : `${cli.recencia_dias} dias`;
    el.modalUltimaCompra.innerText = cli.ultima_compra ? `Última: ${cli.ultima_compra}` : 'Sem compras';

    // Mix breakdown
    const mixData = (state.raw.clientes_mix && state.raw.clientes_mix.dados[cli.id]) || {};
    const allCats = state.raw.clientes_mix ? state.raw.clientes_mix.categorias : [];
    
    let mixHtml = '';
    const maxCatVal = Math.max(...Object.values(mixData), 100);

    allCats.forEach(cat => {
      const val = mixData[cat] || 0;
      const pct = Math.min(100, (val / maxCatVal) * 100);
      const isBought = val > 0;

      mixHtml += `
        <div class="mix-category-row">
          <span class="mix-cat-name" title="${cat}">${isBought ? '✅' : '⚪'} ${cat}</span>
          <div class="mix-bar-bg">
            <div class="mix-bar-fill" style="width: ${pct}%; background: ${isBought ? '#10b981' : 'transparent'};"></div>
          </div>
          <span class="mix-cat-val" style="color: ${isBought ? '#fff' : '#6b7280'};">${isBought ? fmt.currency(val) : 'Não compra'}</span>
        </div>
      `;
    });
    el.modalMixContainer.innerHTML = mixHtml;

    // Top SKUs
    const topSKUs = (state.raw.clientes_top_skus && state.raw.clientes_top_skus[cli.id]) || [];
    if (topSKUs.length > 0) {
      let topHtml = '<ul style="list-style: none; display: flex; flex-direction: column; gap: 0.35rem;">';
      topSKUs.forEach((item, idx) => {
        const skuObj = state.raw.produtos.find(p => p.sku_id === item.sku_id);
        const name = skuObj ? skuObj.nome : item.sku_id;
        topHtml += `<li style="display: flex; justify-content: space-between;"><span>${idx + 1}. ${name}</span><strong style="color: #fff;">${fmt.currency(item.receita_liquida)}</strong></li>`;
      });
      topHtml += '</ul>';
      el.modalTopSKUs.innerHTML = topHtml;
    } else {
      el.modalTopSKUs.innerHTML = '<span style="color: #6b7280;">Nenhum item faturado registrado no período.</span>';
    }

    // Seller Info
    const sellerObj = state.raw.vendedores.find(v => v.id === cli.vendedor_id);
    if (sellerObj) {
      el.modalSellerInfo.innerHTML = `
        <div><strong>Vendedor:</strong> ${sellerObj.nome} (${sellerObj.id})</div>
        <div><strong>Região:</strong> ${sellerObj.regiao}</div>
        <div><strong>Visitas no PDV:</strong> ${cli.visitas} registradas (${cli.conv_visitas}% com pedido)</div>
        <div><strong>Atingimento Meta:</strong> <span style="color: ${sellerObj.ating_rec_pct >= 100 ? '#10b981' : '#f59e0b'};">${sellerObj.ating_rec_pct}%</span></div>
      `;
    } else {
      el.modalSellerInfo.innerHTML = `<div>Vendedor ID: ${cli.vendedor_id}</div><div>Total de visitas: ${cli.visitas}</div>`;
    }

    // Sparkline Chart
    const sparkData = (state.raw.clientes_sparklines && state.raw.clientes_sparklines.dados[cli.id]) || [0,0,0,0,0,0];
    const sparkMonths = (state.raw.clientes_sparklines && state.raw.clientes_sparklines.meses) || ['M1','M2','M3','M4','M5','M6'];

    const ctxModal = document.getElementById('modalChartHistorico').getContext('2d');
    if (state.charts.modalSpark) state.charts.modalSpark.destroy();

    state.charts.modalSpark = new Chart(ctxModal, {
      type: 'line',
      data: {
        labels: sparkMonths,
        datasets: [{
          data: sparkData,
          borderColor: cli.cluster_color,
          backgroundColor: cli.cluster_color + '20',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: cli.cluster_color
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => `Faturamento: ${fmt.currencyFull(item.raw)}`
            }
          }
        },
        scales: {
          x: { ticks: { color: '#6b7280', font: { size: 9 } }, grid: { display: false } },
          y: {
            ticks: { color: '#6b7280', font: { size: 9 }, callback: (v) => fmt.currency(v) },
            grid: { color: 'rgba(255,255,255,0.04)' }
          }
        }
      }
    });

    el.modalOverlay.classList.add('active');
  }

  function closeModal() {
    el.modalOverlay.classList.remove('active');
  }

  // Sellers View (Micro 360)
  function renderSellersView() {
    const sellers = state.raw.vendedores || [];
    
    // Scatter Plot: Atingimento Receita x Margem Realizada
    const ctxVendScatter = document.getElementById('chartVendedoresScatter').getContext('2d');
    const scatterData = sellers.map(v => ({
      x: v.ating_rec_pct,
      y: v.margem_pct,
      seller: v
    }));

    state.charts.vendScatter = new Chart(ctxVendScatter, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Vendedores (60)',
          data: scatterData,
          backgroundColor: sellers.map(v => v.ating_rec_pct >= 100 && v.margem_pct >= v.meta_margem_pct ? '#10b981' : v.ating_rec_pct >= 100 ? '#f59e0b' : '#ef4444'),
          pointRadius: 6,
          pointHoverRadius: 9
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => {
                const s = item.raw.seller;
                return `${s.nome} (${s.regiao}): Ating. Meta Rec: ${s.ating_rec_pct}% | Margem: ${s.margem_pct}%`;
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Atingimento de Meta de Receita (%)', color: '#9ca3af' },
            ticks: { color: '#6b7280', callback: (v) => v + '%' },
            grid: { color: 'rgba(255,255,255,0.04)' }
          },
          y: {
            title: { display: true, text: 'Margem de Contribuição Realizada (%)', color: '#9ca3af' },
            ticks: { color: '#6b7280', callback: (v) => v + '%' },
            grid: { color: 'rgba(255,255,255,0.04)' }
          }
        }
      }
    });

    // Perfis Donut Chart
    const ctxVendPerfis = document.getElementById('chartVendedoresPerfis').getContext('2d');
    const perfisCount = {};
    sellers.forEach(v => {
      perfisCount[v.perfil] = (perfisCount[v.perfil] || 0) + 1;
    });

    state.charts.vendPerfis = new Chart(ctxVendPerfis, {
      type: 'doughnut',
      data: {
        labels: Object.keys(perfisCount),
        datasets: [{
          data: Object.values(perfisCount),
          backgroundColor: ['#10b981', '#f59e0b', '#3b82f6', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 10 } } }
        }
      }
    });

    // Table
    el.sellersTableBody.innerHTML = '';
    sellers.forEach(v => {
      const tr = document.createElement('tr');
      const perfilColor = v.perfil.includes('Estrela') ? '#10b981' : v.perfil.includes('Volume') ? '#f59e0b' : v.perfil.includes('Rentável') ? '#3b82f6' : '#ef4444';

      tr.innerHTML = `
        <td style="font-weight: 600; color: #6366f1;">${v.id}</td>
        <td style="font-weight: 600;">${v.nome}</td>
        <td>${v.regiao}</td>
        <td><span class="badge" style="color: ${perfilColor}; background: ${perfilColor}15; border: 1px solid ${perfilColor}35;">${v.perfil}</span></td>
        <td style="font-weight: 600;">${fmt.currency(v.rec_total)}</td>
        <td style="color: ${v.ating_rec_pct >= 100 ? '#10b981' : '#f59e0b'}; font-weight: 600;">${v.ating_rec_pct}%</td>
        <td style="color: ${v.margem_pct >= v.meta_margem_pct ? '#10b981' : '#ef4444'}; font-weight: 600;">${v.margem_pct}%</td>
        <td>${v.meta_margem_pct}%</td>
        <td>${fmt.number(v.visitas_total)}</td>
        <td style="font-weight: 600;">${v.conv_visitas}%</td>
        <td>${v.desconto_pct}%</td>
      `;
      el.sellersTableBody.appendChild(tr);
    });
  }

  // Products & SKUs View
  function renderProductsView() {
    const products = state.raw.produtos || [];
    const search = el.searchProductInput ? el.searchProductInput.value.toLowerCase().trim() : '';

    const filteredProds = search ? products.filter(p => p.nome.toLowerCase().includes(search) || p.sku_id.toLowerCase().includes(search) || p.categoria.toLowerCase().includes(search)) : products;

    // 1. Curva ABC Chart
    const ctxABC = document.getElementById('chartCurvaABC').getContext('2d');
    const abcCount = { 'A (Top 70%)': 0, 'B (Próximos 20%)': 0, 'C (Cauda Longa 10%)': 0 };
    products.forEach(p => {
      if (abcCount[p.curva_abc] !== undefined) abcCount[p.curva_abc]++;
    });

    if (!state.charts.abc) {
      state.charts.abc = new Chart(ctxABC, {
        type: 'doughnut',
        data: {
          labels: Object.keys(abcCount),
          datasets: [{
            data: Object.values(abcCount),
            backgroundColor: ['#10b981', '#3b82f6', '#f59e0b'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 10 } } }
          }
        }
      });
    }

    // 2. Receita por Categoria
    const ctxCat = document.getElementById('chartCategoriasShare').getContext('2d');
    const catRevenue = {};
    products.forEach(p => {
      catRevenue[p.categoria] = (catRevenue[p.categoria] || 0) + p.rec_total;
    });

    const sortedCats = Object.entries(catRevenue).sort((a, b) => b[1] - a[1]);

    if (!state.charts.catShare) {
      state.charts.catShare = new Chart(ctxCat, {
        type: 'bar',
        data: {
          labels: sortedCats.map(c => c[0]),
          datasets: [{
            label: 'Receita Total (R$)',
            data: sortedCats.map(c => c[1]),
            backgroundColor: '#6366f1',
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (item) => fmt.currencyFull(item.raw) } }
          },
          scales: {
            x: { ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { display: false } },
            y: { ticks: { color: '#6b7280', callback: (v) => fmt.currency(v) }, grid: { color: 'rgba(255,255,255,0.04)' } }
          }
        }
      });
    }

    // Table
    el.productsTableBody.innerHTML = '';
    filteredProds.slice(0, 50).forEach(p => {
      const tr = document.createElement('tr');
      const abcColor = p.curva_abc.startsWith('A') ? '#10b981' : p.curva_abc.startsWith('B') ? '#3b82f6' : '#f59e0b';

      tr.innerHTML = `
        <td style="font-weight: 600; color: #6366f1;">${p.sku_id}</td>
        <td style="font-weight: 600;">${p.nome}</td>
        <td>${p.categoria}</td>
        <td>${p.marca}</td>
        <td><span class="badge" style="color: ${abcColor}; background: ${abcColor}15; border: 1px solid ${abcColor}35;">${p.curva_abc.substring(0,1)}</span></td>
        <td>R$ ${p.preco_lista.toFixed(2)}</td>
        <td style="font-weight: 600;">${fmt.currency(p.rec_total)}</td>
        <td>${fmt.number(p.qtd_total)}</td>
        <td style="color: #10b981; font-weight: 600;">${p.margem_pct}%</td>
        <td>${p.desconto_pct}%</td>
        <td><span class="badge ${p.status === 'Ativo' ? 'badge-emerald' : 'badge-amber'}">${p.status}</span></td>
      `;
      el.productsTableBody.appendChild(tr);
    });
  }

  // Interactive What-If Simulator
  function initSimulator() {
    const sliders = [el.simSliderDesconto, el.simSliderChurn, el.simSliderCrossSell, el.simSliderRotas];
    sliders.forEach(sl => {
      sl.addEventListener('input', updateSimulator);
    });
    updateSimulator();
  }

  function updateSimulator() {
    const redDesconto = parseFloat(el.simSliderDesconto.value); // ex: 0.5%
    const recovChurn = parseFloat(el.simSliderChurn.value); // ex: 15%
    const crossSellGrowth = parseFloat(el.simSliderCrossSell.value); // ex: 12%
    const rotasConv = parseFloat(el.simSliderRotas.value); // ex: 5%

    el.simValDesconto.innerText = `-${redDesconto.toFixed(1)}% p.p.`;
    el.simValChurn.innerText = `${recovChurn.toFixed(0)}% reativados`;
    el.simValCrossSell.innerText = `+${crossSellGrowth.toFixed(0)}% faturamento`;
    el.simValRotas.innerText = `+${rotasConv.toFixed(0)}% conversão`;

    // Calculation
    const baseReceita = state.raw.kpis.receita_liquida_total; // ~48.16M
    const baseMargem = state.raw.kpis.margem_total; // ~12.02M
    const baseBruta = state.raw.kpis.receita_bruta_total;

    // 1. Ganho com redução de desconto (100% vira margem líquida direta)
    const ganhoDesconto = baseBruta * (redDesconto / 100);

    // 2. Churn recuperado (338 clientes reativados gastando média de pequeno varejo R$ 4.800 em 2 anos)
    const churnClients = 338;
    const recovCount = churnClients * (recovChurn / 100);
    const recChurnInc = recovCount * 4800;
    const margemChurnInc = recChurnInc * 0.25;

    // 3. Cross-sell no Cluster Alto Potencial (Cluster 1 / C2_HIGH_POTENTIAL: 22.4M faturamento)
    const recHighPot = 22404048;
    const recCrossInc = recHighPot * (crossSellGrowth / 100);
    const margemCrossInc = recCrossInc * 0.255;

    // 4. Eficiência de rotas (+conversão de visitas)
    const recRotasInc = (rotasConv / 100) * (baseReceita * 0.04);
    const margemRotasInc = recRotasInc * 0.25;

    const totalReceitaInc = recChurnInc + recCrossInc + recRotasInc;
    const totalMargemInc = ganhoDesconto + margemChurnInc + margemCrossInc + margemRotasInc;

    const novaReceita = baseReceita + totalReceitaInc;
    const novaMargem = baseMargem + totalMargemInc;
    const novaMargemPct = (novaMargem / novaReceita) * 100;
    const deltaMargemPP = novaMargemPct - state.raw.kpis.margem_pct_media;

    el.simResReceita.innerText = `+${fmt.currency(totalReceitaInc)}`;
    el.simResReceitaPct.innerText = `+${((totalReceitaInc / baseReceita) * 100).toFixed(2)}% de crescimento`;
    el.simResMargem.innerText = `+${fmt.currency(totalMargemInc)}`;
    el.simResMargemPct.innerText = `Nova Margem: ${novaMargemPct.toFixed(2)}% (+${deltaMargemPP.toFixed(2)} p.p.)`;
  }

  // Export Summary CSV
  function exportSummaryCSV() {
    let csv = 'ID,Nome,Canal,Porte,Cidade,UF,Regiao,Vendedor,Cluster,Receita_Liquida,Margem_Pct,Pedidos,Recencia_Dias,SKUs_Mix\n';
    state.filteredClients.forEach(c => {
      csv += `"${c.id}","${c.nome}","${c.canal}","${c.porte}","${c.cidade}","${c.uf}","${c.regiao}","${c.vendedor_id}","${c.cluster_nome}",${c.rec_liq},${c.margem_pct},${c.pedidos},${c.recencia_dias},${c.skus}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `vlimp_clusters_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Bootstrap when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
