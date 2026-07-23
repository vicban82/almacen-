// Asegúrate de usar la misma URL de tu API
const API_URL = "https://script.google.com/macros/s/AKfycbwdd8aVW1WM7wyzxT-JdXjzRp7Fk4qnwVY5xr_ryxQnHKqQGFjIM-4r-dHuMbKqutJB/exec";

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
      const inputClave = document.getElementById("clave-input");
      inputClave.value = ""; // Limpiar valor
      inputClave.disabled = true; // Deshabilitar (el navegador no lo considera activo)
      inputClave.type = "text"; // Cambiar tipo para que no sea "password"
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
      mostrarAlerta(
        data.data.error || "Clave incorrecta o no tiene permisos de Almacén.",
        "Error"
      );
    }
  } catch (error) {
    mostrarAlerta(
      "Error de conexión con el servidor, vuelva a intentarlo, vuelva a intentarlo., vuelva a intentarlo.",
      "Error de Red"
    );
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
      mostrarAlerta(
        "No hay internet y no hay datos guardados localmente.",
        "Modo Offline"
      );
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
                  minAlerta > 0 && stockActual <= minAlerta ? "bajo-stock" : ""
                }">Stock: ${stockActual}</span>
            </div>
            <div class="precios" style="text-align: right;">
                Costo: $${prod.inversion} | Venta: $${prod.precio}<br>
                <button class="btn-edit" onclick="abrirModalEdicion('${
                  prod.id
                }')">✏️ Editar</button>
            </div>
        `;
    contenedor.appendChild(item);
  });
}

function actualizarSelectTransferencias() {
  const select = document.getElementById("trans-producto");
  const selectMerma = document.getElementById("merma-producto");
  const selectProv = document.getElementById("prov-producto");

  if (select)
    select.innerHTML = '<option value="">Seleccione un producto...</option>';
  if (selectMerma)
    selectMerma.innerHTML =
      '<option value="">Seleccione un producto...</option>';
  if (selectProv)
    selectProv.innerHTML =
      '<option value="">Seleccione un producto...</option>';

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
  if (!cantidad || cantidad <= 0)
    return mostrarAlerta("Ingrese una cantidad válida", "Atención");

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
    mostrarAlerta(
      "Sin conexión. La transferencia se guardó localmente y se enviará al recuperar la red.",
      "Modo Offline"
    );
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

  if (!producto)
    return mostrarAlerta("Seleccione un producto para la baja.", "Atención");
  if (!cantidad || cantidad <= 0)
    return mostrarAlerta(
      "Ingrese una cantidad válida a descontar.",
      "Atención"
    );

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
    mostrarAlerta(
      "Sin conexión. La merma se guardó localmente y se descontará en el servidor al recuperar la red.",
      "Modo Offline"
    );
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
  const stockMinimo =
    parseInt(document.getElementById("prod-stock-minimo").value) || 0;

  if (!id || !nombre || isNaN(inversion) || isNaN(precio)) {
    return mostrarAlerta(
      "Por favor complete todos los campos obligatorios correctamente.",
      "Atención"
    );
  }

  const payload = {
    action: "crear_producto",
    payload: {
      id,
      nombre,
      division,
      inversion,
      precio,
      stock_inicial: stock,
      stock_minimo: stockMinimo,
    },
  };

  if (!navigator.onLine) {
    encolarAccionLocal(payload);

    const nuevoProducto = {
      id: id,
      nombre: nombre,
      division: division,
      inversion: inversion,
      precio: precio,
      existencia: stock,
      stock_minimo: stockMinimo,
    };

    catalogoLocal.push(nuevoProducto);
    localStorage.setItem("catalogo_cache", JSON.stringify(catalogoLocal));

    renderizarCatalogo();
    actualizarSelectTransferencias();

    mostrarAlerta(
      "Sin conexión. El producto se guardó localmente y se subirá al servidor al recuperar la red.",
      "Modo Offline"
    );

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
  const prod = catalogoLocal.find((p) => p.id === id);
  if (!prod) return mostrarAlerta("Producto no encontrado.", "Error");

  document.getElementById("edit-prod-id").value = prod.id;
  document.getElementById("edit-prod-nombre").innerText = prod.nombre;
  document.getElementById("edit-prod-inversion").value = prod.inversion;
  document.getElementById("edit-prod-precio").value = prod.precio;
  document.getElementById("edit-prod-stock-minimo").value =
    prod.stock_minimo || 0;

  document.getElementById("modal-edicion").style.display = "flex";
}

function cerrarModalEdicion() {
  document.getElementById("modal-edicion").style.display = "none";
}

async function guardarEdicionProducto() {
  const id = document.getElementById("edit-prod-id").value;
  const inversion = parseFloat(
    document.getElementById("edit-prod-inversion").value
  );
  const precio = parseFloat(document.getElementById("edit-prod-precio").value);
  const stockMinimo =
    parseInt(document.getElementById("edit-prod-stock-minimo").value) || 0;

  if (isNaN(inversion) || isNaN(precio) || isNaN(stockMinimo)) {
    return mostrarAlerta(
      "Por favor, ingrese valores numéricos válidos.",
      "Atención"
    );
  }

  mostrarLoading("Actualizando producto en Base de Datos...");
  try {
    const payload = {
      action: "actualizar_precio_producto",
      payload: {
        id_producto: id,
        nueva_inversion: inversion,
        nuevo_precio: precio,
        nuevo_stock_minimo: stockMinimo,
      },
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
      //const totalAvisos = notificacionesPendientes.length + alertasStockPendientes.length + alertasTPVPendientes.length;
      cargarIncidencias(); // Descarga silenciosa de descuadres

      window.actualizarNotificacionGlobal = function () {
        const btnNotificaciones = document.getElementById("btn-notificaciones");
        const badge = document.getElementById("badge-notificaciones");

        const totalAvisos =
          notificacionesPendientes.length +
          alertasStockPendientes.length +
          alertasTPVPendientes.length +
          incidenciasGlobales.length;

        if (totalAvisos > 0) {
          btnNotificaciones.style.display = "inline-block";
          btnNotificaciones.classList.add("boton-alerta");
          badge.innerText = totalAvisos;
        } else {
          btnNotificaciones.style.display = "none";
          btnNotificaciones.classList.remove("boton-alerta");
        }
        actualizarNotificacionGlobal(); // Ejecutar inmediatamente
      };
    }
  } catch (error) {
    console.warn("Fallo silencioso al chequear notificaciones.");
  }
}

function abrirModalNotificaciones() {
  const contenedor = document.getElementById("lista-notificaciones");
  contenedor.innerHTML = "";

  const totalAvisos =
    notificacionesPendientes.length +
    alertasStockPendientes.length +
    alertasTPVPendientes.length;

  if (totalAvisos === 0) {
    contenedor.innerHTML = "<p>No hay avisos ni transferencias pendientes.</p>";
  } else {
    // 1. Renderizar Transferencias Pendientes
    notificacionesPendientes.forEach((notif) => {
      const div = document.createElement("div");
      div.className = "notificacion-item alerta-transferencia";
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

      let cantidadSugerida = minAlerta * 2 - stockActual;
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
      let cantidadSugerida = alerta.minimo * 2 - alerta.stock;
      if (cantidadSugerida <= 0) cantidadSugerida = alerta.minimo || 5;

      // Generar un ID limpio sin espacios para el DOM
      const idLimpio = alerta.producto.replace(/\s/g, "");

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
  if (!firmaRaw)
    return mostrarAlerta("Debe ingresar su firma digital.", "Atención");

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

  const fechaActual = new Date();
  const hoy =
    fechaActual.getFullYear() +
    "-" +
    String(fechaActual.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(fechaActual.getDate()).padStart(2, "0");

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
  cargarIncidencias();
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
  document.getElementById(
    "kpi-ventas"
  ).innerText = `$${datos.global.ventas.toFixed(2)}`;
  document.getElementById(
    "kpi-ganancia"
  ).innerText = `$${datos.global.ganancia.toFixed(2)}`;
  document.getElementById("kpi-stock").innerText = `${datos.global.stock} Unds`;

  if (document.getElementById("kpi-credito")) {
    document.getElementById(
      "kpi-credito"
    ).innerText = `$${datos.global.ventasCredito.toFixed(2)}`;
  }
  if (document.getElementById("kpi-deuda")) {
    document.getElementById(
      "kpi-deuda"
    ).innerText = `$${datos.global.deudaGlobal.toFixed(2)}`;
  }

  // NUEVO: Pinta el valor descontando los retiros
  if (document.getElementById("kpi-efectivo")) {
    document.getElementById("kpi-efectivo").innerText = `$${(
      datos.global.efectivoEnCaja || 0
    ).toFixed(2)}`;
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
        const claseEficiencia =
          eficiencia > 0 ? "eficiencia-alta" : "eficiencia-baja";

        tbodyTPV.innerHTML += `
                       <tr>
                           <td style="padding: 12px; border-bottom: 1px solid #ddd;"><strong>${tpv}</strong></td>
                           <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">${
                             info.stock || 0
                           }</td>
                           <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">${
                             info.horas || 0
                           }</td>
                           <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: right;">$${(
                             info.ventas || 0
                           ).toFixed(2)}</td>
                           <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: right; color: var(--success-color); font-weight: bold;">$${(
                             info.ganancia || 0
                           ).toFixed(2)}</td>
                           <td class="${claseEficiencia}" style="padding: 12px; border-bottom: 1px solid #ddd; text-align: right;">$${eficiencia.toFixed(
          2
        )}/hr</td>
                       </tr>
                   `;
      }
    } else {
      tbodyTPV.innerHTML =
        '<tr><td colspan="6" style="text-align:center; padding:15px;">No hay datos de rendimiento para mostrar</td></tr>';
    }
  }

  const tbodyTop3 = document.getElementById("tbody-top3");
  if (tbodyTop3) {
    tbodyTop3.innerHTML = "";
    if (datos.top3 && datos.top3.length > 0) {
      datos.top3.forEach((prod) => {
        tbodyTop3.innerHTML += `
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${
                          prod.nombre
                        }</strong></td>
                        <td style="text-align: center; padding: 8px; border-bottom: 1px solid #eee;">${
                          prod.cantidad
                        }</td>
                        <td style="text-align: right; padding: 8px; border-bottom: 1px solid #eee; color: var(--success-color); font-weight: bold;">$${prod.ventas.toFixed(
                          2
                        )}</td>
                    </tr>
                `;
      });
    } else {
      tbodyTop3.innerHTML =
        '<tr><td colspan="3" style="text-align:center; padding:10px;">No hay datos de ventas</td></tr>';
    }
  }

  const tbodyBottom3 = document.getElementById("tbody-bottom3");
  if (tbodyBottom3) {
    tbodyBottom3.innerHTML = "";
    if (datos.bottom3 && datos.bottom3.length > 0) {
      datos.bottom3.forEach((prod) => {
        tbodyBottom3.innerHTML += `
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${
                          prod.nombre
                        }</strong></td>
                        <td style="text-align: center; padding: 8px; border-bottom: 1px solid #eee;">${
                          prod.cantidad
                        }</td>
                        <td style="text-align: right; padding: 8px; border-bottom: 1px solid #eee; color: var(--text-color); font-weight: bold;">$${prod.ventas.toFixed(
                          2
                        )}</td>
                    </tr>
                `;
      });
    } else {
      tbodyBottom3.innerHTML =
        '<tr><td colspan="3" style="text-align:center; padding:10px;">No hay datos de ventas</td></tr>';
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
               <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">${
                 info.cantidad
               }</td>
               <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: right;">$${info.ventas.toFixed(
                 2
               )}</td>
               <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: right; color: var(--success-color); font-weight: bold;">$${info.ganancia.toFixed(
                 2
               )}</td>
           </tr>
       `;
      }
    } else {
      tbodyProductos.innerHTML =
        '<tr><td colspan="5" style="text-align:center; padding:15px;">No hay datos de ventas para mostrar</td></tr>';
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

  const formatDate = (date) => {
    return (
      date.getFullYear() +
      "-" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(date.getDate()).padStart(2, "0")
    );
  };

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
      console.warn(
        "La fecha 'Desde' no puede ser mayor que 'Hasta'. Se ha auto-corregido."
      );
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
        console.error(
          "Fallo al procesar elemento de la cola:",
          data.data.error
        );
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
    mostrarAlerta(
      `Sincronización parcial. Quedaron ${fallos.length} acciones pendientes.`,
      "Aviso"
    );
  }
}

