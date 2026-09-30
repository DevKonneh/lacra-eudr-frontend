import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import apiClient from '../api/client';
import { MapPin, Sprout, ShieldCheck, Globe, Copy, CheckCheck, ExternalLink, Loader2, AlertTriangle } from 'lucide-react';
import FarmMap from '../components/FarmMap';
import lacraLogo from '../assets/lacra_logo.jpg';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface GeoResponse {
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

interface FullResponse extends GeoResponse {
    farmer?: {
        id: string;
        firstName: string;
        lastName: string;
        farmerId?: string;
        community?: string;
        district?: string;
        region?: string;
        cooperativeName?: string;
        identityStatus?: string;
        profilePhoto?: string;
        consent?: boolean;
    };
    farmName?: string;
    ownershipType?: string;
    farmRegistrationStatus?: string;
    numberOfTrees?: number;
    yearsInCultivation?: number;
    harvestSeason?: string;
}

/* ------------------------------------------------------------------ */
/* Helper components                                                   */
/* ------------------------------------------------------------------ */

const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="flex justify-between items-start py-2 border-b border-gray-100 last:border-0">
        <span className="text-sm text-gray-500">{label}</span>
        <span className="text-sm font-medium text-gray-900 text-right ml-4">{value ?? <span className="text-gray-400">N/A</span>}</span>
    </div>
);

const RiskBadge: React.FC<{ level?: string }> = ({ level }) => {
    const l = level || 'Low';
    const cls = l === 'High'
        ? 'bg-red-100 text-red-800 border-red-200'
        : l === 'Medium'
            ? 'bg-orange-100 text-orange-800 border-orange-200'
            : 'bg-green-100 text-green-800 border-green-200';
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
            <ShieldCheck className="h-3 w-3" /> {l} Risk
        </span>
    );
};

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */

