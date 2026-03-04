import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
    token: string;
};

export function InventoryScreen({ token }: Props) {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Listado de articulos</Text>
            <Text style={styles.meta}>Token activo: {token.slice(0, 12)}...</Text>
            <Text style={styles.note}>TODO: sincronizar articulos locales con /sync/pull y mostrar estado offline.</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#ffffff', borderRadius: 8, padding: 12 },
    title: { fontSize: 18, fontWeight: '700', color: '#102a43' },
    meta: { marginTop: 6, color: '#627d98' },
    note: { marginTop: 10, color: '#334e68' }
});
