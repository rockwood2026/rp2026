import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { MapPin, Calendar, Navigation, Plus, Trash2, Map as MapIcon, ChevronRight, Share2, Cloud, Loader2, Check, X, Save, Crosshair, Search, Move, Edit2, Palette, Type, ChevronDown, Globe, Settings, Hash, Layers, FileText, RotateCw } from 'lucide-react';

const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-roadshow-id';

const COLOR_PALETTE = [
  { value: '#4f46e5' }, { value: '#10b981' }, { value: '#f43f5e' }, { value: '#f59e0b' },
  { value: '#475569' }, { value: '#8b5cf6' }, { value: '#0ea5e9' }, { value: '#f97316' },
  { value: '#ec4899' }, { value: '#06b6d4' }, { value: '#84cc16' }, { value: '#eab308' },
  { value: '#ef4444' }, { value: '#a855f7' }, { value: '#14b8a6' }, { value: '#d946ef' },
  { value: '#6366f1' }, { value: '#78716c' }, { value: '#0f172a' }, { value: '#b45309' }
];

const DEFAULT_MAP_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

const EditableInput = ({ value, onChange, className, placeholder, type = "text" }) => {
  const [localValue, setLocalValue] = useState(value);
  const isComposing = useRef(false);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e) => {
    const val = e.target.value;
    setLocalValue(val);
    if (!isComposing.current) {
      onChange(val);
    }
  };

  const handleCompositionStart = () => { isComposing.current = true; };
  const handleCompositionEnd = (e) => {
    isComposing.current = false;
    const val = e.target.value;
    setLocalValue(val);
    onChange(val);
  };

  return (
    <input
      type={type}
      className={className}
      value={localValue || ''}
      placeholder={placeholder}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
    />
  );
};