// ==========================================================================
// PROCESADOR AUTOMÁTICO DE ENVIÓ
// ==========================================================================
async function procesarSurtidoAutomatico(
  productoNombre,
  cantidadCalcular,
  productoId,
  destinoForzado = null
) {
  // Si viene un destino forzado (desde la alerta del TPV), lo usa. Si no, busca el select (alerta del Almacén).
  let destinoSeleccionado = destinoForzado;

  if (!destinoSeleccionado) {
    const selectDestino = document.getElementById(
      `surtido-destino-${productoId}`
    );
    if (selectDestino) destinoSeleccionado = selectDestino.value;
  }

  if (!destinoSeleccionado)
    return mostrarAlerta(
      "No se pudo determinar el destino de la transferencia.",
      "Error"
    );

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

  if (!producto)
    return mostrarAlerta(
      "Por favor, seleccione un producto para ingresar stock.",
      "Atención"
    );
  if (!cantidad || cantidad <= 0)
    return mostrarAlerta(
      "Ingrese una cantidad de entrada válida mayor a cero.",
      "Atención"
    );

  const payload = {
    action: "registrar_entrada_proveedor",
    payload: { producto, cantidad, motivo },
  };

  if (!navigator.onLine) {
    encolarAccionLocal(payload);

    const prodIndex = catalogoLocal.findIndex((p) => p.nombre === producto);
    if (prodIndex > -1) {
      catalogoLocal[prodIndex].existencia =
        Number(catalogoLocal[prodIndex].existencia) + cantidad;
    }
    localStorage.setItem("catalogo_cache", JSON.stringify(catalogoLocal));

    renderizarCatalogo();
    actualizarSelectTransferencias();

    mostrarAlerta(
      "Operación local: Sin conexión a internet. La entrada se guardó en la cola local y se transmitirá automáticamente al recuperar red.",
      "Modo Offline"
    );
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
    mostrarAlerta(
      "Error de red crítico. Verifique la conexión con el servidor.",
      "Error de Red"
    );
  } finally {
    ocultarLoading();
  }
}

