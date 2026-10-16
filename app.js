// Estado global del sistema
let movements = JSON.parse(localStorage.getItem('cc_movements')) || [];
let products = JSON.parse(localStorage.getItem('cc_products')) || [];
let categories = ['Ventas', 'Servicios', 'Compras', 'Proveedores', 'Otros'];
let userPIN = localStorage.getItem('cc_pin') || null;
let currentArqueoPeriod = 'diario';
let chartInstance = null;

// Inicialización de la App
document.addEventListener('DOMContentLoaded', () => {
  checkSecurity();
  loadCategories();
  updateDashboard();
  renderInventory();
  loadNotificationSettings();
  initNotificationsScheduler();
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

// 1️⃣ DASHBOARD Y CÁLCULOS
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
  if (recent.length === 0) {
    list.innerHTML = '<li class="movement-item" style="justify-content:center; color:#666;">No hay movimientos registrados.</li>';
    return;
  }

  recent.forEach(m => {
    const li = document.createElement('li');
    li.className = `movement-item ${m.type}`;
    li.innerHTML = `
      <div>
        <strong>${m.category}</strong>
        <p style="font-size:0.8rem; color:#666">${m.description || 'Sin descripción'} ${m.photo ? '📸' : ''}</p>
      </div>
      <span class="amount">${m.type === 'ingreso' ? '+' : '-'}${formatCOP(m.amount)}</span>
    `;
    list.appendChild(li);
  });
}

// 2️⃣ REGISTRO DE MOVIMIENTOS Y DESCUENTO DE INVENTARIO
function openMovementModal(type) {
  document.getElementById('movement-form').reset();
  document.getElementById('form-type').value = type;
  document.getElementById('modal-title').textContent = type === 'ingreso' ? 'Registrar Ingreso' : 'Registrar Gasto';
  
  const discountStockGroup = document.getElementById('group-discount-stock');
  const quantitySoldGroup = document.getElementById('group-quantity-sold');

  if (type === 'ingreso') {
    discountStockGroup.style.display = 'block';
    quantitySoldGroup.style.display = 'none';
    populateProductDiscountSelect();
  } else {
    discountStockGroup.style.display = 'none';
    quantitySoldGroup.style.display = 'none';
  }

  document.getElementById('modal-movement').classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function onProductSelectedForSale() {
  const productId = document.getElementById('form-product-discount').value;
  const quantitySoldGroup = document.getElementById('group-quantity-sold');
  
  if (productId) {
    quantitySoldGroup.style.display = 'block';
    document.getElementById('form-qty-sold').value = 1;
    updateTotalSaleAmount();
  } else {
    quantitySoldGroup.style.display = 'none';
  }
}

function updateTotalSaleAmount() {
  const productId = document.getElementById('form-product-discount').value;
  const qty = parseFloat(document.getElementById('form-qty-sold').value) || 0;
  if (productId) {
    const prod = products.find(p => p.id == productId);
    if (prod && prod.sellPrice) {
      document.getElementById('form-amount').value = prod.sellPrice * qty;
    }
  }
}

// Función principal que guarda la venta y DESCUENTA EL INVENTARIO
function saveMovement(e) {
  e.preventDefault();
  const type = document.getElementById('form-type').value;
  const amount = parseFloat(document.getElementById('form-amount').value);
  const category = document.getElementById('form-category').value;
  const description = document.getElementById('form-description').value;
  const productId = document.getElementById('form-product-discount').value;
  let qtySold = parseFloat(document.getElementById('form-qty-sold').value) || 0;
  const photoInput = document.getElementById('form-photo');

  // ➕ NUEVA FUNCIÓN: Restar automáticamente la cantidad vendida del inventario
  if (type === 'ingreso' && productId) {
    const prod = products.find(p => p.id == productId);
    if (prod) {
      if (prod.stock >= qtySold) {
        prod.stock -= qtySold; // Resta la cantidad vendida
        localStorage.setItem('cc_products', JSON.stringify(products)); // Guarda el inventario actualizado
      } else {
        alert(`⚠️ Stock insuficiente. Solo quedan ${prod.stock} unidades de ${prod.name}.`);
        return; // Detiene el registro si no hay suficiente existencias
      }
    }
  }

  // Comprobante con foto opcional
  if (photoInput.files && photoInput.files[0]) {
    const reader = new FileReader();
    reader.onload = function(uploadEvent) {
      finalizeMovement(type, amount, category, description, uploadEvent.target.result);
    };
    reader.readAsDataURL(photoInput.files[0]);
  } else {
    finalizeMovement(type, amount, category, description, null);
  }
}

function finalizeMovement(type, amount, category, description, photoData) {
  const newMovement = {
    id: Date.now(),
    type,
    amount,
    category,
    description,
    photo: photoData,
    date: new Date().toISOString()
  };

  movements.push(newMovement);
  localStorage.setItem('cc_movements', JSON.stringify(movements));

  updateDashboard();
  renderInventory(); // Actualiza la pantalla de inventario en tiempo real
  closeModal('modal-movement');
}

// 3️⃣ MÓDULO DE INVENTARIO
function renderInventory() {
  const list = document.getElementById('inventory-list');
  const alertContainer = document.getElementById('stock-alerts-container');
  list.innerHTML = '';
  alertContainer.innerHTML = '';

  let lowStockItems = [];

  if (products.length === 0) {
    list.innerHTML = '<li class="inventory-item" style="justify-content:center; color:#666;">No hay productos registrados en el inventario.</li>';
    return;
  }

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
        <strong style="font-size:1.1rem; color:var(--color-purple)">${p.stock} dispon.</strong>
        <p><button onclick="deleteProduct(${p.id})" style="border:none; background:none; color:red; cursor:pointer; font-size:0.8rem; margin-top:4px;">Eliminar</button></p>
      </div>
    `;
    list.appendChild(li);
  });

  if (lowStockItems.length > 0) {
    alertContainer.innerHTML = `
      <div class="card" style="border-left: 5px solid #d32f2f; background:#fff5f5; margin-bottom:14px;">
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
    stock: parseFloat(document.getElementById('prod-stock').value),
    minStock: parseFloat(document.getElementById('prod-min-stock').value),
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
    opt.textContent = `${p.name} (Quedan: ${p.stock} - ${formatCOP(p.sellPrice)} c/u)`;
    select.appendChild(opt);
  });
}

