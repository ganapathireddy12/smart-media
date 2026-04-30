import { useMemo, useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline, useMap } from 'react-leaflet'
import { useAppStore, ImageMetadata } from '../store/appStore'
import { Icon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Map as MapIcon, Navigation, Layers, X, Globe, MapPin, 
  Maximize2, ArrowRight
} from 'lucide-react'
import PhotoViewer from '../components/PhotoViewer'
import { motion, AnimatePresence } from 'framer-motion'
import { reverseGeocode, formatLocation, type LocationInfo } from '../utils/geocoding'

// --- ASSETS ---
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// --- FIX LEAFLET ICONS ---
delete (Icon.Default.prototype as any)._getIconUrl
Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
})

// --- CONSTANTS ---
const MAP_STYLES = {
    dark: {
        name: 'Midnight',
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; OpenStreetMap &copy; CARTO'
    },
    light: {
        name: 'Daylight',
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; OpenStreetMap &copy; CARTO'
    },
    satellite: {
        name: 'Satellite',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Esri, DigitalGlobe, GeoEye, Earthstar Geographics'
    }
}

// --- COMPONENTS ---

const MapController = ({ center }: { center: [number, number] }) => {
    const map = useMap()
    useEffect(() => {
        // Only fly to center if it's not the default [20, 0]
        if (center[0] !== 20 || center[1] !== 0) {
            console.log('[MapController] Flying to:', center);
            map.flyTo(center, 8, { duration: 1.5 }) // Zoom level 8 for city-level view
        }
    }, [center, map])
    return null
}

const StatBadge = ({ icon: Icon, label, value }: { icon: any, label: string, value: number }) => (
    <div className="flex items-center gap-2 bg-[#111]/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-[#222]">
        <Icon size={12} className="text-[#888]" />
        <span className="text-[10px] font-bold text-white">{value}</span>
        <span className="text-[10px] text-[#666] uppercase tracking-wider">{label}</span>
    </div>
)