// ==========================================
// MÓDULO DE IMPRESIÓN IPV
// ==========================================

async function imprimirIPV() {
  const fechaInicio = document.getElementById("dash-fecha-inicio").value;
  const fechaFin = document.getElementById("dash-fecha-fin").value;
  const tpvFiltro = document.getElementById("dash-tpv").value;

  mostrarLoading("Generando documento IPV...");

  try {
    const payload = {
      action: "obtener_datos_ipv",
      payload: { fechaInicio, fechaFin, tpvFiltro },
    };

    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    // NUEVA LÓGICA: Procesar el éxito o capturar el error del backend
    if (data.success && Array.isArray(data.data) && data.data.length > 0) {
      generarVistaImpresionIPV(data.data, fechaInicio, fechaFin, tpvFiltro);
    } else if (!data.success) {
      // Capturamos la excepción de las transferencias pendientes lanzada desde el backend
      mostrarAlerta(
        data.data.error || "Ocurrió un error al intentar generar el IPV.",
        "Operación Bloqueada"
      );
    } else {
      mostrarAlerta(
        "No hay datos para generar el IPV en el período seleccionado.",
        "Sin datos"
      );
    }
  } catch (error) {
    mostrarAlerta("Error de red al intentar generar el IPV.", "Error de Red");
  } finally {
    ocultarLoading();
  }
}

