import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Share2, Plus, X, Cloud, Calendar, Palette, Hash, LocateFixed } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, push, set } from 'firebase/database';

// --- YOUR VERIFIED FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyCDbnnEkMGYu3HMJAb8kViLnJZfazJ1qms",
  authDomain: "rp2026-b5d0a11111.firebaseapp.com",
  databaseURL: "https://rp2026-b5d0a11111-default-rtdb.firebaseio.com",
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
  const [newStop, setNewStop] = useState({
    name: '',
    address: '',
    phase: '1',
    color: '#1e293b',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const markersRef = useRef([]);

  // Initialize Map
  useEffect(() => {
    if (!window.L || mapRef.current) return;
    
    mapRef.current = window.L.map(mapContainerRef.current, {
      zoomControl: false 
    }).setView([34.3416, 108.9398], 4);

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(mapRef.current);

    window.L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);

    // Sync with Firebase
    const stopsRef = ref(db, 'stops');
    onValue(stopsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, val]) => ({ id, ...val }));
        setStops(list);
        
        // Clear existing markers
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];

        // Add markers based on saved colors/phases
        list.forEach(stop => {
          if (stop.lat && stop.lng) {
            const marker = window.L.circleMarker([stop.lat, stop.lng], {
              radius: 10,
              fillColor: stop.color || '#3b82f6',
              color: '#fff',
              weight: 3,
              opacity: 1,
              fillOpacity: 0.9
            }).addTo(mapRef.current)
              .bindPopup(`<b>${stop.name}</b><br>阶段: ${stop.phase}<br>${stop.startDate} 至 ${stop.endDate}`);
            
            markersRef.current.push(marker);
          }
        });
      }
    });
  }, []);

  const handleSave = async () => {
    if (!newStop.name) return;
    
    // Simulate coordinates (replace with Geocoding API if needed)
    const lat = 30 + Math.random() * 10;
    const lng = 105 + Math.random() * 15;

    try {
      const stopsRef = ref(db, 'stops');
      const newStopRef = push(stopsRef);
      await set(newStopRef, { ...newStop, lat, lng });
      
      setIsEditing(false);
      setNewStop({ 
        name: '', address: '', phase: '1', color: '#1e293b', 
        startDate: new Date().toISOString().split('T')[0], 
        endDate: new Date().toISOString().split('T')[0] 
      });
    } catch (error) {
      console.error("Firebase error:", error);
      alert("提交失败，请检查 Firebase 规则设置。");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Top Navigation */}
      <header className="flex items-center justify-between px-8 py-5 bg-white border-b border-slate-100 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 p-2.5 rounded-2xl text-white shadow-lg shadow-slate-200">
            <MapPin size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">巡展路线规划助手</h1>
            <div className="flex items-center gap-1.5 text-emerald-500 text-xs font-bold">
              <Cloud size={14} />
              <span>云端同步已开启</span>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <button className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all font-bold text-slate-600">
            <Share2 size={18} />
            <span>分享地图</span>
          </button>
          <button 
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-300 font-bold"
          >
            <Plus size={20} />
            <span>新增站点</span>
          </button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden p-6 gap-6">
        {/* Left Panel: Editor or List */}
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
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">城市名称</label>
                  <input 
                    type="text" placeholder="例如：上海、北京..."
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
                      type="number" className="w-full px-5 py-4 bg-slate-50 border-none rounded-3xl focus:ring-4 focus:ring-slate-100"
                      value={newStop.phase} onChange={e => setNewStop({...newStop, phase: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-2">
                      <Palette size={14} /> 阶段颜色
                    </label>
                    <input 
                      type="color" className="w-full h-[60px] p-2 bg-slate-50 border-none rounded-3xl cursor-pointer"
                      value={newStop.color} onChange={e => setNewStop({...newStop, color: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-2">
                    <Calendar size={14} /> 时间安排 (开始 - 结束)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <input 
                      type="date" className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-medium"
                      value={newStop.startDate} onChange={e => setNewStop({...newStop, startDate: e.target.value})}
                    />
                    <input 
                      type="date" className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-medium"
                      value={newStop.endDate} onChange={e => setNewStop({...newStop, endDate: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <button 
                onClick={handleSave}
                className="mt-8 w-full py-5 bg-slate-900 text-white rounded-[24px] font-bold text-lg hover:bg-slate-800 transition-all shadow-2xl shadow-slate-300 flex items-center justify-center gap-3"
              >
                确认并保存
              </button>
            </div>
          ) : (
            <div className="p-12 flex flex-col items-center justify-center text-center h-full">
               <div className="w-32 h-32 bg-slate-50 rounded-[40px] flex items-center justify-center mb-8 rotate-12">
                 <MapPin size={56} className="text-slate-200" />
               </div>
               <h3 className="text-slate-900 font-extrabold text-2xl mb-3">暂无行程规划</h3>
               <p className="text-slate-400 text-base leading-relaxed max-w-[240px]">
                 点击右上角的“新增站点”<br/>开始定义您的首个巡展阶段。
               </p>
            </div>
          )}
        </div>

        {/* Right Panel: Map Container */}
        <div className="flex-1 bg-white rounded-[40px] shadow-2xl shadow-slate-200 border border-white overflow-hidden relative">
          <div ref={mapContainerRef} className="w-full h-full z-0" />
          {/* Subtle Map Overlay for design */}
          <div className="absolute top-6 right-6 z-[400] bg-white/80 backdrop-blur-md p-3 rounded-2xl border border-white shadow-lg pointer-events-none">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Map Engine Active</div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;