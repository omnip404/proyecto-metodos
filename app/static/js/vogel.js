// static/js/vogel.js  (fragmento o reemplazo de funciones clave)

// --- función principal que envía y recibe ---
async function ejecutarResolucion() {
	// Validar/parsing de entradas con feedback inmediato
	const resultadoDiv = document.getElementById("resultado");
	let costos, oferta, demanda;
	try {
		costos = JSON.parse(document.getElementById("costos").value);
		oferta = JSON.parse(document.getElementById("oferta").value);
		demanda = JSON.parse(document.getElementById("demanda").value);
	} catch (e) {
		const clientCode = Date.now().toString(36).slice(-6);
		resultadoDiv.innerHTML = `<p style="color:red">❌ Entrada inválida (id ${clientCode}): JSON mal formado. ${e.message || e}</p>`;
		console.error('Input parse error id', clientCode, e);
		return;
	}

	const metodo = document.getElementById("metodo").value;
	const endpointMap = {
		"vogel": "/resolver/vogel",
		"noroeste": "/resolver/noroeste"
	};
	const endpoint = endpointMap[metodo];

	// Deshabilitar botón para evitar peticiones concurrentes
	const btn = document.getElementById('btnResolver');
	if (btn) btn.disabled = true;

	// Timeout / AbortController para evitar espera indefinida
	const controller = new AbortController();
	const timeoutMs = 30000; // 30s
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const res = await fetch(endpoint, {
			method: "POST",
			headers: {"Content-Type":"application/json"},
			body: JSON.stringify({costos, oferta, demanda}),
			signal: controller.signal
		});
		clearTimeout(timeoutId);

		let data;
		try {
			data = await res.json();
		} catch (e) {
			// respuesta no JSON
			resultadoDiv.innerHTML = `<p style="color:red">❌ Respuesta del servidor no es JSON. Revise el servidor.</p>`;
			return;
		}

		resultadoDiv.innerHTML = "";

		if (!res.ok) {
			const msg = data.error || 'Error';
			const code = data.code ? ` (Código: ${data.code})` : '';
			const detalleHtml = data.detalle ? `<pre style="color:#ddd;background:#222;padding:8px;border-radius:6px;margin-top:8px;">${String(data.detalle)}</pre>` : '';
			resultadoDiv.innerHTML = `<p style="color:red">❌ Backend${code}: ${msg}</p>${detalleHtml}`;
			return;
		}

		// Si hubo balanceo, avisar al usuario
		if (data.meta_balance && data.meta_balance.tipo !== "balanceado") {
			const info = document.createElement("p");
			info.style.color = "#7a5cff";
			info.innerHTML = `ℹ️ Se aplicó balanceo automático: <strong>${data.meta_balance.tipo}</strong> (se añadió ${data.meta_balance.diferencia}).`;
			resultadoDiv.appendChild(info);
		}

		// Crear tabla visual con posibles labels ficticias
		const tablaDiv = document.getElementById("tabla-visual");
		tablaDiv.innerHTML = "";
		const costosBalanceados = reconstruirCostosBalanceados(costos, data.meta_balance);
		const ofertaBalanceada = reconstruirArrayBalanceado(oferta, data.meta_balance, "oferta");
		const demandaBalanceada = reconstruirArrayBalanceado(demanda, data.meta_balance, "demanda");

		// Pasamos también las asignaciones recibidas para que la tabla muestre "cómo quedó" todo
		const tabla = crearTablaVisual(costosBalanceados, ofertaBalanceada, demandaBalanceada, data.meta_balance, data.asignaciones);
		tablaDiv.appendChild(tabla);

		// Mostrar pasos y resaltar según el flujo ya existente
		mostrarPasos(data, costosBalanceados);
	} catch (err) {
		clearTimeout(timeoutId);
		if (err.name === 'AbortError') {
			resultadoDiv.innerHTML = `<p style="color:orange">⏱️ La solicitud ha excedido ${timeoutMs/1000}s y fue cancelada. Intenta de nuevo o revisa el servidor.</p>`;
		} else {
			const clientCode = Date.now().toString(36).slice(-6);
			resultadoDiv.innerHTML = `<p style="color:red">❌ Error local (id ${clientCode}): ${err.message || err}</p>`;
			console.error('Client error id', clientCode, err);
		}
	} finally {
		// re-habilitar botón siempre
		if (btn) btn.disabled = false;
	}
}

// --- helpers para reconstruir localmente (si no quieres solicitarlos al backend) ---
function reconstruirCostosBalanceados(costos, meta) {
    // Hace copia y añade fila/col de ceros si meta indica balanceo
    const copy = costos.map(f => f.slice());
    if (!meta) return copy;
    if (meta.tipo === "columna_ficticia") {
        for (let i = 0; i < copy.length; i++) {
            copy[i].push(0);
        }
    } else if (meta.tipo === "fila_ficticia") {
        const nueva = new Array((copy[0]||[]).length).fill(0);
        copy.push(nueva);
    }
    return copy;
}

function reconstruirArrayBalanceado(arr, meta, tipoArr) {
    const copy = arr.slice();
    if (!meta) return copy;
    if (meta.tipo === "columna_ficticia" && tipoArr === "demanda") {
        copy.push(meta.diferencia);
    } else if (meta.tipo === "fila_ficticia" && tipoArr === "oferta") {
        copy.push(meta.diferencia);
    }
    return copy;
}

