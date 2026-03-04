import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
    token: string;
};

export function SearchScreen({ token }: Props) {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Busqueda</Text>
            <Text style={styles.meta}>Sesion: {token.slice(0, 12)}...</Text>
            <Text style={styles.note}>TODO: implementar filtros por RUT, cliente y ubicacion.</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#ffffff', borderRadius: 8, padding: 12 },
    title: { fontSize: 18, fontWeight: '700', color: '#102a43' },
    meta: { marginTop: 6, color: '#627d98' },
    note: { marginTop: 10, color: '#334e68' }
});
