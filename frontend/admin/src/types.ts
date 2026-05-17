export enum LogType {
  ROUTINE = "ROUTINE",
  CRITICAL = "CRITICAL",
  AI = "AI",
  SYSTEM = "SYSTEM",
}

export interface IntelligenceLog {
  id: string;
  time: string;
  entity: string;
  action: string;
  type: LogType;
}

export enum UnitStatus {
  IDLE = "IDLE",
  BUSY = "BUSY",
  OFFLINE = "OFFLINE",
}

export interface FieldUnit {
  id: string;
  name: string;
  ip: string;
  status: string;
  statusType: UnitStatus;
  coords: [number, number];
  destination?: [number, number];
  battery: number;
  ping: number;
  isOnline: boolean;
}

export enum ZoneType {
  URGENT = "URGENT",
  MEDIUM = "MEDIUM",
  SAFE = "SAFE",
  NO_GO = "NO_GO",
}

export interface RiskZone {
  id: string;
  points: [number, number][];
  type: ZoneType;
  score: number;
  isHumanOverride?: boolean;
  // Enriched zone metadata for tooltip display
  name?: string;
  estimated_casualties?: number;
  building_density?: number;
  population_density?: number;
  infrastructure_risk?: number;
  priority_score?: number;
}

export type ToolMode = "CURSOR" | "PEN" | "OVERRIDE" | "ERASER";
