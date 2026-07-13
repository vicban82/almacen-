// Asegúrate de usar la misma URL de tu API
const API_URL = "https://script.google.com/macros/s/AKfycbwGEpRyHBEVdx78f7QbOLyZwsfBXitG32UaGNrq-AEhNYRbetdl_4slB67AJTFssVriig/exec";

// ==========================================================================
// NUEVO: CONTROLADOR DE MODAL DE ALERTA PERSONALIZADO
// ==========================================================================
let resolverAlerta;

function mostrarAlerta(mensaje, titulo = "Aviso del Sistema") {
  document.getElementById("alerta-titulo-ui").innerText = titulo;
  document.getElementById("alerta-mensaje-ui").innerText = mensaje;
  document.getElementById("modal-alerta").style.display = "flex";

  return new Promise((resolve) => {
    resolverAlerta = resolve;
  });
}

function cerrarModalAlerta() {
  document.getElementById("modal-alerta").style.display = "none";
  if (resolverAlerta) {
    resolverAlerta();
    resolverAlerta = null;
  }
}

// ==========================================
// MÓDULO OFFLINE Y SINCRONIZACIÓN
// ==========================================
let offlineQueue = JSON.parse(localStorage.getItem("cola_acciones_tpv")) || [];

window.addEventListener("online", () => {
  document.getElementById("offline-badge").style.display = "none";
  sincronizarColaOffline();
});

window.addEventListener("offline", () => {
  document.getElementById("offline-badge").style.display = "block";
});

if (!navigator.onLine) {
  document.getElementById("offline-badge").style.display = "block";
}

let catalogoLocal = [];
let instanciaActual = "Almacen";

function mostrarLoading(mensaje = "Procesando...") {
  document.getElementById("loading-text").innerText = mensaje;
  document.getElementById("loading-overlay").style.display = "flex";
}

function ocultarLoading() {
  document.getElementById("loading-overlay").style.display = "none";
}

async function iniciarSesion() {
  const clave = document.getElementById("clave-input").value;
  if (!clave) return mostrarAlerta("Ingrese una clave", "Atención");

  mostrarLoading("Verificando acceso...");

  if (!navigator.onLine) {
    const claveGuardada = localStorage.getItem("clave_almacen_cache");

    if (claveGuardada && clave === claveGuardada) {
      document.getElementById("login-screen").classList.remove("active");
      document.getElementById("almacen-screen").classList.add("active");
      await cargarCatalogo();
      ocultarLoading();
      return;
    } else {
      ocultarLoading();
      return mostrarAlerta(
        "Modo sin conexión: Clave incorrecta o necesita iniciar sesión con internet al menos una vez.", 
        "Error de Acceso"
      );
    }
  }

  try {
    const payload = { action: "iniciar_sesion", payload: { clave: clave } };
    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (data.success && data.data.instancia === "Almacen") {
      localStorage.setItem("clave_almacen_cache", clave);
      document.getElementById("login-screen").classList.remove("active");
      document.getElementById("almacen-screen").classList.add("active");
      await cargarCatalogo();

      chequearNotificacionesSilencioso();
      setInterval(chequearNotificacionesSilencioso, 60000);
    } else {
      mostrarAlerta(data.data.error || "Clave incorrecta o no tiene permisos de Almacén.", "Error");
    }
  } catch (error) {
    mostrarAlerta("Error de conexión con el servidor.", "Error de Red");
  } finally {
    ocultarLoading();
  }
}

function cerrarSesion() {
  document.getElementById("almacen-screen").classList.remove("active");
  document.getElementById("login-screen").classList.add("active");
  document.getElementById("clave-input").value = "";
}

// ==========================================
// MÓDULO DE CATÁLOGO Y TRANSFERENCIAS
// ==========================================
async function cargarCatalogo() {
  mostrarLoading("Cargando inventario del almacén...");
  try {
    if (!navigator.onLine) throw new Error("Offline");

    const payload = {
      action: "obtener_catalogo",
      payload: { instancia: instanciaActual },
    };
    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (data.success) {
      catalogoLocal = data.data;
      localStorage.setItem("catalogo_cache", JSON.stringify(catalogoLocal));
      renderizarCatalogo();
      actualizarSelectTransferencias();
    } else {
      mostrarAlerta("Error al cargar inventario: " + data.data.error, "Error");
    }
  } catch (error) {
    console.warn("Recurriendo al caché local del catálogo...");
    const cache = localStorage.getItem("catalogo_cache");
    if (cache) {
      catalogoLocal = JSON.parse(cache);
      renderizarCatalogo();
      actualizarSelectTransferencias();
    } else {
      mostrarAlerta("No hay internet y no hay datos guardados localmente.", "Modo Offline");
    }
  } finally {
    ocultarLoading();
  }
}

