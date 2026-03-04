import React, { useMemo, useState } from 'react';
import { SafeAreaView, View, Text, Pressable, StyleSheet } from 'react-native';
import { LoginScreen } from './src/screens/LoginScreen';
import { InventoryScreen } from './src/screens/InventoryScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { NewItemScreen } from './src/screens/NewItemScreen';

const tabs = ['inventory', 'search', 'new-item'] as const;
type Tab = typeof tabs[number];

export default function App() {
    const [token, setToken] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>('inventory');

    const content = useMemo(() => {
        if (tab === 'inventory') return <InventoryScreen token={token!} />;
        if (tab === 'search') return <SearchScreen token={token!} />;
        return <NewItemScreen token={token!} />;
    }, [tab, token]);

    if (!token) {
        return <LoginScreen onAuth={setToken} />;
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Napoli Mobile Experiment</Text>
                <Text style={styles.subtitle}>Offline-first scaffold</Text>
            </View>

            <View style={styles.tabs}>
                <Pressable onPress={() => setTab('inventory')} style={[styles.tab, tab === 'inventory' && styles.tabActive]}>
                    <Text style={styles.tabLabel}>Listado</Text>
                </Pressable>
                <Pressable onPress={() => setTab('search')} style={[styles.tab, tab === 'search' && styles.tabActive]}>
                    <Text style={styles.tabLabel}>Busqueda</Text>
                </Pressable>
                <Pressable onPress={() => setTab('new-item')} style={[styles.tab, tab === 'new-item' && styles.tabActive]}>
                    <Text style={styles.tabLabel}>Ingresar</Text>
                </Pressable>
            </View>

            <View style={styles.content}>{content}</View>

            <Pressable style={styles.logout} onPress={() => setToken(null)}>
                <Text style={styles.logoutLabel}>Cerrar sesion</Text>
            </Pressable>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { padding: 16, paddingBottom: 10 },
    title: { fontSize: 22, fontWeight: '700', color: '#1f2933' },
    subtitle: { color: '#52606d', marginTop: 4 },
    tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
    tab: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#d9e2ec', alignItems: 'center' },
    tabActive: { backgroundColor: '#486581' },
    tabLabel: { color: '#102a43', fontWeight: '600' },
    content: { flex: 1, padding: 12 },
    logout: { margin: 12, borderRadius: 8, backgroundColor: '#d64545', padding: 12, alignItems: 'center' },
    logoutLabel: { color: '#ffffff', fontWeight: '700' }
});