function generarVistaImpresionIPV(productos, fInicio, fFin, tpv) {
  // Configuración de texto para cabecera
  const textoTpv =
    tpv === "" || !tpv ? "Todas las Áreas / Almacén Central" : tpv;
  const textoFechaInicio = fInicio
    ? fInicio.split("-").reverse().join("/")
    : "N/D";
  const textoFechaFin = fFin ? fFin.split("-").reverse().join("/") : "N/D";
  const fechaConteo = new Date().toLocaleDateString("es-MX");

  // Construir el HTML del reporte
  let html = `
  <!DOCTYPE html>
  <html lang="es">
  <head>
      <meta charset="UTF-8">
      <title>Reporte IPV - ${textoTpv}</title>
      <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; font-size: 11px; color: #000; }
          h2 { text-align: center; text-transform: uppercase; margin-bottom: 20px; font-size: 16px; text-decoration: underline; }
          .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .header-table td { border: none; padding: 5px; font-size: 12px; }
          .data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .data-table th, .data-table td { border: 1px solid #000; padding: 6px; text-align: center; }
          .data-table th { background-color: #f2f2f2; font-weight: bold; font-size: 11px; }
          .data-table .text-left { text-align: left; }
          .data-table .text-right { text-align: right; }
          .footer-section { margin-top: 40px; width: 100%; }
          .firmas-table { width: 100%; border-collapse: collapse; }
          .firmas-table td { border: none; text-align: center; vertical-align: bottom; height: 60px; width: 33%; }
          .linea-firma { border-top: 1px solid #000; padding-top: 5px; margin: 0 20px; font-weight: bold; }
          .btn-imprimir { display: block; margin: 30px auto; padding: 12px 25px; background-color: #007bff; color: white; border: none; border-radius: 5px; font-size: 1rem; cursor: pointer; font-weight: bold; }
          @media print { .btn-imprimir { display: none; } }
      </style>
  </head>
  <body>
      <h2>Modelo de Formato IPV (Inventario de Precios y Ventas)</h2>
      
      <!-- ENCABEZADO -->
      <table class="header-table">
          <tr>
              <td width="50%"><strong>Nombre del Negocio / Actividad:</strong> Sistema TPV / Almacén</td>
              <td width="30%"><strong>Área / Departamento:</strong> ${textoTpv}</td>
              <td width="20%"><strong>Número de Hoja:</strong> 001</td>
          </tr>
          <tr>
              <td><strong>Fecha de Inicio:</strong> ${textoFechaInicio}</td>
              <td><strong>Fecha de Cierre:</strong> ${textoFechaFin}</td>
              <td></td>
          </tr>
      </table>

      <!-- TABLA DE PRODUCTOS -->
      <table class="data-table">
          <thead>
              <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th>U.M.</th>
                  <th>Precio Venta</th>
                  <th>Inventario Inicial</th>
                  <th>Entradas (Compras)</th>
                  <th>Salidas (Ventas + Mermas)</th>
                  <th>Inventario Final</th>
                  <th>Valor Total</th>
              </tr>
          </thead>
          <tbody>
  `;

  let valorInventarioGlobal = 0;

  if (productos && productos.length > 0) {
    // Ordenar alfabéticamente
    productos.sort((a, b) => a.nombre.localeCompare(b.nombre));

    for (const prod of productos) {
      const codigo = prod.id || "S/C";
      const precioVenta = prod.precio || 0;
      const invInicial = prod.inventarioInicial || 0;
      const entradas = prod.entradas || 0;
      const salidas = prod.salidas || 0;
      const invFinal = prod.stockFinal || 0;
      const valorLinea = invFinal * precioVenta;
      valorInventarioGlobal += valorLinea;

      html += `
        <tr>
          <td>${codigo}</td>
          <td class="text-left">${prod.nombre}</td>
          <td>unidad</td>
          <td class="text-right">${precioVenta.toFixed(2)}</td>
          <td>${invInicial}</td>
          <td>${entradas}</td>
          <td>${salidas}</td>
          <td>${invFinal}</td>
          <td class="text-right">${valorLinea.toFixed(2)}</td>
        </tr>
      `;
    }
  } else {
    html += `<tr><td colspan="9" style="padding: 20px;">No se encontraron productos en el catálogo.</td></tr>`;
  }

  html += `
          </tbody>
      </table>
      
      <!-- RESUMEN FINAL -->
      <div style="margin-top: 10px; text-align: right; font-size: 13px; font-weight: bold;">
          Valor Total del Inventario: $${valorInventarioGlobal.toFixed(2)}
      </div>

      <!-- OBSERVACIONES Y FIRMAS -->
      <div style="margin-top: 30px; font-size: 13px;">
          <strong>Observaciones:</strong> __________________________________________________________________________________________________<br><br>
          _____________________________________________________________________________________________________________________________
      </div>

      <div class="footer-section">
          <table class="firmas-table">
              <tr>
                  <td>
                      <div class="linea-firma">Elaborado por (Nombre y Firma)</div>
                  </td>
                  <td>
                      <div class="linea-firma">Responsable del Almacén / Área</div>
                  </td>
                  <td>
                      <div class="linea-firma">Fecha de Realización: ${fechaConteo}</div>
                  </td>
              </tr>
          </table>
      </div>

      <button class="btn-imprimir" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
  </body>
  </html>
  `;

  // Abrir la ventana emergente y escribir el HTML
  const ventana = window.open("", "_blank", "width=1100,height=800");
  if (!ventana) {
    mostrarAlerta(
      "No se pudo abrir la ventana de impresión. Permite ventanas emergentes.",
      "Error"
    );
    return;
  }

  ventana.document.open();
  ventana.document.write(html);
  ventana.document.close();
}

// ==========================================
// MÓDULO DE IMPRESIÓN DE TRANSFERENCIAS
// ==========================================

async function imprimirTransferencias() {
  const fechaInicio = document.getElementById("dash-fecha-inicio").value;
  const fechaFin = document.getElementById("dash-fecha-fin").value;
  const tpvFiltro = document.getElementById("dash-tpv").value;

  mostrarLoading("Generando reporte de transferencias...");

  try {
    const payload = {
      action: "obtener_datos_transferencias",
      payload: { fechaInicio, fechaFin, tpvFiltro },
    };

    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.success && Array.isArray(data.data) && data.data.length > 0) {
      generarVistaImpresionTransferencias(
        data.data,
        fechaInicio,
        fechaFin,
        tpvFiltro
      );
    } else if (!data.success) {
      mostrarAlerta(
        data.data.error || "Ocurrió un error al intentar generar el reporte.",
        "Error"
      );
    } else {
      mostrarAlerta(
        "No hay transferencias registradas en el período seleccionado.",
        "Sin datos"
      );
    }
  } catch (error) {
    mostrarAlerta(
      "Error de red al intentar generar el reporte.",
      "Error de Red"
    );
  } finally {
    ocultarLoading();
  }
}