function renderizarCatalogo() {
  const contenedor = document.getElementById("catalogo-container");
  contenedor.innerHTML = "";

  catalogoLocal.forEach((prod) => {
    const minAlerta = Number(prod.stock_minimo) || 0;
    const stockActual = Number(prod.existencia) || 0;
    
    const item = document.createElement("div");
    item.className = "inventario-item";
    item.innerHTML = `
            <div>
                <strong>${prod.nombre}</strong> <small>(${prod.id})</small><br>
                <span class="stock-badge ${
                  (minAlerta > 0 && stockActual <= minAlerta) ? "bajo-stock" : ""
                }">Stock: ${stockActual}</span>
            </div>
            <div class="precios" style="text-align: right;">
                Costo: $${prod.inversion} | Venta: $${prod.precio}<br>
                <button class="btn-edit" onclick="abrirModalEdicion('${prod.id}')">✏️ Editar</button>
            </div>
        `;
    contenedor.appendChild(item);
  });
}


function actualizarSelectTransferencias() {
    const select = document.getElementById("trans-producto");
    const selectMerma = document.getElementById("merma-producto"); 
    const selectProv = document.getElementById("prov-producto"); 
  
    if (select) select.innerHTML = '<option value="">Seleccione un producto...</option>';
    if (selectMerma) selectMerma.innerHTML = '<option value="">Seleccione un producto...</option>';
    if (selectProv) selectProv.innerHTML = '<option value="">Seleccione un producto...</option>'; 
  
    catalogoLocal.forEach((p) => {
      const opcionBase = `<option value="${p.nombre}">${p.nombre}</option>`;
  
      if (p.existencia > 0) {
          if (select) select.innerHTML += opcionBase;
          if (selectMerma) selectMerma.innerHTML += opcionBase;
      }
      
      if (selectProv) {
          selectProv.innerHTML += opcionBase;
      }
    });
  }
  
function filtrarCatalogo() {
  const texto = document.getElementById("buscar-producto").value.toLowerCase();
  const items = document.querySelectorAll(".inventario-item");
  items.forEach((item) => {
    const nombre = item.querySelector("strong").innerText.toLowerCase();
    item.style.display = nombre.includes(texto) ? "flex" : "none";
  });
}

// ==========================================
// MÓDULO DE TRANSFERENCIA A TPV
// ==========================================
async function ejecutarTransferencia() {
  const producto = document.getElementById("trans-producto").value;
  const cantidad = parseInt(document.getElementById("trans-cantidad").value);
  const destino = document.getElementById("trans-destino").value;

  if (!producto) return mostrarAlerta("Seleccione un producto", "Atención");
  if (!cantidad || cantidad <= 0) return mostrarAlerta("Ingrese una cantidad válida", "Atención");

  const payload = {
    action: "crear_movimiento",
    payload: { origen: instanciaActual, destino, producto, cantidad },
  };

  if (!navigator.onLine) {
    encolarAccionLocal(payload);
    const prodIndex = catalogoLocal.findIndex((p) => p.nombre === producto);
    if (prodIndex > -1) catalogoLocal[prodIndex].existencia -= cantidad;
    localStorage.setItem("catalogo_cache", JSON.stringify(catalogoLocal));

    renderizarCatalogo();
    mostrarAlerta("Sin conexión. La transferencia se guardó localmente y se enviará al recuperar la red.", "Modo Offline");
    document.getElementById("trans-cantidad").value = "";
    return;
  }

  mostrarLoading("Transfiriendo producto...");
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (data.success) {
      mostrarAlerta(data.data.mensaje, "Éxito");
      document.getElementById("trans-cantidad").value = "";
      await cargarCatalogo();
    } else {
      mostrarAlerta("Error: " + data.data.error, "Error");
    }
  } catch (error) {
    mostrarAlerta("Error de red. Verifique su conexión.", "Error de Red");
  } finally {
    ocultarLoading();
  }
}

