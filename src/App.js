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

  // --- 1. Project Management ---
  useEffect(() => {
    onValue(ref(db, 'projects'), (snapshot) => {
      const data = snapshot.val();
      if (data) {
          const names = Object.keys(data);
          setProjects(names.includes('默认规划图') ? names : ['默认规划图', ...names]);
      }
    });

    if (!mapContainerRef.current || mapRef.current) return;
    mapRef.current = window.L.map(mapContainerRef.current, { zoomControl: false, attributionControl: false }).setView([34.3416, 108.9398], 4);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
    
    clusterGroupRef.current = window.L.markerClusterGroup({
        showCoverageOnHover: false,
        iconCreateFunction: (cluster) => {
            const count = cluster.getChildCount();
            return window.L.divIcon({
                html: `<div style="background:#1e293b; color:white; border-radius:50%; width:44px; height:44px; display:flex; align-items:center; justify-content:center; border:3px solid white; box-shadow:0 4px 12px rgba(0,0,0,0.4); font-weight:bold; font-size:12px;">${count} 站</div>`,
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

  // --- 2. Map Rendering ---
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
        
        const pinIcon = window.L.divIcon({
          className: '',
          html: `
            <div style="display: flex; align-items: center; gap: 10px;">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="${stop.color}" stroke="white" stroke-width="2" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3" fill="white"></circle>
                </svg>
                <div style="background: white; padding: 4px 10px; border-radius: 8px; border: 1.5px solid ${stop.color}; box-shadow: 0 4px 6px rgba(0,0,0,0.1); display: flex; flex-direction: column; min-width: 80px;">
                    <span style="font-size: 9px; font-weight: 900; color: ${stop.color}; text-transform: uppercase;">${stop.startDate}</span>
                    <span style="font-size: 11px; font-weight: 700; color: #0f172a; white-space: nowrap;">${stop.venue || stop.name}</span>
                </div>
            </div>`,
          iconSize: [140, 34], iconAnchor: [17, 34]
        });

        const marker = window.L.marker([stop.lat, stop.lng], { icon: pinIcon });
        clusterGroupRef.current.addLayer(marker);
      });

      if (pathCoords.length > 1) {
        const polyline = window.L.polyline(pathCoords, { color: group.color, weight: 4, dashArray: '10, 15', className: 'marching-ants' }).addTo(mapRef.current);
        layersRef.current.paths.push(polyline);
        
        const arrowIcon = window.L.divIcon({
          className: '',
          html: `<div class="arrow-wrapper" style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color:${group.color}; filter: drop-shadow(0 0 3px white); opacity: 0;">
                  <svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 2L22 22L12 18L2 22L12 2Z" fill="currentColor"/></svg>
                 </div>`,
          iconSize: [24, 24], iconAnchor: [12, 12]
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
          traveled = (traveled + (totalDistance / 900)) % totalDistance;
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

  // --- 3. Actions ---
  const handleCreateProject = () => {
      const name = window.prompt("请输入新规划图的名称:");
      if (name && !projects.includes(name)) {
          set(ref(db, `projects/${name}/created`), Date.now());
          setCurrentProject(name);
      } else if (projects.includes(name)) {
          alert("该名称已存在！");
      }
  };

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
    } else { alert("定位失败，请确保输入的信息准确。"); }
  };

  return (
    <div ref={exportRef} className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <style>{`.marching-ants { animation: dash 1s linear infinite; } @keyframes dash { to { stroke-dashoffset: -20; } }`}</style>
      
      {/* Redesigned Header */}
      <header className="flex items-center justify-between px-10 py-6 bg-white border-b border-slate-100 z-10 shadow-sm">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2.5 rounded-2xl text-white shadow-lg shadow-blue-100"><MapPin size={24} /></div>
            <h1 className="text-xl font-black tracking-tighter text-slate-800">ROUTE PLANNER</h1>
          </div>
          
          <div className="h-10 w-[1px] bg-slate-100" />
          
          {/* Project Selection Dropdown */}
          <div className="flex flex-col">
              <label className="text-[10px] font-black text-slate-400 uppercase mb-1 ml-1">请选择您的规划图</label>
              <div className="relative flex items-center group">
                <FolderOpen size={16} className="absolute left-3 text-blue-500 pointer-events-none" />
                <select 
                    className="pl-10 pr-10 py-2.5 bg-slate-50 border-none font-bold text-sm rounded-xl outline-none appearance-none hover:bg-slate-100 transition-colors cursor-pointer text-slate-700 min-w-[200px]"
                    value={currentProject} 
                    onChange={(e) => setCurrentProject(e.target.value)}
                >
                    {projects.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 text-slate-400 pointer-events-none" />
              </div>
          </div>

          {/* Create New Project Button */}
          <button 
            onClick={handleCreateProject}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-50 text-blue-600 rounded-xl font-black text-sm hover:bg-blue-100 transition-all border border-blue-100 mt-4"
          >
            <PlusCircle size={18} />
            <span>新建一个规划图</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
            <button onClick={() => { if(window.confirm("确定清空当前规划图？")) remove(ref(db, `projects/${currentProject}/stops`)); }} className="p-3 bg-red-50 text-red-500 rounded-2xl font-bold text-xs hover:bg-red-100 transition-all"><Eraser size={20} /></button>
            <button onClick={async () => { const dataUrl = await htmlToImage.toPng(exportRef.current, { backgroundColor: '#f8fafc' }); const link = document.createElement('a'); link.download = `${currentProject}.png`; link.href = dataUrl; link.click(); }} className="p-3 bg-slate-50 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-100 transition-all"><Download size={20} /></button>
            <button onClick={() => {setIsEditing(true); setEditingId(null); setNewStop(initialStopState);}} className="px-8 py-3.5 bg-slate-900 text-white rounded-2xl font-black text-sm flex items-center gap-2 hover:bg-slate-800 shadow-xl shadow-slate-200 transition-all ml-4">
                <Plus size={20} /><span>新增站点</span>
            </button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden p-6 gap-6">
        <div className="w-[400px] bg-white rounded-[40px] shadow-2xl border border-slate-100 flex flex-col overflow-hidden">
          {isEditing ? (
            <div className="p-10 flex flex-col h-full bg-white animate-in slide-in-from-right-8 duration-300">
               <div className="flex justify-between items-center mb-10">
                 <h2 className="text-2xl font-black text-slate-800">编辑站点</h2>
                 <button onClick={() => setIsEditing(false)} className="p-2 bg-slate-50 rounded-full hover:bg-slate-100 transition-all"><X size={24} /></button>
               </div>
               <div className="space-y-6">
                 <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">城市</label>
                    <input className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-blue-500 transition-all" placeholder="例如: 上海" value={newStop.name} onChange={e => setNewStop({...newStop, name: e.target.value})} />
                 </div>
                 <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">场馆/具体地点</label>
                    <input className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-blue-500 transition-all" placeholder="例如: 梅赛德斯奔驰文化中心" value={newStop.venue} onChange={e => setNewStop({...newStop, venue: e.target.value})} />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">阶段</label>
                        <select className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none" value={newStop.phase} onChange={e => {
                            const ph = e.target.value; const ex = stops.find(s => s.phase === ph);
                            setNewStop({...newStop, phase: ph, color: ex ? ex.color : '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')});
                        }}>{[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}</select>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">颜色</label>
                        <input type="color" className="w-full h-14 p-1 bg-slate-50 rounded-2xl cursor-pointer" value={newStop.color} onChange={e => setNewStop({...newStop, color: e.target.value})} />
                    </div>
                 </div>
                 <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">日期</label>
                    <input type="date" className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none" value={newStop.startDate} onChange={e => setNewStop({...newStop, startDate: e.target.value, endDate: e.target.value})} />
                 </div>
               </div>
               <button onClick={handleSave} className="mt-auto w-full py-5 bg-blue-600 text-white rounded-[24px] font-black text-lg shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">确认保存</button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-8 space-y-10">
              {Object.entries(groupedStops).length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4 mt-20 opacity-50">
                      <MapPin size={64} strokeWidth={1} />
                      <p className="font-bold text-center">当前规划图是空的<br/>点击右上角开始添加</p>
                  </div>
              )}
              {Object.entries(groupedStops).map(([phase, data]) => (
                <div key={phase} className="space-y-4">
                  <div className="px-4 py-2 rounded-full inline-block font-black text-[10px] uppercase tracking-[0.2em]" style={{ backgroundColor: `${data.color}15`, color: data.color }}>PHASE {phase}</div>
                  <div className="space-y-3">
                    {data.stops.map(stop => (
                      <div key={stop.id} className="p-5 bg-white rounded-3xl border border-slate-50 flex items-center justify-between group cursor-pointer hover:shadow-xl hover:shadow-slate-100 hover:border-blue-100 transition-all" onClick={() => {setNewStop(stop); setEditingId(stop.id); setIsEditing(true);}}>
                        <div className="flex items-center gap-4 overflow-hidden">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stop.color }} />
                          <div className="truncate">
                              <p className="font-black text-slate-700 text-sm truncate uppercase tracking-tight">{stop.name}</p>
                              <p className="text-[10px] text-slate-400 font-bold mt-1 truncate">{stop.venue} · {stop.startDate}</p>
                          </div>
                        </div>
                        <button onClick={(e) => {e.stopPropagation(); if(window.confirm("删除此站点？")) remove(ref(db, `projects/${currentProject}/stops/${stop.id}`));}} className="opacity-0 group-hover:opacity-100 text-red-400 hover:bg-red-50 p-2 rounded-xl transition-all"><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Map View Container */}
        <div className="flex-1 bg-white rounded-[56px] shadow-2xl border-[12px] border-white overflow-hidden relative">
          <div ref={mapContainerRef} className="absolute inset-0 z-0" />
        </div>
      </main>
    </div>
  );
}

export default App;