import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { MapPin, Calendar, Navigation, Plus, Trash2, Map as MapIcon, ChevronRight, Share2, Cloud, Loader2, Check, X, Save, Crosshair, Search, Move, Edit2, Palette, Type, ChevronDown, Globe, Settings, Hash, Layers, FileText, RotateCw } from 'lucide-react';

// --- FIXED: Replace the JSON.parse line with your real config ---
const firebaseConfig = {
  apiKey: "AIzaSyCDbnnEkMGYu3HMJAb8kViLnJZfazJ1qms",
  authDomain: "rp2026-b5d0a11111.firebaseapp.com",
  projectId: "rp2026-b5d0a11111",
  storageBucket: "rp2026-b5d0a11111.firebasestorage.app",
  messagingSenderId: "864135040245",
  appId: "1:864135040245:web:3e8e2d336ce379575d49bc",
  measurementId: "G-MEFFLWYC9S"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'rp2026-b5d0a11111'; // Use your actual Project ID here

const COLOR_PALETTE = [
  { value: '#4f46e5' }, { value: '#10b981' }, { value: '#f43f5e' }, { value: '#f59e0b' },
  { value: '#475569' }, { value: '#8b5cf6' }, { value: '#0ea5e9' }, { value: '#f97316' },
  { value: '#ec4899' }, { value: '#06b6d4' }, { value: '#84cc16' }, { value: '#eab308' },
  { value: '#ef4444' }, { value: '#a855f7' }, { value: '#14b8a6' }, { value: '#d946ef' },
  { value: '#6366f1' }, { value: '#78716c' }, { value: '#0f172a' }, { value: '#b45309' }
];

const DEFAULT_MAP_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

const EditableInput = ({ value, onChange, className, placeholder, type = "text", onSave }) => {
  const [localValue, setLocalValue] = useState(value);
  const isComposing = useRef(false);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e) => {
    const val = e.target.value;
    setLocalValue(val);
    if (!isComposing.current && onChange) {
      onChange(val);
    }
  };

  const handleBlur = () => {
    if (onSave) onSave(localValue);
  };

  const handleCompositionStart = () => { isComposing.current = true; };
  const handleCompositionEnd = (e) => {
    isComposing.current = false;
    const val = e.target.value;
    setLocalValue(val);
    if (onChange) onChange(val);
  };

  return (
    <input
      type={type}
      className={className}
      value={localValue || ''}
      placeholder={placeholder}
      onChange={handleChange}
      onBlur={handleBlur}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
    />
  );
};

