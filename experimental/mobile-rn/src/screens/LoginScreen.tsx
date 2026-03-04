import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { ApiClient } from '../api/client';

const api = new ApiClient({ baseUrl: 'http://localhost:4500' });

type Props = {
    onAuth: (token: string) => void;
};

export function LoginScreen({ onAuth }: Props) {
    const [username, setUsername] = useState('admin');
    const [password, setPassword] = useState('admin123');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function doLogin() {
        setLoading(true);
        setError(null);
        try {
            const token = await api.login(username, password);
            onAuth(token);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
        } finally {
            setLoading(false);
        }
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Login Napoli</Text>
            <TextInput value={username} onChangeText={setUsername} style={styles.input} placeholder="Usuario" />
            <TextInput value={password} secureTextEntry onChangeText={setPassword} style={styles.input} placeholder="Password" />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable onPress={doLogin} style={styles.button} disabled={loading}>
                <Text style={styles.buttonLabel}>{loading ? 'Ingresando...' : 'Entrar'}</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: '#f4f6f8' },
    title: { fontSize: 24, fontWeight: '700', marginBottom: 12, color: '#102a43' },
    input: { backgroundColor: '#ffffff', borderRadius: 8, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#bcccdc' },
    button: { backgroundColor: '#486581', borderRadius: 8, padding: 12, alignItems: 'center' },
    buttonLabel: { color: '#ffffff', fontWeight: '700' },
    error: { color: '#d64545', marginBottom: 8 }
});