export default function App() {
  const mapContainerRef = useRef(null);
  const mapInstance = useRef(null);
  const tileLayerRef = useRef(null);
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
    let retryCount = 0;
    const maxRetries = 5;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(initAuth, Math.pow(2, retryCount) * 500);
        }
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
        html: `<div style="background: ${color}; width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;"><div style="transform: rotate(45deg); color: white;"><Navigation size={14} /></div></div>`,
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
    const el = document.createElement('textarea');
    el.value = window.location.href;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand('copy');
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2000);
    } catch (err) {
      console.error('无法复制链接', err);
    }
    document.body.removeChild(el);
  };

  const saveStop = async () => {
    if (!editFormData.city || !user || isSearching) return;
    const freshCoords = await performGeocode(editFormData.city);
    let finalCoords = freshCoords || editFormData.coords;

    let targetPhase = phases.find(p => p.phaseNumber === phaseFormData.phaseNumber);
    let targetPhaseId = targetPhase?.id;

    if (!targetPhaseId) {
      targetPhaseId = crypto.randomUUID();
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'phases', targetPhaseId), {
        id: targetPhaseId, ...phaseFormData
      });
    } else {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'phases', targetPhaseId), {
        ...targetPhase, ...phaseFormData
      });
    }

    await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'stops'), editFormData.id), {
      ...editFormData, coords: finalCoords, phaseId: targetPhaseId
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
        .travel-arrow-anchor { background: transparent !important; border: none !important; }
        
        @keyframes marching-ants {
          0% { stroke-dashoffset: 24; }
          100% { stroke-dashoffset: 0; }
        }
        .marching-ants-path {
          animation: marching-ants 2s linear infinite;
        }

        .travel-viewport {
          width: 34px;
          height: 34px;
          position: relative;
        }

        @keyframes travel-glide {
          0% { transform: translateX(0); opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { transform: translateX(var(--travel-dist)); opacity: 0; }
        }

        .travel-dart {
          animation: travel-glide 4s linear infinite;
          will-change: transform, opacity;
        }

        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>

      <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between shadow-sm z-30">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-slate-900 rounded-2xl text-white shadow-lg shadow-slate-200"><Globe size={24} /></div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-800">巡展路线规划助手</h1>
            <div className="flex items-center gap-2 mt-0.5 text-emerald-600 font-bold text-[10px]">
              <Cloud size={10}/> 云端同步已开启
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleShare} className="flex items-center gap-2 px-5 py-2.5 bg-white rounded-xl font-bold border border-slate-200 hover:border-slate-400 transition-all shadow-sm text-[12px] text-slate-600"><Share2 size={16} /><span>分享地图</span></button>
          {!isEditing && <button onClick={() => { 
            const d = new Date().toISOString().split('T')[0]; 
            const c = mapInstance.current?.getCenter() || {lat: 30, lng: 110}; 
            const lastPhase = phases.length > 0 ? [...phases].sort((a,b) => parseInt(a.phaseNumber) - parseInt(a.phaseNumber))[0] : null;
            setEditFormData({ id: crypto.randomUUID(), city: '', venue: '', startDate: d, endDate: d, coords: [c.lat, c.lng], desc: '', phaseId: lastPhase?.id || '' });
            setPhaseFormData({ phaseNumber: lastPhase?.phaseNumber || '1', subtitle: lastPhase?.subtitle || '', color: lastPhase?.color || COLOR_PALETTE[0].value });
            setIsEditing(true); 
          }} className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold shadow-xl hover:bg-black transition-all text-[12px]"><Plus size={18} /><span>新增站点</span></button>}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {showShareToast && <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[2000] bg-slate-900 text-white px-6 py-2.5 rounded-2xl text-xs font-bold shadow-2xl animate-in fade-in zoom-in">链接已复制到剪贴板!</div>}

        <aside className="w-[440px] bg-white border-r border-slate-200 flex flex-col shadow-2xl z-20">
          {isEditing ? (
            <div className="flex flex-col h-full animate-in slide-in-from-left duration-300">
              <div className="p-6 border-b flex items-center justify-between bg-slate-50/50">
                <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm uppercase tracking-wide"><Edit2 size={16} /> 编辑站点详情</h2>
                <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-800"><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-slate-100 rounded-lg text-slate-500"><Layers size={14} /></div>
                    <label className="text-[10px] font-black text-slate-800 uppercase tracking-widest">阶段设置</label>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100 space-y-4 relative">
                    <div className="flex gap-2 items-center">
                      <div className="inline-flex items-center gap-1.5 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-slate-100 transition-all">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">第</span>
                        <EditableInput className="w-8 bg-slate-50 rounded-md font-black text-slate-800 p-0.5 text-center outline-none" value={phaseFormData.phaseNumber} placeholder="1" onChange={onPhaseNumberChange} />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">阶段</span>
                      </div>
                      <div className="relative">
                        <button onClick={() => setShowColorPicker(!showColorPicker)} className="w-10 h-9 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-center transition-all hover:bg-slate-50 active:scale-95">
                          <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: phaseFormData.color }}></div>
                        </button>
                        {showColorPicker && (
                          <div className="absolute top-full left-0 mt-2 bg-white rounded-2xl border border-slate-200 shadow-2xl z-[100] p-3 grid grid-cols-5 gap-2 animate-in fade-in zoom-in-95 duration-200 w-[180px]">
                            {COLOR_PALETTE.map((c, idx) => (
                              <button key={idx} onClick={() => { setPhaseFormData({...phaseFormData, color: c.value}); setShowColorPicker(false); }} className={`w-full pt-[100%] rounded-full shadow-sm hover:scale-110 transition-transform ${phaseFormData.color === c.value ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`} style={{ backgroundColor: c.value }} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-slate-100 transition-all">
                      <FileText size={14} className="text-slate-300" />
                      <EditableInput className="flex-1 bg-transparent border-none font-medium text-slate-500 focus:ring-0 p-0 text-[11px] outline-none" value={phaseFormData.subtitle} placeholder="添加阶段描述..." onChange={(val) => setPhaseFormData({...phaseFormData, subtitle: val})} />
                    </div>
                  </div>
                </div>

                <div className="h-px bg-slate-100 w-full"></div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-800">
                    <div className="p-1.5 bg-slate-100 rounded-lg text-slate-500"><MapPin size={14} /></div>
                    <label className="text-[10px] font-black uppercase tracking-widest">行程信息</label>
                  </div>
                  <div className="space-y-4">
                    <div className="relative group">
                        <input type="text" className="w-full pl-5 pr-12 py-3.5 rounded-2xl border border-slate-200 outline-none font-bold focus:ring-4 focus:ring-slate-100 transition-all" placeholder="城市名称" value={editFormData.city} onChange={e => setEditFormData({...editFormData, city: e.target.value})} onKeyPress={(e) => e.key === 'Enter' && handleManualGeocode()} />
                        <button onClick={handleManualGeocode} disabled={isSearching} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-slate-100 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-200 transition-all active:scale-90">
                            {isSearching ? <Loader2 size={16} className="animate-spin text-slate-600" /> : <Search size={16} />}
                        </button>
                    </div>
                    <input type="text" className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 font-bold outline-none" placeholder="场馆或具体街道地址" value={editFormData.venue} onChange={e => setEditFormData({...editFormData, venue: e.target.value})} />
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 ml-1 uppercase">开始日期</span>
                        <input type="date" className="w-full px-4 py-3.5 rounded-2xl border font-bold text-slate-600 outline-none" value={editFormData.startDate} onChange={e => setEditFormData({...editFormData, startDate: e.target.value})} />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 ml-1 uppercase">结束日期</span>
                        <input type="date" className="w-full px-4 py-3.5 rounded-2xl border font-bold text-slate-600 outline-none" value={editFormData.endDate} min={editFormData.startDate} onChange={e => setEditFormData({...editFormData, endDate: e.target.value})} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t bg-white flex gap-4 shadow-inner">
                <button onClick={() => setIsEditing(false)} className="flex-1 py-4 rounded-2xl border-2 border-slate-100 font-bold text-slate-500 hover:bg-slate-50 transition-all">取消</button>
                <button onClick={saveStop} disabled={isSearching} className={`flex-1 py-4 rounded-2xl text-white font-bold shadow-xl transition-all flex items-center justify-center gap-2 ${isSearching ? 'bg-slate-400' : 'bg-slate-900 hover:bg-black'}`}>
                    {isSearching ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                    {isSearching ? '同步中...' : '确认并保存'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="p-6 bg-slate-900 text-white shadow-inner">
                <div className="relative">
                  <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input type="text" placeholder="搜索阶段、城市或场馆..." className="w-full bg-white/10 border-none rounded-xl py-3.5 pl-10 pr-4 text-xs font-bold text-white placeholder:text-slate-500 focus:ring-2 focus:ring-white/20 outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar animate-in fade-in duration-500">
                {phases.length === 0 && !isSyncing && (
                  <div className="text-center py-24 px-8">
                    <div className="bg-slate-100 w-24 h-24 rounded-[3rem] flex items-center justify-center mx-auto mb-6 text-slate-300"><MapIcon size={48} /></div>
                    <h3 className="font-black text-slate-800 text-lg uppercase tracking-tight">暂无行程规划</h3>
                    <p className="text-sm text-slate-400 mt-3 leading-relaxed">点击右上角的“新增站点”开始定义您的首个巡展阶段。</p>
                  </div>
                )}
                
                {phases.sort((a,b) => parseInt(a.phaseNumber) - parseInt(b.phaseNumber)).map(phase => {
                    const phaseStops = sortedStops.filter(s => s.phaseId === phase.id && (s.city.toLowerCase().includes(searchTerm.toLowerCase()) || (phase.subtitle && phase.subtitle.toLowerCase().includes(searchTerm.toLowerCase()))));
                    if (phaseStops.length === 0 && searchTerm) return null;
                    const isExp = expandedPhaseId === phase.id;
                    return (
                        <div key={phase.id} className="space-y-5 animate-in fade-in duration-500">
                            <div className="group bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all">
                                <div className="flex items-start gap-4">
                                    <button onClick={() => updatePhase(phase.id, { color: COLOR_PALETTE[(COLOR_PALETTE.findIndex(c => c.value === phase.color) + 1) % COLOR_PALETTE.length].value })} className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-slate-100 transition-transform group-hover:scale-105 active:scale-95" style={{ backgroundColor: phase.color }}><Layers size={22} /></button>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5 overflow-hidden">
                                                <span className="text-xs font-black text-slate-400 uppercase shrink-0">第</span>
                                                <EditableInput className="w-10 bg-slate-50 rounded px-1 font-black text-slate-800 focus:ring-1 focus:ring-slate-200 p-0 text-base text-center" value={phase.phaseNumber} onSave={(val) => updatePhase(phase.id, { phaseNumber: val })} />
                                                <span className="text-xs font-black text-slate-400 uppercase shrink-0">阶段</span>
                                            </div>
                                            <button onClick={() => setExpandedPhaseId(isExp ? null : phase.id)} className={`p-1.5 rounded-xl transition-all ${isExp ? 'bg-slate-100 text-slate-900' : 'text-slate-300 hover:text-slate-600'}`}><ChevronDown size={18} className={`transition-transform duration-300 ${isExp ? 'rotate-180' : ''}`} /></button>
                                        </div>
                                        <EditableInput className="w-full bg-transparent border-none font-bold text-slate-400 focus:ring-0 p-0 text-[10px] uppercase truncate mt-1" value={phase.subtitle} placeholder="添加描述说明..." onSave={(val) => updatePhase(phase.id, { subtitle: val })} />
                                    </div>
                                </div>
                                {isExp && (
                                    <div className="mt-6 pt-5 border-t border-slate-50 flex items-center justify-between animate-in slide-in-from-top-1">
                                        <div className="flex gap-1.5 overflow-hidden">
                                          {COLOR_PALETTE.slice(0, 8).map((c, i) => <div key={i} className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.value, opacity: phase.color === c.value ? 1 : 0.2 }} />)}
                                        </div>
                                        <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'phases', phase.id))} className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all font-bold text-[10px] uppercase"><Trash2 size={12} /> 删除此阶段</button>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-4 pl-4 border-l-2 border-slate-100">
                                {phaseStops.map((stop) => {
                                    const idx = sortedStops.findIndex(s => s.id === stop.id);
                                    return (
                                        <div key={stop.id} className={`p-5 rounded-[2rem] border transition-all cursor-pointer ${activeStopId === stop.id ? 'bg-white shadow-xl border-slate-200' : 'border-slate-50 bg-slate-50/40 hover:bg-white hover:border-slate-100'}`} style={{ borderLeft: activeStopId === stop.id ? `6px solid ${phase.color}` : '1px solid transparent' }} onClick={() => setActiveStopId(stop.id)}>
                                            <div className="flex gap-4">
                                                <div className={`text-[12px] font-black p-2 rounded-2xl border h-11 w-11 flex flex-col items-center justify-center transition-all ${activeStopId === stop.id ? 'text-white shadow-lg shadow-slate-100' : 'bg-white text-slate-300 border-slate-100'}`} style={{ backgroundColor: activeStopId === stop.id ? phase.color : undefined }}>{idx + 1}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start"><h3 className="font-bold text-slate-800 text-sm truncate">{stop.city}</h3><ChevronRight size={16} className={activeStopId === stop.id ? 'rotate-90 text-slate-400' : 'text-slate-200'} /></div>
                                                    <div className="text-[10px] text-slate-400 font-bold mt-2 uppercase flex items-center gap-2 tracking-tight"><Calendar size={12} /> <span>{stop.startDate} — {stop.endDate}</span></div>
                                                </div>
                                            </div>
                                            {activeStopId === stop.id && (
                                                <div className="mt-5 pt-5 border-t border-slate-50 flex gap-3 animate-in slide-in-from-top-2 duration-300">
                                                    <button onClick={(e) => { 
                                                      e.stopPropagation(); 
                                                      setEditFormData(stop); 
                                                      setPhaseFormData({ phaseNumber: phase.phaseNumber, subtitle: phase.subtitle, color: phase.color });
                                                      setIsEditing(true); 
                                                    }} className="flex-1 py-3 px-4 bg-slate-900 text-white rounded-2xl font-bold shadow-xl hover:bg-black transition-all flex items-center justify-center gap-2"><Edit2 size={14}/> 编辑站点</button>
                                                    <button onClick={(e) => { e.stopPropagation(); deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stops', stop.id)); }} className="p-3 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-all"><Trash2 size={18} /></button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
              </div>
            </div>
          )}
        </aside>

        <div className="flex-1 p-6 bg-slate-100 overflow-hidden relative">
          <div ref={mapContainerRef} className="h-full w-full shadow-2xl rounded-3xl overflow-hidden ring-1 ring-slate-200" />
          <div className="absolute top-10 right-10 z-[1000] flex flex-col gap-3">
            <button onClick={() => mapInstance.current?.setView([30, 110], 4)} className="p-4 bg-white shadow-2xl rounded-2xl text-slate-600 border border-slate-100 active:scale-95 transition-all hover:text-slate-900 shadow-xl" title="回到巡展中心"><MapIcon size={20} /></button>
          </div>
          {isEditing && (
            <div className="absolute top-10 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none w-full max-w-xs px-4">
              <div className="bg-slate-900/95 backdrop-blur-xl px-8 py-4 rounded-[2rem] text-[12px] font-black shadow-2xl flex items-center gap-4 border border-white/10 animate-bounce text-white justify-center text-center">
                {isSearching ? <Loader2 size={18} className="animate-spin text-blue-400 shrink-0" /> : <Move size={18} className="text-blue-400 shrink-0" />}
                {isSearching ? '正在同步坐标...' : `正在定位：${editFormData.city || '新站点'}`}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}