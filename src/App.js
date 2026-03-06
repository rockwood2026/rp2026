import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapPin, Plus, Trash2, Calendar, ChevronDown, Clock, X, Edit2 } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, push, set, remove, update } from 'firebase/database';

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
  
  const initialStopState = {
    name: '', 
    phase: '1', 
    color: '#3b82f6', 
    lat: null, 
    lng: null,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  };
  
  const [newStop, setNewStop] = useState(initialStopState);

  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const layersRef = useRef({ markers: [], paths: [], arrows: [] });

  // --- 1. Chronology & Grouping Logic ---
  const groupedStops = useMemo(() => {
    const groups = {};
    const sorted = [...stops].sort((a, b) => a.order - b.order);
    sorted.forEach(stop => {
      if (!groups[stop.phase]) {
        groups[stop.phase] = { stops: [], color: stop.color, start: stop.startDate, end: stop.endDate };
      }
      groups[stop.phase].stops.push(stop);
      if (new Date(stop.startDate) < new Date(groups[stop.phase].start)) groups[stop.phase].start = stop.startDate;
      if (new Date(stop.endDate) > new Date(groups[stop.phase].end)) groups[stop.phase].end = stop.endDate;
    });
    return groups;
  }, [stops]);

  // --- 2. Map Initialization ---
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    mapRef.current = window.L.map(mapContainerRef.current, { zoomControl: false }).setView([34.3416, 108.9398], 4);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
    
    onValue(ref(db, 'stops'), (snapshot) => {
      const data = snapshot.val();
      const list = data ? Object.entries(data).map(([id, val]) => ({ id, ...val })) : [];
      setStops(list.sort((a, b) => a.order - b.order));
    });
  }, []);

  // --- 3. Map Drawing with Moving Arrow ---
  useEffect(() => {
    if (!mapRef.current) return;
    
    layersRef.current.markers.forEach(m => m.remove());
    layersRef.current.paths.forEach(p => p.remove());
    layersRef.current.arrows.forEach(a => a.remove());
    layersRef.current = { markers: [], paths: [], arrows: [] };

    Object.values(groupedStops).forEach((group) => {
      const pathCoords = [];
      group.stops.forEach((stop, index) => {
        if (!stop.lat || !stop.lng) return;
        const pos = [stop.lat, stop.lng];
        pathCoords.push(pos);

        const icon = window.L.divIcon({
          className: '',
          html: `<div style="background-color:${stop.color}; width:28px; height:28px; border-radius:50% 50% 50% 0; transform:rotate(-45deg); border:2px solid white; display:flex; align-items:center; justify-content:center; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
                    <span style="transform:rotate(45deg); color:white; font-weight:bold; font-size:11px;">${index + 1}</span>
                 </div>`,
          iconSize: [28, 28], iconAnchor: [14, 28]
        });
        const marker = window.L.marker(pos, { icon }).addTo(mapRef.current);
        layersRef.current.markers.push(marker);
      });

      if (pathCoords.length > 1) {
        const polyline = window.L.polyline(pathCoords, { color: group.color, weight: 3, dashArray: '8, 12', className: 'marching-ants' }).addTo(mapRef.current);
        layersRef.current.paths.push(polyline);

        const arrowIcon = window.L.divIcon({
          className: '',
          html: `<div style="color:${group.color}; filter: drop-shadow(0 0 2px white); transform: translate(-50%, -50%);">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                 </div>`,
          iconSize: [20, 20]
        });

        const arrowMarker = window.L.marker(pathCoords[0], { icon: arrowIcon }).addTo(mapRef.current);
        layersRef.current.arrows.push(arrowMarker);

        let step = 0;
        const animate = () => {
          step = (step + 0.002) % 1; 
          const totalPoints = pathCoords.length - 1;
          const segmentIndex = Math.floor(step * totalPoints);
          const segmentStep = (step * totalPoints) % 1;
          const start = pathCoords[segmentIndex];
          const end = pathCoords[segmentIndex + 1];

          if (start && end) {
            const lat = start[0] + (end[0] - start[0]) * segmentStep;
            const lng = start[1] + (end[1] - start[1]) * segmentStep;
            const angle = Math.atan2(end[0] - start[0], end[1] - start[1]) * (180 / Math.PI);
            arrowMarker.setLatLng([lat, lng]);
            const el = arrowMarker.getElement();
            if (el) el.style.transform += ` rotate(${90 - angle}deg)`;
          }
          requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      }
    });
  }, [groupedStops]);

  // --- 4. Actions ---
  const handleEditInitiate = (stop) => {
    setNewStop({ ...stop });
    setEditingId(stop.id);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!newStop.name) return;

    const dateIsTaken = stops.some(stop => 
      stop.id !== editingId && 
      stop.startDate === newStop.startDate
    );

    if (dateIsTaken) {
      alert(`日期 ${newStop.startDate} 已被占用！`);
      return;
    }

    const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${newStop.name}`);
    const data = await resp.json();
    
    if (data[0]) {
      const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      const targetRef = editingId ? ref(db, `stops/${editingId}`) : push(ref(db, 'stops'));
      
      await set(targetRef, { 
        ...newStop, 
        ...coords, 
        order: editingId ? newStop.order : stops.length 
      });
      
      setIsEditing(false);
      setEditingId(null);
      setNewStop(initialStopState);
    }
  };

  const deleteStop = async (id) => {
    if(window.confirm("确定删除？")) await remove(ref(db, `stops/${id}`));
  };

  const moveStop = async (index, direction) => {
    const newStops = [...stops];
    const target = index + direction;
    if (target < 0 || target >= newStops.length) return;
    [newStops[index], newStops[target]] = [newStops[target], newStops[index]];
    const updates = {};
    newStops.forEach((s, i) => { updates[`stops/${s.id}/order`] = i; });
    await update(ref(db), updates);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <style>{`
        @keyframes dash { to { stroke-dashoffset: -20; } }
        .marching-ants { animation: dash 1s linear infinite; }
      `}</style>

      <header className="flex items-center justify-between px-8 py-5 bg-white border-b border-slate-100 z-10">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded-xl text-white"><MapPin size={20} /></div>
          <h1 className="text-lg font-bold">巡展路线规划</h1>
        </div>
        <button onClick={() => {setIsEditing(true); setEditingId(null); setNewStop(initialStopState);}} className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white rounded-xl font-bold hover:scale-105 transition-transform">
          <Plus size={18} /><span>添加城市</span>
        </button>
      </header>

      <main className="flex flex-1 overflow-hidden p-6 gap-6">
        <div className="w-[380px] bg-white rounded-[32px] shadow-xl border border-slate-100 flex flex-col overflow-hidden">
          {isEditing ? (
            <div className="p-8 flex flex-col h-full bg-white animate-in slide-in-from-right-4 duration-300">
               <div className="flex justify-between items-center mb-8">
                 <h2 className="text-xl font-bold">{editingId ? '修改站点' : '新增站点'}</h2>
                 <button onClick={() => setIsEditing(false)} className="p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
               </div>
               <div className="space-y-5">
                 <div>
                    <label className="text-[10px] font-bold text-slate-400 mb-1 block">城市名称</label>
                    <input className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none" placeholder="例如：上海" value={newStop.name} onChange={e => setNewStop({...newStop, name: e.target.value})} />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 mb-1 block">阶段 (Phase)</label>
                        <input type="number" className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none" value={newStop.phase} onChange={e => setNewStop({...newStop, phase: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 mb-1 block">主题色</label>
                        <input type="color" className="w-full h-14 p-1 bg-slate-50 rounded-xl cursor-pointer" value={newStop.color} onChange={e => setNewStop({...newStop, color: e.target.value})} />
                    </div>
                 </div>
                 <div>
                    <label className="text-[10px] font-bold text-slate-400 mb-1 block">日期</label>
                    <input type="date" className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none" value={newStop.startDate} onChange={e => setNewStop({...newStop, startDate: e.target.value, endDate: e.target.value})} />
                 </div>
               </div>
               <button onClick={handleSave} className="mt-auto w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 transition-colors hover:bg-blue-700">
                {editingId ? '保存修改' : '确认新增'}
               </button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {Object.entries(groupedStops).length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2 mt-20">
                  <MapPin size={40} strokeWidth={1} />
                  <p className="text-xs font-bold">还没有规划站点</p>
                </div>
              )}
              {Object.entries(groupedStops).map(([phase, data]) => (
                <div key={phase} className="space-y-3">
                  <div className="flex justify-between items-center px-2">
                    <span className="font-bold text-xs uppercase tracking-widest" style={{ color: data.color }}>Phase {phase}</span>
                    <span className="text-[10px] font-bold text-slate-300 uppercase">{data.start}</span>
                  </div>
                  <div className="space-y-2">
                    {data.stops.map((stop, idx) => (
                      <div key={stop.id} className="p-4 bg-white rounded-xl border border-slate-100 flex items-center justify-between group hover:border-blue-100 transition-all shadow-sm">
                        <div 
                          className="flex items-center gap-3 cursor-pointer flex-1"
                          onClick={() => handleEditInitiate(stop)}
                        >
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stop.color }} />
                          <div>
                            <p className="font-bold text-slate-700 text-sm">{stop.name}</p>
                            <p className="text-[9px] text-slate-400 font-bold tracking-tighter uppercase">{stop.startDate}</p>
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                          <button onClick={() => handleEditInitiate(stop)} className="p-1.5 hover:bg-slate-100 rounded text-slate-400"><Edit2 size={14} /></button>
                          <button onClick={() => moveStop(stops.indexOf(stop), -1)} className="p-1.5 hover:bg-slate-100 rounded text-slate-400"><ChevronDown size={14} className="rotate-180" /></button>
                          <button onClick={() => moveStop(stops.indexOf(stop), 1)} className="p-1.5 hover:bg-slate-100 rounded text-slate-400"><ChevronDown size={14} /></button>
                          <button onClick={() => deleteStop(stop.id)} className="p-1.5 hover:bg-red-50 text-red-400 rounded"><Trash2 size={14} /></button>
                        </div>
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