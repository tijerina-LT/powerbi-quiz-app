import { useState } from "react";

// Example question bank (can be replaced with your real JSON later)
const defaultQuestions = [
  {
    id: 1,
    question: "In Power BI, which view is used to manage relationships between tables?",
    options: ["Report view", "Model view", "Data view", "Dashboard view"],
    answer: "Model view",
    objective: "Modeling"
  },
  {
    id: 2,
    question: "Which DAX function returns the year from a date value?",
    options: ["YEAR()", "DATEYEAR()", "GETYEAR()", "YEARS()"],
    answer: "YEAR()",
    objective: "DAX"
  }
];

export default function App() {
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [answers, setAnswers] = useState({});

  const q = defaultQuestions[current];

  function handleAnswer(option) {
    setAnswers({ ...answers, [q.id]: option });
    if (option === q.answer) {
      setScore(score + 1);
    }
    if (current + 1 < defaultQuestions.length) {
      setCurrent(current + 1);
    } else {
      setFinished(true);
    }
  }

  return (
    <div style={{minHeight:"100vh",background:"#0b0b0b",color:"#eee",fontFamily:"system-ui,Segoe UI,Roboto",display:"flex",justifyContent:"center",alignItems:"center"}}>
      <div style={{maxWidth:600,padding:20,textAlign:"center"}}>
        <h1 style={{fontSize:32,marginBottom:20}}>PL-300 Exam Trainer</h1>
        {!finished ? (
          <div>
            <h2 style={{marginBottom:16}}>{q.question}</h2>
            <div style={{display:"grid",gap:10}}>
              {q.options.map((opt) => (
                <button key={opt}
                  onClick={() => handleAnswer(opt)}
                  style={{padding:"10px 16px",borderRadius:8,background:"#222",color:"#eee",border:"1px solid #444",cursor:"pointer"}}>
                  {opt}
                </button>
              ))}
            </div>
            <p style={{marginTop:20}}>Question {current+1} of {defaultQuestions.length}</p>
          </div>
        ) : (
          <div>
            <h2>Exam Finished</h2>
            <p>Your Score: {score} / {defaultQuestions.length}</p>
          </div>
        )}
      </div>
    </div>
  );
}
