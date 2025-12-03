// ============================================
// INICIALIZACIÓN PRINCIPAL
// ============================================

window.onload = async function() {
    console.log('🚀 Aplicación iniciada');
    await actualizarInventario();
    await verificarDropbox();
};

console.log('✅ Módulos cargados correctamente');