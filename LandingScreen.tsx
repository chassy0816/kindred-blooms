
import React from 'react';
import { Heart, Mail, BookOpen, Star } from 'lucide-react';

interface LandingScreenProps {
  onStart: () => void;
}

const LandingScreen: React.FC<LandingScreenProps> = ({ onStart }) => {
  return (
    <div className="min-h-screen bg-[#fcfaf7] flex flex-col">

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8 text-center">
        <div className="mb-6 animate-pulse-slow">
          <svg width="96" height="96" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
            {[0,1,2,3,4,5,6,7,8].map((i) => (
              <ellipse
                key={i}
                cx="22"
                cy="13"
                rx="4"
                ry="8"
                fill={(['#6366f1','#818cf8','#a78bfa'] as const)[i % 3]}
                opacity="0.88"
                transform={`rotate(${i * 40}, 22, 22)`}
              />
            ))}
            <circle cx="22" cy="22" r="6" fill="#f59e0b" />
            <circle cx="22" cy="22" r="3.5" fill="#fde68a" />
          </svg>
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 tracking-tight leading-none mb-4">
          Kindred Blooms
        </h1>

        <p className="text-xl md:text-2xl text-indigo-500 font-semibold mb-3 tracking-wide">
          Rooted in joy. Built for every blooming child.
        </p>

        <p className="text-base md:text-lg text-slate-500 max-w-xl leading-relaxed mb-10">
          An AI-powered activity toolkit for ages 3-7 — calm, inclusive, and
          centering Black and Brown children by design.
        </p>

        <button
          onClick={onStart}
          className="bg-slate-900 text-white px-10 py-4 rounded-2xl text-lg font-bold flex items-center gap-3 hover:bg-slate-800 active:scale-95 transition-all soft-shadow group"
        >
          <Star size={20} className="group-hover:rotate-12 transition-transform" fill="currentColor" />
          Get Started
        </button>
      </div>

      {/* Divider bloom accent */}
      <div className="flex items-center justify-center gap-3 py-4 text-slate-200 select-none" aria-hidden>
        <span className="h-px w-24 bg-slate-200 rounded" />
        <svg width="16" height="16" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
            {[0,1,2,3,4,5,6,7,8].map((i) => (
              <ellipse key={i} cx="22" cy="13" rx="4" ry="8" fill="#c7d2fe" opacity="0.7" transform={`rotate(${i * 40}, 22, 22)`} />
            ))}
            <circle cx="22" cy="22" r="6" fill="#fde68a" />
            <circle cx="22" cy="22" r="3.5" fill="#fef3c7" />
          </svg>
        <span className="h-px w-24 bg-slate-200 rounded" />
      </div>

      {/* About section */}
      <section className="max-w-3xl mx-auto w-full px-6 pb-10">
        <div className="bg-white rounded-[2.5rem] border border-slate-100 soft-shadow overflow-hidden">

          {/* Color band */}
          <div className="h-2 w-full bg-gradient-to-r from-indigo-400 via-rose-300 to-emerald-400" />

          <div className="p-8 md:p-10 flex flex-col md:flex-row gap-8 items-start">

            {/* Avatar */}
            <div className="shrink-0 flex flex-col items-center gap-3">
              <div className="w-24 h-24 rounded-full bg-indigo-100 border-4 border-indigo-200 flex items-center justify-center text-indigo-400 soft-shadow">
                <BookOpen size={36} />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-slate-800">Chasity Williams</p>
                <p className="text-[11px] text-slate-500 font-medium uppercase tracking-widest">Educator & Creator</p>
              </div>
            </div>

            {/* Bio */}
            <div className="flex-1 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-100">
                <Heart size={12} fill="currentColor" /> 10+ Years in PreK–1st Grade
              </div>

              <h2 className="text-2xl font-extrabold text-slate-900">
                Why I Built This
              </h2>

              <p className="text-slate-600 text-[15px] leading-relaxed">
                After more than a decade in early childhood classrooms, I knew two things for certain:
                our youngest learners are <em>brilliant</em>, and the planning burden on educators is
                real. I built Kindred Blooms so that creating joyful, inclusive, culturally affirming
                activities could take minutes — not hours.
              </p>

              <p className="text-slate-600 text-[15px] leading-relaxed">
                Every activity this toolkit generates centers Black and Brown children — not as an
                afterthought, but as the foundation. Because representation, calm pedagogy, and
                scaffolded inclusion shouldn't be extras. They should be the default.
              </p>

              <p className="text-slate-600 text-[15px] leading-relaxed">
                This is for every educator who has ever stayed up late planning — and for every child
                who deserves to see themselves in the learning.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center pb-10 px-6">
        <a
          href="mailto:chassy0816@gmail.com"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-indigo-500 transition-colors font-medium"
        >
          <Mail size={15} />
          chassy0816@gmail.com
        </a>
        <p className="text-xs text-slate-300 mt-3 font-medium tracking-wide">
          Made with love for the classroom. &copy; {new Date().getFullYear()} Chasity Williams.
        </p>
      </footer>

    </div>
  );
};

export default LandingScreen;
