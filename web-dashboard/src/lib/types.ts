import type { Timestamp } from 'firebase/firestore';

// Mirrors docs/DATA_MODEL.md. Field names are shared with the Android app and Cloud Functions.

export type Role = 'rider' | 'company_staff' | 'company_admin';
export type UserStatus = 'pending' | 'active' | 'inactive';
export type IncidentStatus = 'pending' | 'confirmed' | 'acknowledged' | 'closed' | 'cancelled';
export type VideoStatus = 'pending' | 'uploading' | 'uploaded' | 'failed' | 'none';
export type Outcome = 'rider_safe' | 'help_arrived' | 'hospital' | 'false_alarm' | 'other';

export interface UserDoc {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  companyId: string;
  status: UserStatus;
  riderNumber?: string;
  deviceId?: string | null;
  joinCode?: string;
  createdAt?: Timestamp;
}

export interface Company {
  id: string;
  name: string;
  countdownSeconds?: number;
}

export interface DeviceStatus {
  battery?: number;
  imu?: string;
  frontCamera?: string;
  lte?: string;
  gnss?: string;
  state?: string;
}

export interface Device {
  id: string;
  companyId: string;
  riderId?: string | null;
  label?: string;
  active?: boolean;
  lastSeenAt?: Timestamp;
  status?: DeviceStatus;
}

export interface Incident {
  id: string;
  incidentId: string;
  riderId: string;
  companyId: string;
  deviceId?: string | null;
  riderName?: string;
  riderPhone?: string;
  status: IncidentStatus;
  trigger?: 'auto' | 'sos';
  source?: 'vest' | 'app';
  simulated?: boolean;
  createdAt?: Timestamp;
  confirmedAt?: Timestamp;
  cancelledAt?: Timestamp;
  countdownSeconds?: number;
  latitude?: number | null;
  longitude?: number | null;
  locationLastKnown?: boolean | null;
  locationUpdatedAt?: Timestamp;
  peakAccelG?: number | null;
  peakRotationDps?: number | null;
  tiltDeg?: number | null;
  aiVerificationScore?: number | null;
  aiAssessment?: string | null;
  smsStatus?: string;
  companyNotified?: string;
  frontVideoUploadStatus?: VideoStatus;
  frontVideoPath?: string;
  cancelRequested?: boolean;
  falseAlarmRequested?: boolean;
  deletionRequested?: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Timestamp;
  closedBy?: string;
  closedAt?: Timestamp;
  outcome?: Outcome;
  closeNote?: string;
}

/** incidents/{id}/private/medical – copied from the rider's profile at confirmation, only with consent. */
export interface EmergencySnapshot {
  consentEmergencySharing: boolean;
  fullName?: string;
  age?: number;
  bloodType?: string;
  allergies?: string;
  conditions?: string;
  medication?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  by: string;
  byName?: string;
  companyId: string;
  incidentId?: string;
  riderId?: string;
  side?: string;
  at?: Timestamp;
  detail?: string;
}
