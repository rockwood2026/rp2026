import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapPin, Plus, Trash2, X, Share2, Download, Check, ChevronUp, ChevronDown, FileUp, FileDown, Eraser, FolderOpen, PlusCircle } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, push, set, remove, update } from 'firebase/database';
import * as htmlToImage from 'html-to-image';
import * as XLSX from 'xlsx';

// --- CLUSTERING IMPORTS ---
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';

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
  const [currentProject, setCurrentProject] = useState('默认规划图');
  const [projects, setProjects] = useState(['默认规划图']);
  const [stops, setStops] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [shareStatus, setShareStatus] = useState(false);
  
  const initialStopState = {
    name: '', venue: '', phase: '1', color: '#3b82f6', lat: null, lng: null,
    startDate: new Date().toISOString().split('T')[0],
  };
  
  const [newStop, setNewStop] = useState(initialStopState);
  const mapRef = useRef(null);
  const clusterGroupRef = useRef(null);
  const mapContainerRef = useRef(null);
  const exportRef = useRef(null);
  const fileInputRef = useRef(null);
  const layersRef = useRef({ paths: [], arrows: [] });

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
    onValue(ref(db, 'projects'), (snapshot) => {
      const data = snapshot.val();
      if (data) setProjects(Object.keys(data));
    });

    if (!mapContainerRef.current || mapRef.current) return;
    mapRef.current = window.L.map(mapContainerRef.current, { zoomControl: false, attributionControl: false }).setView([34.3416, 108.9398], 4);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
    
    clusterGroupRef.current = window.L.markerClusterGroup({
        showCoverageOnHover: false,
        iconCreateFunction: (cluster) => {
            const markers = cluster.getAllChildMarkers();
            // Determine color: if all markers in cluster share a color, use it.
            const colors = [...new Set(markers.map(m => m.options.phaseColor))];
            const bubbleColor = colors.length === 1 ? colors[0] : '#1e293b';
            
            return window.L.divIcon({
                html: `<div style="background:${bubbleColor}; color:white; border-radius:50%; width:44px; height:44px; display:flex; align-items:center; justify-content:center; border:3px solid white; box-shadow:0 4px 12px rgba(0,0,0,0.4); font-weight:bold;">${markers.length}站</div>`,
                className: 'custom-cluster-icon',
                iconSize: [44, 44]
            });
        }
    }).addTo(mapRef.current);
  }, []);

  useEffect(() => {
    const projectPath = `projects/${currentProject}/stops`;
    const unsubscribe = onValue(ref(db, projectPath), (snapshot) => {
      const data = snapshot.val();
      const list = data ? Object.entries(data).map(([id, val]) => ({ id, ...val })) : [];
      setStops(list.sort((a, b) => a.order - b.order));
    });
    return () => unsubscribe();
  }, [currentProject]);

  useEffect(() => {
    if (!mapRef.current || !clusterGroupRef.current) return;
    clusterGroupRef.current.clearLayers();
    layersRef.current.paths.forEach(p => p.remove());
    layersRef.current.arrows.forEach(a => a.remove());
    layersRef.current = { paths: [], arrows: [] };
    const animationIds = [];

    Object.values(groupedStops).forEach((group) => {
      const pathCoords = group.stops.filter(s => s.lat && s.lng).map(s => [s.lat, s.lng]);
      const markerInstances = [];
      
      group.stops.forEach((stop, index) => {
        if (!stop.lat || !stop.lng) return;
        const pinIcon = window.L.divIcon({
          className: '',
          html: `<div style="display: flex; align-items: center; gap: 10px;">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="${stop.color}" stroke="white" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3" fill="white"></circle></svg>
                    <div style="background: white; padding: 4px 10px; border-radius: 8px; border: 1.5px solid ${stop.color}; box-shadow: 0 4px 6px rgba(0,0,0,0.1); display: flex; flex-direction: column;">
                        <span style="font-size: 9px; font-weight: 900; color: ${stop.color}; uppercase">${stop.startDate}</span>
                        <span style="font-size: 11px; font-weight: 700; color: #0f172a; white-space: nowrap;">${stop.venue || stop.name}</span>
                    </div>
                 </div>`,
          iconSize: [140, 34], iconAnchor: [17, 34]
        });

        const marker = window.L.marker([stop.lat, stop.lng], { icon: pinIcon, phaseColor: stop.color });
        markerInstances.push(marker);
        clusterGroupRef.current.addLayer(marker);
      });

      if (pathCoords.length > 1) {
        const polyline = window.L.polyline(pathCoords, { color: group.color, weight: 4, dashArray: '10, 15', className: 'marching-ants' }).addTo(mapRef.current);
        layersRef.current.paths.push(polyline);
        
        const arrowIcon = window.L.divIcon({
          className: '',
          html: `<div class="arrow-wrapper" style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color:${group.color}; filter: drop-shadow(0 0 3px white); opacity: 0;"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 2L22 22L12 18L2 22L12 2Z" fill="currentColor"/></svg></div>`,
          iconSize: [24, 24], iconAnchor: [12, 12]
        });
        const arrowMarker = window.L.marker(pathCoords[0], { icon: arrowIcon }).addTo(mapRef.current);
        layersRef.current.arrows.push(arrowMarker);

        let totalDistance = 0;
        const segments = [];
        for (let i = 0; i < pathCoords.length - 1; i++) {
          const dist = mapRef.current.distance(pathCoords[i], pathCoords[i+1]);
          segments.push({ start: pathCoords[i], end: pathCoords[i+1], dist, cumulative: totalDistance, 
                         startMarker: markerInstances[i], endMarker: markerInstances[i+1] });
          totalDistance += dist;
        }

        const animate = () => {
          const speed = totalDistance / 900;
          let traveled = (performance.now() * 0.05) % totalDistance; 
          const seg = segments.find((s, idx) => traveled >= s.cumulative && (idx === segments.length - 1 || traveled < segments[idx + 1].cumulative));

          if (seg) {
            const p = (traveled - seg.cumulative) / seg.dist;
            const lat = seg.start[0] + (seg.end[0] - seg.start[0]) * p;
            const lng = seg.start[1] + (seg.end[1] - seg.start[1]) * p;
            
            // HIDE ARROWHEAD IF START OR END MARKER IS CLUSTERED
            const isVisible = clusterGroupRef.current.getVisibleParent(seg.startMarker) === seg.startMarker && 
                              clusterGroupRef.current.getVisibleParent(seg.endMarker) === seg.endMarker;

            const angle = Math.atan2(mapRef.current.latLngToContainerPoint(seg.end).y - mapRef.current.latLngToContainerPoint(seg.start).y, 
                                   mapRef.current.latLngToContainerPoint(seg.end).x - mapRef.current.latLngToContainerPoint(seg.start).x) * (180 / Math.PI) + 90;

            arrowMarker.setLatLng([lat, lng]);
            const el = arrowMarker.getElement();
            if (el) {
                const w = el.querySelector('.arrow-wrapper');
                if (w) { w.style.opacity = isVisible ? 1 : 0; w.style.transform = `rotate(${angle}deg)`; }
            }
          }
          animationIds.push(requestAnimationFrame(animate));
        };
        animate();
      }
    });
    return () => animationIds.forEach(id => cancelAnimationFrame(id));
  }, [groupedStops, stops, currentProject]);

  // --- EXCEL IMPORT / EXPORT ---
  const handleExportExcel = () => {
      const data = stops.map(s => ({ "Phase Number": s.phase, "City": s.name, "Venue": s.venue, "Date": s.startDate }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Stops");
      XLSX.writeFile(wb, `${currentProject}_Route.xlsx`);
  };

  const handleImportExcel = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (evt) => {
          const data = XLSX.utils.sheet_to_json(XLSX.read(evt.target.result, { type: 'binary' }).Sheets[XLSX.read(evt.target.result, { type: 'binary' }).SheetNames[0]]);
          let added = 0; let skipped = 0;
          const usedColors = new Set(stops.map(s => s.color));

          for (const row of data) {
              const phase = row['Phase Number']?.toString();
              const city = row['City'];
              const venue = row['Venue'];
              const date = row['Date'];

              const isDuplicate = stops.some(s => s.name === city && s.startDate === date && s.venue === venue);
              if (city && phase && !isDuplicate) {
                  const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city + ' ' + venue)}`);
                  const geo = await resp.json();
                  if (geo[0]) {
                      const existingPhase = stops.find(s => s.phase === phase);
                      let color = existingPhase ? existingPhase.color : null;
                      if (!color) {
                          // Find a unique color
                          const palette = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
                          color = palette.find(c => !usedColors.has(c)) || '#' + Math.floor(Math.random()*16777215).toString(16);
                          usedColors.add(color);
                      }
                      await set(push(ref(db, `projects/${currentProject}/stops`)), { name: city, venue, phase, color, startDate: date, lat: parseFloat(geo[0].lat), lng: parseFloat(geo[0].lon), order: stops.length + added });
                      added++;
                  }
              } else { skipped++; }
          }
          alert(`导入成功！新增: ${added}, 跳过重复: ${skipped}`);
      };
      reader.readAsBinaryString(file);
      e.target.value = null;
  };

  return (
    <div ref={exportRef} className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <style>{`.marching-ants { animation: dash 1s linear infinite; } @keyframes dash { to { stroke-dashoffset: -20; } }`}</style>
      <header className="flex items-center justify-between px-10 py-6 bg-white border-b border-slate-100 z-10 shadow-sm">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2.5 rounded-2xl text-white shadow-lg"><MapPin size={24} /></div>
            <h1 className="text-xl font-black tracking-tighter">ROUTE PLANNER</h1>
          </div>
          <div className="flex flex-col">
              <label className="text-[10px] font-black text-slate-400 uppercase mb-1">请选择您的规划图</label>
              <select className="pl-4 pr-10 py-2 bg-slate-50 border-none font-bold text-sm rounded-xl outline-none" value={currentProject} onChange={(e) => setCurrentProject(e.target.value)}>
                    {projects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
          </div>
          <button onClick={() => {const n = window.prompt("名称:"); if(n) set(ref(db, `projects/${n}/created`), Date.now());}} className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl font-black text-xs hover:bg-blue-100"><PlusCircle size={16} />新建规划图</button>
        </div>
        <div className="flex gap-2">
            <button onClick={() => fileInputRef.current.click()} className="p-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs"><FileUp size={18} /><input type="file" ref={fileInputRef} hidden onChange={handleImportExcel} accept=".xlsx, .xls"/></button>
            <button onClick={handleExportExcel} className="p-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs"><FileDown size={18} /></button>
            <button onClick={() => {setIsEditing(true); setEditingId(null); setNewStop(initialStopState);}} className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-sm flex items-center gap-2 shadow-xl shadow-slate-200">新增站点</button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden p-6 gap-6">
        <div className="w-[380px] bg-white rounded-[40px] shadow-2xl border border-slate-100 flex flex-col overflow-hidden">
          {isEditing ? (
            <div className="p-10 flex flex-col h-full bg-white">
               <div className="flex justify-between items-center mb-8"><h2 className="text-2xl font-black">编辑站点</h2><button onClick={() => setIsEditing(false)} className="p-2 bg-slate-50 rounded-full"><X size={20} /></button></div>
               <div className="space-y-6">
                 <input className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none" placeholder="城市" value={newStop.name} onChange={e => setNewStop({...newStop, name: e.target.value})} />
                 <input className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none" placeholder="场馆" value={newStop.venue} onChange={e => setNewStop({...newStop, venue: e.target.value})} />
                 <div className="grid grid-cols-2 gap-4">
                    <select className="p-4 bg-slate-50 rounded-2xl font-bold" value={newStop.phase} onChange={e => {
                        const ph = e.target.value; const ex = stops.find(s => s.phase === ph);
                        setNewStop({...newStop, phase: ph, color: ex ? ex.color : '#3b82f6'});
                    }}>{[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}</select>
                    <input type="color" className="w-full h-14 p-1 bg-slate-50 rounded-2xl" value={newStop.color} onChange={e => setNewStop({...newStop, color: e.target.value})} />
                 </div>
                 <input type="date" className="w-full p-4 bg-slate-50 rounded-2xl font-bold" value={newStop.startDate} onChange={e => setNewStop({...newStop, startDate: e.target.value})} />
               </div>
               <button onClick={async () => {
                 const query = `${newStop.name} ${newStop.venue}`;
                 const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
                 const geo = await resp.json();
                 if (geo[0]) {
                     const path = `projects/${currentProject}/stops`;
                     await set(editingId ? ref(db, `${path}/${editingId}`) : push(ref(db, path)), { ...newStop, lat: parseFloat(geo[0].lat), lng: parseFloat(geo[0].lon), order: stops.length });
                     setIsEditing(false);
                 }
               }} className="mt-auto w-full py-5 bg-blue-600 text-white rounded-[24px] font-black shadow-lg">保存</button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-8 space-y-10">
              {Object.entries(groupedStops).map(([phase, data]) => (
                <div key={phase} className="space-y-4">
                  <div className="px-4 py-2 rounded-full inline-block font-black text-[10px] uppercase tracking-widest" style={{ backgroundColor: `${data.color}15`, color: data.color }}>PHASE {phase}</div>
                  <div className="space-y-3">
                    {data.stops.map(stop => (
                      <div key={stop.id} className="p-5 bg-white rounded-3xl border border-slate-50 flex items-center justify-between group cursor-pointer hover:shadow-xl hover:border-blue-100 transition-all" onClick={() => {setNewStop(stop); setEditingId(stop.id); setIsEditing(true);}}>
                        <div className="flex items-center gap-4 overflow-hidden">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stop.color }} />
                          <div className="truncate"><p className="font-black text-slate-700 text-sm truncate uppercase">{stop.name}</p><p className="text-[10px] text-slate-400 font-bold mt-1 truncate">{stop.venue} · {stop.startDate}</p></div>
                        </div>
                        <button onClick={(e) => {e.stopPropagation(); remove(ref(db, `projects/${currentProject}/stops/${stop.id}`));}} className="opacity-0 group-hover:opacity-100 text-red-400 hover:bg-red-50 p-2 rounded-xl"><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 bg-white rounded-[56px] shadow-2xl border-[12px] border-white overflow-hidden relative"><div ref={mapContainerRef} className="absolute inset-0 z-0" /></div>
      </main>
    </div>
  );
}

export default App;