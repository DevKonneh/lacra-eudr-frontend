/**
 * GeoIdAdmin — Production hardening dashboard for FAO GeoID management.
 *
 * Three panels:
 *  1. Integration Health  — DB / GeoID API / WHIMO status + GeoID coverage stats
 *  2. Streaming Backfill  — SSE live progress stream for large datasets
 *  3. Info / links        — FAO + WHIMO registration links
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Globe, Play, CheckCircle2, AlertTriangle, Loader2,
    RefreshCw, Activity, Database, Wifi, WifiOff,
    BarChart3, ExternalLink, XCircle, ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface IntegrationStatus {
    ok: boolean;
    error: string | null;
    note?: string;
}

interface GeoIdCoverage {
    totalFarms: number;
    farmsWithGeoId: number;
    farmsMissingGeoId: number;
    farmsWithQrCode: number;
    coveragePct: number;
}

interface HealthData {
    status: 'ok' | 'degraded';
    checkedAt: string;
    elapsedMs: number;
    integrations: {
        database: IntegrationStatus;
        geoid_api: IntegrationStatus;
        whimo_api: IntegrationStatus;
    };
    geoidCoverage: GeoIdCoverage | null;
    backfillRequired: boolean | null;
    envConfigured: Record<string, boolean>;
    envValues: Record<string, string>;
}

interface SseEvent {
    event: 'start' | 'progress' | 'skip' | 'error' | 'done' | 'fatal';
    processed?: number;
    total?: number;
    minted?: number;
    skipped?: number;
    farmId?: string;
    farmName?: string;
    geoid?: string;
    reason?: string;
    error?: string;
    errors?: string[];
}

// ── API helpers ───────────────────────────────────────────────────────────────

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8100/api') as string;

async function fetchHealth(): Promise<HealthData> {
    const token = localStorage.getItem('token') ?? '';
    const res = await fetch(`${API_BASE}/admin-maintenance/integration-health`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!json.success && !json.data) throw new Error(json.message || 'Health check failed');
    return json.data as HealthData;
}

// ── Sub-components ────────────────────────────────────────────────────────────

const StatusDot: React.FC<{ ok: boolean; loading?: boolean }> = ({ ok, loading }) => {
    if (loading) return <Loader2 className="h-4 w-4 animate-spin text-gray-400" />;
    return ok
        ? <span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" />
        : <span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" />;
};

const IntegrationRow: React.FC<{
    label: string;
    icon: React.ReactNode;
    status: IntegrationStatus | null;
    loading: boolean;
    note?: string;
}> = ({ label, icon, status, loading, note }) => (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
        <div className="w-6 flex items-center justify-center text-gray-400">{icon}</div>
        <span className="flex-1 text-sm font-medium text-gray-700">{label}</span>
        <StatusDot ok={status?.ok ?? false} loading={loading} />
        {!loading && status && !status.ok && (
            <span className="text-xs text-red-500 font-mono truncate max-w-xs" title={status.error ?? ''}>
                {status.error}
            </span>
        )}
        {!loading && status?.ok && note && (
            <span className="text-xs text-gray-400 italic">{note}</span>
        )}
    </div>
);

// ── Main component ────────────────────────────────────────────────────────────

const GeoIdAdmin: React.FC = () => {
    // ── Health state ──────────────────────────────────────────────────────────
    const [health, setHealth] = useState<HealthData | null>(null);
    const [healthLoading, setHealthLoading] = useState(false);
    const [healthError, setHealthError] = useState<string | null>(null);
    const [showEnvDetails, setShowEnvDetails] = useState(false);

    // ── Backfill state ────────────────────────────────────────────────────────
    const [confirmed, setConfirmed] = useState(false);
    const [streaming, setStreaming] = useState(false);
    const [sseEvents, setSseEvents] = useState<SseEvent[]>([]);
    const [backfillDone, setBackfillDone] = useState<SseEvent | null>(null);
    const [backfillError, setBackfillError] = useState<string | null>(null);
    const logRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<(() => void) | null>(null);

    // ── Load health on mount ──────────────────────────────────────────────────
    const loadHealth = useCallback(async () => {
        setHealthLoading(true);
        setHealthError(null);
        try {
            const data = await fetchHealth();
            setHealth(data);
        } catch (e: any) {
            setHealthError(e.message ?? 'Health check failed');
        } finally {
            setHealthLoading(false);
        }
    }, []);

    useEffect(() => { loadHealth(); }, [loadHealth]);

    // Auto-scroll log to bottom
    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [sseEvents]);

    // ── SSE streaming backfill ────────────────────────────────────────────────
    const runBackfill = useCallback(() => {
        if (!confirmed) { setConfirmed(true); return; }
        setConfirmed(false);
        setStreaming(true);
        setSseEvents([]);
        setBackfillDone(null);
        setBackfillError(null);

        const token = localStorage.getItem('token') ?? '';

        // We use fetch + ReadableStream to read the SSE without an EventSource
        // (EventSource doesn't support custom Authorization headers).
        let cancelled = false;

        const run = async () => {
            try {
                const resp = await fetch(
                    `${API_BASE}/farms/backfill-geoids?stream=1`,
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${token}`,
                            Accept: 'text/event-stream',
                        },
                    }
                );

                if (!resp.ok || !resp.body) {
                    const txt = await resp.text().catch(() => resp.statusText);
                    setBackfillError(`Server error ${resp.status}: ${txt}`);
                    setStreaming(false);
                    return;
                }

                const reader = resp.body.getReader();
                const decoder = new TextDecoder();
                let buf = '';

                while (true) {
                    const { value, done } = await reader.read();
                    if (done || cancelled) break;
                    buf += decoder.decode(value, { stream: true });

                    // SSE lines are separated by "\n\n"; data lines start with "data: "
                    const parts = buf.split('\n\n');
                    buf = parts.pop() ?? '';

                    for (const part of parts) {
                        const dataLine = part.split('\n').find(l => l.startsWith('data: '));
                        if (!dataLine) continue;
                        try {
                            const evt = JSON.parse(dataLine.slice(6)) as SseEvent;
                            if (evt.event === 'done' || evt.event === 'fatal') {
                                setBackfillDone(evt);
                                setStreaming(false);
                                // Refresh health stats after backfill
                                setTimeout(loadHealth, 1500);
                            } else {
                                setSseEvents(prev => [...prev, evt]);
                            }
                        } catch {
                            // ignore malformed SSE line
                        }
                    }
                }
            } catch (e: any) {
                if (!cancelled) {
                    setBackfillError(e.message ?? 'Stream connection failed');
                    setStreaming(false);
                }
            }
        };

        run();
        abortRef.current = () => { cancelled = true; setStreaming(false); };
    }, [confirmed, loadHealth]);

    const cancelBackfill = () => {
        abortRef.current?.();
        setBackfillError('Backfill cancelled by user.');
    };

    const resetBackfill = () => {
        setSseEvents([]);
        setBackfillDone(null);
        setBackfillError(null);
        setConfirmed(false);
    };

    // ── Derived values ────────────────────────────────────────────────────────
    const latestEvent = sseEvents[sseEvents.length - 1];
    const progress = latestEvent?.total
        ? Math.round(((latestEvent.processed ?? 0) / latestEvent.total) * 100)
        : 0;

    const coveragePct = health?.geoidCoverage?.coveragePct ?? 0;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="max-w-3xl mx-auto space-y-6 pb-10">

            {/* ── Header ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-5">
                <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center flex-none">
                        <Globe className="h-6 w-6 text-green-600" />
                    </div>
                    <div className="flex-1">
                        <h1 className="text-xl font-bold text-gray-900">GeoID Administration</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Production health dashboard, backfill tool, and FAO GeoID integration management for LACRA farms.
                        </p>
                    </div>
                    <button
                        onClick={loadHealth}
                        disabled={healthLoading}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-green-700 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* ── Integration Health ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-600" />
                    <h2 className="text-sm font-bold text-gray-800">Integration Health</h2>
                    {health && (
                        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full border ${
                            health.status === 'ok'
                                ? 'bg-green-100 text-green-700 border-green-200'
                                : 'bg-red-100 text-red-700 border-red-200'
                        }`}>
                            {health.status.toUpperCase()}
                        </span>
                    )}
                </div>

                <div className="p-6 space-y-5">
                    {healthError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700">
                            <AlertTriangle className="h-4 w-4 flex-none" /> {healthError}
                        </div>
                    )}

                    {/* Integration status rows */}
                    <div className="bg-gray-50 rounded-xl p-4 space-y-1">
                        <IntegrationRow
                            label="Database (PostgreSQL)"
                            icon={<Database className="h-4 w-4" />}
                            status={health?.integrations.database ?? null}
                            loading={healthLoading}
                        />
                        <IntegrationRow
                            label="FAO GeoID API"
                            icon={<Globe className="h-4 w-4" />}
                            status={health?.integrations.geoid_api ?? null}
                            loading={healthLoading}
                        />
                        <IntegrationRow
                            label="WHIMO API"
                            icon={health?.integrations.whimo_api?.ok ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                            status={health?.integrations.whimo_api ?? null}
                            loading={healthLoading}
                            note="Optional"
                        />
                    </div>

                    {/* GeoID Coverage */}
                    {health?.geoidCoverage && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <BarChart3 className="h-4 w-4 text-gray-400" />
                                <span className="text-sm font-semibold text-gray-700">GeoID Coverage</span>
                                <span className={`ml-auto text-xs font-bold ${coveragePct === 100 ? 'text-green-600' : 'text-orange-600'}`}>
                                    {coveragePct}%
                                </span>
                            </div>
                            {/* Progress bar */}
                            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-700 ${coveragePct === 100 ? 'bg-green-500' : 'bg-orange-400'}`}
                                    style={{ width: `${coveragePct}%` }}
                                />
                            </div>
                            <div className="grid grid-cols-4 gap-3 text-center">
                                {[
                                    { label: 'Total Farms', val: health.geoidCoverage.totalFarms, color: 'text-gray-700' },
                                    { label: 'With GeoID', val: health.geoidCoverage.farmsWithGeoId, color: 'text-green-600' },
                                    { label: 'Missing GeoID', val: health.geoidCoverage.farmsMissingGeoId, color: health.geoidCoverage.farmsMissingGeoId > 0 ? 'text-orange-600' : 'text-gray-400' },
                                    { label: 'With QR Code', val: health.geoidCoverage.farmsWithQrCode, color: 'text-blue-600' },
                                ].map(({ label, val, color }) => (
                                    <div key={label} className="bg-gray-50 rounded-lg p-3">
                                        <p className={`text-2xl font-bold ${color}`}>{val}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                                    </div>
                                ))}
                            </div>
                            {health.backfillRequired && (
                                <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2.5 text-sm text-orange-700 flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 flex-none text-orange-500" />
                                    <span><strong>{health.geoidCoverage.farmsMissingGeoId} farms</strong> are missing a GeoID — run the backfill below.</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Env config accordion */}
                    {health?.envConfigured && (
                        <div>
                            <button
                                onClick={() => setShowEnvDetails(v => !v)}
                                className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 font-medium"
                            >
                                {showEnvDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                Environment variables
                                <span className={`ml-1 font-bold ${
                                    Object.values(health.envConfigured).every(Boolean) ? 'text-green-600' : 'text-orange-500'
                                }`}>
                                    {Object.values(health.envConfigured).filter(Boolean).length}/{Object.values(health.envConfigured).length} set
                                </span>
                            </button>
                            {showEnvDetails && (
                                <div className="mt-3 grid grid-cols-2 gap-1.5">
                                    {Object.entries(health.envConfigured).map(([key, isSet]) => (
                                        <div key={key} className="flex items-center gap-2 text-xs font-mono bg-gray-50 rounded px-2.5 py-1.5">
                                            {isSet
                                                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-none" />
                                                : <XCircle className="h-3.5 w-3.5 text-red-400 flex-none" />}
                                            <span className={isSet ? 'text-gray-700' : 'text-red-500'}>{key}</span>
                                        </div>
                                    ))}
                                    {/* Non-sensitive active values */}
                                    {health.envValues && Object.entries(health.envValues).map(([key, val]) => (
                                        <div key={key} className="col-span-2 flex items-start gap-2 text-xs font-mono bg-blue-50 rounded px-2.5 py-1.5">
                                            <span className="text-blue-600 flex-none">{key}</span>
                                            <span className="text-gray-500 truncate">{val}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {health && (
                        <p className="text-xs text-gray-400">
                            Checked {new Date(health.checkedAt).toLocaleTimeString()} · {health.elapsedMs}ms
                        </p>
                    )}
                </div>
            </div>

            {/* ── Streaming Backfill ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-white flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-orange-600" />
                    <h2 className="text-sm font-bold text-gray-800">Run GeoID Backfill</h2>
                    <span className="ml-auto text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">ADMIN ONLY</span>
                </div>
                <div className="p-6 space-y-5">
                    <div className="text-sm text-gray-600 space-y-2">
                        <p>
                            Mints GeoIDs for every farm where <code className="bg-gray-100 px-1 rounded text-xs">geoId IS NULL</code>.
                            Uses a live SSE stream — progress is shown in real-time and the page stays responsive on large datasets.
                        </p>
                        <p>
                            The operation is <strong>idempotent</strong> — farms that already have a GeoID are skipped automatically.
                        </p>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 flex-none mt-0.5 text-amber-600" />
                        <ul className="list-disc list-inside text-amber-700 space-y-0.5 text-xs">
                            <li>Ensure <code>GEOID_BASE_URL</code> and <code>GEOID_API_TOKEN</code> are set correctly in Render</li>
                            <li>Each farm makes one FAO API call — may take several minutes for large datasets</li>
                            <li>Farms with no GPS boundary polygon are skipped (not an error)</li>
                        </ul>
                    </div>

                    {/* Live stream progress */}
                    {(streaming || sseEvents.length > 0) && !backfillDone && !backfillError && (
                        <div className="space-y-3">
                            {/* Progress bar */}
                            {latestEvent?.total && (
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs text-gray-500">
                                        <span>{latestEvent.processed ?? 0} / {latestEvent.total} farms</span>
                                        <span>{progress}%</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-green-500 rounded-full transition-all duration-300"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                    <div className="flex gap-4 text-xs text-gray-500">
                                        <span className="text-green-600">✓ {latestEvent.minted ?? 0} minted</span>
                                        <span className="text-orange-500">↷ {latestEvent.skipped ?? 0} skipped</span>
                                    </div>
                                </div>
                            )}

                            {/* Log */}
                            <div
                                ref={logRef}
                                className="bg-gray-900 rounded-lg p-3 h-48 overflow-y-auto font-mono text-xs space-y-0.5"
                            >
                                {sseEvents.map((evt, i) => (
                                    <div key={i} className={
                                        evt.event === 'progress' ? 'text-green-400' :
                                        evt.event === 'skip' ? 'text-yellow-400' :
                                        evt.event === 'error' ? 'text-red-400' :
                                        'text-gray-400'
                                    }>
                                        {evt.event === 'start' && `▶ Starting backfill — ${evt.total} farms to process`}
                                        {evt.event === 'progress' && `[${evt.processed}/${evt.total}] ✓ ${evt.farmName} → ${evt.geoid}`}
                                        {evt.event === 'skip' && `[${evt.processed}/${evt.total}] ↷ ${evt.farmName}: ${evt.reason}`}
                                        {evt.event === 'error' && `[${evt.processed}/${evt.total}] ✗ ${evt.farmName}: ${evt.error}`}
                                    </div>
                                ))}
                                {streaming && (
                                    <div className="text-blue-400 animate-pulse">Processing…</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Done */}
                    {backfillDone && (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
                            <div className="flex items-center gap-2 text-green-800 font-semibold">
                                <CheckCircle2 className="h-5 w-5 text-green-600" /> Backfill Complete
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-center">
                                <div className="bg-white border border-green-200 rounded-lg p-3">
                                    <p className="text-2xl font-bold text-gray-900">{backfillDone.total ?? 0}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">Total Farms</p>
                                </div>
                                <div className="bg-white border border-green-200 rounded-lg p-3">
                                    <p className="text-2xl font-bold text-green-600">{backfillDone.minted ?? 0}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">GeoIDs Minted</p>
                                </div>
                                <div className="bg-white border border-orange-200 rounded-lg p-3">
                                    <p className="text-2xl font-bold text-orange-500">{backfillDone.skipped ?? 0}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">Skipped</p>
                                </div>
                            </div>
                            {backfillDone.errors && backfillDone.errors.length > 0 && (
                                <details className="text-xs">
                                    <summary className="text-red-600 cursor-pointer">{backfillDone.errors.length} errors (click to expand)</summary>
                                    <ul className="mt-1 font-mono bg-red-50 rounded p-2 space-y-0.5 text-red-700 max-h-32 overflow-y-auto">
                                        {backfillDone.errors.map((e, i) => <li key={i}>{e}</li>)}
                                    </ul>
                                </details>
                            )}
                            <button onClick={resetBackfill} className="text-xs text-green-700 hover:underline">Run again</button>
                        </div>
                    )}

                    {/* Error */}
                    {backfillError && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                            <AlertTriangle className="h-5 w-5 text-red-500 flex-none mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-red-800">Backfill Failed</p>
                                <p className="text-xs text-red-600 mt-1 font-mono">{backfillError}</p>
                                <button onClick={resetBackfill} className="mt-2 text-xs text-red-700 hover:underline">Dismiss</button>
                            </div>
                        </div>
                    )}

                    {/* Controls */}
                    {!backfillDone && !backfillError && (
                        <div className="flex items-center gap-3">
                            <button
                                onClick={runBackfill}
                                disabled={streaming}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                                    confirmed
                                        ? 'bg-orange-600 hover:bg-orange-700 text-white'
                                        : 'bg-green-600 hover:bg-green-700 text-white'
                                } disabled:opacity-60 disabled:cursor-not-allowed`}
                            >
                                {streaming ? (
                                    <><Loader2 className="h-4 w-4 animate-spin" /> Streaming…</>
                                ) : confirmed ? (
                                    <><AlertTriangle className="h-4 w-4" /> Confirm — Run Now</>
                                ) : (
                                    <><Play className="h-4 w-4" /> Start GeoID Backfill</>
                                )}
                            </button>
                            {confirmed && !streaming && (
                                <button onClick={() => setConfirmed(false)} className="text-sm text-gray-500 hover:text-gray-700">
                                    Cancel
                                </button>
                            )}
                            {streaming && (
                                <button onClick={cancelBackfill} className="text-sm text-red-500 hover:text-red-700">
                                    Stop
                                </button>
                            )}
                            {confirmed && !streaming && (
                                <p className="text-xs text-orange-600">
                                    Click again to confirm. This will call the FAO API for all un-minted farms.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Info footer ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
                <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-gray-400" /> Resources & Registration
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {[
                        { label: 'FAO GeoID Staging API', href: 'https://data.review.fao.org/geoid/docs' },
                        { label: 'FAO GeoID Production API', href: 'https://data.fao.org/geoid/docs' },
                        { label: 'FAO OpenForis Collection Registration', href: 'https://geoid.openforis.org' },
                        { label: 'WHIMO Organisation Registration', href: 'https://whimo.net' },
                        { label: 'WHIMO Commodity Map Validation', href: `${API_BASE}/public/farm-scan/whimo/commodities` },
                        { label: 'RENDER.md Deployment Guide', href: '/RENDER.md' },
                    ].map(({ label, href }) => (
                        <a
                            key={href}
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 text-green-700 hover:text-green-900 hover:underline"
                        >
                            <ExternalLink className="h-3.5 w-3.5 flex-none" />
                            {label}
                        </a>
                    ))}
                </div>
                <div className="text-xs text-gray-400 border-t border-gray-100 pt-3 space-y-1">
                    <p>GeoIDs are stable and public — the same geometry always produces the same ID.</p>
                    <p>No farmer PII is ever sent to the FAO API — only raw GPS geometry coordinates.</p>
                </div>
            </div>
        </div>
    );
};

export default GeoIdAdmin;
