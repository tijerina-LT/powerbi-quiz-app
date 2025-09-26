import React, { useEffect, useMemo, useRef, useState } from "react";

/** ---------------------------------------------
 * Types & Schema
 * ----------------------------------------------*/
type LayoutMode = "centered" | "two-column";
type TestType = "Practice" | "Timed" | "Mock Exam";

type Choice = { id: string; text: string; isCorrect?: boolean };
type MatrixRow = { id: string; label: string };
type MatrixCol = { id: string; label: string };

type QuestionCommon = {
  id: string;
  type: "single" | "multi" | "match" | "order" | "matrix" | "case";
  prompt: string;
  exhibits?: { title?: string; content: string }[];
  tags?: string[];
  difficulty?: "easy" | "medium" | "hard";
  scoring?: { mode?: "all_or_nothing" | "partial"; points?: number };
  explanation?: string;
};

type SingleMulti = QuestionCommon & { choices: Choice[] };
type MatchQ = QuestionCommon & { choices: Choice[]; pairs: Record<string, string> }; // choice.id -> rightId
type OrderQ = QuestionCommon & { choices: Choice[]; order: string[] };
type MatrixQ = QuestionCommon & { matrix: { rows: MatrixRow[]; cols: MatrixCol[]; correct: Record<string,string> } };
type CasePart = Omit<Question, "type" | "case"> & { type: "single" | "multi" | "match" | "order" | "matrix" | "case" };
type CaseQ = QuestionCommon & { parts: CasePart[] };

type Question = SingleMulti | MatchQ | OrderQ | MatrixQ | CaseQ;

type AppConfig = {
  layout: LayoutMode;
  showLeftQuestionList: boolean;
  stickyTopBar: boolean;
  keyboardShortcuts: boolean;
  showScoreCard: boolean;
  enableMenu: boolean;
  enableReviewDrawer: boolean;
  enableExplanation: boolean;
  enableCategoryScoring: boolean;
  enablePerQuestionTimer: boolean;
  enableShuffleQuestions: boolean;
  enableShuffleChoices: boolean;
  enablePersistence: boolean;
  perQuestionTimerSecDefault: number | null;
  defaultTestType: TestType;
  defaultNumQuestions: number;
  defaultDifficulty: "any" | "easy" | "medium" | "hard";
};

const DEFAULT_CONFIG: AppConfig = {
  layout: "two-column",
  showLeftQuestionList: true,
  stickyTopBar: true,
  keyboardShortcuts: true,
  showScoreCard: true,
  enableMenu: true,
  enableReviewDrawer: true,
  enableExplanation: true,
  enableCategoryScoring: true,
  enablePerQuestionTimer: false,
  enableShuffleQuestions: true,
  enableShuffleChoices: true,
  enablePersistence: true,
  perQuestionTimerSecDefault: null,
  defaultTestType: "Practice",
  defaultNumQuestions: 20,
  defaultDifficulty: "any",
};

type Settings = {
  testType: TestType;
  numQuestions: number;
  difficulty: "any" | "easy" | "medium" | "hard";
  perQuestionTimerSec: number | null;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
};

type SessionAnswer = {
  questionId: string;
  // for single/multi: array of selected choice ids
  selected?: string[];
  // for match: map of left choice id -> selected right id
  selectedPairs?: Record<string, string>;
  // for order: array of choice ids in chosen order
  selectedOrder?: string[];
  // for matrix: rowId -> colId
  selectedMatrix?: Record<string,string>;
  // for case: partId -> sub-SessionAnswer (flattened for scoring)
  parts?: Record<string, SessionAnswer>;
  isCorrect: boolean | null;
  score: number;
  timeSpentSec: number;
  markedForReview?: boolean;
};

type PersistedSession = {
  questionOrder: string[];
  answers: Record<string, SessionAnswer>;
  currentIdx: number;
  startedAt: number;
  finished?: boolean;
};

declare global { interface Window { __QUESTIONS__?: Question[] } }

