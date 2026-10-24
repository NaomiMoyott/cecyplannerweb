// -------------------------------------------------------------
// APPLICATION INITIAL STATE
// -------------------------------------------------------------
let tasks = [];
let currentCalendarDate = new Date();

// -------------------------------------------------------------
// LIFECYCLE INITIALIZATION
// -------------------------------------------------------------
window.onload = function() {
    cargarTareasServidor();     // Carga las tareas desde MySQL Workbench (Read)
    cargarReportesAlumno();     // Carga los reportes desde MySQL Workbench
    switchTab('dashboard');

    // Periodic Toast Warning Simulation
    setTimeout(() => {
        const pendingUrgent = tasks.filter(t => t.status === 'Pendiente' && getHoursUntilDue(t.dueDate, t.dueTime) <= 24);
        if (pendingUrgent.length > 0) {
            showToast('RECORDATORIO URGENTE', `Tienes ${pendingUrgent.length} tarea(s) próximas a vencer en menos de 24 hrs.`, 'warning');
        }
    }, 800);
};

function evaluateExpiredTasks() {
    const now = new Date();
    tasks.forEach(t => {
        if (t.status === 'Pendiente') {
            const due = new Date(`${t.dueDate}T${t.dueTime}`);
            if (due < now) {
                t.status = 'Vencida';
            }
        }
    });
}

// -------------------------------------------------------------
// NAVIGATION SYSTEM (DESKTOP & MOBILE BOTTOM BAR)
// -------------------------------------------------------------
function switchTab(tabId) {
    const tabs = ['dashboard', 'tareas', 'calendario', 'eficiencia', 'maestros', 'recordatorios', 'configuracion'];

    tabs.forEach(t => {
        const view = document.getElementById(`view-${t}`);
        const deskBtn = document.getElementById(`desk-nav-${t}`);
        const mobBtn = document.getElementById(`mob-nav-${t}`);

        if (t === tabId) {
            if (view) view.classList.remove('hidden');
            if (deskBtn) deskBtn.className = "desk-btn w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-cecytem bg-cecytem/10";
            if (mobBtn) mobBtn.className = "mob-btn flex flex-col items-center justify-center w-14 py-1 text-cecytem font-bold";
        } else {
            if (view) view.classList.add('hidden');
            if (deskBtn) deskBtn.className = "desk-btn w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100";
            if (mobBtn) mobBtn.className = "mob-btn flex flex-col items-center justify-center w-14 py-1 text-slate-400";
        }
    });

    if (tabId === 'calendario') {
        renderCalendar();
    }
    if (tabId === 'maestros') {
        cargarReportesAlumno();
    }
}

function toggleDrawer(open) {
    const drawer = document.getElementById('drawer');
    const backdrop = document.getElementById('drawer-backdrop');

    if (open) {
        backdrop.classList.remove('hidden');
        setTimeout(() => drawer.classList.remove('-translate-x-full'), 10);
    } else {
        drawer.classList.add('-translate-x-full');
        setTimeout(() => backdrop.classList.add('hidden'), 300);
    }
}

function toggleRemindersPanel() {
    switchTab('recordatorios');
}

// -------------------------------------------------------------
// ALGORITHM: SCORE & EFFICIENCY METRICS
// -------------------------------------------------------------
function calculateMetrics() {
    const onTime = tasks.filter(t => t.status === 'Entregada a Tiempo').length;
    const late = tasks.filter(t => t.status === 'Entregada con Retraso').length;
    const expired = tasks.filter(t => t.status === 'Vencida').length;
    const pending = tasks.filter(t => t.status === 'Pendiente').length;

    const totalEvaluated = onTime + late + expired;
    
    let rawPoints = (onTime * 10) + (late * 3) - (expired * 5);
    if (rawPoints < 0) rawPoints = 0;
    
    let score = 100;
    if (totalEvaluated > 0) {
        const maxPossible = totalEvaluated * 10;
        score = Math.max(0, Math.min(100, Math.round((rawPoints / maxPossible) * 100)));
    }

    let grade = 'A+';
    let label = 'Excelente / Puntualidad de Hierro';
    if (score < 60) { grade = 'C'; label = 'Riesgo de Incumplimiento'; }
    else if (score < 80) { grade = 'B'; label = 'Regular / Atento a Plazos'; }
    else if (score < 95) { grade = 'A'; label = 'Buen Desempeño'; }

    const punctualityPct = totalEvaluated > 0 ? Math.round((onTime / totalEvaluated) * 100) : 100;

    return { onTime, late, expired, pending, totalEvaluated, score, grade, label, punctualityPct };
}

