// Estado global
let movements = JSON.parse(localStorage.getItem('cc_movements')) || [];
let products = JSON.parse(localStorage.getItem('cc_products')) || [];
let categories = ['Ventas', 'Servicios', 'Compras', 'Proveedores', 'Otros'];
let userPIN = localStorage.getItem('cc_pin') || null;
let currentArqueoPeriod = 'diario';
let chartInstance = null;

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', () => {
  checkSecurity();
  loadCategories();
  updateDashboard();
  renderInventory();
  initNotifications();
});

// Formateador Pesos Colombianos (COP)
function formatCOP(amount) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  }).format(amount);
}

// Navegación entre Vistas
function switchView(viewId, element) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(viewId).classList.add('active');
  if (element) element.classList.add('active');

  if (viewId === 'view-arqueo') renderArqueo();
  if (viewId === 'view-inventory') renderInventory();
  if (viewId === 'view-reports') renderReports();
}

// Dashboard Finanzas
function updateDashboard() {
  const totalIncome = movements.filter(m => m.type === 'ingreso').reduce((sum, m) => sum + m.amount, 0);
  const totalExpense = movements.filter(m => m.type === 'gasto').reduce((sum, m) => sum + m.amount, 0);
  const balance = totalIncome - totalExpense;

  document.getElementById('total-balance').textContent = formatCOP(balance);
  document.getElementById('total-income').textContent = formatCOP(totalIncome);
  document.getElementById('total-expense').textContent = formatCOP(totalExpense);

  renderRecentMovements();
}

function renderRecentMovements() {
  const list = document.getElementById('recent-movements-list');
  list.innerHTML = '';
  
  const recent = movements.slice(-5).reverse();
  recent.forEach(m => {
    const li = document.createElement('li');
    li.className = `movement-item ${m.type}`;
    li.innerHTML = `
      <div>
        <strong>${m.category}</strong>
        <p style="font-size:0.8rem; color:#666">${m.description || 'Sin descripción'}</p>
      </div>
      <span class="amount">${m.type === 'ingreso' ? '+' : '-'}${formatCOP(m.amount)}</span>
    `;
    list.appendChild(li);
  });
}