function generarVistaImpresionTransferencias(movimientos, fInicio, fFin, tpv) {
  const textoTpv = tpv === "" || !tpv ? "Todas las Áreas / General" : tpv;
  const textoFechaInicio = fInicio
    ? fInicio.split("-").reverse().join("/")
    : "N/D";
  const textoFechaFin = fFin ? fFin.split("-").reverse().join("/") : "N/D";
  const fechaConteo = new Date().toLocaleDateString("es-MX");

  let html = `
  <!DOCTYPE html>
  <html lang="es">
  <head>
      <meta charset="UTF-8">
      <title>Reporte de Transferencias - ${textoTpv}</title>
      <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; font-size: 11px; color: #000; }
          h2 { text-align: center; text-transform: uppercase; margin-bottom: 20px; font-size: 16px; text-decoration: underline; }
          .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .header-table td { border: none; padding: 5px; font-size: 12px; }
          .data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .data-table th, .data-table td { border: 1px solid #000; padding: 6px; text-align: center; }
          .data-table th { background-color: #f2f2f2; font-weight: bold; font-size: 11px; }
          .data-table .text-left { text-align: left; }
          .footer-section { margin-top: 40px; width: 100%; }
          .btn-imprimir { display: block; margin: 30px auto; padding: 12px 25px; background-color: #6f42c1; color: white; border: none; border-radius: 5px; font-size: 1rem; cursor: pointer; font-weight: bold; }
          @media print { .btn-imprimir { display: none; } }
      </style>
  </head>
  <body>
      <h2>Reporte de Transferencias de Inventario</h2>
      
      <table class="header-table">
          <tr>
              <td width="50%"><strong>Filtro de Área/Departamento:</strong> ${textoTpv}</td>
              <td width="50%"><strong>Fecha de Impresión:</strong> ${fechaConteo}</td>
          </tr>
          <tr>
              <td><strong>Desde:</strong> ${textoFechaInicio}</td>
              <td><strong>Hasta:</strong> ${textoFechaFin}</td>
          </tr>
      </table>

      <table class="data-table">
          <thead>
              <tr>
                  <th>Fecha y Hora</th>
                  <th>Producto</th>
                  <th>Origen</th>
                  <th>Destino</th>
                  <th>Cantidad</th>
                  <th>Estado</th>
                  <th>Concepto</th>
              </tr>
          </thead>
          <tbody>
  `;

  if (movimientos && movimientos.length > 0) {
    for (const mov of movimientos) {
      const fechaObj = new Date(mov.fecha);
      const fechaFormato =
        fechaObj.toLocaleDateString("es-MX") +
        " " +
        fechaObj.toLocaleTimeString("es-MX", {
          hour: "2-digit",
          minute: "2-digit",
        });

      html += `
        <tr>
          <td>${fechaFormato}</td>
          <td class="text-left"><strong>${mov.producto}</strong></td>
          <td>${mov.origen}</td>
          <td>${mov.destino}</td>
          <td><strong>${mov.cantidad}</strong></td>
          <td style="color: ${
            mov.estado === "pendiente" ? "#dc3545" : "#28a745"
          }">${mov.estado.toUpperCase()}</td>
          <td>${mov.concepto}</td>
        </tr>
      `;
    }
  } else {
    html += `<tr><td colspan="7" style="padding: 20px;">No se encontraron transferencias en los filtros seleccionados.</td></tr>`;
  }

  html += `
          </tbody>
      </table>
      
      <div style="margin-top: 30px; font-size: 13px;">
          <strong>Total de movimientos listados:</strong> ${movimientos.length}
      </div>

      <button class="btn-imprimir" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
  </body>
  </html>
  `;

  const ventana = window.open("", "_blank", "width=1100,height=800");
  if (!ventana) {
    mostrarAlerta(
      "No se pudo abrir la ventana de impresión. Permite ventanas emergentes.",
      "Error"
    );
    return;
  }

  ventana.document.open();
  ventana.document.write(html);
  ventana.document.close();
}

// ==========================================
// MÓDULO DE IMPRESIÓN DE EGRESOS DE CAJA
// ==========================================

async function imprimirEgresos() {
  const fechaInicio = document.getElementById("dash-fecha-inicio").value;
  const fechaFin = document.getElementById("dash-fecha-fin").value;
  const tpvFiltro = document.getElementById("dash-tpv").value;

  mostrarLoading("Generando reporte de egresos...");

  try {
    const payload = {
      action: "obtener_datos_egresos",
      payload: { fechaInicio, fechaFin, tpvFiltro },
    };

    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.success && Array.isArray(data.data) && data.data.length > 0) {
      generarVistaImpresionEgresos(data.data, fechaInicio, fechaFin, tpvFiltro);
    } else if (!data.success) {
      mostrarAlerta(
        data.data.error || "Ocurrió un error al intentar generar el reporte.",
        "Error"
      );
    } else {
      mostrarAlerta(
        "No hay egresos registrados en el período seleccionado.",
        "Sin datos"
      );
    }
  } catch (error) {
    mostrarAlerta(
      "Error de red al intentar generar el reporte.",
      "Error de Red"
    );
  } finally {
    ocultarLoading();
  }
}

