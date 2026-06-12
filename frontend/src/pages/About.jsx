import { Link } from 'react-router-dom';
import {
  Sparkles, BookOpen, Globe, Video, CheckCircle2, Layers, Users, Lock,
} from 'lucide-react';

const features = [
  {
    icon: Sparkles,
    title: 'AI Learning Studio',
    desc: 'Enter any topic — from "segment trees" to "Learn C" — and EduAI builds structured lessons with slides, narration, and quizzes.',
  },
  {
    icon: Layers,
    title: 'Smart course sizes',
    desc: 'Quick lessons for narrow topics. Deep dives for one module. Full courses with a curriculum plan — you generate each video when ready.',
  },
  {
    icon: Video,
    title: 'Interactive videos',
    desc: 'Videos pause at checkpoints for quiz questions. You must engage before continuing — real learning, not passive watching.',
  },
  {
    icon: Globe,
    title: 'Share & discover',
    desc: 'Mark courses public so others can use, fork, or preview them. Search finds existing courses before generating duplicates.',
  },
  {
    icon: CheckCircle2,
    title: 'Two kinds of progress',
    desc: 'Generated = AI created the video. Watched = you finished the lesson. Both are tracked separately on your profile.',
  },
  {
    icon: Users,
    title: 'Background generation',
    desc: 'Video jobs run on the server. Switch tabs freely — a banner shows live progress until each lesson is ready.',
  },
];

const steps = [
  'Go to Studio, enter a topic, pick voice & scope',
  'For courses: review the plan, then generate lessons one by one',
  'Watch in My Courses — playlist on the left, video on the right',
  'Complete checkpoints; your watched progress updates automatically',
];

export default function About() {
  return (
    <div className="py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-10">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-100 text-indigo-700 text-sm font-medium mb-4">
            <BookOpen className="h-4 w-4" /> About EduAI
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Your AI-powered learning platform
          </h1>
          <p className="mt-4 text-lg text-slate-500">
            EduAI turns topics into interactive video courses — with quizzes, progress tracking, and community sharing.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white rounded-2xl border border-slate-100 p-5">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h2 className="font-bold text-slate-900 mb-4">How to get started</h2>
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-600">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        <div className="bg-slate-900 text-white rounded-2xl p-6 flex items-start gap-4">
          <Lock className="h-6 w-6 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold">Privacy first</h3>
            <p className="text-sm text-slate-300 mt-1">
              Courses are private by default. Only courses you explicitly mark public appear in Explore and search for others.
            </p>
          </div>
        </div>

        <div className="text-center">
          <Link to="/" className="btn-primary inline-flex">Go to Studio</Link>
        </div>
      </div>
    </div>
  );
}
