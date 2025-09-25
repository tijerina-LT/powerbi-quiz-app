@'
import { useEffect, useMemo, useRef, useState } from "react"

// =============================
// TYPES
// =============================
type Choice = { id: string; text: string; correct: boolean }
type Question = {
  id: string
  prompt: string
  choices: Choice[]
  explanation?: string
  tags?: string[]
}
type Bank = { title: string; source?: string; version?: string; questions: Question[] }

type Attempt = {
  questionId: string
  choiceIds: string[]
  isCorrect: boolean
  flagged?: boolean
}

type Mode = "practice" | "exam"

// =============================
// SAMPLE BANK (replace with your PDF-derived bank later)
// =============================
const SAMPLE: Bank = {
  title: "PL-300 Sample – Demo",
  source: "Starter",
  version: "v1",
  questions: [
    {
      id: "q1",
      prompt: "Which visual is best to show trends over time for two measures?",
      choices: [
        { id: "a", text: "Line chart", correct: true },
        { id: "b", text: "Donut chart", correct: false },
        { id: "c", text: "Treemap", correct: false },
      ],
      explanation: "Line charts are best for continuous time series comparisons.",
      tags: ["Visuals", "Report Design"]
    },
    {
      id: "q2",
      prompt: "You need Top 10 cities by profit without DAX. Fastest option?",
      choices: [
        { id: "a", text: "Visual-level Top N filter", correct: true },
        { id: "b", text: "Create calculated column", correct: false },
        { id: "c", text: "Drillthrough filter", correct: false },
      ],
      explanation: "Use the built-in Top N visual filter.",
      tags: ["Filtering"]
    },
    {
      id: "q3",
      prompt: "Analysts must build content but not publish apps. Minimum role?",
      choices: [
        { id: "a", text: "Viewer", correct: false },
        { id: "b", text: "Member", correct: true },
        { id: "c", text: "Admin", correct: false },
      ],
      explanation: "Member can create content with limited admin scope.",
      tags: ["Governance", "Workspaces"]
    },
  ]
}

// =============================
// UTILS: Seeded RNG & Shuffle
// =============================
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6D2B79F5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function seedFromString(s: string) {
  let n = 0
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0
  return n || 1
}
function seededShuffle<T>(arr: T[], seedStr: string): T[] {
  const rnd = mulberry32(seedFromString(seedStr))
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const STORAGE_KEY = "pl300_exam_trainer_state_v2"

function saveState(state: any) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {} }
function loadState<T>(fallback: T): T {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) as T : fallback } catch { return fallback }
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
function downloadJSON(filename: string, data: any) {
  downloadText(filename, JSON.stringify(data, null, 2))
}