// ===== Nuevo helper: calcular penalizaciones en JS (coherente con backend) =====
function calcPenalizacionesJS(costos, oferta, demanda) {
    const filas = [];
    const columnas = [];
    const m = oferta.length;
    const n = demanda.length;

    for (let i = 0; i < m; i++) {
        if (oferta[i] > 0) {
            const vals = [];
            for (let j = 0; j < n; j++) {
                if (demanda[j] > 0 && costos[i] && costos[i][j] != null) vals.push(Number(costos[i][j]));
            }
            if (vals.length >= 2) {
                vals.sort((a,b)=>a-b);
                filas.push([vals[1] - vals[0], i]);
            } else if (vals.length === 1) {
                filas.push([vals[0], i]);
            } else {
                filas.push([-1, i]);
            }
        } else {
            filas.push([-1, i]);
        }
    }

    for (let j = 0; j < n; j++) {
        if (demanda[j] > 0) {
            const vals = [];
            for (let i = 0; i < m; i++) {
                if (oferta[i] > 0 && costos[i] && costos[i][j] != null) vals.push(Number(costos[i][j]));
            }
            if (vals.length >= 2) {
                vals.sort((a,b)=>a-b);
                columnas.push([vals[1] - vals[0], j]);
            } else if (vals.length === 1) {
                columnas.push([vals[0], j]);
            } else {
                columnas.push([-1, j]);
            }
        } else {
            columnas.push([-1, j]);
        }
    }

    return {filas, columnas};
}

