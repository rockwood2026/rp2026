import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Share2, Plus, X, Cloud, Calendar, Palette, Hash, LocateFixed } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, push, set } from 'firebase/database';

// --- VERIFIED FIREBASE CONFIG ---
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

// Simple coordinate lookup for accuracy
const cityCoords = {
  "北京": [39.9042, 116.4074],
  "Beijing": [39.9042, 116.4074],
  "上海": [31.2304, 121.4737],
  "Shanghai": [31.2304, 121.4737],
  "天津": [39.3434, 117.3616],
  "Tianjin": [39.3434, 117.3616],
  "成都": [30.5728, 104.0668],
  "广州": [23.1291, 113.2644]
};

function App() {
  const [stops, setStops] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [newStop, setNewStop] = useState({
    name: '', phase: '1', color: '#3b82f6',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    mapRef.current = window.L.map(mapContainerRef.current, { zoomControl: false }).setView([34.3416, 108.9398], 4);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
    window.L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);

    onValue(ref(db, 'stops'), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, val]) => ({ id, ...val }));
        setStops(list);
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];
        list.forEach(stop => {
          if (stop.lat && stop.lng) {
            const marker = window.L.circleMarker([stop.lat, stop.lng], {
              radius: 12, fillColor: stop.color, color: '#fff', weight: 3, fillOpacity: 0.9
            }).addTo(mapRef.current).bindPopup(`<b>${stop.name}</b><br>阶段 ${stop.phase}`);
            markersRef.current.push(marker);
          }
        });
      }
    });
  }, []);

  // AUTOMATIC COLOR LOGIC: Find existing color for the phase
  useEffect(() => {
    const existingPhase = stops.find(s => s.phase === newStop.phase);
    if (existingPhase) {
      setNewStop(prev => ({ ...prev, color: existingPhase.color }));
    }
  }, [newStop.phase, stops]);

  const handleSave = async () => {
    if (!newStop.name) return;
    
    // Check lookup table, or fallback to random if city unknown
    const coords = cityCoords[newStop.name] || [30 + Math.random() * 10, 105 + Math.random() * 10];

    try {
      await set(push(ref(db, 'stops')), { ...newStop, lat: coords[0], lng: coords[1] });
      setIsEditing(false);
      setNewStop({ name: '', phase: '1', color: '#3b82f6', startDate: newStop.startDate, endDate: newStop.endDate });
    } catch (e) { alert("Save failed."); }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <header className="flex items-center justify-between px-8 py-5 bg-white border-b border-slate-100 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 p-2.5 rounded-2xl text-white shadow-lg shadow-slate-200">
            <MapPin size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">巡展路线规划助手</h1>
            <div className="flex items-center gap-1.5 text-emerald-500 text-xs font-bold uppercase tracking-widest">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span>云端同步已开启</span>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <button className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all font-bold text-slate-600">
            <Share2 size={18} />
            <span>分享地图</span>
          </button>
          <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-300 font-bold">
            <Plus size={20} />
            <span>新增站点</span>
          </button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden p-6 gap-6">
        <div className="w-[400px] bg-white rounded-[32px] shadow-xl shadow-slate-100 border border-slate-100 flex flex-col overflow-hidden">
          {isEditing ? (
            <div className="p-8 flex flex-col h-full bg-white">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <LocateFixed size={24} className="text-slate-400" />
                  <h2 className="text-xl font-bold">编辑站点详情</h2>
                </div>
                <button onClick={() => setIsEditing(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">城市名称 (北京/上海/天津)</label>
                  <input 
                    type="text" placeholder="输入城市名称..."
                    className="w-full px-5 py-4 bg-slate-50 border-none rounded-3xl focus:ring-4 focus:ring-slate-100 transition-all text-lg font-medium"
                    value={newStop.name} onChange={e => setNewStop({...newStop, name: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-2">
                      <Hash size={14} /> 阶段编号
                    </label>
                    <input 
                      type="number" className="w-full px-5 py-4 bg-slate-50 border-none rounded-3xl"
                      value={newStop.phase} onChange={e => setNewStop({...newStop, phase: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-2">
                      <Palette size={14} /> 阶段颜色
                    </label>
                    <input 
                      type="color" className="w-full h-[60px] p-2 bg-slate-50 border-none rounded-3xl cursor-pointer disabled:opacity-50"
                      value={newStop.color} 
                      onChange={e => setNewStop({...newStop, color: e.target.value})}
                      disabled={stops.some(s => s.phase === newStop.phase)} // Lock color if phase exists
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-2">
                    <Calendar size={14} /> 时间安排
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="date" className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl text-sm" value={newStop.startDate} onChange={e => setNewStop({...newStop, startDate: e.target.value})} />
                    <input type="date" className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl text-sm" value={newStop.endDate} onChange={e => setNewStop({...newStop, endDate: e.target.value})} />
                  </div>
                </div>
              </div>

              <button onClick={handleSave} className="mt-8 w-full py-5 bg-slate-900 text-white rounded-[24px] font-bold text-lg hover:bg-slate-800 transition-all shadow-2xl shadow-slate-300">
                确认并保存
              </button>
            </div>
          ) : stops.length > 0 ? (
            <div className="flex flex-col h-full bg-white">
              <div className="p-6 border-b border-slate-50">
                <h2 className="text-lg font-bold text-slate-800">已规划站点 ({stops.length})</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {stops.map((stop) => (
                  <div key={stop.id} className="p-5 bg-slate-50 rounded-3xl border border-transparent hover:border-slate-200 transition-all group">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: stop.color }} />
                        <span className="font-extrabold text-slate-800 text-lg">{stop.name}</span>
                      </div>
                      <div className="text-[10px] bg-white px-2.5 py-1 rounded-xl shadow-sm font-black text-slate-400 uppercase tracking-tighter">
                        PHASE {stop.phase}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                      <Calendar size={14} /> {stop.startDate} — {stop.endDate}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-12 flex flex-col items-center justify-center text-center h-full">
               <div className="w-32 h-32 bg-slate-50 rounded-[40px] flex items-center justify-center mb-8 rotate-12">
                 <MapPin size={56} className="text-slate-200" />
               </div>
               <h3 className="text-slate-900 font-extrabold text-2xl mb-3">暂无行程规划</h3>
               <p className="text-slate-400 text-base leading-relaxed max-w-[240px]">点击右上角的新增站点开始。</p>
            </div>
          )}
        </div>

        <div className="flex-1 bg-white rounded-[40px] shadow-2xl shadow-slate-200 border border-white overflow-hidden relative">
          <div ref={mapContainerRef} className="absolute inset-0 z-0" style={{ height: '100%', width: '100%' }} />
          <div className="absolute top-6 right-6 z-[400] bg-white/80 backdrop-blur-md p-3 rounded-2xl border border-white shadow-lg pointer-events-none text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Map Engine Active</div>
        </div>
      </main>
    </div>
  );
}

export default App;