function generarVistaImpresionEgresos(egresos, fInicio, fFin, tpv) {
  const textoTpv = tpv === "" || !tpv ? "Todas las Áreas / General" : tpv;
  const textoFechaInicio = fInicio
    ? fInicio.split("-").reverse().join("/")
    : "N/D";
  const textoFechaFin = fFin ? fFin.split("-").reverse().join("/") : "N/D";
  const fechaConteo = new Date().toLocaleDateString("es-MX");

  let html = `
  <!DOCTYPE html>
  <html lang="es">
  <head>
      <meta charset="UTF-8">
      <title>Reporte de Egresos - ${textoTpv}</title>
      <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; font-size: 11px; color: #000; }
          h2 { text-align: center; text-transform: uppercase; margin-bottom: 20px; font-size: 16px; text-decoration: underline; }
          .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .header-table td { border: none; padding: 5px; font-size: 12px; }
          .data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .data-table th, .data-table td { border: 1px solid #000; padding: 6px; text-align: center; }
          .data-table th { background-color: #f2f2f2; font-weight: bold; font-size: 11px; }
          .data-table .text-left { text-align: left; }
          .data-table .text-right { text-align: right; }
          .btn-imprimir { display: block; margin: 30px auto; padding: 12px 25px; background-color: #dc3545; color: white; border: none; border-radius: 5px; font-size: 1rem; cursor: pointer; font-weight: bold; }
          @media print { .btn-imprimir { display: none; } }
      </style>
  </head>
  <body>
      <h2>Reporte de Egresos de Efectivo</h2>
      
      <table class="header-table">
          <tr>
              <td width="50%"><strong>Filtro de Área/Instancia:</strong> ${textoTpv}</td>
              <td width="50%"><strong>Fecha de Impresión:</strong> ${fechaConteo}</td>
          </tr>
          <tr>
              <td><strong>Desde:</strong> ${textoFechaInicio}</td>
              <td><strong>Hasta:</strong> ${textoFechaFin}</td>
          </tr>
      </table>

      <table class="data-table">
          <thead>
              <tr>
                  <th>Fecha y Hora</th>
                  <th>Instancia TPV</th>
                  <th>Tipo de Egreso</th>
                  <th>Concepto / Motivo</th>
                  <th>Monto ($)</th>
              </tr>
          </thead>
          <tbody>
  `;

  let totalMonto = 0;

  if (egresos && egresos.length > 0) {
    for (const egreso of egresos) {
      const fechaObj = new Date(egreso.fecha);
      const fechaFormato =
        fechaObj.toLocaleDateString("es-MX") +
        " " +
        fechaObj.toLocaleTimeString("es-MX", {
          hour: "2-digit",
          minute: "2-digit",
        });
      totalMonto += egreso.monto;

      html += `
        <tr>
          <td>${fechaFormato}</td>
          <td><strong>${egreso.tpv}</strong></td>
          <td style="text-transform: capitalize;">${egreso.tipo.replace(
            "_",
            " "
          )}</td>
          <td class="text-left">${egreso.concepto}</td>
          <td class="text-right" style="color: #dc3545; font-weight: bold;">$${egreso.monto.toFixed(
            2
          )}</td>
        </tr>
      `;
    }
  } else {
    html += `<tr><td colspan="5" style="padding: 20px;">No se encontraron egresos en los filtros seleccionados.</td></tr>`;
  }

  html += `
          </tbody>
      </table>
      
      <div style="margin-top: 10px; text-align: right; font-size: 13px; font-weight: bold;">
          Total Retirado: $${totalMonto.toFixed(2)}
      </div>

      <div style="margin-top: 30px; font-size: 13px;">
          <strong>Total de registros (Egresos):</strong> ${egresos.length}
      </div>

      <button class="btn-imprimir" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
  </body>
  </html>
  `;

  const ventana = window.open("", "_blank", "width=1100,height=800");
  if (!ventana) {
    mostrarAlerta(
      "No se pudo abrir la ventana de impresión. Permite ventanas emergentes.",
      "Error"
    );
    return;
  }

  ventana.document.open();
  ventana.document.write(html);
  ventana.document.close();
}

async function imprimirVentas() {
  const fechaInicio = document.getElementById("dash-fecha-inicio").value;
  const fechaFin = document.getElementById("dash-fecha-fin").value;
  const tpvFiltro = document.getElementById("dash-tpv").value;

  mostrarLoading("Generando reporte de ventas...");

  try {
    const payload = {
      action: "obtener_datos_ventas",
      payload: { fechaInicio, fechaFin, tpvFiltro },
    };

    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.success && Array.isArray(data.data) && data.data.length > 0) {
      generarVistaImpresionVentas(data.data, fechaInicio, fechaFin, tpvFiltro);
    } else if (!data.success) {
      mostrarAlerta(
        data.data.error || "Ocurrió un error al intentar generar el reporte.",
        "Error"
      );
    } else {
      mostrarAlerta(
        "No hay ventas registradas en el período seleccionado.",
        "Sin datos"
      );
    }
  } catch (error) {
    mostrarAlerta(
      "Error de red al intentar generar el reporte.",
      "Error de Red"
    );
  } finally {
    ocultarLoading();
  }
}