async function ejecutarMerma() {
  const producto = document.getElementById("merma-producto").value;
  const cantidad = parseInt(document.getElementById("merma-cantidad").value);
  const motivo = document.getElementById("merma-motivo").value.trim();

  if (!producto) return mostrarAlerta("Seleccione un producto para la baja.", "Atención");
  if (!cantidad || cantidad <= 0) return mostrarAlerta("Ingrese una cantidad válida a descontar.", "Atención");

  const payload = {
    action: "registrar_merma",
    payload: { instancia: instanciaActual, producto, cantidad, motivo },
  };

  if (!navigator.onLine) {
    encolarAccionLocal(payload);
    const prodIndex = catalogoLocal.findIndex((p) => p.nombre === producto);
    if (prodIndex > -1) catalogoLocal[prodIndex].existencia -= cantidad;
    localStorage.setItem("catalogo_cache", JSON.stringify(catalogoLocal));

    renderizarCatalogo();
    mostrarAlerta("Sin conexión. La merma se guardó localmente y se descontará en el servidor al recuperar la red.", "Modo Offline");
    document.getElementById("merma-cantidad").value = "";
    document.getElementById("merma-motivo").value = "";
    return;
  }

  mostrarLoading("Registrando merma en la base de datos...");
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (data.success) {
      mostrarAlerta(data.data.mensaje, "Éxito");
      document.getElementById("merma-cantidad").value = "";
      document.getElementById("merma-motivo").value = "";
      await cargarCatalogo();
    } else {
      mostrarAlerta("Error: " + data.data.error, "Error");
    }
  } catch (error) {
    mostrarAlerta("Error de red. Verifique su conexión.", "Error de Red");
  } finally {
    ocultarLoading();
  }
}

// ==========================================
// MÓDULO DE CREACIÓN DE PRODUCTOS
// ==========================================
async function crearProducto() {
  const id = document.getElementById("prod-id").value.trim();
  const nombre = document.getElementById("prod-nombre").value.trim();
  const division = document.getElementById("prod-division").value.trim();
  const inversion = parseFloat(document.getElementById("prod-inversion").value);
  const precio = parseFloat(document.getElementById("prod-precio").value);
  const stock = parseInt(document.getElementById("prod-stock").value) || 0;
  const stockMinimo = parseInt(document.getElementById("prod-stock-minimo").value) || 0;

  if (!id || !nombre || isNaN(inversion) || isNaN(precio)) {
    return mostrarAlerta("Por favor complete todos los campos obligatorios correctamente.", "Atención");
  }

  const payload = {
    action: "crear_producto",
    payload: { id, nombre, division, inversion, precio, stock_inicial: stock, stock_minimo: stockMinimo },
  };

  if (!navigator.onLine) {
    encolarAccionLocal(payload);

    const nuevoProducto = {
      id: id, nombre: nombre, division: division, inversion: inversion,
      precio: precio, existencia: stock, stock_minimo: stockMinimo,
    };

    catalogoLocal.push(nuevoProducto);
    localStorage.setItem("catalogo_cache", JSON.stringify(catalogoLocal));

    renderizarCatalogo();
    actualizarSelectTransferencias();

    mostrarAlerta("Sin conexión. El producto se guardó localmente y se subirá al servidor al recuperar la red.", "Modo Offline");

    document.getElementById("prod-id").value = "";
    document.getElementById("prod-nombre").value = "";
    document.getElementById("prod-division").value = "";
    document.getElementById("prod-inversion").value = "";
    document.getElementById("prod-precio").value = "";
    document.getElementById("prod-stock").value = "";

    return;
  }

  mostrarLoading("Creando producto en Base de Datos...");
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (data.success) {
      mostrarAlerta(data.data.mensaje, "Éxito");
      document.getElementById("prod-id").value = "";
      document.getElementById("prod-nombre").value = "";
      document.getElementById("prod-division").value = "";
      document.getElementById("prod-inversion").value = "";
      document.getElementById("prod-precio").value = "";
      document.getElementById("prod-stock").value = "";
      await cargarCatalogo(); 
    } else {
      mostrarAlerta("Error: " + data.data.error, "Error");
    }
  } catch (error) {
    mostrarAlerta("Error de conexión al crear el producto.", "Error de Red");
  } finally {
    ocultarLoading();
  }
}

