import os
import qrcode
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
import pymysql

app = Flask(__name__)
app.secret_key = 'clave_secreta_cecyplanner_2026'

# Contraseña general de docentes para autenticación del portal
CLAVE_ACCESO_DOCENTE = 'docente123'

def get_db_connection():
    return pymysql.connect(
        host='localhost',
        user='root',
        password='Deluna182809',  # <-- Pon tu contraseña real de MySQL
        database='cecyplanner_db',
        cursorclass=pymysql.cursors.DictCursor
    )

QR_FOLDER = os.path.join(app.root_path, 'static', 'qrs')
os.makedirs(QR_FOLDER, exist_ok=True)

# -------------------------------------------------------------
# RUTAS DE AUTENTICACIÓN
# -------------------------------------------------------------

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        matricula = request.form.get('matricula', '').strip()
        password = request.form.get('password', '').strip()
        
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT * FROM usuarios WHERE matricula = %s AND password = %s", (matricula, password))
                usuario = cursor.fetchone()
                if usuario:
                    session['usuario_id'] = usuario['id']
                    session['nombre'] = usuario['nombre_completo']
                    session['matricula'] = usuario['matricula']
                    session['email'] = usuario.get('email', '')
                    session['carrera'] = usuario['carrera']
                    session['semestre'] = usuario['semestre']
                    session['qr_path'] = usuario.get('qr_path', '')
                    return redirect(url_for('home'))
                else:
                    return render_template('login.html', error='Matrícula o contraseña incorrectas.')
        finally:
            conn.close()
            
    return render_template('login.html')

@app.route('/register', methods=['POST'])
def register():
    nombre_completo = request.form.get('nombre_completo', '').strip()
    matricula = request.form.get('matricula', '').strip()
    email = request.form.get('email', '').strip().lower()
    carrera = request.form.get('carrera')
    semestre = request.form.get('semestre')
    password = request.form.get('password', '').strip()

    if not (email.endswith('@soycecytem.mx') or email.endswith('@cecytem.mx')):
        return render_template('login.html', error='Debes registrarte con tu correo institucional (@soycecytem.mx).')

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM usuarios WHERE matricula = %s OR email = %s", (matricula, email))
            if cursor.fetchone():
                return render_template('login.html', error='La matrícula o el correo ya existen.')
            
            cursor.execute(
                """INSERT INTO usuarios (matricula, email, password, nombre_completo, carrera, semestre) 
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (matricula, email, password, nombre_completo, carrera, semestre)
            )
            conn.commit()
            nuevo_id = cursor.lastrowid
            
            session['usuario_id'] = nuevo_id
            session['nombre'] = nombre_completo
            session['matricula'] = matricula
            session['email'] = email
            session['carrera'] = carrera
            session['semestre'] = semestre
            session['qr_path'] = ''
            return redirect(url_for('home'))
    finally:
        conn.close()

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/')
def home():
    if 'usuario_id' not in session:
        return redirect(url_for('login'))
    
    # Sincronizar ruta del QR en sesión desde la base de datos
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT qr_path FROM usuarios WHERE id = %s", (session['usuario_id'],))
            u = cursor.fetchone()
            if u:
                session['qr_path'] = u.get('qr_path', '')
    finally:
        conn.close()

    # Aseguramos que el ID esté disponible en el objeto session/usuario
    return render_template('index.html', usuario=session)

# -------------------------------------------------------------
# ABCM / CRUD: AGENDA DE TAREAS (API REST / MYSQL)
# -------------------------------------------------------------

@app.route('/api/tareas', methods=['GET'])
def consultar_tareas():
    if 'usuario_id' not in session:
        return jsonify([]), 401
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM tareas WHERE usuario_id = %s ORDER BY dueDate ASC, dueTime ASC", (session['usuario_id'],))
            tareas = cursor.fetchall()
            for t in tareas:
                t['dueDate'] = str(t['dueDate'])
                t['dueTime'] = str(t['dueTime'])
        return jsonify(tareas)
    finally:
        conn.close()

@app.route('/api/tareas', methods=['POST'])
def alta_tarea():
    if 'usuario_id' not in session:
        return jsonify({'error': 'No autorizado'}), 401
    
    data = request.json
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """INSERT INTO tareas (usuario_id, subject, title, `desc`, dueDate, dueTime, priority, status)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (session['usuario_id'], data['subject'], data['title'], data.get('desc', ''), 
                 data['dueDate'], data['dueTime'], data['priority'], data['status'])
            )
            conn.commit()
            return jsonify({'success': True, 'id': cursor.lastrowid})
    finally:
        conn.close()