function generarVistaImpresionVentas(ventas, fInicio, fFin, tpv) {
  const textoTpv = tpv === "" || !tpv ? "Todas las Áreas / General" : tpv;
  const textoFechaInicio = fInicio
    ? fInicio.split("-").reverse().join("/")
    : "N/D";
  const textoFechaFin = fFin ? fFin.split("-").reverse().join("/") : "N/D";
  const fechaImpresion = new Date().toLocaleDateString("es-MX");

  let html = `
  <!DOCTYPE html>
  <html lang="es">
  <head>
      <meta charset="UTF-8">
      <title>Reporte de Ventas - ${textoTpv}</title>
      <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; font-size: 11px; color: #000; }
          h2 { text-align: center; text-transform: uppercase; margin-bottom: 20px; font-size: 16px; text-decoration: underline; }
          .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .header-table td { border: none; padding: 5px; font-size: 12px; }
          .data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .data-table th, .data-table td { border: 1px solid #000; padding: 6px; text-align: center; }
          .data-table th { background-color: #f2f2f2; font-weight: bold; font-size: 11px; }
          .data-table .text-left { text-align: left; }
          .data-table .text-right { text-align: right; }
          .btn-imprimir { display: block; margin: 30px auto; padding: 12px 25px; background-color: #28a745; color: white; border: none; border-radius: 5px; font-size: 1rem; cursor: pointer; font-weight: bold; }
          @media print { .btn-imprimir { display: none; } }
      </style>
  </head>
  <body>
      <h2>Reporte Detallado de Ventas</h2>
      
      <table class="header-table">
          <tr>
              <td width="50%"><strong>Filtro de Área/Instancia:</strong> ${textoTpv}</td>
              <td width="50%"><strong>Fecha de Impresión:</strong> ${fechaImpresion}</td>
          </tr>
          <tr>
              <td><strong>Desde:</strong> ${textoFechaInicio}</td>
              <td><strong>Hasta:</strong> ${textoFechaFin}</td>
          </tr>
      </table>

      <table class="data-table">
          <thead>
              <tr>
                  <th>ID Venta</th>
                  <th>Fecha</th>
                  <th>Instancia TPV</th>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Método Pago</th>
                  <th>Cliente</th>
                  <th>Importe ($)</th>
              </tr>
          </thead>
          <tbody>
  `;

  let totalImporte = 0;

  if (ventas && ventas.length > 0) {
    for (const venta of ventas) {
      totalImporte += venta.importe;
      const fechaMostrada =
        typeof venta.fecha === "string" && venta.fecha.includes("/")
          ? venta.fecha
          : new Date(venta.fecha).toLocaleDateString("es-MX");

      html += `
        <tr>
          <td>${venta.id_venta}</td>
          <td>${fechaMostrada}</td>
          <td><strong>${venta.tpv}</strong></td>
          <td class="text-left">${venta.producto}</td>
          <td>${venta.cantidad}</td>
          <td style="text-transform: capitalize;">${venta.metodo_pago}</td>
          <td>${venta.cliente}</td>
          <td class="text-right" style="color: #28a745; font-weight: bold;">$${venta.importe.toFixed(
            2
          )}</td>
        </tr>
      `;
    }
  } else {
    html += `<tr><td colspan="8" style="padding: 20px;">No se encontraron ventas en los filtros seleccionados.</td></tr>`;
  }

  html += `
          </tbody>
      </table>
      
      <div style="margin-top: 10px; text-align: right; font-size: 13px; font-weight: bold;">
          Total Vendido (en listado): $${totalImporte.toFixed(2)}
      </div>

      <div style="margin-top: 30px; font-size: 13px;">
          <strong>Total de registros (Ventas):</strong> ${ventas.length}
      </div>

      <button class="btn-imprimir" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
  </body>
  </html>
  `;

  const ventana = window.open("", "_blank", "width=1100,height=800");
  if (!ventana) {
    mostrarAlerta(
      "No se pudo abrir la ventana de impresión. Permite ventanas emergentes.",
      "Error"
    );
    return;
  }

  ventana.document.open();
  ventana.document.write(html);
  ventana.document.close();
}

// ==========================================
// MÓDULO DE AUDITORÍA E INCIDENCIAS
// ==========================================
let incidenciasGlobales = [];

// 1. Obtener los datos desde la hoja 'Incidencias'
async function cargarIncidencias() {
  try {
    const payload = { action: "obtener_incidencias", payload: {} };
    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (data.success && Array.isArray(data.data)) {
      incidenciasGlobales = data.data;
      renderizarIncidencias();
      actualizarNotificacionGlobal(); // Actualiza la campanita
    }
  } catch (error) {
    console.error("Error al cargar la auditoría de incidencias:", error);
  }
}

// 2. Poblar la tabla en el Dashboard
function renderizarIncidencias() {
  const tbody = document.getElementById("tbody-incidencias");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (incidenciasGlobales.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center; padding:15px; color: #666;">No hay incidencias críticas pendientes de revisión.</td></tr>';
    return;
  }

  incidenciasGlobales.forEach((inc) => {
    const fechaObj = new Date(inc.fecha);
    const fechaStr =
      fechaObj.toLocaleDateString() +
      " " +
      fechaObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Estilización de alertas visuales
    const colorRiesgo =
      inc.riesgo === "Alto"
        ? "background-color: #ffcccc; color: #cc0000; font-weight: bold;"
        : "background-color: #fff3cd; color: #856404;";
    const badgeRiesgo = `<span style="padding: 4px 8px; border-radius: 4px; ${colorRiesgo}">${inc.riesgo}</span>`;

    tbody.innerHTML += `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #ddd;">${fechaStr}</td>
                <td style="padding: 12px; border-bottom: 1px solid #ddd;"><strong>${
                  inc.tpv
                }</strong></td>
                <td style="padding: 12px; border-bottom: 1px solid #ddd;">${
                  inc.categoria
                } <small>(${inc.tipo})</small></td>
                <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: right; font-weight: bold;">$${parseFloat(
                  inc.monto
                ).toFixed(2)}</td>
                <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">${badgeRiesgo}</td>
                <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">
                    <button onclick="abrirModalIncidencia(${
                      inc.idFila
                    })" class="btn-warning btn-sm" style="background-color: var(--danger-color); color: white;">Auditar</button>
                </td>
            </tr>
        `;
  });
}