function abrirModalEdicion(id) {
  const prod = catalogoLocal.find(p => p.id === id);
  if (!prod) return mostrarAlerta("Producto no encontrado.", "Error");

  document.getElementById("edit-prod-id").value = prod.id;
  document.getElementById("edit-prod-nombre").innerText = prod.nombre;
  document.getElementById("edit-prod-inversion").value = prod.inversion;
  document.getElementById("edit-prod-precio").value = prod.precio;
  document.getElementById("edit-prod-stock-minimo").value = prod.stock_minimo || 0;

  document.getElementById("modal-edicion").style.display = "flex";
}

function cerrarModalEdicion() {
  document.getElementById("modal-edicion").style.display = "none";
}

async function guardarEdicionProducto() {
  const id = document.getElementById("edit-prod-id").value;
  const inversion = parseFloat(document.getElementById("edit-prod-inversion").value);
  const precio = parseFloat(document.getElementById("edit-prod-precio").value);
  const stockMinimo = parseInt(document.getElementById("edit-prod-stock-minimo").value) || 0;

  if (isNaN(inversion) || isNaN(precio) || isNaN(stockMinimo)) {
    return mostrarAlerta("Por favor, ingrese valores numéricos válidos.", "Atención");
  }

  mostrarLoading("Actualizando producto en Base de Datos...");
  try {
    const payload = {
      action: "actualizar_precio_producto",
      payload: { id_producto: id, nueva_inversion: inversion, nuevo_precio: precio, nuevo_stock_minimo: stockMinimo },
    };
    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (data.success) {
      mostrarAlerta(data.data.mensaje, "Éxito");
      cerrarModalEdicion();
      await cargarCatalogo(); 
    } else {
      mostrarAlerta("Error: " + data.data.error, "Error");
    }
  } catch (error) {
    mostrarAlerta("Error de conexión al actualizar el precio.", "Error de Red");
  } finally {
    ocultarLoading();
  }
}

// ==========================================
// MÓDULO DE NOTIFICACIONES Y APROBACIÓN
// ==========================================
let notificacionesPendientes = [];
let alertasStockPendientes = [];
let alertasTPVPendientes = []; 

async function chequearNotificacionesSilencioso() {
  try {
    const payload = {
      action: "revisar_notificaciones",
      payload: { instancia: instanciaActual },
    };
    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (data.success) {
      notificacionesPendientes = data.data.transferencias || [];
      alertasTPVPendientes = data.data.alertasStockTPV || [];
      
      alertasStockPendientes = catalogoLocal.filter((prod) => {
        const min = Number(prod.stock_minimo) || 0;
        const actual = Number(prod.existencia) || 0;
        return min > 0 && actual <= min;
      });


      const btnNotificaciones = document.getElementById("btn-notificaciones");
      const badge = document.getElementById("badge-notificaciones");
      const totalAvisos = notificacionesPendientes.length + alertasStockPendientes.length + alertasTPVPendientes.length;

      if (totalAvisos > 0) {
        btnNotificaciones.style.display = "inline-block";
        btnNotificaciones.classList.add("boton-alerta");
        badge.innerText = totalAvisos;
      } else {
        btnNotificaciones.style.display = "none";
        btnNotificaciones.classList.remove("boton-alerta");
      }
    }
  } catch (error) {
    console.warn("Fallo silencioso al chequear notificaciones.");
  }
}