@app.route('/api/tareas/<int:tarea_id>', methods=['PUT'])
def cambio_tarea(tarea_id):
    if 'usuario_id' not in session:
        return jsonify({'error': 'No autorizado'}), 401

    data = request.json
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """UPDATE tareas 
                   SET subject=%s, title=%s, `desc`=%s, dueDate=%s, dueTime=%s, priority=%s, status=%s
                   WHERE id=%s AND usuario_id=%s""",
                (data['subject'], data['title'], data.get('desc', ''), data['dueDate'], 
                 data['dueTime'], data['priority'], data['status'], tarea_id, session['usuario_id'])
            )
            conn.commit()
            return jsonify({'success': True})
    finally:
        conn.close()

@app.route('/api/tareas/<int:tarea_id>', methods=['DELETE'])
def baja_tarea(tarea_id):
    if 'usuario_id' not in session:
        return jsonify({'error': 'No autorizado'}), 401

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM tareas WHERE id=%s AND usuario_id=%s", (tarea_id, session['usuario_id']))
            conn.commit()
            return jsonify({'success': True})
    finally:
        conn.close()

# -------------------------------------------------------------
# ABCM / CRUD: REPORTES INSTITUCIONALES DEL DOCENTE
# -------------------------------------------------------------

@app.route('/generar-qr/<int:usuario_id>')
def generar_qr_alumno(usuario_id):
    if 'usuario_id' not in session:
        return redirect(url_for('login'))

    url_perfil = f"http://127.0.0.1:5000/maestro/perfil/{usuario_id}"
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(url_perfil)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="#00563B", back_color="white")
    qr_filename = f"qr_alumno_{usuario_id}.png"
    file_path = os.path.join(QR_FOLDER, qr_filename)
    img.save(file_path)
    
    relative_path = f"qrs/{qr_filename}"
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE usuarios SET qr_path = %s WHERE id = %s", (relative_path, usuario_id))
            conn.commit()
            session['qr_path'] = relative_path
    finally:
        conn.close()

    return redirect(url_for('home'))

@app.route('/api/reportes/<int:usuario_id>')
def consultar_reportes_api(usuario_id):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM reportes_alumno WHERE usuario_id = %s ORDER BY fecha_registro DESC", (usuario_id,))
            reportes = cursor.fetchall()
            for r in reportes:
                if 'fecha_registro' in r and r['fecha_registro']:
                    r['fecha_registro'] = r['fecha_registro'].strftime('%d/%m/%Y %H:%M')
        return jsonify(reportes)
    finally:
        conn.close()

