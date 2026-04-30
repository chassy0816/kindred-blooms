
import React, { useState, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { Sparkles, BookOpen, Calculator, Heart, Palette, Leaf, Play, Volume2, Download, RefreshCw, ChevronRight, Bookmark, Trash2, X, Target, Clock, Home, Printer, Layers, Info, BarChart, Camera, Zap, ShieldCheck, Wrench, HelpCircle, Youtube, Globe, UserCheck, BookMarked, AlertTriangle, Plus, User, ChevronLeft, ArrowRight, Mail, Search } from 'lucide-react';
import { Activity, Subject, AgeGroup, ActivityDuration, AppMode, LessonPlan, DifficultyLevel, ResourcesAndSupport } from './types';
import { generateActivity, generateActivityImage, generateSpeech, decodeBase64, decodeAudioData, generateLessonPlan, generateImageForPlan, generateActivityFromImage } from './services/geminiService';

type AppScreen = 'home' | 'generate' | 'plans' | 'library' | 'profile' | 'resources';

const buildWebSearchUrl = (baseUrl: string, searchQuery: string, ageGroup?: string): string => {
  const q = encodeURIComponent(searchQuery);
  const gradeMap: Record<string, string> = { '3': 'K', '4': 'K', '5': 'K', '6': '1', '7': '2' };
  const grade = ageGroup ? gradeMap[ageGroup] ?? 'K' : 'K';
  switch (baseUrl.replace(/\/$/, '')) {
    case 'https://kids.nationalgeographic.com': return `https://kids.nationalgeographic.com/search?q=${q}`;
    case 'https://www.readworks.org':        return `https://www.readworks.org/search#q=${q}&grade=${grade}`;
    case 'https://www.zerotothree.org':      return `https://www.zerotothree.org/?s=${q}`;
    case 'https://www.naeyc.org':            return `https://www.naeyc.org/search?query=${q}`;
    case 'https://www.understood.org':       return `https://www.understood.org/search?q=${q}`;
    case 'https://www.abcya.com':            return `https://www.abcya.com/games/search?q=${q}`;
    case 'https://www.scholastic.com/parents': return `https://www.scholastic.com/parents/search-results.html?q=${q}`;
    case 'https://www.khanacademy.org':      return `https://www.khanacademy.org/search?page_search_query=${q}`;
    case 'https://www.education.com':        return `https://www.education.com/worksheets/?q=${q}`;
    case 'https://learninglab.si.edu':       return `https://learninglab.si.edu/search?q=${q}`;
    default:                                 return baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
  }
};

const CHOKING_HAZARD_REGEX = /\b(beads?|buttons?|coins?|marbles?|cotton\s+balls?|googly\s+eyes?|small\s+balls?|small\s+blocks?|pom[\s-]?poms?|sequins?|dice|die|tokens?|pebbles?|seeds?|small\s+stones?|gems?|jewels?|pasta|noodles?|dried\s+beans?|dry\s+beans?|erasers?|tacks?|thumbtacks?)\b/i;
const isChokingHazard = (name: string) => CHOKING_HAZARD_REGEX.test(name);

const BloomLogo: React.FC<{ size?: number }> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
    {[0,1,2,3,4,5,6,7,8].map((i) => (
      <ellipse key={i} cx="22" cy="13" rx="4" ry="8"
        fill={(['#6366f1','#818cf8','#a78bfa'] as const)[i % 3]}
        opacity="0.88" transform={`rotate(${i * 40}, 22, 22)`}
      />
    ))}
    <circle cx="22" cy="22" r="6" fill="#f59e0b" />
    <circle cx="22" cy="22" r="3.5" fill="#fde68a" />
  </svg>
);