function abrirModalNotificaciones() {
  const contenedor = document.getElementById("lista-notificaciones");
  contenedor.innerHTML = "";

  const totalAvisos = notificacionesPendientes.length + alertasStockPendientes.length + alertasTPVPendientes.length;

  if (totalAvisos === 0) {
    contenedor.innerHTML = "<p>No hay avisos ni transferencias pendientes.</p>";
  } else {
    // 1. Renderizar Transferencias Pendientes
    notificacionesPendientes.forEach(notif => {
      const div = document.createElement('div');
      div.className = 'notificacion-item alerta-transferencia'; 
      div.innerHTML = `
          <div class="alerta-texto"><strong>Origen:</strong> ${notif.origen}</div>
          <div class="alerta-texto"><strong>Producto:</strong> ${notif.producto}</div>
          <div class="alerta-texto">
              <strong>Cantidad recibida:</strong> <span class="stock-badge">${notif.cantidad}</span>
          </div>
          <input type="password" id="firma-${notif.idFila}" class="firma-input" placeholder="Firma digital para aceptar">
          <button onclick="aprobarTransferencia(${notif.idFila})" class="btn-success btn-sm">Aprobar Recepción</button>
      `;
      contenedor.appendChild(div);
    });

    // 2. Renderizar Alertas Locales del Almacén
    alertasStockPendientes.forEach((prod) => {
      const div = document.createElement("div");
      div.className = "notificacion-item alerta-critica";
      
      const minAlerta = Number(prod.stock_minimo) || 0;
      const stockActual = Number(prod.existencia) || 0;
      
      let cantidadSugerida = (minAlerta * 2) - stockActual;
      if (cantidadSugerida <= 0) cantidadSugerida = minAlerta; 

      div.innerHTML = `
        <div class="alerta-titulo">⚠️ Stock Crítico Detectado</div>
        <div class="alerta-texto"><strong>Producto:</strong> ${prod.nombre}</div>
        <div class="alerta-texto">
            <strong>Stock Actual en Almacén:</strong> 
            <span class="stock-badge bajo-stock">${stockActual}</span> 
            <span class="alerta-nota">(Mínimo requerido: ${minAlerta})</span>
        </div>
        
        <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #ecc; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <label style="font-size: 0.85rem; font-weight: bold; color: #555;">Enviar a: </label>
            <select id="surtido-destino-${prod.id}" style="padding: 6px; border-radius: 4px; border: 1px solid #ccc; font-size: 0.85rem;">
                <option value="TPV_1">TPV_1</option>
                <option value="TPV_2">TPV_2</option>
            </select>
            <button onclick="procesarSurtidoAutomatico('${prod.nombre}', ${cantidadSugerida}, '${prod.id}')" 
                    class="btn-warning btn-sm" style="background-color: var(--warning-color); color: black; font-size: 0.85rem;">
                ⚡ Generar Transferencia (${cantidadSugerida} Unds)
            </button>
        </div>
      `;
      contenedor.appendChild(div);
    });

    // 3. NUEVO: Renderizar Alertas Críticas de los TPV
    alertasTPVPendientes.forEach((alerta) => {
      const div = document.createElement("div");
      div.className = "notificacion-item alerta-critica";
      
      // Cálculo sugerido para el reabastecimiento
      let cantidadSugerida = (alerta.minimo * 2) - alerta.stock;
      if (cantidadSugerida <= 0) cantidadSugerida = alerta.minimo || 5; 

      // Generar un ID limpio sin espacios para el DOM
      const idLimpio = alerta.producto.replace(/\s/g, '');

      div.innerHTML = `
        <div class="alerta-titulo">🚨 Urgente: Stock Crítico en ${alerta.tpv}</div>
        <div class="alerta-texto"><strong>Producto:</strong> ${alerta.producto}</div>
        <div class="alerta-texto">
            <strong>Stock Actual en ${alerta.tpv}:</strong> 
            <span class="stock-badge bajo-stock">${alerta.stock}</span> 
            <span class="alerta-nota">(Mínimo requerido: ${alerta.minimo})</span>
        </div>
        
        <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #ecc; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <button onclick="procesarSurtidoAutomatico('${alerta.producto}', ${cantidadSugerida}, '${idLimpio}', '${alerta.tpv}')" 
                    class="btn-warning btn-sm" style="background-color: var(--warning-color); color: black; font-size: 0.85rem; width: 100%;">
                ⚡ Surtir inmediatamente a ${alerta.tpv} (${cantidadSugerida} Unds)
            </button>
        </div>
      `;
      contenedor.appendChild(div);
    });
  }

  document.getElementById("modal-notificaciones").style.display = "flex";
}

  
function cerrarModalNotificaciones() {
  document.getElementById("modal-notificaciones").style.display = "none";
}

async function aprobarTransferencia(idFila) {
  const firmaRaw = document.getElementById(`firma-${idFila}`).value.trim();
  if (!firmaRaw) return mostrarAlerta("Debe ingresar su firma digital.", "Atención");

  const firmaB64 = btoa(firmaRaw);
  mostrarLoading("Aprobando transferencia...");
  
  try {
    const payload = {
      action: "aprobar_movimiento",
      payload: { idFila: idFila, instancia: instanciaActual, firma: firmaB64 },
    };

    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (data.success) {
      mostrarAlerta(data.data.mensaje, "Éxito");
      cerrarModalNotificaciones();
      await chequearNotificacionesSilencioso(); 
      await cargarCatalogo(); 
    } else {
      mostrarAlerta("Error: " + data.data.error, "Error");
    }
  } catch (error) {
    mostrarAlerta("Error al procesar la aprobación.", "Error del Sistema");
  } finally {
    ocultarLoading();
  }
}

