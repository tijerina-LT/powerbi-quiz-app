
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { QUESTIONS } from "./Questions";

// Wire your question bank without any JSON:
// This makes your QUESTIONS available to App without editing App.tsx.
(window as any).__QUESTIONS__ = QUESTIONS;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