// --- crearTablaVisual con etiquetas en encabezados si hay fila/col ficticia ---
// ahora acepta un parámetro opcional 'asignaciones' para mostrar las cantidades dentro de la tabla
function crearTablaVisual(costos, oferta, demanda, meta, asignaciones) {
    const table = document.createElement("table");
    table.classList.add("tabla-visual");
    table.style.width = "100%";

    const m = costos.length;
    const n = (costos[0] || []).length;
    const { filas: pen_filas, columnas: pen_cols } = calcPenalizacionesJS(costos, oferta, demanda);

    // calcular sumas de asignación por fila y columna (si no vienen, quedan en 0)
    const asignPorFila = new Array(m).fill(0);
    const asignPorCol = new Array(n).fill(0);
    if (Array.isArray(asignaciones)) {
        for (let i = 0; i < Math.min(m, asignaciones.length); i++) {
            for (let j = 0; j < Math.min(n, asignaciones[i].length); j++) {
                const a = Number(asignaciones[i][j] || 0);
                asignPorFila[i] += a;
                asignPorCol[j] += a;
            }
        }
    }

    // thead
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.appendChild(document.createElement("th")); // esquina vacía
    for (let j = 0; j < n; j++) {
        const th = document.createElement("th");
        th.textContent = `C${j+1}`;
        th.style.textAlign = "center";
        if (meta && meta.tipo === "columna_ficticia" && j === n - 1) {
            th.textContent += " (Ficticia)";
            th.classList.add("celda-ficticia-header");
        }
        headRow.appendChild(th);
    }
    const ofertaTh = document.createElement("th");
    ofertaTh.textContent = "OF.";
    ofertaTh.style.textAlign = "center";
    headRow.appendChild(ofertaTh);
    const penalFilaTh = document.createElement("th");
    penalFilaTh.textContent = "Penal Fila";
    penalFilaTh.style.textAlign = "center";
    headRow.appendChild(penalFilaTh);
    thead.appendChild(headRow);
    table.appendChild(thead);

    // tbody (filas P1..Pm) - ordenadas por índice asc
    const tbody = document.createElement("tbody");
    for (let i = 0; i < m; i++) {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = `P${i+1}`;
        th.style.textAlign = "center";
        if (meta && meta.tipo === "fila_ficticia" && i === m - 1) {
            th.textContent += " (Ficticia)";
            th.classList.add("celda-ficticia-header");
        }
        tr.appendChild(th);

        for (let j = 0; j < n; j++) {
            const td = document.createElement("td");
            td.style.textAlign = "center";
            const v = costos[i] && costos[i][j] != null ? costos[i][j] : "";
            // Si hay asignación en esta celda, mostrarla debajo del coste (resultado integrado)
            if (asignaciones && asignaciones[i] && asignaciones[i][j] && Number(asignaciones[i][j]) > 0) {
                // coste arriba y asignación abajo (pequeña y negrita)
                td.innerHTML = `<div style="font-weight:600;">${v}</div><div style="margin-top:6px;font-weight:800;color:var(--text-black);">${String(asignaciones[i][j])}</div>`;
            } else {
                td.textContent = v;
            }
            if (meta && meta.tipo === "columna_ficticia" && j === n - 1) td.classList.add("celda-ficticia");
            if (meta && meta.tipo === "fila_ficticia" && i === m - 1) td.classList.add("celda-ficticia");
            tr.appendChild(td);
        }

        const offTd = document.createElement("td");
        offTd.style.textAlign = "center";
        // mostrar oferta restante = oferta original - asignado en fila (si oferta no está definida, dejar vacío)
        if (Array.isArray(oferta) && oferta[i] != null) {
            const remaining = Number(oferta[i]) - asignPorFila[i];
            offTd.innerHTML = `<div>${String(remaining)}</div><div style="font-size:11px;color:#666;">(orig ${String(oferta[i])})</div>`;
        } else {
            offTd.textContent = "";
        }
        tr.appendChild(offTd);

        const penalTd = document.createElement("td");
        penalTd.style.textAlign = "center";
        const penalVal = pen_filas.find(p => p[1] === i);
        penalTd.textContent = penalVal ? String(penalVal[0]) : "";
        tr.appendChild(penalTd);

        tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    // tfoot: DEM row and Penal Col row (ordered)
    const tfoot = document.createElement("tfoot");

    const demRow = document.createElement("tr");
    const demTh = document.createElement("th");
    demTh.textContent = "DEM";
    demTh.style.textAlign = "center";
    demRow.appendChild(demTh);
    for (let j = 0; j < n; j++) {
        const td = document.createElement("td");
        td.style.textAlign = "center";
        // demanda restante = demanda original - asignado en columna
        if (Array.isArray(demanda) && demanda[j] != null) {
            const remaining = Number(demanda[j]) - asignPorCol[j];
            td.innerHTML = `<div>${String(remaining)}</div><div style="font-size:11px;color:#666;">(orig ${String(demanda[j])})</div>`;
        } else {
            td.textContent = "";
        }
        demRow.appendChild(td);
    }
    demRow.appendChild(document.createElement("td")); // OF. empty
    const penLabelTd = document.createElement("td");
    penLabelTd.style.textAlign = "center";
    penLabelTd.textContent = "Penal Col";
    demRow.appendChild(penLabelTd);
    tfoot.appendChild(demRow);

    const penRow = document.createElement("tr");
    const penTh = document.createElement("th");
    penTh.textContent = "Penal Col";
    penTh.style.textAlign = "center";
    penRow.appendChild(penTh);
    for (let j = 0; j < n; j++) {
        const td = document.createElement("td");
        td.style.textAlign = "center";
        const penalC = pen_cols.find(p => p[1] === j);
        td.textContent = penalC ? String(penalC[0]) : "";
        penRow.appendChild(td);
    }
    penRow.appendChild(document.createElement("td"));
    penRow.appendChild(document.createElement("td"));
    tfoot.appendChild(penRow);

    table.appendChild(tfoot);
    return table;
}

// crearTablaAsignaciones adaptada: resaltar celdas ficticias idem
function crearTablaAsignaciones(asignaciones, meta) {
    const table = document.createElement("table");
    table.classList.add("tabla-costos");

    // filas
    for (let i = 0; i < asignaciones.length; i++) {
        const tr = document.createElement("tr");
        for (let j = 0; j < asignaciones[i].length; j++) {
            const td = document.createElement("td");
            td.textContent = asignaciones[i][j];
            if (meta && meta.tipo === "columna_ficticia" && j === asignaciones[i].length - 1) {
                td.classList.add("celda-ficticia");
            }
            if (meta && meta.tipo === "fila_ficticia" && i === asignaciones.length - 1) {
                td.classList.add("celda-ficticia");
            }
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }
    return table;
}

// ===== Nuevo: renderCompactStep =====
// Dibuja un "cuadro" pequeño con los costos y la asignación del paso (muy poco texto).
function renderCompactStep(paso, costos, meta) {
    const container = document.createElement("div");
    container.classList.add("cuadro-step");

    const idxSpan = document.createElement("div");
    idxSpan.classList.add("cuadro-step-index");
    idxSpan.textContent = ""; // casi sin letras
    container.appendChild(idxSpan);

    const table = document.createElement("table");
    table.classList.add("cuadro-compacto");

    for (let i = 0; i < costos.length; i++) {
        const tr = document.createElement("tr");
        for (let j = 0; j < costos[i].length; j++) {
            const td = document.createElement("td");

            // coste guardado en dataset y tooltip pero no mostrado (imagen minimalista)
            const costDiv = document.createElement("div");
            costDiv.classList.add("cuadro-cost");
            costDiv.dataset.cost = String(costos[i][j]);
            costDiv.title = `Costo: ${costos[i][j]}`;
            costDiv.textContent = ""; // ocultamos visiblemente
            td.appendChild(costDiv);

            // detectar si es la celda elegida en este paso
            let chosen = false;
            if (paso) {
                const cel = paso.celda_elegida || paso.celda || paso.celda_elegida;
                if (Array.isArray(cel) && cel[0] === i && cel[1] === j) chosen = true;
            }
            const asignVal = paso && (paso.asignacion_realizada || paso.asignacion || paso.asignacion);
            if (chosen && asignVal !== undefined) {
                const asignDiv = document.createElement("div");
                asignDiv.classList.add("cuadro-assign");
                asignDiv.textContent = String(asignVal); // lo único visible grande
                td.appendChild(asignDiv);
                td.classList.add("cuadro-elegida");
            }

            // marcar ficticia si aplica
            if (meta && meta.tipo === "columna_ficticia" && j === costos[i].length - 1) {
                td.classList.add("celda-ficticia");
            }
            if (meta && meta.tipo === "fila_ficticia" && i === costos.length - 1) {
                td.classList.add("celda-ficticia");
            }

            tr.appendChild(td);
        }
        table.appendChild(tr);
    }

    container.appendChild(table);
    return container;
}

// ===== Nuevo helper: calcular costo total (Min Z) =====
function calcularCostoTotal(costos, asignaciones) {
    let total = 0;
    for (let i = 0; i < asignaciones.length; i++) {
        for (let j = 0; j < asignaciones[i].length; j++) {
            const a = asignaciones[i][j] || 0;
            const c = (costos[i] && costos[i][j] != null) ? Number(costos[i][j]) : 0;
            total += a * c;
        }
    }
    return total;
}

// ===== Nuevo helper: calcular detalle de costos por asignación =====
function calcularDetalleCosto(costos, asignaciones) {
    const detalles = [];
    let total = 0;
    for (let i = 0; i < asignaciones.length; i++) {
        for (let j = 0; j < asignaciones[i].length; j++) {
            const a = asignaciones[i][j] || 0;
            if (a > 0) {
                const c = (costos[i] && costos[i][j] != null) ? Number(costos[i][j]) : 0;
                const subtotal = a * c;
                detalles.push({from: i, to: j, cantidad: a, costo: c, subtotal});
                total += subtotal;
            }
        }
    }
    return {detalles, total};
}

// ===== Nuevo: render resultado limpio (imagen 9) =====
function renderResultadoLimpio(costos, asignaciones) {
    const cont = document.getElementById("resultado-limpio");
    if (!cont) return;
    cont.innerHTML = ""; // limpiar

    const {detalles, total} = calcularDetalleCosto(costos, asignaciones);

    // ordenar por fila (from) asc y columna (to) asc para consistencia
    detalles.sort((a,b) => (a.from - b.from) || (a.to - b.to));

    detalles.forEach(entry => {
        const row = document.createElement("div");
        row.classList.add("row");
        const left = document.createElement("div");
        left.textContent = `P${entry.from + 1} → C${entry.to + 1}`;
        left.classList.add("small");
        const mid = document.createElement("div");
        mid.classList.add("small");
        mid.textContent = `${entry.cantidad} × ${entry.costo}`;
        const right = document.createElement("div");
        right.textContent = `$ ${entry.subtotal}`;
        right.style.fontWeight = "700";
        row.appendChild(left);
        row.appendChild(mid);
        row.appendChild(right);
        cont.appendChild(row);
    });

    // total al final, estilo limpio parecido a imagen 8
    const totalRow = document.createElement("div");
    totalRow.classList.add("row");
    totalRow.style.borderTop = "1px dashed #eee";
    totalRow.style.marginTop = "8px";
    totalRow.style.paddingTop = "8px";
    const tlabel = document.createElement("div");
    tlabel.textContent = "Total";
    tlabel.style.fontWeight = "700";
    const tval = document.createElement("div");
    tval.textContent = `$ ${total}`;
    tval.style.fontWeight = "900";
    totalRow.appendChild(tlabel);
    totalRow.appendChild(document.createElement("div")); // spacer
    totalRow.appendChild(tval);
    cont.appendChild(totalRow);

    if (detalles.length === 0) {
        cont.textContent = "Sin asignaciones.";
    }
}

// ===== Nuevo: render distribución visual (imagen 10) =====
function renderDistribucionVisual(costos, asignaciones, meta) {
    const cont = document.getElementById("distribucion-visual");
    if (!cont) return;
    cont.innerHTML = ""; // limpiar

    // Encabezado
    const tabla = document.createElement("table");
    tabla.classList.add("distrib-table");

    // thead con C.D. indices
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.textContent = "";
    headRow.appendChild(corner);
    for (let j = 0; j < costos[0].length; j++) {
        const th = document.createElement("th");
        th.textContent = `C${j+1}`;
        headRow.appendChild(th);
    }
    const ofertaTh = document.createElement("th");
    ofertaTh.textContent = "OF.";
    headRow.appendChild(ofertaTh);
    thead.appendChild(headRow);
    tabla.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (let i = 0; i < costos.length; i++) {
        const tr = document.createElement("tr");
        const thFila = document.createElement("th");
        thFila.textContent = `P${i+1}`;
        tr.appendChild(thFila);

        for (let j = 0; j < costos[i].length; j++) {
            const td = document.createElement("td");
            td.textContent = ""; // mantendremos limpio; coste en tooltip
            td.title = `Costo: ${costos[i][j]}`;
            const a = (asignaciones[i] && asignaciones[i][j]) ? asignaciones[i][j] : 0;
            if (a && a > 0) {
                // badge con número y una flecha SVG pequeña
                const badge = document.createElement("div");
                badge.classList.add("distrib-assign");
                badge.textContent = a;

                // flecha SVG (dirección hacia la derecha para indicar flujo)
                const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                svg.setAttribute("width", "16");
                svg.setAttribute("height", "10");
                svg.setAttribute("viewBox", "0 0 16 10");
                svg.setAttribute("aria-hidden", "true");
                const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
                poly.setAttribute("points", "0,5 12,5 9,1 9,9");
                poly.setAttribute("fill", "#4caf50");
                svg.appendChild(poly);
                badge.appendChild(svg);

                td.appendChild(badge);
                td.classList.add("assigned");
            }
            if (meta && meta.tipo === "columna_ficticia" && j === costos[i].length - 1) {
                td.classList.add("celda-ficticia");
            }
            if (meta && meta.tipo === "fila_ficticia" && i === costos.length - 1) {
                td.classList.add("celda-ficticia");
            }
            tr.appendChild(td);
        }
        const ofertaTd = document.createElement("td");
        ofertaTd.textContent = ""; // opcional
        ofertaTd.classList.add("small");
        tr.appendChild(ofertaTd);

        tbody.appendChild(tr);
    }

    // fila demanda
    const foot = document.createElement("tr");
    const demandTh = document.createElement("th");
    demandTh.textContent = "DEM";
    foot.appendChild(demandTh);
    for (let j = 0; j < costos[0].length; j++) {
        let colSum = 0;
        for (let i = 0; i < costos.length; i++) {
            colSum += (asignaciones[i] && asignaciones[i][j]) ? asignaciones[i][j] : 0;
        }
        const td = document.createElement("td");
        td.textContent = colSum || "";
        foot.appendChild(td);
    }
    const totalTd = document.createElement("td");
    totalTd.textContent = ""; // total
    foot.appendChild(totalTd);

    tabla.appendChild(tbody);
    tabla.appendChild(foot);
    cont.appendChild(tabla);
}

// ===== Nuevo: render paso con 8 variantes (imagen 1..8) =====
function renderStepVisual(paso, costos, meta, idx) {
    // idx es 1..n (convertir a 1..8)
    const pos = ((idx - 1) % 8) + 1;
    const box = document.createElement("div");
    box.classList.add("step-visual");
    box.title = paso && paso.error ? paso.error : `Paso ${idx}`;

    // number badge (visiblemente grande para cada paso)
    const num = document.createElement("div");
    num.classList.add("step-number");
    num.textContent = String(pos);
    box.appendChild(num);

    const table = document.createElement("table");
    table.classList.add("cuadro-compacto");

    // helper para marcar celda elegida y penalizada
    const chosen = (paso && (paso.celda_elegida || paso.celda)) ? (paso.celda_elegida || paso.celda) : null;
    const tipoPen = paso && paso.tipo_penalizacion;
    const posPen = paso && (paso.posicion || paso.pos);

    for (let i = 0; i < costos.length; i++) {
        const tr = document.createElement("tr");
        for (let j = 0; j < costos[i].length; j++) {
            const td = document.createElement("td");
            td.classList.add("step-cell");
            td.style.position = "relative";

            // siempre mostrar una base tenue con el costo (evita celdas en blanco)
            const base = document.createElement("div");
            base.classList.add("cell-base");
            base.textContent = String(costos[i][j]);
            base.title = `Costo: ${costos[i][j]}`;
            td.appendChild(base);

            // distinto contenido según variante
            if (pos === 1) {
                if (tipoPen === "fila" && posPen === i) td.classList.add("resaltar-fila");
                if (tipoPen === "columna" && posPen === j) td.classList.add("resaltar-columna");
            }

            if (pos === 2) {
                if (Array.isArray(chosen) && chosen[0] === i && chosen[1] === j) td.classList.add("cuadro-elegida");
            }

            if (pos === 3) {
                if (Array.isArray(chosen) && chosen[0] === i && chosen[1] === j) {
                    const v = paso.asignacion_realizada || paso.asignacion;
                    const d = document.createElement("div");
                    d.classList.add("cuadro-assign");
                    d.textContent = v !== undefined ? String(v) : "";
                    td.appendChild(d);
                    td.classList.add("cuadro-elegida");
                }
            }

            if (pos === 4) {
                // además del punto, ya tenemos coste en base; hacemos el punto más visible
                const dot = document.createElement("div");
                dot.classList.add("cell-dot");
                td.appendChild(dot);
            }

            if (pos === 5) {
                if (j === 0 && paso && paso.oferta_restante) {
                    const badge = document.createElement("div");
                    badge.classList.add("mini-badge");
                    badge.textContent = paso.oferta_restante[i];
                    td.appendChild(badge);
                }
            }

            if (pos === 6) {
                if (i === 0 && paso && paso.demanda_restante) {
                    const badge = document.createElement("div");
                    badge.classList.add("mini-badge");
                    badge.textContent = paso.demanda_restante[j];
                    td.appendChild(badge);
                }
            }

            if (pos === 7) {
                if (Array.isArray(chosen) && chosen[0] === i && chosen[1] === j) td.classList.add("cuadro-elegida");
                if (Array.isArray(chosen) && chosen[0] === i) td.classList.add("resaltar-fila");
                if (Array.isArray(chosen) && chosen[1] === j) td.classList.add("resaltar-columna");
            }

            if (pos === 8) {
                // mostramos coste (base) y asignación pequeña si aplica
                if (Array.isArray(chosen) && chosen[0] === i && chosen[1] === j) {
                    const v = paso.asignacion_realizada || paso.asignacion;
                    const small = document.createElement("div");
                    small.classList.add("cuadro-assign-small");
                    small.textContent = v !== undefined ? String(v) : "";
                    td.appendChild(small);
                    td.classList.add("cuadro-elegida");
                }
            }

            // marcar ficticias si aplica
            if (meta && meta.tipo === "columna_ficticia" && j === costos[i].length - 1) td.classList.add("celda-ficticia");
            if (meta && meta.tipo === "fila_ficticia" && i === costos.length - 1) td.classList.add("celda-ficticia");

            tr.appendChild(td);
        }
        table.appendChild(tr);
    }

    box.appendChild(table);
    return box;
}

// ===== Modificación: mostrarPasos limita a 8 pasos visibles (más grande) =====
function mostrarPasos(data, costos) {
    const resultadoDiv = document.getElementById("resultado");
    if (!resultadoDiv) return;
    resultadoDiv.innerHTML = "";

    if (data && Array.isArray(data.asignaciones)) {
        const minZCont = document.getElementById("minZ");
        if (minZCont) {
            // Usar el helper existente para obtener detalle y total
            const detalle = calcularDetalleCosto(costos || [], data.asignaciones);
            const detalles = detalle.detalles || [];
            const total = detalle.total || 0;

            // construir fórmula compacta (ej: "21×200 + 15×50 + ...")
            const terms = detalles.map(d => `${d.costo}×${d.cantidad}`);
            const formulaStr = terms.join(' + ');

            // breakdown (opcional): mostrar cada término en lista
            const breakdownHtml = detalles.map(d => `${d.costo} × ${d.cantidad} = ${d.subtotal}`).join('<br>');

            minZCont.innerHTML = `
                <div class="minz-left">
                    <div class="label">Min Z</div>
                    <div class="minz-total">${total}</div>
                </div>
                <div class="minz-right">
                    <div class="minz-formula">${formulaStr || ''}</div>
                    <div class="minz-breakdown" aria-hidden="false">${breakdownHtml}</div>
                </div>
            `;
        }

        renderResultadoLimpio(costos || [], data.asignaciones);
        renderDistribucionVisual(costos || [], data.asignaciones, data.meta_balance || null);
    }

    // 1) Mostrar tablas HTML detalladas por paso (las genera el backend en pasos_html)
    if (data && Array.isArray(data.pasos_html) && data.pasos_html.length > 0) {
        const pasosContainer = document.createElement("div");
        pasosContainer.id = "pasos-detallados";
        pasosContainer.style.marginTop = "12px";
        // insertar cada paso_html tal cual (es HTML seguro generado por backend)
        data.pasos_html.forEach((htmlStr) => {
            const wrapper = document.createElement("div");
            wrapper.innerHTML = htmlStr;
            pasosContainer.appendChild(wrapper);
        });
        resultadoDiv.appendChild(pasosContainer);
    }

    // 2) Mantener la secuencia visual/compacta (si deseas) o el overlay
    const seq = document.createElement("div");
    seq.classList.add("steps-sequence");

    if (data && Array.isArray(data.pasos) && data.pasos.length > 0) {
        const maxSteps = Math.min(8, data.pasos.length);
        for (let k = 0; k < maxSteps; k++) {
            const paso = data.pasos[k];
            const visual = renderStepVisual(paso, costos || [], data.meta_balance || null, k + 1);
            seq.appendChild(visual);
        }
        if (data.pasos.length > maxSteps) {
            const moreBox = document.createElement("div");
            moreBox.classList.add("step-visual");
            moreBox.style.minWidth = "120px";
            moreBox.style.display = "flex";
            moreBox.style.alignItems = "center";
            moreBox.style.justifyContent = "center";
            moreBox.innerHTML = `<div style="font-weight:800;color:#666;font-size:18px">+${data.pasos.length - maxSteps}</div>`;
            seq.appendChild(moreBox);
        }
    } else {
        const info = document.createElement("p");
        info.style.color = "#666";
        info.textContent = "No hay pasos a mostrar.";
        resultadoDiv.appendChild(info);
    }

    resultadoDiv.appendChild(seq);

    // abrir overlay automáticamente
    if (data && Array.isArray(data.pasos) && data.pasos.length > 0) {
        openStepOverlay(data.pasos, costos, data.meta_balance);
    }
}

// ===== Nuevo: render preview de la matriz ingresada (formato C1..Cn, P1..Pm, OF., DEM, Penal Col) =====
function renderInputPreview(rawCostos, rawOferta, rawDemanda) {
    const preview = document.getElementById("input-preview");
    if (!preview) return;
    preview.innerHTML = "";

    let costos, oferta, demanda;
    try {
        costos = JSON.parse(rawCostos);
        oferta = JSON.parse(rawOferta);
        demanda = JSON.parse(rawDemanda);
    } catch (e) {
        preview.innerHTML = `<div style="color:${'#d9534f'}">JSON inválido — muestra previa no disponible.</div>`;
        return;
    }

    if (!Array.isArray(costos) || costos.length === 0) {
        preview.innerHTML = `<div style="color:#666">Matriz de costos vacía o inválida.</div>`;
        return;
    }

    const m = costos.length;
    const n = (costos[0] || []).length;

    const table = document.createElement("table");
    table.classList.add("tabla-visual");
    table.style.marginBottom = "6px";
    table.style.width = "100%";

    // encabezado: C1..Cn + OF. + Penal Fila
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.textContent = "";
    headRow.appendChild(corner);
    for (let j = 0; j < n; j++) {
        const th = document.createElement("th");
        th.textContent = `C${j+1}`;
        th.style.textAlign = "center";
        headRow.appendChild(th);
    }
    const ofertaTh = document.createElement("th");
    ofertaTh.textContent = "OF.";
    ofertaTh.style.textAlign = "center";
    const penalTh = document.createElement("th");
    penalTh.textContent = "Penal Fila";
    penalTh.style.textAlign = "center";
    headRow.appendChild(ofertaTh);
    headRow.appendChild(penalTh);
    thead.appendChild(headRow);
    table.appendChild(thead);

    // cuerpo: filas P1..Pm con costos y oferta
    const tbody = document.createElement("tbody");
    for (let i = 0; i < m; i++) {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = `P${i+1}`;
        th.style.textAlign = "center";
        tr.appendChild(th);

        for (let j = 0; j < n; j++) {
            const td = document.createElement("td");
            td.textContent = costos[i][j];
            td.style.textAlign = "center";
            tr.appendChild(td);
        }

        const offTd = document.createElement("td");
        offTd.textContent = (Array.isArray(oferta) && oferta[i] != null) ? oferta[i] : "";
        offTd.style.textAlign = "center";
        tr.appendChild(offTd);

        const penalTd = document.createElement("td");
        penalTd.textContent = ""; // calculable más adelante
        penalTd.style.textAlign = "center";
        tr.appendChild(penalTd);

        tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    // pie: DEM row
    const tfoot = document.createElement("tfoot");
    const demRow = document.createElement("tr");
    const demTh = document.createElement("th");
    demTh.textContent = "DEM";
    demTh.style.textAlign = "center";
    demRow.appendChild(demTh);
    for (let j = 0; j < n; j++) {
        const td = document.createElement("td");
        td.textContent = (Array.isArray(demanda) && demanda[j] != null) ? demanda[j] : "";
        td.style.textAlign = "center";
        demRow.appendChild(td);
    }
    demRow.appendChild(document.createElement("td")); // OF. col empty
    demRow.appendChild(document.createElement("td")); // Penal Fila label cell
    tfoot.appendChild(demRow);

    // fila Penal Col (vacía para preview)
    const penRow = document.createElement("tr");
    const penTh = document.createElement("th");
    penTh.textContent = "Penal Col";
    penTh.style.textAlign = "center";
    penRow.appendChild(penTh);
    for (let j = 0; j < n; j++) {
        const td = document.createElement("td");
        td.textContent = "";
        td.style.textAlign = "center";
        penRow.appendChild(td);
    }
    penRow.appendChild(document.createElement("td"));
    penRow.appendChild(document.createElement("td"));
    tfoot.appendChild(penRow);

    table.appendChild(tfoot);
    preview.appendChild(table);
}

// Bind del botón y manejo de errores + preview listeners
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnResolver');
    const resultadoDiv = document.getElementById('resultado');
    if (!btn) return;

    // inicializar preview con valores actuales
    const costosField = document.getElementById('costos');
    const ofertaField = document.getElementById('oferta');
    const demandaField = document.getElementById('demanda');

    if (costosField && ofertaField && demandaField) {
        // render inicial
        renderInputPreview(costosField.value, ofertaField.value, demandaField.value);
        // actualizar al cambiar cualquiera de los campos (input / textarea)
        costosField.addEventListener('input', () => renderInputPreview(costosField.value, ofertaField.value, demandaField.value));
        ofertaField.addEventListener('input', () => renderInputPreview(costosField.value, ofertaField.value, demandaField.value));
        demandaField.addEventListener('input', () => renderInputPreview(costosField.value, ofertaField.value, demandaField.value));
    }

    btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        try {
            resultadoDiv.textContent = 'Procesando...';
            await ejecutarResolucion();
        } catch (err) {
            console.error(err);
            resultadoDiv.innerHTML = `<p style="color:red">❌ Error local: ${err.message || err}</p>`;
        }
    });
});

