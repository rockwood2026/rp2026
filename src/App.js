import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapPin, Plus, Trash2, Calendar, ChevronDown, Clock } from 'lucide-react';
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
  
  // Default values for a new stop
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
  const layersRef = useRef({ markers: [], paths: [] });

  // --- 1. Organize Stops by Phase ---
  const groupedStops = useMemo(() => {
    const groups = {};
    const sorted = [...stops].sort((a, b) => a.order - b.order);
    sorted.forEach(stop => {
      if (!groups[stop.phase]) {
        groups[stop.phase] = { stops: [], color: stop.color, start: stop.startDate, end: stop.endDate };
      }
      groups[stop.phase].stops.push(stop);
      // Keep track of the earliest start and latest end date for the whole phase
      if (new Date(stop.startDate) < new Date(groups[stop.phase].start)) groups[stop.phase].start = stop.startDate;
      if (new Date(stop.endDate) > new Date(groups[stop.phase].end)) groups[stop.phase].end = stop.endDate;
    });
    return groups;
  }, [stops]);

  // --- 2. Map Setup ---
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    
    // Create the map centered on China
    mapRef.current = window.L.map(mapContainerRef.current, { zoomControl: false }).setView([34.3416, 108.9398], 4);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
    
    // Listen to Firebase for data
    onValue(ref(db, 'stops'), (snapshot) => {
      const data = snapshot.val();
      const list = data ? Object.entries(data).map(([id, val]) => ({ id, ...val })) : [];
      setStops(list.sort((a, b) => a.order - b.order));
    });
  }, []);

  // --- 3. Draw Markers & Lines ---
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove old markers and lines
    layersRef.current.markers.forEach(m => m.remove());
    layersRef.current.paths.forEach(p => p.remove());
    layersRef.current = { markers: [], paths: [] };

    Object.values(groupedStops).forEach((group) => {
      const pathCoords = [];
      
      group.stops.forEach((stop, index) => {
        if (!stop.lat || !stop.lng) return;
        pathCoords.push([stop.lat, stop.lng]);

        // Create the numbered Pin
        const icon = window.L.divIcon({
          className: '',
          html: `<div style="position:relative; display:flex; flex-direction:column; align-items:center;">
                  <div style="background-color:${stop.color}; width:30px; height:30px; border-radius:50% 50% 50% 0; transform:rotate(-45deg); border:2px solid white; display:flex; align-items:center; justify-content:center; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                    <span style="transform:rotate(45deg); color:white; font-weight:bold; font-size:12px;">${index + 1}</span>
                  </div>
                </div>`,
          iconSize: [30, 30], iconAnchor: [15, 30]
        });

        const marker = window.L.marker([stop.lat, stop.lng], { icon }).addTo(mapRef.current);
        layersRef.current.markers.push(marker);
      });

      // Draw the animated line between cities
      if (pathCoords.length > 1) {
        const polyline = window.L.polyline(pathCoords, {
          color: group.color,
          weight: 4,
          dashArray: '10, 15',
          className: 'marching-ants' 
        }).addTo(mapRef.current);
        layersRef.current.paths.push(polyline);
      }
    });
  }, [groupedStops]);

  // --- 4. Actions (Save, Move, Delete) ---
  const handleSave = async () => {
    if (!newStop.name) return;
    
    // Turn city name into Lat/Lng coordinates
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
    } else {
      alert("Could not find this city. Please try a more specific name.");
    }
  };

  const deleteStop = async (id) => {
    if(window.confirm("确定要删除这个站点吗？")) {
      await remove(ref(db, `stops/${id}`));
    }
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
        @keyframes dash { to { stroke-dashoffset: -25; } }
        .marching-ants { animation: dash 1.5s linear infinite; }
      `}</style>

      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 bg-white border-b border-slate-100 z-10">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2.5 rounded-2xl text-white shadow-lg shadow-blue-200"><MapPin size={24} /></div>
          <h1 className="text-xl font-bold uppercase tracking-tight">巡展路线规划助手</h1>
        </div>
        <button 
          onClick={() => {setIsEditing(true); setEditingId(null);}} 
          className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-2xl shadow-xl hover:bg-slate-800 transition-all font-bold"
        >
          <Plus size={20} /><span>新增站点</span>
        </button>
      </header>

      <main className="flex flex-1 overflow-hidden p-6 gap-6">
        {/* Sidebar */}
        <div className="w-[420px] bg-white rounded-[40px] shadow-2xl border border-slate-100 flex flex-col overflow-hidden">
          {isEditing ? (
            <div className="p-8 flex flex-col h-full bg-white animate-in fade-in slide-in-from-right-4">
               <div className="flex justify-between items-center mb-8">
                 <h2 className="text-2xl font-black">编辑站点</h2>
                 <button onClick={() => setIsEditing(false)} className="p-2 bg-slate-100 rounded-full"><Plus className="rotate-45" /></button>
               </div>
               
               <div className="space-y-6">
                 <div>
                   <label className="text-[10px] font-black text-slate-400 mb-2 block uppercase">城市名称</label>
                   <input className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-2 border-transparent focus:border-blue-500 outline-none transition-all" placeholder="例如：上海" value={newStop.name} onChange={e => setNewStop({...newStop, name: e.target.value})} />
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="text-[10px] font-black text-slate-400 mb-2 block uppercase">阶段 (Phase)</label>
                     <input type="number" className="w-full p-4 bg-slate-50 rounded-2xl font-black outline-none" value={newStop.phase} onChange={e => setNewStop({...newStop, phase: e.target.value})} />
                   </div>
                   <div>
                     <label className="text-[10px] font-black text-slate-400 mb-2 block uppercase">主题颜色</label>
                     <input type="color" className="w-full h-[56px] p-1 bg-slate-50 rounded-2xl cursor-pointer" value={newStop.color} onChange={e => setNewStop({...newStop, color: e.target.value})} />
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="text-[10px] font-black text-slate-400 mb-2 block uppercase">开始日期</label>
                     <input type="date" className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-sm outline-none" value={newStop.startDate} onChange={e => setNewStop({...newStop, startDate: e.target.value})} />
                   </div>
                   <div>
                     <label className="text-[10px] font-black text-slate-400 mb-2 block uppercase">结束日期</label>
                     <input type="date" className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-sm outline-none" value={newStop.endDate} onChange={e => setNewStop({...newStop, endDate: e.target.value})} />
                   </div>
                 </div>
               </div>
               
               <button onClick={handleSave} className="mt-auto w-full py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-[24px] font-black text-lg shadow-lg shadow-blue-100 transition-all">确认并保存</button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {Object.entries(groupedStops).length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4 mt-20">
                  <MapPin size={48} strokeWidth={1} />
                  <p className="font-bold">还没有站点，点击右上角开始</p>
                </div>
              )}
              
              {Object.entries(groupedStops).map(([phase, data]) => (
                <div key={phase} className="space-y-4">
                  <div className="p-6 rounded-[32px] border-2 flex flex-col gap-2 transition-all" style={{ borderColor: data.color, backgroundColor: `${data.color}08` }}>
                    <div className="flex justify-between items-center">
                      <span className="font-black text-sm uppercase tracking-widest" style={{ color: data.color }}>Phase {phase}</span>
                      <div className="px-3 py-1 bg-white rounded-full text-[10px] font-black shadow-sm" style={{ color: data.color }}>{data.stops.length} STOPS</div>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                      <Calendar size={12} /> {data.start} — {data.end}
                    </div>
                  </div>
                  
                  <div className="space-y-3 ml-4 border-l-2 border-dashed border-slate-200 pl-6">
                    {data.stops.map((stop, idx) => (
                      <div key={stop.id} className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-blue-200 transition-all">
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] font-black text-slate-300">{(idx + 1).toString().padStart(2, '0')}</span>
                          <div>
                            <p className="font-bold text-slate-800 leading-none mb-1">{stop.name}</p>
                            <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1"><Clock size={10}/> {stop.startDate}</p>
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => moveStop(stops.indexOf(stop), -1)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><ChevronDown size={14} className="rotate-180" /></button>
                          <button onClick={() => moveStop(stops.indexOf(stop), 1)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><ChevronDown size={14} /></button>
                          <button onClick={() => deleteStop(stop.id)} className="p-1.5 hover:bg-red-50 text-red-400 rounded-lg"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Map Container */}
        <div className="flex-1 bg-white rounded-[48px] shadow-2xl border-[12px] border-white overflow-hidden relative">
          <div ref={mapContainerRef} className="absolute inset-0 z-0" />
        </div>
      </main>
    </div>
  );
}

export default App;