// ============================================================
//  TowerForge Companion — Ask AI reports (the server's)
//  A player sends one by choice (👎 → Send) — the question, the answer
//  and what it looked at; the owner (the "ai-admin" preview) reads them
//  on the Ask AI page and marks them fixed. TowerForge.Server
//  AiReportsController.
// ============================================================

import { apiRequest } from '../engine/http';
import type { AiReport } from './aiLog';

const API = '/api/ai-reports';

export interface ServerAiReport {
    id: number;
    username: string | null;
    createdAt: string;
    status: 'open' | 'fixed';
    data: AiReport;
}

export const sendAiReport = (r: AiReport) =>
    apiRequest<{ id: number }>(API, { method: 'POST', body: JSON.stringify(r) }, 'Could not send the report.');

export const listAiReports = (status?: 'open' | 'fixed') =>
    apiRequest<ServerAiReport[]>(`${API}${status ? `?status=${status}` : ''}`, {}, 'Could not load the reports.');

export const setAiReportStatus = (id: number, status: 'open' | 'fixed') =>
    apiRequest<void>(`${API}/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }, 'Could not update the report.');

export const deleteAiReport = (id: number) =>
    apiRequest<void>(`${API}/${id}`, { method: 'DELETE' }, 'Could not delete the report.');