// ==========================================
// MÓDULO DASHBOARD
// ==========================================
function cerrarDashboard() {
  document.getElementById("dashboard-screen").classList.remove("active");
  document.getElementById("almacen-screen").classList.add("active");
}

function abrirDashboard() {
  document.getElementById("almacen-screen").classList.remove("active");
  document.getElementById("dashboard-screen").classList.add("active");

  const hoy = new Date().toISOString().split("T")[0];
  if (!document.getElementById("dash-fecha-inicio").value)
    document.getElementById("dash-fecha-inicio").value = hoy;
  if (!document.getElementById("dash-fecha-fin").value)
    document.getElementById("dash-fecha-fin").value = hoy;

  const selectProd = document.getElementById("dash-producto");
  selectProd.innerHTML = '<option value="">Todos los Productos</option>';
  catalogoLocal.forEach((p) => {
    selectProd.innerHTML += `<option value="${p.nombre}">${p.nombre}</option>`;
  });

  cargarDatosDashboard();
}

async function cargarDatosDashboard() {
  mostrarLoading("Generando métricas globales...");

  const fechaInicio = document.getElementById("dash-fecha-inicio").value;
  const fechaFin = document.getElementById("dash-fecha-fin").value;
  const tpvFiltro = document.getElementById("dash-tpv").value;
  const productoFiltro = document.getElementById("dash-producto").value;

  try {
    const payload = {
      action: "obtener_datos_dashboard",
      payload: { fechaInicio, fechaFin, tpvFiltro, productoFiltro },
    };
    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (data.success) {
      renderizarDashboard(data.data);
    } else {
      mostrarAlerta("Error al cargar dashboard: " + data.data.error, "Error");
    }
  } catch (error) {
    mostrarAlerta("Error de red al obtener métricas.", "Error de Red");
  } finally {
    ocultarLoading();
  }
}

function renderizarDashboard(datos) {
  document.getElementById("kpi-ventas").innerText = `$${datos.global.ventas.toFixed(2)}`;
  document.getElementById("kpi-ganancia").innerText = `$${datos.global.ganancia.toFixed(2)}`;
  document.getElementById("kpi-stock").innerText = `${datos.global.stock} Unds`;

  if (document.getElementById("kpi-credito")) {
    document.getElementById("kpi-credito").innerText = `$${datos.global.ventasCredito.toFixed(2)}`;
  }
  if (document.getElementById("kpi-deuda")) {
    document.getElementById("kpi-deuda").innerText = `$${datos.global.deudaGlobal.toFixed(2)}`;
  }

  const tbodyTPV = document.getElementById("tbody-eficiencia");
  if (tbodyTPV) {
    tbodyTPV.innerHTML = ""; 
    const desglose = datos.desgloseTPV;

    if (desglose && Object.keys(desglose).length > 0) {
      for (const tpv in desglose) {
        const info = desglose[tpv];
        const horas = info.horas > 0 ? info.horas : 1;
        const eficiencia = info.ganancia / horas;
        const claseEficiencia = eficiencia > 0 ? "eficiencia-alta" : "eficiencia-baja";

        tbodyTPV.innerHTML += `
                       <tr>
                           <td style="padding: 12px; border-bottom: 1px solid #ddd;"><strong>${tpv}</strong></td>
                           <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">${info.stock || 0}</td>
                           <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">${info.horas || 0}</td>
                           <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: right;">$${(info.ventas || 0).toFixed(2)}</td>
                           <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: right; color: var(--success-color); font-weight: bold;">$${(info.ganancia || 0).toFixed(2)}</td>
                           <td class="${claseEficiencia}" style="padding: 12px; border-bottom: 1px solid #ddd; text-align: right;">$${eficiencia.toFixed(2)}/hr</td>
                       </tr>
                   `;
      }
    } else {
      tbodyTPV.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:15px;">No hay datos de rendimiento para mostrar</td></tr>';
    }
  }

  const tbodyTop3 = document.getElementById("tbody-top3");
  if (tbodyTop3) {
    tbodyTop3.innerHTML = "";
    if (datos.top3 && datos.top3.length > 0) {
      datos.top3.forEach((prod) => {
        tbodyTop3.innerHTML += `
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${prod.nombre}</strong></td>
                        <td style="text-align: center; padding: 8px; border-bottom: 1px solid #eee;">${prod.cantidad}</td>
                        <td style="text-align: right; padding: 8px; border-bottom: 1px solid #eee; color: var(--success-color); font-weight: bold;">$${prod.ventas.toFixed(2)}</td>
                    </tr>
                `;
      });
    } else {
      tbodyTop3.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:10px;">No hay datos de ventas</td></tr>';
    }
  }

  const tbodyBottom3 = document.getElementById("tbody-bottom3");
  if (tbodyBottom3) {
    tbodyBottom3.innerHTML = "";
    if (datos.bottom3 && datos.bottom3.length > 0) {
      datos.bottom3.forEach((prod) => {
        tbodyBottom3.innerHTML += `
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${prod.nombre}</strong></td>
                        <td style="text-align: center; padding: 8px; border-bottom: 1px solid #eee;">${prod.cantidad}</td>
                        <td style="text-align: right; padding: 8px; border-bottom: 1px solid #eee; color: var(--text-color); font-weight: bold;">$${prod.ventas.toFixed(2)}</td>
                    </tr>
                `;
      });
    } else {
      tbodyBottom3.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:10px;">No hay datos de ventas</td></tr>';
    }
  }

 const tbodyProductos = document.getElementById("tbody-productos");
 if (tbodyProductos) {
   tbodyProductos.innerHTML = "";
   const desglose = datos.desgloseProducto;

   if (desglose && Object.keys(desglose).length > 0) {
     for (const nombreProducto in desglose) {
       const info = desglose[nombreProducto];
       tbodyProductos.innerHTML += `
           <tr>
               <td style="padding: 12px; border-bottom: 1px solid #ddd;"><strong>${nombreProducto}</strong></td>
               <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center; color: var(--primary-color); font-weight: bold;">
                   ${info.stock !== undefined ? info.stock : 0}
               </td>
               <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">${info.cantidad}</td>
               <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: right;">$${info.ventas.toFixed(2)}</td>
               <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: right; color: var(--success-color); font-weight: bold;">$${info.ganancia.toFixed(2)}</td>
           </tr>
       `;
     }
   } else {
     tbodyProductos.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px;">No hay datos de ventas para mostrar</td></tr>';
   }
 }
}