const PublicFarmScan: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const view = searchParams.get('view'); // 'full' → show PII (LACRA internal)

    const [data, setData] = useState<FullResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!id) return;
        const params = view === 'full' ? '?view=full' : '';
        apiClient
            .get(`/public/farm-scan/${id}${params}`)
            .then((res) => {
                const d = res.data as any;
                if (d?.status) {
                    setData(d.data);
                } else {
                    setData(d?.data || d);
                }
            })
            .catch((err) => {
                console.error('Error loading farm scan', err);
                setError('Unable to load farm data. The QR code may be invalid or expired.');
            })
            .finally(() => setLoading(false));
    }, [id, view]);

    const copyGeoId = async () => {
        if (!data?.geoId) return;
        await navigator.clipboard?.writeText(data.geoId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    /* ---- Render states ---- */

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center">
                <div className="text-center space-y-3">
                    <Loader2 className="h-10 w-10 animate-spin text-green-600 mx-auto" />
                    <p className="text-gray-500 text-sm">Loading farm verification data…</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center px-4">
                <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
                    <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
                    <h2 className="text-lg font-bold text-gray-800">Verification Failed</h2>
                    <p className="text-sm text-gray-500">{error || 'Farm data could not be retrieved.'}</p>
                    <p className="text-xs text-gray-400">If you scanned a QR code, ensure it was generated by LACRA's EUDR platform.</p>
                </div>
            </div>
        );
    }

    const farmLocation = data.geojson as any;

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 py-8 px-4 sm:px-6">
            <div className="max-w-2xl mx-auto space-y-5">

                {/* ── Header banner ── */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-800 via-green-700 to-emerald-600 shadow-lg p-6">
                    <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_80%_20%,white,transparent_45%)] pointer-events-none" />
                    <div className="relative flex items-center gap-3 mb-4">
                        <img src={lacraLogo} alt="LACRA" className="h-9 w-9 rounded-full border-2 border-white/70 shadow-sm bg-white object-cover" />
                        <div>
                            <p className="text-green-100 text-[11px] font-semibold uppercase tracking-wider">
                                Liberia Agriculture Commodity Regulatory Authority
                            </p>
                            <p className="text-green-200 text-[10px]">EUDR Farm Verification · Public Record</p>
                        </div>
                    </div>
                    <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <h1 className="text-xl font-bold text-white">{data.farmName || 'Registered Farm'}</h1>
                            <p className="text-green-200 text-sm mt-0.5 flex items-center gap-1.5">
                                <Sprout className="h-3.5 w-3.5" /> {data.cropType}
                            </p>
                        </div>
                        <RiskBadge level={data.riskLevel} />
                    </div>
                </div>

                {/* ── GeoID card ── */}
                <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-gray-100 bg-gradient-to-r from-green-50 to-white flex items-center justify-between">
                        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            <Globe className="h-4 w-4 text-green-600" />
                            FAO GeoID — Anonymous Farm Identity
                        </h2>
                        {data.geoId && (
                            <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full border border-green-200">
                                ✓ VERIFIED
                            </span>
                        )}
                    </div>
                    <div className="p-5 space-y-4">
                        {data.geoId ? (
                            <>
                                <div>
                                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">GeoID</p>
                                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                                        <code className="flex-1 text-xs font-mono text-gray-800 break-all">{data.geoId}</code>
                                        <button
                                            onClick={copyGeoId}
                                            className="flex-none text-gray-400 hover:text-green-600 transition-colors"
                                            title="Copy GeoID"
                                        >
                                            {copied
                                                ? <CheckCheck className="h-4 w-4 text-green-500" />
                                                : <Copy className="h-4 w-4" />
                                            }
                                        </button>
                                    </div>
                                </div>
                                {data.geoIdUri && (
                                    <div>
                                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1">FAO Resolver</p>
                                        <a
                                            href={data.geoIdUri}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1.5 text-xs text-green-700 hover:text-green-900 hover:underline font-mono break-all"
                                        >
                                            {data.geoIdUri}
                                            <ExternalLink className="h-3 w-3 flex-none" />
                                        </a>
                                    </div>
                                )}
                                <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-xs text-green-800">
                                    <strong>EUDR Compliance Note:</strong> This GeoID is a content-addressed, anonymous identifier generated by the FAO OpenForis platform from this farm's GPS boundary geometry. It contains no personal data and is safe to include in EUDR due diligence documentation under EU Regulation 2023/1115.
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-4 space-y-2">
                                <AlertTriangle className="h-8 w-8 text-orange-400 mx-auto" />
                                <p className="text-sm text-gray-500">GeoID not yet minted for this farm.</p>
                                <p className="text-xs text-gray-400">The farm boundary may not have been captured yet, or the GeoID is pending generation. Contact LACRA for assistance.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Location / Map ── */}
                <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-green-600" />
                        <h2 className="text-sm font-bold text-gray-800">Farm Location</h2>
                    </div>
                    <div>
                        {farmLocation ? (
                            <div className="h-64">
                                <FarmMap location={farmLocation} height="100%" />
                            </div>
                        ) : (
                            <div className="h-32 flex items-center justify-center text-sm text-gray-400 bg-gray-50">
                                No boundary geometry available
                            </div>
                        )}
                        {data.centroid && (
                            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
                                <p className="text-[11px] text-gray-500">
                                    <span className="font-medium">Centroid:</span>{' '}
                                    <code className="font-mono">{data.centroid.lat.toFixed(6)}°N, {data.centroid.lng.toFixed(6)}°E</code>
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Farm metrics ── */}
                <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                        <Sprout className="h-4 w-4 text-green-600" />
                        <h2 className="text-sm font-bold text-gray-800">Farm Metrics</h2>
                    </div>
                    <div className="px-5 py-3">
                        <InfoRow label="Commodity" value={data.cropType} />
                        <InfoRow label="Total Area" value={data.totalAreaHa ? `${data.totalAreaHa} ha` : undefined} />
                        <InfoRow label="EUDR Risk Level" value={<RiskBadge level={data.riskLevel} />} />
                        <InfoRow label="Location Source" value={
                            <span className="inline-flex items-center gap-1 text-green-700 font-mono text-xs bg-green-50 border border-green-200 px-2 py-0.5 rounded">
                                <ShieldCheck className="h-3 w-3" /> {data.locationSource.toUpperCase()}
                            </span>
                        } />
                        {(data as FullResponse).ownershipType && (
                            <InfoRow label="Ownership Type" value={(data as FullResponse).ownershipType} />
                        )}
                        {(data as FullResponse).farmRegistrationStatus && (
                            <InfoRow label="Registration Status" value={(data as FullResponse).farmRegistrationStatus} />
                        )}
                        {(data as FullResponse).numberOfTrees != null && (
                            <InfoRow label="Number of Trees" value={(data as FullResponse).numberOfTrees} />
                        )}
                        {(data as FullResponse).yearsInCultivation != null && (
                            <InfoRow label="Years Cultivated" value={(data as FullResponse).yearsInCultivation} />
                        )}
                        {(data as FullResponse).harvestSeason && (
                            <InfoRow label="Harvest Season" value={(data as FullResponse).harvestSeason} />
                        )}
                    </div>
                </div>

                {/* ── Farmer section (only in ?view=full mode) ── */}
                {view === 'full' && (data as FullResponse).farmer && (
                    <div className="bg-white rounded-xl shadow-md border border-amber-200 overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-amber-600" />
                            <h2 className="text-sm font-bold text-amber-900">Farmer Details</h2>
                            <span className="ml-auto text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-300 px-2 py-0.5 rounded-full">
                                LACRA INTERNAL — NOT FOR SHARING
                            </span>
                        </div>
                        <div className="px-5 py-3">
                            {(() => {
                                const f = (data as FullResponse).farmer!;
                                return (
                                    <>
                                        <div className="flex items-center gap-4 mb-4">
                                            {f.profilePhoto ? (
                                                <img src={f.profilePhoto} alt="Farmer" className="h-16 w-16 rounded-full object-cover border-2 border-gray-200" />
                                            ) : (
                                                <div className="h-16 w-16 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center text-gray-400 text-xs">No Photo</div>
                                            )}
                                            <div>
                                                <p className="font-bold text-gray-900">{f.firstName} {f.lastName}</p>
                                                {f.farmerId && <p className="text-xs font-mono text-gray-500">ID: {f.farmerId}</p>}
                                                {f.identityStatus === 'Verified' && (
                                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 mt-1">
                                                        <ShieldCheck className="h-3 w-3" /> Verified Identity
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <InfoRow label="Community" value={f.community} />
                                        <InfoRow label="District" value={f.district} />
                                        <InfoRow label="Region" value={f.region} />
                                        {f.cooperativeName && <InfoRow label="Cooperative" value={f.cooperativeName} />}
                                        <InfoRow label="Consent Given" value={f.consent ? '✓ Yes' : '✗ No'} />
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {/* ── Footer ── */}
                <div className="text-center pt-4 pb-8 space-y-2">
                    <img src={lacraLogo} alt="LACRA" className="h-8 w-8 rounded-full border border-gray-200 shadow-sm object-cover mx-auto" />
                    <p className="text-xs text-gray-400">
                        Farm Verification Record · LACRA EUDR Platform<br />
                        <span className="italic">"From Seed to Table: Regulating for Excellence"</span><br />
                        Verified on {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                    <p className="text-[10px] text-gray-300">
                        This record contains no personal data and is safe to share with EU operators for EUDR due diligence under Regulation 2023/1115.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PublicFarmScan;
