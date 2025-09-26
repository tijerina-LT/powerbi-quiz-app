
// Questions.ts — EASIEST MODE (no JSON, no config).
// 1) Replace the placeholder questions below with your real question bank.
// 2) Do NOT change the property names; just swap text and set isCorrect = true on the right choice.

export type Choice = { id: string; text: string; isCorrect: boolean };
export type Question = {
  id: string;
  prompt: string;
  choices: Choice[];
  explanation?: string;
  difficulty?: "easy" | "medium" | "hard";
  tags?: string[];
};

export const QUESTIONS: Question[] = [
  {
    id: "q1",
    prompt: "Example: In Power BI, which feature enables dynamic fields via a slicer?",
    choices: [
      { id: "a", text: "Bookmarks", isCorrect: false },
      { id: "b", text: "Field Parameters", isCorrect: true }, // set true on the right answer
      { id: "c", text: "Drillthrough", isCorrect: false },
      { id: "d", text: "Quick Insights", isCorrect: false }
    ],
    explanation: "Field Parameters let you swap dimensions/measures via slicer.",
    difficulty: "easy",
    tags: ["PL-300","Modeling"]
  },
  {
    id: "q2",
    prompt: "Example: Which DAX function iterates a table expression?",
    choices: [
      { id: "a", text: "SUMX", isCorrect: true },
      { id: "b", text: "SUM", isCorrect: false },
      { id: "c", text: "MAX", isCorrect: false },
      { id: "d", text: "MIN", isCorrect: false }
    ],
    explanation: "X functions iterate rows; SUMX iterates and sums an expression.",
    difficulty: "medium",
    tags: ["DAX"]
  },
  {
    id: "q3",
    prompt: "Example: Where do you configure scheduled refresh?",
    choices: [
      { id: "a", text: "Power BI Desktop", isCorrect: false },
      { id: "b", text: "Power BI Service", isCorrect: true },
      { id: "c", text: "Power Query only", isCorrect: false },
      { id: "d", text: "Local gateway UI", isCorrect: false }
    ],
    explanation: "Scheduled refresh is configured in the Service.",
    difficulty: "easy",
    tags: ["Admin"]
  }
];