export default function App() {
  const mapContainerRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);
  const routeLayersRef = useRef([]);
  const previewMarkerRef = useRef(null);
  
  const [stops, setStops] = useState([]);
  const [phases, setPhases] = useState([]);
  const [user, setUser] = useState(null);
  const [activeStopId, setActiveStopId] = useState(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);
  const [showShareToast, setShowShareToast] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [mapVersion, setMapVersion] = useState(0); 
  
  const [expandedPhaseId, setExpandedPhaseId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  
  const [editFormData, setEditFormData] = useState({
    id: '', city: '', venue: '', startDate: '', endDate: '', coords: [30, 110], desc: '', phaseId: ''
  });

  const [phaseFormData, setPhaseFormData] = useState({
    phaseNumber: '1',
    subtitle: '',
    color: COLOR_PALETTE[0].value
  });

  useEffect(() => {
    const initAuth = async () => {
      try {
          await signInAnonymously(auth);
      } catch (error) {
          console.error("Auth error", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const stopsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'stops');
    const phasesCollection = collection(db, 'artifacts', appId, 'public', 'data', 'phases');

    const unsubscribeStops = onSnapshot(stopsCollection, (snapshot) => {
      setStops(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      setIsSyncing(false);
    });

    const unsubscribePhases = onSnapshot(phasesCollection, (snapshot) => {
      setPhases(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    });

    return () => { unsubscribeStops(); unsubscribePhases(); };
  }, [user]);

  useEffect(() => {
    if (window.L) { setLeafletLoaded(true); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true; script.onload = () => setLeafletLoaded(true);
    document.body.appendChild(script);
  }, []);

  const sortedStops = useMemo(() => {
    return [...stops].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }, [stops]);

  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current || !window.L) return;
    const L = window.L;
    if (!mapInstance.current) {
      mapInstance.current = L.map(mapContainerRef.current, { zoomControl: false }).setView([30, 110], 4);
      L.tileLayer(DEFAULT_MAP_URL).addTo(mapInstance.current);
      L.control.zoom({ position: 'bottomright' }).addTo(mapInstance.current);
      
      mapInstance.current.on('zoomend moveend', () => {
        setMapVersion(v => v + 1);
      });
    }
    const map = mapInstance.current;
    
    markersRef.current.forEach(m => m.remove());
    routeLayersRef.current.forEach(l => l.remove());
    markersRef.current = [];
    routeLayersRef.current = [];

    sortedStops.filter(s => !isEditing || s.id !== editFormData.id).forEach((stop) => {
      const phase = phases.find(p => p.id === stop.phaseId);
      const color = phase?.color || '#94a3b8';
      const marker = L.marker(stop.coords, {
        icon: L.divIcon({
          className: 'marker', 
          html: `<div style="background: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.2);"></div>`,
          iconSize: [14, 14], iconAnchor: [7, 7]
        })
      }).addTo(map);

      const label = `第${phase?.phaseNumber || '?'}阶段 · ${stop.city}`;
      marker.bindTooltip(label, { permanent: true, direction: 'right', offset: [10, 0], className: 'map-label', style: { borderLeft: `4px solid ${color}` } });
      marker.on('click', () => setActiveStopId(stop.id));
      markersRef.current.push(marker);
    });

    for (let i = 0; i < sortedStops.length - 1; i++) {
      const current = sortedStops[i];
      const next = sortedStops[i + 1];
      
      if (current.phaseId !== next.phaseId) continue;

      const phase = phases.find(p => p.id === current.phaseId);
      const color = phase ? phase.color : '#cbd5e1';

      const segment = L.polyline([current.coords, next.coords], {
        color: color, weight: 4, opacity: 0.3, dashArray: '12, 12', lineJoin: 'round',
        className: 'marching-ants-path'
      }).addTo(map);
      routeLayersRef.current.push(segment);

      const pStart = map.project(current.coords);
      const pEnd = map.project(next.coords);
      const dx = pEnd.x - pStart.x;
      const dy = pEnd.y - pStart.y;
      const pixelDistance = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;

      const travelMarker = L.marker(current.coords, {
        icon: L.divIcon({
          className: 'travel-arrow-anchor',
          html: `<div style="transform: rotate(${angle}deg); --travel-dist: ${pixelDistance}px;" class="travel-viewport">
                   <div style="width: 0; height: 0; border-top: 10px solid transparent; border-bottom: 10px solid transparent; border-left: 20px solid ${color}; filter: drop-shadow(0px 3px 5px rgba(0,0,0,0.4));" class="travel-dart">
                   </div>
                 </div>`,
          iconSize: [34, 34], iconAnchor: [0, 10]
        })
      }).addTo(map);
      routeLayersRef.current.push(travelMarker);
    }

    if (previewMarkerRef.current) previewMarkerRef.current.remove();
    if (isEditing) {
      const color = phaseFormData.color || '#334155';
      previewMarkerRef.current = L.marker(editFormData.coords, { draggable: true, icon: L.divIcon({
        html: `<div style="background: ${color}; width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;"><div style="transform: rotate(45deg); color: white;">📍</div></div>`,
        iconSize: [32, 32], iconAnchor: [16, 32]
      })}).addTo(map);
      previewMarkerRef.current.on('dragend', (e) => setEditFormData(p => ({ ...p, coords: [e.target.getLatLng().lat, e.target.getLatLng().lng] })));
    }
  }, [leafletLoaded, sortedStops, isEditing, editFormData.coords, editFormData.phaseId, phases, phaseFormData.color, mapVersion]);

  const performGeocode = async (cityName) => {
    if (!cityName) return null;
    setIsSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}`);
      const data = await res.json();
      if (data?.[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
    return null;
  };

  const handleManualGeocode = async () => {
    const coords = await performGeocode(editFormData.city);
    if (coords) {
      setEditFormData(p => ({ ...p, coords }));
      if (mapInstance.current) mapInstance.current.flyTo(coords, 10);
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2000);
    });
  };

  const saveStop = async () => {
    if (!editFormData.city || !user || isSearching) return;
    
    let targetPhase = phases.find(p => p.phaseNumber === phaseFormData.phaseNumber);
    let targetPhaseId = targetPhase?.id || crypto.randomUUID();

    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'phases', targetPhaseId), {
      id: targetPhaseId, ...phaseFormData
    }, { merge: true });

    await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'stops'), editFormData.id), {
      ...editFormData, phaseId: targetPhaseId
    });

    setIsEditing(false);
  };

  const onPhaseNumberChange = (num) => {
    setPhaseFormData(prev => ({ ...prev, phaseNumber: num }));
    const existing = phases.find(p => p.phaseNumber === num);
    if (existing) {
      setPhaseFormData({ phaseNumber: num, subtitle: existing.subtitle || '', color: existing.color });
    }
  };

  const updatePhase = async (id, data) => {
    if (!user) return;
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'phases', id), data, { merge: true });
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden text-[13px]">
      <style>{`
        .leaflet-container { width: 100%; height: 100%; z-index: 1; border-radius: 12px; }
        .map-label { background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 10px; font-weight: 800; color: #1e293b; font-size: 11px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); white-space: nowrap; pointer-events: none; }
        .marching-ants-path { animation: marching-ants 2s linear infinite; }
        @keyframes marching-ants { 0% { stroke-dashoffset: 24; } 100% { stroke-dashoffset: 0; } }
        @keyframes travel-glide { 0% { transform: translateX(0); opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { transform: translateX(var(--travel-dist)); opacity: 0; } }
        .travel-dart { animation: travel-glide 4s linear infinite; }
      `}</style>

      <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between shadow-sm z-30">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-slate-900 rounded-2xl text-white shadow-lg"><Globe size={24} /></div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-800">巡展路线规划助手</h1>
            <div className="flex items-center gap-2 mt-0.5 text-emerald-600 font-bold text-[10px]"><Cloud size={10}/> 云端同步</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleShare} className="px-5 py-2 bg-white border rounded-xl text-xs font-bold">分享</button>
          {!isEditing && <button onClick={() => { 
            const d = new Date().toISOString().split('T')[0]; 
            setEditFormData({ id: crypto.randomUUID(), city: '', venue: '', startDate: d, endDate: d, coords: [30, 110], desc: '', phaseId: '' });
            setIsEditing(true); 
          }} className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold">+ 新增</button>}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        <aside className="w-[380px] bg-white border-r overflow-y-auto p-6 space-y-4">
           {isEditing ? (
             <div className="space-y-4">
                <input type="text" className="w-full border p-3 rounded-xl" placeholder="城市" value={editFormData.city} onChange={e => setEditFormData({...editFormData, city: e.target.value})} />
                <button onClick={saveStop} className="w-full bg-slate-900 text-white p-3 rounded-xl">保存站点</button>
                <button onClick={() => setIsEditing(false)} className="w-full text-slate-400">取消</button>
             </div>
           ) : (
             phases.map(p => (
               <div key={p.id} className="border p-4 rounded-2xl" style={{ borderLeft: `5px solid ${p.color}` }}>
                  <h3 className="font-bold">第 {p.phaseNumber} 阶段</h3>
                  {sortedStops.filter(s => s.phaseId === p.id).map(s => (
                    <div key={s.id} className="text-xs mt-2 flex justify-between">
                      <span>{s.city}</span>
                      <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stops', s.id))} className="text-red-400">删除</button>
                    </div>
                  ))}
               </div>
             ))
           )}
        </aside>

        <div className="flex-1 p-6 relative">
          {/* FIXED: The Map Container with specific height */}
          <div ref={mapContainerRef} style={{ height: '100%', width: '100%', borderRadius: '24px', overflow: 'hidden' }} />
        </div>
      </main>
    </div>
  );
}