@app.route('/maestro/perfil/<int:usuario_id>', methods=['GET', 'POST'])
def perfil_maestro(usuario_id):
    conn = get_db_connection()
    error_msj = None
    
    try:
        with conn.cursor() as cursor:
            if request.method == 'POST':
                # Desbloquear Portal
                if 'verificar_password' in request.form:
                    clave = request.form.get('clave_docente', '').strip()
                    if clave == CLAVE_ACCESO_DOCENTE:
                        session['docente_autenticado'] = True
                        return redirect(url_for('perfil_maestro', usuario_id=usuario_id))
                    else:
                        error_msj = "Contraseña de acceso docente incorrecta."
                
                # ALTA DE REPORTE
                elif 'guardar_reporte' in request.form and session.get('docente_autenticado'):
                    maestro = request.form.get('maestro_nombre', '').strip()
                    materia = request.form.get('materia', '').strip()
                    comentario = request.form.get('comentario', '').strip()
                    
                    cursor.execute(
                        "INSERT INTO reportes_alumno (usuario_id, maestro_nombre, materia, comentario) VALUES (%s, %s, %s, %s)",
                        (usuario_id, maestro, materia, comentario)
                    )
                    conn.commit()
                    return redirect(url_for('perfil_maestro', usuario_id=usuario_id))

                # CAMBIO / EDICIÓN DE REPORTE
                elif 'editar_reporte' in request.form and session.get('docente_autenticado'):
                    reporte_id = request.form.get('reporte_id')
                    maestro = request.form.get('maestro_nombre', '').strip()
                    materia = request.form.get('materia', '').strip()
                    comentario = request.form.get('comentario', '').strip()
                    
                    cursor.execute(
                        "UPDATE reportes_alumno SET maestro_nombre = %s, materia = %s, comentario = %s WHERE id = %s AND usuario_id = %s",
                        (maestro, materia, comentario, reporte_id, usuario_id)
                    )
                    conn.commit()
                    return redirect(url_for('perfil_maestro', usuario_id=usuario_id))

                # BAJA / ELIMINACIÓN DE REPORTE
                elif 'eliminar_reporte' in request.form and session.get('docente_autenticado'):
                    reporte_id = request.form.get('reporte_id')
                    cursor.execute("DELETE FROM reportes_alumno WHERE id = %s AND usuario_id = %s", (reporte_id, usuario_id))
                    conn.commit()
                    return redirect(url_for('perfil_maestro', usuario_id=usuario_id))

            cursor.execute("SELECT * FROM usuarios WHERE id = %s", (usuario_id,))
            alumno = cursor.fetchone()
            
            cursor.execute("SELECT * FROM reportes_alumno WHERE usuario_id = %s ORDER BY fecha_registro DESC", (usuario_id,))
            reportes = cursor.fetchall()
    finally:
        conn.close()
        
    nombre_alumno = alumno['nombre_completo'] if alumno else "Estudiante CECYTEM"

    # PANTALLA 1: BLOQUEO POR CONTRASEÑA
    if not session.get('docente_autenticado'):
        alert = f'<div style="background:#fee2e2; color:#991b1b; padding:10px; border-radius:8px; font-size:12px; font-weight:bold; margin-bottom:12px;">{error_msj}</div>' if error_msj else ''
        return f"""
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Acceso Docente - CecyPlanner</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        </head>
        <body class="bg-slate-50 min-h-screen flex items-center justify-center p-4">
            <div class="max-w-md w-full bg-white rounded-2xl shadow-xl p-6 space-y-6 border border-slate-200">
                <div class="text-center border-b pb-4">
                    <div class="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-xl flex items-center justify-center font-bold text-xl mx-auto mb-2">
                        <i class="fa-solid fa-lock"></i>
                    </div>
                    <span class="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-md uppercase tracking-wider">Módulo Exclusivo Docente</span>
                    <h2 class="text-lg font-bold text-slate-800 mt-2">Acceso Restringido</h2>
                    <p class="text-xs text-slate-500 mt-1">Alumno: <b>{nombre_alumno}</b></p>
                </div>
                {alert}
                <form method="POST" class="space-y-4">
                    <input type="hidden" name="verificar_password" value="1">
                    <div>
                        <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Contraseña General Docente *</label>
                        <input type="password" name="clave_docente" required placeholder="••••••••" class="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-600 bg-slate-50">
                    </div>
                    <button type="submit" class="w-full bg-[#00563B] text-white font-semibold py-3 rounded-xl text-sm shadow-md hover:bg-[#003D29] transition-all">
                        Desbloquear Portal
                    </button>
                </form>
            </div>
        </body>
        </html>
        """

    # PANTALLA 2: PANEL DOCENTE CON OPCIÓN DE EDITAR Y ELIMINAR
    reportes_html = ""
    for r in reportes:
        fecha_str = r['fecha_registro'].strftime('%d/%m/%Y %H:%M') if r['fecha_registro'] else ''
        reportes_html += f"""
        <div style="background: white; border: 1px solid #e2e8f0; padding: 14px; border-radius: 12px; margin-bottom: 12px; font-size: 13px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; font-weight: bold; color: #1e293b; margin-bottom: 6px;">
                <span>{r['maestro_nombre']} ({r['materia']})</span>
                <span style="font-size: 11px; color: #64748b;">{fecha_str}</span>
            </div>
            <p style="color: #475569; margin-bottom: 10px;">{r['comentario']}</p>
            
            <!-- FORMULARIO OCULTO DE EDICIÓN -->
            <div id="edit-form-{r['id']}" style="display: none; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #cbd5e1; margin-bottom: 10px;">
                <form method="POST">
                    <input type="hidden" name="editar_reporte" value="1">
                    <input type="hidden" name="reporte_id" value="{r['id']}">
                    <div style="margin-bottom: 8px;">
                        <label style="font-size: 10px; font-weight: bold; color: #334155; display: block; margin-bottom: 2px;">Nombre del Docente</label>
                        <input type="text" name="maestro_nombre" value="{r['maestro_nombre']}" required style="width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px; font-size: 12px;">
                    </div>
                    <div style="margin-bottom: 8px;">
                        <label style="font-size: 10px; font-weight: bold; color: #334155; display: block; margin-bottom: 2px;">Asignatura</label>
                        <input type="text" name="materia" value="{r['materia']}" required style="width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px; font-size: 12px;">
                    </div>
                    <div style="margin-bottom: 8px;">
                        <label style="font-size: 10px; font-weight: bold; color: #334155; display: block; margin-bottom: 2px;">Descripción / Comentario</label>
                        <textarea name="comentario" rows="2" required style="width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px; font-size: 12px;">{r['comentario']}</textarea>
                    </div>
                    <div style="display: flex; gap: 6px; justify-content: flex-end;">
                        <button type="button" onclick="toggleEdit('{r['id']}')" style="background: #e2e8f0; color: #334155; border: none; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">Cancelar</button>
                        <button type="submit" style="background: #00563B; color: white; border: none; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">Guardar Cambios</button>
                    </div>
                </form>
            </div>

            <!-- BOTONES DE ACCIÓN (CAMBIO Y BAJA) -->
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button type="button" onclick="toggleEdit('{r['id']}')" style="background: #e0f2fe; color: #0369a1; border: none; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">
                    Editar
                </button>
                <form method="POST" style="display:inline;">
                    <input type="hidden" name="eliminar_reporte" value="1">
                    <input type="hidden" name="reporte_id" value="{r['id']}">
                    <button type="submit" onclick="return confirm('¿Seguro que deseas eliminar este reporte?')" style="background: #fee2e2; color: #991b1b; border: none; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">
                        Eliminar
                    </button>
                </form>
            </div>
        </div>
        """
    if not reportes_html:
        reportes_html = "<p style='color: #64748b; font-size: 13px;'>No hay reportes registrados en este expediente.</p>"

    return f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Portal Docente - CecyPlanner</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
            function toggleEdit(id) {{
                const form = document.getElementById('edit-form-' + id);
                if (form.style.display === 'none') {{
                    form.style.display = 'block';
                }} else {{
                    form.style.display = 'none';
                }}
            }}
        </script>
    </head>
    <body class="bg-slate-50 p-4 sm:p-8">
        <div class="max-w-xl mx-auto bg-white rounded-2xl shadow-md p-6 space-y-6 border border-slate-200">
            <div class="border-b pb-4 flex justify-between items-start">
                <div>
                    <span class="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-md">Panel Exclusivo Docente</span>
                    <h2 class="text-xl font-bold text-slate-800 mt-2">Seguimiento Académico</h2>
                    <p class="text-xs text-slate-500">Alumno: <b>{nombre_alumno}</b> (ID: {usuario_id}). Registra un reporte institucional:</p>
                </div>
                <a href="/maestro/logout-docente/{usuario_id}" class="text-xs text-rose-600 hover:underline font-semibold bg-rose-50 px-2.5 py-1.5 rounded-lg border border-rose-100">Bloquear Portal</a>
            </div>

            <!-- FORMULARIO DE ALTA -->
            <form method="POST" class="space-y-4">
                <input type="hidden" name="guardar_reporte" value="1">
                <div>
                    <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Nombre del Docente *</label>
                    <input type="text" name="maestro_nombre" required placeholder="Ej. Ing. Juan Pérez" class="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-600">
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Asignatura *</label>
                    <input type="text" name="materia" required placeholder="Ej. Programación" class="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-600">
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Descripción del Reporte / Nota *</label>
                    <textarea name="comentario" rows="3" required placeholder="Escribe la observación institucional..." class="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-600"></textarea>
                </div>
                <button type="submit" class="w-full bg-[#00563B] text-white font-semibold py-2.5 rounded-xl text-sm shadow-md hover:bg-[#003D29] transition-all">
                    Guardar Reporte en Base de Datos
                </button>
            </form>

            <div class="border-t pt-4">
                <h3 class="text-sm font-bold text-slate-800 mb-3">Historial de Reportes Registrados (ABCM Active)</h3>
                <div class="space-y-2 max-h-96 overflow-y-auto">
                    {reportes_html}
                </div>
            </div>
        </div>
    </body>
    </html>
    """

@app.route('/maestro/logout-docente/<int:usuario_id>')
def logout_docente(usuario_id):
    session.pop('docente_autenticado', None)
    return redirect(url_for('perfil_maestro', usuario_id=usuario_id))

if __name__ == '__main__':
    app.run(debug=True)