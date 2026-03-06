import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapPin, Plus, Trash2, X, Share2, Download, Check, ChevronUp, ChevronDown, FileUp, FileDown, Eraser, Layers } from 'lucide-react';
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
  const [currentProject, setCurrentProject] = useState('Default Project');
  const [projects, setProjects] = useState(['Default Project']);
  const [stops, setStops] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [shareStatus, setShareStatus] = useState(false);
  
  const initialStopState = {
    name: '', venue: '', phase: '1', color: '#3b82f6', lat: null, lng: null,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
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
    
    // Initialize Cluster Group
    clusterGroupRef.current = window.L.markerClusterGroup({
        showCoverageOnHover: false,
        iconCreateFunction: (cluster) => {
            const count = cluster.getChildCount();
            return window.L.divIcon({
                html: `<div style="background:#1e293b; color:white; border-radius:50%; width:40px; height:40px; display:flex; align-items:center; justify-content:center; border:3px solid white; box-shadow:0 4px 10px rgba(0,0,0,0.3); font-weight:bold;">${count}站</div>`,
                className: 'custom-cluster-icon',
                iconSize: [40, 40]
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
      
      group.stops.forEach((stop, index) => {
        if (!stop.lat || !stop.lng) return;
        
        // --- CLASSIC PIN ICON ---
        const pinIcon = window.L.divIcon({
          className: '',
          html: `
            <div style="display: flex; align-items: center; gap: 8px;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="${stop.color}" stroke="white" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3" fill="white"></circle>
                </svg>
                <div style="background: white; padding: 4px 8px; border-radius: 6px; border: 1px solid ${stop.color}; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: flex; flex-direction: column;">
                    <span style="font-size: 8px; font-weight: 800; color: ${stop.color};">${stop.startDate}</span>
                    <span style="font-size: 10px; font-weight: 700; color: #1e293b;">${stop.venue}</span>
                </div>
            </div>`,
          iconSize: [120, 32], iconAnchor: [16, 32]
        });

        const marker = window.L.marker([stop.lat, stop.lng], { icon: pinIcon });
        clusterGroupRef.current.addLayer(marker);
      });

      if (pathCoords.length > 1) {
        const polyline = window.L.polyline(pathCoords, { color: group.color, weight: 3, dashArray: '8, 12', className: 'marching-ants' }).addTo(mapRef.current);
        layersRef.current.paths.push(polyline);
        
        // Symmetrical Arrowhead logic
        const arrowIcon = window.L.divIcon({
          className: '',
          html: `<div class="arrow-wrapper" style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; color:${group.color}; filter: drop-shadow(0 0 2px white); opacity: 0; transition: opacity 0.3s;">
                  <svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 2L22 22L12 18L2 22L12 2Z" fill="currentColor"/></svg>
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
        const animate = () => {
          traveled = (traveled + (totalDistance / 800)) % totalDistance;
          const seg = segments.find((s, idx) => traveled >= s.cumulative && (idx === segments.length - 1 || traveled < segments[idx + 1].cumulative));
          if (seg) {
            const p = (traveled - seg.cumulative) / seg.dist;
            const lat = seg.start[0] + (seg.end[0] - seg.start[0]) * p;
            const lng = seg.start[1] + (seg.end[1] - seg.start[1]) * p;
            const p1 = mapRef.current.latLngToContainerPoint(seg.start);
            const p2 = mapRef.current.latLngToContainerPoint(seg.end);
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI) + 90;
            arrowMarker.setLatLng([lat, lng]);
            const el = arrowMarker.getElement();
            if (el) {
                const w = el.querySelector('.arrow-wrapper');
                if (w) { w.style.opacity = 1; w.style.transform = `rotate(${angle}deg)`; }
            }
          }
          animationIds.push(requestAnimationFrame(animate));
        };
        animate();
      }
    });
    return () => animationIds.forEach(id => cancelAnimationFrame(id));
  }, [groupedStops, stops, currentProject]);

  const handleSave = async () => {
    if (!newStop.name || !newStop.phase) return;
    const query = `${newStop.name} ${newStop.venue}`;
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
    const data = await resp.json();
    
    if (data[0]) {
      const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      const projectPath = `projects/${currentProject}/stops`;
      const targetRef = editingId ? ref(db, `${projectPath}/${editingId}`) : push(ref(db, projectPath));
      await set(targetRef, { ...newStop, ...coords, order: editingId ? newStop.order : stops.length });
      setIsEditing(false); setEditingId(null); setNewStop(initialStopState);
    } else { alert("定位失败，请确保城市和场馆名称准确。"); }
  };

  return (
    <div ref={exportRef} className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <style>{`.marching-ants { animation: dash 1s linear infinite; } @keyframes dash { to { stroke-dashoffset: -20; } }`}</style>
      <header className="flex items-center justify-between px-8 py-5 bg-white border-b border-slate-100 z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl text-white shadow-md"><MapPin size={20} /></div>
            <h1 className="text-lg font-bold">巡展规划助手</h1>
          </div>
          <select className="bg-slate-100 font-bold text-sm rounded-lg px-3 py-1.5" value={currentProject} onChange={(e) => setCurrentProject(e.target.value)}>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={() => {const n = window.prompt("新项目名称:"); if(n) set(ref(db, `projects/${n}/created`), Date.now());}} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><Plus size={18}/></button>
        </div>
        <div className="flex gap-2">
            <button onClick={handleSave} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800"><Plus size={18} /><span>新增站点</span></button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden p-6 gap-6">
        <div className="w-[380px] bg-white rounded-[32px] shadow-xl border border-slate-100 flex flex-col overflow-hidden">
          {isEditing ? (
            <div className="p-8 flex flex-col h-full bg-white">
               <h2 className="text-xl font-bold mb-8">编辑站点</h2>
               <div className="space-y-4">
                 <input className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none border-2 border-transparent focus:border-blue-500" placeholder="城市" value={newStop.name} onChange={e => setNewStop({...newStop, name: e.target.value})} />
                 <input className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none border-2 border-transparent focus:border-blue-500" placeholder="具体场馆" value={newStop.venue} onChange={e => setNewStop({...newStop, venue: e.target.value})} />
                 <div className="grid grid-cols-2 gap-4">
                    <select className="p-4 bg-slate-50 rounded-xl font-bold outline-none" value={newStop.phase} onChange={e => {
                        const ph = e.target.value; const ex = stops.find(s => s.phase === ph);
                        setNewStop({...newStop, phase: ph, color: ex ? ex.color : '#' + Math.floor(Math.random()*16777215).toString(16)});
                    }}>{[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}</select>
                    <input type="color" className="w-full h-14 p-1 bg-slate-50 rounded-xl cursor-pointer" value={newStop.color} onChange={e => setNewStop({...newStop, color: e.target.value})} />
                 </div>
                 <input type="date" className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none" value={newStop.startDate} onChange={e => setNewStop({...newStop, startDate: e.target.value, endDate: e.target.value})} />
               </div>
               <button onClick={handleSave} className="mt-auto w-full py-4 bg-blue-600 text-white rounded-xl font-bold">确认保存</button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {Object.entries(groupedStops).map(([phase, data]) => (
                <div key={phase} className="space-y-3">
                  <div className="px-2 font-bold text-xs text-slate-400">PHASE {phase}</div>
                  {data.stops.map(stop => (
                    <div key={stop.id} className="p-4 bg-white rounded-xl border border-slate-100 flex items-center justify-between group cursor-pointer" onClick={() => {setNewStop(stop); setEditingId(stop.id); setIsEditing(true);}}>
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stop.color }} />
                        <div><p className="font-bold text-slate-700 text-sm">{stop.name} · {stop.venue}</p><p className="text-[9px] text-slate-400 uppercase font-bold">{stop.startDate}</p></div>
                      </div>
                      <button onClick={(e) => {e.stopPropagation(); remove(ref(db, `projects/${currentProject}/stops/${stop.id}`));}} className="opacity-0 group-hover:opacity-100 text-red-400 hover:bg-red-50 p-1 rounded transition-all"><Trash2 size={14} /></button>
                    </div>
                  ))}
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