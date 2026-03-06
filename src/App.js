import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapPin, Plus, Trash2, Calendar, X, Share2, Download, Check } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, push, set, remove, update } from 'firebase/database';
import * as htmlToImage from 'html-to-image';

// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyCDbnnEkMGYu3HMJAb8kViLnJZfazJ1qms",
  authDomain: "rp2026-b5d0a11111.firebaseapp.com",
  databaseURL: "https://rp2026-b5d0a11111-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "rp2026-b5d0a11111",
  storageBucket: "rp2026-b5d0a11111.firebasestorage.app",
  messagingSenderId: "864135040245",
  appId: "1:864135040245:web:3e8e2d336ce379575d49bc",
  measurementId: "G-MEFFLWYC9S"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

function App() {
  const [stops, setStops] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [shareStatus, setShareStatus] = useState(false);
  
  const initialStopState = {
    name: '', phase: '1', color: '#3b82f6', lat: null, lng: null,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  };
  
  const [newStop, setNewStop] = useState(initialStopState);
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const exportRef = useRef(null);
  const layersRef = useRef({ markers: [], paths: [], arrows: [] });

  // --- 1. Chronology & Grouping ---
  const groupedStops = useMemo(() => {
    const groups = {};
    const sorted = [...stops].sort((a, b) => a.order - b.order);
    sorted.forEach(stop => {
      if (!groups[stop.phase]) {
        groups[stop.phase] = { stops: [], color: stop.color, start: stop.startDate };
      }
      groups[stop.phase].stops.push(stop);
    });
    return groups;
  }, [stops]);

  // --- 2. Map Initialization ---
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    mapRef.current = window.L.map(mapContainerRef.current, { 
        zoomControl: false, 
        attributionControl: false 
    }).setView([34.3416, 108.9398], 4);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
    
    onValue(ref(db, 'stops'), (snapshot) => {
      const data = snapshot.val();
      const list = data ? Object.entries(data).map(([id, val]) => ({ id, ...val })) : [];
      setStops(list.sort((a, b) => a.order - b.order));
    });
  }, []);

  // --- 3. Animation Logic with Symmetrical Alignment ---
  useEffect(() => {
    if (!mapRef.current) return;
    layersRef.current.markers.forEach(m => m.remove());
    layersRef.current.paths.forEach(p => p.remove());
    layersRef.current.arrows.forEach(a => a.remove());
    layersRef.current = { markers: [], paths: [], arrows: [] };
    const animationIds = [];

    Object.values(groupedStops).forEach((group) => {
      const pathCoords = group.stops.filter(s => s.lat && s.lng).map(s => [s.lat, s.lng]);
      
      group.stops.forEach((stop, index) => {
        if (!stop.lat || !stop.lng) return;
        const icon = window.L.divIcon({
          className: '',
          html: `<div style="background-color:${stop.color}; width:28px; height:28px; border-radius:50% 50% 50% 0; transform:rotate(-45deg); border:2px solid white; display:flex; align-items:center; justify-content:center; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
                    <span style="transform:rotate(45deg); color:white; font-weight:bold; font-size:11px;">${index + 1}</span>
                 </div>`,
          iconSize: [28, 28], iconAnchor: [14, 28]
        });
        const marker = window.L.marker([stop.lat, stop.lng], { icon }).addTo(mapRef.current);
        layersRef.current.markers.push(marker);
      });

      if (pathCoords.length > 1) {
        const polyline = window.L.polyline(pathCoords, { color: group.color, weight: 3, dashArray: '8, 12', className: 'marching-ants' }).addTo(mapRef.current);
        layersRef.current.paths.push(polyline);

        // SVG Path redesigned to point STRAIGHT UP (North) for easier symmetry math
        const arrowIcon = window.L.divIcon({
          className: '',
          html: `<div class="arrow-container" style="color:${group.color}; filter: drop-shadow(0 0 2px white); opacity: 0; transition: opacity 0.3s; pointer-events: none;">
                  <svg width="24" height="24" viewBox="0 0 24 24" style="position: absolute; top: 50%; left: 50%; margin: -12px 0 0 -12px;">
                    <path d="M12 2L21 21L12 17L3 21L12 2Z" fill="currentColor"/>
                  </svg>
                 </div>`,
          iconSize: [24, 24]
        });

        const arrowMarker = window.L.marker(pathCoords[0], { icon: arrowIcon }).addTo(mapRef.current);
        layersRef.current.arrows.push(arrowMarker);

        let totalDistance = 0;
        const segments = [];
        for (let i = 0; i < pathCoords.length - 1; i++) {
          const dist = mapRef.current.distance(pathCoords[i], pathCoords[i+1]);
          segments.push({ start: pathCoords[i], end: pathCoords[i+1], dist, cumulative: totalDistance });
          totalDistance += dist;
        }

        let traveled = 0;
        const speed = totalDistance / 800; // Speed control

        const animate = () => {
          traveled = (traveled + speed) % totalDistance;
          const seg = segments.find((s, idx) => traveled >= s.cumulative && (idx === segments.length - 1 || traveled < segments[idx + 1].cumulative));

          if (seg) {
            const percent = (traveled - seg.cumulative) / seg.dist;
            const lat = seg.start[0] + (seg.end[0] - seg.start[0]) * percent;
            const lng = seg.start[1] + (seg.end[1] - seg.start[1]) * percent;
            
            // MATH: Calculate angle for symmetry against the path
            const point1 = mapRef.current.latLngToContainerPoint(seg.start);
            const point2 = mapRef.current.latLngToContainerPoint(seg.end);
            const angle = Math.atan2(point2.y - point1.y, point2.x - point1.x) * (180 / Math.PI) + 90;

            const totalPercent = traveled / totalDistance;
            let opacity = 1;
            if (totalPercent < 0.05) opacity = totalPercent / 0.05;
            if (totalPercent > 0.95) opacity = (1 - totalPercent) / 0.05;

            arrowMarker.setLatLng([lat, lng]);
            const el = arrowMarker.getElement();
            if (el) {
                const container = el.querySelector('.arrow-container');
                const svg = el.querySelector('svg');
                if (container) container.style.opacity = opacity;
                if (svg) svg.style.transform = `rotate(${angle}deg)`;
            }
          }
          animationIds.push(requestAnimationFrame(animate));
        };
        animate();
      }
    });
    return () => animationIds.forEach(id => cancelAnimationFrame(id));
  }, [groupedStops]);

  // --- 4. Shared & Export ---
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setShareStatus(true);
    setTimeout(() => setShareStatus(false), 2000);
  };

  const handleExport = async () => {
    if (exportRef.current) {
        const dataUrl = await htmlToImage.toPng(exportRef.current, { backgroundColor: '#f8fafc' });
        const link = document.createElement('a');
        link.download = 'route-map.png';
        link.href = dataUrl;
        link.click();
    }
  };

  const handleSave = async () => {
    if (!newStop.name) return;
    const dateTaken = stops.some(s => s.id !== editingId && s.startDate === newStop.startDate);
    if (dateTaken) return alert(`日期 ${newStop.startDate} 已被占用！`);
    const colorUsed = stops.some(s => s.phase !== newStop.phase && s.color === newStop.color);
    if (colorUsed) return alert("该颜色已被其他阶段使用！");

    const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${newStop.name}`);
    const data = await resp.json();
    if (data[0]) {
      const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      const targetRef = editingId ? ref(db, `stops/${editingId}`) : push(ref(db, 'stops'));
      await set(targetRef, { ...newStop, ...coords, order: editingId ? newStop.order : stops.length });
      setIsEditing(false);
      setEditingId(null);
      setNewStop(initialStopState);
    }
  };

  const deleteStop = (id) => { if(window.confirm("确定删除？")) remove(ref(db, `stops/${id}`)); };

  return (
    <div ref={exportRef} className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <style>{`
        @keyframes dash { to { stroke-dashoffset: -20; } }
        .marching-ants { animation: dash 1s linear infinite; }
      `}</style>

      <header className="flex items-center justify-between px-8 py-5 bg-white border-b border-slate-100 z-10">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded-xl text-white shadow-md"><MapPin size={20} /></div>
          <h1 className="text-lg font-bold tracking-tight">巡展路线规划助手</h1>
        </div>
        <div className="flex items-center gap-3">
            <button onClick={handleShare} className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all flex items-center gap-2 font-bold text-sm">
                {shareStatus ? <Check size={18} className="text-green-600"/> : <Share2 size={18} />}
                <span>{shareStatus ? '已复制' : '分享'}</span>
            </button>
            <button onClick={handleExport} className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all flex items-center gap-2 font-bold text-sm">
                <Download size={18} /><span>导出图片</span>
            </button>
            <button onClick={() => {setIsEditing(true); setEditingId(null); setNewStop(initialStopState);}} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg">
                <Plus size={18} /><span>新增站点</span>
            </button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden p-6 gap-6">
        <div className="w-[380px] bg-white rounded-[32px] shadow-xl border border-slate-100 flex flex-col overflow-hidden">
          {isEditing ? (
            <div className="p-8 flex flex-col h-full bg-white animate-in slide-in-from-right-4 duration-200">
               <div className="flex justify-between items-center mb-8">
                 <h2 className="text-xl font-bold">{editingId ? '编辑' : '新增'}</h2>
                 <button onClick={() => setIsEditing(false)} className="p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
               </div>
               <div className="space-y-5">
                 <input className="w-full p-4 bg-slate-50 rounded-xl font-bold border-2 border-transparent focus:border-blue-500 outline-none transition-all" placeholder="城市" value={newStop.name} onChange={e => setNewStop({...newStop, name: e.target.value})} />
                 <div className="grid grid-cols-2 gap-4">
                    <input type="number" className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none" placeholder="Phase" value={newStop.phase} onChange={e => setNewStop({...newStop, phase: e.target.value})} />
                    <input type="color" className="w-full h-14 p-1 bg-slate-50 rounded-xl cursor-pointer" value={newStop.color} onChange={e => setNewStop({...newStop, color: e.target.value})} />
                 </div>
                 <input type="date" className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none" value={newStop.startDate} onChange={e => setNewStop({...newStop, startDate: e.target.value, endDate: e.target.value})} />
               </div>
               <button onClick={handleSave} className="mt-auto w-full py-4 bg-blue-600 text-white rounded-xl font-bold">保存</button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {Object.entries(groupedStops).map(([phase, data]) => (
                <div key={phase} className="space-y-3">
                  <div className="flex justify-between items-center px-2">
                    <span className="font-bold text-xs uppercase tracking-widest" style={{ color: data.color }}>Phase {phase}</span>
                  </div>
                  <div className="space-y-2">
                    {data.stops.map((stop, idx) => (
                      <div key={stop.id} className="p-4 bg-white rounded-xl border border-slate-100 flex items-center justify-between group hover:border-blue-100 transition-all shadow-sm">
                        <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => {setNewStop(stop); setEditingId(stop.id); setIsEditing(true);}}>
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stop.color }} />
                          <div>
                            <p className="font-bold text-slate-700 text-sm">{stop.name}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">{stop.startDate}</p>
                          </div>
                        </div>
                        <button onClick={() => deleteStop(stop.id)} className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 text-red-400 rounded transition-all"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 bg-white rounded-[40px] shadow-2xl border-[8px] border-white overflow-hidden relative">
          <div ref={mapContainerRef} className="absolute inset-0" />
        </div>
      </main>
    </div>
  );
}

export default App;