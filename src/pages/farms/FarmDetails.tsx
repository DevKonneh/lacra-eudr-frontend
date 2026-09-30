import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getFarm, type FarmWithFarmer } from '../../api/farms';
import { ArrowLeft, Loader2, MapPin, Calendar, FileText, User, Sprout, Ruler, QrCode, Copy, ExternalLink, CheckCheck, AlertTriangle } from 'lucide-react';
import FarmMap from '../../components/FarmMap';
import FarmRiskPanel from '../../components/FarmRiskPanel';
import { QRCodeCanvas } from 'qrcode.react';

interface FarmDocument {
    id: string;
    type: string;
    status: string;
    uploadedAt: string;
}

const FarmDetails: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [farm, setFarm] = useState<FarmWithFarmer | null>(null);
    const [documents, setDocuments] = useState<FarmDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [geoIdCopied, setGeoIdCopied] = useState(false);
    const [showFarmQr, setShowFarmQr] = useState(false);

    const fetchFarm = async () => {
        if (!id) return;
        try {
            setLoading(true);
            setError(null);
            const res = await getFarm(id);
            if (res.data.status) {
                setFarm(res.data.data);
            } else {
                setError(res.data.message || 'Failed to load farm details');
            }
        } catch (err: any) {
            console.error('Failed to fetch farm details', err);
            setError('Failed to load farm details. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) fetchFarm();
        // Documents endpoint is optional / may not exist yet — fail silently
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    if (loading) {
        return <div className="flex justify-center p-12"><Loader2 className="animate-spin h-8 w-8 text-green-600" /></div>;
    }

    if (error) {
        return (
            <div className="p-8 text-center">
                <p className="text-red-500 mb-4">{error}</p>
                <button onClick={fetchFarm} className="text-green-600 hover:text-green-800 font-medium">Retry</button>
            </div>
        );
    }

    if (!farm) {
        return <div className="p-8 text-center text-gray-500">Farm not found</div>;
    }

    const areaLabel = farm.totalAreaHa ? `${farm.totalAreaHa} ha` : 'Not measured';
    const boundaryType = farm.location?.type === 'Polygon' ? 'GPS Polygon Boundary' : farm.location?.type === 'Point' ? 'Single GPS Point' : 'Not captured';

    const farmScanUrl = `${window.location.origin}/public/farm-scan/${farm.id}`;

    const copyGeoId = async () => {
        if (!farm.geoId) return;
        await navigator.clipboard?.writeText(farm.geoId);
        setGeoIdCopied(true);
        setTimeout(() => setGeoIdCopied(false), 2000);
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-800 via-green-700 to-emerald-600 shadow-lg">
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_20%_20%,white,transparent_45%)]" />
                <div className="relative flex items-center justify-between px-6 py-6 flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/farms')} className="text-white/80 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors">
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center backdrop-blur-sm">
                            <Sprout className="h-7 w-7 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white leading-tight">{farm.name}</h1>
                            <p className="text-sm text-green-100">
                                Owner:{' '}
                                {farm.farmer ? (
                                    <Link to={`/farmers/${farm.farmer.id}`} className="text-white hover:underline font-semibold">
                                        {farm.farmer.firstName} {farm.farmer.lastName}
                                    </Link>
                                ) : 'Unknown'}
                            </p>
                        </div>
                    </div>
                    <span className={`px-3.5 py-1.5 rounded-full text-xs font-bold border backdrop-blur-sm ${
                        farm.riskLevel === 'High' ? 'bg-red-500/20 text-red-100 border-red-300/40' :
                        farm.riskLevel === 'Medium' ? 'bg-orange-500/20 text-orange-100 border-orange-300/40' :
                        'bg-white/20 text-white border-white/40'
                    }`}>
                        Risk: {farm.riskLevel || 'Low'}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Map */}
                <div className="lg:col-span-2 bg-white shadow-md rounded-xl overflow-hidden border border-gray-200">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
                        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-green-600" /> Farm Boundary Map
                        </h3>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{boundaryType}</span>
                    </div>
                    <div className="h-96">
                        <FarmMap location={farm.location} height="100%" />
                    </div>
                </div>

                {/* Key Stats */}
                <div className="space-y-4">
                    <div className="bg-white shadow-md rounded-xl p-4 grid grid-cols-2 gap-3 text-center">
                        <div className="p-3 bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-xl border border-blue-100">
                            <p className="text-xl font-bold text-blue-700">{farm.cropType}</p>
                            <p className="text-xs text-blue-500/80 mt-0.5">Crop Type</p>
                        </div>
                        <div className="p-3 bg-gradient-to-br from-orange-50 to-orange-100/60 rounded-xl border border-orange-100">
                            <p className="text-xl font-bold text-orange-700">{areaLabel}</p>
                            <p className="text-xs text-orange-500/80 mt-0.5">Total Area</p>
                        </div>
                        <div className="p-3 bg-gradient-to-br from-purple-50 to-purple-100/60 rounded-xl border border-purple-100">
                            <p className="text-xl font-bold text-purple-700">{farm.numberOfTrees ?? '-'}</p>
                            <p className="text-xs text-purple-500/80 mt-0.5">Number of Trees</p>
                        </div>
                        <div className="p-3 bg-gradient-to-br from-green-50 to-green-100/60 rounded-xl border border-green-100">
                            <p className="text-xl font-bold text-green-700">{farm.yearsInCultivation ?? '-'}</p>
                            <p className="text-xs text-green-500/80 mt-0.5">Years Cultivated</p>
                        </div>
                    </div>

                    <div className="bg-white shadow-md rounded-xl p-4 text-sm space-y-2">
                        <div className="flex justify-between border-b border-gray-100 pb-2">
                            <span className="text-gray-500">Ownership</span>
                            <span className="font-medium text-gray-900">{farm.ownershipType || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-100 pb-2">
                            <span className="text-gray-500">Registration Status</span>
                            <span className="font-medium text-gray-900">{farm.farmRegistrationStatus || 'Pending'}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-100 pb-2">
                            <span className="text-gray-500">Harvest Season</span>
                            <span className="font-medium text-gray-900">{farm.harvestSeason || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-100 pb-2">
                            <span className="text-gray-500">Average Yield</span>
                            <span className="font-medium text-gray-900">{farm.averageYield || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-100 pb-2">
                            <span className="text-gray-500">Uses Chemicals?</span>
                            <span className="font-medium text-gray-900">{farm.useChemicals ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Extension Services?</span>
                            <span className="font-medium text-gray-900">{farm.extensionServices ? 'Yes' : 'No'}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* GeoID + Farm QR Code Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* GeoID Identity Card */}
                <div className="bg-white shadow-md rounded-xl overflow-hidden border border-gray-100">
                    <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-green-50 to-white">
                        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-green-500" />
                            FAO GeoID — Farm Identity
                        </h3>
                        {farm.geoId && (
                            <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full border border-green-200">
                                REGISTERED
                            </span>
                        )}
                    </div>
                    <div className="p-5 space-y-3">
                        {farm.geoId ? (
                            <>
                                <div>
                                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1">GeoID (Anonymous Farm Identifier)</p>
                                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                        <code className="flex-1 text-xs font-mono text-gray-800 break-all">{farm.geoId}</code>
                                        <button
                                            onClick={copyGeoId}
                                            className="flex-none text-gray-400 hover:text-green-600 transition-colors"
                                            title="Copy GeoID"
                                        >
                                            {geoIdCopied ? <CheckCheck className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                                {farm.geoIdUri && (
                                    <div>
                                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1">Resolver URI</p>
                                        <a
                                            href={farm.geoIdUri}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1.5 text-xs text-green-700 hover:text-green-900 hover:underline font-mono break-all"
                                        >
                                            {farm.geoIdUri}
                                            <ExternalLink className="h-3 w-3 flex-none" />
                                        </a>
                                    </div>
                                )}
                                <p className="text-[11px] text-gray-400">
                                    The GeoID is a content-addressed, anonymous identifier generated by FAO OpenForis from this farm's GPS boundary. Same geometry always produces the same GeoID — it contains no personal data and is safe to share with traders.
                                </p>
                            </>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                                    <AlertTriangle className="h-5 w-5 text-amber-500 flex-none mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold text-amber-800">GeoID Pending — Not yet minted</p>
                                        <p className="text-xs text-amber-700">
                                            This farm does not have a FAO GeoID yet. GeoIDs are minted automatically for new farms. If this farm was registered before GeoID support was enabled, run the backfill.
                                        </p>
                                    </div>
                                </div>
                                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-1">
                                    <p className="text-xs font-semibold text-gray-700">What is a GeoID?</p>
                                    <p className="text-xs text-gray-500">
                                        A GeoID is a content-addressed, anonymous identifier generated by FAO OpenForis from this farm's GPS boundary. It contains no personal data and is safe to share with EUDR traders and regulators.
                                    </p>
                                </div>
                                <Link
                                    to="/admin/geoid"
                                    className="inline-flex items-center gap-2 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg transition-colors"
                                >
                                    Go to Admin → GeoID Manager to run Backfill
                                </Link>
                            </div>
                        )}
                    </div>
                </div>

                {/* Farm QR Code */}
                <div className="bg-white shadow-md rounded-xl overflow-hidden border border-gray-100">
                    <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-white">
                        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            <QrCode className="h-4 w-4 text-blue-600" />
                            Farm QR Code
                        </h3>
                        <button
                            onClick={() => setShowFarmQr(!showFarmQr)}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-full transition-colors"
                        >
                            {showFarmQr ? 'Hide QR' : 'Show QR'}
                        </button>
                    </div>
                    <div className="p-5">
                        {showFarmQr ? (
                            <div className="flex items-start gap-5">
                                <div className="flex-none">
                                    {farm.farmQrCode ? (
                                        <img src={farm.farmQrCode} alt="Farm QR Code" className="h-36 w-36 border border-gray-200 rounded-lg" />
                                    ) : (
                                        <div className="h-36 w-36 border border-gray-200 rounded-lg bg-gray-50 flex items-center justify-center">
                                            <QRCodeCanvas value={farmScanUrl} size={128} level="M" includeMargin />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 space-y-2">
                                    <p className="text-xs text-gray-600">
                                        This QR links to the farm's public verification endpoint. When scanned:
                                    </p>
                                    <ul className="text-xs text-gray-500 space-y-1">
                                        <li className="flex items-start gap-1.5"><span className="text-green-600 font-bold mt-0.5">·</span> <span><b>WHIMO / traders</b> see geo data only (no PII) — ready for EUDR due diligence</span></li>
                                        <li className="flex items-start gap-1.5"><span className="text-green-600 font-bold mt-0.5">·</span> <span><b>LACRA staff</b> append <code className="bg-gray-100 px-1 rounded">?view=full</code> for full farmer profile</span></li>
                                    </ul>
                                    <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                        <p className="text-[10px] text-gray-400 mb-0.5">Scan URL</p>
                                        <a href={farmScanUrl} target="_blank" rel="noreferrer" className="text-xs font-mono text-blue-600 hover:underline break-all">{farmScanUrl}</a>
                                    </div>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard?.writeText(farmScanUrl);
                                            alert('Farm scan URL copied to clipboard');
                                        }}
                                        className="text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                                    >
                                        <Copy className="h-3.5 w-3.5" /> Copy Link
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-4">
                                <QrCode className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                <p className="text-sm text-gray-500">Click <b>Show QR</b> to display the farm's shareable QR code for EUDR due diligence.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Farm Photos */}
            <div className="bg-white shadow-md rounded-xl overflow-hidden border border-gray-100">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-500" />
                    <h3 className="text-lg font-medium leading-6 text-gray-900">Farm Photos</h3>
                </div>
                <div className="p-6">
                    {farm.farmPhotos && farm.farmPhotos.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {farm.farmPhotos.map((url, idx) => (
                                <img
                                    key={idx}
                                    src={url}
                                    alt={`Farm photo ${idx + 1}`}
                                    className="h-32 w-full object-cover rounded-lg border border-gray-200"
                                />
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">No farm photos uploaded yet.</p>
                    )}
                </div>
            </div>

            {farm.farmAddress && (
                <div className="bg-white shadow-md rounded-xl p-6 flex items-start gap-3 border border-gray-100">
                    <Ruler className="h-5 w-5 text-gray-400 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-gray-700">Farm Address / Location Description</p>
                        <p className="text-sm text-gray-600 mt-1">{farm.farmAddress}</p>
                    </div>
                </div>
            )}

            {/* Documents Section */}
            <div className="bg-white shadow-md rounded-xl overflow-hidden border border-gray-100">
                <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-lg font-medium leading-6 text-gray-900">Compliance Documents</h3>
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Calendar className="h-4 w-4" /> Registered {new Date(farm.createdAt).toLocaleDateString()}
                    </span>
                </div>
                <ul className="divide-y divide-gray-200">
                    {documents.length > 0 ? documents.map(doc => (
                        <li key={doc.id} className="px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center">
                                <FileText className="h-5 w-5 text-gray-400 mr-3" />
                                <div>
                                    <p className="text-sm font-medium text-gray-900">{doc.type}</p>
                                    <p className="text-xs text-gray-500">Uploaded: {new Date(doc.uploadedAt).toLocaleDateString()}</p>
                                </div>
                            </div>
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${doc.status === 'Valid' ? 'bg-green-100 text-green-800' :
                                doc.status === 'Invalid' ? 'bg-red-100 text-red-800' :
                                    'bg-yellow-100 text-yellow-800'}`}>
                                {doc.status}
                            </span>
                        </li>
                    )) : (
                        <li className="px-6 py-4 text-sm text-gray-500">No documents uploaded</li>
                    )}
                </ul>
            </div>

            <FarmRiskPanel
                farmId={farm.id}
                riskLevel={farm.riskLevel}
                lastAssessmentDate={farm.lastRiskAssessmentDate}
                onAssessmentComplete={fetchFarm}
            />
        </div>
    );
};

export default FarmDetails;
