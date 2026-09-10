import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cake, Order, AppStats } from '../types';
import {
  Package,
  Plus,
  Minus,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Edit2,
  Sliders,
  DollarSign,
  History,
  Trash2,
  LogOut,
  ImagePlus,
  BarChart3,
  Search
} from 'lucide-react';

interface AdminDashboardProps {
  cakes: Cake[];
  onRefreshCakes: () => void;
  onLogout: () => void;
  onNotify: (message: string, type?: 'success' | 'error') => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  cakes,
  onRefreshCakes,
  onLogout,
  onNotify
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'estoque' | 'pedidos' | 'historico'>(() => {
    const savedTab = sessionStorage.getItem('delicias-admin-tab');
    return savedTab === 'dashboard' || savedTab === 'pedidos' || savedTab === 'historico' ? savedTab : 'estoque';
  });
  const [orders, setOrders] = useState<Order[]>([]);
  const [todayOrders, setTodayOrders] = useState<Order[]>([]);
  const [todaySearchTerm, setTodaySearchTerm] = useState('');
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const monthOptions = [
    ['1', 'Janeiro'], ['2', 'Fevereiro'], ['3', 'Março'], ['4', 'Abril'],
    ['5', 'Maio'], ['6', 'Junho'], ['7', 'Julho'], ['8', 'Agosto'],
    ['9', 'Setembro'], ['10', 'Outubro'], ['11', 'Novembro'], ['12', 'Dezembro']
  ] as const;
  const currentMonth = String(new Date().getMonth() + 1);
  const [historyPeriod, setHistoryPeriod] = useState<`month-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}`>(`month-${currentMonth as '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12'}`);
  const [stats, setStats] = useState<AppStats | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [updatingStockId, setUpdatingStockId] = useState<number | null>(null);