export default function MapPage() {
    const { images, setImages } = useAppStore()
    
    // Load images from database on mount
    useEffect(() => {
        const loadImages = async () => {
            try {
                // @ts-ignore
                const response = await window.electronAPI?.getImages()
                if (response?.success && response?.images && Array.isArray(response.images)) {
                    console.log(`[MapPage] Loaded ${response.images.length} images from database`)
                    
                    // Debug: Check all GPS formats
                    const imagesWithGPS = response.images.filter((img: any) => {
                        const hasNewGPS = img.gps_latitude && img.gps_longitude
                        const hasOldGPS = img.metadata?.gps?.lat && img.metadata?.gps?.lon
                        return hasNewGPS || hasOldGPS
                    })
                    
                    console.log(`[MapPage] Found ${imagesWithGPS.length} images with GPS data`)
                    
                    if (imagesWithGPS.length > 0) {
                        const sample = imagesWithGPS[0]
                        console.log('[MapPage] Sample image GPS data:', {
                            filename: sample.filename,
                            gps_latitude: sample.gps_latitude,
                            gps_longitude: sample.gps_longitude,
                            metadata_gps: sample.metadata?.gps
                        })
                    } else {
                        console.warn('[MapPage] No GPS data found. Sample image structure:', response.images[0])
                    }
                    
                    setImages(response.images)
                }
            } catch (error) {
                console.error('[MapPage] Failed to load images:', error)
            }
        }
        loadImages()
    }, [setImages])
    
    // State
    const [activeStyle, setActiveStyle] = useState<keyof typeof MAP_STYLES>('dark')
    const [selectedCluster, setSelectedCluster] = useState<any>(null)
    const [viewerImage, setViewerImage] = useState<ImageMetadata | null>(null)
    const [imagePreview, setImagePreview] = useState<Record<string, string>>({})
    const [mapCenter, setMapCenter] = useState<[number, number]>([20, 0])
    const [clusterLocationInfo, setClusterLocationInfo] = useState<LocationInfo | null>(null)
    const [loadingClusterLocation, setLoadingClusterLocation] = useState(false)

    // --- LOGIC ---

    // Fetch location name when cluster is selected
    useEffect(() => {
        if (selectedCluster) {
            const fetchClusterLocation = async () => {
                setLoadingClusterLocation(true)
                try {
                    const info = await reverseGeocode(selectedCluster.lat, selectedCluster.lon)
                    setClusterLocationInfo(info)
                } catch (error) {
                    console.error('[MapPage] Failed to fetch cluster location:', error)
                } finally {
                    setLoadingClusterLocation(false)
                }
            }
            fetchClusterLocation()
        } else {
            setClusterLocationInfo(null)
        }
    }, [selectedCluster])

    // 1. Filter Geo Images - Support both old and new GPS format
    const geoImages = useMemo(() => {
        const filtered = images.filter(i => {
            // New format: gps_latitude and gps_longitude directly on image
            const hasNewGPS = (i as any).gps_latitude && (i as any).gps_longitude;
            // Old format: metadata.gps.lat and metadata.gps.lon
            const hasOldGPS = i.metadata?.gps?.lat && i.metadata?.gps?.lon;
            return hasNewGPS || hasOldGPS;
        });
        
        console.log('[MapPage] Filtered geo images:', filtered.length);
        if (filtered.length > 0) {
            const first = filtered[0] as any;
            console.log('[MapPage] First geo image:', {
                filename: first.filename,
                gps_latitude: first.gps_latitude,
                gps_longitude: first.gps_longitude,
                metadata_gps: first.metadata?.gps
            });
        }
        
        return filtered;
    }, [images])

    // Update map center when geoImages change
    useEffect(() => {
        if (geoImages.length > 0) {
            const first = geoImages[0] as any;
            let lat: number | undefined;
            let lon: number | undefined;
            
            if (first.gps_latitude && first.gps_longitude) {
                lat = first.gps_latitude;
                lon = first.gps_longitude;
            } else if (first.metadata?.gps?.lat && first.metadata?.gps?.lon) {
                lat = first.metadata.gps.lat;
                lon = first.metadata.gps.lon;
            }
            
            if (lat && lon) {
                console.log('[MapPage] Centering map to:', lat, lon);
                setMapCenter([lat, lon]);
            }
        }
    }, [geoImages])

    // 2. Clusters
    const clusters = useMemo(() => {
        const groups: Record<string, { lat: number, lon: number, images: ImageMetadata[] }> = {}
        // Simpler precision for visual grouping
        const precision = 1 
        
        geoImages.forEach(img => {
            // Support both GPS formats
            let lat: number | undefined;
            let lon: number | undefined;
            
            if ((img as any).gps_latitude && (img as any).gps_longitude) {
                lat = (img as any).gps_latitude;
                lon = (img as any).gps_longitude;
            } else if (img.metadata?.gps?.lat && img.metadata?.gps?.lon) {
                lat = img.metadata.gps.lat;
                lon = img.metadata.gps.lon;
            }
            
            if (!lat || !lon) return;
            
            const latRounded = Number(lat.toFixed(precision))
            const lonRounded = Number(lon.toFixed(precision))
            const key = `${latRounded},${lonRounded}`
            
            if (!groups[key]) groups[key] = { lat: latRounded, lon: lonRounded, images: [] }
            groups[key].images.push(img)
        })
        return Object.values(groups)
    }, [geoImages])

    // 3. Stats
    const stats = useMemo(() => ({
        total: geoImages.length,
        locations: clusters.length,
        countries: new Set(geoImages.map(i => i.location?.country).filter(Boolean)).size
    }), [geoImages, clusters])

    // Load Previews for selection
    useEffect(() => {
        if (!selectedCluster) return
        let active = true
        const load = async () => {
            for(const img of selectedCluster.images.slice(0, 20)) {
                if(!active) break
                if(!imagePreview[img.id]) {
                    try {
                        // @ts-ignore
                        const thumb = await window.electronAPI?.getImageThumbnail(img.path)
                        if(thumb && active) setImagePreview(p => ({...p, [img.id]: thumb}))
                    } catch(e) {}
                }
            }
        }
        load()
        return () => { active = false }
    }, [selectedCluster])

    // --- RENDER ---

    return (
        <div className="h-full w-full relative bg-[#050505] overflow-hidden">
            
            {/* 1. FLOATING HEADER */}
            <div className="absolute top-4 left-4 right-4 z-[1000] flex justify-between items-start pointer-events-none">
                <div className="pointer-events-auto flex flex-col gap-2">
                    <div className="flex items-center gap-3 bg-[#111]/90 backdrop-blur-xl p-2 pr-6 rounded-full border border-[#222] shadow-2xl">
                        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                            <MapIcon size={16} className="text-blue-400" />
                        </div>
                        <div>
                            <h1 className="text-xs font-bold text-white leading-tight">Explorer</h1>
                            <p className="text-[9px] text-[#666] font-mono">WORLD MAP</p>
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        <StatBadge icon={MapPin} label="Spots" value={stats.locations} />
                        <StatBadge icon={Globe} label="Countries" value={stats.countries} />
                    </div>
                </div>

                <div className="pointer-events-auto bg-[#111]/90 backdrop-blur-xl p-1 rounded-lg border border-[#222] shadow-2xl flex flex-col gap-1">
                    {(Object.keys(MAP_STYLES) as Array<keyof typeof MAP_STYLES>).map(style => (
                        <button 
                            key={style}
                            onClick={() => setActiveStyle(style)}
                            className={`p-2 rounded-md transition-all ${activeStyle === style ? 'bg-white text-black' : 'text-[#666] hover:text-white hover:bg-[#222]'}`}
                            title={MAP_STYLES[style].name}
                        >
                            <Layers size={16} />
                        </button>
                    ))}
                </div>
            </div>

            {/* 2. MAP */}
            <MapContainer 
                center={[20, 0]} 
                zoom={3} 
                zoomControl={false}
                className="h-full w-full z-0 bg-[#050505]"
                minZoom={2}
            >
                <TileLayer 
                    url={MAP_STYLES[activeStyle].url} 
                    attribution={MAP_STYLES[activeStyle].attribution}
                />
                <MapController center={mapCenter} />

                {clusters.map((cluster, idx) => (
                    <CircleMarker
                        key={idx}
                        center={[cluster.lat, cluster.lon]}
                        radius={Math.min(30, 8 + cluster.images.length)}
                        pathOptions={{ 
                            fillColor: '#3b82f6', 
                            fillOpacity: 0.6, 
                            color: '#60a5fa', 
                            weight: 1 
                        }}
                        eventHandlers={{
                            click: () => {
                                setSelectedCluster(cluster)
                                setMapCenter([cluster.lat, cluster.lon])
                            }
                        }}
                    >
                       {/* Optional Tooltip on Hover if needed */}
                    </CircleMarker>
                ))}
            </MapContainer>

            {/* No GPS Data Message */}
            {geoImages.length === 0 && images.length > 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[999]">
                    <div className="bg-[#111]/95 backdrop-blur-xl rounded-2xl p-8 border border-[#222] max-w-md text-center pointer-events-auto">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/10 flex items-center justify-center">
                            <MapPin size={32} className="text-blue-400" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">No Locations Found</h3>
                        <p className="text-sm text-white/60 mb-4">
                            Your images don't have GPS location data. Photos taken with smartphones usually include location info.
                        </p>
                        <p className="text-xs text-white/40">
                            Scanned {images.length} images • 0 with GPS data
                        </p>
                    </div>
                </div>
            )}

            {/* 3. BOTTOM SHEET (Details) */}
            <AnimatePresence>
                {selectedCluster && (
                    <motion.div 
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="absolute bottom-4 left-4 right-4 z-[1000] bg-[#111]/95 backdrop-blur-2xl border border-[#222] rounded-2xl shadow-2xl max-h-[40vh] flex flex-col overflow-hidden"
                    >
                        <div className="flex items-center justify-between p-4 border-b border-[#222]">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-500/10 rounded-full">
                                    <MapPin size={16} className="text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white">
                                        {clusterLocationInfo ? formatLocation(clusterLocationInfo, true) : 'Location Group'}
                                    </h3>
                                    <p className="text-xs text-[#666]">
                                        {selectedCluster.images.length} photo{selectedCluster.images.length !== 1 ? 's' : ''} here
                                    </p>
                                    {loadingClusterLocation && (
                                        <p className="text-[9px] text-white/40 mt-0.5">Loading location...</p>
                                    )}
                                    {clusterLocationInfo && !loadingClusterLocation && (
                                        <p className="text-[9px] text-white/40 mt-0.5 font-mono">
                                            {selectedCluster.lat.toFixed(4)}, {selectedCluster.lon.toFixed(4)}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button className="p-2 hover:bg-[#222] rounded-full text-white/50 hover:text-white transition-colors">
                                    <Maximize2 size={16} />
                                </button>
                                <button onClick={() => setSelectedCluster(null)} className="p-2 hover:bg-[#222] rounded-full text-white/50 hover:text-white transition-colors">
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-x-auto p-4 flex gap-3 no-scrollbar">
                            {selectedCluster.images.map((img: ImageMetadata) => (
                                <div 
                                    key={img.id} 
                                    onClick={() => setViewerImage(img)}
                                    className="flex-shrink-0 h-32 aspect-square rounded-lg bg-[#222] overflow-hidden cursor-pointer relative group border border-[#333] hover:border-[#666] transition-all"
                                >
                                    {imagePreview[img.id] ? (
                                        <img src={imagePreview[img.id]} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full animate-pulse" />
                                    )}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 4. VIEWER MODAL */}
            <AnimatePresence>
                {viewerImage && (
                    <PhotoViewer 
                        image={viewerImage} 
                        imagePreview={imagePreview[viewerImage.id]}
                        onClose={() => setViewerImage(null)} 
                    />
                )}
            </AnimatePresence>

        </div>
    )
}