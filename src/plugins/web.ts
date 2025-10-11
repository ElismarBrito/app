import { WebPlugin, PluginListenerHandle } from '@capacitor/core';
import type { PbxMobilePlugin, CallInfo, CallStateEvent, ConferenceEvent, SimCardInfo } from './pbx-mobile';

export class PbxMobileWeb extends WebPlugin implements PbxMobilePlugin {
  async requestAllPermissions(): Promise<{ granted: boolean }> {
    console.log('Web: requestAllPermissions - web implementation');
    return { granted: true };
  }

  async getSimCards(): Promise<{ simCards: SimCardInfo[] }> {
    // Web fallback - return mock data for testing
    console.log('Web: getSimCards - returning mock data');
    return {
      simCards: [
        {
          id: 'web-sim-1',
          slotIndex: 0,
          displayName: 'SIM Principal',
          carrierName: 'Operadora Web',
          phoneNumber: '',
          iccId: '',
          isEmbedded: false,
          type: 'physical'
        }
      ]
    };
  }

  async requestRoleDialer(): Promise<{ granted: boolean }> {
    console.log('Web: requestRoleDialer - not available on web');
    return { granted: false };
  }

  async hasRoleDialer(): Promise<{ hasRole: boolean }> {
    return { hasRole: false };
  }

  async startCall(options: { number: string }): Promise<{ callId: string }> {
    console.log('Web: startCall', options.number);
    // On web, open tel: link as fallback
    window.open(`tel:${options.number}`, '_blank');
    return { callId: `web-${Date.now()}` };
  }

  async endCall(options: { callId: string }): Promise<void> {
    console.log('Web: endCall', options.callId);
  }

  async mergeActiveCalls(): Promise<{ conferenceId: string }> {
    console.log('Web: mergeActiveCalls - not available on web');
    return { conferenceId: `web-conf-${Date.now()}` };
  }

  async getActiveCalls(): Promise<{ calls: CallInfo[] }> {
    return { calls: [] };
  }

  async registerPhoneAccount(options: { accountLabel: string }): Promise<void> {
    console.log('Web: registerPhoneAccount', options.accountLabel);
  }

  async startAutomatedCalling(options: { 
    numbers: string[], 
    deviceId: string,
    listId: string 
  }): Promise<{ sessionId: string }> {
    console.log('Web: startAutomatedCalling', options);
    return { sessionId: `web-session-${Date.now()}` };
  }

  async stopAutomatedCalling(options: { sessionId: string }): Promise<void> {
    console.log('Web: stopAutomatedCalling', options.sessionId);
  }

  async addListener(
    eventName: 'callStateChanged',
    listenerFunc: (event: CallStateEvent) => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: 'conferenceEvent',
    listenerFunc: (event: ConferenceEvent) => void,
  ): Promise<PluginListenerHandle>;
  async addListener(eventName: string, listenerFunc: (event: any) => void): Promise<PluginListenerHandle> {
    console.log(`Web: addListener for ${eventName}`);
    // Return a dummy listener handle for web
    return {
      remove: async () => {
        console.log(`Web: removing listener for ${eventName}`);
      }
    };
  }

  async removeAllListeners(): Promise<void> {
    console.log('Web: removeAllListeners');
    // No-op for web
  }
}