// Registro Movimientos
function openMovementModal(type) {
  document.getElementById('form-type').value = type;
  document.getElementById('modal-title').textContent = type === 'ingreso' ? 'Registrar Ingreso' : 'Registrar Gasto';
  
  const discountStockGroup = document.getElementById('group-discount-stock');
  if (type === 'ingreso') {
    discountStockGroup.style.display = 'block';
    populateProductDiscountSelect();
  } else {
    discountStockGroup.style.display = 'none';
  }

  document.getElementById('modal-movement').classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function saveMovement(e) {
  e.preventDefault();
  const type = document.getElementById('form-type').value;
  const amount = parseFloat(document.getElementById('form-amount').value);
  const category = document.getElementById('form-category').value;
  const description = document.getElementById('form-description').value;
  const productId = document.getElementById('form-product-discount').value;

  // Descontar inventario si aplica
  if (type === 'ingreso' && productId) {
    const prod = products.find(p => p.id == productId);
    if (prod && prod.stock > 0) {
      prod.stock -= 1;
      localStorage.setItem('cc_products', JSON.stringify(products));
    }
  }

  const newMovement = {
    id: Date.now(),
    type,
    amount,
    category,
    description,
    date: new Date().toISOString()
  };

  movements.push(newMovement);
  localStorage.setItem('cc_movements', JSON.stringify(movements));

  updateDashboard();
  closeModal('modal-movement');
  document.getElementById('movement-form').reset();
}

// Módulo de Inventario
function renderInventory() {
  const list = document.getElementById('inventory-list');
  const alertContainer = document.getElementById('stock-alerts-container');
  list.innerHTML = '';
  alertContainer.innerHTML = '';

  let lowStockItems = [];

  products.forEach(p => {
    const isLow = p.stock <= p.minStock;
    if (isLow) lowStockItems.push(p);

    const li = document.createElement('li');
    li.className = `inventory-item ${isLow ? 'low-stock' : ''}`;
    li.innerHTML = `
      <div>
        <strong>${p.name}</strong> ${isLow ? '<span class="badge-alert">¡Stock Bajo!</span>' : ''}
        <p style="font-size:0.8rem; color:#666">Compra: ${formatCOP(p.buyPrice)} | Venta: ${formatCOP(p.sellPrice)}</p>
      </div>
      <div style="text-align:right;">
        <strong style="font-size:1.1rem; color:var(--color-purple)">${p.stock} unid.</strong>
        <p><button onclick="deleteProduct(${p.id})" style="border:none; background:none; color:red; cursor:pointer;">Eliminar</button></p>
      </div>
    `;
    list.appendChild(li);
  });

  if (lowStockItems.length > 0) {
    alertContainer.innerHTML = `
      <div class="card" style="border-left: 4px solid red; background:#ffebee;">
        <strong>⚠️ Atención:</strong> Tienes ${lowStockItems.length} producto(s) por agotarse.
      </div>
    `;
  }
}

function openProductModal() {
  document.getElementById('product-form').reset();
  document.getElementById('modal-product').classList.add('active');
}

function saveProduct(e) {
  e.preventDefault();
  const newProduct = {
    id: Date.now(),
    name: document.getElementById('prod-name').value,
    stock: parseInt(document.getElementById('prod-stock').value),
    minStock: parseInt(document.getElementById('prod-min-stock').value),
    buyPrice: parseFloat(document.getElementById('prod-buy-price').value),
    sellPrice: parseFloat(document.getElementById('prod-sell-price').value)
  };

  products.push(newProduct);
  localStorage.setItem('cc_products', JSON.stringify(products));

  renderInventory();
  closeModal('modal-product');
}

function deleteProduct(id) {
  if (confirm('¿Deseas eliminar este producto del inventario?')) {
    products = products.filter(p => p.id !== id);
    localStorage.setItem('cc_products', JSON.stringify(products));
    renderInventory();
  }
}

function populateProductDiscountSelect() {
  const select = document.getElementById('form-product-discount');
  select.innerHTML = '<option value="">Ninguno / Venta General</option>';
  products.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} (Quedan: ${p.stock})`;
    select.appendChild(opt);
  });
}

// Arqueo de caja
function setArqueoPeriod(period, btn) {
  currentArqueoPeriod = period;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderArqueo();
}

function renderArqueo() {
  const now = new Date();
  const filtered = movements.filter(m => {
    const mDate = new Date(m.date);
    if (currentArqueoPeriod === 'diario') return mDate.toDateString() === now.toDateString();
    if (currentArqueoPeriod === 'semanal') return (now - mDate) / (1000 * 60 * 60 * 24) <= 7;
    if (currentArqueoPeriod === 'mensual') return mDate.getMonth() === now.getMonth() && mDate.getFullYear() === now.getFullYear();
    return true;
  });

  const inc = filtered.filter(m => m.type === 'ingreso').reduce((a, b) => a + b.amount, 0);
  const exp = filtered.filter(m => m.type === 'gasto').reduce((a, b) => a + b.amount, 0);

  document.getElementById('arqueo-income').textContent = formatCOP(inc);
  document.getElementById('arqueo-expense').textContent = formatCOP(exp);
  document.getElementById('arqueo-total').textContent = formatCOP(inc - exp);
}

// Reportes con Chart.js (Morado / Negro)
function renderReports() {
  const ctx = document.getElementById('chart-income-expense').getContext('2d');
  
  const totalInc = movements.filter(m => m.type === 'ingreso').reduce((a,b) => a + b.amount, 0);
  const totalExp = movements.filter(m => m.type === 'gasto').reduce((a,b) => a + b.amount, 0);

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Ingresos', 'Gastos'],
      datasets: [{
        data: [totalInc, totalExp],
        backgroundColor: ['#6a1b9a', '#121212']
      }]
    }
  });

  renderMovementsList();
}

function renderMovementsList() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const typeFilter = document.getElementById('filter-type').value;

  const filtered = movements.filter(m => {
    const matchSearch = m.description.toLowerCase().includes(search) || m.category.toLowerCase().includes(search);
    const matchType = typeFilter === 'todos' || m.type === typeFilter;
    return matchSearch && matchType;
  });

  const list = document.getElementById('full-movements-list');
  list.innerHTML = '';
  filtered.reverse().forEach(m => {
    const li = document.createElement('li');
    li.className = `movement-item ${m.type}`;
    li.innerHTML = `
      <div>
        <strong>${m.category}</strong> - <small>${new Date(m.date).toLocaleDateString()}</small>
        <p style="font-size:0.8rem; color:#666">${m.description || 'Sin descripción'}</p>
      </div>
      <span class="amount">${m.type === 'ingreso' ? '+' : '-'}${formatCOP(m.amount)}</span>
    `;
    list.appendChild(li);
  });
}

// Exportación CSV
function exportDataCSV() {
  let csv = 'ID,Tipo,Monto,Categoria,Descripcion,Fecha\n';
  movements.forEach(m => {
    csv += `${m.id},${m.type},${m.amount},"${m.category}","${m.description}",${m.date}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', `cuenta_clara_reporte_${Date.now()}.csv`);
  a.click();
}

// Categorías
function loadCategories() {
  const select = document.getElementById('form-category');
  select.innerHTML = '';
  categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    select.appendChild(opt);
  });
}

// Seguridad (PIN)
function setupPIN() {
  const pin = prompt('Ingresa un nuevo PIN de 4 dígitos:');
  if (pin && pin.length === 4) {
    localStorage.setItem('cc_pin', pin);
    userPIN = pin;
    alert('PIN guardado con éxito.');
  }
}

function checkSecurity() {
  if (userPIN) {
    document.getElementById('pin-screen').classList.remove('hidden');
  }
}

function verifyPIN() {
  const input = document.getElementById('pin-input').value;
  if (input === userPIN) {
    document.getElementById('pin-screen').classList.add('hidden');
  } else {
    alert('PIN Incorrecto');
  }
}

function lockApp() {
  if (userPIN) {
    document.getElementById('pin-screen').classList.remove('hidden');
  } else {
    alert('Configura un PIN primero en Ajustes.');
  }
}

// Notificaciones web
function initNotifications() {
  if ('Notification' in window) {
    Notification.requestPermission();
  }
}

function toggleNotificationSetting(key, enabled) {
  localStorage.setItem(`cc_notif_${key}`, enabled);
}
