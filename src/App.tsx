import { useEffect, useMemo, useRef, useState } from "react";

type Choice = { id: string; text: string; correct?: boolean };
type Question = {
  id: string;
  type: "single" | "multi";
  prompt: string;
  choices: Choice[];
  explanation?: string;
  tags?: string[];
};

type Bank = { title?: string; questions: Question[] };

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function App() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [bank, setBank] = useState<Bank | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [locked, setLocked] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [sessionSize, setSessionSize] = useState<number>(40);

  const q: Question | null = useMemo(() => {
    if (!bank || order.length === 0) return null;
    return bank.questions[order[idx]];
  }, [bank, order, idx]);

  useEffect(() => {
    // Also support QUESTIONS injected via window (fallback)
    const injected = (window as any).__QUESTIONS__ as Question[] | undefined;
    if (injected && injected.length && !bank) {
      const b: Bank = { title: "Injected", questions: injected };
      setBank(b);
      const count = Math.min(sessionSize, b.questions.length);
      setOrder(shuffle([...Array(b.questions.length).keys()]).slice(0, count));
    }
  }, []);

  const startSession = (b: Bank) => {
    const count = Math.min(sessionSize, b.questions.length);
    setOrder(shuffle([...Array(b.questions.length).keys()]).slice(0, count));
    setIdx(0);
    setSelected(new Set());
    setLocked(false);
    setScore({ correct: 0, total: 0 });
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const b: Bank = "questions" in parsed ? parsed : { title: "Bank", questions: parsed };
    setBank(b);
    startSession(b);
  };

  const choose = (id: string) => {
    if (!q || locked) return;
    const next = new Set(selected);
    if (q.type === "single") {
      next.clear();
      next.add(id);
    } else {
      next.has(id) ? next.delete(id) : next.add(id);
    }
    setSelected(next);
  };

  const reveal = () => {
    if (!q || locked) return;
    setLocked(true);
    const correctIds = new Set(q.choices.filter(c => c.correct).map(c => c.id));
    const isCorrect =
      q.type === "single"
        ? selected.size === 1 && correctIds.has([...selected][0])
        : [...selected].every(x => correctIds.has(x)) && selected.size === correctIds.size;
    setScore(s => ({ correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1 }));
  };

  const nextQ = () => {
    setSelected(new Set());
    setLocked(false);
    setIdx(i => Math.min(i + 1, order.length - 1));
  };

  const prevQ = () => {
    setSelected(new Set());
    setLocked(false);
    setIdx(i => Math.max(i - 1, 0));
  };

  const resetSession = () => {
    if (!bank) return;
    startSession(bank);
  };

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", padding: 16, maxWidth: 980, margin: "0 auto" }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {bank?.title ?? "PL-300 Quiz App"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {bank ? `${bank.questions.length} total` : "Load a JSON question bank to begin"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12 }}>Session size:</label>
          <input
            type="number"
            value={sessionSize}
            min={5}
            max={bank?.questions.length ?? 500}
            onChange={e => setSessionSize(Math.max(5, Math.min(500, Number(e.target.value) || 5)))}
            style={{ width: 70, padding: 6 }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", background: "#f7f7f7" }}
          >
            Load JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          {bank && (
            <button
              onClick={resetSession}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", background: "#f7f7f7" }}
            >
              New session
            </button>
          )}
        </div>
      </header>

      {!bank && (
        <div style={{ padding: 12, border: "1px dashed #bbb", borderRadius: 12 }}>
          <div style={{ marginBottom: 8 }}>Tips:</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Click <b>Load JSON</b> and choose your <code>bank_from_pdf.json</code> (389 questions)</li>
            <li>Or start small with <code>example_bank.json</code></li>
          </ul>
        </div>
      )}

      {bank && q && (
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16, marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 14, opacity: 0.7 }}>
              Question {idx + 1} / {order.length} &nbsp;•&nbsp; Score {score.correct}/{score.total}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {q.type.toUpperCase()} {q.tags?.length ? "• " + q.tags.join(", ") : ""}
            </div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{q.prompt}</div>

          <div style={{ display: "grid", gap: 8 }}>
            {q.choices.map(c => {
              const isSel = selected.has(c.id);
              const correct = locked && c.correct;
              const wrong = locked && isSel && !c.correct;
              const base = { padding: "10px 12px", borderRadius: 10, border: "1px solid #d0d0d0", cursor: "pointer" } as const;
              const bg = correct ? "#e8f7e8" : wrong ? "#fdeaea" : isSel ? "#f5f7ff" : "#fff";
              return (
                <div
                  key={c.id}
                  onClick={() => choose(c.id)}
                  style={{ ...base, background: bg }}
                  aria-pressed={isSel}
                >
                  <input
                    type={q.type === "single" ? "radio" : "checkbox"}
                    checked={isSel}
                    onChange={() => choose(c.id)}
                    style={{ marginRight: 8 }}
                  />
                  {c.text}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {!locked ? (
              <button onClick={reveal} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc" }}>
                Check answer
              </button>
            ) : (
              <>
                <button onClick={prevQ} disabled={idx === 0} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc" }}>
                  Prev
                </button>
                <button onClick={nextQ} disabled={idx === order.length - 1} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc" }}>
                  Next
                </button>
              </>
            )}
          </div>

          {locked && q.explanation && (
            <div style={{ marginTop: 12, padding: 12, background: "#fafafa", borderRadius: 10, border: "1px solid #eee" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Explanation</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{q.explanation}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
