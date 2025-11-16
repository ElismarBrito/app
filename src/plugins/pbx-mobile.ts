import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export type { PluginListenerHandle };

// ==================== ENUMS E TIPOS ====================

/**
 * Representa o estado de uma chamada individual dentro do Power Dialer.
 * Mapeado do PowerDialerManager.CallState no Kotlin.
 */
export enum DialerCallState {
  DIALING = 'dialing',
  RINGING = 'ringing',
  ACTIVE = 'active',
  HOLDING = 'holding',
  DISCONNECTED = 'disconnected',
  FAILED = 'failed',
  BUSY = 'busy',
  NO_ANSWER = 'no_answer',
  REJECTED = 'rejected',
  UNREACHABLE = 'unreachable',
}

/**
 * Informações básicas sobre uma chamada ativa gerenciada pelo Telecom Framework.
 */
export interface CallInfo {
  callId: string;
  number: string;
  state: 'dialing' | 'ringing' | 'active' | 'held' | 'disconnected';
  isConference: boolean;
  startTime?: number;
}

/**
 * Informações sobre um SIM card disponível no dispositivo.
 */
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

/**
 * Resultado detalhado de uma única tentativa de chamada dentro de uma campanha.
 * Mapeado de PowerDialerManager.CallResult.
 */
export interface CallResult {
  number: string;
  callId: string;
  attemptNumber: number;
  state: DialerCallState;
  startTime: number;
  endTime: number;
  duration: number;
  disconnectCause?: string;
  willRetry: boolean;
}

/**
 * Progresso em tempo real de uma campanha de discagem.
 * Mapeado de PowerDialerManager.CampaignProgress.
 */
export interface CampaignProgress {
  sessionId: string;
  totalNumbers: number;
  completedNumbers: number;
  activeCallsCount: number;
  successfulCalls: number;
  failedCalls: number;
  pendingNumbers: number;
  progressPercentage: number;
  dialingNumbers: string[];
}

/**
 * Sumário final com os resultados consolidados de uma campanha.
 * Mapeado de PowerDialerManager.CampaignSummary.
 */
export interface CampaignSummary {
  sessionId: string;
  totalNumbers: number;
  totalAttempts: number;
  successfulCalls: number;
  failedCalls: number;
  notAnswered: number;
  busy: number;
  unreachable: number;
  duration: number;
  results: CallResult[];
}

// ==================== EVENTOS ====================

/**
 * Evento disparado para mudanças de estado em chamadas normais (não-campanha).
 */
export interface CallStateEvent {
  callId: string;
  state: string;
  number: string;
}

/**
 * Evento para conferências.
 */
export interface ConferenceEvent {
  conferenceId: string;
  event: 'created' | 'destroyed' | 'participantAdded' | 'participantRemoved';
  participants: string[];
}

// ==================== INTERFACE DO PLUGIN ====================

export interface PbxMobilePlugin {
  // --- Gerenciamento Básico ---
  requestAllPermissions(): Promise<{ granted: boolean }>;
  getSimCards(): Promise<{ simCards: SimCardInfo[] }>;
  
  // --- Funções de Discador (ROLE_DIALER) ---
  requestRoleDialer(): Promise<{ granted: boolean }>;
  hasRoleDialer(): Promise<{ hasRole: boolean }>;
  registerPhoneAccount(options: { accountLabel: string }): Promise<void>;

  // --- Controle de Chamada Manual ---
  startCall(options: { number: string; simId?: string }): Promise<{ callId: string }>;
  endCall(options: { callId: string }): Promise<void>;
  mergeActiveCalls(): Promise<{ conferenceId: string }>;
  getActiveCalls(): Promise<{ calls: CallInfo[] }>;

  // --- Power Dialer (Motor de Campanha) ---
  startCampaign(options: {
    numbers: string[];
    deviceId: string;
    listId: string;
    listName: string;
    simId?: string;
  }): Promise<{ sessionId: string }>;
  
  pauseCampaign(): Promise<void>;
  resumeCampaign(): Promise<void>;
  stopCampaign(): Promise<void>;

  // --- Listeners de Eventos ---
  addListener(
    eventName: 'callStateChanged',
    listenerFunc: (event: CallStateEvent) => void,
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'conferenceEvent',
    listenerFunc: (event: ConferenceEvent) => void,
  ): Promise<PluginListenerHandle>;
  
  addListener(
    eventName: 'activeCallsChanged',
    listenerFunc: (event: { calls: CallInfo[] }) => void,
  ): Promise<PluginListenerHandle>;

  // --- Listeners do Power Dialer ---
  addListener(
    eventName: 'dialerCampaignProgress',
    listenerFunc: (progress: CampaignProgress) => void,
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'dialerCampaignCompleted',
    listenerFunc: (summary: CampaignSummary) => void,
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'dialerCallStateChanged',
    listenerFunc: (result: CallResult) => void,
  ): Promise<PluginListenerHandle>;

  removeAllListeners(): Promise<void>;
}

// ==================== REGISTRO DO PLUGIN ====================

const PbxMobile = registerPlugin<PbxMobilePlugin>('PbxMobile', {
  web: () => import('./web').then(m => new m.PbxMobileWeb()),
});

export default PbxMobile;