// ==========================================================================
// CONTROLADOR DE MODAL DE CONFIRMACIÓN PERSONALIZADO
// ==========================================================================
let resolverConfirmacion;

function mostrarConfirmacion(titulo, mensaje) {
  document.getElementById("confirm-titulo").innerText = titulo;
  document.getElementById("confirm-mensaje").innerText = mensaje;
  document.getElementById("modal-confirmacion").style.display = "flex";

  return new Promise((resolve) => {
    resolverConfirmacion = resolve;
  });
}

function cerrarModalConfirmacion(resultado) {
  document.getElementById("modal-confirmacion").style.display = "none";
  if (resolverConfirmacion) {
    resolverConfirmacion(resultado);
    resolverConfirmacion = null;
  }
}

document.getElementById("btn-confirmar-si").addEventListener("click", () => {
  cerrarModalConfirmacion(true);
});

// ==========================================
// FUNCIONES DE UX PARA EL DASHBOARD
// ==========================================

function setRangoFecha(rango) {
  const hoy = new Date();
  let inicio = new Date();
  let fin = new Date();

  if (rango === "hoy") {
  } else if (rango === "semana") {
    inicio.setDate(hoy.getDate() - 7);
  } else if (rango === "mes") {
    inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  }

  const formatDate = (date) => date.toISOString().split("T")[0];
  document.getElementById("dash-fecha-inicio").value = formatDate(inicio);
  document.getElementById("dash-fecha-fin").value = formatDate(fin);

  cargarDatosDashboard();
}

function validarFechas() {
  const inputInicio = document.getElementById("dash-fecha-inicio");
  const inputFin = document.getElementById("dash-fecha-fin");

  if (inputInicio.value && inputFin.value) {
    if (inputInicio.value > inputFin.value) {
      inputFin.value = inputInicio.value;
      console.warn("La fecha 'Desde' no puede ser mayor que 'Hasta'. Se ha auto-corregido.");
    }
  }
}

function encolarAccionLocal(payloadCompleto) {
  offlineQueue.push(payloadCompleto);
  localStorage.setItem("cola_acciones_tpv", JSON.stringify(offlineQueue));
  console.log("Acción encolada. Total pendientes:", offlineQueue.length);
}

