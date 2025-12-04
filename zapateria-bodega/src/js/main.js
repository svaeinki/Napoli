// ============================================
// INICIALIZACIÓN PRINCIPAL
// ============================================

window.onload = async function() {
    console.log('🚀 Aplicación iniciada');
    
    // Esperar a que los templates se carguen
    await new Promise(resolve => {
        if (document.getElementById('formIngresar')) {
            resolve();
        } else {
            setTimeout(resolve, 500);
        }
    });
    
    await actualizarInventario();
    await verificarDropbox();
};

console.log('✅ Módulos cargados correctamente');