const NS = "cts.v4";
const SETTINGS_KEY = `${NS}.settings`;
const SESSION_KEY  = `${NS}.session`;
const THEME_KEY    = `${NS}.theme`;
const FONTSIZE_KEY = `${NS}.fontsize`;

function shuffleArray<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function save<T>(k: string, v: T) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function load<T>(k: string): T | null { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) as T : null; } catch { return null; } }
function clear(k: string) { try { localStorage.removeItem(k); } catch {} }

// Sample fallback
const sampleQuestions: Question[] = (window.__QUESTIONS__?.length ? window.__QUESTIONS__! : [
  {
    id: "q1", type: "single",
    prompt: "Which feature enables dynamic fields via a slicer in Power BI?",
    choices: [
      { id: "a", text: "Bookmarks" },
      { id: "b", text: "Field Parameters", isCorrect: true },
      { id: "c", text: "Drillthrough" },
      { id: "d", text: "Tooltips" },
    ],
    explanation: "Field Parameters let users swap dimensions/measures with a slicer.", difficulty: "easy", tags: ["PL-300","Modeling"]
  },
  {
    id: "q2", type: "multi",
    prompt: "Select all DAX iterator functions.",
    choices: [
      { id: "a", text: "SUMX", isCorrect: true },
      { id: "b", text: "AVERAGEX", isCorrect: true },
      { id: "c", text: "MAX" },
      { id: "d", text: "COUNTROWS" },
    ],
    explanation: "X-functions iterate a row context over a table.", difficulty: "medium", tags: ["DAX"]
  }
]);

/** ---------------------------------------------
 * Scoring helpers
 * ----------------------------------------------*/
function scoreQuestion(q: Question, ans: SessionAnswer): { correct: boolean, points: number } {
  const points = q.scoring?.points ?? 1;
  const mode = q.scoring?.mode ?? "all_or_nothing";

  switch (q.type) {
    case "single": {
      const sm = q as SingleMulti;
      const correctId = sm.choices.find(c => c.isCorrect)?.id;
      const ok = !!ans.selected && ans.selected.length === 1 && ans.selected[0] === correctId;
      return { correct: ok, points: ok ? points : 0 };
    }
    case "multi": {
      const mm = q as SingleMulti;
      const correctIds = new Set(mm.choices.filter(c => c.isCorrect).map(c => c.id));
      const sel = new Set(ans.selected ?? []);
      const allCorrect = sel.size === correctIds.size && [...correctIds].every(id => sel.has(id));
      if (mode === "all_or_nothing") return { correct: allCorrect, points: allCorrect ? points : 0 };
      // partial: +1 per correct selection, -1 per incorrect (min 0), cap at points
      let score = 0;
      for (const id of sel) score += correctIds.has(id) ? 1 : -1;
      score = Math.max(0, Math.min(points, score));
      return { correct: allCorrect, points: score };
    }
    case "match": {
      const mq = q as MatchQ;
      const sel = ans.selectedPairs || {};
      const keys = Object.keys(mq.pairs || {});
      const allCorrect = keys.every(k => mq.pairs[k] === sel[k]);
      return { correct: allCorrect, points: allCorrect ? points : 0 };
    }
    case "order": {
      const oq = q as OrderQ;
      const sel = ans.selectedOrder || [];
      const allCorrect = oq.order.join("|") === sel.join("|");
      return { correct: allCorrect, points: allCorrect ? points : 0 };
    }
    case "matrix": {
      const mx = (q as MatrixQ).matrix;
      const sel = ans.selectedMatrix || {};
      const rows = mx.rows?.map(r => r.id) || [];
      const allCorrect = rows.every(rid => mx.correct[rid] === sel[rid]);
      return { correct: allCorrect, points: allCorrect ? points : 0 };
    }
    case "case": {
      const cq = q as CaseQ;
      let total = 0, gained = 0;
      for (const part of cq.parts || []) {
        const pAns = ans.parts?.[part.id];
        const res = pAns ? scoreQuestion(part as Question, pAns) : { correct: false, points: 0 };
        total += (part.scoring?.points ?? 1);
        gained += res.points;
      }
      const ok = gained >= total && total > 0;
      const cap = q.scoring?.points ?? total;
      return { correct: ok, points: Math.min(cap, gained) };
    }
  }
}

