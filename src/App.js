import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapPin, Plus, Trash2, Calendar, X, Share2, Download, Check, ChevronUp, ChevronDown, FileUp, FileDown, Eraser, Building2 } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, push, set, remove, update } from 'firebase/database';
import * as htmlToImage from 'html-to-image';
import * as XLSX from 'xlsx';

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
  const [phaseMode, setPhaseMode] = useState('select');
  
  const initialStopState = {
    name: '', venue: '', phase: '1', color: '#3b82f6', lat: null, lng: null,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  };
  
  const [newStop, setNewStop] = useState(initialStopState);
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const exportRef = useRef(null);
  const fileInputRef = useRef(null);
  const layersRef = useRef({ markers: [], paths: [], arrows: [] });

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

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    mapRef.current = window.L.map(mapContainerRef.current, { zoomControl: false, attributionControl: false }).setView([34.3416, 108.9398], 4);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
    
    onValue(ref(db, 'stops'), (snapshot) => {
      const data = snapshot.val();
      const list = data ? Object.entries(data).map(([id, val]) => ({ id, ...val })) : [];
      setStops(list.sort((a, b) => a.order - b.order));
    });
  }, []);

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
        
        // Permanent Label HTML
        const labelHtml = `
          <div style="display: flex; align-items: center; gap: 8px; white-space: nowrap;">
            <div style="background-color:${stop.color}; width:24px; height:24px; border-radius:50% 50% 50% 0; transform:rotate(-45deg); border:2px solid white; display:flex; align-items:center; justify-content:center; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
              <span style="transform:rotate(45deg); color:white; font-weight:bold; font-size:10px;">${index + 1}</span>
            </div>
            <div style="background: white; padding: 2px 8px; border-radius: 6px; border: 1px solid ${stop.color}; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: flex; flex-direction: column;">
              <span style="font-size: 9px; font-weight: 800; color: ${stop.color}; line-height: 1;">${stop.startDate}</span>
              <span style="font-size: 10px; font-weight: 700; color: #1e293b; line-height: 1.2;">${stop.name} ${stop.venue ? `· ${stop.venue}` : ''}</span>
            </div>
          </div>
        `;

        const icon = window.L.divIcon({
          className: '',
          html: labelHtml,
          iconSize: [150, 30],
          iconAnchor: [12, 12]
        });

        const marker = window.L.marker([stop.lat, stop.lng], { icon }).addTo(mapRef.current);
        layersRef.current.markers.push(marker);
      });

      if (pathCoords.length > 1) {
        const polyline = window.L.polyline(pathCoords, { color: group.color, weight: 3, dashArray: '8, 12', className: 'marching-ants' }).addTo(mapRef.current);
        layersRef.current.paths.push(polyline);
        const arrowIcon = window.L.divIcon({
          className: '',
          html: `<div class="arrow-wrapper" style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; color:${group.color}; filter: drop-shadow(0 0 2px white); opacity: 0; transition: opacity 0.3s;">
                  <svg width="20" height="20" viewBox="0 0 24 24" style="display: block;">
                    <path d="M12 2L22 22L12 18L2 22L12 2Z" fill="currentColor"/>
                  </svg>
                 </div>`,
          iconSize: [20, 20], iconAnchor: [10, 10]
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
        const speed = totalDistance / 800;
        const animate = () => {
          traveled = (traveled + speed) % totalDistance;
          const seg = segments.find((s, idx) => traveled >= s.cumulative && (idx === segments.length - 1 || traveled < segments[idx + 1].cumulative));
          if (seg) {
            const percent = (traveled - seg.cumulative) / seg.dist;
            const lat = seg.start[0] + (seg.end[0] - seg.start[0]) * percent;
            const lng = seg.start[1] + (seg.end[1] - seg.start[1]) * percent;
            const p1 = mapRef.current.latLngToContainerPoint(seg.start);
            const p2 = mapRef.current.latLngToContainerPoint(seg.end);
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI) + 90;
            const totalPercent = traveled / totalDistance;
            let opacity = 1;
            if (totalPercent < 0.05) opacity = totalPercent / 0.05;
            if (totalPercent > 0.95) opacity = (1 - totalPercent) / 0.05;
            arrowMarker.setLatLng([lat, lng]);
            const el = arrowMarker.getElement();
            if (el) {
                const wrapper = el.querySelector('.arrow-wrapper');
                if (wrapper) { wrapper.style.opacity = opacity; wrapper.style.transform = `rotate(${angle}deg)`; }
            }
          }
          animationIds.push(requestAnimationFrame(animate));
        };
        animate();
      }
    });
    return () => animationIds.forEach(id => cancelAnimationFrame(id));
  }, [groupedStops, stops]);

  const handleClearAll = async () => {
    if (window.confirm("⚠️ 确定要清空所有站点吗？此操作无法撤销。")) {
      await remove(ref(db, 'stops'));
    }
  };

  const exportToExcel = () => {
    const data = stops.map(s => ({
      'Stop Name': s.name,
      'Venue': s.venue || '',
      'Phase Number': s.phase,
      'Start Date': s.startDate,
      'End Date': s.endDate
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Roadshow Plan");
    XLSX.writeFile(wb, "roadshow_plan.xlsx");
  };

  const importFromExcel = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      let added = 0; let skipped = 0;
      for (const row of data) {
        const name = row['Stop Name'];
        const venue = row['Venue'] || '';
        const phase = row['Phase Number']?.toString();
        const start = row['Start Date'];
        const isDuplicate = stops.some(s => s.name === name && s.startDate === start && s.venue === venue);
        if (name && phase && !isDuplicate) {
          const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${name}`);
          const geoData = await resp.json();
          if (geoData[0]) {
            const coords = { lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon) };
            const existingPhase = stops.find(s => s.phase === phase);
            const color = existingPhase ? existingPhase.color : '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
            await set(push(ref(db, 'stops')), { name, venue, phase, color, startDate: start, endDate: row['End Date'], ...coords, order: stops.length + added });
            added++;
          }
        } else { skipped++; }
      }
      alert(`导入完成！新增: ${added}，跳过: ${skipped}`);
    };
    reader.readAsBinaryString(file);
    e.target.value = null;
  };

  const handleSave = async () => {
    if (!newStop.name || !newStop.phase) return;
    const isDuplicate = stops.some(s => s.id !== editingId && s.name === newStop.name && s.startDate === newStop.startDate && s.venue === newStop.venue);
    if (isDuplicate) return alert("该站点已存在（同城市、同日期、同场馆）");
    const colorConflict = stops.some(s => s.phase !== newStop.phase && s.color === newStop.color);
    if (colorConflict) return alert("该颜色已被其他阶段使用");

    const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${newStop.name}`);
    const data = await resp.json();
    if (data[0]) {
      const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      const targetRef = editingId ? ref(db, `stops/${editingId}`) : push(ref(db, 'stops'));
      await set(targetRef, { ...newStop, ...coords, order: editingId ? newStop.order : stops.length });
      setIsEditing(false); setEditingId(null); setNewStop(initialStopState);
    }
  };

  return (
    <div ref={exportRef} className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <style>{`
        @keyframes dash { to { stroke-dashoffset: -20; } }
        .marching-ants { animation: dash 1s linear infinite; }
      `}</style>
      <header className="flex items-center justify-between px-8 py-5 bg-white border-b border-slate-100 z-10">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded-xl text-white shadow-md"><MapPin size={20} /></div>
          <h1 className="text-lg font-bold tracking-tight">巡展规划助手</h1>
        </div>
        <div className="flex items-center gap-2">
            <button onClick={handleClearAll} className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all flex items-center gap-2 font-bold text-xs mr-2"><Eraser size={16} /><span>清空全部</span></button>
            <button onClick={() => fileInputRef.current.click()} className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all flex items-center gap-2 font-bold text-xs"><FileUp size={16} /><span>导入Excel</span><input type="file" ref={fileInputRef} hidden onChange={importFromExcel} accept=".xlsx, .xls, .csv" /></button>
            <button onClick={exportToExcel} className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all flex items-center gap-2 font-bold text-xs"><FileDown size={16} /><span>导出Excel</span></button>
            <button onClick={async () => { const dataUrl = await htmlToImage.toPng(exportRef.current, { backgroundColor: '#f8fafc' }); const link = document.createElement('a'); link.download = 'map.png'; link.href = dataUrl; link.click(); }} className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all flex items-center gap-2 font-bold text-xs"><Download size={16} /><span>导出图片</span></button>
            <button onClick={() => {setIsEditing(true); setEditingId(null); setNewStop(initialStopState);}} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 shadow-lg ml-2 transition-all"><Plus size={18} /><span>新增站点</span></button>
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
               <div className="space-y-4">
                 <input className="w-full p-4 bg-slate-50 rounded-xl font-bold border-2 border-transparent focus:border-blue-500 outline-none" placeholder="城市" value={newStop.name} onChange={e => setNewStop({...newStop, name: e.target.value})} />
                 <input className="w-full p-4 bg-slate-50 rounded-xl font-bold border-2 border-transparent focus:border-blue-500 outline-none" placeholder="场馆/具体地点" value={newStop.venue} onChange={e => setNewStop({...newStop, venue: e.target.value})} />
                 <div className="grid grid-cols-2 gap-4">
                    <select className="p-4 bg-slate-50 rounded-xl font-bold outline-none" value={newStop.phase} onChange={e => { const phase = e.target.value; const exist = stops.find(s => s.phase === phase); setNewStop({...newStop, phase, color: exist ? exist.color : '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}); }}>
                        {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
                    </select>
                    <input type="color" className="w-full h-14 p-1 bg-slate-50 rounded-xl cursor-pointer" value={newStop.color} onChange={e => setNewStop({...newStop, color: e.target.value})} />
                 </div>
                 <input type="date" className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none" value={newStop.startDate} onChange={e => setNewStop({...newStop, startDate: e.target.value, endDate: e.target.value})} />
               </div>
               <button onClick={handleSave} className="mt-auto w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg">保存</button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {Object.entries(groupedStops).map(([phase, data]) => (
                <div key={phase} className="space-y-3">
                  <div className="flex justify-between items-center px-2"><span className="font-bold text-xs uppercase tracking-widest" style={{ color: data.color }}>Phase {phase}</span></div>
                  <div className="space-y-2">
                    {data.stops.map((stop, idx) => (
                      <div key={stop.id} className="p-4 bg-white rounded-xl border border-slate-100 flex items-center justify-between group hover:border-blue-100 transition-all shadow-sm">
                        <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => {setNewStop(stop); setEditingId(stop.id); setIsEditing(true);}}>
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stop.color }} />
                          <div className="overflow-hidden">
                            <p className="font-bold text-slate-700 text-sm truncate">{stop.name} {stop.venue && <span className="text-slate-400 font-medium">· ${stop.venue}</span>}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase">{stop.startDate}</p>
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => { const index = stops.indexOf(stop); if (index > 0) { const newStops = [...stops]; [newStops[index], newStops[index-1]] = [newStops[index-1], newStops[index]]; const updates = {}; newStops.forEach((s, i) => { updates[`stops/${s.id}/order`] = i; }); update(ref(db), updates); } }} className="p-1 hover:bg-slate-100 rounded text-slate-400"><ChevronUp size={14} /></button>
                            <button onClick={() => { const index = stops.indexOf(stop); if (index < stops.length - 1) { const newStops = [...stops]; [newStops[index], newStops[index+1]] = [newStops[index+1], newStops[index]]; const updates = {}; newStops.forEach((s, i) => { updates[`stops/${s.id}/order`] = i; }); update(ref(db), updates); } }} className="p-1 hover:bg-slate-100 rounded text-slate-400"><ChevronDown size={14} /></button>
                            <button onClick={() => remove(ref(db, `stops/${stop.id}`))} className="p-1.5 hover:bg-red-50 text-red-400 rounded transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 bg-white rounded-[40px] shadow-2xl border-[8px] border-white overflow-hidden relative"><div ref={mapContainerRef} className="absolute inset-0" /></div>
      </main>
    </div>
  );
}

export default App;