async function sincronizarColaOffline() {
  if (offlineQueue.length === 0) return;
  mostrarLoading(`Sincronizando ${offlineQueue.length} acciones pendientes...`);

  const colaAProcesar = [...offlineQueue];
  let fallos = [];

  for (let i = 0; i < colaAProcesar.length; i++) {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify(colaAProcesar[i]),
      });
      const data = await response.json();

      if (!data.success) {
        console.error("Fallo al procesar elemento de la cola:", data.data.error);
        fallos.push(colaAProcesar[i]);
      }
    } catch (err) {
      console.error("Error de red durante la sincronización", err);
      fallos.push(colaAProcesar[i]);
    }
  }

  offlineQueue = fallos;
  localStorage.setItem("cola_acciones_tpv", JSON.stringify(offlineQueue));
  ocultarLoading();

  if (fallos.length === 0) {
    mostrarAlerta("Sincronización completada con éxito.", "Éxito");
    cargarCatalogo(); 
  } else {
    mostrarAlerta(`Sincronización parcial. Quedaron ${fallos.length} acciones pendientes.`, "Aviso");
  }
}

// ==========================================================================
// PROCESADOR AUTOMÁTICO DE ENVIÓ
// ==========================================================================
async function procesarSurtidoAutomatico(productoNombre, cantidadCalcular, productoId, destinoForzado = null) {
  // Si viene un destino forzado (desde la alerta del TPV), lo usa. Si no, busca el select (alerta del Almacén).
  let destinoSeleccionado = destinoForzado;
  
  if (!destinoSeleccionado) {
      const selectDestino = document.getElementById(`surtido-destino-${productoId}`);
      if(selectDestino) destinoSeleccionado = selectDestino.value;
  }

  if(!destinoSeleccionado) return mostrarAlerta("No se pudo determinar el destino de la transferencia.", "Error");

  const confirmado = await mostrarConfirmacion(
      "⚡ Confirmar Surtido Automático", 
      `¿Confirmas el envío automatizado de ${cantidadCalcular} unidades de "${productoNombre}" hacia la sucursal ${destinoSeleccionado}?`
  );

  if (confirmado) {
    document.getElementById("trans-producto").value = productoNombre;
    document.getElementById("trans-cantidad").value = cantidadCalcular;
    document.getElementById("trans-destino").value = destinoSeleccionado;
    cerrarModalNotificaciones();
    await ejecutarTransferencia();
  }
}


// ==========================================================================
// MÓDULO DE ENTRADA POR COMPRA / PROVEEDOR (Online & Offline)
// ==========================================================================
async function ejecutarEntradaProveedor() {
  const producto = document.getElementById("prov-producto").value;
  const cantidad = parseInt(document.getElementById("prov-cantidad").value);
  const motivo = document.getElementById("prov-motivo").value.trim();

  if (!producto) return mostrarAlerta("Por favor, seleccione un producto para ingresar stock.", "Atención");
  if (!cantidad || cantidad <= 0) return mostrarAlerta("Ingrese una cantidad de entrada válida mayor a cero.", "Atención");

  const payload = {
    action: "registrar_entrada_proveedor",
    payload: { producto, cantidad, motivo },
  };

  if (!navigator.onLine) {
    encolarAccionLocal(payload);

    const prodIndex = catalogoLocal.findIndex((p) => p.nombre === producto);
    if (prodIndex > -1) {
      catalogoLocal[prodIndex].existencia = Number(catalogoLocal[prodIndex].existencia) + cantidad;
    }
    localStorage.setItem("catalogo_cache", JSON.stringify(catalogoLocal));

    renderizarCatalogo();
    actualizarSelectTransferencias();
    
    mostrarAlerta("Operación local: Sin conexión a internet. La entrada se guardó en la cola local y se transmitirá automáticamente al recuperar red.", "Modo Offline");
    document.getElementById("prov-cantidad").value = "";
    document.getElementById("prov-motivo").value = "";
    return;
  }

  mostrarLoading("Registrando reabastecimiento en el servidor...");
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (data.success) {
      mostrarAlerta(data.data.mensaje, "Éxito");
      document.getElementById("prov-cantidad").value = "";
      document.getElementById("prov-motivo").value = "";
      await cargarCatalogo(); 
    } else {
      mostrarAlerta("Error en Servidor: " + data.data.error, "Error");
    }
  } catch (error) {
    mostrarAlerta("Error de red crítico. Verifique la conexión con el servidor.", "Error de Red");
  } finally {
    ocultarLoading();
  }
}
