import apiClient from './client';
import type { Farm } from './farmers';
import type { ApiResponse } from './types';

export interface FarmWithFarmer extends Farm {
    farmer: {
        id: string;
        firstName: string;
        lastName: string;
    };
    riskLevel: 'Low' | 'Medium' | 'High';
    lastRiskAssessmentDate?: string;
    /** FAO GeoID — stable anonymous UUID for this farm's geometry */
    geoId?: string;
    /** FAO GeoID resolver URI */
    geoIdUri?: string;
    /** Base-64 data-URL of the farm-level QR code */
    farmQrCode?: string;
}

/** Public geo-only scan response (no PII) — returned by GET /public/farm-scan/:farmId */
export interface FarmScanGeoResponse {
    farmId: string;
    geoId?: string;
    geoIdUri?: string;
    centroid?: { lat: number; lng: number };
    geojson?: Record<string, unknown>;
    cropType: string;
    totalAreaHa?: number;
    riskLevel?: string;
    locationSource: 'qr';
}

/** WHIMO-aligned payload returned by GET /public/farm-scan/:farmId/whimo-payload */
export interface WhimoPayload {
    farm_latitude?: number;
    farm_longitude?: number;
    location: 'qr';
    location_file?: Record<string, unknown>;
    is_buying_from_farmer: boolean;
    geoId?: string;
    cropType: string;
    totalAreaHa?: number;
}

export const getFarms = async () => {
    return apiClient.get<ApiResponse<FarmWithFarmer[]>>('/farms');
};

export const getFarm = async (id: string) => {
    return apiClient.get<ApiResponse<FarmWithFarmer>>(`/farms/${id}`);
};

export const createFarm = async (data: {
    name: string;
    cropType: string;
    lat: number;
    lng: number;
    location?: any;
    totalAreaHa?: number;
    documentType?: string;
    documentUrl?: string;
    farmerId?: string;
}) => {
    return apiClient.post<ApiResponse<FarmWithFarmer>>('/farms', data);
};

/** Public geo-only scan — no auth required */
export const getFarmScan = async (farmId: string) => {
    return apiClient.get<ApiResponse<FarmScanGeoResponse>>(`/public/farm-scan/${farmId}`);
};

/** WHIMO-aligned payload — no auth required */
export const getWhimoPayload = async (farmId: string) => {
    return apiClient.get<ApiResponse<WhimoPayload>>(`/public/farm-scan/${farmId}/whimo-payload`);
};

/** Admin: backfill GeoIDs for farms that have none */
export const backfillGeoIds = async () => {
    return apiClient.post<ApiResponse<{ processed: number; succeeded: number; failed: number }>>('/farms/backfill-geoids');
};