// -------------------------------------------------------------
// RENDER VIEWS
// -------------------------------------------------------------
function updateAllViews() {
    renderDashboard();
    renderTasks();
    renderEfficiencyModule();
    renderReminders();
}

function renderDashboard() {
    const m = calculateMetrics();

    document.getElementById('stat-pending').innerText = m.pending;
    document.getElementById('stat-ontime').innerText = m.onTime;
    document.getElementById('stat-late').innerText = m.late;
    document.getElementById('stat-score').innerText = m.score;
    document.getElementById('stat-grade').innerText = m.grade;

    const container = document.getElementById('dashboard-urgent-list');
    const urgent = tasks.filter(t => t.status === 'Pendiente').slice(0, 3);

    if (urgent.length === 0) {
        container.innerHTML = `
            <div class="text-center py-6 text-slate-400 text-xs sm:text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <i class="fa-solid fa-circle-check text-emerald-500 text-2xl mb-1"></i>
                <p>¡No tienes entregas pendientes por el momento!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = urgent.map(t => `
        <div class="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between gap-2">
            <div class="min-w-0">
                <div class="flex items-center space-x-2">
                    <span class="text-[10px] font-bold text-cecytem bg-cecytem/10 px-2 py-0.5 rounded">${t.subject}</span>
                    ${getPriorityBadge(t.priority)}
                </div>
                <h4 class="text-xs sm:text-sm font-semibold text-slate-800 truncate mt-1">${t.title}</h4>
                <p class="text-[11px] text-slate-500 mt-0.5"><i class="fa-regular fa-clock mr-1"></i>Vence: ${t.dueDate} (${t.dueTime})</p>
            </div>
            <button onclick="markAsDelivered('${t.id}')" class="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-95">
                <i class="fa-solid fa-check"></i>
                <span class="hidden sm:inline ml-1">Entregar</span>
            </button>
        </div>
    `).join('');
}

function renderTasks() {
    const container = document.getElementById('tasks-container');
    const search = document.getElementById('task-search').value.toLowerCase();
    const statusF = document.getElementById('filter-status').value;
    const subjectF = document.getElementById('filter-subject').value;
    const sortF = document.getElementById('filter-sort').value;

    let filtered = tasks.filter(t => {
        const matchSearch = t.title.toLowerCase().includes(search) || t.subject.toLowerCase().includes(search);
        const matchStatus = statusF === 'todos' || t.status === statusF;
        const matchSubject = subjectF === 'todas' || t.subject === subjectF;
        return matchSearch && matchStatus && matchSubject;
    });

    filtered.sort((a, b) => {
        if (sortF === 'due-asc') return new Date(`${a.dueDate}T${a.dueTime}`) - new Date(`${b.dueDate}T${b.dueTime}`);
        if (sortF === 'priority') {
            const pMap = { 'Alta': 3, 'Media': 2, 'Baja': 1 };
            return pMap[b.priority] - pMap[a.priority];
        }
        return b.id - a.id;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-12 bg-white rounded-2xl border border-slate-200/80 text-slate-400">
                <i class="fa-regular fa-folder-open text-4xl mb-2"></i>
                <p class="text-xs sm:text-sm font-medium">No hay tareas que coincidan con los filtros seleccionados.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(t => `
        <div class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col justify-between space-y-3">
            <div>
                <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[10px] font-bold text-cecytem bg-cecytem/10 px-2.5 py-0.5 rounded-md">${t.subject}</span>
                    ${getStatusBadge(t.status)}
                </div>
                <h3 class="font-title font-bold text-slate-800 text-sm sm:text-base">${t.title}</h3>
                <p class="text-xs text-slate-600 mt-1 line-clamp-2">${t.desc || 'Sin instrucciones adicionales.'}</p>
            </div>

            <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <div>
                    ${getPriorityBadge(t.priority)}
                    <p class="text-[11px] text-slate-400 mt-1"><i class="fa-regular fa-calendar mr-1"></i>${t.dueDate} ${t.dueTime}</p>
                </div>

                <div class="flex items-center space-x-1">
                    ${t.status === 'Pendiente' || t.status === 'Vencida' ? `
                        <button onclick="markAsDelivered('${t.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold">
                            <i class="fa-solid fa-check"></i>
                        </button>
                    ` : ''}
                    <button onclick="editTask('${t.id}')" class="text-slate-400 hover:text-cecytem p-1.5 rounded-lg">
                        <i class="fa-regular fa-pen-to-square"></i>
                    </button>
                    <button onclick="deleteTask('${t.id}')" class="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg">
                        <i class="fa-regular fa-trash-can"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function renderEfficiencyModule() {
    const m = calculateMetrics();

    document.getElementById('efficiency-score-display').innerText = m.score;
    document.getElementById('efficiency-level-tag').innerText = `Nivel ${m.grade}`;
    document.getElementById('efficiency-status-text').innerText = m.label;
    document.getElementById('punctuality-percentage').innerText = `${m.punctualityPct}%`;

    const total = m.totalEvaluated || 1;
    document.getElementById('breakdown-ontime').innerText = `${m.onTime} (${Math.round((m.onTime/total)*100)}%)`;
    document.getElementById('bar-ontime').style.width = `${(m.onTime/total)*100}%`;

    document.getElementById('breakdown-late').innerText = `${m.late} (${Math.round((m.late/total)*100)}%)`;
    document.getElementById('bar-late').style.width = `${(m.late/total)*100}%`;

    document.getElementById('breakdown-expired').innerText = `${m.expired} (${Math.round((m.expired/total)*100)}%)`;
    document.getElementById('bar-expired').style.width = `${(m.expired/total)*100}%`;

    const badgesContainer = document.getElementById('badges-grid');
    const badges = [
        { title: 'Puntualidad de Hierro', icon: 'fa-shield-halved', desc: '90%+ Entregas a Tiempo', active: m.punctualityPct >= 90 },
        { title: 'Organizador Experto', icon: 'fa-cubes', desc: 'Más de 3 Tareas Agendadas', active: tasks.length >= 3 },
        { title: 'Cero Vencidas', icon: 'fa-circle-check', desc: '0 Tareas Vencidas', active: m.expired === 0 && m.totalEvaluated > 0 }
    ];

    badgesContainer.innerHTML = badges.map(b => `
        <div class="p-3 rounded-xl border ${b.active ? 'bg-emerald-50/50 border-emerald-200 text-slate-800' : 'bg-slate-50 border-slate-200 opacity-50'} flex items-center space-x-2.5">
            <div class="w-8 h-8 rounded-lg ${b.active ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'} flex items-center justify-center font-bold text-sm shrink-0">
                <i class="fa-solid ${b.icon}"></i>
            </div>
            <div>
                <p class="font-bold text-xs">${b.title}</p>
                <p class="text-[10px] text-slate-500">${b.desc}</p>
            </div>
        </div>
    `).join('');
}

function renderReminders() {
    const container = document.getElementById('reminders-list-full');
    const pending = tasks.filter(t => t.status === 'Pendiente');

    if (pending.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center text-slate-400 text-xs sm:text-sm bg-white rounded-2xl border border-slate-200/80">
                <i class="fa-regular fa-bell-slash text-3xl mb-2"></i>
                <p>No tienes alertas ni recordatorios activos.</p>
            </div>
        `;
        document.getElementById('unread-count').classList.add('hidden');
        return;
    }

    document.getElementById('unread-count').classList.remove('hidden');

    container.innerHTML = pending.map(t => {
        const hours = getHoursUntilDue(t.dueDate, t.dueTime);
        const isUrgent = hours <= 24;

        return `
            <div class="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm flex items-start space-x-3">
                <div class="p-2.5 rounded-xl ${isUrgent ? 'bg-amber-500 text-white' : 'bg-cecytem/10 text-cecytem'} shrink-0 mt-0.5">
                    <i class="fa-solid fa-clock text-base"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                        <h4 class="text-xs sm:text-sm font-bold text-slate-800 truncate">${t.title} (${t.subject})</h4>
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-md ${isUrgent ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'}">
                            ${hours < 0 ? 'Plazo Vencido' : `~${hours} hrs restantes`}
                        </span>
                    </div>
                    <p class="text-xs text-slate-500 mt-1">Fecha límite: ${t.dueDate} a las ${t.dueTime} hs.</p>
                </div>
            </div>
        `;
    }).join('');
}

// Cargar reportes del alumno desde MySQL
// Cargar los reportes del alumno autenticado dinámicamente desde MySQL usando su ID real
function cargarReportesAlumno() {
    // Obtenemos el ID del usuario desde un atributo global o elemento seguro en la plantilla
    const userIdMeta = document.getElementById('session-user-id');
    const usuarioId = userIdMeta ? userIdMeta.value : 1;

    fetch(`/api/reportes/${usuarioId}`)
        .then(response => response.json())
        .then(data => {
            const container = document.getElementById('teacher-reports-list');
            if (!container) return;

            if (data.length === 0) {
                container.innerHTML = `<p class="text-xs text-slate-400 p-3 bg-white rounded-xl border border-slate-200">No hay reportes institucionales registrados en tu expediente.</p>`;
                return;
            }

            container.innerHTML = data.map(r => `
                <div class="p-3 bg-white border border-slate-200 rounded-xl text-xs space-y-1 shadow-sm">
                    <div class="flex justify-between items-center font-bold text-slate-800">
                        <span>${r.maestro_nombre} (${r.materia})</span>
                        <span class="text-[10px] text-slate-400">${r.fecha_registro}</span>
                    </div>
                    <p class="text-slate-600">${r.comentario}</p>
                </div>
            `).join('');
        })
        .catch(err => console.error('Error al consultar reportes:', err));
}

// -------------------------------------------------------------
// CALENDAR GENERATOR
// -------------------------------------------------------------
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthYearText = document.getElementById('calendar-month-year');
    grid.innerHTML = '';

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    monthYearText.innerText = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div class="h-16 sm:h-20 bg-slate-50/50 rounded-xl p-1 text-slate-300"></div>`;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayTasks = tasks.filter(t => t.dueDate === dateStr);
        const isToday = dateStr === todayStr;

        grid.innerHTML += `
            <div onclick="selectCalendarDay('${dateStr}')" class="h-16 sm:h-20 bg-white border ${isToday ? 'border-cecytem ring-1 ring-cecytem' : 'border-slate-100'} rounded-xl p-1 flex flex-col justify-between hover:border-cecytem cursor-pointer transition-all">
                <span class="text-[10px] sm:text-xs font-bold ${isToday ? 'text-cecytem font-black' : 'text-slate-600'}">${d}</span>
                <div class="space-y-0.5 overflow-hidden">
                    ${dayTasks.map(t => `
                        <div class="text-[9px] truncate px-1 py-0.5 rounded bg-cecytem/10 text-cecytem font-semibold">
                            ${t.title}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
}

function changeMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderCalendar();
}

function selectCalendarDay(dateStr) {
    const dayTasks = tasks.filter(t => t.dueDate === dateStr);
    const container = document.getElementById('calendar-day-details');
    const title = document.getElementById('calendar-selected-title');
    const list = document.getElementById('calendar-selected-tasks');

    container.classList.remove('hidden');
    title.innerText = `Tareas agendadas para el ${dateStr}:`;

    if (dayTasks.length === 0) {
        list.innerHTML = `<p class="text-xs text-slate-400">Sin entregas para este día.</p>`;
        return;
    }

    list.innerHTML = dayTasks.map(t => `
        <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center text-xs">
            <div>
                <p class="font-bold text-slate-800">${t.title} (${t.subject})</p>
                <p class="text-slate-500">${t.dueTime} hs - ${t.status}</p>
            </div>
            ${getStatusBadge(t.status)}
        </div>
    `).join('');
}

// -------------------------------------------------------------
// ABCM / CRUD ACTIONS (CONECTADO A MYSQL)
// -------------------------------------------------------------

// 1. CONSULTAR TAREAS (READ)
function cargarTareasServidor() {
    fetch('/api/tareas')
        .then(res => res.json())
        .then(data => {
            tasks = data;
            evaluateExpiredTasks();
            updateAllViews();
        })
        .catch(err => console.error('Error al consultar tareas:', err));
}

// 2. ALTA Y CAMBIO DE TAREAS (CREATE / UPDATE)
function handleSaveTask(e) {
    e.preventDefault();
    const editId = document.getElementById('form-edit-id').value;
    
    const taskData = {
        subject: document.getElementById('form-subject').value.trim(),
        title: document.getElementById('form-title').value.trim(),
        desc: document.getElementById('form-desc').value.trim(),
        dueDate: document.getElementById('form-date').value,
        dueTime: document.getElementById('form-time').value,
        priority: document.getElementById('form-priority').value,
        status: document.getElementById('form-status').value
    };

    if (editId) {
        // CAMBIO (UPDATE)
        fetch(`/api/tareas/${editId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        })
        .then(res => res.json())
        .then(() => {
            showToast('CAMBIO GUARDADO', 'La tarea ha sido actualizada en la base de datos.', 'info');
            cargarTareasServidor();
            closeModal();
        });
    } else {
        // ALTA (CREATE)
        fetch('/api/tareas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        })
        .then(res => res.json())
        .then(() => {
            showToast('ALTA EXITOSA', 'Tarea registrada en la base de datos MySQL.', 'success');
            cargarTareasServidor();
            closeModal();
        });
    }
}

// 3. EDITAR TAREA (CARGAR DATOS AL MODAL) - Usando '==' para evitar conflictos de tipo con MySQL
function editTask(taskId) {
    const task = tasks.find(t => t.id == taskId);
    if (!task) return;

    document.getElementById('form-edit-id').value = task.id;
    document.getElementById('form-subject').value = task.subject;
    document.getElementById('form-title').value = task.title;
    document.getElementById('form-desc').value = task.desc || '';
    document.getElementById('form-date').value = task.dueDate;
    document.getElementById('form-time').value = task.dueTime;
    document.getElementById('form-priority').value = task.priority;
    document.getElementById('form-status').value = task.status;

    document.getElementById('modal-title-text').innerText = 'Editar Tarea Académica';
    document.getElementById('task-modal').classList.remove('hidden');
}

// 4. BAJA DE TAREA (DELETE)
function deleteTask(taskId) {
    if (!confirm('¿Deseas dar de baja esta tarea de la base de datos?')) return;

    fetch(`/api/tareas/${taskId}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(() => {
            showToast('BAJA COMPLETA', 'La tarea ha sido eliminada de la base de datos.', 'info');
            cargarTareasServidor();
        });
}

// 5. MARCAR COMO ENTREGADA
function markAsDelivered(taskId) {
    const task = tasks.find(t => t.id == taskId);
    if (!task) return;

    const now = new Date();
    const due = new Date(`${task.dueDate}T${task.dueTime}`);

    let nuevoEstado = '';
    if (now <= due) {
        nuevoEstado = 'Entregada a Tiempo';
        showToast('¡EXCELENTE!', 'Puntualidad premiada (+10 pts).', 'success');
    } else {
        nuevoEstado = 'Entregada con Retraso';
        showToast('ENTREGADA TARDÍAMENTE', 'Entregada con retraso (+3 pts).', 'warning');
    }

    const taskData = {
        subject: task.subject,
        title: task.title,
        desc: task.desc,
        dueDate: task.dueDate,
        dueTime: task.dueTime,
        priority: task.priority,
        status: nuevoEstado
    };

    fetch(`/api/tareas/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
    })
    .then(res => res.json())
    .then(() => {
        cargarTareasServidor();
    });
}

function openModal() {
    document.getElementById('task-form').reset();
    document.getElementById('form-edit-id').value = '';
    document.getElementById('form-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('modal-title-text').innerText = 'Agendar Tarea Académica';
    document.getElementById('task-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('task-modal').classList.add('hidden');
}

// -------------------------------------------------------------
// UTILITIES
// -------------------------------------------------------------
function getPriorityBadge(p) {
    if (p === 'Alta') return `<span class="inline-flex items-center text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded"><i class="fa-solid fa-circle text-[6px] mr-1"></i>Alta</span>`;
    if (p === 'Media') return `<span class="inline-flex items-center text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded"><i class="fa-solid fa-circle text-[6px] mr-1"></i>Media</span>`;
    return `<span class="inline-flex items-center text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded"><i class="fa-solid fa-circle text-[6px] mr-1"></i>Baja</span>`;
}

function getStatusBadge(s) {
    if (s === 'Entregada a Tiempo') return `<span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">A Tiempo</span>`;
    if (s === 'Entregada con Retraso') return `<span class="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full">Con Retraso</span>`;
    if (s === 'Vencida') return `<span class="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded-full">Vencida</span>`;
    return `<span class="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-full">Pendiente</span>`;
}

function getHoursUntilDue(dueDate, dueTime) {
    const due = new Date(`${dueDate}T${dueTime}`);
    const now = new Date();
    return Math.round((due - now) / (1000 * 60 * 60));
}

function handleGlobalSearch(query) {
    switchTab('tareas');
    document.getElementById('task-search').value = query;
    renderTasks();
}

function showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');

    let bg = 'bg-slate-800 text-white';
    let icon = 'fa-info-circle';

    if (type === 'success') { bg = 'bg-emerald-700 text-white'; icon = 'fa-circle-check'; }
    if (type === 'warning') { bg = 'bg-amber-600 text-white'; icon = 'fa-triangle-exclamation'; }

    toast.className = `${bg} p-3.5 rounded-xl shadow-2xl flex items-start space-x-2.5 pointer-events-auto transition-all duration-300 transform translate-y-2 opacity-0 text-xs`;
    toast.innerHTML = `
        <i class="fa-solid ${icon} text-sm mt-0.5"></i>
        <div>
            <p class="font-bold uppercase tracking-wider">${title}</p>
            <p class="mt-0.5 opacity-90">${message}</p>
        </div>
    `;

    container.appendChild(toast);
    setTimeout(() => toast.classList.remove('translate-y-2', 'opacity-0'), 50);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// 1. Pedir permiso al usuario para enviar alertas al celular/pantalla
function solicitarPermisoNotificaciones() {
    if (!("Notification" in window)) {
        alert("Tu navegador no soporta notificaciones push.");
        return;
    }
    Notification.requestPermission().then(permission => {
        if (permission === "granted") {
            enviarNotificacionCelular("¡CecyPlanner Activado!", "Las alertas en tu celular están listas.");
            showToast("NOTIFICACIONES", "Alertas móviles activadas correctamente.", "success");
        }
    });
}

// 2. Función que envía la alerta flotante a la pantalla
function enviarNotificacionCelular(titulo, mensaje) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(titulo, {
            body: mensaje,
            icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
        });
    }
}