// ===== Nuevo: crear overlay paso a paso (full-screen) =====
function createStepOverlay() {
    // si ya existe, devolver
    let existing = document.getElementById("step-overlay");
    if (existing) return existing;

    const overlay = document.createElement("div");
    overlay.id = "step-overlay";
    overlay.className = "step-overlay";

    overlay.innerHTML = `
        <div class="overlay-topbar">
            <button id="overlay-close" class="overlay-btn">Cerrar ✕</button>
            <div class="overlay-title">Vogel — Paso a paso</div>
            <div style="flex:1"></div>
            <button id="overlay-prev" class="overlay-btn">◀</button>
            <button id="overlay-next" class="overlay-btn">▶</button>
        </div>
        <div id="overlay-content" class="overlay-content"></div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("overlay-close").addEventListener("click", () => overlay.style.display = "none");
    document.getElementById("overlay-prev").addEventListener("click", () => navigateStep(-1));
    document.getElementById("overlay-next").addEventListener("click", () => navigateStep(1));

    return overlay;
}

let _overlayState = { pasos: [], costos: [], idx: 0 };

function openStepOverlay(pasos, costos, meta) {
    const overlay = createStepOverlay();
    overlay.style.display = "flex";
    _overlayState.pasos = pasos || [];
    _overlayState.costos = costos || [];
    _overlayState.meta = meta || null;
    _overlayState.idx = 0;
    renderOverlayStep(0);
}

function navigateStep(delta) {
    if (!_overlayState.pasos.length) return;
    _overlayState.idx = Math.max(0, Math.min(_overlayState.pasos.length - 1, _overlayState.idx + delta));
    renderOverlayStep(_overlayState.idx);
}

function renderOverlayStep(index) {
    const content = document.getElementById("overlay-content");
    if (!content) return;
    content.innerHTML = ""; // limpiar

    const paso = _overlayState.pasos[index];
    const costos = _overlayState.costos;
    const meta = _overlayState.meta;

    // izquierda: matriz grande con celda elegida resaltada
    const left = document.createElement("div");
    left.className = "overlay-left";

    // construir tabla de contexto (costos + asignación temporal)
    const table = document.createElement("table");
    table.className = "overlay-table";
    const tbody = document.createElement("tbody");

    for (let i = 0; i < costos.length; i++) {
        const tr = document.createElement("tr");
        for (let j = 0; j < costos[i].length; j++) {
            const td = document.createElement("td");
            td.textContent = costos[i][j];
            td.title = `Costo ${costos[i][j]}`;
            // resaltar si es la celda elegida
            if (paso && paso.celda_elegida && paso.celda_elegida[0] === i && paso.celda_elegida[1] === j) {
                td.classList.add("overlay-cell-chosen");
                // mostrar asignación en grande
                const badge = document.createElement("div");
                badge.className = "overlay-assign-badge";
                badge.textContent = paso.asignacion_realizada || paso.asignacion || "";
                td.appendChild(badge);
            }
            // marcar ficticia
            if (meta && meta.tipo === "columna_ficticia" && j === costos[i].length - 1) td.classList.add("celda-ficticia");
            if (meta && meta.tipo === "fila_ficticia" && i === costos.length - 1) td.classList.add("celda-ficticia");
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    left.appendChild(table);

    // derecha: detalles textuales y penalizaciones
    const right = document.createElement("div");
    right.className = "overlay-right";

    const h = document.createElement("h2");
    h.textContent = `Paso ${paso.paso_num || (index+1)}`;
    right.appendChild(h);

    // penalizaciones
    const penTitle = document.createElement("div");
    penTitle.className = "overlay-section-title";
    penTitle.textContent = "Penalizaciones";
    right.appendChild(penTitle);

    const pf = paso.penalizaciones_filas || paso.penal_filas || [];
    const pc = paso.penalizaciones_columnas || paso.penal_columnas || [];

    const ulF = document.createElement("ul");
    ulF.className = "pen-list";
    (pf || []).forEach(p => {
        const li = document.createElement("li");
        li.textContent = `F${p.fila} → penal = ${p.penal}`;
        ulF.appendChild(li);
    });
    right.appendChild(document.createElement("div").appendChild(document.createTextNode("Filas:")));
    right.appendChild(ulF);

    const ulC = document.createElement("ul");
    ulC.className = "pen-list";
    (pc || []).forEach(p => {
        const li = document.createElement("li");
        li.textContent = `C${p.columna} → penal = ${p.penal}`;
        ulC.appendChild(li);
    });
    right.appendChild(document.createElement("div").appendChild(document.createTextNode("Columnas:")));
    right.appendChild(ulC);

    // tie info
    if (paso.tie_info) {
        const tie = document.createElement("div");
        tie.className = "overlay-tie";
        tie.textContent = `Desempate: ${paso.tie_info.reason || JSON.stringify(paso.tie_info)}`;
        right.appendChild(tie);
    }

    // elección y estado
    const info = document.createElement("div");
    info.className = "overlay-info";
    info.innerHTML = `
        <p><strong>Tipo penalización:</strong> ${paso.tipo_penalizacion || "-"}</p>
        <p><strong>Posición elegida:</strong> ${paso.posicion != null ? paso.posicion : "-"}</p>
        <p><strong>Celda elegida:</strong> ${paso.celda_elegida ? '['+paso.celda_elegida.join(',')+']' : '-'}</p>
        <p><strong>Costo celda:</strong> ${paso.costo_celda != null ? paso.costo_celda : '-'}</p>
        <p><strong>Asignación:</strong> ${paso.asignacion_realizada != null ? paso.asignacion_realizada : (paso.asignacion!=null?paso.asignacion:'-')}</p>
        <p><strong>Oferta antes:</strong> ${JSON.stringify(paso.oferta_restante || '-')}</p>
        <p><strong>Demanda antes:</strong> ${JSON.stringify(paso.demanda_restante || '-')}</p>
    `;
    right.appendChild(info);

    // si hay error en paso
    if (paso.error) {
        const err = document.createElement("div");
        err.className = "overlay-error";
        err.textContent = `Error: ${paso.error}`;
        right.appendChild(err);
    }

    content.appendChild(left);
    content.appendChild(right);
}