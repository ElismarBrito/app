import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface PbxMobilePlugin {
  /**
   * Request all required permissions at once
   */
  requestAllPermissions(): Promise<{ granted: boolean }>;

  /**
   * Get available SIM cards from device
   */
  getSimCards(): Promise<{ simCards: SimCardInfo[] }>;

  /**
   * Request ROLE_DIALER permission from user
   */
  requestRoleDialer(): Promise<{ granted: boolean }>;

  /**
   * Check if app has ROLE_DIALER permission
   */
  hasRoleDialer(): Promise<{ hasRole: boolean }>;

  /**
   * Start a phone call
   */
  startCall(options: { number: string; simId?: string }): Promise<{ callId: string }>;

  /**
   * End a specific call
   */
  endCall(options: { callId: string }): Promise<void>;

  /**
   * Merge active calls into conference
   */
  mergeActiveCalls(): Promise<{ conferenceId: string }>;

  /**
   * Get list of active calls
   */
  getActiveCalls(): Promise<{ calls: CallInfo[] }>;

  /**
   * Register phone account for this app
   */
  registerPhoneAccount(options: { accountLabel: string }): Promise<void>;

  /**
   * Start automated calling for a number list
   */
  startAutomatedCalling(options: { 
    numbers: string[], 
    deviceId: string,
    listId: string,
    simId?: string
  }): Promise<{ sessionId: string }>;

  /**
   * Stop automated calling session
   */
  stopAutomatedCalling(options: { sessionId: string }): Promise<void>;

  /**
   * Add listener for call state changes
   */
  addListener(
    eventName: 'callStateChanged',
    listenerFunc: (event: CallStateEvent) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Add listener for conference events
   */
  addListener(
    eventName: 'conferenceEvent',
    listenerFunc: (event: ConferenceEvent) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Add listener for generic call events
   */
  addListener(
    eventName: 'callEvent',
    listenerFunc: (event: any) => void, // Use 'any' for now, can be typed later
  ): Promise<PluginListenerHandle>;

  /**
   * Add listener for active calls list changes
   */
  addListener(
    eventName: 'activeCallsChanged',
    listenerFunc: (event: { calls: CallInfo[] }) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Remove all listeners
   */
  removeAllListeners(): Promise<void>;
}

export interface CallInfo {
  callId: string;
  number: string;
  state: 'dialing' | 'ringing' | 'active' | 'held' | 'disconnected';
  isConference: boolean;
  startTime?: number;
}

export interface CallStateEvent {
  callId: string;
  state: string;
  number: string;
}

export interface ConferenceEvent {
  conferenceId: string;
  event: 'created' | 'destroyed' | 'participantAdded' | 'participantRemoved';
  participants: string[];
}

export interface SimCardInfo {
  id: string;
  slotIndex: number;
  displayName: string;
  carrierName: string;
  phoneNumber: string;
  iccId: string;
  isEmbedded: boolean;
  type: 'physical' | 'esim';
  subscriptionId?: number;
}

const PbxMobile = registerPlugin<PbxMobilePlugin>('PbxMobile', {
  web: () => import('./web').then(m => new m.PbxMobileWeb()),
});

export default PbxMobile;