  // Modal para Adicionar / Editar Bolo
  const [isCakeModalOpen, setIsCakeModalOpen] = useState(false);
  const [editingCake, setEditingCake] = useState<Cake | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIngredients, setFormIngredients] = useState('');
  const [formCategory, setFormCategory] = useState<'comum' | 'com_cobertura'>('comum');
  const [formPrice, setFormPrice] = useState('');
  const [formStock, setFormStock] = useState('');
  const [formImageDataUrl, setFormImageDataUrl] = useState('');
  const [formError, setFormError] = useState('');
  const [isSavingCake, setIsSavingCake] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ message: string; action: () => Promise<void> } | null>(null);
  const [dashboardData, setDashboardData] = useState<{
    year: number;
    months: { month: number; total: number; orders: number }[];
    topCakes: { cake_name: string; quantity: number; total: number }[];
  } | null>(null);

  useEffect(() => {
    sessionStorage.setItem('delicias-admin-tab', activeTab);
  }, [activeTab]);

  // Buscar pedidos e stats do backend
  const fetchOrdersAndStats = async (period: 'today' | `month-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}` | 'all' = 'today') => {
    setLoadingOrders(true);
    try {
      const [ordersRes, statsRes, dashboardRes] = await Promise.all([
        fetch(`/api/orders?period=${period}`),
        fetch('/api/stats'),
        fetch(`/api/dashboard?year=${new Date().getFullYear()}`)
      ]);

      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setOrders(ordersData.orders || []);
        if (period === 'today') {
          setTodayOrders(ordersData.orders || []);
        }
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats || null);
      }
      if (dashboardRes.ok) {
        const dashboardResult = await dashboardRes.json();
        setDashboardData(dashboardResult.dashboard || null);
      }
    } catch (e) {
      console.error('Erro ao buscar dados do admin:', e);
    } finally {
      setLoadingOrders(false);
    }
  };

  const fetchTodayOrders = async () => {
    const response = await fetch('/api/orders?period=today');
    if (!response.ok) throw new Error('Não foi possível atualizar os registros do dia.');
    const data = await response.json();
    setTodayOrders(data.orders || []);
  };

  const handleDeleteOrder = async (order: Order) => {
    setConfirmAction({
      message: `Excluir o registro do pedido #${order.order_code}? Essa ação não pode ser desfeita.`,
      action: async () => {
        try {
          const response = await fetch(`/api/orders/${order.id}`, { method: 'DELETE' });
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || 'Não foi possível excluir o pedido.');
          }
          await fetchOrdersAndStats(activeTab === 'historico' ? historyPeriod : 'today');
          if (activeTab === 'historico') await fetchTodayOrders();
          onNotify('Registro da venda excluído.', 'success');
        } catch (error) {
          console.error('Erro ao excluir pedido:', error);
          onNotify(error instanceof Error ? error.message : 'Não foi possível excluir o pedido.', 'error');
        }
      }
    });
  };

  useEffect(() => {
    fetchOrdersAndStats();
  }, []);

  useEffect(() => {
    const refreshInterval = window.setInterval(() => {
      void fetchOrdersAndStats(activeTab === 'historico' ? historyPeriod : 'today');
    }, 60_000);

    return () => window.clearInterval(refreshInterval);
  }, [activeTab, historyPeriod]);

  // Alterar estoque rapidamente
  const handleQuickStockChange = async (cake: Cake, delta: number) => {
    const newStock = Math.max(0, cake.stock_quantity + delta);
    setUpdatingStockId(cake.id);

    try {
      const res = await fetch(`/api/cakes/${cake.id}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_stock: newStock,
          reason: 'ajuste_rapido_admin',
          notes: `Ajuste manual de ${delta > 0 ? '+' : ''}${delta} un`
        })
      });

      if (res.ok) {
        onRefreshCakes();
        fetchOrdersAndStats();
        onNotify(
          delta > 0
            ? `Estoque de "${cake.name}" aumentado para ${newStock} unidades.`
            : `Estoque de "${cake.name}" reduzido para ${newStock} unidades.`
        );
      }
    } catch (e) {
      console.error('Erro ao atualizar estoque:', e);
      onNotify('Não foi possível atualizar o estoque.', 'error');
    } finally {
      setUpdatingStockId(null);
    }
  };

  const handleDeleteCake = async (cake: Cake) => {
    setConfirmAction({
      message: `Excluir "${cake.name}" do catálogo? O bolo ficará indisponível para novos pedidos.`,
      action: async () => {
        try {
          const response = await fetch(`/api/cakes/${cake.id}`, { method: 'DELETE' });
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || 'Não foi possível excluir o bolo.');
          }
          onRefreshCakes();
          onNotify(`"${cake.name}" foi removido do catálogo.`);
        } catch (error) {
          console.error('Erro ao excluir bolo:', error);
          onNotify(error instanceof Error ? error.message : 'Não foi possível excluir o bolo.', 'error');
        }
      }
    });
  };

  const normalizedTodaySearchTerm = todaySearchTerm.trim().toLocaleLowerCase('pt-BR');
  const filteredTodayOrders = normalizedTodaySearchTerm
    ? orders.filter(order => [
        order.order_code,
        order.customer_name,
        order.customer_phone,
        order.delivery_block,
        order.delivery_apartment,
        order.payment_method,
        ...order.items.map(item => item.cake_name)
      ].some(value => value.toLocaleLowerCase('pt-BR').includes(normalizedTodaySearchTerm)))
    : orders;
  const normalizedHistorySearchTerm = historySearchTerm.trim().toLocaleLowerCase('pt-BR');
  const filteredHistoryOrders = normalizedHistorySearchTerm
    ? orders.filter(order => [
        order.order_code,
        order.customer_name,
        order.customer_phone,
        order.delivery_block,
        order.delivery_apartment,
        order.payment_method,
        ...order.items.map(item => item.cake_name)
      ].some(value => value.toLocaleLowerCase('pt-BR').includes(normalizedHistorySearchTerm)))
    : orders;

  // Salvar Bolo (Criar ou Editar)
  const handleSaveCake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPrice) return;

    if (!editingCake && !formImageDataUrl) {
      setFormError('Selecione uma imagem para cadastrar o bolo.');
      return;
    }

    const payload = {
      name: formName.trim(),
      description: formDescription.trim(),
      ingredients: formIngredients.split(',').map(item => item.trim()).filter(Boolean),
      category: formCategory,
      price: parseFloat(formPrice),
      stock_quantity: parseInt(formStock || '0', 10),
      ...(formImageDataUrl ? { image_data_url: formImageDataUrl } : {})
    };

    setIsSavingCake(true);
    setFormError('');
    try {
      let response: Response;
      if (editingCake) {
        response = await fetch(`/api/cakes/${editingCake.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        response = await fetch('/api/cakes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Não foi possível salvar o bolo.');
      }

      setIsCakeModalOpen(false);
      setEditingCake(null);
      onRefreshCakes();
      fetchOrdersAndStats();
      onNotify(editingCake ? 'Bolo atualizado com sucesso.' : 'Bolo cadastrado com sucesso.');
    } catch (err) {
      console.error('Erro ao salvar bolo:', err);
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar o bolo.');
      onNotify(err instanceof Error ? err.message : 'Não foi possível salvar o bolo.', 'error');
    } finally {
      setIsSavingCake(false);
    }
  };

  const handleImageChange = (file?: File) => {
    setFormError('');
    if (!file) {
      setFormImageDataUrl('');
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setFormError('Escolha uma imagem PNG, JPG ou WebP.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setFormError('A imagem deve ter no máximo 3 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setFormImageDataUrl(String(reader.result || ''));
    reader.onerror = () => setFormError('Não foi possível ler a imagem selecionada.');
    reader.readAsDataURL(file);
  };

  const openNewCakeModal = () => {
    setEditingCake(null);
    setFormName('');
    setFormDescription('');
    setFormIngredients('');
    setFormCategory('comum');
    setFormPrice('');
    setFormStock('5');
    setFormImageDataUrl('');
    setFormError('');
    setIsCakeModalOpen(true);
  };

  const openEditCakeModal = (cake: Cake) => {
    setEditingCake(cake);
    setFormName(cake.name);
    setFormDescription(cake.description);
    setFormIngredients(cake.ingredients.join(', '));
    setFormCategory(cake.category);
    setFormPrice(cake.price.toString());
    setFormStock(cake.stock_quantity.toString());
    setFormImageDataUrl('');
    setFormError('');
    setIsCakeModalOpen(true);
  };

  return (
    <div className="admin-dashboard py-4 px-3 sm:py-8 sm:px-6 lg:px-8 max-w-7xl mx-auto font-sans">
      {/* Cabeçalho do Painel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-5 sm:mb-8">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl sm:text-3xl font-serif font-bold text-slate-900">
              Controle de Estoque &amp; Pedidos
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-500/20 text-pink-700 border border-pink-400/30">
              Admin
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Gestão de estoque em tempo real para os bolos do <span className="text-pink-700 font-medium">Delícias da Jú</span>.
          </p>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            type="button"
            id="btn-add-new-cake"
            onClick={openNewCakeModal}
            className="min-h-11 sm:min-h-0 flex-1 sm:flex-none py-2.5 px-4 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-sm sm:text-xs font-semibold transition-all flex items-center justify-center space-x-2 shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Bolo</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="min-h-11 sm:min-h-0 p-2.5 rounded-xl bg-white hover:bg-violet-50 text-slate-700 transition-colors border border-violet-200 flex items-center space-x-2 text-sm sm:text-xs font-medium cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair</span>
          </button>
        </div>
      </div>

      {/* Cards de métricas de estoque */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-5 sm:mb-8">
        {/* Total de Unidades em Estoque */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-violet-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-600 font-medium">Estoque Total</span>
            <div className="group relative p-2 rounded-xl bg-pink-500/15 text-pink-600">
              <Package className="w-4 h-4" aria-label="Estoque total" />
              <span role="tooltip" className="pointer-events-none absolute right-0 top-full z-10 mt-2 w-44 rounded-lg bg-slate-900 px-2.5 py-2 text-center text-[10px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                Quantidade total em estoque
              </span>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-serif font-bold text-slate-900">
            {stats ? stats.totalUnitsInStock : cakes.reduce((s, c) => s + c.stock_quantity, 0)} <span className="text-sm font-sans font-normal text-slate-600">un</span>
          </div>
          <p className="text-[11px] text-slate-600 mt-1">
            Distribuição em {cakes.length} sabores
          </p>
        </div>

        {/* Itens com Baixo Estoque */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-violet-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-600 font-medium">Estoque Crítico (≤2)</span>
            <div className="group relative p-2 rounded-xl bg-pink-600/15 text-pink-600">
              <AlertTriangle className="w-4 h-4" aria-label="Estoque crítico" />
              <span role="tooltip" className="pointer-events-none absolute right-0 top-full z-10 mt-2 w-48 rounded-lg bg-slate-900 px-2.5 py-2 text-center text-[10px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                Sabores com estoque crítico
              </span>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-serif font-bold text-pink-700">
            {cakes.filter(c => c.stock_quantity <= 2).length} <span className="text-sm font-sans font-normal text-slate-600">sabores</span>
          </div>
          <p className="text-[11px] text-slate-600 mt-1">
            Requer nova fornada urgente
          </p>
        </div>

        {/* Faturamento Estimado */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-violet-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-600 font-medium">Faturamento diário</span>
            <div className="group relative p-2 rounded-xl bg-emerald-500/15 text-emerald-400">
              <DollarSign className="w-4 h-4" aria-label="Faturamento diário" />
              <span role="tooltip" className="pointer-events-none absolute right-0 top-full z-10 mt-2 w-44 rounded-lg bg-slate-900 px-2.5 py-2 text-center text-[10px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                Faturamento das vendas de hoje
              </span>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-serif font-bold text-emerald-400">
            R$ {todayOrders.reduce((total, order) => total + order.total_amount, 0).toFixed(2).replace('.', ',')}
          </div>
          <p className="text-[11px] text-slate-600 mt-1">
            Total de {todayOrders.length} pedidos hoje
          </p>
        </div>
      </div>

      {/* Abas do Painel */}
      <div className="mobile-admin-tabs flex items-center space-x-2 overflow-x-auto border-b border-violet-100 pb-3 mb-4 sm:mb-6" role="tablist" aria-label="Seções do painel administrativo">
        <button
          type="button"
          onClick={() => {
            setActiveTab('dashboard');
            void fetchOrdersAndStats();
          }}
          role="tab"
          aria-selected={activeTab === 'dashboard'}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center space-x-2 ${
            activeTab === 'dashboard'
              ? 'bg-pink-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-violet-50'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Dashboard</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('estoque')}
          role="tab"
          aria-selected={activeTab === 'estoque'}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center space-x-2 ${
            activeTab === 'estoque'
              ? 'bg-pink-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-violet-50'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Controle de Estoque ({cakes.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pedidos')}
          role="tab"
          aria-selected={activeTab === 'pedidos'}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center space-x-2 ${
            activeTab === 'pedidos'
              ? 'bg-pink-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-violet-50'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Registros do dia ({todayOrders.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('historico');
            fetchOrdersAndStats(historyPeriod);
          }}
          role="tab"
          aria-selected={activeTab === 'historico'}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center space-x-2 ${
            activeTab === 'historico'
              ? 'bg-pink-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-violet-50'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Pedidos anteriores ({stats?.totalOrdersCount ?? 0})</span>
        </button>
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-serif font-bold text-slate-900">Vendas de {dashboardData?.year || new Date().getFullYear()}</h2>
            <p className="text-xs text-slate-600">Acompanhe o faturamento mensal e os sabores mais vendidos.</p>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-violet-100 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-slate-900">Vendas por mês</h3>
                <p className="text-xs text-slate-500">Total faturado em cada mês</p>
              </div>
              <TrendingUp className="w-5 h-5 text-pink-600" />
            </div>
            <div className="grid grid-cols-6 md:grid-cols-12 gap-2 items-end h-56">
              {(dashboardData?.months || []).map(month => {
                const maxTotal = Math.max(...(dashboardData?.months || []).map(item => item.total), 1);
                const height = month.total > 0 ? Math.max((month.total / maxTotal) * 100, 5) : 2;
                return (
                  <div key={month.month} className="h-full flex flex-col items-center justify-end gap-2">
                    <span className="text-[10px] font-semibold text-slate-600">
                      {month.total > 0 ? `R$ ${month.total.toFixed(0)}` : '-'}
                    </span>
                    <div className="w-full h-36 flex items-end">
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-pink-600 to-violet-400 transition-all"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-slate-500">
                      {monthOptions[month.month - 1][1].slice(0, 3)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-violet-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-violet-100">
              <h3 className="text-base font-bold text-slate-900">Bolos mais vendidos no ano</h3>
              <p className="text-xs text-slate-500">Ranking por quantidade vendida</p>
            </div>
            {dashboardData?.topCakes.length ? (
              <div className="divide-y divide-violet-100">
                {dashboardData.topCakes.map((cake, index) => (
                  <div key={cake.cake_name} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full bg-pink-100 text-pink-700 flex items-center justify-center text-xs font-bold">{index + 1}</span>
                      <span className="text-sm font-semibold text-slate-800">{cake.cake_name}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-violet-700">{cake.quantity} unidades</p>
                      <p className="text-[11px] text-slate-500">R$ {cake.total.toFixed(2).replace('.', ',')}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-8 text-center text-sm text-slate-500">Ainda não há vendas registradas neste ano.</p>
            )}
          </div>
        </div>
      )}

      {/* ABA 1: CONTROLE DE ESTOQUE */}
      {activeTab === 'estoque' && (
        <div className="bg-white rounded-2xl border border-violet-100 overflow-hidden shadow-sm">
          <div className="mobile-stock-table overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm text-slate-700">
              <thead className="bg-rose-50/70 border-b border-violet-100 text-[11px] uppercase tracking-wider text-slate-600 font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Bolo / Sabor</th>
                  <th className="py-3.5 px-4">Categoria</th>
                  <th className="py-3.5 px-4">Preço</th>
                  <th className="py-3.5 px-4 text-center">Estoque disponível</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800">
                {(['comum', 'com_cobertura'] as const).map(category => (
                  <React.Fragment key={category}>
                    <tr className="bg-violet-50/70">
                      <th colSpan={5} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-violet-800">
                        {(() => {
                          const categoryCakes = cakes.filter(cake => cake.category === category);
                          const categoryStock = categoryCakes.reduce((total, cake) => total + cake.stock_quantity, 0);
                          const categoryLabel = category === 'com_cobertura' ? 'Com cobertura' : 'Comum';
                          return (
                            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="font-extrabold text-violet-900">{categoryLabel}</span>
                              <span className="font-extrabold text-pink-700">
                                <span className="text-[10px] uppercase tracking-wider text-pink-500">sabores:</span>{' '}
                                {categoryCakes.length}
                              </span>
                              <span className="font-extrabold text-emerald-700">
                                <span className="text-[10px] uppercase tracking-wider text-emerald-500">total de itens:</span>{' '}
                                {categoryStock}
                              </span>
                            </span>
                          );
                        })()}
                      </th>
                    </tr>
                    {cakes.filter(cake => cake.category === category).map(cake => {
                  const isUpdating = updatingStockId === cake.id;
                  const isOut = cake.stock_quantity <= 0;
                  const isLow = cake.stock_quantity > 0 && cake.stock_quantity <= 2;

                  return (
                    <tr key={cake.id} className="hover:bg-violet-50/40 transition-colors">
                      {/* Nome e Miniatura */}
                      <td className="py-3 px-4" data-label="Bolo">
                        <div className="flex items-center space-x-3">
                          <img
                            src={cake.image_url || '/assets/cake-card.svg'}
                            alt={cake.name}
                            className="w-12 h-12 rounded-xl object-cover border border-violet-200 flex-shrink-0"
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            decoding="async"
                          />
                          <div>
                            <div className="font-semibold text-slate-900">{cake.name}</div>
                            <div className="text-[11px] text-slate-600 max-w-xs truncate">
                              {cake.description}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Categoria */}
                      <td className="py-3 px-4" data-label="Categoria">
                        <span className="capitalize px-2 py-0.5 rounded-full text-[11px] bg-violet-50 border border-violet-200 text-slate-700">
                          {cake.category === 'com_cobertura' ? 'Com cobertura' : 'Comum'}
                        </span>
                      </td>

                      {/* Preço */}
                      <td className="py-3 px-4 font-serif font-bold text-pink-700" data-label="Preço">
                        R$ {cake.price.toFixed(2).replace('.', ',')}
                      </td>

                      {/* Controle de Estoque com Botões Rápidos */}
                      <td className="py-3 px-4" data-label="Estoque">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            type="button"
                            disabled={isUpdating || cake.stock_quantity <= 0}
                            onClick={() => handleQuickStockChange(cake, -1)}
                            aria-label={`Diminuir estoque de ${cake.name}`}
                            className="p-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 text-slate-700 disabled:opacity-30 transition-colors border border-violet-200"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>

                          <span className={`w-12 text-center text-sm font-bold ${
                            isOut ? 'text-red-400' : isLow ? 'text-pink-600' : 'text-emerald-400'
                          }`}>
                            {cake.stock_quantity}
                          </span>

                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => handleQuickStockChange(cake, 1)}
                            aria-label={`Aumentar estoque de ${cake.name}`}
                            className="p-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 text-slate-700 disabled:opacity-30 transition-colors border border-violet-200"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="py-3 px-4 text-right" data-label="Ações">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditCakeModal(cake)}
                            aria-label={`Editar ${cake.name}`}
                            className="p-2 rounded-lg bg-violet-50 hover:bg-violet-100 text-slate-700 transition-colors border border-violet-200"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteCake(cake)}
                            className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors border border-red-200"
                            aria-label={`Excluir ${cake.name} do catálogo`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'historico' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-serif font-bold text-slate-900">Pedidos anteriores</h2>
              <p className="text-xs text-slate-600">
                Total geral: <span className="font-bold text-pink-700">{stats?.totalOrdersCount ?? 0} pedidos</span>.
                Consulte reservas já registradas sem alterar os registros de hoje.
              </p>
            </div>
            <select
              value={historyPeriod}
              onChange={event => {
                const period = event.target.value as `month-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}`;
                setHistoryPeriod(period);
                fetchOrdersAndStats(period);
              }}
              className="w-full sm:w-auto text-xs font-semibold px-3 py-2 rounded-xl border border-violet-200 bg-white text-slate-700"
            >
              {monthOptions.map(([value, label]) => (
                <option key={value} value={`month-${value}`}>{label}</option>
              ))}
            </select>
          </div>
          <div className="p-5 rounded-2xl bg-white border border-violet-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Saldo total do mês</p>
                <p className="mt-1 text-2xl font-serif font-bold text-emerald-600">
                  R$ {orders.reduce((total, order) => total + order.total_amount, 0).toFixed(2).replace('.', ',')}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-emerald-500" aria-label="Saldo total das vendas do mês" />
            </div>
          </div>
          {orders.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-violet-100 text-slate-600">
              <History className="w-10 h-10 mx-auto mb-3 text-violet-300" />
              <p className="text-sm font-semibold">Nenhum pedido encontrado nesse período.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-2 rounded-2xl bg-white border border-violet-100 p-3 shadow-sm">
                <div className="flex items-center gap-2 flex-1 rounded-xl bg-violet-50 border border-violet-200 px-3">
                  <Search className="w-4 h-4 text-violet-500 flex-shrink-0" />
                  <input
                    type="search"
                    value={historySearchTerm}
                    onChange={event => setHistorySearchTerm(event.target.value)}
                    placeholder="Buscar por nome, bloco, apt, telefone, pedido ou sabor..."
                    aria-label="Buscar pedidos anteriores"
                    className="w-full bg-transparent py-2 text-xs text-slate-900 outline-none"
                  />
                </div>
              </div>

              {filteredHistoryOrders.length === 0 ? (
                <div className="p-10 text-center bg-white rounded-2xl border border-violet-100 text-slate-600">
                  <Search className="w-8 h-8 mx-auto mb-2 text-violet-300" />
                  <p className="text-sm font-semibold">Nenhum pedido corresponde à busca.</p>
                </div>
              ) : (
                <div className="mobile-order-list overflow-x-auto rounded-2xl bg-white border border-violet-100 shadow-sm">
                  <div className="min-w-[900px]">
                    <div className="mobile-order-header grid grid-cols-[1.15fr_1.35fr_1.1fr_1fr_1.3fr_1fr_auto] gap-3 border-b border-violet-100 bg-rose-50/70 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      <span>Pedido / data</span>
                      <span>Cliente</span>
                      <span>Entrega</span>
                      <span>Pagamento</span>
                      <span>Itens</span>
                      <span>Total</span>
                      <span>Ação</span>
                    </div>
                    {filteredHistoryOrders.map(order => (
                      <div key={order.id} className="mobile-order-row grid grid-cols-[1.15fr_1.35fr_1.1fr_1fr_1.3fr_1fr_auto] gap-3 items-center border-b border-violet-100 px-4 py-3 text-xs last:border-b-0 hover:bg-violet-50/40">
                        <div>
                          <p className="font-mono font-bold text-pink-700">#{order.order_code}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{new Date(order.created_at).toLocaleString('pt-BR')}</p>
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{order.customer_name}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{order.customer_phone}</p>
                        </div>
                        <div className="font-semibold text-violet-700">
                          <p>Bloco {order.delivery_block}</p>
                          <p className="mt-1 text-[11px] text-slate-500">APT {order.delivery_apartment}</p>
                        </div>
                        <span className="font-semibold text-emerald-700">{order.payment_method === 'pix' ? 'PIX' : 'CRÉDITO'}</span>
                        <div className="text-[11px] text-slate-700">
                          {order.items.map(item => `${item.quantity}x ${item.cake_name}`).join(', ')}
                        </div>
                        <span className="font-bold text-emerald-600">R$ {order.total_amount.toFixed(2).replace('.', ',')}</span>
                        <button
                          type="button"
                          onClick={() => void handleDeleteOrder(order)}
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50 border border-red-200"
                          aria-label={`Excluir pedido ${order.order_code}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ABA 2: GESTÃO DE PEDIDOS & SOLICITAÇÕES TELEGRAM */}
      {activeTab === 'pedidos' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-violet-100 text-slate-600">
              <Clock className="w-10 h-10 mx-auto mb-3 text-violet-300" />
              <p className="text-sm font-semibold">Nenhum pedido registrado ainda.</p>
              <p className="text-xs text-slate-500 mt-1">
                Quando os clientes finalizarem pelo catálogo, as reservas aparecerão aqui para atendimento.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-2 rounded-2xl bg-white border border-violet-100 p-3 shadow-sm">
                <div className="flex items-center gap-2 flex-1 rounded-xl bg-violet-50 border border-violet-200 px-3">
                  <Search className="w-4 h-4 text-violet-500 flex-shrink-0" />
                  <input
                    type="search"
                    value={todaySearchTerm}
                    onChange={event => setTodaySearchTerm(event.target.value)}
                    placeholder="Buscar por nome, bloco, apt, telefone, pedido ou sabor..."
                    aria-label="Buscar registros do dia"
                    className="w-full bg-transparent py-2 text-xs text-slate-900 outline-none"
                  />
                </div>
              </div>

              {filteredTodayOrders.length === 0 ? (
                <div className="p-10 text-center bg-white rounded-2xl border border-violet-100 text-slate-600">
                  <Search className="w-8 h-8 mx-auto mb-2 text-violet-300" />
                  <p className="text-sm font-semibold">Nenhum registro corresponde à busca.</p>
                </div>
              ) : (
                <div className="mobile-order-list overflow-x-auto rounded-2xl bg-white border border-violet-100 shadow-sm">
                  <div className="min-w-[760px]">
                    <div className="mobile-order-header grid grid-cols-[1.1fr_1.4fr_1.1fr_1fr_1fr_auto] gap-3 border-b border-violet-100 bg-rose-50/70 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      <span>Pedido / hora</span>
                      <span>Cliente</span>
                      <span>Entrega</span>
                      <span>Pagamento</span>
                      <span>Total</span>
                      <span>Ação</span>
                    </div>
                    {filteredTodayOrders.map(order => (
                      <div key={order.id} className="mobile-order-row grid grid-cols-[1.1fr_1.4fr_1.1fr_1fr_1fr_auto] gap-3 items-center border-b border-violet-100 px-4 py-3 text-xs last:border-b-0 hover:bg-violet-50/40">
                        <div>
                          <p className="font-mono font-bold text-pink-700">#{order.order_code}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{order.customer_name}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{order.customer_phone}</p>
                        </div>
                        <div className="font-semibold text-violet-700">
                          <p>Bloco {order.delivery_block}</p>
                          <p className="mt-1 text-[11px] text-slate-500">APT {order.delivery_apartment}</p>
                        </div>
                        <span className="font-semibold text-emerald-700">{order.payment_method === 'pix' ? 'PIX' : 'CRÉDITO'}</span>
                        <div>
                          <p className="font-bold text-emerald-600">R$ {order.total_amount.toFixed(2).replace('.', ',')}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{order.items.map(item => `${item.quantity}x ${item.cake_name}`).join(', ')}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteOrder(order)}
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50 border border-red-200"
                          aria-label={`Excluir pedido ${order.order_code}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <AnimatePresence>
        {confirmAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/35 sm:backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-2xl bg-white border border-violet-100 p-4 sm:p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
            >
              <h2 id="confirm-title" className="text-lg font-serif font-bold text-slate-900">Confirmar exclusão</h2>
              <p className="mt-2 text-sm text-slate-600">{confirmAction.message}</p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  className="px-4 py-2 rounded-xl border border-violet-200 text-sm font-semibold text-slate-700 hover:bg-violet-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const action = confirmAction.action;
                    setConfirmAction(null);
                    await action();
                  }}
                  className="px-4 py-2 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-500"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal para Adicionar ou Editar Bolo */}
      <AnimatePresence>
        {isCakeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-violet-950/35 sm:backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="h-[100dvh] w-full overflow-y-auto bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-slate-900 sm:h-auto sm:max-w-md sm:overflow-visible sm:border sm:border-violet-100 sm:rounded-2xl sm:p-6 sm:shadow-2xl sm:my-6"
            >
              <div className="flex items-center justify-between pb-3 border-b border-violet-100 mb-4">
                <h3 className="text-lg font-serif font-bold text-pink-800">
                  {editingCake ? 'Editar Bolo' : 'Cadastrar Novo Bolo'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsCakeModalOpen(false)}
                  className="text-slate-600 hover:text-slate-900"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveCake} className="space-y-3.5">
                <div>
                  <label className="block text-xs text-slate-700 mb-1">Nome do Bolo *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="Ex: Bolo de Cenoura com Brigadeiro"
                    className="w-full px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-slate-900 text-xs focus:outline-none focus:border-pink-400"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-700 mb-1">Descrição</label>
                  <textarea
                    rows={2}
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    placeholder="Ingredientes, textura, calda..."
                    className="w-full px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-slate-900 text-xs focus:outline-none focus:border-pink-400 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-700 mb-1">Ingredientes</label>
                  <input
                    type="text"
                    value={formIngredients}
                    onChange={e => setFormIngredients(e.target.value)}
                    placeholder="Ex: farinha, ovos, açúcar, leite"
                    className="w-full px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-slate-900 text-xs focus:outline-none focus:border-pink-400"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">Separe os ingredientes por vírgula.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-700 mb-1">Categoria</label>
                    <select
                      value={formCategory}
                      onChange={e => setFormCategory(e.target.value as 'comum' | 'com_cobertura')}
                      className="w-full px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-slate-900 text-xs focus:outline-none focus:border-pink-400"
                    >
                      <option value="comum">Comum</option>
                      <option value="com_cobertura">Com cobertura</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-700 mb-1">Preço (R$) *</label>
                    <input
                      type="number"
                      step="0.50"
                      min="0"
                      required
                      value={formPrice}
                      onChange={e => setFormPrice(e.target.value)}
                      placeholder="45.00"
                      className="w-full px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-slate-900 text-xs focus:outline-none focus:border-pink-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-700 mb-1">
                    Quantidade do estoque *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formStock}
                    onChange={e => setFormStock(e.target.value)}
                    placeholder="5"
                    className="w-full px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-slate-900 text-xs focus:outline-none focus:border-pink-400"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-700 mb-1">
                    Foto do bolo {editingCake ? '(opcional para manter a atual)' : '*'}
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-pink-300 bg-pink-50/70 p-3 transition-colors hover:bg-pink-100/70">
                    <ImagePlus className="h-6 w-6 flex-shrink-0 text-pink-600" />
                    <span className="min-w-0 text-xs text-slate-700">
                      {formImageDataUrl ? 'Imagem selecionada — clique para trocar' : 'Escolher foto do dispositivo'}
                      <span className="mt-0.5 block text-[10px] text-slate-500">PNG, JPG ou WebP • máximo 3 MB</span>
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      required={!editingCake}
                      onChange={event => handleImageChange(event.target.files?.[0])}
                      className="sr-only"
                    />
                  </label>
                  {(formImageDataUrl || editingCake?.image_url) && (
                    <img
                      src={formImageDataUrl || editingCake?.image_url || '/assets/cake-card.svg'}
                      alt="Prévia do bolo"
                      className="mt-2 h-28 w-full rounded-xl border border-violet-200 object-cover"
                    />
                  )}
                </div>

                {formError && (
                  <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    {formError}
                  </p>
                )}

                <div className="pt-2 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsCakeModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-violet-50 text-slate-700 text-xs hover:bg-violet-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingCake}
                    className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 disabled:cursor-wait disabled:opacity-60 text-white text-xs font-semibold shadow-md"
                  >
                    {isSavingCake ? 'Salvando...' : 'Salvar Bolo'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