// 4️⃣ ARQUEO DE CAJA
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

// 5️⃣ REPORTES Y FILTROS
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
        backgroundColor: ['#7b1fa2', '#1a1a1a']
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
  
  if (filtered.length === 0) {
    list.innerHTML = '<li class="movement-item" style="justify-content:center; color:#666;">No se encontraron movimientos.</li>';
    return;
  }

  filtered.reverse().forEach(m => {
    const li = document.createElement('li');
    li.className = `movement-item ${m.type}`;
    li.innerHTML = `
      <div>
        <strong>${m.category}</strong> - <small>${new Date(m.date).toLocaleDateString()}</small>
        <p style="font-size:0.8rem; color:#666">${m.description || 'Sin descripción'} ${m.photo ? '📸' : ''}</p>
      </div>
      <span class="amount">${m.type === 'ingreso' ? '+' : '-'}${formatCOP(m.amount)}</span>
    `;
    list.appendChild(li);
  });
}

// 6️⃣ CONFIGURACIÓN, SEGURIDAD Y RESPALDO
function saveNotificationSettings() {
  const settings = {
    daily: document.getElementById('notif-daily').checked,
    dailyTime: document.getElementById('time-daily').value,
    weekly: document.getElementById('notif-weekly').checked,
    weeklyTime: document.getElementById('time-weekly').value,
    monthly: document.getElementById('notif-monthly').checked,
    monthlyTime: document.getElementById('time-monthly').value,
    stock: document.getElementById('notif-stock').checked
  };
  localStorage.setItem('cc_notif_settings', JSON.stringify(settings));
}

function loadNotificationSettings() {
  const saved = JSON.parse(localStorage.getItem('cc_notif_settings'));
  if (saved) {
    document.getElementById('notif-daily').checked = saved.daily;
    if (saved.dailyTime) document.getElementById('time-daily').value = saved.dailyTime;
    document.getElementById('notif-weekly').checked = saved.weekly;
    if (saved.weeklyTime) document.getElementById('time-weekly').value = saved.weeklyTime;
    document.getElementById('notif-monthly').checked = saved.monthly;
    if (saved.monthlyTime) document.getElementById('time-monthly').value = saved.monthlyTime;
    document.getElementById('notif-stock').checked = saved.stock;
  }
}

function initNotificationsScheduler() {
  if ('Notification' in window && Notification.permission !== 'granted') {
    Notification.requestPermission();
  }
}

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