export default function App() {
  // Config
  const [config] = useState<AppConfig>(DEFAULT_CONFIG);

  // Theme & font size
  const [dark, setDark] = useState<boolean>(() => load<boolean>(THEME_KEY) ?? true);
  const [fontScale, setFontScale] = useState<number>(() => load<number>(FONTSIZE_KEY) ?? 1.0);
  useEffect(() => { save(THEME_KEY, dark); }, [dark]);
  useEffect(() => { save(FONTSIZE_KEY, fontScale); }, [fontScale]);

  // Settings
  const defaultSettings: Settings = {
    testType: config.defaultTestType,
    numQuestions: config.defaultNumQuestions,
    difficulty: config.defaultDifficulty,
    perQuestionTimerSec: config.enablePerQuestionTimer ? (config.perQuestionTimerSecDefault ?? null) : null,
    shuffleQuestions: config.enableShuffleQuestions,
    shuffleChoices: config.enableShuffleChoices,
  };
  const [settings, setSettings] = useState<Settings>(() => (config.enablePersistence ? (load<Settings>(SETTINGS_KEY) ?? defaultSettings) : defaultSettings));
  useEffect(() => { if (config.enablePersistence) save(SETTINGS_KEY, settings); }, [settings, config.enablePersistence]);

  // Import JSON runtime
  const [runtimeQuestions, setRuntimeQuestions] = useState<Question[] | null>(null);
  function handleImportJSON(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = JSON.parse(reader.result as string) as Question[];
        if (!Array.isArray(arr)) throw new Error("JSON must be an array of questions");
        setRuntimeQuestions(arr);
        startNewSession(arr);
      } catch (e) {
        alert("Failed to parse JSON: " + (e as Error).message);
      }
    };
    reader.readAsText(file);
  }

  const rawQuestions: Question[] = runtimeQuestions ?? sampleQuestions;
  const filtered = useMemo(() => {
    if (settings.difficulty === "any") return rawQuestions;
    return rawQuestions.filter(q => q.difficulty === settings.difficulty);
  }, [rawQuestions, settings.difficulty]);

  // Session
  const [session, setSession] = useState<PersistedSession>(() => {
    if (config.enablePersistence) {
      const prev = load<PersistedSession>(SESSION_KEY);
      if (prev) return prev;
    }
    return buildInitialSession(filtered, settings);
  });
  useEffect(() => { if (config.enablePersistence) save(SESSION_KEY, session); }, [session, config.enablePersistence]);

  function buildInitialSession(pool: Question[], s: Settings): PersistedSession {
    const base = s.shuffleQuestions ? shuffleArray(pool) : pool.slice();
    const order = base.slice(0, s.numQuestions).map(q => q.id);
    return { questionOrder: order, answers: {}, currentIdx: 0, startedAt: Date.now(), finished: false };
  }
  function startNewSession(pool?: Question[]) {
    const p = pool ?? filtered;
    const fresh = buildInitialSession(p, settings);
    if (config.enablePersistence) clear(SESSION_KEY);
    setSession(fresh);
  }

  const qMap: Record<string, Question> = useMemo(() => {
    const m: Record<string, Question> = {}; for (const q of filtered) m[q.id] = q; return m;
  }, [filtered]);

  const currentId = session.questionOrder[session.currentIdx];
  const current = qMap[currentId];

  // Per-question timer (optional)
  const [secLeft, setSecLeft] = useState<number | null>(settings.perQuestionTimerSec);
  const tickRef = useRef<number | null>(null);
  useEffect(() => {
    if (!config.enablePerQuestionTimer || settings.perQuestionTimerSec == null || session.finished) {
      setSecLeft(null); if (tickRef.current) window.clearInterval(tickRef.current); tickRef.current = null; return;
    }
    setSecLeft(settings.perQuestionTimerSec);
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      setSecLeft(prev => {
        if (prev == null) return prev;
        if (prev <= 1) { handleCommitAnswer(); goNext(); return settings.perQuestionTimerSec; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [currentId, settings.perQuestionTimerSec, config.enablePerQuestionTimer, session.finished]);

  // Time spent per question
  const questionStartRef = useRef<number>(Date.now());
  useEffect(() => { questionStartRef.current = Date.now(); }, [currentId]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!config.keyboardShortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "n") goNext();
      if (k === "p") goPrev();
      if (/^[1-9]$/.test(k) && current && (current.type === "single" || current.type==="multi")) {
        const idx = parseInt(k, 10) - 1;
        const sm = current as SingleMulti;
        const cid = sm.choices[idx]?.id;
        if (cid) toggleSelect(cid);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentId, current]);

  // UI State
  const [menuOpen, setMenuOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Local selection state (per question)
  const [localSel, setLocalSel] = useState<SessionAnswer>(() => ({
    questionId: currentId, selected: [], selectedPairs: {}, selectedOrder: [], selectedMatrix: {}, parts: {}, isCorrect: null, score: 0, timeSpentSec: 0
  }));
  useEffect(() => {
    const prev = session.answers[currentId];
    setLocalSel(prev ?? { questionId: currentId, selected: [], selectedPairs: {}, selectedOrder: [], selectedMatrix: {}, parts: {}, isCorrect: null, score: 0, timeSpentSec: 0 });
  }, [currentId]);

  function markForReviewToggle() {
    setLocalSel(prev => ({ ...prev, markedForReview: !prev.markedForReview }));
  }

  function handleCommitAnswer() {
    if (!current) return;
    const spent = Math.round((Date.now() - questionStartRef.current) / 1000);
    const scored = scoreQuestion(current, localSel);
    const updated: SessionAnswer = { ...localSel, timeSpentSec: (localSel.timeSpentSec || 0) + spent, isCorrect: scored.correct, score: scored.points };
    setSession(prev => ({ ...prev, answers: { ...prev.answers, [current.id]: updated } }));
  }

  function toggleSelect(choiceId: string) {
    if (!current) return;
    if (current.type === "single") {
      setLocalSel(prev => ({ ...prev, selected: [choiceId] }));
    } else if (current.type === "multi") {
      setLocalSel(prev => {
        const set = new Set(prev.selected || []);
        set.has(choiceId) ? set.delete(choiceId) : set.add(choiceId);
        return { ...prev, selected: Array.from(set) };
      });
    }
  }

  function setMatch(leftId: string, rightId: string) {
    setLocalSel(prev => ({ ...prev, selectedPairs: { ...(prev.selectedPairs || {}), [leftId]: rightId } }));
  }
  function setOrderAt(index: number, choiceId: string) {
    setLocalSel(prev => {
      const arr = [...(prev.selectedOrder || [])];
      arr[index] = choiceId;
      return { ...prev, selectedOrder: arr };
    });
  }
  function setMatrix(rowId: string, colId: string) {
    setLocalSel(prev => ({ ...prev, selectedMatrix: { ...(prev.selectedMatrix || {}), [rowId]: colId } }));
  }
  function setPartAnswer(partId: string, ans: SessionAnswer) {
    setLocalSel(prev => ({ ...prev, parts: { ...(prev.parts || {}), [partId]: ans } }));
  }

  function goNext() {
    handleCommitAnswer();
    setSession(prev => ({ ...prev, currentIdx: clamp(prev.currentIdx + 1, 0, prev.questionOrder.length - 1) }));
  }
  function goPrev() {
    handleCommitAnswer();
    setSession(prev => ({ ...prev, currentIdx: clamp(prev.currentIdx - 1, 0, prev.questionOrder.length - 1) }));
  }
  function finish() {
    handleCommitAnswer();
    setSession(prev => ({ ...prev, finished: true }));
  }
  function restart() {
    startNewSession();
  }

  // Render helpers
  function renderExhibits(q: Question) {
    if (!q.exhibits?.length) return null;
    return (
      <details className="exhibits">
        <summary>Exhibits ({q.exhibits.length})</summary>
        {q.exhibits.map((ex, i) => (
          <div key={i} className="exhibit">
            {ex.title && <div className="exhibit-title">{ex.title}</div>}
            <pre className="exhibit-content">{ex.content}</pre>
          </div>
        ))}
      </details>
    );
  }

  function Renderer({ q }: { q: Question }) {
    switch (q.type) {
      case "single":
      case "multi": {
        const sm = q as SingleMulti;
        return (
          <div className="sm">
            {sm.choices.map((c) => {
              const checked = !!localSel.selected?.includes(c.id);
              return (
                <label key={c.id} className="choice">
                  <input
                    type={q.type === "single" ? "radio" : "checkbox"}
                    name={q.id}
                    checked={checked}
                    onChange={() => toggleSelect(c.id)}
                  />
                  <span>{c.text}</span>
                </label>
              );
            })}
          </div>
        );
      }
      case "match": {
        const mq = q as MatchQ;
        const rightIds = Object.values(mq.pairs || {});
        return (
          <div className="match">
            {mq.choices.map((left) => (
              <div key={left.id} className="match-row">
                <div className="left">{left.text}</div>
                <select value={localSel.selectedPairs?.[left.id] || ""} onChange={(e) => setMatch(left.id, e.target.value)}>
                  <option value="">Select…</option>
                  {Array.from(new Set(rightIds)).map(rid => (
                    <option key={rid} value={rid}>{rid}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        );
      }
      case "order": {
        const oq = q as OrderQ;
        return (
          <div className="order">
            {oq.choices.map((c, idx) => (
              <div key={c.id} className="order-row">
                <span className="left">{idx+1}.</span>
                <select value={localSel.selectedOrder?.[idx] || ""} onChange={(e) => setOrderAt(idx, e.target.value)}>
                  <option value="">Choose step…</option>
                  {oq.choices.map(opt => <option key={opt.id} value={opt.id}>{opt.text}</option>)}
                </select>
              </div>
            ))}
          </div>
        );
      }
      case "matrix": {
        const mx = (q as MatrixQ).matrix;
        return (
          <table className="matrix">
            <thead>
              <tr>
                <th>Row \\ Col</th>
                {mx.cols.map(c => <th key={c.id}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {mx.rows.map(r => (
                <tr key={r.id}>
                  <td>{r.label}</td>
                  {mx.cols.map(c => (
                    <td key={c.id}>
                      <input type="radio" name={`${q.id}.${r.id}`} checked={localSel.selectedMatrix?.[r.id] === c.id} onChange={() => setMatrix(r.id, c.id)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
      case "case": {
        const cq = q as CaseQ;
        return (
          <div className="case">
            {renderExhibits(q)}
            <ol className="case-parts">
              {cq.parts.map((p) => (
                <li key={p.id}>
                  <div className="part-prompt">{p.prompt}</div>
                  <SubPartRenderer part={p} value={localSel.parts?.[p.id]} onChange={(ans)=>setPartAnswer(p.id, ans)} />
                </li>
              ))}
            </ol>
          </div>
        );
      }
    }
  }

  function SubPartRenderer({ part, value, onChange }:{ part: CasePart, value?: SessionAnswer, onChange:(ans:SessionAnswer)=>void }) {
    const init: SessionAnswer = value ?? { questionId: part.id, selected: [], selectedPairs: {}, selectedOrder: [], selectedMatrix: {}, parts: {}, isCorrect: null, score: 0, timeSpentSec: 0 };
    switch (part.type) {
      case "single":
      case "multi": {
        const sm = part as SingleMulti;
        return (
          <div className="sm">
            {sm.choices.map((c) => {
              const checked = !!(init.selected?.includes(c.id));
              return (
                <label key={c.id} className="choice">
                  <input type={part.type==="single" ? "radio":"checkbox"} name={part.id} checked={checked} onChange={() => {
                    const next = { ...init };
                    if (part.type==="single") next.selected = [c.id];
                    else {
                      const set = new Set(next.selected || []);
                      set.has(c.id) ? set.delete(c.id) : set.add(c.id);
                      next.selected = Array.from(set);
                    }
                    onChange(next);
                  }}/>
                  <span>{c.text}</span>
                </label>
              );
            })}
          </div>
        );
      }
      default:
        return <div>Unsupported part type in this demo.</div>;
    }
  }

  // Score summary
  const totals = useMemo(() => {
    let gained = 0, possible = 0;
    for (const qid of session.questionOrder) {
      const q = qMap[qid]; if (!q) continue;
      const pts = q.scoring?.points ?? (
        q.type === "case" ? (q as CaseQ).parts.reduce((s,p)=>s+(p.scoring?.points ?? 1),0) : 1
      );
      possible += pts;
      const ans = session.answers[qid];
      if (ans) {
        const res = scoreQuestion(q, ans);
        gained += res.points;
      }
    }
    return { gained, possible };
  }, [session.answers, session.questionOrder.join("|")]);

  return (
    <div className={`app ${dark ? "dark" : "light"}`} style={{ fontSize: `${fontScale}rem` }}>
      <header className="topbar">
        <div className="left">
          <button onClick={()=>setMenuOpen(!menuOpen)}>☰ Menu</button>
          <button onClick={()=>setReviewOpen(!reviewOpen)}>★ Review</button>
        </div>
        <div className="center">
          <strong>PL‑300 Quiz</strong>
          {secLeft!=null && <span className="timer"> ⏱ {secLeft}s</span>}
        </div>
        <div className="right">
          <input type="file" accept="application/json" onChange={(e)=>{ const f=e.target.files?.[0]; if (f) handleImportJSON(f); }} />
          <button onClick={()=>setDark(d=>!d)}>{dark? "Light":"Dark"}</button>
          <button onClick={()=>setFontScale(s=>Math.max(0.8,Math.min(1.6, s-0.1)))}>-A</button>
          <button onClick={()=>setFontScale(s=>Math.max(0.8,Math.min(1.6, s+0.1)))}>+A</button>
        </div>
      </header>

      <main className={`layout ${config.layout}`}>
        {config.showLeftQuestionList && (
          <aside className="leftlist">
            <ol>
              {session.questionOrder.map((qid, i) => {
                const a = session.answers[qid];
                return (
                  <li key={qid} className={`${i===session.currentIdx?"active":""} ${a? (a.isCorrect? "ok":"no"):""}`} onClick={()=>setSession(prev=>({...prev, currentIdx:i}))}>
                    Q{i+1}{a ? (a.isCorrect? " ✓":" ✗"):""}
                  </li>
                );
              })}
            </ol>
          </aside>
        )}

        <section className="question">
          {current ? (
            <>
              <div className="prompt">{current.prompt}</div>
              {renderExhibits(current)}
              <Renderer q={current} />
              <div className="actions">
                <button onClick={markForReviewToggle}>{localSel.markedForReview? "Unmark":"Mark"} for Review</button>
                <button onClick={goPrev}>Prev (P)</button>
                <button onClick={handleCommitAnswer}>Save</button>
                <button onClick={goNext}>Next (N)</button>
                <button onClick={finish}>Finish</button>
              </div>
              {config.enableExplanation && session.finished && (
                <details className="explain">
                  <summary>Show explanation</summary>
                  <pre>{(current as any).explanation || "—"}</pre>
                </details>
              )}
            </>
          ) : <div>No question.</div>}
        </section>

        <aside className="scorecard">
          <div><strong>Score:</strong> {totals.gained} / {totals.possible}</div>
          <div><strong>Status:</strong> {session.finished ? "Finished" : "In Progress"}</div>
          <div className="controls">
            <button onClick={restart}>Restart</button>
          </div>
        </aside>
      </main>

      {menuOpen && (
        <div className="menu">
          <h3>Session Settings</h3>
          <label>Questions: <input type="number" value={settings.numQuestions} onChange={(e)=>setSettings(s=>({...s, numQuestions: parseInt(e.target.value||"1")}))}/></label>
          <label>Difficulty:
            <select value={settings.difficulty} onChange={(e)=>setSettings(s=>({...s, difficulty: e.target.value as any}))}>
              <option value="any">Any</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label><input type="checkbox" checked={settings.shuffleQuestions} onChange={(e)=>setSettings(s=>({...s, shuffleQuestions: e.target.checked}))}/> Shuffle Questions</label>
          <label><input type="checkbox" checked={settings.shuffleChoices} onChange={(e)=>setSettings(s=>({...s, shuffleChoices: e.target.checked}))}/> Shuffle Choices</label>
          <button onClick={()=>{startNewSession(); setMenuOpen(false);}}>Apply & Restart</button>
        </div>
      )}

      {reviewOpen && (
        <div className="review">
          <h3>Marked for Review</h3>
          <ul>
            {Object.values(session.answers).filter(a => a.markedForReview).map(a => (
              <li key={a.questionId} onClick={()=>{
                const idx = session.questionOrder.indexOf(a.questionId);
                if (idx >= 0) setSession(prev => ({ ...prev, currentIdx: idx }));
              }}>Jump to {a.questionId}</li>
            ))}
          </ul>
        </div>
      )}

      <style>{`
        :root { --bg:#0b0f12; --fg:#e8f0f2; --card:#111920; --muted:#98a2ad; --accent:#4da3ff; }
        .light { --bg:#f7fafc; --fg:#0b0f12; --card:#ffffff; --muted:#4b5563; --accent:#2563eb; }
        body, .app { margin:0; padding:0; background:var(--bg); color:var(--fg); font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Helvetica, Arial; }
        .topbar { position:sticky; top:0; display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:var(--card); border-bottom:1px solid #1f2937; z-index:5; }
        .topbar .left button, .topbar .right button { margin-right:6px; }
        .timer { margin-left:10px; opacity:0.8; }
        .layout { display:grid; grid-template-columns: 220px 1fr 260px; gap:12px; padding:12px; }
        .layout.centered { grid-template-columns: 1fr; }
        .leftlist, .scorecard, .question, .menu, .review { background:var(--card); border-radius:14px; padding:12px; box-shadow: 0 2px 12px rgba(0,0,0,.25); }
        .leftlist ol { list-style:none; padding:0; margin:0; }
        .leftlist li { padding:6px 8px; cursor:pointer; border-radius:10px; margin:4px 0; }
        .leftlist li.active { background:#1f2937; }
        .leftlist li.ok { border-left:4px solid #22c55e; }
        .leftlist li.no { border-left:4px solid #ef4444; }
        .prompt { font-size:1.125rem; margin-bottom:10px; }
        .choice { display:flex; gap:8px; align-items:flex-start; margin:6px 0; }
        .actions { display:flex; gap:8px; margin-top:12px; }
        .exhibits .exhibit { background:#0b1220; padding:8px; border-radius:10px; margin:8px 0; }
        .exhibit-title { font-weight:600; margin-bottom:4px; }
        .matrix { width:100%; border-collapse: collapse; }
        .matrix th, .matrix td { border:1px solid #1f2937; padding:6px; text-align:center; }
        .order-row, .match-row { display:flex; gap:8px; align-items:center; margin:6px 0; }
        .menu, .review { position:fixed; top:64px; right:16px; width:360px; max-height:70vh; overflow:auto; }
      `}</style>
    </div>
  );
}
