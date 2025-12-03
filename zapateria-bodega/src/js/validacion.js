// ============================================
// VALIDACIÓN DE RUT CHILENO
// ============================================

function validarRUT(rut) {
    rut = rut.replace(/\./g, '').replace(/-/g, '');
    
    if (rut.length < 2) return false;
    
    const cuerpo = rut.slice(0, -1);
    const dv = rut.slice(-1).toUpperCase();
    
    if (!/^\d+$/.test(cuerpo)) return false;
    
    let suma = 0;
    let multiplicador = 2;
    
    for (let i = cuerpo.length - 1; i >= 0; i--) {
        suma += parseInt(cuerpo[i]) * multiplicador;
        multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
    }
    
    const dvEsperado = 11 - (suma % 11);
    let dvCalculado;
    
    if (dvEsperado === 11) dvCalculado = '0';
    else if (dvEsperado === 10) dvCalculado = 'K';
    else dvCalculado = dvEsperado.toString();
    
    return dv === dvCalculado;
}

function formatearRUT(rut) {
    rut = rut.replace(/[^\dKk]/g, '').toUpperCase();
    
    if (rut.length < 2) return rut;
    
    const cuerpo = rut.slice(0, -1);
    const dv = rut.slice(-1);
    
    let rutFormateado = '';
    let contador = 0;
    
    for (let i = cuerpo.length - 1; i >= 0; i--) {
        rutFormateado = cuerpo[i] + rutFormateado;
        contador++;
        if (contador === 3 && i !== 0) {
            rutFormateado = '.' + rutFormateado;
            contador = 0;
        }
    }
    
    return rutFormateado + '-' + dv;
}

function validarRUTEnTiempoReal(input) {
    const rut = input.value.trim();
    const errorElement = document.getElementById('rutError');
    
    if (rut.length === 0) {
        input.classList.remove('valid', 'invalid');
        if (errorElement) errorElement.style.display = 'none';
        return;
    }
    
    if (validarRUT(rut)) {
        input.classList.remove('invalid');
        input.classList.add('valid');
        if (errorElement) errorElement.style.display = 'none';
        input.value = formatearRUT(rut);
    } else {
        input.classList.remove('valid');
        input.classList.add('invalid');
        if (errorElement) errorElement.style.display = 'block';
    }
}