import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/**
 * Storage adapter compatível com Supabase Auth
 * Usa Capacitor Preferences no mobile (persistente) e localStorage no web
 * 
 * Isso resolve o problema de logout automático no app mobile,
 * pois o localStorage pode não persistir corretamente no Android
 */
class CapacitorStorage {
    private isNative = Capacitor.isNativePlatform();

    async getItem(key: string): Promise<string | null> {
        if (this.isNative) {
            const { value } = await Preferences.get({ key });
            return value;
        }
        return localStorage.getItem(key);
    }

    async setItem(key: string, value: string): Promise<void> {
        if (this.isNative) {
            await Preferences.set({ key, value });
        } else {
            localStorage.setItem(key, value);
        }
    }

    async removeItem(key: string): Promise<void> {
        if (this.isNative) {
            await Preferences.remove({ key });
        } else {
            localStorage.removeItem(key);
        }
    }
}

export const capacitorStorage = new CapacitorStorage();
