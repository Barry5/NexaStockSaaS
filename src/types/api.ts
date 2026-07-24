import type { DBState } from './index';

export interface SyncResponse extends DBState {}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    firstLoginReset: boolean;
    tenantId?: string | null;
  };
  token?: string;
}

export interface AiRestockRequest {
  tenantId: string;
}

export interface RestockReport {
  summary: string;
  alertsCount: number;
  recommendations: {
    productName: string;
    currentStock: number;
    recommendedQuantity: number;
    estimatedCost: number;
    priority: 'Haute' | 'Moyenne' | 'Faible';
    reasoning: string;
  }[];
  smartTips: string[];
}