const App: React.FC = () => {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('home');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const [mode, setMode] = useState<AppMode>('Single');
  const [age, setAge] = useState<AgeGroup>('4');
  const [subject, setSubject] = useState<Subject>(Subject.Literacy);
  const [duration, setDuration] = useState<ActivityDuration>('Short');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('Medium');
  const [theme, setTheme] = useState('');

  const [activity, setActivity] = useState<Activity | null>(null);
  const [lessonPlan, setLessonPlan] = useState<LessonPlan | null>(null);
  const [favorites, setFavorites] = useState<Activity[]>(() => {
    try {
      const saved = localStorage.getItem('kindred_blooms_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [favoriteLessonPlans, setFavoriteLessonPlans] = useState<LessonPlan[]>(() => {
    try {
      const saved = localStorage.getItem('kindred_blooms_favorite_plans');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const subjects = [
    { name: Subject.Literacy, icon: BookOpen, color: 'bg-blue-100 text-blue-600' },
    { name: Subject.Math, icon: Calculator, color: 'bg-green-100 text-green-600' },
    { name: Subject.SEL, icon: Heart, color: 'bg-rose-100 text-rose-600' },
    { name: Subject.Creativity, icon: Palette, color: 'bg-purple-100 text-purple-600' },
    { name: Subject.Nature, icon: Leaf, color: 'bg-emerald-100 text-emerald-600' },
    { name: Subject.STEAM, icon: Wrench, color: 'bg-amber-100 text-amber-600' },
  ];

  const durations: ActivityDuration[] = ['Short', 'Medium'];
  const difficulties: DifficultyLevel[] = ['Easy', 'Medium', 'Hard'];

  useEffect(() => {
    try {
      // Strip imageUrl (base64 data URLs are too large for localStorage)
      const toSave = favorites.map(({ imageUrl, ...rest }) => rest);
      localStorage.setItem('kindred_blooms_favorites', JSON.stringify(toSave));
    } catch {
      // QuotaExceededError — in-memory state still works for this session
    }
  }, [favorites]);

  useEffect(() => {
    try {
      // Strip imageUrl from plan and its activities to stay within localStorage limits
      const toSave = favoriteLessonPlans.map(plan => ({
        ...plan,
        imageUrl: undefined,
        activities: plan.activities.map(({ imageUrl, ...rest }) => rest),
      }));
      localStorage.setItem('kindred_blooms_favorite_plans', JSON.stringify(toSave));
    } catch {
      // QuotaExceededError — in-memory state still works for this session
    }
  }, [favoriteLessonPlans]);

  const navigateTo = (screen: AppScreen) => {
    if (screen === 'plans') setMode('LessonPlan');
    else if (screen === 'generate') setMode('Single');
    setActiveScreen(screen);
  };

  const activeTab: AppScreen =
    activeScreen === 'plans' ? 'plans'
    : activeScreen === 'library' ? 'library'
    : activeScreen === 'profile' ? 'profile'
    : 'home';

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      if (mode === 'Single') {
        const newActivity = await generateActivity(age, subject, theme, duration, difficulty);
        const imageUrl = await generateActivityImage(newActivity);
        setActivity({ ...newActivity, imageUrl });
        setLessonPlan(null);
      } else {
        const newPlan = await generateLessonPlan(age, subject, theme, difficulty);
        const imageUrl = await generateImageForPlan(newPlan.title, theme, newPlan.activities.map(a => a.label));
        setLessonPlan({ ...newPlan, imageUrl });
        setActivity(null);
      }
    } catch (error) {
      console.error('Generation failed', error);
    } finally {
      setIsLoading(false);
    }
  };

  const startScanner = async () => {
    setScannerError(null);
    setIsScannerOpen(true);
    setMode('Scanner');
    setActiveScreen('generate');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera API not supported in this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      console.error('Camera error', err);
      const message = err?.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access in your browser settings.'
        : err?.name === 'NotFoundError'
        ? 'No camera found on this device.'
        : err?.message || 'Unable to open camera. Make sure you are on a secure (HTTPS) connection.';
      setScannerError(message);
      setIsScannerOpen(false);
      setMode('Single');
    }
  };

  const stopScanner = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    setIsScannerOpen(false);
  };

  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx2d = canvasRef.current.getContext('2d');
    if (!ctx2d) return;
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx2d.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    const base64Image = canvasRef.current.toDataURL('image/jpeg').split(',')[1];
    stopScanner();
    setIsLoading(true);
    try {
      const newActivity = await generateActivityFromImage(base64Image, age, subject);
      const imageUrl = await generateActivityImage(newActivity);
      setActivity({ ...newActivity, imageUrl });
      setLessonPlan(null);
      setMode('Single');
    } catch (error) {
      console.error('Scan failed', error);
      setMode('Single');
    } finally {
      setIsLoading(false);
    }
  };

  const playSpeech = async (target?: any) => {
    const item = target || activity || (lessonPlan ? lessonPlan.activities[0] : null);
    if (!item || isSpeaking) return;
    setIsSpeaking(true);
    try {
      const materialsText = item.materials.map((m: any) =>
        `${m.name}${m.householdAlternative ? ` (or at home use ${m.householdAlternative})` : ''}`
      ).join(', ');
      const modsText = item.modifications ? item.modifications.map((m: any) => `${m.type}: ${m.suggestion}`).join('. ') : '';
      const textToSpeak = `${item.label || item.title}. Difficulty: ${item.difficulty}. Primary Skill: ${item.primarySkill}. Materials: ${materialsText}. Steps: ${item.steps?.join('. ')}. ${modsText ? `Inclusive Modifications: ${modsText}.` : ''} Reflection: ${item.reflectionQuestion}`;
      const base64Audio = await generateSpeech(textToSpeak);
      if (base64Audio) {
        const ctx = audioContext || new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        if (!audioContext) setAudioContext(ctx);
        const audioBuffer = await decodeAudioData(decodeBase64(base64Audio), ctx);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => setIsSpeaking(false);
        source.start(0);
      } else setIsSpeaking(false);
    } catch (error) {
      console.error('Speech failed', error);
      setIsSpeaking(false);
    }
  };

  const handleDownload = () => {
    if (!activity && !lessonPlan) return;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const M = 18;
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const CW = PW - M * 2;
    let y = 0;

    // Replace special Unicode characters that Helvetica can't render
    const safe = (s: string) => s
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/–/g, '-').replace(/—/g, '--')
      .replace(/…/g, '...')
      .replace(/[^\x00-\xFF]/g, '');

    const clrI: [number,number,number] = [99,102,241];   // indigo
    const clrE: [number,number,number] = [16,185,129];   // emerald
    const clrA: [number,number,number] = [245,158,11];   // amber
    const clrS9: [number,number,number] = [15,23,42];    // slate-900
    const clrS6: [number,number,number] = [71,85,105];   // slate-600
    const clrS4: [number,number,number] = [148,163,184]; // slate-400
    const clrS1: [number,number,number] = [241,245,249]; // slate-100
    const clrW: [number,number,number] = [255,255,255];  // white

    const lh = (pt: number) => pt * 0.3528 * 1.5;

    const checkPage = (need: number) => {
      if (y + need > PH - M - 13) { doc.addPage(); y = M + 4; }
    };

    /** Draw wrapped text and advance y */
    const txt = (text: string, pt: number, bold: boolean, clr: [number,number,number], indent = 0) => {
      const s = safe(text);
      doc.setFontSize(pt);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setTextColor(...clr);
      const lines = doc.splitTextToSize(s, CW - indent) as string[];
      checkPage(lines.length * lh(pt) + 2);
      doc.text(lines, M + indent, y);
      y += lines.length * lh(pt) + 2;
    };

    /** Draw a clickable link (underlined, indigo) and advance y */
    const linkTxt = (displayText: string, url: string, indent = 0) => {
      const pt = 8.5;
      const lhPt = lh(pt);
      const display = safe(displayText.length > 78 ? displayText.slice(0, 75) + '...' : displayText);
      doc.setFontSize(pt);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...clrI);
      checkPage(lhPt + 3);
      doc.text(display, M + indent, y);
      const tw = doc.getTextWidth(display);
      doc.setDrawColor(...clrI);
      doc.setLineWidth(0.2);
      doc.line(M + indent, y + 0.8, M + indent + tw, y + 0.8);
      doc.link(M + indent, y - lhPt + 0.5, tw + 0.5, lhPt + 0.5, { url });
      y += lhPt + 3;
    };

    /** Colored full-width section header bar */
    const secBar = (label: string, clr: [number,number,number]) => {
      checkPage(17);
      doc.setFillColor(...clr);
      doc.roundedRect(M, y, CW, 10, 2.5, 2.5, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...clrW);
      doc.text(safe(label).toUpperCase(), M + 5, y + 6.5);
      y += 14;
    };

    const hr = () => {
      checkPage(8);
      doc.setDrawColor(...clrS1);
      doc.setLineWidth(0.35);
      doc.line(M, y, PW - M, y);
      y += 6;
    };

    const sp = (mm = 4) => { y += mm; };

    // ── Page 1 header bar ────────────────────────────────────────────────────
    doc.setFillColor(...clrI);
    doc.rect(0, 0, PW, 22, 'F');
    doc.setFillColor(130, 132, 255);
    doc.ellipse(PW - 18, 6, 16, 16, 'F');
    doc.setFillColor(80, 82, 200);
    doc.ellipse(PW - 4, 20, 9, 9, 'F');
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...clrW);
    doc.text('KINDRED BLOOMS', M, 12.5);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(210, 210, 255);
    doc.text('Rooted in joy. Built for every blooming child.', M, 18.5);
    y = 30;

    // ── ACTIVITY PDF ─────────────────────────────────────────────────────────
    if (activity) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...clrI);
      doc.text('ONE ACTIVITY', M, y);
      y += lh(8) + 1;

      txt(activity.label, 20, true, clrS9);
      sp(1);
      txt(`Age ${activity.ageGroup}  ·  ${activity.subject}  ·  ${activity.difficulty}  ·  ${activity.duration}  ·  Skill: ${activity.primarySkill}`, 8.5, false, clrS4);
      sp(4);
      hr();

      secBar('Materials Needed', clrI);
      activity.materials.forEach(m => {
        txt(`•  ${m.name}`, 10, false, clrS6, 3);
        if (m.householdAlternative) txt(`At home: ${m.householdAlternative}`, 8.5, false, clrS4, 9);
        sp(1);
      });
      sp(3);

      secBar('Step-by-Step Instructions', clrE);
      activity.steps.forEach((s, i) => { txt(`${i + 1}.  ${s}`, 10, false, clrS6, 4); sp(2); });
      sp(2);

      if (activity.modifications?.length) {
        secBar('Inclusive Scaffolding', clrE);
        activity.modifications.forEach(m => {
          txt(m.type, 9, true, clrE, 3);
          txt(m.suggestion, 9.5, false, clrS6, 9);
          sp(2);
        });
        sp(2);
      }

      secBar('Reflection Prompt', clrA);
      txt(`"${activity.reflectionQuestion}"`, 10.5, false, [130, 100, 20], 5);
      sp(5);

      if (activity.resources) {
        hr();
        sp(2);
        secBar('Resources & Support', clrI);

        if (activity.resources.youtubeVideos.length) {
          txt('YouTube Videos', 9, true, clrS6);
          sp(1);
          activity.resources.youtubeVideos.forEach(v => {
            txt(`•  ${v.title}`, 10, false, clrS6, 3);
            const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(v.searchQuery)}`;
            linkTxt(ytUrl, ytUrl, 8);
            sp(1);
          });
          sp(3);
        }

        if (activity.resources.webResources.length) {
          txt('Web Resources', 9, true, clrS6);
          sp(1);
          activity.resources.webResources.forEach(r => {
            txt(`•  ${r.title}`, 10, false, clrS6, 3);
            txt(r.description, 8.5, false, clrS4, 8);
            const rUrl = buildWebSearchUrl(r.url, r.searchQuery || activity.label, activity.ageGroup);
            linkTxt(rUrl, rUrl, 8);
            sp(1);
          });
          sp(3);
        }

        if (activity.resources.professionalContacts?.length) {
          txt('Professional Support', 9, true, clrS6);
          sp(1);
          activity.resources.professionalContacts.forEach(c => {
            txt(`•  ${c.name}`, 10, true, [130, 100, 20], 3);
            txt(c.description, 8.5, false, clrS4, 8);
            const cUrl = c.website.startsWith('http') ? c.website : `https://${c.website}`;
            linkTxt(cUrl, cUrl, 8);
            sp(1);
          });
          sp(3);
        }

        txt('Printables', 9, true, clrS6);
        sp(1);
        txt('•  Colorful Minds Hub on Teachers Pay Teachers', 10, false, clrS6, 3);
        linkTxt('https://www.teacherspayteachers.com/store/the-colorful-minds-hub', 'https://www.teacherspayteachers.com/store/the-colorful-minds-hub', 8);
        sp(1);
        txt('•  Search Pinterest for printables', 10, false, clrS6, 3);
        const pinUrl = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(`${activity.label} printable age ${activity.ageGroup} activity`)}`;
        linkTxt(pinUrl, pinUrl, 8);
      }

      // Footers on all pages
      const totalA = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalA; p++) {
        doc.setPage(p);
        const fy = PH - 9;
        doc.setDrawColor(...clrS1);
        doc.setLineWidth(0.3);
        doc.line(M, fy - 3, PW - M, fy - 3);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...clrS4);
        doc.text('kindredblooms.app  ·  chassy0816@gmail.com', M, fy);
        doc.text(`${p} / ${totalA}`, PW - M, fy, { align: 'right' });
      }

      doc.save(`${activity.label.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);

    } else if (lessonPlan) {
      // ── LESSON PLAN PDF ───────────────────────────────────────────────────
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...clrI);
      doc.text('MINI LESSON PLAN', M, y);
      y += lh(8) + 1;

      txt(lessonPlan.title, 20, true, clrS9);
      sp(1);
      txt(`Skill: ${lessonPlan.primarySkill}  ·  Level: ${lessonPlan.difficulty}  ·  ~${lessonPlan.activities.length * 15} min total`, 8.5, false, clrS4);
      sp(4);
      hr();

      secBar('Learning Objective', clrI);
      txt(lessonPlan.learningObjective, 10.5, false, clrS6, 3);
      sp(3);

      secBar('Lesson Overview', clrI);
      txt(lessonPlan.overview, 10, false, clrS6, 3);
      sp(5);
      hr();

      lessonPlan.activities.forEach((act, idx) => {
        checkPage(55);

        // Activity number badge
        const badgeW = 14;
        doc.setFillColor(...clrI);
        doc.roundedRect(M, y, badgeW, 7, 1.5, 1.5, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...clrW);
        doc.text(`ACTIVITY ${idx + 1}`, M + badgeW / 2, y + 4.8, { align: 'center' });
        y += 10;

        txt(act.label, 16, true, clrS9);
        sp(1);
        txt(`${act.difficulty}  ·  ${act.primarySkill}  ·  ${act.duration}`, 8.5, false, clrS4);
        sp(3);

        secBar('Materials', clrI);
        act.materials.forEach(m => {
          txt(`•  ${m.name}`, 10, false, clrS6, 3);
          if (m.householdAlternative) txt(`At home: ${m.householdAlternative}`, 8.5, false, clrS4, 9);
          sp(1);
        });
        sp(3);

        secBar('Instructions', clrE);
        act.steps.forEach((s, i) => { txt(`${i + 1}.  ${s}`, 10, false, clrS6, 4); sp(2); });
        sp(2);

        if (act.modifications?.length) {
          secBar('Inclusive Scaffolding', clrE);
          act.modifications.forEach(m => {
            txt(m.type, 9, true, clrE, 3);
            txt(m.suggestion, 9.5, false, clrS6, 9);
            sp(2);
          });
          sp(2);
        }

        secBar('Reflection', clrA);
        txt(`"${act.reflectionQuestion}"`, 10.5, false, [130, 100, 20], 5);
        sp(5);

        if (idx < lessonPlan.activities.length - 1) { hr(); sp(3); }
      });

      if (lessonPlan.resources) {
        sp(3);
        hr();
        sp(2);
        secBar('Resources & Support', clrI);

        if (lessonPlan.resources.youtubeVideos.length) {
          txt('YouTube Videos', 9, true, clrS6);
          sp(1);
          lessonPlan.resources.youtubeVideos.forEach(v => {
            txt(`•  ${v.title}`, 10, false, clrS6, 3);
            const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(v.searchQuery)}`;
            linkTxt(ytUrl, ytUrl, 8);
            sp(1);
          });
          sp(3);
        }

        if (lessonPlan.resources.webResources.length) {
          txt('Web Resources', 9, true, clrS6);
          sp(1);
          lessonPlan.resources.webResources.forEach(r => {
            txt(`•  ${r.title}`, 10, false, clrS6, 3);
            txt(r.description, 8.5, false, clrS4, 8);
            const rUrl = buildWebSearchUrl(r.url, r.searchQuery || lessonPlan.title);
            linkTxt(rUrl, rUrl, 8);
            sp(1);
          });
          sp(3);
        }

        if (lessonPlan.resources.professionalContacts?.length) {
          txt('Professional Support', 9, true, clrS6);
          sp(1);
          lessonPlan.resources.professionalContacts.forEach(c => {
            txt(`•  ${c.name}`, 10, true, [130, 100, 20], 3);
            txt(c.description, 8.5, false, clrS4, 8);
            const cUrl = c.website.startsWith('http') ? c.website : `https://${c.website}`;
            linkTxt(cUrl, cUrl, 8);
            sp(1);
          });
          sp(3);
        }

        txt('Printables', 9, true, clrS6);
        sp(1);
        txt('•  Colorful Minds Hub on Teachers Pay Teachers', 10, false, clrS6, 3);
        linkTxt('https://www.teacherspayteachers.com/store/the-colorful-minds-hub', 'https://www.teacherspayteachers.com/store/the-colorful-minds-hub', 8);
        sp(1);
        txt('•  Search Pinterest for printables', 10, false, clrS6, 3);
        const pinUrlPlan = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(`${lessonPlan.title} printable early childhood`)}`;
        linkTxt(pinUrlPlan, pinUrlPlan, 8);
      }

      // Footers on all pages
      const totalP = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalP; p++) {
        doc.setPage(p);
        const fy = PH - 9;
        doc.setDrawColor(...clrS1);
        doc.setLineWidth(0.3);
        doc.line(M, fy - 3, PW - M, fy - 3);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...clrS4);
        doc.text('kindredblooms.app  ·  chassy0816@gmail.com', M, fy);
        doc.text(`${p} / ${totalP}`, PW - M, fy, { align: 'right' });
      }

      doc.save(`${lessonPlan.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    }
  };

  const toggleFavorite = (act?: Activity) => {
    const target = act || activity;
    if (!target) return;
    const isFav = favorites.some(f => f.label === target.label);
    setFavorites(isFav ? favorites.filter(f => f.label !== target.label) : [...favorites, target]);
  };

  const isCurrentFavorite = activity ? favorites.some(f => f.label === activity.label) : false;

  const toggleFavoritePlan = () => {
    if (!lessonPlan) return;
    const isFav = favoriteLessonPlans.some(p => p.title === lessonPlan.title);
    setFavoriteLessonPlans(isFav
      ? favoriteLessonPlans.filter(p => p.title !== lessonPlan.title)
      : [...favoriteLessonPlans, lessonPlan]
    );
  };

  const isCurrentPlanFavorite = lessonPlan ? favoriteLessonPlans.some(p => p.title === lessonPlan.title) : false;

  const getDifficultyColor = (diff: DifficultyLevel) => {
    switch (diff) {
      case 'Easy': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'Hard': return 'bg-rose-50 text-rose-600 border-rose-100';
      default: return 'bg-amber-50 text-amber-600 border-amber-100';
    }
  };

  const renderResourcesSection = (resources: ResourcesAndSupport, topic: string, ageGroup?: string) => (
    <section className="mt-12 bg-gradient-to-br from-violet-50 to-indigo-50 p-6 md:p-8 rounded-3xl border border-violet-100 shadow-sm">
      <h3 className="text-xl font-extrabold text-violet-900 mb-6 flex items-center gap-2.5">
        <div className="w-8 h-8 bg-violet-500 rounded-xl flex items-center justify-center text-white shrink-0">
          <BookMarked size={16} />
        </div>
        Resources &amp; Support
      </h3>
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-violet-100 shadow-sm">
          <h4 className="font-bold text-[11px] uppercase tracking-widest text-rose-600 mb-3 flex items-center gap-2">
            <Youtube size={14} /> YouTube Videos
          </h4>
          <ul className="space-y-3">
            {resources.youtubeVideos.map((v, i) => (
              <li key={i}>
                <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(v.searchQuery)}`} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-2 text-sm text-slate-700 hover:text-rose-600 transition-colors">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-rose-300 shrink-0" />
                  <span className="font-medium group-hover:underline">{v.title}</span>
                </a>
                <p className="ml-3.5 text-[11px] text-slate-400 italic mt-0.5">Search: "{v.searchQuery}"</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-violet-100 shadow-sm">
          <h4 className="font-bold text-[11px] uppercase tracking-widest text-indigo-600 mb-3 flex items-center gap-2">
            <Globe size={14} /> Web Resources
          </h4>
          <ul className="space-y-3">
            {resources.webResources.map((r, i) => (
              <li key={i}>
                <a href={buildWebSearchUrl(r.url, r.searchQuery || topic, ageGroup)} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-2 text-sm text-slate-700 hover:text-indigo-600 transition-colors">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-300 shrink-0" />
                  <span className="font-medium group-hover:underline">{r.title}</span>
                </a>
                <p className="ml-3.5 text-[11px] text-slate-500 leading-relaxed mt-0.5">{r.description}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-violet-100 shadow-sm">
          <h4 className="font-bold text-[11px] uppercase tracking-widest text-emerald-600 mb-3 flex items-center gap-2">
            <Printer size={14} /> Find Printables
          </h4>
          <div className="space-y-3">
            <a href="https://www.teacherspayteachers.com/store/the-colorful-minds-hub" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-xl transition-colors">
              <Search size={14} /> Search Colorful Minds on TPT
            </a>
            <a href={`https://www.pinterest.com/search/pins/?q=${encodeURIComponent(`${topic} printable${ageGroup ? ` age ${ageGroup}` : ''} activity worksheet`)}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-bold rounded-xl border border-emerald-200 transition-colors">
              <Globe size={14} /> Search Pinterest for Printables
            </a>
          </div>
        </div>
        {resources.professionalContacts.length > 0 && (
          <div className="bg-amber-50 p-5 rounded-2xl border border-amber-100 shadow-sm">
            <h4 className="font-bold text-[11px] uppercase tracking-widest text-amber-700 mb-3 flex items-center gap-2">
              <UserCheck size={14} /> Professional Support
            </h4>
            <ul className="space-y-3">
              {resources.professionalContacts.map((c, i) => (
                <li key={i}>
                  <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-2 text-sm text-amber-800 hover:text-amber-600 transition-colors">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span className="font-bold group-hover:underline">{c.name}</span>
                  </a>
                  <p className="ml-3.5 text-[11px] text-amber-700 leading-relaxed mt-0.5">{c.description}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <p className="mt-4 text-[10px] text-slate-400 italic text-center">Resources are AI-suggested. Links open in a new tab — verify they meet your district's guidelines before sharing with families.</p>
    </section>
  );

  const renderSidebar = () => (
    <aside className="w-full md:w-80 bg-white border-b md:border-b-0 md:border-r border-slate-100 p-6 flex flex-col shrink-0 overflow-y-auto">
      <div className="flex items-center gap-2 mb-8">
        <button onClick={() => setActiveScreen('home')} className="w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
          <ChevronLeft size={20} />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <BloomLogo size={34} />
          <div className="flex flex-col leading-tight">
            <span className="text-base font-extrabold tracking-tight" style={{ color: '#1e1b4b' }}>Kindred</span>
            <span className="text-base font-extrabold tracking-tight" style={{ color: '#6366f1' }}>Blooms</span>
          </div>
        </div>
        <button onClick={() => setShowHelpModal(true)} className="w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
          <HelpCircle size={20} />
        </button>
      </div>

      <div className="space-y-6 flex-1">
        <section>
          <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 block">Toolkit Mode</label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-50 rounded-xl">
            {(['Single', 'LessonPlan'] as AppMode[]).map(m => (
              <button key={m}
                onClick={() => {
                  setMode(m);
                  if (m !== 'Scanner') stopScanner();
                  setActiveScreen(m === 'LessonPlan' ? 'plans' : 'generate');
                }}
                className={`py-2 rounded-lg text-xs font-bold transition-all ${mode === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {m === 'Single' ? 'One Activity' : 'Mini Lesson'}
              </button>
            ))}
          </div>
        </section>

        <section>
          <button onClick={startScanner}
            className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed transition-all ${mode === 'Scanner' ? 'border-indigo-500 bg-indigo-50 text-indigo-600 shadow-sm' : 'border-slate-200 text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/50'}`}
          >
            <Camera size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">Material Scanner</span>
          </button>
          <p className="text-[11px] text-slate-400 mt-2 text-center leading-relaxed px-1">
            Point your camera at classroom items — AI builds an activity from what it sees.
          </p>
          {scannerError && (
            <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2 text-center leading-relaxed">
              {scannerError}
            </p>
          )}
        </section>

        <section>
          <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 block">Age Group</label>
          <div className="grid grid-cols-5 gap-2">
            {(['3', '4', '5', '6', '7'] as AgeGroup[]).map((a) => (
              <button key={a} onClick={() => setAge(a)}
                className={`py-2 rounded-lg text-sm font-medium transition-all ${age === a ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
              >{a}y</button>
            ))}
          </div>
        </section>

        <section>
          <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 block">Subject</label>
          <div className="space-y-2">
            {subjects.map((sub) => {
              const Icon = sub.icon;
              return (
                <button key={sub.name} onClick={() => setSubject(sub.name)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${subject === sub.name ? 'bg-white border-indigo-200 shadow-sm ring-1 ring-indigo-100' : 'bg-transparent border-transparent hover:bg-slate-50'}`}
                >
                  <div className={`p-2 rounded-lg ${sub.color}`}><Icon size={18} /></div>
                  <span className="text-sm font-medium">{sub.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 block">Difficulty Level</label>
          <div className="grid grid-cols-3 gap-2">
            {difficulties.map(d => (
              <button key={d} onClick={() => setDifficulty(d)}
                className={`py-2 rounded-lg text-xs font-bold transition-all ${difficulty === d ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
              >{d}</button>
            ))}
          </div>
        </section>

        {mode === 'Single' && (
          <section>
            <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 block">Length</label>
            <div className="grid grid-cols-2 gap-2">
              {durations.map((d) => (
                <button key={d} onClick={() => setDuration(d)}
                  className={`py-2 rounded-lg text-sm font-medium transition-all ${duration === d ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                >{d}</button>
              ))}
            </div>
          </section>
        )}

        <section>
          <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 block">Theme (Optional)</label>
          <input type="text" placeholder="e.g. Oceans, Autumn" value={theme} onChange={(e) => setTheme(e.target.value)}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </section>
      </div>

      <button onClick={handleGenerate} disabled={isLoading || mode === 'Scanner'}
        className="mt-8 w-full bg-slate-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-50"
      >
        {isLoading ? <RefreshCw className="animate-spin" /> : <Play size={20} fill="currentColor" />}
        {isLoading ? 'Creating Magic...' : mode === 'Single' ? 'Generate Activity' : 'Generate Lesson Plan'}
      </button>
    </aside>
  );

  const renderGeneratorContent = () => {
    if (mode === 'Scanner' && isScannerOpen) {
      return (
        <div className="max-w-xl mx-auto flex flex-col items-center gap-8 py-12 animate-in fade-in slide-in-from-bottom-4">
          <div className="relative w-full aspect-square rounded-[3rem] overflow-hidden border-8 border-white shadow-2xl bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <div className="absolute inset-0 pointer-events-none border-[40px] border-black/20 flex items-center justify-center">
              <div className="w-full h-full border-2 border-dashed border-white/50 rounded-3xl" />
            </div>
            <div className="absolute bottom-6 left-0 right-0 flex justify-center px-8">
              <button onClick={captureImage} className="w-20 h-20 rounded-full border-4 border-white bg-indigo-500 flex items-center justify-center text-white shadow-xl hover:scale-110 active:scale-95 transition-all">
                <Zap size={32} fill="currentColor" />
              </button>
            </div>
            <button onClick={() => { stopScanner(); setMode('Single'); }} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-all">
              <X size={24} />
            </button>
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold text-slate-800">Material Scanner</h3>
            <p className="text-slate-500 max-w-sm">Snap a photo of items in your classroom to instantly generate a custom activity!</p>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="h-10 w-48 shimmer rounded-lg" />
          <div className="aspect-video w-full shimmer rounded-3xl" />
          <div className="h-40 w-full shimmer rounded-xl" />
        </div>
      );
    }

    if (activity && mode === 'Single') {
      return (
        <div className="max-w-3xl mx-auto">
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div className="flex-1">
              <nav className="flex items-center gap-2 text-slate-400 text-sm mb-2 font-medium">
                <span>Age {activity.ageGroup}</span>
                <ChevronRight size={14} />
                <span>{activity.subject}</span>
              </nav>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <div className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-full uppercase tracking-widest flex items-center gap-1.5 shadow-sm border border-indigo-100">
                  <Target size={12} /> Skill: {activity.primarySkill}
                </div>
                <div className={`px-3 py-1 ${getDifficultyColor(activity.difficulty)} text-[10px] font-bold rounded-full uppercase tracking-widest flex items-center gap-1.5 shadow-sm border`}>
                  <BarChart size={12} /> Level: {activity.difficulty}
                </div>
                <div className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full uppercase tracking-widest flex items-center gap-1.5 shadow-sm border border-emerald-100">
                  <Clock size={12} /> Time: {activity.duration}
                </div>
              </div>
              <h2 className="text-4xl font-bold text-slate-900 leading-tight">{activity.label}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => playSpeech()} disabled={isSpeaking} className={`p-2.5 rounded-full transition-all ${isSpeaking ? 'bg-rose-50 text-rose-500 animate-pulse' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
                <Volume2 size={20} />
              </button>
              <button onClick={() => toggleFavorite()} className={`p-2.5 rounded-full transition-all ${isCurrentFavorite ? 'text-rose-500 bg-rose-50' : 'text-slate-400 hover:text-rose-400 bg-white border border-slate-100 shadow-sm'}`}>
                <Heart size={20} fill={isCurrentFavorite ? 'currentColor' : 'none'} />
              </button>
              <button onClick={handleDownload} className="p-2.5 bg-white text-slate-400 hover:text-indigo-600 rounded-full border border-slate-100 shadow-sm"><Download size={20} /></button>
              <button onClick={() => window.print()} className="p-2.5 bg-white text-slate-400 hover:text-indigo-600 rounded-full border border-slate-100 shadow-sm"><Printer size={20} /></button>
            </div>
          </header>

          {activity.imageUrl && (
            <div className="mb-12 rounded-[2rem] overflow-hidden soft-shadow bg-white p-3">
              <img src={activity.imageUrl} alt={activity.label} className="w-full aspect-video object-cover rounded-[1.5rem]" />
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-12">
            <div className="md:col-span-1 space-y-8">
              <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Materials</h3>
                <ul className="space-y-4">
                  {activity.materials.map((m, i) => (
                    <li key={i} className="flex flex-col gap-1 text-slate-600 text-sm">
                      <div className="flex items-start gap-3">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                        <span className="font-medium text-slate-800">{m.name}</span>
                      </div>
                      {isChokingHazard(m.name) && (
                        <div className="ml-7 flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg text-[10px] font-semibold text-amber-700">
                          <AlertTriangle size={10} className="shrink-0 text-amber-500" />
                          Choking hazard — supervise children under 3
                        </div>
                      )}
                      {m.householdAlternative && (
                        <div className="ml-7 p-2 bg-slate-50 rounded-lg border border-slate-100 text-[11px] italic text-slate-500 flex gap-2">
                          <Home size={12} className="shrink-0" /> <span>At Home: {m.householdAlternative}</span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
                <h3 className="text-lg font-bold text-emerald-900 mb-4 flex items-center gap-2">
                  <ShieldCheck size={18} /> Inclusive Scaffolding
                </h3>
                <div className="space-y-4">
                  {activity.modifications?.map((mod, i) => (
                    <div key={i} className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">{mod.type}</span>
                      <p className="text-xs text-emerald-800 leading-relaxed">{mod.suggestion}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100">
                <h3 className="text-lg font-bold text-indigo-900 mb-3 flex items-center gap-2"><Heart size={18} /> Reflection</h3>
                <p className="text-indigo-800 text-sm italic leading-relaxed">"{activity.reflectionQuestion}"</p>
              </section>
            </div>

            <div className="md:col-span-2">
              <section>
                <h3 className="text-lg font-bold text-slate-900 mb-6">Simple Steps</h3>
                <div className="space-y-6">
                  {activity.steps.map((step, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs shrink-0">{i + 1}</div>
                      <p className="text-slate-600 leading-relaxed pt-1.5">{step}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          {activity.resources && renderResourcesSection(activity.resources, activity.label, activity.ageGroup)}
        </div>
      );
    }

    if (lessonPlan && mode === 'LessonPlan') {
      return (
        <div className="max-w-4xl mx-auto print:max-w-full">
          <header className="mb-10 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold mb-4 border border-indigo-100">
              <Layers size={14} /> Mini Lesson Plan
            </div>
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4">
              <h2 className="text-4xl font-bold text-slate-900 leading-tight">{lessonPlan.title}</h2>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={toggleFavoritePlan} className={`p-2.5 rounded-full transition-all ${isCurrentPlanFavorite ? 'text-rose-500 bg-rose-50' : 'text-slate-400 hover:text-rose-400 bg-white border border-slate-100 shadow-sm'}`}>
                  <Heart size={20} fill={isCurrentPlanFavorite ? 'currentColor' : 'none'} />
                </button>
                <button onClick={handleDownload} className="p-2.5 bg-white text-slate-400 hover:text-indigo-600 rounded-full border border-slate-100 shadow-sm"><Download size={20} /></button>
                <button onClick={() => window.print()} className="p-2.5 bg-white text-slate-400 hover:text-indigo-600 rounded-full border border-slate-100 shadow-sm"><Printer size={20} /></button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 justify-center md:justify-start text-slate-500 mb-8">
              <span className="flex items-center gap-1.5"><Target size={16} /> {lessonPlan.primarySkill}</span>
              <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${getDifficultyColor(lessonPlan.difficulty)}`}><BarChart size={16} /> Level: {lessonPlan.difficulty}</span>
              <span className="flex items-center gap-1.5"><Clock size={16} /> ~{lessonPlan.activities.length * 15} mins total</span>
            </div>

            <div className="flex flex-col md:flex-row gap-6 p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm mb-12">
              {lessonPlan.imageUrl && (
                <img src={lessonPlan.imageUrl} className="w-full h-56 md:w-64 md:h-64 object-cover rounded-2xl shrink-0" alt={lessonPlan.title} />
              )}
              <div className="flex-1 min-w-0 space-y-4">
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <h4 className="font-bold text-slate-900 flex items-center gap-2 mb-2"><Info size={16} /> Learning Objective</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">{lessonPlan.learningObjective}</p>
                </div>
                <p className="text-slate-600 text-[15px] leading-relaxed italic">{lessonPlan.overview}</p>
              </div>
            </div>
          </header>

          <div className="space-y-16">
            {lessonPlan.activities.map((act, idx) => (
              <div key={idx} className="relative pl-8 md:pl-16 border-l-2 border-dashed border-indigo-100 group">
                <div className="absolute -left-[17px] top-0 w-8 h-8 rounded-full bg-white border-4 border-indigo-500 flex items-center justify-center text-indigo-500 font-bold text-sm shadow-sm group-hover:scale-110 transition-transform">
                  {idx + 1}
                </div>
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-50">
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900">{act.label}</h3>
                      <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 px-2 py-0.5 rounded-full inline-block border ${getDifficultyColor(act.difficulty)}`}>{act.difficulty}</p>
                      <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mt-1 ml-2 inline-block">{act.primarySkill} • {act.duration}</p>
                    </div>
                    <button onClick={() => playSpeech(act)} className="w-12 h-12 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 transition-all"><Volume2 size={24} /></button>
                  </div>

                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h4 className="font-bold text-slate-800 mb-3 text-sm uppercase tracking-wider">Instructions</h4>
                      <div className="space-y-4">
                        {act.steps.map((s, i) => (
                          <div key={i} className="flex gap-3">
                            <span className="text-xs font-bold text-slate-300 pt-0.5">{i+1}</span>
                            <p className="text-sm text-slate-600 leading-relaxed">{s}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
                        <h4 className="font-bold text-emerald-900 mb-2 text-xs uppercase tracking-widest flex items-center gap-2"><ShieldCheck size={14} /> Inclusive Scaffolding</h4>
                        <div className="space-y-2">
                          {act.modifications?.map((m, i) => (
                            <p key={i} className="text-[11px] text-emerald-800 leading-relaxed italic"><strong>{m.type}:</strong> {m.suggestion}</p>
                          ))}
                        </div>
                      </div>
                      <div className="p-5 bg-slate-50 rounded-2xl">
                        <h4 className="font-bold text-slate-800 mb-3 text-sm uppercase tracking-wider">Materials Needed</h4>
                        <div className="flex flex-wrap gap-2">
                          {act.materials.map((m, i) => (
                            <div key={i} className="flex flex-col gap-0.5 items-start">
                              <span className={`px-3 py-1 rounded-lg text-[11px] font-medium shadow-sm ${isChokingHazard(m.name) ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-white border border-slate-200 text-slate-600'}`}>
                                {m.name}
                              </span>
                              {isChokingHazard(m.name) && (
                                <span className="flex items-center gap-0.5 text-[9px] text-amber-600 font-semibold px-1">
                                  <AlertTriangle size={8} className="shrink-0" />
                                  Choking hazard · under 3
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="p-5 bg-rose-50 rounded-2xl border border-rose-100">
                        <h4 className="font-bold text-rose-900 mb-2 text-sm flex items-center gap-2"><Heart size={14} /> Reflection</h4>
                        <p className="text-sm text-rose-800 italic leading-relaxed">"{act.reflectionQuestion}"</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {lessonPlan.resources && renderResourcesSection(lessonPlan.resources, lessonPlan.title)}
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 py-20">
        <Sparkles size={48} className="mb-4 opacity-20 animate-pulse" />
        <p className="text-lg">Set your preferences and click generate</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fcfaf7]">
      <div className={`flex-1 overflow-y-auto ${isScannerOpen ? '' : 'pb-20'}`}>

        {/* HOME SCREEN */}
        {activeScreen === 'home' && (
          <div className="px-5 pt-10 pb-8 max-w-2xl mx-auto">
            <div className="mb-8">
              <p className="text-slate-400 text-sm font-medium">Good to see you,</p>
              <h1 className="text-2xl font-extrabold text-slate-900">Welcome, Educator! 👋🏾</h1>
            </div>

            <div className="flex flex-col items-center mb-10 py-7 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <BloomLogo size={72} />
              <div className="mt-3 text-center">
                <h2 className="text-2xl font-extrabold">
                  <span className="text-slate-900">Kindred </span>
                  <span className="text-indigo-600">Blooms</span>
                </h2>
                <p className="text-slate-400 text-xs mt-1 max-w-xs">Rooted in joy. Built for every blooming child.</p>
              </div>
            </div>

            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">What would you like to do?</p>
            <div className="space-y-4">
              {/* Activity Generator — indigo */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-indigo-500 to-indigo-400" />
                <div className="p-5 flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                    <Sparkles size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-extrabold text-slate-900">Activity Generator</h3>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1 mb-3">
                      Instantly create inclusive, culturally affirming activities for ages 3–7.
                    </p>
                    <button onClick={() => navigateTo('generate')}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 active:scale-95 transition-all"
                    >
                      Generate Now <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Lesson Plans — violet */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-violet-500 to-purple-400" />
                <div className="p-5 flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-violet-100 flex items-center justify-center text-violet-600 shrink-0">
                    <Layers size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-extrabold text-slate-900">Lesson Plans</h3>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1 mb-3">
                      Build full multi-step lesson plans with learning objectives and inclusive scaffolding.
                    </p>
                    <button onClick={() => navigateTo('plans')}
                      className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-xs font-bold hover:bg-violet-700 active:scale-95 transition-all"
                    >
                      Build a Plan <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Resources & Support — emerald */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
                <div className="p-5 flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                    <BookMarked size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-extrabold text-slate-900">Resources &amp; Support</h3>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1 mb-3">
                      Curated videos, web resources, and printables — surfaced inside every generated activity.
                    </p>
                    <button onClick={() => navigateTo('resources')}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 active:scale-95 transition-all"
                    >
                      Explore Resources <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* GENERATE / PLANS SCREENS */}
        {(activeScreen === 'generate' || activeScreen === 'plans') && (
          <div className="flex flex-col md:flex-row text-slate-800 min-h-[calc(100vh-5rem)]">
            {renderSidebar()}
            <main className="flex-1 p-6 md:p-12 overflow-y-auto bg-[#fcfaf7]">
              {renderGeneratorContent()}
            </main>
          </div>
        )}

        {/* LIBRARY SCREEN */}
        {activeScreen === 'library' && (
          <div className="px-5 pt-10 pb-8 max-w-2xl mx-auto">
            <div className="mb-8">
              <h1 className="text-2xl font-extrabold text-slate-900">Library</h1>
              <p className="text-slate-400 text-sm mt-1">Your saved activities and lesson plans</p>
            </div>

            {favorites.length === 0 && favoriteLessonPlans.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center mb-4">
                  <Bookmark size={32} className="text-slate-300" />
                </div>
                <p className="font-bold text-slate-400">Nothing saved yet</p>
                <p className="text-slate-300 text-sm mt-1">Tap the heart on any activity or lesson plan to save it here</p>
                <button onClick={() => navigateTo('generate')}
                  className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all"
                >
                  <Sparkles size={16} /> Generate an Activity
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                {favorites.length > 0 && (
                  <section>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Activities</p>
                    <div className="space-y-3">
                      {favorites.map((fav, i) => (
                        <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
                          {fav.imageUrl ? (
                            <img src={fav.imageUrl} alt={fav.label} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                          ) : (
                            <div className="w-16 h-16 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                              <Bookmark size={20} className="text-indigo-400" fill="currentColor" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-slate-900 text-sm truncate">{fav.label}</h3>
                            <p className="text-xs text-slate-400 mt-0.5">{fav.subject} · Age {fav.ageGroup} · {fav.difficulty}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => { setActivity(fav); setLessonPlan(null); setMode('Single'); setActiveScreen('generate'); }}
                              className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all"
                            >
                              View
                            </button>
                            <button onClick={() => toggleFavorite(fav)} className="w-8 h-8 flex items-center justify-center rounded-full text-rose-400 hover:bg-rose-50 transition-all">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {favoriteLessonPlans.length > 0 && (
                  <section>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Lesson Plans</p>
                    <div className="space-y-3">
                      {favoriteLessonPlans.map((plan, i) => (
                        <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
                          {plan.imageUrl ? (
                            <img src={plan.imageUrl} alt={plan.title} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                          ) : (
                            <div className="w-16 h-16 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                              <Layers size={20} className="text-violet-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-slate-900 text-sm truncate">{plan.title}</h3>
                            <p className="text-xs text-slate-400 mt-0.5">{plan.primarySkill} · Level {plan.difficulty} · {plan.activities.length} activities</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => { setLessonPlan(plan); setActivity(null); setMode('LessonPlan'); setActiveScreen('plans'); }}
                              className="px-3 py-1.5 bg-violet-50 text-violet-600 rounded-lg text-xs font-bold hover:bg-violet-100 transition-all"
                            >
                              View
                            </button>
                            <button
                              onClick={() => setFavoriteLessonPlans(favoriteLessonPlans.filter(p => p.title !== plan.title))}
                              className="w-8 h-8 flex items-center justify-center rounded-full text-rose-400 hover:bg-rose-50 transition-all"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}

        {/* PROFILE SCREEN */}
        {activeScreen === 'profile' && (
          <div className="px-5 pt-10 pb-8 max-w-2xl mx-auto">
            <div className="mb-8">
              <h1 className="text-2xl font-extrabold text-slate-900">Profile</h1>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mb-5">
              <div className="h-2 w-full bg-gradient-to-r from-indigo-400 via-rose-300 to-emerald-400" />
              <div className="p-8 flex flex-col items-center text-center">
                <BloomLogo size={80} />
                <h2 className="mt-4 text-2xl font-extrabold text-slate-900">Kindred Blooms</h2>
                <p className="text-indigo-500 font-semibold text-sm mt-1">Rooted in joy. Built for every blooming child.</p>
                <span className="mt-3 px-3 py-1 bg-slate-100 text-slate-400 text-xs rounded-full font-medium">Version 1.0.0</span>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 mb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Creator</p>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-indigo-100 border-2 border-indigo-200 flex items-center justify-center text-indigo-500 shrink-0">
                  <BookOpen size={24} />
                </div>
                <div>
                  <p className="font-extrabold text-slate-900">Chasity Williams</p>
                  <p className="text-xs text-slate-400 mt-0.5">Educator &amp; Creator · 10+ Years PreK–1st Grade</p>
                  <a href="mailto:chassy0816@gmail.com" className="inline-flex items-center gap-1 text-xs text-indigo-500 mt-2 hover:underline">
                    <Mail size={12} /> chassy0816@gmail.com
                  </a>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">About</p>
              <p className="text-sm text-slate-600 leading-relaxed mb-5">
                An AI-powered activity toolkit for ages 3–7 — calm, inclusive, and centering Black and Brown children by design.
              </p>
              <div className="space-y-3 text-sm border-t border-slate-50 pt-4">
                {[
                  ['Version', '1.0.0'],
                  ['Target Ages', '3–7 years'],
                  ['Made with', 'Love for the classroom'],
                  [`© ${new Date().getFullYear()}`, 'Chasity Williams'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-slate-400">{k}</span>
                    <span className="font-medium text-slate-700">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* RESOURCES SCREEN */}
        {activeScreen === 'resources' && (
          <div className="px-5 pt-10 pb-8 max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-8">
              <button onClick={() => setActiveScreen('home')} className="w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                <ChevronLeft size={20} />
              </button>
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900">Resources &amp; Support</h1>
                <p className="text-slate-400 text-sm">Curated tools for every educator</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 overflow-hidden">
                <div className="h-1 -mx-5 -mt-5 mb-5 bg-gradient-to-r from-emerald-500 to-teal-400" />
                <h3 className="font-extrabold text-slate-900 mb-1">How Resources Work</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Every activity and lesson plan generated by Kindred Blooms includes a curated Resources &amp; Support section — YouTube video searches, web resources, printable links, and professional contacts — tailored to the specific topic and age group.
                </p>
              </div>

              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                <h3 className="font-extrabold text-slate-900 mb-4 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600"><Youtube size={16} /></div>
                  YouTube Video Search
                </h3>
                <p className="text-sm text-slate-500 mb-4 leading-relaxed">Each activity surfaces relevant YouTube search queries so you can quickly find age-appropriate videos to supplement your lesson.</p>
                <a href="https://www.youtube.com/results?search_query=early+childhood+education+activities" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold rounded-xl transition-colors"
                >
                  <Youtube size={16} /> Browse Early Childhood Videos
                </a>
              </div>

              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                <h3 className="font-extrabold text-slate-900 mb-4 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600"><Printer size={16} /></div>
                  Printables &amp; Worksheets
                </h3>
                <div className="space-y-3">
                  <a href="https://www.teacherspayteachers.com/store/the-colorful-minds-hub" target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-xl transition-colors"
                  >
                    <Search size={16} /> Colorful Minds Hub on TPT
                  </a>
                  <a href="https://www.pinterest.com/search/pins/?q=early+childhood+education+printable+activity" target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-bold rounded-xl border border-emerald-200 transition-colors"
                  >
                    <Globe size={16} /> Search Pinterest Printables
                  </a>
                </div>
              </div>

              <div className="bg-indigo-50 rounded-3xl border border-indigo-100 p-5">
                <p className="text-sm text-indigo-700 leading-relaxed italic text-center">
                  Generate any activity or lesson plan to see AI-curated resources personalized to your topic, subject, and age group.
                </p>
                <button onClick={() => navigateTo('generate')}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all"
                >
                  <Sparkles size={16} /> Generate an Activity
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM NAVIGATION */}
      {!isScannerOpen && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-100 flex items-center justify-around px-4 h-20 shadow-2xl z-40">
          <button onClick={() => setActiveScreen('home')}
            className="flex flex-col items-center gap-1 min-w-[3.5rem] py-2"
          >
            <Home size={22} className={activeTab === 'home' ? 'text-indigo-600' : 'text-slate-300'} />
            <span className={`text-[10px] font-semibold ${activeTab === 'home' ? 'text-indigo-600' : 'text-slate-300'}`}>Home</span>
          </button>

          <button onClick={() => navigateTo('plans')}
            className="flex flex-col items-center gap-1 min-w-[3.5rem] py-2"
          >
            <Layers size={22} className={activeTab === 'plans' ? 'text-indigo-600' : 'text-slate-300'} />
            <span className={`text-[10px] font-semibold ${activeTab === 'plans' ? 'text-indigo-600' : 'text-slate-300'}`}>Plans</span>
          </button>

          {/* Floating Create Button */}
          <div className="relative flex items-center justify-center" style={{ marginTop: '-1.5rem' }}>
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all"
            >
              <Plus size={28} strokeWidth={2.5} />
            </button>
          </div>

          <button onClick={() => setActiveScreen('library')}
            className="flex flex-col items-center gap-1 min-w-[3.5rem] py-2"
          >
            <BookMarked size={22} className={activeTab === 'library' ? 'text-indigo-600' : 'text-slate-300'} />
            <span className={`text-[10px] font-semibold ${activeTab === 'library' ? 'text-indigo-600' : 'text-slate-300'}`}>Library</span>
          </button>

          <button onClick={() => setActiveScreen('profile')}
            className="flex flex-col items-center gap-1 min-w-[3.5rem] py-2"
          >
            <User size={22} className={activeTab === 'profile' ? 'text-indigo-600' : 'text-slate-300'} />
            <span className={`text-[10px] font-semibold ${activeTab === 'profile' ? 'text-indigo-600' : 'text-slate-300'}`}>Profile</span>
          </button>
        </nav>
      )}

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end" onClick={() => setShowCreateModal(false)}>
          <div className="w-full bg-white rounded-t-[2rem] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-6" />
            <h2 className="text-xl font-extrabold text-slate-900 mb-5">Quick Create</h2>
            <div className="space-y-3">
              <button
                onClick={() => { navigateTo('generate'); setShowCreateModal(false); }}
                className="w-full flex items-center gap-4 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 hover:bg-indigo-100 active:scale-[0.99] transition-all"
              >
                <div className="w-11 h-11 bg-indigo-600 rounded-xl flex items-center justify-center text-white shrink-0"><Sparkles size={20} /></div>
                <div className="text-left flex-1">
                  <p className="font-bold text-slate-900">Generate Activity</p>
                  <p className="text-xs text-slate-500 mt-0.5">Create a single ready-to-run activity</p>
                </div>
                <ChevronRight size={18} className="text-slate-300 shrink-0" />
              </button>

              <button
                onClick={() => { navigateTo('plans'); setShowCreateModal(false); }}
                className="w-full flex items-center gap-4 p-4 bg-violet-50 rounded-2xl border border-violet-100 hover:bg-violet-100 active:scale-[0.99] transition-all"
              >
                <div className="w-11 h-11 bg-violet-600 rounded-xl flex items-center justify-center text-white shrink-0"><Layers size={20} /></div>
                <div className="text-left flex-1">
                  <p className="font-bold text-slate-900">Build Lesson Plan</p>
                  <p className="text-xs text-slate-500 mt-0.5">Generate a multi-step lesson with objectives</p>
                </div>
                <ChevronRight size={18} className="text-slate-300 shrink-0" />
              </button>

              <button
                onClick={() => { setShowCreateModal(false); startScanner(); }}
                className="w-full flex items-center gap-4 p-4 bg-amber-50 rounded-2xl border border-amber-100 hover:bg-amber-100 active:scale-[0.99] transition-all"
              >
                <div className="w-11 h-11 bg-amber-500 rounded-xl flex items-center justify-center text-white shrink-0"><Camera size={20} /></div>
                <div className="text-left flex-1">
                  <p className="font-bold text-slate-900">Scan Materials</p>
                  <p className="text-xs text-slate-500 mt-0.5">Point camera at classroom items to build an activity</p>
                </div>
                <ChevronRight size={18} className="text-slate-300 shrink-0" />
              </button>
            </div>
            <button onClick={() => setShowCreateModal(false)} className="mt-5 w-full py-3 text-slate-400 font-medium text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* HELP MODAL */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowHelpModal(false)}>
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="h-2 w-full bg-gradient-to-r from-indigo-400 via-rose-300 to-emerald-400" />
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-extrabold text-slate-900">How to Use Kindred Blooms</h2>
                <button onClick={() => setShowHelpModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 transition-all">
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-5">
                <div className="flex gap-4 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                  <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center text-white shrink-0"><Play size={18} fill="currentColor" /></div>
                  <div>
                    <h3 className="font-bold text-slate-900 mb-1">One Activity Mode</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">Generates a single, ready-to-run activity. Pick an age group, subject, difficulty, and optional theme — then hit <strong>Generate Activity</strong>.</p>
                  </div>
                </div>
                <div className="flex gap-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shrink-0"><Layers size={18} /></div>
                  <div>
                    <h3 className="font-bold text-slate-900 mb-1">Mini Lesson Mode</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">Generates a full multi-step lesson plan with 3–4 connected activities, a learning objective, and inclusive scaffolding for each step.</p>
                  </div>
                </div>
                <div className="flex gap-4 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-white shrink-0"><Camera size={18} /></div>
                  <div>
                    <h3 className="font-bold text-slate-900 mb-1">Material Scanner</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">Point your camera at items in your classroom and tap the flash button. The AI analyzes what it sees and builds a custom activity around those exact materials.</p>
                  </div>
                </div>
              </div>
              <div className="mt-6 p-4 bg-slate-50 rounded-2xl">
                <h4 className="font-bold text-slate-700 mb-2 text-sm">Tips for best results</h4>
                <ul className="space-y-1.5 text-sm text-slate-500">
                  <li className="flex gap-2"><span className="text-indigo-400 font-bold">•</span> Add a theme (e.g. "Oceans" or "Autumn") to make activities feel cohesive.</li>
                  <li className="flex gap-2"><span className="text-indigo-400 font-bold">•</span> Use the heart icon to save activities — they'll appear in your Library.</li>
                  <li className="flex gap-2"><span className="text-indigo-400 font-bold">•</span> Every activity includes household alternatives for materials.</li>
                  <li className="flex gap-2"><span className="text-indigo-400 font-bold">•</span> Tap the speaker icon to have any activity read aloud during circle time.</li>
                </ul>
              </div>
              <button onClick={() => setShowHelpModal(false)} className="mt-6 w-full bg-slate-900 text-white py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all">
                Got it, let's go!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