// 3. Mostrar el Modal interactivo y parsear el Contexto_JSON
function abrirModalIncidencia(idFila) {
  const incidencia = incidenciasGlobales.find((i) => i.idFila === idFila);
  if (!incidencia) return;

  document.getElementById("incidencia-id-fila").value = idFila;
  document.getElementById(
    "incidencia-subtitulo"
  ).innerText = `Alerta en ${incidencia.tpv} - ${incidencia.categoria}`;
  document.getElementById("incidencia-comentarios").value = "";

  let detallesHTML = "<strong>No hay contexto técnico adicional.</strong>";

  // Extracción dinámica de variables desde la columna G[cite: 1]
  try {
    const contexto = JSON.parse(incidencia.contexto_json);
    detallesHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div><strong>Fondo Inicial Carga:</strong> <br>$${(
                  contexto.fondoInicial || 0
                ).toFixed(2)}</div>
                <div><strong>Ventas Teóricas:</strong> <br>$${(
                  contexto.teorico || 0
                ).toFixed(2)}</div>
                <div><strong>Retiros Efectuados:</strong> <br>$${(
                  contexto.retirosTotales || 0
                ).toFixed(2)}</div>
                <div style="color: var(--danger-color);"><strong>Efectivo Declarado Físico:</strong> <br>$${(
                  contexto.declarado || 0
                ).toFixed(2)}</div>
                
                <div style="grid-column: span 2; border-top: 1px dashed #ccc; padding-top: 10px; margin-top: 5px; text-align: center;">
                    <strong>Diferencia (${incidencia.tipo}):</strong> 
                    <span style="font-size: 1.3em; margin-left: 10px; font-weight: bold; color: ${
                      incidencia.riesgo === "Alto" ? "#cc0000" : "#856404"
                    };">
                        $${parseFloat(incidencia.monto).toFixed(2)}
                    </span>
                </div>
            </div>
        `;
  } catch (e) {
    detallesHTML = `<p>Error al procesar el reporte original de la base de datos.</p>`;
  }

  document.getElementById("incidencia-detalles").innerHTML = detallesHTML;
  document.getElementById("modal-incidencia").style.display = "flex";
}

function cerrarModalIncidencia() {
  document.getElementById("modal-incidencia").style.display = "none";
}

// 4. Procesar el cambio de estado hacia el Backend
async function procesarResolucion(estado) {
  const idFila = document.getElementById("incidencia-id-fila").value;
  const comentarios = document
    .getElementById("incidencia-comentarios")
    .value.trim();

  if (!comentarios) {
    return mostrarAlerta(
      "La auditoría requiere una justificación o comentario obligatoriamente.",
      "Campo Requerido"
    );
  }

  mostrarLoading(`Registrando incidencia como ${estado}...`);
  try {
    const payload = {
      action: "resolver_incidencia",
      payload: {
        idFila: parseInt(idFila),
        estado: estado,
        comentarios: comentarios,
      },
    };

    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (data.success) {
      mostrarAlerta(data.data.mensaje, "Auditoría Exitosa");
      cerrarModalIncidencia();
      await cargarIncidencias();
    } else {
      mostrarAlerta("Error en el servidor: " + data.data.error, "Error");
    }
  } catch (error) {
    mostrarAlerta(
      "Error de conexión al procesar la resolución.",
      "Fallo de Red"
    );
  } finally {
    ocultarLoading();
  }
}

// Función para consumir el nuevo endpoint de IA
async function solicitarAnalisisIA() {
  if (!navigator.onLine) {
    return mostrarAlerta(
      "La inteligencia artificial requiere conexión a internet.",
      "Modo Offline"
    );
  }

  mostrarLoading("La IA está analizando tu almacén...");
  const contenedorResultado = document.getElementById("resultado-ia");
  contenedorResultado.style.display = "none";
  contenedorResultado.innerText = "";

  try {
    const payload = {
      action: "analizar_stock_con_ia", // Apunta a la nueva función en tu GAS
      payload: {},
    };

    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.success) {
      contenedorResultado.style.display = "block";
      contenedorResultado.innerText = data.data.sugerencia;
    } else {
      mostrarAlerta("Error de IA: " + data.data.error, "Error");
    }
  } catch (error) {
    mostrarAlerta("Error de red al consultar a la IA.", "Error de Red");
  } finally {
    ocultarLoading();
  }
}

// Manejador para detectar la tecla "Enter" en el input del chat
function manejarEnterChat(event) {
  if (event.key === "Enter") {
    consultarChatbotNLP();
  }
}

// Función principal de conexión con el backend
async function consultarChatbotNLP() {
  const inputElement = document.getElementById("chat-nlp-input");
  const pregunta = inputElement.value.trim();

  if (!pregunta)
    return mostrarAlerta(
      "Por favor, escribe una pregunta para la IA.",
      "Atención"
    );

  if (!navigator.onLine) {
    return mostrarAlerta(
      "El Chatbot IA requiere conexión a internet para funcionar.",
      "Modo Offline"
    );
  }

  mostrarLoading("La IA está traduciendo y analizando tu pregunta...");
  const contenedorResultado = document.getElementById("chat-nlp-resultado");
  contenedorResultado.style.display = "none";
  contenedorResultado.innerText = "";

  try {
    const payload = {
      action: "consultar_chatbot_ia", // Nueva acción en el enrutador
      payload: { pregunta: pregunta },
    };

    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.success) {
      contenedorResultado.style.display = "block";
      // Renderiza la respuesta humana
      contenedorResultado.innerText = data.data.respuesta;
      inputElement.value = ""; // Limpia el input tras el éxito
    } else {
      mostrarAlerta("Error de procesamiento IA: " + data.data.error, "Error");
    }
  } catch (error) {
    mostrarAlerta(
      "Error de red al intentar consultar al chatbot.",
      "Error de Red"
    );
  } finally {
    ocultarLoading();
  }
}


let promptInstalacion;
const btnInstalar = document.createElement('button');
btnInstalar.innerText = "📱 Instalar App";
btnInstalar.className = "btn-primary btn-sm btn-icon";
btnInstalar.style.display = "none"; // Oculto por defecto

// Agregar el botón visualmente al header del HTML
document.querySelector('.header-actions').prepend(btnInstalar);

// Escuchar el evento que dispara el navegador cuando la app es instalable
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevenir que el navegador muestre su propio prompt por defecto
    e.preventDefault();
    // Guardar el evento para dispararlo luego
    promptInstalacion = e;
    // Mostrar nuestro botón personalizado
    btnInstalar.style.display = "inline-flex";
});

// Lógica al hacer clic en el botón
btnInstalar.addEventListener('click', async () => {
    if (promptInstalacion) {
        promptInstalacion.prompt();
        const { outcome } = await promptInstalacion.userChoice;
        if (outcome === 'accepted') {
            console.log('El usuario instaló la aplicación');
            btnInstalar.style.display = "none";
        }
        promptInstalacion = null;
    }
});

