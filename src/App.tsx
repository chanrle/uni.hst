import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { 
  GraduationCap, 
  Search, 
  ListOrdered, 
  CalendarCheck, 
  UserCircle, 
  Sparkles,
  ChevronRight,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
  Globe,
  LogOut,
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { UserProfile, ShortlistItem, University, Task } from './types';
import { COUNTRIES, MAJORS, BUDGET_RANGES } from './constants';
import { getUniversitySuggestions, getMajorSuggestions, getApplicationPlan } from './services/geminiService';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  deleteDoc,
  getDocFromServer
} from 'firebase/firestore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-6">
          <div className="bg-white p-8 rounded-3xl border border-[#E5E5E0] shadow-xl max-w-md w-full text-center">
            <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
            <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
            <p className="text-[#5A5A40] opacity-70 mb-6">
              {this.state.error?.message.startsWith('{') 
                ? "A database error occurred. Please try again later." 
                : "An unexpected error occurred."}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-[#5A5A40] text-white px-6 py-3 rounded-xl font-bold hover:shadow-lg transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <UniGuideApp />
    </ErrorBoundary>
  );
}

function UniGuideApp() {
  const [activeTab, setActiveTab] = useState<'profile' | 'search' | 'shortlist' | 'planner'>('profile');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [shortlist, setShortlist] = useState<ShortlistItem[]>([]);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    if (!authUser) {
      setUser(null);
      setShortlist([]);
      return;
    }

    const userDocRef = doc(db, 'users', authUser.uid);
    const unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setUser(docSnap.data() as UserProfile);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${authUser.uid}`));

    const shortlistColRef = collection(db, 'users', authUser.uid, 'shortlist');
    const unsubscribeShortlist = onSnapshot(shortlistColRef, (querySnap) => {
      const items = querySnap.docs.map(d => d.data() as ShortlistItem);
      setShortlist(items.sort((a, b) => a.userRank - b.userRank));
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${authUser.uid}/shortlist`));

    return () => {
      unsubscribeUser();
      unsubscribeShortlist();
    };
  }, [authUser]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const handleUpdateProfile = async (profile: UserProfile) => {
    if (!authUser) return;
    try {
      await setDoc(doc(db, 'users', authUser.uid), profile);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${authUser.uid}`);
    }
  };

  const handleAddToShortlist = async (uni: University) => {
    if (!authUser) return;
    if (shortlist.find(item => item.name === uni.name)) return;
    
    const newItem: ShortlistItem = {
      ...uni,
      userRank: shortlist.length + 1,
      status: 'shortlisted',
      tasks: []
    };
    
    try {
      await setDoc(doc(db, 'users', authUser.uid, 'shortlist', uni.id), newItem);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${authUser.uid}/shortlist/${uni.id}`);
    }
  };

  const handleRemoveFromShortlist = async (id: string) => {
    if (!authUser) return;
    try {
      await deleteDoc(doc(db, 'users', authUser.uid, 'shortlist', id));
      // Re-ranking is handled by the server-side logic or client-side update if needed, 
      // but for simplicity we'll just delete and let the user manage ranks.
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${authUser.uid}/shortlist/${id}`);
    }
  };

  const handleUpdateRank = async (id: string, newRank: number) => {
    if (!authUser) return;
    const updated = [...shortlist];
    const index = updated.findIndex(item => item.id === id);
    if (index === -1) return;
    
    const [item] = updated.splice(index, 1);
    updated.splice(newRank - 1, 0, item);
    
    const batch = updated.map((item, idx) => {
      const newItem = { ...item, userRank: idx + 1 };
      return setDoc(doc(db, 'users', authUser.uid, 'shortlist', item.id), newItem);
    });

    try {
      await Promise.all(batch);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${authUser.uid}/shortlist`);
    }
  };

  const handleGeneratePlan = async (id: string) => {
    if (!authUser) return;
    const item = shortlist.find(i => i.id === id);
    if (!item) return;

    try {
      const plan = await getApplicationPlan(item.name, item.major, item.country);
      const tasks: Task[] = plan.map((p: any, idx: number) => ({
        id: `${id}-task-${idx}`,
        title: p.title,
        description: p.description,
        deadline: p.deadline,
        completed: false,
        category: p.category
      }));
      
      await setDoc(doc(db, 'users', authUser.uid, 'shortlist', id), { ...item, tasks, status: 'applying' });
    } catch (error) {
      console.error('Failed to generate plan:', error);
    }
  };

  const toggleTask = async (uniId: string, taskId: string) => {
    if (!authUser) return;
    const item = shortlist.find(i => i.id === uniId);
    if (!item) return;

    const updatedTasks = item.tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t);
    
    try {
      await setDoc(doc(db, 'users', authUser.uid, 'shortlist', uniId), { ...item, tasks: updatedTasks });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${authUser.uid}/shortlist/${uniId}`);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-[#5A5A40] border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-6">
        <div className="bg-white p-12 rounded-[40px] border border-[#E5E5E0] shadow-2xl max-w-lg w-full text-center">
          <div className="w-20 h-20 bg-[#5A5A40] rounded-full flex items-center justify-center text-white mx-auto mb-8 shadow-lg">
            <GraduationCap size={40} />
          </div>
          <h1 className="text-4xl font-bold mb-4">Welcome to UniGuide</h1>
          <p className="text-[#5A5A40] opacity-70 mb-10 text-lg">
            Your personal AI-powered roadmap to top universities worldwide. Sign in to start your journey.
          </p>
          <button 
            onClick={handleLogin}
            className="w-full bg-[#5A5A40] text-white py-5 rounded-2xl font-bold text-xl hover:shadow-2xl transition-all flex items-center justify-center gap-3"
          >
            <LogIn size={24} /> Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] flex font-serif text-[#1A1A1A]">
      {/* Sidebar */}
      <nav className="w-64 bg-white border-r border-[#E5E5E0] flex flex-col p-6 fixed h-full">
        <div className="flex items-center gap-3 mb-12">
          <div className="w-10 h-10 bg-[#5A5A40] rounded-full flex items-center justify-center text-white">
            <GraduationCap size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">UniGuide</h1>
        </div>

        <div className="space-y-2 flex-1">
          <SidebarLink 
            icon={<UserCircle size={20} />} 
            label="My Profile" 
            active={activeTab === 'profile'} 
            onClick={() => setActiveTab('profile')} 
          />
          <SidebarLink 
            icon={<Search size={20} />} 
            label="Find Schools" 
            active={activeTab === 'search'} 
            onClick={() => setActiveTab('search')} 
          />
          <SidebarLink 
            icon={<ListOrdered size={20} />} 
            label="Shortlist" 
            active={activeTab === 'shortlist'} 
            onClick={() => setActiveTab('shortlist')} 
          />
          <SidebarLink 
            icon={<CalendarCheck size={20} />} 
            label="App Planner" 
            active={activeTab === 'planner'} 
            onClick={() => setActiveTab('planner')} 
          />
        </div>

        <div className="pt-6 border-t border-[#E5E5E0] space-y-4">
          <div className="bg-[#F5F5F0] p-4 rounded-2xl">
            <p className="text-xs text-[#5A5A40] font-medium uppercase tracking-wider mb-1">Target Countries</p>
            <div className="flex flex-wrap gap-1">
              {COUNTRIES.map(c => (
                <span key={c} className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-[#E5E5E0]">{c}</span>
              ))}
            </div>
          </div>
          
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 transition-all font-medium"
          >
            <LogOut size={20} /> Sign Out
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="ml-64 flex-1 p-12 max-w-6xl">
        <AnimatePresence mode="wait">
          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ProfileView user={user} setUser={handleUpdateProfile} onComplete={() => setActiveTab('search')} authUser={authUser} />
            </motion.div>
          )}

          {activeTab === 'search' && (
            <motion.div
              key="search"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <SearchView user={user} onAdd={handleAddToShortlist} shortlist={shortlist} />
            </motion.div>
          )}

          {activeTab === 'shortlist' && (
            <motion.div
              key="shortlist"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ShortlistView 
                shortlist={shortlist} 
                onRemove={handleRemoveFromShortlist} 
                onUpdateRank={handleUpdateRank}
                onGeneratePlan={handleGeneratePlan}
              />
            </motion.div>
          )}

          {activeTab === 'planner' && (
            <motion.div
              key="planner"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <PlannerView shortlist={shortlist} onToggleTask={toggleTask} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function SidebarLink({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
        active ? "bg-[#5A5A40] text-white shadow-lg" : "text-[#5A5A40] hover:bg-[#F5F5F0]"
      )}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );
}

function ProfileView({ user, setUser, onComplete, authUser }: { user: UserProfile | null, setUser: (u: UserProfile) => void, onComplete: () => void, authUser: User }) {
  const [formData, setFormData] = useState<UserProfile>(user || {
    id: authUser.uid,
    email: authUser.email || '',
    name: authUser.displayName || '',
    academicStanding: 'A*AA',
    interests: [],
    budget: 40000,
    plannedMajor: 'Computer Science',
    cvSummary: '',
    financialStatement: ''
  });

  const [majorSuggestions, setMajorSuggestions] = useState<{major: string, reason: string}[]>([]);
  const [loadingMajors, setLoadingMajors] = useState(false);

  const handleGetMajorSuggestions = async () => {
    setLoadingMajors(true);
    try {
      const suggestions = await getMajorSuggestions({
        cvSummary: formData.cvSummary || '',
        academicStanding: formData.academicStanding,
        interests: formData.interests,
        financialStatement: formData.financialStatement || ''
      });
      setMajorSuggestions(suggestions);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingMajors(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-4xl font-bold mb-2">Student Profile</h2>
        <p className="text-[#5A5A40] opacity-80">Tell us about your academic background and goals.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6 bg-white p-8 rounded-3xl border border-[#E5E5E0] shadow-sm">
          <div className="space-y-2">
            <label className="text-sm font-bold uppercase tracking-wider text-[#5A5A40]">Full Name</label>
            <input 
              type="text" 
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="w-full p-3 rounded-xl border border-[#E5E5E0] focus:ring-2 focus:ring-[#5A5A40] outline-none"
              placeholder="e.g. John Doe"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider text-[#5A5A40]">A-Level Grades</label>
              <input 
                type="text" 
                value={formData.academicStanding}
                onChange={e => setFormData({...formData, academicStanding: e.target.value})}
                className="w-full p-3 rounded-xl border border-[#E5E5E0] focus:ring-2 focus:ring-[#5A5A40] outline-none"
                placeholder="e.g. A*AA"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider text-[#5A5A40]">Budget (USD/yr)</label>
              <select 
                value={formData.budget}
                onChange={e => setFormData({...formData, budget: Number(e.target.value)})}
                className="w-full p-3 rounded-xl border border-[#E5E5E0] focus:ring-2 focus:ring-[#5A5A40] outline-none"
              >
                {BUDGET_RANGES.map(b => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold uppercase tracking-wider text-[#5A5A40]">Planned Major</label>
            <div className="space-y-2">
              <select 
                value={MAJORS.includes(formData.plannedMajor) ? formData.plannedMajor : 'Other'}
                onChange={e => {
                  if (e.target.value !== 'Other') {
                    setFormData({...formData, plannedMajor: e.target.value});
                  }
                }}
                className="w-full p-3 rounded-xl border border-[#E5E5E0] focus:ring-2 focus:ring-[#5A5A40] outline-none"
              >
                {MAJORS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
                <option value="Other">Other (Type below)</option>
              </select>
              {(!MAJORS.includes(formData.plannedMajor) || formData.plannedMajor === 'Other') && (
                <input 
                  type="text"
                  value={formData.plannedMajor === 'Other' ? '' : formData.plannedMajor}
                  onChange={e => setFormData({...formData, plannedMajor: e.target.value})}
                  className="w-full p-3 rounded-xl border border-[#E5E5E0] focus:ring-2 focus:ring-[#5A5A40] outline-none"
                  placeholder="Type your custom major here..."
                />
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold uppercase tracking-wider text-[#5A5A40]">CV Summary / Achievements</label>
            <textarea 
              value={formData.cvSummary}
              onChange={e => setFormData({...formData, cvSummary: e.target.value})}
              className="w-full p-3 rounded-xl border border-[#E5E5E0] focus:ring-2 focus:ring-[#5A5A40] outline-none h-32"
              placeholder="List your key achievements, extracurriculars, etc."
            />
          </div>

          <button 
            onClick={() => { setUser(formData); onComplete(); }}
            className="w-full bg-[#5A5A40] text-white py-4 rounded-xl font-bold hover:shadow-xl transition-all flex items-center justify-center gap-2"
          >
            Save Profile & Continue <ArrowRight size={20} />
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-[#5A5A40] text-white p-8 rounded-3xl shadow-xl relative overflow-hidden">
            <Sparkles className="absolute top-4 right-4 opacity-20" size={48} />
            <h3 className="text-2xl font-bold mb-4">AI Major Advisor</h3>
            <p className="opacity-80 mb-6">Not sure about your major? Let our AI suggest the best fit based on your profile.</p>
            <button 
              onClick={handleGetMajorSuggestions}
              disabled={loadingMajors}
              className="bg-white text-[#5A5A40] px-6 py-3 rounded-xl font-bold hover:bg-opacity-90 transition-all disabled:opacity-50"
            >
              {loadingMajors ? 'Analyzing...' : 'Suggest Majors'}
            </button>
          </div>

          {majorSuggestions.length > 0 && (
            <div className="space-y-4">
              {majorSuggestions.map((s, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-white p-6 rounded-2xl border border-[#E5E5E0] shadow-sm"
                >
                  <h4 className="font-bold text-lg mb-1">{s.major}</h4>
                  <p className="text-sm text-[#5A5A40] opacity-70">{s.reason}</p>
                  <button 
                    onClick={() => setFormData({...formData, plannedMajor: s.major})}
                    className="mt-3 text-sm font-bold text-[#5A5A40] flex items-center gap-1 hover:underline"
                  >
                    Select this major <ChevronRight size={16} />
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchView({ user, onAdd, shortlist }: { user: UserProfile | null, onAdd: (u: University) => void, shortlist: ShortlistItem[] }) {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterCountry, setFilterCountry] = useState<string>('All');

  const handleSearch = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const suggestions = await getUniversitySuggestions({
        budget: user.budget,
        major: user.plannedMajor,
        academicStanding: user.academicStanding,
        interests: user.interests
      });
      setResults(suggestions);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredResults = filterCountry === 'All' 
    ? results 
    : results.filter(r => r.country === filterCountry);

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-bold mb-2">Find Your School</h2>
          <p className="text-[#5A5A40] opacity-80">AI-powered search for universities matching your profile.</p>
        </div>
        <div className="flex gap-3">
          {results.length > 0 && (
            <button 
              onClick={() => setResults([])}
              className="bg-white border border-[#E5E5E0] text-[#5A5A40] px-6 py-4 rounded-xl font-bold hover:bg-[#F5F5F0] transition-all"
            >
              Clear
            </button>
          )}
          <button 
            onClick={handleSearch}
            disabled={loading || !user}
            className="bg-[#5A5A40] text-white px-8 py-4 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? 'Searching...' : <><Sparkles size={20} /> Find Matches</>}
          </button>
        </div>
      </header>

      {results.length > 0 && (
        <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-[#E5E5E0]">
          <span className="text-sm font-bold text-[#5A5A40] uppercase tracking-wider">Filter by Country:</span>
          <div className="flex gap-2">
            {['All', ...COUNTRIES].map(c => (
              <button
                key={c}
                onClick={() => setFilterCountry(c)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  filterCountry === c ? "bg-[#5A5A40] text-white" : "bg-[#F5F5F0] text-[#5A5A40] hover:bg-[#E5E5E0]"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {!user && (
        <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl flex items-center gap-4 text-amber-800">
          <AlertCircle size={24} />
          <p>Please complete your profile first to get personalized suggestions.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredResults.map((uni, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white rounded-3xl border border-[#E5E5E0] overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col"
          >
            <div className="p-8 flex-1">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-[#5A5A40] uppercase tracking-widest mb-1">
                    <Globe size={14} /> {uni.country} • {uni.location}
                  </div>
                  <h3 className="text-2xl font-bold">{uni.name}</h3>
                </div>
                <div className="bg-[#F5F5F0] px-3 py-1 rounded-full text-xs font-bold">
                  ${uni.tuitionFee.toLocaleString()}/yr
                </div>
              </div>

              <p className="text-sm text-[#5A5A40] mb-6 italic">"{uni.fitReason}"</p>

              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#5A5A40] mb-2">Entry Requirements</h4>
                  <p className="text-sm opacity-80">{uni.entryRequirements}</p>
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#5A5A40] mb-2">Scholarships</h4>
                  <div className="flex flex-wrap gap-2">
                    {uni.scholarships.map((s: string, idx: number) => (
                      <span key={idx} className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-1 rounded-lg font-medium">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <button 
              onClick={() => onAdd({ ...uni, id: `uni-${i}-${Date.now()}`, major: user?.plannedMajor || '' })}
              disabled={shortlist.some(item => item.name === uni.name)}
              className={cn(
                "w-full py-4 font-bold border-t border-[#E5E5E0] transition-all flex items-center justify-center gap-2",
                shortlist.some(item => item.name === uni.name) 
                  ? "bg-[#F5F5F0] text-[#5A5A40] opacity-50 cursor-not-allowed" 
                  : "bg-white text-[#5A5A40] hover:bg-[#5A5A40] hover:text-white"
              )}
            >
              {shortlist.some(item => item.name === uni.name) ? <><CheckCircle2 size={18} /> Added</> : <><Plus size={18} /> Add to Shortlist</>}
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ShortlistView({ shortlist, onRemove, onUpdateRank, onGeneratePlan }: { 
  shortlist: ShortlistItem[], 
  onRemove: (id: string) => void,
  onUpdateRank: (id: string, newRank: number) => void,
  onGeneratePlan: (id: string) => void
}) {
  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-4xl font-bold mb-2">My Shortlist</h2>
        <p className="text-[#5A5A40] opacity-80">Rank and manage your top university choices (Max 10 recommended).</p>
      </header>

      {shortlist.length === 0 ? (
        <div className="bg-white p-20 rounded-3xl border border-dashed border-[#E5E5E0] text-center">
          <div className="w-16 h-16 bg-[#F5F5F0] rounded-full flex items-center justify-center mx-auto mb-4 text-[#5A5A40]">
            <ListOrdered size={32} />
          </div>
          <h3 className="text-xl font-bold mb-2">Your shortlist is empty</h3>
          <p className="text-[#5A5A40] opacity-60 mb-6">Start searching for schools to add them here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {shortlist.map((item, i) => (
            <motion.div 
              key={item.id}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white p-6 rounded-2xl border border-[#E5E5E0] shadow-sm flex items-center gap-6"
            >
              <div className="flex flex-col items-center gap-1">
                <button 
                  onClick={() => i > 0 && onUpdateRank(item.id, i)}
                  className="p-1 hover:bg-[#F5F5F0] rounded text-[#5A5A40]"
                >
                  <ChevronRight className="-rotate-90" size={16} />
                </button>
                <div className="w-10 h-10 bg-[#F5F5F0] rounded-full flex items-center justify-center font-bold text-lg">
                  {item.userRank}
                </div>
                <button 
                  onClick={() => i < shortlist.length - 1 && onUpdateRank(item.id, i + 2)}
                  className="p-1 hover:bg-[#F5F5F0] rounded text-[#5A5A40]"
                >
                  <ChevronRight className="rotate-90" size={16} />
                </button>
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 text-[10px] font-bold text-[#5A5A40] uppercase tracking-widest mb-0.5">
                  {item.country} • {item.major}
                </div>
                <h3 className="text-xl font-bold">{item.name}</h3>
              </div>

              <div className="flex items-center gap-4">
                {item.tasks.length === 0 ? (
                  <button 
                    onClick={() => onGeneratePlan(item.id)}
                    className="bg-[#5A5A40] text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:shadow-md transition-all"
                  >
                    <Sparkles size={16} /> Generate Plan
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-600 text-sm font-bold">
                    <CheckCircle2 size={16} /> Plan Ready
                  </div>
                )}
                <button 
                  onClick={() => onRemove(item.id)}
                  className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-all"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlannerView({ shortlist, onToggleTask }: { shortlist: ShortlistItem[], onToggleTask: (uniId: string, taskId: string) => void }) {
  const [selectedUni, setSelectedUni] = useState<string | null>(shortlist[0]?.id || null);
  const activeUni = shortlist.find(i => i.id === selectedUni);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-4xl font-bold mb-2">Application Planner</h2>
        <p className="text-[#5A5A40] opacity-80">Track your progress and deadlines for each school.</p>
      </header>

      <div className="flex gap-8">
        <div className="w-64 space-y-2">
          {shortlist.map(item => (
            <button 
              key={item.id}
              onClick={() => setSelectedUni(item.id)}
              className={cn(
                "w-full text-left p-4 rounded-2xl transition-all border",
                selectedUni === item.id 
                  ? "bg-white border-[#5A5A40] shadow-md" 
                  : "bg-transparent border-transparent hover:bg-white/50"
              )}
            >
              <div className="text-[10px] uppercase font-bold text-[#5A5A40] opacity-60">{item.country}</div>
              <div className="font-bold truncate">{item.name}</div>
              {item.tasks.length > 0 && (
                <div className="mt-2 h-1 w-full bg-[#F5F5F0] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all" 
                    style={{ width: `${(item.tasks.filter(t => t.completed).length / item.tasks.length) * 100}%` }}
                  />
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 bg-white rounded-3xl border border-[#E5E5E0] p-8 shadow-sm">
          {activeUni ? (
            activeUni.tasks.length > 0 ? (
              <div className="space-y-8">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-2xl font-bold">{activeUni.name}</h3>
                    <p className="text-[#5A5A40] opacity-70">Application Roadmap for {activeUni.major}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-emerald-600">
                      {Math.round((activeUni.tasks.filter(t => t.completed).length / activeUni.tasks.length) * 100)}%
                    </div>
                    <div className="text-xs font-bold uppercase text-[#5A5A40] opacity-50">Completed</div>
                  </div>
                </div>

                <div className="space-y-6">
                  {['preparation', 'submission', 'follow-up'].map(category => {
                    const categoryTasks = activeUni.tasks.filter(t => t.category === category);
                    if (categoryTasks.length === 0) return null;

                    return (
                      <div key={category} className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-[#5A5A40] opacity-50 border-b border-[#F5F5F0] pb-2">
                          {category}
                        </h4>
                        {categoryTasks.map(task => (
                          <div 
                            key={task.id}
                            onClick={() => onToggleTask(activeUni.id, task.id)}
                            className={cn(
                              "flex items-start gap-4 p-4 rounded-2xl cursor-pointer transition-all border",
                              task.completed 
                                ? "bg-emerald-50 border-emerald-100 opacity-70" 
                                : "bg-[#F5F5F0] border-transparent hover:border-[#5A5A40]"
                            )}
                          >
                            <div className={cn(
                              "mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                              task.completed ? "bg-emerald-500 border-emerald-500 text-white" : "border-[#5A5A40]"
                            )}>
                              {task.completed && <CheckCircle2 size={12} />}
                            </div>
                            <div className="flex-1">
                              <div className="flex justify-between items-start mb-1">
                                <h5 className={cn("font-bold", task.completed && "line-through")}>{task.title}</h5>
                                <div className="flex items-center gap-1 text-[10px] font-bold text-[#5A5A40] opacity-60">
                                  <Clock size={12} /> {task.deadline}
                                </div>
                              </div>
                              <p className="text-sm opacity-70">{task.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-12">
                <Sparkles size={48} className="text-[#5A5A40] opacity-20 mb-4" />
                <h3 className="text-xl font-bold mb-2">No plan generated yet</h3>
                <p className="text-[#5A5A40] opacity-60 mb-6">Go to the Shortlist tab and click "Generate Plan" to create a custom roadmap for this school.</p>
              </div>
            )
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-12">
              <CalendarCheck size={48} className="text-[#5A5A40] opacity-20 mb-4" />
              <h3 className="text-xl font-bold mb-2">Select a university</h3>
              <p className="text-[#5A5A40] opacity-60">Choose a school from your shortlist to view its application plan.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
