import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAnalytics } from "firebase/analytics";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { MapPin, Calendar, Navigation, Plus, Trash2, Map as MapIcon, ChevronRight, Share2, Cloud, Loader2, Check, X, Save, Crosshair, Search, Move, Edit2, Palette, Type, ChevronDown, Globe, Settings, Hash, Layers, FileText, RotateCw } from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyCDbnnEkMGYu3HMJAb8kViLnJZfazJ1qms",
  authDomain: "rp2026-b5d0a11111.firebaseapp.com",
  projectId: "rp2026-b5d0a11111",
  storageBucket: "rp2026-b5d0a11111.firebasestorage.app",
  messagingSenderId: "864135040245",
  appId: "1:864135040245:web:3e8e2d336ce379575d49bc",
  measurementId: "G-MEFFLWYC9S"
};

// Initialize Firebase once
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

const appId = 'rp2026-b5d0a11111'; 

const COLOR_PALETTE = [
  { value: '#4f46e5' }, { value: '#10b981' }, { value: '#f43f5e' }, { value: '#f59e0b' },
  { value: '#475569' }, { value: '#8b5cf6' }, { value: '#0ea5e9' }, { value: '#f97316' }
];

const DEFAULT_MAP_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

// Helper component for editing text
const EditableInput = ({ value, onChange, className, placeholder, type = "text" }) => {
  const [localValue, setLocalValue] = useState(value);
  const isComposing = useRef(false);

  useEffect(() => { setLocalValue(value); }, [value]);

  const handleChange = (e) => {
    setLocalValue(e.target.value);
    if (!isComposing.current) onChange(e.target.value);
  };

  return (
    <input
      type={type}
      className={className}
      value={localValue || ''}
      placeholder={placeholder}
      onChange={handleChange}
      onCompositionStart={() => { isComposing.current = true; }}
      onCompositionEnd={(e) => { isComposing.current = false; onChange(e.target.value); }}
    />
  );
};

export default function App() {
  const mapContainerRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);
  const routeLayersRef = useRef([]);
  
  const [stops, setStops] = useState([]);
  const [phases, setPhases] = useState([]);
  const [user, setUser] = useState(null);
  const [activeStopId, setActiveStopId] = useState(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({ city: '', venue: '', startDate: '', endDate: '', coords: [30, 110] });

  // 1. Auth Setup
  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    return onAuthStateChanged(auth, setUser);
  }, []);

  // 2. Data Sync
  useEffect(() => {
    if (!user) return;
    const unsubscribeStops = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'stops'), (snap) => {
      setStops(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });
    return () => unsubscribeStops();
  }, [user]);

  // 3. Load Leaflet Map library
  useEffect(() => {
    if (window.L) { setLeafletLoaded(true); return; }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => setLeafletLoaded(true);
    document.body.appendChild(script);
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }, []);

  // 4. Map Logic
  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current) return;
    if (!mapInstance.current) {
      mapInstance.current = window.L.map(mapContainerRef.current).setView([30, 110], 4);
      window.L.tileLayer(DEFAULT_MAP_URL).addTo(mapInstance.current);
    }
    // Cleanup old markers
    markersRef.current.forEach(m => m.remove());
    stops.forEach(stop => {
      const m = window.L.marker(stop.coords).addTo(mapInstance.current).bindPopup(stop.city);
      markersRef.current.push(m);
    });
  }, [leafletLoaded, stops]);

  const saveStop = async () => {
    const id = crypto.randomUUID();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stops', id), { ...editFormData, id });
    setIsEditing(false);
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <header className="p-5 bg-white border-b flex justify-between items-center shadow-sm">
        <h1 className="text-xl font-bold flex items-center gap-2"><Globe className="text-blue-600" /> Route Planner 2026</h1>
        <button onClick={() => setIsEditing(true)} className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <Plus size={18} /> Add Stop
        </button>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-80 border-r bg-white overflow-y-auto p-4">
          {isEditing ? (
            <div className="space-y-4">
              <h2 className="font-bold">New Stop</h2>
              <input className="w-full border p-2 rounded" placeholder="City" onChange={e => setEditFormData({...editFormData, city: e.target.value})} />
              <input type="date" className="w-full border p-2 rounded" onChange={e => setEditFormData({...editFormData, startDate: e.target.value})} />
              <button onClick={saveStop} className="w-full bg-blue-600 text-white p-2 rounded">Save</button>
              <button onClick={() => setIsEditing(false)} className="w-full text-slate-500">Cancel</button>
            </div>
          ) : (
            <div className="space-y-2">
              {stops.map(s => (
                <div key={s.id} className="p-3 bg-slate-50 rounded-lg border">{s.city} - {s.startDate}</div>
              ))}
            </div>
          )}
        </aside>
        <div ref={mapContainerRef} className="flex-1" />
      </main>
    </div>
  );
}