// =============================
// APP
// =============================
export default function App() {
  // Settings
  const [dark, setDark] = useState(true)
  const [fontScale, setFontScale] = useState(1.0)
  const [mode, setMode] = useState<Mode>("practice")
  const [seed, setSeed] = useState("PL300-1")
  const [randomizeQ, setRandomizeQ] = useState(true)
  const [randomizeA, setRandomizeA] = useState(true)
  const [durationMin, setDurationMin] = useState(60)

  // Data
  const [bank, setBank] = useState<Bank>(SAMPLE)
  const [started, setStarted] = useState(false)
  const [order, setOrder] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [attempts, setAttempts] = useState<Record<string, Attempt>>({})
  const [timerMs, setTimerMs] = useState(0)
  const [paused, setPaused] = useState(false)

  const timerRef = useRef<number | null>(null)

  // Load persisted state on mount
  useEffect(() => {
    const s = loadState<any>(null)
    if (s) {
      setDark(!!s.dark); setFontScale(s.fontScale ?? 1)
      setMode(s.mode ?? "practice")
      setSeed(s.seed ?? "PL300-1")
      setRandomizeQ(!!s.randomizeQ); setRandomizeA(!!s.randomizeA)
      setDurationMin(s.durationMin ?? 60)
      setBank(s.bank ?? SAMPLE)
      setStarted(!!s.started); setOrder(s.order ?? []); setIndex(s.index ?? 0)
      setAttempts(s.attempts ?? {})
      setTimerMs(s.timerMs ?? 0); setPaused(!!s.paused)
    }
  }, [])

  // Persist on change
  useEffect(() => {
    saveState({ dark, fontScale, mode, seed, randomizeQ, randomizeA, durationMin, bank, started, order, index, attempts, timerMs, paused })
  }, [dark, fontScale, mode, seed, randomizeQ, randomizeA, durationMin, bank, started, order, index, attempts, timerMs, paused])

  // Seeded & randomized views
  const qMap = useMemo(() => new Map(bank.questions.map(q => [q.id, q] as const)), [bank.questions])

  const questionOrder = useMemo(() => {
    const ids = bank.questions.map(q => q.id)
    return randomizeQ ? seededShuffle(ids, seed + "::Q") : ids
  }, [bank.questions, randomizeQ, seed])

  const questionsView = useMemo(() => {
    return questionOrder.map(id => {
      const q = qMap.get(id)!
      const choices = randomizeA ? seededShuffle(q.choices, seed + "::A::" + id) : q.choices
      return { ...q, choices }
    })
  }, [qMap, questionOrder, randomizeA, seed])

  // Current question
  const current = questionsView[index]

  // Start session
  const start = () => {
    setOrder(questionOrder)
    setAttempts({})
    setIndex(0)
    setStarted(true)
    if (mode === "exam") {
      setTimerMs(durationMin * 60 * 1000)
      setPaused(false)
    }
  }

  // Timer tick
  useEffect(() => {
    if (!started || mode !== "exam" || paused) return
    if (timerMs <= 0) return
    timerRef.current = window.setInterval(() => setTimerMs(ms => Math.max(0, ms - 1000)), 1000) as unknown as number
    return () => { if (timerRef.current) window.clearInterval(timerRef.current) }
  }, [started, mode, paused, timerMs])

  useEffect(() => {
    if (mode === "exam" && started && timerMs === 0) setPaused(true)
  }, [mode, started, timerMs])

  // Answer
  const choose = (cid: string) => {
    if (!current) return
    const isCorrect = !!current.choices.find(c => c.id === cid)?.correct
    setAttempts(prev => ({ ...prev, [current.id]: { questionId: current.id, choiceIds: [cid], isCorrect, flagged: prev[current.id]?.flagged } }))
  }

  // Flag
  const toggleFlag = () => {
    if (!current) return
    const a = attempts[current.id] ?? { questionId: current.id, choiceIds: [], isCorrect: false }
    setAttempts(prev => ({ ...prev, [current.id]: { ...a, flagged: !a.flagged } }))
  }

  // Export results
  const exportResults = () => {
    const total = order.length || questionsView.length
    const correctCount = Object.values(attempts).filter(a => a.isCorrect).length
    const lines: string[] = []
    lines.push(`${bank.title} — Results`)
    lines.push(`Mode: ${mode}  Seed: ${seed}`)
    lines.push(`Score: ${correctCount} / ${total}`)
    lines.push("")
    lines.push("Incorrect:")
    order.forEach((id, i) => {
      const a = attempts[id]
      if (!a || a.isCorrect) return
      const q = qMap.get(id)!
      const chosen = a.choiceIds[0]
      const correct = q.choices.find(c => c.correct)?.id
      lines.push(`${i + 1}. ${q.prompt}`)
      lines.push(`   Your: ${q.choices.find(c => c.id === chosen)?.text}`)
      lines.push(`   Correct: ${q.choices.find(c => c.id === correct)?.text}`)
      if (q.tags?.length) lines.push(`   Tags: ${q.tags.join(", ")}`)
      if (q.explanation) lines.push(`   Note: ${q.explanation}`)
      lines.push("")
    })
    downloadText(`${bank.title.replace(/\s+/g, "_")}_results.txt`, lines.join("\n"))
  }

  // Import / Export bank & sessions
  const onLoadBank = async (file: File, merge=false) => {
    const text = await file.text()
    const b = JSON.parse(text) as Bank
    if (!Array.isArray(b.questions)) throw new Error("Invalid bank JSON")
    if (merge) {
      const ids = new Set(bank.questions.map(q => q.id))
      const merged = [...bank.questions]
      for (const q of b.questions) {
        if (ids.has(q.id)) continue
        merged.push(q)
        ids.add(q.id)
      }
      setBank({ ...bank, questions: merged, title: bank.title + " + " + (b.title || "Bank") })
    } else {
      setBank(b)
    }
    reset()
  }

  const exportBank = () => downloadJSON(`${bank.title.replace(/\s+/g, "_")}.json`, bank)
  const exportSession = () => downloadJSON(`${bank.title.replace(/\s+/g, "_")}_session.json`, { bank, mode, seed, randomizeQ, randomizeA, durationMin, started, order, index, attempts })
  const loadSession = async (file: File) => {
    const data = JSON.parse(await file.text())
    setBank(data.bank || bank)
    setMode(data.mode || "practice")
    setSeed(data.seed || "PL300-1")
    setRandomizeQ(!!data.randomizeQ)
    setRandomizeA(!!data.randomizeA)
    setDurationMin(data.durationMin || 60)
    setStarted(!!data.started)
    setOrder(data.order || [])
    setIndex(data.index || 0)
    setAttempts(data.attempts || {})
  }

  const reset = () => {
    setStarted(false); setAttempts({}); setOrder([]); setIndex(0); setTimerMs(0); setPaused(false)
  }

  // Coverage & weak areas
  const coverage = useMemo(() => {
    const tagCounts: Record<string, { total: number; correct: number }> = {}
    for (const q of bank.questions) {
      for (const t of q.tags || []) {
        tagCounts[t] = tagCounts[t] || { total: 0, correct: 0 }
        tagCounts[t].total += 1
        const a = attempts[q.id]
        if (a?.isCorrect) tagCounts[t].correct += 1
      }
    }
    return tagCounts
  }, [bank.questions, attempts])

  const sortedWeakTags = useMemo(() => {
    const entries = Object.entries(coverage)
    return entries
      .map(([tag, v]) => ({ tag, total: v.total, correct: v.correct, pct: v.total ? v.correct / v.total : 0 }))
      .sort((a, b) => a.pct - b.pct)
  }, [coverage])

  // Build a drill from selected tags or weakest K
  const [drillTags, setDrillTags] = useState<string[]>([])
  const [weakK, setWeakK] = useState(3)
  const startDrillWeak = () => {
    const chosenTags = sortedWeakTags.slice(0, weakK).map(x => x.tag)
    startDrill(chosenTags)
  }
  const startDrill = (tags: string[]) => {
    const ids = bank.questions.filter(q => (q.tags || []).some(t => tags.includes(t))).map(q => q.id)
    if (ids.length === 0) return alert("No questions match selected tags.")
    const seq = randomizeQ ? seededShuffle(ids, seed + "::DRILL") : ids
    setOrder(seq); setIndex(0); setAttempts({}); setStarted(true)
    if (mode === "exam") { setTimerMs(durationMin * 60 * 1000); setPaused(false) }
  }

  // Derived counts
  const answeredCount = Object.keys(attempts).length
  const correctCount = Object.values(attempts).filter(a => a.isCorrect).length
  const incorrectList = useMemo(() => Object.values(attempts).filter(a => !a.isCorrect), [attempts])
  const flaggedList = useMemo(() => Object.values(attempts).filter(a => a.flagged), [attempts])
  const totalQuestions = order.length || questionsView.length
  const timePct = useMemo(() => mode === "exam" ? (100 * timerMs) / (durationMin * 60 * 1000 || 1) : 0, [timerMs, durationMin, mode])

  // UI helpers
  const row = (label: string, content: React.ReactNode) => (
    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}>
      <span>{label}</span>
      <div>{content}</div>
    </div>
  )

  return (
    <div className={dark ? "dark" : ""} style={{minHeight:"100vh",background:"#0b0b0b",color:"#eee"}}>
      <div style={{maxWidth:1000,margin:"0 auto",padding:"20px",fontSize:`${fontScale}rem`}}>
        <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div>
            <h1 style={{margin:0,fontSize:26}}>{bank.title}</h1>
            <div style={{opacity:.6,fontSize:12}}>Custom Exam Trainer • {bank.version || "v1"}</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <label style={{fontSize:12,opacity:.8}}>Dark</label>
            <button onClick={()=>setDark(v=>!v)} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #333",background:"#141414",color:"#eee"}}>{dark?"On":"Off"}</button>
            <label style={{fontSize:12,opacity:.8}}>Font</label>
            <input type="range" min={0.85} max={1.35} step={0.05} value={fontScale} onChange={e=>setFontScale(parseFloat((e.target as HTMLInputElement).value))}/>
            <button onClick={exportResults} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #333",background:"#141414",color:"#eee"}}>Export Results (.txt)</button>
            <button onClick={exportBank} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #333",background:"#141414",color:"#eee"}}>Export Bank (JSON)</button>
            <button onClick={exportSession} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #333",background:"#141414",color:"#eee"}}>Export Session</button>
            <label style={{cursor:"pointer",textDecoration:"underline"}}>
              Load Session<input type="file" accept="application/json" style={{display:"none"}} onChange={e=>e.target.files && loadSession(e.target.files[0]).catch(err=>alert(err.message))}/>
            </label>
          </div>
        </header>

        {/* Setup panel */}
        {!started && (
          <div style={{background:"#111",border:"1px solid #2a2a2a",borderRadius:16,padding:16,marginBottom:12}}>
            <h3 style={{marginTop:0}}>Session Settings</h3>
            <div style={{display:"grid",gap:10}}>
              {row("Mode", (
                <>
                  <button onClick={()=>setMode("practice")} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #333",background:mode==="practice"?"#1f2937":"#141414",color:"#eee",marginRight:6}}>Practice</button>
                  <button onClick={()=>setMode("exam")} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #333",background:mode==="exam"?"#1f2937":"#141414",color:"#eee"}}>Exam Sim</button>
                </>
              ))}
              {row("Seed", (<input value={seed} onChange={e=>setSeed((e.target as HTMLInputElement).value)} style={{background:"#141414",color:"#eee",border:"1px solid #333",padding:"6px 8px",borderRadius:8}}/>))}
              {row("Randomize questions", (<input type="checkbox" checked={randomizeQ} onChange={e=>setRandomizeQ((e.target as HTMLInputElement).checked)}/>))}
              {row("Randomize answers", (<input type="checkbox" checked={randomizeA} onChange={e=>setRandomizeA((e.target as HTMLInputElement).checked)}/>))}
              {mode==="exam" && row("Duration (min)", (<input type="number" value={durationMin} onChange={e=>setDurationMin(Math.max(5, parseInt((e.target as HTMLInputElement).value) || 60))} style={{width:80,background:"#141414",color:"#eee",border:"1px solid #333",padding:"6px 8px",borderRadius:8}}/>))}
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                <button onClick={start} style={{padding:"10px 14px",borderRadius:12,border:"1px solid #444",background:"#1f1f1f",color:"#fff"}}>Start</button>
                <label style={{cursor:"pointer",textDecoration:"underline"}}>Load Bank (JSON)
                  <input type="file" accept="application/json" style={{display:"none"}} onChange={e=>e.target.files && onLoadBank(e.target.files[0], false).catch(err=>alert(err.message))}/>
                </label>
                <label style={{cursor:"pointer",textDecoration:"underline"}}>Add Bank (merge)
                  <input type="file" accept="application/json" style={{display:"none"}} onChange={e=>e.target.files && onLoadBank(e.target.files[0], true).catch(err=>alert(err.message))}/>
                </label>
              </div>
            </div>

            {/* Coverage + Weak drills */}
            <div style={{marginTop:16,display:"grid",gap:12}}>
              <h4 style={{margin:0}}>Objective Coverage</h4>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {Object.entries(coverage).length === 0 && <div style={{opacity:.7}}>No tag data yet.</div>}
                {Object.entries(coverage).map(([t,v]) => {
                  const pct = v.total ? Math.round((v.correct/v.total)*100) : 0
                  return <span key={t} style={{border:"1px solid #333",borderRadius:999,padding:"4px 10px",background:"#141414"}}>{t}: {v.correct}/{v.total} ({pct}%)</span>
                })}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                <button onClick={startDrillWeak} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #333",background:"#141414",color:"#eee"}}>Drill Weakest {weakK}</button>
                <input type="number" value={weakK} onChange={e=>setWeakK(Math.max(1, parseInt((e.target as HTMLInputElement).value)||3))} style={{width:60,background:"#141414",color:"#eee",border:"1px solid #333",padding:"6px 8px",borderRadius:8}}/>
                <span style={{opacity:.8}}>or select tags:</span>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {Array.from(new Set(bank.questions.flatMap(q => q.tags || []))).map(t => {
                    const on = drillTags.includes(t)
                    return <button key={t} onClick={()=>setDrillTags(p=>on?p.filter(x=>x!==t):[...p,t])} style={{padding:"4px 8px",borderRadius:999,border:"1px solid #333",background:on?"#1f2937":"#141414",color:"#eee"}}>{t}</button>
                  })}
                </div>
                <button onClick={()=>startDrill(drillTags)} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #333",background:"#141414",color:"#eee"}}>Start Drill</button>
              </div>
            </div>
          </div>
        )}

        {/* Active Session */}
        {started && current && (
          <div style={{display:"grid",gap:12}}>
            {/* Top bar */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{border:"1px solid #333",borderRadius:999,padding:"4px 10px",background:"#141414"}}>{Object.keys(attempts).length}/{totalQuestions} answered</span>
                <span style={{border:"1px solid #333",borderRadius:999,padding:"4px 10px",background:"#141414"}}>Correct: {correctCount}</span>
                {mode==="exam" && (
                  <span style={{border:"1px solid #333",borderRadius:999,padding:"4px 10px",background: timerMs>5*60*1000 ? "#141414" : "#402" }}>
                    Time: {new Date(timerMs).toISOString().substring(11,19)}
                  </span>
                )}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setIndex(0)} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #333",background:"#141414",color:"#eee"}}>First</button>
                <button onClick={()=>setIndex(i=>Math.max(0,i-1))} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #333",background:"#141414",color:"#eee"}}>Prev</button>
                <button onClick={()=>setIndex(i=>Math.min(totalQuestions-1,i+1))} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #333",background:"#141414",color:"#eee"}}>Next</button>
                <button onClick={reset} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #333",background:"#141414",color:"#eee"}}>Reset</button>
              </div>
            </div>

            {/* Question Card */}
            <div style={{background:"#111",border:"1px solid #2a2a2a",borderRadius:16,padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"flex-start"}}>
                <div>
                  <div style={{opacity:.7,fontSize:12,marginBottom:6}}>Question {index+1} of {totalQuestions}</div>
                  <h2 style={{marginTop:0}}>{current.prompt}</h2>
                </div>
                <button onClick={toggleFlag} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #665200",background: attempts[current.id]?.flagged ? "#4a3d00" : "#141414", color:"#ffdb70"}}>{attempts[current.id]?.flagged?"Flagged":"Flag"}</button>
              </div>

              <div style={{display:"grid",gap:10}}>
                {current.choices.map(c => {
                  const a = attempts[current.id]
                  const isChosen = a?.choiceIds?.includes(c.id)
                  const showFeedback = mode==="practice" && !!a
                  const correctAndChosen = isChosen && c.correct
                  const incorrectAndChosen = isChosen && !c.correct

                  const styleBase = {padding:"10px 12px",borderRadius:12,textAlign:"left" as const,border:"1px solid #2a2a2a",background:"#141414",color:"#eee"}
                  const styleChosen = isChosen ? { ...styleBase, background:"#1f2937", border:"1px solid #334155" } : styleBase
                  const styleFeedback = showFeedback
                    ? correctAndChosen ? { ...styleChosen, background:"#14331a", border:"1px solid #2f6f3a" }
                    : incorrectAndChosen ? { ...styleChosen, background:"#3a1010", border:"1px solid #6f2f2f" }
                    : styleChosen
                    : styleChosen

                  return (
                    <button key={c.id} onClick={()=>choose(c.id)} style={styleFeedback}>
                      {c.text}
                    </button>
                  )
                })}
              </div>

              {mode==="practice" && attempts[current.id] && (
                <div style={{marginTop:10,opacity:.9}}>
                  {attempts[current.id].isCorrect ? <div style={{color:"#8bffa8"}}>Correct ✔</div> : <div style={{color:"#ff9a9a"}}>Incorrect ✘</div>}
                  {current.explanation && <div style={{opacity:.8,marginTop:6}}>{current.explanation}</div>}
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
                    {(current.tags||[]).map(t => <span key={t} style={{border:"1px solid #333",borderRadius:999,padding:"2px 8px",background:"#141414"}}>{t}</span>)}
                  </div>
                </div>
              )}
            </div>

            {/* Navigator + Incorrect + Flagged */}
            <div style={{display:"grid",gap:12,gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))"}}>
              <div style={{background:"#111",border:"1px solid #2a2a2a",borderRadius:16,padding:16}}>
                <h4 style={{marginTop:0}}>Navigator</h4>
                <div style={{display:"grid",gridTemplateColumns:"repeat(10,1fr)",gap:6}}>
                  {(order.length?order:questionsView.map(q=>q.id)).map((id, i) => {
                    const a = attempts[id]
                    const bg = !a ? "#141414" : a.isCorrect ? "#14331a" : "#3a1010"
                    return <div key={id} onClick={()=>setIndex(i)} style={{userSelect:"none",cursor:"pointer",border:"1px solid #2a2a2a",borderRadius:8,padding:"4px 0",textAlign:"center",background:bg}}>{i+1}</div>
                  })}
                </div>
              </div>
              <div style={{background:"#111",border:"1px solid #2a2a2a",borderRadius:16,padding:16}}>
                <h4 style={{marginTop:0}}>Incorrect ({incorrectList.length})</h4>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {incorrectList.length===0 ? <div style={{opacity:.7}}>None</div> :
                    incorrectList.map(a => {
                      const i = (order.length?order:questionsView.map(q=>q.id)).indexOf(a.questionId)
                      return <button key={a.questionId} onClick={()=>setIndex(i)} style={{padding:"4px 8px",borderRadius:8,border:"1px solid #6f2f2f",background:"#3a1010",color:"#eee"}}>{i+1}</button>
                    })
                  }
                </div>
              </div>
              <div style={{background:"#111",border:"1px solid #2a2a2a",borderRadius:16,padding:16}}>
                <h4 style={{marginTop:0}}>Flagged ({flaggedList.length})</h4>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {flaggedList.length===0 ? <div style={{opacity:.7}}>None</div> :
                    flaggedList.map(a => {
                      const i = (order.length?order:questionsView.map(q=>q.id)).indexOf(a.questionId)
                      return <button key={a.questionId} onClick={()=>setIndex(i)} style={{padding:"4px 8px",borderRadius:8,border:"1px solid #665200",background:"#4a3d00",color:"#ffdb70"}}>{i+1}</button>
                    })
                  }
                </div>
              </div>
            </div>

            {/* Exam summary */}
            {mode==="exam" && (timerMs===0 || answeredCount===totalQuestions) && (
              <div style={{background:"#111",border:"1px solid #2a2a2a",borderRadius:16,padding:16}}>
                <h3 style={{marginTop:0}}>Exam Summary</h3>
                <div>Score: <b>{correctCount}</b> / {totalQuestions}</div>
                <div>Incorrect: {incorrectList.length} • Flagged: {flaggedList.length} • Unanswered: {Math.max(0, totalQuestions-answeredCount)}</div>
                <div style={{marginTop:8,display:"flex",gap:8}}>
                  <button onClick={()=>setMode("practice")} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #333",background:"#141414",color:"#eee"}}>Switch to Practice</button>
                  <button onClick={reset} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #333",background:"#141414",color:"#eee"}}>Restart</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{textAlign:"center",opacity:.6,fontSize:12,marginTop:20}}>
          Supports JSON banks, seeded randomization, sessions, flags, coverage & weak-area drills. Progress auto-saves in your browser.
        </div>
      </div>
    </div>
  )
}
'@ | Set-Content -Encoding utf8 .\src\App.tsx
